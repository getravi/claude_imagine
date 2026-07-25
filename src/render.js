// render.js — draws the world onto a 2D canvas.
//
// The look is meant to be calm and a little bioluminescent: a near-black deep,
// soft green motes of food, and creatures as glowing chevrons whose colour is
// their inherited hue. Rendering is entirely read-only — it never touches
// simulation state, so you can freeze the sim and still pan/inspect.

import { wrapDelta } from "./vec.js";
import { Camera } from "./camera.js";

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
    this._resize();
  }

  /** Point the renderer and its lens at a new config (after a reset or scenario). */
  setConfig(config) {
    this.config = config;
    this.camera.config = config;
    this.camera.reset();
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.config.width * dpr;
    this.canvas.height = this.config.height * dpr;
    this.canvas.style.width = this.config.width + "px";
    this.canvas.style.height = this.config.height + "px";
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
      // ...plus a bright warm core, so predators read at a glance even amid the
      // bloom. This is the clearest "this one hunts" signal in the pond.
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `hsla(14, 100%, 60%, ${0.5 + 0.4 * c.carnivory})`;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
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
      ctx.strokeStyle = "rgba(120, 180, 255, 0.15)";
      ctx.lineWidth = hair;
      ctx.beginPath();
      // Shrinks with the day/night cycle (visionFactor is a constant 1 when
      // that's off), so the overlay always matches what the world actually lets
      // creatures sense.
      ctx.arc(p.x, p.y, cfg.visionRadius * (world.visionFactor ?? 1), 0, Math.PI * 2);
      ctx.stroke();
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
