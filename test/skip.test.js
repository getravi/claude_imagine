// skip.test.js — the fast-forward and the note it leaves (v1.142).
//
// This control is the first one here that both **moves the pond** and **reports
// on it**, and the two halves fail in different ways. The moving half's only
// job is to be indistinguishable from having waited, which is directive 2 with
// a button on it. The reporting half is a comparison across time, and a
// comparison across time can be wrong in ways a reading of the present cannot:
// measured against the wrong pond, against a baseline that quietly moved, or
// padded out with sentences about things that did not happen.
//
// So, in order:
//
//  1. **A skip is waiting, done faster.** The pond a skip arrives at is the
//     pond that was left running for the same number of steps, bit for bit —
//     and composing the card draws no random number.
//  2. **How far it goes is the pond's own constant**, not a number this module
//     picked.
//  3. **A row that is not true is not drawn**, and the sentences that are drawn
//     are arithmetic on two snapshots rather than on one.
//  4. **The highlights are the Chronicle's, sliced honestly** — everything
//     shown happened inside the stretch, and everything not shown is counted.
//  5. **The prose clears the vocabulary bar** the other narrators clear.
//  6. **The page, the roster and the module agree** about the control that
//     drives all of this.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { stateFingerprint, drawStream } from "../src/fingerprint.js";
import { WORLD_SCOPED, PAGE_SCOPED } from "../src/viewstate.js";
import {
  SKIP_FRAME_MS,
  SKIP_HIGHLIGHTS,
  SKIP_LABEL,
  SKIP_MARK,
  highlightHTML,
  skipCard,
  skipHTML,
  skipHighlights,
  skipLength,
  skipProgress,
  skipRows,
  skipSnapshot,
} from "../src/skip.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const page = read("app/index.html");
const main = read("src/main.js");
const styles = read("style.css");

/** A pond, run on. */
function pond(seed, ticks = 0) {
  const world = new World(makeConfig({ seed }));
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

/** A pond, a snapshot of it, and the pond `steps` further on. */
function skipped(seed, from = 600, steps = null) {
  const world = pond(seed, from);
  const before = skipSnapshot(world);
  const n = steps == null ? skipLength(world.config) : steps;
  for (let i = 0; i < n; i++) world.step();
  return { world, before, config: world.config };
}

// ---- 1. a skip is waiting, done faster ----

test("a pond that was skipped is the pond that was left running", () => {
  // The whole safety argument for this control in one assertion. `main.js`
  // spreads the steps across frames on a time budget, so the *number* of frames
  // a skip takes is a property of the machine — but the number of steps is
  // fixed, and this is what says that is the only thing that varies. A pond
  // stepped 2,600 times in one loop and a pond stepped 2,600 times in fifty
  // chunks of arbitrary size must be the same pond.
  const config = makeConfig({ seed: 314 });
  const straight = new World(config);
  const chunked = new World(makeConfig({ seed: 314 }));
  const total = skipLength(config);
  for (let i = 0; i < total; i++) straight.step();
  // Chunks of every size a frame budget could plausibly buy, including one.
  let done = 0;
  for (const size of [1, 7, 60, 200, 3, 41, 500]) {
    for (let i = 0; i < size && done < total; i++, done++) chunked.step();
  }
  while (done < total) {
    chunked.step();
    done++;
  }
  assert.equal(stateFingerprint(chunked), stateFingerprint(straight));
});

test("composing the card draws no random numbers", () => {
  // Directive 2 in its cheapest form, `postcard.js`'s test one surface over. A
  // report that reached into the world's generator would make a pond depend on
  // whether anybody had pressed the button that reports on it.
  const { world, before, config } = skipped(314);
  const draws = drawStream(world.rng);
  for (let i = 0; i < 20; i++) skipCard(before, world, config);
  assert.equal(draws.count, 0);
});

test("reading the pond for a card does not move it", () => {
  const { world, before, config } = skipped(42);
  const sig = stateFingerprint(world);
  skipSnapshot(world);
  skipRows(before, world);
  skipCard(before, world, config);
  skipHighlights(world.chronicle.events, before.tick);
  assert.equal(stateFingerprint(world), sig);
});

// ---- 2. how far it goes ----

test("a skip is the pond's own year, taken from the config", () => {
  // Not a constant in this module. The sweep behind the choice is in the
  // module's header: at this length every one of sixty sampled skips had at
  // least one Chronicle line to show, and at half of it four came back empty.
  for (const seasonLength of [2600, 1200, 4000]) {
    assert.equal(skipLength(makeConfig({ seed: 1, seasonLength })), seasonLength);
  }
});

test("the frame budget sits inside the band the browser walk measured", () => {
  // The table in the module's header. Below 12 ms the skip spends itself
  // drawing (5.3 s); above 40 the wall clock has bottomed out on the stepping
  // and a larger budget only buys a worse animation. A value outside the band
  // is a value nobody measured.
  assert.ok(SKIP_FRAME_MS >= 12 && SKIP_FRAME_MS <= 40, `${SKIP_FRAME_MS} ms`);
});

// ---- 3. the sentences ----

test("a skip that went nowhere reports nothing but the crowd", () => {
  // `postcard.js`'s rule 3. Five rows are possible and only one of them is
  // unconditional; a card that padded the other four with "no change" would be
  // describing a stretch in which nothing happened by listing what did not.
  const world = pond(314, 500);
  const rows = skipRows(skipSnapshot(world), world);
  assert.deepEqual(
    rows.map((r) => r.key),
    ["crowd"]
  );
});

test("every row is arithmetic on the two snapshots, not on one", () => {
  // The failure this catches is a turnover row that reports the pond's
  // lifetime books instead of the stretch: `stats.births` counts from tick one,
  // so a card that printed it would tell a visitor 900 animals were born while
  // they were away on a pond that had been running for an hour.
  const { world, before } = skipped(314, 3000);
  const rows = skipRows(before, world);
  const turnover = rows.find((r) => r.key === "turnover");
  assert.ok(turnover, "a 2,600-step stretch of a running pond bred nothing");
  const born = world.stats.births - before.births;
  assert.match(turnover.text, new RegExp(`\\b${born.toLocaleString("en-US")}\\b`));
  assert.ok(
    !turnover.text.includes(world.stats.births.toLocaleString("en-US")) || born === world.stats.births,
    `the turnover row is quoting the pond's whole life: "${turnover.text}"`
  );
});

test("an emptied pond is told so, and nothing else claims a survivor", () => {
  // The state every narrator here gets wrong first. A skip can end a pond, and
  // it is the one outcome a fast-forward is most likely to produce, because it
  // is the one that needs time.
  const world = pond(7, 400);
  const before = skipSnapshot(world);
  for (const c of world.creatures) c.dead = true;
  const rows = skipRows(before, world);
  assert.equal(rows[0].key, "crowd");
  assert.match(rows[0].text, /the water is empty/);
  for (const r of rows) assert.doesNotMatch(r.text, /are now\./);
});

test("a pond that was already empty is not told it emptied", () => {
  const world = pond(7, 400);
  for (const c of world.creatures) c.dead = true;
  const before = skipSnapshot(world);
  const rows = skipRows(before, world);
  assert.match(rows[0].text, /was already empty/);
});

// ---- 4. the highlights ----

test("every line shown was written inside the stretch that was skipped", () => {
  // The slice, checked from both ends: nothing from before the press gets on
  // the card, and the newest line in the pond is the last one on it.
  for (const seed of [314, 42, 2718]) {
    const { world, before } = skipped(seed, 1500);
    const { shown } = skipHighlights(world.chronicle.events, before.tick);
    const during = world.chronicle.events.filter((e) => e.tick > before.tick);
    for (const line of shown) assert.ok(line.text.length > 0);
    assert.ok(shown.length <= SKIP_HIGHLIGHTS, `${shown.length} lines shown`);
    if (during.length > 0) {
      assert.equal(shown.at(-1).icon, during.at(-1).icon);
      assert.ok(shown.length > 0, "a stretch with lines in it showed none");
    }
  }
});

test("what the card leaves out, it counts", () => {
  // The playbook's rule about a capped narration: it must say what it skipped,
  // or it is the always-full buffer with a friendlier face. Checked as an
  // identity rather than as a sentence, so it cannot drift.
  for (const seed of [314, 42, 2718, 1837]) {
    const { world, before, config } = skipped(seed, 2000);
    const during = world.chronicle.events.filter((e) => e.tick > before.tick);
    const card = skipCard(before, world, config);
    assert.equal(card.highlights.length + card.more, during.length);
    if (card.more > 0) {
      assert.match(card.moreLine, /Chronicle/);
      assert.match(card.moreLine, new RegExp(`\\b${card.more.toLocaleString("en-US")}\\b`));
    } else {
      assert.equal(card.moreLine, "");
    }
  }
});

test("a chronicle that has forgotten the stretch does not invent one", () => {
  // The buffer holds 140 lines. A skip long enough to overflow it can only show
  // what is left, and the count of what is missing is a count of what the
  // narrator still has — an honest under-report rather than a guess.
  const events = [
    { tick: 10, icon: "🌊", msg: "The pond swells past 100 creatures.", who: -1 },
    { tick: 20, icon: "🌿", msg: "Green returns.", who: -1 },
  ];
  assert.deepEqual(skipHighlights(events, 20), { shown: [], more: 0 });
  assert.equal(skipHighlights(events, 5).shown.length, 2);
  assert.equal(skipHighlights([], 0).more, 0);
});

// ---- 5. plain words ----

/**
 * A run, sampled — every skip a visitor could press on this pond, rather than
 * the one instant a test is cheapest to write. The playbook's rule: the end of
 * a run is the most biased moment there is.
 */
function* everyCard(seed, ticks = 6000, every = 650) {
  const world = new World(makeConfig({ seed }));
  let before = skipSnapshot(world);
  for (let i = 1; i <= ticks; i++) {
    world.step();
    if (i % every === 0) {
      yield skipCard(before, world, world.config);
      before = skipSnapshot(world);
    }
  }
}

test("every sentence on the card is one a stranger could read aloud", () => {
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|gene|tick|ticks|px|pixels?|metabolis\w*|predation|fitness|phenotype|RNG|seed|species)\b/i;
  const said = new Set();
  for (const seed of [314, 42, 2718, 1837]) {
    for (const card of everyCard(seed)) {
      assert.match(card.title, /^⏩ /u);
      assert.doesNotMatch(card.sub, JARGON);
      for (const r of card.rows) said.add(r.text);
      if (card.moreLine) said.add(card.moreLine);
    }
  }
  assert.ok(said.size >= 8, `only ${said.size} kinds of sentence ever appeared`);
  for (const text of said) {
    assert.doesNotMatch(text, JARGON, `"${text}" uses a word only somebody already here knows`);
    assert.match(text, /^[A-Z0-9]/u, `"${text}" does not start like a sentence`);
    assert.match(text, /[.]$/, `"${text}" does not finish like one`);
    assert.ok(text.length <= 130, `"${text}" is ${text.length} characters`);
  }
});

test("the progress on the button counts up and never says it is done early", () => {
  const total = 2600;
  let last = -1;
  for (const done of [0, 1, 400, 1300, 2599]) {
    const label = skipProgress(done, total);
    assert.match(label, /^⏩ Skipping ahead… \d{1,2}%$/u);
    const share = parseInt(label.match(/(\d+)%/)[1], 10);
    assert.ok(share >= last, `${share}% follows ${last}%`);
    assert.ok(share <= 99, `${share}% before the last step`);
    last = share;
  }
  assert.equal(skipProgress(0, 0), `${SKIP_MARK} Skipping ahead… 0%`);
});

// ---- 6. the page, the roster and the module ----

test("the markup is one element per row and carries the row's key", () => {
  const { world, before, config } = skipped(314, 1200);
  const card = skipCard(before, world, config);
  const html = skipHTML(card.rows);
  assert.equal((html.match(/<li /g) || []).length, card.rows.length);
  for (const r of card.rows) assert.ok(html.includes(`data-skip-row="${r.key}"`));
  const his = highlightHTML(card.highlights);
  assert.equal((his.match(/<li /g) || []).length, card.highlights.length);
  // The mark is decoration beside a sentence that already says it.
  if (card.highlights.length > 0) assert.match(his, /aria-hidden="true"/);
});

test("the control the page draws is the control this module names", () => {
  assert.ok(page.includes('id="btn-skip"'), "the page has no fast-forward");
  assert.ok(page.includes(`>${SKIP_LABEL}<`), `the button does not say "${SKIP_LABEL}"`);
  for (const id of [
    "skipcard",
    "skipcard-scrim",
    "skipcard-card",
    "skipcard-title",
    "skipcard-sub",
    "skipcard-lines",
    "skipcard-hi-head",
    "skipcard-highlights",
    "skipcard-more",
    "skipcard-again",
    "skipcard-close",
  ]) {
    assert.ok(page.includes(`id="${id}"`), `the card has no #${id}`);
    assert.ok(main.includes(`"${id}"`), `main.js never touches #${id}`);
  }
  // The keyboard hint is a promise the handler has to keep.
  assert.match(page, /<kbd>S<\/kbd> skip ahead/);
  assert.match(main, /case "s":/);
});

test("the skip in flight is world-scoped and its focus is not", () => {
  // The roster's whole argument, on the one field here that would be dangerous
  // rather than merely stale if it were inherited: a card built from the last
  // pond's population against this one's would announce a crash that never
  // happened.
  for (const field of ["skipLeft", "skipTotal", "skipFrom"]) {
    assert.ok(WORLD_SCOPED.includes(field), `${field} is not on the roster`);
    assert.ok(!main.includes(`let ${field}`), `main.js keeps a private ${field}`);
  }
  assert.ok(PAGE_SCOPED.skipReturn, "where focus came from is not a fact about the pond");
  // And the pond being adopted is what puts the button back — one place rather
  // than one per control that can replace a world.
  assert.match(main, /restoreSkipButton\(\);/);
});

test("the card wears the postcard's chrome rather than a second set of rules", () => {
  // Two dialogs that look alike should be one set of rules. Every class the
  // card's chrome uses is grouped with the postcard's own selector in the
  // stylesheet; what is new is only what this card has and that one does not.
  for (const cls of ["skipcard", "skipcard-scrim", "skipcard-card", "skipcard-title", "skipcard-sub", "skipcard-lines", "skipcard-btns"]) {
    assert.match(
      styles,
      new RegExp(`\\.postcard[\\w-]*,\\n\\.${cls} \\{`),
      `.${cls} has rules of its own instead of the postcard's`
    );
  }
  // And no new ink: the two the card uses are both already priced on this
  // ground in `legibility.js`'s inventory.
  const block = styles.slice(styles.indexOf("---- The fast-forward's card"));
  const inks = new Set(block.slice(0, block.indexOf("---- Phylogeny")).match(/var\(--ink[\w-]*\)/g) || []);
  assert.deepEqual([...inks].sort(), ["var(--ink)", "var(--ink-dim)"]);
});
