// cheer.test.js — the banner the ladder raises (v1.132).
//
// v1.131 shipped a checklist and left the celebration off it. This is the test
// of the celebration, and the claims are about *when* a thing is worth saying
// rather than about how it is drawn:
//
//  1. **Every rung has a line, and no line outlives its rung.** The banner is
//     the one surface here that indexes the ladder by key, so a seventh
//     milestone with no sentence would put the word `undefined` over the water.
//  2. **A rung is announced exactly once, on the step it is climbed.** Not on
//     the frame the panel happened to redraw, and never twice.
//  3. **A newborn pond is congratulated for everything it does**, including a
//     first birth on step 9 — the earliest the design sweep ever saw one.
//  4. **A restored pond is silent about its past.** 📂 Load re-latches the
//     ladder against a saved population, so the rungs it ticks in its first
//     few steps are history rather than news, and history is not a moment.
//  5. **Two rungs on one step are two banners, in ladder order.** Measured at
//     1-in-69 and pinned here with the pond it was measured on.
//  6. **The prose clears the ladder's own vocabulary bar**, which is the bar
//     `records.js`, `cast.js`, `headline.js`, `key.js` and `whoswho.js` clear.
//  7. **Reading the ladder does not move the pond**, which is structural here:
//     this module is never handed a world at all.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { MILESTONE_KEYS, milestoneRows } from "../src/milestones.js";
import { CHEER_KEYS, CheerWatch, SETTLE_STEPS, cheerLine } from "../src/cheer.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** A pond and the ladder-reader that goes with it. */
function pond(seed, over = {}) {
  const config = makeConfig({ seed, ...over });
  const world = new World(config);
  return { world, config, rows: () => milestoneRows(world, config) };
}

/**
 * Watch a pond from wherever it is now, stepping it and collecting every banner
 * with the step it went up on.
 */
function watch(p, steps) {
  const w = new CheerWatch(p.rows(), p.world.tick);
  const said = [];
  for (let i = 0; i < steps; i++) {
    p.world.step();
    // A banner is an object as of v1.133 — the sentence, the rung it is about
    // and who to go and watch — so this flattens it and keeps the step.
    for (const b of w.observe(p.rows(), p.world.tick)) said.push({ at: p.world.tick, ...b });
  }
  return { watch: w, said };
}

// ---- 1. every rung has a line ----

test("the banner has a sentence for every rung, and none for a rung that is gone", () => {
  assert.deepEqual([...CHEER_KEYS].sort(), [...MILESTONE_KEYS].sort());
});

test("no rung ever says undefined over the water", () => {
  const p = pond(314);
  const rows = p.rows();
  for (const row of rows) {
    const line = cheerLine(row, rows);
    assert.doesNotMatch(line, /undefined/, `"${line}" is a missing sentence wearing a rung`);
    assert.ok(line.startsWith(row.mark), `"${line}" does not open with its own mark`);
    assert.ok(line.includes(row.title), `"${line}" never names the rung it is about`);
  }
});

test("a banner ends by naming what is next, and says so differently when nothing is", () => {
  const p = pond(314);
  const rows = p.rows();
  // A fresh pond: every rung is ahead, so the first one climbed points at the
  // second — and never at itself, whether the ladder it is handed was read
  // before the latch or after it.
  assert.match(cheerLine(rows[0], rows), /Next: one eats another\.$/);
  const latched = rows.map((r, i) => (i === 0 ? { ...r, done: true } : r));
  assert.match(cheerLine(latched[0], latched), /Next: one eats another\.$/);

  // The last rung on a finished ladder has nothing to point at.
  const all = rows.map((r) => ({ ...r, done: true, blocked: false }));
  assert.match(cheerLine(all[all.length - 1], all), /That is the whole ladder\.$/);

  // And a ladder whose only unticked rung is one a switched-off rule forbids is
  // finished as far as this pond is concerned — the row already says why, and
  // nobody reading a banner is looking at the row.
  const capped = rows.map((r, i) =>
    i === rows.length - 1 ? { ...r, done: false, blocked: true } : { ...r, done: true }
  );
  assert.match(cheerLine(capped[0], capped), /That is everything this pond's rules allow\.$/);
});

// ---- 2. once, on the step it happened ----

test("a rung is announced exactly once, on the step the world latched it", () => {
  const p = pond(314);
  const { said } = watch(p, 2000);
  assert.ok(said.length >= 3, `only ${said.length} rungs fired in 2,000 steps`);

  const keys = MILESTONE_KEYS.filter((k) => p.world.milestones.at[k] >= 0);
  // Every latched rung was said, on the step it was latched, and said once.
  assert.equal(said.length, keys.length, "the banners and the ticks disagree about what happened");
  for (const key of keys) {
    const row = p.rows().find((r) => r.key === key);
    const hits = said.filter((s) => s.line.startsWith(`${row.mark} ${row.title}`));
    assert.equal(hits.length, 1, `"${key}" was announced ${hits.length} times`);
    assert.equal(hits[0].at, p.world.milestones.at[key], `"${key}" was announced off its own step`);
  }
});

test("a rung already ticked when the page takes the pond up is never announced", () => {
  // The page reloads, a permalink lands mid-run, a frame drops the world and
  // adopts it again: whatever the reason, a rung that was already true is not
  // something that happened while anybody was watching.
  const p = pond(314);
  for (let i = 0; i < 1200; i++) p.world.step();
  const already = p.world.milestones.count;
  assert.ok(already >= 3, "this pond has not climbed enough to have a past");

  const { said } = watch(p, 400);
  for (const s of said) {
    assert.doesNotMatch(s.line, /The first young/, "a rung from before the watch was announced");
  }
  assert.ok(
    said.length <= MILESTONE_KEYS.length - already,
    "more rungs were announced than were left to climb"
  );
});

// ---- 3. a newborn pond misses nothing ----

test("a pond watched from its first step is congratulated for everything, however early", () => {
  // Seed 9 is the fastest first birth in the design sweep — step 9 — and the
  // rung most worth having is the one a settling window would have eaten.
  const p = pond(9);
  const { said } = watch(p, 600);
  const first = said[0];
  assert.ok(first, "600 steps and the pond was congratulated for nothing");
  assert.ok(first.at < 40, `the first banner waited until step ${first.at}`);
  assert.equal(first.at, Math.min(...MILESTONE_KEYS.map((k) => p.world.milestones.at[k]).filter((t) => t >= 0)));
});

// ---- 4. a pond that arrives with a past ----

test("a restored pond does not celebrate the life it was saved from", () => {
  const p = pond(3);
  for (let i = 0; i < 3000; i++) p.world.step();
  const saved = JSON.parse(JSON.stringify(p.world.toJSON()));

  const back = pond(3);
  back.world.loadJSON(saved);
  assert.ok(back.world.tick > 0, "a restored pond arrives at step zero");
  // Measured, not assumed: the load itself ticks a family, and the first few
  // steps after it tick more — all of it a past nobody watched.
  const { said } = watch(back, SETTLE_STEPS);
  assert.deepEqual(
    said.map((s) => s.line),
    [],
    "a loaded pond congratulated the visitor on its own history"
  );
  assert.ok(back.world.milestones.count >= 2, "nothing was latched, so nothing was suppressed");
});

test("the settling window closes, and a restored pond's own achievements still count", () => {
  const p = pond(5);
  for (let i = 0; i < 1200; i++) p.world.step();
  const saved = JSON.parse(JSON.stringify(p.world.toJSON()));
  const back = pond(5);
  back.world.loadJSON(saved);

  const w = new CheerWatch(back.rows(), back.world.tick);
  assert.equal(w.settleUntil, back.world.tick + SETTLE_STEPS);
  // Past the window, a rung is news again — a restored pond is a pond.
  const rows = back.rows().map((r) => ({ ...r, done: true }));
  const late = w.observe(rows, back.world.tick + SETTLE_STEPS + 1);
  assert.ok(late.length > 0, "a restored pond can never be congratulated again");

  // And a newborn one has no window at all.
  const fresh = new CheerWatch(pond(5).rows(), 0);
  assert.equal(fresh.settleUntil, 0);
});

// ---- 5. two rungs, one step ----

test("two rungs landing together are two banners, in ladder order", () => {
  // Seed 10 is the one pond in twelve where the sweep saw a pair: a dynasty and
  // twice as full both latch on step 1,068.
  const p = pond(10);
  const { said } = watch(p, 1200);
  const together = said.filter((s) => s.at === said[said.length - 1].at);
  const pairs = new Map();
  for (const s of said) pairs.set(s.at, (pairs.get(s.at) || 0) + 1);
  const doubled = [...pairs.entries()].filter(([, n]) => n > 1);
  assert.equal(doubled.length, 1, "seed 10 no longer climbs two rungs on one step");
  const [step] = doubled[0];
  const both = said.filter((s) => s.at === step).map((s) => s.line);
  assert.equal(both.length, 2);
  // Ladder order, oldest rung first, so a reader gets them in the order the
  // panel lists them rather than in the order a `for` loop happened to latch.
  const order = MILESTONE_KEYS.map((k) => p.rows().find((r) => r.key === k).title);
  const seen = both.map((line) => order.findIndex((t) => line.includes(t)));
  assert.ok(seen[0] < seen[1], `${both.join(" / ")} came out backwards`);
  assert.ok(together.length >= 1);
});

// ---- 6. the vocabulary bar ----

test("nothing said over the water uses a word only somebody already here knows", () => {
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|RNG|seed|species)\b/i;
  const lines = new Set();
  for (const seed of [3, 42, 128, 314]) {
    const p = pond(seed);
    const { said } = watch(p, 1500);
    for (const s of said) lines.add(s.line);
  }
  // A rung's wording does not vary with the pond — that is what makes it a
  // sentence somebody can learn — so the live runs above are a test of which
  // rungs fire, and the ladder below is what puts every rung's words, and both
  // of the endings a finished ladder can have, in front of the bar.
  const rows = pond(314).rows();
  for (const row of rows) {
    lines.add(cheerLine(row, rows));
    lines.add(cheerLine(row, rows.map((r) => ({ ...r, done: true }))));
  }
  assert.ok(lines.size >= 8, `only ${lines.size} banners ever appeared — the bar is barely tested`);
  for (const line of lines) {
    assert.doesNotMatch(line, JARGON, `"${line}" uses a word only somebody already here knows`);
    assert.ok(line.endsWith("."), `"${line}" is a banner and needs its full stop`);
    // A banner is read once, in a glance, over moving water. The meet
    // introduction is this project's longest and sits at about this length.
    assert.ok(line.length <= 140, `"${line}" is longer than a glance (${line.length})`);
  }
});

// ---- 7. it cannot move the pond ----

test("watching the ladder moves nothing and draws no random number", () => {
  const p = pond(77);
  for (let i = 0; i < 500; i++) p.world.step();
  const before = stateFingerprint(p.world);
  const w = new CheerWatch(p.rows(), p.world.tick);
  w.observe(p.rows(), p.world.tick);
  w.observe(p.rows().map((r) => ({ ...r, done: true })), p.world.tick);
  assert.equal(stateFingerprint(p.world), before, "reading the ladder moved the pond");

  // Structural, and stronger than the measurement: this module is never handed
  // a world, so it has nothing to move. Its only import is the ladder it reads.
  const src = read("src/cheer.js");
  const imports = [...src.matchAll(/^import .* from "\.\/(\w+)\.js";$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["milestones"], "cheer.js has reached for something else");
  assert.doesNotMatch(src, /\brng\b|Math\.random/, "cheer.js draws a random number");
});

// ---- 8. a banner can lead somewhere (v1.133) ----

test("a banner carries its rung and whoever it is about, and nothing more", () => {
  const p = pond(314);
  const { said } = watch(p, 2400);
  assert.ok(said.length >= 3, "2,400 steps and this pond was congratulated twice");
  for (const b of said) {
    assert.ok(MILESTONE_KEYS.includes(b.key), `a banner is about "${b.key}"`);
    assert.equal(typeof b.line, "string");
    assert.equal(typeof b.whoIs, "string");
    // Never an id and never an animal: the subject is looked up at the moment
    // the visitor presses, out of the pond as it stands then, so five seconds
    // of banner cannot promise a corpse.
    assert.deepEqual(Object.keys(b).sort(), ["at", "key", "line", "whoIs"]);
  }
  const rungs = new Set(said.filter((b) => b.whoIs).map((b) => b.key));
  for (const key of rungs) assert.ok(["family", "dynasty", "deep"].includes(key));
  assert.ok(rungs.size > 0, "not one banner on this pond led to anybody");
});

test("a banner offers nobody exactly when its row does", () => {
  // The two surfaces are the same rung read seconds apart, so they cannot
  // disagree about whether there is somebody to go and see. This is the join:
  // `cheer.js` never reads a world, it only passes the ladder's own answer on.
  const p = pond(10);
  const w = new CheerWatch(p.rows(), p.world.tick);
  let seen = 0;
  for (let i = 0; i < 1500; i++) {
    p.world.step();
    const rows = p.rows();
    for (const b of w.observe(rows, p.world.tick)) {
      const row = rows.find((r) => r.key === b.key);
      assert.equal(Boolean(b.whoIs), row.who >= 0, `"${b.key}" disagrees with its own row`);
      if (b.whoIs) assert.equal(b.whoIs, row.whoIs);
      seen++;
    }
  }
  assert.ok(seen >= 4, `only ${seen} banners — too few to have tested the join`);
});

// ---- the wiring ----

test("the page holds the banner's state through the view, and the panel it lights up exists", () => {
  const main = read("src/main.js");
  // The offer on the banner is built as an element and removed when the words
  // go: an invisible control is still in the keyboard walk (v1.51).
  assert.match(main, /function offerToShow/, "the banner cannot lead anywhere");
  assert.match(main, /\.flash-go/, "nothing ever takes the offer back off the banner");
  assert.match(read("style.css"), /\.flash\.show \.flash-go\s*\{/, "a faded banner still takes a press");
  assert.match(main, /view\.cheerWatch/, "main.js does not own a watch");
  assert.match(main, /view\.cheerQueue/, "main.js does not queue what it has not shown");
  // The glow goes on the section, not on a row: the list inside is rebuilt from
  // `innerHTML` every time a pending rung's counter moves.
  assert.match(read("app/index.html"), /<section id="milestones"/);
  const css = read("style.css");
  assert.match(css, /\.milestones\.cheering\s*\{/, "the panel has no lit state");
  assert.match(css, /\.flash\.cheer\s*\{/, "a celebration looks like a receipt");
});
