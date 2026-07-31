// energyHistory.test.js — the pond's books on the chart's clock (v1.35).
//
// v1.29 gave this world an energy ledger and an identity that must hold —
// `created − destroyed === standing` — and then only ever asked it about *now*.
// The books were a set of run-to-date totals: they could tell you the pond had
// spent 97% of its energy on being alive, and nothing whatever about when.
//
// This is the join, and it rests on the same property v1.26 used for the death
// toll: every field the ledger stores is cumulative, so differencing two
// samples returns exactly what happened between them however many samples the
// archive threw away in the middle. No envelope, no per-interval column, no
// loss. The two fields here that are *not* cumulative — the standing stock and
// the residual — are the two that get envelopes, and the control at the bottom
// of this file shows what happens to a transient without one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Archive } from "../src/archive.js";
import { makeConfig } from "../src/config.js";
import { Stats, POWER_WINDOW } from "../src/stats.js";
import {
  EnergyLedger,
  ENERGY_SOURCES,
  LEDGER_FIELDS,
  energyField,
  energySeries,
  spendShares,
} from "../src/energy.js";

/** Total minted as of one history row — the three sources summed. */
function createdOf(row) {
  return ENERGY_SOURCES.reduce((s, k) => s + row[energyField(k)], 0);
}

/**
 * The five sinks summed. Deliberately spelled out rather than derived from
 * `LEDGER_FIELDS` minus the sources: if somebody adds a ninth field, this test
 * should stop balancing until they decide which side it is on.
 */
function destroyedOf(row) {
  return ["metabolism", "digested", "spilled", "rotted", "buried"].reduce(
    (s, k) => s + row[energyField(k)],
    0
  );
}

test("every history point carries the whole ledger", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 600; i++) world.step();

  const hist = world.stats.popHistory;
  assert.ok(hist.length > 100, "600 ticks should be 150 samples");
  for (const h of hist) {
    for (const f of [...LEDGER_FIELDS, "standing", "residual"]) {
      assert.equal(typeof h[energyField(f)], "number", `${energyField(f)} missing`);
      assert.ok(Number.isFinite(h[energyField(f)]), `${energyField(f)} is not finite`);
    }
  }
  // The newest sample is the live ledger, not a copy that has drifted.
  const last = hist[hist.length - 1];
  for (const f of LEDGER_FIELDS) {
    assert.equal(last[energyField(f)], world.energy[f], `${f} drifted from the ledger`);
  }
  assert.equal(last[energyField("standing")], EnergyLedger.standing(world));
  // Tick 0 is on the record: the founders' energy is minted before anything
  // has happened, so the first row must already balance.
  const first = hist[0];
  assert.equal(first.tick, 0);
  assert.equal(first[energyField("founders")], createdOf(first));
  assert.equal(first[energyField("residual")], 0);
});

test("the identity can be checked at any point in the run, not only at the end", () => {
  const world = new World(
    makeConfig({ seed: 8181, scavenging: true, detritus: true, disease: true })
  );
  for (let i = 0; i < 2400; i++) world.step();

  for (const h of world.stats.popHistory) {
    const residual = createdOf(h) - destroyedOf(h) - h[energyField("standing")];
    // The recorded residual is the ledger's own arithmetic; this one re-derives
    // it from the eight columns a reader of the CSV would have. They associate
    // the sums differently, so they agree to floating-point rather than to the
    // bit.
    assert.ok(
      Math.abs(residual - h[energyField("residual")]) < 1e-6,
      `tick ${h.tick}: recorded residual disagrees with the columns`
    );
    // And the identity itself held *at that tick* — the thing `audit()` alone
    // could never say about a moment that had already gone past.
    assert.ok(
      Math.abs(residual) / Math.max(1, createdOf(h)) < 1e-9,
      `tick ${h.tick}: books off by ${residual}`
    );
  }
});

test("the cumulative fields never fall — except the one that honestly can", () => {
  const world = new World(makeConfig({ seed: 7 }));
  for (let i = 0; i < 1600; i++) world.step();

  // `buried` is excluded on purpose. A starving creature pays its last tick's
  // metabolic bill in full and dies a hair below zero, and that overdraft is
  // buried as a negative amount — so the one field here that goes backwards is
  // the world working correctly, not a broken counter.
  const monotone = LEDGER_FIELDS.filter((f) => f !== "buried");
  const prev = Object.fromEntries(monotone.map((f) => [f, -Infinity]));
  let sawADip = false;
  let prevBuried = 0;
  for (const h of world.stats.popHistory) {
    for (const f of monotone) {
      const v = h[energyField(f)];
      // 1e-9 of slack for `spilled`, which sums to −2e−16 in a world where
      // nothing ever spills; asserting it never moves at all would be
      // asserting something about floating point, not about the pond.
      assert.ok(v >= prev[f] - 1e-9, `${f} fell from ${prev[f]} to ${v} at tick ${h.tick}`);
      prev[f] = v;
    }
    if (h[energyField("buried")] < prevBuried) sawADip = true;
    prevBuried = h[energyField("buried")];
  }
  assert.equal(sawADip, true, "a pond where nobody starved is not a test of the overdraft");
});

test("differencing the archive is exact after the resolution has halved away", () => {
  const world = new World(makeConfig({ seed: 1234 }));
  // 240 representatives at one sample per four ticks is 960 ticks to the first
  // halving; this is several halvings past it.
  for (let i = 0; i < 6000; i++) world.step();

  const archive = world.stats.runHistory;
  assert.ok(archive.stride >= 4, `expected several halvings, stride is ${archive.stride}`);
  const rows = archive.series();
  const first = rows[0];
  const last = rows[rows.length - 1];

  // Sum the per-interval flux the exported file would give a reader, and it
  // must equal the single difference across the whole span. That is the whole
  // claim: the discarded samples are not missing, they are inside the
  // differences of the ones that stayed.
  const { intervals } = energySeries(rows);
  for (const f of LEDGER_FIELDS) {
    const summed = intervals.reduce((s, iv) => s + iv.rates[f] * iv.dt, 0);
    const direct = last[energyField(f)] - first[energyField(f)];
    assert.ok(
      Math.abs(summed - direct) < Math.max(1e-6, Math.abs(direct) * 1e-12),
      `${f}: intervals sum to ${summed}, span says ${direct}`
    );
  }
  // And the retained rows are the real numbers at their own ticks, not
  // averages of the windows they stand for.
  const detail = new Map(world.stats.popHistory.map((h) => [h.tick, h]));
  let checked = 0;
  for (const r of rows) {
    const h = detail.get(r.tick);
    if (!h) continue;
    for (const f of LEDGER_FIELDS) assert.equal(r[energyField(f)], h[energyField(f)]);
    checked++;
  }
  assert.ok(checked > 0, "the two records never overlapped, so nothing was compared");
});

test("recording the books the naive way loses energy — the control", () => {
  // The same lumpy stream twice: once cumulative, once as the per-interval flux
  // it is tempting to store instead. Both go through the same archive; only one
  // survives it. Without this arm a suite that only knows the right answer
  // stays green while somebody reintroduces the bug, which looks perfect on a
  // fresh run and under-reports from the first halving onward.
  const cumulative = new Archive({ capacity: 8 });
  const perInterval = new Archive({ capacity: 8 });
  let cum = 0;
  let truth = 0;
  for (let i = 0; i <= 400; i++) {
    // Bursts and quiet stretches — a boom that grazes hard, then a crash.
    const flux = i % 17 === 0 ? 90 : i % 3 === 0 ? 6 : 0;
    cum += flux;
    if (i > 0) truth += flux;
    cumulative.push({ tick: i * 4, [energyField("crop")]: cum });
    perInterval.push({ tick: i * 4, flux });
  }

  const kept = cumulative.series();
  const recovered =
    kept[kept.length - 1][energyField("crop")] - kept[0][energyField("crop")];
  assert.equal(recovered, truth, "the cumulative record is exact through every halving");

  const naive = perInterval.series();
  const naiveTotal = naive.reduce((s, r) => s + r.flux, 0);
  assert.ok(
    naiveTotal < truth * 0.5,
    `per-interval storage should lose most of ${truth}, kept ${naiveTotal}`
  );
});

test("a residual spike survives decimation, and would not without its envelope", () => {
  const field = energyField("residual");
  const withEnvelope = new Archive({ capacity: 8, fields: [field] });
  const without = new Archive({ capacity: 8 });
  // One tick where the books break by 42 units — a whole pellet and a half,
  // which is what a real bug looks like — and 200 ticks of perfect balance
  // around it.
  for (let i = 0; i <= 200; i++) {
    const sample = { tick: i * 4, [field]: i === 37 ? 42 : 0 };
    withEnvelope.push(sample);
    without.push({ ...sample });
  }

  const seen = Math.max(...withEnvelope.series().map((r) => r.max[field]));
  assert.equal(seen, 42, "the envelope must carry the worst excursion in its window");
  const blind = Math.max(...without.series().map((r) => r[field]));
  assert.equal(blind, 0, "without an envelope the break is simply gone");
});

test("energySeries reads the books as a rate", () => {
  const hist = [
    { tick: 0, [energyField("crop")]: 100, [energyField("metabolism")]: 40 },
    { tick: 100, [energyField("crop")]: 400, [energyField("metabolism")]: 240 },
  ];
  const { intervals, peak, spendPeak, scale } = energySeries(hist);
  assert.equal(intervals.length, 1);
  const iv = intervals[0];
  assert.equal(iv.dt, 100);
  assert.equal(iv.rates.crop, 3);
  assert.equal(iv.rates.metabolism, 2);
  // Absent columns read as zero rather than as NaN, so a history recorded
  // before this version still plots.
  assert.equal(iv.rates.carrion, 0);
  assert.equal(iv.rates.waste, 0);
  assert.equal(iv.power, 3);
  assert.equal(iv.spend, 2);
  assert.equal(peak, 3);
  assert.equal(spendPeak, 2);
  // The two lines of the power strip share one axis, so they share one scale.
  assert.equal(scale, 3);
  assert.equal(iv.shares.metabolism, 1);
  assert.equal(iv.index, 1, "intervals are indexed by their later sample, as mortality is");

  const empty = { intervals: [], overall: null, peak: 0, spendPeak: 0, scale: 0 };
  assert.deepEqual(energySeries([]), empty);
  assert.deepEqual(energySeries([hist[0]]), empty);
  // A history with no energy columns at all: every rate zero, no shares to draw.
  const bare = energySeries([{ tick: 0 }, { tick: 4 }]);
  assert.equal(bare.intervals[0].power, 0);
  assert.equal(bare.intervals[0].shares, null);
});

test("the gap between the two power lines is the standing stock moving", () => {
  // What the strip drawn in v1.39 claims, and the only quantity in that figure
  // the identity makes exact: over any interval, (minted − spent) × its length
  // is precisely the change in the energy standing in the pond. The band is
  // filled between the lines because of this — where it shows, the stock moved
  // — so if the arithmetic ever stopped holding, the picture would be asserting
  // something false about a conservation law rather than merely looking odd.
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 1200; i++) world.step();
  const hist = world.stats.popHistory;
  // Both the per-sample rate and the trailing mean the strip is actually drawn
  // from: widening the window must not cost the identity anything, which is the
  // v1.26 property that makes the wider window free in the first place.
  for (const window of [1, POWER_WINDOW]) checkGap(hist, window);
});

function checkGap(hist, window) {
  const { intervals, scale } = energySeries(hist, window);
  assert.ok(intervals.length > 100, "not enough intervals to be a test of anything");
  assert.ok(scale > 0, "a pond that mints nothing is not a test of power");

  let worst = 0;
  let crossings = 0;
  for (const iv of intervals) {
    const a = hist[Math.max(0, iv.index - window)];
    const b = hist[iv.index];
    const moved = b[energyField("standing")] - a[energyField("standing")];
    const gap = (iv.power - iv.spend) * iv.dt;
    // The residual of the identity at each end is the tolerance this can be
    // held to — it is drift in the sum, not a fault in the differencing.
    const slack =
      Math.abs(a[energyField("residual")]) + Math.abs(b[energyField("residual")]) + 1e-6;
    worst = Math.max(worst, Math.abs(gap - moved) - slack);
    if (Math.sign(iv.power - iv.spend) !== Math.sign(intervals[0].power - intervals[0].spend)) {
      crossings++;
    }
  }
  assert.ok(worst <= 0, `at window ${window} the gap misses the stock by ${worst}`);
  // And the lines really do cross, which is the only reason drawing both to one
  // shared scale matters. A strip where minting is always above spending would
  // be a figure with one line in it.
  assert.ok(crossings > 0, `at window ${window} the pond never spent more than it minted`);
}

test("spendShares and the ledger's own shares are the same function", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 400; i++) world.step();
  const e = world.energy;
  assert.deepEqual(e.shares(), spendShares(e));
  assert.equal(spendShares({ metabolism: 0, waste: 0, buried: 0 }), null);
  // The negative-overdraft clamp, which is why this is not three divisions.
  const s = spendShares({ metabolism: 3, waste: 1, buried: -0.5 });
  assert.equal(s.buried, 0);
  assert.equal(Math.abs(s.metabolism + s.waste + s.buried - 1) < 1e-12, true);
});

test("the pond's power is the real rate over the window, and it moves", () => {
  const world = new World(makeConfig({ seed: 314 }));
  assert.equal(world.stats.power, 0, "nothing has happened yet");
  for (let i = 0; i < 1200; i++) world.step();

  const h = world.stats.popHistory;
  const last = h[h.length - 1];
  const back = h[h.length - 1 - POWER_WINDOW];
  const expected = (createdOf(last) - createdOf(back)) / (last.tick - back.tick);
  assert.ok(Math.abs(world.stats.power - expected) < 1e-9);
  assert.ok(world.stats.power > 0, "a pond that mints nothing is not a test of power");

  // The point of the readout: unlike every other number on that panel, it can
  // change. Run-to-date power over the same stretch varies by a factor of
  // several; if this ever reads flat, the readout has stopped being live.
  const seen = [];
  for (let i = 0; i < 4000; i++) {
    world.step();
    if (world.tick % 400 === 0) seen.push(world.stats.power);
  }
  assert.ok(Math.max(...seen) > Math.min(...seen) * 1.5, `power barely moved: ${seen}`);
});

test("recording the books draws no random numbers and moves nothing", () => {
  const world = new World(makeConfig({ seed: 99 }));
  for (let i = 0; i < 200; i++) world.step();

  const before = world.creatures.map((c) => ({ x: c.x, y: c.y, e: c.energy }));
  let draws = 0;
  const real = world.rng.next;
  world.rng.next = (...args) => {
    draws++;
    return real(...args);
  };
  const snap = world.energy.snapshot(world);
  world.stats.sample(world);
  world.rng.next = real;

  assert.equal(draws, 0, "the books are written from state that already exists");
  assert.equal(Object.keys(snap).length, LEDGER_FIELDS.length + 2);
  world.creatures.forEach((c, i) => {
    assert.equal(c.x, before[i].x);
    assert.equal(c.y, before[i].y);
    assert.equal(c.energy, before[i].e);
  });
});

test("both CSV scopes carry the books, and every row fits the header", () => {
  const world = new World(makeConfig({ seed: 11 }));
  for (let i = 0; i < 1200; i++) world.step();

  for (const scope of ["recent", "whole"]) {
    const lines = world.stats.toCSV(scope).trimEnd().split("\n");
    const header = lines[0].split(",");
    for (const f of [...LEDGER_FIELDS, "standing", "residual"]) {
      assert.ok(header.includes(energyField(f)), `${scope} is missing ${energyField(f)}`);
    }
    for (const c of ["births", "kills", "scavenged"]) {
      assert.ok(header.includes(c), `${scope} is missing ${c}`);
    }
    for (const line of lines.slice(1)) {
      assert.equal(line.split(",").length, header.length, `${scope}: ragged row`);
    }
    // The numbers in the file are the numbers in the ledger, to the precision
    // the file claims.
    const cols = lines[lines.length - 1].split(",");
    const crop = Number(cols[header.indexOf(energyField("crop"))]);
    assert.ok(Math.abs(crop - world.energy.crop) < 0.001);
    // No signed zeroes: a sink nothing has touched reads as a plain zero rather
    // than as "-0.000", which reads to a human as a broken ledger.
    assert.equal(lines.slice(1).some((l) => l.includes("-0.000")), false);
  }
});

test("a hand-built Stats still exports, with the books reading zero", () => {
  // The graceful case: rows pushed by something that predates this version, or
  // by a test. Absent must read as zero in a spreadsheet, never as "undefined".
  const stats = new Stats(480, 120, 8);
  stats.popHistory.push({ tick: 0, pop: 10, food: 100, gen: 0 });
  stats.runHistory.push({ tick: 0, pop: 10, food: 100, gen: 0 });
  for (const scope of ["recent", "whole"]) {
    const lines = stats.toCSV(scope).trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[1].includes("undefined"), false, `${scope} leaked undefined`);
    assert.equal(lines[1].split(",").length, lines[0].split(",").length);
  }
});
