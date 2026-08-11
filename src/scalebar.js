// scalebar.js — how long a ruler over the pond should be, and what it says.
//
// v1.58 finished marking every moving scale on a figure, and the sentence it
// finished with named what it excluded: the two normalised strips, which state
// their peak in a caption instead, and **the pond canvas, which has no scale at
// all**. It did not need one for sixteen releases. Until v1.17 the pond was
// drawn at exactly one magnification, so its scale was a constant, and v1.41's
// rule is that a scale which never moves needs a word rather than marks — the
// word being the `900 × 630` in `config.js` that every distance in
// `docs/SCIENCE.md` is quoted in.
//
// The camera made it a quantity that moves. At 8× the viewport is a fourteenth
// of the world and nothing on screen says so, which means every number this
// project publishes about a distance — a bite's 18 px, sight's 168, the
// refuge's 7.273 — is unreadable in the one picture where those distances are
// actually visible. This module is the arithmetic of the ruler that fixes it:
// pick a round world distance that fits the viewport, and say how long it is.
//
// Three decisions worth writing down.
//
//   - **It is furniture, not an instrument, so it has no toggle** and it is on
//     screen under a condition rather than a checkbox: `zoom > 1`, the same
//     rule that governs the minimap and for the same reason. At the whole-pond
//     view the picture *is* the world at 1:1 and a ruler would be measuring the
//     thing it is drawn on. It also means every screenshot in this repository
//     is still a picture of what the app draws, because all of them are taken
//     at zoom 1 — and screenshots here are captured by hand, so a change that
//     invalidates one costs a cycle I cannot pay this week.
//   - **The length is chosen from the 1–2–5 ladder**, like every map ruler
//     anybody has ever read, and it is the largest such length that fits inside
//     `TARGET_FRACTION` of the viewport. That the bar's *drawn* length therefore
//     jumps around between a fifth and a twelfth of the picture is the point:
//     the number is round and the geometry absorbs it, which is the way round
//     that leaves nothing for the reader to do.
//   - **It is measured in the picture, not in the page.** The canvas is
//     `max-width: 100%`, so on a phone the pond is drawn 900 px wide into a box
//     346 px across (v1.28) and *every stated distance on this page is wrong
//     there* — including the one in `config.js`. A ruler is the one form of
//     scale that survives it, because it is scaled by the same factor as the
//     thing it measures. `rulerWidth` is that conversion, and the invariant it
//     owes the reader is a ratio, not a length: the bar covers the same share
//     of the pond as its label covers of the visible world, at any display
//     width whatsoever.
//
// Pure arithmetic. It touches no world state, draws no random numbers, and is
// not reachable at all from a default view.

import { MIN_ZOOM } from "./camera.js";

/** The mantissas a ruler is allowed to be. The ladder every map uses. */
export const NICE_MANTISSAS = Object.freeze([1, 2, 5]);

/**
 * How much of the viewport the bar may fill. Small enough that the label beside
 * it, the minimap opposite it and the pond under both still have room on a
 * phone; large enough that a fifth of it — the worst the 1–2–5 ladder can round
 * a length down to — is still a bar and not a tick.
 */
export const TARGET_FRACTION = 0.22;

/**
 * The largest 1, 2 or 5 × 10^k that is no longer than `max`.
 *
 * Floors at 1 rather than descending into fractions: this world's unit is a
 * pixel, `MAX_ZOOM` is 8, and a viewport is never so small that a whole pixel
 * fails to fit inside a fifth of it. A ruler reading "0.5 px" would be a claim
 * about a resolution the pond does not have.
 *
 * @param {number} max longest acceptable length, in world pixels
 * @returns {number} a round length, always ≥ 1
 */
export function niceLength(max) {
  if (!Number.isFinite(max) || max < 1) return 1;
  const decade = Math.pow(10, Math.floor(Math.log10(max)));
  let best = 1;
  for (const m of NICE_MANTISSAS) {
    const step = m * decade;
    if (step <= max) best = step;
  }
  // `Math.log10` can land a decade low on an exact power of ten, which would
  // cost the ruler a whole step for no reason a reader could see.
  if (decade * 10 <= max) best = decade * 10;
  return best;
}

/**
 * The ruler for one view: a round world distance, and how long it is drawn.
 *
 * @param {number} zoom the camera's magnification
 * @param {number} viewWidth the world's width in pixels (the viewport at zoom 1)
 * @param {number} [targetFraction] share of the viewport the bar may fill
 * @returns {{world: number, screen: number, label: string}} the length in world
 *   pixels, its length in the canvas's own coordinates, and what to write
 */
export function scaleSpan(zoom, viewWidth, targetFraction = TARGET_FRACTION) {
  const visible = viewWidth / zoom; // world pixels across the viewport
  const world = niceLength(visible * targetFraction);
  return { world, screen: world * zoom, label: `${world} px` };
}

/**
 * The bar's length in CSS pixels, on a canvas the page has scaled.
 *
 * `screen` is in the canvas's *drawing* coordinates. The stylesheet is free to
 * display that canvas at any width it likes, and on anything narrower than the
 * pond it does — so the bar has to be converted through the same factor the
 * picture went through, or it is a ruler for a pond nobody is looking at.
 *
 * @param {{screen: number}} span from `scaleSpan`
 * @param {number} displayWidth the canvas's laid-out width, in CSS pixels
 * @param {number} viewWidth the world's width in pixels
 */
export function rulerWidth(span, displayWidth, viewWidth) {
  if (!(displayWidth > 0)) return span.screen;
  return span.screen * (displayWidth / viewWidth);
}

/**
 * Is there a scale to state? Only once the view stops being the whole pond.
 *
 * This asks about the *magnification* and not about the camera, which is what
 * separates it from the minimap's condition (`!camera.isDefault()`): panning
 * changes which fifteenth of the world you are looking at and changes nothing
 * whatsoever about how big a pixel is.
 */
export function showsRuler(zoom) {
  return zoom > MIN_ZOOM;
}
