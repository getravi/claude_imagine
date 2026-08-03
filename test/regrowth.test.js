import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { FoodField, Food } from "../src/food.js";
import { FertilityField } from "../src/environment.js";
import { makeConfig } from "../src/config.js";
import { assertUnaffected } from "./support/paired.js";
import { RNG } from "../src/rng.js";

/** Shortest wrapped distance between two points on the torus. */
function wrapDist(a, b, config) {
  let dx = Math.abs(a.x - b.x);
  let dy = Math.abs(a.y - b.y);
  if (dx > config.width / 2) dx = config.width - dx;
  if (dy > config.height / 2) dy = config.height - dy;
  return Math.hypot(dx, dy);
}

/** A bare food field (no creatures, no world) to exercise spawning directly. */
function field(over = {}) {
  const config = makeConfig({ foodStart: 0, ...over });
  const rng = new RNG(config.seed);
  const fertility = new FertilityField(config, rng);
  return new FoodField(config, rng, fertility);
}

test("regrowth is off by default", () => {
  const world = new World(makeConfig({ seed: 5 }));
  assert.equal(world.config.foodRegrowth, false);
  assert.equal(world.food.growthFactor(), 1);
});

test("with regrowth off, worlds are bit-for-bit unaffected", () => {
  assertUnaffected(
    new World(makeConfig({ seed: 21, foodRegrowth: false })),
    new World(makeConfig({ seed: 21 })),
    2500,
    "foodRegrowth"
  );
});

test("the growth rate is exactly 1 when off, and stock-dependent when on", () => {
  const off = field({ foodRegrowth: false });
  assert.equal(off.growthFactor(), 1); // empty, and still exactly 1

  const on = field({ foodRegrowth: true, foodMax: 100, regrowthFloor: 0.25 });
  assert.equal(on.growthFactor(), 0.25); // a bare pond regrows at the floor
  for (let i = 0; i < 50; i++) on.items.push(new Food(10, 10));
  assert.ok(Math.abs(on.growthFactor() - 0.625) < 1e-12); // half stocked, half speed
  for (let i = 0; i < 50; i++) on.items.push(new Food(10, 10));
  assert.equal(on.growthFactor(), 1); // a full crop grows at the usual rate
});

test("a new pellet is seeded within regrowthRadius of a living one", () => {
  const f = field({ foodRegrowth: true, regrowthSpread: 1, foodPatches: false, regrowthRadius: 30 });
  f.items.push(new Food(450, 310));
  const parent = { x: 450, y: 310 };
  for (let i = 0; i < 40; i++) {
    const before = f.items.length;
    f.spawnOne();
    assert.equal(f.items.length, before + 1, "with no fertility gate every seed takes");
    // Every pellet descends from the one before it, so each is within one
    // radius of *some* pellet, not of the founder.
    const child = f.items[f.items.length - 1];
    const nearest = Math.min(
      ...f.items.slice(0, -1).map((p) => wrapDist(child, p, f.config))
    );
    assert.ok(nearest <= f.config.regrowthRadius + 1e-9, `seed landed ${nearest} away`);
  }
  // The bloom stays local: 41 pellets grown from one point cannot have crossed
  // the pond.
  const spread = Math.max(...f.items.map((p) => wrapDist(p, parent, f.config)));
  assert.ok(spread < 41 * f.config.regrowthRadius);
});

test("a stripped pond can still be recolonised from nothing", () => {
  const f = field({ foodRegrowth: true, regrowthSpread: 1 });
  assert.equal(f.items.length, 0);
  f.spawnOne(); // nothing to seed from, so a pellet must appear on its own
  assert.equal(f.items.length, 1);
});

test("the crop cannot exceed foodMax", () => {
  const f = field({ foodRegrowth: true, foodMax: 20 });
  for (let i = 0; i < 200; i++) f.spawnOne();
  assert.equal(f.items.length, 20);
});

test("a grazed-down crop recovers more slowly than a constant-rate one", () => {
  const grow = field({ foodRegrowth: true });
  const constant = field({ foodRegrowth: false });
  for (const f of [grow, constant]) {
    for (let i = 0; i < 6; i++) f.spawnAnywhere(); // the same handful of survivors
  }
  for (let i = 0; i < 400; i++) {
    grow.step();
    constant.step();
  }
  assert.ok(
    grow.items.length < 0.8 * constant.items.length,
    `regrowth ${grow.items.length} vs constant ${constant.items.length}`
  );
  assert.ok(grow.items.length > 6, "but it does recover, rather than staying dead");
});

test("blooms stay inside the biomes rather than carpeting the pond", () => {
  const meanFertility = (f) =>
    f.items.reduce((s, p) => s + f.fertility.at(p.x, p.y), 0) / f.items.length;
  const grow = field({ foodRegrowth: true });
  const constant = field({ foodRegrowth: false });
  for (let i = 0; i < 500; i++) {
    grow.spawnOne();
    constant.spawnOne();
  }
  // Seeds take with a probability equal to the local fertility, so the standing
  // crop of a regrowing pond sits, on average, on better ground than one sown
  // from the sky.
  assert.ok(
    meanFertility(grow) > meanFertility(constant),
    `${meanFertility(grow)} vs ${meanFertility(constant)}`
  );
});

test("a regrowth world stays alive and its crop oscillates", () => {
  const world = new World(makeConfig({ seed: 314, foodRegrowth: true }));
  let min = Infinity;
  let max = 0;
  for (let i = 0; i < 6000; i++) {
    world.step();
    if (i > 400) {
      min = Math.min(min, world.food.items.length);
      max = Math.max(max, world.food.items.length);
    }
  }
  assert.ok(world.creatures.length > 0, "grazers must not eat themselves to extinction");
  assert.ok(max - min > 40, `the standing crop should rise and fall (${min}..${max})`);
});

test("the chronicle only narrates overgrazing it actually witnessed", () => {
  // A pond with regrowth on but nothing eating: the crop is never stripped, so
  // neither line may appear.
  const calm = new World(makeConfig({ seed: 3, foodRegrowth: true, populationStart: 0, autoReseed: false }));
  for (let i = 0; i < 1200; i++) calm.step();
  assert.equal(calm.chronicle.events.filter((e) => e.cat === "regrowth").length, 0);
});
