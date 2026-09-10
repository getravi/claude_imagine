// decide.js — the animal's own steering, on the same line as the food it is
// steering by.
//
// The page now shows a stranger two thirds of an animal. `👁 What it can see`
// (v1.161) is the nine numbers it is handed; `👆 What they are doing` (v1.148)
// is the verb a watcher would use for the result. Between them is the only part
// that is actually the *animal* — the tiny brain the front door has promised
// since day one — and in a hundred and sixty-two releases it has been drawn
// exactly once: as a bar chart of 243 weights, behind v1.149's switch, in the
// panel a newcomer never opens.
//
// Sees → **decides** → does. This is the middle one, and it is one picture:
//
//     its left ·············|············· its right
//                    ●                            ← the food it can see
//                    ╷                                 (and a line dropped from it)
//                ━━━━┫                            ← the turn its brain is asking for
//
// One horizontal line for *which way*. A green speck on the top row for where
// the nearest food lies, with a line dropped from it. A white bar on the bottom
// row, out from the middle to the turn its brain just asked for. When the two line up, the animal is going for its lunch and a
// visitor can see that without being told a single number. When they do not —
// and they often do not — the visitor is looking at the honest answer to *why
// is that one being so stupid*, which is that nobody wrote the rule, and this
// one has not inherited it.
//
// **Both marks are already taught.** The mote is the pond's own food colour,
// drawn twice the way `key.js`'s swatch and `eyeview.js`'s blip draw it. The
// bar is `selectionMark()`'s white, which is what the animal you picked is
// already wearing in the water. So `🔍 What you are looking at` is this
// figure's legend too, and nothing new had to be invented to read it —
// v1.158's rule, applied before drawing rather than after.
//
// ## The number this panel exists to make visible
//
// Twelve seeds, sampled across the pond's first six thousand steps — 233,123
// animal-instants with food in sight:
//
// | who is steering | turns towards the food it can see |
// | --- | --- |
// | the animals a pond is handed (generation 0) | **49.7%** (n = 24,721) |
// | everyone, over the whole run | 57.5% |
// | everyone still swimming after 5,000 steps | **58.6%** |
//
// The founders are a coin toss. Not "close to" one — 49.7%, on 24,721 samples,
// which is the arithmetic null with no measuring required: a brain of random
// weights has no opinion about which way food is. Five thousand steps later the
// pond turns the right way three times in five, and the whole of the difference
// is that the ones that happened to turn the right way had more young.
//
// **A nine-point edge is a small thing, and that is the point of putting it on
// a screen instead of in a sentence.** It is taken once a step, by every animal
// alive, for as long as it lives, and what it compounds into is the number
// `aim.js` reports one panel down: **75.2%** of the animals in a grown pond are
// *pointed at* their food. Those two figures are not in tension and the pair is
// the most interesting thing here — `aim.js` measures a **position**, which is
// hundreds of decisions already added up, and this measures **one decision**.
// The position is where the tiny bias has got to; the decision is the bias.
//
// ## What it says about the animal you picked, and why the number is a tally
//
// A single turn command is not worth a sentence: it changes every step, and a
// caption that rewrote itself sixty times a second would be a strobe. So the
// words carry a **running share** — *has turned towards food it could see 62%
// of the time since you picked it* — which is a statement about the past and
// therefore cannot fall out of step with the live bar beside it. That is
// v1.161's rule (the words say *what*, the picture says *where*) taken one step
// further: here the words are about a *different time* from the picture, so
// there is no instant at which the two are describing the same thing at all.
//
// It also gives a visitor something this page has never offered: **their own
// animal's score**, against a pond-wide figure printed underneath it.
//
// `MIN_SAMPLES` is measured rather than chosen. Following 110 animals for their
// next 900 steps, the median gap between the share at N samples and the share
// that animal finishes on is **5.0 points at 60, 3.8 at 120, 1.9 at 300**. So
// 120 is where a two-second wait buys a number good to about four points, and
// everything after it is bought slowly. Below that the line says so rather than
// printing a share made of nine samples.
//
// ## How the decision is read, and the one case where it is a hair stale
//
// `Creature#act` applies `out[0]` and `out[1]` and keeps neither. Rather than
// add two fields to a creature — which would put simulation state on the pond
// for an observer's benefit, and land in `fingerprint.js`'s two lists with no
// honest side to be on — this re-runs the pass the animal has already run:
//
//     brain.forward(c._in, aux, /* learning */ false)
//
// That third argument is not new and is not a workaround. `nn.js` has carried
// it since plasticity landed, with the comment *it exists so an observer can
// ask a brain a hypothetical question without that question becoming part of
// the creature's experience*, and `auxSway` in `creature.js` is its other
// caller. The input buffer is the one the brain was handed on this step and the
// aux buffer is the one `think()` filled, so on a **fixed** brain — every
// default world, and every world in this project bar the `plasticity` opt-in —
// the numbers here are bit-for-bit the numbers the body was steered by, and
// `test/decide.test.js` pins that against a real `think()`.
//
// On a **plastic** brain they are a hair stale: the weights learned from the
// step between `think()` and this reading, so what is drawn is what the animal
// *would* decide now, given the view it has now. That is a true sentence about
// a live animal rather than a wrong one about a past instant, it is the only
// reading available without writing to a creature, and it is stated here rather
// than discovered later.
//
// PURE OBSERVER. It reads `_in`, `_aux` and the brain's weights, writes nothing
// to any creature or to the world, adds no field to anything, and draws no
// random number. The tally is sampled from `witnessStep` on the **tick** and
// never on the frame — `aim.js`'s reason, which is the whole promise of the
// share: two people reading the same seed with the same animal picked read the
// same number, on a phone and on a desktop. `test/decide.test.js` runs a
// watched pond against an unwatched one and fingerprints both.

import { thrustCommand } from "./creature.js";
import { SENSE } from "./doing.js";
import { POINTER, say } from "./hand.js";
import { axisRule, foodMote, rgbaCss, selectionMark } from "./palette.js";

/**
 * What the three brain outputs steer, by index.
 *
 * `doing.js#SENSE` is this project's one account of what an animal *perceives*;
 * this is the other half of the same idea and it is declared for the same
 * reason — `act()` reads `out[0]` and `out[1]` by number, and a second reader
 * that re-types those numbers is a sign error nobody would ever see, because a
 * pond steering by its thrust channel would still look like a pond.
 *
 * `signal` is here because it is the third output and leaving it out would make
 * this list look complete when it is not; nothing in this file draws it, and
 * the colour it sets is already a mark in the water (`palette.js#signalRing`).
 */
export const MOTOR = Object.freeze({ turn: 0, thrust: 1, signal: 2 });

/**
 * How many samples before the running share is worth printing.
 *
 * Measured, not picked: following 110 animals for their next 900 steps, the
 * median gap between the share at N samples and the share the same animal
 * finishes on is 5.0 points at 60, **3.8 at 120** and 1.9 at 300. Two seconds
 * of watching at 1× buys a number right to about four points; the next 1.9
 * points cost three times as long. Under it the line says it is still watching,
 * which is the honest register and also the one that tells a visitor the number
 * is *theirs* — it started when they pressed.
 */
export const MIN_SAMPLES = 120;

/**
 * Thrust at or above this is a creature going flat out; at or below `EASE` it
 * has effectively stopped pushing.
 *
 * Both are read off the same sweep rather than framed: thrust is bimodal here —
 * **61.6% of instants sit at 0.9 or above and 25.4% at 0.05 or below**, with
 * the remaining eighth spread between. So the three words below are three real
 * populations, and the middle one is the small one, which is the opposite of
 * how a hand-picked pair of thresholds usually lands.
 */
export const PUSH = 0.9;
/** See `PUSH`. */
export const EASE = 0.05;

/** Where the marks sit in the figure, as fractions of its height. */
const ROW = Object.freeze({ food: 0.3, steer: 0.7 });

/** The figure's side margin, in canvas pixels, so a mark at ±1 is not clipped. */
const PAD = 12;

/** The food mote's radius and the steering bar's half-height, likewise. */
const MOTE_R = 5;
const WEDGE_H = 4;

/** The cap on the end of the steering bar, in canvas pixels. */
const CAP_W = 3;

const clamp11 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

/**
 * What one animal's brain is asking its body to do, right now.
 *
 * Returns `null` for a dead animal or for nobody, so a caller has one test for
 * "there is nothing to draw" rather than three.
 *
 * @param {object|null} creature
 * @returns {{turn: number, thrust: number, signal: number}|null}
 */
export function decision(creature) {
  const brain = creature && !creature.dead && creature.brain;
  if (!brain || !creature._in) return null;
  // The aux senses are read back out of the buffer `think()` filled rather than
  // re-gathered here. Re-gathering would be a second copy of `AUX_ORDER`'s
  // walk, and a second copy of an order is exactly the thing that goes stale
  // silently: the values are the animal's own state, so there is nothing to
  // keep in step.
  const out = brain.nAux
    ? brain.forward(creature._in, brain.nAux === 1 ? creature._aux[0] : creature._aux, false)
    : brain.forward(creature._in, 0, false);
  // Copied out of the brain's scratch buffer immediately: `nn.js` says plainly
  // that `_out` is overwritten in place, and a caller holding it across a tick
  // would be reading a different animal's mind by the next frame.
  return {
    turn: out[MOTOR.turn],
    // The command the *body* receives, not the raw output — `act()` takes it
    // through `thrustCommand`, and the negative half of that channel is a
    // creature that has stopped, not one reversing (v1.113's finding, imported
    // rather than re-derived).
    thrust: thrustCommand(out[MOTOR.thrust]),
    signal: out[MOTOR.signal],
  };
}

/**
 * Everything the figure draws, for one animal: the turn its brain is asking
 * for, the thrust with it, and where the nearest food it can see lies.
 *
 * `food` is the bearing's **sine**, which is the same number `Creature#sense`
 * hands the brain and the one whose sign is *which way it would have to turn*.
 * Using the sine alone deliberately folds ahead-left and behind-left onto the
 * same side of the line, because on the question this figure asks they are the
 * same answer: turn left. Where the speck actually is, is the disc's job one
 * panel up.
 *
 * `null` food is an animal that can see none, which happens on 0.8% of instants
 * and is a real state with a sentence of its own.
 *
 * @param {object|null} creature
 * @returns {{turn: number, thrust: number, food: number|null}|null}
 */
export function steerMark(creature) {
  const d = decision(creature);
  if (!d) return null;
  const inp = creature._in;
  const seesFood = inp[SENSE.foodProx] > 0;
  return {
    turn: clamp11(d.turn),
    thrust: d.thrust,
    food: seesFood ? clamp11(inp[SENSE.foodSin]) : null,
  };
}

/**
 * Whether a turn command is a turn *towards* the food this animal can see.
 *
 * `sin` is positive to the animal's right (`doing.js#SENSE`, pinned against a
 * real `sense()` call in `test/doing.test.js`) and `act()` adds `turn * maxTurn`
 * to the heading in that same frame, so the two agreeing in sign *is* the whole
 * predicate. A turn command of exactly zero is neither, and so is an animal
 * with the food dead ahead or dead astern: both are `false`, which keeps the
 * share a share of the decisions that had a side to take.
 */
export function turnsTowards(turn, foodSin) {
  return (turn > 0 && foodSin > 0) || (turn < 0 && foodSin < 0);
}

/**
 * The running share, for the animal a visitor has picked.
 *
 * Sampled from `witnessStep` on the tick, so the number is a property of
 * `(seed, config, when you picked)` and not of how fast the machine draws —
 * `aim.js`'s rule, and here it is load-bearing in a second way: a skip of 2,600
 * steps must add 2,600 decisions to the tally rather than the forty frames it
 * happened to take.
 *
 * Bounded without a cap, `lineage.js`'s way: it holds two integers and an id,
 * and it forgets everything the moment the id it is handed is not the id it is
 * holding. A tally carried across a change of subject would print one animal's
 * score under another animal's name, which is the failure a visitor could never
 * catch.
 */
export class SteerTally {
  constructor() {
    /** Whose score this is, or null for nobody's. */
    this.id = null;
    /** Decisions taken with food in sight. */
    this.seen = 0;
    /** How many of those turned towards it. */
    this.toward = 0;
  }

  /** Start again, on nobody. */
  forget() {
    this.id = null;
    this.seen = 0;
    this.toward = 0;
  }

  /**
   * One step's look at the animal being watched.
   *
   * A dead or absent subject clears the tally rather than freezing it: the
   * panel is put back to its invitation when its subject dies (v1.161's lamp
   * nobody turns off), and a share left standing would be the one thing on
   * screen still claiming the animal is being watched.
   *
   * @param {object|null} creature the animal a visitor has picked, or null
   */
  sample(creature) {
    if (!creature || creature.dead) {
      if (this.id !== null) this.forget();
      return;
    }
    if (creature.id !== this.id) {
      this.forget();
      this.id = creature.id;
    }
    const m = steerMark(creature);
    if (!m || m.food === null) return;
    this.seen++;
    if (turnsTowards(m.turn, m.food)) this.toward++;
  }

  /** The share as a fraction, or `null` before there is enough of it to print. */
  share() {
    return this.seen >= MIN_SAMPLES ? this.toward / this.seen : null;
  }
}

/**
 * What an animal is doing with its throttle, in three words.
 *
 * See `PUSH` and `EASE`: these are three measured populations rather than a
 * scale cut into thirds.
 */
export function effortWord(thrust) {
  if (thrust >= PUSH) return "swimming hard";
  if (thrust <= EASE) return "coasting";
  return "swimming";
}

/** How far off the middle a value sits, in words, or `""` for on it. */
function leanWord(v) {
  const a = Math.abs(v);
  if (a < 0.1) return "";
  const side = v < 0 ? "left" : "right";
  if (a < 0.4) return `a little to its ${side}`;
  if (a < 0.75) return `to its ${side}`;
  return `hard to its ${side}`;
}

/**
 * Which way an animal is steering, in words.
 *
 * Only ever used by the spoken register: a listener has no line to read a
 * position off, and every visible surface here leaves direction to the picture.
 */
export function sideWord(v) {
  return leanWord(v) || "straight ahead";
}

/**
 * Which side of an animal the food it can see is on, in words.
 *
 * Deliberately **not** `sideWord`. The figure's line is the sine of the
 * bearing, which folds *ahead* and *astern* onto the same middle — right for a
 * picture that asks only *which way would it have to turn*, and a plain
 * falsehood in a sentence, because "straight ahead" is exactly what a speck
 * directly behind the animal is not. The disc one panel up is where a bearing
 * belongs, and this register says only what this figure actually knows.
 */
export function foodSideWord(v) {
  return leanWord(v) || "on neither side of it";
}

/** The share as a whole percent, the way both registers print it. */
function pct(share) {
  return `${Math.round(share * 100)}%`;
}

/**
 * What the running share is counted from, in words.
 *
 * Two of them since v1.164, because there are now two ways to end up in the
 * seat. *Since you picked it* was the only clause here for one release and it
 * was about to become this page's first outright false statement: `onstage.js`
 * seats somebody on the first frame of every pond, and telling a visitor a
 * number is counted from a press they never made is worse than not printing it.
 *
 * The page's own pick is seated on the frame the pond is adopted, so **the two
 * instants really are the same one** — which is why the second clause can be a
 * plain fact about the world rather than a hedge about who did what.
 */
export const SINCE_PICKED = "since you picked it";
/** The same tally, for the animal the page seated itself (`onstage.js`). */
export const SINCE_OPENING = "since the pond began";

/**
 * The line beside the figure.
 *
 * Two clauses at most, and neither of them names a direction — that is the
 * whole of the split this panel is built on. The effort is a coarse state, the
 * share is a statement about the past, and a picture of *this instant* cannot
 * contradict either however long the sentence is held.
 *
 * @param {string} name the animal's given name
 * @param {{turn:number, thrust:number, food:number|null}|null} mark
 * @param {number|null} share from `SteerTally#share`
 * @param {"pointer"|"touch"} [hand]
 * @param {string} [since] `SINCE_PICKED` or `SINCE_OPENING`
 */
export function decideLine(name, mark, share, hand = POINTER, since = SINCE_PICKED) {
  if (!mark) return decideInvite(hand);
  const effort = effortWord(mark.thrust);
  if (share !== null) {
    return `${name} is ${effort}, and has turned towards food it could see ${pct(share)} of the time ${since}.`;
  }
  if (mark.food === null) return `${name} is ${effort}, with no food in sight to steer by.`;
  return `${name} is ${effort}. Watch a moment and this will say how often it turns towards its food.`;
}

/**
 * The same panel for a listener, who has no picture — so this is the one
 * register that puts the two positions into words, `eyeview.js`'s rule for the
 * same reason.
 */
export function decideSay(name, mark, share, since = SINCE_PICKED) {
  if (!mark) return "Nobody is picked yet.";
  const parts = [`${name} is steering ${sideWord(mark.turn)}`];
  parts.push(
    mark.food === null
      ? "and can see no food"
      : `and the food it can see is ${foodSideWord(mark.food)}`
  );
  let s = `${parts.join(", ")}. It is ${effortWord(mark.thrust)}.`;
  if (share !== null) s += ` It has turned towards food it could see ${pct(share)} of the time ${since}.`;
  return s;
}

/**
 * The panel with nobody picked.
 *
 * In `hand.js`'s table on the way in rather than a release later, which is the
 * only test of v1.155's lesson that means anything: a phone is never told to
 * press a key it has not got.
 */
export function decideInvite(hand = POINTER) {
  return say("decideInvite", hand);
}

/** Where a value in [-1, 1] falls across the figure's line. */
function xOf(v, W) {
  return PAD + ((clamp11(v) + 1) / 2) * (W - PAD * 2);
}

/**
 * Draw the figure: one line, one speck, one bar.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {{turn:number, thrust:number, food:number|null}|null} mark
 */
export function drawSteer(ctx, W, H, mark) {
  ctx.clearRect(0, 0, W, H);
  if (!mark) return;
  const foodY = H * ROW.food;
  const steerY = H * ROW.steer;
  const mid = xOf(0, W);

  // The furniture: a rule under each mark and the line down the middle that
  // means *straight ahead*. All three in the same faint neutral the charts use
  // for a grid, because the two marks are the content and a scale that competes
  // with them is a scale drawn wrong.
  ctx.strokeStyle = axisRule().line;
  ctx.lineWidth = 1;
  for (const y of [foodY, steerY]) {
    ctx.beginPath();
    ctx.moveTo(PAD, Math.round(y) + 0.5);
    ctx.lineTo(W - PAD, Math.round(y) + 0.5);
    ctx.stroke();
  }
  // The middle is the one piece of furniture a reader is asked to *use* — it is
  // what the word under it names — so it is laid down twice, which is the same
  // trick the mote uses for the same reason: this grid tone is 7% white, chosen
  // to sit under a chart line, and a rule a reader has to find is not a rule
  // that may disappear into its own panel.
  ctx.beginPath();
  ctx.moveTo(Math.round(mid) + 0.5, foodY - MOTE_R * 2);
  ctx.lineTo(Math.round(mid) + 0.5, steerY + WEDGE_H * 2);
  ctx.stroke();
  ctx.stroke();

  // The food, if it can see any: the pond's own mote, laid down twice the way
  // `key.js` and `eyeview.js` lay it down, because the water composites food
  // additively and a placard has no deep to add to.
  //
  // And a line dropped from it to the steering row, which is the mark that
  // makes this a figure rather than two gauges. The first draft had the speck
  // and the bar on separate rules and a browser walk read it as a slider with
  // a dot above it: a reader has to be *shown* that the two positions are the
  // same question, and a dropped line is the cheapest way to say **aim here**.
  // Drawn before the bar so the white sits on top of it.
  if (mark.food !== null) {
    const m = foodMote();
    const fx = xOf(mark.food, W);
    ctx.strokeStyle = rgbaCss({ r: m.r, g: m.g, b: m.b }, m.a * 0.5);
    ctx.beginPath();
    ctx.moveTo(Math.round(fx) + 0.5, foodY);
    ctx.lineTo(Math.round(fx) + 0.5, steerY + WEDGE_H * 1.7);
    ctx.stroke();
    ctx.fillStyle = rgbaCss({ r: m.r, g: m.g, b: m.b }, m.a);
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(fx, foodY, MOTE_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The steering: a bar out from the middle to the turn the brain asked for,
  // with a solid cap standing on its end. Drawn from the centre rather than
  // from the left because zero is a real and common answer — an animal going
  // straight gets a cap sitting on the middle line, which is a picture of
  // *straight* rather than of a bar half full.
  //
  // The cap is a bar and not the arrowhead I drew first, and the reason is that
  // one instant: an arrowhead has to point somewhere, and a turn of exactly
  // zero would have had it pointing right — a mark inventing a direction out of
  // the absence of one, at the very moment the figure most needs to say *no
  // direction*. Position carries the side here, and nothing else needs to.
  const tip = xOf(mark.turn, W);
  ctx.fillStyle = selectionMark().ring;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(Math.min(mid, tip), steerY - WEDGE_H, Math.abs(tip - mid), WEDGE_H * 2);
  ctx.globalAlpha = 1;
  ctx.fillRect(tip - CAP_W / 2, steerY - WEDGE_H * 1.7, CAP_W, WEDGE_H * 3.4);
}
