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

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./phylogeny.js').Phylogeny} phylo
 * @param {{width:number, height:number, highlightId:(number|null), minPeak:number}} opts
 * @returns {Array} the species drawn, in stacking order (for building a legend)
 */
export function drawMuller(ctx, phylo, opts) {
  const { width: W, height: H, highlightId = null, minPeak = 4 } = opts;
  ctx.clearRect(0, 0, W, H);

  const snaps = phylo.snapshots;
  if (snaps.length < 2) return [];

  const shown = phylo.displaySpecies(minPeak); // ordered oldest → newest
  const n = snaps.length;

  // fraction[k][i] = share of species k at snapshot i (of the whole population).
  const K = shown.length;
  const frac = shown.map(() => new Float32Array(n));
  const otherFrac = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const snap = snaps[i];
    const total = Math.max(1, snap.total);
    let shownSum = 0;
    for (let k = 0; k < K; k++) {
      const c = snap.counts.get(shown[k].id) || 0;
      const f = c / total;
      frac[k][i] = f;
      shownSum += f;
    }
    otherFrac[i] = Math.max(0, 1 - shownSum);
  }

  const xAt = (i) => (i / (n - 1)) * W;
  const yAt = (edge) => H - edge * H;

  // Running cumulative bottom for each column, filled as we stack upward.
  const bottom = new Float32Array(n); // starts at 0

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
  band(otherFrac, "rgba(120, 140, 160, 0.16)");

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
