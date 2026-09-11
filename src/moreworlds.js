// moreworlds.js — the strip said thirteen and a phone showed one.
//
// The worlds strip is the most immediately playable thing this project owns:
// thirteen curated ponds, one press apart, each with a hand-written promise
// under it. v1.154 gave them words. v1.156 gave them an order and three
// headings. Both releases measured the same thing on the way past and neither
// acted on it — *at 390 px the row already only shows two* is written in
// `src/worlds.js`, in `style.css`, and in `src/main.js`, three times in three
// files, as an aside.
//
// A browser walk this cycle, at 390 × 844 with touch emulated:
//
//   the row's visible box        346 px
//   the row's actual content   2,200 px   — **84% of it is off the edge**
//   chips fully inside the box       2 of 13
//   chips clear of the fade mask     1 of 13
//
// One. The page says `13 worlds to try:` in the label directly above it — a
// count read off the array at runtime so that it can never be wrong — and then
// shows a visitor one world and a piece of a second. **The honest count made
// the shortfall precise instead of fixing it**, which is the failure to
// remember here: a true number beside a thing a reader cannot reach is not
// information, it is a receipt for something undelivered.
//
// Nothing was broken. The row scrolls sideways, it has a fade at the cut edge
// saying so, and a thumb that flicks it finds all thirteen. The trap is that
// **an affordance a visitor must first suspect is there does no work in the
// three seconds anybody gives a new page.** Every measurement in this file is
// about a collection of thirteen; the one that matters is that twelve of them
// need a gesture nobody has been given a reason to make.
//
// ## What this adds, and what it deliberately does not
//
// One control: a button beside the label that says how many worlds are hiding,
// and opens the row into a full grid when pressed. Collapsed is unchanged —
// **the pond does not move on first paint**, which is the constraint that ruled
// out simply wrapping the row at every width (thirteen chips wrap to five rows
// at 390 px and would push the water a fifth of a screen down for every
// visitor, including the ones who never wanted the list).
//
// So the cost is paid by the visitor who asks for it, and pressing again gives
// it back. Measured on the shipped page, opening the strip moves the pond down
// by **259 px** at 390 × 844 and by 111 px at 768; at 1280 there is no button,
// because there is nothing hidden to offer. Shutting it puts the document back
// to the pixel. That is the whole design; the rest of this file is the
// arithmetic that keeps it honest.
//
// ## The button exists when the row overflows, not when the screen is small
//
// v1.155's hard-won note — *a conditional written at one site is a decision,
// not a policy* — and v1.159's — *a layout rule written as a compass direction
// is a rule about one page* — both point the same way, so the trigger here is
// not a width. The stylesheet happens to scroll this row below 960 px and wrap
// it above, but that is a fact about today's stylesheet, and a reader who has
// scaled their text up, or a desktop window dragged narrow, or a fourteenth
// world, all move the boundary without moving the media query.
//
// The condition is the one the visitor actually has: **is there more of this
// row than the row is showing.** Measured off the element, every time the page
// is laid out, and the button appears exactly then.
//
// ## The label is a subtraction, so it cannot drift
//
// `＋ 11 more worlds` is `SCENARIOS.length` minus what the walk can see, not a
// number anybody typed. This project has now shipped the typed version of that
// sentence four times and found it stale four times — a tooltip (v1.154), a
// stat count (v1.37), a header (v1.163), a guide (v1.166) — and the shape that
// survives is always the same: **read the page, subtract, say the difference.**
// A fourteenth world changes this label the day it lands and no cycle has to
// remember.
//
// What counts as *seen* is the one judgement in it, and it is stricter than it
// looks: a chip is seen when the whole of it is inside the box **and clear of
// the fade mask**, because the last 28 px of this row are deliberately painted
// out and a name under a fade is a name a person squints at. That is the
// difference between the 2 and the 1 in the walk above, and the stricter of the
// two is the one a visitor lives in.
//
// ## Where you are, when you cannot see where you are
//
// The second half of the same bug, and it is the half no walk had ever looked
// for. The lit chip says which of the thirteen you are in. A permalink into
// `#the-four-rooms` — the last chip of the last group, 1,900 px along a 346 px
// row — arrives with the lamp lit **off the edge of the screen**, so the strip
// tells a visitor nothing about where they are and the caption under it is
// their only evidence. So while the row is collapsed, the lit chip is scrolled
// into the middle of it. A default pond is unaffected, because Genesis is the
// first chip and the middle of the row is already where it starts.
//
// The clamp is where this stops being perfect, and it is worth saying rather
// than discovering: the last chip in the row cannot be centred, because there
// is no content behind it to scroll. `🌍 The Whole World` lands hard against
// the right edge with its final 28 px under the fade — on screen, legible,
// and not in the middle. The alternative is a trailing pad on the scroller,
// which buys those 28 px at the cost of a fade that is always over nothing,
// and *on screen at all* is the thing this half was for.
//
// PURE OBSERVER. Words and arithmetic over rectangles a browser measured. No
// DOM, no world, no random draw — every function here takes numbers and returns
// numbers or a string, and `main.js` owns the elements. A pond with the strip
// open and a pond with it shut are bit-for-bit identical.

import { SCENARIOS } from "./scenarios.js";

/**
 * The width of the fade at the cut edge of the row, in CSS pixels.
 *
 * It is declared in `style.css` as a mask over the last 28 px of the scroller,
 * and it is repeated here because this file has to *subtract* it: a chip that
 * ends underneath the fade is drawn, so a browser calls it visible, and a
 * person calls it smudged. `test/moreworlds.test.js` reads the stylesheet and
 * fails if the two numbers part company — the pair is pinned rather than
 * deduplicated for `colourliterals.test.js`'s reason, because a mask is painted
 * before any module runs and cannot be handed over from here.
 */
export const FADE_PX = 28;

/**
 * How many of the chips a visitor can actually read, given their rectangles and
 * the box they sit in.
 *
 * Every measurement is in the same coordinate space — whatever the caller used
 * — because only differences are taken. A chip counts when it begins at or
 * after the box's left edge and ends at or before the box's right edge less the
 * fade.
 *
 * Half-pixel layouts are the reason for `EPSILON`: a browser reports a chip
 * flush against an edge as 345.9998 against 346, and a strip that claims one
 * fewer world than it is showing because of a rounding error is the exact class
 * of wrongness this file exists to remove.
 */
const EPSILON = 0.5;
export function readableChips(rects, box, fade = FADE_PX) {
  const right = box.right - fade;
  return rects.filter((r) => r.left >= box.left - EPSILON && r.right <= right + EPSILON).length;
}

/** How many of the collection are not on screen. Never negative. */
export function hiddenWorlds(total, readable) {
  return Math.max(0, total - readable);
}

/** What the button says while the row is open. */
export const FEWER_LABEL = "Show fewer";

/**
 * What the button says while the row is shut.
 *
 * The plural is worth the branch: `＋ 1 more worlds` is the sentence that tells
 * a reader nobody checked, and this row reaches one hidden world on a wide
 * window a visitor has dragged a little too narrow.
 */
export function moreLabel(hidden) {
  return `＋ ${hidden} more ${hidden === 1 ? "world" : "worlds"}`;
}

/**
 * The whole state of the control, from the two numbers that decide it.
 *
 * `needed` is what `main.js` hangs the button's `hidden` on, and the `open ||`
 * in it is not a convenience — it is the door's own handle. When the row is
 * open every chip is readable, so `hidden` is zero, and a button that appeared
 * only when something was hidden would take itself off the page the instant it
 * worked and leave the visitor with a wrapped strip and no way back.
 *
 * `announce` is what a screen reader gets on the button. The visible label
 * carries a `＋` and a `−` that stand for *open* and *shut* to an eye and are
 * punctuation to an ear, so the spoken half says the words instead. It is not
 * the same string as the visible one, which the suite checks on purpose: a
 * control that looks like an opener and announces itself as one is two claims
 * about one thing, and they are allowed to be worded differently only while
 * they agree about the state.
 */
export function stripState({ total = SCENARIOS.length, readable, open = false }) {
  const hidden = hiddenWorlds(total, readable);
  return {
    needed: open || hidden > 0,
    open,
    hidden,
    label: open ? `− ${FEWER_LABEL}` : moreLabel(hidden),
    announce: open
      ? `${FEWER_LABEL}, showing all ${total} worlds`
      : `Show all ${total} worlds`,
  };
}

/**
 * Where to scroll the row so the lit chip sits in the middle of it.
 *
 * `chipLeft` is the chip's distance from the start of the row's *content*, not
 * from the screen — the caller works it out with a subtraction that survives
 * the row already being scrolled. The clamp is what makes the first and last
 * chips behave: a chip near either end cannot be centred, and pretending
 * otherwise would scroll past the end of the content and land the row on a
 * blank margin.
 *
 * Returns `0` for a row with nothing to scroll, which is the same answer a
 * browser would give and means a wide window never moves.
 */
export function centreScroll(chipLeft, chipWidth, viewWidth, scrollWidth) {
  const most = Math.max(0, scrollWidth - viewWidth);
  const want = chipLeft + chipWidth / 2 - viewWidth / 2;
  return Math.min(most, Math.max(0, want));
}
