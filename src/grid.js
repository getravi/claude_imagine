// grid.js — a spatial hash grid for fast neighbour queries on a torus.
//
// Each tick, every creature asks "what's the nearest food?" and "what's the
// nearest creature?". Doing that by scanning every other entity is O(n^2) and
// falls apart past a few hundred agents. Instead we bucket entities into cells
// of a coarse grid; a query only inspects its own cell and the eight around it.
// On a torus the neighbourhood wraps, so cell indices are taken modulo the grid
// dimensions.
//
// The 3x3 block covers *at most* a disc of `cellSize` around the query point,
// and past that the answer depends on where in its cell the asker happens to
// stand. What it **guarantees** is smaller, and for four releases this comment
// said otherwise: `cellSize` rarely divides the world, so the last column and
// row are stubs, and the block's promise from anywhere is the width of the
// narrowest neighbouring cell — 18 px in the default pond's cells of 126. See
// `src/reach.js`, which computes it and audits every rule against it, and
// docs/SCIENCE.md, where v1.32 measured the same seam for sight. When a radius
// asked for is larger than that, `forEachNear` is not an approximation of
// anything, which is why `forEachWithin` exists.

/**
 * The cell size a world of this config indexes at.
 *
 * Lives here rather than in `config.js` because it is derived, and it is
 * exported rather than inlined at its one call site in `world.js` because
 * `reach.js` audits contact rules against it — two copies of this expression
 * would be two things to keep in step. Note what v1.75 found about it: with
 * `exactVision` off the 3x3 block *is* what a creature can find, so this is a
 * term in the physics rather than a tuning knob, and `levers.js` has never
 * swept it because it is not a config key.
 */
export function indexCellSize(config) {
  return Math.max(40, config.visionRadius * 0.75);
}

export class SpatialGrid {
  /**
   * @param {number} width - world width
   * @param {number} height - world height
   * @param {number} cellSize - side length of each bucket
   */
  constructor(width, height, cellSize) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    // One array per cell. Reused across frames; cleared, not reallocated.
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  _index(cx, cy) {
    // Wrap cell coordinates for toroidal topology.
    const x = ((cx % this.cols) + this.cols) % this.cols;
    const y = ((cy % this.rows) + this.rows) % this.rows;
    return y * this.cols + x;
  }

  clear() {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
  }

  /** Insert an item that has numeric .x and .y fields. */
  insert(item) {
    const cx = Math.floor(item.x / this.cellSize);
    const cy = Math.floor(item.y / this.cellSize);
    this.cells[this._index(cx, cy)].push(item);
  }

  /** World-coordinate span [lo, hi) of column `cx`, which may be a stub. */
  _colSpan(cx) {
    return [cx * this.cellSize, Math.min((cx + 1) * this.cellSize, this.width)];
  }

  /** World-coordinate span [lo, hi) of row `cy`, which may be a stub. */
  _rowSpan(cy) {
    return [cy * this.cellSize, Math.min((cy + 1) * this.cellSize, this.height)];
  }

  /**
   * The 3x3 block `forEachNear` will search, as offsets from (x, y). The block
   * is the point's own cell plus the eight around it, so it reaches at least one
   * cell — and at most two — in every direction. Exposed because the block is
   * not a detail when a query radius exceeds `cellSize`: it becomes the *shape
   * of what can be found*, and the renderer draws it.
   *
   * The three columns are contiguous on the torus, so the block is always one
   * rectangle — but its edges are not simply ±cellSize. `cellSize` rarely
   * divides the world (the default pond is 900 x 620 in cells of 126), so the
   * last column and row are stubs, and a point beside the seam has a much
   * shorter reach on that side than a point anywhere else.
   */
  nearBounds(x, y) {
    const cx = Math.min(this.cols - 1, Math.floor(x / this.cellSize));
    const cy = Math.min(this.rows - 1, Math.floor(y / this.cellSize));
    const [x0, x1] = this._colSpan(cx);
    const [y0, y1] = this._rowSpan(cy);
    const [lx0, lx1] = this._colSpan((cx - 1 + this.cols) % this.cols);
    const [rx0, rx1] = this._colSpan((cx + 1) % this.cols);
    const [ty0, ty1] = this._rowSpan((cy - 1 + this.rows) % this.rows);
    const [by0, by1] = this._rowSpan((cy + 1) % this.rows);
    return {
      left: x0 - x - (this.cols > 1 ? lx1 - lx0 : 0),
      right: x1 - x + (this.cols > 1 ? rx1 - rx0 : 0),
      top: y0 - y - (this.rows > 1 ? ty1 - ty0 : 0),
      bottom: y1 - y + (this.rows > 1 ? by1 - by0 : 0),
    };
  }

  /**
   * Invoke `fn(item)` for every item in the 3x3 block of cells around (x, y).
   * Callers do their own precise distance test; the grid only narrows the
   * candidate set. `fn` may return `true` to stop early.
   *
   * **This only finds everything within the narrowest neighbouring cell** —
   * 18 px in the default pond, not the 126 of `cellSize`, because the last
   * column is a stub (`blockReach` in `src/reach.js` computes it). A query for
   * anything farther away is answered by a grid-aligned, position-dependent
   * subset of the disc it asked for — see `forEachWithin`, which takes the
   * radius it is meant to cover.
   */
  forEachNear(x, y, fn) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = this.cells[this._index(cx + dx, cy + dy)];
        for (let i = 0; i < bucket.length; i++) {
          if (fn(bucket[i]) === true) return;
        }
      }
    }
  }

  /**
   * Invoke `fn(item)` for every item in every cell that overlaps the disc of
   * `radius` around (x, y) — so nothing within `radius` can be missed, whatever
   * the cell size. Cells whose nearest corner is beyond the radius are skipped,
   * which keeps the candidate set close to the disc rather than the bounding
   * box. Callers still do their own precise distance test. `fn` may return
   * `true` to stop early.
   */
  forEachWithin(x, y, radius, fn) {
    const r2 = radius * radius;
    // Which columns and rows the disc reaches, as a starting index and a count,
    // walked with a wrap so no cell is ever visited twice. Ranges are worked out
    // in *world coordinates* rather than in cell indices, because the two do not
    // agree at the seam when the cell size doesn't divide the world.
    const nx = this._runLength(radius, this.width, this.cols);
    const ny = this._runLength(radius, this.height, this.rows);
    const x0 = this._runStart(x, radius, this.width, this.cols, nx);
    const y0 = this._runStart(y, radius, this.height, this.rows, ny);

    for (let j = 0; j < ny; j++) {
      const cy = (y0 + j) % this.rows;
      const [ry0, ry1] = this._rowSpan(cy);
      const gy = torusGap(y, ry0, ry1, this.height);
      if (gy > radius) continue;
      for (let i = 0; i < nx; i++) {
        const cx = (x0 + i) % this.cols;
        const [cx0, cx1] = this._colSpan(cx);
        const gx = torusGap(x, cx0, cx1, this.width);
        if (gx * gx + gy * gy > r2) continue; // corner cell, entirely out of reach
        const bucket = this.cells[cy * this.cols + cx];
        for (let k = 0; k < bucket.length; k++) {
          if (fn(bucket[k]) === true) return;
        }
      }
    }
  }

  /** How many cells along one axis a disc of `radius` can reach, capped at all. */
  _runLength(radius, extent, count) {
    if (2 * radius >= extent) return count;
    // Two cells more than the radius spans: one for the partial cell at each end.
    return Math.min(count, Math.ceil((2 * radius) / this.cellSize) + 2);
  }

  /** The first cell index of that run, so the run is centred on `v`. */
  _runStart(v, radius, extent, count, n) {
    if (n >= count) return 0;
    const lo = ((((v - radius) % extent) + extent) % extent) / this.cellSize;
    return Math.min(count - 1, Math.floor(lo));
  }
}

/**
 * Distance from `v` to the span [lo, hi] on a circle of circumference `extent`;
 * 0 when `v` is inside it. Both wrapped images of the span are considered, so
 * a cell at the far end of the world is correctly reported as adjacent.
 */
function torusGap(v, lo, hi, extent) {
  const a = gap(v, lo, hi);
  if (a === 0) return 0;
  return Math.min(a, gap(v, lo + extent, hi + extent), gap(v, lo - extent, hi - extent));
}

/** Distance from `v` to the interval [lo, hi]; 0 when it is inside. */
function gap(v, lo, hi) {
  if (v < lo) return lo - v;
  if (v > hi) return v - hi;
  return 0;
}
