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

import { AUX_ORDER, BRAIN } from "./genome.js";
import { auxSway } from "./creature.js";

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
 * the channel is worth about 15% of the full range of both motors.
 *
 * Exactly 0 for a channel with no range to walk.
 * @param {object} c
 * @param {{i:number, lo:number, hi:number}} ch an entry of `INPUT_CHANNELS`
 */
export function channelSway(c, ch) {
  if (!(ch.hi > ch.lo)) return 0;
  const inp = Float32Array.from(c._in);
  inp[ch.i] = ch.lo;
  const low = Float32Array.from(ask(c, inp));
  inp[ch.i] = ch.hi;
  const high = ask(c, inp);
  return (Math.abs(high[0] - low[0]) + Math.abs(high[1] - low[1])) / 2;
}

/**
 * Every sense this world gives this creature, priced and ranked — the sixteen
 * input channels that have a range, plus whichever auxiliary senses are on.
 *
 * The order is by sway, ties broken by name so two creatures with identical
 * brains produce identical text.
 * @param {object} c
 * @param {object} config
 * @returns {Array<{name:string, sway:number}>}
 */
export function senseSways(c, config) {
  const ranked = [];
  for (const ch of INPUT_CHANNELS) {
    if (!(ch.hi > ch.lo)) continue;
    ranked.push({ name: ch.name, sway: channelSway(c, ch) });
  }
  for (const block of AUX_ORDER) {
    if (!config[block.flag]) continue;
    ranked.push({ name: AUX_SAID[block.name], sway: auxSway(c, block.name) });
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
    .map((s) => `${s.name} ${s.sway.toFixed(PLACES)}`)
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
