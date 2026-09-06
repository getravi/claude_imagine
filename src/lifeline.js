// lifeline.js — the pond's whole life as one small line, beside the sentence
// that says what it is doing.
//
// v1.149 put the apparatus behind a switch and started every visit on the quiet
// side of it, which was the right call and had one consequence nobody wrote
// down. Count what each side of that switch is made of:
//
//   * **Simple** keeps the headline, the verb under the water, the key, the
//     ladder, the stand-outs, how they have changed, are-they-getting-better,
//     the records and the Chronicle — **seven panels of prose** and one bar.
//   * **Everything** adds the dials and **all five figures**.
//
// So the visitor who is least likely to read seven panels is the one this page
// hands nothing but reading, and the visitor who already knows what a Muller
// plot is gets every picture. That is backwards. A picture is the one thing on
// this page that does not have to be read in a language, and the general
// audience is exactly who it is for.
//
// This is the smallest repair: **one figure that needs no axis, no legend and
// no key**, drawn in the empty half of the headline band so it costs the column
// no height at all, and saying the one thing about a pond that everybody
// already knows how to read — *how many are alive, and how many there used to
// be.*
//
// ## Why the whole run and not a window
//
// A sweep, twelve seeds, sampled at five durations, asking whether the line has
// a shape worth drawing:
//
// | after | peak is a hill, not a ramp | now ÷ peak, median | range |
// | --- | --- | --- | --- |
// | 900 ticks | 6 of 12 | 1.00 | 0.76–1.00 |
// | 1,800 | 6 of 12 | 1.00 | 0.17–1.00 |
// | 3,600 | 7 of 12 | 0.97 | 0.15–1.00 |
// | 7,200 | **11 of 12** | 0.72 | 0.58–1.00 |
// | 12,000 | 9 of 12 | 0.90 | 0.78–1.00 |
//
// Every default pond starts at forty and multiplies — a peak of 121 to 336 by
// tick 7,200 — and by then eleven of twelve are standing below their own
// high-water mark. That is the boom and the bust, and it is the pond's story in
// the plainest form this project has ever managed to put it.
//
// The two ponds that make the case for *whole run* are seeds 23 and 1837465.
// Both fall to **six or seven animals** — as good as gone — and both are back
// at 234 and 349 by tick 12,000. A recent window draws that comeback as a
// climb from nothing, which is what a brand-new pond also looks like. Only the
// whole line says *this pond nearly died and came back*, and there is no
// sentence on this page that can say it either: the headline speaks about now.
//
// ## Two things this figure must not get wrong
//
//  1. **The peak is the point, and `pop` alone cannot carry it.** The record
//     behind the whole run is an `Archive`, and an archive thins. What it keeps
//     exactly under any amount of thinning is the `min`/`max` envelope, which
//     is why `stats.js` paid for one. Reading the peak off the thinned `pop`
//     samples would quietly shave the tallest thing in the picture the older it
//     got. So the band is drawn from the envelope, the caption's peak is read
//     off the same band, and the number and the ink cannot disagree.
//  2. **The caption may not carry a number that is true only right now.** The
//     first draft ended `… · 186 now`, and a browser found it reading *186 now*
//     inside the same bordered box as a headline saying *186 left* — with the
//     two nine apart. The headline holds: `HEADLINE_HOLD` keeps a sentence on
//     screen while the pond goes on moving underneath it, and over eight seeds
//     to tick 7,200 the line on screen was chosen a **median of 180 ticks ago**
//     (p90 340, worst 1,260), by which time the pond has moved a **median of 7
//     animals** — ten or more on **43.5%** of instants, and up to 141. A live
//     count beside a held sentence is not a small rounding difference; it is
//     two present-tense numbers disagreeing on 85% of instants, in one box, for
//     no reason the reader can see.
//
//     So the caption names **the two numbers that do not move**: what the pond
//     started with, and the most it has ever held. Where it stands between them
//     is the picture's job — that is the dot at the right-hand end, and it is
//     why the live count still goes in as the line's final *point*. The words
//     say the scale; the ink says the moment; the sentence beside them says
//     what is happening. Nothing says the same thing twice.
//
//     The spoken description is the exception and it is the principled one: a
//     listener has no dot. Alt text stands in for a picture, where a caption
//     stands beside a sentence, so the spoken form carries the count the ink
//     would otherwise have shown.
//
// PURE OBSERVER. No DOM, no simulation state, **no random numbers** — it reads
// a history record and hands back numbers, words and a drawing. Every colour
// comes from `palette.js` (the population series' own, so this line is the same
// blue as the chart's), which is the rule `test/colourliterals.test.js`
// enforces.

import { chartLines, chartBands } from "./palette.js";

/**
 * How many samples the record needs before there is a shape to draw.
 *
 * Below this the picture is a stub — one or two points of a pond that has not
 * done anything yet — and a figure that says nothing is worse than no figure,
 * because a reader spends a look on it. Four samples is sixteen ticks, which is
 * under a second of watching.
 */
export const MIN_POINTS = 4;

/** Room left over the tallest ink so the peak is a mark and not the edge. */
const HEADROOM = 1.06;

/**
 * How much of the chart's envelope colour the wash under the line keeps.
 *
 * A number rather than a colour, so the wash is *derived* from the figure it is
 * quoting instead of being a second opinion about it — the rule
 * `test/colourliterals.test.js` enforces, applied to a tint. At full strength
 * the band is a solid block of blue beside a sentence and reads as a panel; at
 * half it reads as a hill under a line, which is the shape this figure is for.
 */
const WASH = 0.5;

/**
 * The line to draw and the three numbers that describe it, or `null` when there
 * is not yet a shape.
 *
 * `pop` is the sampled count, `min.pop`/`max.pop` the exact envelope either
 * side of it (see note 1 in the header). A record pushed by hand may carry no
 * envelope, and then the sample is its own bound — the same graceful fallback
 * `stats.js` uses when it writes the CSV.
 *
 * @param {Array<{tick: number, pop: number, min?: object, max?: object}>} hist
 *   the whole-run record, oldest first
 * @param {number} [livePop] the count right now, if the caller has it
 */
export function lifelineSeries(hist, livePop) {
  if (!Array.isArray(hist) || hist.length < MIN_POINTS) return null;
  const points = hist.map((h) => ({
    tick: h.tick,
    pop: h.pop,
    lo: h.min && typeof h.min.pop === "number" ? h.min.pop : h.pop,
    hi: h.max && typeof h.max.pop === "number" ? h.max.pop : h.pop,
  }));
  // The live count as the last point, so the right-hand end of the ink is the
  // number the caption reads out. Its own envelope is itself: one instant has
  // no spread.
  if (Number.isFinite(livePop)) {
    const last = points[points.length - 1];
    points.push({ tick: last.tick, pop: livePop, lo: livePop, hi: livePop });
  }
  let peak = 0;
  let peakAt = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].hi > peak) {
      peak = points[i].hi;
      peakAt = i;
    }
  }
  return {
    points,
    start: points[0].pop,
    peak,
    now: points[points.length - 1].pop,
    // Where along the picture the peak sits, 0 at the left edge and 1 at the
    // right. A fraction rather than an index, because it is only ever used to
    // put the moment into words.
    peakAt: points.length > 1 ? peakAt / (points.length - 1) : 0,
  };
}

/**
 * The caption under the picture: the two ends of its scale, and no jargon.
 *
 * What the pond was handed, and the most it has ever held — see note 2 in the
 * header for why the count *right now* is not among them. The one live state
 * that does get said is an empty pond, because nothing about it is going to
 * change while somebody is reading it.
 *
 * @param {ReturnType<typeof lifelineSeries>} series
 */
export function lifelineCaption(series) {
  if (!series) return "";
  const { start, peak, now } = series;
  const at = `${n(start)} at the start`;
  // A pond that has only ever fallen has no high-water mark to name that the
  // start does not already name.
  const scale = peak > start ? `${at} · ${n(peak)} at its highest` : `${at}, and never more`;
  return now === 0 ? `${scale} · none left` : scale;
}

/**
 * The same figure for somebody who cannot see it: the shape in a sentence.
 *
 * The caption above is already in the page as text, so this does not repeat the
 * numbers for their own sake — it says what the *ink* does, which is the half a
 * sighted reader gets from the picture and a listener otherwise cannot get at
 * all.
 *
 * @param {ReturnType<typeof lifelineSeries>} series
 */
export function lifelineSay(series) {
  if (!series) return "How many are alive: not enough of this run has happened yet to draw.";
  const { start, peak, now, peakAt } = series;
  const head = "How many are alive, across the whole run: ";
  if (now === 0) return `${head}up from ${n(start)} at the start to ${n(peak)}, and then nobody at all.`;
  if (now >= peak) return `${head}up from ${n(start)} at the start to ${n(now)} now, the most there has been.`;
  if (peak <= start) return `${head}down from ${n(start)} at the start to ${n(now)} now.`;
  return `${head}up from ${n(start)} at the start to a peak of ${n(peak)} ${whenWord(peakAt)}, and down to ${n(now)} now.`;
}

/** Where along the line a moment sits, in the three words a picture this small can support. */
export function whenWord(fraction) {
  if (fraction < 1 / 3) return "early on";
  if (fraction < 2 / 3) return "about halfway through";
  return "not long ago";
}

/**
 * Draw it: a filled hill under the line, the sampled line over it, and a dot at
 * the right-hand end that is where the pond stands today.
 *
 * No axis, no grid, no labels. The whole design constraint is that this figure
 * has to be readable at a glance by somebody who has never read a chart on
 * purpose, and every piece of furniture is one more thing between them and the
 * shape. The scale is stated in the caption instead, which is the rule
 * `chart.js` already uses for its food line.
 *
 * **The wash goes down to zero, not down to the envelope's floor**, and that is
 * a choice about what shape a reader is being handed. `chart.js` draws a band
 * between `min` and `max`, because its reader wants to know how much of the
 * line is uncertainty. A count has a floor everybody already knows — none —
 * and an area standing on it reads as *how many*, which is the one question
 * this figure answers. The band's information survives in its ceiling: the
 * hill's skyline is `max`, so the peak the caption names is the highest ink on
 * the picture however hard the record has thinned.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {ReturnType<typeof lifelineSeries>} series
 */
export function drawLifeline(ctx, W, H, series) {
  ctx.clearRect(0, 0, W, H);
  if (!series || series.points.length < 2) return;
  const top = Math.max(1, series.peak * HEADROOM);
  const { points } = series;
  const last = points.length - 1;
  const x = (i) => (i / last) * (W - 1) + 0.5;
  const y = (v) => H - 1 - (Math.max(0, v) / top) * (H - 2);

  ctx.globalAlpha = WASH;
  ctx.beginPath();
  ctx.moveTo(x(0), H);
  for (let i = 0; i <= last; i++) ctx.lineTo(x(i), y(points[i].hi));
  ctx.lineTo(x(last), H);
  ctx.closePath();
  ctx.fillStyle = chartBands().pop;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  for (let i = 0; i <= last; i++) ctx.lineTo(x(i), y(points[i].pop));
  ctx.strokeStyle = chartLines().pop;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x(last), y(points[last].pop), 2.4, 0, Math.PI * 2);
  ctx.fillStyle = chartLines().pop;
  ctx.fill();
}

/** Counts, grouped, the way every other legible surface here writes them. */
const n = (v) => Math.round(v).toLocaleString("en-US");
