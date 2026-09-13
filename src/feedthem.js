// feedthem.js — the button beside the empty bar.
//
// v1.178 drew the one quantity this whole world turns on: a bar under the water
// showing how full the animal you are watching is, with a mark on it where they
// split in two. It measured what a five-minute visit looks like and left one
// finding sitting on the page unanswered:
//
//   **🥀 Starving is 18.1% of a visit and the page answers it with a sentence.**
//   *They are nearly out. Without a meal very soon, they starve.*
//
// That is a fifth of the time a stranger spends here, at the one moment they
// care most, and what this page offered them was a caption. The thing that would
// answer it — `🥣 Feed by hand` — has existed since v1.147, four panels up, and
// it is a *mode*: arm it, find the animal in a pond of three hundred darts, and
// touch the water in the right square inch. Three steps and a hunt, to do the
// obvious thing to the animal already named on the screen in front of you.
//
// So: one press. The button stands under the bar, it is about the animal the bar
// is about, and it drops a handful exactly where that animal is. No mode to arm,
// no aiming, nothing to find. It is the same ten pellets `handfeed.js` has
// always dropped, in the same spiral, with the same arithmetic and the same
// zero random numbers — what is new is that the page now knows *where* without
// being told.
//
// ## Does it work? A controlled sweep, and it is the reason this shipped
//
// Two runs of the same seed, both following the seat the way the page does; one
// presses at the first instant the seated animal is starving, the other never
// presses. A handful draws nothing from the world's random stream, so until the
// ten pellets land the two ponds are the same pond, which makes this a genuine
// control rather than two anecdotes. Forty seeds, ten seconds of watching after
// the press (600 steps at the pace the page opens on):
//
//   - **every one of the forty ponds reached a starving moment**, a median of
//     918 steps in — half a minute after the page loads.
//   - **fed, the animal is still alive ten seconds later in 70.0% of ponds.
//     Unfed, in 17.5%.** The same animal, the same instant, the same world.
//   - **in 10.0% of them it goes from nearly dead to having young inside those
//     ten seconds** (a median of 367 steps), which never once happened unfed.
//   - the handful is cleared in a median of **126 steps**, about two seconds.
//
// ## The honest half: you cannot feed one animal
//
// Of the ten pellets, the animal you pressed for eats a median of **four**. The
// rest go to whoever else is passing — a median of five to other animals, and
// the odd one left in the water. That is not a defect to design away; it is the
// pond telling the truth about itself, and it is the most interesting sentence
// this button can say. So the banner says it: the count of other animals close
// enough to see the drop is part of the line, every time.
//
// ## Why there is no cooldown
//
// `handfeed.js` sized a handful against the pond's standing crop of 280 and
// concluded that twenty taps add less than `✦ Feed` gives in four presses. The
// same holds here, so a visitor who presses this ten times has not broken
// anything — they have run the experiment ten times, which is the point. What
// they *can* do is feed a full animal, and the waste is real and visible in the
// ledger (`world.js` mints what the eater had no room for and loses it in the
// same instant). A button that refused would be teaching a rule this world does
// not have.
//
// Determinism: **not one random number**, on either side of the press. The spot
// is the animal's own position, the spiral is arithmetic, and `FoodField.placeAt`
// puts a pellet where it is told. A pond nobody presses this on is bit-for-bit
// the pond it always was. A pond somebody presses it on is a pond they have
// altered — deliberately, the way `✦ Feed` and `✚ Seed life` alter one.
//
// PURE OBSERVER as far as this module goes: words, a worth, and a rule about
// when to offer the press. The drop itself is `handfeed.js`'s and the wiring is
// main.js's.

import { plantMealFor } from "./fuel.js";

/**
 * What the button says, in every state the animal can be in.
 *
 * It was tempting to make it shout — *Feed them!* under a starving one, quiet
 * under a full one — and the reason it does not is v1.177's: a label that
 * promises a change the press only partly makes is a label people stop reading.
 * The urgency is already on the page, in the sentence above the button and in
 * the colour of the bar beside it, both of which are about the animal. The
 * button stays about the press.
 */
export const FEED_LABEL = "🥣 Feed them";

/**
 * What the controlled sweep found, kept here so a later cycle can argue with the
 * numbers rather than with my memory of them. Forty seeds, the press at the
 * first starving instant, ten seconds of watching afterwards.
 */
export const RESCUE = Object.freeze({
  seeds: 40,
  watched: 600,
  starvingBy: 918,
  aliveFed: 0.7,
  aliveUnfed: 0.175,
  splitFed: 0.1,
  splitUnfed: 0,
  ownPellets: 4,
  otherPellets: 5,
  clearedIn: 126,
});

/**
 * Is a handful worth anything to this animal?
 *
 * A pellet is worth `foodEnergy × (1 − plant penalty × diet gene)` to whoever
 * eats it, and in a world where that penalty reaches 1 a pure carnivore gets
 * nothing at all from one. Offering that animal a button labelled *feed them*
 * would be this page promising something the pond will not deliver, which is
 * the bar every other row under the water is already held to: a row is a claim,
 * so a row that is not true is not drawn.
 *
 * The default pond's penalty is 0.4, so this is true of every animal in it —
 * the rule exists for the worlds a visitor can build in the drawer, and for the
 * next cycle that moves the constant.
 *
 * @param {{dead?:boolean, carnivory:number}} c
 * @param {object} cfg the world's config
 */
export function canFeed(c, cfg) {
  return !!c && !c.dead && plantMealFor(c, cfg) > 0;
}

/** English for a small count, so no sentence here opens with a numeral. */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/**
 * What the page says the moment somebody presses it.
 *
 * Two facts and they are both measured. The first is what went in and who it was
 * for — this is the only control here that is aimed at a *named animal*, and the
 * name is what makes the next three seconds worth watching. The second is the
 * one this feature would be dishonest without: a median of five of these ten
 * pellets are eaten by somebody else, so the line counts the animals who can
 * also see them. Nobody is promised a private meal.
 *
 * `others` is everyone inside `visionRadius` of the drop **except** the animal
 * it was for — `handfeed.js#watchersNear` counts the pond and the caller takes
 * one off, because an animal standing on its own dinner is not a rival.
 *
 * @param {string} name what this page calls the animal
 * @param {number} placed how many pellets actually went in
 * @param {number} others how many other animals can see them
 */
export function feedLine(name, placed, others) {
  const one = placed === 1;
  const what = one ? `One pellet for ${name}.` : `${cap(word(placed))} pellets for ${name}.`;
  const them = one ? "it" : "them";
  if (others === 0) return `${what} Nobody else is close enough to see ${them}.`;
  if (others === 1) return `${what} One other animal can see ${them} too.`;
  return `${what} ${cap(word(others))} other animals can see ${them} too.`;
}
