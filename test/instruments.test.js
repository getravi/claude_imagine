// instruments.test.js — the marks on the water, measured in water (v1.160).
//
// The module is one clamped square root, and the tests that matter are not
// about the arithmetic. A budget can fail in four ways, and all four of them
// are invisible in the one place this project takes its screenshots:
//
//   1. by moving a desktop that was already inside its budget,
//   2. by shrinking a mark past the point where it stops doing its job,
//   3. by shrinking a *target* past the point where a thumb can hit it,
//   4. by writing a property the stylesheet does not read.
//
// The fourth is the one a project with no build step cannot catch any other
// way: a renamed custom property is not an error anywhere: the declaration
// falls back, the page looks like it did before this release, and nothing
// says so. So the last test here reads `style.css`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MARKS,
  MINIMAP_FLOOR_SIDE,
  markProperties,
  markScale,
  markScales,
  minimapWidth,
} from "../src/instruments.js";
import { MINIMAP_WIDTH, minimapLayout } from "../src/minimap.js";
import { TARGET_MIN } from "../src/targetsize.js";
import { makeConfig } from "../src/config.js";

const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

/**
 * The pond as the stylesheet actually lays it out, at the viewports the sweep
 * in `src/instruments.js` walked. Measured in a headless Chromium rather than
 * derived: the canvas is `max-width: 100%` inside a column with its own
 * padding and its own max-width, and the arithmetic that produces 344 from 390
 * is the stylesheet's, not this file's.
 */
const WATERS = Object.freeze([
  { vp: "390x844", w: 344, h: 237 },
  { vp: "414x896", w: 368, h: 254 },
  { vp: "768x1024", w: 722, h: 497 },
  { vp: "1280x800", w: 894, h: 616 },
  { vp: "1440x900", w: 900, h: 620 },
  { vp: "1920x1080", w: 900, h: 620 },
]);

/** The share of a water a mark costs at a given scale. */
function cost(mark, scale, water) {
  return (mark.base.w * scale * (mark.base.h * scale)) / (water.w * water.h);
}

test("a pond at its full width keeps every mark exactly as it was", () => {
  // The point of the whole file is the pond that shrinks. A desktop is already
  // inside its budget — the minimap at 4.0% of the water against 7% — so the
  // clamp has to hand back 1, and every pixel of the app at 1280 and up has to
  // be the pixel it was in v1.159.
  for (const water of WATERS.filter((w) => w.w >= 894)) {
    const s = markScales(water.w, water.h);
    assert.equal(s.map, 1, `${water.vp}: the map should be untouched`);
    assert.equal(s.chip, 1, `${water.vp}: the chips should be untouched`);
    assert.equal(minimapWidth(water.w, water.h), MINIMAP_WIDTH);
  }
});

test("a tablet is inside its budget too, and is left alone", () => {
  // 722 × 497 carries the minimap at 6.2% of the water against a 7% budget.
  // Worth a test of its own rather than a line in the sweep: it is the one
  // width where a rule written as a breakpoint — *phones get small marks* —
  // and a rule written as a cost would visibly disagree.
  const s = markScales(722, 497);
  assert.equal(s.map, 1);
  assert.equal(s.chip, 1);
  assert.ok(cost(MARKS.map, 1, { w: 722, h: 497 }) < MARKS.map.budget);
});

test("a mark is never bigger than it was drawn, at any pond size at all", () => {
  for (let w = 120; w <= 2400; w += 7) {
    const h = Math.round((w * 620) / 900);
    const s = markScales(w, h);
    for (const [name, scale] of Object.entries(s)) {
      assert.ok(scale <= 1, `${name} at ${w}px: ${scale} > 1`);
      assert.ok(scale >= MARKS[name].floor - 1e-12, `${name} at ${w}px: below its floor`);
    }
  }
});

test("a bigger pond never gets a smaller mark", () => {
  // Monotonic, which is what makes a resize look like a resize rather than a
  // redesign. A dragged window walks this curve continuously.
  let prev = markScales(100, 69);
  for (let w = 107; w <= 1400; w += 3) {
    const s = markScales(w, Math.round((w * 620) / 900));
    for (const name of Object.keys(MARKS)) {
      assert.ok(s[name] >= prev[name] - 1e-12, `${name} shrank as the pond grew, at ${w}px`);
    }
    prev = s;
  }
});

test("the budget is honoured wherever the floor is not the binding constraint", () => {
  for (let w = 120; w <= 2400; w += 11) {
    const h = Math.round((w * 620) / 900);
    for (const [name, mark] of Object.entries(MARKS)) {
      const scale = markScale(mark, w, h);
      if (scale > mark.floor + 1e-9 && scale < 1) {
        // Between the floor and the ceiling the scale is the budget, exactly.
        assert.ok(
          Math.abs(cost(mark, scale, { w, h }) - mark.budget) < 1e-9,
          `${name} at ${w}px should cost exactly its budget`,
        );
      }
    }
  }
});

test("the phone this was written for gets its water back", () => {
  // The measured numbers from the sweep in `src/instruments.js`: on a 390 × 844
  // phone the minimap alone was 27.4% of the water, and the union of every mark
  // after pressing `👋 Meet somebody` was 47.8%.
  const water = WATERS[0];
  const before = cost(MARKS.map, 1, water);
  assert.ok(before > 0.27, `the map was ${(before * 100).toFixed(1)}% of this water`);
  const after = cost(MARKS.map, markScale(MARKS.map, water.w, water.h), water);
  assert.ok(after < 0.08, `the map should now be under 8%, got ${(after * 100).toFixed(1)}%`);
  // The chips are floored on type here rather than on their budget, and that is
  // the honest outcome: 11 px is as small as this project sets type anywhere.
  assert.equal(markScales(water.w, water.h).chip, MARKS.chip.floor);
});

test("the map floors on being a map, and that floor clears a thumb", () => {
  // The claim in the module's header. The map's binding constraint is
  // legibility rather than reach — a whole pond drawn small enough stops
  // showing the viewport rectangle it exists to show — and it is only honest to
  // say so while the size that follows also clears the touch floor this page
  // holds itself to. If a budget were ever tightened enough for the target to
  // bind instead, this is where it would say so.
  assert.ok(
    MINIMAP_FLOOR_SIDE >= TARGET_MIN,
    `the map's shortest side is ${MINIMAP_FLOOR_SIDE}px, under TARGET_MIN ${TARGET_MIN}`,
  );
  for (let w = 60; w <= 2400; w += 13) {
    const px = minimapWidth(w, Math.round((w * 620) / 900));
    assert.ok(px >= Math.round(MINIMAP_WIDTH * MARKS.map.floor), `too narrow at ${w}px`);
    assert.ok(px <= MINIMAP_WIDTH, `wider than it was drawn at ${w}px`);
    assert.ok(Number.isInteger(px), "a canvas displayed at a fraction of a pixel is resampled");
  }
});

test("the map keeps the pond's shape at every width it is allowed", () => {
  // `minimapLayout` has taken a width since it was written and nothing has ever
  // passed one. The aspect ratio is the promise a map of a torus makes.
  const cfg = makeConfig();
  for (const water of WATERS) {
    const layout = minimapLayout(cfg, minimapWidth(water.w, water.h));
    assert.ok(
      Math.abs(layout.width / layout.height - cfg.width / cfg.height) < 1e-9,
      `${water.vp}: the map stopped being the shape of the pond`,
    );
  }
});

test("a pond of no size leaves the marks alone rather than erasing them", () => {
  // `clientWidth` is 0 on a hidden element, and a mark scaled by 0 is a mark
  // that has silently gone. Every degenerate answer here is 1, which is the
  // size the marks have always been.
  for (const [w, h] of [[0, 0], [0, 620], [900, 0], [NaN, NaN], [-10, -10], [Infinity, Infinity]]) {
    const s = markScales(w, h);
    assert.equal(s.map, 1, `map at ${w}x${h}`);
    assert.equal(s.chip, 1, `chip at ${w}x${h}`);
  }
});

test("every property this module writes is one the stylesheet reads", () => {
  // The rename catcher. A custom property nobody reads is not an error in CSS:
  // the declaration simply falls back and the page looks exactly like the one
  // this release was written to change.
  const props = Object.keys(markProperties(344, 237));
  assert.ok(props.length > 0);
  for (const prop of props) {
    assert.ok(
      css.includes(`var(${prop}, 1)`),
      `${prop} is written by instruments.js and read by nothing in style.css`,
    );
    // And declared with a fallback on the stage, so a page whose script never
    // arrives still draws the marks at the size they were drawn.
    assert.ok(
      new RegExp(`${prop}:\\s*1;`).test(css),
      `${prop} should have a resting value of 1 on .stage`,
    );
  }
});

test("the three chips on the water read the same scale", () => {
  // One chip in three corners. They are sized from one property so that a
  // season badge, a zoom badge and a ruler can never disagree about how big a
  // chip is on the same pond.
  for (const sel of [".season-badge", ".zoom-badge", ".scale-bar", ".flash"]) {
    const start = css.indexOf(`\n${sel} {`);
    assert.ok(start > 0, `${sel} should still have a rule`);
    const block = css.slice(start, css.indexOf("\n}", start));
    assert.ok(
      /font-size:\s*calc\([\d.]+px \* var\(--mark-chip, 1\)\)/.test(block),
      `${sel} should take its size from the chip scale`,
    );
  }
});

test("a budget may shrink type; it may not shrink a target", () => {
  // The toast's button is the one thing inside a mark on the water a finger has
  // to hit, and its floor is `TARGET_MIN` in literal pixels — not an `em`, which
  // would ride the chip scale down with the type around it.
  const start = css.indexOf(".flash .flash-go {");
  const block = css.slice(start, css.indexOf("\n}", start));
  assert.ok(
    new RegExp(`min-height:\\s*${TARGET_MIN}px`).test(block),
    "the toast's button should keep an unscaled minimum height",
  );
});
