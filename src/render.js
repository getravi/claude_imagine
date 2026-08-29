// render.js — draws the world onto a 2D canvas.
//
// The look is meant to be calm and a little bioluminescent: a near-black deep,
// soft green motes of food, and creatures as glowing chevrons whose colour is
// their inherited hue. Rendering is entirely read-only — it never touches
// simulation state, so you can freeze the sim and still pan/inspect.

import { wrapDelta } from "./vec.js";
import { Camera } from "./camera.js";
import {
  predatorMark,
  predatorOutline,
  detritusTint,
  hazardTint,
  sickHalo,
  immuneRing,
  signalRing,
  SIGNAL_QUIET,
  attackFlash,
  barrierRock,
  corpseMark,
  foodMote,
  refugeRing,
  visionReach,
  selectionMark,
  biomeGlowStops,
  BIOME_GLOW_SPAN,
  lineageFill,
  nameTag,
  nameTagFont,
} from "./palette.js";
import { hazardSources } from "./contagion.js";
import { refugeRadius, inRefuge } from "./refuge.js";
import { creatureReaches } from "./reach.js";
import { tagText, tagAt, TAG_TOUCH_PAD } from "./nametag.js";

/**
 * Directions sampled when drawing what opaque rock leaves visible. This is a
 * *drawing* resolution and nothing else — the rule itself (`barriers.occluded`)
 * is exact and asks no rays at all — so it trades a shadow edge that can be a
 * couple of pixels off for a polygon the frame budget does not notice.
 */
const VISION_RAYS = 128;

/**
 * The dash of a reach that depends on the other body (v1.90), in screen pixels.
 *
 * Borrowed meaning rather than borrowed geometry: the vision overlay one method
 * down already says *asked for* with a dash and *actually searched* with a
 * solid line, so a dashed circle here reads "only against the largest thing
 * this rule admits" and a solid one "whatever it meets". A dash is the channel
 * v1.34 spends when a distinction has nowhere to live in colour, and this one
 * cannot live in colour: both rings are the selection mark, whose two tones are
 * the only pair in this project measured against the vision overlay's own
 * backgrounds (v1.84, worst case ΔE 48.9).
 */
const REACH_DASH = [3, 3];

/**
 * The most a name tag may be enlarged to survive a canvas the page is showing
 * smaller than it is (v1.126).
 *
 * 3 is the scale at a 390 px phone with a little room to spare: the pond is
 * shown at 346 there, which is 2.6×. Past that the plate would start to be
 * furniture rather than a label — at 5× a two-word name is a third of the width
 * of the water — and a name too big to sit over its animal has stopped being
 * about the animal.
 */
const MAX_TAG_SCALE = 3;

/** Start a closed circular path. Kept as a function so it can be a clip *and* a stroke. */
function circlePath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/**
 * Start a closed path through one point per direction, at the distances
 * `BarrierField.visibleRadii` measured — the disc with the walls' shadows cut
 * out of it.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y centre, in the camera's coordinates
 * @param {ArrayLike<number>} radii visible distance per direction, from angle 0
 */
function visibilityPath(ctx, x, y, radii) {
  const n = radii.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * radii[i];
    const py = y + Math.sin(a) * radii[i];
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} config
   */
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    // The lens. At zoom 1 it is the identity, so the default view is exactly
    // the one every earlier version drew.
    this.camera = new Camera(config);
    this.showVision = false;
    // The refuge line (v1.69): a circle at the size nothing this world can grow
    // is able to eat, drawn around everyone still under it. Off by default —
    // it is an instrument, and the default view is the one every screenshot in
    // this project was taken of.
    this.showRefuge = false;
    // The trail (v1.84): the selected creature's recent positions, drawn as one
    // line. Off by default like every other overlay — the default view is the
    // one every screenshot in this project was taken of — and it draws nothing
    // unless `trail` has been handed a `Trail` recording the same creature.
    this.showTrail = false;
    /** @type {import('./trail.js').Trail|null} */
    this.trail = null;
    // The reach rings (v1.90): the distances the selected creature's own
    // contact rules fire at, derived from the audit in `reach.js` rather than
    // from a second copy of `world.js`'s arithmetic. Off by default, like every
    // overlay here.
    this.showReach = false;
    this.showEnergy = true;
    // The name tags (v1.126): one plate per animal this page has a reason to
    // name, filled in by `main.js` from `src/nametag.js` before each frame. Empty
    // here rather than computed here, because *who is worth naming* is an
    // ecological question and this class paints.
    /** @type {Array<{id: number, x: number, y: number, radius: number, hue: number, mark: string, name: string, chosen: boolean}>} */
    this.nameTags = [];
    // Where each of those plates actually landed, in the canvas's own pixels,
    // recorded as it was drawn (v1.127) so that a press can find it. Written by
    // `_drawNameTags` and read by `tagAt`; nothing else may fill it, because a
    // second opinion about where a name is would be a name you cannot press.
    /** @type {Array<{id: number, x: number, y: number, w: number, h: number}>} */
    this.nameTagBoxes = [];
    /** Slack around a plate for a finger — `TAG_TOUCH_PAD`, at the drawn scale. */
    this._tagPad = TAG_TOUCH_PAD;
    /** The surface the names are drawn on — see `attachNameLayer`. */
    this._nameCanvas = null;
    this._nameCtx = null;
    this.selected = null; // a creature to highlight/inspect
    this.highlightSpeciesId = null; // when set, other species are dimmed
    // Reduced motion: when true, each frame clears fully instead of leaving a
    // translucent veil, so creatures no longer trail comet-tails behind them.
    // Purely a drawing choice — it never reads or writes simulation state, so
    // it has no bearing on determinism.
    this.reducedMotion = false;
    // Baked terrain layer: the roughness landscape is static for the life of a
    // world, so it is painted once into an offscreen canvas and blitted, rather
    // than being re-evaluated for every pixel of every frame.
    this._terrainCanvas = null;
    this._terrainFor = null; // the TerrainField the bake belongs to
    // Enriched ground, which unlike the terrain changes every tick, so it is
    // repainted each frame — one pixel per cell into a tiny offscreen canvas,
    // then upscaled, which is how a 30x21 grid becomes a smooth stain for the
    // price of a few hundred pixels. Keyed on the DetritusField it belongs to, so a
    // toggled-off field cannot leave a stale map behind: a new object cannot
    // find an old one's canvas.
    this._soilCanvas = null;
    this._soilImage = null;
    this._soilFor = null;
    this._resize();
  }

  /**
   * Hand the renderer a second canvas to write the names on, laid over the pond.
   *
   * **This is a fix the screenshot found and the tests could not.** The tags
   * were drawn onto the pond itself for exactly one browser run, and every one
   * of them left a legible ghost of itself behind: this scene clears with a
   * translucent veil rather than a hard clear, on purpose, so that motion leaves
   * comet trails — and a comet trail made of *letters* is four stacked copies of
   * a word. Every other mark here is a small glowing shape the veil flatters. A
   * word is the one thing on this canvas that must not smear.
   *
   * So the names get a layer of their own, cleared outright on every frame. It
   * also makes the release's other claim structural rather than careful: this
   * surface never has the camera applied to it, so a name cannot scale with the
   * zoom even by accident.
   *
   * Optional. With no layer attached — the landing page's hero, and every test
   * that does not ask for one — nothing is named and the pond is drawn exactly
   * as it was before this release.
   *
   * @param {HTMLCanvasElement|null} canvas
   */
  attachNameLayer(canvas) {
    this._nameCanvas = canvas || null;
    this._nameCtx = canvas ? canvas.getContext("2d") : null;
    if (canvas) this._resizeNameLayer();
  }

  /** Match the name layer to the pond's backing store and device pixel ratio. */
  _resizeNameLayer() {
    const canvas = this._nameCanvas;
    if (!canvas) return;
    canvas.width = this.config.width * this.dpr;
    canvas.height = this.config.height * this.dpr;
    canvas.style.width = this.config.width + "px";
    canvas.style.height = "auto";
    this._nameCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Point the renderer and its lens at a new config (after a reset or scenario). */
  setConfig(config) {
    this.config = config;
    this.camera.config = config;
    this.camera.reset();
    // A new config may be a new world size or a new seed, either of which makes
    // the baked landscape wrong. Dropping it forces a rebake on the next frame
    // that actually needs one.
    this._terrainCanvas = null;
    this._terrainFor = null;
    this._soilCanvas = null;
    this._soilImage = null;
    this._soilFor = null;
    // A new config can be a new world size, which the layer over it has to be.
    this._resizeNameLayer();
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.config.width * dpr;
    this.canvas.height = this.config.height * dpr;
    // A *preferred* size, not a fixed one. Pinning both axes here overrode the
    // stylesheet's responsive rule — inline styles win — so on any viewport
    // narrower than the world the pond was simply clipped by the stage's
    // `overflow: hidden`, and a phone saw its top-left third. `height: auto`
    // hands the aspect ratio back to the intrinsic size of the backing store,
    // and `max-width: 100%` (in the stylesheet) lets it shrink. Where there is
    // room for the full width nothing moves by a pixel.
    this.canvas.style.width = this.config.width + "px";
    this.canvas.style.height = "auto";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
  }

  /** @param {import('./world.js').World} world */
  draw(world) {
    const ctx = this.ctx;
    const cfg = this.config;
    const cam = this.camera;

    // Trail effect: instead of a hard clear, paint a translucent dark veil so
    // moving creatures leave a faint comet tail. Cheap, and it makes motion
    // legible at a glance. The veil is tinted by the season — cold blue in
    // winter, warmer in summer — so time of year reads at a glance. It covers
    // the viewport, so it is painted in screen space, before the lens.
    const phase = world.seasonPhase ?? 0.5;
    const vr = Math.round(6 + 4 * phase);
    const vg = Math.round(10 + 4 * phase);
    const vb = Math.round(20 - 8 * phase);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = this.reducedMotion ? `rgb(${vr}, ${vg}, ${vb})` : `rgba(${vr}, ${vg}, ${vb}, 0.28)`;
    ctx.fillRect(0, 0, cfg.width, cfg.height);

    // Everything below is drawn in world coordinates through the camera. Each
    // thing is placed at whichever wrapped image of itself is nearest the
    // camera, so the torus seam stays invisible however far the view roams.
    cam.applyTo(ctx, this.dpr);

    // Terrain: the ground, when this world has any. Drawn first, under
    // everything, because it is the one thing here that isn't *in* the pond —
    // it is the pond. Nothing is drawn at all when terrain is off, so the
    // default view is the one every earlier version produced.
    if (world.terrain) this._drawTerrain(ctx, world.terrain, cam);

    // Biomes: faint fertile glows so you can see where food concentrates. The
    // ramp is the rule — `biomeGlowStops()` samples the same Gaussian
    // `FertilityField.at()` puts the fertility on, out to the radius where the
    // glow falls under what an eye can see (v1.93, `palette.js` has the
    // measurement). Until then it was two straight segments over 1.8σ, and the
    // visible part of it stopped at 0.99σ.
    if (cfg.foodPatches && world.environment) {
      ctx.globalCompositeOperation = "lighter";
      const stops = biomeGlowStops();
      for (const c of world.environment.centres) {
        const p = cam.nearest(c.x, c.y);
        const rad = cfg.patchRadius * BIOME_GLOW_SPAN;
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        for (const s of stops) grd.addColorStop(s.offset, s.css);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Enriched ground: where this pond's dead went. Drawn over the two static
    // maps and under everything alive, because it is the one backdrop that is a
    // record of events rather than a property of the place. Nothing at all in a
    // world without detritus.
    if (world.detritus) this._drawDetritus(ctx, world.detritus, cam);

    // The contagious zone: one disc of `infectionRadius` per sick creature, so
    // the reach of the pathogen is drawn rather than implied. Where discs
    // overlap the layers compound, and they compound at exactly the rate the
    // risk does (see contagion.js), so the brightest water is the water it is
    // most dangerous to stand in. Drawn over the ground and under everything
    // alive, because it is a property of the water rather than of anything in
    // it. The source list is empty whenever nothing is sick — which is every
    // world with contagion off — so a healthy pond draws what it always did.
    const sources = hazardSources(world.creatures);
    if (sources.length) {
      const t = hazardTint();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(${t.r}, ${t.g}, ${t.b}, ${t.a})`;
      for (const s of sources) {
        const p = cam.nearest(s.x, s.y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, cfg.infectionRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Rock: drawn over every field and under everything alive. It goes last of
    // the backdrops because it is the only one that is not water — the
    // roughness, the fertility, the nutrient and the hazard all describe ground
    // a creature could be standing on, and a wall is ground nothing can be
    // standing on, so it covers them rather than tinting them. Nothing at all in
    // a world without barriers.
    if (world.barriers) this._drawBarriers(ctx, world.barriers, cam);

    // Corpses: remains, drawn under the food and creatures. A pale bone ring
    // around a near-black core — two opaque tones rather than the one
    // translucent maroon this was until v1.55, which was the same colour as the
    // enriched ground it lies on for every dichromat and nearly so for
    // everyone. What is left of the meat moves the mark's *size*; see
    // `corpseMark`. Nothing to draw when scavenging is off (the list is empty).
    if (world.corpses.length) {
      ctx.globalCompositeOperation = "source-over";
      for (const k of world.corpses) {
        const p = cam.nearest(k.x, k.y);
        const m = corpseMark(k.energy);
        const r = cfg.foodRadius * m.radius;
        // Two filled discs, not a fill and a stroke: a stroke straddles the
        // path, so half its width would be an antialiased blend of the two
        // tones and neither would be the colour the audit measured.
        ctx.beginPath();
        ctx.fillStyle = m.ring;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = m.core;
        ctx.arc(p.x, p.y, r * (1 - m.ringWidth), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Food: additive green motes so dense patches glow.
    ctx.globalCompositeOperation = "lighter";
    const mote = foodMote();
    const moteFill = `rgba(${mote.r}, ${mote.g}, ${mote.b}, ${mote.a})`;
    for (const f of world.food.items) {
      const p = cam.nearest(f.x, f.y);
      ctx.beginPath();
      ctx.fillStyle = moteFill;
      ctx.arc(p.x, p.y, cfg.foodRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Creatures.
    for (const c of world.creatures) {
      this._drawCreature(ctx, c);
    }
    ctx.globalCompositeOperation = "source-over";

    this._drawRefuge(ctx, world);

    if (this.selected && !this.selected.dead) {
      this._drawSelection(ctx, this.selected, world);
    }

    // Leave the context in screen space for whoever draws next.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // The names, last of all and on a layer of their own — see `_drawNameTags`.
    this._drawNameTags();
  }

  /**
   * The name tags (v1.126): a plate over each animal this page has a reason to
   * name, carrying its given name and the mark of what makes it worth watching.
   *
   * `main.js` fills `this.nameTags` from `src/nametag.js` before each frame, the
   * way it hands over the trail and the selection — this class paints, and who
   * is worth naming is an ecological question that has one home already.
   *
   * **Drawn in screen space, on purpose.** Everything else in this scene is laid
   * down through the camera and therefore grows with the zoom. Letters must not:
   * a name that doubles when you lean in is a mark about the lens rather than
   * about the animal, and at 8× it would be a word the width of the pond. The
   * name layer never has the camera applied to it at all, the tag's own geometry
   * is in screen pixels, and only the *anchor* comes through the lens.
   */
  _drawNameTags() {
    const ctx = this._nameCtx;
    // Emptied before anything else, and before the early returns: a stale box is
    // a name you can press over water where no name is drawn, which is worse
    // than a name you cannot press at all.
    this.nameTagBoxes = [];
    if (!ctx) return;
    const cfg = this.config;
    // Cleared before the early return, not after it: a layer that keeps its
    // last frame when the list empties is a name over an animal that has died.
    ctx.clearRect(0, 0, cfg.width, cfg.height);
    const tags = this.nameTags;
    if (!tags || !tags.length) return;
    const t = nameTag();
    // A name is a mark on the *page* drawn on a canvas measured in *world*
    // pixels, and on a narrow window those are not the same unit: the pond is
    // 900 canvas pixels wide and the stylesheet shows it at whatever the column
    // allows — 346 on a 390 px phone, where an 11 px name would land at 4.2 and
    // be unreadable. So the tag's whole geometry is divided by the scale the
    // page is displaying the canvas at, which is `scalebar.js`'s trick (v1.82)
    // applied to type instead of to a ruler. Capped, because a canvas displayed
    // at a fifth of its size would otherwise get a plate a third of the pond
    // wide, and unscaled wherever the display width cannot be read — every test
    // in this suite, and any embedding with no layout.
    const shown = Math.round(this.canvas.clientWidth) || cfg.width;
    const k = Math.min(MAX_TAG_SCALE, cfg.width / shown);
    const font = nameTagFont(t.fontPx * k);
    // The finger's slack rides the same scale as the plate, for the same reason:
    // four canvas pixels on a phone is one and a half pixels of glass.
    this._tagPad = TAG_TOUCH_PAD * k;
    const padX = t.padX * k;
    const barW = t.barW * k;
    const height = t.height * k;
    ctx.save();
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const tag of tags) {
      const p = this.camera.worldToScreen(tag.x, tag.y);
      // The animal is off the edge of the view: no plate. A tag whose anchor is
      // not on screen would be a name floating over somebody else's water,
      // which is the one thing a label may never do.
      if (p.x < 0 || p.x > cfg.width || p.y < 0 || p.y > cfg.height) continue;
      // The body's glow reaches three radii (`_drawCreature`), and the plate
      // clears it: a label sitting inside the halo reads as part of the animal
      // rather than as a thing said about it.
      const lift = tag.radius * 3 * this.camera.zoom + t.lift * k;
      const text = tagText(tag);
      const w = ctx.measureText(text).width + padX * 2 + barW;
      // Held inside the view, once the anchor is known to be in it. The first
      // browser run of this feature drew half a name off each edge of the
      // canvas, because an animal at the edge of the water is an ordinary thing
      // and a plate is thirty pixels wider than the body it belongs to. Nudging
      // it costs at most half a plate of offset and keeps the name beside its
      // animal; letting the edge cut it costs the word.
      const x = Math.max(0, Math.min(cfg.width - w, p.x - w / 2));
      const y = Math.max(0, p.y - lift - height);
      ctx.fillStyle = t.plate;
      ctx.fillRect(x, y, w, height);
      // The family stripe: the animal's own lineage colour down the leading
      // edge, so a plate is tied to a body by the channel this pond has used
      // for family since v1.2. It is also the only part of a tag that differs
      // between two animals wearing the same mark.
      ctx.fillStyle = lineageFill(tag.hue, "dot");
      ctx.fillRect(x, y, barW, height);
      ctx.fillStyle = t.ink;
      ctx.fillText(text, x + barW + padX, y + height / 2);
      // The plate as it was actually laid down — after the lift, after the
      // nudge away from the edge — so that pressing the word presses this
      // animal. Recorded here rather than computed anywhere else: the layout
      // has four terms and every one of them is a chance for a hit test to
      // disagree with the picture.
      this.nameTagBoxes.push({ id: tag.id, x, y, w, h: height });
    }
    ctx.restore();
  }

  /**
   * Which name plate a press at (x, y) landed on, or `null` (v1.127).
   *
   * `x` and `y` are in the canvas's own pixels — what `main.js#toCanvas` hands
   * back — because that is the space the plates are drawn in. The camera does
   * not enter into it: the name layer never has the lens applied to it, which
   * is why a name is the same size at every zoom and why this needs no
   * projection to undo.
   *
   * @param {number} x
   * @param {number} y
   * @returns {{id: number, x: number, y: number, w: number, h: number}|null}
   */
  tagAt(x, y) {
    return tagAt(this.nameTagBoxes, x, y, this._tagPad);
  }

  /**
   * Paint the roughness landscape into an offscreen canvas: a cool basin colour
   * on the flats warming to a pale slate on the ridges, with contour lines at
   * fixed roughness intervals. The contours are what make it read as *terrain*
   * rather than as an unexplained stain — a smooth gradient alone is easy to
   * mistake for another one of the glows this scene is already full of.
   * @param {import('./terrain.js').TerrainField} terrain
   */
  _bakeTerrain(terrain) {
    const cfg = this.config;
    // Half resolution: the field is smooth, and this keeps contours crisp after
    // the 2x upscale while costing a fraction of the samples.
    const w = Math.max(1, Math.round(cfg.width / 2));
    const h = Math.max(1, Math.round(cfg.height / 2));
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const octx = off.getContext("2d");
    const img = octx.createImageData(w, h);
    const px = img.data;
    const BANDS = 8; // contour every 1/8th of the roughness range
    for (let j = 0; j < h; j++) {
      const wy = (j / h) * cfg.height;
      for (let i = 0; i < w; i++) {
        const wx = (i / w) * cfg.width;
        const r = terrain.at(wx, wy);
        // Basin (24,42,54) → ridge (108,118,138). Deliberately quiet: this is a
        // backdrop, and the scene's whole look is a near-black deep with a few
        // bioluminescent things in it. Terrain that competes with the creatures
        // for attention would be worse than terrain you have to look for.
        let cr = 24 + 84 * r;
        let cg = 42 + 76 * r;
        let cb = 54 + 84 * r;
        let a = 0.03 + 0.13 * r;
        // A contour wherever this sample sits in a different band from the one
        // to its left or above it. Comparing bands rather than testing distance
        // to a level keeps the lines one sample wide however steep the slope.
        const band = Math.floor(r * BANDS);
        const left = terrain.at(wx - cfg.width / w, wy);
        const up = terrain.at(wx, wy - cfg.height / h);
        if (band !== Math.floor(left * BANDS) || band !== Math.floor(up * BANDS)) {
          cr += 26;
          cg += 34;
          cb += 40;
          a = Math.min(0.34, a + 0.10);
        }
        const k = (j * w + i) * 4;
        px[k] = cr;
        px[k + 1] = cg;
        px[k + 2] = cb;
        px[k + 3] = Math.round(a * 255);
      }
    }
    octx.putImageData(img, 0, 0);
    this._terrainCanvas = off;
    this._terrainFor = terrain;
  }

  /**
   * Blit the baked landscape under the world, tiled across the seam. The tiles
   * come from the camera (`worldTiles`), which is the one piece of this geometry
   * the test suite can reach.
   */
  _drawTerrain(ctx, terrain, cam) {
    if (this._terrainFor !== terrain) this._bakeTerrain(terrain);
    const cfg = this.config;
    ctx.globalCompositeOperation = "source-over";
    for (const t of cam.worldTiles()) {
      ctx.drawImage(this._terrainCanvas, t.x, t.y, cfg.width, cfg.height);
    }
  }

  /**
   * Paint the rock: one filled rectangle per solid run of each wall, tiled
   * across the seam by the camera the same way the terrain is.
   *
   * The geometry comes from `BarrierField.rects()` rather than being rebuilt
   * here, so the picture and the rule cannot drift apart — `test/barriers.test.js`
   * walks a grid and asserts that a point is inside one of these rectangles
   * exactly when `blocked()` says so, which is the v1.24 lesson (an aggregate is
   * not a test of a tiling) applied before anybody has had a chance to need it.
   *
   * @param {import('./barriers.js').BarrierField} barriers
   */
  _drawBarriers(ctx, barriers, cam) {
    const rock = barrierRock();
    const rects = barriers.rects();
    ctx.globalCompositeOperation = "source-over";
    for (const t of cam.worldTiles()) {
      for (const r of rects) {
        ctx.fillStyle = rock.fill;
        ctx.fillRect(t.x + r.x, t.y + r.y, r.w, r.h);
        // A darker rim, so a slab reads as a solid object with a top and a side
        // rather than as one more translucent stain over the water. It is
        // furniture, not a distinction: it carries no meaning the fill does not.
        ctx.strokeStyle = rock.edge;
        ctx.lineWidth = 1;
        ctx.strokeRect(t.x + r.x + 0.5, t.y + r.y + 0.5, r.w - 1, r.h - 1);
      }
    }
  }

  /**
   * Paint the nutrient field: one pixel per cell into a tiny offscreen canvas,
   * blitted up to world size and left to the canvas's own bilinear filtering.
   * Under a thousand pixels a frame buys a stain that reads as ground rather
   * than as a mosaic, which is what a per-cell `fillRect` would give at thirty
   * pixels a side.
   *
   * The offscreen image carries a one-cell border copied from the *opposite*
   * edge of the field, and each tile is clipped to the world it belongs to. That
   * is the whole seam story: without the border the filtering would fade every
   * tile's edge toward nothing, drawing a bright cross through a world that has
   * no edges; without the clip the borders would double up where tiles meet.
   */
  _drawDetritus(ctx, field, cam) {
    const cfg = this.config;
    const cols = field.cols;
    const rows = field.rows;
    if (this._soilFor !== field) {
      const off = document.createElement("canvas");
      off.width = cols + 2;
      off.height = rows + 2;
      this._soilCanvas = off;
      this._soilImage = off.getContext("2d").createImageData(cols + 2, rows + 2);
      this._soilFor = field;
    }
    const img = this._soilImage;
    const px = img.data;
    for (let j = -1; j <= rows; j++) {
      // The border rows and columns wrap, so the filter sees the field's real
      // neighbourhood at the seam.
      const sj = (j + rows) % rows;
      for (let i = -1; i <= cols; i++) {
        const si = (i + cols) % cols;
        const tint = detritusTint(field.richness(si, sj));
        const k = ((j + 1) * (cols + 2) + (i + 1)) * 4;
        px[k] = tint.r;
        px[k + 1] = tint.g;
        px[k + 2] = tint.b;
        px[k + 3] = Math.round(tint.a * 255);
      }
    }
    const octx = this._soilCanvas.getContext("2d");
    octx.putImageData(img, 0, 0);

    ctx.globalCompositeOperation = "source-over";
    for (const t of cam.worldTiles()) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(t.x, t.y, cfg.width, cfg.height);
      ctx.clip();
      // The image covers the world plus one cell of border on every side, so it
      // is drawn one cell out and two cells wider.
      ctx.drawImage(
        this._soilCanvas,
        t.x - field.cellW,
        t.y - field.cellH,
        cfg.width + 2 * field.cellW,
        cfg.height + 2 * field.cellH
      );
      ctx.restore();
    }
  }

  _drawCreature(ctx, c) {
    const cfg = this.config;
    const energyFrac = Math.max(0, Math.min(1, c.energy / cfg.energyMax));
    // Lightness rises with energy so starving creatures visibly dim.
    const light = 30 + energyFrac * 45;
    // The brain's "signal" output shifts saturation, letting creatures evolve
    // to flash — a channel selection can co-opt for signalling if it ever pays.
    const sat = 60 + c.signal * 25;

    ctx.save();
    // Lineage highlighting: fade creatures that aren't in the highlighted
    // species, so one lineage stands out against the rest of the pond.
    if (this.highlightSpeciesId != null && c.speciesId !== this.highlightSpeciesId) {
      ctx.globalAlpha = 0.12;
    }
    const p = this.camera.nearest(c.x, c.y);
    ctx.translate(p.x, p.y);
    ctx.rotate(c.heading);

    // Glow.
    ctx.globalCompositeOperation = "lighter";
    const r = c.radius;
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
    grd.addColorStop(0, `hsla(${c.hue}, ${sat}%, ${light}%, 0.5)`);
    grd.addColorStop(1, `hsla(${c.hue}, ${sat}%, ${light}%, 0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
    ctx.fill();

    // Is this a predator? Carnivores get a sharper, more elongated body and a
    // warm predatory outline, while keeping their inherited hue so lineage is
    // still readable.
    const isPredator = c.carnivory >= cfg.carnivoreThreshold;
    const nose = isPredator ? 2.1 : 1.4; // carnivores are daggers, not chevrons

    // Body: a chevron pointing along the heading.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `hsl(${c.hue}, ${sat}%, ${light + 15}%)`;
    ctx.beginPath();
    ctx.moveTo(r * nose, 0);
    ctx.lineTo(-r, r * 0.85);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r, -r * 0.85);
    ctx.closePath();
    ctx.fill();

    if (isPredator) {
      // The silhouette: a warm line around the chevron, opaque and two-toned
      // since v1.66. It used to be one translucent warm tone whose opacity rose
      // with the diet gene — the failure v1.25 fixed in the core seven lines
      // down and left here, so 53.5% of the backgrounds a hunter can be drawn
      // on scored under the bar and 3.9% of them under the just-noticeable
      // difference. The degree it was spending that contrast on was not there
      // either: 94% of predator-frames sit inside an opacity span worth ΔE 1.7.
      // Carnivory is the mark's radius and nothing else now. palette.js has the
      // numbers and the two constraints that pin the warm tone.
      //
      // Round joins because the nose is a sharp vertex and a mitre on it draws
      // a spike longer than the creature.
      const outline = predatorOutline();
      ctx.lineJoin = "round";
      ctx.strokeStyle = outline.rim;
      ctx.lineWidth = outline.width + 1.1;
      ctx.stroke();
      ctx.strokeStyle = outline.edge;
      ctx.lineWidth = outline.width;
      ctx.stroke();
      // Then the mark that carries "this one hunts" outright: an opaque warm
      // disc with a dark rim. Both tones are opaque and neither is additive,
      // because the bright core this replaced was drawn with `lighter` over a
      // body whose lightness rises with energy — so the best-fed predator in the
      // pond, the one most worth spotting, wore the faintest mark. palette.js
      // has the measurement and the reasoning.
      const mark = predatorMark(c.carnivory);
      ctx.fillStyle = mark.disc;
      ctx.beginPath();
      ctx.arc(0, 0, r * mark.radius, 0, Math.PI * 2);
      ctx.fill();
      // The rim is measured in screen pixels, like every other overlay line
      // here, so it never thins to nothing at 8× or swallows the disc at 1×.
      ctx.strokeStyle = mark.rim;
      ctx.lineWidth = 1 / this.camera.zoom;
      ctx.stroke();
    }

    // Contagion: a sick creature wears a sulphur halo that throbs like a fever,
    // and a survivor keeps a cool ring for the immunity it earned. Both flags
    // are permanently false unless contagion is switched on, so this costs an
    // untaken branch in every other world. The throb is motion, so it holds
    // still when reduced motion is asked for.
    //
    // Both marks used to be single translucent tones drawn additively over the
    // creature's own glow, and both were near-invisible for it (ΔE 11.0 and 0.2
    // in their worst cases — palette.js has the audit). They are opaque and
    // two-toned now, a bright ring with a dark hairline outside it, so no
    // background can swallow either. Colour cannot separate the two states from
    // each other under every vision model, so the *geometry* does: the halo is
    // continuous and the immune ring is dashed.
    ctx.globalCompositeOperation = "source-over";
    if (c.infected) {
      const throb = this.reducedMotion ? 0.5 : (Math.sin(c.age * 0.18) + 1) / 2;
      const mark = sickHalo();
      this._twoToneRing(ctx, r + 3 + throb, mark);
    } else if (c.immune) {
      const mark = immuneRing();
      ctx.setLineDash(mark.dash);
      this._twoToneRing(ctx, r + 2.4, mark);
      ctx.setLineDash([]);
    }

    // Signalling: once the channel has listeners, the third motor output stops
    // being a private saturation tweak and becomes something a watcher should be
    // able to read, so a calling creature wears rings — warm for a positive
    // call, cool for a negative one. Two creatures using opposite signs are
    // visibly saying different things. The quiet threshold keeps a silent pond
    // looking like a silent pond, and with the feature off this branch is never
    // entered at all.
    //
    // Both rings were single additive tones until v1.43, which is the failure
    // the two marks above were fixed for one release earlier and nine lines up:
    // over a body they scored ΔE 8.1, and over a body with a neighbour's glow
    // on it, 0.0. Loudness lived in the opacity, so the quietest audible call
    // paid for saying so with the contrast it needed to be seen at all. It is
    // in the geometry now — the outer ring steps outward as the call gets
    // louder, and both rings are opaque and two-toned. Two rings rather than
    // one is what tells a call from an epidemiological mark, which colour
    // cannot: palette.js has the numbers.
    if (cfg.signalling) {
      const loud = Math.abs(c.signal);
      if (loud > SIGNAL_QUIET) {
        const mark = signalRing(c.signal);
        this._twoToneRing(ctx, r + mark.inner, mark);
        this._twoToneRing(ctx, r + mark.outer, mark);
      }
    }

    // Attack flash: a brief burst at the nose right after landing a bite. Opaque
    // and two-toned since v1.43 — it was additive over the body, and a predator
    // that has just fed has the brightest body in the pond, so the mark was
    // faintest exactly when it had something to say.
    if (c.age - c.lastBiteAge < 4) {
      const flash = attackFlash();
      ctx.fillStyle = flash.disc;
      ctx.beginPath();
      ctx.arc(r * nose, 0, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = flash.rim;
      ctx.lineWidth = 1 / this.camera.zoom;
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * A ring in two tones: a dark hairline laid down slightly wider, then the
   * bright tone over it. One stroke of each, so whichever tone the background
   * happens to resemble, the other is still there — the reason both
   * epidemiological marks survive a glow of any colour. Honours whatever line
   * dash is set, which is what makes the immune ring tell itself from the halo.
   *
   * @param {{ring:string, rim:string, width:number}} mark
   */
  _twoToneRing(ctx, radius, mark) {
    ctx.strokeStyle = mark.rim;
    ctx.lineWidth = mark.width + 1.1;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = mark.ring;
    ctx.lineWidth = mark.width;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * The refuge line, drawn around everyone still inside the size rule's reach.
   *
   * Every ring is the same circle — `bodyRadiusMax / preySizeRatio`, 7.273 px
   * with the shipped constants — so what varies across the pond is how much of
   * its own ring a body fills, and a creature that has grown past the line
   * simply has no ring at all. That is the whole mark: **its absence is the
   * statement**, which is why it is drawn for the complement rather than for
   * the safe.
   *
   * Gated on `predation` for the reason `refugeShare` gives: the refuge is a
   * fact about two constants and does not move when hunting is switched off, so
   * a pond where nobody hunts has no refuge to be inside of and drawing one
   * would be plotting arithmetic rather than the world. Off by default, and
   * read-only like everything else here.
   */
  _drawRefuge(ctx, world) {
    if (!this.showRefuge || !this.config.predation) return;
    const radius = refugeRadius(this.config);
    const mark = refugeRing();
    // Screen pixels, like the selection ring and the vision cone: this is an
    // overlay measured in the viewer's units, laid over a circle measured in
    // the world's.
    const hair = 1 / this.camera.zoom;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (const c of world.creatures) {
      if (c.dead || inRefuge(c.radius, this.config)) continue;
      const p = this.camera.nearest(c.x, c.y);
      ctx.strokeStyle = mark.rim;
      ctx.lineWidth = (mark.width + 1.1) * hair;
      circlePath(ctx, p.x, p.y, radius);
      ctx.stroke();
      ctx.strokeStyle = mark.ring;
      ctx.lineWidth = mark.width * hair;
      circlePath(ctx, p.x, p.y, radius);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The path the selected creature took, as one line ending under its body
   * (v1.84).
   *
   * Two decisions live here and both are the pond canvas's existing
   * conventions rather than new ones.
   *
   * The **geometry** comes from `Trail.offsets()`, which accumulates each
   * tick's shortest toroidal step backwards from the newest point. Added to
   * wherever the head is being drawn, that is a continuous line that runs off
   * the edge of the canvas rather than snapping across it — the same choice
   * every other mark in this view makes (draw at the nearest wrapped image,
   * hide the seam) and the opposite of the minimap's, which has four real edges
   * and splits what straddles them.
   *
   * The **fade** is a taper in width, not a ramp in opacity. A translucent mark
   * is legible or not depending on what it happens to be over, which is the
   * finding this release is built on (see `selectionMark`); a thin one is quiet
   * everywhere. So both tones stay opaque along the whole path and the measured
   * contrast holds at the tail as well as at the head. Drawn in bands rather
   * than per segment because a stroke has one width: eight rim passes and eight
   * line passes, instead of six hundred strokes for one creature.
   */
  _drawTrail(ctx, c, p) {
    const trail = this.trail;
    if (!this.showTrail || !trail || trail.id !== c.id || trail.length < 2) return;
    const offs = trail.offsets(this.config);
    const mark = selectionMark();
    const hair = 1 / this.camera.zoom;
    const BANDS = 8;
    const n = offs.length;

    // Band `b` covers offs[from..to], sharing its newest point with the next
    // band so the line has no gaps. Widths run from the taper at the old end to
    // the full trail width at the head.
    const band = (b) => {
      const from = Math.floor((b * (n - 1)) / BANDS);
      const to = Math.floor(((b + 1) * (n - 1)) / BANDS);
      if (to <= from) return null;
      const t = (b + 1) / BANDS;
      return { from, to, width: mark.trailWidth * (mark.trailTaper + (1 - mark.trailTaper) * t) };
    };
    const path = (b) => {
      ctx.beginPath();
      for (let i = b.from; i <= b.to; i++) {
        const x = p.x + offs[i].dx;
        const y = p.y + offs[i].dy;
        if (i === b.from) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Every rim first, then every line: casing each band as it goes would let a
    // later band's rim lie over an earlier band's line at the joint.
    for (const pass of ["rim", "ring"]) {
      ctx.strokeStyle = mark[pass];
      for (let b = 0; b < BANDS; b++) {
        const seg = band(b);
        if (!seg) continue;
        ctx.lineWidth = (pass === "rim" ? seg.width + 1.1 : seg.width) * hair;
        path(seg);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * How close something has to be before this creature's rules fire (v1.90).
   *
   * Everything else this overlay family draws is a *sense* — how far a creature
   * can see, where it has been, which side of a size rule it is on. This is the
   * other half: eating, biting, scavenging and infecting all happen at a
   * distance, those distances are a handful of pixels rather than the 168 sight
   * asks for, and until now nothing on the page said so. Two rings tell the
   * same story the audit tells in numbers — a bite reaching further than the
   * body that owns it, inside a sense reaching ten times further than either.
   *
   * A rule that reads two bodies gets two circles, because its reach is not a
   * number: the solid one is what it reaches against the smallest body this
   * world grows, the dashed one what it reaches against the largest body it
   * admits, and the answer between them depends on what it meets. A rule that
   * admits nobody — a creature under `bodyRadiusMin * preySizeRatio` cannot
   * bite anything at all — draws no ring, the way the refuge line draws none
   * around a body that outgrew it.
   *
   * Read-only and geometry-only: `creatureReaches` is arithmetic over the
   * config and this animal's radius, so the overlay cannot disagree with the
   * rule it plots without `test/reach.test.js` failing first.
   */
  _drawReach(ctx, c, p) {
    if (!this.showReach) return;
    const mark = selectionMark();
    // Screen pixels, like every other overlay here: a hairline stays a hairline
    // at 8×, and the *radii* stay world measurements, which is the point — this
    // is a drawing of a distance in the pond.
    const hair = 1 / this.camera.zoom;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    const ring = (radius, dashed) => {
      ctx.setLineDash(dashed ? REACH_DASH.map((d) => d * hair) : []);
      ctx.strokeStyle = mark.rim;
      ctx.lineWidth = (mark.width + 1.1) * hair;
      circlePath(ctx, p.x, p.y, radius);
      ctx.stroke();
      ctx.strokeStyle = mark.ring;
      ctx.lineWidth = mark.width * hair;
      circlePath(ctx, p.x, p.y, radius);
      ctx.stroke();
    };
    for (const reach of creatureReaches(c.radius, this.config)) {
      if (reach.empty) continue;
      ring(reach.inner, false);
      // A band whose two edges coincide is one distance, and drawing a dashed
      // circle over a solid one at the same radius would say otherwise.
      if (reach.outer > reach.inner) ring(reach.outer, true);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawSelection(ctx, c, world) {
    const cfg = this.config;
    const p = this.camera.nearest(c.x, c.y);
    this._drawTrail(ctx, c, p);
    this._drawReach(ctx, c, p);
    ctx.save();
    // Ring around the selected creature. Overlay lines are measured in screen
    // pixels, so their width is divided back out of the zoom — a hairline stays
    // a hairline at 8×.
    const hair = 1 / this.camera.zoom;
    // Two tones since v1.84: the white this was drawn in for eighty-four
    // releases is ΔE 0.00 from a well-fed body under its own glow, and the pond
    // is full of them. The rim goes down first at `width + 1.1`, the way every
    // cased stroke here does.
    const sel = selectionMark();
    const ring = c.radius + 6 * hair;
    ctx.strokeStyle = sel.rim;
    ctx.lineWidth = (sel.width + 1.1) * hair;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ring, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = sel.ring;
    ctx.lineWidth = sel.width * hair;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ring, 0, Math.PI * 2);
    ctx.stroke();

    if (this.showVision) {
      // Shrinks with the day/night cycle (visionFactor is a constant 1 when
      // that's off), so the overlay always matches what the world actually lets
      // creatures sense.
      const r = cfg.visionRadius * (world.visionFactor ?? 1);
      ctx.lineWidth = hair;

      // What actually bounds a sense, as a list of closed shapes to intersect.
      // The disc is always in it. The 3x3 block joins it when the index is the
      // inexact one (`exactVision` off), because then the search is the block
      // and the disc is only an aspiration. Opaque rock (v1.50) joins it as the
      // visible polygon, which is `barriers.firstHit` plotted rather than a
      // drawing *about* the rule.
      const parts = [() => circlePath(ctx, p.x, p.y, r)];
      const inexact = !cfg.exactVision && world.creatureGrid;
      if (inexact) {
        const b = world.creatureGrid.nearBounds(c.x, c.y);
        parts.push(() => {
          ctx.beginPath();
          ctx.rect(p.x + b.left, p.y + b.top, b.right - b.left, b.bottom - b.top);
        });
      }
      if (cfg.barrierOcclusion && world.barriers) {
        const radii = world.barriers.visibleRadii(c.x, c.y, r, VISION_RAYS);
        parts.push(() => visibilityPath(ctx, p.x, p.y, radii));
      }

      // Both lines are the same two opaque tones (palette.js has the audit:
      // three translucent strengths of one blue, the faintest of them under the
      // just-noticeable difference on a quarter of the pond, and the pair of
      // them ΔE 0.00 apart at worst). What separates a radius that was merely
      // asked for from the region actually searched is the *dash*, not the
      // alpha — the geometry v1.34 spends when colour has nowhere to live.
      const mark = visionReach();
      const stroke = (path, dashed) => {
        ctx.setLineDash(dashed ? mark.dash.map((d) => d * hair) : []);
        ctx.strokeStyle = mark.rim;
        ctx.lineWidth = (mark.width + 1.1) * hair;
        path();
        ctx.stroke();
        ctx.strokeStyle = mark.ring;
        ctx.lineWidth = mark.width * hair;
        path();
        ctx.stroke();
      };

      if (parts.length === 1) {
        // Nothing is bounding the search but the radius, so the radius *is* the
        // region searched: one solid line, and no second one to tell it from.
        stroke(parts[0], false);
      } else {
        // Drawing the disc alone here would be the thirty-one versions of quiet
        // fiction this overlay told before v1.32, so draw both: the intended
        // radius dashed, and the region actually searched solid. That region is
        // the intersection of every part, and its boundary is each part's own
        // outline clipped by all the others — clips compose, because
        // `ctx.clip()` intersects with whatever is already clipped.
        stroke(() => circlePath(ctx, p.x, p.y, r), true);

        for (let i = 0; i < parts.length; i++) {
          ctx.save();
          for (let j = 0; j < parts.length; j++) {
            if (j === i) continue;
            parts[j]();
            ctx.clip();
          }
          stroke(parts[i], false);
          ctx.restore();
        }
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /**
   * Find the creature nearest a *world* point, within a pixel radius. The
   * radius is a screen measurement — at 8× a click lands within an eighth of
   * the world distance it would at 1×, which is what "click the thing under the
   * cursor" means when the thing is eight times bigger.
   */
  pick(world, px, py, radius = 14) {
    radius /= this.camera.zoom;
    let best = null;
    let bestD2 = radius * radius;
    const cfg = this.config;
    for (const c of world.creatures) {
      const dx = wrapDelta(c.x, px, cfg.width);
      const dy = wrapDelta(c.y, py, cfg.height);
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = c;
      }
    }
    return best;
  }
}
