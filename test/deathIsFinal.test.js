// deathIsFinal.test.js — a body's turn ends when the body does.
//
// Since v1.0 the update loop has had no `dead` guard on the creature it is
// updating. `act()` pays the metabolic bill and marks the death at the top of a
// creature's turn; grazing, biting and reproduction all run further down that
// same turn, and the sweep that removes bodies is step 5. So the dead act: a
// starved creature eats the pellet it fell on, a body bitten to zero earlier in
// the tick still steers and spends, and about one birth in two thousand is
// posthumous. Every other `dead` check in `world.js` is on some *other*
// creature — as prey, as a neighbour, as an infection source — so the pond has
// always treated a corpse as gone. Only the corpse disagreed.
//
// `deathIsFinal` makes the actor agree, and it is off by default because the
// fix is a correction, not a rule: a birth that stops happening is a random
// draw that stops happening, and every world downstream of it is a different
// world (the v1.32 `exactVision` rule).
//
// The first three tests stage the bug rather than waiting for it. A pond has to
// run 20,000 ticks to produce a dozen posthumous meals, and a test that waits
// for a rare event either takes half a minute or flakes; three creatures placed
// by hand show the same thing exactly, in one tick, in both arms.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { Food } from "../src/food.js";
import { RNG } from "../src/rng.js";
import { stateFingerprint } from "../src/fingerprint.js";

/**
 * An empty pond: no founders, no crop, nothing spawning. Whatever we put in it
 * is the whole world, so one `step()` is a controlled experiment.
 */
function emptyWorld(deathIsFinal, extra = {}) {
  return new World(
    makeConfig({
      seed: 5,
      deathIsFinal,
      populationStart: 0,
      foodStart: 0,
      foodSpawnRate: 0,
      autoReseed: false,
      ...extra,
    })
  );
}

/** Put one creature into `world` at (x, y), classified like a founder. */
function place(world, x, y, energy, age = 0) {
  const rng = new RNG(11);
  const c = new Creature(Genome.random(rng, false), world.config, x, y, rng);
  c.energy = energy;
  c.age = age;
  world.phylogeny.assign(c, 0, null);
  world.creatures.push(c);
  return c;
}

test("a creature that starves this tick does not then eat", () => {
  for (const deathIsFinal of [false, true]) {
    const world = emptyWorld(deathIsFinal);
    // Energy small enough that this tick's metabolic bill takes it under zero,
    // and a pellet at its feet — inside `eatRadius` however it happens to move.
    const c = place(world, 300, 300, 0.01);
    world.food.items.push(new Food(300, 300));
    world.step();

    assert.equal(c.dead, true, "it starved");
    assert.equal(c.deathCause, "starvation");
    assert.equal(
      world.food.items.length === 0 || world.food.items[0].eaten,
      !deathIsFinal,
      deathIsFinal
        ? "with the flag on the pellet is still lying there"
        : "this is the bug: the body ate on its way out"
    );
  }
});

test("a creature that dies of old age this tick does not then reproduce", () => {
  for (const deathIsFinal of [false, true]) {
    const world = emptyWorld(deathIsFinal);
    // Full enough to split, one tick short of the age limit: `act()` ages it out
    // and reproduction is four steps further down the same turn.
    const c = place(world, 300, 300, DEFAULT_CONFIG.reproduceThreshold + 40, DEFAULT_CONFIG.maxAge - 1);
    world.step();

    assert.equal(c.dead, true, "it aged out");
    assert.equal(c.deathCause, "age");
    assert.equal(
      world.stats.births,
      deathIsFinal ? 0 : 1,
      deathIsFinal ? "no posthumous child" : "this is the bug: it bred after dying"
    );
    // Either way the parent is gone by the end of the tick — the difference is
    // only whether it left anything behind.
    assert.equal(world.creatures.length, deathIsFinal ? 0 : 1);
  }
});

test("a body killed earlier in the tick takes no turn at all", () => {
  for (const deathIsFinal of [false, true]) {
    const world = emptyWorld(deathIsFinal);
    // Marked dead before the loop reaches it — exactly the state a predator's
    // victim is in when its own turn comes round later in the same tick.
    const c = place(world, 300, 300, 90);
    c.die("predation");
    world.food.items.push(new Food(300, 300));
    const x0 = c.x;
    const y0 = c.y;
    const energy0 = c.energy;
    const age0 = c.age;
    world.step();

    if (deathIsFinal) {
      assert.equal(c.x, x0, "a corpse does not steer");
      assert.equal(c.y, y0);
      assert.equal(c.energy, energy0, "and pays no metabolic bill");
      assert.equal(c.age, age0, "and does not get older");
      assert.equal(world.food.items.length, 1, "and does not graze");
    } else {
      assert.ok(c.age > age0, "this is the bug: the dead take a full turn");
      // The pellet is gone — eaten, then compacted out of the array in step 5.
      assert.equal(world.food.items.length, 0, "steering, spending and grazing");
      assert.ok(c.energy > energy0, "and finishing richer than it died");
    }
    // Both arms bury it, charged to what killed it: this changes when a death
    // takes effect, never whether it is recorded.
    assert.equal(world.stats.deaths, 1);
    assert.equal(world.stats.deathsBy.predation, 1);
  }
});

test("with the flag on, no body is ever buried holding more than it died with", () => {
  // The theorem, not a number: starvation and predation both end at
  // `energy <= 0` by definition (`creature.js`), so a body charged to either
  // cause is empty — unless something added to it after the fact, which is the
  // whole of the bug. Old age is the `else` branch and is expected to be
  // positive, so it is the control that keeps this test honest — and it is why
  // the run has to outlast `maxAge` (4,200), or there is nothing to control
  // against and "nothing was added" is indistinguishable from "nothing died".
  const world = new World(makeConfig({ seed: 314, deathIsFinal: true }));
  /** @type {Array<{energy:number, cause:string}>} */
  const burials = [];
  const bury = world.energy.bury.bind(world.energy);
  world.energy.bury = (energy, cause) => {
    burials.push({ energy, cause });
    bury(energy, cause);
  };
  for (let i = 0; i < 5000; i++) world.step();

  const empty = burials.filter((b) => b.cause === "starvation" || b.cause === "predation");
  const aged = burials.filter((b) => b.cause === "age");
  assert.ok(empty.length > 100, `only ${empty.length} bodies; the pond has to die for this to mean anything`);
  assert.ok(aged.length > 0, "and something has to reach old age");
  for (const b of empty) {
    assert.ok(b.energy <= 0, `a ${b.cause} burial holding ${b.energy} means the dead ate again`);
  }
  // Predation is sharper than "empty": a bite takes `min(prey.energy, biteEnergy)`
  // and only kills when that minimum was the whole of it, so a body the pond
  // killed is at *exactly* zero — and with the flag on nothing can touch it
  // afterwards. Over twelve seeds and 20,000 ticks each, `energy_buried_predation`
  // reads 0.00 on every one of them.
  for (const b of burials.filter((x) => x.cause === "predation")) {
    assert.equal(b.energy, 0, "a predated body is buried holding exactly nothing");
  }
  assert.ok(
    aged.every((b) => b.energy > 0),
    "a creature that runs out of time still has what it was holding"
  );
});

test("death is final is off by default and leaves worlds bit-for-bit unchanged", () => {
  assert.equal(DEFAULT_CONFIG.deathIsFinal, false);
  const withFlag = new World(makeConfig({ seed: 21, deathIsFinal: false }));
  const withoutFlag = new World(makeConfig({ seed: 21 }));
  // Count the draws as well as compare the outcome: directive 2 is about the
  // random *sequence*, and two worlds can agree for a while on a stream that has
  // already diverged.
  let drawsA = 0;
  let drawsB = 0;
  const nextA = withFlag.rng.next;
  withFlag.rng.next = () => {
    drawsA++;
    return nextA();
  };
  const nextB = withoutFlag.rng.next;
  withoutFlag.rng.next = () => {
    drawsB++;
    return nextB();
  };
  for (let i = 0; i < 1500; i++) {
    withFlag.step();
    withoutFlag.step();
  }
  assert.equal(drawsA, drawsB, "the flag being present must not cost a single draw");
  assert.equal(stateFingerprint(withFlag), stateFingerprint(withoutFlag));
  assert.ok(withFlag.creatures.length > 0, "and the pond has to be alive to have proved anything");
});

test("a world where death is final is still a reproducible world — and a different one", () => {
  const a = new World(makeConfig({ seed: 77, deathIsFinal: true }));
  const b = new World(makeConfig({ seed: 77, deathIsFinal: true }));
  const off = new World(makeConfig({ seed: 77 }));
  // Three thousand ticks, and not because the difference is subtle: it is
  // *rare*. A default pond produces about a dozen posthumous meals and a single
  // posthumous birth in 20,000 ticks, so the two arms run bit-identical for a
  // long time and then part company at the first one — tick 2,963 on this seed.
  // Four of eight seeds tried were still identical at 4,000. See SCIENCE.md.
  for (let i = 0; i < 3000; i++) {
    a.step();
    b.step();
    off.step();
  }
  assert.equal(stateFingerprint(a), stateFingerprint(b), "same seed, same config, same pond");
  assert.ok(a.creatures.length > 0);
  // The point of the flag being opt-in: it deals a different hand. If this ever
  // stops being true the correction has become free, and it isn't.
  assert.notEqual(stateFingerprint(off), stateFingerprint(a), "the correction must move the world");
});
