// deathSize.test.js — what size of body each death takes, and out of what pond.
//
// v1.64 measured predation as a *floor* under body size: every pond with
// hunters ends above 6.469 px mean radius, four of twelve without them settle
// below 5.5. It could not say how the floor works, and it wrote down why not —
// "small creatures get eaten" is a plausible mechanism arriving before the
// search, which this project's playbook names as the exact signature of the
// thing it gets wrong.
//
// So the books record the mechanism and its control together: every death now
// carries its own body radius and the mean radius of the pond that survived the
// tick it died in. Two of the three causes are the control. They are not a
// second run, a scrambled arm or a disabled flag — they are the other two
// columns of the same table, and they read about zero (v1.20, v1.50).
//
// What is pinned here is the arithmetic and the bounds that cannot flake. The
// twelve-seed table lives in docs/SCIENCE.md.

import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";
import { Stats, deathSizes, DEATH_CAUSES } from "../src/stats.js";
import { refugeRadius } from "../src/refuge.js";

/** A genome whose body is a chosen size; everything else random. */
function sized(rng, size) {
  const g = Genome.random(rng);
  g.data[g.data.length - 4] = size; // size gene
  return g;
}

/**
 * A pond of creatures at hand-picked radii, with no food and nothing hunting,
 * so the only thing that happens in a step is the deaths this test asks for.
 * Staged rather than waited for: a test that waits for a rare event in a real
 * pond is slow when it works and flaky when it isn't, and it describes the
 * frequency of a rule rather than the rule (v1.45).
 */
function stagedPond(sizes) {
  const cfg = makeConfig({ seed: 5 });
  const world = new World(cfg);
  const rng = new RNG(9);
  world.food.items = [];
  world.creatures = sizes.map((s, i) => {
    const c = new Creature(sized(rng, s), cfg, 60 + i * 40, 60, rng);
    c.energy = cfg.energyStart;
    return c;
  });
  return world;
}

test("deathSizes is the arithmetic it claims, and null before anything dies", () => {
  assert.equal(deathSizes({}, {}, {}), null);

  const sizes = deathSizes(
    { starvation: 4, age: 0, predation: 2 },
    { starvation: 28, age: 0, predation: 9 },
    { starvation: 28.4, age: 0, predation: 13 }
  );
  assert.equal(sizes.n, 6);
  assert.equal(sizes.causes.starvation.radius, 7);
  assert.equal(sizes.causes.starvation.pool, 7.1);
  assert.ok(Math.abs(sizes.causes.starvation.delta - -0.1) < 1e-12);
  assert.equal(sizes.causes.predation.radius, 4.5);
  assert.equal(sizes.causes.predation.pool, 6.5);
  assert.equal(sizes.causes.predation.delta, -2);
  // A cause nobody has died of is an empty set, not a missing one: zero across
  // the row, so a caller never has to render NaN while a column fills in.
  assert.deepEqual(sizes.causes.age, { n: 0, radius: 0, pool: 0, delta: 0 });
});

test("recordDeath takes the pool it is given, and skips the death that has none", () => {
  const s = new Stats();
  s.recordDeath({ deathCause: "predation", age: 10, radius: 4 }, 7);
  s.recordDeath({ deathCause: "predation", age: 10, radius: 5 }, 6);
  // The last body in an extinct pond: counted as a death, excluded from the
  // sizes, because there is no pond left to compare it against. Inventing one
  // by putting the dying into their own pool would bias every delta toward
  // zero by construction, so the guard is a decision and this pins it (v1.42).
  s.recordDeath({ deathCause: "predation", age: 10, radius: 3 }, null);

  assert.equal(s.deathsBy.predation, 3);
  assert.equal(s.sizedBy.predation, 2);
  assert.equal(s.radiusSumBy.predation, 9);
  assert.equal(s.poolSumBy.predation, 13);
  assert.equal(deathSizes(s.sizedBy, s.radiusSumBy, s.poolSumBy).causes.predation.delta, -2);
});

test("the pool is the pond that survived the tick, not the pond that entered it", () => {
  // Three bodies die out of five. The pool must be the mean of the two left
  // standing — not of all five, and not of the four that were not this
  // particular body, which would make the answer depend on which of the three
  // the sweep reached first.
  const world = stagedPond([0, 0.25, 0.5, 0.75, 1]);
  const radii = world.creatures.map((c) => c.radius);
  for (const i of [0, 1, 2]) world.creatures[i].die("starvation");
  world.step();

  const expected = (radii[3] + radii[4]) / 2;
  const s = world.stats;
  assert.equal(s.sizedBy.starvation, 3);
  assert.ok(
    Math.abs(s.poolSumBy.starvation - expected * 3) < 1e-9,
    `pool was ${s.poolSumBy.starvation / 3}, survivors average ${expected}`
  );
  assert.ok(Math.abs(s.radiusSumBy.starvation - (radii[0] + radii[1] + radii[2])) < 1e-9);
});

test("the pool does not depend on the order the bodies are swept up in", () => {
  // `world.creatures` is birth order and the sweep is sequential, which v1.47
  // found deciding 4.5% of the pond's meals. A statistic that changed with a
  // permutation would be reporting seniority; this one is computed once for the
  // whole tick, so it cannot.
  const forward = stagedPond([0, 0.3, 0.6, 0.9]);
  const reverse = stagedPond([0, 0.3, 0.6, 0.9]);
  reverse.creatures.reverse();
  for (const w of [forward, reverse]) {
    for (const c of w.creatures) if (c.radius < 6) c.die("predation");
    w.step();
  }
  for (const field of ["sizedBy", "radiusSumBy", "poolSumBy"]) {
    for (const cause of DEATH_CAUSES) {
      assert.equal(
        forward.stats[field][cause],
        reverse.stats[field][cause],
        `${field}.${cause} moved when the sweep order did`
      );
    }
  }
});

test("a tick that leaves nobody standing is a death with no pond to compare it to", () => {
  const world = stagedPond([0.2, 0.8]);
  for (const c of world.creatures) c.die("starvation");
  world.step();
  assert.equal(world.stats.deaths, 2);
  assert.equal(world.stats.deathsBy.starvation, 2);
  assert.equal(world.stats.sizedBy.starvation, 0, "an extinct pond has no pool");
  assert.equal(deathSizes(world.stats.sizedBy, world.stats.radiusSumBy, world.stats.poolSumBy), null);
});

test("every body the sizes describe is a body the pond counted", () => {
  // The two ledgers read the same deaths, and `sizedBy` can only ever be the
  // smaller of the two — the gap is exactly the pond's extinctions. An aggregate
  // that drifted from `deathsBy` would make every delta a mean over a
  // population nobody can name.
  const world = new World(makeConfig({ seed: 77 }));
  for (let i = 0; i < 3000; i++) world.step();
  const s = world.stats;
  let sized = 0;
  for (const cause of DEATH_CAUSES) {
    assert.ok(
      s.sizedBy[cause] <= s.deathsBy[cause],
      `${cause}: ${s.sizedBy[cause]} sized out of ${s.deathsBy[cause]} dead`
    );
    sized += s.sizedBy[cause];
  }
  assert.ok(sized > 0 && sized <= s.deaths);
});

test("predation is the only cause of death that is about size", () => {
  // The finding, pinned as the bound it is rather than as the number it was.
  // Over 20,000 ticks and twelve seeds the deltas are starvation −0.008, age
  // +0.019 and predation −1.448, with predation negative on twelve seeds of
  // twelve and never weaker than −0.587 (docs/SCIENCE.md). Asserting −1.448
  // here would pin a trajectory and teach a future reader that the finding is
  // fragile when only the test would be (v1.44). What cannot flake is the
  // ordering: hunting takes a body meaningfully below the pond around it, and
  // the other two ways out do not.
  for (const seed of [77, 512]) {
    const world = new World(makeConfig({ seed }));
    for (let i = 0; i < 3000; i++) world.step();
    const s = world.stats;
    const d = deathSizes(s.sizedBy, s.radiusSumBy, s.poolSumBy);
    assert.ok(d.causes.predation.n > 50, `seed ${seed} needs hunting to have happened`);
    assert.ok(
      d.causes.predation.delta < -0.2,
      `seed ${seed}: predation took bodies ${d.causes.predation.delta.toFixed(3)} px from the pond`
    );
    assert.ok(
      d.causes.predation.delta < d.causes.starvation.delta - 0.2,
      `seed ${seed}: hunger is as size-selective as hunting`
    );

    // And the theorem underneath it, which is not a measurement at all: nothing
    // this world can grow is able to eat a body at or above `bodyRadiusMax /
    // preySizeRatio`, so the mean body taken by predation is inside the refuge
    // by construction and no run can put it outside (see refuge.js).
    assert.ok(
      d.causes.predation.radius < refugeRadius(world.config),
      `seed ${seed}: a predation victim was in the refuge`
    );
  }
});
