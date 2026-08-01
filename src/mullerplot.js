// mullerplot.js — draws a "Muller plot": species abundance over time as stacked
// bands, each coloured by its lineage. This is the classic way to visualise an
// evolving population's phylogeny — you can watch lineages appear (a new band
// pinching into existence), sweep to dominance (a band widening), and go extinct
// (a band pinching shut). It reads the snapshots recorded by phylogeny.js and,
// like all rendering here, never touches simulation state.
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
 *            live: Uint8Array, n: number}}
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
  return { shown, frac, other, live, n };
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

  const { shown, frac, other, n } = shares;
  if (n < 2) return [];
  const K = shown.length;

  const xAt = (i) => (i / (n - 1)) * W;
  const yAt = (edge) => H - edge * H;

  // Running cumulative bottom for each column, filled as we stack upward.
  const bottom = new Float64Array(n); // starts at 0

  const band = (fracArr, fill) => {
    ctx.beginPath();
    // Bottom edge left→right.
    ctx.moveTo(xAt(0), yAt(bottom[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xAt(i), yAt(bottom[i]));
    // Top edge right→left.
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(xAt(i), yAt(bottom[i] + fracArr[i]));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    // Advance the running bottom.
    for (let i = 0; i < n; i++) bottom[i] += fracArr[i];
  };

  // Draw the "other" band first (at the very bottom), dim grey.
  band(other, "rgba(120, 140, 160, 0.16)");

  // Then each shown species, oldest to newest.
  for (let k = 0; k < K; k++) {
    const s = shown[k];
    let fill;
    if (highlightId != null && s.id !== highlightId) {
      fill = `hsla(${s.hue}, 25%, 45%, 0.35)`; // dim non-highlighted
    } else if (highlightId != null && s.id === highlightId) {
      fill = `hsla(${s.hue}, 85%, 62%, 0.98)`; // pop the highlighted band
    } else {
      fill = `hsla(${s.hue}, 68%, 55%, 0.9)`;
    }
    band(frac[k], fill);
  }

  return shown;
}
