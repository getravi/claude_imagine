// aim.test.js — the panel that answers the front door's claim (v1.152).
//
// What is worth pinning here, in the order the module could break:
//
//  1. **The measurement is a measurement.** A pond really does climb off the
//     coin toss, the founders really do sit on it, and the control is really
//     bounded to the animals the pond was handed — the last of those is the
//     one a `generation === 0` implementation would silently get wrong, and it
//     gets wrong *late*, on a pond somebody pressed `✚ Seed life` on.
//  2. **The schedule is on the tick.** A sample taken twice on one tick, or
//     once a frame, is a number that differs between two people reading the
//     same seed — which is the whole promise this panel makes.
//  3. **The words cover every state**, including the two that are easy to
//     forget: a pond that has slipped back, and a pond with no opening line.
//  4. **A pond somebody is measuring is bit for bit a pond nobody is.**

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  AimWatch,
  MIN_SAMPLES,
  MOVED,
  NOW_WINDOW,
  RANDOM_SHARE,
  SAMPLE_EVERY,
  aimHTML,
  aimRows,
  aimSignature,
  aimVerdict,
  inHundred,
} from "../src/aim.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** Run a pond with the watch on it, the way `main.js` does — per step. */
function watched(seed, ticks, overrides = {}) {
  const world = new World(makeConfig({ seed, ...overrides }));
  const aim = new AimWatch();
  aim.begin(world);
  for (let t = 0; t < ticks; t++) {
    world.step();
    aim.sample(world);
  }
  return { world, aim };
}

// ---- The measurement ----

test("the animals a pond is handed are no better than a coin toss", () => {
  // The finding the whole panel rests on, held against the ponds rather than
  // against a comment: forty brains dealt at random are, measurably, random at
  // the one thing this world selects on. Stated as a band rather than a number
  // because it is a measurement — the twelve-seed sweep ran 47.9% to 58.7%.
  for (const seed of [314, 1, 2, 101, 42]) {
    const { aim } = watched(seed, 1500);
    const r = aim.reading();
    assert.ok(r.then !== null, `seed ${seed} never gathered a control`);
    assert.ok(
      Math.abs(r.then - RANDOM_SHARE) < 0.12,
      `seed ${seed}: the founders read ${r.then}, which is not a coin toss`,
    );
  }
});

test("a pond climbs off the coin toss, and says so", () => {
  const { aim } = watched(314, 4000);
  const r = aim.reading();
  assert.ok(r.now !== null && r.then !== null);
  assert.ok(
    r.now - r.then > MOVED,
    `the crowd read ${r.now} against a control of ${r.then} — no gain to report`,
  );
  const said = aimVerdict(r);
  assert.match(said.verdict, /^Yes —/, `the verdict on a climbing pond was "${said.verdict}"`);
});

test("both sides can speak inside the first two seconds of pond time", () => {
  // Measured at tick 100–110 on all twelve seeds. The guard is against reading
  // a verdict off forty instants, not against saying anything at all — a panel
  // that spent a visitor's first minute on "counting" would be a panel that
  // taught them to scroll past it.
  const { aim } = watched(314, 150);
  const r = aim.reading();
  assert.ok(r.now !== null, "the crowd could not be counted by tick 150");
  assert.ok(r.then !== null, "the control could not be counted by tick 150");
});

test("the control is the animals this pond was handed, not everyone born to a founder's rank", () => {
  // The failure a `generation === 0` control has, and it only shows up on a
  // pond somebody has pressed `✚ Seed life` on: `addRandomCreatures` posts
  // fresh generation-0 animals, so a control gathered by rank would take on new
  // members at tick 800 and drag itself back toward the coin toss. Ids cannot.
  const world = new World(makeConfig({ seed: 314 }));
  const aim = new AimWatch();
  aim.begin(world);
  const handed = new Set(world.creatures.map((c) => c.id));
  for (let t = 0; t < 800; t++) {
    world.step();
    aim.sample(world);
  }
  world.addRandomCreatures(40);
  const gatecrashers = world.creatures.filter((c) => c.generation === 0 && !handed.has(c.id));
  assert.ok(gatecrashers.length > 0, "the test did not manage to post a late founder");
  for (let t = 0; t < 400; t++) {
    world.step();
    aim.sample(world);
  }
  for (const c of gatecrashers) {
    assert.equal(aim.founders.has(c.id), false, `id ${c.id} joined the pond's opening line late`);
  }
});

test("the window forgets, so 'now' is now", () => {
  const { aim } = watched(314, 3000);
  const oldest = aim.recent[0].tick;
  const newest = aim.recent[aim.recent.length - 1].tick;
  assert.ok(newest - oldest <= NOW_WINDOW, "the window reaches further back than it claims");
  assert.ok(
    aim.recent.length <= NOW_WINDOW / SAMPLE_EVERY + 1,
    `the window holds ${aim.recent.length} samples, more than its span can contain`,
  );
  // And the running sums are the window, not a drifting parallel count — the
  // one thing an incremental total gets wrong is the entry it dropped.
  assert.equal(
    aim.nowN,
    aim.recent.reduce((a, w) => a + w.n, 0),
    "the running total and the window disagree",
  );
  assert.equal(aim.nowHit, aim.recent.reduce((a, w) => a + w.hit, 0));
});

test("a pond with the tap off is measured on aim rather than on luck", () => {
  // The gate filters 0.12% of instants at the default spawn rate and 6.2% with
  // the tap fully off, so this is the pond it exists for. What is pinned is
  // that an animal with nothing in sight is counted on neither side — not the
  // share, which is a property of the world.
  const world = new World(makeConfig({ seed: 314, foodSpawnRate: 0 }));
  const aim = new AimWatch();
  aim.begin(world);
  for (let t = 0; t < 2000; t++) {
    world.step();
    aim.sample(world);
  }
  const last = aim.recent[aim.recent.length - 1];
  const alive = world.creatures.filter((c) => !c.dead).length;
  assert.ok(last.n <= alive, "more animals were counted than the pond holds");
  assert.ok(last.hit <= last.n, "more animals were aimed than were counted");
});

// ---- The schedule ----

test("a tick is counted once however many times the observer is called", () => {
  // A paused pond calls the per-step observer once a frame with the tick
  // standing still. Without the guard, a visitor who paused on a good moment
  // and went to lunch would come back to a panel that had spent an hour
  // counting it.
  const world = new World(makeConfig({ seed: 314 }));
  const aim = new AimWatch();
  aim.begin(world);
  for (let t = 0; t < SAMPLE_EVERY; t++) world.step();
  aim.sample(world);
  const once = aim.nowN;
  for (let i = 0; i < 50; i++) aim.sample(world);
  assert.equal(aim.nowN, once, "a paused pond was counted 51 times");
});

test("the samples land on the schedule and nowhere else", () => {
  const { aim } = watched(314, 300);
  for (const w of aim.recent) {
    assert.equal(w.tick % SAMPLE_EVERY, 0, `a sample was taken on tick ${w.tick}`);
  }
});

test("two readers of one seed read one number, whatever their frame rate", () => {
  // The promise the tick schedule exists to keep. One run is stepped one tick
  // at a time and the other in ragged bursts, exactly as a slow machine and a
  // fast one differ — and the panel must not be able to tell.
  const run = (burst) => {
    const world = new World(makeConfig({ seed: 7 }));
    const aim = new AimWatch();
    aim.begin(world);
    let t = 0;
    while (t < 2000) {
      const n = burst ? 1 + ((t * 7) % 23) : 1;
      for (let i = 0; i < n && t < 2000; i++, t++) {
        world.step();
        aim.sample(world);
      }
      // …and the frame that draws nothing still looks, which is the paused
      // branch in `main.js`.
      aim.sample(world);
    }
    return aim.reading();
  };
  assert.deepEqual(run(false), run(true));
});

// ---- A new pond ----

test("a new pond is measured against its own opening line", () => {
  const world = new World(makeConfig({ seed: 314 }));
  const aim = new AimWatch();
  aim.begin(world);
  for (let t = 0; t < 1000; t++) {
    world.step();
    aim.sample(world);
  }
  assert.ok(aim.reading().then !== null);
  const next = new World(makeConfig({ seed: 999 }));
  aim.begin(next);
  const r = aim.reading();
  assert.equal(r.now, null, "the crowd survived a reset");
  assert.equal(r.then, null, "the control survived a reset");
  assert.equal(aim.recent.length, 0);
  assert.ok(aim.founders.size > 0, "the new pond has no opening line of its own");
});

test("a pond that arrives part-way through gets no control and says so", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let t = 0; t < 500; t++) world.step();
  const aim = new AimWatch();
  aim.begin(world); // a load: the world is already running
  assert.equal(aim.founders, null);
  for (let t = 0; t < 900; t++) {
    world.step();
    aim.sample(world);
  }
  const r = aim.reading();
  assert.equal(r.sawStart, false);
  assert.equal(r.then, null, "a loaded pond invented an opening line");
  assert.ok(r.now !== null, "a loaded pond cannot count the crowd in front of it");
  const said = aimVerdict(r);
  assert.match(said.why, /arithmetic/, "the fallback does not say where the 50 comes from");
  assert.match(said.verdict, /\d+ in 100/);
});

// ---- The words ----

test("every state the panel can be in has a verdict and a reason", () => {
  const states = [
    { now: null, then: null, sawStart: true, nowN: 0, thenN: 0 },
    { now: 0.74, then: null, sawStart: false, nowN: 900, thenN: 0 },
    { now: 0.74, then: null, sawStart: true, nowN: 900, thenN: 12 },
    { now: 0.76, then: 0.52, sawStart: true, nowN: 900, thenN: 900 },
    { now: 0.52, then: 0.52, sawStart: true, nowN: 900, thenN: 900 },
    { now: 0.41, then: 0.52, sawStart: true, nowN: 900, thenN: 900 },
  ];
  const seen = new Set();
  for (const r of states) {
    const said = aimVerdict(r);
    assert.ok(said.mark && said.verdict && said.why, `a state came back half-worded`);
    assert.ok(said.why.length > 40, `"${said.why}" is too short to be a reason`);
    assert.doesNotMatch(said.verdict, /undefined|NaN/);
    assert.doesNotMatch(said.why, /undefined|NaN/);
    seen.add(`${said.verdict}\n${said.why}`);
  }
  // The pair, not the verdict alone: the two states that have counted a crowd
  // and have no control to hold it against say the same *number* on purpose —
  // a pond that arrived running and a pond whose founders are still being
  // counted are the same reading, and the reason under it is what differs.
  assert.equal(seen.size, states.length, "two states of this panel say the same thing");
});

test("the panel can say worse as fluently as it says better", () => {
  // `evolved.js`'s rule inherited: a board that can only report the expected
  // answer is a decoration. Measured at 0.83% of reportable instants, which is
  // rare and is not never.
  const worse = aimVerdict({ now: 0.4, then: 0.55, sawStart: true, nowN: 900, thenN: 900 });
  assert.match(worse.verdict, /^Slipping —/);
  assert.match(worse.verdict, /40 in 100/);
  assert.match(worse.verdict, /55/);
});

test("a gap under the threshold is called level, and one over it is not", () => {
  const level = aimVerdict({
    now: 0.52 + MOVED * 0.9,
    then: 0.52,
    sawStart: true,
    nowN: 900,
    thenN: 900,
  });
  assert.match(level.verdict, /^Not yet/);
  const moved = aimVerdict({
    now: 0.52 + MOVED * 1.1,
    then: 0.52,
    sawStart: true,
    nowN: 900,
    thenN: 900,
  });
  assert.match(moved.verdict, /^Yes/);
});

test("the rows read down as the argument, and an uncounted row is absent rather than empty", () => {
  const full = aimRows({ now: 0.76, then: 0.52, sawStart: true, nowN: 9, thenN: 9 });
  assert.deepEqual(
    full.map((r) => r.key),
    ["random", "then", "now"],
    "the rows are out of the order that makes them an argument",
  );
  assert.equal(full[0].share, RANDOM_SHARE);
  assert.equal(full.filter((r) => r.lead).length, 1, "the panel has no subject, or two");
  // An empty bar reads as "none of them", which is a far stronger claim than
  // "not counted yet".
  const early = aimRows({ now: null, then: null, sawStart: true, nowN: 0, thenN: 0 });
  assert.deepEqual(
    early.map((r) => r.key),
    ["random"],
    "an uncounted row was drawn at zero",
  );
});

test("the markup spells out every bar it draws", () => {
  const html = aimHTML({ now: 0.762, then: 0.521, sawStart: true, nowN: 9, thenN: 9 });
  assert.equal((html.match(/<li /g) || []).length, 3);
  assert.equal((html.match(/aimbar/g) || []).length, 3);
  // Every bar's width is stated in the row's own text, so the picture is never
  // the only place a number lives.
  for (const n of [50, 52, 76]) assert.match(html, new RegExp(`${n} in 100`));
  assert.match(html, /class="aimrow lead"/);
  assert.match(html, /aria-hidden="true"/, "the bars are read out twice");
});

test("every bar is on a line of its own, so the three are drawn at one scale", () => {
  // The structural half of a bug only a browser found (see `aimHTML`): with the
  // label and the bar sharing a line, each row's bar track was sized by that
  // row's own label and the three bars came out 689, 645 and 682 px wide — a
  // comparison drawn at three scales. `node --test` cannot measure a layout,
  // but it can hold the shape that makes the layout impossible to get wrong:
  // the label and the number are inside a head of their own, and the bar is a
  // sibling of that head rather than a third thing on its line.
  const html = aimHTML({ now: 0.76, then: 0.52, sawStart: true, nowN: 9, thenN: 9 });
  for (const row of html.split("<li ").slice(1)) {
    assert.match(
      row,
      /<span class="aimhead">.*<\/span><span class="aimbar"/,
      "a bar shares its line with a label, so its track is sized by that label",
    );
    assert.equal((row.match(/aimbar/g) || []).length, 1);
  }
});

test("the signature holds while the printed numbers do, and moves when the verdict does", () => {
  const a = { now: 0.7601, then: 0.5209, sawStart: true, nowN: 900, thenN: 900 };
  const b = { now: 0.7604, then: 0.5211, sawStart: true, nowN: 900, thenN: 900 };
  assert.equal(aimSignature(a), aimSignature(b), "the panel rebuilds for a fourth decimal");
  const c = { now: 0.55, then: 0.52, sawStart: true, nowN: 900, thenN: 900 };
  const d = { now: 0.57, then: 0.52, sawStart: true, nowN: 900, thenN: 900 };
  // 55 and 57 against 52: one is level and the other is a gain, and the printed
  // pair is different too — so what this pins is that the verdict rides along
  // at all, checked on the pair that shares neither.
  assert.notEqual(aimSignature(c), aimSignature(d));
  assert.notEqual(aimVerdict(c).verdict, aimVerdict(d).verdict);
});

test("a share is spoken as whole animals out of a hundred", () => {
  assert.equal(inHundred(0.5), 50);
  assert.equal(inHundred(0.764), 76);
  assert.equal(inHundred(0), 0);
  assert.equal(inHundred(1), 100);
});

// ---- The page and the pond ----

test("the panel's three elements are on the page and none is behind the view switch", () => {
  const page = read("app/index.html");
  for (const id of ["aim-verdict", "aim-list", "aim-why"]) {
    assert.ok(page.includes(`id="${id}"`), `the page has no ${id}`);
  }
  // v1.149's rule, and the finding that made it one: a surface put in the main
  // column that carries the switch's attribute is a surface a first visit never
  // sees. This is the most persuasive thing this page says, and it is on the
  // quiet side of the door on purpose.
  const open = page.indexOf('<section class="aim"');
  const shut = page.indexOf("</section>", open);
  assert.ok(open > 0, "the panel has left the page");
  assert.doesNotMatch(
    page.slice(open, shut),
    /data-expert/,
    "the panel that answers the front door's claim is hidden on a first visit",
  );
});

test("the module is a pure observer — no DOM, no random numbers, no writing back", () => {
  const src = read("src/aim.js");
  assert.doesNotMatch(src, /\b(document|window)\s*\./, "the numbers do not need a page");
  assert.doesNotMatch(src, /Math\.random|new RNG|rng\./, "an observer draws no random numbers");
  // It reads the sense buffer and never assigns into one, which is the one way
  // a reader of `_in` could become a writer of the world.
  assert.doesNotMatch(src, /_in\s*\[[^\]]*\]\s*=/, "the observer writes into a brain's input");
});

test("the sense indices come from the one place that declares them", () => {
  // `doing.js#SENSE` is pinned against `Creature#sense` by `doing.test.js`. A
  // second copy of the numbers here would be a second opinion that agrees today.
  const src = read("src/aim.js");
  assert.match(src, /import \{ SENSE \} from "\.\/doing\.js"/);
  assert.doesNotMatch(src, /foodCos:\s*\d/, "the indices are restated rather than imported");
});

test("a pond somebody is measuring is bit for bit a pond nobody is", () => {
  const run = (measure) => {
    const world = new World(makeConfig({ seed: 555 }));
    const aim = new AimWatch();
    if (measure) aim.begin(world);
    for (let t = 0; t < 900; t++) {
      world.step();
      if (measure) aim.sample(world);
    }
    return stateFingerprint(world);
  };
  assert.equal(run(true), run(false));
});

test("the guard against a verdict read off a handful is a real guard", () => {
  const aim = new AimWatch();
  aim.begin({ tick: 0, creatures: [] });
  aim.nowN = MIN_SAMPLES - 1;
  aim.nowHit = aim.nowN;
  assert.equal(aim.reading().now, null, "a verdict was read off too few animals");
  aim.nowN = MIN_SAMPLES;
  aim.nowHit = aim.nowN;
  assert.equal(aim.reading().now, 1);
});
