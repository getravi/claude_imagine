// paired.js — the one assertion behind "with this feature off, worlds are
// bit-for-bit unaffected".
//
// Twelve test files make that claim, and until v1.53 each made it in its own
// words: two compared a state fingerprint and counted random draws, and ten
// compared a hand-picked handful of fields. The handfuls did not agree. Five of
// them never compared `y`, so moving every creature in the pond one ULP
// sideways left them green; two compared three integers and nothing else. The
// tests were not wrong — `test/fingerprint.test.js` has swept every opt-in flag
// with the state hash since v1.36, so the promise was enforced — but ten
// separate approximations of one claim is ten places for it to drift, and each
// of them was also asserting something (the birth and death counters) that the
// hash does not cover.
//
// So: one function, four channels, and everything any of the twelve used to
// check is in it.
//
//   1. **The random sequence**, hashed from before the first tick. This is the
//      channel the other three cannot have: a feature that is off and draws a
//      number anyway leaves the pond identical at that instant and moves it
//      eight ticks later (measured, seed 21). A comparison of two states is a
//      comparison of two worlds that may have already parted.
//   2. **The state**, which since v1.53 is every field a creature carries bar
//      two named ones — see `CREATURE_UNHASHED` in `src/fingerprint.js`.
//   3. **The trajectory**, which is a subset of (2) and is asserted anyway
//      because it is the hash the golden constants are recorded from: a failure
//      naming it says the *pond* moved, not the representation.
//   4. **The observer**, so a feature that leaves the pond alone and rewrites
//      the tree of life still fails.
//
// Plus the two things a hash cannot say: that the counters agree (the ledger is
// not in any fingerprint, and ten of the twelve were checking it), and that the
// pond was alive at the end — comparing two extinct worlds proves nothing, a
// guard v1.45 added to one test and nowhere else.

import assert from "node:assert/strict";

import {
  stateFingerprint,
  trajectoryFingerprint,
  observationFingerprint,
  drawStream,
} from "../../src/fingerprint.js";

/**
 * Step two worlds in lockstep and assert the first is bit-for-bit the second.
 *
 * Both worlds must already be built and unstepped; the draw recorders are
 * attached before the first tick, so a difference in what construction *left
 * behind* in the generator shows up on the first draw either world takes.
 *
 * @param {import('../../src/world.js').World} a the world with the flag written out
 * @param {import('../../src/world.js').World} b the default world
 * @param {number} ticks how long to run them
 * @param {string} what the feature being switched off, for the failure message
 */
export function assertUnaffected(a, b, ticks, what) {
  const where = what ? `${what}: ` : "";
  assert.equal(a.tick, 0, "assertUnaffected wants two unstepped worlds");
  assert.equal(b.tick, 0, "assertUnaffected wants two unstepped worlds");
  assert.equal(
    stateFingerprint(a),
    stateFingerprint(b),
    `${where}the two worlds differed before the first tick`
  );

  const drawsA = drawStream(a.rng);
  const drawsB = drawStream(b.rng);
  for (let i = 0; i < ticks; i++) {
    a.step();
    b.step();
  }

  assert.equal(
    drawsA.count,
    drawsB.count,
    `${where}the flag being present cost ${drawsA.count - drawsB.count} random draws`
  );
  assert.equal(
    drawsA.digest(),
    drawsB.digest(),
    `${where}the same number of draws came out different — the streams have parted`
  );
  assert.equal(
    trajectoryFingerprint(a),
    trajectoryFingerprint(b),
    `${where}the pond moved after ${ticks} ticks`
  );
  assert.equal(
    stateFingerprint(a),
    stateFingerprint(b),
    `${where}the pond is in the same place and something else about it is not`
  );
  assert.equal(
    observationFingerprint(a),
    observationFingerprint(b),
    `${where}the pond is identical and the tree of life is not`
  );
  for (const counter of ["births", "deaths", "kills"]) {
    assert.equal(a.stats[counter], b.stats[counter], `${where}stats.${counter} differs`);
  }
  assert.ok(
    a.creatures.length > 0,
    `${where}both ponds were empty after ${ticks} ticks, which proves nothing`
  );
}
