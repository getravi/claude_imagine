// detritus.js — the ground remembers where things died.
//
// Twenty-six versions of this world handed out food from nowhere. v1.18 made the
// crop conditional on itself (pellets seed from pellets) and v1.23 made it
// conditional on the ground (ridges are barren), but the *source* was never
// questioned: pellets arrive at a rate, and where a creature died had no bearing
// on anything ever again. Death was the one event in this pond with no
// consequence for the pond.
//
// Detritus closes that loop. A body leaves nutrient in the ground under it; the
// nutrient decays; and a share of the pellets that used to appear from nowhere
// instead sprout out of it, drawing the nutrient down as they go. The crop stops
// being a rate and becomes an inheritance.
//
// Three properties are worth naming, because they are what make it safe and what
// make it interesting:
//
//   1. **It is the resource that moves, not the mortality.** v1.23 built a
//      spatial *cost* and measured it moving the population by -0.003: a
//      creature crosses this world a dozen times per lifetime, so a local death
//      rate averages away before selection can see it. Where the food is does
//      not average away. Detritus is deliberately built on the half of terrain
//      that worked.
//   2. **Total influx is unchanged.** A sprouted pellet is a pellet that would
//      have appeared anyway, somewhere else — the same contract the biomes have
//      kept since v1.3 and terrain since v1.23. Detritus moves the crop; it does
//      not enlarge it.
//   3. **Nothing exists when the feature is off.** The field is null in every
//      world without it, so not one branch is taken and not one random number is
//      drawn. See `test/detritus.test.js`.
//
// Unlike terrain, this field is not static: it is the only thing in this world
// that is a *record of what has happened here*, which is why it is the first
// mechanic whose map is worth watching change.

/**
 * Target cell size in world pixels. Thirty is a little under a creature's vision
 * radius divided by five: coarse enough that a single death makes a patch a
 * forager could actually aim at, fine enough that a crash's footprint has a
 * shape rather than being "the left half of the pond".
 */
const TARGET_CELL = 30;

/**
 * Nutrient below this is treated as none at all. Without it a decayed cell
 * approaches zero without ever arriving, so the pond would technically remember
 * every death it ever had, in quantities no pellet could ever be fed by.
 */
const EPSILON = 1e-9;

/** Positive modulo, for wrapping a coordinate onto the torus. */
function wrap(v, n) {
  const r = v % n;
  return r < 0 ? r + n : r;
}

/**
 * A decaying map of nutrient over the torus, in cells.
 *
 * Deliberately *not* interpolated, unlike `TerrainField`: a cell is a patch of
 * enriched ground, and a pellet either sprouts in it or does not. Interpolation
 * would buy smoothness the simulation cannot use (the renderer gets its own,
 * from the canvas) at the cost of making "which cell fed this pellet" a
 * question with no exact answer.
 */
export class DetritusField {
  /** @param {object} config */
  constructor(config) {
    this.config = config;
    this.cols = Math.max(1, Math.round(config.width / TARGET_CELL));
    this.rows = Math.max(1, Math.round(config.height / TARGET_CELL));
    // Derived, so the cells tile the world exactly — every point in the pond is
    // in exactly one cell, with no gap at the seam and no cell counted twice.
    this.cellW = config.width / this.cols;
    this.cellH = config.height / this.rows;
    /** @type {Float64Array} nutrient in each cell, capped at `detritusFull` */
    this.cells = new Float64Array(this.cols * this.rows);
    /** Sum of every cell. Kept incrementally, and it is the sprouting budget. */
    this.total = 0;
  }

  /** Which cell holds a point. Wraps, so any coordinate is valid. */
  indexAt(x, y) {
    const i = Math.min(this.cols - 1, Math.floor(wrap(x, this.config.width) / this.cellW));
    const j = Math.min(this.rows - 1, Math.floor(wrap(y, this.config.height) / this.cellH));
    return j * this.cols + i;
  }

  /**
   * Add nutrient at a point. A cell saturates at `detritusFull` — soil holds
   * only so much, and without a cap a slaughter in one biome would own the
   * entire crop for thousands of ticks afterwards.
   * @returns {number} how much was actually taken up (the rest is lost)
   */
  deposit(x, y, amount) {
    if (!(amount > 0)) return 0;
    const k = this.indexAt(x, y);
    const before = this.cells[k];
    const after = Math.min(this.config.detritusFull, before + amount);
    this.cells[k] = after;
    this.total += after - before;
    return after - before;
  }

  /** Nutrient richness under a point, 0..1 — the cell's fill of `detritusFull`. */
  at(x, y) {
    const full = this.config.detritusFull;
    return full > 0 ? this.cells[this.indexAt(x, y)] / full : 0;
  }

  /** Richness of cell (i, j), 0..1. For the renderers, which walk the grid. */
  richness(i, j) {
    const full = this.config.detritusFull;
    return full > 0 ? this.cells[j * this.cols + i] / full : 0;
  }

  /** Mean richness over the whole field, 0..1. */
  meanRichness() {
    const full = this.config.detritusFull;
    if (!(full > 0)) return 0;
    return this.total / (this.cells.length * full);
  }

  /**
   * One tick of rot: every cell keeps `detritusDecay` of what it held. This is
   * how long the ground remembers — the half-life is
   * `ln 2 / -ln(detritusDecay)` ticks — and it is what stops the pond becoming
   * uniformly fertile after a few thousand deaths.
   *
   * The total is recomputed from the cells rather than scaled, so it stays the
   * exact sum of what is there however many ticks have passed.
   */
  decay() {
    const keep = this.config.detritusDecay;
    let sum = 0;
    for (let k = 0; k < this.cells.length; k++) {
      const v = this.cells[k] * keep;
      const w = v < EPSILON ? 0 : v;
      this.cells[k] = w;
      sum += w;
    }
    this.total = sum;
  }

  /**
   * Choose a point for a pellet growing out of the dead, and charge the ground
   * for it. Cells are weighted by their nutrient, so the richest ground grows
   * the most — but the weight is the capped value, so no single cell can run
   * away with the crop.
   *
   * Returns null when the ground the seed landed on is too thin to feed it
   * (`detritusUptake`), and the caller then spawns the pellet the old way. That
   * is the whole reason influx is preserved: a refusal here costs the pond
   * nothing but the *placement* of one pellet.
   *
   * Draws exactly three random numbers, and only ever runs with the feature on.
   *
   * @param {import('./rng.js').RNG} rng
   * @returns {{x:number, y:number}|null}
   */
  sprout(rng) {
    if (this.total <= 0) return null;
    // Weighted pick: walk the cumulative nutrient until the dart lands.
    let dart = rng.float() * this.total;
    let k = -1;
    let last = -1;
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.cells[i];
      if (v <= 0) continue;
      last = i;
      dart -= v;
      if (dart < 0) {
        k = i;
        break;
      }
    }
    // Floating-point insurance: if the running total rounded a hair below
    // `this.total`, the dart can outlast the walk. The last cell holding
    // anything is the right answer, not an error.
    if (k < 0) k = last;
    if (k < 0) return null;

    const uptake = this.config.detritusUptake;
    if (this.cells[k] < uptake) return null; // too thin to grow anything
    this.cells[k] -= uptake;
    this.total -= uptake;

    const i = k % this.cols;
    const j = (k - i) / this.cols;
    // Somewhere inside the cell, so a patch grows a scatter of pellets rather
    // than a stack of them on one pixel.
    return { x: (i + rng.float()) * this.cellW, y: (j + rng.float()) * this.cellH };
  }
}
