// pondstick.js — the pond comes with you.
//
// Every panel on this page is about the water, and on a phone almost none of
// them can be read while the water is on screen. Measured in a headless
// Chromium at 390 × 844, tour dismissed, default pond: the document is
// **4,977 px** tall, the stage is **239 px** of it and it starts at 556. Any
// water at all is visible only while the scroll offset is between 0 and 556, so
// the stretch of document a reader can have open *with the pond in view* is
// 1,638 px — **32.9% of the page**. The other two thirds are sentences about a
// thing that is no longer there. `🏊 What it is doing` says *Tamsin is heading
// for food* and you cannot look at Tamsin; `👁 What it can see` draws the speck
// she is swimming for and the speck is a screen and a half above.
//
// That is the real shape of the thing this project has written down nine times
// as *the ordering of the column is untouched*, each time with the honest note
// that there was no number to sort on. There is no ordering that fixes it. Any
// order at all puts sixteen panels below the pond, because the pond is one
// panel and there are sixteen; the best a reordering can buy is which two of
// them get to be near the water. The measurement that makes it obvious is not
// *where is each panel* — it is **how much of this page can be read with the
// pond in view**, and the answer is a third.
//
// So the pond stops being a panel you scroll past and becomes the thing you
// read everything else against: `position: sticky` at the top of the one-column
// layout. Nothing moves, nothing is hidden, no order changes, and the share
// goes from 32.9% to the whole of the left column.
//
// ## Why this file exists at all
//
// Because the rule has to be conditional and the condition is arithmetic.
// A pond pinned to the top of the screen is a gift when it is a quarter of the
// screen and a prison when it is three quarters — turn a phone sideways and the
// one-column layout is still on (844 px wide is under the 960 fold) while the
// window is 390 px tall and the pond wants 550 of them. A stylesheet can ask
// *how wide* and *how tall* but it cannot divide one by the other, so the guard
// has to be a media query on the **aspect ratio**, and an aspect ratio is a
// number somebody has to derive. This is where the derivation lives, where a
// test can walk it, rather than as a magic `13/20` in a stylesheet.
//
// Determinism: PURE OBSERVER. Four numbers a browser reports about its own
// window and two constants from `config.js`. No world, no DOM, no random draw.
// A pond read on a phone and a pond read on a desk are bit-for-bit the same
// pond.

import { DEFAULT_CONFIG } from "./config.js";

/**
 * The shape of the water, taken from the world rather than typed.
 *
 * `#world` carries the world's own size as its `width`/`height` attributes and
 * the stylesheet gives it `max-width: 100%; height: auto`, so the browser
 * scales it by its intrinsic ratio — which *is* this ratio. Importing it is the
 * difference between an arithmetic that tracks the pond and a second copy of
 * two numbers that would go quietly wrong the day the world changes shape.
 */
export const POND_ASPECT = DEFAULT_CONFIG.width / DEFAULT_CONFIG.height;

/** The widest the canvas is ever displayed: its own intrinsic width. */
export const POND_NATURAL_WIDTH = DEFAULT_CONFIG.width;

/**
 * What the page costs the pond in width, in pixels: `.layout`'s 22 px of side
 * padding twice over, plus the 1 px border on each side of `.stage`.
 *
 * A number read off the stylesheet, so it is the one thing here that can drift
 * from it. `test/pondstick.test.js` holds it to the measured pair — a stage
 * 239 px tall at a 390 px window, which is what a browser actually reported —
 * so a change to either padding fails the arithmetic rather than the layout.
 */
export const PAGE_GUTTER = 46;

/** The two borders again, this time in the height: the stage is taller than its canvas. */
export const STAGE_BORDERS = 2;

/**
 * The most of the screen the pond may take and still be worth pinning.
 *
 * At 45% a reader keeps more than half the window for the thing they are
 * reading, which is the whole point of the exercise — a pinned pond that leaves
 * a sentence and a half of room has taken the page away to show you the pond
 * you were already looking at. In practice every phone in portrait lands well
 * under it: 390 × 844 is 28.3%.
 */
export const MAX_SHARE = 0.45;

/**
 * The width at which this page folds to one column, and the first half of the
 * guard. Above it the aside is a second column, the left column is four
 * thousand pixels of panels beside a 320 px rail, and the pond is 620 px of a
 * window that is usually 800 — there is nothing to pin it to.
 */
export const STICK_MAX_WIDTH = 960;

/**
 * The second half: the widest window, relative to its own height, that may pin
 * the pond.
 *
 * Derived rather than chosen. The pond is `(vw − gutter) / aspect` tall, so
 * asking for `pondHeight ≤ MAX_SHARE × vh` gives
 *
 *     vw ≤ MAX_SHARE × aspect × vh + gutter
 *
 * and dropping the gutter — which only ever makes the pond smaller — leaves a
 * pure ratio of `MAX_SHARE × aspect` = 0.653. `13/20` is that, rounded down to
 * a fraction a stylesheet can read, so the guard is strictly stricter than the
 * cap it is enforcing. It excludes a 320 × 480 window by four hundredths, and
 * that is the price of a threshold a person can read.
 */
export const STICK_MAX_RATIO = 13 / 20;

/** How wide the browser displays the canvas in a window this wide. */
export function pondWidth(viewportWidth) {
  const available = num(viewportWidth) - PAGE_GUTTER;
  return Math.max(0, Math.min(POND_NATURAL_WIDTH, available));
}

/** How tall the stage stands in a window this wide, borders included. */
export function pondHeight(viewportWidth) {
  const w = pondWidth(viewportWidth);
  return w === 0 ? 0 : w / POND_ASPECT + STAGE_BORDERS;
}

/** What share of the screen the pond takes, as a fraction. */
export function pondShare(viewportWidth, viewportHeight) {
  const vh = Math.max(1, num(viewportHeight));
  return pondHeight(viewportWidth) / vh;
}

/**
 * Whether the pond is pinned in a window this size — the stylesheet's condition,
 * in arithmetic, so a test can sweep it.
 *
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 */
export function sticks(viewportWidth, viewportHeight) {
  const vw = num(viewportWidth);
  const vh = Math.max(1, num(viewportHeight));
  return vw > 0 && vw <= STICK_MAX_WIDTH && vw / vh <= STICK_MAX_RATIO;
}

/**
 * How much of a document can be read with some water on screen, in pixels.
 *
 * The measurement this whole release is about, and it is worth writing down as
 * a function rather than as a sentence in a changelog. A reader has water in
 * view at every scroll offset from `stageTop − viewport` up to the offset at
 * which the last of it leaves the top of the screen, so the stretch of document
 * they can have open is that range plus the screenful they are looking at,
 * clamped to the document — a page cannot be scrolled past its own end.
 *
 * The one thing sticking changes is where the water stops: unpinned it ends at
 * `stageTop + stageHeight`, and pinned it ends wherever its container does,
 * which on this page is the foot of the left column. Pass `stickyUntil` to say
 * so. That is why the pinned answer is *the whole left column* rather than *the
 * whole document* — the aside below it is still a place with no pond in it,
 * and a number that claimed otherwise would be flattering itself.
 *
 * @param {{docHeight: number, viewport: number, stageTop: number, stageHeight: number, stickyUntil?: number}} page
 * @returns {number} pixels of document readable with the pond in view
 */
export function readableWithPond(page) {
  const docHeight = Math.max(0, num(page && page.docHeight));
  const viewport = Math.max(1, num(page && page.viewport));
  const stageTop = Math.max(0, num(page && page.stageTop));
  const stageHeight = Math.max(0, num(page && page.stageHeight));
  const loose = stageTop + stageHeight;
  const until =
    page && Number.isFinite(page.stickyUntil) ? Math.max(loose, page.stickyUntil) : loose;
  const maxY = Math.max(0, docHeight - viewport);
  const lo = Math.max(0, Math.min(maxY, stageTop - viewport + 1));
  const hi = Math.max(lo, Math.min(maxY, until - 1));
  return Math.min(docHeight, hi + viewport) - lo;
}

/** A finite number, or zero — every input here comes from a window rather than from this project. */
function num(v) {
  return Number.isFinite(v) ? v : 0;
}
