import { test } from "node:test";
import assert from "node:assert/strict";
import { FertilityField, seasonalFactor, seasonPhase } from "../src/environment.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";
import { World } from "../src/world.js";

test("fertility field is deterministic for a fixed seed", () => {
  const cfg = makeConfig();
  const a = new FertilityField(cfg, new RNG(7));
  const b = new FertilityField(cfg, new RNG(7));
  assert.deepEqual(a.centres, b.centres);
});

test("fertility stays within [floor, 1] and peaks at a biome centre", () => {
  const cfg = makeConfig();
  const field = new FertilityField(cfg, new RNG(3));
  // Sample a grid; every value must be in range.
  for (let x = 0; x < cfg.width; x += 60) {
    for (let y = 0; y < cfg.height; y += 60) {
      const f = field.at(x, y);
      assert.ok(f >= cfg.patchFloor - 1e-6 && f <= 1 + 1e-6, `fertility ${f} out of range`);
    }
  }
  // At a centre the value should be essentially 1 (the peak of the bump).
  const c = field.centres[0];
  assert.ok(field.at(c.x, c.y) > 0.99, "a biome centre should be maximally fertile");
});

test("rejection sampling concentrates food in fertile areas", () => {
  const cfg = makeConfig();
  const field = new FertilityField(cfg, new RNG(11));
  const rng = new RNG(99);
  const N = 4000;
  let biased = 0;
  let uniform = 0;
  for (let i = 0; i < N; i++) {
    const p = field.sample(rng);
    biased += field.at(p.x, p.y);
    uniform += field.at(rng.range(0, cfg.width), rng.range(0, cfg.height));
  }
  // Sampled points should, on average, land in more fertile spots than uniform.
  assert.ok(biased / N > uniform / N, "biased sampling should prefer fertile areas");
});

test("sampled positions are always in bounds", () => {
  const cfg = makeConfig();
  const field = new FertilityField(cfg, new RNG(5));
  const rng = new RNG(5);
  for (let i = 0; i < 2000; i++) {
    const p = field.sample(rng);
    assert.ok(p.x >= 0 && p.x < cfg.width && p.y >= 0 && p.y < cfg.height);
  }
});

test("biomes stay put with drift 0 and roam with drift > 0", () => {
  const cfg = makeConfig();
  const field = new FertilityField(cfg, new RNG(4));
  const start = field.centres.map((c) => ({ x: c.x, y: c.y }));
  for (let i = 0; i < 500; i++) field.update(0); // no drift
  field.centres.forEach((c, i) => {
    assert.equal(c.x, start[i].x, "no drift ⇒ no movement (x)");
    assert.equal(c.y, start[i].y, "no drift ⇒ no movement (y)");
  });
  for (let i = 0; i < 500; i++) field.update(0.1); // drifting
  let moved = false;
  field.centres.forEach((c, i) => {
    if (Math.abs(c.x - start[i].x) > 1 || Math.abs(c.y - start[i].y) > 1) moved = true;
  });
  assert.ok(moved, "positive drift should move the biomes");
});

test("drifting biomes stay within world bounds (wrap)", () => {
  const cfg = makeConfig();
  const field = new FertilityField(cfg, new RNG(8));
  for (let i = 0; i < 20000; i++) field.update(0.2);
  for (const c of field.centres) {
    assert.ok(c.x >= 0 && c.x < cfg.width, "x wrapped in bounds");
    assert.ok(c.y >= 0 && c.y < cfg.height, "y wrapped in bounds");
  }
});

test("drift directions are RNG-free (two fields share the same directions)", () => {
  const cfg = makeConfig();
  const a = new FertilityField(cfg, new RNG(1));
  const b = new FertilityField(cfg, new RNG(999)); // different RNG
  // Directions come from the index, not the RNG, so they must match.
  assert.deepEqual(a.driftDirs, b.driftDirs);
});

test("seasonal factor swings within [1-amp, 1+amp] and averages ~1", () => {
  const cfg = makeConfig({ seasons: true, seasonAmplitude: 0.3, seasonLength: 2600 });
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  const N = 2600; // exactly one year
  for (let t = 0; t < N; t++) {
    const f = seasonalFactor(t, cfg);
    sum += f;
    min = Math.min(min, f);
    max = Math.max(max, f);
  }
  assert.ok(min >= 1 - cfg.seasonAmplitude - 1e-6);
  assert.ok(max <= 1 + cfg.seasonAmplitude + 1e-6);
  assert.ok(Math.abs(sum / N - 1) < 0.02, "a full year should average to ~1");
});

test("seasons disabled means a constant factor of 1", () => {
  const cfg = makeConfig({ seasons: false });
  for (let t = 0; t < 1000; t += 37) assert.equal(seasonalFactor(t, cfg), 1);
});

test("seasonPhase stays in [0, 1]", () => {
  const cfg = makeConfig();
  for (let t = 0; t < 5200; t += 13) {
    const p = seasonPhase(t, cfg);
    assert.ok(p >= 0 && p <= 1);
  }
});

test("a world with seasons and biomes survives several years", () => {
  const world = new World(makeConfig({ seed: 314 }));
  let minPop = Infinity;
  for (let i = 0; i < 8000; i++) {
    world.step();
    minPop = Math.min(minPop, world.creatures.length);
  }
  assert.ok(world.creatures.length > 0, "world should survive the seasons");
  assert.ok(minPop >= 1, "rescue floor keeps at least a few alive");
});
