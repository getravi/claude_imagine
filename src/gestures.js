// gestures.js — one pointer state machine for the pond: tap, drag, pinch.
//
// The camera arrived in v1.17 with a wheel and a keyboard, and every lens built
// on it since — the minimap, the terrain layer, the detritus stain — inherited
// the same reach. A phone has neither a wheel nor a keyboard, so on a touch
// device the whole camera was a feature you could read about and not use.
//
// Everything here is arithmetic over pointer coordinates: no DOM, no clock of
// its own (callers pass timestamps in), and no random numbers, so it is
// testable and cannot perturb a world. `main.js` is left as a thin adapter that
// turns browser events into calls on this and gesture results into camera
// moves — which is the point, since `main.js` is the one module the suite
// cannot reach.
//
// The distinction that matters is tap-versus-drag, and it is decided by
// *distance travelled*, not by a timer: a slow, deliberate click on a
// four-pixel creature has to keep working.

/** Pixels of travel a press may make and still count as a tap. */
export const DRAG_SLOP = 4;
/**
 * Fingers closer together than this are treated as this far apart. Two touches
 * can land on the same pixel, and a raw span ratio would then be 0, Infinity or
 * NaN — a zoom that jumps to a limit and cannot be undone.
 */
export const PINCH_MIN_SPAN = 8;
/** Milliseconds between two taps that make a double tap. */
export const DOUBLE_TAP_MS = 320;
/** Pixels apart two taps may be and still be the same double tap. */
export const DOUBLE_TAP_SLOP = 24;

export class Gestures {
  /** @param {object} [opts] - thresholds, all defaulted from the constants above */
  constructor(opts = {}) {
    this.slop = opts.slop ?? DRAG_SLOP;
    this.minSpan = opts.minSpan ?? PINCH_MIN_SPAN;
    this.doubleMs = opts.doubleMs ?? DOUBLE_TAP_MS;
    this.doubleSlop = opts.doubleSlop ?? DOUBLE_TAP_SLOP;
    /** @type {Map<number, {x:number, y:number}>} live pointers, in arrival order */
    this.pointers = new Map();
    /** The one finger a drag or tap belongs to, or null. */
    this.primary = null;
    this.travel = 0;
    this.canTap = false;
    /** The two fingers a pinch is measured between, and their last span/midpoint. */
    this.pinch = null;
    this.lastTap = null;
  }

  /** How many pointers are currently down. */
  get fingers() {
    return this.pointers.size;
  }

  /** True while two or more fingers own the gesture. */
  get pinching() {
    return this.pinch !== null;
  }

  /**
   * A pointer went down. A second one converts whatever the first was about to
   * become — a tap, a drag — into a pinch: half of a two-finger gesture must
   * never also select a creature or pan on its own.
   */
  down(id, x, y) {
    this.pointers.set(id, { x, y });
    if (this.pointers.size === 1) {
      this.primary = id;
      this.travel = 0;
      this.canTap = true;
      return;
    }
    this.primary = null;
    this.canTap = false;
    if (this.pointers.size === 2) this.seat();
  }

  /**
   * A pointer moved.
   * @returns {null | {type: "pan", dx, dy, x, y} | {type: "pinch", scale, dx, dy, x, y}}
   *   For a pinch, `scale` is the factor the fingers' separation changed by and
   *   `x`/`y` are the midpoint they arrived at — the anchor to zoom about —
   *   while `dx`/`dy` are how far that midpoint drifted, which is a pan.
   */
  move(id, x, y) {
    const p = this.pointers.get(id);
    if (!p) return null;
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;

    if (this.pinch) {
      // A third finger is along for the ride; it does not move the view.
      if (id !== this.pinch.a && id !== this.pinch.b) return null;
      const prev = this.pinch;
      this.seat();
      return {
        type: "pinch",
        scale: this.pinch.span / prev.span,
        dx: this.pinch.x - prev.x,
        dy: this.pinch.y - prev.y,
        x: this.pinch.x,
        y: this.pinch.y,
      };
    }

    if (id !== this.primary) return null;
    this.travel += Math.abs(dx) + Math.abs(dy);
    if (this.travel <= this.slop) return null;
    this.canTap = false;
    return { type: "pan", dx, dy, x, y };
  }

  /**
   * A pointer lifted.
   * @param {number} [t] - the event's timestamp in ms, for double-tap detection
   * @returns {null | {type: "tap", x, y, count}} `count` is 1 or 2.
   */
  up(id, t = 0) {
    const p = this.pointers.get(id);
    if (!p) return null;
    this.pointers.delete(id);

    if (this.pinch) {
      if (this.pointers.size >= 2) {
        this.seat();
        return null;
      }
      this.pinch = null;
      // Handing a pinch back to one finger must not jerk the view. The survivor
      // becomes a drag from wherever it currently is — its position has been
      // tracked all along, so the next move's delta is small — and, having been
      // part of a pinch, it can never be mistaken for a tap.
      this.primary = this.pointers.size === 1 ? this.pointers.keys().next().value : null;
      this.travel = Infinity;
      this.canTap = false;
      return null;
    }

    if (id !== this.primary) return null;
    this.primary = null;
    if (!this.canTap) return null;
    this.canTap = false;
    return { type: "tap", x: p.x, y: p.y, count: this.tapCount(p.x, p.y, t) };
  }

  /**
   * A pointer the browser took back — a page scroll claimed it, the window lost
   * focus. Identical to `up` except that it can never produce a tap. With no
   * id, every pointer is dropped.
   */
  cancel(id) {
    if (id === undefined) {
      this.pointers.clear();
      this.primary = null;
      this.pinch = null;
      this.travel = 0;
      this.canTap = false;
      this.lastTap = null;
      return null;
    }
    this.canTap = false;
    return this.up(id);
  }

  /** Re-measure the pinch across the two oldest live pointers. */
  seat() {
    const it = this.pointers.keys();
    const a = it.next().value;
    const b = it.next().value;
    const pa = this.pointers.get(a);
    const pb = this.pointers.get(b);
    this.pinch = {
      a,
      b,
      span: Math.max(Math.hypot(pb.x - pa.x, pb.y - pa.y), this.minSpan),
      x: (pa.x + pb.x) / 2,
      y: (pa.y + pb.y) / 2,
    };
  }

  /** 2 if this tap continues the previous one, otherwise 1. */
  tapCount(x, y, t) {
    const last = this.lastTap;
    if (
      last &&
      t - last.t <= this.doubleMs &&
      Math.abs(x - last.x) <= this.doubleSlop &&
      Math.abs(y - last.y) <= this.doubleSlop
    ) {
      // Consumed, so a third tap starts a fresh pair rather than firing again.
      this.lastTap = null;
      return 2;
    }
    this.lastTap = { x, y, t };
    return 1;
  }
}
