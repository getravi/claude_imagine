// books.test.js — the fifth channel, and the claim it finally measures.
//
// `booksFingerprint` exists because the four channels this project already had
// are all pictures of the *pond*: where everything is, how it is represented,
// what the observer made of it, and which random numbers were spent getting
// there. A counter is none of those. Increment one and every creature is still
// where it was, so every fingerprint holds — which meant that for fifty-eight
// releases, "with this feature off, worlds are bit-for-bit unaffected" was a
// promise about the water and not about the books written beside it.
//
// The tests here are the two halves of v1.36's question asked of the new
// instrument (what must it be blind to, and what must it *not* be blind to),
// v1.53's completeness walk pointed at a second pair of objects, and the thing
// neither of those can say: that the channel is not redundant.

import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import {
  booksFingerprint,
  stateFingerprint,
  trajectoryFingerprint,
  observationFingerprint,
  drawStream,
  STATS_HASHED,
  STATS_UNHASHED,
  ENERGY_HASHED,
  ENERGY_UNHASHED,
} from "../src/fingerprint.js";

/** The two books, and the lists that claim to describe each. */
const BOOKS = [
  ["stats", (w) => w.stats, STATS_HASHED, STATS_UNHASHED],
  ["energy", (w) => w.energy, ENERGY_HASHED, ENERGY_UNHASHED],
];

/** A warmed pond, so the counters carry lived-in values rather than their defaults. */
function warm(ticks = 120, overrides = {}) {
  const w = new World(makeConfig({ seed: 21, ...overrides }));
  for (let i = 0; i < ticks; i++) w.step();
  return w;
}

/**
 * Move one field of a book to a different value of the same kind, and return
 * the undo. Numbers step by one; a collection has one of its own numbers
 * stepped, or gains an element if it is empty, because a hash that cannot see
 * inside a buffer is as blind as one that skips it.
 */
function nudgeIn(book, key) {
  const v = book[key];
  // A field standing empty is still a field, and the hash has to notice it
  // filling. `seasonLag` is the first of these: it holds `null` until the run
  // is long enough to say how far behind its year the pond is, and a book that
  // could not see the moment it stops being null would be blind to the whole
  // readout for the first ten thousand ticks of every run.
  if (v === null || v === undefined) {
    book[key] = 1;
    return () => (book[key] = v);
  }
  if (typeof v === "number") {
    book[key] = v + 1;
    return () => (book[key] = v);
  }
  if (Array.isArray(v)) {
    if (v.length === 0) {
      v.push(0);
      return () => v.pop();
    }
    const restore = nudgeInside(v[0]);
    if (restore) return restore;
    v.push(0);
    return () => v.pop();
  }
  if (v && typeof v === "object") {
    const restore = nudgeInside(v);
    if (restore) return restore;
    v.__probe = 1;
    return () => delete v.__probe;
  }
  throw new TypeError(`no idea how to nudge ${key}`);
}

/** Step the first number this object holds, one level down. Null if it holds none. */
function nudgeInside(obj) {
  if (!obj || typeof obj !== "object") return null;
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === "number") {
      const was = obj[k];
      obj[k] = was + 1;
      return () => (obj[k] = was);
    }
  }
  return null;
}

test("every field the books carry is either hashed or excluded with a reason", () => {
  // v1.53 put this walk on the creature and it found twelve fields outside the
  // state hash, three of which moved the pond. The books never got one. Note
  // that the world is *stepped*: six of `Stats`'s fifty-six own properties are
  // written by `sample()` and do not exist on a fresh instance, so a list
  // written by reading the constructor is complete-looking and six short.
  const w = warm();
  for (const [name, get, hashed, unhashed] of BOOKS) {
    const fields = Object.keys(get(w));
    const known = new Set([...hashed, ...Object.keys(unhashed)]);
    for (const f of fields) {
      assert.ok(
        known.has(f),
        `world.${name}.${f} is in neither list. It is a measurement this pond ` +
          "keeps that no fingerprint can see, so a feature that is switched off " +
          "and writes to it passes every determinism test in this suite. Either " +
          `hash it and add it to ${name.toUpperCase()}_HASHED, or add it to ` +
          `${name.toUpperCase()}_UNHASHED with the reason it must stay outside.`
      );
    }
    // And the other direction, so a list cannot outlive the field it names.
    for (const f of [...hashed, ...Object.keys(unhashed)]) {
      assert.ok(fields.includes(f), `the ${name} lists name ${f}, which no book carries`);
    }
  }
});

test("the books hash can see every field it claims to", () => {
  // The list is a claim; this is the claim measured. v1.36 asked what an
  // instrument must be blind to and wrote that test. The mirror went unasked for
  // seventeen releases and the answer was that a third of the state hash was
  // already gone.
  const w = warm();
  for (const [name, get, hashed] of BOOKS) {
    for (const f of hashed) {
      const before = booksFingerprint(w);
      const restore = nudgeIn(get(w), f);
      assert.notEqual(
        booksFingerprint(w),
        before,
        `the books hash is blind to world.${name}.${f}`
      );
      restore();
      assert.equal(
        booksFingerprint(w),
        before,
        `restoring world.${name}.${f} did not restore the digest`
      );
    }
  }
});

test("reading the books cannot move them, or the world, or the stream", () => {
  // An observer that alters what it observes is not an observer (v1.33). This
  // hash walks live objects and sorts their keys, both of which are places a
  // careless implementation writes something back.
  const w = warm(60);
  const draws = drawStream(w.rng);
  const before = {
    books: booksFingerprint(w),
    state: stateFingerprint(w),
    tree: observationFingerprint(w),
  };
  for (let i = 0; i < 5; i++) booksFingerprint(w);
  assert.equal(draws.count, 0, "hashing the books drew a random number");
  assert.equal(booksFingerprint(w), before.books, "the digest is not stable across calls");
  assert.equal(stateFingerprint(w), before.state, "hashing the books moved the pond");
  assert.equal(observationFingerprint(w), before.tree, "hashing the books moved the tree");
});

test("the books are the channel the other four cannot be", () => {
  // The whole argument for a fifth hash in one test: a miscount is invisible to
  // every picture of the pond, because a counter is not a place. Three of these
  // were caught by the hand-picked loop this channel replaced; the rest are the
  // forty-eight fields that were not.
  const arms = [
    ["stats.births", (w) => (w.stats.births += 1)],
    ["stats.scavenged", (w) => (w.stats.scavenged += 1)],
    ["stats.jostled", (w) => (w.stats.jostled += 1)],
    ["stats.walled", (w) => (w.stats.walled += 1)],
    ["stats.contested", (w) => (w.stats.contested += 1)],
    ["stats.deathsBy.age", (w) => (w.stats.deathsBy.age += 1)],
    ["stats.popHistory", (w) => (w.stats.popHistory[0].pop += 1)],
    ["stats.runHistory", (w) => (w.stats.runHistory.stride *= 2)],
    ["energy.crop", (w) => (w.energy.crop += 1)],
    ["energy.buriedBy", (w) => (w.energy.buriedBy.age = 1)],
  ];
  for (const [label, miscount] of arms) {
    const w = warm(200);
    const before = {
      books: booksFingerprint(w),
      state: stateFingerprint(w),
      trajectory: trajectoryFingerprint(w),
      tree: observationFingerprint(w),
    };
    miscount(w);
    assert.notEqual(booksFingerprint(w), before.books, `the books missed ${label}`);
    for (const other of ["state", "trajectory", "tree"]) {
      const now = { state: stateFingerprint, trajectory: trajectoryFingerprint, tree: observationFingerprint }[other](w);
      assert.equal(
        now,
        before[other],
        `${label} moved the ${other} hash — then this arm is not evidence that ` +
          "the books need a channel of their own"
      );
    }
  }
});

test("nothing in the simulation reads the books", () => {
  // `stats.js` has opened with "none of this feeds back into the simulation"
  // since v1.0 and `energy.js` with "nor is read by the simulation" since v1.29.
  // Both are comments, and a comment is not a measurement (v1.28). So: hold each
  // of the sixty-four fields wrong for sixty consecutive ticks and check the
  // pond does not notice. Per-field rather than all at once, because an aggregate two
  // cancelling errors can satisfy is not a test of either (v1.24).
  const reference = new World(makeConfig({ seed: 21 }));
  for (let i = 0; i < 100; i++) reference.step();
  const want = {
    state: stateFingerprint(reference),
    trajectory: trajectoryFingerprint(reference),
    tree: observationFingerprint(reference),
  };

  let swept = 0;
  for (const [name, get, hashed] of BOOKS) {
    for (const f of hashed) {
      const w = new World(makeConfig({ seed: 21 }));
      for (let i = 0; i < 40; i++) w.step();
      for (let i = 0; i < 60; i++) {
        // Re-applied every tick: a field `sample()` recomputes is only wrong for
        // the part of a tick before it is overwritten, and that is exactly the
        // part in which the simulation would read it.
        nudgeIn(get(w), f);
        w.step();
      }
      assert.equal(stateFingerprint(w), want.state, `world.${name}.${f} moved the pond`);
      assert.equal(trajectoryFingerprint(w), want.trajectory, `world.${name}.${f} moved the pond`);
      assert.equal(observationFingerprint(w), want.tree, `world.${name}.${f} moved the tree of life`);
      swept++;
    }
  }
  assert.equal(swept, STATS_HASHED.length + ENERGY_HASHED.length);
  assert.equal(swept, 64, "the books changed size; the claim above needs re-measuring");
});
