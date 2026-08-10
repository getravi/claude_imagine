// seasonlag.test.js — the shift at which a series lines up with the year.
//
// Most of what is worth pinning here is arithmetic, and deliberately so. The
// behavioural claim — that the population of a real pond runs about a fifth of
// a year behind its food supply — is a twelve-seed measurement and it lives in
// `docs/SCIENCE.md`, because a test asserting a trajectory teaches a future
// reader that the *result* is fragile when only the test is (the v1.33 rule).
//
// What is here instead: the closed form against the brute-force search it
// replaces (v1.32 — a shortcut is an assertion of equivalence, and one nothing
// checks is a claim nothing checks); the sign convention, in both directions,
// because "behind" and "ahead" are the whole vocabulary of the readout; that a
// trend is not a season, with the failure pinned as well as the fix (v1.24);
// and that every case where there is no answer returns `null` rather than a
// number nobody chose (v1.42's clamped denominator, which answered a question
// silently instead of deferring it).

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { seasonalFactor } from "../src/environment.js";
import { seasonLag, correlogram, detrend, pearson, readable, MIN_SWING } from "../src/seasonlag.js";
import { STATS_HASHED } from "../src/fingerprint.js";
import { stateFingerprint, trajectoryFingerprint } from "../src/fingerprint.js";

/** A history of `years` years, sampled every 4 ticks, holding `f(tick)`. */
function synthetic(config, years, f, { from = 0, every = 4 } = {}) {
  const rows = [];
  const end = from + years * config.seasonLength;
  for (let t = from; t <= end; t += every) rows.push({ tick: t, pop: f(t) });
  return rows;
}

test("the phase is the shift, in both directions", () => {
  const cfg = makeConfig();
  // Five years of a series that is the season delayed by `shift` ticks. The
  // first is thrown away as warm-up by the default, leaving four to read.
  for (const shift of [-900, -300, 0, 250, 400, 1200]) {
    const rows = synthetic(cfg, 5, (t) => 100 * seasonalFactor(t - shift, cfg));
    const got = seasonLag(rows, "pop", cfg);
    assert.ok(got, `no answer at shift ${shift}`);
    assert.ok(
      Math.abs(got.lag - shift) < 0.5,
      `shift ${shift} came back as ${got.lag.toFixed(2)}`
    );
    // A pure season is entirely the season.
    assert.ok(got.r > 0.999, `r ${got.r} at shift ${shift}`);
  }
});

test("a shift of a whole year is no shift", () => {
  const cfg = makeConfig();
  const P = cfg.seasonLength;
  const a = seasonLag(synthetic(cfg, 5, (t) => seasonalFactor(t - 300, cfg)), "pop", cfg);
  const b = seasonLag(synthetic(cfg, 5, (t) => seasonalFactor(t - 300 - P, cfg)), "pop", cfg);
  assert.ok(Math.abs(a.lag - b.lag) < 1e-6, `${a.lag} vs ${b.lag}`);
  // …and the answer is reported inside one year of zero, never as 2,900.
  const far = seasonLag(synthetic(cfg, 5, (t) => seasonalFactor(t - 1800, cfg)), "pop", cfg);
  assert.ok(far.lag > -P / 2 && far.lag <= P / 2, `${far.lag} is outside the year`);
  assert.ok(Math.abs(far.lag - (1800 - P)) < 0.5, `${far.lag}`);
});

test("the closed form is the peak of the correlogram it replaces", () => {
  const cfg = makeConfig();
  // Something that is *not* a clean sinusoid, so the two have somewhere to
  // disagree: a season plus a slower wobble plus a repeatable jitter.
  let x = 12345;
  const noise = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648 - 0.5;
  };
  const rows = synthetic(
    cfg,
    6,
    (t) => 200 * seasonalFactor(t - 620, cfg) + 30 * Math.sin(t / 900) + 40 * noise()
  );
  const closed = seasonLag(rows, "pop", cfg);
  assert.ok(closed);

  const curve = correlogram(rows, "pop", cfg, { step: 2 });
  let best = curve[0];
  for (const p of curve) if (p.r > best.r) best = p;
  // The grid can only be as right as its own step, so agreeing to within one
  // step is agreement. (The closed form is the finer of the two — it is not
  // quantised at all — which is why it is the one that ships.)
  assert.ok(
    Math.abs(closed.lag - best.lag) <= 2,
    `closed ${closed.lag.toFixed(1)} vs grid ${best.lag}`
  );
  assert.ok(Math.abs(closed.r - best.r) < 0.01, `${closed.r} vs ${best.r}`);
  // And the curve really is a curve: one year of lags, ends included.
  assert.equal(curve[0].lag, -cfg.seasonLength / 2);
  assert.ok(curve.length > 1000);
});

test("a trend is not a season, and would have been read as one", () => {
  const cfg = makeConfig();
  const P = cfg.seasonLength;
  const omega = (2 * Math.PI) / P;

  // A pond that grows steadily and does nothing else. There is no year in this
  // series at all — and the answer is not "a small correlation", it is an
  // amplitude of zero: the fit has a line in it, so a series that is only a
  // line leaves the season's two coefficients at the floating-point floor.
  // Whatever phase that leaves behind, `readable` is where it becomes silence.
  const ramp = synthetic(cfg, 5, (t) => 50 + t / 100);
  const flat = seasonLag(ramp, "pop", cfg);
  assert.ok(flat.swing < 1e-12, `a ramp swung ${flat.swing}`);
  assert.equal(readable(flat), null);
  // The trend removal is exact on a straight line, which is why that works.
  for (const v of detrend(ramp.map((r) => r.pop))) assert.ok(Math.abs(v) < 1e-9, `${v}`);

  // Pin the failure as well as the fix (v1.24). A pond that is *both* growing
  // and seasonal is the real case, and projecting it onto the season without
  // taking the line out first does not merely blur the answer — it moves it,
  // by a quarter of a year, in a way nothing downstream could notice.
  const both = synthetic(cfg, 5, (t) => 100 * seasonalFactor(t - 400, cfg) + 50 + t / 20);
  const fitted = seasonLag(both, "pop", cfg);
  assert.ok(Math.abs(fitted.lag - 400) < 1, `the fit came back at ${fitted.lag.toFixed(1)}`);

  const use = both.filter((r) => r.tick >= P);
  let a = 0;
  let b = 0;
  for (const row of use) {
    a += row.pop * Math.sin(omega * row.tick);
    b += row.pop * Math.cos(omega * row.tick);
  }
  const naive = Math.atan2(-b, a) / omega;
  assert.ok(
    Math.abs(naive - 400) > 200,
    `the undetrended projection was only out by ${(naive - 400).toFixed(0)} ticks`
  );
});

test("no year, no number", () => {
  // Three ways for there to be nothing to be behind, and all three return the
  // absence rather than the phase of whatever noise is lying around.
  const rows = synthetic(makeConfig(), 4, (t) => 100 * Math.sin(t / 700));
  assert.equal(seasonLag(rows, "pop", makeConfig({ seasons: false })), null);
  assert.equal(seasonLag(rows, "pop", makeConfig({ seasonAmplitude: 0 })), null);
  assert.equal(seasonLag(rows, "pop", null), null);
  // The correlogram agrees, so nothing downstream has to special-case one and
  // not the other.
  assert.deepEqual(correlogram(rows, "pop", makeConfig({ seasons: false })), []);
});

test("too little run, and nothing to read, are both absences", () => {
  const cfg = makeConfig();
  const P = cfg.seasonLength;
  // Three years of record, one of which is thrown away as warm-up: not enough.
  assert.equal(seasonLag(synthetic(cfg, 3, (t) => seasonalFactor(t, cfg)), "pop", cfg), null);
  // Four is (three after the warm-up), and three is the span the convergence
  // measurement picked — see docs/SCIENCE.md.
  assert.ok(seasonLag(synthetic(cfg, 4, (t) => seasonalFactor(t, cfg)), "pop", cfg));
  // A flat pond has a span and no phase.
  assert.equal(seasonLag(synthetic(cfg, 5, () => 42), "pop", cfg), null);
  // So does a record with too few samples in it, however long it spans.
  const sparse = [];
  for (let t = 0; t <= 6 * P; t += P / 3) sparse.push({ tick: t, pop: seasonalFactor(t, cfg) });
  assert.ok(sparse.length < 24);
  assert.equal(seasonLag(sparse, "pop", cfg), null);
  // And a column this history does not carry is an absence, not a run of zeros.
  assert.equal(seasonLag(synthetic(cfg, 5, (t) => seasonalFactor(t, cfg)), "nosuch", cfg), null);
});

test("the pond's own archive is enough to read the year from", () => {
  // The panel reads the thinned whole-run record, not the full-resolution
  // series, so the claim that matters on the page is that the two agree. They
  // are different series — one point per 64 ticks against one per 4 — and this
  // is the same shape as every other accelerator here: a claim of equivalence
  // that nothing was checking.
  const cfg = makeConfig({ seed: 314 });
  const w = new World(cfg);
  const full = [];
  for (let t = 0; t < 10600; t++) {
    w.step();
    if (w.tick % 4 === 0) full.push({ tick: w.tick, pop: w.creatures.length });
  }
  const exact = seasonLag(full, "pop", cfg);
  const archived = seasonLag(w.stats.runHistory.series(), "pop", cfg);
  assert.ok(exact && archived);
  assert.ok(
    Math.abs(exact.lag - archived.lag) < 60,
    `exact ${exact.lag.toFixed(0)} vs archived ${archived.lag.toFixed(0)}`
  );
  // The panel's copy is that second one and no other: computed by `Stats` on
  // its throttle, out of the same archive, so what the tile says is what this
  // module returns rather than a second implementation of it.
  assert.ok(w.stats.seasonLag);
  assert.ok(
    Math.abs(w.stats.seasonLag.lag - archived.lag) < 60,
    `${w.stats.seasonLag.lag} vs ${archived.lag}`
  );
  // The pond is behind its year, not ahead of it, and the swing clears the bar
  // the seasonless control could not. Loose bounds on purpose: the numbers are
  // a measurement and belong in the document, but the *sign* is the readout's
  // entire vocabulary and a release that flipped it would be saying the
  // opposite thing.
  assert.ok(archived.lag > 0 && archived.lag < cfg.seasonLength / 2, `${archived.lag}`);
  assert.ok(archived.r > 0.5, `r ${archived.r}`);
  assert.ok(readable(archived), `swing ${archived.swing} under ${MIN_SWING}`);
});

test("a world with no seasons reports no lag, on the panel as well", () => {
  const cfg = makeConfig({ seed: 314, seasons: false });
  const w = new World(cfg);
  for (let t = 0; t < 10600; t++) w.step();
  // Exactly the structural zero v1.20 asks for: there is no year here, so the
  // statistic is not small, it is absent — and it is absent by construction
  // rather than by rounding, because the reference signal is a constant.
  assert.equal(w.stats.seasonLag, null);
  assert.equal(seasonLag(w.stats.runHistory.series(), "pop", cfg), null);
  // What the same pond says when it is *asked* about a year it does not have is
  // the control this release's bar is set from, and it is not a small
  // correlation — seed 51 reaches r = 0.73 — so the thing that has to be small
  // is the swing. It is: this pond's population barely moves with a year it
  // cannot feel, and `readable` is what turns that into silence.
  const asked = seasonLag(w.stats.runHistory.series(), "pop", makeConfig({ seasons: true }));
  assert.ok(asked, "the arithmetic still answers; it is the meaning that is missing");
  assert.equal(readable(asked), null, `swing ${asked.swing} cleared ${MIN_SWING}`);
});

test("reading the year does not move the pond", () => {
  // The module takes rows and returns a number; it cannot touch a world. What
  // this checks is the wiring: `Stats` computes the lag on a throttle, out of
  // the archive, every 128 ticks — and a pond that measures itself is
  // bit-for-bit a pond whose `Stats` never did.
  const a = new World(makeConfig({ seed: 77 }));
  const b = new World(makeConfig({ seed: 77 }));
  b.stats.seasonLagEvery = Number.POSITIVE_INFINITY; // an arm that never asks
  for (let t = 0; t < 10600; t++) {
    a.step();
    b.step();
  }
  assert.equal(stateFingerprint(a), stateFingerprint(b));
  assert.equal(trajectoryFingerprint(a), trajectoryFingerprint(b));
  assert.ok(a.creatures.length > 0, "comparing two extinct ponds proves nothing");
  // …and the arms really were different, which is the half of a null result
  // that is easy to leave unasserted.
  assert.ok(a.stats.seasonLag, "the arm that measures should have an answer");
  assert.equal(b.stats.seasonLag, null, "the arm that does not should not");
});

test("the new field is in the books", () => {
  // The completeness walk in test/books.test.js would catch this too; naming it
  // here says which release put it there and why it is hashable at all — it is
  // a deterministic function of the archive, so two worlds that agree on their
  // history agree on it.
  assert.ok(STATS_HASHED.includes("seasonLag"));
});
