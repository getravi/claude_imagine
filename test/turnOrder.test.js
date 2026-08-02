// turnOrder.test.js — who goes first, and what it is worth.
//
// `world.step()` sweeps `this.creatures` one creature at a time, and that array
// is birth order: step 5 keeps survivors in place and appends the newborns. So
// a founder sits near the front for its whole life and every contest inside a
// tick is settled by seniority — a rule nobody wrote down for forty-six
// versions, because it does not look like a rule. It looks like a loop.
//
// Two events are decided by it and nothing else, and both are counted here:
// a pellet two creatures are standing on (`stats.contested`) and the last free
// place in a full pond (`stats.crowdedOut`).
//
// The staged ponds below are the v1.45 pattern: two creatures placed by hand on
// one pellet say exactly what the rule is, in one tick, where waiting for the
// same collision in a real pond takes thousands and describes its frequency
// rather than the rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { Food } from "../src/food.js";
import { RNG } from "../src/rng.js";
import { stateFingerprint } from "../src/fingerprint.js";

/** An empty pond: nothing lives, grows or spawns except what we put in it. */
function emptyWorld(extra = {}) {
  return new World(
    makeConfig({
      seed: 5,
      populationStart: 0,
      foodStart: 0,
      foodSpawnRate: 0,
      autoReseed: false,
      ...extra,
    })
  );
}

/** Put one creature into `world` at (x, y), classified like a founder. */
function place(world, x, y, energy) {
  const rng = new RNG(11);
  const c = new Creature(Genome.random(rng, false), world.config, x, y, rng);
  c.energy = energy;
  world.phylogeny.assign(c, 0, null);
  world.creatures.push(c);
  return c;
}

/**
 * Two creatures on top of one pellet, both well inside `eatRadius` of it, both
 * with energy enough to live through the tick and too little to split.
 */
function twoOnOnePellet(extra = {}) {
  const world = emptyWorld(extra);
  const first = place(world, 300, 300, 90);
  const second = place(world, 302, 300, 90);
  world.food.items.push(new Food(301, 300));
  return { world, first, second };
}

test("the earlier index eats, and the later one goes hungry", () => {
  const { world, first, second } = twoOnOnePellet();
  const e1 = first.energy;
  const e2 = second.energy;
  world.step();

  assert.ok(first.energy > e1, "the creature earlier in the array took the pellet");
  assert.ok(second.energy < e2, "the later one paid its metabolic bill and got nothing");
  assert.equal(world.food.items.length, 0, "exactly one pellet, exactly one meal");
  assert.equal(world.stats.contested, 1, "and the loss is on the record");
});

test("it is the index that wins, not the creature", () => {
  // The same pond with the two of them the other way round. Nothing about
  // either body has changed — only which of them the loop reaches first.
  const world = emptyWorld();
  const second = place(world, 302, 300, 90);
  const first = place(world, 300, 300, 90);
  world.food.items.push(new Food(301, 300));
  const eFirst = first.energy;
  const eSecond = second.energy;
  world.step();

  assert.ok(second.energy > eSecond, "now the one at index 0 eats");
  assert.ok(first.energy < eFirst, "and the one that ate last time does not");
  assert.equal(world.stats.contested, 1);
});

test("a shuffled order can hand the pellet to the junior", () => {
  // Seed 3 is one where the tick's Fisher-Yates swap puts index 1 first; the
  // point of the flag is that seniority stops being the answer, not that the
  // answer is reversed, so which seed does it is arbitrary and stated here
  // rather than searched for at runtime.
  const { world, first, second } = twoOnOnePellet({ seed: 3, shuffleTurnOrder: true });
  const e1 = first.energy;
  const e2 = second.energy;
  world.step();

  assert.ok(second.energy > e2, "the later index took the pellet this time");
  assert.ok(first.energy < e1, "and the senior went hungry");
  assert.equal(world.stats.contested, 1, "the same event happened — to somebody else");
});

test("losing one of two pellets costs nothing, and is not counted", () => {
  // A creature eats at most one pellet per tick, so a contest it can afford to
  // lose is not a loss. This is what stops `contested` being a count of
  // proximity rather than of hunger.
  const { world, first, second } = twoOnOnePellet();
  world.food.items.push(new Food(303, 300));
  const e1 = first.energy;
  const e2 = second.energy;
  world.step();

  assert.ok(first.energy > e1, "both of them ate");
  assert.ok(second.energy > e2);
  assert.equal(world.stats.contested, 0, "nobody went hungry, so nothing was lost");
});

test("a pellet out of reach is not a contest", () => {
  // Far enough away that neither could have eaten it in this tick: the pellet
  // one creature takes has to be inside the *other's* eating reach, or the
  // counter is measuring the crop rather than the order.
  const world = emptyWorld();
  const a = place(world, 300, 300, 90);
  place(world, 300 + DEFAULT_CONFIG.eatRadius + a.radius + 40, 300, 90);
  world.food.items.push(new Food(300, 300));
  world.step();

  assert.equal(world.stats.contested, 0);
});

test("the last place in a full pond goes to whoever the loop reaches first", () => {
  // Staged rather than waited for: over twelve seeds and 9,000 ticks each, a
  // default pond peaks around 300 creatures and `populationMax` is 650, so this
  // refusal — the sharper of the two things the order decides, because it is a
  // whole line that does not start rather than one missed meal — never once
  // fires in the world anybody actually looks at. See docs/SCIENCE.md.
  const world = emptyWorld({ populationMax: 3 });
  for (let i = 0; i < 3; i++) place(world, 200 + i * 60, 300, DEFAULT_CONFIG.reproduceThreshold + 40);
  world.step();

  assert.equal(world.stats.births, 0, "the pond was already at its cap");
  assert.equal(world.stats.crowdedOut, 3, "so all three were refused, and all three are counted");

  // One place free, three candidates: the first one reached takes it.
  const room = emptyWorld({ populationMax: 4 });
  const winner = place(room, 200, 300, DEFAULT_CONFIG.reproduceThreshold + 40);
  for (let i = 1; i < 3; i++) place(room, 200 + i * 60, 300, DEFAULT_CONFIG.reproduceThreshold + 40);
  room.step();

  assert.equal(room.stats.births, 1);
  assert.equal(room.stats.crowdedOut, 2, "the other two were refused by their index");
  assert.ok(winner.energy < DEFAULT_CONFIG.reproduceThreshold, "and the one that bred paid for it");
});

test("neither counter fires in a pond with room and no collisions", () => {
  // The v1.20 discipline: a statistic that is non-zero when its mechanism is
  // absent is not measuring the mechanism. One creature, one pellet, nothing to
  // contest and nothing to be refused.
  const world = emptyWorld();
  place(world, 300, 300, 90);
  world.food.items.push(new Food(300, 300));
  for (let i = 0; i < 50; i++) world.step();

  assert.equal(world.stats.contested, 0);
  assert.equal(world.stats.crowdedOut, 0);
});

test("shuffling is off by default and leaves worlds bit-for-bit unchanged", () => {
  assert.equal(DEFAULT_CONFIG.shuffleTurnOrder, false);
  const withFlag = new World(makeConfig({ seed: 21, shuffleTurnOrder: false }));
  const withoutFlag = new World(makeConfig({ seed: 21 }));
  // Count the draws as well as the outcome: the flag's whole cost is a
  // permutation, and a permutation is drawn. Off, not one number may move.
  let drawsA = 0;
  let drawsB = 0;
  const nextA = withFlag.rng.next;
  withFlag.rng.next = () => {
    drawsA++;
    return nextA();
  };
  const nextB = withoutFlag.rng.next;
  withoutFlag.rng.next = () => {
    drawsB++;
    return nextB();
  };
  for (let i = 0; i < 1500; i++) {
    withFlag.step();
    withoutFlag.step();
  }
  assert.equal(drawsA, drawsB, "the flag being present must not cost a single draw");
  assert.equal(stateFingerprint(withFlag), stateFingerprint(withoutFlag));
});

test("off, the sweep walks the population array itself", () => {
  // Not merely an equal order — the same object, so there is no copy to make
  // and nothing to allocate per tick in a world that did not ask for one.
  const world = new World(makeConfig({ seed: 9 }));
  assert.equal(world._turnOrder(), world.creatures);

  const shuffled = new World(makeConfig({ seed: 9, shuffleTurnOrder: true }));
  const order = shuffled._turnOrder();
  assert.notEqual(order, shuffled.creatures, "on, it is a permutation of its own");
  assert.equal(order.length, shuffled.creatures.length, "a permutation: nobody added");
  assert.deepEqual(
    [...order].sort((a, b) => a.id - b.id),
    [...shuffled.creatures].sort((a, b) => a.id - b.id),
    "and nobody dropped or duplicated"
  );
});

test("the shuffle costs exactly one draw per creature after the first", () => {
  // Fisher-Yates over n creatures is n-1 draws — worth pinning, because the
  // twelve-seed measurement in docs/SCIENCE.md has a control arm that burns
  // this exact number of draws without reordering anything, and that arm is
  // only a control if the count matches.
  const world = new World(makeConfig({ seed: 9, shuffleTurnOrder: true }));
  let draws = 0;
  const next = world.rng.next;
  world.rng.next = () => {
    draws++;
    return next();
  };
  const n = world.creatures.length;
  world._turnOrder();
  assert.ok(n > 1);
  assert.equal(draws, n - 1);
});
