// grid.js — a spatial hash grid for fast neighbour queries on a torus.
//
// Each tick, every creature asks "what's the nearest food?" and "what's the
// nearest creature?". Doing that by scanning every other entity is O(n^2) and
// falls apart past a few hundred agents. Instead we bucket entities into cells
// of a coarse grid; a query only inspects its own cell and the eight around it.
// On a torus the neighbourhood wraps, so cell indices are taken modulo the grid
// dimensions.

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

  /**
   * Invoke `fn(item)` for every item in the 3x3 block of cells around (x, y).
   * Callers do their own precise distance test; the grid only narrows the
   * candidate set. `fn` may return `true` to stop early.
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
}
