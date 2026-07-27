// terrain.js — the pond stops being flat.
//
// For twenty-two versions space was the world's last unconditional gift: a
// creature could be anywhere and it cost exactly the same to be there. Food had
// biomes, time had seasons and a day, but the *ground* was uniform, and a
// uniform thing doesn't read as a rule — it reads as the floor.
//
// Terrain is a static roughness landscape over the torus. It blocks nothing and
// nothing can perceive it. Rough ground costs more to cross, and — the half
// that turned out to matter — it grows less: pellets are less likely to take on
// a ridge than in a basin (see food.js `_takes`).
//
// Both halves were built. Only one of them works. A pure movement tax moves the
// population by -0.003 on a scale where the mechanic as shipped moves it by
// -0.057, because a creature crosses this world in a few hundred ticks and
// lives for thousands: it samples the whole map many times over, so a local
// mortality difference averages clean away long before selection can act on it.
// Where the *food* is does not average away. The control that found this, and
// the sweep behind the constants, are written up in docs/SCIENCE.md.
//
// Two properties matter as much as the mechanic:
//
//   1. **No randomness.** The landscape is derived from the seed by an integer
//      hash and a handful of cosines, not from the world RNG. Switching terrain
//      on therefore draws zero numbers and cannot shift the stream by a single
//      draw — the strongest form of the determinism guarantee in this project.
//   2. **Exactly periodic.** Every component uses an integer number of
//      wavelengths across the width and the height, so the field meets itself
//      at the seam. A creature crossing the edge sees the ground it was already
//      standing on. This world has been a torus since v1.0 and a landscape with
//      a visible seam would be the first thing to admit it.

/** Number of cosine components summed to make a landscape. */
const COMPONENTS = 5;
/** Largest number of wavelengths any one component may fit across the world. */
const MAX_WAVENUMBER = 3;
/** Lookup grid resolution. Cells land at roughly 7px on the default 900x620. */
const COLS = 128;
const ROWS = 88;

/**
 * A 32-bit integer mixer (Thomas Wang's). Pure, portable and — importantly for
 * this project — identical on every engine, because it is all integer ops.
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

/** Positive modulo, for wrapping a coordinate onto the torus. */
function wrap(v, n) {
  const r = v % n;
  return r < 0 ? r + n : r;
}

/**
 * A smooth, seed-derived roughness field on the torus, in [0, 1].
 *
 * The field is a sum of cosines evaluated once onto a lookup grid; `at()`
 * bilinearly interpolates that grid. Sampling first and interpolating after is
 * not only faster than evaluating five cosines per creature per tick — it also
 * makes the normalisation *exact*, because bilinear interpolation is monotone
 * between its nodes, so the extremes of the continuous field are the extremes
 * of the node set. The field really does reach 0 and 1, and never exceeds them.
 */
export class TerrainField {
  /** @param {object} config */
  constructor(config) {
    this.config = config;
    this.cols = COLS;
    this.rows = ROWS;

    // Component wavenumbers and phases, drawn from the seed by hashing rather
    // than from the world RNG — see the note at the top of this file.
    const seed = (config.seed | 0) ^ 0x5eed7e44;
    const parts = [];
    for (let i = 0; i < COMPONENTS; i++) {
      const h = hash32(seed + i * 0x9e3779b1);
      const g = hash32(h ^ 0x85ebca6b);
      parts.push({
        // At least one wavelength in x; y may be flat, which gives ridges that
        // run straight across the world instead of only blobs.
        kx: 1 + (h % MAX_WAVENUMBER),
        ky: ((g >>> 3) % (MAX_WAVENUMBER + 1)) * ((g & 1) ? 1 : -1),
        phase: (h / 4294967296) * Math.PI * 2,
        // Later components are finer and quieter, so the landscape has a couple
        // of big basins with texture on top rather than five equal ripples.
        amp: 1 / (1 + i * 0.7),
      });
    }

    // Evaluate onto the grid.
    const n = this.cols * this.rows;
    const raw = new Float64Array(n);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < this.rows; j++) {
      const v = (j / this.rows) * Math.PI * 2;
      for (let i = 0; i < this.cols; i++) {
        const u = (i / this.cols) * Math.PI * 2;
        let s = 0;
        for (const p of parts) s += p.amp * Math.cos(p.kx * u + p.ky * v + p.phase);
        raw[j * this.cols + i] = s;
        if (s < lo) lo = s;
        if (s > hi) hi = s;
      }
    }

    // Normalise to [0, 1] so every seed gets the full contrast — otherwise a
    // seed whose components happened to cancel would be a landscape of nothing.
    const span = hi - lo || 1;
    /** @type {Float64Array} roughness at each grid node, 0 (flat) .. 1 (rough) */
    this.grid = new Float64Array(n);
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const r = (raw[k] - lo) / span;
      this.grid[k] = r;
      sum += r;
    }
    // Mean roughness of the *continuous* field, not just of the nodes: on a
    // periodic grid every bilinear basis function integrates to exactly one
    // cell, so the node average is the field average with no error term. This
    // is the baseline the "Ground" readout is measured against.
    this.mean = sum / n;
  }

  /**
   * Roughness under a point, in [0, 1]. Wraps, so any coordinate is valid.
   * @param {number} x
   * @param {number} y
   */
  at(x, y) {
    const { width, height } = this.config;
    const gx = (wrap(x, width) / width) * this.cols;
    const gy = (wrap(y, height) / height) * this.rows;
    const i0 = Math.floor(gx);
    const j0 = Math.floor(gy);
    const fx = gx - i0;
    const fy = gy - j0;
    const i1 = (i0 + 1) % this.cols;
    const j1 = (j0 + 1) % this.rows;
    const a = this.grid[j0 * this.cols + i0];
    const b = this.grid[j0 * this.cols + i1];
    const c = this.grid[j1 * this.cols + i0];
    const d = this.grid[j1 * this.cols + i1];
    const top = a + (b - a) * fx;
    const bot = c + (d - c) * fx;
    return top + (bot - top) * fy;
  }

  /**
   * The movement-cost multiplier under a point: 1 on the flattest ground,
   * `terrainRoughCost` on the roughest.
   * @param {number} x
   * @param {number} y
   */
  costFactor(x, y) {
    return 1 + this.at(x, y) * (this.config.terrainRoughCost - 1);
  }
}

/**
 * The cost multiplier under a point in a world that may not have terrain at all.
 *
 * Returns literally `1` when there is no field, which is the cheapest way this
 * project knows to protect determinism: ×1 is exact in IEEE-754, so the call
 * site can multiply unconditionally and a world with terrain off stays
 * bit-for-bit the world every earlier version ran.
 *
 * @param {TerrainField|null|undefined} terrain
 * @param {number} x
 * @param {number} y
 */
export function terrainCostAt(terrain, x, y) {
  return terrain ? terrain.costFactor(x, y) : 1;
}

/**
 * Mean roughness under a set of creatures, minus the mean roughness of the
 * whole landscape. Negative means the population is sitting on flatter ground
 * than chance would give it — the signature of terrain actually selecting.
 *
 * Exactly 0 when there is no terrain, which is the point: a statistic that is
 * non-zero with the mechanism switched off is not measuring the mechanism.
 *
 * @param {TerrainField|null|undefined} terrain
 * @param {Array<{x:number,y:number}>} creatures
 * @returns {number} in [-1, 1]
 */
export function groundBias(terrain, creatures) {
  if (!terrain || creatures.length === 0) return 0;
  let sum = 0;
  for (const c of creatures) sum += terrain.at(c.x, c.y);
  return sum / creatures.length - terrain.mean;
}
