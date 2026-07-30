// minimap.test.js — the whole-pond view in a corner. Nothing here touches the
// simulation, but four things are worth locking down: that the viewport at
// zoom 1 is the entire world exactly (the same identity the camera protects),
// that a view straddling the torus seam comes back as pieces the flat minimap
// can actually draw, that the ground drawn here is the ground the pond is drawn
// over, and that drawing draws nothing random.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MINIMAP_WIDTH,
  TERRAIN_BANDS,
  minimapLayout,
  worldToMinimap,
  minimapToWorld,
  viewportRects,
  terrainBandRects,
  terrainBandFill,
  detritusCellRects,
  drawMinimap,
} from "../src/minimap.js";
import { DetritusField } from "../src/detritus.js";
import { minimapPredatorMark } from "../src/palette.js";
import { Camera } from "../src/camera.js";
import { World } from "../src/world.js";
import { TerrainField } from "../src/terrain.js";
import { makeConfig } from "../src/config.js";

const cfg = { width: 900, height: 620 };
const near = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

/** How many of a world's creatures the minimap draws a predator badge for. */
const predatorCount = (w) =>
  w.creatures.filter((c) => c.carnivory >= w.config.carnivoreThreshold).length;

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
  // A predator is two rects rather than one — a dark badge with a bright core —
  // so the count is stated as what it is rather than fudged with a tolerance.
  const rects = ctx.ops.filter((o) => o[0] === "fillRect").length;
  assert.equal(rects, 1 + world.food.items.length + world.creatures.length + predatorCount(world));
  assert.equal(ctx.ops.filter((o) => o[0] === "strokeRect").length, 4 + 1);
});

test("a predator on the minimap is a badge, not a coloured dot", () => {
  // The colour alone used to carry it, and to a tritanope a predator and a prey
  // creature of hue 26 were the same colour. Two tones, one light and one dark,
  // cannot both be swallowed — palette.test.js measures that; this asserts the
  // minimap actually draws both, larger tone first.
  const world = new World(makeConfig({ seed: 8, predation: true }));
  for (let i = 0; i < 600; i++) world.step();
  assert.ok(predatorCount(world) > 0, "seed 8 should have evolved some predators by now");

  const ctx = stubCtx();
  drawMinimap(ctx, world, new Camera(world.config), {});
  const mark = minimapPredatorMark();
  const badges = ctx.ops.filter((o) => o[0] === "fillRect" && o[3] === mark.rimSize);
  const cores = ctx.ops.filter((o) => o[0] === "fillRect" && o[3] === mark.coreSize);
  assert.equal(badges.length, predatorCount(world));
  // Every prey creature is a core-sized square too, so cores outnumber badges by
  // exactly the prey population.
  assert.equal(cores.length, world.creatures.length);
  // The bright core goes on top of the dark rim, or the badge is just a dark dot.
  const firstBadge = ctx.ops.findIndex((o) => o[0] === "fillRect" && o[3] === mark.rimSize);
  assert.equal(ctx.ops[firstBadge + 1][0], "fillRect");
  assert.equal(ctx.ops[firstBadge + 1][3], mark.coreSize);
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

// ---- The ground, in the corner ----
// v1.23 gave the world a landscape and drew it only in the pond, so the minimap
// answered "where am I?" and not "what is over there?". These lock down that the
// little map agrees with the big one, tiles without gaps, and — the failure mode
// a cache invites — can never show the landscape of a world that is already gone.

const terrainCfg = makeConfig({ seed: 1, terrain: true });

test("the ground covers the minimap exactly once, with no gap and no overlap", () => {
  const layout = minimapLayout(terrainCfg);
  const rects = terrainBandRects(new TerrainField(terrainCfg), layout, terrainCfg);
  assert.ok(rects.length > 0);

  const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
  near(area, layout.width * layout.height, 1e-6);

  // Area alone would let a gap pay for an overlap, so walk the cells: one
  // hairline of background showing through reads as a contour that isn't there,
  // and a double-covered cell is a band painted over its neighbour.
  const cols = Math.round(layout.width / 2);
  const rows = Math.round(layout.height / 2);
  const cw = layout.width / cols;
  const ch = layout.height / rows;
  const cover = new Uint8Array(cols * rows);
  for (const r of rects) {
    const i0 = Math.round(r.x / cw);
    const i1 = Math.round((r.x + r.w) / cw);
    const j0 = Math.round(r.y / ch);
    const j1 = Math.round((r.y + r.h) / ch);
    assert.ok(i1 > i0 && j1 > j0, "a rectangle covers at least one cell");
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        assert.equal(cover[j * cols + i]++, 0, `cell ${i},${j} covered twice`);
      }
    }
  }
  assert.ok(cover.every((n) => n === 1), "every cell of the map has ground on it");
});

test("a band on the minimap is the band the pond would draw there", () => {
  const layout = minimapLayout(terrainCfg);
  const terrain = new TerrainField(terrainCfg);
  const rects = terrainBandRects(terrain, layout, terrainCfg);
  const seen = new Set();
  for (const r of rects) {
    assert.ok(r.band >= 0 && r.band < TERRAIN_BANDS, `band ${r.band} is in range`);
    seen.add(r.band);
    // Sample the world under the middle of the rectangle and quantise it the
    // same way: the map must not invent a ridge the simulation doesn't have.
    const wx = ((r.x + r.w / 2) / layout.width) * terrainCfg.width;
    const wy = ((r.y + r.h / 2) / layout.height) * terrainCfg.height;
    const expect = Math.min(TERRAIN_BANDS - 1, Math.floor(terrain.at(wx, wy) * TERRAIN_BANDS));
    assert.equal(r.band, expect, `the band at ${wx},${wy}`);
  }
  // A landscape normalised to [0, 1] should show most of its range at this size;
  // a map that came out all one colour would be technically correct and useless.
  assert.ok(seen.size >= TERRAIN_BANDS - 1, `${seen.size} of ${TERRAIN_BANDS} bands visible`);
});

test("equal ground is merged as far as it goes, sideways and downward", () => {
  const layout = minimapLayout(terrainCfg);
  const rects = terrainBandRects(new TerrainField(terrainCfg), layout, terrainCfg);
  const cols = Math.round(layout.width / 2);
  const rows = Math.round(layout.height / 2);
  const cells = cols * rows;
  assert.ok(rects.length < cells / 3, `${rects.length} rectangles for ${cells} cells`);
  assert.ok(
    rects.some((r) => r.h > layout.height / rows + 1e-9),
    "a flat stretch spanning two rows is drawn once, not twice",
  );

  // Maximal sideways: two rectangles of the same band, sharing an edge and a
  // span, are a merge left on the table — and a seam drawn inside flat ground.
  for (const a of rects) {
    for (const b of rects) {
      if (a === b) continue;
      const sameRun = a.y === b.y && a.h === b.h && a.band === b.band;
      assert.ok(!(sameRun && Math.abs(a.x + a.w - b.x) < 1e-9), "adjacent runs differ");
    }
  }
});

test("a world without terrain has no ground to draw", () => {
  const layout = minimapLayout(cfg);
  assert.deepEqual(terrainBandRects(null, layout, cfg), []);
  assert.deepEqual(terrainBandRects(undefined, layout, cfg), []);
});

test("the cache can never hand back a landscape that has been dropped", () => {
  const layout = minimapLayout(terrainCfg);
  const a = new TerrainField(terrainCfg);
  assert.equal(terrainBandRects(a, layout, terrainCfg), terrainBandRects(a, layout, terrainCfg));

  // Toggling terrain off and on builds a *new* field for the same seed. It must
  // come back with the same landscape...
  const again = new TerrainField(terrainCfg);
  assert.deepEqual(terrainBandRects(again, layout, terrainCfg), terrainBandRects(a, layout, terrainCfg));
  // ...and a different seed must not inherit the old one. A stale readout that
  // looks live is this project's most-repeated bug; a cache is where it lives.
  const other = new TerrainField(makeConfig({ seed: 77, terrain: true }));
  assert.notDeepEqual(
    terrainBandRects(other, layout, terrainCfg),
    terrainBandRects(a, layout, terrainCfg),
  );
});

test("band fills ramp from basin to ridge without a NaN in them", () => {
  let last = -1;
  for (let b = 0; b < TERRAIN_BANDS; b++) {
    const fill = terrainBandFill(b);
    const parts = fill.match(/rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/);
    assert.ok(parts, `${fill} is a colour`);
    const [r, g, blue, alpha] = parts.slice(1).map(Number);
    for (const v of [r, g, blue, alpha]) assert.ok(Number.isFinite(v));
    assert.ok(r <= 255 && g <= 255 && blue <= 255 && alpha <= 1, "in range");
    assert.ok(r > last, "brighter the rougher the ground");
    last = r;
  }
});

test("the minimap draws the ground under the pond, not over it", () => {
  const world = new World(makeConfig({ seed: 8, terrain: true }));
  for (let i = 0; i < 200; i++) world.step();
  const cam = new Camera(world.config);
  cam.zoom = 4;

  const ctx = stubCtx();
  const layout = drawMinimap(ctx, world, cam, {});
  const ground = terrainBandRects(world.terrain, layout, world.config);
  assert.ok(ground.length > 0);

  const rects = ctx.ops.filter((o) => o[0] === "fillRect").length;
  assert.equal(
    rects,
    1 + ground.length + world.food.items.length + world.creatures.length + predatorCount(world)
  );
  for (const op of ctx.ops) {
    for (let i = 1; i < op.length; i++) {
      assert.ok(Number.isFinite(op[i]), `${op[0]} got a non-finite argument`);
    }
  }
  // The last band is painted before the first biome — the ground is a backdrop,
  // and a backdrop drawn late is a blindfold.
  const lastGround = 1 + ground.length - 1;
  const firstBiome = ctx.ops.findIndex((o) => o[0] === "arc");
  assert.ok(firstBiome > lastGround, "the ground goes down first");
});

test("drawing the ground cannot change a world that has one", () => {
  const watched = new World(makeConfig({ seed: 12, terrain: true }));
  const ignored = new World(makeConfig({ seed: 12, terrain: true }));
  const cam = new Camera(watched.config);
  cam.zoom = 5;
  for (let i = 0; i < 400; i++) {
    watched.step();
    ignored.step();
    cam.x = (cam.x + 7) % watched.config.width;
    drawMinimap(stubCtx(), watched, cam, { selected: watched.creatures[0] });
  }
  assert.equal(watched.creatures.length, ignored.creatures.length);
  for (let i = 0; i < watched.creatures.length; i++) {
    assert.equal(watched.creatures[i].x, ignored.creatures[i].x);
    assert.equal(watched.creatures[i].energy, ignored.creatures[i].energy);
  }
  assert.equal(watched.food.items.length, ignored.food.items.length);
  for (let i = 0; i < watched.food.items.length; i++) {
    assert.equal(watched.food.items[i].x, ignored.food.items[i].x);
  }
});

// ---- Enriched ground (v1.27) ----
//
// v1.23 gave the world terrain and drew it in the pond but not here; v1.24 had
// to go back for it. So the rule is now that a new map of the world lands on
// every surface that claims to show the world, in the same cycle — and that the
// little map's geometry is held to the same standard as the big one's.

test("no nutrient field means nothing drawn, and no branch at the call site", () => {
  const layout = minimapLayout(cfg);
  assert.deepEqual(detritusCellRects(null, layout), []);
  assert.deepEqual(detritusCellRects(undefined, layout), []);
});

test("only enriched cells are drawn, one rectangle each", () => {
  const config = makeConfig({ detritus: true });
  const field = new DetritusField(config);
  const layout = minimapLayout(config);
  assert.deepEqual(detritusCellRects(field, layout), [], "bare ground draws nothing");

  field.deposit(10, 10, 2);
  field.deposit(500, 400, 1);
  const rects = detritusCellRects(field, layout);
  assert.equal(rects.length, 2);
  // Each carries the richness of its own cell, so the fill is the field's value
  // rather than something the drawing code invented.
  const sorted = [...rects].sort((a, b) => b.richness - a.richness);
  near(sorted[0].richness, 2 / config.detritusFull);
  near(sorted[1].richness, 1 / config.detritusFull);
});

test("the cells tile the minimap exactly, once each", () => {
  const config = makeConfig({ detritus: true });
  const field = new DetritusField(config);
  for (let k = 0; k < field.cells.length; k++) field.cells[k] = 1; // enrich everything
  field.total = field.cells.length;
  const layout = minimapLayout(config);
  const rects = detritusCellRects(field, layout);
  assert.equal(rects.length, field.cells.length);
  // Walk the cells rather than trusting the areas to add up: a gap on one side
  // pays for an overlap on the other in any total.
  const seen = new Set();
  for (const r of rects) {
    const key = `${r.x},${r.y}`;
    assert.ok(!seen.has(key), `two rectangles at ${key}`);
    seen.add(key);
  }
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  near(right, layout.width);
  near(bottom, layout.height);
  assert.equal(Math.min(...rects.map((r) => r.x)), 0);
  assert.equal(Math.min(...rects.map((r) => r.y)), 0);
});

test("the minimap draws the same enriched ground the pond does", () => {
  const world = new World(makeConfig({ seed: 8, detritus: true }));
  for (let i = 0; i < 900; i++) world.step();
  assert.ok(world.detritus.total > 0, "something should have died by now");
  const layout = minimapLayout(world.config);
  const expected = detritusCellRects(world.detritus, layout).length;
  assert.ok(expected > 0);

  const ctx = stubCtx();
  drawMinimap(ctx, world, new Camera(world.config), {});
  const rects = ctx.ops.filter((o) => o[0] === "fillRect").length;
  // Background + soil cells + pellets + creatures (+ a second rect per predator).
  assert.equal(
    rects,
    1 + expected + world.food.items.length + world.creatures.length + predatorCount(world)
  );
  for (const op of ctx.ops) {
    for (let i = 1; i < op.length; i++) {
      assert.ok(Number.isFinite(op[i]), `${op[0]} got a non-finite argument`);
    }
  }
});

// ---- the contagious zone (v1.34) ----
//
// The minimap is the only surface where a whole-pond pattern is visible at a
// glance, which is exactly the shape of the question an epidemic raises: is this
// a front crossing the water, or a haze over all of it? So the hazard field is
// drawn here as well as in the pond — the v1.23 mistake was shipping terrain
// into one of two views, and this is the same test written a decade of versions
// later.

/** The discs drawMinimap drew for the contagious zone, by their radius. */
function hazardArcs(ctx, world, layout) {
  const r = world.config.infectionRadius * layout.scale;
  return ctx.ops.filter((o) => o[0] === "arc" && Math.abs(o[3] - r) < 1e-9);
}

test("a pond with nobody sick draws no contagious water at all", () => {
  const world = new World(makeConfig({ seed: 8 }));
  for (let i = 0; i < 200; i++) world.step();
  const ctx = stubCtx();
  const layout = drawMinimap(ctx, world, new Camera(world.config), {});
  assert.equal(hazardArcs(ctx, world, layout).length, 0);
});

test("each case draws its own reach, under the living", () => {
  const world = new World(makeConfig({ seed: 8 }));
  for (let i = 0; i < 200; i++) world.step();
  // Placed away from the seams, so each disc is one image and the count is exact.
  const cases = world.creatures.slice(0, 3);
  assert.equal(cases.length, 3, "seed 8 should have a few creatures to make ill");
  cases.forEach((c, i) => {
    c.infected = true;
    c.x = 200 + i * 200;
    c.y = 300;
  });
  const ctx = stubCtx();
  const layout = drawMinimap(ctx, world, new Camera(world.config), {});
  assert.equal(hazardArcs(ctx, world, layout).length, 3);
  // Under the living: the last hazard disc is drawn before the first creature.
  const lastZone = ctx.ops.map((o) => o[0]).lastIndexOf("arc");
  const firstCreature = ctx.ops.findIndex((o) => o[0] === "fillRect" && o[3] === 2);
  assert.ok(lastZone < firstCreature, "the zone belongs to the water, not to the creatures");
});

test("a case on the seam is contagious on both sides of it", () => {
  const world = new World(makeConfig({ seed: 8 }));
  for (let i = 0; i < 200; i++) world.step();
  const one = world.creatures[0];
  one.infected = true;
  one.x = 1;
  one.y = 300;
  const ctx = stubCtx();
  const layout = drawMinimap(ctx, world, new Camera(world.config), {});
  const arcs = hazardArcs(ctx, world, layout);
  assert.equal(arcs.length, 2, "a disc over the left edge is drawn twice, once past each side");
  const xs = arcs.map((a) => a[1]).sort((a, b) => a - b);
  const r = world.config.infectionRadius * layout.scale;
  assert.ok(xs[0] < r, "one image sits on the left edge, half of it off the map");
  assert.ok(xs[1] > layout.width - r, "and the half that fell off comes back on the right");
});
