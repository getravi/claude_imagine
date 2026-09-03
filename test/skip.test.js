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
//  7. **The shape of the stretch** (v1.145) — the half of the report a
//     comparison of two instants could never make. A verdict about a series of
//     numbers, checked against series whose right answer is known because they
//     were written by hand; a drawing, checked against its own box; and the two
//     rules that let the shape take the crowd row's slot.

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
  ARC_FLOOR,
  ARC_MOVE,
  SKIP_FRAME_MS,
  SKIP_HIGHLIGHTS,
  SKIP_LABEL,
  SKIP_MARK,
  SKIP_TRACK_POINTS,
  SPARK,
  crowdOf,
  highlightHTML,
  skipArc,
  skipCard,
  skipHTML,
  skipHighlights,
  skipLength,
  skipProgress,
  skipRows,
  skipSnapshot,
  sparkHTML,
  sparkPoints,
  trackEvery,
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

// ---- 7. the shape of the stretch (v1.145) ----
//
// The five sentences above compare two instants, and a middle is invisible to
// them: a pond that tripled by the halfway mark and gave a third of it back
// reads, to a difference, as *84 were alive when you pressed it, and 154 are
// now*. So the skip counts the crowd as it goes and the card leads with the
// shape of it.
//
// The tests below split the same way the module does. A **verdict** is a
// judgement about a series of numbers and is checked against series written by
// hand, because a shape written by hand is the only one whose right answer is
// known in advance. A **drawing** is arithmetic and is checked against its own
// box. And the two rules that hold the card together — every arc line names
// both ends, and the row it replaced does not also appear — are checked as
// invariants over every shape rather than one at a time.

/** A track that rises to `peak` at `at` of its length and falls to `end`. */
function hill(first, peak, end, k = 21, at = 0.5) {
  const top = Math.round((k - 1) * at);
  return Array.from({ length: k }, (_, i) =>
    i <= top
      ? Math.round(first + ((peak - first) * i) / top)
      : Math.round(peak + ((end - peak) * (i - top)) / (k - 1 - top))
  );
}

/** A track that runs straight from `first` to `last`. */
function ramp(first, last, k = 21) {
  return Array.from({ length: k }, (_, i) => Math.round(first + ((last - first) * i) / (k - 1)));
}

test("a stretch with a turn in it is reported as a turn, not as its endpoints", () => {
  // The finding this whole section exists for. 150 → 247 → 142 ends four below
  // where it started; a difference calls that "quiet" and a visitor who watched
  // the water fill up and empty again is told nothing happened.
  const boom = skipArc(hill(150, 247, 142));
  assert.equal(boom.key, "boom");
  assert.equal(boom.peak, 247);
  assert.match(boom.headline, /boom/i);
  assert.match(boom.line, /247/);

  // …and the same shape upside down: down to a trough, back up again, ending
  // seven below where it started. A difference calls that "quiet" too.
  const dip = skipArc(hill(227, 154, 220));
  assert.equal(dip.key, "crash");
  assert.equal(dip.trough, 154);
  assert.match(dip.headline, /comeback/i);
  assert.match(dip.line, /154/);
});

test("each shape gets its own verdict, and a straight line gets a straight one", () => {
  assert.equal(skipArc(ramp(40, 196)).key, "climb");
  assert.equal(skipArc(ramp(251, 117)).key, "fall");
  assert.equal(skipArc(ramp(228, 238)).key, "quiet");
  assert.equal(skipArc(hill(150, 247, 142)).key, "boom");
  assert.equal(skipArc(hill(227, 154, 220)).key, "crash");
  // Up, down and up again, with both turns real: neither a boom nor a crash on
  // its own, and the card says so rather than picking the half it likes.
  assert.equal(skipArc([100, 300, 70, 150]).key, "swings");
  // Note what is *not* "swings", and it is the case that taught this test: a
  // rise so shallow the fall does not undo it — 100 → 180 → 60 → 175 — is one
  // turn, not two, because the peak and the end are a wash. It is a crash and
  // a comeback, and calling it "it never settled" would be reaching for drama.
  assert.equal(skipArc([100, 180, 60, 100, 175]).key, "crash");
});

test("a turn only counts when it is interior and both of its legs are real", () => {
  // A peak at the last sample is not a boom followed by a crash — there is no
  // crash — and this is the difference between a shape and a rise.
  assert.equal(skipArc(ramp(40, 300)).key, "climb");
  // A hill whose downhill leg is under the threshold is still a climb: the
  // crowd went up and stayed up.
  const shallow = hill(100, 300, 280);
  assert.ok((300 - 280) / 300 < ARC_MOVE);
  assert.equal(skipArc(shallow).key, "climb");
  // And one whose downhill leg clears it is not.
  const steep = hill(100, 300, 200);
  assert.ok((300 - 200) / 300 >= ARC_MOVE);
  assert.equal(skipArc(steep).key, "boom");
});

test("the floor keeps a nearly empty pond from making the loudest headlines", () => {
  // The case the sixty-stretch sweep cannot see, because the sweep almost never
  // visits a pond this small — so it is written down here, which is the only
  // place it exists. Three animals becoming four is a 33% rise and it is not a
  // boom; the same proportions a hundred times over are.
  assert.equal(skipArc([3, 3, 4, 3, 4, 4]).key, "quiet");
  assert.equal(skipArc(ramp(300, 400)).key, "climb");
  // And the floor is a floor rather than a cutoff: a small pond that really
  // does move is still reported.
  assert.equal(skipArc(ramp(4, 60)).key, "climb");
  assert.ok(ARC_FLOOR >= 1);
});

test("an empty pond, and a pond that empties, are told apart", () => {
  const gone = skipArc([120, 90, 40, 8, 0, 0]);
  assert.equal(gone.key, "gone");
  assert.match(gone.line, /120/);
  assert.match(gone.line, /the water is empty/);
  // Empty when it started and empty now: a real answer, and not a death.
  assert.equal(skipArc([0, 0, 0, 0]).key, "empty");
  // Empty when it started and not now: also not a death.
  const born = skipArc([0, 0, 12, 30, 44]);
  assert.equal(born.key, "arrival");
  assert.match(born.line, /44/);
});

test("every arc line names both ends of the stretch", () => {
  // The rule the card is built on: because an arc line always says where the
  // stretch began and where it finished, the crowd row can give up its slot to
  // it. If a shape is ever added that names only one end, this fails and the
  // row has to come back.
  const tracks = [
    ramp(40, 196),
    ramp(251, 117),
    ramp(228, 238),
    hill(150, 247, 142),
    hill(227, 154, 220),
    [100, 300, 70, 150],
    [120, 90, 40, 8, 0, 0],
    [0, 0, 12, 30, 44],
    [0, 0, 0, 0],
  ];
  for (const track of tracks) {
    const arc = skipArc(track);
    for (const v of [arc.first, arc.last]) {
      // An end of zero is named in words rather than in figures, because
      // "0 animals were alive" is not English and "the water was empty" is the
      // same fact said properly. Both count as naming the end; a silent one
      // does not.
      if (v === 0) {
        assert.match(arc.line, /empty/, `${arc.key}: "${arc.line}" never says the water was empty`);
        continue;
      }
      assert.match(
        arc.line,
        new RegExp(`\\b${v.toLocaleString("en-US")}\\b`),
        `${arc.key}: "${arc.line}" never says ${v}`
      );
    }
    // And a headline is a headline: short enough to be read at a glance.
    assert.ok(arc.headline.split(/\s+/).length <= 6, `${arc.key}: headline is a paragraph`);
    assert.match(arc.headline, /[.!]$/, `${arc.key}: headline is not a sentence`);
  }
});

test("a track too short to have a shape gets no shape rather than a guess", () => {
  for (const bad of [null, undefined, [], [12], [12, 20]]) {
    assert.equal(skipArc(bad), null);
  }
});

// ---- the drawing ----

test("the drawing is scaled from zero, not from its own smallest point", () => {
  // A line drawn between its own extremes turns any wobble into a mountain
  // range — the truncated axis every misleading news graphic is made of — and
  // this one sits directly under a sentence saying how far the crowd moved.
  const flat = sparkPoints([200, 202, 201, 203]);
  const spread = Math.max(...flat.map((p) => p.y)) - Math.min(...flat.map((p) => p.y));
  assert.ok(spread < SPARK.h * 0.05, `a 1% wobble drew ${spread} units of hill`);
  // A doubling, on the other hand, covers half the box.
  const doubled = sparkPoints([100, 200]);
  assert.ok(doubled[0].y - doubled[1].y > (SPARK.h - SPARK.pad * 2) * 0.45);
});

test("the drawing fills its box and stays inside it", () => {
  const pts = sparkPoints([10, 300, 4, 120]);
  assert.equal(pts.length, 4);
  assert.equal(pts[0].x, SPARK.pad);
  assert.equal(pts[pts.length - 1].x, SPARK.w - SPARK.pad);
  for (const p of pts) {
    assert.ok(p.y >= SPARK.pad - 0.01 && p.y <= SPARK.h - SPARK.pad + 0.01, `y ${p.y} is outside`);
  }
  // The tallest point sits on the ceiling and the shortest is above the floor.
  assert.ok(Math.abs(pts[1].y - SPARK.pad) < 0.01);
});

test("the drawing marks the turn its sentence is about, and nothing else", () => {
  const boomTrack = hill(150, 247, 142);
  const boom = sparkHTML(boomTrack, skipArc(boomTrack));
  assert.match(boom, /<polyline class="spark-line"/);
  assert.match(boom, /<polygon class="spark-fill"/);
  assert.match(boom, /<circle class="spark-turn"/);
  // A climb has no turn to point at, so there is no pin on it.
  const climbTrack = ramp(40, 196);
  const climb = sparkHTML(climbTrack, skipArc(climbTrack));
  assert.ok(!climb.includes("spark-turn"), "a straight climb was given a turning point");
  // And the pin is where the peak is: past the middle of the box for a late
  // peak, before it for an early one.
  const late = sparkHTML(hill(100, 300, 120, 21, 0.8), skipArc(hill(100, 300, 120, 21, 0.8)));
  const cx = Number(late.match(/spark-turn" cx="([\d.]+)"/)[1]);
  assert.ok(cx > SPARK.w / 2, `a peak at four fifths was drawn at ${cx}`);
});

test("the drawing's label is what the shape was, not what the picture is", () => {
  // A reader who cannot see it is owed the finding, not the format. "A line
  // chart of population over time" is what every alt text on the web says and
  // it tells nobody anything.
  const track = hill(150, 247, 142);
  const arc = skipArc(track);
  const svg = sparkHTML(track, arc);
  assert.ok(svg.includes(`aria-label="${arc.line}"`), svg.slice(0, 200));
  assert.match(svg, /role="img"/);
  // Nothing to draw draws nothing, rather than an empty box.
  assert.equal(sparkHTML([7], null), "");
});

// ---- the card, and the row the shape replaced ----

test("the shape takes the crowd row's slot rather than repeating it", () => {
  // v1.143's finding, one surface over: when a new thing says an old thing's
  // sentence in better words, the old one goes. Every arc line names both ends
  // — the test above is that rule — so the crowd row would be the same fact
  // twice, once with a turn in it and once without.
  const { world, before, config } = skipped(314);
  const track = ramp(before.pop, world.creatures.length);
  const withShape = skipCard(before, world, config, track);
  assert.ok(withShape.arc, "a card built with a count has no shape");
  assert.ok(!withShape.rows.some((r) => r.key === "crowd"), "the crowd row was drawn twice");
  assert.ok(withShape.spark.startsWith("<svg"));
  // And a skip with no count — one interrupted, or a caller from before
  // v1.145 — degrades to the card this was rather than to a blank.
  const without = skipCard(before, world, config);
  assert.equal(without.arc, null);
  assert.equal(without.spark, "");
  assert.ok(without.rows.some((r) => r.key === "crowd"), "the card lost its crowd row");
});

test("the shape is composed without touching the pond or its generator", () => {
  // Directive 2, on the new half. Everything here is a pure reading: the count
  // is taken by an observer between steps, and turning it into a headline and a
  // drawing must not reach into the world at all.
  const { world, before, config } = skipped(42);
  const track = Array.from({ length: SKIP_TRACK_POINTS }, (_, i) => 40 + i * 3);
  const draws = drawStream(world.rng);
  const hash = stateFingerprint(world);
  for (let i = 0; i < 20; i++) skipCard(before, world, config, track);
  assert.equal(draws.count, 0);
  assert.equal(stateFingerprint(world), hash);
});

// ---- the running count ----

test("the count is taken on the step, so every machine draws the same shape", () => {
  // A count sampled once a frame would be a different shape on a phone, because
  // how many steps a frame buys is a property of the machine. This is the
  // arithmetic `main.js` uses, and it depends only on the step number.
  const total = skipLength(makeConfig({ seed: 1 }));
  const every = trackEvery(total);
  assert.equal(every, Math.round(total / SKIP_TRACK_POINTS));
  // Walked the way the pump walks it, in chunks of every size a frame could buy.
  const sampledAt = [];
  let left = total;
  for (const size of [1, 7, 60, 200, 3, 41, 500, 900, 5000]) {
    for (let i = 0; i < size && left > 0; i++) {
      left--;
      const done = total - left;
      if (done % every === 0 || left === 0) sampledAt.push(done);
    }
  }
  // One opening point plus these, and the last of them is the end of the skip.
  assert.equal(sampledAt[sampledAt.length - 1], total);
  assert.equal(sampledAt.length + 1, SKIP_TRACK_POINTS + 1);
  // No step is sampled twice, whatever the chunking.
  assert.equal(new Set(sampledAt).size, sampledAt.length);
  // A skip shorter than the point count still samples every step rather than
  // dividing by zero.
  assert.equal(trackEvery(9), 1);
  assert.equal(trackEvery(0), 1);
});

test("the count counts the living, the same way the card's own numbers do", () => {
  // Two counts of the same thing, written twice, is how the shape and the
  // sentences come to disagree. They are the same count.
  const world = pond(7, 400);
  assert.equal(crowdOf(world), skipSnapshot(world).pop);
  // And a corpse still in the array — which is what the inside of a step looks
  // like — is not a crowd member to either of them.
  world.creatures[0].dead = true;
  assert.equal(crowdOf(world), skipSnapshot(world).pop);
});

test("a real skip produces a shape that agrees with the pond it describes", () => {
  // The hand-written tracks above prove the classifier; this proves the wiring
  // reaches a real pond. Sampled exactly as `main.js` samples it.
  const world = pond(7, 0);
  const before = skipSnapshot(world);
  const total = skipLength(world.config);
  const every = trackEvery(total);
  const track = [crowdOf(world)];
  for (let i = 1; i <= total; i++) {
    world.step();
    if (i % every === 0 || i === total) track.push(crowdOf(world));
  }
  assert.equal(track.length, SKIP_TRACK_POINTS + 1);
  const card = skipCard(before, world, world.config, track);
  // Seed 7 from a standing start is the sweep's clearest hill: forty animals,
  // up past two hundred, and a good chunk of it given back.
  assert.equal(card.arc.key, "boom");
  assert.equal(card.arc.first, before.pop);
  assert.equal(card.arc.last, skipSnapshot(world).pop);
  assert.ok(card.arc.peak > card.arc.first && card.arc.peak > card.arc.last);
  assert.match(card.spark, /<svg class="spark"/);
});

test("the page, the roster and the module agree about the shape", () => {
  for (const id of ["skipcard-arc", "skipcard-arc-head", "skipcard-arc-line", "skipcard-spark"]) {
    assert.ok(page.includes(`id="${id}"`), `the card has no #${id}`);
    assert.ok(main.includes(`"${id}"`), `main.js never touches #${id}`);
  }
  // The count is a fact about *this* pond: carried over, it would draw one
  // pond's shape under another pond's name.
  assert.ok(WORLD_SCOPED.includes("skipTrack"), "skipTrack is not on the roster");
  assert.ok(!main.includes("let skipTrack"), "main.js keeps a private skipTrack");
  // Every class the drawing wears has a rule.
  for (const cls of ["skiparc", "skiparc-head", "skiparc-spark", "skiparc-line", "spark", "spark-fill", "spark-line", "spark-turn"]) {
    assert.ok(styles.includes(`.${cls} {`), `.${cls} has no rule in the stylesheet`);
  }
});
