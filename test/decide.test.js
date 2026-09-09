// decide.test.js — the figure that puts an animal's steering on the same line
// as the food it is steering by.
//
// Five groups of claims, and the first is the one everything else rests on.
//
// **The reading is the animal's own decision.** `decide.js` does not store what
// `act()` applied; it re-runs the brain pass with `learning: false`. That is
// either exactly what steered the body or it is a made-up number, and there is
// no third possibility — so the test captures a real `think()` and asserts
// bit-for-bit equality against `decision()`, with the aux senses switched on as
// well as off, because the aux path is the one where an order could drift.
//
// **The sign.** `turnsTowards` is one comparison of two signs, and a flip in it
// would produce a panel that is confidently wrong in a way nothing on screen
// could contradict — the wedge would lean the other way and still look like a
// decision. It is pinned against `act()`'s own arithmetic: a positive turn
// really does move the heading towards a target with a positive `sin`.
//
// **The tally.** It is a share of one named animal's decisions, so the failures
// worth writing are the ones a visitor could never catch: a score carried
// across a change of subject, a score left standing after its subject died, and
// a share printed off nine samples.
//
// **The two registers**, the way every worded surface here gets them: the
// visible line may not name a direction (that is the whole of the split this
// panel is built on — the picture carries *where*), the spoken label must, and
// neither may reach for a word only somebody already here knows.
//
// **The drawing**, in what a reader can check by looking: nothing is drawn
// outside the box, an animal that can see no food gets no speck, a turn of
// exactly zero is drawn on the middle and not to one side of it, and a bigger
// turn puts its mark further out.
//
// And the pure-observer claim, run the way `eyeview.test.js` and `doing.test.js`
// run theirs: two identical ponds, one of them read every step, fingerprinted
// at the end.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { makeConfig } from "../src/config.js";
import { Genome } from "../src/genome.js";
import { RNG } from "../src/rng.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { recordingContext } from "../src/rendershot.js";
import { SENSE } from "../src/doing.js";
import { POINTER, TOUCH } from "../src/hand.js";
import {
  EASE,
  MIN_SAMPLES,
  MOTOR,
  PUSH,
  SteerTally,
  decideInvite,
  decideLine,
  decideSay,
  decision,
  drawSteer,
  effortWord,
  foodSideWord,
  sideWord,
  steerMark,
  turnsTowards,
} from "../src/decide.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/** A pond stepped far enough that its animals have senses filled in. */
function pond(over = {}, steps = 300) {
  const w = new World(makeConfig({ seed: 314, ...over }));
  for (let i = 0; i < steps; i++) w.step();
  return w;
}

/** The first living animal in a pond that can see food. */
function seer(world) {
  return world.creatures.find((c) => !c.dead && c._in[SENSE.foodProx] > 0) || null;
}

// ---------------------------------------------------------------------------
// The reading is the animal's own decision
// ---------------------------------------------------------------------------

test("decision() is bit-for-bit what the brain just told the body", () => {
  const w = pond();
  let checked = 0;
  for (const c of w.creatures) {
    if (c.dead) continue;
    // `think()` returns the brain's own scratch buffer, which `decision()` is
    // about to overwrite — so it is copied before anything else runs.
    const real = Array.from(c.think());
    const got = decision(c);
    assert.equal(got.turn, real[MOTOR.turn]);
    assert.equal(got.signal, real[MOTOR.signal]);
    // Thrust is the command the body receives, not the raw channel: `act()`
    // clamps it, and the negative half is a creature that has stopped.
    assert.equal(got.thrust, Math.max(0, Math.min(1, real[MOTOR.thrust])));
    checked++;
  }
  assert.ok(checked > 10, "the pond should have had animals to read");
});

test("the aux senses are read back, not re-gathered — three of them on", () => {
  const w = pond({ signalling: true, groundSense: true, wallSense: true, terrain: true });
  let checked = 0;
  for (const c of w.creatures) {
    if (c.dead) continue;
    assert.ok(c.brain.nAux >= 1, "this world should have wired extra senses");
    const real = Array.from(c.think());
    const got = decision(c);
    assert.equal(got.turn, real[MOTOR.turn]);
    checked++;
  }
  assert.ok(checked > 5);
});

test("decision() is null for nobody and for the dead", () => {
  assert.equal(decision(null), null);
  assert.equal(decision(undefined), null);
  const w = pond();
  const c = w.creatures[0];
  c.dead = true;
  assert.equal(decision(c), null);
  assert.equal(steerMark(c), null);
});

test("reading a brain never changes it, even a plastic one", () => {
  const w = pond({ plasticity: true }, 200);
  for (const c of w.creatures) {
    if (c.dead) continue;
    const before = Float32Array.from(c.brain.w);
    decision(c);
    decision(c);
    assert.deepEqual(Float32Array.from(c.brain.w), before);
  }
});

// ---------------------------------------------------------------------------
// The sign
// ---------------------------------------------------------------------------

test("a positive turn really is a turn towards a target on the right", () => {
  const cfg = makeConfig({ seed: 1 });
  const rng = new RNG(7);
  const c = new Creature(Genome.random(rng, false), cfg, 100, 100, rng);
  c.heading = 0;
  // A pellet at +y is on the animal's right when it faces +x, because the world
  // is drawn with y increasing downward — `doing.js#SENSE`'s convention, pinned
  // there against a real `sense()` call.
  c.sense({ x: 100, y: 130 }, 30, null, Infinity, null, Infinity);
  assert.ok(c._in[SENSE.foodSin] > 0, "the pellet should read as being to its right");

  const before = c.heading;
  c.act([0.5, 0, 0]);
  assert.ok(c.heading > before, "a positive turn should swing the nose to its right");
  assert.ok(turnsTowards(0.5, c._in[SENSE.foodSin]), "so a positive turn is towards it");
  assert.ok(!turnsTowards(-0.5, c._in[SENSE.foodSin]));
});

test("a turn of nothing, and food on neither side, are both 'not towards'", () => {
  assert.equal(turnsTowards(0, 0.9), false);
  assert.equal(turnsTowards(0.9, 0), false);
  assert.equal(turnsTowards(-0.4, -0.4), true);
});

// ---------------------------------------------------------------------------
// What the figure is handed
// ---------------------------------------------------------------------------

test("steerMark carries the sine of the food's bearing, or null for none", () => {
  const w = pond();
  const c = seer(w);
  assert.ok(c, "the pond should hold somebody who can see food");
  const m = steerMark(c);
  assert.equal(m.food, c._in[SENSE.foodSin]);
  assert.ok(m.turn >= -1 && m.turn <= 1);
  assert.ok(m.thrust >= 0 && m.thrust <= 1);

  const blind = w.creatures.find((x) => !x.dead) || c;
  blind._in[SENSE.foodProx] = 0;
  assert.equal(steerMark(blind).food, null);
});

// ---------------------------------------------------------------------------
// The tally
// ---------------------------------------------------------------------------

test("the tally counts only decisions taken with food in sight", () => {
  const w = pond();
  const c = seer(w);
  const t = new SteerTally();
  for (let i = 0; i < 40; i++) {
    w.step();
    if (c.dead) break;
    t.sample(c);
  }
  assert.ok(t.seen > 0, "it should have taken samples");
  assert.ok(t.toward <= t.seen);
  assert.equal(t.id, c.id);
});

test("a share is withheld until there is enough of it to mean anything", () => {
  const t = new SteerTally();
  t.id = 1;
  t.seen = MIN_SAMPLES - 1;
  t.toward = 60;
  assert.equal(t.share(), null);
  t.seen = MIN_SAMPLES;
  assert.equal(t.share(), 60 / MIN_SAMPLES);
});

test("changing subject forgets the last one's score", () => {
  const w = pond();
  const a = seer(w);
  const b = w.creatures.find((x) => !x.dead && x.id !== a.id);
  const t = new SteerTally();
  for (let i = 0; i < 20; i++) {
    w.step();
    if (a.dead) break;
    t.sample(a);
  }
  const carried = t.seen;
  t.sample(b);
  assert.ok(t.seen < carried || carried === 0, "the count should have restarted");
  assert.equal(t.id, b.id);
});

test("a subject that dies, or nobody at all, puts the score out", () => {
  const w = pond();
  const c = seer(w);
  const t = new SteerTally();
  for (let i = 0; i < 20; i++) {
    w.step();
    if (c.dead) break;
    t.sample(c);
  }
  c.dead = true;
  t.sample(c);
  assert.equal(t.id, null);
  assert.equal(t.seen, 0);
  t.sample(null);
  assert.equal(t.id, null);
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

const JARGON =
  /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|RNG|seed|vector|neuron|weights?)\b/i;

test("the visible line never names a direction — the picture carries that", () => {
  const SIDES = /\b(left|right|ahead|astern|behind)\b/i;
  const marks = [
    { turn: 0.9, thrust: 1, food: -0.9 },
    { turn: -0.9, thrust: 0, food: 0.9 },
    { turn: 0, thrust: 0.5, food: null },
    { turn: 0.2, thrust: 0.95, food: 0.1 },
  ];
  for (const m of marks) {
    for (const share of [null, 0, 0.5, 1]) {
      const line = decideLine("Nim", m, share);
      assert.doesNotMatch(line, SIDES, `"${line}" names a side the figure is already drawing`);
      assert.doesNotMatch(line, JARGON, `"${line}" uses a word only somebody already here knows`);
      assert.ok(line.startsWith("Nim "), `"${line}" should open with the animal's name`);
      assert.ok(line.length < 160, `"${line}" is too long for two lines of a column`);
    }
  }
});

test("the spoken label does name both directions, because a listener has no picture", () => {
  const say = decideSay("Nim", { turn: -0.9, thrust: 1, food: 0.9 }, 0.62);
  assert.match(say, /left/);
  assert.match(say, /right/);
  assert.match(say, /62%/);
  assert.doesNotMatch(say, JARGON);
  assert.equal(decideSay("Nim", null, null), "Nobody is picked yet.");
});

test("food on neither side is never called 'straight ahead'", () => {
  // The figure's line is the *sine* of the bearing, which folds ahead and
  // astern onto the same middle. That is right for the picture and a plain
  // falsehood in a sentence, so the two registers use different words.
  assert.equal(sideWord(0), "straight ahead");
  assert.equal(foodSideWord(0), "on neither side of it");
  assert.match(sideWord(-0.9), /left/);
  assert.match(foodSideWord(0.9), /right/);
});

test("the share is printed as a whole percent, and only once it exists", () => {
  const m = { turn: 0.1, thrust: 1, food: 0.4 };
  assert.match(decideLine("Nim", m, 0.618), /62%/);
  assert.doesNotMatch(decideLine("Nim", m, null), /%/);
  assert.match(decideLine("Nim", { ...m, food: null }, null), /no food in sight/);
});

test("the three effort words are the three measured states", () => {
  assert.equal(effortWord(1), "swimming hard");
  assert.equal(effortWord(PUSH), "swimming hard");
  assert.equal(effortWord(0), "coasting");
  assert.equal(effortWord(EASE), "coasting");
  assert.equal(effortWord(0.5), "swimming");
});

test("the invitation is in both registers and neither names the wrong device", () => {
  assert.match(decideInvite(POINTER), /click/i);
  assert.match(decideInvite(TOUCH), /tap/i);
  assert.doesNotMatch(decideInvite(TOUCH), /click|press [A-Z]\b|keyboard/i);
  // The shipped markup carries the pointer register, because that is what a
  // reader sees before any script runs.
  const html = readFileSync(join(ROOT, "app/index.html"), "utf8");
  assert.ok(
    html.includes("and this shows what it\n                decides to do."),
    "the panel's static line should be `hand.js`'s pointer register, wrapped"
  );
});

// ---------------------------------------------------------------------------
// The drawing
// ---------------------------------------------------------------------------

/** Every point an op put ink at. Ops are `[id, name, ...args]`. */
function inkPoints(ops) {
  const pts = [];
  for (const [, fn, ...a] of ops) {
    if (fn === "arc") pts.push({ x: a[0], y: a[1] });
    if (fn === "fillRect") {
      pts.push({ x: a[0], y: a[1] });
      pts.push({ x: a[0] + a[2], y: a[1] + a[3] });
    }
    if (fn === "moveTo" || fn === "lineTo") pts.push({ x: a[0], y: a[1] });
  }
  return pts;
}

/** Every op of one kind, as its argument list. */
function opsNamed(ops, fn) {
  return ops.filter((o) => o[1] === fn).map((o) => o.slice(2));
}

const W = 248;
const H = 72;

/** One drawing, as its op log. */
function drawn(mark) {
  const { ctx, ops } = recordingContext("decide");
  drawSteer(ctx, W, H, mark);
  return ops;
}

test("nothing is drawn outside the box, at either end of the line", () => {
  for (const turn of [-1, -0.5, 0, 0.5, 1]) {
    for (const food of [-1, 0, 1, null]) {
      for (const p of inkPoints(drawn({ turn, thrust: 1, food }))) {
        assert.ok(p.x >= 0 && p.x <= W, `x ${p.x} left the box at turn ${turn}`);
        assert.ok(p.y >= 0 && p.y <= H, `y ${p.y} left the box at turn ${turn}`);
      }
    }
  }
});

test("an animal that can see no food gets no speck", () => {
  assert.ok(opsNamed(drawn({ turn: 0.3, thrust: 1, food: 0.5 }), "arc").length > 0);
  assert.equal(opsNamed(drawn({ turn: 0.3, thrust: 1, food: null }), "arc").length, 0);
});

test("the speck goes where the food is: left of the middle for food on the left", () => {
  const at = (food) => opsNamed(drawn({ turn: 0, thrust: 1, food }), "arc")[0][0];
  assert.ok(at(-0.8) < W / 2);
  assert.ok(at(0.8) > W / 2);
  assert.ok(at(-0.8) < at(-0.2) && at(-0.2) < at(0.2) && at(0.2) < at(0.8));
});

test("a turn of exactly nothing is drawn on the middle, not to one side", () => {
  const caps = opsNamed(drawn({ turn: 0, thrust: 1, food: null }), "fillRect");
  assert.ok(caps.length > 0);
  const cap = caps[caps.length - 1];
  // The cap straddles the middle: a mark that had picked a side would sit
  // wholly on one of them, which is the arrowhead this figure does not draw.
  assert.ok(cap[0] < W / 2 && cap[0] + cap[2] > W / 2, "the cap should straddle the middle");
});

test("a harder turn puts its mark further out, on both sides", () => {
  const capX = (turn) => {
    const rects = opsNamed(drawn({ turn, thrust: 1, food: null }), "fillRect");
    const cap = rects[rects.length - 1];
    return cap[0] + cap[2] / 2;
  };
  assert.ok(capX(1) > capX(0.5));
  assert.ok(capX(0.5) > capX(0));
  assert.ok(capX(0) > capX(-0.5));
  assert.ok(capX(-0.5) > capX(-1));
});

test("nobody picked draws nothing at all", () => {
  const ops = drawn(null);
  assert.deepEqual(ops.map((o) => o[1]), ["clearRect"]);
});

// ---------------------------------------------------------------------------
// Pure observer
// ---------------------------------------------------------------------------

test("a pond somebody is reading is bit for bit a pond nobody is", () => {
  const watched = new World(makeConfig({ seed: 909 }));
  const alone = new World(makeConfig({ seed: 909 }));
  const tally = new SteerTally();
  for (let i = 0; i < 600; i++) {
    watched.step();
    // Everything the page does every step, on a subject that keeps changing —
    // which is also the harder case for the tally.
    const subject = watched.creatures[i % Math.max(1, watched.creatures.length)] || null;
    tally.sample(subject && !subject.dead ? subject : null);
    steerMark(subject);
    drawSteer(recordingContext("decide").ctx, W, H, steerMark(subject));
    alone.step();
  }
  assert.equal(stateFingerprint(watched), stateFingerprint(alone));
});

test("the panel's own markup is on the page, and outside the switch", () => {
  const html = readFileSync(join(ROOT, "app/index.html"), "utf8");
  const panel = html.slice(html.indexOf('id="decide"'), html.indexOf('id="obituary"'));
  assert.ok(panel.includes('id="decide-canvas"'), "the figure should be in the page");
  assert.ok(panel.includes('id="decide-line"'), "the line should be in the page");
  // A picture rather than an instrument: `simpleview.js`'s switch must not hide
  // it, which is the mistake v1.157 found on the quiet side of that switch.
  assert.ok(!panel.includes("data-expert"), "this panel is not an instrument");
});
