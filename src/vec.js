// vec.js — minimal 2D vector helpers, including toroidal ("wrap-around")
// geometry. Vivarium's world is a torus: a creature that walks off the right
// edge reappears on the left, and the top connects to the bottom. This has no
// walls or corners, so there are no privileged hiding spots — evolution can't
// cheat by cowering in a corner. The trade-off is that "distance" and
// "direction" must account for the shorter path that may cross a seam.

/**
 * Shortest signed delta along one wrapped axis of length `size`.
 * Returns a value in (-size/2, size/2]. Example: on a width-100 world the
 * delta from x=95 to x=5 is +10 (across the seam), not -90.
 * @param {number} a - source coordinate
 * @param {number} b - target coordinate
 * @param {number} size - length of the axis
 */
export function wrapDelta(a, b, size) {
  let d = b - a;
  const half = size / 2;
  if (d > half) d -= size;
  else if (d < -half) d += size;
  return d;
}

/** Wrap a coordinate back into [0, size). */
export function wrap(x, size) {
  // Two mods handle negatives without a branch-heavy loop.
  return ((x % size) + size) % size;
}

/**
 * Squared toroidal distance between two points. Squared because we usually
 * only need to compare distances (finding the nearest thing), and skipping
 * the square root there is a meaningful speed-up in the hot loop.
 */
export function torusDist2(ax, ay, bx, by, w, h) {
  const dx = wrapDelta(ax, bx, w);
  const dy = wrapDelta(ay, by, h);
  return dx * dx + dy * dy;
}

/** Toroidal Euclidean distance. */
export function torusDist(ax, ay, bx, by, w, h) {
  return Math.sqrt(torusDist2(ax, ay, bx, by, w, h));
}

/** Normalize an angle to (-π, π]. */
export function normalizeAngle(a) {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Clamp a number to [min, max]. */
export function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
