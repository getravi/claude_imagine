// barriers.js — the pond stops being one room.
//
// v1.23 gave the world terrain and found the load-bearing half by accident: a
// movement *cost* over rough ground moved the population by -0.003, and the
// barrenness that came with it did all the work. The diagnosis written up in
// docs/SCIENCE.md was a timescale, not a magnitude — `maxSpeed` and `maxAge`
// together say a creature crosses this world a dozen times in its life, so a
// spatially varying cost is averaged away by the crossing long before selection
// can act on it. **A spatial cost does not produce spatial structure in a
// well-mixed world.** That note listed two remedies that address the diagnosis
// rather than the symptom: restrict movement, or make the resource vary in
// space. The second is what biomes already are. This is the first.
//
// A barrier is rock: a slab across the world with a gate in it, which nothing
// can enter and nothing grows inside. Four of them (two north-south, two
// east-west) cut the torus into four rooms joined by four gates, so crossing
// the pond stops being a straight line and starts being a search for a door.
//
// What it is not:
//
//   * **Not perceived.** Like terrain, no creature has a sense for rock. A
//     creature that meets a wall slides along it, because the refused component
//     of its velocity is dropped and the other one survives — which is enough
//     to find a gate without anything having to know a gate exists. Any story
//     about creatures *learning* the map would be the v1.23 mistake again.
//   * **Not a wall to everything else** — until v1.50. Sight, sound, teeth and
//     the pathogen all crossed rock in v1.48; blocking them would have been a
//     second mechanic wearing this one's clothes, and would have made that
//     release's measurement impossible to attribute. It is that second mechanic
//     that `barrierOcclusion` now is, on its own flag, measured against the
//     transparent walls rather than against open water: `occluded()` below is
//     the rule, `firstHit()` is the geometry underneath it, and `visibleRadii()`
//     is the same geometry drawn, so the picture cannot disagree with the rule.
//
// Two properties are copied deliberately from `terrain.js`:
//
//   1. **No randomness.** The layout is derived from the seed by an integer
//      hash, so switching barriers on draws zero numbers from the world RNG.
//   2. **Exactly periodic.** Every wall wraps: a slab whose thickness straddles
//      the seam is the same slab seen from the other side, and `blocked()`
//      answers on the torus, so there is no edge for a creature to be pinned
//      against. This world has had no edges since v1.0.

import { wrap, wrapDelta } from "./vec.js";

/**
 * The same 32-bit integer mixer `terrain.js` uses (Thomas Wang's) — all integer
 * ops, so a layout is identical on every engine. Kept local to each module
 * rather than shared, because the two fields must be able to change their
 * hashing independently without moving each other's worlds.
 * @param {number} x
 * @returns {number} a well-mixed uint32
 */
function hash32(x) {
  x = x | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = (x + (x << 3)) | 0;
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return x >>> 0;
}

/** A uint32 as a fraction in [0, 1). */
function unit(h) {
  return h / 4294967296;
}

/**
 * How far a wall may be shifted from its even spacing, as a fraction of the
 * spacing. Even placement is what makes rooms of comparable size; the jitter is
 * what stops every seed drawing the same four lines.
 */
const POSITION_JITTER = 0.4;

/** Nudge, in pixels, applied when pushing a point out of rock — see `eject`. */
const EJECT_MARGIN = 0.5;

/**
 * The rock in a world that has any: a set of wrapped slabs with gates in them.
 *
 * Every wall is axis-aligned, which is not an aesthetic choice — it is what
 * makes `blocked()` two interval tests instead of a polygon query, keeps the
 * drawn rectangles and the simulated rule provably the same shape (see
 * `test/barriers.test.js`, which walks a grid and asserts the two agree cell by
 * cell), and gives the sliding rule a well-defined pair of components.
 */
export class BarrierField {
  /** @param {object} config */
  constructor(config) {
    this.config = config;
    const count = Math.max(0, Math.floor(config.barrierCount));
    const half = config.barrierThickness / 2;
    const gapHalf = config.barrierGapWidth / 2;
    const seed = (config.seed | 0) ^ 0x6a2b1ce5;

    // Alternate the axes as the walls are laid down, so an odd count still
    // encloses something rather than leaving the pond in open bands.
    let verticals = 0;
    for (let i = 0; i < count; i++) if (i % 2 === 0) verticals++;
    const horizontals = count - verticals;

    // Pass one: where the walls are. Positions have to be known before any gate
    // can be placed, for the reason in pass two.
    /** @type {Array<{vertical:boolean, pos:number, half:number, gaps:number[], gapHalf:number}>} */
    this.walls = [];
    for (let i = 0; i < count; i++) {
      const vertical = i % 2 === 0;
      const index = Math.floor(i / 2);
      const siblings = vertical ? verticals : horizontals;
      // `span` is the axis the wall's position lives on; `cross` is the axis it
      // runs along, and therefore the one its gates are placed on.
      const span = vertical ? config.width : config.height;
      const h = hash32(seed + i * 0x9e3779b1);
      const spacing = span / siblings;
      const pos = wrap(spacing * (index + 0.5) + (unit(h) - 0.5) * spacing * POSITION_JITTER, span);
      this.walls.push({ vertical, pos, half, gaps: [], gapHalf });
    }

    // Pass two: the gates, one (or `barrierGaps`) **per room the wall borders**
    // rather than per wall.
    //
    // The first version of this file placed each wall's gate independently, and
    // the flood fill in `test/barriers.test.js` found what that is worth on the
    // second seed it tried: on seed 77 both north-south gates landed in the same
    // east-west band, so one of the four rooms had no door at all and 26% of the
    // pond was an aquarium. Independent placement makes connectivity a matter of
    // luck, and a layout is drawn from a seed, so the unlucky ones ship.
    //
    // Placing a gate in every band a wall crosses makes every pair of adjacent
    // rooms directly connected, which makes the room graph the full grid and the
    // pond provably one pond — by construction, for every seed, rather than by
    // testing enough of them.
    const gatesPerBand = Math.max(0, Math.floor(config.barrierGaps));
    for (const w of this.walls) {
      const cross = w.vertical ? config.height : config.width;
      // The lines that cut this wall into bands: the perpendicular walls.
      const cuts = this.walls
        .filter((o) => o.vertical !== w.vertical)
        .map((o) => o.pos)
        .sort((a, b) => a - b);
      const bands = bandsBetween(cuts, cross);
      for (let b = 0; b < bands.length; b++) {
        for (let k = 0; k < gatesPerBand; k++) {
          // Keep the gate clear of the crossing walls at either end of the band,
          // so a door is never half-swallowed by the rock it is a door past.
          const margin = gapHalf + half + 1;
          const band = bands[b];
          const room = band.b - band.a;
          const h = hash32(hash32(seed ^ (w.vertical ? 0x1111 : 0x2222)) + (b * 8 + k) * 0x27d4eb2d);
          const t = (k + unit(h)) / gatesPerBand;
          const centre =
            room > 2 * margin ? band.a + margin + t * (room - 2 * margin) : band.a + room / 2;
          w.gaps.push(wrap(centre, cross));
        }
      }
    }

    // Pass three: each wall's *solid* runs — its length minus its merged gates,
    // the same intervals `rects()` draws. Cached because `firstHit()` is asked
    // this question once per candidate pair per sense query, and the answer
    // cannot change: a layout is fixed at construction.
    for (const w of this.walls) {
      const cross = w.vertical ? config.height : config.width;
      w.span = w.vertical ? config.width : config.height;
      w.cross = cross;
      // Flat pairs rather than objects: this is the innermost loop of every
      // sense query in a world with opaque rock, and an indexed walk over a
      // typed array is measurably cheaper than an iterator over records.
      const runs = solidRuns(w.gaps, w.gapHalf, cross);
      w.runs = new Float64Array(runs.length * 2);
      for (let i = 0; i < runs.length; i++) {
        w.runs[i * 2] = runs[i].a;
        w.runs[i * 2 + 1] = runs[i].b;
      }
    }
  }

  /**
   * Is this point inside rock? Wraps, so any coordinate is valid.
   *
   * The whole mechanic is this predicate: the movement rule, the crop, the two
   * views and the audit all ask it rather than reimplementing the geometry.
   * @param {number} x
   * @param {number} y
   */
  blocked(x, y) {
    const { width, height } = this.config;
    for (const w of this.walls) {
      const along = w.vertical ? x : y;
      const across = w.vertical ? y : x;
      const span = w.vertical ? width : height;
      const cross = w.vertical ? height : width;
      if (Math.abs(wrapDelta(w.pos, along, span)) >= w.half) continue;
      let inGate = false;
      for (const gate of w.gaps) {
        if (Math.abs(wrapDelta(gate, across, cross)) < w.gapHalf) {
          inGate = true;
          break;
        }
      }
      if (!inGate) return true;
    }
    return false;
  }

  /**
   * Where a creature that tried to move from (px, py) to (nx, ny) actually ends
   * up, and which components of its velocity the rock refused.
   *
   * Axis-separated, which is what produces sliding: a body heading north-east
   * into a north-south wall keeps its northward component and loses the
   * eastward one, so it runs along the rock until a gate appears. Nothing has
   * to perceive the gate for this to work, which is the point — a wall makes a
   * pond that is hard to cross out of components a creature already had.
   *
   * A point already inside rock is always allowed to move: barriers can be
   * switched on under a living pond, and a rule that can trap a creature
   * forever is worse than one that lets a stranded one walk out.
   *
   * @param {number} px @param {number} py current position (wrapped)
   * @param {number} nx @param {number} ny desired position (wrapped)
   * @returns {{x:number, y:number, stoppedX:boolean, stoppedY:boolean}}
   */
  resolve(px, py, nx, ny) {
    if (this.blocked(px, py)) return { x: nx, y: ny, stoppedX: false, stoppedY: false };
    if (!this.blocked(nx, ny)) return { x: nx, y: ny, stoppedX: false, stoppedY: false };
    if (!this.blocked(nx, py)) return { x: nx, y: py, stoppedX: false, stoppedY: true };
    if (!this.blocked(px, ny)) return { x: px, y: ny, stoppedX: true, stoppedY: false };
    return { x: px, y: py, stoppedX: true, stoppedY: true };
  }

  /**
   * The nearest point outside rock — used by everything that *places* something
   * rather than moving it: the founders, a newborn, and every pellet.
   *
   * A pellet inside rock would be worse than merely invisible: it would sit in
   * `foodMax` forever, uneaten, so the crop would silently shrink toward the
   * share of the world that is walled. Placement therefore never fails, and the
   * influx contract terrain kept in v1.23 — the ground moves the crop around,
   * it does not shrink it — holds here too.
   *
   * Deterministic and draw-free: each blocking wall pushes the point out of its
   * nearer face, repeated a few times because two crossing walls can hand a
   * point back and forth once. The last resort is the middle of a gate, which
   * is free ground by construction.
   *
   * @param {number} x @param {number} y
   * @returns {{x:number, y:number}}
   */
  eject(x, y) {
    if (!this.blocked(x, y)) return { x, y };
    const { width, height } = this.config;
    for (let pass = 0; pass < 3 && this.blocked(x, y); pass++) {
      for (const w of this.walls) {
        const along = w.vertical ? x : y;
        const span = w.vertical ? width : height;
        const d = wrapDelta(w.pos, along, span); // where the point sits inside the slab
        if (Math.abs(d) >= w.half) continue;
        const out = wrap(w.pos + (d >= 0 ? 1 : -1) * (w.half + EJECT_MARGIN), span);
        if (w.vertical) x = out;
        else y = out;
      }
    }
    if (this.blocked(x, y)) {
      // Two walls crossing at exactly the wrong place. Every wall has at least
      // one gate and the middle of a gate is open ground unless another wall
      // crosses it, so try them all before giving up on the geometry.
      for (const w of this.walls) {
        for (const gate of w.gaps) {
          const gx = w.vertical ? w.pos : gate;
          const gy = w.vertical ? gate : w.pos;
          if (!this.blocked(gx, gy)) return { x: gx, y: gy };
        }
      }
    }
    return { x, y };
  }

  /**
   * How far along the displacement `(dx, dy)` from `(ax, ay)` the ray first
   * enters rock, as a fraction in [0, 1] — or `Infinity` if it reaches the end
   * without meeting any. The displacement is a *delta*, already wrapped by the
   * caller, so this works on the torus without knowing where the seam is.
   *
   * One function answers both questions the occlusion rule has: whether a thing
   * is hidden (`occluded`, which asks whether the hit lands before the target)
   * and where the shadow starts (`visibleRadii`, which asks for the hit itself).
   * That is deliberate — v1.32's lesson is that an accelerator or a picture
   * which "should" agree with the rule eventually does not, and the cheapest
   * defence is that there is only one rule to disagree with.
   *
   * Exact rather than sampled, which matters twice over: a marched ray can step
   * straight through a 14-pixel slab, and a rule that depends on a step size is
   * a rule nobody can state. Every wall is axis-aligned, so the ray's stay
   * inside a slab is one interval of t — and inside that interval the crossing
   * coordinate moves linearly, so the first solid run it meets is another
   * interval intersection. Three images of each wall (and of each run) are
   * tested because both axes wrap and a delta may reach half the world.
   *
   * @param {number} ax @param {number} ay start, wrapped into the world
   * @param {number} dx @param {number} dy displacement, already a wrapped delta
   * @returns {number} the first t in [0, 1] inside rock, or Infinity
   */
  firstHit(ax, ay, dx, dy) {
    let best = Infinity;
    const walls = this.walls;
    for (let wi = 0; wi < walls.length; wi++) {
      const w = walls[wi];
      const runs = w.runs;
      if (runs.length === 0) continue; // a wall that is all gate stops nothing
      const span = w.span;
      const cross = w.cross;
      const half = w.half;
      // `0` is the axis the wall's position lives on; `1` the axis it runs
      // along, and therefore the one its gates are placed on.
      const a0 = w.vertical ? ax : ay;
      const d0 = w.vertical ? dx : dy;
      const a1 = w.vertical ? ay : ax;
      const d1 = w.vertical ? dy : dx;
      const reach = (d0 < 0 ? -d0 : d0) + half;
      // One reciprocal per axis per wall instead of two divisions per doorway
      // tested. This is the innermost arithmetic of every sense query in a
      // walled world and division is the only expensive operation in it.
      const inv0 = d0 === 0 ? 0 : 1 / d0;
      const inv1 = d1 === 0 ? 0 : 1 / d1;
      const nearest = wrapDelta(a0, w.pos, span); // the wall centre, as an offset
      for (let img = -1; img <= 1; img++) {
        const c = nearest + img * span;
        if (c > reach || c < -reach) continue; // this image is out of range
        let t0, t1;
        if (d0 === 0) {
          // Parallel to the wall: either always inside the slab or never.
          if (c >= half || c <= -half) continue;
          t0 = 0;
          t1 = 1;
        } else {
          const ta = (c - half) * inv0;
          const tb = (c + half) * inv0;
          t0 = ta < tb ? ta : tb;
          t1 = ta < tb ? tb : ta;
          if (t0 < 0) t0 = 0;
          if (t1 > 1) t1 = 1;
          if (t0 >= t1 || t0 >= best) continue;
        }
        // Inside the slab from t0 to t1: when is the crossing coordinate in rock
        // rather than in a doorway?
        for (let ri = 0; ri < runs.length; ri += 2) {
          for (let j = -1; j <= 1; j++) {
            const ra = runs[ri] + j * cross;
            const rb = runs[ri + 1] + j * cross;
            let s, e;
            if (d1 === 0) {
              if (a1 <= ra || a1 >= rb) continue;
              s = t0;
              e = t1;
            } else {
              const ua = (ra - a1) * inv1;
              const ub = (rb - a1) * inv1;
              s = ua < ub ? ua : ub;
              e = ua < ub ? ub : ua;
              if (s < t0) s = t0;
              if (e > t1) e = t1;
            }
            if (s < e && s < best) best = s;
          }
        }
      }
    }
    return best;
  }

  /**
   * Does rock stand between these two points? The whole of the occlusion rule:
   * sight, earshot, a mate search and the pathogen all ask exactly this.
   *
   * A point *inside* rock is hidden from nothing. That is the same decision
   * `resolve()` makes for movement — barriers can be switched on under a living
   * pond, and a creature the walls closed around should be able to walk out
   * rather than go blind — and it makes the relation asymmetric for exactly as
   * long as it takes the stranded one to leave.
   *
   * @param {number} ax @param {number} ay @param {number} bx @param {number} by
   */
  occluded(ax, ay, bx, by) {
    const { width, height } = this.config;
    if (this.firstHit(ax, ay, wrapDelta(ax, bx, width), wrapDelta(ay, by, height)) > 1) return false;
    // Only now: a watcher standing in rock hits it at t = 0, so this is the one
    // case a hit does not mean hidden — and asking first would pay for the test
    // on every pair rather than on the third of them that meet a wall at all.
    return !this.blocked(ax, ay);
  }

  /**
   * What a watcher at (x, y) can actually see, as the distance to the first rock
   * along each of `rays` evenly spaced directions (clamped to `radius`).
   *
   * This is the answer to "what on screen says this is on?" — the vision overlay
   * stops being a circle and becomes the shape sight really takes, with the
   * shadows of the walls cut out of it. It is `firstHit` and nothing else, so
   * the overlay is not a drawing *about* the rule, it is the rule plotted.
   *
   * @param {number} x @param {number} y
   * @param {number} radius
   * @param {number} rays
   * @returns {Float64Array} one visible distance per direction, from angle 0
   */
  visibleRadii(x, y, radius, rays = 96) {
    const out = new Float64Array(rays);
    if (this.blocked(x, y)) {
      out.fill(radius);
      return out;
    }
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const t = this.firstHit(x, y, Math.cos(a) * radius, Math.sin(a) * radius);
      out[i] = t < 1 ? t * radius : radius;
    }
    return out;
  }

  /**
   * The rock as axis-aligned rectangles in world coordinates, each wholly
   * inside [0, width) x [0, height) — the shape both views draw and the audit
   * checks against `blocked()`.
   *
   * A slab that straddles the seam is returned as the two pieces a rectangle
   * can draw, the same decision the minimap made in v1.24 for a straddling
   * viewport: hide the torus where you can, split where you cannot.
   *
   * @returns {Array<{x:number, y:number, w:number, h:number}>}
   */
  rects() {
    const { width, height } = this.config;
    const out = [];
    for (const w of this.walls) {
      const span = w.vertical ? width : height;
      const cross = w.vertical ? height : width;
      const slabs = splitInterval(w.pos - w.half, w.pos + w.half, span);
      const runs = solidRuns(w.gaps, w.gapHalf, cross);
      for (const s of slabs) {
        for (const r of runs) {
          if (w.vertical) out.push({ x: s.a, y: r.a, w: s.b - s.a, h: r.b - r.a });
          else out.push({ x: r.a, y: s.a, w: r.b - r.a, h: s.b - s.a });
        }
      }
    }
    return out;
  }

  /**
   * How many rooms the walls cut this world into: the vertical walls make that
   * many columns on the torus, the horizontal ones that many rows. One wall of
   * an axis still makes one band, because the torus has no edge for it to end
   * against — which is why this is a product of `max(1, n)` and not of `n + 1`.
   */
  roomCount() {
    let v = 0;
    for (const w of this.walls) if (w.vertical) v++;
    const h = this.walls.length - v;
    return Math.max(1, v) * Math.max(1, h);
  }

  /** Share of the world's area that is rock, by exhaustive sampling. Audit only. */
  blockedShare(step = 2) {
    const { width, height } = this.config;
    let hit = 0;
    let n = 0;
    for (let y = step / 2; y < height; y += step) {
      for (let x = step / 2; x < width; x += step) {
        if (this.blocked(x, y)) hit++;
        n++;
      }
    }
    return n ? hit / n : 0;
  }
}

/**
 * The bands a set of wrapped cut lines divides an axis into, as intervals that
 * may run past `size` (the one containing the seam starts before it wraps).
 * With no cuts at all there is one band: the whole axis.
 * @param {number[]} cuts sorted ascending, each in [0, size)
 * @param {number} size
 * @returns {Array<{a:number, b:number}>}
 */
function bandsBetween(cuts, size) {
  if (cuts.length === 0) return [{ a: 0, b: size }];
  const out = [];
  for (let i = 0; i < cuts.length; i++) {
    const a = cuts[i];
    const b = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + size;
    out.push({ a, b });
  }
  return out;
}

/**
 * An interval [a, b) on a wrapped axis, as one or two pieces inside [0, size).
 * @returns {Array<{a:number, b:number}>}
 */
function splitInterval(a, b, size) {
  const lo = wrap(a, size);
  const hi = lo + (b - a);
  if (hi <= size) return [{ a: lo, b: hi }];
  return [
    { a: lo, b: size },
    { a: 0, b: hi - size },
  ];
}

/**
 * The solid runs of a wall: its whole length minus its gates, as intervals
 * inside [0, size). Gates are merged first, so two that overlap make one door
 * rather than a door with a phantom pillar in it.
 * @param {number[]} gates centres
 * @param {number} gapHalf
 * @param {number} size length of the axis the wall runs along
 * @returns {Array<{a:number, b:number}>}
 */
function solidRuns(gates, gapHalf, size) {
  if (gates.length === 0 || gapHalf <= 0) return [{ a: 0, b: size }];
  // Every gate as one or two pieces inside [0, size), sorted and merged.
  const holes = [];
  for (const g of gates) for (const p of splitInterval(g - gapHalf, g + gapHalf, size)) holes.push(p);
  holes.sort((p, q) => p.a - q.a);
  const merged = [];
  for (const p of holes) {
    const last = merged[merged.length - 1];
    if (last && p.a <= last.b) last.b = Math.max(last.b, p.b);
    else merged.push({ a: p.a, b: p.b });
  }
  // The complement, dropping any zero-length run (a gate flush with the seam).
  const runs = [];
  let cursor = 0;
  for (const p of merged) {
    if (p.a > cursor) runs.push({ a: cursor, b: p.a });
    cursor = Math.max(cursor, p.b);
  }
  if (cursor < size) runs.push({ a: cursor, b: size });
  return runs;
}

/**
 * Is this point inside rock, in a world that may have none at all?
 *
 * Returns literally `false` when there is no field — the same shape as
 * `terrainCostAt`'s exact `1`, so a call site can ask unconditionally and a
 * world without barriers takes no branch that could move it.
 *
 * @param {BarrierField|null|undefined} barriers
 * @param {number} x @param {number} y
 */
export function blockedAt(barriers, x, y) {
  return barriers ? barriers.blocked(x, y) : false;
}
