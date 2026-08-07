// massWeightedShove.test.js — who has to leave.
//
// v1.56 made bodies solid and split every overlap down the middle on purpose:
// exclusion says two things cannot be in one place, and says nothing about
// which of them is inconvenienced. This flag is the other rule. A pair splits
// the overlap in inverse proportion to `r²`, so the small body gives up most
// of the ground — which hands the size gene a third job, on top of the
// metabolic bill (`sizeCostFactor`) and the predation threshold
// (`preySizeRatio`).
//
// The staged ponds are the v1.45 pattern, as in bodyCollision.test.js: two
// creatures placed by hand say what the rule *is*, in one tick, instead of
// describing how often a real pond happens to do it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { assertUnaffected } from "./support/paired.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { RNG } from "../src/rng.js";
import { torusDist, wrapDelta } from "../src/vec.js";

function emptyWorld(extra = {}) {
  return new World(
    makeConfig({
      seed: 5,
      populationStart: 0,
      foodStart: 0,
      foodSpawnRate: 0,
      autoReseed: false,
      bodyCollision: true,
      massWeightedShove: true,
      ...extra,
    })
  );
}

/** One creature at (x, y) with its body radius forced and its brain silenced. */
function place(world, x, y, radius) {
  const rng = new RNG(11);
  const c = new Creature(Genome.random(rng, false), world.config, x, y, rng);
  c.energy = 90;
  c.radius = radius;
  c.think = () => [0, 0, 0];
  world.phylogeny.assign(c, 0, null);
  world.creatures.push(c);
  return c;
}

const apart = (w, a, b) =>
  torusDist(a.x, a.y, b.x, b.y, w.config.width, w.config.height);

test("the small body gives up the ground, in inverse proportion to area", () => {
  // Radii 4 and 6: masses 16 and 36, so of an overlap of 4 the small one owes
  // 36/52 and the large one 16/52 — 2.769 and 1.231 px. Under v1.56's rule
  // both would have been 2.
  const world = emptyWorld();
  const a = place(world, 300, 300, 4);
  const b = place(world, 306, 300, 6);
  world.step();

  assert.ok(
    Math.abs(apart(world, a, b) - 10) < 1e-9,
    `bodies should still end exactly r1+r2 apart, were ${apart(world, a, b)}`
  );
  assert.ok(
    Math.abs(300 - a.x - (4 * 36) / 52) < 1e-9,
    `the small body moved ${300 - a.x}, not ${(4 * 36) / 52}`
  );
  assert.ok(
    Math.abs(b.x - 306 - (4 * 16) / 52) < 1e-9,
    `the large body moved ${b.x - 306}, not ${(4 * 16) / 52}`
  );
  // Neither left the line, and the pair's *centre of mass* is exactly where it
  // was — which is the invariant that replaces v1.56's fixed midpoint. The
  // midpoint itself has moved, toward the heavier body.
  assert.equal(a.y, 300);
  assert.equal(b.y, 300);
  const com = (x1, x2) => (16 * x1 + 36 * x2) / 52;
  assert.ok(
    Math.abs(com(a.x, b.x) - com(300, 306)) < 1e-9,
    "the pair's centre of mass drifted"
  );
  assert.ok(Math.abs((a.x + b.x) / 2 - 303) > 0.5, "the midpoint should have moved");
});

test("equal bodies split it exactly in half, to the last bit", () => {
  // The reason this is a separate rule rather than a replacement: it agrees
  // with v1.56 wherever v1.56 had an answer that did not depend on size. Two
  // creatures of the same radius are shoved *identically* under both rules —
  // not to a tolerance, bit for bit — because `x / (x + x)` is 0.5 exactly in
  // IEEE-754 for every finite non-zero x.
  const staged = (byMass) => {
    const w = emptyWorld({ massWeightedShove: byMass });
    const a = place(w, 300, 300, 5.25);
    const b = place(w, 307, 301.5, 5.25);
    w.step();
    return [a.x, a.y, b.x, b.y];
  };
  assert.deepEqual(staged(true), staged(false));
});

test("in a real pond, the two rules move the same total and redistribute it", () => {
  // The staged pair is exact and says nothing about a crush, where a body takes
  // the sum of several different asks. The control is v1.50's — one pond, two
  // rules, one instant, no second trajectory to attribute anything to. The
  // pond is built *without* solid bodies so the overlaps are the ones this
  // world actually makes rather than a shoved pond's residue.
  const w = new World(makeConfig({ seed: 314, bodyCollision: false }));
  for (let i = 0; i < 3000; i++) w.step();
  const snap = w.creatures.map((c) => ({ c, x: c.x, y: c.y, r: c.radius }));
  const restore = () => snap.forEach((s) => { s.c.x = s.x; s.c.y = s.y; });

  const arm = (byMass) => {
    restore();
    w.config.bodyCollision = true;
    w.config.massWeightedShove = byMass;
    const before = w.stats.jostled;
    w._separate();
    const out = snap.map((s) =>
      torusDist(s.c.x, s.c.y, s.x, s.y, w.config.width, w.config.height)
    );
    const pairs = w.stats.jostled - before;
    w.config.bodyCollision = false;
    w.config.massWeightedShove = false;
    restore();
    return { out, pairs };
  };
  const half = arm(false);
  const mass = arm(true);

  assert.ok(half.pairs > 30, `only ${half.pairs} overlapping pairs — too few to say anything`);
  assert.equal(mass.pairs, half.pairs, "the two rules disagreed about which pairs overlap");

  // Both rules owe every pair exactly its overlap, so the ground given up is
  // the same to a fraction of a percent whichever way it is split. This is the
  // sentence that makes the whole feature a *redistribution*: it moves nobody
  // extra, it only decides which of the two does the moving.
  const total = (a) => a.reduce((t, d) => t + d, 0);
  assert.ok(
    Math.abs(total(mass.out) - total(half.out)) / total(half.out) < 0.01,
    `total displacement moved from ${total(half.out)} to ${total(mass.out)}`
  );

  // And it does redistribute: some bodies give up more than they did and some
  // less, in a pond where nothing is exactly the same size as anything else.
  const moreP = half.out.filter((d, i) => mass.out[i] > d + 1e-9).length;
  const less = half.out.filter((d, i) => mass.out[i] < d - 1e-9).length;
  assert.ok(moreP > 5 && less > 5, `only ${moreP} bodies gave up more and ${less} less`);

  // The direction, pinned where the arithmetic is exact: a pair that overlaps
  // each other and nobody else. Anywhere else a body's displacement is the sum
  // of several asks and the comparison is not about one pair, which is the
  // whole reason a crush needed staging in the first place.
  const cs = snap.filter((s) => !s.c.dead);
  const partnersOf = (s) =>
    cs.filter((o) => {
      if (o === s) return false;
      const dx = wrapDelta(s.x, o.x, w.config.width);
      const dy = wrapDelta(s.y, o.y, w.config.height);
      const sum = s.r + o.r;
      const d2 = dx * dx + dy * dy;
      return d2 > 0 && d2 < sum * sum;
    });
  let checked = 0;
  for (const s of cs) {
    const mine = partnersOf(s);
    if (mine.length !== 1) continue;
    const other = mine[0];
    if (partnersOf(other).length !== 1 || s.r === other.r) continue;
    const light = snap.indexOf(s.r < other.r ? s : other);
    const heavy = snap.indexOf(s.r < other.r ? other : s);
    assert.ok(
      mass.out[light] > half.out[light],
      "the lighter body of an isolated pair was not shoved further under mass weighting"
    );
    assert.ok(
      mass.out[heavy] < half.out[heavy],
      "the heavier body of an isolated pair did not hold its ground better"
    );
    checked++;
  }
  assert.ok(checked > 3, `only ${checked} isolated unequal pairs — nothing was pinned`);
});

test("the shove is still simultaneous", () => {
  // v1.56's strongest claim, re-asserted under the new arithmetic: every
  // displacement is read off one instant and none is written until all are
  // known, so reversing the array cannot change the answer. It could have
  // broken here — the share now depends on *which* body is asking — and the
  // check is the same one, bit for bit.
  const build = () => {
    const w = new World(
      makeConfig({ seed: 314, bodyCollision: true, massWeightedShove: true })
    );
    for (let i = 0; i < 1200; i++) w.step();
    return w;
  };
  const forward = build();
  const reversed = build();
  reversed.creatures.reverse();
  forward._separate();
  reversed._separate();

  const a = forward.creatures.map((c) => [c.x, c.y]);
  const b = reversed.creatures.slice().reverse().map((c) => [c.x, c.y]);
  assert.ok(a.length > 50, `only ${a.length} creatures — too small a pond to say anything`);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i][0], b[i][0], `creature ${i} landed elsewhere when the array was reversed`);
    assert.equal(a[i][1], b[i][1], `creature ${i} landed elsewhere when the array was reversed`);
  }
});

test("the pass still draws no random numbers", () => {
  const world = new World(
    makeConfig({ seed: 314, bodyCollision: true, massWeightedShove: true })
  );
  for (let i = 0; i < 400; i++) world.step();
  let draws = 0;
  const real = world.rng.next;
  world.rng.next = () => {
    draws++;
    return real.call(world.rng);
  };
  world._separate();
  world.rng.next = real;
  assert.equal(draws, 0, "the separation pass drew a random number");
  assert.ok(world.stats.jostled > 0, "nothing was separated, so nothing was proved");
});

test("it is inert in a pond where nothing is ever shoved", () => {
  // The flag modifies a rule rather than adding one, so its off-switch is not
  // its own: a world without solid bodies must not notice it either way. This
  // is why `test/fingerprint.test.js` has to give it a world before it can
  // sweep it, and the assertion here is the reason that is honest rather than
  // a dodge.
  assert.equal(DEFAULT_CONFIG.bodyCollision, false);
  assertUnaffected(
    new World(makeConfig({ seed: 314, massWeightedShove: true })),
    new World(makeConfig({ seed: 314 })),
    300,
    "massWeightedShove without bodyCollision"
  );
});

test("with the flag off, a shoving world is bit-for-bit v1.56's", () => {
  assertUnaffected(
    new World(makeConfig({ seed: 314, bodyCollision: true, massWeightedShove: false })),
    new World(makeConfig({ seed: 314, bodyCollision: true })),
    300,
    "massWeightedShove"
  );
});
