// onstage.test.js — the animal the page sits down for a visitor who has not
// picked one.
//
// Four groups of claims.
//
// **It is the nearest to the middle, and it is that on purpose.** The rule is
// one line of arithmetic, so the test that means anything is the one that beats
// it against a brute-force scan of a real pond rather than against a fixture
// somebody typed — and against the *tie*, which is the part a `reduce` would
// get wrong and which nothing on screen could ever contradict.
//
// **It never seats a body.** A dead creature in the seat would put an obituary
// under the water on the first frame of a fresh pond, and `world.creatures`
// carries the dead until they are swept.
//
// **It is the same animal every time.** A seat that moved between two runs of
// one seed would break the promise the pond plate makes in words — *the same
// seed always grows the same pond* — in the one place a visitor would actually
// notice, which is the name over the water.
//
// **It is a pure observer**, run the way `decide.test.js` and `eyeview.test.js`
// run theirs: two identical ponds, one of them read every step, fingerprinted
// at the end. A page that seats somebody must not move the world it seated them
// in.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { SEAT_PHRASE, nextSeat, openingPick } from "../src/onstage.js";
import { pickStar } from "../src/cast.js";
import { familyOf } from "../src/obituary.js";
import { PHRASES, say } from "../src/hand.js";

const here = dirname(fileURLToPath(import.meta.url));

const pond = (over = {}) => new World(makeConfig({ seed: 314, ...over }));

/** The same question asked the slow, obvious way, for the rule to be beaten against. */
function nearestTheLongWay(world) {
  const cx = world.config.width / 2;
  const cy = world.config.height / 2;
  const alive = world.creatures.filter((c) => !c.dead);
  if (alive.length === 0) return null;
  const d2 = (c) => (c.x - cx) ** 2 + (c.y - cy) ** 2;
  const best = Math.min(...alive.map(d2));
  // Every animal at the minimum, then the lowest id of them — the tie-break
  // spelled out rather than assumed, so this really is an independent answer.
  return alive.filter((c) => d2(c) === best).sort((a, b) => a.id - b.id)[0];
}

test("the opening pick is the living animal nearest the middle of the water", () => {
  for (const seed of [1, 42, 314, 909, 1837465]) {
    const w = pond({ seed });
    for (let i = 0; i < 5; i++) {
      assert.equal(openingPick(w), nearestTheLongWay(w), `seed ${seed}, ${w.tick} ticks in`);
      for (let s = 0; s < 200; s++) w.step();
    }
  }
});

test("a tie goes to the lowest id, whatever order the pond holds them in", () => {
  const w = pond();
  const cx = w.config.width / 2;
  const cy = w.config.height / 2;
  // Three animals at the same distance, seated out of id order in the list —
  // which is what a shuffled turn order (v1.47) is allowed to do to it.
  const [a, b, c] = w.creatures;
  for (const x of w.creatures) {
    x.x = cx + 200;
    x.y = cy + 200;
  }
  a.x = cx + 3;
  a.y = cy + 4;
  b.x = cx - 4;
  b.y = cy + 3;
  c.x = cx + 5;
  c.y = cy;
  const lowest = [a, b, c].reduce((lo, x) => (x.id < lo.id ? x : lo));
  w.creatures.reverse();
  assert.equal(openingPick(w), lowest);
  w.creatures.sort((x, y) => y.id - x.id);
  assert.equal(openingPick(w), lowest, "the answer moved when the list was re-ordered");
});

test("nobody dead is ever seated, and an empty pond seats nobody", () => {
  const w = pond();
  const first = openingPick(w);
  assert.ok(first && !first.dead);
  // Kill the pick without sweeping it: this is exactly the state the list is in
  // between a death and the frame that clears it.
  first.dead = true;
  const next = openingPick(w);
  assert.notEqual(next, first);
  assert.ok(next && !next.dead);

  for (const c of w.creatures) c.dead = true;
  assert.equal(openingPick(w), null, "an empty pond has no seat to fill");
  assert.equal(openingPick(new World(makeConfig({ seed: 7, populationStart: 0 }))), null);
});

test("one seed seats one animal, however many times it is grown", () => {
  // Not by id: creature numbers come off a counter that spans every `World` in
  // a page load, so two ponds grown from one seed hand the same animal two
  // different numbers and only a *reload* restarts the count (`cast.js` relies
  // on the same fact one panel over). What has to match is which of the
  // founders it is, and where that founder was dealt.
  for (const seed of [1, 314, 909]) {
    const a = pond({ seed });
    const b = pond({ seed });
    const i = a.creatures.indexOf(openingPick(a));
    const j = b.creatures.indexOf(openingPick(b));
    assert.equal(i, j, `seed ${seed} seated two different animals`);
    assert.equal(a.creatures[i].x, b.creatures[j].x);
    assert.equal(a.creatures[i].y, b.creatures[j].y);
  }
});

test("seating somebody moves nothing: two identical ponds, one of them watched", () => {
  const watched = new World(makeConfig({ seed: 909 }));
  const alone = new World(makeConfig({ seed: 909 }));
  for (let i = 0; i < 600; i++) {
    openingPick(watched);
    watched.step();
    alone.step();
  }
  assert.equal(stateFingerprint(watched), stateFingerprint(alone));
});

// ---- the seat is handed on (v1.177) ----
//
// v1.164 seated somebody on the first frame and never asked how long that
// lasts; the answer is nine seconds on the default pond and twenty-one across
// forty seeds, after which the page went back to the three grey boxes this
// module exists to remove. So the seat is now handed on when its animal dies,
// and the claims below are the four that make that safe: it goes to the animal
// the obituary's own button offers, it falls back to the cast board's pick, it
// never seats a body or invents one on an empty pond, and it keeps the seat
// filled for a whole visit rather than for the first few seconds of one.

test("the seat goes to the eldest living young — the card's own next step", () => {
  const w = pond({ seed: 909 });
  // Run far enough in that the pond has families in it rather than founders.
  for (let i = 0; i < 3000; i++) w.step();
  let checked = 0;
  for (const parent of w.creatures) {
    const young = w.creatures.filter((c) => !c.dead && c.parentId === parent.id);
    if (young.length < 2) continue;
    const taken = nextSeat({ id: parent.id }, w, w.config, null);
    // The independent answer: `familyOf` orders the young eldest first and the
    // card's button walks that list for the first one still alive, so the two
    // have to agree by construction or one of them is lying to a visitor.
    const card = familyOf({ id: parent.id, parentId: parent.parentId ?? null }, w.creatures);
    const offered = card.young.find((id) => w.creatures.some((x) => x.id === id && !x.dead));
    assert.equal(taken.by, "heir");
    assert.equal(taken.creature.id, offered, "the seat and the card lead to different animals");
    assert.equal(taken.creature.id, Math.min(...young.map((c) => c.id)));
    checked++;
    if (checked === 8) break;
  }
  assert.ok(checked > 0, "no animal in this pond had two living young to choose between");
});

test("with no young left, the seat goes to the cast board's pick", () => {
  const w = pond({ seed: 42 });
  for (let i = 0; i < 2000; i++) w.step();
  // An id nothing in the water is descended from: the no-family case, which is
  // most deaths in a young pond.
  const orphan = { id: -1 };
  const taken = nextSeat(orphan, w, w.config, null);
  const star = pickStar(w, w.config, null);
  assert.equal(taken.by, "next");
  assert.equal(taken.creature, star.creature);
  assert.ok(!taken.creature.dead);
});

test("a body is never seated, and an empty pond hands the seat to nobody", () => {
  const w = pond();
  for (let i = 0; i < 400; i++) w.step();
  const parent = w.creatures.find((c) => w.creatures.some((x) => !x.dead && x.parentId === c.id));
  if (parent) {
    // The young die too. The rule has to walk past them rather than seat the
    // first one it finds, which is the state `world.creatures` is in between a
    // death and the sweep that clears it.
    for (const c of w.creatures) if (c.parentId === parent.id) c.dead = true;
    const taken = nextSeat({ id: parent.id }, w, w.config, null);
    assert.ok(!taken || !taken.creature.dead);
  }
  for (const c of w.creatures) c.dead = true;
  assert.equal(nextSeat({ id: 1 }, w, w.config, null), null);
  assert.equal(nextSeat(null, w, w.config, null), null);
});

test("one seed hands the seat to one animal, however many times it is grown", () => {
  for (const seed of [1, 314, 909]) {
    const a = pond({ seed });
    const b = pond({ seed });
    for (let i = 0; i < 1200; i++) {
      a.step();
      b.step();
    }
    // Not by id — two ponds in one page load draw from the same counter, so the
    // numbers differ and the *position in the list* is what has to match.
    const ta = nextSeat({ id: -1 }, a, a.config, null);
    const tb = nextSeat({ id: -1 }, b, b.config, null);
    assert.equal(ta.by, tb.by);
    assert.equal(a.creatures.indexOf(ta.creature), b.creatures.indexOf(tb.creature), `seed ${seed}`);
  }
});

test("the seat stays filled for a whole visit, which is the point of the release", () => {
  // Six thousand steps is a hundred seconds at the speed the page opens on, and
  // it is stated here as a horizon rather than assumed: the *claim* is that the
  // seat is never empty while anybody is alive, and that claim is checked on
  // every step rather than at the end (v1.174 — a rule measured only over the
  // window my last sweep happened to use is a rule about the window).
  for (const seed of [314, 42, 777]) {
    const w = pond({ seed });
    let seat = openingPick(w);
    let died = 0;
    for (let t = 1; t <= 6000; t++) {
      w.step();
      if (seat && seat.dead) {
        died++;
        const taken = nextSeat({ id: seat.id }, w, w.config, null);
        seat = taken ? taken.creature : null;
      }
      const aliveHere = w.creatures.some((c) => !c.dead);
      assert.equal(
        Boolean(seat && !seat.dead),
        aliveHere,
        `seed ${seed}: the seat was empty at step ${t} with ${aliveHere ? "somebody" : "nobody"} in the water`
      );
    }
    assert.ok(died > 0, `seed ${seed} never emptied the seat, so this proves nothing`);
  }
});

test("every way a seat can be filled has a sentence, in both registers", () => {
  // The three sentences are one table's rows and one object's values, and the
  // failure this catches is the cheap one: a fourth way to fill the seat added
  // in some later release, with no line under the water to say how it was
  // filled. `hand.js` guarantees both registers exist for anything in `PHRASES`;
  // what it cannot know is that this module points at them.
  for (const [by, phrase] of Object.entries(SEAT_PHRASE)) {
    assert.ok(PHRASES[phrase], `seat kind ${by} names a phrase ${phrase} that does not exist`);
    assert.ok(say(phrase, "pointer").length > 0);
    assert.ok(say(phrase, "touch").length > 0);
  }
  // And the ways to fill it are exactly the kinds `nextSeat` can return, plus
  // the opening. A `by` with no entry here would read the line off `undefined`.
  assert.deepEqual(Object.keys(SEAT_PHRASE).sort(), ["heir", "next", "opening"]);
});

test("the page reaches its seat line through the table, not by name", () => {
  // The regression this locks: `main.js` said `say("seatSwap", hand)` at one
  // site for thirteen releases, and the whole of v1.177 is that one of three
  // sentences belongs there. A later edit that types the old name back in would
  // put *picked for you, as the one nearest the middle* under an animal that
  // inherited the seat from its parent.
  const src = readFileSync(join(here, "..", "src", "main.js"), "utf8");
  for (const phrase of Object.values(SEAT_PHRASE)) {
    assert.ok(
      !src.includes(`say("${phrase}"`),
      `main.js names ${phrase} directly instead of going through SEAT_PHRASE`
    );
  }
  assert.ok(src.includes("SEAT_PHRASE["), "main.js no longer chooses the seat line from the table");
});

test("handing the seat on moves nothing: two identical ponds, one of them watched", () => {
  const watched = new World(makeConfig({ seed: 909 }));
  const alone = new World(makeConfig({ seed: 909 }));
  for (let i = 0; i < 600; i++) {
    const c = watched.creatures[i % Math.max(1, watched.creatures.length)];
    nextSeat({ id: c ? c.id : -1 }, watched, watched.config, null);
    watched.step();
    alone.step();
  }
  assert.equal(stateFingerprint(watched), stateFingerprint(alone));
});
