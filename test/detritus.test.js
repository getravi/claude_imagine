import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { FoodField, Corpse } from "../src/food.js";
import { DetritusField } from "../src/detritus.js";
import { FertilityField } from "../src/environment.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";

/** A bare food field, with a nutrient field when the config asks for one. */
function field(over = {}) {
  const config = makeConfig({ foodStart: 0, ...over });
  const rng = new RNG(config.seed);
  const fertility = new FertilityField(config, rng);
  const detritus = config.detritus ? new DetritusField(config) : null;
  return new FoodField(config, rng, fertility, null, detritus);
}

/** An empty world: nothing alive, nothing reseeded, so a test controls the deaths. */
function emptyWorld(over = {}) {
  return new World(
    makeConfig({ populationStart: 0, autoReseed: false, foodStart: 0, ...over })
  );
}

// ---- Determinism: the whole point of an opt-in feature ----

test("detritus is off by default, and then does not exist", () => {
  const world = new World(makeConfig({ seed: 5 }));
  assert.equal(world.config.detritus, false);
  assert.equal(world.detritus, null);
  assert.equal(world.food.detritus, null);
});

test("with detritus off, worlds are bit-for-bit unaffected", () => {
  const withFlag = new World(makeConfig({ seed: 21, detritus: false }));
  const withoutFlag = new World(makeConfig({ seed: 21 }));
  for (let i = 0; i < 2500; i++) {
    withFlag.step();
    withoutFlag.step();
  }
  assert.equal(withFlag.creatures.length, withoutFlag.creatures.length);
  assert.equal(withFlag.food.items.length, withoutFlag.food.items.length);
  assert.equal(withFlag.stats.births, withoutFlag.stats.births);
  assert.equal(withFlag.stats.deaths, withoutFlag.stats.deaths);
  for (let i = 0; i < withFlag.creatures.length; i++) {
    assert.equal(withFlag.creatures[i].x, withoutFlag.creatures[i].x);
    assert.equal(withFlag.creatures[i].energy, withoutFlag.creatures[i].energy);
  }
  // The food array is the collection this feature touches, so it is compared
  // pellet by pellet rather than by length (the v1.18 lesson).
  for (let i = 0; i < withFlag.food.items.length; i++) {
    assert.equal(withFlag.food.items[i].x, withoutFlag.food.items[i].x);
    assert.equal(withFlag.food.items[i].y, withoutFlag.food.items[i].y);
  }
});

test("a scavenging world is unaffected too — the corpse gained a field, not a behaviour", () => {
  const a = new World(makeConfig({ seed: 77, scavenging: true }));
  const b = new World(makeConfig({ seed: 77, scavenging: true, detritus: false }));
  for (let i = 0; i < 1800; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.creatures.length, b.creatures.length);
  assert.equal(a.corpses.length, b.corpses.length);
  assert.equal(a.stats.scavenged, b.stats.scavenged);
  for (let i = 0; i < a.corpses.length; i++) {
    assert.equal(a.corpses[i].x, b.corpses[i].x);
    assert.equal(a.corpses[i].energy, b.corpses[i].energy);
  }
});

test("nothing ever sprouts, and no soil is reported, without a field", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 3000; i++) world.step();
  assert.ok(world.food.spawned > 1000, "the pond did spawn food");
  // The control that matters: a statistic that is non-zero with its mechanism
  // off is not measuring the mechanism.
  assert.equal(world.food.sprouted, 0);
  assert.equal(world.stats.soilShare, 0);
});

test("a detritus world is still exactly reproducible from its seed", () => {
  const a = new World(makeConfig({ seed: 99, detritus: true }));
  const b = new World(makeConfig({ seed: 99, detritus: true }));
  for (let i = 0; i < 1500; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.creatures.length, b.creatures.length);
  assert.equal(a.food.sprouted, b.food.sprouted);
  assert.equal(a.detritus.total, b.detritus.total);
  for (let i = 0; i < a.food.items.length; i++) {
    assert.equal(a.food.items[i].x, b.food.items[i].x);
  }
});

// ---- The field's geometry ----

test("the cells tile the world exactly, once each", () => {
  const config = makeConfig({});
  const f = new DetritusField(config);
  assert.equal(f.cellW * f.cols, config.width);
  assert.ok(Math.abs(f.cellH * f.rows - config.height) < 1e-9);
  // Every cell is hit by its own centre, and by nothing else's — walk the cells
  // rather than trusting that the areas add up, because a gap on one side pays
  // for an overlap on the other in any total.
  const seen = new Set();
  for (let j = 0; j < f.rows; j++) {
    for (let i = 0; i < f.cols; i++) {
      const k = f.indexAt((i + 0.5) * f.cellW, (j + 0.5) * f.cellH);
      assert.equal(k, j * f.cols + i);
      assert.ok(!seen.has(k), `cell ${k} claimed twice`);
      seen.add(k);
    }
  }
  assert.equal(seen.size, f.cells.length);
  // And a fine sweep of the whole pond lands inside the grid everywhere,
  // including exactly on the far edges.
  for (let x = 0; x <= config.width; x += 3.7) {
    for (let y = 0; y <= config.height; y += 4.3) {
      const k = f.indexAt(x, y);
      assert.ok(k >= 0 && k < f.cells.length, `(${x},${y}) fell outside the grid`);
    }
  }
});

test("the field wraps: it is a map of a torus", () => {
  const config = makeConfig({});
  const f = new DetritusField(config);
  const here = f.indexAt(12, 15);
  assert.equal(f.indexAt(12 + config.width, 15), here);
  assert.equal(f.indexAt(12, 15 - config.height), here);
  assert.equal(f.indexAt(12 - 3 * config.width, 15 + 2 * config.height), here);
  f.deposit(12, 15, 1);
  assert.ok(f.at(12 + config.width, 15) > 0, "nutrient is where the wrap says it is");
});

// ---- Deposit, decay, uptake ----

test("a cell saturates, and the total is the exact sum of the cells", () => {
  const config = makeConfig({ detritus: true, detritusFull: 4 });
  const f = new DetritusField(config);
  assert.equal(f.deposit(100, 100, 3), 3);
  assert.equal(f.deposit(100, 100, 3), 1); // only the headroom is taken up
  assert.equal(f.at(100, 100), 1);
  assert.equal(f.deposit(100, 100, 99), 0); // full ground takes nothing
  f.deposit(500, 400, 2);
  let sum = 0;
  for (const v of f.cells) sum += v;
  assert.equal(f.total, sum);
  assert.equal(f.total, 6);
  // A negative or zero deposit is a no-op rather than a hole in the ground.
  assert.equal(f.deposit(500, 400, -5), 0);
  assert.equal(f.at(500, 400), 0.5);
});

test("the ground forgets on schedule, and forgets completely", () => {
  const config = makeConfig({ detritus: true, detritusFull: 100, detritusDecay: 0.5 });
  const f = new DetritusField(config);
  f.deposit(100, 100, 8);
  f.decay();
  assert.equal(f.total, 4);
  f.decay();
  assert.equal(f.total, 2);
  for (let i = 0; i < 200; i++) f.decay();
  // Exactly zero, not a vanishing crumb the pond would remember forever.
  assert.equal(f.total, 0);
  assert.equal(f.at(100, 100), 0);
  assert.equal(f.meanRichness(), 0);
});

test("the documented half-life is the one the decay constant gives", () => {
  const config = makeConfig({ detritus: true, detritusFull: 1e9 });
  const f = new DetritusField(config);
  f.deposit(0, 0, 1);
  const halfLife = Math.log(2) / -Math.log(config.detritusDecay);
  for (let i = 0; i < Math.round(halfLife); i++) f.decay();
  assert.ok(Math.abs(f.total - 0.5) < 0.01, `after one half-life: ${f.total}`);
  assert.ok(halfLife > 200 && halfLife < 260, `half-life is ${halfLife} ticks`);
});

test("sprouting charges the ground exactly, and refuses ground too thin to pay", () => {
  const config = makeConfig({ detritus: true, detritusFull: 4, detritusUptake: 1 });
  const f = new DetritusField(config);
  const rng = new RNG(7);
  assert.equal(f.sprout(rng), null, "bare ground grows nothing");
  f.deposit(200, 200, 3.5);
  for (let i = 0; i < 3; i++) {
    const spot = f.sprout(rng);
    assert.ok(spot, "enriched ground grows something");
    assert.equal(f.indexAt(spot.x, spot.y), f.indexAt(200, 200));
  }
  assert.ok(Math.abs(f.total - 0.5) < 1e-12, `three pellets cost three units: ${f.total}`);
  assert.equal(f.sprout(rng), null, "half a unit cannot feed a whole pellet");
  assert.equal(f.total, 0.5, "and a refusal costs the ground nothing");
});

test("richer ground grows more of the crop than poorer ground", () => {
  const config = makeConfig({ detritus: true, detritusFull: 1e6, detritusUptake: 0 });
  const f = new DetritusField(config);
  const rng = new RNG(11);
  f.deposit(100, 100, 300); // three times as rich...
  f.deposit(700, 500, 100);
  let rich = 0;
  const trials = 4000;
  for (let i = 0; i < trials; i++) {
    const spot = f.sprout(rng);
    if (f.indexAt(spot.x, spot.y) === f.indexAt(100, 100)) rich++;
  }
  // ...so it should take about three quarters of the seeds.
  assert.ok(Math.abs(rich / trials - 0.75) < 0.03, `rich cell took ${rich}/${trials}`);
});

// ---- The crop follows the dead ----

test("the crop grows where the nutrient is", () => {
  const enriched = field({ detritus: true, foodPatches: false, detritusDecay: 1 });
  const control = field({ foodPatches: false });
  const cell = enriched.detritus.indexAt(450, 310);
  for (let i = 0; i < 400; i++) {
    enriched.detritus.deposit(450, 310, 4); // kept topped up, as deaths would
    enriched.spawnOne();
    control.spawnOne();
  }
  const inCell = (f) =>
    f.items.filter((p) => f.detritus && f.detritus.indexAt(p.x, p.y) === cell).length;
  const share = inCell(enriched) / enriched.items.length;
  assert.ok(share > 0.6, `only ${(share * 100).toFixed(0)}% of the crop grew on the nutrient`);
  // Control: the same pond with no memory scatters over the whole world, and one
  // cell in six hundred is not where a fifth of the crop lands.
  const controlCell = new DetritusField(control.config).indexAt(450, 310);
  const controlShare =
    control.items.filter(
      (p) => new DetritusField(control.config).indexAt(p.x, p.y) === controlCell
    ).length / control.items.length;
  assert.ok(controlShare < 0.02, `control put ${(controlShare * 100).toFixed(1)}% there`);
});

test("total influx is unchanged: detritus moves the crop, it does not enlarge it", () => {
  const on = field({ detritus: true, detritusDecay: 1 });
  const off = field({});
  for (let i = 0; i < 300; i++) on.detritus.deposit(300, 300, 4);
  for (let i = 0; i < 500; i++) {
    on.spawnOne();
    off.spawnOne();
  }
  assert.equal(on.items.length, off.items.length);
  assert.ok(on.sprouted > 0, "and some of them really did sprout from the dead");
  assert.equal(off.sprouted, 0);
});

test("a body goes into the ground where it fell", () => {
  // No crop at all, so nothing draws the ground back down while we measure it.
  const world = emptyWorld({
    detritus: true,
    detritusFull: 1e6,
    detritusDecay: 1,
    foodSpawnRate: 0,
    seed: 4,
  });
  world.addRandomCreatures(1);
  const victim = world.creatures[0];
  const { x, y, radius } = victim;
  victim.die("starvation");
  world.step();
  assert.equal(world.creatures.length, 0);
  const expected = radius * world.config.detritusPerRadius;
  assert.ok(Math.abs(world.detritus.total - expected) < 1e-9);
  assert.ok(world.detritus.at(x, y) > 0, "and in the cell it died in");
});

test("with scavenging on, a corpse rots into the ground and a stripped one does not", () => {
  const cfg = {
    detritus: true,
    scavenging: true,
    detritusFull: 1e6,
    detritusDecay: 1,
    foodSpawnRate: 0, // as above: measure what the ground receives, undisturbed
  };
  const soil = 5 * makeConfig(cfg).detritusPerRadius;
  const meat = 30;
  const rate = (soil * makeConfig(cfg).corpseDecay) / meat;

  const rots = emptyWorld(cfg);
  rots.corpses.push(new Corpse(300, 300, meat, rate));
  while (rots.corpses.length > 0) rots.step();
  // Left alone, a corpse delivers the body's whole worth — within the one tick's
  // rot that takes it under zero.
  assert.ok(
    Math.abs(rots.detritus.total - soil) < rate + 1e-9,
    `a full rot delivered ${rots.detritus.total} of ${soil}`
  );

  const eaten = emptyWorld(cfg);
  eaten.corpses.push(new Corpse(300, 300, meat, rate));
  for (let i = 0; i < 5; i++) eaten.step();
  eaten.corpses[0].energy = 0; // a scavenger takes the rest
  eaten.step();
  assert.equal(eaten.corpses.length, 0);
  assert.ok(
    eaten.detritus.total < 0.2 * rots.detritus.total,
    `a stripped corpse left ${eaten.detritus.total}, a rotted one ${rots.detritus.total}`
  );
});

// ---- The readout, and the world it describes ----

test("a detritus pond feeds itself, and says by how much", () => {
  const world = new World(makeConfig({ seed: 314, detritus: true }));
  for (let i = 0; i < 4000; i++) world.step();
  assert.ok(world.creatures.length > 0, "the pond must not starve itself out");
  assert.ok(world.food.sprouted > 100, `only ${world.food.sprouted} pellets grew from the dead`);
  assert.ok(world.detritus.total > 0, "and the ground is holding something");
  // The readout is a share, so it lives in [0, 1] and is not the whole crop.
  assert.ok(world.stats.soilShare > 0.05 && world.stats.soilShare <= 1, `${world.stats.soilShare}`);
  const measured = world.food.sprouted / world.food.spawned;
  assert.ok(
    Math.abs(world.stats.soilShare - measured) < 0.25,
    `readout ${world.stats.soilShare} vs run-long share ${measured}`
  );
});

test("switching the feature off clears the pond's memory and its readout", () => {
  const world = new World(makeConfig({ seed: 12, detritus: true }));
  for (let i = 0; i < 1200; i++) world.step();
  assert.ok(world.stats.soilShare > 0);
  world.config.detritus = false;
  world.syncDetritus();
  assert.equal(world.detritus, null);
  assert.equal(world.food.detritus, null);
  world.step();
  // Zeroed on the very next tick rather than left holding the last pond's
  // number — the v1.23 "Ground readout" bug, which is this project's favourite.
  assert.equal(world.stats.soilShare, 0);
  world.config.detritus = true;
  world.syncDetritus();
  assert.equal(world.detritus.total, 0, "and it comes back with no memory, not the old one");
});

test("the chronicle only narrates a pond it watched feed itself", () => {
  // Detritus on, but nothing dies, so nothing can be growing out of the dead.
  const barren = emptyWorld({ detritus: true, seed: 8 });
  for (let i = 0; i < 2000; i++) barren.step();
  assert.equal(barren.chronicle.events.filter((e) => e.cat === "detritus").length, 0);
  assert.equal(barren.food.sprouted, 0);
});
