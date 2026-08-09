// minimap.js — the whole pond in miniature, while the view is somewhere inside it.
//
// v1.17 gave this world a camera, and with it the first way to get lost in a
// place that has no edges: at 8× you can see a fifteenth of the water and
// nothing on screen says *which* fifteenth. The minimap is the missing half of
// that feature — the classic whole-pond view, shrunk into a corner, with a
// bright rectangle marking where the lens is pointed. Click it to go there.
//
// v1.23 then gave the world a landscape and drew it only in the pond, which put
// the same hole back one level down: you could see the ridge you were in and
// not where the next basin was. So the ground is drawn here too, quantised into
// bands — the little map has to agree with the big one about the shape of the
// world, or it is worse than no map.
//
// Like the camera, everything here is read-only with respect to the simulation
// and draws no random numbers, so where you happen to be looking still cannot
// change what happens. And like the camera it has an invariant worth naming:
// **at zoom 1 the viewport is the entire world, exactly** — one rectangle,
// flush with the bounds, no seam — which is why the minimap hides itself in the
// default view rather than drawing a frame around everything.

import { wrap } from "./vec.js";
import {
  minimapPredatorMark,
  minimapCorpseMark,
  minimapWater,
  minimapBiomeWash,
  minimapPreyDot,
  minimapViewport,
  minimapSelection,
  foodMote,
  rgbCss,
  detritusTint,
  hazardTint,
  barrierRock,
} from "./palette.js";
import { hazardSources } from "./contagion.js";

/** Minimap width in CSS pixels. 180 over a 900-wide world is a clean 0.2 scale. */
export const MINIMAP_WIDTH = 180;

/**
 * Roughness bands the ground is quantised into here. The same count `render.js`
 * draws contours at, so the two views agree about where a ridge begins: a
 * minimap that disagreed with the pond about the shape of the landscape would
 * be worse than one that drew no landscape at all.
 */
export const TERRAIN_BANDS = 8;

/**
 * Target cell size in minimap pixels. Two keeps a band edge looking like a
 * contour rather than a staircase at a fifth of the pond's scale; the merging
 * below is what makes sampling that finely affordable.
 */
const TERRAIN_CELL = 2;

// The landscape is static for the life of a `TerrainField`, so the band
// rectangles are built once and reused. Keying the cache on the field itself —
// rather than on, say, the seed — is what makes the stale case impossible:
// toggling terrain off drops the field, toggling it back on builds a new one,
// and a new object cannot find an old landscape's rectangles.
const bandCache = new WeakMap();

/** Sizing for a minimap of `width` px that keeps the world's aspect ratio exactly. */
export function minimapLayout(config, width = MINIMAP_WIDTH) {
  const scale = width / config.width;
  return { width, height: config.height * scale, scale };
}

/**
 * World point → minimap pixel. The coordinate is wrapped first, so every image
 * of a point on the torus lands on the same pixel — the minimap is the one view
 * where the seam is a real edge rather than something to hide.
 */
export function worldToMinimap(wx, wy, layout, config) {
  return {
    x: wrap(wx, config.width) * layout.scale,
    y: wrap(wy, config.height) * layout.scale,
  };
}

/** Minimap pixel → world point, wrapped back into the world's bounds. */
export function minimapToWorld(mx, my, layout, config) {
  return {
    x: wrap(mx / layout.scale, config.width),
    y: wrap(my / layout.scale, config.height),
  };
}

/**
 * The rectangles the current view covers, in world coordinates. Usually one —
 * but the world is a torus and the minimap is a flat rectangle, so a view
 * straddling a seam comes back as two pieces (four at a corner) instead of one
 * rectangle running off the edge. Their areas always sum to the viewport's.
 */
export function viewportRects(camera, config) {
  const vw = Math.min(config.width, config.width / camera.zoom);
  const vh = Math.min(config.height, config.height / camera.zoom);
  const xs = spans(wrap(camera.x - vw / 2, config.width), vw, config.width);
  const ys = spans(wrap(camera.y - vh / 2, config.height), vh, config.height);
  const rects = [];
  for (const [x, w] of xs) for (const [y, h] of ys) rects.push({ x, y, w, h });
  return rects;
}

// One span, or the two pieces a span breaks into where it crosses the seam. The
// epsilon matters: at zoom 1 the span is the full axis, and a rounding crumb of
// overhang would split the whole-pond view into a rectangle plus a sliver.
function spans(start, len, size) {
  const over = start + len - size;
  if (over <= 1e-9) return [[start, len]];
  return [
    [start, len - over],
    [0, over],
  ];
}

/**
 * The ground, as rectangles the minimap can draw: the roughness field sampled
 * onto a grid of cells, quantised into `TERRAIN_BANDS` levels, and merged into
 * the fewest rectangles that cover the map exactly — runs of equal band along
 * each row, then a row folded into the one above it wherever they agree.
 *
 * The quantising is what makes 180 pixels of gradient read as *terrain*: a
 * smooth ramp at this size is indistinguishable from the several other glows in
 * the corner, whereas a step between one band and the next is a contour line.
 * The merging is what makes it affordable — a default landscape comes out at
 * about a fifth of the five and a half thousand cells it is sampled from —
 * which is why the cells can be small enough not to look like a mosaic.
 *
 * Returns `[]` when the world has no terrain, so the call site needs no branch
 * and a flat world draws exactly what it has always drawn.
 *
 * @param {import('./terrain.js').TerrainField|null|undefined} terrain
 * @param {{width:number, height:number}} layout from `minimapLayout`
 * @param {object} config
 * @returns {Array<{x:number,y:number,w:number,h:number,band:number}>}
 */
export function terrainBandRects(terrain, layout, config) {
  if (!terrain) return [];
  const cached = bandCache.get(terrain);
  if (cached && cached.width === layout.width) return cached.rects;

  const cols = Math.max(1, Math.round(layout.width / TERRAIN_CELL));
  const rows = Math.max(1, Math.round(layout.height / TERRAIN_CELL));
  const cw = layout.width / cols;
  const ch = layout.height / rows;
  const rects = [];
  let prev = []; // the row above, as the rectangles it ended up in
  for (let j = 0; j < rows; j++) {
    const wy = ((j + 0.5) / rows) * config.height;
    const row = [];
    let band = -1; // the band of the run being extended; -1 = no run open
    let start = 0; // and the column it started at
    // One column past the end closes the last run without repeating its body.
    for (let i = 0; i <= cols; i++) {
      const here = i < cols ? bandAt(terrain, ((i + 0.5) / cols) * config.width, wy) : -1;
      if (here === band) continue;
      if (band >= 0) row.push(close(rects, prev, start * cw, j * ch, (i - start) * cw, ch, band));
      band = here;
      start = i;
    }
    prev = row;
  }
  bandCache.set(terrain, { width: layout.width, rects });
  return rects;
}

// Emit one run, or grow the identical run directly above it downward instead.
// The coordinates are computed the same way in every row, so the equality test
// is exact rather than approximate — no epsilon, and no rectangle that is a
// hair's breadth wider than the one it claims to continue.
function close(rects, prev, x, y, w, h, band) {
  for (const p of prev) {
    if (p.x === x && p.w === w && p.band === band) {
      p.h += h;
      return p;
    }
  }
  const r = { x, y, w, h, band };
  rects.push(r);
  return r;
}

/** Which band a point's roughness falls in. The top of the range is inclusive. */
function bandAt(terrain, x, y) {
  return Math.min(TERRAIN_BANDS - 1, Math.floor(terrain.at(x, y) * TERRAIN_BANDS));
}

/**
 * The fill for a band: the same basin-to-ridge ramp the pond is drawn over,
 * carried at higher contrast because there is a fifth as much of it here and
 * nothing else in the corner to compare it against. Still quiet enough that a
 * pellet or a predator is the brightest thing on the map.
 * @param {number} band
 */
export function terrainBandFill(band) {
  const t = band / (TERRAIN_BANDS - 1);
  const r = Math.round(24 + 84 * t);
  const g = Math.round(42 + 76 * t);
  const b = Math.round(54 + 84 * t);
  return `rgba(${r}, ${g}, ${b}, ${(0.22 + 0.4 * t).toFixed(3)})`;
}

/**
 * Enriched ground, as rectangles the minimap can draw: one per cell holding any
 * nutrient at all, sized so the cells tile the map exactly.
 *
 * No merging, unlike the terrain bands — a cell is thirty world pixels across
 * and the values are continuous, so there is nothing to merge and, at six
 * minimap pixels a side, nothing to be gained. Returns `[]` when the world keeps
 * no such record, so the call site needs no branch.
 *
 * v1.23 gave the world terrain and drew it in the pond but not here, and v1.24
 * had to go back for it. The rule that came out of that: when a feature arrives,
 * every surface claiming to show the same world updates in the same cycle.
 *
 * @param {import('./detritus.js').DetritusField|null|undefined} field
 * @param {{width:number, height:number}} layout from `minimapLayout`
 * @returns {Array<{x:number,y:number,w:number,h:number,richness:number}>}
 */
export function detritusCellRects(field, layout) {
  if (!field) return [];
  const w = layout.width / field.cols;
  const h = layout.height / field.rows;
  const rects = [];
  for (let j = 0; j < field.rows; j++) {
    for (let i = 0; i < field.cols; i++) {
      const richness = field.richness(i, j);
      if (richness <= 0) continue; // bare ground is the map's own background
      rects.push({ x: i * w, y: j * h, w, h, richness });
    }
  }
  return rects;
}

/**
 * Draw the pond into a minimap context, which is expected to be scaled so that
 * one unit is one CSS pixel of the minimap. Returns the layout it drew at.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./world.js').World} world
 * @param {import('./camera.js').Camera} camera
 * @param {{width?: number, selected?: object|null}} [opts]
 */
export function drawMinimap(ctx, world, camera, opts = {}) {
  const config = world.config;
  const layout = minimapLayout(config, opts.width);
  const { width: W, height: H, scale: s } = layout;

  ctx.fillStyle = rgbCss(minimapWater());
  ctx.fillRect(0, 0, W, H);

  // The ground first, under everything, in the same order the pond draws it.
  // Empty on a flat world, so nothing below here changes for one.
  for (const r of terrainBandRects(world.terrain, layout, config)) {
    ctx.fillStyle = terrainBandFill(r.band);
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  // Biomes, so fertile ground is recognisable at this size even when the crop
  // sitting on it has been eaten.
  if (config.foodPatches && world.environment) {
    const wash = minimapBiomeWash();
    ctx.fillStyle = `rgba(${wash.r}, ${wash.g}, ${wash.b}, ${wash.a})`;
    for (const c of world.environment.centres) {
      const p = worldToMinimap(c.x, c.y, layout, config);
      discWrapped(ctx, p.x, p.y, config.patchRadius * s, W, H);
    }
  }

  // Enriched ground, over both static maps and under the living, in the same
  // order the pond draws it. Empty in a world that keeps no record of its dead.
  for (const r of detritusCellRects(world.detritus, layout)) {
    const t = detritusTint(r.richness);
    ctx.fillStyle = `rgba(${t.r}, ${t.g}, ${t.b}, ${t.a.toFixed(3)})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  // The contagious zone, over the ground and under the living, exactly as the
  // pond draws it. This is the view the field was worth adding for: whether an
  // epidemic is a front crossing the water or a haze over all of it is a
  // whole-pond question, and this is the only surface where a whole-pond pattern
  // is visible at a glance. Wrapped, because the minimap has four real edges and
  // a zone straddling a seam covers ground on both sides of it.
  const sources = hazardSources(world.creatures);
  if (sources.length) {
    const t = hazardTint();
    ctx.fillStyle = `rgba(${t.r}, ${t.g}, ${t.b}, ${t.a})`;
    const hazardRadius = config.infectionRadius * s;
    for (const src of sources) {
      const p = worldToMinimap(src.x, src.y, layout, config);
      discWrapped(ctx, p.x, p.y, hazardRadius, W, H);
    }
  }

  // Rock, over every field and under everything alive, in the same order the
  // pond draws it. This is the surface where a wall matters most: the shape of
  // the rooms is a whole-pond fact, and the pond view can only ever show you one
  // room at a time once you have zoomed in far enough to see anything. Every
  // rectangle is already inside the world's bounds (`rects()` splits the ones
  // that straddle a seam), which is exactly what this flat, four-edged view
  // needs — the v1.24 rule, for free.
  if (world.barriers) {
    const rock = barrierRock();
    ctx.fillStyle = rock.fill;
    for (const r of world.barriers.rects()) {
      const p = worldToMinimap(r.x, r.y, layout, config);
      ctx.fillRect(p.x, p.y, Math.max(1, r.w * s), Math.max(1, r.h * s));
    }
  }

  // The dead, over every field and under everything alive, in the same order
  // the pond draws them. Scavenging has left corpses lying in the water since
  // v1.8 and this view has never drawn one, through thirty-eight releases: the
  // Chronicle announces a die-off in words the moment forty of them are down,
  // and the map it says that over showed an empty stretch of pond. Nothing here
  // is a pattern — the dead turn out to lie where random points would (see
  // SCIENCE.md) — so what the mark is for is the count and the place, which is
  // exactly what the pond view cannot give you: at zoom 4, where this map first
  // appears, 6.9% of the standing corpses are on screen.
  if (world.corpses.length) {
    const dead = minimapCorpseMark();
    for (const k of world.corpses) {
      const p = worldToMinimap(k.x, k.y, layout, config);
      ctx.fillStyle = dead.rim;
      ctx.fillRect(p.x - dead.rimSize / 2, p.y - dead.rimSize / 2, dead.rimSize, dead.rimSize);
      ctx.fillStyle = dead.core;
      ctx.fillRect(p.x - dead.coreSize / 2, p.y - dead.coreSize / 2, dead.coreSize, dead.coreSize);
    }
  }

  // Food and creatures are single pixels here, so they are squares rather than
  // discs: at 2px across a fillRect is both crisper and cheaper than an arc.
  //
  // The pellet was `rgba(80, 205, 140, 0.5)` — a flat wash, a literal in this
  // file, the pond's mote colour typed out again with the pond's arithmetic left
  // behind — from v1.19 until v1.57, when the corpse audit walked into it. A
  // wash is legible against the water and against nothing else: it scores ΔE
  // 15.3 on rock, 10.3 on the brightest enriched ground and **4.6** on a
  // corpse's bone, against a bar of 25. So it becomes the pond's own mote,
  // `foodMote()`, drawn the way the pond draws it — additive, which is both what
  // makes it survive a bright background and what makes a dense patch glow.
  // Restored to `source-over` immediately: the creatures are next, and this
  // context outlives the frame.
  const mote = foodMote();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `rgba(${mote.r}, ${mote.g}, ${mote.b}, ${mote.a})`;
  for (const f of world.food.items) {
    const p = worldToMinimap(f.x, f.y, layout, config);
    ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2);
  }
  ctx.globalCompositeOperation = "source-over";

  const threshold = config.carnivoreThreshold;
  const mark = minimapPredatorMark();
  for (const c of world.creatures) {
    const p = worldToMinimap(c.x, c.y, layout, config);
    // Predators are the thing worth spotting from across the pond. They used to
    // get one warm square, which to a tritanope was the same colour as a prey
    // creature of hue 26 — on the one view where a whole-pond pattern is visible
    // at a glance, the pattern most worth seeing was invisible. Now they get the
    // same two-tone badge the pond draws: a dark square with a bright one inside
    // it, so whichever tone a neighbour's lineage hue resembles, the other one
    // still reads. Everyone else keeps their hue and their single pixel.
    if (c.carnivory >= threshold) {
      ctx.fillStyle = mark.rim;
      ctx.fillRect(p.x - mark.rimSize / 2, p.y - mark.rimSize / 2, mark.rimSize, mark.rimSize);
      ctx.fillStyle = mark.core;
      ctx.fillRect(p.x - mark.coreSize / 2, p.y - mark.coreSize / 2, mark.coreSize, mark.coreSize);
    } else {
      ctx.fillStyle = minimapPreyDot(c.hue);
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
  }

  // The inspected creature, so a click in the pond tells you where in the pond.
  // Cased, like the frame below it and for the same reason — see `cased()`.
  const sel = opts.selected;
  if (sel && !sel.dead) {
    const p = worldToMinimap(sel.x, sel.y, layout, config);
    const box = minimapSelection();
    cased(ctx, p.x - box.size / 2, p.y - box.size / 2, box.size, box.size, box);
  }

  // The viewport last, on top of everything, in one or more pieces.
  const frame = minimapViewport();
  for (const r of viewportRects(camera, config)) {
    cased(ctx, r.x * s, r.y * s, r.w * s, r.h * s, frame);
  }

  return layout;
}

/**
 * A two-tone rectangle: the casing stroked one pixel outside the pale line, so
 * the mark holds a light tone and a dark one and no background can swallow both
 * (v1.34's rule, arriving on this surface in v1.73).
 *
 * A *ring* rather than a wider stroke under a narrower one. `render.js` cases
 * its rings by laying the rim down at `width + 1.1`, which leaves half a pixel
 * of dark either side — fine at pond scale, where a pixel is a fraction of a
 * body, and wrong here, where the whole map is 180 pixels across and half a
 * pixel of anything composites to a grey. Two crisp hairlines a pixel apart is
 * the same idea at a scale that can hold it, and it is what the hunter badge
 * and the corpse already do with squares.
 */
function cased(ctx, x, y, w, h, mark) {
  ctx.lineWidth = mark.width;
  ctx.strokeStyle = mark.casing;
  ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  ctx.strokeStyle = mark.line;
  ctx.strokeRect(x, y, w, h);
}

// A filled circle, repeated across whichever seams it overlaps. Biomes are the
// only thing here big enough for the wrap to be visible, and a patch cut in half
// at the edge would misreport where the food is.
function discWrapped(ctx, x, y, r, W, H) {
  for (const dx of [-W, 0, W]) {
    if (x + dx + r < 0 || x + dx - r > W) continue;
    for (const dy of [-H, 0, H]) {
      if (y + dy + r < 0 || y + dy - r > H) continue;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
