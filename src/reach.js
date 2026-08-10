// reach.js — how far the 3x3 block actually reaches, and which rules ask for
// more than that.
//
// Four places in this repository state the reach of a `forEachNear` query as
// *one cell*:
//
//   * `grid.js`'s own header — "the 3x3 block covers a disc of `cellSize`
//     around the query point, and no more";
//   * `config.js` beside `exactVision` — "covers a guaranteed 126 px (one cell)
//     of the configured 168";
//   * `config.js` beside `signalRadius` — "kept under the spatial grid's cell
//     size ... so the existing 3x3 neighbour query already covers everything in
//     earshot";
//   * `world.js` above the sense radii — "contact tests elsewhere (eating at
//     8px, biting, infection at 22px) are far inside one cell, so the plain 3x3
//     block covers them exactly".
//
// The guarantee is not one cell. `cellSize` rarely divides the world, so the
// last column and row are stubs, and the distance the block is *guaranteed* to
// cover is the width of the narrowest neighbouring cell — 18 px in the default
// pond, against a cell of 126. A factor of seven, in the direction that costs
// something.
//
// v1.32 knew this for *sight*: `docs/SCIENCE.md` names the 18-px stub, measures
// the mean share of the vision disc a creature actually searches at 90.0% and
// the worst standing spot at 51.1%, and draws the dark band down one edge of
// the world. The comment beside the flag says 96% and 86%, which are neither of
// those numbers — the correction never reached the file a person changing the
// constant would read. That is v1.30's lesson (a rule has surfaces too) with
// the surfaces being two files in the same commit.
//
// What nobody has asked in the forty-three releases since is the same question
// about the **contact** rules, which is where a coverage hole is not a blurred
// sense but a rule that silently does not fire. This module asks it. There are
// four rules riding the block, and against a guarantee of 18 px they read:
//
//   | rule      | reach   | margin |
//   | eating    | 11.2 px | +6.8   |
//   | scavenging| 17.0 px | +1.0   |
//   | biting    | 18.0 px | +0.0   |
//   | infection | 22.0 px | −4.0   |
//
// Three hold and one does not, and the third holds by exactly nothing: a bite
// reaches `bodyRadiusMax * 2 + 2`, which is 18.0 because `bodyRadiusMax` is 8.0
// and the stub is 18 px, and those two numbers have never been in the same
// sentence before this one.
//
// The one that fails is infection, and it fails in a way `exactVision` cannot
// reach: eating, scavenging and biting all take their candidate from the sense
// scan, so switching that flag on moves them onto a disc query that covers
// them. `_stepDisease` calls `forEachNear` directly — it is the only rule in
// the pond with a neighbour query of its own — so it is block-shaped in every
// world there is. Measured over eight seeds of 3,000 ticks with contagion on,
// **7 of 26,555 susceptible contacts are lost** — one roll in 3,800, on two
// seeds of eight (see docs/SCIENCE.md). Real, and small enough that the
// measurement is what decides not to fix it this cycle. v1.56's `_separate` is
// the counter-example that shows the fix, having used `forEachWithin` from the
// day it landed on the stated grounds that what two bodies touching means
// cannot depend on a sight setting.
//
// Nothing in the simulation reads anything here, this draws no randomness, and
// it is not imported by `main.js` — like `levers.js`, `dimensions.js` and
// `workload.js` it is an instrument the suite points at the pond, not a part of
// it. Fixing the hole it finds is a separate cycle: the disease scan is inside
// the RNG's draw order, so covering the disc moves every world with contagion
// switched on, and that is a change to write down before it is a change to
// make.

import { SpatialGrid, indexCellSize } from "./grid.js";

/**
 * The world-coordinate extent of every column and every row of `grid`.
 *
 * All but the last are `cellSize`; the last is whatever is left over, which is
 * the whole subject of this module. Returned as plain arrays because the
 * arithmetic below is about *neighbours*, and a neighbour of the first column
 * is the last one.
 * @param {SpatialGrid} grid
 */
export function cellSpans(grid) {
  const cols = [];
  for (let i = 0; i < grid.cols; i++) {
    cols.push(Math.min((i + 1) * grid.cellSize, grid.width) - i * grid.cellSize);
  }
  const rows = [];
  for (let j = 0; j < grid.rows; j++) {
    rows.push(Math.min((j + 1) * grid.cellSize, grid.height) - j * grid.cellSize);
  }
  return { cols, rows };
}

/**
 * The largest disc centred on (x, y) that lies entirely inside the block a
 * `forEachNear` query from there would search.
 *
 * Read straight off `grid.nearBounds`, which is the geometry the renderer draws
 * and the grid's own account of its block — no second implementation to keep in
 * step (v1.32's accelerator rule).
 * @param {SpatialGrid} grid
 */
export function reachAt(grid, x, y) {
  const b = grid.nearBounds(x, y);
  return Math.min(-b.left, b.right, -b.top, b.bottom);
}

/**
 * One axis of the guarantee, from the list of cell extents along it.
 *
 * A query point sits `t` into a cell of width `W` whose neighbours are `wL` and
 * `wR` wide. The block reaches `t + wL` behind it and `(W − t) + wR` ahead, so
 * the disc it can promise from that spot is the smaller of the two. Worst over
 * `t`: at `t = 0` the left reach is exactly `wL`, at `t = W` the right is
 * exactly `wR`, and nowhere is it less — so the guarantee for the whole axis is
 * the **narrowest cell on it**, and it is attained rather than approached (a
 * target at exactly `wL` sits on the far edge of the neighbouring cell, which
 * the block does search). Best over `t` is where the two are equal.
 *
 * Three cells or fewer and the block is every cell on the axis: the query wraps
 * onto itself and the reach is the whole torus, whose greatest distance is half
 * the extent.
 */
function axisReach(spans, extent) {
  const n = spans.length;
  const half = extent / 2;
  if (n <= 3) return { guaranteed: half, best: half, whole: true };
  let guaranteed = Infinity;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const W = spans[i];
    const wL = spans[(i - 1 + n) % n];
    const wR = spans[(i + 1) % n];
    guaranteed = Math.min(guaranteed, wL, wR);
    const balance = Math.min(W, Math.max(0, (W + wR - wL) / 2));
    best = Math.max(best, Math.min(balance + wL, W - balance + wR));
  }
  return {
    guaranteed: Math.min(guaranteed, half),
    best: Math.min(best, half),
    whole: false,
  };
}

/**
 * What the 3x3 block promises, over every standing position in the world.
 *
 * `radius` is the honest form of the sentence four comments in this repository
 * get wrong: **every entity within `radius` is in the block, from anywhere**,
 * and for any larger distance there is somewhere in the pond it is not. `best`
 * is what the same query reaches from the luckiest spot, and the gap between
 * the two is the anisotropy v1.32 found in the pond's sight.
 * @param {SpatialGrid} grid
 */
export function blockReach(grid) {
  const { cols, rows } = cellSpans(grid);
  const x = axisReach(cols, grid.width);
  const y = axisReach(rows, grid.height);
  return {
    radius: Math.min(x.guaranteed, y.guaranteed),
    best: Math.min(x.best, y.best),
    x: x.guaranteed,
    y: y.guaranteed,
    narrowestCol: Math.min(...cols),
    narrowestRow: Math.min(...rows),
    wholeX: x.whole,
    wholeY: y.whole,
  };
}

/** The share of one axis from which a disc of `radius` overflows the block. */
function axisStranded(spans, extent, radius) {
  const n = spans.length;
  if (n <= 3) return 0;
  let stranded = 0;
  for (let i = 0; i < n; i++) {
    const W = spans[i];
    const wL = spans[(i - 1 + n) % n];
    const wR = spans[(i + 1) % n];
    // Behind: `t + wL < radius`. Ahead: `(W − t) + wR < radius`. The two ends
    // can meet in a narrow cell, so the failing length is capped at the cell.
    const behind = Math.min(W, Math.max(0, radius - wL));
    const ahead = Math.min(W, Math.max(0, radius - wR));
    stranded += Math.min(W, behind + ahead);
  }
  return stranded / extent;
}

/**
 * The share of standing positions from which the block does *not* cover a disc
 * of `radius` — the size of the hole, as a fraction of the pond.
 *
 * Positions, not pairs: a query from inside this share loses only the sliver of
 * its disc that hangs past the block, so the share of *contacts* lost is far
 * smaller again — 0.026% of susceptible contacts at `infectionRadius`, against
 * 0.889% of standing positions.
 * @param {SpatialGrid} grid
 */
export function strandedShare(grid, radius) {
  const { cols, rows } = cellSpans(grid);
  const x = axisStranded(cols, grid.width, radius);
  const y = axisStranded(rows, grid.height, radius);
  return { x, y, any: 1 - (1 - x) * (1 - y) };
}

/**
 * Every distance this world asks a neighbour query for, and which query answers
 * it.
 *
 * `block` is `forEachNear` — the 3x3 window, whose promise is `blockReach`.
 * `disc` is `forEachWithin`, which covers whatever radius it is handed and is
 * therefore exempt by construction.
 *
 * The `contact` rules are the ones where a missed candidate means a rule that
 * did not fire: a meal not eaten, a bite not taken, an exposure that did not
 * happen. The `sense` rules are v1.32's subject — there a missed candidate
 * means a creature saw the second-nearest pellet, which is a blurred sense
 * rather than a broken rule, and `exactVision` is the switch for it. Both are
 * listed so the domain is stated rather than assumed (v1.61), and because the
 * three contact rules that ride the sense scan change query with that flag
 * while infection does not.
 *
 * Reaches are the worst case over bodies: every one of them scales with a
 * creature's radius, and `bodyRadiusMax` is the biggest a creature gets.
 */
export function contactRules(config) {
  const body = config.bodyRadiusMax;
  // Eating, scavenging and biting have no query of their own: the candidate is
  // whatever the sense scan already handed over, so their window is the sense
  // window, and `exactVision` moves all three at once.
  const sensed = config.exactVision ? "disc" : "block";
  return [
    {
      name: "eat",
      kind: "contact",
      query: sensed,
      reach: config.eatRadius + body * 0.4,
      source: "eatRadius + radius * 0.4",
      active: true,
    },
    {
      name: "scavenge",
      kind: "contact",
      query: sensed,
      reach: body + config.scavengeRadius + 6,
      source: "radius + scavengeRadius + 6",
      active: config.scavenging,
    },
    {
      name: "bite",
      kind: "contact",
      query: sensed,
      reach: body * 2 + 2,
      source: "radius + prey.radius + 2",
      active: config.predation,
    },
    {
      name: "infect",
      kind: "contact",
      query: "block",
      reach: config.infectionRadius,
      source: "infectionRadius",
      active: config.disease,
    },
    {
      name: "shove",
      kind: "contact",
      query: "disc",
      reach: body * 2,
      source: "bodyRadiusMax * 2",
      active: config.bodyCollision,
    },
    {
      name: "sight",
      kind: "sense",
      query: sensed,
      reach: config.visionRadius,
      source: "visionRadius",
      active: true,
    },
    {
      name: "earshot",
      kind: "sense",
      query: sensed,
      reach: config.signalRadius,
      source: "signalRadius",
      active: config.signalling,
    },
    {
      name: "mate",
      kind: "sense",
      query: sensed,
      reach: config.mateRadius,
      source: "mateRadius",
      active: config.sexualReproduction,
    },
  ];
}

/**
 * The audit: this world's index, its guarantee, and every rule measured against
 * it.
 *
 * A rule is `covered` when the query answering it cannot miss anything it is
 * entitled to — always true of a `disc` query, and true of a `block` query only
 * while its reach is inside the guarantee. `margin` is how much room is left,
 * and a margin of zero is a passing rule that any change to the pond's size,
 * its vision radius or its bodies can turn into a failing one.
 * @param {object} config
 */
export function contactAudit(config) {
  const cellSize = indexCellSize(config);
  const grid = new SpatialGrid(config.width, config.height, cellSize);
  const reach = blockReach(grid);
  const rules = contactRules(config).map((rule) => {
    const blocked = rule.query === "block";
    const covered = !blocked || rule.reach <= reach.radius;
    return {
      ...rule,
      guarantee: reach.radius,
      margin: blocked ? reach.radius - rule.reach : Infinity,
      covered,
      stranded: blocked ? strandedShare(grid, rule.reach).any : 0,
    };
  });
  return {
    cellSize,
    cols: grid.cols,
    rows: grid.rows,
    reach,
    rules,
    // The verdict, over the rules this world has actually switched on. Senses
    // are excluded: a clipped sense is v1.32's known, measured, opt-out-able
    // approximation, while a clipped contact rule is one that does not fire.
    uncovered: rules.filter((r) => r.active && r.kind === "contact" && !r.covered),
  };
}
