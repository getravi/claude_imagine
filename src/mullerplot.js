// mullerplot.js — draws a "Muller plot": each species' *share* of the pond over
// time as stacked bands, each coloured by its lineage. This is the classic way
// to visualise an evolving population's phylogeny — you can watch lineages
// appear (a new band pinching into existence), sweep to dominance (a band
// widening), and go extinct (a band pinching shut). It reads the snapshots
// recorded by phylogeny.js and, like all rendering here, never touches
// simulation state.
//
// Share, not count: a column is normalised by the pond alive in it, so the
// stack is always exactly full and a band's thickness says what fraction of the
// pond a lineage held, never how many creatures that was. Three prose surfaces
// said "abundance" until v1.54, which is the word for a count; over twelve seeds
// the two move in opposite directions 11.3-19.2% of the time (17.8% on the
// default seed), so a widening band is a sweep and is not news about the
// population's size. That is the chart's job, one figure up.
//
// Bands are stacked in birth order (oldest lineage at the bottom), with a grey
// "other" band on top absorbing the churn of tiny, short-lived species so the
// picture stays legible. True Muller plots nest each child band inside its
// parent; birth-order stacking is a faithful-enough approximation that keeps the
// layout simple and stable.
//
// A snapshot is one column here, but not necessarily one instant: once the
// phylogeny's record fills it halves its own resolution, and a stored snapshot
// then carries the summed counts and summed totals of a window of samples (see
// phylogeny.js#_record). `count / total` is the share of the pond that belonged
// to a species over that window either way, so nothing below needs to know
// which it is — and because every window is the same width, spacing columns
// evenly by index still spaces them evenly in time.
//
// The arithmetic and the drawing are separated (v1.42) for the reason `chart.js`
// was carved out of `main.js` one release earlier: the shares are the claim this
// figure makes — bands that must sum to at most one — and a claim wants a test.
// `mullerShares()` is pure, and it is also what the plot's spoken form is built
// from, so the picture and the sentence cannot drift apart.
//
// Since v1.46 a band also carries a *hatch*, because the colour was never a name
// (see `bandTextures`).

import { niceStep } from "./chart.js";
import {
  lineageBandRgb,
  lineageFill,
  bandHatch,
  HATCH_ALPHA,
  deltaE,
  VISION_MODELS,
  MIN_DELTA_E,
} from "./palette.js";

/**
 * The hatches a band can wear, in the order they are handed out. Each is a set
 * of line families drawn across the band; `plain` is the absence of one, and it
 * is first because a plot of two lineages should not look like graph paper.
 *
 * `css` is the same geometry as a background for the legend chip's dot, so the
 * key and the thing it keys are one definition rather than two — the mistake
 * `lineageFill` exists to undo.
 */
export const BAND_TEXTURES = Object.freeze(
  [
    { id: "plain", lines: [] },
    { id: "rise", lines: ["rise"] },
    { id: "fall", lines: ["fall"] },
    { id: "bars", lines: ["bars"] },
    { id: "rules", lines: ["rules"] },
    { id: "cross", lines: ["rise", "fall"] },
    { id: "grid", lines: ["bars", "rules"] },
  ].map(Object.freeze)
);

/** Which way a family of lines runs, as the angle CSS needs for the same picture. */
const CSS_ANGLE = { rise: 135, fall: 45, bars: 90, rules: 0 };

/** Pixels between neighbouring lines of one family, on the canvas. */
export const HATCH_PITCH = 7;

/**
 * How badly two lineage colours collide: the number of vision models (of four)
 * under which they fail `MIN_DELTA_E`. Two species of the same hue score 4;
 * two a trichromat can separate but a deuteranope cannot score 1–3.
 *
 * Memoised on the rounded hue pair because `mullerShares` runs every frame and
 * this is O(bands²) CIE conversions. The key is the whole of the input, so
 * there is nothing here a stale entry could be about (the v1.23 rule: put a
 * cache beyond reach rather than guarding it).
 */
const collisionCache = new Map();
export function collisionCost(hueA, hueB) {
  const a = Math.round(hueA);
  const b = Math.round(hueB);
  const key = a < b ? a * 400 + b : b * 400 + a;
  let cost = collisionCache.get(key);
  if (cost === undefined) {
    const ra = lineageBandRgb(a);
    const rb = lineageBandRgb(b);
    cost = 0;
    for (const model of VISION_MODELS) if (deltaE(ra, rb, model) < MIN_DELTA_E) cost++;
    collisionCache.set(key, cost);
  }
  return cost;
}

/**
 * Hand every band a hatch, so that two bands a viewer cannot tell apart by
 * colour are told apart by geometry.
 *
 * The problem this solves is not a palette that was chosen badly — it is that a
 * species' hue is its *founder's* hue and hue is inherited, so the plot has
 * always drawn parents and daughters in the same colour. On twelve seeds
 * (6,000 ticks each) every one draws at least one pair at ΔE 0.0 under normal
 * vision; the worst draws six of nineteen bands identically. The legend calls
 * those "species 4", "species 9" and "species 11" and gives them one dot.
 *
 * The assignment is a greedy graph colouring over that collision graph, walked
 * in stacking order (which is stable for a whole run: `displaySpecies` filters
 * on a peak, and a peak never falls, so a band once shown keeps its place
 * forever and its hatch never changes under the reader). Cost is summed per
 * candidate hatch and the cheapest wins, which means a *normal-vision*
 * collision — worth 4 — is always broken before a dichromacy-only one worth 1.
 * Candidates are tried starting at `i % BAND_TEXTURES.length` so that a plot
 * with no collisions at all still cycles through the set rather than
 * alternating between the first two.
 *
 * Seven hatches is not enough to guarantee this in general and the shortfall is
 * stated rather than hidden: the default pond needs six, eight of twelve seeds
 * are fully separated, and seed 88's nineteen bands need eleven. Where it runs
 * out it degrades to the least-bad clash rather than to an arbitrary one.
 *
 * @param {Array<{hue:number}>} shown bands in stacking order
 * @returns {Uint8Array} an index into `BAND_TEXTURES` per band
 */
export function bandTextures(shown) {
  const P = BAND_TEXTURES.length;
  const out = new Uint8Array(shown.length);
  for (let i = 0; i < shown.length; i++) {
    const cost = new Float64Array(P);
    for (let j = 0; j < i; j++) {
      // Neighbours in the stack get a nudge apart even when their colours are
      // fine: two touching bands are the one pair with no edge between them.
      const c = collisionCost(shown[i].hue, shown[j].hue) + (j === i - 1 ? 1 : 0);
      if (c > 0) cost[out[j]] += c;
    }
    let best = i % P;
    for (let k = 1; k < P; k++) {
      const t = (i + k) % P;
      if (cost[t] < cost[best]) best = t;
    }
    out[i] = best;
  }
  return out;
}

/**
 * One band's hatch as a CSS `background-image`, for the legend chip's dot.
 * Three stripes across twelve pixels: enough to read a direction, which is all
 * the chip has to carry.
 *
 * @param {number} texture index into `BAND_TEXTURES`
 * @param {number} hue the lineage's hue, painted underneath
 */
export function textureCss(texture, hue) {
  const t = BAND_TEXTURES[texture] || BAND_TEXTURES[0];
  const h = bandHatch();
  const ink = `rgba(${h.r}, ${h.g}, ${h.b}, ${HATCH_ALPHA})`;
  const layers = t.lines.map(
    (line) => `repeating-linear-gradient(${CSS_ANGLE[line]}deg, ${ink} 0 1px, transparent 1px 4px)`
  );
  layers.push(lineageFill(hue, "dot"));
  return layers.join(", ");
}

/** Roughly how many pixels of figure each labelled tick is worth. */
export const PIXELS_PER_MARK = 160;

/** The most marks the axis will ask for, however wide the figure gets. */
export const MAX_MARKS = 9;

/**
 * A mark within this fraction of an end anchors to that end rather than to its
 * own centre, so the first and last numbers sit inside the figure.
 */
const EDGE = 0.03;

/**
 * The x-axis: which ticks to mark under the plot, and where along it.
 *
 * The figure's whole horizontal dimension is time, it is the widest thing on
 * the page, and for fifty-three versions the only statement of its scale was a
 * caption naming the two ends. v1.41 wrote the rule this closes — *a scale that
 * never moves needs a word; a scale that moves needs marks* — gave the
 * population chart its y-axis, and left the axis that is nothing but a moving
 * scale unmarked one figure over. Reading "that sweep happened around tick
 * 12,000" off the plot meant measuring a fraction by eye across 1,276 pixels
 * and multiplying it by a number in the caption.
 *
 * The marks are *positions*, not painted pixels: `frac` is a fraction of the
 * figure's width, and the caller puts text in the DOM at that fraction. The
 * chart draws its rules onto the canvas because a line chart has a background
 * for furniture to sit on. A stacked-band plot has none — every pixel is data,
 * in a colour the pond chose — so a rule inside it is either invisible or v1.34's
 * lottery (a mark over a background the world picks). The axis goes outside the
 * paint, which is where a published Muller plot puts it too.
 *
 * `to` is the tick the *right-hand edge stands for*, and it is deliberately not
 * `phylo.snapshotSpan().to`. The record's newest raw sample can sit up to one
 * window past the last stored snapshot, and that window is drawn as the single
 * column at `x = W` — so the caption's range (what the record holds) and the
 * axis's range (what a position on the picture means) are two different
 * questions, and only the second one can label a coordinate.
 *
 * The step is `niceStep`, the same round-step machinery the chart's ceiling
 * uses, because "a number a reader can hold" is one definition and not two.
 * Column `i` sits at `i / (n - 1)` of the width and covers ticks
 * `[from + i·res, from + (i+1)·res)`, every window the same width by
 * construction (`phylogeny.js#_record`), so the mapping from tick to fraction
 * is exactly linear — which `test/mullerplot.test.js` pins, because the axis is
 * a lie the moment that stops being true.
 *
 * @param {{snapshots: Array<{tick:number}>}} phylo
 * @param {number} width the figure's rendered width, in pixels
 * @returns {{from:number, to:number, step:number,
 *            marks: Array<{tick:number, frac:number, text:string, anchor:string}>}}
 */
export function mullerAxis(phylo, width = 0) {
  const snaps = phylo.snapshots;
  const n = snaps.length;
  const from = n ? snaps[0].tick : 0;
  const to = n ? snaps[n - 1].tick : 0;
  const span = to - from;
  // One column is not a plot (`drawMuller` draws nothing), and a record whose
  // ends coincide has no axis to divide.
  if (n < 2 || !(span > 0)) return { from, to, step: 0, marks: [] };

  const target = Math.max(2, Math.min(MAX_MARKS, Math.round(width / PIXELS_PER_MARK)));
  const step = niceStep(span, target);
  const marks = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    const frac = (t - from) / span;
    marks.push({
      tick: t,
      frac,
      text: t.toLocaleString(),
      anchor: frac < EDGE ? "start" : frac > 1 - EDGE ? "end" : "mid",
    });
  }
  return { from, to, step, marks };
}

/**
 * The stacked shares the plot draws, as data.
 *
 * `frac[k][i]` is species `k`'s share of the pond in column `i`, `other[i]` is
 * everything too small to earn a named band, and `live[i]` says whether that
 * window had a pond at all. The bands sum to exactly one in a live column and
 * to exactly zero in a dead one.
 *
 * That last case is why this is a function. Until v1.42 the share was taken over
 * `Math.max(1, snap.total)`, so a window in which nothing was alive produced
 * `1 − 0` for the "other" band: an extinction — the most dramatic thing this
 * world can do — drawn as a full-height grey column, which is the picture for a
 * pond thriving on lineages too small to name. The clamp was there to avoid
 * dividing by zero; it answered the arithmetic and lied about the pond.
 * (Reachable with `autoReseed` off, which is how the headless experiments in
 * `SCIENCE.md` run.)
 *
 * @param {import('./phylogeny.js').Phylogeny} phylo
 * @param {number} [minPeak] smallest peak abundance that earns a named band
 * @returns {{shown: object[], frac: Float64Array[], other: Float64Array,
 *            live: Uint8Array, texture: Uint8Array, n: number}}
 */
export function mullerShares(phylo, minPeak = 4) {
  const snaps = phylo.snapshots;
  const n = snaps.length;
  // One column is a line, not a plot: nothing is drawn, and the species list
  // stays empty so a legend built from it says so too.
  const shown = n < 2 ? [] : phylo.displaySpecies(minPeak); // ordered oldest → newest
  const K = shown.length;
  const frac = shown.map(() => new Float64Array(n));
  const other = new Float64Array(n);
  const live = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const snap = snaps[i];
    if (!(snap.total > 0)) continue; // an empty window: no shares, no bands
    let shownSum = 0;
    for (let k = 0; k < K; k++) {
      const f = (snap.counts.get(shown[k].id) || 0) / snap.total;
      frac[k][i] = f;
      shownSum += f;
    }
    other[i] = Math.max(0, 1 - shownSum);
    live[i] = 1;
  }
  // Computed here, with the shares, because the picture and its legend are two
  // surfaces of one key and must be handed the same answer.
  return { shown, frac, other, live, texture: bandTextures(shown), n };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof mullerShares>} shares
 * @param {{width:number, height:number, highlightId:(number|null)}} opts
 * @returns {Array} the species drawn, in stacking order (for building a legend)
 */
export function drawMuller(ctx, shares, opts) {
  const { width: W, height: H, highlightId = null } = opts;
  ctx.clearRect(0, 0, W, H);

  const { shown, frac, other, texture, n } = shares;
  if (n < 2) return [];
  const K = shown.length;

  const xAt = (i) => (i / (n - 1)) * W;
  const yAt = (edge) => H - edge * H;

  const ink = bandHatch();
  const hatchStyle = `rgba(${ink.r}, ${ink.g}, ${ink.b}, ${HATCH_ALPHA})`;

  // Running cumulative bottom for each column, filled as we stack upward.
  const bottom = new Float64Array(n); // starts at 0

  const band = (fracArr, fill, hatch) => {
    ctx.beginPath();
    // Bottom edge left→right.
    ctx.moveTo(xAt(0), yAt(bottom[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(bottom[i]));
    // Top edge right→left.
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(xAt(i), yAt(bottom[i] + fracArr[i]));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    // The hatch rides the band's own path as a clip, so it can be drawn as a
    // few long lines across the whole figure instead of per-column geometry —
    // one path and one stroke per band, whatever the shape of the band.
    if (hatch && hatch.lines.length) {
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      for (const line of hatch.lines) hatchPath(ctx, line, W, H);
      ctx.strokeStyle = hatchStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    // Advance the running bottom.
    for (let i = 0; i < n; i++) bottom[i] += fracArr[i];
  };

  // Draw the "other" band first (at the very bottom), dim grey. It is the churn
  // of lineages too small to name, so it is the one band with nothing to
  // identify and stays plain.
  band(other, "rgba(120, 140, 160, 0.16)", null);

  // Then each shown species, oldest to newest.
  for (let k = 0; k < K; k++) {
    const s = shown[k];
    let fill;
    if (highlightId != null && s.id !== highlightId) {
      fill = lineageFill(s.hue, "dim"); // dim non-highlighted
    } else if (highlightId != null && s.id === highlightId) {
      fill = lineageFill(s.hue, "lit"); // pop the highlighted band
    } else {
      fill = lineageFill(s.hue);
    }
    band(frac[k], fill, BAND_TEXTURES[texture[k]]);
  }

  return shown;
}

/**
 * One family of hatch lines across a `W`×`H` box, appended to the current path.
 * The diagonals are stepped along x by the pitch and run a full box-height, so
 * they cover the box whatever the aspect ratio.
 */
function hatchPath(ctx, line, W, H) {
  if (line === "bars") {
    for (let x = HATCH_PITCH / 2; x < W; x += HATCH_PITCH) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
  } else if (line === "rules") {
    for (let y = HATCH_PITCH / 2; y < H; y += HATCH_PITCH) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
  } else if (line === "rise") {
    for (let x = -H + HATCH_PITCH / 2; x < W; x += HATCH_PITCH) {
      ctx.moveTo(x, H);
      ctx.lineTo(x + H, 0);
    }
  } else {
    for (let x = HATCH_PITCH / 2; x < W + H; x += HATCH_PITCH) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x - H, H);
    }
  }
}
