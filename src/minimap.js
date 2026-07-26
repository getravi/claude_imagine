// minimap.js — the whole pond in miniature, while the view is somewhere inside it.
//
// v1.17 gave this world a camera, and with it the first way to get lost in a
// place that has no edges: at 8× you can see a fifteenth of the water and
// nothing on screen says *which* fifteenth. The minimap is the missing half of
// that feature — the classic whole-pond view, shrunk into a corner, with a
// bright rectangle marking where the lens is pointed. Click it to go there.
//
// Like the camera, everything here is read-only with respect to the simulation
// and draws no random numbers, so where you happen to be looking still cannot
// change what happens. And like the camera it has an invariant worth naming:
// **at zoom 1 the viewport is the entire world, exactly** — one rectangle,
// flush with the bounds, no seam — which is why the minimap hides itself in the
// default view rather than drawing a frame around everything.

import { wrap } from "./vec.js";

/** Minimap width in CSS pixels. 180 over a 900-wide world is a clean 0.2 scale. */
export const MINIMAP_WIDTH = 180;

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

  ctx.fillStyle = "rgb(7, 12, 19)";
  ctx.fillRect(0, 0, W, H);

  // Biomes, so fertile ground is recognisable at this size even when the crop
  // sitting on it has been eaten.
  if (config.foodPatches && world.environment) {
    ctx.fillStyle = "rgba(32, 82, 70, 0.5)";
    for (const c of world.environment.centres) {
      const p = worldToMinimap(c.x, c.y, layout, config);
      discWrapped(ctx, p.x, p.y, config.patchRadius * s, W, H);
    }
  }

  // Food and creatures are single pixels here, so they are squares rather than
  // discs: at 2px across a fillRect is both crisper and cheaper than an arc.
  ctx.fillStyle = "rgba(80, 205, 140, 0.5)";
  for (const f of world.food.items) {
    const p = worldToMinimap(f.x, f.y, layout, config);
    ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2);
  }

  const threshold = config.carnivoreThreshold;
  for (const c of world.creatures) {
    const p = worldToMinimap(c.x, c.y, layout, config);
    // Predators are the thing worth spotting from across the pond, so they get
    // the warm colour and the extra pixel; everyone else keeps their lineage hue.
    const predator = c.carnivory >= threshold;
    const d = predator ? 3 : 2;
    ctx.fillStyle = predator ? "rgba(255, 122, 82, 0.95)" : `hsla(${c.hue}, 65%, 70%, 0.85)`;
    ctx.fillRect(p.x - d / 2, p.y - d / 2, d, d);
  }

  // The inspected creature, so a click in the pond tells you where in the pond.
  const sel = opts.selected;
  if (sel && !sel.dead) {
    const p = worldToMinimap(sel.x, sel.y, layout, config);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - 2.5, p.y - 2.5, 5, 5);
  }

  // The viewport last, on top of everything, in one or more pieces.
  ctx.strokeStyle = "rgba(226, 238, 255, 0.85)";
  ctx.lineWidth = 1;
  for (const r of viewportRects(camera, config)) {
    ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
  }

  return layout;
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
