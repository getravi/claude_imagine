// records.test.js — the book of records (v1.124).
//
// This board is the first surface here that keeps a name after the animal is
// gone, so most of the claims below are about *memory* rather than about
// rendering:
//
//  1. **A record is taken every tick, by the books.** It never goes backwards,
//     it does not depend on the order `world.creatures` happens to be in, and
//     it survives the death of the animal holding it — which is the case the
//     whole feature exists for, and the common one (57.0% of the instants that
//     show the young row name somebody already dead).
//  2. **Every row is true of the world it was read from**, checked against the
//     books and the tree rather than against itself.
//  3. **A row that is not a record is not drawn**, and the floors are the ones
//     `cast.js` and `phylogeny.js` already own.
//  4. **The prose clears the vocabulary bar** `cast.js`, `headline.js`,
//     `obituary.js`, `key.js` and `whoswho.js` all clear.
//  5. **Reading the pond does not move it.**

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { nameSpecies } from "../src/speciesnames.js";
import { stateFingerprint, drawStream, STATS_HASHED, STATS_UNHASHED } from "../src/fingerprint.js";
import { PARENT_MIN_CHILDREN, givenName } from "../src/cast.js";
import { MULLER_MIN_PEAK } from "../src/phylogeny.js";
import {
  FAMILY_MIN_PEAK,
  RECORDS_EMPTY,
  RECORD_ID_ATTR,
  RECORD_MARK,
  RECORD_TITLE,
  YOUNG_MIN,
  recordRows,
  recordSignature,
  recordsHTML,
  yearOf,
} from "../src/records.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const page = read("app/index.html");
const main = read("src/main.js");

const names = (world) => nameSpecies(world.phylogeny.species);

/** A pond stepped far enough to have records, with its family names. */
function stepped(seed, ticks, over = {}) {
  const config = makeConfig({ seed, ...over });
  const world = new World(config);
  for (let i = 0; i < ticks; i++) world.step();
  return { world, config, names: names(world) };
}

const rowOf = (rows, key) => rows.find((r) => r.key === key) || null;

/**
 * A pond stopped at a moment when the young record is held by somebody still
 * alive. Two tests need one, and it is not a moment a fixed tick count gives
 * you: 57.0% of the instants that show the row name an animal already dead, so
 * "step 2,500 ticks and look" is a coin flip. Stopping on the condition is the
 * honest way to test the transition from *held by the living* to *held by the
 * dead* — the state the whole board exists for.
 */
function steppedToLivingHolder(seed, limit = 6000) {
  const config = makeConfig({ seed });
  const world = new World(config);
  for (let i = 0; i < limit; i++) {
    world.step();
    const rec = world.stats.recordYoung;
    if (rec.alive === 1 && rec.children >= YOUNG_MIN) return { world, config, names: names(world) };
  }
  throw new Error(`seed ${seed} never held a young record with its holder alive in ${limit} ticks`);
}

/** A world-shaped object: the three things `recordRows` reads and nothing else. */
function pond({ creatures = [], recordYoung = null, recordYoungId = -1, maxPopEver = 0, maxPopTick = 0, species = [] } = {}) {
  return {
    creatures,
    stats: {
      recordYoung: recordYoung ?? { children: 0, tick: 0, alive: 0 },
      recordYoungId,
      maxPopEver,
      maxPopTick,
    },
    phylogeny: { species },
  };
}

// ---- 1. a record is taken every tick, and it remembers ----

test("the young record only ever goes up, and its holder is the pond's own best", () => {
  const { world } = stepped(314, 0);
  let last = 0;
  let everSaw = 0;
  for (let i = 0; i < 2500; i++) {
    world.step();
    const rec = world.stats.recordYoung;
    assert.ok(rec.children >= last, `the record fell from ${last} to ${rec.children} at tick ${world.tick}`);
    last = rec.children;
    // Nobody currently in the water has beaten it without it moving.
    for (const c of world.creatures) {
      assert.ok(c.children <= rec.children, `${c.id} has raised more young than the record at tick ${world.tick}`);
    }
    const holder = world.creatures.find((c) => c.id === world.stats.recordYoungId && !c.dead);
    assert.equal(rec.alive, holder ? 1 : 0, "the books disagree about whether the record holder is alive");
    if (rec.children >= YOUNG_MIN && !holder) everSaw++;
  }
  assert.ok(last >= YOUNG_MIN, `seed 314 raised nobody past ${YOUNG_MIN} young in 2,500 ticks`);
  // The case the board exists for, and it is the common one: over twelve ponds
  // sampled to six thousand ticks, 57.0% of the instants that show this row
  // name an animal the pond has already buried.
  assert.ok(everSaw > 0, "the record never once outlived its holder — the feature is untested");
});

test("the record does not depend on the order the pond happens to be in", () => {
  // `shuffleTurnOrder` (v1.47) is allowed to permute `world.creatures`, so a
  // record that kept the *first* maximum would move when a switch nobody
  // pressed was flipped.
  const { world } = stepped(42, 1200);
  const before = { ...world.stats.recordYoung, id: world.stats.recordYoungId };
  world.creatures.reverse();
  world.stats.sample(world);
  assert.deepEqual(
    { ...world.stats.recordYoung, id: world.stats.recordYoungId },
    before,
    "reversing the pond moved the record"
  );
});

test("the row keeps the name after the animal is gone, and stops offering to follow them", () => {
  const { world, config, names: nm } = steppedToLivingHolder(314);
  const rec = world.stats.recordYoung;
  const heldBy = world.stats.recordYoungId;
  const holder = world.creatures.find((c) => c.id === heldBy && !c.dead);
  assert.ok(holder, "the pond stopped at a moment its own books call alive, with nobody there");
  const alive = rowOf(recordRows(world, config, nm), "young");
  assert.ok(alive.why.includes(givenName(heldBy)), "the living holder is not named");
  assert.match(alive.why, /still in the water/);
  assert.equal(alive.id, heldBy, "a living holder's row cannot be followed");
  assert.ok(alive.hue !== null, "a living holder has no swatch to find them by");

  // Bury them. The record is theirs; the invitation to go and look is not.
  holder.die("age");
  world.creatures = world.creatures.filter((c) => c !== holder);
  world.stats.sample(world);
  const dead = rowOf(recordRows(world, config, nm), "young");
  assert.ok(dead.why.includes(givenName(heldBy)), "the record forgot its holder the moment they died");
  assert.match(dead.why, /gone now, and unbeaten since/);
  assert.equal(dead.id, -1, "a dead animal is still being offered as something to watch");
  assert.equal(dead.hue, null, "a dead animal still carries a swatch that says go and find them");
  assert.ok(dead.why.includes(`${rec.children} young`), "the count moved when the holder died");
});

// ---- 2. every row is true of the world it was read from ----

test("every number on the board is one the books or the tree can produce", () => {
  for (const seed of [3, 42, 128, 314]) {
    const { world, config, names: nm } = stepped(seed, 2000);
    const rows = recordRows(world, config, nm);
    assert.ok(rows.length > 0, `seed ${seed} has no records after 2,000 ticks`);

    const young = rowOf(rows, "young");
    if (young) assert.ok(young.why.includes(`${world.stats.recordYoung.children} young`), "the young row invented a count");

    const crowd = rowOf(rows, "crowd");
    if (crowd) {
      assert.ok(crowd.why.startsWith(`${world.stats.maxPopEver} animals`), "the crowd row invented a number");
      const now = world.creatures.filter((c) => !c.dead).length;
      assert.equal(
        crowd.why.includes("right now"),
        now >= world.stats.maxPopEver,
        `seed ${seed}: the crowd row is confused about whether the record is the present moment`
      );
    }

    const family = rowOf(rows, "family");
    if (family) {
      const peak = Math.max(...world.phylogeny.species.map((s) => s.peak));
      assert.ok(family.why.includes(`${peak} at once`), "the family row is not about the biggest family");
      const top = world.phylogeny.species.find((s) => s.peak === peak);
      assert.ok(family.why.includes(nm.get(top.id).plural), "the family row names the wrong family");
    }
    // Every row carries a mark and a title from the tables, and no two rows are
    // the same record said twice.
    for (const r of rows) {
      assert.equal(r.icon, RECORD_MARK[r.key], `the ${r.key} row wears the wrong mark`);
      assert.equal(r.what, RECORD_TITLE[r.key], `the ${r.key} row is titled wrong`);
    }
    assert.equal(new Set(rows.map((r) => r.key)).size, rows.length, "a record is on the board twice");
  }
});

test("the marks and titles are one per record, all different", () => {
  assert.deepEqual(Object.keys(RECORD_MARK), Object.keys(RECORD_TITLE));
  const marks = Object.values(RECORD_MARK);
  assert.equal(new Set(marks).size, marks.length, "two records wear the same mark");
});

test("the crowd record carries the year it was set, and drops it in a pond with no years", () => {
  const { world, config, names: nm } = stepped(314, 3000);
  const crowd = rowOf(recordRows(world, config, nm), "crowd");
  if (crowd && !crowd.why.includes("right now")) {
    const year = yearOf(world.stats.maxPopTick, config);
    assert.ok(crowd.why.includes(`back in year ${year}`), "the crowd record has no date on it");
  }
  const flat = stepped(314, 1500, { seasons: false });
  const noYear = rowOf(recordRows(flat.world, flat.config, flat.names), "crowd");
  if (noYear && !noYear.why.includes("right now")) {
    assert.doesNotMatch(noYear.why, /year/, "a pond with no seasons was given a year to be in");
  }
  assert.equal(yearOf(0, flat.config), 0, "a pond with no seasons has a year anyway");
});

// ---- 3. a row that is not a record is not drawn ----

test("the floors are the ones the rest of the project already owns", () => {
  assert.equal(YOUNG_MIN, PARENT_MIN_CHILDREN, "the board disagrees with the cast list about what a parent is");
  assert.equal(FAMILY_MIN_PEAK, MULLER_MIN_PEAK, "the board disagrees with the tree about what a family is");
});

test("nothing below a floor reaches the board, and an empty board says so", () => {
  const config = makeConfig({ seed: 1 });
  const bare = pond({
    creatures: [],
    recordYoung: { children: YOUNG_MIN - 1, tick: 10, alive: 0 },
    recordYoungId: 5,
    maxPopEver: config.populationStart, // the founders, standing where they were dropped
    species: [{ id: 0, peak: FAMILY_MIN_PEAK - 1, count: 1 }],
  });
  assert.deepEqual(recordRows(bare, config), []);
  const html = recordsHTML([]);
  assert.ok(html.includes(RECORDS_EMPTY), "the empty board says nothing");
  assert.ok(!html.includes("<button"), "the empty board offers something to press");

  // One more animal than the pond was handed is a record; the founders are not.
  const grown = pond({ maxPopEver: config.populationStart + 1, maxPopTick: 500 });
  assert.equal(recordRows(grown, config).length, 1, "growing past the founders is not being recorded");
});

test("a family that is gone still holds the record, and the row says so", () => {
  // Measured unreachable in every pond swept — 1,080 instants over five
  // configurations, including ponds with no reseeding and ponds with disease,
  // all of them keeping the biggest family alive: in this world, being the
  // largest family is what winning looks like, and the winner does not die
  // while the pond lives. The branch is kept because a record that vanished
  // with its holder would not be a record, and it is exercised here since no
  // default world will do it.
  const config = makeConfig({ seed: 1 });
  const rows = recordRows(pond({ species: [{ id: 0, peak: 30, count: 0 }] }), config, new Map([[0, { plural: "Amber Whorls" }]]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].why, "the Amber Whorls, 30 at once — none left now");
});

// ---- the memo ----

test("the signature moves when a holder dies, though the record does not", () => {
  const { world, config, names: nm } = steppedToLivingHolder(314);
  const rows = recordRows(world, config, nm);
  const sig = recordSignature(rows);
  assert.equal(recordSignature(recordRows(world, config, nm)), sig, "the same pond gave two signatures");
  const holder = world.creatures.find((c) => c.id === world.stats.recordYoungId && !c.dead);
  assert.ok(holder, "no living holder to bury");
  world.creatures = world.creatures.filter((c) => c !== holder);
  world.stats.sample(world);
  assert.notEqual(recordSignature(recordRows(world, config, nm)), sig, "the board would have kept a buried animal on screen");
});

// ---- 4. the vocabulary bar ----

test("nothing on the board uses a word only somebody already here knows", () => {
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|RNG|seed|species)\b/i;
  assert.doesNotMatch(RECORDS_EMPTY, JARGON, "the empty line reaches for a word a visitor may not have");
  const said = new Set();
  for (const seed of [3, 42, 128, 314]) {
    const { world, config, names: nm } = stepped(seed, 2500);
    for (const r of recordRows(world, config, nm)) said.add(r.why);
  }
  assert.ok(said.size >= 3, `only ${said.size} kinds of sentence ever appeared — the bar is barely tested`);
  for (const why of said) {
    assert.doesNotMatch(why, JARGON, `"${why}" uses a word only somebody already here knows`);
    assert.ok(!why.endsWith("."), `"${why}" is a clause and does not need a full stop`);
    assert.ok(why.length <= 90, `"${why}" is longer than a row`);
  }
  for (const title of Object.values(RECORD_TITLE)) assert.doesNotMatch(title, JARGON, `"${title}" is jargon`);
});

// ---- the markup ----

test("only a row you can act on is a control", () => {
  const { world, config, names: nm } = stepped(314, 2500);
  const rows = recordRows(world, config, nm);
  const html = recordsHTML(rows);
  assert.equal((html.match(/<li class="recrow">/g) || []).length, rows.length);
  const pressable = rows.filter((r) => r.id >= 0);
  assert.equal((html.match(/<button/g) || []).length, pressable.length, "a row nobody can follow is a button");
  for (const r of pressable) {
    assert.ok(html.includes(`${RECORD_ID_ATTR}="${r.id}"`), "a pressable row has no number for the click to find");
    assert.ok(html.includes(`aria-label="Watch the record holder — ${r.what}: ${r.why}"`), "the control is not announced");
  }
  for (const r of rows) {
    assert.ok(html.includes(`>${r.what}</span>`), `"${r.what}" is not on the board`);
    assert.ok(html.includes(`>${r.why}</span>`), `"${r.why}" is not on the board`);
  }
  // The mark is decoration beside a sentence that already says which record it
  // is, so it is hidden from a listener rather than read out as "wave".
  assert.equal((html.match(/class="recmark" aria-hidden="true"/g) || []).length, rows.length);
  // A swatch means *go and find them*, so it appears only where there is
  // somebody to find — and every colour in it is one `palette.js` hands out.
  assert.equal((html.match(/class="swatch"/g) || []).length, rows.filter((r) => r.hue !== null).length);
  for (const m of html.matchAll(/(?:background|color):([^;"]+)/g)) {
    assert.match(m[1].trim(), /^(hsla?|rgba?)\(/, `"${m[1].trim()}" is not a colour palette.js hands out`);
  }
});

test("the page holds the board between the cast and the story", () => {
  assert.ok(page.includes('id="record-list"'), "the page has nowhere to put the board");
  const who = page.indexOf('class="whoswho"');
  const rec = page.indexOf('class="records"');
  const chron = page.indexOf('class="chronicle"');
  assert.ok(who < rec && rec < chron, "the records are not between the cast list and the Chronicle");
  assert.match(page.slice(rec, chron), /aria-labelledby="records-h"/);
});

test("main.js rebuilds the board only when it changes, and a living holder can be followed", () => {
  const fn = main.match(/function updateRecords\(world\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "main.js has no adapter for the board");
  assert.ok(fn[0].includes("recordRows("), "the rows are built somewhere other than records.js");
  assert.ok(fn[0].includes("view.recordSig"), "the memo is not the one `viewstate.js` owns");
  assert.ok(/return;/.test(fn[0]), "the board is rebuilt on every frame");
  assert.ok(/\n  updateRecords\(world\);/.test(main), "the frame loop never calls it");
  const wire = main.match(/function wireRecordList\(\) \{[\s\S]*?\n\}/);
  assert.ok(wire, "nothing wires the board up");
  assert.ok(wire[0].includes("RECORD_ID_ATTR"), "the handler does not use the module's attribute");
  assert.ok(wire[0].includes("!x.dead"), "a row can follow an animal the pond has already buried");
  assert.ok(/\n  wireRecordList\(\);/.test(main), "the handler is never attached");
  const vs = read("src/viewstate.js");
  assert.match(vs, /recordSig: "",/, "`recordSig` is not on the roster, so a new pond keeps the old one's records");
  assert.doesNotMatch(main, /\blet recordSig\b/, "main.js declares the memo itself");
});

test("the books' two new records are in the channel that hashes the books", () => {
  // v1.53's rule, one release on: a field that moves and is hashed by nothing
  // is a hole in the instrument.
  for (const field of ["maxPopTick", "recordYoung"]) {
    assert.ok(STATS_HASHED.includes(field), `\`stats.${field}\` is outside every fingerprint`);
  }
  // And the one field that has to stay outside is written down with its reason
  // rather than quietly missing: an id is a module-level counter, so a book
  // carrying one makes two identical ponds disagree (`CREATURE_UNHASHED.id`).
  assert.ok(!STATS_HASHED.includes("recordYoungId"), "a creature id is in the books' hash");
  assert.ok(STATS_UNHASHED.recordYoungId, "`recordYoungId` is outside every hash with no reason given");
});

// ---- 5. reading the pond does not move it ----

test("drawing the board moves nothing and draws no random number", () => {
  const config = makeConfig({ seed: 7 });
  const world = new World(config);
  for (let i = 0; i < 400; i++) world.step();
  const stream = drawStream(world.rng);
  const before = stateFingerprint(world);
  const drawn = stream.count;
  const nm = names(world);
  for (let i = 0; i < 20; i++) {
    const rows = recordRows(world, config, nm);
    recordSignature(rows);
    recordsHTML(rows);
  }
  assert.equal(stateFingerprint(world), before, "reading the records moved the pond");
  assert.equal(stream.count, drawn, "reading the records drew a random number");
});
