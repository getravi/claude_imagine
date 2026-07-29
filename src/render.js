// render.js — draws the world onto a 2D canvas.
//
// The look is meant to be calm and a little bioluminescent: a near-black deep,
// soft green motes of food, and creatures as glowing chevrons whose colour is
// their inherited hue. Rendering is entirely read-only — it never touches
// simulation state, so you can freeze the sim and still pan/inspect.

import { wrapDelta } from "./vec.js";
import { Camera } from "./camera.js";
import { predatorMark, detritusTint } from "./palette.js";

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
    this.showEnergy = true;
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

    // Biomes: faint fertile glows so you can see where food concentrates.
    if (cfg.foodPatches && world.environment) {
      ctx.globalCompositeOperation = "lighter";
      for (const c of world.environment.centres) {
        const p = cam.nearest(c.x, c.y);
        const rad = cfg.patchRadius * 1.8;
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        grd.addColorStop(0, "rgba(30, 78, 66, 0.16)");
        grd.addColorStop(0.6, "rgba(30, 70, 62, 0.06)");
        grd.addColorStop(1, "rgba(30, 70, 62, 0)");
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

    // Corpses: dim maroon splotches that fade as they rot. Drawn under the food
    // and creatures. Nothing to draw when scavenging is off (the list is empty).
    if (world.corpses.length) {
      ctx.globalCompositeOperation = "source-over";
      for (const k of world.corpses) {
        const p = cam.nearest(k.x, k.y);
        const a = Math.min(0.7, 0.15 + k.energy / 60);
        ctx.beginPath();
        ctx.fillStyle = `rgba(150, 55, 48, ${a.toFixed(2)})`;
        ctx.arc(p.x, p.y, cfg.foodRadius + 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Food: additive green motes so dense patches glow.
    ctx.globalCompositeOperation = "lighter";
    for (const f of world.food.items) {
      const p = cam.nearest(f.x, f.y);
      ctx.beginPath();
      ctx.fillStyle = "rgba(90, 220, 150, 0.55)";
      ctx.arc(p.x, p.y, cfg.foodRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Creatures.
    for (const c of world.creatures) {
      this._drawCreature(ctx, c);
    }
    ctx.globalCompositeOperation = "source-over";

    if (this.selected && !this.selected.dead) {
      this._drawSelection(ctx, this.selected, world);
    }

    // Leave the context in screen space for whoever draws next.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
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
      // Warm outline whose intensity tracks how carnivorous it is...
      ctx.lineWidth = 1;
      ctx.strokeStyle = `hsla(8, 90%, 60%, ${0.35 + 0.5 * c.carnivory})`;
      ctx.stroke();
      // ...plus the mark that actually carries "this one hunts": an opaque warm
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

    // Contagion: a sick creature wears a pale sulphur halo that throbs like a
    // fever, and a survivor keeps a thin cool ring for the immunity it earned.
    // Both flags are permanently false unless contagion is switched on, so this
    // costs an untaken branch in every other world. The throb is motion, so it
    // holds still when reduced motion is asked for.
    if (c.infected) {
      const throb = this.reducedMotion ? 0.5 : (Math.sin(c.age * 0.18) + 1) / 2;
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `hsla(68, 85%, 62%, ${(0.35 + 0.45 * throb).toFixed(2)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r + 3 + throb, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    } else if (c.immune) {
      ctx.strokeStyle = "rgba(150, 205, 255, 0.32)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r + 2.4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Signalling: once the channel has listeners, the third motor output stops
    // being a private saturation tweak and becomes something a watcher should be
    // able to read, so a calling creature wears rings — warm for a positive
    // call, cool for a negative one, opacity tracking how loud it is. Two
    // creatures using opposite signs are visibly saying different things. The
    // quiet threshold keeps a silent pond looking like a silent pond, and with
    // the feature off this branch is never entered at all.
    if (cfg.signalling) {
      const loud = Math.abs(c.signal);
      if (loud > 0.2) {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `hsla(${c.signal > 0 ? 48 : 205}, 95%, 70%, ${(
          0.1 +
          0.4 * loud
        ).toFixed(2)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(0, 0, r + 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r + 6.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
    }

    // Attack flash: a brief bright burst right after landing a bite.
    if (c.age - c.lastBiteAge < 4) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255, 120, 90, 0.6)";
      ctx.beginPath();
      ctx.arc(r * nose, 0, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawSelection(ctx, c, world) {
    const cfg = this.config;
    const p = this.camera.nearest(c.x, c.y);
    ctx.save();
    // Ring around the selected creature. Overlay lines are measured in screen
    // pixels, so their width is divided back out of the zoom — a hairline stays
    // a hairline at 8×.
    const hair = 1 / this.camera.zoom;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5 * hair;
    ctx.beginPath();
    ctx.arc(p.x, p.y, c.radius + 6 * hair, 0, Math.PI * 2);
    ctx.stroke();

    if (this.showVision) {
      // Shrinks with the day/night cycle (visionFactor is a constant 1 when
      // that's off), so the overlay always matches what the world actually lets
      // creatures sense.
      const r = cfg.visionRadius * (world.visionFactor ?? 1);
      ctx.lineWidth = hair;
      if (cfg.exactVision || !world.creatureGrid) {
        ctx.strokeStyle = "rgba(120, 180, 255, 0.15)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Without exact vision this circle is an aspiration: the spatial index
        // only offers up the 3x3 block of cells around the creature, so what it
        // can find is that disc with grid-aligned bites out of it (config.js,
        // `exactVision`). Drawing the circle alone would be the thirty-one
        // versions of quiet fiction this overlay has already told, so draw both
        // — the intended radius faintly, and the region actually searched at
        // full strength.
        const b = world.creatureGrid.nearBounds(c.x, c.y);
        const bx = p.x + b.left;
        const by = p.y + b.top;
        const bw = b.right - b.left;
        const bh = b.bottom - b.top;
        ctx.strokeStyle = "rgba(120, 180, 255, 0.06)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(120, 180, 255, 0.18)";
        // The curved part of the boundary: the disc, clipped to the block.
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx, by, bw, bh);
        ctx.clip();
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // ...and the flat part: the block, clipped to the disc.
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.beginPath();
        ctx.rect(bx, by, bw, bh);
        ctx.stroke();
        ctx.restore();
      }
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
