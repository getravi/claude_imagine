// environment.js — spatial and temporal structure of the world.
//
// Up to v1.2 the pond was uniform: food appeared anywhere with equal odds, at a
// constant rate. Real habitats aren't like that — they have fertile patches and
// barren stretches (space), and they have seasons (time). Heterogeneity is a
// major engine of diversity: it gives different regions and different times of
// year different "best strategies," so lineages can specialise instead of all
// converging on one global optimum.
//
// This module is pure world-physics with no notion of creatures. It provides:
//   - a FertilityField: where food prefers to spawn (the biomes), and
//   - seasonalFactor(): a time-varying multiplier on how fast food appears.

/**
 * A smooth fertility landscape built from a few Gaussian "bumps" (biomes) on the
 * torus. Fertility is high near a biome centre and falls to a floor far from any
 * centre, so food concentrates in patches without leaving the rest of the world
 * a total desert.
 */
export class FertilityField {
  constructor(config, rng) {
    this.config = config;
    this.floor = config.patchFloor;
    this.sigma = config.patchRadius;
    this.twoSigma2 = 2 * this.sigma * this.sigma;
    // Biome centres, placed once from the world RNG so a seed reproduces the
    // same landscape every time.
    this.centres = [];
    for (let i = 0; i < config.patchCount; i++) {
      this.centres.push({ x: rng.range(0, config.width), y: rng.range(0, config.height) });
    }
  }

  /** Shortest wrapped delta along an axis of length `size`. */
  _wrapDelta(a, b, size) {
    let d = b - a;
    const half = size / 2;
    if (d > half) d -= size;
    else if (d < -half) d += size;
    return d;
  }

  /**
   * Fertility at a point, in [floor, 1]. 1 sits at a biome centre; it decays to
   * `floor` far from every centre. Uses the *nearest* biome (a max of bumps) so
   * overlapping biomes never push fertility above 1 — which keeps it directly
   * usable as an acceptance probability.
   */
  at(x, y) {
    const { width, height } = this.config;
    let bump = 0;
    for (const c of this.centres) {
      const dx = this._wrapDelta(x, c.x, width);
      const dy = this._wrapDelta(y, c.y, height);
      const b = Math.exp(-(dx * dx + dy * dy) / this.twoSigma2);
      if (b > bump) bump = b;
    }
    return this.floor + (1 - this.floor) * bump;
  }

  /**
   * Sample a spawn position, biased toward fertile areas by rejection sampling.
   * Falls back to a uniform position after a bounded number of tries so this can
   * never spin forever in a low-fertility world.
   * @param {import('./rng.js').RNG} rng
   * @returns {{x:number, y:number}}
   */
  sample(rng) {
    const { width, height } = this.config;
    for (let tries = 0; tries < 12; tries++) {
      const x = rng.range(0, width);
      const y = rng.range(0, height);
      if (rng.float() < this.at(x, y)) return { x, y };
    }
    return { x: rng.range(0, width), y: rng.range(0, height) };
  }
}

/**
 * Seasonal multiplier on the food spawn rate at a given tick. Returns a value in
 * [1 - amplitude, 1 + amplitude]: a smooth sine "year" so food waxes in summer
 * and wanes in winter. Deterministic in `tick` (no wall-clock time), so seasons
 * don't break reproducibility.
 * @param {number} tick
 * @param {object} config
 */
export function seasonalFactor(tick, config) {
  if (!config.seasons) return 1;
  const phase = (2 * Math.PI * tick) / config.seasonLength;
  return 1 + config.seasonAmplitude * Math.sin(phase);
}

/**
 * A 0..1 "how deep into summer" value for display (0.5 = spring/autumn equinox,
 * 1 = midsummer, 0 = midwinter). Purely cosmetic.
 */
export function seasonPhase(tick, config) {
  const s = Math.sin((2 * Math.PI * tick) / config.seasonLength);
  return (s + 1) / 2;
}
