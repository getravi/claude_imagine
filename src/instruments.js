// instruments.js — how big the marks on the water may be, measured in water.
//
// v1.82 wrote the rule down, in `scalebar.js`, in a comment that has been true
// and unapplied ever since:
//
//   > **It is measured in the picture, not in the page.** The canvas is
//   > `max-width: 100%`, so on a phone the pond is drawn 900 px wide into a box
//   > 346 px across, and *every stated distance on this page is wrong there*.
//
// It fixed one line — the ruler's bar, which is scaled by the same factor as
// the pond it measures. Everything else standing on the water is still sized in
// page pixels: the minimap is 180 × 124 whatever it is lying on, the season
// badge is 146 × 30, the zoom badge 140 × 27, the ruler's own *chip* 125 × 25,
// and the toast's type is 13 px. The pond is the one thing on this page that
// shrinks. The furniture on it does not.
//
// ## What that costs, swept
//
// Headless Chromium, `app/`, the default pond, six viewports. The tour is
// dismissed and then `👋 Meet somebody` is pressed — the first control this
// page's own guide points a first-time visitor at, and the one that turns on
// the minimap, the zoom badge and the ruler all at once. Share of the water's
// area covered by the marks standing on it, as a union so that an overlap is
// never counted twice:
//
// | viewport   | water as drawn | idle  | after `👋 Meet somebody` |
// | ---------- | -------------- | ----- | ------------------------ |
// | 390 × 844  | 344 × 237      | 28.6% | **47.8%**                |
// | 414 × 896  | 368 × 254      | 26.5% | 43.7%                    |
// | 768 × 1024 | 722 × 497      |  7.8% | 15.3%                    |
// | 1280 × 800 | 894 × 616      |  5.2% | 10.3%                    |
// | 1440 × 900 | 900 × 620      |  5.2% | 10.0%                    |
// | 1920 × 1080| 900 × 620      |  5.2% | 10.0%                    |
//
// **The same press costs 10% of the water on a desktop and 48% on a phone.**
// Half the pond, gone, on the smallest screen and at the exact moment a
// stranger has done what they were told. The single worst mark is the minimap:
// 22,320 px² of fixed furniture on a 81,528 px² pond — **27.4% of the water on
// its own**, against 4.0% of the same map on a desktop.
//
// Nothing here is a bug in the sense of a wrong number. Every one of those
// sizes is a sensible size, chosen while looking at a 900 px pond. They are
// wrong the way `scalebar.js` said they would be: **a length in page pixels is
// a statement about one page.**
//
// ## The rule
//
// A mark on the water may cost a share of the water, and may not shrink below
// the size at which it stops doing its job:
//
//     scale = clamp( sqrt(budget × waterArea / markArea), floor, 1 )
//
// Three things about that shape are deliberate.
//
//   - **A budget, not a breakpoint.** There is no width in this file and no
//     media query in the stylesheet this feeds. v1.159 learned the same thing
//     about the tour card the expensive way round: a placement rule stated as a
//     compass direction is a rule about one page, and stated as a cost it is a
//     rule about any page. A share of the water is a cost. It answers a 344 px
//     pond, a 722 px one and a phone held sideways with one number and no
//     cases.
//   - **The square root is the whole point.** Area is what a reader loses, and
//     area goes as the square of a scale. Scaling a mark by the pond's *width*
//     — the obvious thing, and what I wrote first — hands a 344 px pond a
//     minimap at 0.382 and a season badge whose type is 4.8 px. The budget asks
//     the question the reader is actually asking (*how much of the pond is
//     hidden?*) and lets the geometry answer it.
//   - **`1` is a ceiling, never a target.** Every mark here is already inside
//     its budget on a desktop — the minimap at 4.0% against 7% — and the clamp
//     leaves those pixels exactly where they have always been. A pond that
//     grows does not grow its furniture; the point of this file is the pond
//     that shrinks.
//
// ## The floors, which are the interesting half
//
// A budget alone would take the minimap to 0.506 on a phone and keep going on
// anything smaller, and a map you cannot read is not cheaper than no map — it
// is a mark that costs water and returns nothing. So each mark states the size
// below which it stops working, and that size is a different kind of fact for
// each of them:
//
//   - **The minimap floors on being a map**, at 96 px across. It is the whole
//     pond drawn 15× down; below about that width the viewport rectangle it
//     exists to show is a few pixels on a side. Its *touch* floor is far lower
//     — 96 px across leaves a shortest side of 66, against a `TARGET_MIN` of
//     24 — so the binding constraint is legibility, and which one binds is
//     worth asserting rather than implying: `test/instruments.test.js` compares
//     the two, so a budget tightened until the target bound instead would say
//     so out loud rather than quietly shipping a map a thumb cannot hit.
//   - **The chips floor on type.** 11 px is the smallest this project sets
//     anywhere, and the chips are supplementary by construction (a season, a
//     magnification, a length) — the pond does not stop being readable when one
//     is small, so the floor can be the type's own floor and nothing else.
//
// The floors bind where you would want them to and nowhere else: at 1280 and up
// every mark is at 1, at 768 every mark is at 1, and only on a phone does
// anything move at all.
//
// ## What it does not fix
//
// **The toast.** `#flash` is 22.8% of the water on a phone at rest and it is
// the largest thing left after this. Its type scales here, which takes roughly
// a quarter of its area off, but the rest is arithmetic no scale can beat: a
// toast is N characters of text, N characters need an area, and on an 81,528
// px² pond three sentences are a fifth of the water however they are set. The
// honest fix is to stop putting them on the water, and that is a layout change
// rather than a size one. Measured, named, and left.
//
// Pure arithmetic: no DOM, no world state, no random numbers. Nothing in here
// is reachable from the simulation at all — it is a rendering decision about a
// page, like `scalebar.js` and `herofit.js`, and like them it cannot move a
// pond by a single bit.

/**
 * The marks that stand on the water, at the size they were drawn for, with the
 * share of the water each may cost and the scale below which it stops working.
 *
 * `base` is the mark's laid-out box on a 900 px pond, in CSS pixels, measured
 * rather than declared — the numbers came off `getBoundingClientRect` in the
 * sweep in this file's header, so padding, borders and the type's own metrics
 * are all in them.
 *
 * The two entries are the two *kinds* of mark, not the five elements: the
 * season badge, the zoom badge and the ruler's chip are one chip in three
 * places, and giving them one scale is what keeps three corners of the pond
 * agreeing with each other about how big a chip is.
 */
export const MARKS = Object.freeze({
  /** The whole pond, drawn small, in the bottom-left corner. */
  map: Object.freeze({ base: { w: 180, h: 124 }, budget: 0.07, floor: 96 / 180 }),
  /**
   * A chip of type on a translucent plate. Sized from the largest of the three
   * — the season badge — so the budget is the worst case rather than an
   * average, and the floor is 11 px type from a 12.5 px base.
   */
  chip: Object.freeze({ base: { w: 146, h: 30 }, budget: 0.03, floor: 11 / 12.5 }),
});

/**
 * The largest scale at which a mark costs no more than its budget, floored.
 *
 * @param {{base:{w:number,h:number}, budget:number, floor:number}} mark
 * @param {number} waterW the pond's laid-out width, in CSS pixels
 * @param {number} waterH the pond's laid-out height, in CSS pixels
 * @returns {number} a scale in (0, 1]
 */
export function markScale(mark, waterW, waterH) {
  // Every degenerate answer is 1, and it is worth being explicit about why: a
  // hidden element measures 0, a pond that has not been laid out yet measures
  // 0, and a mark scaled by the floor because the pond was momentarily nothing
  // is a mark that shrank for a reason no reader can see. Both sides are tested
  // rather than their product, so a negative width cannot cancel a negative
  // height into a plausible area.
  if (!(waterW > 0) || !(waterH > 0)) return 1;
  const water = waterW * waterH;
  if (!Number.isFinite(water)) return 1;
  const fits = Math.sqrt((mark.budget * water) / (mark.base.w * mark.base.h));
  if (!Number.isFinite(fits)) return 1;
  return Math.min(1, Math.max(mark.floor, fits));
}

/**
 * Every mark's scale for one pond, ready to be written onto an element as
 * custom properties.
 *
 * Returned as a plain object keyed the way `MARKS` is, so a mark added there is
 * a mark here without a second list to keep in step.
 *
 * @param {number} waterW the pond's laid-out width, in CSS pixels
 * @param {number} waterH the pond's laid-out height, in CSS pixels
 * @returns {{map:number, chip:number}}
 */
export function markScales(waterW, waterH) {
  const out = {};
  for (const [name, mark] of Object.entries(MARKS)) {
    out[name] = markScale(mark, waterW, waterH);
  }
  return /** @type {{map:number, chip:number}} */ (out);
}

/**
 * The custom properties the stylesheet reads, for one pond.
 *
 * The names are the contract between this file and `style.css`, so they live
 * here rather than being spelled out at the one call site —
 * `test/instruments.test.js` checks that every property this returns is
 * actually used over there, which is the only way a rename gets caught in a
 * project with no build step: a custom property nobody reads is not an error in
 * CSS, it is a declaration that quietly falls back.
 *
 * The map is not here, and that is the reason this returns an object of one:
 * a canvas cannot be sized by a custom property, so its answer leaves through
 * `minimapWidth` as a length instead. A property emitted for it would be a name
 * the stylesheet does not read, which is the exact thing the test forbids.
 *
 * @param {number} waterW
 * @param {number} waterH
 * @returns {Record<string, string>} property name → value, rounded to the
 *   thousandth because a scale is multiplied into type and a full float is
 *   noise in a computed style nobody can diff.
 */
export function markProperties(waterW, waterH) {
  return { "--mark-chip": markScale(MARKS.chip, waterW, waterH).toFixed(3) };
}

/**
 * The minimap's displayed width for one pond, in CSS pixels.
 *
 * A canvas cannot be sized by a custom property the way a chip can — its
 * backing store is an attribute — so this is the one mark whose arithmetic
 * comes back out of the module as a length. Rounded to whole pixels: a canvas
 * displayed at a fractional width is resampled by the browser, and the map's
 * one-pixel dots are exactly what that smears.
 *
 * @param {number} waterW
 * @param {number} waterH
 * @param {number} [base] the map's unscaled width
 */
export function minimapWidth(waterW, waterH, base = MARKS.map.base.w) {
  return Math.round(base * markScale(MARKS.map, waterW, waterH));
}

/**
 * The shortest side the minimap is ever displayed at.
 *
 * Exported because it is the claim in this file's header that is worth a test
 * rather than a sentence: the map floors on *being a map*, and that is only an
 * honest thing to say while the size which follows from it clears the touch
 * floor `targetsize.js` holds this page to. The comparison lives in
 * `test/instruments.test.js` rather than here — `targetsize.js` is a table of
 * measurements the size of a small module, and the app has never imported it.
 */
export const MINIMAP_FLOOR_SIDE = Math.round(MARKS.map.base.h * MARKS.map.floor);
