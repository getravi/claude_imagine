// feed.test.js — the Chronicle you can press (v1.136).
//
// Six claims, and the interesting ones are about the *rate* rather than about
// one frame — which is this project's own hard-won note, that a rule which is
// only sometimes true needs a sample and not a snapshot:
//
//  1. A line about the pond is never a control; a line whose subject has gone
//     is never a control; a line whose subject is still here always is.
//  2. The two kinds of subject decay at different rates, and the whole feature
//     rests on that: an animal is one body, a family is a population.
//  3. Pressability decays with a line's age, and the feed is newest-first, so
//     the controls sit at the top where a reader starts.
//  4. The signature moves when a subject dies and not otherwise.
//  5. The markup keeps one shape whether a row is a button or not, and the
//     button's accessible name carries the sentence and not just the verb.
//  6. `main.js` no longer builds this panel's markup — the structural guard
//     `pondclock.test.js` established, for the same reason: a rule that lives
//     in the file that happened to be open is a rule the next surface cannot
//     find.
//
// The sweep constants below were measured over twelve seeds run six thousand
// steps, sampled every fifty. They are pinned loosely — as inequalities with
// room either side — because what they are protecting is the *design*: a world
// in which families stopped outliving animals, or in which the top of the feed
// stopped being the live end, is a world where this panel should be built
// differently, and it should have to say so out loud.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { WATCH_LABEL } from "../src/milestones.js";
import { chronicleFingerprint, EVENT_HASHED, EVENT_UNHASHED } from "../src/fingerprint.js";
import {
  FEED_EMPTY,
  FEED_SP_ATTR,
  FEED_STORY_ATTR,
  FEED_WHO_ATTR,
  feedHTML,
  feedRows,
  feedSignature,
} from "../src/feed.js";
import { STORY_LABEL } from "../src/memorial.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The pond as the feed asks about it: who is in the water, and whose family. */
function lookups(world) {
  const alive = new Set();
  const families = new Set();
  for (const c of world.creatures) {
    if (c.dead) continue;
    alive.add(c.id);
    families.add(c.speciesId);
  }
  return {
    alive: (id) => alive.has(id),
    familyHere: (id) => families.has(id),
    familyName: (id) => `family ${id}`,
  };
}

/** A world far enough in to have said something about somebody. */
function pond(seed, ticks = 4000) {
  const world = new World(makeConfig({ seed }));
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

test("a row is a control exactly when its subject is still in the pond", () => {
  const world = pond(123);
  const rows = feedRows(world.chronicle.events, lookups(world));
  assert.ok(rows.length > 0, "no lines, so this proves nothing");
  const look = lookups(world);
  let controls = 0;
  for (const r of rows) {
    // Three kinds of id since v1.137, and a row keeps at most one of them.
    const hasSubject = r.who >= 0 || r.sp >= 0 || r.told >= 0;
    assert.equal(r.live, hasSubject, "a row is live if and only if it kept an id");
    if (r.live) controls++;
    if (r.who >= 0) assert.ok(look.alive(r.who), "a row points at an animal still alive");
    if (r.sp >= 0) assert.ok(look.familyHere(r.sp), "a row points at a family with members");
    assert.ok(!(r.who >= 0 && r.sp >= 0), "an event has one subject, not two");
  }
  assert.ok(controls > 0, "a four-thousand-step pond with nothing to press");
});

test("a line about the pond itself is never a control", () => {
  const world = pond(42);
  const rows = feedRows(world.chronicle.events, lookups(world));
  const plain = rows.filter((r) => !r.name && r.sp < 0);
  assert.ok(plain.length > 0, "every line had a subject, so this walks nothing");
  for (const r of plain) assert.equal(r.live, false, `"${r.msg}" offered a press`);
});

test("nothing is a control when the pond cannot be looked up", () => {
  // The defaults: a caller that hands over no lookups gets a feed of
  // statements rather than a panel full of buttons that lead nowhere.
  const world = pond(42);
  const rows = feedRows(world.chronicle.events);
  for (const r of rows) assert.equal(r.live, false);
});

test("a family outlives an animal, which is what makes this panel work", () => {
  // The measurement the design rests on. Over twelve seeds sampled every fifty
  // steps: 36.6% of the lines about an animal name one still alive, against
  // 94.3% of the lines about a family. Three seeds and a coarser sample here,
  // because what is being protected is the gap and not the third decimal.
  let whoLines = 0;
  let whoAlive = 0;
  let famLines = 0;
  let famHere = 0;
  for (const seed of [42, 123, 777]) {
    const world = new World(makeConfig({ seed }));
    for (let t = 0; t < 4000; t++) {
      world.step();
      if (t % 200) continue;
      const look = lookups(world);
      for (const e of world.chronicle.events) {
        if (e.who >= 0) {
          whoLines++;
          if (look.alive(e.who)) whoAlive++;
        }
        if (e.sp >= 0) {
          famLines++;
          if (look.familyHere(e.sp)) famHere++;
        }
      }
    }
  }
  assert.ok(whoLines > 50 && famLines > 50, "too few lines of either kind to compare");
  const whoShare = whoAlive / whoLines;
  const famShare = famHere / famLines;
  assert.ok(
    famShare > whoShare + 0.2,
    `families (${(famShare * 100).toFixed(1)}%) no longer outlive animals ` +
      `(${(whoShare * 100).toFixed(1)}%) — the panel was designed around that gap`
  );
  assert.ok(famShare > 0.7, "a family line is meant to be a near-certain press");
});

test("the live end of the feed is the top of it", () => {
  // Newest-first, and a subject survives as a function of a line's age: 97.9%
  // pressable under 200 steps against 32.1% beyond 1,500. So a reader starting
  // at the top starts where the controls are, which is the only reason a panel
  // holding a hundred and forty lines can carry an affordance at all.
  let youngLive = 0;
  let young = 0;
  let oldLive = 0;
  let old = 0;
  for (const seed of [42, 123, 777]) {
    const world = new World(makeConfig({ seed }));
    for (let t = 0; t < 4000; t++) {
      world.step();
      if (t % 200) continue;
      const rows = feedRows(world.chronicle.events, lookups(world));
      for (const r of rows) {
        if (r.who < 0 && r.sp < 0 && !r.name) continue;
        const age = world.tick - r.tick;
        if (age < 400) {
          young++;
          if (r.live) youngLive++;
        } else if (age > 1500) {
          old++;
          if (r.live) oldLive++;
        }
      }
    }
  }
  assert.ok(young > 20 && old > 20, "not enough lines of either age to compare");
  assert.ok(
    youngLive / young > oldLive / old,
    "a fresh line is no likelier to be pressable than an old one"
  );
  assert.ok(youngLive / young > 0.85, "a line the pond has just written should lead somewhere");
});

test("the signature notices a subject dying and nothing else", () => {
  const world = pond(123);
  const events = world.chronicle.events;
  const live = feedRows(events, lookups(world));
  const before = feedSignature(live);
  assert.equal(feedSignature(feedRows(events, lookups(world))), before, "not stable");

  const pressable = live.find((r) => r.live);
  assert.ok(pressable, "nothing pressable, so this proves nothing");
  const look = lookups(world);
  const bereft = {
    alive: (id) => id !== pressable.who && look.alive(id),
    familyHere: (id) => id !== pressable.sp && look.familyHere(id),
    familyName: look.familyName,
  };
  assert.notEqual(
    feedSignature(feedRows(events, bereft)),
    before,
    "the panel would keep a button whose subject is gone"
  );
});

test("the two kinds of row are the same shape, and only one is a button", () => {
  const world = pond(123);
  const rows = feedRows(world.chronicle.events, lookups(world));
  const html = feedHTML(rows);
  const live = rows.filter((r) => r.live).length;
  assert.equal((html.match(/<button/g) || []).length, live, "a button per live row, no more");
  assert.equal((html.match(/class="c-row"/g) || []).length, rows.length, "every row is a c-row");
  assert.equal((html.match(/<li /g) || []).length, rows.length, "one li per line");
  assert.ok(html.includes(FEED_WHO_ATTR) || html.includes(FEED_SP_ATTR), "no press anywhere");
  // The offer is the ladder's, letter for letter, on both presses that put
  // something in the water: one promise, one face.
  assert.equal((html.match(new RegExp(WATCH_LABEL, "g")) || []).length, live);
  assert.ok(!html.includes("undefined"), "a field the markup expected was not there");
});

test("a subject dying changes the offer, not merely whether there is one", () => {
  // The bug v1.137's `kind` exists to stop. Until the book of the dead, a death
  // turned a button into a sentence and a boolean caught it; now it turns
  // `👀 Show me` into `📖 Their story`, and a panel that patches itself against
  // a boolean would hold both frames identical and go on offering to walk a
  // reader over to a body that is not there.
  const world = pond(123);
  const events = world.chronicle.events;
  const look = lookups(world);
  const before = feedRows(events, look);
  const watched = before.find((r) => r.kind === "watch");
  assert.ok(watched, "no line about a living animal, so this proves nothing");
  const buried = {
    ...look,
    alive: (id) => id !== watched.who && look.alive(id),
    remembered: (id) => id === watched.who,
  };
  const after = feedRows(events, buried);
  const row = after.find((r) => r.tick === watched.tick && r.msg === watched.msg);
  assert.equal(row.kind, "story", "a buried animal with a life written leads to it");
  assert.equal(row.live, true, "a life to read is still a press");
  assert.equal(row.told, watched.who);
  assert.equal(row.who, -1, "a story row must not also offer to walk to the body");
  assert.notEqual(
    feedSignature(after),
    feedSignature(before),
    "the panel would leave a Show me pointing at an empty pond"
  );
  const html = feedHTML([row]);
  assert.ok(html.includes(`${FEED_STORY_ATTR}="${watched.who}"`), "the press carries no id");
  assert.ok(html.includes(STORY_LABEL), "the offer does not say what it opens");
  assert.ok(!html.includes(WATCH_LABEL), "a card is not a thing you can be shown in the water");
  assert.match(row.action, /^What became of /, `"${row.action}" is not a question about a life`);
});

test("a buried animal this pond wrote no life for stays a sentence", () => {
  // v1.51's rule, which the third press does not get to bend: a control that
  // does nothing is worse than no control. A pond opened from an archive has a
  // Chronicle full of names whose deaths nobody was here to see.
  const world = pond(123);
  const rows = feedRows(world.chronicle.events, { ...lookups(world), alive: () => false });
  for (const r of rows) {
    assert.equal(r.told, -1, "a row led to a life this pond never wrote");
    assert.notEqual(r.kind, "story");
  }
});

test("the button's name is the story and then the verb", () => {
  const world = pond(123);
  const rows = feedRows(world.chronicle.events, lookups(world));
  const html = feedHTML(rows);
  for (const r of rows.filter((x) => x.live)) {
    assert.ok(html.includes(`aria-label="${r.line} ${r.action}."`), `label lost: ${r.line}`);
    // A button's accessible name replaces its contents, so a label that says
    // only "Watch Cove" hands a listener the control and takes the line away.
    assert.ok(r.line.includes(r.msg), "the label dropped the sentence");
    assert.ok(r.line.includes("steps in"), "the label dropped the date");
    assert.ok(r.action.length > 0, "a live row with no verb");
  }
});

test("the empty feed says so in words a visitor has", () => {
  assert.equal(feedHTML([]), `<li class="chronicle-empty">${FEED_EMPTY}</li>`);
  const JARGON = /\b(tick|ticks|px|pixels?|lineage|genome|id|hash|config|seed|RNG)\b/i;
  assert.doesNotMatch(FEED_EMPTY, JARGON);
  const world = pond(123);
  for (const r of feedRows(world.chronicle.events, lookups(world))) {
    if (r.action) assert.doesNotMatch(r.action, JARGON, `"${r.action}" reaches for jargon`);
  }
});

test("the narration channel can see which family a line points at", () => {
  // The distinction v1.136 had to make, and the reason `sp` is hashed where
  // `who` is not: a species id comes from `Phylogeny.nextId`, a field born with
  // the world, so two identical ponds in one process agree about it. A creature
  // id comes from a counter at module scope and they do not.
  assert.ok(EVENT_HASHED.includes("sp"), "the family a line points at is unhashed");
  assert.ok(!("sp" in EVENT_UNHASHED), "sp is declared twice");
  const world = pond(42, 3000);
  const lineage = world.chronicle.events.find((e) => e.sp >= 0);
  assert.ok(lineage, "no line about a family, so this proves nothing");
  const before = chronicleFingerprint(world);
  const was = lineage.sp;
  lineage.sp = was + 1000;
  assert.notEqual(chronicleFingerprint(world), before, "the channel cannot see it");
  lineage.sp = was;
  assert.equal(chronicleFingerprint(world), before, "restoring it did not restore the hash");
});

test("two identical ponds point at the same families", () => {
  const a = new World(makeConfig({ seed: 777 }));
  const b = new World(makeConfig({ seed: 777 }));
  for (let i = 0; i < 3000; i++) {
    a.step();
    b.step();
  }
  const sp = (w) => w.chronicle.events.filter((e) => e.sp >= 0).map((e) => e.sp);
  assert.ok(sp(a).length > 0, "neither pond named a family");
  assert.deepEqual(sp(a), sp(b), "two identical ponds disagree about their lineages");
});

test("main.js does not build this panel's markup", () => {
  // The structural guard, for `pondclock.test.js`'s reason. The feed's markup
  // lived in `main.js` for a hundred and thirty-five releases, where no test in
  // this project could read it — which is exactly how a panel ends up being the
  // last one on the page that cannot be pressed.
  const src = readFileSync(join(root, "src/main.js"), "utf8");
  assert.doesNotMatch(src, /c-msg|c-when|c-icon|chronicle-empty/, "main.js writes feed markup");
});
