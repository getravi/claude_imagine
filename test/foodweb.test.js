// foodweb.test.js — the eligible set, counted for everybody at once.
//
// `src/foodweb.js` answers a question this project wrote down in v1.65 and left
// alone for thirty-five releases: the refuge counts the pond against *one*
// hunter, and the distribution over all of them is what says whether a pond has
// an apex animal or a graded web. The module is a counting argument, so most of
// what is worth pinning is that the count is the rule's own — the search is a
// rearrangement of `Creature._edible` for speed, and a rearrangement is exactly
// the kind of claim this project has learned to distrust (v1.81: a claim of the
// form "X is inside Y" where Y is derived is a test waiting to be written).
//
// So the central test is agreement with the O(n²) form of the rule, asked of
// real ponds at several ages and across the whole range of `preySizeRatio` the
// sweep can reach — the brute force runs `_edible` itself rather than a copy of
// its arithmetic, which is what makes it a control rather than a second guess.
//
// The behavioural half — what the profile *says* about a pond over twelve seeds
// — is a measurement and lives in docs/SCIENCE.md, for `refuge.test.js`'s
// reason: a test that pinned it would be teaching a future reader that the
// result is fragile when only the test is.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { makeConfig } from "../src/config.js";
import { eligibleCounts, webProfile } from "../src/foodweb.js";
import { hunterCeiling } from "../src/refuge.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { hudTiles, UI_RNG_SEED } from "../src/hud.js";
import { RNG } from "../src/rng.js";

/** A world of the given config, run on. */
function ran(overrides, ticks) {
  const world = new World(makeConfig(overrides));
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

/** The question as it is written: every ordered pair, asked of the rule itself. */
function brute(creatures, config) {
  const out = new Int32Array(creatures.length);
  for (let i = 0; i < creatures.length; i++) {
    let k = 0;
    for (let j = 0; j < creatures.length; j++) {
      if (i !== j && creatures[i]._edible(creatures[j])) k++;
    }
    out[i] = k;
  }
  return out;
}

/**
 * A pond of bodies with chosen radii and diets, standing still.
 *
 * Real `Creature`s with the two fields overwritten rather than `{radius,
 * carnivory}` literals, because half of what is asked below is whether the
 * module and `_edible` decide a boundary the same way — and a stand-in has no
 * `_edible`.
 */
function pond(spec, overrides = {}) {
  const config = makeConfig(overrides);
  const rng = new RNG(7);
  return spec.map(([radius, carnivory]) => {
    const c = new Creature(Genome.random(rng), config, 0, 0, rng);
    c.radius = radius;
    c.carnivory = carnivory;
    return c;
  });
}

test("the count is the eating rule's own, on ponds of every age", () => {
  // Three ages because the size and diet distributions are different animals at
  // each: forty random draws, a pond mid-bloom, and one that has been selected
  // on for thousands of ticks.
  const world = new World(makeConfig());
  for (const age of [0, 400, 1200, 3000]) {
    while (world.tick < age) world.step();
    assert.deepEqual(
      Array.from(eligibleCounts(world.creatures, world.config)),
      Array.from(brute(world.creatures, world.config)),
      `the search and the rule disagree at tick ${age}`
    );
  }
});

test("…and across every ratio the levers can reach", () => {
  // `src/levers.js` moves a constant by ±50%, so the search has to be the rule
  // over 0.55–1.65 and not only at the 1.1 this world ships. Below 1.0 a hunter
  // may eat a body its own size, which is the one regime where the self-exclusion
  // in the module does anything at all — and the brute force, which skips `i ===
  // j` explicitly, is what says whether it does it correctly.
  for (const preySizeRatio of [0.55, 0.9, 1.0, 1.1, 1.65]) {
    const world = ran({ preySizeRatio }, 600);
    assert.deepEqual(
      Array.from(eligibleCounts(world.creatures, world.config)),
      Array.from(brute(world.creatures, world.config)),
      `the search and the rule disagree at preySizeRatio ${preySizeRatio}`
    );
  }
});

test("a creature is never in its own eligible set", () => {
  // At the shipped ratio this is arithmetic — `r > r * 1.1` is false — and at a
  // ratio under 1 it is a decision. Both are the rule; neither is a creature
  // eating itself.
  for (const preySizeRatio of [0.5, 1.1]) {
    const cs = pond([[5, 0.9]], { preySizeRatio });
    assert.equal(eligibleCounts(cs, cs[0].config)[0], 0, `a pond of one at ratio ${preySizeRatio}`);
    const two = pond([[5, 0.9], [5, 0.9]], { preySizeRatio });
    assert.deepEqual(
      Array.from(eligibleCounts(two, two[0].config)),
      preySizeRatio < 1 ? [1, 1] : [0, 0],
      `two identical bodies at ratio ${preySizeRatio}`
    );
  }
});

test("the boundary is decided where the eating rule decides it", () => {
  // The same care `refuge.test.js` takes: a body sitting exactly on the line is
  // decided by one float comparison, and the module must make the same one the
  // bite does. `_edible` tests `>`, so a hunter at exactly `prey * ratio` is
  // refused.
  const config = makeConfig();
  const prey = 5;
  const exact = prey * config.preySizeRatio;
  const cs = pond([
    [exact, 0.9],
    [prey, 0.1],
  ]);
  assert.equal(cs[0]._edible(cs[1]), false, "the rule refuses a hunter exactly on the line");
  assert.equal(eligibleCounts(cs, config)[0], 0, "and so must the count");

  const over = pond([
    [exact * 1.0001, 0.9],
    [prey, 0.1],
  ]);
  assert.equal(over[0]._edible(over[1]), true);
  assert.equal(eligibleCounts(over, config)[0], 1, "a hunter over the line eats");
});

test("the diet gate is the same threshold the rest of the project uses", () => {
  const config = makeConfig();
  const t = config.carnivoreThreshold;
  const cs = pond([
    [8, t],
    [8, t - 1e-9],
    [3.5, 0],
  ]);
  const counts = eligibleCounts(cs, config);
  assert.equal(counts[0], 1, "a gene exactly at the threshold hunts");
  assert.equal(counts[1], 0, "one hair under it does not");
  assert.equal(counts[2], 0, "and a grazer never does, whatever its size");
});

test("a carnivore is a gene and a hunter is a carnivore with something to eat", () => {
  // The distinction the module exists to draw. Three bodies carry the diet and
  // only the largest has anything under it — the other two are a quarter of a
  // pixel short of the smallest body in the water, which is the whole of the
  // difference between a carnivore and a hunter.
  const config = makeConfig();
  const cs = pond([
    [8, 0.9],
    [6, 0.9],
    [5.7, 0.9],
    [7.5, 0.1],
  ]);
  const p = webProfile(cs, config);
  assert.equal(p.carnivores, 3, "three carry the gene");
  assert.equal(p.hunters, 1, "one of them can reach anything");
  // Two of the four others, so two thirds of the rest of the pond.
  assert.equal(p.top, 2 / 3);
  assert.equal(p.mid, 2 / 3, "one hunter is its own median");
});

test("the profile's carnivore count agrees with the panel's", () => {
  // Same definition, computed twice — once here and once in the per-tick sweep
  // in `stats.js`. Two readouts of one quantity that could drift apart is
  // exactly what v1.93 and v1.79 found on other surfaces.
  for (const seed of [314, 7, 128]) {
    const world = ran({ seed }, 800);
    assert.equal(
      webProfile(world.creatures, world.config).carnivores,
      world.stats.carnivoreCount,
      `seed ${seed}`
    );
  }
});

test("the widest hunter is the one the lived refuge is drawn against", () => {
  // Not a definition shared with `refuge.js` — the ceiling is the biggest
  // *body* that carries the gene and `top` is the biggest *reach* — but the
  // pond that has no hunter has no ceiling either, and the two modules must
  // agree about that pond. The converse does not hold and is the finding: a
  // ceiling can stand over a pond nothing can eat.
  for (const seed of [314, 42, 128]) {
    const world = ran({ seed }, 1500);
    const p = webProfile(world.creatures, world.config);
    if (p.hunters > 0) {
      assert.ok(hunterCeiling(world.creatures, world.config) > 0, `seed ${seed} hunts with no ceiling`);
    }
  }
});

test("shares are of the rest of the pond, and a hunter that eats everything reads 1", () => {
  const config = makeConfig();
  const cs = pond([
    [8, 0.9],
    [3.5, 0.1],
    [3.6, 0.1],
    [3.7, 0.1],
  ]);
  const p = webProfile(cs, config);
  assert.equal(p.top, 1, "three of the three others");
  assert.equal(p.hunters, 1);
});

test("an empty pond and a pond nobody hunts read zero rather than throwing", () => {
  const config = makeConfig();
  assert.deepEqual(webProfile([], config), { carnivores: 0, hunters: 0, top: 0, mid: 0 });
  assert.equal(eligibleCounts([], config).length, 0);
  const grazers = pond([
    [8, 0],
    [4, 0],
  ]);
  assert.deepEqual(webProfile(grazers, config), { carnivores: 0, hunters: 0, top: 0, mid: 0 });
  // And the case the tile has a second word for: the gene exists and reaches
  // nothing, which is the default pond's own ending (docs/SCIENCE.md).
  const starved = pond([
    [4, 0.9],
    [4, 0.1],
  ]);
  const p = webProfile(starved, config);
  assert.equal(p.carnivores, 1);
  assert.equal(p.hunters, 0);
});

test("the middle hunter is the lower median of the hunters, not of the pond", () => {
  const config = makeConfig();
  // Four hunters reaching 4, 3, 2 and 1 of the nine others, with a crowd of
  // grazers underneath. The median of the pond's reaches would be 0.
  const cs = pond([
    [8, 0.9],
    [7, 0.9],
    [6, 0.9],
    [5, 0.9],
    [4.5, 0.1],
    [4.0, 0.1],
    [3.9, 0.1],
    [3.8, 0.1],
    [3.7, 0.1],
    [3.6, 0.1],
  ]);
  const counts = Array.from(eligibleCounts(cs, config));
  assert.deepEqual(counts.slice(4), Array(6).fill(0), "the grazers reach nothing");
  const p = webProfile(cs, config);
  assert.equal(p.hunters, 4);
  const reaches = counts.filter((k) => k > 0).sort((a, b) => a - b);
  assert.equal(p.top, reaches[3] / 9);
  assert.equal(p.mid, reaches[1] / 9, "the lower of the two middle hunters");
});

test("reading the web is a pure reading of the world", () => {
  // Directive 2. The profile draws no randomness and touches nothing — unlike
  // the Diversity tile beside it, which samples and takes the UI's stream to do
  // it. This is the stronger promise, so it is asserted as an exact one.
  const world = ran({}, 300);
  const before = stateFingerprint(world);
  for (let i = 0; i < 10; i++) webProfile(world.creatures, world.config);
  assert.equal(stateFingerprint(world), before, "reading the web perturbed the world");
  assert.deepEqual(
    webProfile(world.creatures, world.config),
    webProfile(world.creatures, world.config),
    "two reads of one world disagree"
  );
});

test("the tile says the pair, and says a word when nobody reaches anything", () => {
  const read = (world, config) =>
    new Map(
      hudTiles({ world, config, fps: 0, uiRng: new RNG(UI_RNG_SEED) }).map((t) => [t.id, t.text])
    ).get("stat-web");

  const world = new World(makeConfig());
  assert.match(read(world, world.config), /^\d+% top \d+% mid$/, "the opening pond is a web");

  // A pond that has run past its last hunter. The default seed loses one before
  // 6,000 ticks; this is the state, built rather than waited for.
  const empty = new World(makeConfig());
  empty.creatures = pond([
    [4, 0.9],
    [4, 0.1],
  ]);
  assert.equal(read(empty, empty.config), "none reach");
  const grazers = new World(makeConfig());
  grazers.creatures = pond([
    [8, 0],
    [4, 0],
  ]);
  assert.equal(read(grazers, grazers.config), "none hunt");
  // And off with the mechanic, like the two tiles above it.
  const quiet = new World(makeConfig({ predation: false }));
  assert.equal(read(quiet, quiet.config), "off");
});

test("a real hunter is never reported as reaching 0% of the pond", () => {
  // The tile rounds, and a hunter that reaches one body in four hundred rounds
  // to zero — which is the falsehood v1.89 wrote down: true symbols arranged
  // into a lie. `describe.js`'s `percent` has said `<1%` since v1.31 and the
  // tile renders it identically, so the reader and the listener get one answer.
  const config = makeConfig();
  // One body small enough to eat and three hundred and ninety-nine too big.
  const cs = pond([[8, 0.9], [3.5, 0.1], ...Array.from({ length: 399 }, () => [7.9, 0.1])]);
  const world = new World(makeConfig());
  world.creatures = cs;
  const text = new Map(
    hudTiles({ world, config, fps: 0, uiRng: new RNG(UI_RNG_SEED) }).map((t) => [t.id, t.text])
  ).get("stat-web");
  assert.equal(text, "<1% top <1% mid", `one in four hundred read "${text}"`);
});
