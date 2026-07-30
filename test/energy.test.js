import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { EnergyLedger, ENERGY_SINKS } from "../src/energy.js";

/**
 * The identity the whole ledger exists to hold: every unit this world has made
 * is either standing in something alive (or dead and not yet rotted) or it went
 * somewhere the books name.
 *
 * The tolerance is relative because floating-point addition is not associative —
 * the ledger's running totals and the world's per-creature energies accumulate
 * the same quantities in different orders, so they agree to about fifteen
 * significant figures rather than to the bit. 1e-9 of throughput is billions of
 * times smaller than one pellet; anything that breaks the accounting for real
 * moves it by whole units.
 */
function assertBalanced(world, note) {
  const { standing, expected, residual } = world.energy.audit(world);
  const scale = Math.max(1, world.energy.created);
  assert.ok(
    Math.abs(residual) / scale < 1e-9,
    `${note}: books say ${expected.toFixed(6)}, world holds ${standing.toFixed(6)} ` +
      `(residual ${residual.toExponential(3)} over ${scale.toFixed(0)} created)`
  );
}

test("the energy ledger balances in a default world", () => {
  const world = new World(makeConfig({ seed: 314 }));
  // Balanced before a single tick: the founders' energy is already on the books.
  assertBalanced(world, "tick 0");
  assert.equal(world.energy.created, world.energy.founders);
  for (let i = 0; i < 4000; i++) {
    world.step();
    if (i % 500 === 0) assertBalanced(world, `tick ${world.tick}`);
  }
  assertBalanced(world, "end of run");
  assert.ok(world.energy.crop > 0, "a pond that never grazed is not a test of grazing");
  assert.ok(world.energy.metabolism > 0, "nothing paid to be alive");
});

test("the energy ledger balances with every mechanic switched on at once", () => {
  const world = new World(
    makeConfig({
      seed: 8181,
      scavenging: true,
      detritus: true,
      disease: true,
      signalling: true,
      terrain: true,
      foodRegrowth: true,
      plasticity: true,
      sexualReproduction: true,
      dayNightCycle: true,
    })
  );
  for (let i = 0; i < 4000; i++) {
    world.step();
    if (i % 500 === 0) assertBalanced(world, `tick ${world.tick}`);
  }
  assertBalanced(world, "end of run");
  // Scavenging is the second way this world mints energy, and it only exists
  // when there are corpses to mint it into.
  assert.ok(world.energy.carrion > 0, "no corpse was ever butchered");
  assert.ok(world.energy.waste > 0, "meat that nobody ate has to go somewhere");
});

test("the energy ledger balances through a crash and its reseeding", () => {
  // A pond with nothing to eat at all: everyone starves, the world empties, and
  // the auto-reseed keeps founding fresh life — the path most likely to mint
  // energy nothing records. Predation off so the collapse is pure starvation.
  const start = 8;
  const world = new World(
    makeConfig({
      seed: 4242,
      foodSpawnRate: 0,
      foodStart: 0,
      predation: false,
      populationStart: start,
    })
  );
  for (let i = 0; i < 3000; i++) world.step();
  assert.ok(world.stats.deaths > start, "expected a pond that starves out more than once");
  assert.ok(
    world.energy.founders > start * world.config.energyStart,
    "expected the reseed to have founded more life after the crash"
  );
  // Nothing ever ate: every unit in this world was conjured by the reseed.
  assert.equal(world.energy.crop, 0);
  assert.equal(world.energy.created, world.energy.founders);
  assertBalanced(world, "after the crash");
});

test("the ledger balances after the world is fed and seeded by hand", () => {
  const world = new World(makeConfig({ seed: 77 }));
  for (let i = 0; i < 200; i++) world.step();
  world.addFood(50); // pellets carry no energy until something eats them
  const madeByFood = world.energy.created;
  world.addRandomCreatures(10);
  assert.equal(
    world.energy.created - madeByFood,
    10 * world.config.energyStart,
    "hand-seeded creatures mint exactly their starting energy, and food mints none"
  );
  for (let i = 0; i < 300; i++) world.step();
  assertBalanced(world, "after feeding and seeding");
});

test("a loaded world starts its books from what it was handed", () => {
  const world = new World(makeConfig({ seed: 99 }));
  for (let i = 0; i < 400; i++) world.step();
  const snapshot = JSON.parse(JSON.stringify(world.toJSON()));

  const restored = new World(makeConfig({ seed: 99 }));
  restored.loadJSON(snapshot);
  assert.equal(restored.energy.destroyed, 0, "a fresh set of books has spent nothing");
  assertBalanced(restored, "immediately after load");
  for (let i = 0; i < 300; i++) restored.step();
  assertBalanced(restored, "after running on from a load");
});

test("the ledger cannot move the world it measures", () => {
  // The determinism guarantee, made unrepresentable rather than argued: run one
  // world with the real books and one with a set that records nothing, and the
  // two must agree on every creature to the last bit. If any hook ever read a
  // ledger field, drew a random number, or rounded a value on its way through,
  // this is where it would show.
  const silent = {
    graze() {},
    bite() {},
    found() {},
    butcher() {},
    burn() {},
    bury() {},
    rot() {},
    // v1.35 put the books into every history point, which means `Stats.sample`
    // now asks the ledger for a snapshot four times a second. A ledger that
    // hands back nothing at all must still leave the world identical: the
    // recording path reads, and only reads.
    snapshot: () => ({}),
  };
  const a = new World(makeConfig({ seed: 2024, scavenging: true, detritus: true }));
  const b = new World(makeConfig({ seed: 2024, scavenging: true, detritus: true }));
  b.energy = silent;
  for (let i = 0; i < 1200; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.creatures.length, b.creatures.length);
  for (let i = 0; i < a.creatures.length; i++) {
    assert.equal(a.creatures[i].x, b.creatures[i].x, `creature ${i} x`);
    assert.equal(a.creatures[i].y, b.creatures[i].y, `creature ${i} y`);
    assert.equal(a.creatures[i].energy, b.creatures[i].energy, `creature ${i} energy`);
    assert.equal(a.creatures[i].age, b.creatures[i].age, `creature ${i} age`);
  }
  assert.equal(a.food.items.length, b.food.items.length);
  for (let i = 0; i < a.food.items.length; i++) {
    assert.equal(a.food.items[i].x, b.food.items[i].x, `pellet ${i} x`);
  }
  assert.equal(a.corpses.length, b.corpses.length);
  assert.equal(a.stats.deaths, b.stats.deaths);
});

test("reproduction moves energy and never makes any", () => {
  const world = new World(makeConfig({ seed: 606 }));
  for (let i = 0; i < 1500; i++) world.step();
  assert.ok(world.stats.births > 0, "expected some births");
  // Every unit created is accounted for by grazing and by founding. If a birth
  // had ever minted so much as a fraction, these two would no longer add up.
  assert.equal(world.energy.carrion, 0, "no scavenging in this world");
  assert.equal(world.energy.created, world.energy.crop + world.energy.founders);
  assertBalanced(world, "after many births");
});

test("the energy ceiling does nothing until the population cap makes it bite", () => {
  // The finding the ledger turned up on its first run, pinned so it cannot
  // quietly stop being true. `energyMax` (220) sits above `reproduceThreshold`
  // (160), so a creature always splits before it can fill up and the clamp is
  // unreachable — in a default world the pond spills *exactly nothing*, and a
  // parameter this project has carried since v1.0 has no effect whatsoever.
  //
  // Unless reproduction is blocked. At the population cap a creature cannot
  // split, its energy climbs to the ceiling, and every mouthful it takes
  // afterwards is minted and destroyed in the same instant. The cap is
  // documented as a safety valve against explosions; nothing said that reaching
  // it turns a third of the pond's entire energy budget into nothing.
  const ticks = 6000;
  const free = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < ticks; i++) free.step();
  assert.ok(
    free.creatures.length < free.config.populationMax,
    "this arm is only meaningful while the cap is out of reach"
  );
  // Not "small": zero. The residual is floating-point noise from differencing
  // an energy against itself, twelve orders of magnitude below one pellet.
  assert.ok(
    Math.abs(free.energy.spilled) < 1e-6 * free.config.foodEnergy,
    `an uncapped pond spilled ${free.energy.spilled}`
  );

  const capped = new World(makeConfig({ seed: 314, populationMax: 120 }));
  for (let i = 0; i < ticks; i++) capped.step();
  assert.equal(capped.creatures.length, 120, "expected a pond pressed against its cap");
  assert.ok(
    capped.energy.spilled > 0.2 * capped.energy.created,
    `a capped pond spilled only ${((100 * capped.energy.spilled) / capped.energy.created).toFixed(1)}%`
  );
  assertBalanced(capped, "at the population cap");
});

test("a full creature spills the part of a pellet it cannot hold", () => {
  const cfg = makeConfig({ seed: 11 });
  const world = new World(cfg);
  const ledger = new EnergyLedger();
  // Grazing at the ceiling: the pellet is worth its full value, and all of it
  // is thrown away. Waste that no earlier version of this project could see.
  ledger.graze(cfg.foodEnergy, 0);
  assert.equal(ledger.crop, cfg.foodEnergy);
  assert.equal(ledger.waste, cfg.foodEnergy);
  assert.equal(ledger.created - ledger.destroyed, 0);
});

test("EnergyLedger.shares: three sinks that always sum to the whole", () => {
  const ledger = new EnergyLedger();
  assert.equal(ledger.shares(), null, "nothing spent yet");
  ledger.burn(70);
  ledger.rot(20);
  ledger.bury(10);
  const s = ledger.shares();
  assert.equal(s.metabolism, 0.7);
  assert.equal(s.waste, 0.2);
  assert.equal(s.buried, 0.1);
  // To within floating point: the three of them are the whole of what was
  // spent, so a caller may render them as a bar without a fourth "other".
  const sum = ENERGY_SINKS.reduce((a, k) => a + s[k], 0);
  assert.ok(Math.abs(sum - 1) < 1e-12, `shares summed to ${sum}`);

  // The one awkward case: before anything has died of old age the buried column
  // can be a hair negative, because a starving creature pays its last bill in
  // full. The bar clamps rather than inverting.
  const early = new EnergyLedger();
  early.burn(100);
  early.bury(-0.4);
  const es = early.shares();
  assert.equal(es.buried, 0);
  assert.equal(es.metabolism, 1);
  assert.equal(early.destroyed, 99.6, "the raw fields keep the signed truth");
});
