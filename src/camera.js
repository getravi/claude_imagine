// camera.js — a lens on the pond: zoom, pan, and follow-one-creature.
//
// The world is a torus, so a camera over it never hits an edge: panning past
// the right seam simply arrives at the left. Everything here is read-only with
// respect to the simulation — the camera holds three numbers (a centre and a
// zoom) and converts between world and screen coordinates. It draws no random
// numbers and touches no world state, so a `(seed, config)` pair reproduces the
// same world however the viewer happens to be looking at it.
//
// The one invariant worth protecting: **at zoom 1 the camera is the identity**.
// Sixteen versions of screenshots, permalinks and muscle memory assume the
// default view is the whole pond, unshifted, so zooming back out snaps the
// centre home rather than leaving the world nudged a few pixels sideways.

import { clamp, wrap, wrapDelta } from "./vec.js";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
// Zooming is multiplicative, so a fixed step feels the same at every scale.
export const ZOOM_STEP = 1.25;
// Turning on "follow" while looking at the whole pond would do nothing visible,
// so it leans in to a magnification where a chase actually reads.
export const FOLLOW_ZOOM = 3;

export class Camera {
  /** @param {object} config - needs `width` and `height` (the viewport is the world at zoom 1) */
  constructor(config) {
    this.config = config;
    this.zoom = MIN_ZOOM;
    this.x = config.width / 2;
    this.y = config.height / 2;
    /** A creature to keep centred, or null. Cleared when it dies. */
    this.target = null;
  }

  /** Is this the classic, whole-pond view? */
  isDefault() {
    return (
      this.zoom === MIN_ZOOM &&
      this.x === this.config.width / 2 &&
      this.y === this.config.height / 2 &&
      !this.target
    );
  }

  /** Back to the whole pond, target released. */
  reset() {
    this.zoom = MIN_ZOOM;
    this.centre();
    this.target = null;
  }

  /** Re-centre on the middle of the world without changing the zoom. */
  centre() {
    this.x = this.config.width / 2;
    this.y = this.config.height / 2;
  }

  /**
   * Set the zoom, keeping the world point under a screen anchor fixed — the
   * behaviour a mouse wheel over a map should have. Zooming all the way out
   * snaps home instead of honouring the anchor (see the note at the top).
   * @param {number} z - desired zoom, clamped to [MIN_ZOOM, MAX_ZOOM]
   * @param {number} [ax] - anchor x in screen pixels (defaults to the centre)
   * @param {number} [ay] - anchor y in screen pixels
   */
  setZoom(z, ax, ay) {
    const cfg = this.config;
    const nz = clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (nz === this.zoom) return;
    if (nz === MIN_ZOOM) {
      this.zoom = nz;
      this.centre();
      return;
    }
    if (ax === undefined) ax = cfg.width / 2;
    if (ay === undefined) ay = cfg.height / 2;
    // The world point currently under the anchor, in un-wrapped coordinates.
    const wx = this.x + (ax - cfg.width / 2) / this.zoom;
    const wy = this.y + (ay - cfg.height / 2) / this.zoom;
    this.zoom = nz;
    this.x = wrap(wx - (ax - cfg.width / 2) / nz, cfg.width);
    this.y = wrap(wy - (ay - cfg.height / 2) / nz, cfg.height);
  }

  /** Multiply the zoom by `factor` about a screen anchor. */
  zoomBy(factor, ax, ay) {
    this.setZoom(this.zoom * factor, ax, ay);
  }

  /**
   * Drag the view by a screen-pixel delta (the direction a hand moving the map
   * would take it). Ignored at zoom 1, where the whole pond is already visible
   * and sliding it would only push creatures off one edge.
   */
  panByScreen(dx, dy) {
    if (this.zoom === MIN_ZOOM) return;
    this.x = wrap(this.x - dx / this.zoom, this.config.width);
    this.y = wrap(this.y - dy / this.zoom, this.config.height);
  }

  /**
   * Put the centre of the view on a world point — what a click on the minimap
   * means. Ignored at zoom 1 for the same reason panning is: the whole pond is
   * already on screen, and sliding it would only break the identity view.
   */
  moveTo(wx, wy) {
    if (this.zoom === MIN_ZOOM) return;
    this.x = wrap(wx, this.config.width);
    this.y = wrap(wy, this.config.height);
  }

  /** Lock onto a creature (or pass null to release). */
  setTarget(creature) {
    this.target = creature || null;
    if (this.target && this.zoom === MIN_ZOOM) this.setZoom(FOLLOW_ZOOM);
    if (this.target) this.update();
  }

  /**
   * Per-frame catch-up: sit on the followed creature, and let go when it dies —
   * a camera trained on a corpse is a bug, not a memorial.
   */
  update() {
    if (!this.target) return;
    if (this.target.dead) {
      this.target = null;
      return;
    }
    this.x = this.target.x;
    this.y = this.target.y;
  }

  /**
   * The image of a world point nearest the camera, in un-wrapped coordinates.
   * Drawing at these coordinates is what makes the seam invisible: each thing
   * is painted once, on whichever side of the torus is closer to the viewer.
   */
  nearest(wx, wy) {
    return {
      x: this.x + wrapDelta(this.x, wx, this.config.width),
      y: this.y + wrapDelta(this.y, wy, this.config.height),
    };
  }

  /**
   * Where to place copies of a whole-world backdrop so it covers the viewport.
   *
   * Everything else in this scene is one small thing drawn at whichever wrapped
   * image of itself is nearest the camera. A backdrop is the whole world at once,
   * and at any zoom the viewport can straddle up to four copies of it, so it
   * needs the tiles rather than the nearest image: the tile containing the
   * world's centre, plus whichever of its eight neighbours the viewport actually
   * reaches.
   *
   * At zoom 1 the viewport is exactly the world, so this returns exactly one
   * tile at the origin — the same invariant the rest of this file protects.
   *
   * @returns {Array<{x:number, y:number}>} top-left corners, in world coordinates
   */
  worldTiles() {
    const cfg = this.config;
    const halfW = cfg.width / (2 * this.zoom);
    const halfH = cfg.height / (2 * this.zoom);
    const centre = this.nearest(cfg.width / 2, cfg.height / 2);
    const ox = centre.x - cfg.width / 2;
    const oy = centre.y - cfg.height / 2;
    const tiles = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = ox + dx * cfg.width;
        const ty = oy + dy * cfg.height;
        // Skip the tiles the viewport misses, and the ones it merely *touches*:
        // an overlap of zero width contributes no pixels. That is what makes the
        // whole-pond view exactly one tile rather than one tile flanked by eight
        // neighbours meeting it edge-on — which is what the terrain layer had
        // been blitting every frame since v1.23.
        if (tx >= this.x + halfW || tx + cfg.width <= this.x - halfW) continue;
        if (ty >= this.y + halfH || ty + cfg.height <= this.y - halfH) continue;
        tiles.push({ x: tx, y: ty });
      }
    }
    return tiles;
  }

  /** World point → screen pixel. */
  worldToScreen(wx, wy) {
    const cfg = this.config;
    return {
      x: cfg.width / 2 + wrapDelta(this.x, wx, cfg.width) * this.zoom,
      y: cfg.height / 2 + wrapDelta(this.y, wy, cfg.height) * this.zoom,
    };
  }

  /** Screen pixel → world point, wrapped back into the world's bounds. */
  screenToWorld(sx, sy) {
    const cfg = this.config;
    return {
      x: wrap(this.x + (sx - cfg.width / 2) / this.zoom, cfg.width),
      y: wrap(this.y + (sy - cfg.height / 2) / this.zoom, cfg.height),
    };
  }

  /**
   * Push this view into a canvas transform, so drawing code can keep working in
   * (un-wrapped) world coordinates. `dpr` is the device-pixel ratio the canvas
   * is already scaled by.
   */
  applyTo(ctx, dpr = 1) {
    const cfg = this.config;
    const s = this.zoom * dpr;
    ctx.setTransform(
      s,
      0,
      0,
      s,
      (cfg.width / 2 - this.x * this.zoom) * dpr,
      (cfg.height / 2 - this.y * this.zoom) * dpr
    );
  }
}
