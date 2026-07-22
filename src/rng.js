// rng.js — a small, fast, seedable pseudo-random number generator.
//
// Reproducibility matters in an evolution simulation: with a fixed seed the
// entire history of a world unfolds identically every time. That lets people
// share an interesting world just by sharing its seed, and lets us write
// deterministic tests. We use mulberry32 — tiny, fast, and statistically
// good enough for a toy universe (it is NOT cryptographically secure, and
// does not need to be).

/**
 * Create a seeded PRNG.
 * @param {number} seed - any 32-bit integer.
 * @returns {() => number} a function returning floats in [0, 1).
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A convenience wrapper bundling the distributions we reach for repeatedly.
 * Holding the generator in an object keeps call sites readable
 * (`rng.range(0, w)` rather than a pile of arithmetic everywhere).
 */
export class RNG {
  /** @param {number} seed */
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
    // Cache for the Box–Muller transform, which produces two normals at once.
    this._spare = null;
  }

  /** Uniform float in [0, 1). */
  float() {
    return this.next();
  }

  /** Uniform float in [min, max). */
  range(min, max) {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** true with probability p. */
  chance(p) {
    return this.next() < p;
  }

  /** Pick a uniformly random element of an array. */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Standard normal (mean 0, stdev 1) via Box–Muller.
   * Generates numbers in pairs; the spare is returned on the next call.
   */
  normal() {
    if (this._spare !== null) {
      const v = this._spare;
      this._spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    // Avoid log(0).
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    this._spare = mag * Math.sin(2.0 * Math.PI * v);
    return mag * Math.cos(2.0 * Math.PI * v);
  }

  /** Normal with a given mean and standard deviation. */
  gaussian(mean = 0, stdev = 1) {
    return mean + stdev * this.normal();
  }
}
