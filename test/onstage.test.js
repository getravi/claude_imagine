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

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { openingPick } from "../src/onstage.js";

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
