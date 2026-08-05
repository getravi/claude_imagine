// bodyCollision.test.js — the tick's last free gift: space.
//
// Every rule this pond has about *being somewhere* has been about resources.
// Food is in biomes (v1.3), the ground can be expensive (v1.23), rock can
// refuse a step (v1.48) — and through all of it two creatures have been able to
// occupy the same point, for their whole lives, at no cost to either. A fertile
// patch has never had a ceiling on how many bodies fit in it.
//
// The staged ponds below are the v1.45 pattern: two creatures placed by hand
// say what the rule *is*, in one tick. Waiting for the same collision in a real
// pond takes thousands of ticks and describes its frequency instead.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { assertUnaffected } from "./support/paired.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { RNG } from "../src/rng.js";
import { torusDist, wrapDelta } from "../src/vec.js";

/** An empty pond: nothing lives, grows or spawns except what we put in it. */
function emptyWorld(extra = {}) {
  return new World(
    makeConfig({
      seed: 5,
      populationStart: 0,
      foodStart: 0,
      foodSpawnRate: 0,
      autoReseed: false,
      bodyCollision: true,
      ...extra,
    })
  );
}

/**
 * Put one creature into `world` at (x, y) with its body radius forced, so a
 * test can state the overlap it is staging rather than read it back out of a
 * random genome.
 */
function place(world, x, y, radius) {
  const rng = new RNG(11);
  const c = new Creature(Genome.random(rng, false), world.config, x, y, rng);
  c.energy = 90; // enough to live through the tick, too little to split
  c.radius = radius;
  // Still: a creature that thinks will also move, and this file is about the
  // shove and not about the swimming. Silencing the brain makes every distance
  // below exactly the one that was staged.
  c.think = () => [0, 0, 0];
  world.phylogeny.assign(c, 0, null);
  world.creatures.push(c);
  return c;
}

/** How far apart two creatures are, on the torus. */
function apart(world, a, b) {
  return torusDist(a.x, a.y, b.x, b.y, world.config.width, world.config.height);
}

test("two overlapping bodies end the tick exactly touching", () => {
  const world = emptyWorld();
  // Radii 4 and 6 sum to 10; placed 6 apart, they overlap by 4.
  const a = place(world, 300, 300, 4);
  const b = place(world, 306, 300, 6);
  world.step();

  assert.ok(
    Math.abs(apart(world, a, b) - 10) < 1e-9,
    `bodies should be exactly r1+r2 apart, were ${apart(world, a, b)}`
  );
  // Each gave up half the overlap, and neither gave up more than the other:
  // size does not enter, which is the difference between exclusion and force.
  assert.ok(Math.abs(a.x - 298) < 1e-9, `the smaller body moved to ${a.x}, not 298`);
  assert.ok(Math.abs(b.x - 308) < 1e-9, `the larger body moved to ${b.x}, not 308`);
  // Nothing moved off the line, and the pair's midpoint is where it was: a
  // shove is a redistribution, not a drift.
  assert.equal(a.y, 300);
  assert.equal(b.y, 300);
  assert.ok(Math.abs((a.x + b.x) / 2 - 303) < 1e-9, "the midpoint moved");
});

test("with the rule off they stay in the same place, which is the bug it fixes", () => {
  // Pin the failure, not only the fix (v1.25): a suite that only knows the new
  // behaviour stays green while someone deletes the pass.
  const world = emptyWorld({ bodyCollision: false });
  const a = place(world, 300, 300, 4);
  const b = place(world, 306, 300, 6);
  world.step();

  assert.equal(a.x, 300, "a body moved in a world with no collisions");
  assert.equal(b.x, 306, "a body moved in a world with no collisions");
  assert.ok(apart(world, a, b) < 10, "the two are still overlapping, as they always were");
  assert.equal(world.stats.jostled, 0, "nothing should have been counted");
});

test("bodies that merely touch are left alone", () => {
  // The predicate is strict: exactly `r1 + r2` apart is not an overlap, so a
  // pond of touching bodies is a fixed point rather than a permanent hum.
  const world = emptyWorld();
  const a = place(world, 300, 300, 4);
  const b = place(world, 310, 300, 6);
  world.step();

  assert.equal(a.x, 300);
  assert.equal(b.x, 310);
  assert.equal(world.stats.jostled, 0);
});

test("exactly coincident bodies have no axis, and are left for the next tick", () => {
  // Documented behaviour rather than an oversight: two points at the same place
  // have no line to be pushed apart along, and inventing one needs a random
  // number this pass does not have and must not take. Whatever moves either of
  // them gives the following tick an axis to work with.
  const world = emptyWorld();
  const a = place(world, 300, 300, 5);
  const b = place(world, 300, 300, 5);
  world.step();

  assert.equal(a.x, 300);
  assert.equal(b.x, 300);
  assert.equal(world.stats.jostled, 0, "a pair with no axis is not a pair that was separated");

  // ...and one nudge later the rule takes hold.
  b.x = 300.5;
  world.step();
  assert.ok(apart(world, a, b) > 9, `still piled up at ${apart(world, a, b)}`);
});

test("a chain is a relaxation, and it converges without ever arriving", () => {
  // The exact shape of "not a solver", staged so the arithmetic is readable.
  // Three equal bodies in a row, each pair overlapping by 6: the middle one is
  // pushed both ways by the same amount and does not move at all, so the ends
  // give up half of what the pair owes and the gap closes by half each tick.
  // 9, 10.5, 11.25, 11.625 — geometric, and never exactly 12.
  const world = emptyWorld();
  const a = place(world, 400, 300, 6);
  const b = place(world, 406, 300, 6);
  const c = place(world, 412, 300, 6);

  const gaps = [];
  for (let i = 0; i < 4; i++) {
    world.step();
    gaps.push(apart(world, a, b));
    assert.equal(b.x, 406, "the middle body's two shoves should cancel exactly");
    assert.ok(
      Math.abs(apart(world, a, b) - apart(world, b, c)) < 1e-9,
      "a symmetric chain should stay symmetric"
    );
  }
  assert.deepEqual(
    gaps.map((g) => Number(g.toFixed(4))),
    [9, 10.5, 11.25, 11.625],
    "the residual overlap should halve every tick"
  );
  assert.ok(gaps[3] < 12, "a single pass that closed the whole chain would be a solver");

  // It converges quickly enough that the difference stops being a fact about
  // the pond — and it is still, strictly, an overlap.
  for (let i = 0; i < 40; i++) world.step();
  assert.ok(apart(world, a, b) > 11.999, `after 44 ticks the chain is still at ${apart(world, a, b)}`);
  assert.ok(apart(world, a, b) < 12, "the chain reached the exact answer, which a relaxation cannot");
  assert.ok(world.stats.jostled > 40, "the pond should still be counting the pair every tick");
});

test("the count is pairs, not sightings", () => {
  // Every overlapping pair is seen twice, once from each side, so the counter
  // halves what it saw. Three bodies in one heap is three pairs, not six.
  const world = emptyWorld();
  place(world, 400, 300, 6);
  place(world, 402, 301, 6);
  place(world, 401, 303, 6);
  world.step();
  assert.equal(world.stats.jostled, 3);
  assert.ok(Number.isInteger(world.stats.jostled), "a pair count must be a whole number");
});

test("the shove is simultaneous: no body is displaced onto a displaced body", () => {
  // The claim the pass is built on. Every displacement is computed from the
  // positions everyone holds at the same instant and none is written until all
  // are known — so unlike every other rule in `step()`, the answer cannot
  // depend on where a creature sits in the array.
  //
  // What is asserted here is the strong form of that, measured: reverse the
  // array and the pond is bit-for-bit identical. It is strong because it can
  // fail — a body overlapping *three* others sums three floats, and float
  // addition is commutative but not associative, so a pile deep enough would
  // agree to a rounding rather than to the last bit. The weaker claim (nobody
  // reads a shoved position) holds by construction either way.
  const build = () => {
    const w = new World(makeConfig({ seed: 314, bodyCollision: true }));
    for (let i = 0; i < 1200; i++) w.step();
    return w;
  };
  const forward = build();
  const reversed = build();
  reversed.creatures.reverse();
  forward._separate();
  reversed._separate();

  const a = forward.creatures.map((c) => [c.x, c.y]);
  const b = reversed.creatures
    .slice()
    .reverse()
    .map((c) => [c.x, c.y]);
  assert.ok(a.length > 50, `only ${a.length} creatures — the pond is too small to say anything`);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i][0], b[i][0], `creature ${i} landed elsewhere when the array was reversed`);
    assert.equal(a[i][1], b[i][1], `creature ${i} landed elsewhere when the array was reversed`);
  }
});

test("the pass draws no random numbers", () => {
  // Geometry all the way down. This is what lets a shoving world still be
  // reproducible from its seed, and it is the reason the rule needed no
  // scrambled arm inside the simulation itself.
  const world = new World(makeConfig({ seed: 314, bodyCollision: true }));
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

test("the dead hold no place", () => {
  // A body marked dead is swept at step 5 and the rest of the pond has treated
  // it as gone since v1.0. It does not get to shove anyone on the way out.
  const world = emptyWorld();
  const a = place(world, 300, 300, 5);
  const b = place(world, 304, 300, 5);
  b.dead = true;
  world.step();

  assert.equal(a.x, 300, "the living creature was pushed by a corpse");
});

test("rock refuses a shove exactly as it refuses a step", () => {
  // A push is still a move, and the one thing that cannot happen is a body
  // ending up inside a wall. Both are placed in open water beside the same
  // slab, close enough that the shove drives one of them into it.
  const world = emptyWorld({ barriers: true, width: 900, height: 620 });
  const rock = world.barriers;
  let staged = null;
  // Find a spot just clear of rock with rock immediately to its left, and set a
  // pair up to be shoved into it.
  for (let x = 2; x < 900 && !staged; x++) {
    for (let y = 20; y < 600; y += 7) {
      if (!rock.blocked(x, y) && rock.blocked(x - 2, y)) {
        staged = { x, y };
        break;
      }
    }
  }
  assert.ok(staged, "no wall found to stage against");
  const a = place(world, staged.x, staged.y, 6);
  const b = place(world, staged.x + 4, staged.y, 6);
  world.step();

  assert.ok(!rock.blocked(a.x, a.y), `a shove put a body inside rock at ${a.x},${a.y}`);
  assert.ok(!rock.blocked(b.x, b.y), `a shove put a body inside rock at ${b.x},${b.y}`);
  // And the shove is not the creature's own move, so it does not count as the
  // rock turning it back.
  assert.equal(world.stats.walled, 0, "a push was recorded as the creature being walled");
});

test("a pond with the rule on stops standing on itself", () => {
  // The mechanism, in a real pond rather than a staged one — and the honest
  // version of it, which is a large reduction rather than zero: a relaxation
  // leaves whatever a tick's worth of new overlaps brings in.
  const overlaps = (w) => {
    let n = 0;
    for (let i = 0; i < w.creatures.length; i++) {
      for (let j = i + 1; j < w.creatures.length; j++) {
        const p = w.creatures[i];
        const q = w.creatures[j];
        const dx = wrapDelta(p.x, q.x, w.config.width);
        const dy = wrapDelta(p.y, q.y, w.config.height);
        const sum = p.radius + q.radius;
        if (dx * dx + dy * dy < sum * sum) n++;
      }
    }
    return n / w.creatures.length;
  };
  const run = (on) => {
    const w = new World(makeConfig({ seed: 314, bodyCollision: on }));
    for (let i = 0; i < 3000; i++) w.step();
    return overlaps(w);
  };
  const off = run(false);
  const on = run(true);
  assert.ok(off > 0.05, `the default pond barely overlaps at all (${off}), so there is nothing to fix`);
  assert.ok(on < off / 2, `overlaps per creature only fell from ${off} to ${on}`);
});

test("with the flag off, worlds are bit-for-bit unaffected", () => {
  assertUnaffected(
    new World(makeConfig({ seed: 314, bodyCollision: false })),
    new World(makeConfig({ seed: 314 })),
    300,
    "bodyCollision"
  );
});
