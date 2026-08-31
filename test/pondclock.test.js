import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stepsIn, yearOf } from "../src/pondclock.js";
import { milestoneRows } from "../src/milestones.js";
import { recordRows } from "../src/records.js";
import { seasonLabel } from "../src/describe.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

function stepped(seed, ticks, over = {}) {
  const config = makeConfig({ seed, ...over });
  const world = new World(config);
  for (let i = 0; i < ticks; i++) world.step();
  return { world, config };
}

// ---- 1. the clock itself ----

test("a step is said the way a person says an elapsed time", () => {
  assert.equal(stepsIn(0), "0 steps in");
  assert.equal(stepsIn(1), "1 step in", "the one pond in a thousand gets a plural");
  assert.equal(stepsIn(2), "2 steps in");
  assert.equal(stepsIn(1724), "1,724 steps in", "a four-figure number is not grouped");
  assert.equal(stepsIn(1000000), "1,000,000 steps in");
});

test("the clock never uses a word only somebody already here knows", () => {
  // The bar `records.js`, `cast.js`, `obituary.js` and `milestones.js` all hold
  // themselves to, applied to the one function that now writes for all of them.
  // `tick` is the engine's name for this number and `t244` was the Chronicle's;
  // `step` is the page's own word, on the keyboard hint under the buttons.
  const JARGON = /\b(tick|ticks|frame|frames|px|pixels?|epoch|iteration)\b/i;
  for (const t of [0, 1, 9, 244, 1724, 5093, 99999]) {
    assert.doesNotMatch(stepsIn(t), JARGON, `"${stepsIn(t)}" reaches for the engine's vocabulary`);
    assert.doesNotMatch(stepsIn(t), /^t\d/, "the old `t244` prefix is back");
  }
});

test("a later step never reads as an earlier one", () => {
  // The column is read down, so the order of the numbers is the whole of what
  // it is for. Grouping separators are the usual way to break that quietly.
  let last = -1;
  for (const t of [0, 1, 2, 99, 100, 999, 1000, 1001, 9999, 10000, 123456]) {
    const digits = Number(stepsIn(t).split(" ")[0].replace(/,/g, ""));
    assert.equal(digits, t, `"${stepsIn(t)}" does not say ${t}`);
    assert.ok(digits > last, "the column is not monotone");
    last = digits;
  }
});

test("a year is the one arithmetic, and a pond can fail to have one", () => {
  const config = makeConfig({ seed: 314 });
  assert.equal(yearOf(0, config), 1, "a newborn pond is in its first year");
  assert.equal(yearOf(config.seasonLength - 1, config), 1);
  assert.equal(yearOf(config.seasonLength, config), 2, "the year turns over on the season length");
  assert.equal(yearOf(config.seasonLength * 7 + 3, config), 8);
  const flat = makeConfig({ seed: 314, seasons: false });
  assert.equal(yearOf(0, flat), 0, "a pond with no seasons was given a year to be in");
  assert.equal(yearOf(999999, flat), 0);
});

// ---- 2. one clock, everywhere ----

test("every surface that dates an event dates it the same way", () => {
  const { world, config } = stepped(314, 3000);
  // The ladder.
  for (const row of milestoneRows(world, config)) {
    if (!row.done) continue;
    assert.match(row.when, /^[\d,]+ steps? in$/, `the ladder dates a rung "${row.when}"`);
  }
  // The record board.
  const crowd = recordRows(world, config, null).find((r) => r.key === "crowd");
  if (crowd && !crowd.why.includes("right now")) {
    assert.match(crowd.why, /[\d,]+ steps? in$/, `the record board dates a record "${crowd.why}"`);
  }
  // The Chronicle, whose column `main.js` writes from the same function.
  assert.ok(world.chronicle.events.length > 0, "nothing happened, so nothing was dated");
  for (const e of world.chronicle.events) {
    assert.match(stepsIn(e.tick), /^[\d,]+ steps? in$/);
  }
});

test("the year arithmetic is written once and read three times", () => {
  // The bug this guards is the one `records.js` worried about in v1.124 and
  // then wrote a third copy under: two surfaces saying "year 2" about different
  // years. The guard is structural — nobody may spell the expression out again.
  const spelled = /Math\.floor\(\s*tick\s*\/\s*(this\.)?config\.seasonLength\s*\)\s*\+\s*1/;
  for (const f of ["src/chronicle.js", "src/describe.js", "src/records.js", "src/main.js"]) {
    assert.doesNotMatch(read(f), spelled, `${f} counts its own years instead of importing yearOf`);
  }
  assert.match(read("src/pondclock.js"), spelled, "pondclock.js is not where the year is counted");
  // And the three surfaces still agree about which year it is.
  const { world, config } = stepped(7, 3000);
  assert.equal(seasonLabel(world.tick, config).year, yearOf(world.tick, config));
  for (const e of world.chronicle.events) assert.equal(e.year, yearOf(e.tick, config));
});

test("the Chronicle's column is no longer the engine's own clock", () => {
  // The feed's markup moved out of `main.js` and into `feed.js` in v1.136, so
  // the file this asserts against moved with it. The claim is the one v1.135
  // made and is unchanged: the panel a visitor is most likely to sit and read
  // dates its lines from the page's one clock and not from `t244 · yr1`.
  const feed = read("src/feed.js");
  const main = read("src/main.js");
  assert.ok(feed.includes("stepsIn(e.tick)"), "the feed does not date its lines from the one clock");
  for (const [where, src] of [
    ["feed.js", feed],
    ["main.js", main],
  ]) {
    assert.ok(!src.includes('"t" + e.tick'), `${where}: the \`t244\` stamp is still being written`);
    assert.ok(!/`? · yr\$\{/.test(src), `${where}: the \`yr1\` stamp is still being written`);
  }
  // And `main.js` no longer dates anything at all — it hands the events over.
  assert.ok(!main.includes("stepsIn("), "main.js is still stamping the feed itself");
});

// ---- 3. what the change is worth, pinned as a measurement ----

test("the year it replaced repeats itself down the column and the step does not", () => {
  // Why this release happened, in the numbers that argued for it. A year here
  // is 2,600 steps, so over twelve seeds run six thousand steps the year stamp
  // reads the same as the line above it **91.8%** of the time (224 of 244
  // adjacent pairs) while the step does so **7.4%** of the time — the pond
  // really can do two things on one step, and when it does, saying so twice is
  // the truth rather than a repeat. Ten to one is the margin the column was
  // rewritten for; if it ever narrows, the year is carrying information again
  // and this decision is worth taking a second time.
  let pairs = 0;
  let sameYear = 0;
  let sameStep = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { world } = stepped(seed, 6000);
    const ev = world.chronicle.events;
    for (let i = 1; i < ev.length; i++) {
      pairs++;
      if (ev[i].year === ev[i - 1].year) sameYear++;
      if (ev[i].tick === ev[i - 1].tick) sameStep++;
    }
  }
  assert.ok(pairs > 200, `only ${pairs} pairs of lines — the measurement is barely made`);
  const year = sameYear / pairs;
  const step = sameStep / pairs;
  assert.ok(year > 0.85, `the year repeats on only ${(year * 100).toFixed(1)}% of pairs`);
  assert.ok(step < 0.15, `the step repeats on ${(step * 100).toFixed(1)}% of pairs`);
  assert.ok(year > step * 5, "the two clocks no longer tell a reader different amounts");
});

// ---- 4. the prime directives ----

test("the clock imports nothing and the world cannot tell it exists", () => {
  const src = read("src/pondclock.js");
  assert.doesNotMatch(src, /^import /m, "a clock with a dependency is a clock that can disagree");
  assert.doesNotMatch(src, /Math\.random|RNG/, "the clock draws a random number");
});
