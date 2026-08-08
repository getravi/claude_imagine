// biomes.test.js — the fertility field's own number (v1.68).
//
// The biomes have shaped where food falls since v1.3 and were, until this
// release, the one noun in this pond with no statistic anywhere: two views draw
// them, no readout counts them. `patchBias` is that number — mean fertility
// under a set of points minus the mean of the whole landscape, the same shape
// as v1.23's `groundBias` one field over.
//
// What this file pins is mostly about the *controls*, because this statistic
// turns out to owe three different zeroes and only one of them is evidence:
//
//   - `foodPatches: false` — the real one. The field is still built and still
//     measurable; nothing consults it. v1.20's test, and the pond reads the
//     null there (+0.000 over twelve seeds, in SCIENCE.md).
//   - `patchFloor: 1` — structural. A flat landscape makes every point the
//     mean, so the difference is bit-exact zero and says nothing about a pond.
//   - a uniform scatter — v1.27's arm, ~0 for any set of points anywhere.
//
// v1.67 recorded that the biomes had no flag behind them. They have had one
// since v1.3; it is named after the food rather than after the field.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { FertilityField, patchBias } from "../src/environment.js";
import { RNG } from "../src/rng.js";
import {
  stateFingerprint,
  booksFingerprint,
  drawStream,
} from "../src/fingerprint.js";

const field = (over = {}) => new FertilityField(makeConfig(over), new RNG(7));

/** `n` uniformly scattered points on the config's torus. */
function scatter(config, n, seed) {
  const rng = new RNG(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push({ x: rng.range(0, config.width), y: rng.range(0, config.height) });
  }
  return pts;
}

// --- The mean the whole statistic is measured against ----------------------

test("the field mean sits between the floor and 1, and above the floor", () => {
  const f = field();
  const m = f.mean();
  assert.ok(m > f.floor, `mean ${m} should be above the barren floor ${f.floor}`);
  assert.ok(m < 1, `mean ${m} should be below a biome centre`);
});

test("the lattice mean agrees with one eight times finer", () => {
  // The estimator's own error bar. `mean()` integrates on a 15 px lattice; this
  // rebuilds the same integral at ~1.9 px and asserts the two agree far below
  // anything a readout rounds to. A field is smooth on the scale of
  // `patchRadius` (135 px), so this is a statement about arithmetic rather than
  // about any particular seed — one seed is the right sample size for an
  // instrument (v1.58), and three would buy three decimal places of nothing.
  const config = makeConfig();
  const f = new FertilityField(config, new RNG(11));
  const cols = Math.round(config.width / 1.875);
  const rows = Math.round(config.height / 1.875);
  let sum = 0;
  for (let j = 0; j < rows; j++) {
    const y = ((j + 0.5) / rows) * config.height;
    for (let i = 0; i < cols; i++) sum += f.at(((i + 0.5) / cols) * config.width, y);
  }
  const fine = sum / (cols * rows);
  assert.ok(
    Math.abs(f.mean() - fine) < 1e-4,
    `lattice mean ${f.mean()} vs fine ${fine} differ by more than 1e-4`
  );
});

test("asking for the mean costs no random numbers", () => {
  // The reason a statistic may be read from a live world at all: `mean()` walks
  // a lattice derived from the config, so a panel that asks the field a
  // question cannot move the pond that answers it.
  const rng = new RNG(3);
  const f = new FertilityField(makeConfig(), rng);
  const before = rng.count ?? null;
  f.mean();
  patchBias(f, scatter(DEFAULT_CONFIG, 50, 4));
  if (before !== null) assert.equal(rng.count, before);
});

test("the cached mean is dropped when the biomes move", () => {
  // v1.22's chart buffer and v1.23's Ground readout, avoided: a cache in front
  // of a moving thing is where this project's favourite bug lives. Drift moves
  // the landscape, so the mean of the old one must not survive it.
  const f = field();
  const first = f.mean();
  f.update(0); // static: nothing moved, so nothing to invalidate
  assert.equal(f.mean(), first);
  for (let i = 0; i < 400; i++) f.update(0.4);
  assert.notEqual(f.mean(), first);
});

// --- The controls ----------------------------------------------------------

test("patchBias is exactly 0 with no field and with nothing to count", () => {
  for (const absent of [null, undefined]) {
    assert.equal(patchBias(absent, [{ x: 1, y: 2 }]), 0);
  }
  assert.equal(patchBias(field(), []), 0);
});

test("a flattened landscape reads exactly 0, whatever is standing on it", () => {
  // The structural zero, and the one to be least impressed by: `patchFloor: 1`
  // erases the field itself — fertility is `floor + (1-floor) * bump`, so at
  // floor 1 every point on the torus is 1 and every bias is a difference
  // between two identical numbers. Worth pinning because it is bit-exact and
  // because a future edit to `at()` that broke it would be a real bug; worth
  // *not* reading as evidence about any pond.
  const config = makeConfig({ patchFloor: 1 });
  const f = new FertilityField(config, new RNG(9));
  assert.equal(f.mean(), 1);
  for (const pts of [scatter(config, 200, 5), f.centres]) {
    assert.ok(Object.is(patchBias(f, pts), 0), "a flat field must give a bit-exact zero");
  }
});

test("the scrambled arm reads ~0 and the biome centres read the ceiling", () => {
  // v1.27: a feature that decides *where* something goes is controlled by an
  // arm that puts it somewhere else at random, not by an arm that switches it
  // off. Both ends of the scale, on one field:
  //   - points at the biome centres are at fertility 1, so their bias is
  //     exactly the ceiling `1 - mean` — the largest this number can be;
  //   - 4,000 uniform points land within a hundredth of 0.
  const config = makeConfig();
  const f = new FertilityField(config, new RNG(13));
  const ceiling = 1 - f.mean();
  assert.ok(
    Math.abs(patchBias(f, f.centres) - ceiling) < 1e-12,
    "points on the centres should sit at the ceiling"
  );
  const nul = patchBias(f, scatter(config, 4000, 17));
  assert.ok(Math.abs(nul) < 0.01, `uniform scatter should read ~0, got ${nul}`);
});

test("a statistic that cannot tell the crop from scatter would be worthless", () => {
  // Pinning the *sensitivity*, not a trajectory. Half the pond's worth of
  // pellets dropped inside one biome has to read far outside the noise of the
  // same count scattered uniformly, or the number on the tile is decoration.
  // The threshold is deliberately loose: the measurement lives in SCIENCE.md,
  // and a test asserting the release's own +0.089 would pin a trajectory
  // (v1.44) rather than the instrument.
  const config = makeConfig();
  const f = new FertilityField(config, new RNG(23));
  const rng = new RNG(29);
  const clustered = [];
  const c = f.centres[0];
  for (let i = 0; i < 200; i++) {
    clustered.push({ x: c.x + rng.range(-40, 40), y: c.y + rng.range(-40, 40) });
  }
  const signal = patchBias(f, clustered);
  const noise = Math.abs(patchBias(f, scatter(config, 200, 31)));
  assert.ok(signal > 0.2, `a clustered crop should read strongly positive, got ${signal}`);
  assert.ok(signal > 10 * noise, `signal ${signal} should dwarf the scatter's ${noise}`);
});

test("with the patches off, the pond stands nowhere in particular", () => {
  // The control that is evidence. `foodPatches` has been in the panel and in
  // the permalink (`bio=0`) since v1.3 — v1.67 looked for a flag called
  // something like `biomes`, found `biomeDrift`, and concluded there was none.
  // The field is still constructed here and still has a mean, so the statistic
  // is measuring exactly what it measures in a default world; what is missing
  // is any reason for the pond to be in the fertile half of it.
  //
  // Bounded rather than pinned to the release's own figure (v1.44): one seed's
  // 6,000-tick draw against a null of ±0.017 is a coin toss at three decimal
  // places, and a test asserting +0.000 would be pinning noise. The twelve-seed
  // version — +0.000 mean, seven of twelve positive, against +0.089 and twelve
  // of twelve — is in SCIENCE.md, where a between-arms number belongs.
  const off = new World(makeConfig({ seed: 314, foodPatches: false }));
  for (let i = 0; i < 3000; i++) off.step();
  assert.ok(off.environment.mean() > off.environment.floor, "the field still exists");
  assert.ok(
    Math.abs(off.stats.patchBias) < 0.04,
    `a pond nothing sows into should read the null, got ${off.stats.patchBias}`
  );

  // And the same seed with the patches on, for the contrast the tile is about.
  const on = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 3000; i++) on.step();
  assert.ok(
    on.stats.patchBias > 2 * Math.abs(off.stats.patchBias),
    `patches on ${on.stats.patchBias} vs off ${off.stats.patchBias}`
  );
});

// --- The readout -----------------------------------------------------------

test("the pond's own bias is positive and outside the scatter", () => {
  // The shipped claim, at the weakest form that cannot flake: the living are
  // somewhere more fertile than chance. Measured on one seed at 1,200 ticks
  // here; the twelve-seed version (mean +0.089, 12 of 12 positive, z 3.3–8.6
  // against 400 uniform replicates apiece) is in SCIENCE.md, because a
  // between-arms number belongs in a document and a bound belongs in a test.
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 1200; i++) world.step();
  assert.ok(world.creatures.length > 0, "the pond died; nothing to measure");
  assert.ok(
    world.stats.patchBias > 0.02,
    `the living should sit in the biomes, got ${world.stats.patchBias}`
  );
  assert.equal(world.stats.patchBias, patchBias(world.environment, world.creatures));
});

test("an empty pond is not sitting anywhere", () => {
  // The v1.23 stale-readout shape: the scan is throttled to every fourth tick,
  // so the zeroing has to be unconditional or a pond that has just died goes on
  // reporting where it used to be standing. Staged rather than waited for
  // (v1.45): `autoReseed` refills an empty pond inside the same step, so the
  // state this is about cannot be reached by running a world — it is reached by
  // handing the sampler one.
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 200; i++) world.step();
  assert.ok(world.stats.patchBias !== 0, "the pond should have a bias to lose");
  world.creatures.length = 0;
  world.stats.sample(world);
  assert.equal(world.stats.patchBias, 0);
});

test("reading the biomes does not write to them", () => {
  // The statistic is sampled in every world, so the usual "with the flag off"
  // pairing has no arm to compare against — every pond measures this one. The
  // arm that *is* available is the same pond asked the question far more often:
  // if `mean()` or `patchBias` drew a number, cached a stale one, or wrote
  // anything back into the field, hammering them every tick would part these
  // two. (Stubbing the sampler out instead would part the books channel by
  // construction and prove nothing about the field.)
  const a = new World(makeConfig({ seed: 77 }));
  const b = new World(makeConfig({ seed: 77 }));
  const drawsA = drawStream(a.rng);
  const drawsB = drawStream(b.rng);
  for (let i = 0; i < 1500; i++) {
    a.step();
    a.environment.mean();
    patchBias(a.environment, a.creatures);
    patchBias(a.environment, a.food.items);
    b.step();
  }
  assert.equal(drawsA.count, drawsB.count, "the extra reads drew randomness");
  assert.equal(drawsA.digest(), drawsB.digest());
  assert.equal(stateFingerprint(a), stateFingerprint(b));
  assert.equal(booksFingerprint(a), booksFingerprint(b));
});
