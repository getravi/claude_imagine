// hand.js — which hand this page is in, and the words that follow from it.
//
// `gestures.js` shipped the whole camera to a thumb: tap to pick, drag to pan,
// pinch to zoom, double-tap to follow. Every one of those works today. And a
// browser walk this cycle, at 390 × 844 with touch actually emulated rather than
// merely a narrow window, found that the page goes on telling a phone to do
// things a phone cannot do:
//
//   #doing        Pick an animal — click one, or press M — and this line
//                 will follow it.                        ← two dead verbs, no
//                                                          live one, and this is
//                                                          the line under the
//                                                          water that a visitor
//                                                          reads first
//   #inspector    Click a creature to meet it — or press M and the pond will
//                 pick one for you.
//   .kbd-hint     Space pause · . step · R reset · F feed · M meet somebody …
//   .kbd-hint     Tab to the pond, then ←↑↓→ to step between creatures …
//                                                        ← 104 px of keys, on a
//                                                          device with none
//
// Fifteen places on this page name an input device, and they account for
// themselves: the eight sentences this file now holds in two registers, the
// pan-and-zoom pair, the two paragraphs of accelerators above, the minimap's
// tooltip and the pond's screen-reader help — both deliberately left in the
// mouse-and-keyboard register, for reasons given below — and one world's blurb
// that has stopped naming a device at all. **One pair of the fifteen had ever
// asked which device you had**: the pan-and-zoom hint, which has carried a
// `.fine-only` and a `.coarse-only` copy since the gestures landed. The fix went
// where the defect was *noticed*, and stopped there; every other sentence kept
// the wording it was born with, including the two that are the page's actual
// invitations to act.
//
// That is the general shape, and it is worth more than the strings: **a
// conditional written at one site is a decision, not a policy.** The moment this
// page learned that some of its readers have no wheel and no keys, every
// sentence that names one became wrong for them — not just the sentence that
// happened to be under the cursor when I noticed. So the registers live here, in
// one table, and `test/hand.test.js` reads every entry rather than trusting that
// the next one to be added will remember.
//
// **The rule for a sentence that is not in the table.** Most instructions here
// do not need two registers; they need to stop naming a device at all. *Pick a
// creature to see its evolved network* is true in every hand, and this project
// already owns that neutral verb — `#doing` says **pick** and then explains it
// twice. A pair belongs here only when the sentence is *teaching the gesture*,
// because that is the one job the neutral verb cannot do.
//
// **And the half a translator cannot do.** Swapping `click` for `tap` would fix
// the small half of this. It cannot fix the invitation, because *press M* has no
// touch equivalent — the phrase has to be **deleted**, and what replaces it is a
// different sentence with a different rhythm. So the table holds whole sentences
// and not word pairs.
//
// PURE OBSERVER. No DOM, no simulation state, no random numbers, and it never
// reads `window` — the caller asks the browser its one question and passes the
// answer in, so the whole of this is testable in `node --test`.

/** A mouse, a trackpad, a stylus: something that points precisely and hovers. */
export const POINTER = "pointer";
/** A finger. Points coarsely, cannot hover, and has no keys behind it. */
export const TOUCH = "touch";

/**
 * The one question this page asks about a visitor's hardware.
 *
 * It is deliberately the *same string* the stylesheet asks — `style.css` hides
 * `.fine-only` and `.keys-only` under exactly this query — because two readers
 * of one fact that ask it differently will one day disagree, and the shape of
 * that bug is a page saying *tap a creature* beside a row of keyboard
 * shortcuts. `test/hand.test.js` holds the stylesheet to it.
 *
 * `pointer: coarse` and not a width: a small window on a laptop still has a
 * wheel, and a 1,024 px tablet still has none.
 */
export const MEDIA_QUERY = "(pointer: coarse)";

/**
 * Which register to speak in.
 *
 * @param {{coarse?: boolean}} env the answer to `MEDIA_QUERY`, passed in
 * @returns {"pointer"|"touch"}
 */
export function handFor(env = {}) {
  return env && env.coarse === true ? TOUCH : POINTER;
}

/**
 * Every sentence on this page that names an input device, in both registers.
 *
 * The values are **markup**, not text: one of them wears a `<kbd>` and the rest
 * would look wrong if the page had to guess which. Every one is a hand-written
 * literal with nothing interpolated into it, so a caller writing them with
 * `innerHTML` is writing this file and nothing else, and the test holds the
 * table to `<kbd>` as the only tag any of them may use.
 *
 * The touch column is not a translation of the pointer column. Three of these
 * name a key, and a key cannot be re-worded into a finger — those sentences are
 * rewritten, and they come out **shorter**, because the pointer copy is carrying
 * an alternative route that a phone does not have.
 */
export const PHRASES = Object.freeze({
  /**
   * The line under the water, before anybody has been picked. The most-read
   * instruction on this page and the one that was worst: on a phone it named
   * two devices the reader did not have and never named the one they did.
   */
  doingInvite: Object.freeze({
    pointer: "Pick an animal — click one, or press M — and this line will follow it.",
    touch: "Tap an animal — any of them — and this line will follow it.",
  }),

  /** The inspector before anything is selected. */
  inspectorEmpty: Object.freeze({
    pointer:
      "Click a creature to meet it — or press <kbd>M</kbd> and the pond will pick one for you.",
    touch: "Tap a creature to meet it — or press 👋 Meet somebody and the pond will pick one.",
  }),

  /** The placard's row for the white ring (`key.js`, mark `chosen`). */
  chosenRing: Object.freeze({
    pointer: "A white ring. Click any creature to be told who they are and watch what becomes of them.",
    touch: "A white ring. Tap any creature to be told who they are and watch what becomes of them.",
  }),

  /** The placard's row for the name tags (`key.js`, mark `named`). */
  namedTag: Object.freeze({
    pointer:
      "A few wear one — the one you picked, and the stand-outs below — with what they are doing. Press one to follow.",
    touch:
      "A few wear one — the one you picked, and the stand-outs below — with what they are doing. Tap one to follow.",
  }),

  /** Ticking the trail box over a pond with nobody selected. */
  trailNeedsSomebody: Object.freeze({
    pointer: "Click a creature (or press an arrow key) to give the trail somebody to follow.",
    touch: "Tap a creature to give the trail somebody to follow.",
  }),

  /** The same courtesy for the reach rings. */
  reachNeedsSomebody: Object.freeze({
    pointer: "Click a creature (or press an arrow key) to see how far its rules reach.",
    touch: "Tap a creature to see how far its rules reach.",
  }),

  /** Asking the camera to follow nobody. */
  followNeedsSomebody: Object.freeze({
    pointer: "Click a creature first, then follow it.",
    touch: "Tap a creature first, then follow it.",
  }),

  /**
   * The minimap, for a listener.
   *
   * Its `title` is left in the mouse register on purpose and is not in this
   * table: a `title` is a tooltip, a tooltip needs a hover, and a hand that
   * cannot hover will never be shown it — v1.154's finding, used the one way it
   * is good news. The `aria-label` is the copy that a phone genuinely reads out,
   * so that is the copy this table owns.
   */
  minimapHelp: Object.freeze({
    pointer: "Minimap of the whole pond; click or use the arrow keys to move the view",
    touch: "Minimap of the whole pond; tap it to move the view",
  }),
});

/**
 * A sentence, in the register of the hand it is being read with.
 *
 * Falls back to the pointer copy rather than throwing on an unknown hand: this
 * is prose on a page, and the failure a visitor should get from a typo is the
 * wrong-but-true sentence they used to get, not an empty panel.
 *
 * @param {keyof PHRASES} key
 * @param {"pointer"|"touch"} [hand]
 */
export function say(key, hand = POINTER) {
  const pair = PHRASES[key];
  if (!pair) return "";
  return hand === TOUCH ? pair.touch : pair.pointer;
}

/**
 * The class on the two paragraphs of keyboard accelerators.
 *
 * They are hidden from a coarse pointer by the same media query that hides the
 * mouse hint, and the trade is worth saying out loud: a tablet with a keyboard
 * plugged into it loses a *reminder*, never a capability — every accelerator
 * still fires. What it buys is 104 px of a phone page spent on twelve keys that
 * device does not have, and the sr-only paragraph in the stage still tells a
 * screen reader how the arrow keys walk the pond, because that is help for a
 * keyboard rather than an advertisement of one.
 */
export const KEYS_ONLY = "keys-only";

/** Every phrase key, for a caller that wants to walk the table. */
export function phraseKeys() {
  return Object.keys(PHRASES);
}
