// Tests for the work census (v1.75) — what does a tick's sensing actually cost?
//
// This project has never measured its own performance. It has *described* it:
// `docs/AUTONOMOUS.md` said the tick's time goes mostly into the two neighbour
// scans and the closure each one allocates per creature per query, and a note
// in `world.js` said the grid's cells are sized "so each cell is about one
// vision radius across — that keeps the 3x3 query window a good match for what
// a creature can actually see". Both are comments, and v1.28's rule is that a
// comment is not a measurement.
//
// `src/workload.js` is the measurement, and what it counts is *work* rather
// than time: a wall-clock number is a fact about the machine that produced it
// and no test can hold it, while the number of candidates a tick's queries are
// offered is a property of the world and holds forever. What these tests pin:
//
//   - **the census is exact**, tick for tick, against a run whose grids have
//     been wrapped to count what really happened — on nine configurations;
//   - **its two exclusions are real and are in the direction the module
//     states**: `bodyCollision` builds a second index mid-tick (the real count
//     is higher) and `deathIsFinal` cancels turns (the real count is lower).
//     Both are asserted as strict inequalities on at least one tick, so a
//     domain statement that has quietly stopped being necessary fails here;
//   - **the narrowing is a constant**, not a neighbourhood: over a 28-fold
//     range of population the index divides the candidate set by a shade over
//     four, and the per-creature cost of the creature scan grows in proportion
//     to the pond. Sensing is quadratic and the grid moves the constant;
//   - **the cell size is part of the world's definition, not a tuning knob**.
//     With `exactVision` off — the default — the 3x3 block *is* what a creature
//     can find, so a grid built at a different cell size runs a different pond.
//     That is the reason `src/levers.js` never saw the number: it lives in
//     `world.js`, not in `config.js`, and it is not a performance parameter.
//
// The wall-clock profile that motivated all this is in docs/SCIENCE.md and is
// deliberately not asserted anywhere.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { SpatialGrid } from "../src/grid.js";
import { trajectoryFingerprint } from "../src/fingerprint.js";
import { sensingWorkload, indexGeometry } from "../src/workload.js";

/**
 * Wrap a world's three grids so every query and every candidate offered is
 * counted. The wrappers delegate, so the pond runs exactly as it would have.
 */
function instrument(world) {
  const seen = { queries: 0, visits: 0 };
  for (const g of [world.creatureGrid, world.foodGrid, world.corpseGrid]) {
    const near = g.forEachNear.bind(g);
    const within = g.forEachWithin.bind(g);
    g.forEachNear = (x, y, fn) => {
      seen.queries++;
      return near(x, y, (it) => {
        seen.visits++;
        return fn(it);
      });
    };
    g.forEachWithin = (x, y, r, fn) => {
      seen.queries++;
      return within(x, y, r, (it) => {
        seen.visits++;
        return fn(it);
      });
    };
  }
  return seen;
}

/**
 * Step a world `ticks` times, comparing the census taken before each tick with
 * what the tick really did. The census is taken *before* instrumenting so its
 * own walk of the grids is never counted — it builds its own index anyway, but
 * a test that relied on that would be testing the wrong thing.
 */
function compare(world, ticks) {
  const seen = instrument(world);
  const rows = [];
  for (let i = 0; i < ticks; i++) {
    const predicted = sensingWorkload(world);
    // The census builds its own index and never touches the world's, so the
    // counters are untouched here — zeroed anyway rather than assumed.
    seen.queries = 0;
    seen.visits = 0;
    world.step();
    rows.push({ predicted, real: { queries: seen.queries, visits: seen.visits } });
  }
  return rows;
}

/** A world of the given config, run far enough in to be doing real work. */
function warmed(over, warm = 120) {
  const w = new World(makeConfig({ ...over }));
  for (let i = 0; i < warm; i++) w.step();
  return w;
}

// Nine worlds: the default, and every opt-in rule that changes which queries
// get made or how far they reach.
const EXACT = [
  ["the default pond", {}],
  ["exact vision", { exactVision: true }],
  ["contagion", { disease: true }],
  ["scavenging", { scavenging: true }],
  ["signalling", { signalling: true }],
  ["sexual reproduction", { sexualReproduction: true }],
  ["the day/night cycle", { dayNightCycle: true }],
  ["opaque rock", { barriers: true, barrierOcclusion: true }],
  ["a shuffled turn order", { shuffleTurnOrder: true }],
];

for (const [label, over] of EXACT) {
  test(`the census predicts every query and every candidate — ${label}`, () => {
    const w = warmed(over);
    const rows = compare(w, 60);
    for (const { predicted, real } of rows) {
      assert.equal(predicted.queries, real.queries);
      assert.equal(predicted.visits, real.visits);
    }
    // Not a vacuous pass: the pond has to have been doing something.
    assert.ok(rows[0].real.visits > 100, "no work to predict");
  });
}

test("the census sums its per-grid tallies and nothing else", () => {
  const w = warmed({ scavenging: true, disease: true });
  const c = sensingWorkload(w);
  const g = c.byGrid;
  assert.equal(c.queries, g.food.queries + g.creature.queries + g.corpse.queries);
  assert.equal(c.visits, g.food.visits + g.creature.visits + g.corpse.visits);
  assert.equal(c.brute, g.food.brute + g.creature.brute + g.corpse.brute);
  assert.equal(c.narrowing, c.brute / c.visits);
  assert.equal(c.perCreature, c.visits / c.creatures);
});

test("the collision pass is outside the domain, and the real count is higher", () => {
  const w = warmed({ bodyCollision: true });
  const rows = compare(w, 40);
  let higher = 0;
  for (const { predicted, real } of rows) {
    assert.ok(real.visits >= predicted.visits, "the second index can only add work");
    if (real.visits > predicted.visits) higher++;
  }
  // The exclusion is not a hedge — it bites on every tick of a pond that has
  // two bodies in it, which is why the module names it rather than rounding.
  assert.equal(higher, rows.length);
});

test("a cancelled turn is outside the domain, and the real count is lower", () => {
  // `deathIsFinal` skips the whole turn of a creature killed earlier in the
  // same tick, so its scans never happen. Rare — 8 ticks in 2,000 on the
  // default seed — so this needs a pond where predation is busy and a run long
  // enough to catch one.
  const w = warmed({ deathIsFinal: true }, 400);
  const rows = compare(w, 600);
  let lower = 0;
  for (const { predicted, real } of rows) {
    assert.ok(real.visits <= predicted.visits, "a cancelled turn cannot add work");
    if (real.visits < predicted.visits) lower++;
  }
  assert.ok(lower > 0, "no turn was ever cancelled — the exclusion is unproven");
});

test("the index narrows by a constant, so sensing stays quadratic", () => {
  // Density is set by how many founders the pond starts with; the census is
  // taken early enough that the crowd is still there.
  const rows = [20, 100, 600].map((populationStart) => {
    const w = warmed({ populationStart }, 40);
    let visits = 0;
    let brute = 0;
    let creatureVisits = 0;
    let pop = 0;
    for (let i = 0; i < 60; i++) {
      const c = sensingWorkload(w);
      visits += c.visits;
      brute += c.brute;
      creatureVisits += c.byGrid.creature.visits;
      pop += c.creatures;
      w.step();
    }
    return { pop: pop / 60, narrowing: brute / visits, share: creatureVisits / pop / (pop / 60) };
  });

  // A twenty-eight-fold range of population, and the index is worth the same
  // factor at both ends: it reaches a fixed *fraction* of the pond, so it is a
  // constant-factor filter and not an index in the asymptotic sense.
  assert.ok(rows[2].pop / rows[0].pop > 25, "the densities are not far enough apart");
  for (const r of rows) {
    assert.ok(r.narrowing > 3.5 && r.narrowing < 4.6, `narrowing ${r.narrowing}`);
  }

  // And the shape underneath it: each creature is offered a fixed share of the
  // pond by the creature scan, so its cost per creature is proportional to the
  // population and the tick's is proportional to its square.
  for (const r of rows) {
    assert.ok(r.share > 0.2 && r.share < 0.3, `block occupancy share ${r.share}`);
  }
});

test("the block is 9 cells of 40 in the default pond", () => {
  const w = new World(makeConfig({}));
  const g = indexGeometry(w.creatureGrid);
  assert.equal(g.cellSize, Math.max(40, DEFAULT_CONFIG.visionRadius * 0.75));
  assert.equal(g.cols, 8);
  assert.equal(g.rows, 5);
  assert.equal(g.blockCells, 9);
  assert.equal(g.blockShare, 9 / 40);
});

test("the cell size is part of the world, not a tuning knob", () => {
  // With `exactVision` off, `forEachNear`'s 3x3 block is the definition of what
  // a creature can find (v1.32). So the factor in `world.js` that sets the cell
  // — `visionRadius * 0.75`, floored at 40 — is a simulation constant living
  // outside `config.js`, where `src/levers.js` cannot see it. Re-sizing the
  // index in either direction runs a different pond.
  const cfg = makeConfig({});
  const run = (factor) => {
    const w = new World(cfg);
    if (factor !== null) {
      const cell = Math.max(40, cfg.visionRadius * factor);
      w.creatureGrid = new SpatialGrid(cfg.width, cfg.height, cell);
      w.foodGrid = new SpatialGrid(cfg.width, cfg.height, cell);
      w.corpseGrid = new SpatialGrid(cfg.width, cfg.height, cell);
    }
    for (let i = 0; i < 300; i++) w.step();
    return trajectoryFingerprint(w);
  };
  const shipped = run(null);
  assert.equal(run(0.75), shipped, "the same cell size must be the same world");
  assert.notEqual(run(0.7), shipped, "a smaller cell is a different world");
  assert.notEqual(run(0.8), shipped, "a larger cell is a different world");
});

test("the census leaves the world exactly as it found it", () => {
  const a = warmed({}, 200);
  const b = warmed({}, 200);
  for (let i = 0; i < 20; i++) {
    sensingWorkload(a);
    a.step();
    b.step();
  }
  assert.equal(trajectoryFingerprint(a), trajectoryFingerprint(b));
});
