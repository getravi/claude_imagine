// memorial.test.js — the book of the dead (v1.137).
//
// Seven claims. The first is the one the whole feature rests on, and it is a
// fact about the *Chronicle* rather than about this module:
//
//  1. The Chronicle only ever names an animal that is alive as it writes. Over
//     twelve seeds and six thousand steps the sweep found 29 named subjects and
//     not one already buried when their first line went up — which is why a
//     watcher that picks a name up the moment it appears catches every one of
//     those deaths, and why the feed's animal lines end up **100.0%** pressable
//     rather than nearly.
//  2. So every animal line the panel can show has somewhere to lead: alive, in
//     the water; dead, in the book.
//  3. The book has no size of its own. It is pruned to the subjects the panel
//     could still ask about, so the Chronicle's own buffer bounds it — the
//     sweep's observed maximum was 4 cards.
//  4. Nothing dead is held. `witness` lends the caller a body for the length of
//     the call and keeps a plain card, which is `obituary.js`'s rule about the
//     one place on this page that could keep a dead thing alive.
//  5. A life leaves the book when the last line about it leaves the feed.
//  6. Watching a pond does not move it. The book reads a flag the world has
//     already set and writes nothing back, so a watched run and an unwatched
//     one are bit-for-bit the same world.
//  7. The offer on a buried line is not the offer on a living one, because it
//     is not the same promise: nothing appears in the water.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { Memorial, STORY_LABEL } from "../src/memorial.js";
import { WATCH_LABEL } from "../src/milestones.js";
import { obituaryFor } from "../src/obituary.js";
import { nameSpecies } from "../src/speciesnames.js";
import { feedRows } from "../src/feed.js";
import { stateFingerprint, trajectoryFingerprint } from "../src/fingerprint.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Run a pond with the book beside it, exactly as `main.js` does per step. */
function watchedPond(seed, ticks = 4000) {
  const world = new World(makeConfig({ seed }));
  const memorial = new Memorial();
  const cards = [];
  let biggest = 0;
  for (let t = 0; t < ticks; t++) {
    world.step();
    for (const body of memorial.witness(world)) {
      const card = obituaryFor(body, nameSpecies(world.phylogeny.species), world.stats.recentDeaths);
      memorial.remember(card);
      cards.push(card);
    }
    if (memorial.size > biggest) biggest = memorial.size;
  }
  return { world, memorial, cards, biggest };
}

/** Who is in the water right now. */
function living(world) {
  const alive = new Set();
  for (const c of world.creatures) if (!c.dead) alive.add(c.id);
  return alive;
}

test("the Chronicle only ever names an animal that is alive as it writes", () => {
  // The load-bearing fact. If this ever stops being true the book stops being
  // able to promise every animal line a destination, and the panel's design
  // has to say so out loud rather than quietly falling back to dead ends.
  let named = 0;
  let alreadyGone = 0;
  for (const seed of [42, 123, 777]) {
    const world = new World(makeConfig({ seed }));
    let seen = 0;
    for (let t = 0; t < 4000; t++) {
      world.step();
      const events = world.chronicle.events;
      if (events.length === seen) continue;
      const alive = living(world);
      for (let i = seen; i < events.length; i++) {
        const e = events[i];
        if (!(e.who >= 0)) continue;
        named++;
        if (!alive.has(e.who)) alreadyGone++;
      }
      seen = events.length;
    }
  }
  assert.ok(named > 0, "no animal was named at all, so this proves nothing");
  assert.equal(alreadyGone, 0, `${alreadyGone} of ${named} lines named somebody already buried`);
});

test("every animal line has somewhere to lead: the water, or the book", () => {
  // Claim 2, which is claims 1 and 3 arriving on the panel. Measured over
  // twelve seeds at 100.0% of 8,402 lines; three seeds here, because what is
  // protected is that the share is *whole* rather than its third decimal.
  //
  // **A row stopped being an event in v1.138** and the arithmetic here had to
  // say which of the two it is counting. A streak of a champion's tallies is
  // one row standing for several lines, so "every animal line leads somewhere"
  // is now two statements: every row about an animal is a press, and the rows
  // between them account for every line the chronicle wrote. Both are checked,
  // because only the second is the claim this test was written for — a fold
  // that quietly dropped a line would keep the first one true.
  let lines = 0;
  let pressable = 0;
  let animalRows = 0;
  let covered = 0;
  for (const seed of [42, 123, 777]) {
    const { world, memorial } = watchedPond(seed);
    const alive = living(world);
    const rows = feedRows(world.chronicle.events, {
      alive: (id) => alive.has(id),
      familyHere: () => false,
      familyName: () => "family",
      remembered: (id) => memorial.has(id),
    });
    for (const e of world.chronicle.events) if (e.who >= 0) lines++;
    for (const r of rows) {
      if (r.kind === "watch" || r.kind === "story") pressable++;
      if (r.name) {
        animalRows++;
        covered += r.count;
      }
    }
  }
  assert.ok(lines > 20, "too few animal lines to make a claim about");
  assert.equal(
    pressable,
    animalRows,
    `${animalRows - pressable} of ${animalRows} animal rows still lead nowhere`
  );
  assert.equal(covered, lines, `${lines - covered} animal lines are on no row at all`);
});

test("the book has no size of its own — the panel's buffer bounds it", () => {
  // No `MEMORIAL_MAX` anywhere: a card is worth keeping exactly while a line
  // could ask about it. The bound is therefore the Chronicle's, which is a
  // constant somebody has already measured and tested.
  // A declaration, not a mention: the header names the constant it decided not
  // to write, and a test that cannot tell the two apart would forbid saying so.
  const src = readFileSync(join(root, "src", "memorial.js"), "utf8");
  assert.ok(
    !/^\s*(export\s+)?(const|let)\s+\w*MAX\w*\s*=/m.test(src),
    "the book grew a size constant of its own"
  );
  const { world, memorial, biggest } = watchedPond(123);
  const subjects = new Set();
  for (const e of world.chronicle.events) if (e.who >= 0) subjects.add(e.who);
  assert.ok(
    memorial.size <= subjects.size,
    `${memorial.size} cards for ${subjects.size} subjects the panel still mentions`
  );
  assert.ok(biggest <= 20, `the book reached ${biggest} cards; the sweep's worst was 4`);
});

test("the book keeps cards, never bodies", () => {
  // `obituary.js`'s rule 4: a panel holding the creature itself would be the one
  // place on this page keeping a dead thing alive.
  const { memorial, cards } = watchedPond(777);
  assert.ok(cards.length > 0, "nobody the pond had named died, so this walks nothing");
  for (const card of cards) {
    assert.equal(Object.getPrototypeOf(card), Object.prototype, "a card is plain data");
    assert.ok(!("genome" in card) && !("brain" in card), "a card is not a creature");
  }
  for (const body of memorial.watching.values()) {
    assert.equal(body.dead, false, "the watch is holding a body it should have released");
  }
});

test("a life leaves the book when the last line about it leaves the feed", () => {
  // A fake pond, because the real one would take a hundred and forty lines of
  // chronicle to evict anything and this is a claim about one `Map`.
  const memorial = new Memorial();
  const body = { id: 7, dead: false };
  const pond = {
    chronicle: { events: [{ who: 7, sp: -1 }] },
    creatures: [body],
  };
  assert.deepEqual(memorial.witness(pond), [], "nobody has died yet");
  body.dead = true;
  assert.deepEqual(memorial.witness(pond), [body], "the watch missed a death");
  memorial.remember({ id: 7 });
  assert.equal(memorial.has(7), true);
  // The line scrolls off the end; nothing on the panel can ask about 7 now.
  pond.chronicle.events = [{ who: -1, sp: 3 }];
  memorial.witness(pond);
  assert.equal(memorial.has(7), false, "a card outlived every line that could ask for it");
  assert.equal(memorial.size, 0);
});

test("a pond with the book beside it is the pond without it", () => {
  // Directive 2, as it applies to every observer here: watching draws no random
  // number and writes nothing back, so the two runs are the same world.
  const plain = new World(makeConfig({ seed: 314 }));
  for (let t = 0; t < 1200; t++) plain.step();
  const { world: watched } = watchedPond(314, 1200);
  assert.equal(stateFingerprint(watched), stateFingerprint(plain));
  assert.equal(trajectoryFingerprint(watched), trajectoryFingerprint(plain));
});

test("a buried line makes a different promise, and says a different thing", () => {
  // v1.136's rule was *one promise, two mechanisms*: both presses that put
  // something in the water share the ladder's words. This press puts nothing in
  // the water, so it may not borrow them — a control that says "Show me" and
  // then shows a card is a control that lied.
  assert.notEqual(STORY_LABEL, WATCH_LABEL);
  assert.ok(!/show|watch|find/i.test(STORY_LABEL), `"${STORY_LABEL}" promises the pond`);
  // And the label lives with the book rather than with the one panel that asks
  // it questions, so the cast board and the record book can import it when they
  // grow the same control — this project's own note about a rule written into
  // whatever module happened to be open.
  const feed = readFileSync(join(root, "src", "feed.js"), "utf8");
  assert.match(feed, /import \{ STORY_LABEL \} from "\.\/memorial\.js"/);
});
