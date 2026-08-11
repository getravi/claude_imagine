// scalebar.test.js — the pond's ruler (v1.82).
//
// The module is four small functions and the tests that matter are not about
// any one of them. A ruler makes exactly one promise — *this length on the
// screen is that distance in the world* — and it can break it in three places:
// by choosing a length nobody can read, by drawing it in coordinates that are
// not the ones the reader is looking at, or by appearing where there is nothing
// to state. The third is the cheapest to get wrong and the only one that would
// have been visible in a screenshot, so it is pinned first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  NICE_MANTISSAS,
  TARGET_FRACTION,
  niceLength,
  scaleSpan,
  rulerWidth,
  showsRuler,
} from "../src/scalebar.js";
import { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from "../src/camera.js";
import { makeConfig } from "../src/config.js";

const cfg = makeConfig();

/** Every zoom the wheel and the keyboard can actually land on, plus the ends. */
function zooms() {
  const out = [];
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z *= ZOOM_STEP) out.push(z);
  out.push(MAX_ZOOM, 1.004, 2.5, 6.3);
  return out;
}

/** Is `n` a 1, 2 or 5 times a power of ten? */
function isRound(n) {
  const decade = Math.pow(10, Math.round(Math.log10(n)));
  for (const m of NICE_MANTISSAS) {
    for (const d of [decade / 10, decade, decade * 10]) {
      if (Math.abs(m * d - n) < 1e-9) return true;
    }
  }
  return false;
}

test("a ruler is only on screen once there is a scale to state", () => {
  // The whole-pond view is the one every screenshot in this repository was
  // taken at, and the one where the picture is the world at 1:1. Both reasons
  // point the same way, and the second is the one that would still hold if the
  // screenshots were regenerated tomorrow.
  assert.equal(showsRuler(MIN_ZOOM), false, "the whole pond needs no ruler");
  assert.equal(showsRuler(MAX_ZOOM), true);
  assert.equal(showsRuler(ZOOM_STEP), true, "one wheel click in is a magnified view");
  // The pinch detent (v1.28) snaps anything within 2% back to exactly 1, so a
  // stranded 1.004 never reaches this — but if it ever did, it is a magnified
  // view and the honest answer is yes.
  assert.equal(showsRuler(1.004), true);
});

test("the length is always a number a reader recognises", () => {
  for (const z of zooms()) {
    const span = scaleSpan(z, cfg.width);
    assert.ok(isRound(span.world), `zoom ${z}: ${span.world} px is not a 1-2-5 length`);
    assert.ok(Number.isInteger(span.world), `zoom ${z}: ${span.world} px is not whole`);
    assert.equal(span.label, `${span.world} px`);
  }
});

test("the bar fits the viewport, and is never a stub", () => {
  // Both halves matter. Over the target and the ruler runs off the picture or
  // into the minimap opposite it; far under it and the thing being measured is
  // a line too short to compare anything against. The 1-2-5 ladder's worst
  // rounding is 5 → 2 (a factor of 2.5), so 0.4 of the target is the floor the
  // choice itself guarantees, and asserting it is what would catch a target
  // fraction changed without looking at what the ladder does underneath it.
  for (const z of zooms()) {
    const visible = cfg.width / z;
    const span = scaleSpan(z, cfg.width);
    const frac = span.world / visible;
    assert.ok(frac <= TARGET_FRACTION + 1e-12, `zoom ${z}: bar is ${(frac * 100).toFixed(1)}% of the view`);
    assert.ok(frac >= TARGET_FRACTION * 0.4, `zoom ${z}: bar is only ${(frac * 100).toFixed(1)}% of the view`);
  }
});

test("zooming in never makes the ruler measure more world", () => {
  // A ruler whose number went *up* as the view narrowed would be reporting the
  // rounding rather than the scale. Non-strict, because two neighbouring zooms
  // often land on the same rung of the ladder.
  let prev = Infinity;
  for (const z of zooms().sort((a, b) => a - b)) {
    const { world } = scaleSpan(z, cfg.width);
    assert.ok(world <= prev, `zoom ${z}: ${world} px after ${prev} px`);
    prev = world;
  }
});

test("the bar's drawn length is the world length, magnified", () => {
  for (const z of zooms()) {
    const span = scaleSpan(z, cfg.width);
    assert.equal(span.screen, span.world * z);
  }
});

test("the ruler is measured in the picture, not in the page", () => {
  // The one that matters on a phone (v1.28): the canvas is `max-width: 100%`,
  // so the pond is drawn 900 px wide into a box 346 px across and *every stated
  // distance on the page is wrong there*. The invariant is a ratio and not a
  // length — the bar covers the same share of the displayed canvas that its
  // label covers of the visible world — and it has to hold at every width,
  // including the ones I never open.
  for (const display of [900, 346, 1200, 390, 90]) {
    for (const z of zooms()) {
      const span = scaleSpan(z, cfg.width);
      const px = rulerWidth(span, display, cfg.width);
      const onScreen = px / display;
      const inWorld = span.world / (cfg.width / z);
      assert.ok(
        Math.abs(onScreen - inWorld) < 1e-12,
        `display ${display}, zoom ${z}: bar covers ${onScreen} of the picture for ${inWorld} of the world`
      );
    }
  }
  // At the width the canvas draws at, the conversion is the identity — a page
  // wide enough for the whole pond must not move the bar by a hundredth of a
  // pixel, for the same reason the camera is the exact identity at zoom 1.
  const span = scaleSpan(4, cfg.width);
  assert.equal(rulerWidth(span, cfg.width, cfg.width), span.screen);
  // A canvas that has not been laid out yet reports 0, and a ruler of width 0
  // is a bug that looks like a missing feature. Fall back to the drawing
  // coordinates, which are right on every desktop and wrong only in the
  // direction of "too long" on a phone, for one frame.
  assert.equal(rulerWidth(span, 0, cfg.width), span.screen);
});

test("niceLength lands on the rung below its argument", () => {
  assert.equal(niceLength(1), 1);
  assert.equal(niceLength(1.9), 1);
  assert.equal(niceLength(2), 2);
  assert.equal(niceLength(4.9), 2);
  assert.equal(niceLength(24.75), 20);
  assert.equal(niceLength(99), 50);
  assert.equal(niceLength(100), 100);
  assert.equal(niceLength(252), 200);
  // The floor. A pixel is this world's unit and `MAX_ZOOM` is 8, so nothing
  // reachable asks for less — but a fraction of a pixel would be a claim about
  // a resolution the pond does not have.
  assert.equal(niceLength(0.4), 1);
  assert.equal(niceLength(0), 1);
  assert.equal(niceLength(NaN), 1);
  // `Math.log10` is one of the implementation-approximated functions this
  // project pins a fingerprint for, and an exact power of ten is where it can
  // land a decade low — which would cost the ruler a whole step silently.
  for (const p of [1, 10, 100, 1000, 10000]) assert.equal(niceLength(p), p);
});

test("the ruler is arithmetic: it reads nothing and moves nothing", () => {
  // Directive 2 in its cheapest form. The module imports one constant from the
  // camera and nothing else, so there is no world for it to draw a number
  // against — but the thing that makes that true is the import list, and an
  // import list is exactly what grows without anybody deciding to.
  const src = readFileSync(new URL("../src/scalebar.js", import.meta.url), "utf8");
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports, ["./camera.js"], "the ruler has grown a dependency");
  assert.ok(!/Math\.random|rng|world\./.test(src), "the ruler is reaching for the pond");
});