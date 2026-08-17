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
    return { grazer, carnivore, total: 0, carnivores: 0, peak: 0, min: 0, max: 0, mean: 0, nearest: 0 };
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
  return { grazer, carnivore, total: n, carnivores, peak, min, max, mean, nearest };
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
  // The refuge, over the bars: a body to the right of this line cannot be eaten
  // by anything this world is able to grow. Drawn last, because it is the one
  // mark here that must survive whatever is under it, and in the same ink as
  // the ring `render.js` puts around a body for the same threshold.
  const frac = refugeFrac(config, axis);
  if (frac !== null) {
    const ring = refugeRing();
    // Inset by the line's own width at the far end, so a threshold sitting on
    // the ceiling of the range is a line inside the figure rather than half a
    // line hanging off it.
    const x = Math.min(W - 1, Math.round(frac * W));
    ctx.fillStyle = ring.ring;
    ctx.fillRect(x, 0, 1, H);
  }
}

/**
 * The caption under the figure: the scale that moves, and the summary the
 * figure is a second opinion on.
 *
 * The y axis is the one scale on this page's figures that is stated rather than
 * marked, which is the rule v1.41 wrote for the two strips — *a scale that is
 * stated exactly does not need marks, a scale that moves does* — and the peak
 * is what states it. The mean and its nearest neighbour are here rather than
 * drawn because a second rule on this axis would need a second measured ink to
 * be told from the refuge's, and two numbers side by side make the comparison
 * exactly: `mean 6.2px · nearest body 0.25px` is a pond with a hole where its
 * average is, and nobody has to find the line to see it.
 *
 * @param {SizeProfile} profile
 * @param {object} config
 * @returns {string}
 */
export function sizeCaption(profile, config) {
  if (profile.total === 0) return "No bodies to measure.";
  const parts = [
    `tallest bar ${profile.peak.toLocaleString()}`,
    `mean ${profile.mean.toFixed(1)}px · nearest body ${profile.nearest.toFixed(2)}px`,
  ];
  if (config.predation) parts.push(`refuge ${refugeRadius(config).toFixed(1)}px`);
  return parts.join(" · ");
}
