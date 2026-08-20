// Tests for the world fingerprint (v1.36) — the project's oldest promise,
// finally written down as a number.
//
// Every determinism test in this suite before now compared two worlds built in
// the *same process*: same seed, same code, same engine. That catches a
// simulation that is randomly wrong. It cannot catch the failure the second
// prime directive is actually about — a default world quietly moving between one
// release and the next — because a test cannot run last month's code.
//
// A recorded constant can. The numbers below were checked against every tagged
// version in the repository's history (see docs/SCIENCE.md): the default pond's
// trajectory has been bit-for-bit identical from v1.3.0 to now, thirty-three
// consecutive releases, and moved exactly twice before that — at v1.1.0 and
// v1.3.0, both of which added random draws before the first tick.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { trajectoryFingerprint, stateFingerprint, mathFingerprint } from "../src/fingerprint.js";

/** Every feature this project ships switched off, read out of the config itself. */
const OPT_IN_FLAGS = Object.keys(DEFAULT_CONFIG).filter((k) => DEFAULT_CONFIG[k] === false);

/**
 * Every flag, including the four that ship on. The lever sweep below wants
 * this list rather than the one above; the default sweep above wants that one.
 * Two questions, two inventories, and until v1.111 both used the smaller.
 */
const ALL_FLAGS = Object.keys(DEFAULT_CONFIG).filter((k) => typeof DEFAULT_CONFIG[k] === "boolean");

/**
 * The engine's transcendental functions, as they were when the goldens below
 * were recorded (Node 22 / V8). ECMAScript leaves these implementation-defined,
 * so this is a precondition of the strict assertions, not a claim about them.
 */
const GOLDEN_MATH = "115a4764";

/**
 * Recorded at v1.36.0 and verified identical in every release back to v1.3.0.
 * `pop` and `food` are the tier that survives a different libm; `traj` is the
 * bit-exact tier that only means something under `GOLDEN_MATH`.
 */
const GOLDEN = [
  {
    label: "the default pond (seed 314)",
    overrides: {},
    marks: [
      { tick: 0, traj: "cef9499d", pop: 40, food: 280 },
      { tick: 64, traj: "b13bbbbc", pop: 40, food: 375 },
      { tick: 512, traj: "94f52b66", pop: 63, food: 517 },
      { tick: 2048, traj: "0051ccff", pop: 188, food: 56 },
    ],
  },
  {
    // A second seed, so a change that happens to be a no-op on 314 — the seed
    // every screenshot and the landing page use — still has somewhere to show.
    label: "a second pond (seed 777)",
    overrides: { seed: 777 },
    marks: [
      { tick: 0, traj: "b1b03a64", pop: 40, food: 280 },
      { tick: 64, traj: "9ffefd5c", pop: 40, food: 386 },
      { tick: 512, traj: "f2369d36", pop: 47, food: 520 },
    ],
  },
];

/** The double one bit away from `v`, for probing what a hash can and cannot see. */
function flipLowBit(v) {
  const b = new ArrayBuffer(8);
  const f = new Float64Array(b);
  const u = new BigUint64Array(b);
  f[0] = v;
  u[0] ^= 1n;
  return f[0];
}

test("the default pond's trajectory is the one it has had since v1.3.0", (t) => {
  // Two tiers, because only one of them is this project's fault. A differing
  // libm disagrees at the scale of one ULP, and docs/SCIENCE.md measures what
  // that buys: with the last bit of every implementation-defined Math result
  // flipped, four seeds ran 20,000 ticks with identical populations. So the
  // counts are asserted always, and the bit-exact hash only when the engine's
  // math is the math the constants were recorded under.
  const sameMath = mathFingerprint() === GOLDEN_MATH;
  // Say which tier ran, on *every* run and not only on a mismatch. A test that
  // quietly drops its strongest assertion and still prints `ok` is this
  // project's favourite bug (v1.22, v1.23) wearing a test runner's clothes —
  // and the place I would least be able to check it by hand is CI, which is the
  // only place it runs on an engine I did not choose.
  t.diagnostic(
    sameMath
      ? `engine math ${GOLDEN_MATH} as recorded — checking the bit-exact hashes`
      : `engine math is ${mathFingerprint()}, not the recorded ${GOLDEN_MATH}: this ` +
        "engine's Math.sin/tanh/exp differ from the ones the golden hashes were " +
        "recorded under, so a mismatch could not be attributed and the bit-exact " +
        "check is SKIPPED. The population and food counts are still checked."
  );

  for (const scenario of GOLDEN) {
    const w = new World(makeConfig(scenario.overrides));
    for (const m of scenario.marks) {
      while (w.tick < m.tick) w.step();
      const where = `${scenario.label} at tick ${m.tick}`;
      assert.equal(w.creatures.length, m.pop, `population changed: ${where}`);
      assert.equal(w.food.items.length, m.food, `pellet count changed: ${where}`);
      if (sameMath) {
        assert.equal(
          trajectoryFingerprint(w),
          m.traj,
          `trajectory changed: ${where}. Something in this release moved a world ` +
            "that has been identical since v1.3.0. If that was deliberate, say so " +
            "in CHANGELOG.md and re-record; if not, it is a regression."
        );
      }
    }
  }
});

test("the trajectory hash can see one bit", () => {
  const w = new World(makeConfig({}));
  for (let i = 0; i < 32; i++) w.step();

  // Pin the instrument, not only the value: a hash recorded to catch drift is
  // worthless if it cannot resolve the drift. Every field, one ULP at a time.
  for (const field of ["x", "y", "heading", "vx", "vy", "energy"]) {
    const before = trajectoryFingerprint(w);
    const c = w.creatures[0];
    const original = c[field];
    c[field] = flipLowBit(original);
    assert.notEqual(trajectoryFingerprint(w), before, `blind to 1 ULP of ${field}`);
    c[field] = original;
    assert.equal(trajectoryFingerprint(w), before, `not restored after ${field}`);
  }

  // And a pellet moving by a bit, which is how a change to the crop would show.
  const before = trajectoryFingerprint(w);
  const f = w.food.items[0];
  f.x = flipLowBit(f.x);
  assert.notEqual(trajectoryFingerprint(w), before, "blind to 1 ULP of a pellet");
});

test("the trajectory hash is deliberately blind to representation", () => {
  // The design claim, and the reason there are two hashes. Adding a gene or a
  // per-creature field is what almost every release does; if the cross-version
  // constant moved when one did, it would be re-recorded every cycle and would
  // stop being evidence of anything. Measured on real history: the state hash
  // moved at v1.4, v1.20, v1.23 and v1.33 while the pond did not.
  const w = new World(makeConfig({}));
  for (let i = 0; i < 32; i++) w.step();
  const traj = trajectoryFingerprint(w);
  const state = stateFingerprint(w);
  assert.notEqual(traj, state, "the two hashes must not collide on the same world");

  const c = w.creatures[0];
  c.genome.data[0] += 1;
  c.infected = true;
  c.signal = 0.5;
  assert.equal(trajectoryFingerprint(w), traj, "trajectory hash saw a gene or a flag");
  assert.notEqual(stateFingerprint(w), state, "state hash missed a gene and a flag");
});

test("fingerprinting a world cannot change it", () => {
  // An observer that alters what it observes is not an observer (v1.33). Here
  // that is two claims: no random draws, and no effect on the future.
  const w = new World(makeConfig({}));
  for (let i = 0; i < 20; i++) w.step();

  let draws = 0;
  const real = w.rng.next;
  w.rng.next = () => {
    draws++;
    return real();
  };
  trajectoryFingerprint(w);
  stateFingerprint(w);
  assert.equal(draws, 0, "fingerprinting drew a random number");
  w.rng.next = real;

  const observed = new World(makeConfig({ seed: 4242 }));
  const control = new World(makeConfig({ seed: 4242 }));
  for (let i = 0; i < 120; i++) {
    observed.step();
    trajectoryFingerprint(observed);
    stateFingerprint(observed);
    control.step();
  }
  assert.equal(stateFingerprint(observed), stateFingerprint(control));
});

test("the same seed hashes the same, a different seed does not", () => {
  const hash = (seed) => {
    const w = new World(makeConfig({ seed }));
    for (let i = 0; i < 64; i++) w.step();
    return stateFingerprint(w);
  };
  assert.equal(hash(99), hash(99));
  assert.notEqual(hash(99), hash(100));
});

test("no opt-in feature costs anything while it is off", () => {
  // Every feature file already asserts this for its own flag, and each does it
  // by comparing a chosen handful of fields. This asserts it for *every* flag at
  // once, over the whole state including the genome and the brain — and it reads
  // the list out of the config, so a feature added in a later release is covered
  // the day its flag lands rather than the day somebody remembers.
  assert.ok(OPT_IN_FLAGS.length >= 13, `only found ${OPT_IN_FLAGS.length} opt-in flags`);
  for (const flag of OPT_IN_FLAGS) {
    const base = new World(makeConfig({ seed: 21 }));
    const explicit = new World(makeConfig({ seed: 21, [flag]: false }));
    for (let i = 0; i < 400; i++) {
      base.step();
      explicit.step();
      assert.equal(
        stateFingerprint(explicit),
        stateFingerprint(base),
        `${flag}: false diverged from the default world at tick ${i + 1}`
      );
    }
  }
});

test("every feature is a lever when it is flipped", () => {
  // The other half, and the v1.27 lesson: a parameter that does nothing is
  // either irrelevant or clipped, so sweep every flag once purely to check it
  // *is* a flag. The budgets are measured, not guessed — the slowest is disease,
  // whose first case arrives at tick 901.
  //
  // **The inventory was half the flags until v1.111.** `OPT_IN_FLAGS` is every
  // key whose value is `false`, which is the right list for the test above —
  // that one is about defaults — and the wrong list for this one, which is
  // about levers. `seasons`, `foodPatches`, `autoReseed` and `predation` are
  // flags too; they are simply flipped the other way, and no sweep in this
  // project had ever touched them. They are here now.
  //
  // **And what this test can prove is narrower than it reads.** Seven of the
  // twenty-five arms below are not a controlled pair: switching the flag on
  // draws extra random numbers — a gene block, a rock layout — so the second
  // arm is a different *sample* of the world, not the same world with a rule
  // added. `src/onset.js` measures which seven, and carries the honest control
  // for the two whose divergence here is provably nothing else (`groundSense`
  // and `wallSense` read exactly 0 in the very pond this sweep runs them in).
  // The assertion is kept because a flag that cannot move the world even by
  // resampling it is dead in a way worth catching; it is no longer read as
  // evidence that the mechanic works.
  //
  // kinRecognition is the exception, and it is an honest one rather than a
  // dead flag: sparing family can only change a world where a predator meets a
  // close relative, and in the default pond that never happens — 20,000 ticks
  // on seed 314 put 106,580 size-and-diet-eligible pairs in front of the test
  // and the *closest* of them was 0.227 apart genetically, four times the
  // threshold. It fires on one seed in five (seed 23, tick 4,910, 39,616 times
  // in 20,000 ticks). test/kinRecognition.test.js pins the mechanism directly;
  // asserting it here would mean a 5,000-tick single-seed test. See
  // docs/SCIENCE.md.
  //
  // deathIsFinal (v1.45) is the second exception and it is the same kind: the
  // correction is real but *rare*. A default pond stages about a dozen
  // posthumous meals and one posthumous birth in 20,000 ticks, so the two arms
  // run bit-identical for thousands of ticks and then part at the first one —
  // tick 3,587 on seed 314, 2,963 on seed 77, and four of eight seeds tried
  // were still identical at 4,000. test/deathIsFinal.test.js stages the
  // mechanism directly in one tick and pins the divergence on seed 77.
  //
  // barrierOcclusion (v1.50) needs no exception but it does need a world: rock
  // that stops sight can only stop it where there is rock, so the sweep runs its
  // two arms in a *walled* pond. That is the same device `src/levers.js` uses for
  // every constant whose world has to be asked for, and it is a better answer
  // than a skip — the flag is still swept, in the only world it is defined in.
  //
  // massWeightedShove (v1.63) is the second of those and for the same reason:
  // a rule about *how* an overlap is split cannot be a lever in a pond where
  // no overlap is ever split, so its two arms run in a pond with solid bodies.
  // autoReseed (v1.111) is the third, and the world is the one `levers.js`
  // gives `reseedCount` for the same reason: the rule is read only when the
  // pond is *completely* empty. No food, no trickle-rescue floor and a short
  // life empties this one at tick 200.
  const NEEDS = {
    barrierOcclusion: { barriers: true },
    massWeightedShove: { bodyCollision: true },
    autoReseed: { foodStart: 0, foodSpawnRate: 0, reseedFloor: 0, populationStart: 6, maxAge: 200 },
  };
  const skip = new Set(["kinRecognition", "deathIsFinal"]);
  for (const flag of ALL_FLAGS) {
    if (skip.has(flag)) continue;
    const world = { seed: 314, ...NEEDS[flag] };
    const off = new World(makeConfig({ ...world, [flag]: DEFAULT_CONFIG[flag] }));
    const on = new World(makeConfig({ ...world, [flag]: !DEFAULT_CONFIG[flag] }));
    let at = -1;
    for (let i = 0; i < 1000 && at < 0; i++) {
      off.step();
      on.step();
      if (stateFingerprint(on) !== stateFingerprint(off)) at = i + 1;
    }
    assert.ok(at > 0, `${flag}: flipping it changed nothing in 1000 ticks`);
  }
});

test("the math probe watches the functions IEEE-754 leaves open, and only those", () => {
  const before = mathFingerprint();
  assert.equal(mathFingerprint(), before, "the probe is not stable across calls");

  // sqrt is required to be correctly rounded, so it is not a portability risk
  // and is deliberately not probed. If that claim were wrong — if the probe
  // reached sqrt — this would fail.
  const realSqrt = Math.sqrt;
  Math.sqrt = (x) => flipLowBit(realSqrt(x));
  try {
    assert.equal(mathFingerprint(), before, "the probe reaches Math.sqrt");
  } finally {
    Math.sqrt = realSqrt;
  }

  // The functions it does watch, one at a time: each must be visible on its own,
  // or the probe would pass an engine that differs in exactly that one.
  for (const name of [
    "sin", "cos", "tan", "atan", "atan2", "hypot",
    "asin", "acos", "exp", "log", "pow", "cbrt", "tanh",
  ]) {
    const original = Math[name];
    Math[name] = (...a) => flipLowBit(original(...a));
    try {
      assert.notEqual(mathFingerprint(), before, `the probe is blind to Math.${name}`);
    } finally {
      Math[name] = original;
    }
  }
  assert.equal(mathFingerprint(), before, "the probe did not survive being poked");
});
