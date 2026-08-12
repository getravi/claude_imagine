// trail.test.js — the path the selected creature took (v1.84).
//
// A ring buffer of positions is a small thing to get wrong in a lot of places,
// and the tests are grouped by what would break if it were:
//
//   1. **The buffer.** Order, capacity, one point per tick, and the three ways
//      a path ends (a new subject, a death, a clock that went backwards).
//   2. **The torus**, which is the only interesting geometry here. Two
//      consecutive positions 890 px apart on a 900 px pond are 10 px of
//      swimming, and every quantity this module produces — the drawn line, the
//      distance covered, the straightness — is wrong by a whole world if that
//      is read literally.
//   3. **The observer contract.** Nothing in `world.js` imports this, so the
//      claim is that recording a path costs the pond nothing at all. That is
//      the shared five-channel assertion, run with a trail recording a live
//      creature every tick against a world that has none.

import { test } from "node:test";
import assert from "node:assert/strict";

import { Trail, TRAIL_TICKS } from "../src/trail.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { wrapDelta } from "../src/vec.js";
import { assertUnaffected } from "./support/paired.js";

const cfg = makeConfig();

/** A stand-in for a creature: the four fields `record` reads. */
function body(id, x, y, dead = false) {
  return { id, x, y, dead };
}

// ---------------------------------------------------------------------------
// 1. The buffer

test("the path comes back oldest first, and holds at most its capacity", () => {
  const t = new Trail(4);
  for (let i = 0; i < 7; i++) t.record(body(1, i * 10, 0), i);
  assert.equal(t.length, 4);
  assert.deepEqual(
    t.points().map((p) => p.x),
    [30, 40, 50, 60]
  );
});

test("a tick can only be recorded once", () => {
  // The animation loop calls `record` inside the step loop *and* once a frame
  // while paused, so this guard is what makes it idempotent rather than a
  // source of duplicate points at 1× speed.
  const t = new Trail();
  assert.equal(t.record(body(1, 5, 5), 0), true);
  assert.equal(t.record(body(1, 9, 9), 0), false);
  assert.equal(t.length, 1);
  assert.deepEqual(t.points(), [{ x: 5, y: 5 }]);
});

test("a path ends when its subject does", () => {
  // Four endings, and all of them have to clear rather than splice: a stale
  // line hanging in the water after its creature is gone, or a line joining two
  // different animals, is a picture of something that never happened.
  const ended = [
    ["nothing selected", (t) => t.record(null, 11)],
    ["the subject died", (t) => t.record(body(1, 0, 0, true), 11)],
    ["somebody else was selected", (t) => t.record(body(2, 0, 0), 11)],
    ["the world was reset", (t) => t.record(body(1, 0, 0), 0)],
  ];
  for (const [why, act] of ended) {
    const fresh = new Trail();
    for (let i = 0; i < 10; i++) fresh.record(body(1, i, i), i);
    assert.equal(fresh.length, 10, why);
    act(fresh);
    // The two that keep a subject start a new path of one point; the two that
    // lose it keep nothing.
    assert.ok(fresh.length <= 1, `${why}: kept ${fresh.length} points from the old path`);
  }
});

test("a cleared path is a path with no subject, not an empty one", () => {
  const t = new Trail();
  t.record(body(7, 1, 2), 0);
  assert.equal(t.id, 7);
  t.record(null, 1);
  assert.equal(t.id, null);
  assert.equal(t.length, 0);
  assert.equal(t.lastTick, -1);
  // And the very next tick starts cleanly rather than being refused by a stale
  // `lastTick` — the bug a clear that only emptied the buffer would leave.
  assert.equal(t.record(body(7, 3, 4), 1), true);
});

test("the default window is a little under one crossing of the pond", () => {
  // The number is a judgement (see the comment on TRAIL_TICKS) but it is a
  // judgement about *this* pond, so it is pinned against the pond rather than
  // written down as a constant nobody can check. v1.23's crossing time is
  // width / maxSpeed.
  const crossing = cfg.width / cfg.maxSpeed;
  assert.ok(TRAIL_TICKS < crossing, `${TRAIL_TICKS} ticks is more than a crossing (${crossing.toFixed(0)})`);
  assert.ok(TRAIL_TICKS > crossing / 2, `${TRAIL_TICKS} ticks is less than half a crossing`);
});

// ---------------------------------------------------------------------------
// 2. The torus

test("a path that crosses the seam is one line, not a jump across the pond", () => {
  const t = new Trail();
  // Six ticks swimming east at 4 px/tick, straight through x = 0.
  const xs = [cfg.width - 8, cfg.width - 4, 0, 4, 8, 12];
  xs.forEach((x, i) => t.record(body(1, x, 100), i));
  const offs = t.offsets(cfg);
  assert.equal(offs.length, xs.length);
  assert.deepEqual(offs[offs.length - 1], { dx: 0, dy: 0 }, "the newest point is the anchor");
  for (let i = 1; i < offs.length; i++) {
    const step = Math.hypot(offs[i].dx - offs[i - 1].dx, offs[i].dy - offs[i - 1].dy);
    assert.ok(step < cfg.width / 2, `step ${i} jumped ${step.toFixed(0)} px across the seam`);
    assert.ok(Math.abs(step - 4) < 1e-9, `step ${i} was ${step} px, not the 4 the creature swam`);
  }
});

test("the offsets are the recorded steps, walked backwards", () => {
  // The claim `render.js` relies on: adding offset `i` to wherever the head is
  // drawn puts point `i` where it belongs relative to it.
  const t = new Trail();
  const pts = [
    [10, 10],
    [890, 40],
    [880, 610],
    [20, 15],
  ];
  pts.forEach(([x, y], i) => t.record(body(3, x, y), i));
  const offs = t.offsets(cfg);
  for (let i = pts.length - 1; i > 0; i--) {
    const sx = wrapDelta(pts[i - 1][0], pts[i][0], cfg.width);
    const sy = wrapDelta(pts[i - 1][1], pts[i][1], cfg.height);
    assert.ok(Math.abs(offs[i].dx - offs[i - 1].dx - sx) < 1e-9);
    assert.ok(Math.abs(offs[i].dy - offs[i - 1].dy - sy) < 1e-9);
  }
});

test("straightness is measured along the line, not across the torus", () => {
  // The distinction that decides whether the number means anything. At maxSpeed
  // a creature covers most of a lap inside the trail's window, so a perfectly
  // straight swimmer can end up back where it started *as the crow flies over
  // the seam* — and reading that as "went nowhere" would be exactly backwards,
  // as well as disagreeing with the picture, which draws the unwrapped line.
  const t = new Trail(TRAIL_TICKS);
  const step = cfg.width / 60; // 60 ticks is one full lap
  for (let i = 0; i <= 60; i++) t.record(body(1, (i * step) % cfg.width, 300), i);
  const s = t.stats(cfg);
  assert.ok(Math.abs(s.travelled - cfg.width) < 1e-6, `travelled ${s.travelled}`);
  assert.ok(Math.abs(s.displacement - cfg.width) < 1e-6, `a lap read as ${s.displacement} px of progress`);
  assert.ok(s.straightness > 0.999, `a straight lap scored ${s.straightness.toFixed(3)}`);
  assert.equal(s.ticks, 60);
});

test("a creature working one patch scores near nothing, and nothing divides by zero", () => {
  const back = new Trail();
  for (let i = 0; i < 40; i++) back.record(body(1, 400 + (i % 2) * 6, 300), i);
  const s = back.stats(cfg);
  assert.ok(s.travelled > 200, "it did move");
  assert.ok(s.straightness < 0.05, `doubling back scored ${s.straightness.toFixed(3)}`);

  const still = new Trail();
  for (let i = 0; i < 5; i++) still.record(body(1, 400, 300), i);
  const t = still.stats(cfg);
  assert.equal(t.travelled, 0);
  assert.equal(t.straightness, 0, "a creature that has not moved has not gone straight anywhere");

  const empty = new Trail().stats(cfg);
  assert.deepEqual(empty, { ticks: 0, travelled: 0, displacement: 0, straightness: 0 });
});

test("a path longer than the buffer measures the window, not the life", () => {
  // `ticks` is what the sentence in describe.js quotes, so it has to be the
  // span actually held rather than the span recorded — the v1.22 rule about a
  // bounded readout that always looks full.
  const t = new Trail(10);
  for (let i = 0; i < 500; i++) t.record(body(1, i % cfg.width, 300), i);
  assert.equal(t.stats(cfg).ticks, 9);
});

// ---------------------------------------------------------------------------
// 3. The observer contract

test("recording a path leaves the pond bit-for-bit alone", () => {
  const watched = new World(makeConfig());
  const control = new World(makeConfig());
  const trail = new Trail();
  // Wrap `step` so the trail is fed exactly as `main.js` feeds it — inside the
  // loop, every tick, on a living creature — while the paired assertion runs
  // both worlds and compares all five channels.
  const step = watched.step.bind(watched);
  watched.step = () => {
    step();
    trail.record(watched.creatures.find((c) => !c.dead) ?? null, watched.tick);
  };
  assertUnaffected(watched, control, 400, "recording a trail");
  assert.ok(trail.length > 1, "the trail recorded nothing, so this proved nothing");
});

test("what it recorded is where the creature actually was", () => {
  // The other half of the same claim: an observer that is cheap because it
  // observes nothing would pass the test above.
  const world = new World(makeConfig());
  const trail = new Trail();
  const subject = world.creatures[0];
  const seen = [];
  for (let i = 0; i < 120; i++) {
    world.step();
    if (subject.dead) break;
    trail.record(subject, world.tick);
    seen.push({ x: subject.x, y: subject.y });
  }
  assert.ok(seen.length > 50, "the subject died too early for this to say anything");
  assert.deepEqual(trail.points(), seen.slice(-trail.capacity));

  // And the distance it reports is the distance that creature swam.
  let travelled = 0;
  for (let i = 1; i < seen.length; i++) {
    travelled += Math.hypot(
      wrapDelta(seen[i - 1].x, seen[i].x, cfg.width),
      wrapDelta(seen[i - 1].y, seen[i].y, cfg.height)
    );
  }
  assert.ok(Math.abs(trail.stats(cfg).travelled - travelled) < 1e-9);
});
