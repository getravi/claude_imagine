// sizeplot.js — the pond's bodies on an axis.
//
// Every axis on this page is made of one of three things. **Time**: the
// population chart, the death strip, the power strip and the Tree of Life all
// put ticks on their x. **Space**: the pond and the little map, on both of
// theirs. **Descent**: the order the Tree of Life stacks its bands in. v1.101
// counted what that leaves out and wrote it down:
//
//   > no figure on this page has a per-creature quantity on an axis — seed
//   > 128's seventy hunters spread between 37% and nothing are a histogram
//   > nothing draws
//
// This is that figure, on the quantity the most findings here turn on. A body
// radius decides what a creature may eat (`preySizeRatio`), what may eat it
// (`refuge.js`), what moving costs it (`sizeCostFactor`) and what it leaves
// behind when it dies (`corpseEnergyPerRadius`); and the page has reported it
// exactly three ways, all of them one number. A **share above a threshold**
// (`Refuge 🔒`, v1.64), a **maximum** (`Safe 🛟`, v1.89), and a **mean** — the
// third line under the mortality bar (v1.65), which prices every death against
// the mean body radius of the pond that survived it.
//
// A summary is a claim that the thing summarised has a middle. Over the twelve
// seeds v1.101 measured, two of these ponds hold no body within a fifth of a
// pixel of their own mean, because the distribution is not a spread at all —
// it is two or three near-vertical spikes with empty range between them, the
// signature of a pond that is a handful of clonal lineages rather than a
// continuum. See `docs/SCIENCE.md`. None of the three readouts can say that,
// and an axis says it at a glance.
//
// Four decisions, all of which cost a draft:
//
//   1. **The axis is declared, not observed.** It runs `bodyRadiusMin` to
//      `bodyRadiusMax`, the range a genome can express, rather than the range
//      the pond currently occupies. An axis fitted to the data moves every
//      frame, which is v1.41's complaint about the chart's growing normaliser —
//      the same picture would mean a different thing a minute later — and a
//      pond whose bodies span a tenth of a pixel would be drawn as though it
//      spanned everything. The bound is exact rather than conservative:
//      `radius` is `lerp(bodyRadiusMin, bodyRadiusMax, sizeGene)` and every
//      gene is clamped to 0–1, so nothing can be drawn outside this axis and
//      `test/sizeplot.test.js` holds it over a run.
//   2. **The bars are cut by the diet gene, and the word for that is
//      *carnivore*.** v1.101's whole finding is that a carnivore is a gene and
//      a hunter is a carnivore with a meal, and that 53.7% of the first are not
//      the second; a figure that called this half "hunters" would re-tell the
//      error the release before last corrected. What the split is *for* is that
//      predation is a rule about the distance between two points on this axis,
//      so the two colours are what turn a histogram into a picture of an
//      ecology: on seed 128 the crimson spike sits at 4.3 px and the blue one
//      at 7.3, and a 4.3 px body may eat nothing above 3.9.
//   3. **The refuge rule is gated on `config.predation`**, exactly as the two
//      tiles are and for the reason `refuge.js` gives — the arithmetic survives
//      switching hunting off and the *meaning* does not, so a pond where
//      nobody hunts would be shown a line marking nothing.
//   4. **The figure spends no new colour.** The bars are the population line's
//      blue and the death strip's *hunted* crimson; the rule is the pond's own
//      refuge ring (v1.69), so the threshold's two renderings — a circle around
//      a body, a line on an axis — are the same ink. All three were measured
//      against this panel years apart and *against each other* never, because
//      until now no two of them were ever drawn in one figure. They clear:
//      39.8 at worst over the four vision models, against a bar of 25. See
//      `sizePlotTones` in `palette.js`.
//
// v1.112 added the second rule, and the reason it took eight releases is
// written above `sizeCaption` in v1.104's own hand: *a second rule on this axis
// would need a second measured ink to be told from the refuge's*. That is a
// claim about colour, and this project had already refuted it one figure up.
// The power strip draws two lines in **one** colour and tells them apart by
// dashing — "continuity is not a channel any vision model touches, and a
// distinction that never depended on hue cannot be lost to one" (`powerLine()`,
// v1.87). So the mean is a dashed rule in the refuge's own ink: no fourth
// colour, no fourth pair to audit, and a distinction that survives every
// dichromacy by construction rather than by measurement.
//
// Pure observer, like `refuge.js` and `foodweb.js`: it reads a list of
// creatures, it draws no randomness, and nothing in the simulation reads
// anything here.

import { chartLines, mortalityColours, refugeRing } from "./palette.js";
import { axisMarks } from "./chart.js";
import { refugeRadius } from "./refuge.js";

/**
 * How many bars the figure is cut into.
 *
 * A bar count is a resolution, so it was chosen by finding where the answer
 * stops depending on it. Counting the bars that hold at least a twentieth of
 * the pond at 6,000 ticks: seeds 314 and 1 read two at ten and fifteen bars,
 * and three at twenty, thirty, forty-five and sixty. Below twenty the groups
 * merge — at fifteen the default pond's top two spikes become one bar — and
 * above it the count is flat while the *occupied* bars go on splitting, which
 * is the picture getting noisier without getting truer.
 *
 * Thirty is inside that flat stretch and divides the shipped range into bars of
 * 0.15 px, ten backing-store pixels each, so no bar is a rounding decision at
 * the size the figure is drawn.
 */
export const SIZE_BINS = 30;

/**
 * The mean rule's dash, in backing-store pixels — `[on, off]`.
 *
 * Geometry rather than colour, so it lives with the figure's other geometry
 * instead of in `palette.js`, and `main.js` imports it for the legend chip: a
 * key that drew the mean solid would teach the wrong figure. Chosen against the
 * height rather than by eye — this canvas is stretched horizontally to whatever
 * the column is and never vertically, so 46 px is 46 px on every screen, and
 * `[3, 3]` puts eight dashes on the rule. Fewer and a short rule could show one
 * mark; many more and a hairline reads as a solid line again.
 */
export const MEAN_DASH = Object.freeze([3, 3]);

/**
 * The axis this figure is drawn against: the range a genome can express, and
 * round numbers to label along it.
 *
 * The marks come from `chart.js`'s builder rather than from a second copy of
 * the 1–2–5 arithmetic — the third figure to use it, after the chart's own x
 * and the Tree of Life's. Note what the shared field name means here: `tick` is
 * a **radius in pixels**, not a time. The builder is about *round numbers a
 * reader can hold*, which is a claim about numbers and not about clocks.
 *
 * @param {object} config
 * @param {number} [width] the width the figure is displayed at, which is what
 *   decides how many marks fit
 * @returns {{lo:number, hi:number, span:number, binWidth:number, step:number,
 *   marks:Array<{tick:number, frac:number, text:string, anchor:string}>}}
 */
export function sizeAxis(config, width = 0) {
  const lo = config.bodyRadiusMin;
  const hi = config.bodyRadiusMax;
  const span = hi - lo;
  // A swept constant can put the floor above the ceiling (`src/levers.js` moves
  // both, one at a time), and an axis with no span has no marks and no bars —
  // the same guard `chartAxis` puts on a window whose ends coincide.
  if (!(span > 0)) return { lo, hi, span: 0, binWidth: 0, step: 0, marks: [] };
  const { step, marks } = axisMarks(lo, hi, width, (r) => (r - lo) / span);
  return { lo, hi, span, binWidth: span / SIZE_BINS, step, marks };
}

/**
 * Which bar a body falls in.
 *
 * Clamped at both ends, and the clamp is unreachable in a pond that has not had
 * its constants moved under it — see the note on the axis above. It is here
 * because a *swept* config can shrink `bodyRadiusMax` beneath bodies that were
 * born under the old one, and a figure that threw or wrote past its own array
 * in that case would be an instrument that breaks when the thing it measures
 * changes.
 *
 * @param {number} radius
 * @param {{lo:number, span:number}} axis
 * @returns {number} 0 … SIZE_BINS - 1
 */
export function sizeBinOf(radius, axis) {
  if (!(axis.span > 0)) return 0;
  const i = Math.floor(((radius - axis.lo) / axis.span) * SIZE_BINS);
  return i < 0 ? 0 : i >= SIZE_BINS ? SIZE_BINS - 1 : i;
}

/**
 * @typedef {object} SizeProfile
 * @property {Int32Array} grazer bodies per bar carrying no diet gene
 * @property {Int32Array} carnivore bodies per bar carrying it
 * @property {number} total how many bodies are drawn
 * @property {number} carnivores how many of them are carnivores
 * @property {number} peak the tallest bar's count — the y scale, which moves
 * @property {number} min the smallest body alive, in px
 * @property {number} max the largest
 * @property {number} mean the mean body radius, in px
 * @property {number} nearest how far the closest body is from that mean, in px
 * @property {number} meanBin the bar the mean falls in
 * @property {number} meanHeld how many bodies are in that bar
 */

/**
 * The pond's bodies, counted into bars.
 *
 * `nearest` is the figure's claim about its own neighbours: the distance from
 * the mean to the closest living body. On a pond with a middle it is a
 * hundredth of a pixel and says the summary is a real animal; on seed 128 it is
 * 0.251 px, which is nearly two bars of empty axis, and says the mean is a size
 * this world does not contain. It costs one pass and answers the question the
 * three existing readouts raise and cannot settle.
 *
 * `meanHeld` is the same question asked the way a *reader* asks it, and the two
 * are not the same question. `nearest` is a distance on a continuous axis;
 * `meanHeld` is the height of the bar the rule is drawn in, which is what an
 * eye actually reads off the picture. They disagree at a bar edge — a body
 * 0.01 px from the mean and on the other side of a boundary leaves the rule
 * standing in an empty bar — and over 612 pond-instants (twelve seeds, every
 * hundredth tick from 1,000 to 6,000) the bar is empty 18.0% of the time and
 * **40.0% of those have a body inside one bar width of the mean**. So the
 * caption states both, and the mark is never left to make the stronger claim
 * on its own.
 *
 * Every field is defined in every state — there is no early return in this file
 * and nothing downstream has one either, which is v1.98's rule about a readout
 * whose empty case was never written: an empty pond has `total` 0 and a `mean`
 * of 0, and the caption says so in words rather than leaving the last pond's
 * numbers on the screen.
 *
 * @param {Array<{radius:number, carnivory:number}>} creatures
 * @param {object} config
 * @param {{lo:number, span:number}} [axis]
 * @returns {SizeProfile}
 */
export function sizeProfile(creatures, config, axis = sizeAxis(config)) {
  const grazer = new Int32Array(SIZE_BINS);
  const carnivore = new Int32Array(SIZE_BINS);
  const n = creatures.length;
  const threshold = config.carnivoreThreshold;
  let carnivores = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const c = creatures[i];
    const bin = sizeBinOf(c.radius, axis);
    if (c.carnivory >= threshold) {
      carnivore[bin]++;
      carnivores++;
    } else {
      grazer[bin]++;
    }
    sum += c.radius;
    if (c.radius < min) min = c.radius;
    if (c.radius > max) max = c.radius;
  }
  if (n === 0) {
    return {
      grazer, carnivore, total: 0, carnivores: 0, peak: 0,
      min: 0, max: 0, mean: 0, nearest: 0, meanBin: 0, meanHeld: 0,
    };
  }
  let peak = 0;
  for (let i = 0; i < SIZE_BINS; i++) {
    const h = grazer[i] + carnivore[i];
    if (h > peak) peak = h;
  }
  const mean = sum / n;
  let nearest = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(creatures[i].radius - mean);
    if (d < nearest) nearest = d;
  }
  const meanBin = sizeBinOf(mean, axis);
  const meanHeld = grazer[meanBin] + carnivore[meanBin];
  return {
    grazer, carnivore, total: n, carnivores, peak,
    min, max, mean, nearest, meanBin, meanHeld,
  };
}

/**
 * Where the refuge line sits on this axis, 0–1, or `null` when there is no line
 * to draw.
 *
 * Three ways to have none, and they are not the same thing: hunting is off, so
 * the threshold is arithmetic about a rule nobody applies (`refuge.js`); the
 * axis has no span; or the threshold has been swept off the end of the range it
 * is derived from, which `dimensions.js` calls a candidate outside its own
 * lived band.
 *
 * @param {object} config
 * @param {{lo:number, span:number}} axis
 * @returns {number|null}
 */
export function refugeFrac(config, axis) {
  if (!config.predation || !(axis.span > 0)) return null;
  const frac = (refugeRadius(config) - axis.lo) / axis.span;
  return frac >= 0 && frac <= 1 ? frac : null;
}

/**
 * Where the mean sits on this axis, 0–1, or `null` when there is nothing to
 * draw.
 *
 * Two ways to have none, and unlike the refuge's three neither of them is about
 * a rule: an empty pond has no mean, and an axis with no span has nowhere to
 * put one. The range check is the same guard `refugeFrac` carries for the same
 * reason — a *swept* `bodyRadiusMax` can shrink beneath bodies born under the
 * old one, and a mean of bodies that are off the axis is a mark off the figure.
 * There is no `config.predation` gate here: a mean body radius means exactly
 * what it means in a pond where nothing hunts.
 *
 * @param {SizeProfile} profile
 * @param {{lo:number, span:number}} axis
 * @returns {number|null}
 */
export function meanFrac(profile, axis) {
  if (profile.total === 0 || !(axis.span > 0)) return null;
  const frac = (profile.mean - axis.lo) / axis.span;
  return frac >= 0 && frac <= 1 ? frac : null;
}

/**
 * The figure, painted.
 *
 * Bars grow from the baseline, grazers first and carnivores stacked on top, in
 * the reading order the two legend chips are in. One rule about height is worth
 * stating because it is the difference between a histogram and a lie: **a bar
 * holding anybody is at least one pixel tall.** A single creature in a pond of
 * 300 is 0.3% of the tallest bar and rounds to nothing, and the bodies this
 * figure exists to show — the loner at the top of the range, the last carnivore
 * — are exactly the ones that arrive one at a time. The floor is applied per
 * segment, so a bar of 124 grazers and 1 carnivore paints both.
 *
 * Pure and DOM-free, like `chart.js` and `minimap.js`: it takes a context and
 * draws. The numbers under the axis are not painted here — they are DOM text,
 * for the reason `chart.js` gives at `axisLabels` (this backing store is
 * stretched to the width of the column, three times over on a phone).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {SizeProfile} profile
 * @param {{config: object, axis: {lo:number, span:number}}} opts
 */
export function drawSizes(ctx, W, H, profile, { config, axis }) {
  ctx.clearRect(0, 0, W, H);
  const { peak } = profile;
  if (peak > 0) {
    const grazerInk = chartLines().pop;
    const carnivoreInk = mortalityColours().predation;
    for (let i = 0; i < SIZE_BINS; i++) {
      // Rounded edges rather than a rounded width, so consecutive bars share an
      // edge exactly and thirty of them still span W with no seam and no
      // overlap — the same reason `mullerplot.js` walks its columns this way.
      const x0 = Math.round((i * W) / SIZE_BINS);
      const x1 = Math.round(((i + 1) * W) / SIZE_BINS);
      let y = H;
      for (const [count, ink] of [
        [profile.grazer[i], grazerInk],
        [profile.carnivore[i], carnivoreInk],
      ]) {
        if (count === 0) continue;
        const h = Math.max(1, Math.round((count / peak) * (H - 1)));
        ctx.fillStyle = ink;
        ctx.fillRect(x0, y - h, x1 - x0, h);
        y -= h;
      }
    }
  }
  const ring = refugeRing();
  // Inset by the line's own width at the far end, so a rule sitting on the
  // ceiling of the range is a line inside the figure rather than half a line
  // hanging off it. Both rules use it; both can land there.
  const columnOf = (frac) => Math.min(W - 1, Math.round(frac * W));

  // The mean (v1.112), under the refuge and over the bars: the pond's average
  // body, in the picture the average is a summary *of*. Dashed, in the refuge's
  // own ink — see the header — so the two rules are told apart by continuity
  // rather than by a fourth colour.
  //
  // Under the refuge rather than over it because the collision is a real one:
  // this axis is 4.5 px of radius across 300 backing pixels, so the two rules
  // share a column only when the mean is within 0.015 px of
  // `bodyRadiusMax / preySizeRatio` — a state in which the solid line is the
  // honest mark, since both readings are the same number to anything the figure
  // can draw. The caption carries both either way.
  const mean = meanFrac(profile, axis);
  if (mean !== null) {
    const x = columnOf(mean);
    const [on, off] = MEAN_DASH;
    ctx.fillStyle = ring.ring;
    for (let y = 0; y < H; y += on + off) {
      ctx.fillRect(x, y, 1, Math.min(on, H - y));
    }
  }

  // The refuge, over everything: a body to the right of this line cannot be
  // eaten by anything this world is able to grow. Drawn last, because it is the
  // one mark here that must survive whatever is under it, and in the same ink
  // as the ring `render.js` puts around a body for the same threshold.
  const frac = refugeFrac(config, axis);
  if (frac !== null) {
    ctx.fillStyle = ring.ring;
    ctx.fillRect(columnOf(frac), 0, 1, H);
  }
}

/**
 * The caption under the figure: the scale that moves, and the summary the
 * figure is a second opinion on.
 *
 * The y axis is the one scale on this page's figures that is stated rather than
 * marked, which is the rule v1.41 wrote for the two strips — *a scale that is
 * stated exactly does not need marks, a scale that moves does* — and the peak
 * is what states it. The mean and its nearest neighbour are stated here **as
 * well as** drawn since v1.112, and the pair is not redundant: the rule says
 * where the average is and the two numbers say whether it is anybody.
 *
 * The `nobody in its bar` clause is the mark's own reading, written down so it
 * cannot be over-read. It fires when the rule stands in an empty bar, and it
 * sits next to `nearest body`, which is the thing that stops it being a claim
 * about the pond: two of every five empty bars measured have a body inside one
 * bar width of the mean, so the clause on its own would report a hole where
 * there is a boundary. `mean 6.2px · nobody in its bar · nearest body 0.25px` is a
 * pond with a hole where its average is; the same clause beside `0.01px` is a
 * bar edge, and the reader can tell which without being told.
 *
 * @param {SizeProfile} profile
 * @param {object} config
 * @returns {string}
 */
export function sizeCaption(profile, config) {
  if (profile.total === 0) return "No bodies to measure.";
  const held = profile.meanHeld === 0 ? " · nobody in its bar" : "";
  const parts = [
    `tallest bar ${profile.peak.toLocaleString()}`,
    `mean ${profile.mean.toFixed(1)}px${held} · nearest body ${profile.nearest.toFixed(2)}px`,
  ];
  if (config.predation) parts.push(`refuge ${refugeRadius(config).toFixed(1)}px`);
  return parts.join(" · ");
}
