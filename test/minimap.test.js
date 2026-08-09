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
import { minimapPredatorMark, minimapViewport, minimapSelection, minimapCorpseMark, foodMote } from "../src/palette.js";
import { recordingContext } from "../src/rendershot.js";
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

/**
 * A recording 2D context — `src/rendershot.js`'s, as of v1.57.
 *
 * This file hand-rolled its own from v1.19: an object with the five methods
 * `drawMinimap` happened to call and `fillStyle` as a plain field, which meant
 * every assertion here was about *geometry* and none could be about colour.
 * The recorder makes the style properties accessors and logs an entry when one
 * is assigned, which is the only reason the corpse badge's two tones below can
 * be checked at all. This stub was never *stale* the way v1.50 found the
 * renderer's — `drawMinimap` never learned a call it did not have — it was
 * blind by construction, which is the quieter half of v1.32's rule: a double is
 * an assertion of equivalence, and equivalence includes the parts of the
 * interface nobody thought to record.
 *
 * Its log entries are `[surface, name, ...args]`, so the helpers below name the
 * parts rather than leaving index arithmetic in thirty assertions.
 */
function recorder() {
  return recordingContext("minimap");
}

/** Every call of one name, in order. */
const called = (ops, name) => ops.filter((o) => o[1] === name);

/** A call's arguments, without the surface and the method name. */
const args = (op) => op.slice(2);

/** The drawing calls, with the style assignments dropped. */
const paints = (ops) => ops.filter((o) => !String(o[1]).startsWith("set:"));

/** Every numeric argument the frame emitted is a real number. */
function assertNoNaN(ops) {
  for (const op of paints(ops)) {
    for (const a of args(op)) {
      assert.ok(typeof a !== "number" || Number.isFinite(a), `${op[1]} got a non-finite argument`);
    }
  }
}

/** The fill colour in force when `op` was recorded. */
function fillAt(ops, op) {
  let fill = null;
  for (const o of ops) {
    if (o === op) return fill;
    if (o[1] === "set:fillStyle") fill = o[2];
  }
  return null;
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

  const { ctx, ops } = recorder();
  const layout = drawMinimap(ctx, world, cam, { selected: world.creatures[0] });
  assert.equal(layout.width, MINIMAP_WIDTH);

  assertNoNaN(ops);
  // The background, every pellet, every creature, and the four viewport pieces.
  // A predator is two rects rather than one — a dark badge with a bright core —
  // so the count is stated as what it is rather than fudged with a tolerance.
  const rects = called(ops, "fillRect").length;
  assert.equal(rects, 1 + world.food.items.length + world.creatures.length + predatorCount(world));
  // Both stroked marks are cased since v1.73 — a dark rectangle a pixel
  // outside a pale one — so each is two `strokeRect`s: four viewport pieces
  // over the seam, plus the selection square.
  assert.equal(called(ops, "strokeRect").length, 2 * (4 + 1));
});

test("the frame and the selection square are each two rectangles, dark outside pale", () => {
  // v1.34's rule, asserted on the drawing rather than on the palette: a mark
  // that carries only one tone can be swallowed whole, and the map's own crop
  // stacks additively past a near-white. `palette.test.js` measures the tones;
  // this checks the module lays both of them down, outer one first, a pixel
  // apart — a casing drawn *under* the line at a wider stroke would composite
  // to a grey at a fifth of the pond's scale.
  const world = new World(makeConfig({ seed: 8 }));
  for (let i = 0; i < 200; i++) world.step();
  const cam = new Camera(world.config);
  cam.zoom = 4;
  cam.x = world.config.width / 2;
  cam.y = world.config.height / 2;

  const { ctx, ops } = recorder();
  drawMinimap(ctx, world, cam, { selected: world.creatures[0] });

  const frame = minimapViewport();
  const box = minimapSelection();
  // Every stroked rectangle in the log, with the colour that was live for it.
  const strokes = [];
  let colour = null;
  for (const op of ops) {
    if (op[1] === "set:strokeStyle") colour = op[2];
    if (op[1] === "strokeRect") strokes.push({ colour, r: op.slice(2) });
  }
  assert.equal(strokes.length, 2 * (1 + 1), "one viewport piece and one selection, cased");
  for (const [outer, inner] of [
    [strokes[0], strokes[1]],
    [strokes[2], strokes[3]],
  ]) {
    const mark = outer === strokes[0] ? box : frame;
    assert.equal(outer.colour, mark.casing, "the casing is not laid down first");
    assert.equal(inner.colour, mark.line, "the pale line is not laid down second");
    assert.equal(outer.r[0], inner.r[0] - 1, "the casing is not one pixel outside");
    assert.equal(outer.r[1], inner.r[1] - 1);
    assert.equal(outer.r[2], inner.r[2] + 2);
    assert.equal(outer.r[3], inner.r[3] + 2);
  }
  assert.equal(strokes[1].r[2], box.size, "the selection square is not the size the palette gives");
});

test("a predator on the minimap is a badge, not a coloured dot", () => {
  // The colour alone used to carry it, and to a tritanope a predator and a prey
  // creature of hue 26 were the same colour. Two tones, one light and one dark,
  // cannot both be swallowed — palette.test.js measures that; this asserts the
  // minimap actually draws both, larger tone first.
  const world = new World(makeConfig({ seed: 8, predation: true }));
  for (let i = 0; i < 600; i++) world.step();
  assert.ok(predatorCount(world) > 0, "seed 8 should have evolved some predators by now");

  const { ctx, ops } = recorder();
  drawMinimap(ctx, world, new Camera(world.config), {});
  const mark = minimapPredatorMark();
  const rects = called(ops, "fillRect");
  const badges = rects.filter((o) => args(o)[2] === mark.rimSize);
  const cores = rects.filter((o) => args(o)[2] === mark.coreSize);
  assert.equal(badges.length, predatorCount(world));
  // Every prey creature is a core-sized square too, so cores outnumber badges by
  // exactly the prey population.
  assert.equal(cores.length, world.creatures.length);
  // The bright core goes on top of the dark rim, or the badge is just a dark dot
  // — and each is painted in the tone the audit measured, which the stub this
  // file used until v1.57 could not see.
  const firstBadge = paints(ops).findIndex((o) => o[1] === "fillRect" && args(o)[2] === mark.rimSize);
  const after = paints(ops)[firstBadge + 1];
  assert.equal(after[1], "fillRect");
  assert.equal(args(after)[2], mark.coreSize);
  assert.equal(fillAt(ops, badges[0]), mark.rim);
  assert.equal(fillAt(ops, after), mark.core);
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
    drawMinimap(recorder().ctx, watched, cam, { selected: watched.creatures[0] });
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

  const { ctx, ops } = recorder();
  const layout = drawMinimap(ctx, world, cam, {});
  const ground = terrainBandRects(world.terrain, layout, world.config);
  assert.ok(ground.length > 0);

  const rects = called(ops, "fillRect").length;
  assert.equal(
    rects,
    1 + ground.length + world.food.items.length + world.creatures.length + predatorCount(world)
  );
  assertNoNaN(ops);
  // The last band is painted before the first biome — the ground is a backdrop,
  // and a backdrop drawn late is a blindfold.
  const drawn = paints(ops);
  const lastGround = 1 + ground.length - 1;
  const firstBiome = drawn.findIndex((o) => o[1] === "arc");
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
    drawMinimap(recorder().ctx, watched, cam, { selected: watched.creatures[0] });
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

  const { ctx, ops } = recorder();
  drawMinimap(ctx, world, new Camera(world.config), {});
  const rects = called(ops, "fillRect").length;
  // Background + soil cells + pellets + creatures (+ a second rect per predator).
  assert.equal(
    rects,
    1 + expected + world.food.items.length + world.creatures.length + predatorCount(world)
  );
  assertNoNaN(ops);
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
function hazardArcs(ops, world, layout) {
  const r = world.config.infectionRadius * layout.scale;
  return called(ops, "arc").filter((o) => Math.abs(args(o)[2] - r) < 1e-9);
}

test("a pond with nobody sick draws no contagious water at all", () => {
  const world = new World(makeConfig({ seed: 8 }));
  for (let i = 0; i < 200; i++) world.step();
  const { ctx, ops } = recorder();
  const layout = drawMinimap(ctx, world, new Camera(world.config), {});
  assert.equal(hazardArcs(ops, world, layout).length, 0);
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
  const { ctx, ops } = recorder();
  const layout = drawMinimap(ctx, world, new Camera(world.config), {});
  assert.equal(hazardArcs(ops, world, layout).length, 3);
  // Under the living: the last hazard disc is drawn before the first creature.
  const drawn = paints(ops);
  const lastZone = drawn.map((o) => o[1]).lastIndexOf("arc");
  const firstCreature = drawn.findIndex((o) => o[1] === "fillRect" && args(o)[2] === 2);
  assert.ok(lastZone < firstCreature, "the zone belongs to the water, not to the creatures");
});

test("a case on the seam is contagious on both sides of it", () => {
  const world = new World(makeConfig({ seed: 8 }));
  for (let i = 0; i < 200; i++) world.step();
  const one = world.creatures[0];
  one.infected = true;
  one.x = 1;
  one.y = 300;
  const { ctx, ops } = recorder();
  const layout = drawMinimap(ctx, world, new Camera(world.config), {});
  const arcs = hazardArcs(ops, world, layout);
  assert.equal(arcs.length, 2, "a disc over the left edge is drawn twice, once past each side");
  const xs = arcs.map((a) => args(a)[0]).sort((a, b) => a - b);
  const r = world.config.infectionRadius * layout.scale;
  assert.ok(xs[0] < r, "one image sits on the left edge, half of it off the map");
  assert.ok(xs[1] > layout.width - r, "and the half that fell off comes back on the right");
});

// ---- the dead (v1.57) ----
//
// Scavenging has left corpses in the water since v1.8 and this view drew none of
// them for thirty-eight releases — the v1.23 mistake again, with the feature and
// the surface a decade apart instead of one release. The Chronicle announces a
// die-off at forty corpses and the map it says that over was empty water. The
// tests: that they are drawn, as the two tones the audit measured, under the
// living and in the pond's own order; and that a world without them draws
// nothing at all, so a pond with scavenging off looks exactly as it did.

/** A world run far enough to be burying its dead. */
function scavengingWorld(seed = 314, ticks = 1200) {
  const world = new World(makeConfig({ seed, scavenging: true }));
  for (let i = 0; i < ticks; i++) world.step();
  assert.ok(world.corpses.length > 0, `seed ${seed} should have corpses after ${ticks} ticks`);
  return world;
}

/** The squares of one size, which is how each mark is told from the others here. */
const squaresOf = (ops, size) => called(ops, "fillRect").filter((o) => args(o)[2] === size);

test("a pond with scavenging off draws no dead at all", () => {
  const world = new World(makeConfig({ seed: 8 }));
  for (let i = 0; i < 400; i++) world.step();
  assert.equal(world.corpses.length, 0, "no corpses without the flag");
  const { ctx, ops } = recorder();
  drawMinimap(ctx, world, new Camera(world.config), {});
  const dead = minimapCorpseMark();
  assert.equal(squaresOf(ops, dead.rimSize).length, 0);
  assert.equal(squaresOf(ops, dead.coreSize).length, 0);
  // And no tone of it is ever set, so the flag being off is not merely a mark
  // of zero size — it is a colour the frame never mentions.
  assert.equal(called(ops, "set:fillStyle").filter((o) => o[2] === dead.rim).length, 0);
});

test("every corpse is two squares, pale around dark, in the tones the pond uses", () => {
  const world = scavengingWorld();
  const { ctx, ops } = recorder();
  drawMinimap(ctx, world, new Camera(world.config), {});
  const dead = minimapCorpseMark();
  const rims = squaresOf(ops, dead.rimSize);
  const cores = squaresOf(ops, dead.coreSize);
  assert.equal(rims.length, world.corpses.length);
  assert.equal(cores.length, world.corpses.length);
  // The dark core goes on top of the pale square — the inverse of the hunter's
  // badge, which is the only thing telling the two apart at this size.
  const drawn = paints(ops);
  const first = drawn.findIndex((o) => o[1] === "fillRect" && args(o)[2] === dead.rimSize);
  assert.equal(args(drawn[first + 1])[2], dead.coreSize);
  assert.equal(fillAt(ops, rims[0]), dead.rim);
  assert.equal(fillAt(ops, drawn[first + 1]), dead.core);
  assertNoNaN(ops);
});

test("the dead are drawn under the living and under the crop, as in the pond", () => {
  const world = scavengingWorld();
  const drawn = (() => {
    const { ctx, ops } = recorder();
    drawMinimap(ctx, world, new Camera(world.config), {});
    return paints(ops);
  })();
  const dead = minimapCorpseMark();
  const at = (pred) => drawn.map((o, i) => [o, i]).filter(([o]) => pred(o)).map(([, i]) => i);
  const corpses = at((o) => o[1] === "fillRect" && args(o)[2] === dead.rimSize);
  const pellets = at((o) => o[1] === "fillRect" && args(o)[2] === 1.2);
  const creatures = at((o) => o[1] === "fillRect" && args(o)[2] === 2);
  assert.ok(corpses.length && pellets.length && creatures.length);
  assert.ok(Math.max(...corpses) < Math.min(...pellets), "a pellet lies on a corpse, not under it");
  assert.ok(Math.max(...pellets) < Math.min(...creatures), "and the living are on top of both");
});

test("a corpse is drawn where the corpse is, seam and all", () => {
  const world = scavengingWorld();
  const layout = minimapLayout(world.config);
  // One corpse, hand-placed over the left seam: the minimap has four real edges,
  // so its coordinate is wrapped into bounds rather than drawn off the map.
  world.corpses.length = 1;
  world.corpses[0].x = -3;
  world.corpses[0].y = 310;
  const { ctx, ops } = recorder();
  drawMinimap(ctx, world, new Camera(world.config), {});
  const dead = minimapCorpseMark();
  const rim = squaresOf(ops, dead.rimSize)[0];
  const p = worldToMinimap(world.corpses[0].x, world.corpses[0].y, layout, world.config);
  near(args(rim)[0], p.x - dead.rimSize / 2);
  near(args(rim)[1], p.y - dead.rimSize / 2);
  assert.ok(args(rim)[0] > layout.width - dead.rimSize, "wrapped onto the right-hand edge");
});

test("the pellet is the pond's pellet, drawn the pond's way and put back", () => {
  // The wash this replaces was a literal in `minimap.js` and failed on every
  // bright ground the map has (palette.test.js measures that). Two things have
  // to hold for the fix: the colour comes from the palette, and the additive
  // mode it needs is restored before anything else is drawn — the creatures are
  // next, and this context is reused for every frame of the run.
  const world = scavengingWorld();
  const { ctx, ops } = recorder();
  drawMinimap(ctx, world, new Camera(world.config), {});
  const mote = foodMote();
  const expected = `rgba(${mote.r}, ${mote.g}, ${mote.b}, ${mote.a})`;
  const pellets = squaresOf(ops, 1.2);
  assert.equal(pellets.length, world.food.items.length);
  assert.equal(fillAt(ops, pellets[0]), expected);

  const modes = called(ops, "set:globalCompositeOperation");
  assert.deepEqual(modes.map((o) => o[2]), ["lighter", "source-over"]);
  // The pellets, and only the pellets, are drawn additively.
  const drawn = paints(ops);
  const on = drawn.findIndex((o) => o === pellets[0]);
  const off = drawn.findIndex((o) => o[1] === "fillRect" && args(o)[2] === 2);
  assert.ok(on < off, "the crop is drawn before the living");
  for (const p of pellets) assert.ok(drawn.indexOf(p) < off, "every pellet is inside the additive pass");
});
