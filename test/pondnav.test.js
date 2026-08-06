// pondnav.test.js — can a keyboard reach the pond?
//
// The module is a *navigation rule*, which is a shape this project has tested
// twice before in other clothes: the minimap's viewport pieces (v1.24) and the
// Muller plot's bands (v1.42) are both tilings, and both were nearly pinned by
// an aggregate that two cancelling errors would have satisfied. So the quadrant
// rule is walked offset by offset rather than sampled, and the reachability
// claim — the one a visitor actually cares about — is asserted on a real pond
// rather than argued for in a comment.
//
// The one thing measured here that is not asserted anywhere else: **every living
// creature is reachable from the entry selection by arrow presses.** That is not
// a theorem. I could not prove it, and 200,000 randomly clustered layouts and
// twelve ponds failed to produce a counterexample, so it is written down as what
// it is — an observation about ponds this dense, pinned on a deterministic world
// so it cannot flake, with a hop bound loose enough that a normal drift in the
// pond's crowding will not turn a passing test red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import {
  DIRECTIONS,
  DIRECTION_KEYS,
  entrySelection,
  inQuadrant,
  offsetTo,
  stepSelection,
} from "../src/pondnav.js";
import { assertUnaffected } from "./support/paired.js";

const CONFIG = makeConfig({ seed: 314 });
const DIRS = Object.keys(DIRECTIONS);

/** A stand-in creature: the module reads `id`, `x`, `y` and `dead`, and nothing else. */
const at = (id, x, y, dead = false) => ({ id, x, y, dead });

test("the four quadrants tile the plane", () => {
  // Every offset a creature can have from another belongs to at least one
  // direction, so no creature can sit in a gap between the arrow keys. Walked,
  // not sampled: a rule that fails only on the diagonal is exactly what a coarse
  // sample misses, and the diagonal is where the `<=` matters.
  for (let dx = -40; dx <= 40; dx++) {
    for (let dy = -40; dy <= 40; dy++) {
      const hits = DIRS.filter((d) => inQuadrant(d, dx, dy));
      if (dx === 0 && dy === 0) {
        assert.equal(hits.length, 0, "the origin belongs to no direction");
        continue;
      }
      assert.ok(hits.length >= 1, `offset (${dx}, ${dy}) is in no direction`);
      // A diagonal is in exactly two; everything else in exactly one.
      const expected = Math.abs(dx) === Math.abs(dy) ? 2 : 1;
      assert.equal(hits.length, expected, `offset (${dx}, ${dy}) is in ${hits.join("+")}`);
    }
  }
});

test("opposite directions are mirror images of each other", () => {
  for (let dx = -20; dx <= 20; dx++) {
    for (let dy = -20; dy <= 20; dy++) {
      assert.equal(inQuadrant("east", dx, dy), inQuadrant("west", -dx, dy));
      assert.equal(inQuadrant("north", dx, dy), inQuadrant("south", dx, -dy));
    }
  }
});

test("a step crosses the seam, because the pond does", () => {
  // The pond is a torus and every view of it draws the nearest wrapped image
  // (v1.19's rule about which of the two kinds of view this is). A creature at
  // the right-hand edge has a neighbour to its east on the left-hand edge, and a
  // navigation rule that stopped at x = 900 would be describing a different
  // world from the one on screen.
  const here = at(1, CONFIG.width - 5, 300);
  const across = at(2, 5, 300);
  const inland = at(3, CONFIG.width - 200, 300);
  const pond = [here, across, inland];

  assert.equal(stepSelection(pond, here, "east", CONFIG), across, "east did not cross the seam");
  assert.equal(stepSelection(pond, across, "west", CONFIG), here, "west did not cross the seam");
  const off = offsetTo(here.x, here.y, across.x, across.y, CONFIG);
  assert.equal(off.dx, 10, "the wrapped offset should be the short way round");
});

test("a step takes the nearest in that direction, not the nearest overall", () => {
  const from = at(1, 450, 310);
  const northNear = at(2, 450, 250);
  const northFar = at(3, 460, 120);
  const eastNearest = at(4, 470, 312); // nearest of all, and not to the north
  const pond = [from, northNear, northFar, eastNearest];

  assert.equal(stepSelection(pond, from, "north", CONFIG), northNear);
  assert.equal(stepSelection(pond, from, "east", CONFIG), eastNearest);
});

test("a direction with nobody in it answers null rather than something else", () => {
  const from = at(1, 450, 310);
  const eastOnly = at(2, 600, 310);
  const pond = [from, eastOnly];
  assert.equal(stepSelection(pond, from, "east", CONFIG), eastOnly);
  assert.equal(stepSelection(pond, from, "west", CONFIG), null);
  // Null is the signal `main.js` reads as "stay where you are". A step that
  // returned the far side of the pond instead would move a viewer somewhere they
  // did not point at, which is worse than a key that does nothing.
  assert.equal(stepSelection([from], from, "north", CONFIG), null);
  assert.equal(stepSelection(pond, null, "north", CONFIG), null);
  assert.equal(stepSelection(pond, from, "sideways", CONFIG), null);
});

test("the dead are never selected", () => {
  // The inspector drops a selection the moment it dies (v1.15), so a step that
  // could land on a corpse would select something that is cleared again on the
  // next frame — a key press that silently does nothing.
  const from = at(1, 450, 310);
  const corpse = at(2, 500, 310, true);
  const alive = at(3, 600, 310);
  assert.equal(stepSelection([from, corpse, alive], from, "east", CONFIG), alive);
  assert.equal(entrySelection([corpse, alive], { x: 500, y: 310 }, CONFIG), alive);
  assert.equal(entrySelection([corpse], { x: 500, y: 310 }, CONFIG), null);
  assert.equal(entrySelection([], { x: 500, y: 310 }, CONFIG), null);
});

test("an exact tie breaks on the lower id, not on birth order", () => {
  // `world.creatures` is in birth order, which v1.47 established is an accident
  // of the sweep rather than a fact about the pond. Two creatures the same
  // distance away must not be chosen by where they happen to sit in that array.
  const from = at(1, 450, 310);
  const twinA = at(7, 450, 250);
  const twinB = at(4, 450, 370);
  assert.equal(stepSelection([from, twinA, twinB], from, "north", CONFIG), twinA);
  const shuffled = [twinB, from, twinA];
  assert.equal(stepSelection(shuffled, from, "north", CONFIG), twinA);
  // Same distance, same direction: the lower id wins whichever order they arrive in.
  const tieA = at(9, 440, 250);
  const tieB = at(2, 460, 250);
  assert.equal(stepSelection([from, tieA, tieB], from, "north", CONFIG).id, 2);
  assert.equal(stepSelection([from, tieB, tieA], from, "north", CONFIG).id, 2);
});

test("focusing the pond picks up what the view is already on", () => {
  const near = at(1, 460, 320);
  const far = at(2, 100, 100);
  assert.equal(entrySelection([near, far], { x: 450, y: 310 }, CONFIG), near);
  assert.equal(entrySelection([near, far], { x: 120, y: 90 }, CONFIG), far);
});

test("the arrow keys are the only keys this module claims", () => {
  assert.deepEqual(Object.keys(DIRECTION_KEYS).sort(), [
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
  ]);
  for (const dir of Object.values(DIRECTION_KEYS)) assert.ok(DIRECTIONS[dir], `${dir} is not a direction`);
});

/** Everyone the arrow keys can get to from the entry selection, and how far. */
function reachable(world) {
  const config = world.config;
  const entry = entrySelection(world.creatures, { x: config.width / 2, y: config.height / 2 }, config);
  const hops = new Map([[entry.id, 0]]);
  const queue = [entry];
  while (queue.length) {
    const c = queue.shift();
    for (const dir of DIRS) {
      const to = stepSelection(world.creatures, c, dir, config);
      if (to && !hops.has(to.id)) {
        hops.set(to.id, hops.get(c.id) + 1);
        queue.push(to);
      }
    }
  }
  return hops;
}

test("every living creature can be reached with the arrow keys", () => {
  // Seed 314 at tick 1,000 is a fixed pond — `test/fingerprint.test.js` holds it
  // bit-for-bit — so this cannot flake. The bound on hops is deliberately loose:
  // the measured worst case across twelve seeds and thirteen sample points is
  // 13, and asserting 13 would pin a trajectory rather than the property (the
  // v1.44 rule: pin the theorem, not the measurement).
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 1000; i++) world.step();
  const live = world.creatures.filter((c) => !c.dead);
  assert.ok(live.length > 50, "this test wants a populated pond");

  const hops = reachable(world);
  assert.equal(hops.size, live.length, `${live.length - hops.size} creatures cannot be reached`);
  assert.ok(Math.max(...hops.values()) <= 40, "the pond has become slow to cross");
});

test("rock does not block the keyboard, because it does not block the eye", () => {
  // `barrierOcclusion` stops a *creature* sensing through a wall. A watcher can
  // see straight over it, and a selection rule that inherited the simulation's
  // senses would be answering a question nobody asked. Named here rather than
  // left to be inferred: this is the decision, and the walled pond is still
  // navigable end to end.
  const world = new World(makeConfig({ seed: 314, barriers: true, barrierOcclusion: true }));
  for (let i = 0; i < 800; i++) world.step();
  const live = world.creatures.filter((c) => !c.dead);
  const hops = reachable(world);
  assert.equal(hops.size, live.length, "a walled pond stranded someone");
});

test("navigating a pond does not move it", () => {
  // The same promise every observer here carries. `pondnav` reads positions and
  // returns a creature; if it ever drew a random number or wrote a field, this
  // is where it would show up.
  const navigated = new World(makeConfig({ seed: 77 }));
  const untouched = new World(makeConfig({ seed: 77 }));
  const config = navigated.config;
  const original = navigated.step.bind(navigated);
  navigated.step = () => {
    original();
    const sel = entrySelection(navigated.creatures, { x: 450, y: 310 }, config);
    for (const dir of DIRS) stepSelection(navigated.creatures, sel, dir, config);
  };
  assertUnaffected(navigated, untouched, 300, "navigation");
});
