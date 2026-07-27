import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { TerrainField, terrainCostAt, groundBias } from "../src/terrain.js";
import { Chronicle } from "../src/chronicle.js";
import { RNG } from "../src/rng.js";
import { FoodField } from "../src/food.js";
import { FertilityField } from "../src/environment.js";

const field = (over = {}) => new TerrainField(makeConfig({ terrain: true, ...over }));

// --- The no-op guarantee ---------------------------------------------------

test("terrain is off by default and a world without it has no field", () => {
  const world = new World(makeConfig({ seed: 5 }));
  assert.equal(world.config.terrain, false);
  assert.equal(world.terrain, null);
  assert.equal(terrainCostAt(world.terrain, 100, 100), 1);
  for (const c of world.creatures) assert.equal(c.ground, 1);
});

test("terrainCostAt returns literally 1 without a field", () => {
  // Not "about 1" — the exact double, because it is multiplied into the
  // metabolic bill unconditionally and x1 must be bit-for-bit invisible.
  for (const absent of [null, undefined]) {
    assert.equal(terrainCostAt(absent, 0, 0), 1);
    assert.equal(terrainCostAt(absent, -9999.5, 12345.25), 1);
    assert.equal(Object.is(terrainCostAt(absent, 3, 7), 1), true);
  }
});

test("with terrain off, worlds are bit-for-bit unaffected", () => {
  const withFlag = new World(makeConfig({ seed: 21, terrain: false }));
  const withoutFlag = new World(makeConfig({ seed: 21 }));
  for (let i = 0; i < 2500; i++) {
    withFlag.step();
    withoutFlag.step();
  }
  assert.equal(withFlag.creatures.length, withoutFlag.creatures.length);
  assert.equal(withFlag.food.items.length, withoutFlag.food.items.length);
  assert.equal(withFlag.stats.births, withoutFlag.stats.births);
  assert.equal(withFlag.stats.deaths, withoutFlag.stats.deaths);
  // The full fingerprint: every creature and every pellet.
  for (let i = 0; i < withFlag.creatures.length; i++) {
    const a = withFlag.creatures[i];
    const b = withoutFlag.creatures[i];
    assert.equal(a.x, b.x);
    assert.equal(a.y, b.y);
    assert.equal(a.energy, b.energy);
    assert.equal(a.age, b.age);
    assert.equal(a.heading, b.heading);
    assert.equal(a.generation, b.generation);
  }
  for (let i = 0; i < withFlag.food.items.length; i++) {
    assert.equal(withFlag.food.items[i].x, withoutFlag.food.items[i].x);
    assert.equal(withFlag.food.items[i].y, withoutFlag.food.items[i].y);
  }
});

test("building the landscape draws no random numbers", () => {
  // The precise claim, and the one the no-op guarantee rests on: a TerrainField
  // is hashed from the seed, not drawn from a stream, so constructing one
  // cannot advance any RNG. (Terrain being *on* does change how many numbers
  // the crop goes on to consume — ground that refuses a pellet makes it look
  // again. That is a terrain-on world diverging from a terrain-off one, which
  // is the entire point of the feature; what must never move is a world with
  // terrain off, which the fingerprint test above pins.)
  const control = new RNG(77);
  const expected = [control.float(), control.float(), control.float()];

  const probe = new RNG(77);
  assert.equal(probe.float(), expected[0]);
  new TerrainField(makeConfig({ seed: 77, terrain: true }));
  new TerrainField(makeConfig({ seed: 99, terrain: true }));
  assert.equal(probe.float(), expected[1]);
  assert.equal(probe.float(), expected[2]);
});

test("terrain is built after the biomes, so the landscape they sit on is the seed's", () => {
  // The fertility field is drawn from the world RNG before terrain exists, so
  // the biome centres of a rough world are exactly those of the flat one. The
  // basins and the fertile patches are therefore placed independently — terrain
  // is not quietly moving the food to where it already wanted to be.
  const flat = new World(makeConfig({ seed: 77, terrain: false }));
  const rough = new World(makeConfig({ seed: 77, terrain: true }));
  assert.equal(rough.environment.centres.length, flat.environment.centres.length);
  for (let i = 0; i < flat.environment.centres.length; i++) {
    assert.deepEqual(rough.environment.centres[i], flat.environment.centres[i]);
  }
});

// --- The landscape itself --------------------------------------------------

test("roughness stays inside [0,1] and reaches both ends", () => {
  for (const seed of [1, 314, 9001, 123456]) {
    const t = field({ seed });
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = 0; y < 620; y += 3) {
      for (let x = 0; x < 900; x += 3) {
        const r = t.at(x, y);
        assert.ok(r >= 0 && r <= 1, `roughness ${r} out of range on seed ${seed}`);
        if (r < lo) lo = r;
        if (r > hi) hi = r;
      }
    }
    // Normalisation is over the grid nodes and bilinear interpolation is
    // monotone between them, so the extremes are exact — every seed gets a
    // landscape that spans the whole range rather than a washed-out one.
    assert.ok(lo < 0.02, `seed ${seed} never gets flat (min ${lo})`);
    assert.ok(hi > 0.98, `seed ${seed} never gets rough (max ${hi})`);
  }
});

test("the landscape is exactly periodic — the torus has no seam", () => {
  const t = field({ seed: 314 });
  const { width, height } = t.config;
  for (let y = 0; y < height; y += 17) {
    assert.ok(Math.abs(t.at(0, y) - t.at(width, y)) < 1e-12, `x seam at y=${y}`);
    assert.ok(Math.abs(t.at(3.5, y) - t.at(width + 3.5, y)) < 1e-12, `x seam at y=${y}`);
  }
  for (let x = 0; x < width; x += 19) {
    assert.ok(Math.abs(t.at(x, 0) - t.at(x, height)) < 1e-12, `y seam at x=${x}`);
  }
  // And negative coordinates wrap the same way, so nothing has to pre-clamp.
  assert.ok(Math.abs(t.at(-40, -40) - t.at(width - 40, height - 40)) < 1e-12);
});

test("the same seed always builds the same landscape, different seeds don't", () => {
  const a = field({ seed: 314 });
  const b = field({ seed: 314 });
  const c = field({ seed: 315 });
  let differs = 0;
  for (let i = 0; i < a.grid.length; i++) {
    assert.equal(a.grid[i], b.grid[i]);
    if (Math.abs(a.grid[i] - c.grid[i]) > 0.05) differs++;
  }
  assert.ok(differs > a.grid.length * 0.5, "a different seed should be a different world");
});

test("the field is smooth — no cliffs between neighbouring points", () => {
  const t = field({ seed: 42 });
  let worst = 0;
  for (let y = 0; y < 620; y += 5) {
    for (let x = 0; x < 900; x += 5) {
      worst = Math.max(worst, Math.abs(t.at(x + 1, y) - t.at(x, y)));
      worst = Math.max(worst, Math.abs(t.at(x, y + 1) - t.at(x, y)));
    }
  }
  assert.ok(worst < 0.05, `a 1px step changed roughness by ${worst}`);
});

test("cost runs from exactly 1 on the flats to terrainRoughCost on the ridges", () => {
  const t = field({ seed: 7, terrainRoughCost: 3 });
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < 620; y += 2) {
    for (let x = 0; x < 900; x += 2) {
      const f = t.costFactor(x, y);
      assert.ok(f >= 1 - 1e-12 && f <= 3 + 1e-12, `cost ${f} out of range`);
      if (f < lo) lo = f;
      if (f > hi) hi = f;
    }
  }
  assert.ok(lo < 1.05 && hi > 2.95, `cost only spanned ${lo}..${hi}`);
});

test("mean roughness matches the field's own average", () => {
  const t = field({ seed: 99 });
  let sum = 0;
  let n = 0;
  for (let y = 0; y < 620; y += 1) {
    for (let x = 0; x < 900; x += 1) {
      sum += t.at(x, y);
      n++;
    }
  }
  // The node average is the continuous average exactly; sampling on a
  // mismatched pixel lattice gets there to within a small tolerance.
  assert.ok(Math.abs(sum / n - t.mean) < 0.01, `mean ${t.mean} vs sampled ${sum / n}`);
});

// --- The measurement -------------------------------------------------------

test("groundBias is exactly 0 without terrain, and 0 for an empty pond", () => {
  const t = field({ seed: 3 });
  const some = [{ x: 10, y: 10 }, { x: 500, y: 300 }];
  assert.equal(groundBias(null, some), 0);
  assert.equal(groundBias(undefined, some), 0);
  assert.equal(groundBias(t, []), 0);
});

test("groundBias reads negative for a crowd in a basin, positive on a ridge", () => {
  const t = field({ seed: 314 });
  // Find the flattest and roughest points on a coarse sweep, then put a crowd
  // on each — the statistic must be able to tell them apart.
  let flat = { x: 0, y: 0, r: Infinity };
  let rough = { x: 0, y: 0, r: -Infinity };
  for (let y = 0; y < 620; y += 4) {
    for (let x = 0; x < 900; x += 4) {
      const r = t.at(x, y);
      if (r < flat.r) flat = { x, y, r };
      if (r > rough.r) rough = { x, y, r };
    }
  }
  const crowd = (p) => Array.from({ length: 30 }, (_, i) => ({ x: p.x + i * 0.1, y: p.y }));
  assert.ok(groundBias(t, crowd(flat)) < -0.3, "a basin crowd should read well below average");
  assert.ok(groundBias(t, crowd(rough)) > 0.3, "a ridge crowd should read well above average");
});

test("stats.groundBias stays exactly 0 through a run without terrain", () => {
  const world = new World(makeConfig({ seed: 12, terrain: false }));
  for (let i = 0; i < 400; i++) {
    world.step();
    assert.equal(world.stats.groundBias, 0);
  }
});

// --- The crop follows the ground -------------------------------------------

test("_takes is unconditionally true without terrain, and draws nothing", () => {
  const config = makeConfig({ seed: 123, foodStart: 0, terrain: false });
  const rng = new RNG(123);
  const food = new FoodField(config, rng, new FertilityField(config, rng), null);
  const control = new RNG(123);
  new FertilityField(config, control); // same draws, same point in the stream
  for (let i = 0; i < 200; i++) {
    assert.equal(food._takes(i * 3.1, i * 2.7), true);
  }
  // 200 rejection tests later the stream has not moved a single number.
  assert.equal(rng.float(), control.float());
  assert.equal(rng.float(), control.float());
});

test("terrain moves the crop without shrinking it", () => {
  // The contract the biomes have kept since v1.3: placement changes, influx does
  // not. Measured with no creatures in the world at all, because standing crop
  // is grazed crop — a rough world concentrates its grazers along with its food,
  // so comparing what is *left* would confuse ecology with bookkeeping. The
  // bounded retry is what buys this; an unbounded rejection loop would quietly
  // lose the ridges' share of the food.
  const influx = (terrain, foodPatches) => {
    const cfg = makeConfig({ seed: 21, foodStart: 0, foodMax: 1e9, foodPatches, terrain });
    const rng = new RNG(21);
    const fertility = new FertilityField(cfg, rng);
    const field = new FoodField(cfg, rng, fertility, terrain ? new TerrainField(cfg) : null);
    for (let i = 0; i < 2000; i++) field.step(1);
    return field.items.length;
  };
  for (const foodPatches of [true, false]) {
    assert.equal(influx(true, foodPatches), influx(false, foodPatches));
  }
});

test("the crop favours the basins, and only because the ground is barren", () => {
  // The negative result, pinned so it cannot quietly stop being true. Both
  // worlds pay the full 2.6x movement cost on the ridges; the only difference
  // is whether the ground also refuses to grow anything. That difference is the
  // entire effect — see docs/SCIENCE.md.
  const settle = (barrenness) => {
    let sum = 0;
    for (const seed of [314, 7, 21]) {
      const w = new World(makeConfig({ seed, terrain: true, terrainBarrenness: barrenness }));
      for (let i = 0; i < 4000; i++) w.step();
      sum += groundBias(w.terrain, w.creatures);
    }
    return sum / 3;
  };
  const costOnly = settle(0);
  const shipped = settle(0.85);
  assert.ok(costOnly > -0.01, `a movement tax alone should not settle the pond (got ${costOnly})`);
  assert.ok(shipped < -0.015, `barren ridges should settle the pond (got ${shipped})`);
  assert.ok(shipped < costOnly - 0.02, "the two must be clearly different, not merely ordered");
});

// --- The mechanic in a running world ---------------------------------------

test("with terrain on, creatures pay the ground they stand on", () => {
  const world = new World(makeConfig({ seed: 8, terrain: true }));
  world.step();
  assert.ok(world.terrain instanceof TerrainField);
  let sawRough = false;
  for (const c of world.creatures) {
    const expected = world.terrain.costFactor(c.x, c.y);
    // `ground` is read before the creature moves, so it belongs to where it
    // *was*; all that can be asserted here is that it is a real cost in range.
    assert.ok(c.ground >= 1 && c.ground <= world.config.terrainRoughCost);
    assert.ok(expected >= 1 && expected <= world.config.terrainRoughCost);
    if (c.ground > 1.5) sawRough = true;
  }
  assert.ok(sawRough, "40 founders scattered at random should include some on rough ground");
});

test("terrain changes the world it is switched on in", () => {
  const flat = new World(makeConfig({ seed: 314, terrain: false }));
  const rough = new World(makeConfig({ seed: 314, terrain: true }));
  for (let i = 0; i < 600; i++) {
    flat.step();
    rough.step();
  }
  const same = flat.creatures.every(
    (c, i) => rough.creatures[i] && rough.creatures[i].x === c.x
  );
  assert.equal(same, false, "a landscape that costs energy must change trajectories");
});

test("the pond survives terrain — it is a pressure, not a cull", () => {
  // The cost is tuned to reshape where life sits, not to end it. Swept over
  // seeds so this isn't one lucky world.
  for (const seed of [314, 7, 2024]) {
    const world = new World(makeConfig({ seed, terrain: true }));
    for (let i = 0; i < 3000; i++) world.step();
    assert.ok(
      world.creatures.length > 30,
      `seed ${seed} collapsed to ${world.creatures.length} under terrain`
    );
  }
});

test("toggling terrain off mid-run puts everyone back on flat ground", () => {
  const world = new World(makeConfig({ seed: 15, terrain: true }));
  for (let i = 0; i < 200; i++) world.step();
  assert.ok(world.creatures.some((c) => c.ground > 1.05), "someone should be on a slope");
  world.config.terrain = false;
  world.syncTerrain();
  assert.equal(world.terrain, null);
  for (const c of world.creatures) assert.equal(c.ground, 1);
  // And from here it costs nothing again: a stale bill would be paid forever.
  world.step();
  for (const c of world.creatures) assert.equal(c.ground, 1);
  assert.equal(world.stats.groundBias, 0);
});

test("toggling terrain on mid-run builds the landscape the seed asks for", () => {
  const world = new World(makeConfig({ seed: 15, terrain: false }));
  for (let i = 0; i < 100; i++) world.step();
  world.config.terrain = true;
  world.syncTerrain();
  const fresh = field({ seed: 15 });
  assert.ok(world.terrain);
  for (let i = 0; i < fresh.grid.length; i += 97) {
    assert.equal(world.terrain.grid[i], fresh.grid[i]);
  }
});

// --- The chronicle guard ---------------------------------------------------

test("the settling line can never fire without terrain", () => {
  // Driven through the real observe(), on a real world, with the statistic
  // forced to a value no settled pond ever reaches — so the only thing that can
  // keep the line quiet is the config gate itself.
  const world = new World(makeConfig({ seed: 1, terrain: false }));
  for (let t = 0; t < 600; t++) {
    world.step();
    world.stats.groundBias = -0.9;
    world.chronicle.observe(world, world.tick);
  }
  assert.equal(world.chronicle._settled, false);
  assert.equal(world.chronicle._settleStreak, 0);
  assert.equal(world.chronicle.events.filter((e) => e.cat === "terrain").length, 0);
});

test("the settling line needs a sustained bias, not one lucky frame", () => {
  const chronicle = new Chronicle(makeConfig({ seed: 1, terrain: true }));
  const s = { groundBias: -0.2 };
  for (let t = 0; t < 239; t++) chronicle._checkTerrain(t, 200, s);
  assert.equal(chronicle.events.length, 0, "239 samples is not yet a settlement");
  // A single wandering frame resets the streak rather than being smoothed over.
  s.groundBias = 0.01;
  chronicle._checkTerrain(240, 200, s);
  s.groundBias = -0.2;
  for (let t = 241; t < 480; t++) chronicle._checkTerrain(t, 200, s);
  assert.equal(chronicle.events.length, 0, "the streak should have restarted");
  chronicle._checkTerrain(480, 200, s);
  assert.equal(chronicle.events.length, 1);
  assert.match(chronicle.events[0].msg, /found its flats — the living are on ground 20% smoother/);
  // One-shot: a settled pond doesn't keep announcing it.
  for (let t = 481; t < 900; t++) chronicle._checkTerrain(t, 200, s);
  assert.equal(chronicle.events.length, 1);
});

test("the settling line stays quiet for a handful of survivors", () => {
  const chronicle = new Chronicle(makeConfig({ seed: 1, terrain: true }));
  const s = { groundBias: -0.5 };
  for (let t = 0; t < 1000; t++) chronicle._checkTerrain(t, 12, s);
  assert.equal(chronicle.events.length, 0, "a mean over 12 creatures isn't a settlement");
});
