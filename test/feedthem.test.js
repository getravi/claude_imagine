// feedthem.test.js — the one press beside the empty bar (v1.179).
//
// Four groups of claims.
//
// **The offer is a claim, so it is only made where it is true.** The button says
// *feed them*, and in a world whose plant penalty reaches 1 a pure carnivore
// gets nothing whatever out of a pellet. `canFeed` is the guard, and it is
// pinned against `fuel.js#plantMealFor` rather than against a second copy of
// `world.js`'s grazing line — a button that priced a meal differently from the
// sentence directly above it would be this panel disagreeing with itself.
//
// **The words.** Plain English, in this page's register: no jargon, no numeral
// at the front, a finished sentence in every arm, and the count of *other*
// animals who can see the drop said in words. That count is the honest half of
// the feature and it is asserted to be in the sentence rather than trusted to
// stay there.
//
// **One hiding mechanism.** v1.178 shipped a gauge into this same panel wearing
// both a `hidden` attribute and a `.waiting` class, branched on the attribute,
// and spent the release invisible behind the stale one. So this file reads the
// shipped page, the stylesheet and the adapter: the button is hidden by the
// attribute and by nothing else, and main.js writes it outside every early
// return it has.
//
// **The measurement is a record, not a mood.** `RESCUE` is the controlled sweep
// this release rests on — the same seed, the same instant, pressed and unpressed
// — and the arithmetic that makes it an argument (fed beats unfed; the pellets
// add up to a handful) is asserted here so a later cycle that moves a constant
// finds out.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { drawStream } from "../src/fingerprint.js";
import { HANDFUL, HAND_LABEL, dropHandful } from "../src/handfeed.js";
import { plantMealFor } from "../src/fuel.js";
import { FEED_LABEL, RESCUE, canFeed, feedLine } from "../src/feedthem.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** A stand-in for one animal: the two fields this module ever reads. */
const animal = (carnivory = 0.2, dead = false) => ({ carnivory, dead });

// ---------------------------------------------------------------------------
// The offer is a claim
// ---------------------------------------------------------------------------

test("a handful is offered to anybody a pellet is worth something to", () => {
  const cfg = makeConfig({});
  for (const carnivory of [0, 0.2, 0.55, 0.9, 1]) {
    assert.equal(canFeed(animal(carnivory), cfg), true, `a diet of ${carnivory} was refused food`);
  }
});

test("it is not offered over an empty seat, or over a body", () => {
  const cfg = makeConfig({});
  assert.equal(canFeed(null, cfg), false);
  assert.equal(canFeed(undefined, cfg), false);
  assert.equal(canFeed(animal(0.2, true), cfg), false, "the dead are not hungry");
});

test("it is not offered to an animal this world's pellets cannot feed", () => {
  // Not a pond this project ships, and exactly the shape that would put a
  // button reading *feed them* under an animal that cannot eat what it drops.
  const cfg = makeConfig({ plantPenaltyFromDiet: 1, predation: false });
  assert.equal(canFeed(animal(1), cfg), false, "a pure carnivore was offered a pellet worth nothing");
  assert.equal(canFeed(animal(0.4), cfg), true, "somebody who can still eat was refused");
});

test("the rule asks fuel.js what a pellet is worth rather than working it out again", () => {
  // One copy of `world.js`'s grazing line, read by the sentence above the button
  // and by the button. The tell that a second one has appeared is this module
  // naming the constants itself.
  const src = read("src/feedthem.js");
  const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const name of ["foodEnergy", "plantPenaltyFromDiet", "carnivoreThreshold"]) {
    assert.doesNotMatch(code, new RegExp(`\\b${name}\\b`), `feedthem.js prices a meal itself (${name})`);
  }
  // And the pairing holds at the boundary, from both sides.
  const cfg = makeConfig({ plantPenaltyFromDiet: 1 });
  assert.equal(plantMealFor(animal(1), cfg), 0);
  assert.equal(canFeed(animal(1), cfg), false);
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

const JARGON =
  /\b(energy|metabolis\w*|carnivor\w*|herbivor\w*|lineage|genome|threshold|tick|ticks|px|pixels?|fitness|RNG|seed|config|pellets? radius)\b/i;

test("every sentence the press can say is plain, finished, and does not open with a numeral", () => {
  const said = new Set();
  for (let placed = 1; placed <= HANDFUL; placed++) {
    for (const others of [0, 1, 2, 7, 11, 40]) said.add(feedLine("Willow", placed, others));
  }
  for (const line of said) {
    assert.doesNotMatch(line, JARGON, `"${line}" reaches for a word this page has not taught`);
    assert.match(line, /\.$/, `"${line}" is not a finished sentence`);
    assert.doesNotMatch(line, /^\d/, `"${line}" opens with a numeral`);
    assert.match(line, /Willow/, `"${line}" forgot who it was for`);
  }
});

test("the sentence counts the others, because a handful is public", () => {
  // The measured half of this feature: a median of five of these ten go to
  // somebody who was simply passing. A line that said *ten pellets for Willow*
  // and stopped would be promising a private meal the pond does not serve.
  assert.match(feedLine("Willow", 10, 0), /Nobody else/);
  assert.match(feedLine("Willow", 10, 1), /One other animal/);
  assert.match(feedLine("Willow", 10, 5), /Five other animals/);
  // Past the vocabulary it degrades to a numeral mid-sentence rather than to
  // nothing — a crowded pond still owes the reader an answer.
  assert.match(feedLine("Willow", 10, 23), /23 other animals/);
});

test("one pellet is not *one pellets*, and it is not *them*", () => {
  const one = feedLine("Willow", 1, 3);
  assert.match(one, /^One pellet for Willow\./);
  assert.match(one, /\bsee it\b/, "a single pellet is an it");
  assert.match(feedLine("Willow", 2, 3), /\bsee them\b/);
});

test("the label wears the mark of the control it shortens", () => {
  // `🥣 Feed by hand` is the aimed version of this press and lives four panels
  // up. Two marks for one act would be the page teaching two words for it.
  assert.ok(FEED_LABEL.startsWith("🥣"), "the press does not wear the feeding mark");
  assert.ok(HAND_LABEL.off.startsWith("🥣"));
  assert.notEqual(FEED_LABEL, HAND_LABEL.off, "two controls, two labels");
});

// ---------------------------------------------------------------------------
// One hiding mechanism
// ---------------------------------------------------------------------------

test("the button is in the panel the bar is in, and starts hidden", () => {
  const page = read("app/index.html");
  const fuel = page.slice(page.indexOf('<section id="fuel"'));
  const end = fuel.indexOf("</section>");
  const panel = fuel.slice(0, end);
  assert.ok(end > 0, "the fuel panel has no end — this test is reading the wrong thing");
  assert.match(panel, /id="btn-feedthem"/, "the press is not in the panel it is about");
  const tag = panel.match(/<button[^>]*id="btn-feedthem"[^>]*>/);
  assert.ok(tag, "no button carries the id");
  assert.match(tag[0], /\bhidden\b/, "it does not start hidden, so a first frame shows it over an empty seat");
});

test("nothing but that attribute ever hides it", () => {
  // The whole of v1.178's bug, as a rule: a redundant hiding mechanism is not
  // belt and braces, it is two sources of truth, and the one branched on is the
  // one that goes stale.
  const css = read("style.css");
  for (const rule of css.split("}")) {
    if (!/\.f-feed\b/.test(rule)) continue;
    assert.doesNotMatch(
      rule,
      /display\s*:\s*none|visibility\s*:\s*hidden/,
      `the stylesheet hides .f-feed as well as the attribute:\n${rule.trim()}}`,
    );
  }
});

test("the adapter writes the attribute on every frame, not inside a branch", () => {
  const main = read("src/main.js");
  const fn = main.slice(main.indexOf("function updateFuel()"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /btn-feedthem/, "updateFuel never touches the press");
  // Ahead of the first `return`, which is what makes it unconditional: the
  // waiting arm and the live arm both leave through one.
  const write = body.indexOf("btn-feedthem");
  const firstReturn = body.indexOf("return");
  assert.ok(
    write < firstReturn,
    "the press is hidden behind one of updateFuel's early returns, which is where the gauge's bug was",
  );
});

// ---------------------------------------------------------------------------
// The press itself
// ---------------------------------------------------------------------------

test("a handful dropped on an animal draws nothing from the world's generator", () => {
  // `handfeed.test.js` makes this claim about an aimed touch; it is re-made here
  // because the press has a *new caller* and directive 2 is about what a pond
  // does, not about which module called it.
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 600; i++) world.step();
  const draws = drawStream(world.rng);
  const c = world.creatures.find((k) => !k.dead);
  for (let i = 0; i < 20; i++) dropHandful(world, c.x, c.y);
  assert.equal(draws.count, 0, "the one-press feed reached into the pond's randomness");
});

test("the press puts food where the animal already is", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 600; i++) world.step();
  const c = world.creatures.find((k) => !k.dead);
  const before = world.food.items.length;
  const drop = dropHandful(world, c.x, c.y);
  assert.equal(drop.pellets.length, HANDFUL, "the pond refused a handful it may not refuse");
  assert.equal(world.food.items.length, before + HANDFUL);
  // Close enough that the animal is standing in its own handful: the innermost
  // spot is inside the distance it eats at, so the first pellet is a mouthful
  // rather than a journey.
  const near = drop.pellets.filter((p) => Math.hypot(p.x - c.x, p.y - c.y) <= world.config.eatRadius);
  assert.ok(near.length >= 1, "not one pellet landed within reach of the animal it was for");
});

// ---------------------------------------------------------------------------
// The measurement
// ---------------------------------------------------------------------------

test("the sweep is a record with a control in it, and the control loses", () => {
  assert.ok(RESCUE.seeds >= 40, "fewer than forty ponds is an anecdote");
  assert.ok(RESCUE.watched > 0);
  for (const share of [RESCUE.aliveFed, RESCUE.aliveUnfed, RESCUE.splitFed, RESCUE.splitUnfed]) {
    assert.ok(share >= 0 && share <= 1, `${share} is not a share`);
  }
  assert.ok(
    RESCUE.aliveFed > RESCUE.aliveUnfed,
    "the press did not beat doing nothing, and this release has no argument",
  );
  assert.ok(RESCUE.splitFed >= RESCUE.splitUnfed);
});

test("the pellets in the record add up to a handful", () => {
  assert.ok(
    RESCUE.ownPellets + RESCUE.otherPellets <= HANDFUL,
    "more pellets were accounted for than were ever dropped",
  );
  assert.ok(RESCUE.ownPellets >= 1, "the animal you fed got none of it, which is a different feature");
  assert.ok(
    RESCUE.otherPellets >= 1,
    "nobody else got any, so the sentence about the others is decoration",
  );
});
