// archive.js — a bounded record of a *whole* run.
//
// `Stats.popHistory` is a 480-sample ring, and at one sample every four ticks
// that is the last 1,920 ticks. Everything older is dropped. For twenty-one
// versions this has been the entire memory of a world: watch a pond boom to
// three hundred creatures and crash to forty, keep watching for another two
// minutes, and the boom is gone — not compressed, not summarised, gone — and
// the "Export CSV" button hands over the tail of the run as though it were the
// run.
//
// This keeps the rest, in bounded memory, by halving its own resolution each
// time it fills. The record always spans from the first sample to the newest;
// as the run grows it gets *coarser* rather than shorter.
//
// The obvious hazard of throwing away every other sample is that the numbers
// worth having in this world are the extremes — the peak of the boom, the floor
// of the crash — and a decimated line loses exactly those. So a dropped sample
// is not discarded: its values widen the `min`/`max` envelope of the
// representative that absorbs it. The line gets coarser; the envelope stays
// exact, at any capacity, for the entire run. There is a test for precisely
// that, because an archive that can quietly understate a peak is worse than no
// archive at all — it looks like data.
//
// Pure bookkeeping: no randomness, no simulation state touched, nothing read
// back into the world. A world that keeps an archive is bit-for-bit the world
// that doesn't.

export class Archive {
  /**
   * @param {object} [opts]
   * @param {number} [opts.capacity] how many representative samples to retain
   *   (an integer >= 4). `series()` returns at most `capacity + 1` rows.
   * @param {string[]} [opts.fields] numeric sample fields to keep exact min/max
   *   envelopes for. Fields not listed are carried on the representative only.
   */
  constructor({ capacity = 240, fields = [] } = {}) {
    if (!Number.isInteger(capacity) || capacity < 4) {
      throw new RangeError("Archive capacity must be an integer >= 4");
    }
    this.capacity = capacity;
    this.fields = fields.slice();
    /** @type {Array<object>} representatives, oldest first */
    this.rows = [];
    /** The newest sample pushed, whether or not it became a representative. */
    this.latest = null;
    /** How many raw samples have been pushed. */
    this.seen = 0;
    /** One representative per `stride` raw samples; doubles on every halving. */
    this.stride = 1;
  }

  /**
   * Record one sample. Samples must carry a numeric `tick` and must arrive in
   * increasing tick order — the world's own clock, so that holds by
   * construction.
   * @param {{tick:number}} sample
   */
  push(sample) {
    const row = this._row(sample);
    this.latest = sample;
    if (this.seen % this.stride === 0) {
      // A new representative. Representative i covers the raw samples
      // [i·stride, (i+1)·stride), which is what keeps the envelopes aligned
      // with the window they claim to describe after any number of halvings.
      this.rows.push(row);
      if (this.rows.length > this.capacity) this._halve();
    } else {
      this._merge(this.rows[this.rows.length - 1], row);
    }
    this.seen++;
  }

  /**
   * The plottable record: every representative, oldest first, with the newest
   * sample appended when it isn't already the last one. Without that append the
   * right-hand edge of any chart drawn from this would sit up to `stride`
   * samples in the past, which on a long run is a visibly stale "now".
   * @returns {Array<object>}
   */
  series() {
    if (this.latest === null) return [];
    const out = this.rows.slice();
    if (out[out.length - 1].tick !== this.latest.tick) out.push(this._row(this.latest));
    return out;
  }

  /** The tick range the archive covers, or null before anything is recorded. */
  span() {
    if (this.latest === null) return null;
    return { from: this.rows[0].tick, to: this.latest.tick };
  }

  /** Wrap a raw sample as a representative of itself. */
  _row(sample) {
    const row = { ...sample, span: 1, min: {}, max: {} };
    for (const f of this.fields) {
      row.min[f] = sample[f];
      row.max[f] = sample[f];
    }
    return row;
  }

  /** Fold `other` into `into`, keeping `into`'s tick and representative values. */
  _merge(into, other) {
    into.span += other.span;
    for (const f of this.fields) {
      if (other.min[f] < into.min[f]) into.min[f] = other.min[f];
      if (other.max[f] > into.max[f]) into.max[f] = other.max[f];
    }
  }

  /**
   * Halve the resolution: every second representative folds into the one before
   * it, and the stride doubles to match. Index 0 survives every halving, which
   * is what makes "the archive still starts where the run started" true forever.
   */
  _halve() {
    const kept = [];
    for (let i = 0; i < this.rows.length; i += 2) {
      const row = this.rows[i];
      const next = this.rows[i + 1];
      if (next) this._merge(row, next);
      kept.push(row);
    }
    this.rows = kept;
    this.stride *= 2;
  }
}
