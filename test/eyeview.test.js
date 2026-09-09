// eyeview.test.js — the disc that draws what one animal is actually told.
//
// Four groups of claims, and the first one is the load-bearing one.
//
// **Whose senses these are.** `eyeview.js` reads nine slots of `Creature#_in`
// through `doing.js#SENSE`, and the value of a shared table is entirely in
// nobody having quietly re-typed it: the bearings are asserted against a real
// `sense()` call with a pellet, a prey and a threat placed where the answers are
// arithmetic — including, for the three `sin` slots this release added, a target
// placed off to one side, because a sign error here would put every blip on the
// wrong side of the animal and *look completely plausible*.
//
// **The predation gate.** `doing.js` found that an animal's senses do not know
// the mechanic is switched off — `World#step` fills the prey and threat slots
// from `canEat`, which never asks — so a pond where nothing hunts still hands
// every animal a threat bearing. A picture that drew it would be inventing a
// danger. The test runs a predation-free pond for long enough that the slots
// are certainly filled and fails if either mark ever appears.
//
// **The two registers.** The line beside the disc is held for `WORD_HOLD_MS`,
// so it may not carry a distance (v1.157's rule: a held sentence may not carry
// a live number). The `aria-label` is not held and is the listener's only copy
// of the picture, so it must. Both are checked, in both directions, along with
// the jargon sweep every worded surface here gets.
//
// **The drawing.** What a reader can check by looking is that a blip is never
// under the animal and never off the rim, that the animal is drawn last so
// nothing covers it, and that an animal who can see nothing still gets a
// picture — which is the picture that makes the point.
//
// And the pure-observer claim, run the way `doing.test.js` runs its own: two
// identical ponds, one of them read every tick, fingerprinted at the end.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { recordingContext } from "../src/rendershot.js";
import { SENSE } from "../src/doing.js";
import { POINTER, TOUCH } from "../src/hand.js";
import {
  MARKS,
  WORD_HOLD_MS,
  bearingWord,
  drawEye,
  eyeInvite,
  eyeLine,
  eyeSay,
  eyeSight,
  rangeWord,
} from "../src/eyeview.js";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "..", "app", "index.html"), "utf8");

/** A creature at a known place, facing east, with everything else stilled. */
function subject(config, world) {
  const c = world.creatures[0];
  c.x = 100;
  c.y = 100;
  c.heading = 0; // facing +x, so "ahead" is +x and "its right" is +y
  return c;
}

// ---- The senses this module reads are the senses the brain was given ----

test("the nine slots eyeview reads are the nine slots sense() writes", () => {
  const config = makeConfig({ seed: 7, predation: true });
  const world = new World(config);
  const c = subject(config, world);
  const R = config.visionRadius;

  // A pellet dead ahead at a quarter of sight; prey off to the animal's right
  // at half; a threat directly behind at three quarters. Every answer is
  // arithmetic, and the prey is the one that pins the sign of `sin`.
  c.sense(
    { x: 100 + R * 0.25, y: 100 },
    R * 0.25,
    { x: 100, y: 100 + R * 0.5 },
    R * 0.5,
    { x: 100 - R * 0.75, y: 100 },
    R * 0.75,
  );

  const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-5, `${why}: ${a} vs ${b}`);
  near(c._in[SENSE.foodSin], 0, "a pellet dead ahead reads sin 0");
  near(c._in[SENSE.preySin], 1, "prey off to the right reads sin +1");
  near(c._in[SENSE.preyCos], 0, "and cos 0, because it is neither ahead nor behind");
  near(c._in[SENSE.threatSin], 0, "a threat directly behind reads sin 0");
  near(c._in[SENSE.threatCos], -1, "and cos -1");

  const seen = eyeSight(c, config);
  assert.deepEqual(
    seen.map((s) => s.kind),
    ["food", "prey", "threat"],
    "nearest first, by proximity, whatever order the marks are declared in",
  );
  assert.equal(bearingWord(c._in[SENSE.preySin], c._in[SENSE.preyCos]), "off to its right");
  assert.equal(bearingWord(c._in[SENSE.threatSin], c._in[SENSE.threatCos]), "right behind it");
  assert.equal(bearingWord(c._in[SENSE.foodSin], c._in[SENSE.foodCos]), "straight ahead");
});

test("an animal with nothing in sight can see nothing, which is a real answer", () => {
  const config = makeConfig({ seed: 7, predation: true });
  const world = new World(config);
  const c = subject(config, world);
  c.sense(null, Infinity, null, Infinity, null, Infinity);
  assert.deepEqual(eyeSight(c, config), []);
  // And so does a caller with no animal at all, so the page has one shape to
  // handle rather than two.
  assert.deepEqual(eyeSight(null, config), []);
  assert.deepEqual(eyeSight({}, config), []);
});

test("a thing exactly at the edge of sight is not in sight", () => {
  const config = makeConfig({ seed: 7 });
  const world = new World(config);
  const c = subject(config, world);
  const R = config.visionRadius;
  c.sense({ x: 100 + R, y: 100 }, R, null, Infinity, null, Infinity);
  assert.equal(c._in[SENSE.foodProx], 0, "proximity is 1 - d/R, so the rim is 0");
  assert.deepEqual(eyeSight(c, config), [], "and 0 is the same as absent to an animal");
});

// ---- The predation gate ----

test("a pond where nothing hunts never draws a hunter, however full the slots are", () => {
  const config = makeConfig({ seed: 11, predation: false });
  const world = new World(config);
  let sawSlot = false;
  for (let t = 0; t < 900; t++) {
    world.step();
    for (const c of world.creatures) {
      if (c.dead) continue;
      if (c._in[SENSE.preyProx] > 0 || c._in[SENSE.threatProx] > 0) sawSlot = true;
      for (const s of eyeSight(c, config)) {
        assert.equal(s.kind, "food", `a predation-free pond drew "${s.kind}"`);
      }
    }
  }
  // The gate is only worth having if the slots really do fill, which is the
  // finding `doing.js` recorded and the reason this is asserted rather than
  // assumed: without it this test would pass on a pond that never had anything
  // to hide.
  assert.ok(sawSlot, "the senses never filled, so the gate was never actually tested");
});

test("every gated mark names a config flag that exists", () => {
  const config = makeConfig({ seed: 3 });
  for (const m of MARKS) {
    if (!m.needs) continue;
    assert.ok(m.needs in config, `${m.kind} depends on "${m.needs}", which is not a rule`);
  }
});

// ---- The compass, and the ranges ----

test("the sectors tile exactly half a turn, so every bearing has one word", () => {
  // Walked rather than summed: a table that adds up and still leaves a hole is
  // the failure worth catching, and the hole would be one degree wide.
  const words = new Set();
  for (let deg = -180; deg <= 180; deg += 1) {
    const a = (deg * Math.PI) / 180;
    const w = bearingWord(Math.sin(a), Math.cos(a));
    assert.ok(w, `${deg}° has no word`);
    words.add(w);
  }
  assert.equal(words.size, 8, `eight sectors, got ${[...words].join(" / ")}`);
});

test("left is left and right is right, all the way round", () => {
  for (let deg = 1; deg < 180; deg += 1) {
    const a = (deg * Math.PI) / 180;
    // `sin` positive is the animal's right — the world's y grows downward, so
    // facing +x a target at +y is on your right. A sign flip here would look
    // entirely plausible on screen, which is why it is walked.
    const right = bearingWord(Math.sin(a), Math.cos(a));
    const left = bearingWord(-Math.sin(a), Math.cos(a));
    // The nose sector closes at 22.5° and the tail sector opens at 157.5° — see
    // `SECTORS` — and neither end has a handedness, which is the point of them:
    // *straight ahead* is the one bearing a reader does not have to think about.
    if (deg <= 22) {
      assert.equal(right, "straight ahead", `${deg}° is still the nose`);
      assert.equal(left, "straight ahead");
    } else if (deg >= 158) {
      assert.equal(right, "right behind it", `${deg}° is dead astern`);
      assert.equal(left, "right behind it");
    } else {
      assert.ok(right.includes("right"), `${deg}° to the right said "${right}"`);
      assert.ok(left.includes("left"), `${deg}° to the left said "${left}"`);
    }
  }
});

test("dead ahead and dead behind have no handedness", () => {
  assert.equal(bearingWord(0, 1), "straight ahead");
  assert.equal(bearingWord(0, -1), "right behind it");
  assert.equal(bearingWord(-0, 1), "straight ahead", "negative zero is still ahead");
});

test("the range words run from the nose to the rim without a gap", () => {
  const said = [];
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const w = rangeWord(p);
    assert.ok(w, `proximity ${p.toFixed(2)} has no word`);
    if (w !== said[said.length - 1]) said.push(w);
  }
  assert.equal(said.length, 4, `four bands, got ${said.length}`);
  assert.equal(said[0], "at the far edge of what it can see", "0 is the rim");
  assert.equal(said[3], "almost on top of it", "1 is the nose");
});

// ---- The two registers ----

const oneOf = (kind, sin, cos, prox) => [{ kind, noun: MARKS.find((m) => m.kind === kind).noun, sin, cos, prox }];

test("the held line says what is there and never where or how far", () => {
  // The walk that rewrote this: a held sentence beside a live picture of the
  // same thing may not describe anything the picture is showing, or the two
  // will be caught disagreeing. Both moving quantities are swept for.
  for (let deg = -180; deg <= 180; deg += 5) {
    const a = (deg * Math.PI) / 180;
    for (const prox of [0.05, 0.3, 0.6, 0.95]) {
      const line = eyeLine(oneOf("food", Math.sin(a), Math.cos(a), prox), "Nim");
      assert.equal(line, "Nim can see a speck of food. Nothing else in the pond reaches it.");
    }
  }
});

test("the label a listener gets carries the distance the dot carries", () => {
  const say = eyeSay(oneOf("food", 0, 1, 0.9), "Nim");
  assert.ok(say.includes("almost on top of it"), `no distance in "${say}"`);
  assert.ok(say.includes("Nim"), "and it says whose senses these are");
});

test("nothing in sight is said as a fact rather than as an empty list", () => {
  const line = eyeLine([], "Nim");
  const say = eyeSay([], "Nim");
  assert.ok(line.includes("nothing at all"), line);
  assert.ok(say.includes("nothing at all"), say);
  // The one sentence on this page whose whole content is an absence: it is
  // worth its own clause rather than a trailing "  .".
  assert.ok(!line.includes("  "), `doubled space in "${line}"`);
  assert.ok(!/\s\./.test(line), `space before the stop in "${line}"`);
});

test("no bearing carries a comma or an \"and\", because they are joined into lists", () => {
  // The measured constraint, not a style: a third of the descriptions this
  // panel writes have two or three things in them, and a bearing that
  // punctuates itself makes the listener's list unreadable. Walked over the
  // whole circle rather than read off the table, so a sector reworded later
  // cannot slip through.
  for (let deg = -180; deg <= 180; deg += 1) {
    const a = (deg * Math.PI) / 180;
    const w = bearingWord(Math.sin(a), Math.cos(a));
    assert.ok(!w.includes(","), `"${w}" carries a comma into a list`);
    assert.ok(!/\band\b/.test(w), `"${w}" carries an "and" into a list`);
  }
});

test("two and three things are listed the way English lists them", () => {
  const two = eyeLine(
    [...oneOf("food", 0, 1, 0.9), ...oneOf("threat", 0, -1, 0.4)],
    "Nim",
  );
  assert.ok(!two.includes(","), `two items need no comma: "${two}"`);
  assert.equal((two.match(/ and /g) || []).length, 1, `one joiner, not two: "${two}"`);
  assert.ok(two.includes("Nothing else in the pond reaches it"), two);
  const three = eyeLine(
    [...oneOf("food", 0, 1, 0.9), ...oneOf("prey", 1, 0, 0.5), ...oneOf("threat", 0, -1, 0.4)],
    "Nim",
  );
  assert.equal((three.match(/,/g) || []).length, 1, `three items take one comma: "${three}"`);
  assert.equal((three.match(/ and /g) || []).length, 1, `and one joiner: "${three}"`);
  assert.ok(three.includes(" and an animal that could eat it."), three);
});

test("neither register uses a word the page has not taught", () => {
  // The sweep `lifeline.js` and `key.js` both get. `prey` and `predator` are on
  // this list on purpose: the relation is the content, and *an animal it could
  // eat* says it without a vocabulary lesson.
  const JARGON = [
    "prey",
    "predator",
    "carnivor",
    "proximity",
    "vector",
    "bearing",
    "cos",
    "sin",
    "input",
    "normalis",
    "sensor",
    "radius",
  ];
  const said = [
    eyeLine([], "Nim"),
    eyeSay([], "Nim"),
    eyeLine([...oneOf("food", 0, 1, 0.9), ...oneOf("prey", 1, 0, 0.5), ...oneOf("threat", 0, -1, 0.4)], "Nim"),
    eyeSay([...oneOf("food", 0, 1, 0.9), ...oneOf("prey", 1, 0, 0.5), ...oneOf("threat", 0, -1, 0.4)], "Nim"),
  ];
  for (const line of said) {
    for (const word of JARGON) {
      assert.ok(!line.toLowerCase().includes(word), `"${word}" appears in "${line}"`);
    }
  }
});

test("the invitation is in the register of the hand reading it", () => {
  // v1.155's rule, applied at the site rather than a release later: a phone is
  // never told to click or to press a key it does not have.
  assert.match(eyeInvite(POINTER), /click/);
  assert.match(eyeInvite(TOUCH), /Tap/);
  assert.ok(!/click|press/i.test(eyeInvite(TOUCH)), eyeInvite(TOUCH));
  assert.equal(eyeInvite(), eyeInvite(POINTER), "an unasked hand gets the copy this page ships");
  // And the copy in the document is that same sentence, so a reader who arrives
  // before any script does is not read a third version of it. Compared with the
  // markup's own wrapping collapsed, which is how the page is authored.
  const shipped = (page.match(/id="eyeview-line"[^>]*>([\s\S]*?)<\/p>/) || [])[1];
  assert.ok(shipped, "the page has no #eyeview-line to check");
  assert.equal(shipped.replace(/\s+/g, " ").trim(), eyeInvite(POINTER));
});

test("the hold is long enough to read a clause and short enough to follow one", () => {
  // Pinned as an inequality with room either side, the way every other measured
  // constant here is: what this protects is that the words are held on a human
  // clock at all, not the particular number.
  assert.ok(WORD_HOLD_MS >= 400 && WORD_HOLD_MS <= 2000, `${WORD_HOLD_MS} ms`);
});

// ---- What it draws ----

const W = 112;
const H = 112;
const name = (op) => op[1];
const arg = (op, i) => op[2 + i];

function draw(seen) {
  const { ctx, ops } = recordingContext("eyeview");
  drawEye(ctx, W, H, seen);
  return ops;
}

test("the box is cleared, the reach is drawn, and the animal is drawn last", () => {
  const kinds = draw(oneOf("food", 0, 1, 0.5)).map(name);
  assert.equal(kinds[0], "clearRect", "the box is cleared first");
  assert.ok(kinds.includes("stroke"), "the dashed reach is stroked");
  assert.ok(kinds.includes("fill"), "and something is filled inside it");
  assert.equal(kinds[kinds.length - 1], "fill", "the animal is the last thing down");
});

test("an animal that can see nothing still gets its picture", () => {
  const kinds = draw([]).map(name);
  assert.ok(kinds.includes("stroke"), "the reach is still there");
  // The reach's wash, the reach's ring and the animal: an empty disc with a
  // chevron in the middle is exactly the picture this panel exists to show.
  assert.equal(kinds.filter((k) => k === "fill").length, 2, kinds.join(","));
});

test("nothing is ever drawn under the animal or off the rim", () => {
  const cx = W / 2;
  const cy = H / 2;
  for (let prox = 0.001; prox <= 1; prox += 0.01) {
    for (let deg = -180; deg < 180; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const ops = draw(oneOf("food", Math.sin(a), Math.cos(a), prox));
      const arcs = ops.filter((o) => name(o) === "arc");
      // The reach's own circle is the first arc; the blip's are the rest.
      const blip = arcs[arcs.length - 1];
      const [x, y] = [arg(blip, 0), arg(blip, 1)];
      const d = Math.hypot(x - cx, y - cy);
      assert.ok(d > 8, `a blip at prox ${prox.toFixed(2)} sat ${d.toFixed(1)} px from the animal`);
      assert.ok(d < Math.min(W, H) / 2, `a blip at prox ${prox.toFixed(2)} sat outside the reach`);
    }
  }
});

test("a nearer thing is drawn over a further one, not under it", () => {
  const ops = draw([...oneOf("threat", 0, 1, 0.9), ...oneOf("prey", 0, 1, 0.1)]);
  const arcs = ops.filter((o) => name(o) === "arc");
  const cy = H / 2;
  // Both are dead ahead, so the near one is the one closer to the centre, and
  // it has to be the *later* of the two.
  const [far, close] = [arcs[1], arcs[arcs.length - 1]];
  assert.ok(
    Math.abs(arg(close, 1) - cy) < Math.abs(arg(far, 1) - cy),
    "the nearest blip is drawn last, so nothing can hide it",
  );
});

test("a box with no room draws nothing rather than a negative circle", () => {
  const { ctx, ops } = recordingContext("eyeview");
  drawEye(ctx, 2, 2, oneOf("food", 0, 1, 0.5));
  assert.deepEqual(ops.map(name), ["clearRect"]);
});

// ---- Pure observer ----

test("reading an animal's senses every tick moves no pond", () => {
  const run = (watch) => {
    const config = makeConfig({ seed: 1234, predation: true });
    const world = new World(config);
    for (let t = 0; t < 500; t++) {
      world.step();
      if (watch) {
        const c = world.creatures.find((x) => !x.dead) ?? null;
        const seen = eyeSight(c, config);
        // The words and the drawing too: everything the page does per frame.
        if (c) {
          eyeLine(seen, "Nim");
          eyeSay(seen, "Nim");
        }
        drawEye(recordingContext("eyeview").ctx, W, H, seen);
      }
    }
    return stateFingerprint(world);
  };
  assert.equal(run(true), run(false));
});
