// render.js — draws the world onto a 2D canvas.
//
// The look is meant to be calm and a little bioluminescent: a near-black deep,
// soft green motes of food, and creatures as glowing chevrons whose colour is
// their inherited hue. Rendering is entirely read-only — it never touches
// simulation state, so you can freeze the sim and still pan/inspect.

import { wrapDelta } from "./vec.js";

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} config
   */
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    this.showVision = false;
    this.showEnergy = true;
    this.selected = null; // a creature to highlight/inspect
    this.highlightSpeciesId = null; // when set, other species are dimmed
    this._resize();
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

    // Trail effect: instead of a hard clear, paint a translucent dark veil so
    // moving creatures leave a faint comet tail. Cheap, and it makes motion
    // legible at a glance.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(6, 10, 16, 0.28)";
    ctx.fillRect(0, 0, cfg.width, cfg.height);

    // Food: additive green motes so dense patches glow.
    ctx.globalCompositeOperation = "lighter";
    for (const f of world.food.items) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(90, 220, 150, 0.55)";
      ctx.arc(f.x, f.y, cfg.foodRadius, 0, Math.PI * 2);
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
    ctx.translate(c.x, c.y);
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
    ctx.save();
    // Ring around the selected creature.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius + 6, 0, Math.PI * 2);
    ctx.stroke();

    if (this.showVision) {
      ctx.strokeStyle = "rgba(120, 180, 255, 0.15)";
      ctx.beginPath();
      ctx.arc(c.x, c.y, cfg.visionRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Find the creature nearest a canvas point, within a pixel radius. */
  pick(world, px, py, radius = 14) {
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
