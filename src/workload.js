// workload.js — what the senses actually cost, counted off the index.
//
// `docs/AUTONOMOUS.md` has carried a sentence about this project's performance
// for several releases: *the tick's time goes mostly into the two neighbour
// scans and the closure per creature per query they each allocate*. Half of
// that is a measurement nobody had taken and half of it is a guess, which is
// v1.28's rule — a comment is not a measurement — pointed at the one part of
// this repo that has never been instrumented at all.
//
// A stopwatch is the obvious instrument and it is the wrong one: a wall-clock
// number is a fact about the machine that ran it, so no test can assert it and
// no future self can compare against it. What *is* a property of the world is
// the **work**: how many index queries a tick makes, and how many candidates
// those queries are offered. That number is deterministic, it is the thing the
// time is spent on, and it can be counted before the tick runs — the index is
// already built and the queries are already decided.
//
// So this module predicts a tick's sensing work from the state of the index,
// and it counts by *running the grid's own loops* with a callback that only
// increments. Nothing here re-implements `forEachNear`'s geometry, which is the
// v1.32 rule about accelerators applied to a measurement: an instrument that
// paraphrases the thing it measures is a second implementation to keep in step,
// and this one cannot drift because it calls the original.
//
// What it found, on the default pond (see docs/SCIENCE.md):
//
//   * The 3x3 block is **22.5%** of a 900x620 pond in cells of 126, so the
//     index narrows a query by **3.99x** — a constant fraction of the
//     world, not a neighbourhood. Sensing is still quadratic in population and
//     the grid moves the constant, not the exponent.
//   * The number that sets it is `visionRadius * 0.75`, floored at 40, written
//     in `world.js` and not in `config.js` — so `levers.js`, which sweeps every
//     constant in the config, has never seen it. And it is not a performance
//     knob: with `exactVision` off (the default) the block *is* the definition
//     of what a creature can find, so changing it moves every world.
//
// Nothing in the simulation reads anything here, this draws no randomness, and
// it is not imported by `main.js` — like `levers.js` and `dimensions.js` it is
// an instrument the suite points at the pond, not a part of it.

import { SpatialGrid } from "./grid.js";

/**
 * The shape of one grid's index: how many cells it has and what share of them
 * a `forEachNear` query can reach.
 *
 * `blockShare` is the geometric ideal — nine cells out of however many exist,
 * before anything is known about where the entities are. The *measured* share
 * is `visits / brute` below, which weights each cell by what is standing in it.
 * @param {import('./grid.js').SpatialGrid} grid
 */
export function indexGeometry(grid) {
  const cells = grid.cols * grid.rows;
  const block = Math.min(3, grid.cols) * Math.min(3, grid.rows);
  return {
    cols: grid.cols,
    rows: grid.rows,
    cellSize: grid.cellSize,
    cells,
    blockCells: block,
    blockShare: block / cells,
  };
}

/** Candidates a `forEachNear` query at (x, y) would be offered. */
function nearLoad(grid, x, y) {
  let n = 0;
  grid.forEachNear(x, y, () => {
    n++;
  });
  return n;
}

/** Candidates a `forEachWithin` query at (x, y) would be offered. */
function withinLoad(grid, x, y, radius) {
  let n = 0;
  grid.forEachWithin(x, y, radius, () => {
    n++;
  });
  return n;
}

/**
 * A copy of one of the world's grids, filled from where the entities are *now*.
 *
 * Step 1 clears and rebuilds the index at the top of every tick, so the index a
 * tick queries is not the one sitting in the world between ticks — that one
 * still holds the positions everybody had before the last sweep moved them.
 * Rebuilding here rather than reading is the difference between predicting the
 * coming tick and describing the last one. A fresh grid rather than the world's
 * own, because an observer that leaves a world different from how it found it
 * is not an observer.
 * @param {import('./grid.js').SpatialGrid} like
 * @param {Array<{x:number,y:number}>} items
 */
function indexOf(like, items) {
  const g = new SpatialGrid(like.width, like.height, like.cellSize);
  for (let i = 0; i < items.length; i++) g.insert(items[i]);
  return g;
}

function tally() {
  return { queries: 0, visits: 0, brute: 0 };
}

/**
 * The sensing work the *next* tick will do, counted from where everything
 * stands now.
 *
 * Call it on a world that has stepped at least once: the grids are rebuilt at
 * step 1 from the positions the creatures currently hold, so the index this
 * reads is the index that tick will query, and a creature senses from the place
 * it is standing before it moves.
 *
 * **The domain, and it is exactly two exclusions.** This counts every query
 * made against the index built at step 1 — the contagion pass and the three
 * sense scans of the sweep. It does not count:
 *
 *   * `_separate()` (`bodyCollision`, opt-in), which builds a *second* index
 *     halfway through the tick out of positions nothing can know in advance.
 *     With that rule on, the real count is higher than this one.
 *   * a turn cancelled mid-tick by `deathIsFinal` (opt-in), where a creature
 *     bitten to zero by an earlier hunter never scans at all. With that rule
 *     on, the real count is lower than this one.
 *
 * Both are off by default, both bounds are asserted in `test/workload.test.js`,
 * and outside them this is exact rather than approximate.
 *
 * @param {import('./world.js').World} world
 * @returns {{queries:number, visits:number, brute:number, narrowing:number,
 *            perCreature:number, creatures:number,
 *            byGrid:{food:object, creature:object, corpse:object}}}
 */
export function sensingWorkload(world) {
  const cfg = world.config;
  const exact = !!cfg.exactVision;
  const food = tally();
  const creature = tally();
  const corpse = tally();

  // The two radii the sweep works out for itself, reproduced here because they
  // are what the queries are made with. Only read when `exactVision` is on —
  // the default path ignores the radius entirely and takes the 3x3 block.
  const sightR = cfg.visionRadius * world.visionFactor;
  const nearbyR = Math.max(
    sightR,
    cfg.signalling ? cfg.signalRadius : 0,
    cfg.sexualReproduction ? cfg.mateRadius : 0
  );

  const foodGrid = indexOf(world.foodGrid, world.food.items);
  const creatureGrid = indexOf(world.creatureGrid, world.creatures);
  const corpseGrid = indexOf(world.corpseGrid, cfg.scavenging ? world.corpses : []);
  const foodItems = world.food.items.length;
  const creatureItems = world.creatures.length;
  const corpseItems = cfg.scavenging ? world.corpses.length : 0;

  const add = (t, grid, items, x, y, radius) => {
    t.queries++;
    t.visits += exact && radius !== null ? withinLoad(grid, x, y, radius) : nearLoad(grid, x, y);
    t.brute += items;
  };

  // 1b. Contagion, before anything moves. Always the plain block: what an
  // infection can reach is a contact test, not a sense (see `world.js`).
  if (cfg.disease) {
    for (const c of world.creatures) {
      if (c.infected) add(creature, creatureGrid, creatureItems, c.x, c.y, null);
    }
  }

  // 2. Sense. Every creature scans for food and for neighbours; a carnivore in
  // a scavenging world also scans for carrion.
  for (const c of world.creatures) {
    add(food, foodGrid, foodItems, c.x, c.y, sightR);
    add(creature, creatureGrid, creatureItems, c.x, c.y, nearbyR);
    if (cfg.scavenging && c.carnivory >= cfg.carnivoreThreshold) {
      add(corpse, corpseGrid, corpseItems, c.x, c.y, sightR);
    }
  }

  const queries = food.queries + creature.queries + corpse.queries;
  const visits = food.visits + creature.visits + corpse.visits;
  const brute = food.brute + creature.brute + corpse.brute;
  const n = world.creatures.length;
  return {
    queries,
    visits,
    brute,
    // What the index is worth, as a factor: the candidates the same questions
    // would have been offered with no index at all, over the ones they are.
    // Occupancy-weighted, so an empty neighbourhood counts for nothing — which
    // is why this is the honest version of `blockShare` and not its reciprocal.
    narrowing: visits > 0 ? brute / visits : 0,
    perCreature: n > 0 ? visits / n : 0,
    creatures: n,
    byGrid: { food, creature, corpse },
  };
}
