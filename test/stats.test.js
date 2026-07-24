import { test } from "node:test";
import assert from "node:assert/strict";
import { Stats } from "../src/stats.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";

test("Stats.toCSV: empty history yields header only", () => {
  const stats = new Stats();
  assert.equal(stats.toCSV(), "tick,population,food,max_generation\n");
});

test("Stats.toCSV: formats recorded rows in order", () => {
  const stats = new Stats();
  stats.popHistory.push({ tick: 0, pop: 10, food: 100, gen: 0 });
  stats.popHistory.push({ tick: 4, pop: 12, food: 96, gen: 1 });

  const csv = stats.toCSV();
  const lines = csv.trimEnd().split("\n");

  assert.deepEqual(lines, [
    "tick,population,food,max_generation",
    "0,10,100,0",
    "4,12,96,1",
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
  assert.equal(lines[0], "tick,population,food,max_generation");
  assert.equal(lines.length, rows.length + 1);
});
