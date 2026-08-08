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
 * Spacing, in pixels, of the lattice `FertilityField.mean()` integrates over.
 * Named here rather than inlined because it is the one number deciding how
 * closely the mean tracks the field, and `test/biomes.test.js` refers to it.
 */
const LATTICE_STEP = 15;

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
    // same landscape every time. `centres` are the *current* positions (read by
    // at()/sample()/the renderer); they start at these and, if drift is on, roam
    // from here.
    this.centres = [];
    for (let i = 0; i < config.patchCount; i++) {
      this.centres.push({ x: rng.range(0, config.width), y: rng.range(0, config.height) });
    }
    // Per-biome drift directions, spread by the golden angle so each biome heads
    // a different way and the food landscape continuously reshuffles. These are
    // derived from the index — NOT the RNG — so enabling drift costs zero draws
    // and leaves every existing world untouched.
    this.driftDirs = this.centres.map((_, i) => {
      const a = i * 2.399963; // golden angle in radians
      return { x: Math.cos(a), y: Math.sin(a) };
    });
    // Cached whole-torus mean fertility, computed on demand rather than here:
    // a world that never asks never pays, and a drifting one pays again only
    // when the landscape it describes has actually moved.
    this._mean = null;
  }

  /**
   * Mean fertility over the whole torus, in [floor, 1].
   *
   * This is the denominator of every claim about where the crop stands: a
   * pellet is only *in* a biome relative to how fertile this world is on
   * average, and with four Gaussians on a 900×620 torus that average is a
   * property of where the seed happened to put them, not a constant.
   *
   * Estimated on a fixed lattice rather than in closed form, because `at()`
   * takes the *max* of the bumps and the max of overlapping Gaussians has no
   * elementary integral. `LATTICE_STEP` is an order of magnitude under
   * `patchRadius`, so the field is near-linear across a cell and the trapezoid
   * error is far below anything a readout shows; `test/biomes.test.js` pins it
   * against a lattice eight times finer.
   *
   * Deterministic and draw-free: the lattice is derived from the config, so
   * asking a world this question cannot move it.
   */
  mean() {
    if (this._mean !== null) return this._mean;
    const { width, height } = this.config;
    const cols = Math.max(1, Math.round(width / LATTICE_STEP));
    const rows = Math.max(1, Math.round(height / LATTICE_STEP));
    let sum = 0;
    // Cell centres, not corners: a torus has no edge to include twice, and
    // sampling the midpoint of each cell is the estimator that stays exact for
    // a field that is linear across one.
    for (let j = 0; j < rows; j++) {
      const y = ((j + 0.5) / rows) * height;
      for (let i = 0; i < cols; i++) {
        sum += this.at(((i + 0.5) / cols) * width, y);
      }
    }
    this._mean = sum / (cols * rows);
    return this._mean;
  }

  /**
   * Advance drifting biomes by one tick. With `driftPerTick === 0` (the default)
   * nothing moves and the field is exactly the static one. Integrated
   * incrementally (rather than as base + v·t) so changing the drift speed at
   * runtime alters the pace smoothly instead of teleporting the biomes.
   */
  update(driftPerTick) {
    if (!driftPerTick) return;
    // The landscape is about to change shape, so the mean of the old one is a
    // number about a world that no longer exists. Dropped rather than guarded:
    // a cache in front of a moving thing is where this project's favourite bug
    // lives (v1.22's chart buffer, v1.23's Ground readout), and a null cannot
    // be served stale.
    this._mean = null;
    const { width, height } = this.config;
    for (let i = 0; i < this.centres.length; i++) {
      const c = this.centres[i];
      const d = this.driftDirs[i];
      c.x = ((c.x + d.x * driftPerTick) % width + width) % width;
      c.y = ((c.y + d.y * driftPerTick) % height + height) % height;
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
 * Mean fertility under a set of points, minus the mean fertility of the whole
 * landscape. Positive means the things counted are standing on better ground
 * than scattering them at random would give — the signature of the biomes
 * actually concentrating something.
 *
 * In [floor − mean, 1 − mean], so it is an absolute displacement along the same
 * 0..1 fertility scale `at()` returns, exactly as `groundBias` is a
 * displacement along the roughness scale. Not a ratio: the ceiling moves with
 * the seed (it is `1 − mean()`, and where the four biomes fell decides that),
 * so a percentage-of-maximum would be measured against a different maximum in
 * every world.
 *
 * Exactly 0 with no field and exactly 0 with nothing to count, and — measured,
 * not by construction — 0 to three decimals in a world with `foodPatches` off,
 * which is the v1.20 control this statistic turns out to be owed after all.
 * v1.67 filed the biomes as the one noun here with no flag behind it; the flag
 * is `foodPatches` and has been in the panel since v1.3, named after what it
 * does to the food rather than after the field it consults. Two further zeroes
 * are available and both are structural rather than evidential: `patchFloor: 1`
 * flattens the landscape so every point *is* the mean, and any set of points
 * scattered uniformly reads ~0 whatever the pond is doing (v1.27's arm).
 *
 * @param {FertilityField|null|undefined} fertility
 * @param {Array<{x:number,y:number}>} points
 * @returns {number}
 */
export function patchBias(fertility, points) {
  if (!fertility || points.length === 0) return 0;
  let sum = 0;
  for (const p of points) sum += fertility.at(p.x, p.y);
  return sum / points.length - fertility.mean();
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

/**
 * Vision-radius multiplier for the day/night cycle, in [nightVisionFactor, 1]:
 * 1 at high noon, nightVisionFactor at the deepest night, moving between them
 * on a smooth cosine "day" so there's no discontinuity at dawn or dusk.
 * Deterministic in `tick` (no wall-clock time), so day/night doesn't break
 * reproducibility. Returns a constant 1 whenever `dayNightCycle` is off, so
 * callers can multiply by it unconditionally without branching, and default
 * worlds stay exactly as they were before this existed.
 * @param {number} tick
 * @param {object} config
 */
export function dayNightVisionFactor(tick, config) {
  if (!config.dayNightCycle) return 1;
  const phase = (2 * Math.PI * tick) / config.dayLength;
  const daylight = (Math.cos(phase) + 1) / 2; // 1 at noon (tick 0), 0 at midnight
  return config.nightVisionFactor + (1 - config.nightVisionFactor) * daylight;
}

/**
 * A 0..1 "how light is it" value for display: 1 at high noon, 0 at the deepest
 * night, 0.5 at dawn and dusk. Purely cosmetic — like seasonPhase, it reports
 * the shape of the cycle regardless of whether the feature is switched on, and
 * callers decide whether to show it.
 * @param {number} tick
 * @param {object} config
 */
export function dayNightPhase(tick, config) {
  return (Math.cos((2 * Math.PI * tick) / config.dayLength) + 1) / 2;
}
