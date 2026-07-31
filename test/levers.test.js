// Tests for the constant sweep (v1.38) — is every number in config.js a lever?
//
// v1.36 asked this of the thirteen opt-in *flags* and left the seventy-nine
// *numbers* unasked, which is where the two known cases of a parameter doing
// nothing both came from: `detritusPerRadius` clipped by a cell cap (v1.27) and
// `energyMax` sitting above a threshold it could never be reached from (v1.29).
// Neither was visible in the code. Both would have been caught here.
//
// The answer the sweep gives is yes, all seventy-nine — but only once each is
// given a world where it can bite, and only once the sweep can watch more than
// the simulation. See src/levers.js for the three channels and for every
// exception's reason.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { stateFingerprint, observationFingerprint } from "../src/fingerprint.js";
import { numericKeys, leverSpec, sweepLever, perturb, SPECIAL } from "../src/levers.js";

const KEYS = numericKeys();
const byChannel = (c) => KEYS.filter((k) => leverSpec(k).channel === c);

test("the sweep covers every number in the config, and every entry moves it", () => {
  // The list is read out of DEFAULT_CONFIG rather than written down, so a
  // constant added in a later release is swept the day it lands. If it needs a
  // world of its own to be live, the sweep below will fail and say so, which is
  // the intended way to find that out.
  assert.ok(KEYS.length >= 79, `only found ${KEYS.length} numeric constants`);
  for (const key of KEYS) {
    const spec = leverSpec(key);
    assert.notEqual(spec.to, spec.from, `${key}: the sweep would not move it`);
    assert.ok(Number.isFinite(spec.to), `${key}: moved to ${spec.to}`);
    // Fractions must stay fractions: a probability perturbed to 1.16 would be
    // testing a nonsense world, and might "work" for that reason.
    if (spec.from > 0 && spec.from <= 1 && SPECIAL[key]?.to === undefined) {
      assert.ok(spec.to > 0 && spec.to <= 1, `${key}: perturbed out of the unit interval to ${spec.to}`);
    }
  }
  // Every exception carries a written reason. An unexplained special case is
  // how a sweep quietly stops testing something.
  for (const [key, s] of Object.entries(SPECIAL)) {
    assert.ok(KEYS.includes(key), `SPECIAL has ${key}, which is not a numeric config key`);
    assert.ok(s.why && s.why.length >= 10, `${key}: exception with no reason given`);
  }
});

test("every constant of the simulation is a lever on the simulation", () => {
  // The main event. Each constant is moved once, in a world where it is live,
  // and the pond must move — measured by the same bit-exact hash the golden
  // test uses, so "moved" means moved, not "moved noticeably".
  const keys = byChannel("world");
  assert.ok(keys.length >= 74, `only ${keys.length} constants on the world channel`);
  for (const key of keys) {
    const r = sweepLever(key);
    assert.ok(
      r.worldAt > 0,
      `${key}: ${r.from} -> ${r.to} changed nothing in ${r.ticks} ticks. Either it is doing ` +
        "nothing (v1.27's clipped cap, v1.29's unreachable ceiling), or it needs a world where " +
        "it can bite — add it to SPECIAL in src/levers.js with the reason."
    );
  }
});

test("the tree of life's constants move the view and never the pond", () => {
  // phylogeny.js has said since v1.2 that "nothing here feeds back into the
  // simulation". Thirty-six releases later, this is the first thing that checks
  // it — and it checks both halves at once, because a constant that moves
  // neither channel is dead and one that moves both is not an observer.
  const keys = byChannel("observer");
  assert.deepEqual(keys, [
    "neatCompatThreshold",
    "speciationDistance",
    "phylogenySampleInterval",
    "phylogenyHistory",
  ]);
  for (const key of keys) {
    const r = sweepLever(key);
    assert.ok(r.observerAt > 0, `${key}: moving it changed nothing the observer saw in ${r.ticks} ticks`);
    assert.equal(
      r.worldAt,
      -1,
      `${key}: an observation-only constant reached the simulation at tick ${r.worldAt} — ` +
        "the tree of life is meant to watch the pond, not steer it"
    );
  }
});

test("how often a caller steps the world is not a property of the world", () => {
  const r = sweepLever("stepsPerFrame");
  assert.equal(r.channel, "ui");
  assert.equal(r.worldAt, -1, "World.step read stepsPerFrame");
  assert.equal(r.observerAt, -1, "the phylogeny read stepsPerFrame");
});

test("two of this project's bounds never bind, and the sweep knows which way to push", () => {
  // The finding that made the sweep two-sided. `populationMax` is a ceiling the
  // default pond peaks far below, and `weightClamp` is a bound learned weights
  // never approach, so *raising* either is a no-op and a one-directional sweep
  // would have filed both as dead. Pinned in both directions: raising changes
  // nothing, tightening changes the world.
  //
  // `energyMax` looks like a third and is not — see the test below it, which is
  // the correction this release owes v1.29.
  const cases = [
    { key: "populationMax", up: 891, down: 60, world: {}, ticks: 700 },
    { key: "weightClamp", up: 11, down: 0.05, world: { plasticity: true }, ticks: 600 },
  ];
  for (const c of cases) {
    for (const [dir, value, expect] of [
      ["raised", c.up, "unchanged"],
      ["tightened", c.down, "changed"],
    ]) {
      const base = { seed: 314, ...c.world };
      const control = new World(makeConfig(base));
      const moved = new World(makeConfig({ ...base, [c.key]: value }));
      let at = -1;
      for (let i = 0; i < c.ticks && at < 0; i++) {
        control.step();
        moved.step();
        if (stateFingerprint(moved) !== stateFingerprint(control)) at = i + 1;
      }
      if (expect === "unchanged") {
        assert.equal(at, -1, `${c.key} ${dir} to ${value} moved the pond at tick ${at} — the ceiling now binds`);
      } else {
        assert.ok(at > 0, `${c.key} ${dir} to ${value} changed nothing: the bound is not applied at all`);
      }
    }
  }
});

test("energyMax has a dead clamp and a live divisor, and only one of those was known", () => {
  // The correction. v1.29 measured the *clamp* on `energyMax` and found it
  // unreachable — a creature always splits at `reproduceThreshold` (160) before
  // it can fill to 220 — and wrote the conclusion up as "a parameter with no
  // effect whatsoever" in `config.js`, in `docs/SCIENCE.md` and in
  // `test/energy.test.js`. The constant sweep moved it and the pond moved on
  // tick one, because `creature.js` divides a creature's *sense of its own
  // energy* by it: `inp[1] = (energy / energyMax) * 2 - 1`. The clamp is dead;
  // the number is not, and it was never only a clamp.
  //
  // Both halves are pinned here, because the interesting failure is one of them
  // changing without the other: a spill above zero means the ceiling started
  // binding, and a world that stops moving means the sense stopped being scaled.
  const ticks = 600;
  const control = new World(makeConfig({ seed: 314 }));
  const moved = new World(makeConfig({ seed: 314, energyMax: 301 }));
  let at = -1;
  for (let i = 0; i < ticks; i++) {
    control.step();
    moved.step();
    if (at < 0 && stateFingerprint(moved) !== stateFingerprint(control)) at = i + 1;
  }
  assert.equal(at, 1, "moving energyMax no longer reaches the brain on the first tick");
  for (const w of [control, moved]) {
    assert.ok(
      Math.abs(w.energy.spilled) < 1e-6 * w.config.foodEnergy,
      `the clamp was reached: spilled ${w.energy.spilled}`
    );
  }

  // And the mechanism, directly: one creature, one unchanged state, two
  // ceilings, two different numbers arriving at input 1.
  const probe = new World(makeConfig({ seed: 314 }));
  const c = probe.creatures[0];
  c.energy = 100;
  const senseUnder = (energyMax) => {
    c.config = makeConfig({ seed: 314, energyMax });
    c.sense(null, 0, null, 0, null, 0);
    return c._in[1];
  };
  // Math.fround because the input vector is a Float32Array.
  assert.equal(senseUnder(220), Math.fround((100 / 220) * 2 - 1));
  assert.notEqual(
    senseUnder(301),
    senseUnder(220),
    "the energy sense is no longer scaled by energyMax"
  );
});

test("the observation hash sees the tree and is blind to how it is stored", () => {
  const w = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 120; i++) w.step();
  const before = observationFingerprint(w);
  assert.equal(observationFingerprint(w), before, "not stable across calls");
  assert.notEqual(before, stateFingerprint(w), "the two hashes collide on the same world");

  // What it must see: the shape of the tree, and the abundances under it.
  const s = w.phylogeny.species[0];
  for (const field of ["count", "peak", "extinctTick", "birthTick", "hue"]) {
    const original = s[field];
    s[field] = original + 1;
    assert.notEqual(observationFingerprint(w), before, `blind to a species' ${field}`);
    s[field] = original;
  }
  assert.equal(observationFingerprint(w), before, "not restored");

  const snap = w.phylogeny.snapshots[0];
  const firstId = [...snap.counts.keys()][0];
  snap.counts.set(firstId, snap.counts.get(firstId) + 1);
  assert.notEqual(observationFingerprint(w), before, "blind to an abundance sample");
  snap.counts.set(firstId, snap.counts.get(firstId) - 1);

  // What it must not see: representation. A species' representative genome is
  // the same kind of thing the trajectory hash leaves out, and for the same
  // reason — it grows a slot whenever a release adds a gene.
  s.rep.data[0] += 1;
  assert.equal(observationFingerprint(w), before, "the observation hash read a representative genome");
});

test("observing the observer cannot change either", () => {
  // The v1.33 rule: an observer that alters what it observes is not an observer.
  const w = new World(makeConfig({ seed: 8 }));
  for (let i = 0; i < 20; i++) w.step();
  let draws = 0;
  const real = w.rng.next;
  w.rng.next = () => {
    draws++;
    return real();
  };
  observationFingerprint(w);
  assert.equal(draws, 0, "hashing the tree of life drew a random number");
  w.rng.next = real;

  const observed = new World(makeConfig({ seed: 8 }));
  const control = new World(makeConfig({ seed: 8 }));
  for (let i = 0; i < 200; i++) {
    observed.step();
    observationFingerprint(observed);
    control.step();
  }
  assert.equal(observationFingerprint(observed), observationFingerprint(control));
  assert.equal(stateFingerprint(observed), stateFingerprint(control));
});

test("the perturbation keeps a number meaningful", () => {
  assert.equal(perturb(0), 0.5, "a rate switched off by being zero must be switched on");
  assert.equal(perturb(4), 5, "an integer count must stay an integer");
  assert.ok(perturb(0.85) < 1 && perturb(0.85) > 0, "a fraction near its ceiling must move down, not out");
  assert.ok(perturb(0.997) < 1, "a decay factor must stay under one");
  for (const v of Object.values(DEFAULT_CONFIG)) {
    if (typeof v !== "number") continue;
    assert.notEqual(perturb(v), v, `perturb(${v}) is a no-op`);
  }
});
