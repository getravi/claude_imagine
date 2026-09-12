// news.test.js — the Chronicle's moments, over the water (v1.174).
//
// v1.132 put the ladder's six rungs on the water and left the Chronicle's
// twenty-three-a-run in the sixteenth panel. This is the test of the table that
// decides which of them come up, and the claims are about *editorial* rather
// than about drawing:
//
//  1. **Every line the Chronicle can write is either on the water or named
//     with a reason.** Read out of `src/chronicle.js` itself, so a line added
//     later cannot arrive in a third state where nobody asked the question.
//  2. **The key is a key.** `cat/icon` is unique across all thirty-three, which
//     is the only reason this table can exist without a new field on an event
//     — and a new field on an event would move the recorded fingerprints
//     directive 0 protects.
//  3. **The prose clears the water's vocabulary bar**, which this release
//     widened by everything reading the Chronicle end to end added to it.
//  4. **A key speaks once per pond, unless it is about a role**, in which case
//     it speaks again when the role changes hands — the rule that takes the
//     young record from 9.39 lines a run to two or three, and the correction
//     that keeps *a new family has appeared* from being twelve of fourteen.
//  5. **A moment the pond has already moved on from is not news.** Whatever
//     `⏩ Skip ahead` wrote inside one frame stays in the panel.
//  6. **The best moment of a stretch wins**, because the caller shows one and
//     forgets the rest.
//  7. **Reading the feed does not move the pond**, which is structural: this
//     module is never handed a world.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { stateFingerprint } from "../src/fingerprint.js";
import {
  KEPT_BACK,
  NewsWatch,
  STALE_STEPS,
  WATER,
  WATER_JARGON,
  WATER_MAX,
  newsKey,
  waterLine,
} from "../src/news.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** Family names, for the lines that carry one. */
const NAMES = { familyName: (id) => (id === 5 ? "Ember Fins" : "Shale Sprigs") };

/**
 * Every line `chronicle.js` can write, read out of the source.
 *
 * The arguments are `(tick, icon, cat, msg, who, sp)`, and both the icon and
 * the category are string literals at every one of the call sites — which is
 * what makes this scan possible and is itself worth asserting: a `_push` whose
 * icon is computed would be a line this sweep cannot see, and the count below
 * is what would notice.
 */
function chronicleKeys() {
  const src = read("src/chronicle.js");
  const sites = (src.match(/this\._push\(/g) || []).length;
  const re = /this\._push\(\s*[A-Za-z0-9_.]+\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/g;
  const keys = [];
  let m;
  while ((m = re.exec(src))) keys.push(`${m[2]}/${m[1]}`);
  return { keys, sites };
}

/** One event, shaped the way the Chronicle shapes them. */
function ev(key, over = {}) {
  const [cat, icon] = key.split("/");
  return { tick: 1000, year: 1, icon, cat, msg: "…", who: -1, sp: -1, ...over };
}

// ---- 1. the table is complete ----

test("every line the Chronicle can write is on the water or kept back with a reason", () => {
  const { keys, sites } = chronicleKeys();
  assert.equal(keys.length, sites, "a `_push` whose icon or category is not a literal is invisible here");
  for (const key of keys) {
    const water = WATER.has(key);
    const kept = KEPT_BACK.has(key);
    assert.ok(water || kept, `${key} is a Chronicle line nobody has decided about`);
    assert.ok(!(water && kept), `${key} is both said and kept back`);
  }
  // And nothing in either table is about a line that no longer exists — the
  // stale-constant failure this project has shipped before, in the one place
  // where it would be silent rather than wrong.
  const known = new Set(keys);
  for (const key of [...WATER.keys(), ...KEPT_BACK.keys()]) {
    assert.ok(known.has(key), `${key} is in the table and not in the Chronicle`);
  }
  assert.equal(WATER.size + KEPT_BACK.size, known.size);
});

test("a category and an icon together name exactly one kind of line", () => {
  const { keys } = chronicleKeys();
  assert.equal(new Set(keys).size, keys.length, "two lines share a key, so the table cannot tell them apart");
  // The two collisions this nearly had, kept here as the reason the key is a
  // pair rather than either half of one.
  assert.ok(keys.includes("regrowth/🍂") && keys.includes("detritus/🍂"), "one icon, two categories");
  assert.ok(keys.includes("death/⚰️") && keys.includes("lineage/⚰️"), "one icon, two categories");
  assert.ok(keys.includes("pop/🌊") && keys.includes("record/🌊"), "one icon, two categories");
});

// ---- 2. the words ----

test("nothing the Chronicle says over the water uses a word only somebody already here knows", () => {
  const lines = [...WATER.keys()].map((key) => {
    const said = waterLine(ev(key, { who: 7, sp: 3 }), NAMES);
    assert.ok(said, `${key} is in the table and produced no line`);
    return said.line;
  });
  assert.ok(lines.length >= 20, `only ${lines.length} lines — the bar is barely tested`);
  for (const line of lines) {
    // The Chronicle's own icon leads, as it does on every other banner this
    // page raises and as it does on the row in the panel behind it.
    assert.match(line, /^[^\p{L}\p{N}\s]+ \p{Lu}/u, `"${line}" does not open with the line's own mark`);
    assert.doesNotMatch(line, WATER_JARGON, `"${line}" uses a word only somebody already here knows`);
    assert.ok(line.endsWith("."), `"${line}" is a banner and needs its full stop`);
    assert.ok(line.length <= WATER_MAX, `"${line}" is longer than a glance (${line.length})`);
    // A banner is one thought. The Chronicle's own sentences carry numbers
    // because a panel can afford one; the water's may not, because a figure
    // read in a glance over moving water is a figure nobody checks.
    assert.doesNotMatch(line, /\d/, `"${line}" puts a number on the water`);
  }
});

test("the ladder's banners clear the same bar the Chronicle's do", async () => {
  // The bar moved this release, and the surface it moved under is not this one.
  // `cheer.js`'s lines are held to `WATER_JARGON` by their own suite; this is
  // the assertion that there is only one bar to be held to.
  const cheer = read("test/cheer.test.js");
  assert.match(cheer, /WATER_JARGON/, "the ladder's suite no longer shares the water's vocabulary bar");
});

test("a line with no subject to name is not put on the water", () => {
  // A family line without a family, or an animal line without an animal, is the
  // one failure this surface must never show: `the undefined`.
  assert.equal(waterLine(ev("lineage/👑"), NAMES), null);
  assert.equal(waterLine(ev("record/👶"), NAMES), null);
  assert.ok(waterLine(ev("lineage/👑", { sp: 2 }), NAMES));
  assert.ok(waterLine(ev("record/👶", { who: 2 }), NAMES));
  // And a line the table does not carry is nothing at all, rather than a blank.
  assert.equal(waterLine(ev("pop/🌊"), NAMES), null);
});

// ---- 3. the repeat rule ----

test("a key speaks once per pond, and again only when a role changes hands", () => {
  const watch = new NewsWatch();
  const say = (e) => watch.best([e], e.tick, NAMES);
  // No role: once, whatever the pond does afterwards.
  assert.ok(say(ev("predation/🕊️", { tick: 100 })));
  assert.equal(say(ev("predation/🕊️", { tick: 200 })), null);
  // A champion beating their own number is the same champion.
  assert.ok(say(ev("record/👶", { tick: 300, who: 11 })));
  assert.equal(say(ev("record/👶", { tick: 340, who: 11 })), null);
  assert.equal(say(ev("record/👶", { tick: 380, who: 11 })), null);
  // Somebody taking it off them is news again.
  const taken = say(ev("record/👶", { tick: 420, who: 12 }));
  assert.ok(taken, "a new champion is a new moment");
  assert.equal(taken.who, 12);
  // The other role, one subject over: the family that holds the water.
  assert.ok(say(ev("lineage/👑", { tick: 500, sp: 4 })));
  assert.equal(say(ev("lineage/👑", { tick: 540, sp: 4 })), null);
  assert.ok(say(ev("lineage/👑", { tick: 580, sp: 5 })));
});

test("a subject that is new by construction is not a role, and does not repeat", () => {
  // The correction that came out of measuring five minutes instead of two. Every
  // family that splits off carries a species id no family has ever had, so a
  // repeat rule keyed on the subject would make *a new family has appeared* news
  // every single time — twelve of the fourteen banners an eighteen-thousand-step
  // run raises, the same sentence with a different name in it.
  const watch = new NewsWatch();
  const say = (e) => watch.best([e], e.tick, NAMES);
  assert.ok(say(ev("lineage/🌿", { tick: 100, sp: 4 })));
  for (const sp of [5, 6, 7, 8]) {
    assert.equal(say(ev("lineage/🌿", { tick: 200 + sp, sp })), null, "the same sentence, a new name");
  }
  // The line is still *about* somebody — it is still pressable — which is
  // exactly why `role` had to be a separate flag from `subject`.
  const first = waterLine(ev("lineage/🌿", { sp: 4 }), NAMES);
  assert.equal(first.sp, 4);
  assert.equal(first.holder, -1, "a line with no role remembers nobody");
  assert.equal(waterLine(ev("lineage/👑", { sp: 4 }), NAMES).holder, 4);
});

test("the young record is the line this rule was written for", () => {
  // Measured over twenty-eight runs — the default pond and all thirteen worlds,
  // two seeds each, six thousand steps — the Chronicle writes 9.39 record lines
  // a run and eight in nine of them are one animal beating their own number.
  // The rule has to take a run of those down to the changes of hands.
  const watch = new NewsWatch();
  const holders = [3, 3, 3, 3, 3, 8, 8, 8, 3, 3];
  let said = 0;
  for (let i = 0; i < holders.length; i++) {
    if (watch.best([ev("record/👶", { tick: 100 + i * 40, who: holders[i] })], 100 + i * 40, NAMES)) said++;
  }
  assert.equal(said, 3, "three changes of hands in ten lines");
});

// ---- 4. what is not news ----

test("a moment the pond has already moved on from stays in the panel", () => {
  const watch = new NewsWatch();
  // The case this exists for: `⏩ Skip ahead` steps a pond two and a half
  // thousand times inside one frame, and every line those steps wrote arrives
  // here at once with the pond's clock far past all of them.
  const skipped = [
    ev("lineage/👑", { tick: 1000, sp: 1 }),
    ev("predation/🕊️", { tick: 2000 }),
    ev("learning/🧠", { tick: 3000 }),
  ];
  assert.equal(watch.best(skipped, 3500, NAMES), null, "history is not news");
  // The edge of the window, from both sides.
  const w2 = new NewsWatch();
  assert.equal(w2.best([ev("learning/🧠", { tick: 1000 })], 1000 + STALE_STEPS + 1, NAMES), null);
  assert.ok(w2.best([ev("learning/🧠", { tick: 1000 })], 1000 + STALE_STEPS, NAMES));
});

test("the best moment of a stretch is the one that gets the water", () => {
  const watch = new NewsWatch();
  const stretch = [
    ev("regrowth/🌾", { tick: 1000 }), // rank 6
    ev("night/🌑", { tick: 1002 }), // rank 9
    ev("brain/🕸️", { tick: 1004 }), // rank 7
  ];
  const pick = watch.best(stretch, 1005, NAMES);
  assert.equal(pick.key, "night/🌑");
  // The two it beat are gone rather than queued — the caller shows one banner
  // and a queue would make this surface a feed scrolling over the pond.
  assert.equal(watch.best([ev("regrowth/🌾", { tick: 1100 })], 1100, NAMES).key, "regrowth/🌾");
  // A tie goes to the newer of the two: both are worth the same and only one of
  // them is still on screen.
  const w2 = new NewsWatch();
  const tie = w2.best([ev("disease/🦠", { tick: 10 }), ev("night/🌙", { tick: 12 })], 20, NAMES);
  assert.equal(tie.key, "night/🌙");
});

// ---- 5. the ranks are a ladder, not a list ----

test("every moment on the water is ranked, and the ranks are in range", () => {
  for (const [key, say] of WATER) {
    assert.ok(Number.isInteger(say.rank), `${key} has no rank`);
    assert.ok(say.rank >= 1 && say.rank <= 9, `${key} is ranked ${say.rank}, outside 1..9`);
    if (say.subject) assert.ok(["who", "sp"].includes(say.subject), `${key} has an odd subject`);
  }
  // A table where everything is the most important thing has no editorial in
  // it. The spread is what makes `best` mean anything.
  const ranks = new Set([...WATER.values()].map((s) => s.rank));
  assert.ok(ranks.size >= 3, "the ranks are barely a ranking");
});

// ---- 6. it reads a real pond, and does not move it ----

test("a real pond's feed comes out as a handful of moments, not a stream", () => {
  const world = new World(makeConfig({ seed: 314 }));
  const before = stateFingerprint(world);
  const watch = new NewsWatch();
  const said = [];
  // Read the feed the way the page does: whatever is new, every step.
  let seen = 0;
  for (let i = 0; i < 6000; i++) {
    world.step();
    const feed = world.chronicle.events;
    if (feed.length === seen) continue;
    const fresh = feed.slice(seen);
    seen = feed.length;
    const pick = watch.best(fresh, world.tick, NAMES);
    if (pick) said.push(pick);
  }
  // The feed writes 23.6 lines a run across the fourteen worlds measured; the
  // water takes a handful of them. The bounds are wide on purpose — this is a
  // claim about the order of magnitude, and a pond is allowed to be quiet.
  assert.ok(said.length >= 2, `the water said ${said.length} things in six thousand steps`);
  assert.ok(said.length <= 12, `the water said ${said.length} things — that is a feed, not a moment`);
  assert.ok(world.chronicle.events.length > said.length, "the panel keeps more than the water takes");
  for (const s of said) {
    assert.doesNotMatch(s.line, WATER_JARGON);
    assert.ok(s.line.length <= WATER_MAX);
  }
  // Structural: this module never receives a world, so it cannot have moved
  // one. Asserted anyway, because that is the guarantee, not the mechanism.
  assert.equal(stateFingerprint(world), stateFingerprint(rerun(6000)));
  assert.notEqual(before, stateFingerprint(world));
});

test("two identical ponds are told identical things", () => {
  // Determinism, at the surface a visitor actually sees: the same seed twice
  // produces the same banners in the same order on the same steps. Ids are the
  // one thing that cannot match — a creature id comes from a counter that never
  // resets across a process — which is exactly why `who` is outside the
  // narration's hash, and why this compares the words.
  const a = watchRun(1234);
  const b = watchRun(1234);
  // A subject's *name* is the one thing two identical ponds cannot agree on:
  // `givenName` spells a creature id and an id comes from a counter that never
  // resets across a process, which is why `who` sits outside the narration's
  // hash (`EVENT_UNHASHED`). So the comparison is the step, the moment and —
  // for every line that is about the pond rather than about somebody — the
  // words.
  const shape = (s) => `${s.tick}:${s.key}:${s.who >= 0 || s.sp >= 0 ? "" : s.line}`;
  assert.deepEqual(a.map(shape), b.map(shape));
  assert.ok(a.length > 0, "seed 1234 said nothing at all, so this proved nothing");
});

/** A pond stepped `n` times, for the paired comparison above. */
function rerun(n) {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < n; i++) world.step();
  return world;
}

/** Every banner one pond raises, with the step it was raised on. */
function watchRun(seed, ticks = 4000) {
  const world = new World(makeConfig({ seed }));
  const watch = new NewsWatch();
  const out = [];
  let seen = 0;
  for (let i = 0; i < ticks; i++) {
    world.step();
    const feed = world.chronicle.events;
    if (feed.length === seen) continue;
    const pick = watch.best(feed.slice(seen), world.tick, NAMES);
    seen = feed.length;
    if (pick) out.push({ ...pick, tick: world.tick });
  }
  return out;
}

// ---- 7. the page is wired to it ----

test("the page reads the feed on the pond's clock and speaks on the browser's", () => {
  const main = read("src/main.js");
  assert.match(main, /watchForNews\(world\)/, "nothing reads the feed");
  assert.match(main, /pumpNews\(now\)/, "nothing puts the line up");
  // The gap is what keeps this from being a feed over the water, and it counts
  // from the ladder's banner as well as from its own.
  assert.match(main, /now < cheerFree \+ NEWS_GAP_MS/, "the two banners no longer share one gate");
  // And the panel it comes from is a panel with a handle.
  assert.match(read("app/index.html"), /<section id="chronicle"/);
  assert.match(read("style.css"), /\.chronicle\.cheering/);
});

test("the moment is world-scoped, so a reset takes it with it", () => {
  const view = read("src/viewstate.js");
  for (const field of ["newsWatch", "newsSeen", "newsHold"]) {
    assert.match(view, new RegExp(`\\n  ${field}:`), `${field} is not on the world-scoped roster`);
  }
});
