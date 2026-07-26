// minimap.test.js — the whole-pond view in a corner. Nothing here touches the
// simulation, but three things are worth locking down: that the viewport at
// zoom 1 is the entire world exactly (the same identity the camera protects),
// that a view straddling the torus seam comes back as pieces the flat minimap
// can actually draw, and that drawing draws nothing random.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MINIMAP_WIDTH,
  minimapLayout,
  worldToMinimap,
  minimapToWorld,
  viewportRects,
  drawMinimap,
} from "../src/minimap.js";
import { Camera } from "../src/camera.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";

const cfg = { width: 900, height: 620 };
const near = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

/** A recording 2D context: enough of the API for drawMinimap, and nothing else. */
function stubCtx() {
  const ops = [];
  return {
    ops,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    fillRect: (...a) => ops.push(["fillRect", ...a]),
    strokeRect: (...a) => ops.push(["strokeRect", ...a]),
    beginPath: () => ops.push(["beginPath"]),
    arc: (...a) => ops.push(["arc", ...a]),
    fill: () => ops.push(["fill"]),
  };
}

test("the layout keeps the world's aspect ratio exactly", () => {
  const l = minimapLayout(cfg);
  assert.equal(l.width, MINIMAP_WIDTH);
  assert.equal(l.scale, 0.2);
  assert.equal(l.height, 124);
  near(l.width / l.height, cfg.width / cfg.height);
});

test("at zoom 1 the viewport is the whole pond, in one piece", () => {
  const cam = new Camera(cfg);
  const rects = viewportRects(cam, cfg);
  assert.equal(rects.length, 1);
  assert.deepEqual(rects[0], { x: 0, y: 0, w: cfg.width, h: cfg.height });
});

test("the viewport's area is the visible area, at every zoom and position", () => {
  const cam = new Camera(cfg);
  for (const [zoom, x, y] of [
    [2, 450, 310],
    [2, 0, 0],
    [3.7, 880, 12],
    [8, 450, 619],
    [8, 5, 310],
  ]) {
    cam.zoom = zoom;
    cam.x = x;
    cam.y = y;
    const rects = viewportRects(cam, cfg);
    const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    near(area, (cfg.width / zoom) * (cfg.height / zoom), 1e-6);
    for (const r of rects) {
      assert.ok(r.x >= 0 && r.y >= 0, "a piece starts inside the bounds");
      assert.ok(r.x + r.w <= cfg.width + 1e-9, "a piece ends inside the width");
      assert.ok(r.y + r.h <= cfg.height + 1e-9, "a piece ends inside the height");
    }
  }
});

test("a view over a seam breaks into pieces the flat minimap can draw", () => {
  const cam = new Camera(cfg);
  cam.zoom = 4;

  cam.x = 2; // straddles the left/right seam only
  cam.y = 310;
  assert.equal(viewportRects(cam, cfg).length, 2);

  cam.x = 450; // straddles the top/bottom seam only
  cam.y = 1;
  assert.equal(viewportRects(cam, cfg).length, 2);

  cam.x = 1; // a corner: all four
  cam.y = 1;
  assert.equal(viewportRects(cam, cfg).length, 4);

  cam.x = 450; // comfortably inside: one
  cam.y = 310;
  assert.equal(viewportRects(cam, cfg).length, 1);
});

test("every image of a world point lands on the same minimap pixel", () => {
  const l = minimapLayout(cfg);
  for (const [x, y] of [[10, 20], [899, 619], [450.5, 310.25]]) {
    const p = worldToMinimap(x, y, l, cfg);
    for (const [ox, oy] of [[cfg.width, 0], [-cfg.width, 0], [0, cfg.height], [-cfg.width, -cfg.height]]) {
      const q = worldToMinimap(x + ox, y + oy, l, cfg);
      near(q.x, p.x, 1e-9);
      near(q.y, p.y, 1e-9);
    }
    assert.ok(p.x >= 0 && p.x <= l.width, "inside the minimap horizontally");
    assert.ok(p.y >= 0 && p.y <= l.height, "inside the minimap vertically");
  }
});

test("a click round-trips to the world point it was drawn from", () => {
  const l = minimapLayout(cfg);
  for (const [x, y] of [[0, 0], [123.5, 44.25], [899, 619]]) {
    const p = worldToMinimap(x, y, l, cfg);
    const w = minimapToWorld(p.x, p.y, l, cfg);
    near(w.x, x, 1e-9);
    near(w.y, y, 1e-9);
  }
  // The middle of the minimap is the middle of the pond — what "click to jump
  // to the centre" has to mean.
  const mid = minimapToWorld(l.width / 2, l.height / 2, l, cfg);
  near(mid.x, cfg.width / 2);
  near(mid.y, cfg.height / 2);
});

test("drawing paints the pond and never emits a NaN", () => {
  const world = new World(makeConfig({ seed: 8 }));
  for (let i = 0; i < 400; i++) world.step();
  const cam = new Camera(world.config);
  cam.zoom = 4;
  cam.x = 20; // over the seam, so the wrapped pieces get drawn too
  cam.y = 600;

  const ctx = stubCtx();
  const layout = drawMinimap(ctx, world, cam, { selected: world.creatures[0] });
  assert.equal(layout.width, MINIMAP_WIDTH);

  for (const op of ctx.ops) {
    for (let i = 1; i < op.length; i++) {
      assert.ok(Number.isFinite(op[i]), `${op[0]} got a non-finite argument`);
    }
  }
  // The background, every pellet, every creature, and the four viewport pieces.
  const rects = ctx.ops.filter((o) => o[0] === "fillRect").length;
  assert.equal(rects, 1 + world.food.items.length + world.creatures.length);
  assert.equal(ctx.ops.filter((o) => o[0] === "strokeRect").length, 4 + 1);
});

test("drawing the minimap cannot change the world", () => {
  const watched = new World(makeConfig({ seed: 12 }));
  const ignored = new World(makeConfig({ seed: 12 }));
  const cam = new Camera(watched.config);
  cam.zoom = 5;
  for (let i = 0; i < 600; i++) {
    watched.step();
    ignored.step();
    cam.x = (cam.x + 7) % watched.config.width; // roam, so every branch is taken
    drawMinimap(stubCtx(), watched, cam, { selected: watched.creatures[0] });
  }
  assert.equal(watched.creatures.length, ignored.creatures.length);
  assert.equal(watched.food.items.length, ignored.food.items.length);
  for (let i = 0; i < watched.creatures.length; i++) {
    assert.equal(watched.creatures[i].x, ignored.creatures[i].x);
    assert.equal(watched.creatures[i].energy, ignored.creatures[i].energy);
  }
});
