// Tests for the instruments that enforce the second prime directive — the ones
// every other determinism test in this suite is now expressed in terms of.
//
// v1.36 built the fingerprints and asked the right question of one of them:
// *what must this be blind to?* `trajectoryFingerprint` must not see a new gene
// or a new field, because almost every release adds one, and there is a test
// saying so. The complementary question — what must `stateFingerprint` **not**
// be blind to? — was never asked, and the answer turned out to be nobody's
// list: sixteen of a creature's twenty-eight fields, chosen in v1.36 and never
// revisited, while `metabolismScale`, `phase` and `lastBiteAge` sat outside and
// moved the pond within three ticks when nudged.
//
// So this file is that missing question, written the way `levers.js` writes its
// own: not "are these particular fields hashed" but **"is every field either
// hashed or excluded on purpose"**, walked off a live creature so that a field
// added in a later release fails here on the day it lands rather than on the
// day somebody remembers. It is the same instrument-checks-instrument move the
// suite already makes for `grid.js` (v1.32), `rendershot.js` (v1.50) and the
// constants (v1.38), pointed at the hash the other three depend on.

import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import {
  stateFingerprint,
  trajectoryFingerprint,
  observationFingerprint,
  drawStream,
  CREATURE_HASHED,
  CREATURE_UNHASHED,
} from "../src/fingerprint.js";
import { assertUnaffected } from "./support/paired.js";

/** Not state: two object references, a config, and two scratch buffers. */
const STRUCTURAL = new Set(["config", "genome", "brain", "_in", "_aux"]);

/** A warmed pond, so the fields carry lived-in values rather than their defaults. */
function warm(overrides = {}, ticks = 120) {
  const w = new World(makeConfig({ seed: 21, ...overrides }));
  for (let i = 0; i < ticks; i++) w.step();
  return w;
}

/** Move a value to a different one of the same kind. */
function nudge(v) {
  if (typeof v === "boolean") return !v;
  // A value already at infinity cannot be moved by adding to it, so an additive
  // nudge is blind to exactly the fields that rest there — `rockAhead` is
  // `Infinity` in every world without a whisker, and reported this hash blind to
  // a field it hashes. `src/levers.js`'s `perturb` has the same case for the
  // same reason.
  if (typeof v === "number") return Number.isFinite(v) ? v + 1 : 0;
  return "a-different-string";
}

test("every field a creature carries is either hashed or excluded with a reason", () => {
  const w = warm();
  const fields = Object.keys(w.creatures[0]).filter((k) => !STRUCTURAL.has(k));
  const known = new Set([...CREATURE_HASHED, ...Object.keys(CREATURE_UNHASHED)]);

  for (const f of fields) {
    assert.ok(
      known.has(f),
      `creature.${f} is in neither list. It is live state that the strongest ` +
        "determinism instrument in this project cannot see. Either hash it in " +
        "stateFingerprint and add it to CREATURE_HASHED, or add it to " +
        "CREATURE_UNHASHED with the reason it must stay outside."
    );
  }
  // And the other direction, so the list cannot outlive the field it names.
  for (const f of CREATURE_HASHED) {
    assert.ok(fields.includes(f), `CREATURE_HASHED names ${f}, which no creature carries`);
  }
  for (const f of Object.keys(CREATURE_UNHASHED)) {
    assert.ok(fields.includes(f), `CREATURE_UNHASHED names ${f}, which no creature carries`);
  }
});

test("the state hash can see every field it claims to", () => {
  // The list is a claim; this is the claim measured. Perturbing a field the hash
  // names must move the digest — otherwise the name is decoration.
  const w = warm();
  for (const f of CREATURE_HASHED) {
    const c = w.creatures[0];
    const before = stateFingerprint(w);
    const original = c[f];
    c[f] = nudge(original);
    assert.notEqual(stateFingerprint(w), before, `the state hash is blind to creature.${f}`);
    c[f] = original;
    assert.equal(stateFingerprint(w), before, `restoring creature.${f} did not restore the hash`);
  }
});

test("the state hash is blind to the two fields it must not see", () => {
  // Pin the blindness, not only the sight (v1.36). `id` counts creatures ever
  // constructed *in this process*, so the second world built in a test file
  // never agrees with the first; `speciesId` is the observer's handwriting.
  const w = warm();
  for (const f of Object.keys(CREATURE_UNHASHED)) {
    const before = stateFingerprint(w);
    w.creatures[0][f] = nudge(w.creatures[0][f]);
    assert.equal(stateFingerprint(w), before, `the state hash sees creature.${f}: ${CREATURE_UNHASHED[f]}`);
  }

  // The reason `id` is on that list, stated as a fact about this process rather
  // than as a comment: two identical ponds, two disjoint sets of ids.
  const a = new World(makeConfig({ seed: 21 }));
  const b = new World(makeConfig({ seed: 21 }));
  assert.equal(stateFingerprint(a), stateFingerprint(b), "two same-seed worlds are not identical");
  assert.notEqual(a.creatures[0].id, b.creatures[0].id, "ids stopped being process-global");
});

test("the three fields that were outside the hash all move the pond", () => {
  // The regression test that knows what the bug looked like (v1.25). These were
  // omitted from v1.36 to v1.52; each is nudged here in a real pond and each
  // moves the world's future, which is what makes the omission a defect rather
  // than an untidiness. The horizon is generous on purpose: the claim is "this
  // reaches the simulation", not "it reaches it on tick 3".
  for (const [field, delta] of [["metabolismScale", 0.25], ["phase", 0.25], ["lastBiteAge", 400]]) {
    const a = warm({}, 300);
    const b = warm({}, 300);
    assert.equal(stateFingerprint(a), stateFingerprint(b), "the warmed ponds already differ");

    for (const c of a.creatures) c[field] += delta;
    assert.notEqual(stateFingerprint(a), stateFingerprint(b), `the state hash misses creature.${field}`);

    let moved = -1;
    for (let i = 0; i < 200 && moved < 0; i++) {
      a.step();
      b.step();
      if (trajectoryFingerprint(a) !== trajectoryFingerprint(b)) moved = i + 1;
    }
    assert.ok(moved > 0, `creature.${field} changed nothing in 200 ticks — is it still read?`);
  }
});

test("a discarded draw is invisible to every fingerprint and visible to the stream", () => {
  // The failure mode the fourth channel exists for, staged rather than waited
  // for (v1.45). A feature that is switched off and takes a number it does not
  // use is the canonical violation of directive 2, and at the instant it happens
  // there is nothing to see: same creatures, same pellets, same tree.
  const a = warm({}, 200);
  const b = warm({}, 200);
  const drawsA = drawStream(a.rng);
  const drawsB = drawStream(b.rng);

  a.rng.next(); // the whole bug, in one line

  assert.equal(stateFingerprint(a), stateFingerprint(b), "the pond changed, so this is not the bug");
  assert.equal(trajectoryFingerprint(a), trajectoryFingerprint(b));
  assert.equal(observationFingerprint(a), observationFingerprint(b));
  assert.notEqual(drawsA.count, drawsB.count, "the recorder missed a draw");
  assert.notEqual(drawsA.digest(), drawsB.digest(), "the stream hash missed a draw");

  // And it is a real divergence, not a bookkeeping one: the two worlds part.
  let moved = -1;
  for (let i = 0; i < 200 && moved < 0; i++) {
    a.step();
    b.step();
    if (trajectoryFingerprint(a) !== trajectoryFingerprint(b)) moved = i + 1;
  }
  assert.ok(moved > 0, "one stolen draw changed nothing at all in 200 ticks");
});

test("recording the stream cannot change it", () => {
  // An observer that alters what it observes is not an observer (v1.33). The
  // recorder replaces `rng.next` in place, which is exactly the shape of a bug,
  // so: a recorded world must be bit-for-bit an unrecorded one.
  const recorded = new World(makeConfig({ seed: 77 }));
  const plain = new World(makeConfig({ seed: 77 }));
  const draws = drawStream(recorded.rng);
  for (let i = 0; i < 300; i++) {
    recorded.step();
    plain.step();
  }
  assert.equal(stateFingerprint(recorded), stateFingerprint(plain));
  assert.ok(draws.count > 0, "the recorder saw nothing");
  assert.equal(draws.digest(), draws.digest(), "the digest is not stable across calls");
});

test("the paired assertion fails on each thing it promises to catch", () => {
  // A helper twelve tests delegate to is an accelerator, and v1.32's rule about
  // accelerators applies: what does it return that the exhaustive version
  // wouldn't? Each arm below breaks exactly one of its channels and the helper
  // has to notice — a green suite full of delegated assertions is worthless if
  // the delegate can only say yes.
  const broken = [
    ["a stolen draw", (w) => w.rng.next()],
    ["a moved creature", (w) => (w.creatures[0].y += 1e-9)],
    // `hue` is carried from birth and never rewritten, is drawn and nothing
    // else, and is therefore exactly the leak the other five channels cannot
    // see: a feature that quietly rewrites a creature and changes no outcome.
    ["a field only the state hash sees", (w) => w.creatures.forEach((c) => (c.hue += 1))],
    // The mirror of the line above, on the fifth channel: a counter is not a
    // place, so no picture of the pond can fail on it. `test/books.test.js`
    // stages nine more of these.
    ["a miscounted birth", (w) => (w.stats.births += 1)],
    ["a miscount no fingerprint used to reach", (w) => (w.stats.scavenged += 1)],
    // And the same mirror on the sixth (v1.94). A narration is an output too,
    // so a line spoken into one pond and not the other moves nothing anybody
    // can photograph; a latch is the version of it with no line at all, and it
    // decides what the pond will be *allowed* to say for the rest of the run.
    ["a line only the narrator heard", (w) => w.chronicle._push(w.tick, "🫥", "test", "said here and nowhere else")],
    ["a latch that silences a later line", (w) => (w.chronicle._firstKill = true)],
    ["a draw stolen from the narrator's own stream", (w) => w.chronicle.rng.next()],
  ];
  for (const [label, sabotage] of broken) {
    const a = new World(makeConfig({ seed: 21 }));
    const b = new World(makeConfig({ seed: 21 }));
    // Sabotage on the first tick, so every channel has the same chance to see it.
    const realStep = a.step.bind(a);
    let first = true;
    a.step = () => {
      realStep();
      if (first) {
        sabotage(a);
        first = false;
      }
    };
    assert.throws(
      () => assertUnaffected(a, b, 60, "sabotage"),
      /sabotage/,
      `the paired assertion did not notice ${label}`
    );
  }
});
