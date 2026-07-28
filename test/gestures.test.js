// gestures.test.js — the pointer state machine that carries every mouse and
// every finger into the camera. `main.js` cannot be tested (it needs a browser),
// so the whole point of pulling this out of it is that these cases are reachable
// at all. Two things are being protected: that a tap, a drag and a pinch never
// get mistaken for each other, and that the v1.17 invariant — at zoom 1 the
// camera is the exact identity — survives an input that is continuous.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Gestures, DRAG_SLOP, PINCH_MIN_SPAN, DOUBLE_TAP_MS } from "../src/gestures.js";
import { Camera, MIN_ZOOM, ZOOM_SNAP } from "../src/camera.js";

const cfg = { width: 900, height: 620 };
const near = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

// ---- Tap vs drag ----

test("a press that does not move is a tap, at the point it was made", () => {
  const g = new Gestures();
  g.down(1, 100, 200);
  const up = g.up(1, 0);
  assert.deepEqual(up, { type: "tap", x: 100, y: 200, count: 1 });
});

test("a press that wanders under the slop is still a tap", () => {
  const g = new Gestures();
  g.down(1, 100, 200);
  assert.equal(g.move(1, 101, 200), null);
  assert.equal(g.move(1, 101, 201), null);
  const up = g.up(1, 0);
  assert.equal(up.type, "tap");
  // ...and it reports where the finger ended, not where it started.
  assert.deepEqual([up.x, up.y], [101, 201]);
});

test("a press past the slop pans and can never become a tap", () => {
  const g = new Gestures();
  g.down(1, 100, 200);
  assert.equal(g.move(1, 100, 203), null); // travel 3, under slop
  const pan = g.move(1, 110, 203); // travel 13
  assert.equal(pan.type, "pan");
  assert.deepEqual([pan.dx, pan.dy], [10, 0]);
  // Every later move keeps panning, with the delta since the last one.
  assert.deepEqual(
    (({ dx, dy }) => ({ dx, dy }))(g.move(1, 110, 190)),
    { dx: 0, dy: -13 }
  );
  assert.equal(g.up(1, 0), null);
});

test("the slop is a distance, not a timer — a slow press still taps", () => {
  const g = new Gestures();
  g.down(1, 50, 50);
  for (let i = 0; i < 40; i++) assert.equal(g.move(1, 50, 50), null);
  assert.equal(g.up(1, 9999).type, "tap");
  assert.equal(DRAG_SLOP, 4);
});

test("pointers nobody knows about are ignored", () => {
  const g = new Gestures();
  assert.equal(g.move(7, 1, 1), null);
  assert.equal(g.up(7, 0), null);
  g.down(1, 10, 10);
  assert.equal(g.move(2, 500, 500), null);
  assert.equal(g.up(1, 0).type, "tap");
});

test("a non-primary mouse button never reaches the machine at all", () => {
  // main.js filters those before calling down(); what this pins is that a
  // stray up() for a pointer that never went down cannot produce a phantom tap.
  const g = new Gestures();
  assert.equal(g.up(3, 0), null);
});

// ---- Double tap ----

test("two quick taps in the same place are one double tap", () => {
  const g = new Gestures();
  g.down(1, 300, 300);
  assert.equal(g.up(1, 1000).count, 1);
  g.down(2, 304, 297);
  assert.equal(g.up(2, 1000 + DOUBLE_TAP_MS - 1).count, 2);
});

test("a double tap is consumed, so a third tap starts a fresh pair", () => {
  const g = new Gestures();
  g.down(1, 10, 10);
  g.up(1, 0);
  g.down(2, 10, 10);
  assert.equal(g.up(2, 100).count, 2);
  g.down(3, 10, 10);
  assert.equal(g.up(3, 200).count, 1, "third tap must not re-fire the double");
});

test("taps too slow or too far apart stay single", () => {
  const slow = new Gestures();
  slow.down(1, 10, 10);
  slow.up(1, 0);
  slow.down(2, 10, 10);
  assert.equal(slow.up(2, DOUBLE_TAP_MS + 1).count, 1);

  const far = new Gestures();
  far.down(1, 10, 10);
  far.up(1, 0);
  far.down(2, 200, 10);
  assert.equal(far.up(2, 10).count, 1);
});

test("a drag between two taps does not become half of a double tap", () => {
  const g = new Gestures();
  g.down(1, 10, 10);
  assert.equal(g.up(1, 0).count, 1);
  g.down(2, 10, 10);
  g.move(2, 60, 10); // a drag: emits no tap at all
  assert.equal(g.up(2, 50), null);
  g.down(3, 10, 10);
  // The drag left the pending tap untouched, and this one closes the pair.
  assert.equal(g.up(3, 100).count, 2);
});

// ---- Pinch ----

test("two fingers separating report the factor and the midpoint", () => {
  const g = new Gestures();
  g.down(1, 400, 300);
  g.down(2, 500, 300); // span 100, midpoint (450, 300)
  assert.ok(g.pinching);
  const p = g.move(2, 600, 300); // span 200, midpoint (500, 300)
  assert.equal(p.type, "pinch");
  near(p.scale, 2);
  assert.deepEqual([p.x, p.y], [500, 300]);
  assert.deepEqual([p.dx, p.dy], [50, 0]); // the midpoint drifted 50px
});

test("two fingers moving together compose to a pure pan", () => {
  const g = new Gestures();
  g.down(1, 400, 300);
  g.down(2, 500, 300);
  // A browser reports one pointer at a time, so the span genuinely wobbles
  // in between — finger 1 arrives before finger 2 has caught up. What has to
  // hold is that the pair of events multiplies back to no zoom at all, and
  // that the midpoint deltas add up to the hand's actual movement.
  const a = g.move(1, 410, 320);
  const b = g.move(2, 510, 320);
  assert.ok(a.scale > 1 !== b.scale > 1, "the wobble is real, and it cancels");
  near(a.scale * b.scale, 1);
  near(a.dx + b.dx, 10);
  near(a.dy + b.dy, 20);
});

test("the pinch factor is relative to the last report, so it composes", () => {
  const g = new Gestures();
  g.down(1, 400, 300);
  g.down(2, 500, 300);
  let total = 1;
  for (const x of [520, 560, 600, 700]) total *= g.move(2, x, 300).scale;
  near(total, 3); // 300px apart, from 100
});

test("fingers on top of each other cannot produce an infinite zoom", () => {
  const g = new Gestures();
  g.down(1, 400, 300);
  g.down(2, 400, 300); // span 0 → clamped
  assert.equal(g.pinch.span, PINCH_MIN_SPAN);
  const p = g.move(2, 400, 300);
  assert.ok(Number.isFinite(p.scale), `scale was ${p.scale}`);
  near(p.scale, 1);
});

test("a second finger cancels the tap and the drag the first was making", () => {
  const g = new Gestures();
  g.down(1, 100, 100);
  g.down(2, 200, 100);
  assert.equal(g.move(1, 101, 100).type, "pinch", "not a one-finger pan");
  g.up(2, 0);
  assert.equal(g.up(1, 0), null, "half a pinch is not a tap");
});

test("a third finger rides along without moving the view", () => {
  const g = new Gestures();
  g.down(1, 100, 100);
  g.down(2, 200, 100);
  g.down(3, 400, 400);
  assert.equal(g.move(3, 450, 450), null);
  const p = g.move(2, 300, 100);
  near(p.scale, 2); // still measured across the original pair
});

test("handing a pinch back to one finger neither jumps nor taps", () => {
  const g = new Gestures();
  g.down(1, 400, 300);
  g.down(2, 500, 300);
  g.move(2, 600, 300); // finger 2 is now at 600
  g.up(2, 0);
  assert.equal(g.pinching, false);
  // The survivor drags from where it actually is, so the first delta is its own
  // movement — not the distance to wherever the lifted finger had got to.
  const p = g.move(1, 403, 300);
  assert.equal(p.type, "pan");
  assert.deepEqual([p.dx, p.dy], [3, 0]);
  assert.equal(g.up(1, 0), null, "the survivor of a pinch can never tap");
});

test("dropping to one finger from three keeps pinching on the pair that remains", () => {
  const g = new Gestures();
  g.down(1, 100, 100);
  g.down(2, 200, 100);
  g.down(3, 300, 100);
  g.up(1, 0);
  assert.ok(g.pinching);
  const p = g.move(3, 400, 100); // pair is now 2 and 3: span 100 → 200
  near(p.scale, 2);
});

// ---- Cancellation ----

test("a cancelled press produces no tap", () => {
  const g = new Gestures();
  g.down(1, 10, 10);
  assert.equal(g.cancel(1), null);
  assert.equal(g.fingers, 0);
});

test("cancelling everything leaves a clean machine", () => {
  const g = new Gestures();
  g.down(1, 10, 10);
  g.down(2, 90, 10);
  g.cancel();
  assert.equal(g.fingers, 0);
  assert.equal(g.pinching, false);
  g.down(5, 10, 10);
  assert.equal(g.up(5, 0).count, 1, "the pending tap went with the cancel");
});

// ---- Against a real camera ----
// The adapter in main.js is three lines; these run the same three so that what
// a hand actually does to the view is covered, not just the arithmetic.

const drive = (cam, g) => {
  const apply = (r) => {
    if (!r) return r;
    cam.panByScreen(r.dx, r.dy);
    if (r.type === "pinch") cam.zoomBy(r.scale, r.x, r.y);
    return r;
  };
  return {
    down: (...a) => g.down(...a),
    move: (...a) => apply(g.move(...a)),
    up: (...a) => g.up(...a),
  };
};

test("pinching out magnifies about the midpoint, holding that point still", () => {
  const cam = new Camera(cfg);
  const g = new Gestures();
  const hand = drive(cam, g);
  const ax = 300;
  const ay = 200;
  hand.down(1, ax - 50, ay);
  hand.down(2, ax + 50, ay);
  const before = cam.screenToWorld(ax, ay);
  hand.move(2, ax + 150, ay); // span ×2 about a midpoint that moves to ax+50

  assert.ok(cam.zoom > 1);
  // The world point under the midpoint the pinch *ended* on is the one held.
  const anchor = ax + 50;
  const after = cam.screenToWorld(anchor, ay);
  // It equals the point that was under that spot before the gesture, shifted by
  // the midpoint's own drift — the pan half — which at zoom 1 is nothing.
  near(after.x, before.x + 50, 1e-9);
  near(after.y, before.y, 1e-9);
});

test("a pinch back in restores the classic view exactly", () => {
  const cam = new Camera(cfg);
  const g = new Gestures();
  const hand = drive(cam, g);
  hand.down(1, 400, 300);
  hand.down(2, 500, 300);
  hand.move(2, 900, 300); // way in
  assert.ok(cam.zoom > 1 && !cam.isDefault());
  hand.move(2, 501, 300); // and back out
  assert.ok(cam.isDefault(), `zoom stranded at ${cam.zoom}`);
  const s = cam.worldToScreen(37, 611);
  near(s.x, 37);
  near(s.y, 611);
});

test("the detent catches a zoom a continuous gesture would strand just above 1", () => {
  const cam = new Camera(cfg);
  cam.setZoom(1 + (ZOOM_SNAP - 1) / 2, 700, 500);
  assert.equal(cam.zoom, MIN_ZOOM);
  assert.ok(cam.isDefault(), "and it snaps home, not merely to zoom 1");
  // Just above the detent it is honoured as asked, so the range is not eaten.
  cam.setZoom(ZOOM_SNAP + 1e-6);
  assert.ok(cam.zoom > MIN_ZOOM);
});

test("a one-finger drag pans the zoomed view and a tap still selects", () => {
  const cam = new Camera(cfg);
  const g = new Gestures();
  const hand = drive(cam, g);
  cam.setZoom(4);
  const home = { x: cam.x, y: cam.y };
  hand.down(1, 100, 100);
  hand.move(1, 140, 100);
  near(cam.x, home.x - 40 / 4);
  near(cam.y, home.y);
  hand.up(1, 0);
  // ...and a separate press that stays put is a tap, at zoom 4 as at zoom 1.
  hand.down(2, 500, 500);
  assert.equal(hand.up(2, 5000).type, "tap");
});
