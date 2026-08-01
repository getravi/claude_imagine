import { test } from "node:test";
import assert from "node:assert/strict";
import { Archive } from "../src/archive.js";
import { Stats } from "../src/stats.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";

/** A run of samples with a deliberately spiky population, one per 4 ticks. */
function samples(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // Spikes land on ticks that are not multiples of any power of two, so a
    // decimation that keeps only even indices is guaranteed to drop them.
    const spike = i % 37 === 13 ? 400 : 0;
    const dip = i % 37 === 29 ? -8 : 0;
    out.push({ tick: i * 4, pop: 60 + (i % 11) + spike + dip, food: 300 - (i % 23), gen: i >> 4 });
  }
  return out;
}

function fill(archive, n) {
  const all = samples(n);
  for (const s of all) archive.push(s);
  return all;
}

test("Archive: rejects a capacity it cannot decimate", () => {
  assert.throws(() => new Archive({ capacity: 3 }), RangeError);
  assert.throws(() => new Archive({ capacity: 8.5 }), RangeError);
});

test("Archive: empty until something is pushed", () => {
  const a = new Archive({ capacity: 8, fields: ["pop"] });
  assert.deepEqual(a.series(), []);
  assert.equal(a.span(), null);
});

test("Archive: below capacity it is a lossless copy", () => {
  const a = new Archive({ capacity: 64, fields: ["pop", "food"] });
  const all = fill(a, 40);
  const rows = a.series();
  assert.equal(rows.length, 40);
  assert.equal(a.stride, 1);
  for (let i = 0; i < 40; i++) {
    assert.equal(rows[i].tick, all[i].tick);
    assert.equal(rows[i].pop, all[i].pop);
    assert.equal(rows[i].span, 1);
  }
});

test("Archive: never exceeds capacity + 1 rows, however long the run", () => {
  for (const cap of [4, 7, 16, 240]) {
    const a = new Archive({ capacity: cap, fields: ["pop", "food"] });
    for (let n = 1; n <= 5000; n++) {
      a.push({ tick: n * 4, pop: n % 97, food: n % 31, gen: 0 });
      assert.ok(
        a.series().length <= cap + 1,
        `capacity ${cap} overflowed at ${n} samples: ${a.series().length}`
      );
    }
  }
});

test("Archive: always spans the first sample to the newest", () => {
  const a = new Archive({ capacity: 8, fields: ["pop"] });
  const all = fill(a, 900);
  const rows = a.series();
  assert.equal(rows[0].tick, all[0].tick, "the run's first sample survives every halving");
  assert.equal(rows[rows.length - 1].tick, all[all.length - 1].tick, "the last row is now");
  assert.equal(rows[rows.length - 1].pop, all[all.length - 1].pop);
  const span = a.span();
  assert.deepEqual(span, { from: all[0].tick, to: all[all.length - 1].tick });
});

test("Archive: rows stay in strictly increasing tick order", () => {
  const a = new Archive({ capacity: 6, fields: ["pop"] });
  fill(a, 777);
  const rows = a.series();
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].tick > rows[i - 1].tick, `row ${i} went backwards`);
  }
});

// The headline invariant. A decimated line loses peaks; an archive that loses
// peaks *silently* is worse than no archive, because it still looks like data.
test("Archive: the envelope never understates a peak or overstates a floor", () => {
  for (const cap of [4, 5, 16, 100]) {
    for (const n of [17, 300, 2048, 5000]) {
      const a = new Archive({ capacity: cap, fields: ["pop", "food"] });
      const all = fill(a, n);
      const rows = a.series();
      for (const field of ["pop", "food"]) {
        const trueMax = Math.max(...all.map((s) => s[field]));
        const trueMin = Math.min(...all.map((s) => s[field]));
        const seenMax = Math.max(...rows.map((r) => r.max[field]));
        const seenMin = Math.min(...rows.map((r) => r.min[field]));
        assert.equal(seenMax, trueMax, `cap ${cap}, n ${n}, ${field}: peak lost`);
        assert.equal(seenMin, trueMin, `cap ${cap}, n ${n}, ${field}: floor lost`);
      }
    }
  }
});

test("Archive: every sample is accounted for exactly once", () => {
  const a = new Archive({ capacity: 10, fields: ["pop"] });
  fill(a, 1234);
  // series() may append the newest sample as an extra row; the retained
  // representatives alone must tile the run with no gaps and no double-counting.
  const total = a.rows.reduce((sum, r) => sum + r.span, 0);
  assert.equal(total, 1234);
  assert.equal(a.seen, 1234);
});

test("Archive: stride doubles and stays a power of two", () => {
  const a = new Archive({ capacity: 8, fields: ["pop"] });
  assert.equal(a.stride, 1);
  fill(a, 9);
  assert.equal(a.stride, 2, "one halving once the ninth row lands");
  fill(a, 2000);
  assert.equal(Math.log2(a.stride) % 1, 0, "stride is a power of two");
});

test("Archive: envelopes cover the interval each row claims", () => {
  const a = new Archive({ capacity: 4, fields: ["pop"] });
  const all = fill(a, 64);
  let i = 0;
  for (const r of a.rows) {
    const covered = all.slice(i, i + r.span);
    assert.equal(r.tick, covered[0].tick, "a row is labelled with its interval's first tick");
    assert.equal(r.pop, covered[0].pop, "and carries that sample's value as its representative");
    assert.equal(r.min.pop, Math.min(...covered.map((s) => s.pop)));
    assert.equal(r.max.pop, Math.max(...covered.map((s) => s.pop)));
    i += r.span;
  }
});

// ---- Stats integration ----

test("Stats keeps the whole run alongside the recent window", () => {
  const stats = new Stats(8, 120, 8); // tiny buffers so both wrap quickly
  for (let t = 0; t <= 400; t += 4) {
    stats.tick = t;
    stats.popHistory.push({ tick: t, pop: 50, food: 100, gen: 0 });
    if (stats.popHistory.length > stats.historyLength) stats.popHistory.shift();
    stats.runHistory.push({ tick: t, pop: 50, food: 100, gen: 0 });
  }
  assert.equal(stats.popHistory.length, 8, "the recent ring drops what falls off the back");
  assert.equal(stats.popHistory[0].tick, 372, "and only remembers the last few hundred ticks");
  assert.equal(stats.runHistory.span().from, 0, "the archive still starts at tick 0");
  assert.equal(stats.runHistory.span().to, 400);
});

test("Stats.toCSV('whole') exports the archive with its envelope columns", () => {
  const stats = new Stats(480, 120, 8);
  for (let t = 0; t <= 200; t += 4) {
    stats.runHistory.push({ tick: t, pop: t === 100 ? 999 : 40, food: 100, gen: 1 });
  }
  const lines = stats.toCSV("whole").trimEnd().split("\n");
  assert.equal(
    lines[0],
    "tick,population,food,max_generation,pop_min,pop_max,food_min,food_max," +
      "energy_standing_min,energy_standing_max,energy_residual_min,energy_residual_max," +
      "samples,deaths_starvation,deaths_age,deaths_predation,births,kills,scavenged," +
      "energy_crop,energy_carrion,energy_founders,energy_metabolism,energy_digested," +
      "energy_spilled,energy_rotted,energy_buried,energy_standing,energy_residual," +
      "energy_buried_starvation,energy_buried_age,energy_buried_predation"
  );
  assert.equal(lines.length - 1, stats.runHistory.series().length);
  // Thirteen columns of history — four of them the envelopes on the two
  // instantaneous energy fields (v1.35) — plus the three cause counters
  // (v1.26), the three other tallies, the ten energy columns and the three
  // (v1.44) that take `energy_buried` apart by cause. These rows
  // were pushed by hand without any of them, which is the graceful case:
  // absent reads as zero rather than as "undefined" in a spreadsheet.
  for (const line of lines.slice(1)) assert.equal(line.split(",").length, 32);
  assert.equal(lines.slice(1).some((l) => l.includes("undefined")), false);
  // The 999 spike is not a retained representative, but it is still in the file.
  const peak = Math.max(...lines.slice(1).map((l) => Number(l.split(",")[5])));
  assert.equal(peak, 999);
});

test("Stats.toCSV() still defaults to the recent window, unchanged", () => {
  const stats = new Stats();
  stats.popHistory.push({ tick: 0, pop: 10, food: 100, gen: 0 });
  const lines = stats.toCSV().trimEnd().split("\n");
  assert.deepEqual(lines, [
    "tick,population,food,max_generation,deaths_starvation,deaths_age,deaths_predation," +
      "births,kills,scavenged," +
      "energy_crop,energy_carrion,energy_founders,energy_metabolism,energy_digested," +
      "energy_spilled,energy_rotted,energy_buried,energy_standing,energy_residual," +
      "energy_buried_starvation,energy_buried_age,energy_buried_predation",
    "0,10,100,0,0,0,0,0,0,0," + "0.000,".repeat(9) + "0.000e+0," + "0.000,0.000,0.000",
  ]);
  assert.equal(stats.toCSV("recent"), stats.toCSV());
});

test("a running world fills both records consistently", () => {
  const config = makeConfig({ seed: 11 });
  const world = new World(config);
  for (let i = 0; i < 200; i++) world.step();

  const recent = world.stats.popHistory;
  const whole = world.stats.runHistory.series();
  assert.ok(whole.length > 1);
  assert.equal(whole[0].tick, recent[0].tick, "short run: both start together");
  assert.equal(
    whole[whole.length - 1].pop,
    recent[recent.length - 1].pop,
    "and agree about the present"
  );
  // The archive is bookkeeping only — it must never invent a number the recent
  // window disagrees with.
  const peak = Math.max(...whole.map((r) => r.max.pop));
  assert.equal(peak, Math.max(...recent.map((h) => h.pop)));
});
