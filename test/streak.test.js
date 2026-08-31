// streak.test.js — the narrator that summarises a streak (v1.138).
//
// Six claims. The first three are about the rule, which is where the design
// lives; the last three are about what the rule does to a real pond, because a
// grouping rule is only ever as good as the runs it declines to make.
//
//  1. A streak is one subject doing one thing: same animal, same category, same
//     sentence with its numbers blanked out.
//  2. Only somebody can be on a streak. The pond's own milestones are one
//     sentence shape carrying different facts, and this test finds them in a
//     real chronicle and insists they stay separate lines.
//  3. Nothing is reordered and nothing is lost: the runs, laid end to end, are
//     exactly the events newest first.
//  4. The summary says the newest fact first and the tally after it, in English
//     rather than in arithmetic.
//  5. Over a sweep, the panel stops repeating itself — the share of adjacent
//     lines that are the same sentence collapses — and it does so by folding a
//     minority of lines, not by rewriting the feed.
//  6. A streak that grows keeps its identity and changes its paint, which is
//     what lets the panel patch one row instead of rebuilding. v1.136's finding
//     is that a rebuilt row is a press the browser throws away, and a rule that
//     rewrites the top line of the feed every time a champion goes again would
//     have handed that back.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { feedLineKey, feedRows } from "../src/feed.js";
import { STREAK_MIN, lineShape, sameStreak, streakMsg, streakRuns } from "../src/streak.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** An event as the chronicle keeps them, with only the fields the rule reads. */
const ev = (tick, cat, msg, who = -1) => ({ tick, cat, msg, who, sp: -1, icon: "👶" });

test("a streak is one animal, one category, one sentence", () => {
  const a = ev(100, "record", "raises their 9th.", 7);
  assert.ok(sameStreak(a, ev(140, "record", "raises their 10th.", 7)), "the same tally, again");
  assert.ok(!sameStreak(a, ev(140, "record", "raises their 10th.", 8)), "a different animal");
  assert.ok(!sameStreak(a, ev(140, "longevity", "raises their 10th.", 7)), "a different category");
  assert.ok(
    !sameStreak(a, ev(140, "record", "is the first animal here to raise 5 young.", 7)),
    "a different sentence about the same animal is a different line"
  );
  // The shape is what makes the third of those a different line, and it is the
  // one part of the rule a reader of the panel could not infer from the panel.
  assert.equal(lineShape("raises their 12th."), lineShape("raises their 9th."));
  assert.notEqual(lineShape("raises their 12th."), lineShape("takes the record, with 12."));
  assert.equal(lineShape("The pond swells past 1,200 creatures."), "The pond swells past # creatures.");
});

test("the pond is never on a streak, and a real chronicle proves it has to be", () => {
  // *The pond swells past 100 creatures* and *…past 200 creatures* are one
  // sentence shape and two different facts, so a rule that grouped by shape
  // alone would print the second and swallow the first. The guard is that a run
  // needs a `who`; this finds the pairs it is guarding against, so the test
  // fails if a future pond stops writing them and the guard goes untested.
  let adjacent = 0;
  for (const seed of [42, 123, 777]) {
    const world = new World(makeConfig({ seed }));
    for (let t = 0; t < 4000; t++) {
      world.step();
      if (t % 200) continue;
      const events = world.chronicle.events;
      for (let i = 1; i < events.length; i++) {
        if (events[i].who < 0 && events[i - 1].who < 0) {
          if (lineShape(events[i].msg) === lineShape(events[i - 1].msg)) adjacent++;
        }
      }
      for (const run of streakRuns(events)) {
        if (run.count > 1) assert.ok(run.event.who >= 0, "a pond line was folded into a streak");
      }
    }
  }
  assert.ok(adjacent > 0, "no two pond lines ever read alike, so this proves nothing");
});

test("the runs are the events, newest first, in order", () => {
  const world = new World(makeConfig({ seed: 80808 }));
  for (let t = 0; t < 4000; t++) world.step();
  const events = world.chronicle.events;
  const runs = streakRuns(events);
  assert.ok(runs.length > 0 && runs.length < events.length, "no streaks here, so this proves little");
  // Walk the events backwards and the runs forwards; they have to agree at
  // every step, which is the whole of "nothing is dropped and nothing moves".
  let i = events.length - 1;
  for (const run of runs) {
    assert.equal(run.event, events[i], "a run does not start where the last one ended");
    assert.equal(run.first, events[i - run.count + 1], "a run's first line is not its oldest");
    assert.equal(run.span, run.event.tick - run.first.tick, "the span is not the run's stretch");
    assert.ok(run.count === 1 || run.count >= STREAK_MIN, "a run shorter than the floor");
    for (let k = 0; k < run.count; k++) {
      assert.ok(
        k === 0 || sameStreak(run.event, events[i - k]),
        "a run holds a line that is not the same line"
      );
    }
    i -= run.count;
  }
  assert.equal(i, -1, "the runs do not account for every event");
});

test("the summary leads with what happened and follows with the tally", () => {
  const twice = streakMsg("raises their 10th.", 2, 120);
  assert.equal(twice, "raises their 10th — twice in a row, over 120 steps.");
  const six = streakMsg("raises their 12th.", 6, 847);
  assert.equal(six, "raises their 12th — 6 times in a row, over 847 steps.");
  assert.ok(six.startsWith("raises their 12th"), "the event, and then the context");
  // Grouped digits from the page's one clock, and no clause at all for a run
  // that took no time — *over 0 steps* is a sentence a narrator should never be
  // able to write.
  assert.ok(streakMsg("x.", 3, 1200).includes("over 1,200 steps"));
  assert.equal(streakMsg("x.", 3, 0), "x — 3 times in a row.");
  assert.equal(streakMsg("x.", 2, 1), "x — twice in a row, over 1 step.");
});

test("the panel stops repeating itself, and folds a minority of its lines", () => {
  // Measured over twelve seeds run six thousand steps, sampled every fifty:
  // 13.3% of adjacent lines on screen were the line above them restated, and
  // afterwards 1.6%; 11.1% of all lines fold away. The four seeds below are the
  // cheap version of that sweep and land at 16.1% folded and 1.8% repeating.
  // Pinned as inequalities with room either side, because what they protect is
  // the design: a pond whose feed stopped stuttering on its own would be a pond
  // that should not carry this rule, and it should have to say so out loud.
  let lines = 0;
  let folded = 0;
  let pairsBefore = 0;
  let sameBefore = 0;
  let pairsAfter = 0;
  let sameAfter = 0;
  for (const seed of [42, 123, 777, 80808]) {
    const world = new World(makeConfig({ seed }));
    for (let t = 0; t < 4000; t++) {
      world.step();
      if (t % 200) continue;
      const events = world.chronicle.events;
      if (events.length === 0) continue;
      lines += events.length;
      for (let i = 1; i < events.length; i++) {
        pairsBefore++;
        if (lineShape(events[i].msg) === lineShape(events[i - 1].msg)) sameBefore++;
      }
      const runs = streakRuns(events);
      folded += events.length - runs.length;
      for (let i = 1; i < runs.length; i++) {
        pairsAfter++;
        const now = lineShape(runs[i].event.msg);
        if (now === lineShape(runs[i - 1].event.msg)) sameAfter++;
      }
    }
  }
  assert.ok(lines > 300 && pairsBefore > 200, "too little feed to measure");
  const before = sameBefore / pairsBefore;
  const after = sameAfter / pairsAfter;
  assert.ok(before > 0.05, `the feed no longer repeats itself (${(before * 100).toFixed(1)}%)`);
  assert.ok(
    after < before / 3,
    `the fold left ${(after * 100).toFixed(1)}% of pairs repeating, against ${(before * 100).toFixed(1)}%`
  );
  const share = folded / lines;
  assert.ok(share > 0.05, `only ${(share * 100).toFixed(1)}% of lines fold — nothing is happening`);
  assert.ok(share < 0.35, `${(share * 100).toFixed(1)}% of lines fold — this is not summarising`);
});

test("a streak that grows keeps its line and changes its paint", () => {
  // Run the pond to the moment a champion goes again, which is the frame this
  // is about: the newest line on the panel joins the run above it rather than
  // arriving under it.
  const world = new World(makeConfig({ seed: 80808 }));
  let events = null;
  for (let t = 0; t < 6000 && !events; t++) {
    world.step();
    const runs = streakRuns(world.chronicle.events);
    if (runs.length && runs[0].count >= STREAK_MIN) events = world.chronicle.events.slice();
  }
  assert.ok(events, "this pond never had a streak at its head, so this proves nothing");
  const lookups = { alive: () => true, familyHere: () => false, remembered: () => false };
  const now = feedRows(events, lookups);
  const then = feedRows(events.slice(0, -1), lookups);
  assert.equal(now.length, then.length, "a line joining a streak should not add a row");
  assert.equal(feedLineKey(now[0]), feedLineKey(then[0]), "the row changed identity as it grew");
  assert.notEqual(now[0].paint, then[0].paint, "the row grew and the panel would not repaint it");
  assert.equal(now[0].count, then[0].count + 1, "the row does not know how many lines it holds");
  assert.equal(now[0].who, events[events.length - 1].who, "the press is not the newest line's");
});

test("the fold lives in one module and the panel imports it", () => {
  // The structural guard `pondclock.test.js` established and `feed.test.js`
  // repeated, for this project's most-repeated mistake: a rule about how the
  // page should talk, written into whichever file happened to be open, is a
  // rule the next surface cannot find. The record board points at champions
  // too, and it will want this.
  const feed = readFileSync(join(root, "src/feed.js"), "utf8");
  assert.ok(feed.includes('from "./streak.js"'), "the feed no longer imports the rule");
  assert.ok(!/lineShape|\\d\[\\d,\]/.test(feed), "the feed spells the shape rule itself");
});
