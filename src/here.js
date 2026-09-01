// here.js — the page saying which of its offers you have already taken.
//
// Every board here points at something. The cast list leads to an animal
// (v1.123), the ladder to a family (v1.133), the plates over the water to
// whoever is under them (v1.127), and the Chronicle to all three (v1.136,
// v1.137). Not one of them has ever said which of those you *took*. Press
// `👀 Show me` on the line about Tamsin and the camera goes to her, the badge
// over the water says `🎯 Tamsin`, the inspector fills with her — and the line
// you pressed, the thing you were reading when you decided to press it, looks
// exactly as it did before, still offering. Four cycles of this project's own
// notes have ended with that sentence and none of them built the answer.
//
// The answer is one word on the control. The interesting part is what decides
// it, because the obvious instrument is the wrong one.
//
// **A mark that remembers the press would be dark most of the time.** A
// visitor arrives at an animal by pressing a name plate over the water, by
// `👋 Meet somebody`, by an arrow key on the pond, by a row on the cast board,
// or by the Chronicle — five doors into one state, and a panel that lit up only
// for its own presses would sit dark in four of them while the page around it
// was plainly showing that animal. So the question this module asks is not
// *did you press this?* but:
//
//   **is this row about what the page is showing right now?**
//
// Which is a comparison of two numbers, and is true however the visitor got
// there. That reframe pays twice over. It lights up **every** line about the
// animal you are watching rather than only the one you pressed — so meeting
// somebody hands you their whole history in the panel you were already reading,
// which is the thing this page has never done — and it cannot go stale, because
// it is not a memory of anything. Stop watching and the marks go by themselves.
//
// Three rules, and the third is why this is a module rather than a private
// function in the panel that needed it first:
//
//  1. **Only a control can be here.** A row that is not pressable has no offer
//     to withdraw, and marking it would be decoration. `feed.js` asks this of
//     rows it has already decided are controls.
//  2. **One word for all three kinds.** An animal in the inspector, a lineage
//     lit in the water and a life open in the card are three mechanisms and one
//     fact to a reader: *this is the one you are on*. v1.136's rule is one
//     promise per mechanism; the promises differ, being on them does not.
//  3. **It belongs where the other boards can find it.** This project's own
//     note is that a rule written into the module it was discovered in is a
//     rule that module owns and nobody else can reach — v1.131 put a clock in
//     `milestones.js` and two panels went on getting the date wrong for four
//     releases. The Chronicle is the surface that gets this today; the cast
//     board and the record book point at animals too and will want the same
//     word, on the day their render stops being a rewrite (v1.121).
//
// Determinism: two integer comparisons and a constant string. No world, no
// drawing, no random number.

/** The word a control wears once you are on the thing it points at. */
export const HERE_LABEL = "📍 You are here";

/** What a subject field says when a row points at nobody of that kind. */
export const NOBODY = -1;

/**
 * Is this row about what the page is currently showing?
 *
 * Both arguments carry the same three fields, so the test is a field-wise
 * match and there is nothing to keep in step: `who` is an animal the page is
 * watching, `sp` a lineage lit up in the water, `told` a life open in the card.
 * A row carries at most one of them and the page may be showing all three at
 * once — a lit lineage does not stop being lit because you then met somebody —
 * so any single match is enough.
 *
 * Numbers, never references (v1.119's rule): a row that held its creature would
 * keep a body the world had already buried, and this comparison would go on
 * being true about somebody who is gone.
 *
 * @param {{who?:number, sp?:number, told?:number}} row the subject of one row
 * @param {{who?:number, sp?:number, told?:number}} showing what the page is on
 */
export function isHere(row = {}, showing = {}) {
  return (
    same(row.who, showing.who) || same(row.sp, showing.sp) || same(row.told, showing.told)
  );
}

/**
 * Two subject fields naming the same thing.
 *
 * `NOBODY` on either side is not a match, which is the whole guard: a row about
 * the pond and a page showing nobody both carry −1, and a bare `a === b` would
 * call every sentence in the panel the place you are standing.
 */
function same(a, b) {
  return typeof a === "number" && a > NOBODY && a === b;
}
