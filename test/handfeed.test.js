// handfeed.test.js — feeding the pond by hand (v1.147).
//
// This is the first control in the project that puts something into the world
// at a place a *person* chose, which makes it the first one whose correctness
// is partly geometric. Everything else that changes this pond changes all of it
// at once — sixty pellets anywhere, twelve strangers anywhere — and "anywhere"
// cannot land in the wrong spot.
//
// So the tests are about the five ways an aimed lever can be wrong:
//
//  1. **A handful lands where the finger did**, wraps onto the torus like
//     everything else in this world, and never falls outside its own radius.
//  2. **It draws no random number.** The strongest form of directive 2 this
//     project has: not "nothing is drawn while the feature is off" but nothing
//     is drawn while it is *on*, so a pond cannot depend on whether anybody has
//     been feeding it.
//  3. **A pellet cannot be put where nothing could ever reach it** — inside
//     rock — and *can* be put in a pond that is already full, which is where
//     this cycle found `✦ Feed` doing nothing at all.
//  4. **The receipt counts what actually happened**, over a pond that really
//     ate it, rather than over a fixture.
//  5. **Every sentence clears the vocabulary bar** the other narrators clear,
//     and the mode is wired to the page it claims to be wired to.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { drawStream, stateFingerprint } from "../src/fingerprint.js";
import { torusDist2 } from "../src/vec.js";
import { WORLD_SCOPED, PAGE_SCOPED } from "../src/viewstate.js";
import { parseColour } from "../src/legibility.js";
import { WCAG_AA_TEXT, contrastRatio } from "../src/palette.js";
import {
  HANDFUL,
  HANDFUL_RADIUS,
  HAND_HINT,
  HAND_LABEL,
  clearedLine,
  dropHandful,
  dropLine,
  handfulProgress,
  handfulSpots,
  watchersNear,
} from "../src/handfeed.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const page = read("app/index.html");
const main = read("src/main.js");
const styles = read("style.css");

/** A pond, run on. */
function pond(seed, ticks = 0, over = {}) {
  const world = new World(makeConfig({ seed, ...over }));
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

// ---- 1. a handful lands where the finger did ----

test("every pellet of a handful is inside the radius of the spot touched", () => {
  const config = makeConfig({ seed: 314 });
  for (const [x, y] of [
    [450, 310],
    [0, 0],
    [899, 619],
    [12, 604],
  ]) {
    const spots = handfulSpots(x, y, config);
    assert.equal(spots.length, HANDFUL);
    for (const s of spots) {
      assert.ok(s.x >= 0 && s.x < config.width, `x ${s.x} is off the pond`);
      assert.ok(s.y >= 0 && s.y < config.height, `y ${s.y} is off the pond`);
      const d = Math.sqrt(torusDist2(s.x, s.y, x, y, config.width, config.height));
      assert.ok(d <= HANDFUL_RADIUS + 1e-9, `a pellet fell ${d.toFixed(1)} from the spot`);
    }
  }
});

test("a handful dropped over the seam is the same handful, moved", () => {
  // The one place an aimed control can be wrong in a way no fixture would catch:
  // this world has no edges, so a touch at x=899 and a touch at x=-1 are the
  // same touch, and the ten pellets have to agree.
  const config = makeConfig({ seed: 314 });
  const at = handfulSpots(2, 8, config);
  const over = handfulSpots(2 + config.width, 8 + config.height, config);
  for (let i = 0; i < at.length; i++) {
    assert.ok(Math.abs(at[i].x - over[i].x) < 1e-6, "the seam moved a pellet sideways");
    assert.ok(Math.abs(at[i].y - over[i].y) < 1e-6, "the seam moved a pellet up");
  }
});

test("the same touch is always the same handful", () => {
  // No draw, no clock, no world: the spiral is arithmetic, so two identical
  // touches on two identical ponds are identical events.
  const config = makeConfig({ seed: 314 });
  assert.deepEqual(handfulSpots(300, 200, config), handfulSpots(300, 200, config));
});

test("pellets are spread over the disc rather than bunched in the middle", () => {
  // The `sqrt` on the radius, as an assertion rather than as a comment. Without
  // it, half a handful sits inside the innermost quarter of the circle and the
  // drop reads as one dot.
  const config = makeConfig({ seed: 314 });
  const spots = handfulSpots(450, 310, config);
  const inHalf = spots.filter(
    (s) => torusDist2(s.x, s.y, 450, 310, config.width, config.height) <= (HANDFUL_RADIUS / 2) ** 2
  ).length;
  // An even spread over a disc puts a quarter of the points inside half the
  // radius. Anything much past that is bunching.
  assert.ok(inHalf <= HANDFUL / 2, `${inHalf} of ${HANDFUL} pellets are in the middle quarter`);
});

// ---- 2. it draws no random number ----

test("feeding by hand draws nothing from the world's generator", () => {
  const world = pond(314, 600);
  const draws = drawStream(world.rng);
  for (let i = 0; i < 30; i++) dropHandful(world, 100 + i * 5, 200);
  assert.equal(draws.count, 0, "an aimed lever reached into the pond's randomness");
});

test("a pond nobody feeds by hand is bit-for-bit the pond it always was", () => {
  // The other half of the same claim, and the one that protects every recorded
  // fingerprint in the suite: importing this module, and the pellet placement it
  // needed adding to `food.js`, cannot have moved a default world.
  const untouched = pond(314, 900);
  const also = pond(314, 900);
  assert.equal(stateFingerprint(untouched), stateFingerprint(also));
});

test("two ponds fed identically by hand stay identical", () => {
  // Determinism is not suspended by a visitor: the same seed and the same
  // touches are the same world, which is what makes a hand-fed pond something a
  // person could still share.
  const a = pond(1234, 400);
  const b = pond(1234, 400);
  for (const [x, y] of [
    [120, 90],
    [700, 500],
  ]) {
    dropHandful(a, x, y);
    dropHandful(b, x, y);
  }
  for (let i = 0; i < 300; i++) {
    a.step();
    b.step();
  }
  assert.equal(stateFingerprint(a), stateFingerprint(b));
});

// ---- 3. a pellet cannot go somewhere it could never be reached ----

test("a pond already at its food ceiling still takes a handful, and so does `✦ Feed`", () => {
  // The measurement that rewrote this: the standing crop reaches `foodMax` by
  // tick 200 on every seed and holds there past 1,500, so a lever that honours
  // the ceiling is a lever that does nothing during a visitor's first minute.
  // `✦ Feed` had honoured it since v1.0.
  const world = pond(314, 400);
  assert.equal(world.food.items.length, world.config.foodMax, "this pond was supposed to be full");
  const drop = dropHandful(world, 450, 310);
  assert.equal(drop.pellets.length, HANDFUL);
  assert.equal(world.food.items.length, world.config.foodMax + HANDFUL);
  const before = world.food.items.length;
  world.addFood(60);
  assert.equal(world.food.items.length, before + 60, "`✦ Feed` did nothing on a full pond");
});

test("the world's own crop still stops at the ceiling", () => {
  // The other half, and the one that makes the exemption a rule rather than a
  // hole: forcing is for levers. A pond nobody touches must still be bounded.
  const world = pond(314, 0);
  for (let i = 0; i < 3000; i++) world.step();
  assert.ok(
    world.food.items.length <= world.config.foodMax,
    "the pond grew past its own ceiling with nobody pressing anything"
  );
});

test("a handful dropped on rock is ejected out of it, never buried in it", () => {
  const world = pond(4242, 120, { barriers: true });
  assert.ok(world.food.barriers, "this pond was supposed to have rock in it");
  const cfg = world.config;
  // Find a walled spot to aim at. A pond with barriers on always has one.
  let hit = null;
  for (let x = 4; x < cfg.width && !hit; x += 7) {
    for (let y = 4; y < cfg.height; y += 7) {
      if (world.food.barriers.blocked(x, y)) {
        hit = { x, y };
        break;
      }
    }
  }
  assert.ok(hit, "no rock found to aim at");
  const drop = dropHandful(world, hit.x, hit.y);
  assert.ok(drop.pellets.length > 0);
  for (const f of drop.pellets) {
    assert.equal(world.food.barriers.blocked(f.x, f.y), false, "a pellet was left inside a wall");
  }
});

// ---- 4. the receipt counts what actually happened ----

test("a handful in a busy pond is found, and the count says how many", () => {
  // Run it for real rather than flagging pellets by hand: the claim this control
  // makes to a visitor is that the animals come, and a fixture cannot make that
  // claim on their behalf.
  const world = pond(314, 800);
  // Aim at the middle of the crowd, which is what a person watching would do.
  const live = world.creatures.filter((c) => !c.dead);
  assert.ok(live.length > 0);
  const target = live[Math.floor(live.length / 2)];
  const drop = dropHandful(world, target.x, target.y);
  assert.equal(handfulProgress(drop, world).taken, 0, "eaten before the pond had moved");
  assert.equal(handfulProgress(drop, world).cleared, false);
  let steps = 0;
  while (steps < 2000 && !handfulProgress(drop, world).cleared) {
    world.step();
    steps++;
  }
  const p = handfulProgress(drop, world);
  assert.equal(p.cleared, true, `a handful dropped on the crowd was still there after ${steps}`);
  assert.equal(p.taken, p.placed);
  assert.equal(p.left, 0);
  assert.equal(p.steps, steps);
});

test("the count only ever goes up, and never past the number that went in", () => {
  const world = pond(2718, 500);
  const live = world.creatures.filter((c) => !c.dead);
  const drop = dropHandful(world, live[0].x, live[0].y);
  let last = 0;
  for (let i = 0; i < 900; i++) {
    world.step();
    const p = handfulProgress(drop, world);
    assert.ok(p.taken >= last, "a pellet came back");
    assert.ok(p.taken <= p.placed, "more pellets were eaten than were dropped");
    last = p.taken;
  }
});

test("the watcher count is the pond's own reach, not a number I picked", () => {
  const world = pond(314, 400);
  const cfg = world.config;
  const at = { x: 450, y: 310 };
  const byHand = world.creatures.filter(
    (c) => !c.dead && torusDist2(c.x, c.y, at.x, at.y, cfg.width, cfg.height) <= cfg.visionRadius ** 2
  ).length;
  assert.equal(watchersNear(world, at.x, at.y), byHand);
  // And a dead animal is not somebody who can come.
  const near = world.creatures.find(
    (c) => !c.dead && torusDist2(c.x, c.y, at.x, at.y, cfg.width, cfg.height) <= cfg.visionRadius ** 2
  );
  if (near) {
    near.dead = true;
    assert.equal(watchersNear(world, at.x, at.y), byHand - 1);
  }
});

// ---- 5. the words, and the wiring ----

test("every sentence a hand-feeder reads is one a stranger could read aloud", () => {
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|gene|tick|ticks|px|pixels?|metabolis\w*|predation|fitness|phenotype|RNG|seed|species|radius|torus)\b/i;
  const said = [HAND_HINT, HAND_LABEL.off, HAND_LABEL.on];
  for (const watchers of [0, 1, 2, 7, 40]) {
    said.push(dropLine({ placed: HANDFUL, asked: HANDFUL }, watchers));
    said.push(dropLine({ placed: 1, asked: HANDFUL }, watchers));
  }
  for (const steps of [0, 1, 2, 69, 198, 1204]) {
    said.push(clearedLine({ placed: HANDFUL, steps }));
    said.push(clearedLine({ placed: 1, steps }));
  }
  for (const s of said) {
    assert.doesNotMatch(s, JARGON, `"${s}" uses a word only somebody already here knows`);
    assert.match(s, /^[🥣A-Z]/u, `"${s}" does not start like a sentence`);
    assert.ok(s.length <= 130, `"${s}" is ${s.length} characters`);
  }
  // No sentence opens with a numeral: a count under eleven is a word.
  for (const s of said.filter((t) => !t.startsWith("🥣"))) {
    assert.doesNotMatch(s, /^\d/, `"${s}" opens with a numeral`);
  }
});

test("nothing is promised on screen that the pond has not done", () => {
  // The rule every board here holds to — a row is a claim, so a row that is not
  // true is not drawn. A drop nobody can see says so; a drop nobody finds says
  // nothing at all, which is why there is no "still uneaten" sentence to test.
  assert.match(dropLine({ placed: HANDFUL, asked: HANDFUL }, 0), /Nobody can see them/);
  assert.match(dropLine({ placed: HANDFUL, asked: HANDFUL }, 1), /One animal/);
  assert.match(dropLine({ placed: HANDFUL, asked: HANDFUL }, 5), /Five animals/);
  assert.match(clearedLine({ placed: HANDFUL, steps: 198 }), /198 steps/);
  // A handful is ten things and one thing is one thing: the pronoun follows the
  // count, which is the sort of agreement a banner gets wrong for a hundred
  // releases because nobody reads their own sentence out loud.
  assert.match(dropLine({ placed: 1, asked: HANDFUL }, 3), /to see it\.$/);
  assert.match(dropLine({ placed: HANDFUL, asked: HANDFUL }, 3), /to see them\.$/);
});

test("the button is on the page, and the mode is drawn where it is claimed to be", () => {
  assert.match(page, /id="btn-hand"/, "the page has no hand-feed button");
  assert.match(page, /aria-pressed="false"/, "the button does not say it is a mode");
  assert.ok(page.includes(HAND_LABEL.off), "the button does not carry the module's own label");
  assert.match(main, /\$\("btn-hand"\)\.addEventListener/, "nothing presses the button");
  assert.match(main, /handFeeding/, "main.js has no armed state");
  assert.match(styles, /button\.hand-btn\[aria-pressed="true"\]/, "an armed mode looks like every other button");
  assert.match(styles, /#world\.handfeeding/, "the pointer over the water does not change");
});

test("the armed button's label is legible on the ground it turns", () => {
  // `legibility.js`'s inventory is a walk of a page nobody has pressed anything
  // on, so a *state* is a pair it can never meet — the file says as much about
  // panels that only appear when something is selected. Rather than hand a row
  // to that list without the browser measurement behind it, the pair is
  // measured here, off the two declarations themselves, so it goes red the run
  // after either of them moves.
  const ink = styles.match(/--ink:\s*(#[0-9a-f]{6})/i);
  const armed = styles.match(
    /button\.hand-btn\[aria-pressed="true"\]\s*\{[^}]*background:\s*(#[0-9a-f]{6})/i
  );
  assert.ok(ink && armed, "the armed button's colours are no longer written where this can read them");
  const ratio = contrastRatio(parseColour(ink[1]), parseColour(armed[1]));
  assert.ok(
    ratio >= WCAG_AA_TEXT,
    `the armed label is ${ratio.toFixed(2)}:1 on its own background, under ${WCAG_AA_TEXT}`
  );
});

test("the mode and the handful are each filed where they belong", () => {
  // v1.99's roster, which is the thing that makes a new pond forget the right
  // things: the pellets belong to one world, the visitor's choice of mode does
  // not.
  assert.ok(WORLD_SCOPED.includes("handful"), "the handful is not owned by the view state");
  assert.ok(!/(?:let|const|var)\s+handful\b/.test(main), "the handful has a second home in main.js");
  assert.ok(PAGE_SCOPED.handFeeding, "the mode is not explained by any list");
  assert.ok(PAGE_SCOPED.handHinted, "the hint's memory is not explained by any list");
});
