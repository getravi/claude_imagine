// trail.js — where the selected creature has been.
//
// `FIELD_SILENT` in `inspect.js` excuses a creature's `x` and `y` with a
// sentence that is true and incomplete: "a place is a picture: the pond and the
// minimap draw it, and describeSelection() speaks the region". Both pictures
// draw the place a creature is *now*. Nothing on this page has ever drawn where
// it was, and a position is the one creature field whose whole meaning is a
// history — a body at (400, 300) tells you nothing, and a body that has spent
// four hundred ticks inside forty pixels of (400, 300) tells you it is grazing
// a patch. v1.17 added a camera and v1.60 a keyboard route to a creature; both
// let a watcher choose a subject, and the subject's behaviour is still only
// legible by staring at it in real time.
//
// So this is a ring buffer of one creature's recent positions, and it is the
// thinnest thing that could carry that. Three properties it is built for:
//
//   - **It is a pure observer.** It is written to from the animation loop and
//     read by the renderer and the spoken description; nothing in `world.js`
//     imports it, it draws no random numbers, and a pond with a trail being
//     recorded is bit-for-bit a pond with nothing selected at all.
//   - **It owns the torus.** A stored path on a wrapped world is not a
//     polyline: two consecutive points 890 px apart on a 900 px pond are 10 px
//     of swimming. `offsets()` accumulates `wrapDelta` backwards from the
//     newest point, so the caller gets a continuous path anchored on wherever
//     the head is being drawn — the pond canvas's own convention since v1.17
//     (draw at the nearest wrapped image, hide the seam) rather than the
//     minimap's (four real edges, split what straddles them).
//   - **It is keyed to a subject.** Selecting a different creature, losing one
//     to death, or resetting the world all end the path rather than splicing
//     two lives into one line. The tick is the guard: it is handed in, so a
//     second call within one tick cannot double-count and a tick that has gone
//     backwards is a new world.

import { wrapDelta } from "./vec.js";

/**
 * How many ticks of history a trail holds.
 *
 * A creature crosses this pond about a dozen times in a lifetime (v1.23's
 * diagnosis: `width / maxSpeed` = 346 ticks, and `maxAge` is a dozen of those),
 * so a whole life is a scribble over everything and a hundred ticks is a
 * fragment. 300 is a little under one crossing — long enough that a forager
 * loops visibly inside a biome and a hunter's charge reads as a straight line,
 * short enough that the path is still about what the creature is doing *now*.
 */
export const TRAIL_TICKS = 300;

export class Trail {
  /** @param {number} [capacity] ticks of history to keep */
  constructor(capacity = TRAIL_TICKS) {
    this.capacity = Math.max(2, Math.floor(capacity));
    this._x = new Float64Array(this.capacity);
    this._y = new Float64Array(this.capacity);
    this._n = 0; // points held, 0..capacity
    this._head = -1; // index of the newest point
    /** The creature this path belongs to, or null. */
    this.id = null;
    /** The tick of the newest point, so one tick cannot be recorded twice. */
    this.lastTick = -1;
  }

  /** Forget everything. A path with no subject is not a shorter path. */
  clear() {
    this._n = 0;
    this._head = -1;
    this.id = null;
    this.lastTick = -1;
  }

  /** How many points the path holds. */
  get length() {
    return this._n;
  }

  /**
   * Add the creature's current position, if this tick has not been recorded.
   *
   * @param {{id:number, x:number, y:number, dead:boolean}|null} c the selection
   * @param {number} tick `world.tick`
   * @returns {boolean} whether a point was added
   */
  record(c, tick) {
    if (!c || c.dead) {
      // Nothing selected, or the subject died. Either way the path has no
      // owner, and a stale line hanging in the water after its creature is
      // gone is the "did this really happen?" failure v1.16 left a note about.
      if (this._n || this.id !== null) this.clear();
      return false;
    }
    // A new subject, or a world whose clock has gone backwards (a reset, a new
    // seed, a loaded save — all of which can hand back an id this path has
    // already seen). Both are a new life, not a continuation.
    if (c.id !== this.id || tick < this.lastTick) {
      this.clear();
      this.id = c.id;
    } else if (tick === this.lastTick) {
      return false;
    }
    this._head = (this._head + 1) % this.capacity;
    this._x[this._head] = c.x;
    this._y[this._head] = c.y;
    if (this._n < this.capacity) this._n++;
    this.lastTick = tick;
    return true;
  }

  /**
   * The stored points, oldest first, in world coordinates.
   *
   * These are raw: consecutive points can be a world apart, because the world
   * wraps. Use `offsets()` for anything that has to be drawn or measured.
   */
  points() {
    const out = [];
    for (let i = 0; i < this._n; i++) {
      const idx = (this._head - (this._n - 1 - i) + this.capacity * 2) % this.capacity;
      out.push({ x: this._x[idx], y: this._y[idx] });
    }
    return out;
  }

  /**
   * The path as displacements from the newest point, oldest first — so the last
   * entry is always `{dx: 0, dy: 0}` and a caller adds each one to wherever it
   * is drawing the creature.
   *
   * Every step is the *shortest* toroidal displacement between two consecutive
   * positions, which is exactly the move the creature made: nothing here
   * travels more than `maxSpeed` in a tick and the pond is hundreds of pixels
   * across, so the shortest reading is never the wrong one. The path can
   * therefore run off the edge of the canvas, and that is the point — a
   * creature that crossed the seam gets one line rather than two.
   *
   * @param {{width:number, height:number}} config
   */
  offsets(config) {
    const n = this._n;
    const out = new Array(n);
    if (!n) return out;
    let dx = 0;
    let dy = 0;
    out[n - 1] = { dx: 0, dy: 0 };
    for (let i = n - 1; i > 0; i--) {
      const cur = (this._head - (n - 1 - i) + this.capacity * 2) % this.capacity;
      const prev = (cur - 1 + this.capacity) % this.capacity;
      // From `prev` to `cur` is the step; walking backwards, subtract it.
      dx -= wrapDelta(this._x[prev], this._x[cur], config.width);
      dy -= wrapDelta(this._y[prev], this._y[cur], config.height);
      out[i - 1] = { dx, dy };
    }
    return out;
  }

  /**
   * What the path adds up to.
   *
   * `travelled` is the ground covered and `displacement` is how far that got
   * it; `straightness` is the ratio, which is the number the picture is *for*.
   * A creature working a biome doubles back constantly and scores near 0; one
   * crossing the pond, or charging something, scores near 1. Zero-length paths
   * score 0 rather than dividing by nothing — a creature that has not moved has
   * not gone straight anywhere.
   *
   * **`displacement` is measured along the unwrapped path, not across the
   * torus**, and the difference is not a detail here. At `maxSpeed` a creature
   * covers about 780 px in `TRAIL_TICKS` against a pond 900 px wide, so a
   * straight swimmer is very nearly a lap: the toroidal distance from its first
   * point to its last can be almost nothing while every step it took pointed
   * the same way. Reading that as "wandered in circles" would be exactly
   * backwards, and it would also disagree with the picture, which draws the
   * unwrapped line. The number describes the line the watcher is looking at.
   *
   * @param {{width:number, height:number}} config
   */
  stats(config) {
    const n = this._n;
    let travelled = 0;
    let netX = 0;
    let netY = 0;
    for (let i = 1; i < n; i++) {
      const cur = (this._head - (n - 1 - i) + this.capacity * 2) % this.capacity;
      const prev = (cur - 1 + this.capacity) % this.capacity;
      const sx = wrapDelta(this._x[prev], this._x[cur], config.width);
      const sy = wrapDelta(this._y[prev], this._y[cur], config.height);
      travelled += Math.hypot(sx, sy);
      netX += sx;
      netY += sy;
    }
    const displacement = Math.hypot(netX, netY);
    return {
      ticks: n ? n - 1 : 0,
      travelled,
      displacement,
      straightness: travelled > 0 ? displacement / travelled : 0,
    };
  }
}
