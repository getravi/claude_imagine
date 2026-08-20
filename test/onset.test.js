// onset.test.js — when each of this project's rules first reaches the pond.
//
// The table below is the release's finding, so it is a *record* rather than a
// threshold: every flag's verdict and the tick it parts its arm, pinned on the
// default seed. A change that moves any of them is a change to what a mechanic
// does, and it should have to say so in `CHANGELOG.md` before the number moves
// here (directive 0's rule, one instrument over).
//
// Five claims:
//
//   1. **The inventory is derived.** Every boolean in `config.js` is swept, and
//      the table has to cover exactly them — a flag added in a later release is
//      a red build until somebody classifies it. The two older sweeps read
//      their inventory as "every key whose value is `false`", which is why the
//      four default-on flags had never been in either.
//   2. **The record.** The verdict and the trajectory onset for all twenty-five.
//   3. **Alignment and an identical start are the same fact** — on everything
//      this project ships today. The `built` verdict exists for the flag that
//      breaks it, and this asserts none has yet.
//   4. **The strict hash runs ahead of the pond**, on four flags, by 21 to 246
//      ticks. Those are the readings a sweep hashing `stateFingerprint` records
//      as "the rule reached the simulation" while every creature and every
//      pellet is still in exactly the place it would have been.
//   5. **The control, both arms.** Scrambling a sense's whole gene block on
//      every founder does nothing at all in the pond that sense is swept in —
//      and does something within 250 ticks the moment the sense has anything to
//      read. A probe that only ever returns "no" is not a control.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { AUX_ORDER } from "../src/genome.js";
import {
  DEFAULT_BUDGET,
  DEFAULT_SEED,
  SPECIAL,
  VERDICTS,
  flagKeys,
  flagSpec,
  flagOnset,
  sweepOnsets,
  blockOnset,
} from "../src/onset.js";

/**
 * Every flag, its verdict, and the tick its arm parts on the trajectory
 * channel at the module's own budget. `-1` is a rule whose ecology never
 * arrived inside the budget.
 */
const RECORD = {
  // Default-on. None of these four had ever been swept by anything.
  seasons: ["fires", 21],
  foodPatches: ["resampled", 0],
  autoReseed: ["fires", 200],
  predation: ["fires", 236],
  // Opt-in.
  foodRegrowth: ["fires", 1],
  terrain: ["resampled", 0],
  groundSense: ["resampled", 0],
  barriers: ["resampled", 0],
  barrierOcclusion: ["fires", 1],
  wallSense: ["resampled", 0],
  detritus: ["fires", 246],
  bodyCollision: ["fires", 53],
  massWeightedShove: ["fires", 53],
  exactVision: ["fires", 1],
  scavenging: ["fires", 244],
  licensedDietCost: ["fires", 1],
  kinRecognition: ["mute", -1],
  dayNightCycle: ["fires", 24],
  disease: ["fires", 901],
  signalling: ["resampled", 0],
  deathIsFinal: ["mute", -1],
  shuffleTurnOrder: ["fires", 1],
  plasticity: ["fires", 80],
  evolvableTopology: ["resampled", 0],
  sexualReproduction: ["fires", 103],
};

/** One sweep of the default pond, shared by the tests that only read it. */
const SWEEP = sweepOnsets();
const byKey = Object.fromEntries(SWEEP.map((r) => [r.key, r]));

test("the inventory is the config's, and every exception carries a reason", () => {
  const keys = flagKeys();
  assert.ok(keys.length >= 25, `only found ${keys.length} flags in config.js`);
  for (const k of keys) assert.equal(typeof DEFAULT_CONFIG[k], "boolean");
  // Both ways round, so neither a new flag nor a deleted one can pass quietly.
  assert.deepEqual(keys.slice().sort(), Object.keys(RECORD).sort());

  // The four the older sweeps could not see: their inventory is "every key
  // whose value is false", and these are the ones whose value is true.
  const defaultOn = keys.filter((k) => DEFAULT_CONFIG[k] === true);
  assert.deepEqual(defaultOn.sort(), ["autoReseed", "foodPatches", "predation", "seasons"]);
  for (const k of defaultOn) assert.equal(flagSpec(k).to, false, `${k} is flipped away from its default`);

  for (const [key, s] of Object.entries(SPECIAL)) {
    assert.ok(keys.includes(key), `SPECIAL has ${key}, which is not a flag`);
    assert.ok(s.why && s.why.length >= 10, `${key}: exception with no reason given`);
  }
});

test("every rule's onset, recorded", () => {
  for (const r of SWEEP) {
    const [verdict, at] = RECORD[r.key];
    assert.ok(VERDICTS.includes(r.verdict), `${r.key}: unknown verdict ${r.verdict}`);
    assert.equal(
      r.verdict,
      verdict,
      `${r.key}: was ${verdict}, is now ${r.verdict}. That is a change to what the mechanic does ` +
        "(or to what a flag flip can prove about it) — say so in CHANGELOG.md before moving this table."
    );
    assert.equal(
      r.at.trajectory,
      at,
      `${r.key}: parted its arm at tick ${r.at.trajectory}, recorded at ${at}`
    );
  }
});

test("seven flags flip into a different draw of the world, not a changed one", () => {
  // `groundSense`, `wallSense` and `signalling` each add twelve genes to every
  // founder; `evolvableTopology` builds a different brain; `terrain`,
  // `barriers` and `foodPatches` lay out the pond before anybody is placed in
  // it. Every one of them shifts the world RNG, so the arm with the flag on is
  // a *sample*, and no divergence in it attributes to the rule.
  const resampled = SWEEP.filter((r) => r.verdict === "resampled").map((r) => r.key);
  assert.deepEqual(resampled.sort(), [
    "barriers",
    "evolvableTopology",
    "foodPatches",
    "groundSense",
    "signalling",
    "terrain",
    "wallSense",
  ]);

  // Not one founder survives the flip in place. A rule added to a world moves
  // what the rule touches; a re-cut random stream moves everybody.
  for (const key of ["groundSense", "wallSense", "signalling", "evolvableTopology"]) {
    const off = new World(makeConfig({ seed: DEFAULT_SEED }));
    const on = new World(makeConfig({ seed: DEFAULT_SEED, [key]: true }));
    assert.equal(on.creatures.length, off.creatures.length);
    const stayed = off.creatures.filter((c, i) => c.x === on.creatures[i].x && c.y === on.creatures[i].y);
    assert.equal(stayed.length, 0, `${key}: ${stayed.length} founders were placed where they had been`);
  }
});

test("stream alignment and an identical starting pond are the same fact", () => {
  // Nothing this project ships builds a different pond out of the same draws.
  // If something ever does, `flagOnset` reports it as `built` rather than
  // filing it under either of the two verdicts that would be wrong for it, and
  // this assertion is where it announces itself.
  for (const r of SWEEP) {
    assert.equal(
      r.aligned,
      !r.builtApart.trajectory,
      `${r.key}: streams ${r.aligned ? "in step" : "apart"} and the pond ` +
        `${r.builtApart.trajectory ? "already differs" : "is identical"} — a "built" case has arrived`
    );
    assert.notEqual(r.verdict, "built", `${r.key}: see above`);
  }
});

test("the strict hash reaches the simulation before the simulation moves", () => {
  // A hash that walks every field a creature carries sees a rule the moment it
  // writes a number down. `trajectoryFingerprint` — where everything actually
  // is, the invariant the golden tests carry across versions — sees it when
  // somebody moves. On four flags those are different ticks, and it is the
  // strict hash that both older sweeps use.
  const gap = SWEEP.filter((r) => r.at.state >= 0 && r.at.trajectory > r.at.state);
  assert.deepEqual(
    gap.map((r) => [r.key, r.at.state, r.at.trajectory]),
    [
      ["seasons", 2, 21],
      ["detritus", 0, 246],
      ["dayNightCycle", 2, 24],
      ["plasticity", 0, 80],
    ]
  );
  // And never the other way: the strict hash reads a superset of the blind one,
  // so it cannot be the later of the two.
  for (const r of SWEEP) {
    if (r.at.trajectory < 0) continue;
    assert.ok(
      r.at.state >= 0 && r.at.state <= r.at.trajectory,
      `${r.key}: the strict hash noticed at ${r.at.state}, the blind one at ${r.at.trajectory}`
    );
  }
});

test("two senses cannot move the pond they are swept in", () => {
  // The control for the two `resampled` verdicts that matter most.
  // `config.js` says the foot "reads exactly 0 in a world with no terrain" and
  // the whisker "reads exactly 0 in a world with no rock in it at all" — and
  // the default pond has neither, which is the pond `fingerprint.test.js`
  // proves both are levers in. So: build that pond twice, overwrite the whole
  // gene block on every founder of one copy, and nothing happens. The genes are
  // drawn, inherited and mutated, and there is no world-line between them and a
  // motor command.
  assert.equal(blockOnset("foot", { groundSense: true }).at, -1);
  assert.equal(blockOnset("whisker", { wallSense: true }).at, -1);

  // The other arm, without which the paragraph above is a broken probe. Give
  // each sense something to read and the same scramble parts the pond well
  // inside the same budget.
  const feels = blockOnset("foot", { groundSense: true, terrain: true }).at;
  const feelsRock = blockOnset("whisker", { wallSense: true, barriers: true }).at;
  const hears = blockOnset("ear", { signalling: true }).at;
  for (const [name, at] of [["foot", feels], ["whisker", feelsRock], ["ear", hears]]) {
    assert.ok(at > 0 && at <= DEFAULT_BUDGET, `${name}: scrambling it changed nothing in ${DEFAULT_BUDGET} ticks`);
  }

  // The ear is the third block and needs no world of its own: a voice carries
  // in an empty pond, so signalling is live the moment it is switched on.
  assert.ok(hears < feelsRock, `the ear (${hears}) should be quicker than the whisker (${feelsRock})`);
});

test("the block control is derived from the genome's own list, and refuses an undrawn block", () => {
  for (const b of AUX_ORDER) {
    assert.equal(typeof DEFAULT_CONFIG[b.flag], "boolean", `${b.name}: ${b.flag} is not a flag`);
    // Scrambling genes that were never drawn is a question about zeroes.
    assert.throws(() => blockOnset(b.name, {}, { ticks: 1 }), /undrawn/, `${b.name} ran with ${b.flag} off`);
  }
  assert.throws(() => blockOnset("tail", { groundSense: true }), /no aux block/);
});

test("the sweep is a pure observer: reading a pond's stream is a draw", () => {
  // The alignment probe takes a number out of the RNG, which moves the world it
  // took it from — that is why it runs on throwaway copies, and this is what
  // keeps it there. A world built after the whole sweep has run must be the
  // same world as one built before it, and the config it was swept from must
  // come back untouched.
  const cfg = makeConfig({ seed: DEFAULT_SEED });
  const before = new World(cfg);
  for (let i = 0; i < 60; i++) before.step();
  const defaults = JSON.stringify(DEFAULT_CONFIG);

  sweepOnsets(["licensedDietCost", "shuffleTurnOrder"], { ticks: 60 });
  blockOnset("ear", { signalling: true }, { ticks: 60 });

  const after = new World(cfg);
  for (let i = 0; i < 60; i++) after.step();
  assert.deepEqual(
    after.creatures.map((c) => [c.x, c.y]),
    before.creatures.map((c) => [c.x, c.y])
  );
  assert.equal(JSON.stringify(DEFAULT_CONFIG), defaults, "the sweep wrote to the config it reads");
});

test("a budget is a claim about a distribution, measured on one draw", () => {
  // `levers.js` gives a constant 600 ticks and `fingerprint.test.js` gives a
  // flag 1,000, both chosen on seed 314. Predation's onset there is 236 and on
  // seed 51 it is 636 — past the first budget. The point is not that 600 is
  // wrong; it is that nothing had ever measured the spread it is a bound on.
  assert.equal(byKey.predation.at.trajectory, 236);
  assert.equal(flagOnset("predation", { seed: 51, ticks: 700 }).at.trajectory, 636);
  assert.ok(636 > DEFAULT_BUDGET, "the seed that overruns the constant sweep's budget no longer does");

  // The other half of the same reading: an onset set by a clock does not move
  // with the seed at all. `diseaseReintroduce` is 900, and the first case lands
  // at 901 on both seeds — the one that spreads predation by 2.7x and the one
  // it was measured on.
  assert.equal(byKey.disease.at.trajectory, 901);
  assert.equal(flagOnset("disease", { seed: 51 }).at.trajectory, 901);
});

test("kin recognition is mute here and not anywhere", () => {
  // `mute` is a statement about a pond, and the way it drifts into "dead" is by
  // never being read anywhere else. v1.92 found kin recognition parting its arm
  // on t1,983 of seed 512 — the seed the `One Big Family` scenario ships — and
  // this instrument, written eighteen releases later out of two other sweeps,
  // reproduces the tick exactly.
  assert.equal(byKey.kinRecognition.verdict, "mute");
  assert.equal(byKey.deathIsFinal.verdict, "mute");
  assert.equal(flagOnset("kinRecognition", { seed: 512, ticks: 2000 }).at.trajectory, 1983);
});
