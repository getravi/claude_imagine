// licensedDietCost.test.js — the bill follows the licence (v1.107).
//
// v1.105 measured the mismatch this flag exists to remove: both prices of the
// diet gene are charged in proportion to the gene, while `carnivoreThreshold`
// is a step, so a median 60.7% of the upkeep over twelve seeds is paid *below*
// the line by animals the eating rule will never once admit. That entry closed
// by naming the experiment — *gate the upkeep on the threshold so the bill is a
// step like the licence* — and by saying it is a flag and a cycle of its own
// because it moves every world.
//
// So the claims here are the two halves of that sentence, and neither is a
// second copy of the formula (v1.81: a re-derivation of somebody else's
// arithmetic is a test waiting to fail quietly):
//
//   **it moves the right worlds** — a pond stepped with the flag on drains
//   exactly the upkeep `dietcost.js` claims, measured against an arm with
//   `carnivoreMetabolicCost` at zero, which is v1.105's own control re-run
//   inside the gated world;
//
//   **and only the right worlds** — set `carnivoreThreshold` to 0, so the
//   licence refuses nobody, and the flag must be bit-for-bit invisible for four
//   hundred ticks. The general no-op-when-off claim is `fingerprint.test.js`'s,
//   swept over every flag; this is the sharper one, because it says what the
//   gate *is* rather than that it is off.
//
// The behavioural half — what twelve ponds do when it is on — is a measurement
// and lives in `docs/SCIENCE.md`, for `refuge.test.js`'s reason: a test that
// pinned it would teach a future reader the result is fragile when only the
// test is.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { makeConfig } from "../src/config.js";
import { dietBill } from "../src/dietcost.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { RNG } from "../src/rng.js";

/** A pond of bodies with chosen radii and diets — `dietcost.test.js`'s helper. */
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

test("the gated toll is the energy the gated pond actually drains", () => {
  // v1.105's control, re-run in the world this flag makes: two ponds from one
  // seed, identical in every constant but the price of carnivory, both with the
  // gate on, stepped once. Everything either of them does in that tick is the
  // same to the bit — the flag draws no randomness and changes no decision —
  // so the whole difference in what they burn is the term the module claims.
  //
  // Tick 0, and the tolerance is 1e-9, for the reasons written out in
  // `dietcost.test.js`: the arms are one pond only while nothing has clamped at
  // `energyMax`, and this module sums the bills in population order while the
  // simulation subtracts them one at a time.
  for (const seed of [314, 7, 128]) {
    const paid = new World(makeConfig({ seed, licensedDietCost: true }));
    const free = new World(makeConfig({ seed, licensedDietCost: true, carnivoreMetabolicCost: 0 }));
    const toll = dietBill(paid.creatures, paid.config).toll;
    const before = [standing(paid), standing(free)];
    assert.equal(before[0], before[1], `seed ${seed}: the two arms did not start level`);
    paid.step();
    free.step();
    const drained = before[0] - standing(paid) - (before[1] - standing(free));
    assert.ok(
      Math.abs(drained - toll) < 1e-9,
      `seed ${seed}: the gated tick charged ${drained} and the module claims ${toll}`
    );
  }
});

test("an unlicensed body is charged nothing, and a licensed one pays what it always paid", () => {
  // The mechanism itself, at the boundary and either side of it. Two arms of
  // one seed differing only in the flag, each holding one staged body at a
  // chosen diet: the flag takes no branch a random number depends on, so a
  // single step is identical in both arms apart from the term under test, and
  // the difference in what that body burns is exactly what the gate saved it.
  //
  // The pond's food is emptied first so the only bill in the tick is the
  // metabolic one — the pellet half of the gate is the next test, and a meal
  // taken here would put both halves in one number.
  const cfg = makeConfig();
  const th = cfg.carnivoreThreshold;
  for (const diet of [0, 0.2, th - 0.01, th, 0.9]) {
    const drop = [false, true].map((on) => {
      const config = makeConfig({ seed: 42, licensedDietCost: on });
      const world = new World(config);
      const c = pond([[5, diet]], config)[0];
      c.energy = 10; // clear of `energyMax`, so nothing clips
      world.creatures = [c];
      world.food.items = [];
      const before = c.energy;
      world.step();
      return before - c.energy;
    });
    const saved = drop[0] - drop[1];
    const expected = diet < th ? cfg.carnivoreMetabolicCost * diet : 0;
    assert.ok(
      Math.abs(saved - expected) < 1e-12,
      `diet ${diet}: the gate saved ${saved} a tick and should have saved ${expected}`
    );
  }
});

test("an unlicensed body keeps the whole pellet, and a licensed one keeps its share", () => {
  // The gene's second price, on its own clock. `dietcost.test.js` measures the
  // ungated version of this against an arm with `plantPenaltyFromDiet` at zero;
  // here the second arm is the flag, and below the threshold the two must agree
  // exactly — a grazer the hunting rule refuses gives up nothing.
  const cfg = makeConfig();
  const th = cfg.carnivoreThreshold;
  for (const diet of [0.2, th - 0.01, th, 0.9]) {
    const arms = [false, true].map((on) => {
      const config = makeConfig({ licensedDietCost: on });
      const world = new World(config);
      const c = pond([[5, diet]], config)[0];
      c.energy = 10;
      world.creatures = [c];
      // One pellet, exactly under it — `dietcost.test.js`'s device, and its
      // caveat: the reference is kept rather than read back, because the food
      // list is compacted and re-sown later in the same step.
      const pellet = { x: c.x, y: c.y, eaten: false };
      world.food.items = [pellet];
      const before = c.energy;
      world.step();
      return { pellet, gained: c.energy - before };
    });
    assert.ok(arms[0].pellet.eaten && arms[1].pellet.eaten, `diet ${diet}: a pellet went uneaten`);
    // Both arms burned the same movement and base metabolism, so the difference
    // in what the tick left behind is the difference in the two meals plus the
    // upkeep the gate saved. The upkeep is a known quantity by the test above.
    const upkeepSaved = diet < th ? cfg.carnivoreMetabolicCost * diet : 0;
    const mealGained = arms[1].gained - arms[0].gained - upkeepSaved;
    const expected = diet < th ? cfg.foodEnergy * cfg.plantPenaltyFromDiet * diet : 0;
    assert.ok(
      Math.abs(mealGained - expected) < 1e-12,
      `diet ${diet}: the gate handed back ${mealGained} of the pellet and should have handed back ${expected}`
    );
  }
});

test("the gate is invisible in a world whose licence refuses nobody", () => {
  // The sharp form of "no-op when off", and the one that says what the flag
  // *is*: with `carnivoreThreshold` at 0 every body is licensed, so a gate on
  // the licence has nothing to gate and the two arms must stay one pond to the
  // bit. This is the claim `fingerprint.test.js` cannot make — it sweeps every
  // flag against a *default* world, where the gate is off and the branch is
  // never reached.
  const base = new World(makeConfig({ seed: 21, carnivoreThreshold: 0 }));
  const gated = new World(makeConfig({ seed: 21, carnivoreThreshold: 0, licensedDietCost: true }));
  for (let i = 0; i < 400; i++) {
    base.step();
    gated.step();
    assert.equal(
      stateFingerprint(gated),
      stateFingerprint(base),
      `the gate moved a world in which nobody is unlicensed, at tick ${i + 1}`
    );
  }
});

test("the gate parts from the default pond on the first tick", () => {
  // The other direction, pinned rather than merely swept: the default pond
  // holds sub-threshold diet genes from the moment it is dealt, so the very
  // first bill differs. `levers.test.js` gives every flag a thousand ticks to
  // show itself; this one needs one, and saying so is the regression test — a
  // gate that quietly stopped reaching the common case would still pass a
  // thousand-tick sweep on some later divergence.
  const off = new World(makeConfig({ seed: 314 }));
  const on = new World(makeConfig({ seed: 314, licensedDietCost: true }));
  off.step();
  on.step();
  assert.notEqual(stateFingerprint(on), stateFingerprint(off));
});

test("the bill the tile reports is a step when the gate is on and a ramp when it is off", () => {
  // The cliff, as the reported price rather than as prose. `dietcost.js` is the
  // surface that quotes what carnivory costs, and the test above ties its toll
  // to what the simulation drains, so a discontinuity here is a discontinuity
  // in the pond. Either side of the line by a hundredth of a gene:
  //
  //   off — the price rises by `carnivoreMetabolicCost * 0.01` and nothing else
  //         happens at the threshold at all;
  //   on  — it rises by `carnivoreMetabolicCost * carnivoreThreshold`, the
  //         whole of the licensed body's bill, in one step.
  //
  // `mutationStrength` is 0.16, so that step is inside a single ordinary
  // mutation of the diet gene. That is the shape the twelve-seed measurement in
  // SCIENCE.md is about: under the ramp a lineage pays as it climbs, and under
  // the step the whole price arrives in the mutation that crosses.
  const cfg = makeConfig();
  const th = cfg.carnivoreThreshold;
  const toll = (diet, on) =>
    dietBill(pond([[5, diet]], makeConfig({ licensedDietCost: on })), makeConfig({ licensedDietCost: on }))
      .toll;
  const below = th - 0.01;
  const rampStep = toll(th, false) - toll(below, false);
  const gateStep = toll(th, true) - toll(below, true);
  assert.ok(
    Math.abs(rampStep - cfg.carnivoreMetabolicCost * 0.01) < 1e-12,
    `ungated, the threshold is a jump of ${rampStep}`
  );
  assert.ok(
    Math.abs(gateStep - cfg.carnivoreMetabolicCost * th) < 1e-12,
    `gated, the threshold is a jump of ${gateStep} rather than the whole licensed bill`
  );
  assert.equal(toll(below, true), 0, "an unlicensed body is billed for something");
  assert.equal(toll(th, true), toll(th, false), "a licensed body's bill moved");
  assert.ok(gateStep < cfg.mutationStrength, "the cliff is wider than one mutation of the gene");
});

test("the gate empties the unlicensed column it was built to remove", () => {
  // `unlicensed` is v1.105's whole finding — the share of the toll paid below
  // the threshold — and with the gate on it is zero by construction. Asserted
  // on a run rather than a staged pond, because the interesting half is that
  // `toll` still reports something: the licensed bodies go on paying, so this
  // is a gate and not a switch that turns carnivory free.
  const world = new World(makeConfig({ seed: 256, licensedDietCost: true }));
  for (let i = 0; i < 600; i++) world.step();
  const bill = dietBill(world.creatures, world.config);
  assert.equal(bill.unlicensed, 0);
  const licensed = world.creatures.filter((c) => c.carnivory >= world.config.carnivoreThreshold);
  assert.ok(licensed.length > 0, "seed 256 no longer holds a licensed body at 600 ticks");
  const expected = licensed.reduce((t, c) => t + world.config.carnivoreMetabolicCost * c.carnivory, 0);
  assert.ok(
    Math.abs(bill.toll - expected) < 1e-12,
    `the gated toll is ${bill.toll} and the licensed bodies owe ${expected}`
  );
});
