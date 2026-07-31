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
