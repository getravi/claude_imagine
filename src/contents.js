// contents.js — the page's own headings, handed to somebody who has to scroll.
//
// Measured in a headless Chromium at 390 × 844, the phone this project has been
// sizing for since v1.160: `app/index.html` is **5,638 px tall**. That is six
// and two-thirds screens. The water ends at 786 px, so **86% of this page is
// below the pond**, and the Chronicle — the panel that tells a visitor what has
// actually happened in the world they are watching — starts more than five
// screens down.
//
// Every release makes that worse, and the last one said so out loud: v1.164
// filled three empty panels and wrote *the page is 270 px taller and the best
// panel is further down than ever* into the devlog as the honest cost. Thirty
// releases of good panels have been stacked into one column with no way to see
// what is in it. A visitor's only instrument for a page of this length is a
// thumb, and a thumb cannot see round a corner.
//
// ## The contents was already written
//
// This is the part I had missed for thirty releases. The page has eleven
// headings in it, and every one of them is already a plain-English name for the
// thing underneath, already carrying a mark:
//
//     🔍 What you are looking at        🏅 Worth watching
//     🧬 How they have changed          🎯 Are they getting better?
//     🏁 Day one vs today               🏆 Pond records
//
// Read as a list, that *is* a table of contents — written over thirty releases,
// one line at a time, by whoever added the panel. It has never been shown to
// anybody as a list.
//
// And one reader has had it all along. A screen reader offers a heading walk on
// every page ever written: press one key and step the document's `<h2>`s. That
// is exactly the instrument this page needs and exactly the one a person
// holding a phone does not have. So the rule here is not *design a navigation*
// — it is:
//
//   **give everybody the heading walk.**
//
// Which settles the thing that goes wrong with a guide. `tour.js` is a fixed
// list of six stops against a page that grows, and its own leave item has been
// *this release added a panel the tour does not mention* for three cycles
// running — a hand-typed second copy of a page drifts from the page, always,
// which is the failure this project has now found in a tooltip (v1.154), a
// count (v1.37), a header (v1.163) and a guide. (v1.166 closed the guide's half
// of it from the other end: a stop still holds typed words, because a stop has
// to say *why this is worth your time* and a heading cannot, but `UNTOURED` in
// `tour.js` now records every headed panel the guide walks past, and its test
// reads this same page and fails on any panel that is in neither list.) A
// contents assembled from the
// headings **cannot** drift: add a panel with a heading and it is in the list;
// take one away and it is gone; put the instruments behind the switch (v1.149)
// and the Tree of Life leaves the contents with them, because `main.js` reads
// only the headings a browser is actually showing.
//
// The catch, and v1.167 is where it came due: *cannot drift* is a promise about
// the re-read, not about the list. Two things could change the set of shown
// headings when this was written — the switch and a resize — and `main.js` was
// wired to both. Then the obituary grew a heading of its own, and it is the
// first section here that comes and goes in the middle of a visit with neither:
// an animal dies and the page has a chapter it did not have a second ago. A
// section that appears on its own has to say so, and `test/contents.test.js`
// now holds that pair together. **Every reading needs a list of the moments its
// subject can change, and that list is the part nobody maintains.**
//
// That obituary chapter is also the one entry in this list that is a *name*.
// Every other heading on the page is a label — *Pond records*, *Worth watching*
// — written once and true of every pond. `🕯️ Rill` is true of one animal in one
// world for as long as the visitor has not picked somebody else, and it is the
// closest this page comes to a table of contents that knows who you were
// watching.
//
// ## Where you are, and the one bit of arithmetic
//
// A contents that only jumps is half an instrument. The other half is *you are
// here*, and it is the half with a bug in it, which is why the arithmetic lives
// in this file where a test can sweep it rather than in a scroll handler where
// nothing can.
//
// The usual rule — **the last chapter whose heading has passed a reading line
// about a third of the way down the screen** — is right in the middle of a
// document and wrong at the end of one, because scrolling stops while the
// reading line still has a screen of page below it. Every chapter that begins
// inside that last screenful can then never be current: the bar would sit
// saying `9 of 11` with chapters ten and eleven filling the window. This page
// has three headings in its last screen, so that is not a hypothetical.
//
// The fix is to let the reading line slide down to the bottom edge of the
// screen as the scroll runs out, so that at the last scroll offset the line
// *is* the last pixel of the document.
//
// **The slide belongs in the last screenful and nowhere else**, which is a
// correction to the first version of this file rather than a plan: sliding it
// smoothly across the whole scroll passed every test above and then a browser
// walk found the bar saying `11 of 11 · Chronicle` with two other panels
// filling the window, five hundred pixels before the Chronicle began. A line
// that has to arrive somewhere by the end will, if you let it, spend the whole
// journey arriving. So it runs at the reader's own speed until the remaining
// scroll is exactly the distance it still has to make up, and covers that last
// stretch at twice the speed. The general form, and this project has now met it
// in a caption (v1.161) and in a guide (v1.159): **a quantity that must reach a
// value by the end should spend the middle being right, not being early.**
//
// Two properties fall out, and `test/contents.test.js` sweeps both rather than
// sampling them:
//
//   **It never goes backwards.** The line is strictly increasing in the scroll
//   offset and the headings do not move, so scrolling down can only ever move
//   the mark down the list. A "you are here" that jumps back up a chapter as
//   you scroll forward is the one failure that makes a reader stop trusting the
//   whole control.
//
//   **Every chapter can be reached.** The line sweeps continuously from a third
//   of a screen to the document's last pixel, so every heading on the page is
//   passed by it at some offset, including the ones in the final screenful. A
//   contents with an unreachable entry is a map with a room you cannot stand
//   in.
//
// Determinism: PURE OBSERVER. Words, a list and arithmetic over four numbers a
// browser reports about its own window. No DOM, no world, no random draw — a
// pond scrolled to the bottom and a pond nobody has touched are bit-for-bit the
// same pond.

/**
 * Where "you are here" is read off the screen, as a fraction of its height.
 *
 * A third of the way down rather than the top edge: a heading that has just
 * scrolled into view at the bottom of the window is not what you are reading,
 * and a bar that said so would be pointing a screen ahead of its reader. A
 * third is where a reader's eye actually sits, and it is what every
 * documentation site in the world settles on for the same reason.
 */
export const READING_LINE = 0.35;

/**
 * The mark for a heading that carries none of its own.
 *
 * Exactly one heading on this page is bare, and it is the pond's name — which
 * is not an oversight to fix by typing an emoji into `app/index.html`, because
 * that heading is the title of the whole document and a name is not a label.
 * So the contents supplies a pin, which is what you put on a place.
 */
export const UNMARKED_ICON = "📍";

/**
 * Fewer chapters than this and a contents is furniture rather than help.
 *
 * A list of two is a list a reader can hold in their head from having scrolled
 * past it, and a control that offers to solve a problem nobody has is a control
 * that teaches a visitor to ignore the next one.
 */
export const CONTENTS_MIN = 3;

/**
 * Split a heading into the mark on its front and the words after it.
 *
 * The leading run is *anything that is not a letter, a digit or a space*, which
 * catches an emoji, a variation selector and a skin-tone modifier without this
 * file having to know what any of those are — and stops at the space, so a
 * heading that ends in punctuation keeps it (`Are they getting better?`). A
 * heading with no mark returns an empty one rather than a guess; the caller
 * decides what to draw, which is `UNMARKED_ICON` above.
 *
 * @param {string} text a heading's text, already trimmed of surrounding space
 * @returns {{icon: string, name: string}}
 */
export function splitHeading(text) {
  const trimmed = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  const m = trimmed.match(/^([^\p{L}\p{N}\s]+)\s+(\S.*)$/u);
  if (!m) return { icon: "", name: trimmed };
  return { icon: m[1], name: m[2] };
}

/**
 * The chapter list, from the headings a browser says it is showing.
 *
 * Every entry is drawable: a mark (borrowed or supplied) and a name. A heading
 * that is empty, or is nothing but a mark, is dropped rather than listed as a
 * blank row — a contents entry a reader cannot read is worse than one that is
 * not there, because the row is still a button and it still goes somewhere.
 *
 * "Nothing but a mark" is worth being exact about, because it is the case the
 * split cannot see: `🌊 This is the pond` divides at the space, and a heading
 * that is only `🌊` has no space to divide at, so it arrives here as a *name*
 * made of an emoji. So the bar is a letter or a digit: a name has a word in it.
 *
 * @param {Array<string>} headings in the order they appear down the page
 * @returns {Array<{icon: string, name: string}>}
 */
export function chapters(headings) {
  const out = [];
  for (const h of headings || []) {
    const { icon, name } = splitHeading(h);
    if (!/[\p{L}\p{N}]/u.test(name)) continue;
    out.push({ icon: icon || UNMARKED_ICON, name });
  }
  return out;
}

/**
 * The reading line, in document coordinates.
 *
 * Sits at `READING_LINE` of the window until the remaining scroll is exactly
 * what the line still has to make up, then covers that last stretch at twice
 * the reader's speed and arrives at the document's last pixel — see the header
 * for why both halves exist and what the early version of it got wrong.
 * Strictly increasing in `y`, which is what makes the mark monotone.
 *
 * Defensive about its inputs because they come from a window rather than from
 * this project: a viewport of zero (a page in a background tab that has never
 * been laid out) would otherwise put the line at the origin and report chapter
 * one forever.
 *
 * `obscured` is how many pixels of the *top* of the window a reader cannot read
 * through — since v1.171 that is the pinned pond, and it is 28% of a phone. A
 * third of the way down the window is 56 px below the water there, so a line
 * measured from the window's own top would spend the whole page naming the
 * chapter that is behind the pond while the reader looks at the next one. So
 * the fraction is taken over what is left: **a third of the way down the part
 * of the screen that has words on it.** Absent or zero it is arithmetically the
 * line this function has always drawn.
 *
 * @param {{y: number, viewport: number, docHeight: number, obscured?: number}} scroll
 * @returns {number}
 */
export function readingLine(scroll) {
  const viewport = Math.max(1, num(scroll && scroll.viewport));
  const docHeight = Math.max(viewport, num(scroll && scroll.docHeight));
  const maxY = docHeight - viewport;
  const y = Math.min(Math.max(num(scroll && scroll.y), 0), maxY);
  const obscured = Math.min(Math.max(num(scroll && scroll.obscured), 0), viewport - 1);
  const start = obscured + READING_LINE * (viewport - obscured);
  // What the line has to gain by the last scroll offset, and the stretch of
  // scroll it gains it over — the *last* screenful of it, never sooner.
  const makeUp = viewport - start;
  const ramp = Math.min(maxY, makeUp);
  const into = ramp === 0 ? 1 : Math.min(1, Math.max(0, (y - (maxY - ramp)) / ramp));
  return y + start + into * makeUp;
}

/**
 * Which chapter the reader is in: the last one whose heading the line has
 * passed, and the first chapter before it has passed any.
 *
 * `-1` on an empty list, which is the caller's cue to put the bar away rather
 * than to draw a chapter zero.
 *
 * @param {Array<number>} tops each heading's distance from the top of the document
 * @param {{y: number, viewport: number, docHeight: number}} scroll
 * @returns {number}
 */
export function chapterAt(tops, scroll) {
  if (!tops || tops.length === 0) return -1;
  const line = readingLine(scroll);
  let at = 0;
  for (let i = 0; i < tops.length; i += 1) {
    if (tops[i] <= line) at = i;
  }
  return at;
}

/**
 * Whether the bar is up at all: once the water has left the middle of the
 * screen.
 *
 * The pond is the one thing on this page nobody needs help finding, and a
 * control that is on screen at the moment a visitor arrives is a control
 * competing with it. This one waits until the thing it solves — a column of
 * panels with no end in sight — is the thing being looked at.
 *
 * @param {{y: number, viewport: number, docHeight: number}} scroll
 * @param {number} pondBottom the water's lower edge, from the top of the document
 */
export function barShown(scroll, pondBottom) {
  const viewport = Math.max(1, num(scroll && scroll.viewport));
  return num(scroll && scroll.y) + viewport / 2 > num(pondBottom);
}

/**
 * The small line on the bar: where you are in the list, in the shape a book
 * uses.
 *
 * One-based, because a reader counting chapters starts at one and the bar is
 * the only place on this page a visitor is asked to count anything.
 *
 * @param {number} index zero-based, as `chapterAt` returns it
 * @param {number} total how many chapters the page is showing
 */
export function chapterCount(index, total) {
  const n = Math.max(0, Math.floor(num(total)));
  const at = Math.min(Math.max(Math.floor(num(index)), 0), Math.max(0, n - 1));
  return n === 0 ? "" : `${at + 1} of ${n}`;
}

/**
 * What the bar's control is called when it is read rather than seen.
 *
 * The visible label is a mark, a count and a name in three lines of different
 * sizes, which is a shape a listener gets as one run-on string. This is the
 * same three facts as a sentence, and it says what pressing does — a button
 * named only for its subject leaves a listener to guess whether it goes there
 * or merely says so.
 *
 * @param {{name: string}|null} chapter the chapter the reader is in
 * @param {number} index zero-based
 * @param {number} total how many chapters the page is showing
 */
export function toggleTitle(chapter, index, total) {
  const where = chapterCount(index, total);
  if (!chapter || !where) return "Contents — jump to a part of this page";
  return `Contents — you are at ${where}, ${chapter.name}. Opens the list of parts.`;
}

/** A number from a window, or zero. Windows report `NaN` more often than you would like. */
function num(v) {
  return Number.isFinite(v) ? v : 0;
}
