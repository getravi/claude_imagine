// inspect.test.js — the panel that describes one creature.
//
// Three claims, in order of how badly they fail.
//
//   1. **Completeness.** A creature carries 33 own properties. The panel is the
//      only surface in this project whose subject is a single object, so "what
//      has this view never heard of?" has an exact answer here rather than an
//      inventory — and the answer is checked against a live creature, not
//      against my reading of `creature.js` (v1.59: enumerate a class from the
//      object, not from the source that declares it).
//   2. **Liveness.** A row whose value changes while you watch and that
//      `main.js` does not patch is a frozen number made of real data, which is
//      this project's favourite bug (v1.22, v1.23). So the test does not take
//      the `live` flags on trust: it runs a pond and asserts that every fact
//      which actually moved is marked.
//   3. **Purity.** Reading the panel must not move the pond — including the
//      Underfoot row, which puts a hypothetical to the creature's own brain. A
//      plastic brain learns from every forward pass, so this is the one readout
//      here that could quietly train the thing on screen.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";
import {
  creatureFacts,
  healthText,
  voiceText,
  FIELD_REPORTS,
  FIELD_SILENT,
} from "../src/inspect.js";

/** Every flag that adds a row, so the walk sees the panel at its widest. */
const ALL_ON = {
  seed: 314,
  disease: true,
  signalling: true,
  groundSense: true,
  terrain: true,
  plasticity: true,
};

const keysOf = (c, cfg) => creatureFacts(c, cfg).map((f) => f.key);

test("every field a creature carries is either reported or named as silent", () => {
  // Warmed rather than fresh: a completeness list read off a constructor is
  // exactly as good as the moment it is taken at, and six of `Stats`'s fields
  // taught this file that lesson in v1.59. Every one of a creature's 33 is set
  // in its constructor today; stepping the pond is what makes that a finding
  // rather than an assumption.
  const world = new World(makeConfig(ALL_ON));
  for (let i = 0; i < 600; i++) world.step();
  const c = world.creatures[0];
  assert.ok(c, "the pond died before anything could be inspected");

  for (const name of Object.getOwnPropertyNames(c)) {
    const reported = Object.prototype.hasOwnProperty.call(FIELD_REPORTS, name);
    const silent = Object.prototype.hasOwnProperty.call(FIELD_SILENT, name);
    assert.ok(
      reported || silent,
      `\`${name}\` is a field the inspector's coverage table has never heard of. ` +
        `Show it in a row (FIELD_REPORTS) or say why it is not shown (FIELD_SILENT).`
    );
    assert.ok(!(reported && silent), `\`${name}\` is in both coverage tables`);
  }

  // The other direction: an entry naming a field that no longer exists is the
  // v1.61 failure — an instrument holding a copy of something that has moved,
  // and printing `ok` for it.
  const live = new Set(Object.getOwnPropertyNames(c));
  for (const name of [...Object.keys(FIELD_REPORTS), ...Object.keys(FIELD_SILENT)]) {
    assert.ok(live.has(name), `the coverage table names \`${name}\`, which no creature carries`);
  }

  // The count is pinned so that a release which quietly stops showing something
  // has to say so here first.
  assert.equal(Object.keys(FIELD_REPORTS).length, 18);
  assert.equal(Object.keys(FIELD_SILENT).length, 15);
  assert.equal(Object.getOwnPropertyNames(c).length, 33);
});

test("a mechanic that is off gets no row at all", () => {
  const off = new World(makeConfig({ seed: 314 }));
  off.step();
  const bare = keysOf(off.creatures[0], off.config);
  assert.deepEqual(bare, [
    "generation",
    "age",
    "energy",
    "children",
    "size",
    "metabolism",
    "diet",
  ]);

  const on = new World(makeConfig(ALL_ON));
  on.step();
  assert.deepEqual(keysOf(on.creatures[0], on.config), [...bare, "foot", "health", "voice"]);
});

test("each row is shown once, under a key an element can be given", () => {
  const world = new World(makeConfig(ALL_ON));
  world.step();
  const facts = creatureFacts(world.creatures[0], world.config);
  const keys = facts.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length, "two rows share a key");
  for (const f of facts) {
    assert.match(f.key, /^[a-z]+$/, `\`${f.key}\` is not usable as an element id`);
    assert.ok(f.term.length > 0 && f.value.length > 0, `${f.key} has an empty half`);
  }
});

// ---- the three states of contagion ----
//
// Staged rather than waited for (v1.45): an epidemic reaches all three states
// eventually, and a test that waits for it describes the *frequency* of the
// rule instead of the rule.

test("the health row names where a creature is in the epidemic", () => {
  const cfg = makeConfig({ seed: 7, disease: true });
  const world = new World(cfg);
  world.step();
  const c = world.creatures[0];

  c.infected = false;
  c.immune = false;
  c.infectedAtAge = -1;
  assert.equal(healthText(c, cfg), "susceptible — never infected");

  c.infected = true;
  c.infectedAtAge = c.age;
  assert.equal(healthText(c, cfg), `sick — ${cfg.diseaseDuration} ticks to recover`);

  c.infectedAtAge = c.age - (cfg.diseaseDuration - 1);
  assert.equal(healthText(c, cfg), "sick — 1 tick to recover");

  // The last frame of an illness is a word, not a zero: recovery is judged at
  // the top of the next tick, against this age.
  c.infectedAtAge = c.age - cfg.diseaseDuration;
  assert.equal(healthText(c, cfg), "sick — recovering");

  c.infected = false;
  c.immune = true;
  c.infectedAtAge = 40;
  assert.equal(
    healthText(c, cfg),
    `immune — recovered at age ${40 + cfg.diseaseDuration}`
  );
});

test("the countdown reaches zero on the tick the world recovers it", () => {
  // The row is derived from `infectedAtAge` and `diseaseDuration`; the world
  // recovers on `age - infectedAtAge >= diseaseDuration`. Two expressions of one
  // rule, so the useful assertion is that they agree tick for tick rather than
  // that either is plausible.
  const cfg = makeConfig({ seed: 21, disease: true, diseaseDuration: 30 });
  const world = new World(cfg);
  world.step();
  const c = world.creatures[0];
  c.infected = true;
  c.immune = false;
  c.infectedAtAge = c.age;

  let sawZero = false;
  for (let i = 0; i < cfg.diseaseDuration + 5 && !c.dead; i++) {
    const before = healthText(c, cfg);
    // Fed by hand: the subject here is the countdown, and a creature that
    // starves halfway through its illness tests nothing.
    c.energy = cfg.energyStart;
    world.step();
    if (c.immune) {
      assert.equal(
        before,
        "sick — recovering",
        `recovered out of nowhere: the row said "${before}" the tick before`
      );
      sawZero = true;
      break;
    }
    assert.match(healthText(c, cfg), /^sick — (\d+ ticks? to recover|recovering)$/);
  }
  assert.ok(sawZero, "the staged infection never ran its course");
});

test("silence is a word, not a zero", () => {
  const cfg = makeConfig({ seed: 5, signalling: true });
  const world = new World(cfg);
  world.step();
  const c = world.creatures[0];
  c.signal = 0.5;
  c.heard = 0;
  assert.equal(voiceText(c), "says 0.50, hears nothing");
  c.heard = -0.25;
  assert.equal(voiceText(c), "says 0.50, hears -0.25");
});

test("every fact that moves is marked live", () => {
  // The `live` flags decide what `main.js` patches every frame; anything that
  // changes and is not patched freezes at the value it had when the panel was
  // last rebuilt — real data, wrong number, no tell. So the flags are checked
  // against what actually moves rather than against the intent behind them.
  const world = new World(makeConfig({ ...ALL_ON, seed: 101 }));
  for (let i = 0; i < 200; i++) world.step();
  const c = world.creatures.find((x) => x.children > 0) || world.creatures[0];

  const first = new Map(creatureFacts(c, world.config).map((f) => [f.key, f.value]));
  const moved = new Set();
  for (let i = 0; i < 600 && !c.dead; i++) {
    world.step();
    for (const f of creatureFacts(c, world.config)) {
      if (f.value !== first.get(f.key)) moved.add(f.key);
    }
  }
  assert.ok(moved.size > 0, "nothing in the panel changed in 600 ticks");

  const marked = new Set(
    creatureFacts(c, world.config)
      .filter((f) => f.live)
      .map((f) => f.key)
  );
  for (const key of moved) {
    assert.ok(marked.has(key), `\`${key}\` changed while nothing was patching it`);
  }
});

test("reading the panel does not move the pond", () => {
  // Plasticity is on because of the Underfoot row: it runs the creature's brain
  // on a hypothetical, and a plastic brain learns from every forward pass. The
  // state hash covers `brain.w`, so a readout that trained the thing it
  // describes fails here rather than in a screenshot six releases later.
  const cfg = () => makeConfig({ ...ALL_ON, seed: 4242, predation: true, scavenging: true });
  const quiet = new World(cfg());
  const watched = new World(cfg());

  for (let i = 0; i < 900; i++) {
    quiet.step();
    watched.step();
    for (const c of watched.creatures) creatureFacts(c, watched.config);
  }

  assert.equal(watched.creatures.length, quiet.creatures.length);
  assert.equal(stateFingerprint(watched), stateFingerprint(quiet));
  assert.equal(watched.rng.next(), quiet.rng.next());
});
