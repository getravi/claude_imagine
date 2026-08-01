import { test } from "node:test";
import assert from "node:assert/strict";
import { Stats } from "../src/stats.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";

/**
 * The recent scope's exact header. Spelled out rather than assembled from the
 * exported constants on purpose: this is the contract a downloaded file makes
 * with whatever opens it, and a test that builds the header the same way the
 * code does would agree with any rename.
 */
const RECENT_HEADER =
  "tick,population,food,max_generation,deaths_starvation,deaths_age,deaths_predation," +
  "births,kills,scavenged," +
  "energy_crop,energy_carrion,energy_founders,energy_metabolism,energy_digested," +
  "energy_spilled,energy_rotted,energy_buried,energy_standing,energy_residual," +
  "energy_buried_starvation,energy_buried_age,energy_buried_predation";

/** What a row pushed by hand — carrying none of those counters — must print. */
const ABSENT = "0,0,0,0,0,0," + "0.000,".repeat(9) + "0.000e+0," + "0.000,0.000,0.000";

test("Stats.toCSV: empty history yields header only", () => {
  const stats = new Stats();
  assert.equal(stats.toCSV(), RECENT_HEADER + "\n");
});

test("Stats.toCSV: formats recorded rows in order", () => {
  const stats = new Stats();
  stats.popHistory.push({ tick: 0, pop: 10, food: 100, gen: 0 });
  stats.popHistory.push({ tick: 4, pop: 12, food: 96, gen: 1 });

  const csv = stats.toCSV();
  const lines = csv.trimEnd().split("\n");

  assert.deepEqual(lines, [
    RECENT_HEADER,
    `0,10,100,0,${ABSENT}`,
    `4,12,96,1,${ABSENT}`,
  ]);
});

test("Stats.sample records the tick alongside each history point", () => {
  const config = makeConfig({ seed: 7 });
  const world = new World(config);
  for (let i = 0; i < 20; i++) world.step();

  const rows = world.stats.popHistory;
  assert.ok(rows.length > 0, "history should have accumulated some rows");
  for (const row of rows) {
    assert.equal(typeof row.tick, "number");
  }
  // History points are sampled every 4 ticks, in increasing order.
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].tick > rows[i - 1].tick);
  }

  const csv = world.stats.toCSV();
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], RECENT_HEADER);
  assert.equal(lines.length, rows.length + 1);
});
