// camera.test.js — the lens. None of this touches the simulation, but two
// things still matter enough to lock down: that the default view is bit-for-bit
// the classic one (so every screenshot and permalink still shows what it always
// showed), and that the torus seam stays invisible when the view roams.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Camera, MIN_ZOOM, MAX_ZOOM, FOLLOW_ZOOM, ZOOM_STEP } from "../src/camera.js";

const cfg = { width: 900, height: 620 };
const near = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

test("at zoom 1 the camera is the identity", () => {
  const cam = new Camera(cfg);
  assert.equal(cam.zoom, 1);
  assert.ok(cam.isDefault());
  for (const [x, y] of [[0, 0], [1, 1], [450, 310], [899.9, 619.9], [123.25, 42.5]]) {
    const s = cam.worldToScreen(x, y);
    near(s.x, x);
    near(s.y, y);
  }
});

test("zoom is clamped to its range", () => {
  const cam = new Camera(cfg);
  cam.setZoom(1000);
  assert.equal(cam.zoom, MAX_ZOOM);
  cam.setZoom(-4);
  assert.equal(cam.zoom, MIN_ZOOM);
});

test("zooming about an anchor keeps the point under it fixed", () => {
  const cam = new Camera(cfg);
  const ax = 300;
  const ay = 200;
  const before = cam.screenToWorld(ax, ay);
  cam.setZoom(4, ax, ay);
  const after = cam.screenToWorld(ax, ay);
  near(after.x, before.x, 1e-9);
  near(after.y, before.y, 1e-9);
  // ...and the same world point still lands on the anchor.
  const s = cam.worldToScreen(before.x, before.y);
  near(s.x, ax, 1e-9);
  near(s.y, ay, 1e-9);
});

test("zooming back out snaps home, restoring the classic view exactly", () => {
  const cam = new Camera(cfg);
  cam.setZoom(6, 100, 90);
  cam.panByScreen(-220, 140);
  cam.setZoom(1, 700, 500); // the anchor is deliberately ignored here
  assert.ok(cam.isDefault());
  const s = cam.worldToScreen(37, 611);
  near(s.x, 37);
  near(s.y, 611);
});

test("panning moves the centre by screen pixels ÷ zoom, and wraps", () => {
  const cam = new Camera(cfg);
  cam.setZoom(2);
  cam.panByScreen(-100, -50); // drag the view left/up: the camera moves right/down
  near(cam.x, 450 + 50);
  near(cam.y, 310 + 25);
  // Far enough right and the camera comes back around the seam.
  cam.panByScreen(-2000, 0);
  near(cam.x, (500 + 1000) % cfg.width);
});

test("panning is a no-op at zoom 1, where the whole pond is already visible", () => {
  const cam = new Camera(cfg);
  cam.panByScreen(-300, 120);
  assert.ok(cam.isDefault());
});

test("moveTo jumps the centre, wraps, and leaves the identity view alone", () => {
  const cam = new Camera(cfg);
  cam.moveTo(120, 40); // at zoom 1 the whole pond is on screen: nothing to jump to
  assert.ok(cam.isDefault());

  cam.setZoom(4);
  cam.moveTo(120, 40);
  near(cam.x, 120);
  near(cam.y, 40);
  cam.moveTo(-30, cfg.height + 10); // off the edge of a world that has none
  near(cam.x, cfg.width - 30);
  near(cam.y, 10);
});

test("things across the seam are drawn on the near side", () => {
  const cam = new Camera(cfg);
  cam.setZoom(4);
  cam.panByScreen(-(cfg.width / 2 - 10) * 4, 0); // camera near the right edge
  near(cam.x, cfg.width - 10);
  // A creature just past the seam at x=5 is 15px to the *right*, not 885 left.
  const s = cam.worldToScreen(5, cam.y);
  near(s.x, cfg.width / 2 + 15 * 4);
  const n = cam.nearest(5, cam.y);
  near(n.x, cfg.width + 5);
});

test("screenToWorld inverts worldToScreen, wrapped back into the world", () => {
  const cam = new Camera(cfg);
  cam.setZoom(3.5, 120, 400);
  cam.panByScreen(640, -700);
  for (const [x, y] of [[0, 0], [12, 600], [880, 15], [450, 310]]) {
    const s = cam.worldToScreen(x, y);
    const w = cam.screenToWorld(s.x, s.y);
    near(w.x, x, 1e-9);
    near(w.y, y, 1e-9);
  }
});

test("following centres on a creature, magnifies, and lets go when it dies", () => {
  const cam = new Camera(cfg);
  const c = { id: 7, x: 120, y: 90, dead: false };
  cam.setTarget(c);
  assert.equal(cam.zoom, FOLLOW_ZOOM); // following at 1× would show nothing new
  near(cam.x, 120);
  near(cam.y, 90);
  const s = cam.worldToScreen(c.x, c.y);
  near(s.x, cfg.width / 2);
  near(s.y, cfg.height / 2);

  c.x = 800; // it swims off across the seam
  cam.update();
  near(cam.x, 800);

  c.dead = true;
  cam.update();
  assert.equal(cam.target, null); // a camera trained on a corpse is a bug
  assert.equal(cam.zoom, FOLLOW_ZOOM); // ...but the view it left is kept

  cam.reset();
  assert.ok(cam.isDefault());
});

test("the canvas transform agrees with worldToScreen", () => {
  const cam = new Camera(cfg);
  cam.setZoom(2.5, 40, 40);
  cam.panByScreen(-90, 30);
  const dpr = 2;
  let m = null;
  cam.applyTo({ setTransform: (...args) => (m = args) }, dpr);
  const [a, b, c, d, e, f] = m;
  assert.equal(b, 0);
  assert.equal(c, 0);
  near(a, cam.zoom * dpr);
  near(d, cam.zoom * dpr);
  // A point drawn at its nearest image must land where worldToScreen says.
  for (const [x, y] of [[10, 20], [700, 500], [450, 310]]) {
    const n = cam.nearest(x, y);
    const s = cam.worldToScreen(x, y);
    near((a * n.x + e) / dpr, s.x, 1e-9);
    near((d * n.y + f) / dpr, s.y, 1e-9);
  }
});

test("a zoom step in and back out returns to the whole pond", () => {
  const cam = new Camera(cfg);
  cam.zoomBy(ZOOM_STEP, 10, 10);
  assert.equal(cam.zoom, ZOOM_STEP);
  cam.zoomBy(1 / ZOOM_STEP, 10, 10);
  assert.ok(cam.isDefault());
});

// ---- Whole-world backdrops (v1.27) ----
//
// A backdrop is the one thing in this scene drawn as the *whole* world rather
// than as a small thing at its nearest wrapped image, and at any zoom the
// viewport can straddle up to four copies of it. This is the geometry two
// layers now depend on (the terrain bake and the nutrient field), so it lives
// here where the suite can reach it rather than inside the renderer.

test("at zoom 1 a backdrop is exactly one tile at the origin", () => {
  const cam = new Camera(cfg);
  assert.deepEqual(cam.worldTiles(), [{ x: 0, y: 0 }]);
});

test("a view inside the world needs one tile; a view over a seam needs more", () => {
  const cam = new Camera(cfg);
  cam.zoom = 4;
  cam.x = cfg.width / 2;
  cam.y = cfg.height / 2;
  assert.equal(cam.worldTiles().length, 1, "the middle of the pond straddles nothing");
  cam.x = 2; // hard against the left seam
  assert.equal(cam.worldTiles().length, 2);
  cam.y = 2; // and the top one too: a corner
  assert.equal(cam.worldTiles().length, 4);
});

test("the tiles cover the viewport, and are whole worlds apart", () => {
  const cam = new Camera(cfg);
  for (const [zoom, x, y] of [
    [1, 450, 310],
    [2, 5, 5],
    [3, 895, 615],
    [8, 0, 0],
    [1.7, 450, 3],
  ]) {
    cam.zoom = zoom;
    cam.x = x;
    cam.y = y;
    const tiles = cam.worldTiles();
    const halfW = cfg.width / (2 * zoom);
    const halfH = cfg.height / (2 * zoom);
    // Every tile is an exact whole-world offset from every other, so they line
    // up seamlessly rather than overlapping by a fraction of a pixel.
    for (const t of tiles) {
      for (const u of tiles) {
        near(((t.x - u.x) / cfg.width) % 1, 0);
        near(((t.y - u.y) / cfg.height) % 1, 0);
      }
    }
    // And the viewport is covered: every corner of it falls inside some tile.
    for (const px of [x - halfW, x + halfW]) {
      for (const py of [y - halfH, y + halfH]) {
        const hit = tiles.some(
          (t) =>
            px >= t.x - 1e-9 &&
            px <= t.x + cfg.width + 1e-9 &&
            py >= t.y - 1e-9 &&
            py <= t.y + cfg.height + 1e-9
        );
        assert.ok(hit, `zoom ${zoom} at (${x},${y}): corner (${px},${py}) uncovered`);
      }
    }
  }
});
