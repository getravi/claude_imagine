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
import {
  seasonLag,
  correlogram,
  detrend,
  pearson,
  readable,
  seriesKind,
  CLOCKS,
  MIN_SWING,
  SERIES,
  NOT_A_SERIES,
} from "../src/seasonlag.js";
import { DEATH_CAUSES } from "../src/stats.js";
import { EnergyLedger, UNATTRIBUTED } from "../src/energy.js";
import { STATS_HASHED } from "../src/fingerprint.js";
import { stateFingerprint, trajectoryFingerprint } from "../src/fingerprint.js";

/** A history of `years` years, sampled every 4 ticks, holding `f(tick)`. */
function synthetic(config, years, f, { from = 0, every = 4 } = {}) {
  const rows = [];
  const end = from + years * config.seasonLength;
  for (let t = from; t <= end; t += every) rows.push({ tick: t, pop: f(t) });
  return rows;
}

/**
 * A running total whose *rate* is `rate·(1 + amp·sin(ω(t − shift)))`.
 *
 * Written from the closed-form integral rather than by summing, so the
 * difference between any two samples is exactly the mean rate over the ticks
 * between them — which is what the instrument claims to recover, and what a
 * real counter in this project genuinely is.
 */
function counter(config, years, { shift = 0, rate = 100, amp = 0.5, every = 4 } = {}) {
  const P = config.seasonLength;
  const omega = (2 * Math.PI) / P;
  const total = (t) =>
    rate * (t + (amp / omega) * (Math.cos(omega * -shift) - Math.cos(omega * (t - shift))));
  const rows = [];
  for (let t = 0; t <= years * P; t += every) rows.push({ tick: t, births: total(t) });
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

test("every column of a history point is classified, and every classification is a column", () => {
  // The table in `seasonlag.js` is hand-typed — it has to be, because `stats.js`
  // imports this module — so the thing that keeps it true is this, derived from
  // the code in both directions. A column added to a history point and left
  // unclassified fails here; a name in the table that nothing writes fails too.
  const cfg = makeConfig({ seed: 314 });
  const w = new World(cfg);
  for (let t = 0; t < 3000; t++) w.step();
  const carried = new Set();
  for (const row of w.stats.runHistory.series()) for (const k in row) carried.add(k);
  assert.ok(carried.size > 20, `only ${carried.size} columns — did the run do anything?`);

  // The buried-energy columns exist only once a burial with that cause has
  // happened, and old age is slow. Build them the way the ledger does, out of
  // the two lists that decide the names, rather than running the pond until it
  // gets around to each one.
  const ledger = new EnergyLedger();
  for (const cause of [...DEATH_CAUSES, UNATTRIBUTED]) ledger.bury(1, cause);
  for (const k in ledger.snapshot(w)) carried.add(k);

  const known = new Set([...Object.keys(SERIES), ...NOT_A_SERIES]);
  for (const k of carried) assert.ok(known.has(k), `column "${k}" is classified nowhere`);
  for (const k of Object.keys(SERIES)) assert.ok(carried.has(k), `"${k}" is not a column`);
  // And the two halves of the classification are disjoint, so a column cannot
  // be a series and the coordinate it is drawn against at the same time.
  for (const k of NOT_A_SERIES) assert.ok(!(k in SERIES), `"${k}" is on both lists`);
  // A flow is a running total, and a running total is not the same thing as a
  // number that only goes up. Every tally of *events* is monotone, and the
  // burial columns are not: a creature that starves finishes a hair below zero
  // and the books bury the overdraft, so `energy_buried` walks backwards a few
  // hundred times in a run. That is a rate that is negative, not a counter that
  // is broken — and differencing is exact either way, which is the only
  // property this module needs. Written as a strict inequality in both
  // directions so the exception cannot quietly stop being one.
  const rows = w.stats.runHistory.series();
  let backwards = 0;
  for (const [field, kind] of Object.entries(SERIES)) {
    if (kind !== "flow") continue;
    const mayOverdraw = field.startsWith("energy_buried");
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1][field];
      const next = rows[i][field];
      if (!Number.isFinite(prev) || !Number.isFinite(next)) continue;
      if (next >= prev - 1e-9) continue;
      assert.ok(mayOverdraw, `${field} fell from ${prev} to ${next}`);
      backwards++;
    }
  }
  assert.ok(backwards > 0, "no burial went backwards — has the overdraft stopped happening?");
});

test("a counter's phase belongs to its rate, and the total reads a quarter of a year late", () => {
  const cfg = makeConfig();
  const P = cfg.seasonLength;
  assert.equal(seriesKind("births"), "flow");
  assert.equal(seriesKind("pop"), "level");
  assert.equal(seriesKind("nosuch"), "level");

  for (const shift of [-400, 0, 250, 700]) {
    const rows = counter(cfg, 5, { shift });
    const got = seasonLag(rows, "births", cfg);
    assert.ok(got, `no answer at shift ${shift}`);
    assert.equal(got.kind, "flow");
    assert.ok(
      Math.abs(got.lag - shift) < 1,
      `shift ${shift} came back as ${got.lag.toFixed(2)}`
    );
    // The rate swings by half its mean, and that is what `swing` reports —
    // about the rate, never about the total, which grows without bound and
    // whose "share of its own mean" would be a fact about the run's length.
    assert.ok(Math.abs(got.swing - 0.5) < 0.01, `swing ${got.swing.toFixed(3)}`);
    assert.ok(got.r > 0.999, `r ${got.r}`);

    // Pin the failure beside the fix (v1.24). Reading the running total as
    // though it were a level is not noise and not a blur: a total is the
    // integral of its rate, integrating a sinusoid shifts it a quarter period,
    // so the answer is exactly 650 ticks late — same units, same shape, r just
    // as high, and nothing downstream could tell.
    const raw = seasonLag(rows, "births", cfg, { kind: "level" });
    assert.ok(raw && raw.r > 0.999, `the wrong answer is not even suspicious: r ${raw?.r}`);
    let off = raw.lag - shift;
    while (off > P / 2) off -= P;
    while (off <= -P / 2) off += P;
    assert.ok(
      Math.abs(off - P / 4) < 2,
      `reading the total was out by ${off.toFixed(0)}, not ${(P / 4).toFixed(0)}`
    );
  }
});

test("a wide window costs the swing, not the lag", () => {
  // Differencing across a gap is a mean over that gap, a mean is a boxcar, and
  // a boxcar is symmetric about its own centre — so stamping the rate at the
  // midpoint leaves the phase alone however coarse the record is, and the whole
  // cost of the archive's thinning is a slightly smaller amplitude. That factor
  // has a closed form, which makes it an assertion rather than a tolerance.
  const cfg = makeConfig();
  const P = cfg.seasonLength;
  const omega = (2 * Math.PI) / P;
  const sinc = (w) => (w === 0 ? 1 : Math.sin((omega * w) / 2) / ((omega * w) / 2));

  // Fifty times the spacing, on a divisor of the year so that both fits see a
  // whole number of periods and the only difference between them is the width
  // of the window. (Off a divisor the fit picks up a fraction of a year as
  // well, which is worth about a thousandth here and is not what is being
  // asserted.)
  const fine = seasonLag(counter(cfg, 5, { shift: 300, every: 4 }), "births", cfg);
  const coarse = seasonLag(counter(cfg, 5, { shift: 300, every: 200 }), "births", cfg);
  assert.ok(fine && coarse);
  assert.ok(
    Math.abs(fine.lag - coarse.lag) < 0.01,
    `one point per 200 ticks moved the lag from ${fine.lag.toFixed(3)} to ${coarse.lag.toFixed(3)}`
  );
  assert.ok(
    Math.abs(coarse.swing / fine.swing - sinc(200) / sinc(4)) < 1e-5,
    `attenuation ${(coarse.swing / fine.swing).toFixed(6)} against ${(sinc(200) / sinc(4)).toFixed(6)}`
  );
  // And the spacing this actually happens at is the archive's, which halves as
  // a run grows: 128 ticks at 20,000 costs the swing 0.4%, against a bar of
  // 15%. The window is a rounding error on the amplitude and exactly nothing on
  // the phase, which is the number the readout says out loud.
  assert.ok(1 - sinc(128) < 0.005, `${1 - sinc(128)}`);
});

test("no surface may state a flow, because no bar has been measured for one", () => {
  // The reading is real — the twelve-seed table in `docs/SCIENCE.md` is made of
  // these — and `readable()` still declines it, because `MIN_SWING` is a
  // level's bar and the seasonless control says no bar on this statistic can
  // exist: a rate that is following nothing swings further than a rate that is
  // following the year. The absence is the honest answer for a page watching
  // one pond, and it is representable rather than approximated (v1.42).
  const cfg = makeConfig();
  const flow = seasonLag(counter(cfg, 5, { shift: 200, amp: 0.9 }), "births", cfg);
  assert.ok(flow && flow.swing > MIN_SWING * 5, `swing ${flow?.swing}`);
  assert.equal(readable(flow), null);
  // …while the same numbers read as a level are stated, so this is a decision
  // about the kind and not a new floor on the swing.
  assert.ok(readable({ ...flow, kind: "level" }));
});

test("a counter with nothing in it is an absence, not a phase", () => {
  const cfg = makeConfig();
  // A flow needs pairs, so a record with one row has no series at all — and a
  // counter that never moves has a rate of exactly zero, which is a structural
  // absence rather than a small number (v1.20).
  assert.equal(seasonLag([{ tick: 0, births: 5 }], "births", cfg), null);
  const flat = [];
  for (let t = 0; t <= 5 * cfg.seasonLength; t += 4) flat.push({ tick: t, births: 7 });
  assert.equal(seasonLag(flat, "births", cfg), null);
  // And a differenced series is one sample shorter than the record it came
  // from, which is the sort of off-by-one that would quietly cost a year.
  const rows = counter(cfg, 5, { shift: 0 });
  const got = seasonLag(rows, "births", cfg);
  const level = seasonLag(rows, "births", cfg, { kind: "level" });
  assert.equal(got.samples, level.samples - 1);
});

/** A history of `turns` turns of `clock`, sampled every 4 ticks, holding `f(t)`. */
function turns(config, clock, n, f, { every = 4 } = {}) {
  const P = CLOCKS[clock].period(config);
  const rows = [];
  for (let t = 0; t <= n * P; t += every) rows.push({ tick: t, pop: f(t) });
  return rows;
}

/** A config running every clock in the table, so one pond can be asked twice. */
const twoClocks = (over = {}) => makeConfig({ seasons: true, dayNightCycle: true, ...over });

test("every clock is in phase with itself, which is the whole job of `refShift`", () => {
  // The one check that can be made of a declared phase offset without writing
  // the offset down a second time: hand each clock its own waveform and demand
  // the answer be *zero*. A lag here means "after this clock's crest", so a
  // clock trailing itself by a quarter of anything is a reading no watcher
  // could use — and the year and the day disagree about where their crest is,
  // which is why this stopped being free the moment there were two of them.
  const cfg = twoClocks();
  for (const [name, clock] of Object.entries(CLOCKS)) {
    assert.ok(clock.running(cfg), `${name} is not running in a config that runs everything`);
    const rows = turns(cfg, name, 5, (t) => 100 * clock.factor(t, cfg));
    const got = seasonLag(rows, "pop", cfg, { clock: name });
    assert.ok(got, `${name}: no answer`);
    assert.equal(got.clock, name);
    assert.ok(Math.abs(got.lag) < 0.5, `${name} runs ${got.lag.toFixed(2)} ticks behind itself`);
    assert.ok(got.r > 0.999, `${name}: r ${got.r}`);

    // …and the shift is the shift, in both directions, for whichever clock.
    const P = clock.period(cfg);
    for (const shift of [-P / 3, P / 8, P / 2.5]) {
      const moved = seasonLag(
        turns(cfg, name, 5, (t) => 100 * clock.factor(t - shift, cfg)),
        "pop",
        cfg,
        { clock: name }
      );
      assert.ok(
        Math.abs(moved.lag - shift) < 0.5,
        `${name}: shift ${shift.toFixed(0)} came back as ${moved.lag.toFixed(2)}`
      );
    }
  }

  // Pin the failure beside the fix (v1.24). The fit is onto sin/cos and reports
  // in the sine's convention; the year's crest is a quarter period into that
  // convention and the day's is at tick 0, so a day read without `refShift`
  // does not come back blurred — it comes back exactly a quarter day out, with
  // r just as high and nothing downstream able to tell. Read as a year of its
  // own length, high noon is 225 ticks *ahead* of a sine that starts at zero,
  // and that number is `refShift` itself.
  assert.equal(CLOCKS.year.refShift(cfg), 0);
  assert.equal(CLOCKS.day.refShift(cfg), -cfg.dayLength / 4);
  const noon = turns(cfg, "day", 5, (t) => 100 * CLOCKS.day.factor(t, cfg));
  const asYear = seasonLag(noon, "pop", { ...cfg, seasonLength: cfg.dayLength }, { clock: "year" });
  assert.ok(asYear && asYear.r > 0.999, "the wrong answer is not even suspicious");
  assert.ok(
    Math.abs(asYear.lag - CLOCKS.day.refShift(cfg)) < 0.5,
    `the sine's convention put noon at ${asYear.lag.toFixed(1)}`
  );
});

test("the brute-force curve agrees on the day as well as on the year", () => {
  // v1.32's rule reaches the new clock: the closed form is an accelerator, an
  // accelerator is an assertion of equivalence, and one nothing checks is a
  // claim nothing checks. The day's waveform is a cosine where the year's is a
  // sine, so this is the one place the two could have parted.
  const cfg = twoClocks();
  let x = 987;
  const noise = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648 - 0.5;
  };
  const rows = turns(
    cfg,
    "day",
    8,
    (t) => 200 * CLOCKS.day.factor(t - 210, cfg) + 40 * Math.sin(t / 2000) + 20 * noise()
  );
  const closed = seasonLag(rows, "pop", cfg, { clock: "day" });
  const curve = correlogram(rows, "pop", cfg, { clock: "day", step: 2 });
  assert.ok(closed && curve.length > 300);
  assert.equal(curve[0].lag, -cfg.dayLength / 2);
  let best = curve[0];
  for (const p of curve) if (p.r > best.r) best = p;
  assert.ok(
    Math.abs(closed.lag - best.lag) <= 2,
    `closed ${closed.lag.toFixed(1)} vs grid ${best.lag}`
  );
});

test("a clock the world is not running has no phase; a clock that does not exist is a bug", () => {
  const cfg = twoClocks();
  const rows = turns(cfg, "day", 6, (t) => 100 * CLOCKS.day.factor(t, cfg));
  // Two ways for a day to be absent, and the second is the one that needs
  // saying: a cycle switched on with `nightVisionFactor: 1` moves nothing, so
  // there is no clock there either, and the gate is about the *effect* rather
  // than about the flag (v1.20 — a statistic that is non-zero with its
  // mechanism off is not measuring the mechanism).
  assert.equal(seasonLag(rows, "pop", makeConfig({ dayNightCycle: false }), { clock: "day" }), null);
  assert.equal(
    seasonLag(rows, "pop", twoClocks({ nightVisionFactor: 1 }), { clock: "day" }),
    null
  );
  assert.deepEqual(correlogram(rows, "pop", makeConfig(), { clock: "day" }), []);
  // A misspelt clock is not a state of the pond. Every other absence here means
  // "this world has nothing to say"; returning `null` for a typo would make the
  // number quietly unavailable instead of loudly wrong.
  assert.throws(() => seasonLag(rows, "pop", cfg, { clock: "Day" }), /unknown clock/);
  assert.throws(() => correlogram(rows, "pop", cfg, { clock: "week" }), /unknown clock/);
  // And the default is the clock v1.78 shipped with, named nowhere by callers.
  const plain = seasonLag(turns(cfg, "year", 5, (t) => 100 * seasonalFactor(t - 200, cfg)), "pop", cfg);
  assert.equal(plain.clock, "year");
});

test("no surface may state a day reading, because the arms do not separate", () => {
  // The same shape as the flow above, and measured the same way. `MIN_SWING` is
  // the *year's* bar (v1.87: a gate a control picks is a gate for the quantity
  // it was measured on), and twelve seeds with a day in them swing the same as
  // twelve with none asked about the day they do not have — see docs/SCIENCE.md.
  // So the day has no bar, and a clock with no bar is a clock no surface quotes.
  assert.equal(CLOCKS.day.minSwing, null);
  assert.equal(CLOCKS.year.minSwing, MIN_SWING);
  const cfg = twoClocks();
  const loud = seasonLag(
    turns(cfg, "day", 6, (t) => 100 + 90 * Math.sin((2 * Math.PI * t) / cfg.dayLength)),
    "pop",
    cfg,
    { clock: "day" }
  );
  assert.ok(loud && loud.swing > MIN_SWING * 5, `swing ${loud?.swing}`);
  assert.equal(readable(loud), null);
  // …and the identical numbers under the year's name are stated, so this is a
  // decision about which clock has a measured bar and not a new floor.
  assert.ok(readable({ ...loud, clock: "year" }));
  // A result from before there were clocks (or from a caller that dropped the
  // field) is a year's, which is what every stored reading in this project is.
  assert.ok(readable({ ...loud, clock: undefined }));
});

test("The Long Night keeps a day the panel still says nothing about", () => {
  // The scenario is the reason this clock is reachable at all: `seasons: false`
  // and a 700-tick day, so the pond it ships is the one world here whose only
  // periodic time is the light. The wiring works — a real archive, a real
  // reading, tagged with the clock it came from — and `readable()` declines it,
  // which is this release's finding rather than an omission.
  const cfg = makeConfig({
    seed: 64,
    dayNightCycle: true,
    dayLength: 700,
    nightVisionFactor: 0.28,
    predation: true,
    seasons: false,
  });
  const w = new World(cfg);
  for (let t = 0; t < 4200; t++) w.step();
  assert.ok(w.creatures.length > 0, "reading an empty pond proves nothing");
  const got = seasonLag(w.stats.runHistory.series(), "pop", cfg, { clock: "day" });
  assert.ok(got, "six days of record and no answer");
  assert.equal(got.clock, "day");
  assert.equal(got.kind, "level");
  assert.ok(got.years > 3, `${got.years} days`);
  assert.equal(readable(got), null);
  // The year is the absence here, and for the older reason: this pond has none.
  assert.equal(w.stats.seasonLag, null);
});

test("the new field is in the books", () => {
  // The completeness walk in test/books.test.js would catch this too; naming it
  // here says which release put it there and why it is hashable at all — it is
  // a deterministic function of the archive, so two worlds that agree on their
  // history agree on it.
  assert.ok(STATS_HASHED.includes("seasonLag"));
});
