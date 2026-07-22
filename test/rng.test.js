import { test } from "node:test";
import assert from "node:assert/strict";
import { RNG, mulberry32 } from "../src/rng.js";

test("mulberry32 is deterministic for a given seed", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    assert.equal(a(), b());
  }
});

test("different seeds produce different streams", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  let differences = 0;
  for (let i = 0; i < 100; i++) {
    if (a() !== b()) differences++;
  }
  assert.ok(differences > 90, "streams should mostly differ");
});

test("float() stays in [0, 1)", () => {
  const rng = new RNG(7);
  for (let i = 0; i < 10000; i++) {
    const v = rng.float();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test("range() respects bounds", () => {
  const rng = new RNG(9);
  for (let i = 0; i < 10000; i++) {
    const v = rng.range(-5, 5);
    assert.ok(v >= -5 && v < 5);
  }
});

test("int() is inclusive on both ends", () => {
  const rng = new RNG(3);
  let sawMin = false;
  let sawMax = false;
  for (let i = 0; i < 5000; i++) {
    const v = rng.int(1, 3);
    assert.ok(v === 1 || v === 2 || v === 3);
    if (v === 1) sawMin = true;
    if (v === 3) sawMax = true;
  }
  assert.ok(sawMin && sawMax, "should reach both endpoints");
});

test("normal() has roughly zero mean and unit variance", () => {
  const rng = new RNG(123);
  const n = 50000;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = rng.normal();
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  assert.ok(Math.abs(mean) < 0.05, `mean ${mean} not near 0`);
  assert.ok(Math.abs(variance - 1) < 0.1, `variance ${variance} not near 1`);
});

test("RNG is reproducible across instances", () => {
  const a = new RNG(2024);
  const b = new RNG(2024);
  for (let i = 0; i < 50; i++) {
    assert.equal(a.gaussian(3, 2), b.gaussian(3, 2));
  }
});
