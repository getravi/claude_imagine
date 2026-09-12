// anotherpond.js — the door out of this pond, and the way back through it.
//
// Every world here is a seed, and the plate over the water has said so since
// v1.134: *Western Mere — seed 314, the same seed always grows the same pond.*
// It is the most inviting sentence on the page, because the obvious next
// thought is **then what does another seed grow?** — and until this release the
// only place a visitor could go and find out was a 36 × 33 die tucked beside a
// number field in the drawer of settings.
//
// The walk, on the app as it loads, at the two viewports the rest of this
// project's browser work uses:
//
//     390 × 844    #btn-randomseed   top 5,050 of a 5,709 px document   88.5%
//                                    the 34th of 45 targets a thumb can reach
//     1280 × 900   #btn-randomseed   top   661 of a 3,568 px document   18.5%
//                                    the 27th of 44
//
// **That is the deepest a first move has ever been found in this drawer, and it
// is the third time.** v1.153 moved three buttons out of it (`👋 Meet
// somebody` at 77% of a phone's page), v1.169 moved a fourth (`🥣 Feed by
// hand` at 82%), and this one sat 300 px below where that one had been, for
// the whole of both cycles, with the reason written down and agreed to in
// `firstmoves.js`:
//
//   > **btn-randomseed** — the die beside the seed field. It is not a control
//   > in its own right but the other half of one, and a text input is not a
//   > first move.
//
// Every word of that is true about a **die beside a field**, and it is the
// third time an argument about *which drawer* has stood in for the question
// *is this a first move at all*. The die is the field's other half. Going
// somewhere else is not — it is the one press on this page that answers the
// sentence printed directly under the pond's name, and a control that answers
// a sentence belongs beside the sentence. So the die stays where it is, still
// the field's other half, and a door with a name on it opens on the plate.
//
// ## Two ponds can share a name, and the die has never known
//
// `pondname.js` mixes a seed into 48 adjectives and 32 landforms — 1,536 names
// against a seed space the die draws nine digits out of — and says, correctly,
// that a name is a handle and never an identifier. What nothing had asked is
// what that costs the **person pressing the die**, which is a different
// question from what it costs the label. Two million draws, and then the
// sessions (`SWEEP` below):
//
//     names the die can hand out          1,536, and it reaches every one
//     flattest to commonest               0.905× to 1.096× of expectation
//     20 presses land somewhere twice     12.8% of sessions
//     40 presses land somewhere twice     41.7% of sessions
//     a press that lands where you are     1 in 1,536
//
// The last row is the one with teeth, because `main.js` says hello only when
// the *name* moves: **one press in 1,536 rebuilds the world, renames nothing,
// says nothing, and looks exactly like a button that is broken.** The other
// rows are gentler and worse to read — *🪷 Welcome to Nameless Ford* on the
// pond you left ten minutes ago is the page telling a visitor it has lost
// count. This is v1.173's note arriving one file over: a key that is unique in
// the data you have is not a key, and here the data is a session nobody had
// measured.
//
// So the door remembers where it has been and will not offer it again. The
// rule costs **1.0137 draws a press** over forty presses, worst case 4 in two
// million, and it never once ran out of the twelve tries it is allowed — the
// cheapest guarantee in this repository, unmeasured for forty releases.
//
// ## A door you cannot come back through
//
// The die throws the pond away. `syncHash` writes the permalink with
// `history.replaceState`, which is right — a dragged slider must not fill a
// visitor's Back button with four hundred entries — and it means the browser's
// own way back does not work here either. Press the die on a pond you were
// enjoying and it is gone: the seed was nine random digits, nobody read them,
// and the field now holds the new ones.
//
// That is the whole argument for the second control. It is not a history and
// deliberately not: **one press back to the last place, always**, so pressing
// the door and pressing back are the same gesture in two directions and a
// visitor who presses both ends up where they started. It is hidden until
// there is somewhere to go back to, so the page a stranger arrives at has one
// new button on it and not two.
//
// It carries a **place** back and not a whole world, and that is a decision
// rather than a shortcut: a world chip moves the seed too, so a visitor who
// presses `🦠 The Plague` and then the way back arrives at the pond they left,
// under the rules they are now running. `pondname.js` settled that question for
// the plate in v1.134 and this inherits its answer — a name is a function of the
// seed alone, because *a place keeps its name when the weather changes*. Carrying
// the rules back as well would make this an undo for every control on the page,
// which is a different feature wearing this one's label.
//
// PURE. No DOM, no world, and — the part worth saying out loud on a page whose
// second prime directive is determinism — **no random numbers of its own**.
// The draw is handed in, so this module cannot move a pond, and a test can ask
// it the same question twice and get the same answer.

import { pondName, ADJECTIVES, LANDFORMS } from "./pondname.js";

/** The door, in the words a visitor reads. */
export const ANOTHER_LABEL = "🎲 Another pond";

/**
 * What a spoken name for the door says. The label is three words and a die;
 * a listener who cannot see the plate above it needs the promise spelled out,
 * and "another" on its own is an adjective with nothing to lean on.
 */
export const ANOTHER_HINT = "Take me to a pond I have not seen";

/**
 * What the way back says before it has anywhere to go — the accessible name the
 * *shipped page* carries, written into `app/index.html` rather than only at
 * load, because a button whose every word arrives with the script is a button
 * with nothing to announce until it does. `main.js` replaces it with the place
 * name the moment there is one.
 */
export const BACK_HINT_BLANK = "Back to the pond before this one";

/**
 * The die's range, unchanged from the one `main.js` has rolled since v1.0:
 * nine digits. Wider would be no better — the seed is narrowed to 32 bits by
 * both `RNG` and `pondName` — and narrower would make the repeat rule below
 * matter sooner than it does.
 */
export const SEED_CEILING = 1e9;

/**
 * How many draws the door may spend looking for a place this visitor has not
 * been. Twelve, against a measured mean of 1.0137 and a measured worst case of
 * 4 over two million presses: it is not a budget, it is a promise that the
 * loop halts. A visitor who has somehow seen all 1,536 names gets a repeat
 * rather than a hang, which is the right way round.
 */
export const ATTEMPTS = 12;

/** How many names there are to be handed out. Counted, never typed. */
export const NAME_SPACE = ADJECTIVES.length * LANDFORMS.length;

/**
 * Somewhere this visitor has not been.
 *
 * @param {() => number} draw a source of numbers in [0, 1) — `Math.random` on
 *   the page, something repeatable in a test. Handed in rather than reached
 *   for, so this module draws nothing by itself.
 * @param {Set<string>} [seen] pond names already visited this session
 * @param {number} [attempts] draws to spend before taking what the die gives
 * @returns {number} a seed
 */
export function pickSeed(draw, seen = new Set(), attempts = ATTEMPTS) {
  const roll = () => Math.floor(draw() * SEED_CEILING);
  let seed = roll();
  for (let i = 1; i < attempts && seen.has(pondName(seed).name); i++) seed = roll();
  return seed;
}

/**
 * The way back, in the words a visitor reads. The place is named rather than
 * called "back", because the whole complaint this control answers is that a
 * pond the die threw away had a name and nine digits nobody memorised — and a
 * button reading `↩ Back` would be asking them to remember it all over again.
 *
 * @param {number} seed
 * @returns {string}
 */
export function backLabel(seed) {
  return `↩ ${pondName(seed).name}`;
}

/**
 * The same promise, spelled out for a listener and for a hover: the label is a
 * place name with an arrow in front of it, which reads as a destination only
 * if you watched it become one.
 *
 * @param {number} seed
 * @returns {string}
 */
export function backHint(seed) {
  return `Back to ${pondName(seed).name}, seed ${pondName(seed).seed}`;
}

/**
 * What the water says on a return. `pondname.js` owns *🪷 Welcome to Lower
 * Tarn*, which is the right sentence for a place you have never been and the
 * wrong one for the place you left ninety seconds ago — and a page that cannot
 * tell those apart is the page this module was written to stop being.
 *
 * `🪷` and no jargon, so it clears the bar `news.js` holds every other sentence
 * over this water to.
 *
 * @param {number} seed
 * @returns {string}
 */
export function welcomeBack(seed) {
  return `🪷 Back at ${pondName(seed).name}.`;
}

/**
 * The sweep, kept so the numbers above can be checked rather than believed.
 *
 * `repeat` is the share of sessions in which the die hands out a name the
 * visitor has already been to, over 200,000 sessions each; `silentPresses` is
 * the share of all presses that land on the name already on the plate, which
 * is the press that appears to do nothing. `rejectCost` is what the fix costs:
 * mean draws per press over 50,000 sessions of forty presses, the worst single
 * press in all two million, and how many of those two million exhausted their
 * twelve tries.
 */
export const SWEEP = Object.freeze({
  draws: 2_000_000,
  namesReached: 1536,
  flattest: 0.905,
  commonest: 1.096,
  repeat: Object.freeze({ 5: 0.98, 10: 3.57, 20: 12.82, 40: 41.71 }),
  silentPresses: 0.066,
  rejectCost: Object.freeze({ meanDraws: 1.0137, worst: 4, exhausted: 0 }),
});

/**
 * Where the only door to another pond stood, and where it stands now, at the
 * two viewports this project's browser work uses. `depth` is the share of the
 * document it sits down, which is the number this is really about — 5,072 px
 * would be nothing at all down a forty-thousand pixel page. `rank` is its place
 * in the queue of targets a thumb passes on the way down.
 *
 * Same shape as `firstmoves.js`'s `WALK` and `AIMED_WALK`, and deliberately a
 * third record rather than an edit of either: those are what v1.153 and v1.169
 * measured, and a recording somebody overwrites is a recording of nothing.
 *
 * The desktop column is the cost and it is the smallest of the three this
 * project has paid, because the die was already near the top of a panel that
 * stands *beside* the water at 1280 px. The phone column is the release.
 */
export const DOOR_WALK = Object.freeze({
  "390x844": Object.freeze({
    before: Object.freeze({ doc: 5709, top: 5050, depth: 0.885, rank: 34, of: 45 }),
    after: Object.freeze({ doc: 5723, top: 308, depth: 0.054, rank: 20, of: 46 }),
  }),
  "1280x900": Object.freeze({
    before: Object.freeze({ doc: 3568, top: 661, depth: 0.185, rank: 27, of: 44 }),
    after: Object.freeze({ doc: 3571, top: 245, depth: 0.069, rank: 19, of: 45 }),
  }),
});

/**
 * What the door costs the first screen, read off the same page in the same
 * state with the plate's moves shown and then hidden — v1.173's rule, which is
 * that a cost of zero is still a measurement and it is the one nobody takes.
 * `plate` is the nameplate's own height and `water` is where the pond starts.
 *
 * The phone pays 14 px, and all of it goes on the sentence rather than on the
 * button: at 390 px the door takes 137 of the row's 342, which leaves *the same
 * seed always grows the same pond* two lines instead of one. That is the trade,
 * stated so somebody can disagree with it — v1.172 paid 20 px of this screen for
 * a count in the eyebrow, and this buys the only press on the page that answers
 * the sentence it just wrapped.
 */
export const DOOR_COST = Object.freeze({
  "390x844": Object.freeze({ plate: [41, 55], water: [589, 603], doc: [5709, 5723] }),
  "1280x900": Object.freeze({ plate: [41, 44], water: [396, 399], doc: [3568, 3571] }),
});
