import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wrapDelta,
  wrap,
  torusDist2,
  torusDist,
  normalizeAngle,
  clamp,
  lerp,
} from "../src/vec.js";

test("wrapDelta takes the short way around the seam", () => {
  // On a width-100 world, 95 -> 5 is +10, not -90.
  assert.equal(wrapDelta(95, 5, 100), 10);
  assert.equal(wrapDelta(5, 95, 100), -10);
  // No wrap needed in the interior.
  assert.equal(wrapDelta(20, 30, 100), 10);
});

test("wrap keeps coordinates in [0, size)", () => {
  assert.equal(wrap(105, 100), 5);
  assert.equal(wrap(-5, 100), 95);
  assert.equal(wrap(0, 100), 0);
  const v = wrap(-0.0001, 100);
  assert.ok(v >= 0 && v < 100);
});

test("torus distance accounts for wrap-around", () => {
  // Points at x=1 and x=99 on a width-100 torus are 2 apart, not 98.
  const d = torusDist(1, 50, 99, 50, 100, 100);
  assert.ok(Math.abs(d - 2) < 1e-9);
});

test("torusDist2 equals the square of torusDist", () => {
  const d = torusDist(10, 10, 40, 60, 100, 100);
  const d2 = torusDist2(10, 10, 40, 60, 100, 100);
  assert.ok(Math.abs(d2 - d * d) < 1e-6);
});

test("normalizeAngle maps into (-pi, pi]", () => {
  assert.ok(Math.abs(normalizeAngle(3 * Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(normalizeAngle(-3 * Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(normalizeAngle(0)) < 1e-9);
});

test("clamp bounds values", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test("lerp interpolates", () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.5), 5);
});
