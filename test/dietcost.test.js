// dietcost.test.js — the price of the diet gene, against the meal it buys.
//
// `src/dietcost.js` puts a number on a sentence v1.101 left in the playbook:
// half the carnivores in this world can reach nothing at all, and both of the
// prices `config.js` charges for carnivory are drained whether or not there is
// anything to eat. So the module is an *accounting* claim about two terms that
// live in two other files — `dietCost` in `creature.js` and `plantGain` in
// `world.js` — and a re-derivation of somebody else's arithmetic is exactly the
// kind of claim this project has learned to distrust (v1.81: "X is inside Y"
// where Y is derived is a test waiting to be written; v1.76: four comments said
// a query reached one cell and it reached eighteen pixels).
//
// So the two load-bearing tests here are *controls against the simulation
// itself* rather than against a second copy of the formula:
//
//   the upkeep — two ponds from one seed, one of them with
//   `carnivoreMetabolicCost` at zero, and the difference in what they drain
//   across a tick has to be the toll, to the last bit;
//
//   the plant penalty — one creature, one pellet, and the energy it actually
//   gains has to be `foodEnergy * (1 - plantLoss)`.
//
// The behavioural half — what the bill reads over twelve seeds — is a
// measurement and lives in `docs/SCIENCE.md`, for `refuge.test.js`'s reason: a
// test that pinned it would teach a future reader that the result is fragile
// when only the test is.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { makeConfig } from "../src/config.js";
import { dietBill } from "../src/dietcost.js";
import { eligibleCounts } from "../src/foodweb.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { describePond } from "../src/describe.js";
import { hudTiles, UI_RNG_SEED } from "../src/hud.js";
import { RNG } from "../src/rng.js";

/** A world of the given config, run on. */
function ran(overrides, ticks) {
  const world = new World(makeConfig(overrides));
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

/**
 * A pond of bodies with chosen radii and diets, standing still.
 *
 * Real `Creature`s with the two fields overwritten, `foodweb.test.js`'s
 * convention and for its reason: half of what is asked below is whether this
 * module and `_edible` agree about a boundary, and a stand-in has no `_edible`.
 */
function pond(specs, config = makeConfig()) {
  const rng = new RNG(7);
  return specs.map(([radius, carnivory]) => {
    const c = new Creature(Genome.random(rng), config, 0, 0, rng);
    c.radius = radius;
    c.carnivory = carnivory;
    return c;
  });
}

/** The total energy standing in a pond's living bodies. */
const standing = (world) => world.creatures.reduce((t, c) => t + c.energy, 0);

/** The tile's text for a world, as the panel would render it. */
const tileText = (world, config, id) =>
  new Map(
    hudTiles({ world, config, fps: 0, uiRng: new RNG(UI_RNG_SEED) }).map((t) => [t.id, t.text])
  ).get(id);

test("the toll is the energy the simulation actually drains for the diet gene", () => {
  // The control. Two ponds from one seed, identical in every constant but the
  // price of carnivory, stepped once: everything either of them does in that
  // tick is the same to the bit, so the whole difference in what they burn is
  // the term this module claims to be reporting.
  //
  // Asserted at tick 0 and stated as such. The arms are one world only while no
  // energy has clamped at `energyMax` and nobody has died on a bill the other
  // arm could pay — at 50 ticks they are 8e-4 apart and by 300 they are
  // different ponds, which is directive 2 working rather than failing. A
  // control that has to be sharp has to be taken where sharpness is available.
  //
  // The tolerance is 1e-9 rather than zero, and the reason is arithmetic rather
  // than doubt: this module sums forty bills in the population's order while
  // the simulation subtracts them one at a time from forty running totals, and
  // float addition is not associative. The gap measured here is 9e-13 against a
  // toll of 0.665, which is the reassociation and nothing else.
  for (const seed of [314, 7, 128]) {
    const paid = new World(makeConfig({ seed }));
    const free = new World(makeConfig({ seed, carnivoreMetabolicCost: 0 }));
    const toll = dietBill(paid.creatures, paid.config).toll;
    const before = [standing(paid), standing(free)];
    assert.equal(before[0], before[1], `seed ${seed}: the two arms did not start level`);
    paid.step();
    free.step();
    const drained = before[0] - standing(paid) - (before[1] - standing(free));
    assert.ok(toll > 0, `seed ${seed}: no diet gene to price`);
    assert.ok(
      Math.abs(drained - toll) < 1e-9,
      `seed ${seed}: the tick charged ${drained} and the module claims ${toll}`
    );
  }
});

test("the plant loss is the share of a pellet the gene actually costs a grazer", () => {
  // The other control, and the other clock. `plantLoss` is a share of a *meal*,
  // so it is measured against a meal, and by the same paired arithmetic as the
  // toll: two identical worlds, one of them with `plantPenaltyFromDiet` at
  // zero, and the difference in what a body gains from one pellet is the whole
  // of what the gene took off it. Nothing else in the tick reads that constant,
  // so this stays exact at any diet.
  for (const diet of [0, 0.2, 0.55, 0.9]) {
    const arms = [makeConfig(), makeConfig({ plantPenaltyFromDiet: 0 })].map((config) => {
      const world = new World(config);
      const c = pond([[5, diet]], config)[0];
      c.energy = 10; // well clear of `energyMax`, so no gain is clipped
      world.creatures = [c];
      // One pellet, exactly under it. `world.food.items` is the live list the
      // grazing step reads, so this puts a meal where it is needed without
      // touching how the meal is scored. The reference is kept rather than read
      // back off the list: `food.compact()` runs later in the same step and
      // `food.step()` sows, so `items[0]` afterwards is a different pellet.
      const pellet = { x: c.x, y: c.y, eaten: false };
      world.food.items = [pellet];
      const before = c.energy;
      // Priced before the step, not after: a pond of one is under
      // `populationMin`, so the world restocks it with founders whose diet
      // genes are the ones this test is trying not to be about.
      const claimed = config.foodEnergy * dietBill(world.creatures, config).plantLoss;
      world.step();
      return { world, pellet, claimed, gained: c.energy - before };
    });
    assert.ok(arms[0].pellet.eaten, `diet ${diet}: the pellet was not eaten`);
    const forgone = arms[1].gained - arms[0].gained;
    const claimed = arms[0].claimed;
    assert.ok(
      Math.abs(forgone - claimed) < 1e-12,
      `diet ${diet}: the meal lost ${forgone} and the module claims ${claimed}`
    );
  }
});

test("the plant loss is the pond's mean of the term `world.js` charges", () => {
  // The same claim as a population statistic, written as the `plantGain` line
  // rearranged rather than as a second guess at it: a pellet is worth
  // `foodEnergy * (1 - plantPenaltyFromDiet * carnivory)`, so what the gene
  // costs is the rest of it, and the module reports the mean over the living.
  const world = ran({}, 400);
  const cfg = world.config;
  const mean =
    world.creatures.reduce(
      (t, c) => t + (cfg.foodEnergy - cfg.foodEnergy * (1 - cfg.plantPenaltyFromDiet * c.carnivory)),
      0
    ) /
    world.creatures.length /
    cfg.foodEnergy;
  assert.ok(
    Math.abs(dietBill(world.creatures, cfg).plantLoss - mean) < 1e-12,
    "the mean forgone share is not the mean of the term charged"
  );
});

test("an empty pond has no bill of any kind", () => {
  assert.deepEqual(dietBill([], makeConfig()), {
    toll: 0,
    idle: 0,
    unlicensed: 0,
    baseline: 0,
    plantLoss: 0,
    idlePlantLoss: 0,
  });
});

test("the baseline is what the same bodies pay simply to exist", () => {
  // The scale the toll is read against, computed once here rather than twice on
  // two surfaces — v1.67's rule about one statistic with two registers.
  const world = ran({}, 200);
  assert.equal(
    dietBill(world.creatures, world.config).baseline,
    world.creatures.length * world.config.metabolicBase
  );
});

test("an idle body is one with nothing the eating rule lets it reach", () => {
  // The definition, checked against `foodweb.js`'s count rather than against a
  // second walk of the size rule. Everything not fed pays into `idle`, and the
  // two shares partition the toll exactly.
  const world = ran({}, 600);
  const cfg = world.config;
  const counts = eligibleCounts(world.creatures, cfg);
  let fedToll = 0;
  for (let i = 0; i < world.creatures.length; i++) {
    const c = world.creatures[i];
    if (c.carnivory >= cfg.carnivoreThreshold && counts[i] > 0) {
      fedToll += cfg.carnivoreMetabolicCost * c.carnivory;
    }
  }
  const bill = dietBill(world.creatures, cfg);
  assert.ok(Math.abs(bill.toll - bill.idle - fedToll) < 1e-12, "the toll is not partitioned");
  assert.ok(bill.idle <= bill.toll, "more of the toll is idle than exists");
  assert.ok(bill.unlicensed <= bill.idle, "an unlicensed body is by construction an idle one");
});

test("with the mechanic off the whole bill is idle, and it is nearly as large", () => {
  // The reading this tile exists for. `predation: false` stops every bite and
  // changes neither price, so the pond goes on paying for hunting apparatus in
  // a world where hunting cannot happen — and `dietBill` is the one readout
  // here that knows it, because the gate is inside the arithmetic rather than
  // on the surface (`dietcost.js`).
  const quiet = ran({ predation: false }, 400);
  const bill = dietBill(quiet.creatures, quiet.config);
  assert.ok(bill.toll > 0, "a pond with no diet gene at all is not the case under test");
  assert.equal(bill.idle, bill.toll, "something was fed in a world where nothing may bite");
  assert.equal(bill.idlePlantLoss, bill.plantLoss, "the idle mean is not the pond's mean");
});

test("a body over the threshold with prey in reach pays into neither share", () => {
  // The boundary, at the threshold itself, both ways. `carnivoreThreshold` is a
  // `>=` in `_edible`, so a gene sitting exactly on it hunts.
  const config = makeConfig();
  const t = config.carnivoreThreshold;
  const world = new World(makeConfig());
  world.creatures = pond([
    [8, t], // on the threshold, and big enough to eat the third body
    [8, t], // on the threshold, and nothing here is small enough for it
    [3.5, 0.1], // the meal
  ]);
  // The second hunter is the same size as the first, so what separates them is
  // built by hand: give it a body that reaches nothing.
  world.creatures[1].radius = 3.6;
  const cfg = world.config;
  const bill = dietBill(world.creatures, cfg);
  assert.equal(bill.unlicensed, cfg.carnivoreMetabolicCost * 0.1, "only the grazer is unlicensed");
  assert.ok(
    Math.abs(bill.idle - cfg.carnivoreMetabolicCost * (t + 0.1)) < 1e-12,
    "the fed hunter is being counted as idle, or the unfed one is not"
  );
});

test("reading the bill is a pure reading of the world", () => {
  // Directive 2, asserted as the exact promise `foodweb.js` makes: an observer
  // draws nothing and touches nothing, so a pond being priced is bit-for-bit
  // the pond that is not.
  const world = ran({}, 300);
  const before = stateFingerprint(world);
  for (let i = 0; i < 10; i++) dietBill(world.creatures, world.config);
  assert.equal(stateFingerprint(world), before, "pricing the pond perturbed it");
  assert.deepEqual(
    dietBill(world.creatures, world.config),
    dietBill(world.creatures, world.config),
    "two readings of one pond disagree"
  );
});

test("the tile says the rate and the idle share, and a word when there is no bill", () => {
  const world = new World(makeConfig());
  assert.match(
    tileText(world, world.config, "stat-bill"),
    /^\d+\.\d\/t (<1|\d+)% idle$/,
    "the opening pond has a bill"
  );

  // A pond carrying no diet gene at all pays nothing, and "0.0/t 0% idle" would
  // be a percentage of nothing — the falsehood this file's rule is about.
  const herbivores = new World(makeConfig());
  herbivores.creatures = pond([
    [8, 0],
    [4, 0],
  ]);
  assert.equal(tileText(herbivores, herbivores.config, "stat-bill"), "none");
  const bare = new World(makeConfig());
  bare.creatures = [];
  assert.equal(tileText(bare, bare.config, "stat-bill"), "none");

  // And the one tile on this panel with something to say about a world where
  // nothing hunts: the three tiles above it read `off` there.
  const quiet = ran({ predation: false }, 200);
  assert.match(tileText(quiet, quiet.config, "stat-bill"), /^\d+\.\d\/t 100% idle$/);
});

test("the tile's two numbers are both in the sentence", () => {
  // v1.103's rule, one release on: a flag that gates a row gates a clause, and
  // a reader and a listener told two different things about one statistic is
  // the asymmetry this project has now found four times. Both surfaces are
  // built here in one release, so this is the assertion that keeps them one.
  for (const overrides of [{}, { predation: false }]) {
    const world = ran(overrides, 250);
    const bill = dietBill(world.creatures, world.config);
    const said = describePond(world, world.config);
    const tile = tileText(world, world.config, "stat-bill");
    assert.match(tile, /^(\d+\.\d)\/t /);
    assert.ok(said.includes(`${bill.toll.toFixed(1)} energy a tick`), `rate missing from "${said}"`);
    assert.ok(
      said.includes(`${Math.round((bill.idle / bill.toll) * 100)}% of that is paid`),
      `idle share missing from "${said}"`
    );
  }
});

test("the sentence is spoken in a world where nothing may hunt", () => {
  // The clause is deliberately outside the `predation` block, unlike every
  // other predation clause in `describe.js`. A world with the mechanic off pays
  // the full bill and can never be fed for it; silence there would be the
  // opposite of the finding.
  const quiet = ran({ predation: false }, 200);
  const said = describePond(quiet, quiet.config);
  assert.ok(said.includes("Carnivory is draining"), "the bill went unsaid where it matters most");
  assert.ok(!said.includes("of them hunt"), "a world with no hunting counted hunters");
  assert.ok(
    said.includes("100% of that is paid by animals with nothing in the water they can eat"),
    `the idle share was not 100% with the mechanic off: "${said}"`
  );
});

test("a pond of pure herbivores is said to have no bill at all", () => {
  // The silent case, on the other surface. `describe.js`'s standing rule is
  // that a mechanic which is doing nothing is not mentioned, and a bill of zero
  // is that rule arriving on a quantity rather than on a flag.
  const world = new World(makeConfig());
  world.creatures = pond([
    [8, 0],
    [4, 0],
  ]);
  assert.ok(!describePond(world, world.config).includes("Carnivory is draining"));
});
