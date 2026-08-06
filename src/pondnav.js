// pondnav.js — the selection, moved by a keyboard.
//
// v1.51 walked this page with a keyboard and finished with a sentence: the pond
// canvas and the minimap take clicks and cannot be focused, so selecting a
// creature and jumping the view have no keyboard route at all. That was filed as
// a feature rather than a patch, because it needs an answer to a design question
// a `tabindex` does not settle: **what does Tab into the pond select, and how do
// you step between three hundred creatures?**
//
// A list is the obvious answer and it is the wrong one. The pond has no list —
// `world.creatures` is in birth order, which v1.47 established is not a fact
// about the world but an accident of the sweep, and stepping through it would
// walk a viewer randomly around the water. What a viewer has instead is a
// *place*: the thing they are looking at, and the things around it. So the rule
// here is spatial, in the shape every television remote uses — an arrow key
// moves the selection to the nearest creature in that direction.
//
// Three properties fall out of that, and each is pinned by a test:
//
//   **The four directions tile the plane.** A candidate belongs to "east" when
//   `dx > 0 && |dy| <= dx`, and to the other three by symmetry, so every
//   non-zero offset satisfies at least one of them (whichever axis is larger
//   decides, and a diagonal belongs to two). No creature can be stranded in a
//   gap between the quadrants. This is the v1.24/v1.42 tiling claim on a
//   navigation rule rather than on a picture, and it is checked by walking the
//   offsets, not by an aggregate that two cancelling errors could satisfy.
//
//   **On a torus a direction cannot run out of world.** Offsets are wrapped
//   (`wrapDelta`), which is the same arithmetic `camera.nearest()` uses to hide
//   the seam, so "east" from a creature at the right-hand edge continues into
//   the left-hand edge exactly as the water does. A direction returns nothing
//   only when the quadrant is genuinely empty of the living.
//
//   **It is the viewer's geometry, not a creature's.** Rock does not block a
//   step even with `barrierOcclusion` on, and neither does distance: occlusion
//   is a rule about what a *creature* can sense, and a watcher can plainly see
//   the far side of a wall. A selection rule that inherited the simulation's
//   senses would be a different feature wearing this one's name.
//
// Pure, like `describe.js` and `gestures.js`: it reads positions, draws no
// random numbers, and nothing in the simulation reads it back. `main.js` is only
// the adapter that turns a key event into one of these calls.

import { wrapDelta } from "./vec.js";

/**
 * Which direction each key means. Arrow keys only: the letter keys are already
 * spoken for by the shortcut bar (`v`, `f`, `n`, …), and a keyboard user who
 * has focused the pond should not have to learn a second alphabet.
 */
export const DIRECTION_KEYS = {
  ArrowLeft: "west",
  ArrowRight: "east",
  ArrowUp: "north",
  ArrowDown: "south",
};

/** The four directions, as their unit offsets. Screen axes: y grows downward. */
export const DIRECTIONS = {
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
};

/**
 * The offset from one point to another by the shortest way round the torus —
 * the same image of `to` that the renderer draws when the camera sits on `from`.
 * @returns {{dx: number, dy: number}}
 */
export function offsetTo(fromX, fromY, toX, toY, config) {
  return {
    dx: wrapDelta(fromX, toX, config.width),
    dy: wrapDelta(fromY, toY, config.height),
  };
}

/**
 * Is an offset in the quadrant of `dir`? The comparison is `<=` on purpose: a
 * point at exactly 45° belongs to both of the quadrants that meet there, which
 * is what makes the four of them cover the plane rather than leave four seams.
 * The origin belongs to none of them — see `stepSelection`.
 */
export function inQuadrant(dir, dx, dy) {
  switch (dir) {
    case "east":
      return dx > 0 && Math.abs(dy) <= dx;
    case "west":
      return dx < 0 && Math.abs(dy) <= -dx;
    case "north":
      return dy < 0 && Math.abs(dx) <= -dy;
    case "south":
      return dy > 0 && Math.abs(dx) <= dy;
    default:
      return false;
  }
}

/** Live candidates: everyone but the dead and the creature we are standing on. */
function candidates(creatures, from) {
  return creatures.filter((c) => !c.dead && c !== from);
}

/**
 * Whichever of `pool` is nearest `(x, y)` across the torus, or null for an empty
 * pool. Ties break on the lower id so that the same pond always answers the same
 * way — the ordering of `world.creatures` is birth order and this must not
 * inherit it.
 */
function nearest(pool, x, y, config) {
  let best = null;
  let bestD2 = Infinity;
  for (const c of pool) {
    const { dx, dy } = offsetTo(x, y, c.x, c.y, config);
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2 || (d2 === bestD2 && best && c.id < best.id)) {
      best = c;
      bestD2 = d2;
    }
  }
  return best;
}

/**
 * What focusing the pond selects when nothing is selected yet: the creature
 * nearest the middle of the view. At zoom 1 that is the middle of the pond, and
 * while the camera is following someone it is that creature — so arriving by
 * keyboard picks up whatever the viewer was already looking at, rather than
 * announcing a stranger from the far side of the water.
 *
 * @param {Array<object>} creatures - `world.creatures`
 * @param {{x: number, y: number}} view - the camera's centre, in world coordinates
 * @returns {object|null}
 */
export function entrySelection(creatures, view, config) {
  return nearest(candidates(creatures, null), view.x, view.y, config);
}

/**
 * One arrow press: the nearest living creature in `dir` of `from`, or null when
 * that quadrant holds nobody. Null means *stay where you are* — a step that
 * cannot be taken must not clear the selection, or a viewer would lose their
 * place by pressing a key that did nothing.
 *
 * A creature at a bit-identical position to `from` is in no quadrant and so is
 * unreachable by a step; the entry selection and every other creature's steps
 * still reach it, and the pond puts two bodies on exactly the same pair of
 * doubles about as often as it repeats a genome. It is written down here rather
 * than engineered around because the honest fix — cycling by id on an exact tie
 * — would make the arrow keys mean two different things depending on a
 * coincidence nobody can see.
 *
 * @param {Array<object>} creatures - `world.creatures`
 * @param {object|null} from - the current selection
 * @param {string} dir - one of `DIRECTIONS`
 * @returns {object|null}
 */
export function stepSelection(creatures, from, dir, config) {
  if (!from || !DIRECTIONS[dir]) return null;
  const pool = candidates(creatures, from).filter((c) => {
    const { dx, dy } = offsetTo(from.x, from.y, c.x, c.y, config);
    return inQuadrant(dir, dx, dy);
  });
  return nearest(pool, from.x, from.y, config);
}
