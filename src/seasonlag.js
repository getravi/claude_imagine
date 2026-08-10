// seasonlag.js — how far behind the year the pond runs.
//
// v1.74 drew the season on the chart and measured what it does with the
// cheapest statistic available: the mean of the winter halves against the mean
// of the summer halves. The standing crop came back 40.4% thinner in winter on
// twelve seeds of twelve, and the population came back lower in winter on seven
// of those twelve — which reads as *the season moves the food and not the
// animals*, and v1.74's own note said so while writing down why it could not:
//
//   > a half-period mean cancels a quarter-period lag **exactly**, and a
//   > consumer tracking a resource that winters is the textbook delayed
//   > response.
//
// That is not a caveat, it is a hole with a shape. Shift a sine by a quarter of
// its period and every half-window holds exactly as much crest as trough, so a
// two-bucket split returns zero for the one delay a consumer is most likely to
// sit at. The instrument that can see it is a cross-correlation over lag, and
// this is it.
//
// What it computes: the pond's clock is `sin(2πt / seasonLength)`, a pure
// function of the world's own tick with no state and no randomness, so there is
// a *reference signal* here that every other correlation in this project would
// envy. Against it, a series is one number — the shift at which it lines up —
// and that number is the answer to "does the season move this, and when?".
//
// Two things follow from the reference being an exact sinusoid rather than
// another measured series. The lag has a closed form: project the series onto
// `sin` and `cos` at the season's own frequency and the phase of the pair *is*
// the shift, with no grid to search and no resolution to argue about. And the
// null is available for nothing — a world with `seasons: false` has no year, so
// the honest answer there is not a small number, it is no number at all, and
// `seasonLag` returns `null` rather than the phase of whatever noise is
// present. (`correlogram()` is the brute-force form, kept because the closed
// form is an assertion of equivalence and v1.32's rule is that an accelerator
// nothing checks is a claim nothing checks. `test/seasonlag.test.js` runs them
// against each other.)
//
// Nothing in the simulation reads anything here. Like `stats.js`, `energy.js`
// and `refuge.js` this is an observer: it draws no randomness, writes nothing
// back, and a world that computes it is bit-for-bit a world that does not.

import { seasonalFactor } from "./environment.js";

const TAU = Math.PI * 2;

/**
 * The least-squares line, removed.
 *
 * Necessary rather than tidy. A run has a shape that is not the year: founders
 * boom, the pond settles, and over 20,000 ticks the crop and the population
 * both drift. A drift correlates with the *half* a sinusoid it happens to lean
 * into, which is how the control arm here reads −15.6% "winter thinning" on a
 * seed with no seasons in it at all (seed 21). Removing a straight line does
 * not remove that entirely — nothing cheap does — but it takes out the part
 * that would otherwise be read as a season.
 *
 * @param {number[]} values
 * @returns {number[]} the same series with its trend subtracted, mean 0
 */
export function detrend(values) {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += values[i];
    sxx += i * i;
    sxy += i * values[i];
  }
  const denom = n * sxx - sx * sx;
  const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const intercept = (sy - slope * sx) / n;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = values[i] - (intercept + slope * i);
  return out;
}

/**
 * Pearson correlation of two equal-length series.
 *
 * Returns exactly 0 when either side has no variance, which is a decision and
 * not a fallback: a flat reference is what a world with no seasons hands over,
 * and the answer to "how well does this track a constant?" is not a
 * correlation, it is nothing. Callers above turn that zero into `null`.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} −1..1
 */
export function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    va += x * x;
    vb += y * y;
  }
  if (!(va > 0) || !(vb > 0)) return 0;
  return num / Math.sqrt(va * vb);
}

/**
 * Pull `{tick, value}` pairs out of history rows, dropping the warm-up.
 *
 * The rows are whatever `Stats` keeps — `popHistory` points or the archive's
 * representatives, which carry the same field names. A row whose field is not
 * a finite number is skipped rather than coerced: the archive's older rows
 * carry every field, but a caller asking for one this project has not always
 * recorded should get a shorter series, not a run of zeros.
 *
 * @param {Array<object>} rows history points, oldest first, each with `tick`
 * @param {string} field which column to read
 * @param {number} warmup ticks at the start of the run to ignore
 * @returns {{ticks: number[], values: number[]}}
 */
function columns(rows, field, warmup) {
  const ticks = [];
  const values = [];
  for (const row of rows) {
    if (!row || !Number.isFinite(row.tick) || row.tick < warmup) continue;
    const v = row[field];
    if (!Number.isFinite(v)) continue;
    ticks.push(row.tick);
    values.push(v);
  }
  return { ticks, values };
}

/** Wrap a lag into (−period/2, +period/2]: a shift of a year is no shift. */
function wrap(lag, period) {
  const half = period / 2;
  let l = lag;
  while (l > half) l -= period;
  while (l <= -half) l += period;
  return l;
}

/**
 * Is there a year here at all, and is there enough run to see one?
 *
 * The thresholds are this release's own measurement rather than taste. Against
 * each seed's 20,000-tick answer, a record spanning two years past the warm-up
 * is out by as much as 256 ticks; three years is out by at most 124 and by a
 * median of 25; four by at most 45 and five by 22. Three is where the curve
 * flattens, and it puts the first reading at about tick 10,500. See
 * `docs/SCIENCE.md`.
 */
const DEFAULTS = {
  /**
   * Ticks at the start of a run to ignore. `null` means one whole year, which
   * is the default because the founder transient is not a season: a pond goes
   * from `populationStart` to its carrying capacity in the first few hundred
   * ticks, and that curve is larger than anything the year does.
   */
  warmup: null,
  /** How many whole years the remaining record must span before answering. */
  minYears: 3,
  /** Fewest samples worth a phase, whatever the span. */
  minSamples: 24,
};

/**
 * How far a series runs behind the year, in ticks.
 *
 * Positive means *behind*: the series reaches its peak `lag` ticks after the
 * food-spawn rate reaches its own. Negative means ahead — the standing crop
 * does this, and it is not a paradox, it is what an integrator does when the
 * thing draining it is late.
 *
 * The estimate is the phase of the season's own frequency, which for a pure
 * sinusoidal reference is the argmax of the correlation and is continuous in
 * the data — no lag grid, no quantisation to the sample spacing. `r` is then
 * the ordinary Pearson correlation *at that lag*, so it is comparable with any
 * other correlation in this project and can be read as "how much of this series
 * is the year".
 *
 * Returns `null` — never a number — when the world has no seasons, when the
 * record is too short, or when the series does not vary. A lag with nothing
 * behind it is the readout this project keeps catching itself drawing (v1.22's
 * always-full buffer, v1.42's clamped denominator): the absence has to be
 * representable.
 *
 * @param {Array<object>} rows history points, oldest first
 * @param {string} field which column ("pop", "food", …)
 * @param {object} config the world's config — `seasons`, `seasonLength`,
 *   `seasonAmplitude`
 * @param {object} [opts] see `DEFAULTS`
 * @returns {{lag:number, r:number, swing:number, years:number, samples:number}|null}
 */
export function seasonLag(rows, field, config, opts = {}) {
  const { warmup, minYears, minSamples } = { ...DEFAULTS, ...opts };
  if (!config || !config.seasons || !(config.seasonAmplitude > 0)) return null;
  const period = config.seasonLength;
  if (!(period > 0)) return null;

  const warm = warmup == null ? period : warmup;
  const { ticks, values } = columns(rows || [], field, warm);
  const n = ticks.length;
  if (n < minSamples) return null;
  const span = ticks[n - 1] - ticks[0];
  if (!(span >= minYears * period)) return null;

  const omega = TAU / period;
  // Fit `value ≈ intercept + slope·i + a·sin(ωt) + b·cos(ωt)` — all four terms
  // at once, which is not the same thing as removing the line and then reading
  // the phase off the remainder. Over a window that is not a whole number of
  // years the season is *correlated with a straight line*, so subtracting the
  // best-fit line takes a bite out of the sinusoid too, and the phase comes
  // back biased: 13 ticks on a synthetic pond built from nothing but a season,
  // which is a systematic error in the one number this module exists to
  // report. Detrending the two basis series as well and solving the 2×2 makes
  // the fit exact for a line plus a sinusoid, which is what the standard result
  // about partialled-out regressors promises and what the tests check.
  const y = detrend(values);
  const s = detrend(ticks.map((t) => Math.sin(omega * t)));
  const c = detrend(ticks.map((t) => Math.cos(omega * t)));
  let sss = 0;
  let scc = 0;
  let ssc = 0;
  let sys = 0;
  let syc = 0;
  for (let i = 0; i < n; i++) {
    sss += s[i] * s[i];
    scc += c[i] * c[i];
    ssc += s[i] * c[i];
    sys += y[i] * s[i];
    syc += y[i] * c[i];
  }
  const det = sss * scc - ssc * ssc;
  if (!(Math.abs(det) > 0)) return null;
  const a = (scc * sys - ssc * syc) / det;
  const b = (sss * syc - ssc * sys) / det;
  const power = Math.hypot(a, b);
  if (!(power > 0)) return null;
  // y ≈ C·sin(ω(t − L)) = C[cos(ωL)·sin(ωt) − sin(ωL)·cos(ωt)], so the pair
  // (a, b) points at angle ωL once b is negated.
  const lag = wrap(Math.atan2(-b, a) / omega, period);

  let mean = 0;
  for (const v of values) mean += v;
  mean /= n;

  // How much of the series the year explains, at that shift. Both sides are
  // detrended, because the fit above is: correlating a detrended series against
  // an undetrended reference charges the season for the trend it was not fitted
  // to, and reads r = 0.994 on a pond made of nothing but a season.
  const ref = detrend(ticks.map((t) => seasonalFactor(t - lag, config)));
  const r = pearson(y, ref);
  if (r === 0) return null;

  return {
    lag,
    r,
    // The fitted sinusoid's amplitude as a share of the series' own mean: how
    // big the swing is, next to how late it is. Two numbers, because a large
    // lag on a series that barely moves is arithmetic.
    swing: mean !== 0 ? power / Math.abs(mean) : 0,
    years: span / period,
    samples: n,
  };
}

/**
 * The bar a reading has to clear before any surface states it as a fact.
 *
 * It is a *swing* and not a correlation, and finding that out is most of what
 * the control arm bought. The obvious gate is `r`, and `r` does not separate
 * the arms: seed 51 with `seasons: false` correlates with a year it does not
 * have at **r = 0.62** over three years, because this pond has oscillations of
 * its own and one of them sits near the season's period. What the seasonless
 * ponds cannot do is *move*: their fitted swing is 0.7%–8.0% of mean population
 * over twelve seeds and every span this instrument will answer at, where a pond
 * with a year in it swings 18.0%–31.1%. So the gate is amplitude, the gap between the two
 * ranges is where the bar goes, and `r` stays on the result as a description
 * rather than a filter. See docs/SCIENCE.md.
 */
export const MIN_SWING = 0.15;

/**
 * The reading, if it says anything; `null` if it does not.
 *
 * One predicate, so the tile, the spoken description and anything after them
 * cannot drift apart about what counts as an answer.
 *
 * @param {{swing:number}|null} result from `seasonLag`
 * @returns {object|null}
 */
export function readable(result) {
  return result && result.swing >= MIN_SWING ? result : null;
}

/**
 * The whole correlation-against-lag curve, by brute force.
 *
 * Not used by anything that ships — `seasonLag` reads the phase directly. This
 * exists so the closed form has something to be checked against, which is
 * v1.32's rule (an index, a cache, a shortcut: each is an assertion of
 * equivalence that nothing in the suite was checking) applied to the shortcut
 * this module is built on. It is also the honest thing to hand anyone who wants
 * to *look* at the curve rather than at its peak.
 *
 * @param {Array<object>} rows history points, oldest first
 * @param {string} field which column
 * @param {object} config the world's config
 * @param {object} [opts] `step` in ticks (default 4, the world's own sampling
 *   interval), plus the `seasonLag` options
 * @returns {Array<{lag:number, r:number}>} one entry per lag, ascending
 */
export function correlogram(rows, field, config, opts = {}) {
  const { warmup, step = 4 } = { ...DEFAULTS, ...opts };
  if (!config || !config.seasons || !(config.seasonAmplitude > 0)) return [];
  const period = config.seasonLength;
  if (!(period > 0) || !(step > 0)) return [];
  const warm = warmup == null ? period : warmup;
  const { ticks, values } = columns(rows || [], field, warm);
  if (ticks.length === 0) return [];
  const y = detrend(values);
  const out = [];
  for (let lag = -period / 2; lag <= period / 2; lag += step) {
    const ref = detrend(ticks.map((t) => seasonalFactor(t - lag, config)));
    out.push({ lag, r: pearson(y, ref) });
  }
  return out;
}
