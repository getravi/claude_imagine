// fuel.js — how full the animal you are watching is, and what that buys them.
//
// This page has three panels about one animal: what it is doing, what it can
// see, what it decides. All three are about the *present tense of a mind*, and
// between them they never once say the thing every one of these animals is
// actually spending its whole life on. A creature here does exactly two things
// with energy. It burns it — swimming costs, existing costs, being a predator
// costs, being ill costs — and when it has enough of it, it splits in two and
// hands half of it to a new animal. That is the entire economy of this world,
// and the page had never drawn it.
//
// So: one bar. How full this animal is, with a mark on it at the point where
// they have young, and a sentence underneath saying how many more meals away
// that is. A visitor who reads nothing else on this page can watch the bar
// climb, watch it hit the mark, watch a new dart appear in the water, and watch
// it drop back to half — which is the whole of Darwin in a shape a person
// already knows from a hundred games.
//
// ## Why the bar is the animal's own colour
//
// `render.js` has drawn every creature at `30 + 45 × how full it is` per cent
// lightness since v1.0, and `key.js` has explained it to readers since v1.122:
// *lightness rises with what it has left to spend, so a fading one is starving.*
// That rule was true and nothing on the page ever showed the **value** beside
// the mark, so a reader had a sentence about brightness and no way to calibrate
// it. The fill here is that exact colour at that exact lightness
// (`palette.js#bodyFill`, which `render.js` now calls too, so the two cannot
// drift), which makes the bar a ruler for the water: this brightness, this
// full. One value, drawn twice, in the same ink.
//
// ## A meal is not a fixed number, and the count says so
//
// The obvious version of "how many more meals" divides by `foodEnergy` and is
// wrong for half the pond. A pellet is worth `foodEnergy × (1 − plant penalty ×
// diet gene)` to the animal eating it, so a hunter gets almost nothing out of
// one; a bite of prey is worth `biteEnergy × meatEfficiency × diet gene`, and
// only to a body over `carnivoreThreshold` in a world where predation is on.
// `mealFor` is that pair, and the count is the bigger of the two — the meal
// *this* animal can go out and get. A corpse is deliberately not in it:
// scavenging is luck rather than a thing to steer at, and a count that
// included it would quote a mouthful the animal cannot decide to find.
//
// The number ignores what they burn while they are finding those meals, which
// makes it a floor rather than a forecast: another three meals is the *fewest*
// that will do it. A forecast would need a rate, a rate would need a window,
// and the honest short number is the one a person can check by watching.
//
// ## Two states the page cannot show, and why this panel is not one of them
//
// `doing.js` found that *ready to breed* fires on 0.0% of sampled animals —
// crossing `reproduceThreshold` **is** the split, so nothing is ever seen
// sitting above the line. That is a fact about a **verb**, not about a
// quantity: the animal is never in the state, and the bar is never at the top,
// and both of those are the same true thing drawn the only way a person can
// read it. The `ready` band below is not dead code either — `world.js` refuses
// a birth when the pond is at `populationMax`, and an animal in a full pond
// sits over the line with nowhere to put a child. That is worth a sentence,
// because it is the one moment this world says *no*.
//
// Determinism: PURE OBSERVER. It reads `energy`, `carnivory` and the config,
// and returns words and two numbers. No DOM, no world mutation, no random
// draw — a pond with this panel open is bit-for-bit a pond with nobody looking.

import { say, POINTER } from "./hand.js";
import { bodyFill } from "./palette.js";

/**
 * The bands, read top down: the first whose `from` the fullness clears wins, so
 * this table is the ordering. `from: 0` is the floor and must be last.
 *
 * The marks are borrowed rather than chosen. `🥀` is `obituary.js`'s mark for a
 * starvation death, which is what the bottom of this bar *is* — the card that
 * eventually goes under this panel opens with the same character, and a reader
 * who watches one become the other has been told something true about the pond.
 *
 * `ready` is not in here: where the line sits is a property of the config
 * (`reproduceThreshold / energyMax`, 72.7% of the default pond) and a fraction
 * typed into this table would be a second copy of it. `fuelBand` tests it
 * first, from the numbers.
 */
export const BANDS = Object.freeze([
  { key: "fed", from: 0.5, icon: "😋️", word: "Well fed" },
  { key: "peckish", from: 0.3, icon: "🍽️", word: "Peckish" },
  { key: "hungry", from: 0.15, icon: "🥣", word: "Hungry" },
  { key: "starving", from: 0, icon: "🥀", word: "Starving" },
]);

/** The band for an animal over the line, which the table above cannot hold. */
export const READY = Object.freeze({ key: "ready", from: 1, icon: "🥚", word: "Full up" });

/**
 * The state word and mark for a fullness, against the line this pond splits at.
 *
 * @param {number} frac energy as a share of `energyMax`, 0..1
 * @param {number} lineFrac where `reproduceThreshold` sits on the same scale
 */
export function fuelBand(frac, lineFrac) {
  if (frac >= lineFrac) return READY;
  for (const band of BANDS) if (frac >= band.from) return band;
  return BANDS[BANDS.length - 1];
}

/**
 * What one meal is worth to this animal, in energy.
 *
 * Both halves are the world's own arithmetic rather than a restatement of it:
 * the grazing line is `world.js`'s `plantGain` and the hunting line is its
 * `meal`, with the licence gate `creature.js` charges the upkeep behind. The
 * answer is the larger, because it is the meal this animal would *choose*.
 *
 * Zero is a possible answer and the caller must survive it: a pure carnivore in
 * a world with predation switched off can eat nothing at all, and telling that
 * animal it is four meals from having young would be inventing a route out.
 */
export function mealFor(c, cfg) {
  const licensed = !cfg.licensedDietCost || c.carnivory >= cfg.carnivoreThreshold;
  const forgone = licensed ? cfg.plantPenaltyFromDiet * c.carnivory : 0;
  const plant = cfg.foodEnergy * (1 - forgone);
  const hunter = cfg.predation && c.carnivory >= cfg.carnivoreThreshold;
  const flesh = hunter ? cfg.biteEnergy * cfg.meatEfficiency * c.carnivory : 0;
  return Math.max(0, plant, flesh);
}

/** How many, in words, mid-sentence — this bar's counts are never larger. */
const MEALS = Object.freeze([
  "",
  "meal",
  "two meals",
  "three meals",
  "four meals",
  "five meals",
  "six meals",
  "seven meals",
  "eight meals",
  "nine meals",
  "ten meals",
]);

/** `another three meals`, or a plain numeral past the end of the list. */
export function mealWord(n) {
  return MEALS[n] ?? `${n} meals`;
}

/**
 * Everything this panel shows, read off one animal.
 *
 * @param {object} c a living creature
 * @param {object} cfg the world's config
 * @returns {{frac:number, lineFrac:number, meals:number|null, band:object,
 *            fill:string, line:string, say:string}}
 */
export function fuelOf(c, cfg) {
  const frac = clamp01(c.energy / cfg.energyMax);
  const lineFrac = clamp01(cfg.reproduceThreshold / cfg.energyMax);
  const band = fuelBand(frac, lineFrac);
  const meal = mealFor(c, cfg);
  const gap = cfg.reproduceThreshold - c.energy;
  // `null` rather than `Infinity` for an animal with nothing it can eat, and
  // `null` rather than 0 once it is over the line: both are states the sentence
  // answers in its own words, and a count of zero meals reads as *none needed*
  // in one of them and as *no way there* in the other.
  const meals = band === READY || !(meal > 0) || gap <= 0 ? null : Math.ceil(gap / meal);
  return {
    frac,
    lineFrac,
    meals,
    band,
    fill: bodyFill(c.hue, frac),
    line: fuelLine(band, meals),
    say: fuelSay(band, meals),
  };
}

/** The sentence under the bar. */
export function fuelLine(band, meals) {
  if (band.key === "ready") return "They have enough to have young right now.";
  if (meals === null) {
    return band.key === "starving"
      ? "They are nearly out, and there is nothing here they can eat."
      : "There is nothing in this pond they can eat.";
  }
  // The bottom band drops the count on purpose. *Another five meals and they
  // can have young* is true of a starving animal and is not what is happening
  // to it — a panel that answers the wrong question at the one moment a reader
  // is actually watching the bar move is a panel nobody reads twice. It is also
  // what keeps the longest sentence here inside two lines at 390 px, which is
  // the height `.f-line` reserves.
  if (band.key === "starving") return "They are nearly out. Without a meal very soon, they starve.";
  return `Another ${mealWord(meals)} and they can have young.`;
}

/**
 * The bar, for a listener — the value the ink carries, in front of the sentence
 * the page already prints. Said as a share rather than as a number of units:
 * nothing on this page has ever told a visitor what an energy is, and `61%`
 * would be the fact grid's register in a panel written to avoid it.
 */
export function fuelSay(band, meals) {
  return `${band.word}. ${fuelLine(band, meals)}`;
}

/**
 * What the panel says before anybody has been picked.
 *
 * The fourth of `hand.js`'s invitations and written into that table on the
 * first day for `decideInvite`'s reason — a sentence that names a device
 * belongs there the moment it is written, not the release after somebody reads
 * the page on a phone.
 */
export function fuelInvite(hand = POINTER) {
  return say("fuelInvite", hand);
}

/** The mark beside that invitation, which is the one this row is about. */
export const INVITE_ICON = "🍽️";

function clamp01(x) {
  return x < 0 || Number.isNaN(x) ? 0 : x > 1 ? 1 : x;
}
