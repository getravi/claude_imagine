import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";

test("a world is deterministic for a fixed seed", () => {
  const a = new World(makeConfig({ seed: 777 }));
  const b = new World(makeConfig({ seed: 777 }));
  for (let i = 0; i < 500; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.creatures.length, b.creatures.length);
  assert.equal(a.stats.births, b.stats.births);
  assert.equal(a.stats.deaths, b.stats.deaths);
  // Deep-check: first creature positions match exactly.
  if (a.creatures.length > 0) {
    assert.equal(a.creatures[0].x, b.creatures[0].x);
    assert.equal(a.creatures[0].y, b.creatures[0].y);
  }
});

test("population stays within sane bounds over a long run", () => {
  const cfg = makeConfig({ seed: 12321 });
  const world = new World(cfg);
  let minPop = Infinity;
  let maxPop = 0;
  for (let i = 0; i < 8000; i++) {
    world.step();
    const p = world.creatures.length;
    if (p < minPop) minPop = p;
    if (p > maxPop) maxPop = p;
  }
  // Never exceeds the hard cap.
  assert.ok(maxPop <= cfg.populationMax, `population ${maxPop} exceeded cap`);
  // With auto-reseed on, life should still be present at the end.
  assert.ok(world.creatures.length > 0, "world went permanently extinct");
});

test("evolution advances the generation counter", () => {
  const world = new World(makeConfig({ seed: 55 }));
  for (let i = 0; i < 6000; i++) world.step();
  assert.ok(
    world.stats.maxGeneration >= 3,
    `expected several generations, got ${world.stats.maxGeneration}`
  );
});

test("no NaNs leak into creature state", () => {
  const world = new World(makeConfig({ seed: 4242 }));
  for (let i = 0; i < 3000; i++) world.step();
  for (const c of world.creatures) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), "position NaN");
    assert.ok(Number.isFinite(c.energy), "energy NaN");
    assert.ok(Number.isFinite(c.heading), "heading NaN");
  }
});

test("save/load round-trips the world state", () => {
  const world = new World(makeConfig({ seed: 99 }));
  for (let i = 0; i < 400; i++) world.step();
  const snapshot = JSON.parse(JSON.stringify(world.toJSON()));

  const restored = new World(makeConfig({ seed: 99 }));
  restored.loadJSON(snapshot);
  assert.equal(restored.creatures.length, snapshot.creatures.length);
  assert.equal(restored.food.items.length, snapshot.food.length);
  assert.equal(restored.tick, snapshot.tick);
});

test("feeding and seeding add to the world", () => {
  const world = new World(makeConfig({ seed: 5 }));
  const food0 = world.food.items.length;
  world.addFood(20);
  assert.ok(world.food.items.length >= food0); // capped, but never fewer
  const pop0 = world.creatures.length;
  world.addRandomCreatures(10);
  assert.equal(world.creatures.length, pop0 + 10);
});
