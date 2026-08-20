// senses.js — which of a creature's senses is actually moving it.
//
// `creature.js` has been able to answer this for one sense at a time since
// v1.33: `auxSway` holds every other channel at what the creature perceived
// this tick, walks one channel from its floor to its ceiling, and reports the
// mean absolute change in the two motor commands. The Underfoot row has printed
// that number since v1.33 and the Whisker row since v1.102.
//
// Those are the ear, the foot and the whisker — the three senses bolted on
// after v1.0, two of which this project has since measured as worth nothing to
// selection (`docs/SCIENCE.md`). The sixteen channels of the *original* input
// vector — where the food is, where the threat is, how fed it is, its own
// clock — have never had the same question asked of them, on any surface, in a
// hundred and nine releases. The instrument existed; it was pointed at the two
// senses that arrived with an off switch, because a new mechanic is what makes
// somebody build a readout.
//
// So this is `auxSway` generalised, and the table it needs to be generalised
// over. The input vector is assembled in `Creature.sense()` and its layout has
// only ever been a numbered comment there; `INPUT_CHANNELS` below is that
// comment made into data — a name and, more usefully, the **range** each
// channel is written to occupy. A sway is a counterfactual, so it is a question
// about a range, and until the range is declared it cannot be checked against
// the one the pond actually visits. `test/senses.test.js` does exactly that
// check (v1.71's declared-versus-occupied, one module over).
//
// PURE OBSERVER, in the same sense as `inspect.js`: it asks the brain
// hypotheticals with learning suppressed, never touches the creature's own
// input buffer (it works on a copy), draws no random numbers, and nothing in
// the simulation reads it back.
//
// What a sway is not. It prices the *wire*, not the animal's day: a channel
// scores its full authority whether or not this pond ever moves it. A world
// with no predators still pays out a sway for "threat ahead/behind", because
// the question asked is what the motors would do if a threat appeared, and the
// honest complaint about that is the one v1.89 made about the refuge — a number
// derived from a range nobody checked is a claim about a world that may not be
// this one. Hence the table, and hence the test.
//
// v1.113 takes the other end of the same walk seriously. A sway has been the
// **mean of two motor commands** since v1.33, and a mean of two is a summary
// small enough to be worth opening: `channelSwayParts` is that walk before the
// average, `motorTilt` is which of the two the sense is talking to, and the
// Steers-by row prints the word. Opening it found that one of the two halves
// was not a command at all — `act()` applies `thrustCommand(out[1])`, not
// `out[1]`, and the clamp inside it flattens the entire negative half of a
// `tanh`. Half of every thrust wire in this project is nailed to the floor, and
// for eighty releases the sway was pricing it: in an unevolved pond **50.5%**
// of all raw thrust movement is absorbed there, and **37.0%** of channel
// readings move the second output while moving the animal not at all. The parts
// go through the same clamp the body does; `thrustRaw` keeps the old quantity
// beside the new one so the difference stays measurable.

import { AUX_ORDER, BRAIN } from "./genome.js";
import { auxSwayParts, motorParts, NO_SWAY } from "./creature.js";

/**
 * The brain's input vector: one entry per channel, in the order
 * `Creature.sense()` writes them.
 *
 * `lo`/`hi` are the range the channel is *written* to occupy — the arithmetic
 * in `sense()` read off as an interval, not a measurement. A channel whose two
 * ends are equal is not a sense: the bias is a constant by construction, so its
 * sway is zero for a reason that has nothing to do with the brain, and it is
 * excluded from the ranking rather than reported as a silent input.
 *
 * @type {ReadonlyArray<{i:number, name:string, lo:number, hi:number}>}
 */
export const INPUT_CHANNELS = Object.freeze([
  { i: 0, name: "bias", lo: 1, hi: 1 },
  { i: 1, name: "how fed", lo: -1, hi: 1 },
  { i: 2, name: "food left/right", lo: -1, hi: 1 },
  { i: 3, name: "food ahead/behind", lo: -1, hi: 1 },
  { i: 4, name: "food near", lo: 0, hi: 1 },
  { i: 5, name: "prey left/right", lo: -1, hi: 1 },
  { i: 6, name: "prey ahead/behind", lo: -1, hi: 1 },
  { i: 7, name: "prey near", lo: 0, hi: 1 },
  { i: 8, name: "threat left/right", lo: -1, hi: 1 },
  { i: 9, name: "threat ahead/behind", lo: -1, hi: 1 },
  { i: 10, name: "threat near", lo: 0, hi: 1 },
  { i: 11, name: "own speed", lo: 0, hi: 1 },
  { i: 12, name: "its clock", lo: -1, hi: 1 },
  { i: 13, name: "its age", lo: -1, hi: 1 },
  { i: 14, name: "its diet", lo: -1, hi: 1 },
  { i: 15, name: "its size", lo: -1, hi: 1 },
]);

/** The auxiliary senses under the names a reader has for them. */
const AUX_SAID = Object.freeze({ ear: "what it hears", foot: "underfoot", whisker: "its whisker" });

if (INPUT_CHANNELS.length !== BRAIN.inputs) {
  // A layout that has drifted is a table naming the wrong channel, which is
  // silent and wrong rather than loud and wrong — v1.108's rails, one file over.
  throw new Error(`INPUT_CHANNELS describes ${INPUT_CHANNELS.length} of ${BRAIN.inputs} inputs`);
}

/**
 * Put one input vector to a creature's brain, exactly the way `think()` does —
 * same aux packing, same call — with learning suppressed, because a
 * hypothetical must not teach a plastic brain anything.
 * @param {object} c
 * @param {ArrayLike<number>} inputs
 * @returns {Float32Array} the brain's own output buffer (overwritten next call)
 */
function ask(c, inputs) {
  const brain = c.brain;
  if (!brain.nAux) return brain.forward(inputs, 0, false);
  return brain.forward(inputs, brain.nAux === 1 ? c._aux[0] : c._aux, false);
}

/**
 * How much of a creature's steering one input channel is currently deciding:
 * the mean absolute change in its turn and thrust commands between that
 * channel's two ends, with every other sense held at what it actually perceived
 * this tick. Same formula, same scale and same caveats as `auxSway` — 0.3 means
 * the channel is worth about 0.3 of a command's travel, averaged over the two.
 *
 * The two commands do not have the same travel to spend, and since v1.113 they
 * do not even pretend to: turn is `out[0]` on (-1, 1) and thrust is
 * `thrustCommand(out[1])` on [0, 1], so the thrust half can contribute at most
 * half of what the turn half can. That asymmetry is the body's, not the
 * instrument's — it is the whole content of "there is no reverse in this world"
 * — and `motorTilt` states where it puts the null.
 *
 * Exactly 0 for a channel with no range to walk.
 * @param {object} c
 * @param {{i:number, lo:number, hi:number}} ch an entry of `INPUT_CHANNELS`
 */
export function channelSway(c, ch) {
  const { turn, thrust } = channelSwayParts(c, ch);
  return (turn + thrust) / 2;
}

/**
 * The same walk, before the two motors are averaged (v1.113) — the input-vector
 * half of `auxSwayParts`, and the number `motorTilt` is a function of.
 *
 * All zero for a channel with no range to walk.
 * @param {object} c
 * @param {{i:number, lo:number, hi:number}} ch an entry of `INPUT_CHANNELS`
 * @returns {{turn:number, thrust:number, thrustRaw:number}} command changes
 */
export function channelSwayParts(c, ch) {
  if (!(ch.hi > ch.lo)) return NO_SWAY;
  const inp = Float32Array.from(c._in);
  inp[ch.i] = ch.lo;
  const low = Float32Array.from(ask(c, inp));
  inp[ch.i] = ch.hi;
  const high = ask(c, inp);
  return motorParts(low, high);
}

/**
 * Which motor a sense is talking to: +1 a channel that only steers the animal,
 * −1 one that only drives it, 0 an even split. Exactly 0 for a channel that
 * moves neither, which is the reading a sway of 0 deserves.
 *
 * This is the half a sway has thrown away since v1.33. A sway is a mean of a
 * set of **two** — the smallest set a summary can hide anything in — and the
 * mean of `{0.6, 0}` and the mean of `{0.3, 0.3}` are one number describing two
 * different animals.
 *
 * **Zero is not the null.** The thrust command has half the travel the turn
 * command does (see `channelSway`), so an even-handed brain reads positive
 * here: across twelve unevolved ponds the fifteen channels sit at +0.30 to
 * +0.41, mean **+0.36**, with the raw outputs flat at −0.077 to +0.010. Read a
 * tilt against that, not against 0 — it is the same warning v1.108 attached to
 * an estimate sitting on a decision boundary, one register down.
 * @param {{turn:number, thrust:number}} parts
 */
export function motorTilt({ turn, thrust }) {
  const total = turn + thrust;
  return total > 0 ? (turn - thrust) / total : 0;
}

/**
 * The tilt at which one motor is worth twice the other — `(2 − 1) / (2 + 1)`,
 * written as the ratio it is so that changing the ratio changes the constant.
 *
 * A threshold is a decision, and the honest place to put this one is where the
 * word stops being an exaggeration: at 1/3 the louder command moves twice as
 * far as the quieter one, and below it the channel is doing both jobs.
 */
export const TILT_RATIO = 2;
export const TILT_EDGE = (TILT_RATIO - 1) / (TILT_RATIO + 1);

/**
 * A tilt as the word the panel prints for it: what this sense is *for*.
 * @param {number} tilt
 */
export function motorSaid(tilt) {
  if (tilt >= TILT_EDGE) return "turns";
  if (tilt <= -TILT_EDGE) return "drives";
  return "both";
}

/**
 * Every sense this world gives this creature, priced and ranked — the sixteen
 * input channels that have a range, plus whichever auxiliary senses are on.
 *
 * The order is by sway, ties broken by name so two creatures with identical
 * brains produce identical text.
 *
 * Each entry carries the two motors it was averaged from, so a caller can rank
 * on the summary and still ask what the summary is a summary of. `sway` is
 * `(turn + thrust) / 2` and stays the number every earlier release quoted.
 * @param {object} c
 * @param {object} config
 * @returns {Array<{name:string, sway:number, turn:number, thrust:number, tilt:number}>}
 */
export function senseSways(c, config) {
  const ranked = [];
  const add = (name, parts) =>
    ranked.push({
      name,
      sway: (parts.turn + parts.thrust) / 2,
      turn: parts.turn,
      thrust: parts.thrust,
      thrustRaw: parts.thrustRaw,
      tilt: motorTilt(parts),
    });
  for (const ch of INPUT_CHANNELS) {
    if (!(ch.hi > ch.lo)) continue;
    add(ch.name, channelSwayParts(c, ch));
  }
  for (const block of AUX_ORDER) {
    if (!config[block.flag]) continue;
    add(AUX_SAID[block.name], auxSwayParts(c, block.name));
  }
  ranked.sort((a, b) => b.sway - a.sway || (a.name < b.name ? -1 : 1));
  return ranked;
}

/** The number of decimals the panel and the sentence agree to quote a sway at. */
const PLACES = 2;
/** Below this a sway prints as 0.00, so the honest reading is a word (v1.89). */
const NOTHING = 0.5 * 10 ** -PLACES;

/**
 * The Steers-by row: the three loudest senses and how many there were.
 *
 * A ranking is the longest thing this panel could say, so the row takes its
 * head and states the denominator rather than listing fifteen numbers a reader
 * would have to sort by eye. The count is the senses this *world* gives, which
 * moves with the aux toggles — the row is one of the few readouts here whose
 * denominator is a fact about the config.
 *
 * Each of the three carries the motor it is talking to (v1.113), because a sway
 * is the mean of a set of two and 79% of the readings in this pond have one
 * command worth twice the other. `turns`, `drives` or `both` — a word rather
 * than the tilt itself, since the number is a ratio dressed as a coordinate
 * and what a reader wants from it is which of three things this wire is.
 *
 * When nothing clears the second decimal the reading is a word: three zeroes in
 * a row is a formatted value standing in for "this brain's motors answer to
 * nothing", which is a sentence rather than a measurement.
 *
 * There is deliberately no spoken form. `describeSelection()` speaks what a
 * creature *perceives* and leaves the two existing sways to the panel, with the
 * reason written out in v1.103: a sway is a hypothetical put to the brain and
 * the sentence fires on every arrow key. A ranking of fifteen hypotheticals is
 * the furthest thing on this page from that, so this row stays the reader's —
 * a register split with an argument behind it rather than the asymmetries v1.77
 * and v1.102 found, which had none.
 * @param {object} c
 * @param {object} config
 */
export function steeringText(c, config) {
  const ranked = senseSways(c, config);
  if (!ranked.length || ranked[0].sway < NOTHING) {
    return `nothing moves its motors — all ${ranked.length} senses sway under 0.01`;
  }
  const top = ranked
    .slice(0, 3)
    .map((s) => `${s.name} ${s.sway.toFixed(PLACES)} (${motorSaid(s.tilt)})`)
    .join(" · ");
  return `${top} — strongest 3 of ${ranked.length}`;
}

/**
 * The range each input channel actually occupies across a set of creatures —
 * the measured half of `INPUT_CHANNELS`'s declaration.
 *
 * A channel whose `min` and `max` are equal is one this pond holds fixed, and a
 * sway quoted for it is a counterfactual about a world that is not on screen.
 * @param {Array<object>} creatures
 * @returns {Array<{name:string, min:number, max:number}>} one entry per channel
 */
export function occupiedRanges(creatures) {
  const seen = INPUT_CHANNELS.map((ch) => ({ name: ch.name, min: Infinity, max: -Infinity }));
  for (const c of creatures) {
    for (const ch of INPUT_CHANNELS) {
      const v = c._in[ch.i];
      const s = seen[ch.i];
      if (v < s.min) s.min = v;
      if (v > s.max) s.max = v;
    }
  }
  return seen;
}
