// mortalityHistory.test.js — the death toll on the chart's clock (v1.26).
//
// v1.21 gave every death a cause; v1.22 gave the run a memory that survives at
// falling resolution. This is the join, and the whole design rests on one
// property that these tests exist to hold in place: the counters carried in a
// history point are *cumulative*, so differencing two of them returns the exact
// number of deaths between them no matter how many samples the archive threw
// away in between.
//
// That is a stronger guarantee than the one v1.22 had to buy with min/max
// envelopes, and it is easy to lose — storing deaths-per-interval instead would
// look identical on a fresh run and silently under-report the moment the
// archive first halves. So the control is here too: the same stream, recorded
// the naive way, is asserted to *lose* deaths. A test that only knew the
// correct answer would stay green while someone reintroduced the bug.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Archive } from "../src/archive.js";
import { Stats, DEATH_CAUSES, deathField, mortalitySeries } from "../src/stats.js";
import { makeConfig } from "../src/config.js";

/** A run of history points with a known death schedule. */
function syntheticStream(n) {
  const out = [];
  const cum = { starvation: 0, age: 0, predation: 0 };
  for (let i = 0; i < n; i++) {
    // Lumpy on purpose: bursts and long quiet stretches are exactly what naive
    // decimation smooths away.
    cum.starvation += i % 7 === 0 ? 3 : 0;
    cum.age += i % 23 === 0 ? 1 : 0;
    cum.predation += i > 300 && i < 340 ? 5 : i % 11 === 0 ? 1 : 0;
    const point = { tick: i * 4, pop: 100 + (i % 13), food: 200, gen: i };
    for (const c of DEATH_CAUSES) point[deathField(c)] = cum[c];
    out.push(point);
  }
  return { points: out, cum };
}

test("a history point carries the cumulative toll, and it never goes backwards", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 1200; i++) world.step();

  const hist = world.stats.popHistory;
  assert.ok(hist.length > 2);
  const prev = { starvation: -1, age: -1, predation: -1 };
  for (const h of hist) {
    for (const c of DEATH_CAUSES) {
      const v = h[deathField(c)];
      assert.equal(Number.isInteger(v), true, `${deathField(c)} must be a whole count`);
      assert.ok(v >= prev[c], `${deathField(c)} fell from ${prev[c]} to ${v}`);
      prev[c] = v;
    }
  }
  // The newest sample is the ledger itself, not a copy that has drifted.
  const last = hist[hist.length - 1];
  for (const c of DEATH_CAUSES) {
    assert.equal(last[deathField(c)], world.stats.deathsBy[c]);
  }
});

test("the series is exact at every resolution the archive can reach", () => {
  const { points } = syntheticStream(600);

  // The truth, from the full-detail stream.
  const truth = mortalitySeries(points);
  assert.ok(truth.total > 0);

  // The same stream through archives of wildly different capacity. Capacity 4
  // halves seven times over 600 samples; 512 never halves at all.
  const seen = [];
  for (const capacity of [4, 8, 32, 240, 512]) {
    const archive = new Archive({ capacity, fields: ["pop", "food"] });
    for (const p of points) archive.push(p);
    const rows = archive.series();
    const series = mortalitySeries(rows);
    seen.push(rows.length);

    assert.equal(
      series.total,
      truth.total,
      `capacity ${capacity} reported ${series.total} deaths, not ${truth.total}`
    );
    for (const c of DEATH_CAUSES) {
      const sum = series.intervals.reduce((a, iv) => a + iv.counts[c], 0);
      const want = truth.intervals.reduce((a, iv) => a + iv.counts[c], 0);
      assert.equal(sum, want, `capacity ${capacity} lost ${c} deaths`);
    }
    // The intervals tile the span exactly: no gap, no overlap, in order.
    let at = rows[0].tick;
    for (const iv of series.intervals) {
      assert.equal(iv.from, at);
      at = iv.to;
    }
    assert.equal(at, rows[rows.length - 1].tick);
  }
  // ...and the resolutions really were different, or the test proved nothing.
  assert.ok(seen[0] < seen[seen.length - 1] / 8, `resolutions barely differed: ${seen}`);
});

test("the naive alternative — per-interval counts — does lose deaths", () => {
  // The control. Same stream, but each point carries the deaths *since the last
  // point* rather than the running total. The archive keeps one representative
  // per stride and drops the rest, so the dropped intervals' deaths go with
  // them. This is the bug the cumulative form avoids, and it is silent: the
  // resulting series is a perfectly plausible-looking smaller number.
  const { points } = syntheticStream(600);
  const perInterval = points.map((p, i) => {
    const prev = points[i - 1];
    const row = { tick: p.tick, pop: p.pop, food: p.food, gen: p.gen };
    for (const c of DEATH_CAUSES) {
      row[c] = p[deathField(c)] - (prev ? prev[deathField(c)] : 0);
    }
    return row;
  });
  const truth = perInterval.reduce(
    (a, r) => a + DEATH_CAUSES.reduce((b, c) => b + r[c], 0),
    0
  );

  const archive = new Archive({ capacity: 4, fields: [] });
  for (const p of perInterval) archive.push(p);
  const kept = archive
    .series()
    .reduce((a, r) => a + DEATH_CAUSES.reduce((b, c) => b + r[c], 0), 0);

  assert.ok(kept < truth * 0.2, `expected heavy loss, kept ${kept} of ${truth}`);
});

test("the whole-run archive of a real world accounts for every death in it", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 6000; i++) world.step();

  const rows = world.stats.runHistory.series();
  const series = mortalitySeries(rows);
  // The run's first sample is tick 0, before anything has died, so the series
  // over the whole archive must be the entire toll as of its newest sample.
  assert.equal(rows[0].tick, 0);
  const newest = rows[rows.length - 1];
  const toll = DEATH_CAUSES.reduce((a, c) => a + newest[deathField(c)], 0);
  assert.ok(toll > 100, `expected a busy run, got ${toll} deaths`);
  assert.equal(series.total, toll);
  // The archive has thinned by now — this is the claim under decimation, not a
  // claim about a run short enough to keep everything.
  assert.ok(world.stats.runHistory.stride > 1, "archive should have halved by 6000 ticks");
});

test("rates are per tick, and the peak is the busiest interval", () => {
  const points = [
    { tick: 0, deaths_starvation: 0, deaths_age: 0, deaths_predation: 0 },
    { tick: 10, deaths_starvation: 2, deaths_age: 0, deaths_predation: 3 },
    { tick: 30, deaths_starvation: 2, deaths_age: 4, deaths_predation: 3 },
  ];
  const { intervals, peak, total } = mortalitySeries(points);
  assert.equal(total, 9);
  assert.equal(intervals.length, 2);
  assert.deepEqual(intervals[0].counts, { starvation: 2, age: 0, predation: 3 });
  assert.equal(intervals[0].rate, 0.5); // 5 deaths over 10 ticks
  assert.equal(intervals[1].rate, 0.2); // 4 deaths over 20 ticks
  assert.equal(peak, 0.5);
  // Indices point at the later sample of each pair, which is how a caller
  // plotting by index places the bar.
  assert.deepEqual(intervals.map((iv) => iv.index), [1, 2]);
});

test("an empty or single-point history is an empty series, not a crash", () => {
  assert.deepEqual(mortalitySeries([]), { intervals: [], peak: 0, total: 0 });
  assert.deepEqual(mortalitySeries([{ tick: 0, deaths_age: 3 }]), {
    intervals: [],
    peak: 0,
    total: 0,
  });
  // A world at tick 0 has exactly one sample and the UI draws it every frame.
  const world = new World(makeConfig({ seed: 8 }));
  assert.equal(mortalitySeries(world.stats.popHistory).total, 0);
});

test("both CSV scopes carry the causes, and every row is the right width", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 3000; i++) world.step();

  for (const scope of ["recent", "whole"]) {
    const lines = world.stats.toCSV(scope).trim().split("\n");
    const header = lines[0].split(",");
    for (const c of DEATH_CAUSES) {
      assert.ok(header.includes(deathField(c)), `${scope} CSV is missing ${deathField(c)}`);
    }
    assert.ok(lines.length > 10);
    for (const line of lines.slice(1)) {
      const cells = line.split(",");
      assert.equal(cells.length, header.length, `ragged row in ${scope}: ${line}`);
      cells.forEach((cell, i) => {
        assert.ok(Number.isFinite(Number(cell)), `not a number: ${cell}`);
        // Everything that counts something is still whole. The energy columns
        // (v1.35) are the only ones that are not, and spelling that exception
        // out is what keeps this from being the test that would have hidden a
        // rounding bug in the population.
        if (!header[i].startsWith("energy_")) {
          assert.ok(/^-?\d+$/.test(cell), `not an integer: ${header[i]}=${cell}`);
        }
      });
    }
    // The last row's counters are the run's ledger, so a spreadsheet reader who
    // only looks at the bottom line still gets the true total. Tick 3000 is a
    // multiple of the four-tick sampling interval, so the newest sample is the
    // present moment in both scopes.
    const last = lines[lines.length - 1].split(",");
    for (const c of DEATH_CAUSES) {
      assert.equal(
        Number(last[header.indexOf(deathField(c))]),
        world.stats.deathsBy[c],
        `${scope} CSV's last row disagrees with the ledger for ${c}`
      );
    }
  }
});

test("keeping the toll in the history changes nothing about the toll", () => {
  // Two worlds from one seed still agree, and the counters in the history agree
  // with the ledger they were copied from — the bookkeeping reads state, it
  // does not create it.
  const a = new World(makeConfig({ seed: 555 }));
  const b = new World(makeConfig({ seed: 555 }));
  for (let i = 0; i < 2000; i++) {
    a.step();
    b.step();
  }
  assert.deepEqual(a.stats.deathsBy, b.stats.deathsBy);
  assert.equal(a.stats.toCSV("whole"), b.stats.toCSV("whole"));
  assert.equal(a.stats.toCSV("recent"), b.stats.toCSV("recent"));

  // And a Stats that never sees a death still produces well-formed rows.
  const empty = new Stats();
  const world = new World(makeConfig({ seed: 1 }));
  empty.sample(world);
  for (const c of DEATH_CAUSES) assert.equal(empty.popHistory[0][deathField(c)], 0);
});
