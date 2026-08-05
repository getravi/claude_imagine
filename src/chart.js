// chart.js — the population chart, and the y-axis it went forty releases without.
//
// The figure itself is unchanged since v1.0: two lines across a 300×90 canvas,
// population and standing food. What it has never had is a scale. v1.22 gave it
// an x-axis caption and wrote the reason down —
//
//   > A chart whose x-axis silently changes meaning is worse than one with no
//   > axis at all.
//
// — and the y-axis had been doing exactly that the whole time, one axis over,
// unmentioned. The population line is normalised to `stats.maxPopEver`, which
// *grows during the run*: the moment the pond sets a record, every point
// already on screen drops, retroactively, and nothing says so. A line at half
// height means 100 creatures early and 150 later, and the two pictures are
// identical. That is v1.22's own complaint and v1.35's ("a readout that is made
// of live data and technically still changing"), on the surface both of those
// releases were looking straight at.
//
// So this module owns the scale, and the scale is a *round ceiling* rather than
// the peak itself. That is the whole fix, and it does two things: the axis can
// be labelled with numbers a reader can hold, and it now moves in visible steps
// — a run that climbs from 240 to 260 no longer redraws its own history, and
// when the ceiling does go from 300 to 400 the labels say it.
//
// The figure draws two series on two different scales, which is a sin unless it
// is declared: population against this moving ceiling, food against
// `config.foodMax`, a constant. So the marks belong to the population — they
// are drawn in the population line's own colour, which is also the cheapest
// possible way to keep the audit honest, since that tone is already measured —
// and food's fixed range is stated in the legend, in words, once. A scale that
// never moves needs no marks; a scale that moves needs nothing else.
//
// Pure and DOM-free, like `minimap.js`: it takes a context and draws. The
// labels are *not* drawn here — see `axisLabels`.
//
// v1.58 finishes the other axis. v1.22 gave the x a *caption* — "ticks
// 4,000–5,920" — and wrote the rule that this figure has quoted ever since (a
// chart whose x-axis silently changes meaning is worse than one with no axis at
// all), and a caption naming two ends is the thing v1.41 says a *moving* scale
// cannot use. Both of this figure's scales move; only one of them was marked.
// See `chartAxis`, and note that the mark-building `mullerAxis` has used since
// v1.54 lives here now, because two figures wanting round numbers under them is
// one definition of "a number a reader can hold", not two.

import { chartLines, axisRule } from "./palette.js";

/** How many labelled lines the axis aims for. Three is what 90 pixels holds. */
export const AXIS_LINES = 3;

/** The smallest ceiling the axis will use — the same floor the chart has always had. */
export const MIN_TOP = 10;

/**
 * A "nice" step: 1, 2 or 5 times a power of ten, chosen so that roughly
 * `target` of them span `range`. Anything else produces axis labels (30, 60,
 * 90) that a reader has to do arithmetic on.
 *
 * The candidate is the *nearest* of the four in log space rather than the first
 * one at or above the ideal. Rounding up always is what turns a pond of 650
 * into an axis to 1,000 with two labels on it — a third of the figure spent on
 * headroom nothing will ever reach.
 *
 * @param {number} range the value the axis must reach
 * @param {number} target how many steps are wanted
 * @returns {number} the step, always a whole number for a range ≥ 10
 */
export function niceStep(range, target = AXIS_LINES) {
  const raw = Math.max(range, 1) / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  let best = mag;
  for (const m of [1, 2, 5, 10]) {
    if (Math.abs(Math.log(m * mag / raw)) < Math.abs(Math.log(best / raw))) best = m * mag;
  }
  return best;
}

/**
 * The population axis: a round ceiling at or above the run's peak, and the
 * values to label on the way up. Zero is not among them — the baseline is the
 * bottom of the plot and labelling it says nothing.
 *
 * @param {number} peak the largest population this run has reached
 * @returns {{top: number, step: number, ticks: number[]}}
 */
export function popAxis(peak) {
  const reach = Math.max(MIN_TOP, peak);
  const step = niceStep(reach);
  const n = Math.ceil(reach / step);
  const ticks = [];
  for (let i = 1; i <= n; i++) ticks.push(step * i);
  return { top: step * n, step, ticks };
}

/**
 * Where a fraction of the axis lands, in pixels down from the top. The 2-pixel
 * inset at each end is what keeps a line at zero and a line at the ceiling from
 * being clipped in half by the edge of the canvas; it has been in the chart
 * since v1.0 and the grid has to use the same one or the marks would sit beside
 * the data rather than on it.
 */
export function plotY(fraction, H) {
  return H - fraction * (H - 4) - 2;
}

/**
 * The axis labels, as data: what to write and how far down the figure to write
 * it, as a fraction of the figure's height.
 *
 * They are deliberately not painted onto the canvas. The chart's backing store
 * is 300 pixels wide and stretched to whatever the column is — near enough 1:1
 * in the sidebar, and three times that on a phone, where the single-column
 * layout gives the panel the full width. Canvas text would be stretched with
 * it, which is v1.28's lesson (check the work in a viewport I don't use) about
 * to be paid for a second time. Text belongs in the DOM, where it is text.
 *
 * A *fraction* rather than a pixel for the same reason: the caller positions
 * against the element's rendered height, not against the backing store.
 *
 * @param {{top: number, ticks: number[]}} axis
 * @param {number} H the backing height the grid was drawn at
 */
export function axisLabels(axis, H) {
  return axis.ticks.map((value) => ({
    value,
    text: value.toLocaleString(),
    frac: plotY(value / axis.top, H) / H,
  }));
}

// ---- The x-axis ----

/** Roughly how many pixels of figure each labelled tick is worth. */
export const PIXELS_PER_MARK = 160;

/** The most marks an axis will ask for, however wide the figure gets. */
export const MAX_MARKS = 9;

/**
 * A mark within this fraction of an end anchors to that end rather than to its
 * own centre, so the first and last numbers sit inside the figure.
 */
const EDGE = 0.03;

/**
 * Round ticks along a horizontal axis, and where each of them sits.
 *
 * Shared by this figure and the Tree of Life (`mullerAxis`), which is why the
 * one thing it does not know is *where a tick is*: that is `fracOf`, and it is
 * the only part the two plots disagree about. The Muller plot's columns are all
 * the same width in ticks by construction, so its map is a division; this
 * chart's is not (see `tickFrac`), and a shared helper that assumed either one
 * would be silently wrong on the other.
 *
 * @param {number} from the tick the left edge stands for
 * @param {number} to the tick the right edge stands for
 * @param {number} width the figure's rendered width, in pixels
 * @param {(tick:number)=>number} fracOf where a tick sits, 0..1 across the figure
 * @returns {{step:number, marks:Array<{tick:number,frac:number,text:string,anchor:string}>}}
 */
export function axisMarks(from, to, width, fracOf) {
  const span = to - from;
  if (!(span > 0)) return { step: 0, marks: [] };
  const target = Math.max(2, Math.min(MAX_MARKS, Math.round(width / PIXELS_PER_MARK)));
  const step = niceStep(span, target);
  const marks = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    const frac = fracOf(t);
    marks.push({
      tick: t,
      frac,
      text: t.toLocaleString(),
      anchor: frac < EDGE ? "start" : frac > 1 - EDGE ? "end" : "mid",
    });
  }
  return { step, marks };
}

/**
 * Where a tick sits along the figure, as a fraction of its width.
 *
 * The chart plots sample `i` of `n` at `i / (n - 1)` — evenly spaced by
 * *index*, whatever the ticks say — and for the recent window that is the same
 * thing, because `Stats.sample` records one point every four ticks forever. The
 * whole-run scope is where the two part company: `Archive.series()` returns its
 * representatives, evenly spaced at `stride` samples apart, and then appends
 * the newest raw sample so the right-hand edge is *now* rather than up to a
 * stride in the past. That last column is drawn the full width of every other
 * one while standing for as little as a single sample.
 *
 * So the map is piecewise linear, and this walks the array rather than dividing
 * by the span. The error the division makes is bounded by one column — at most
 * 0.83% of the figure, since a halving leaves at least 121 of them — which is
 * small, exactly one-sided (every mark too far right), and would have been
 * invisible to anything except a test that knew to look for it. It is pinned in
 * `test/chart.test.js` as the failure, not only the fix.
 *
 * @param {Array<{tick:number}>} hist the samples the figure is drawn from
 * @param {number} tick
 * @returns {number} 0..1; clamped at both ends
 */
export function tickFrac(hist, tick) {
  const n = hist.length;
  if (n < 2) return 0;
  if (tick <= hist[0].tick) return 0;
  if (tick >= hist[n - 1].tick) return 1;
  // The last sample at or before `tick`. Ticks increase by construction — they
  // are the world's own clock — so a binary search is exact and cheap.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (hist[mid].tick <= tick) lo = mid;
    else hi = mid - 1;
  }
  const a = hist[lo].tick;
  const b = hist[lo + 1].tick;
  const within = b > a ? (tick - a) / (b - a) : 0;
  return (lo + within) / (n - 1);
}

/**
 * The x-axis: which ticks to mark under the figure, and where along it.
 *
 * Three stacked figures share this axis — the chart, the death strip and the
 * power strip all draw from the same history at the same x positions — so one
 * row of numbers under the stack labels all three. The marks go *below* the
 * paint rather than on it, like the Tree of Life's: two of the three figures
 * are filled areas, and a rule through a filled area is v1.34's lottery.
 *
 * `from` and `to` are the ticks the two *edges* stand for, which is not what
 * the caption underneath reports. The caption says what the record holds; in
 * the whole-run scope those agree, and in the recent scope they agree too — but
 * they are different questions (v1.54), and only this one can label a
 * coordinate.
 *
 * @param {Array<{tick:number}>} hist the history the figures are drawn from
 * @param {number} width the figure's rendered width, in pixels
 * @returns {{from:number, to:number, step:number,
 *            marks: Array<{tick:number, frac:number, text:string, anchor:string}>}}
 */
export function chartAxis(hist, width = 0) {
  const n = hist.length;
  const from = n ? hist[0].tick : 0;
  const to = n ? hist[n - 1].tick : 0;
  // One point is not a figure — `drawChart` draws no line — and a window whose
  // ends coincide has no axis to divide.
  if (n < 2 || !(to > from)) return { from, to, step: 0, marks: [] };
  const { step, marks } = axisMarks(from, to, width, (t) => tickFrac(hist, t));
  return { from, to, step, marks };
}

/**
 * The grid: one rule per labelled value, under everything else.
 *
 * A rule is not a mark. It has to be present without being read as data, so its
 * contrast is checked from *both* sides in `test/palette.test.js` — above the
 * just-noticeable difference, below "a different colour at a glance". Every
 * other colour in this project is audited for being loud enough; this is the
 * first one that can fail for being too loud.
 */
function drawGrid(ctx, W, H, axis) {
  const rule = axisRule();
  ctx.strokeStyle = rule.line;
  ctx.lineWidth = 1;
  for (const value of axis.ticks) {
    // Half-pixel offset: a 1-pixel line on an integer coordinate straddles two
    // rows and paints both at half strength, which is how a rule chosen to be
    // faint becomes a rule that is not there at all.
    const y = Math.round(plotY(value / axis.top, H)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

/** One series as a line across the figure. */
function drawSeries(ctx, hist, W, H, valueOf, stroke) {
  ctx.beginPath();
  for (let i = 0; i < hist.length; i++) {
    const x = (i / (hist.length - 1)) * W;
    const y = plotY(valueOf(hist[i]), H);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** The range a thinned point stands for — v1.22's envelope, drawn under its line. */
function drawBand(ctx, hist, W, H, lowOf, highOf, fill) {
  ctx.beginPath();
  for (let i = 0; i < hist.length; i++) {
    const x = (i / (hist.length - 1)) * W;
    if (i === 0) ctx.moveTo(x, plotY(highOf(hist[i]), H));
    else ctx.lineTo(x, plotY(highOf(hist[i]), H));
  }
  for (let i = hist.length - 1; i >= 0; i--) {
    ctx.lineTo((i / (hist.length - 1)) * W, plotY(lowOf(hist[i]), H));
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Draw the whole figure. The grid goes down first, then the whole-run
 * envelopes, then the two lines — so nothing the pond did is ever hidden under
 * a piece of furniture.
 *
 * @param {object} ctx a 2D context
 * @param {number} W backing width
 * @param {number} H backing height
 * @param {Array} hist the history to draw: `{tick, pop, food}`, plus
 *   `{min, max}` in whole-run scope
 * @param {object} opts
 * @param {{top: number, ticks: number[]}} opts.axis the population scale
 * @param {number} opts.foodMax the food scale, which is a constant
 * @param {boolean} [opts.whole] whole-run scope, so the envelopes are drawn
 */
export function drawChart(ctx, W, H, hist, { axis, foodMax, whole = false }) {
  ctx.clearRect(0, 0, W, H);
  drawGrid(ctx, W, H, axis);
  if (hist.length < 2) return;

  const maxFood = Math.max(MIN_TOP, foodMax);
  if (whole) {
    drawBand(ctx, hist, W, H, (h) => h.min.food / maxFood, (h) => h.max.food / maxFood,
      "rgba(90, 200, 140, 0.16)");
    drawBand(ctx, hist, W, H, (h) => h.min.pop / axis.top, (h) => h.max.pop / axis.top,
      "rgba(120, 190, 255, 0.22)");
  }
  const line = chartLines();
  drawSeries(ctx, hist, W, H, (h) => h.food / maxFood, line.food);
  drawSeries(ctx, hist, W, H, (h) => h.pop / axis.top, line.pop);
}
