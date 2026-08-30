// milestones.test.js — the ladder (v1.131).
//
// This is the first surface here whose content is *latched in the world*, so
// the claims below are mostly about the latch rather than about the markup:
//
//  1. **A rung is monotone.** Every predicate reads a quantity that only ever
//     climbs, so a ticked rung can never come back untuck, and the tick it
//     carries is the first tick it was true on and not the tick somebody
//     happened to look.
//  2. **The ladder is a pure function of the books and the tree.** Two worlds
//     agreeing on `booksFingerprint` and `observationFingerprint` agree here —
//     which is why `world.milestones` needs no fingerprint channel of its own,
//     and this is the test that stands in for the one it does not have.
//  3. **Reading it does not move the pond**, and the latch itself draws no
//     random number and moves no world it observes.
//  4. **Every rung is reachable and none of them is a constant.** The two
//     failure modes the design sweep found: a rung that lands on the same tick
//     on every pond is a fact about `config.js`, and a rung nobody reaches is a
//     scoreboard of failure.
//  5. **The prose clears the vocabulary bar** that `records.js`, `cast.js`,
//     `headline.js`, `key.js` and `whoswho.js` all clear — on the pending
//     sentences as well as the ticked ones, which is the half a first-time
//     visitor actually reads.
//
// All six milestones fire on every pond the module swept, and the reachability
// test below re-runs that claim on the fastest four of them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { MULLER_MIN_PEAK } from "../src/phylogeny.js";
import {
  booksFingerprint,
  drawStream,
  observationFingerprint,
  stateFingerprint,
  WORLD_HASHED,
  WORLD_UNHASHED,
} from "../src/fingerprint.js";
import {
  CROWD_MULTIPLE,
  DEEP_GENERATIONS,
  DYNASTY_YOUNG,
  FAMILY_MIN_PEAK,
  MILESTONES,
  MILESTONE_KEYS,
  Milestones,
  milestoneProgress,
  milestoneRows,
  milestoneSignature,
  milestonesHTML,
  milestonesSay,
} from "../src/milestones.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const page = read("app/index.html");
const main = read("src/main.js");

/** A pond stepped far enough to have climbed some of the ladder. */
function stepped(seed, ticks, over = {}) {
  const config = makeConfig({ seed, ...over });
  const world = new World(config);
  for (let i = 0; i < ticks; i++) world.step();
  return { world, config };
}

const rowOf = (rows, key) => rows.find((r) => r.key === key) || null;

// ---- 1. the latch ----

test("a rung never comes back untick, and it carries the first tick it was true on", () => {
  const { world } = stepped(314, 0);
  /** @type {Record<string, number>} the tick each rung was seen true, sampled here */
  const seen = {};
  for (let i = 0; i < 1500; i++) {
    world.step();
    for (const m of MILESTONES) {
      const latched = world.milestones.at[m.key];
      const truth = m.reached(world);
      if (truth && seen[m.key] === undefined) seen[m.key] = world.tick;
      // The latch agrees with the predicate on the frame it fires, and stays
      // agreeing afterwards. A rung that read true once and false later would
      // make the tick beside it a lie.
      assert.equal(
        latched >= 0,
        truth,
        `"${m.key}" is latched ${latched} while its own predicate says ${truth} at ${world.tick}`
      );
      if (latched >= 0) assert.equal(latched, seen[m.key], `"${m.key}" moved after it fired`);
    }
  }
  assert.ok(Object.keys(seen).length >= 4, "too few rungs fired here to have tested anything");
});

test("the ladder starts empty and counts what it has ticked", () => {
  const fresh = new Milestones();
  assert.deepEqual(Object.keys(fresh.at).sort(), [...MILESTONE_KEYS].sort());
  for (const key of MILESTONE_KEYS) assert.equal(fresh.at[key], -1);
  assert.equal(fresh.count, 0);

  const { world } = stepped(42, 0);
  // A world on tick zero has been handed its founders and has done nothing
  // with them: no birth, no kill, no family, and a crowd exactly the size the
  // config asked for. Every rung has to still be ahead, or it is measuring the
  // settings rather than the pond.
  assert.equal(world.milestones.count, 0, "a pond ticks a rung before it has taken a step");

  const { world: old } = stepped(42, 1500);
  assert.ok(old.milestones.count > 0, "1,500 steps and the pond has done nothing");
  assert.equal(
    old.milestones.count,
    MILESTONE_KEYS.filter((k) => old.milestones.at[k] >= 0).length
  );
});

// ---- 2. a pure function of the books and the tree ----

test("two ponds agreeing on the books and the tree agree on the ladder", () => {
  // The claim `WORLD_UNHASHED.milestones` makes in place of a seventh channel.
  const a = stepped(128, 900).world;
  const b = stepped(128, 900).world;
  assert.equal(booksFingerprint(a), booksFingerprint(b), "the fixture ponds differ in the books");
  assert.equal(observationFingerprint(a), observationFingerprint(b), "the fixture ponds differ in the tree");
  assert.deepEqual(a.milestones.at, b.milestones.at, "the ladder is not a function of what it reads");
});

test("the ladder is classified, and outside the state hash on purpose", () => {
  assert.ok(!WORLD_HASHED.includes("milestones"), "the ladder is inside the state hash");
  assert.ok(WORLD_UNHASHED.milestones, "`world.milestones` is outside every hash with no reason given");
  const { world } = stepped(7, 200);
  const own = Object.keys(world);
  assert.ok(own.includes("milestones"), "the world does not carry a ladder");
  // v1.91's rule: an own field in neither list is a field nobody has decided
  // about. `test/statesweep.test.js` enforces it in general; this is the local
  // copy, so a failure names this release's field rather than the whole walk.
  for (const field of own) {
    assert.ok(
      WORLD_HASHED.includes(field) || field in WORLD_UNHASHED,
      `\`world.${field}\` is in neither fingerprint list`
    );
  }
});

// ---- 3. reading the pond does not move it ----

test("latching and drawing the ladder move nothing and draw no random number", () => {
  const config = makeConfig({ seed: 7 });
  const world = new World(config);
  for (let i = 0; i < 400; i++) world.step();
  const stream = drawStream(world.rng);
  const before = stateFingerprint(world);
  const books = booksFingerprint(world);
  const drawn = stream.count;
  for (let i = 0; i < 20; i++) {
    const rows = milestoneRows(world, config);
    milestoneSignature(rows);
    milestonesHTML(rows);
    milestonesSay(rows);
    milestoneProgress(rows);
    world.milestones.observe(world, world.tick);
  }
  assert.equal(stateFingerprint(world), before, "reading the ladder moved the pond");
  assert.equal(booksFingerprint(world), books, "reading the ladder wrote to the books");
  assert.equal(stream.count, drawn, "reading the ladder drew a random number");
});

// ---- 4. every rung is reachable, and none of them is a constant ----

test("every rung fires on every pond, and not on the same step twice", () => {
  // The sweep that designed this panel, run small: the two failure modes it
  // found are a rung that lands on a constant (a fact about `config.js`, not
  // about this pond) and a rung nobody reaches (a wall).
  //
  // The seeds are declared rather than arbitrary, and the reason is a weakness
  // worth writing down: these are the four *fastest* of the twelve the module
  // swept, chosen so the whole ladder is climbed inside 2,400 steps and this
  // file does not add ten seconds to the suite. The slowest of the twelve needs
  // 5,093 (`deep`) and 3,548 (`crowd`), so what runs here is the claim verified
  // on a favourable sample and the module's comment carries the full twelve.
  const seeds = [42, 99, 256, 1618];
  /** @type {Record<string, number[]>} */
  const firsts = {};
  for (const key of MILESTONE_KEYS) firsts[key] = [];
  for (const seed of seeds) {
    const { world } = stepped(seed, 2400);
    for (const key of MILESTONE_KEYS) firsts[key].push(world.milestones.at[key]);
  }
  for (const key of MILESTONE_KEYS) {
    const hits = firsts[key].filter((t) => t >= 0);
    assert.equal(hits.length, seeds.length, `"${key}" is a wall: it fired on ${hits.length} of ${seeds.length} ponds`);
    assert.ok(
      new Set(hits).size > 1,
      `"${key}" fired on step ${hits[0]} on every pond — that is a fact about the settings, not about the water`
    );
  }
  // And the ladder is in the order the sweep says a pond climbs it, on average.
  const means = MILESTONE_KEYS.map((k) => firsts[k].reduce((a, b) => a + b, 0) / seeds.length);
  for (let i = 1; i < means.length; i++) {
    assert.ok(means[i] > means[i - 1], `"${MILESTONE_KEYS[i]}" arrives before "${MILESTONE_KEYS[i - 1]}"`);
  }
});

test("every row is true of the world it was read from", () => {
  for (const seed of [42, 314]) {
    const { world, config } = stepped(seed, 2000);
    const rows = milestoneRows(world, config);
    assert.equal(rows.length, MILESTONES.length, "a rung went missing between the ladder and the rows");
    const s = world.stats;
    assert.equal(rowOf(rows, "young").done, s.births > 0);
    assert.equal(rowOf(rows, "kill").done, s.kills > 0);
    assert.equal(rowOf(rows, "dynasty").done, s.recordYoung.children >= DYNASTY_YOUNG);
    assert.equal(rowOf(rows, "crowd").done, s.maxPopEver >= CROWD_MULTIPLE * config.populationStart);
    assert.equal(rowOf(rows, "deep").done, s.maxGeneration >= DEEP_GENERATIONS);
    const peak = Math.max(0, ...world.phylogeny.species.map((sp) => sp.peak));
    assert.equal(rowOf(rows, "family").done, peak >= FAMILY_MIN_PEAK);
    // The floor is the tree's own, not a second opinion about the same word.
    assert.equal(FAMILY_MIN_PEAK, MULLER_MIN_PEAK);
    for (const r of rows) {
      assert.equal(r.done, r.when !== "", "a ticked rung with no date, or a date on a rung still ahead");
      if (r.done) assert.match(r.when, /^[\d,]+ steps? in$/, `"${r.when}" is not a time this page tells`);
    }
  }
});

test("a rung a rule has switched off says so instead of waiting forever", () => {
  const { world, config } = stepped(314, 600, { predation: false });
  const kill = rowOf(milestoneRows(world, config), "kill");
  assert.equal(kill.done, false, "something ate somebody in a pond with hunting off");
  assert.equal(kill.blocked, true, "the row waits for a thing this pond's rules forbid");
  assert.match(kill.why, /switched off/, "the row does not say why it cannot happen");
  // The denominator does not move. A ladder that got shorter when a switch
  // flipped would change what "four of six" meant under a reader mid-run.
  const progress = milestoneProgress(milestoneRows(world, config));
  assert.equal(progress.total, MILESTONES.length);
  // And with the rule on, the same row is an ordinary pending rung again.
  const { world: hunts, config: cfg2 } = stepped(314, 5);
  assert.equal(rowOf(milestoneRows(hunts, cfg2), "kill").blocked, false);
});

test("progress counts the ticked rungs and says so in words", () => {
  const none = milestoneProgress(milestoneRows(stepped(42, 0).world, makeConfig({ seed: 42 })));
  assert.equal(none.done, 0);
  assert.equal(none.fraction, 0);
  assert.equal(none.text, "none of 6 yet");
  const { world, config } = stepped(42, 2000);
  const rows = milestoneRows(world, config);
  const some = milestoneProgress(rows);
  assert.equal(some.done, rows.filter((r) => r.done).length);
  assert.equal(some.total, MILESTONES.length);
  assert.ok(some.fraction > 0 && some.fraction <= 1);
  assert.match(some.text, /^\d+ of 6 so far$/);
  // The spoken form names what is still ahead, which is what the panel is for.
  const say = milestonesSay(rows);
  const next = rows.find((r) => !r.done && !r.blocked);
  assert.ok(say.startsWith(`This pond has passed ${some.done} of ${some.total} milestones`));
  if (next) assert.ok(say.includes(next.title.toLowerCase()), `"${say}" never says what is next`);
});

// ---- 5. the vocabulary bar ----

test("nothing on the ladder uses a word only somebody already here knows", () => {
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|RNG|seed|species)\b/i;
  const said = new Set();
  const titles = new Set();
  for (const seed of [3, 42, 128, 314]) {
    for (const ticks of [0, 120, 700, 2500]) {
      const { world, config } = stepped(seed, ticks);
      for (const r of milestoneRows(world, config)) {
        said.add(r.why);
        titles.add(r.title);
      }
    }
  }
  // Both halves of every rung, ticked and not: this panel's pending sentences
  // are the ones a first-time visitor reads, and they were nobody's bar.
  assert.ok(said.size >= 10, `only ${said.size} kinds of sentence ever appeared — the bar is barely tested`);
  for (const why of said) {
    assert.doesNotMatch(why, JARGON, `"${why}" uses a word only somebody already here knows`);
    assert.ok(!why.endsWith("."), `"${why}" is a clause and does not need a full stop`);
    assert.ok(why.length <= 90, `"${why}" is longer than a row (${why.length})`);
  }
  for (const t of titles) {
    assert.doesNotMatch(t, JARGON, `"${t}" is jargon`);
    assert.ok(t.length <= 24, `"${t}" is too long to sit on one line beside a sentence`);
  }
});

// ---- the markup ----

test("the ladder draws one row per rung and no controls at all", () => {
  const { world, config } = stepped(314, 1200);
  const rows = milestoneRows(world, config);
  const html = milestonesHTML(rows);
  assert.equal((html.match(/<li class="msrow/g) || []).length, rows.length);
  assert.equal((html.match(/<button/g) || []).length, 0, "a rung is not something to press");
  assert.equal((html.match(/<a /g) || []).length, 0, "a rung is not somewhere to go");
  for (const r of rows) {
    assert.ok(html.includes(`>${r.title}</span>`), `"${r.title}" is not on the ladder`);
    assert.ok(html.includes(`>${r.why}</span>`), `"${r.why}" is not on the ladder`);
    if (r.done) assert.ok(html.includes(`${r.when}</span>`), `"${r.when}" is not beside its rung`);
  }
  // The tick and the mark are decoration beside words that already say the
  // state, so a listener is not read "seedling, ring".
  assert.equal((html.match(/class="msstate" aria-hidden="true"/g) || []).length, rows.length);
  assert.equal((html.match(/class="msmark" aria-hidden="true"/g) || []).length, rows.length);
  assert.equal(
    (html.match(/class="msrow done"/g) || []).length,
    rows.filter((r) => r.done).length,
    "a ticked rung is not marked as one"
  );
});

test("the signature moves when the ladder does — including on a rung still ahead", () => {
  const { world, config } = stepped(314, 300);
  const first = milestoneSignature(milestoneRows(world, config));
  assert.equal(first, milestoneSignature(milestoneRows(world, config)), "the key is not a function of the rows");
  // The point of keying on the sentences: a pending rung carries a live
  // counter, and that counter creeping toward its threshold is the reason a
  // visitor stays. A key made of `done` flags alone would freeze it.
  let moved = false;
  for (let i = 0; i < 1200 && !moved; i++) {
    world.step();
    if (milestoneSignature(milestoneRows(world, config)) !== first) moved = true;
  }
  assert.ok(moved, "1,200 steps and the panel never had a reason to redraw");
});

test("the page holds the ladder between the key and the cast", () => {
  assert.ok(page.includes('id="milestone-list"'), "the page has nowhere to put the ladder");
  assert.ok(page.includes('id="milestone-count"'), "the page has nowhere to put the count");
  assert.ok(page.includes('id="milestone-fill"'), "the page has nowhere to put the bar");
  assert.ok(page.includes('id="milestone-say"'), "the panel has no spoken summary");
  const key = page.indexOf('class="waterkey"');
  const ms = page.indexOf('class="milestones"');
  const who = page.indexOf('class="whoswho"');
  assert.ok(key < ms && ms < who, "the ladder is not between the key to the water and the cast list");
  assert.match(page.slice(ms, who), /aria-labelledby="milestones-h"/);
  // The bar carries no information the count beside the heading does not.
  assert.match(page.slice(ms, who), /<div class="msbar" aria-hidden="true">/);
});

test("main.js rebuilds the ladder only when it changes", () => {
  const fn = main.match(/function updateMilestones\(world\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "main.js has no adapter for the ladder");
  assert.ok(fn[0].includes("milestoneRows("), "the rows are built somewhere other than milestones.js");
  assert.ok(fn[0].includes("view.milestoneSig"), "the memo is not the one `viewstate.js` owns");
  assert.ok(/return;/.test(fn[0]), "the panel is rebuilt on every frame");
  assert.ok(/\n  updateMilestones\(world\);/.test(main), "the frame loop never calls it");
  const vs = read("src/viewstate.js");
  assert.match(vs, /milestoneSig: "",/, "`milestoneSig` is not on the roster, so a new pond keeps the old one's ladder");
  assert.doesNotMatch(main, /\blet milestoneSig\b/, "main.js declares the memo itself");
});

test("the latch runs on the world's clock, beside the Chronicle's", () => {
  // The whole reason this lives in the engine rather than in the panel: a rung
  // latched on a frame would carry a tick that depends on how fast a laptop
  // paints, and this project's other name for that is a reading of nothing.
  const world = read("src/world.js");
  assert.match(
    world,
    /this\.chronicle\.observe\(this, this\.tick\);\n\s*this\.milestones\.observe\(this, this\.tick\);/,
    "the ladder is not latched inside `World.step`"
  );
  assert.doesNotMatch(main, /milestones\.observe\(/, "main.js latches the ladder on a frame");
  // A loaded world starts a fresh ladder, for the Chronicle's reason: a save
  // carries no record of when this pond did anything.
  assert.match(world, /this\.milestones = new Milestones\(\);\n\s*this\.milestones\.observe\(this, this\.tick\);/);
});
