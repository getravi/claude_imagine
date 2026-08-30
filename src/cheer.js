// cheer.js — the moment a rung is climbed, said out loud over the water.
//
// v1.131 gave this page the one surface that points forwards: a ladder of six
// things a pond does as it grows up, ticked as it does them. It told a visitor
// what to wait for and then, when the waiting paid off, **said nothing**. The
// row quietly grew a tick mark in a panel three hundred pixels below the water
// the visitor was actually looking at, and the moment the whole panel exists to
// promise went past unmarked.
//
// That is the wrong half of the loop to leave open. A checklist that never
// celebrates is a tax form. Every aquarium, every game, every progress bar
// anybody has ever enjoyed does the same two things: it says what is coming,
// and then it makes a fuss when it arrives — and this project has spent fifteen
// releases teaching the page to explain itself to a newcomer without once
// giving that newcomer a moment of *reward* for staying.
//
// So: when the pond climbs a rung, it says so, in a banner over the water, in
// the plainest sentence the rung has — and then names the next one, because the
// point of a moment is the one after it.
//
// **Could this be noisy? Measured, not guessed.** Twelve seeds, six thousand
// steps each: the ladder is climbed in **69** separate moments across those
// twelve ponds, so a run gets about six banners in an hour and a half of pond
// time — one every five hundred steps. `records.js` sized the Chronicle against
// the same fear in v1.125 and found the same answer: the risk on this page has
// never been too much news.
//
// **Two rungs can land together, and one banner cannot say two things.** Of
// those 69 moments, **68 were a single rung** and one was a pair — a dynasty
// and twice as full on the same step, on seed 10 at step 1,068. Rare, but a
// second banner overwriting the first before it can be read is exactly the bug
// that would make the feature feel broken on the day it is most interesting. So
// the lines come out of here as a *list* and `main.js` shows them one after the
// other.
//
// **And a pond can arrive with a past.** 📂 Load builds a world, hands it a
// saved population and re-latches the ladder against it, so a restored pond
// ticks a family on the step it is loaded and, in the sweep, one to three more
// within six steps of it — a burst of congratulations for things that happened
// before the visitor pressed the button. That is what `SETTLE_STEPS` is for: a
// pond that arrives *mid-life* is catching up with a history nobody watched,
// and catching up is not an event. A pond that arrives newborn, at step zero,
// gets no settling window at all — its first young can land on step 9 and that
// is the most deserved banner on the list.
//
// Determinism: pure observer, and a *stateless* one — the world is never read
// here, only the rows `milestones.js` already computed from it. Nothing in this
// module draws a random number, touches a creature or writes anything a pond
// can see. It cannot: it never receives a world.

import { DEEP_GENERATIONS, DYNASTY_YOUNG } from "./milestones.js";

/**
 * How long a restored pond is given to finish arriving, in steps of its own
 * clock.
 *
 * Every catch-up rung in the save/load sweep landed within **six** steps of the
 * restore, so this is a twelvefold margin on a measurement rather than a guess
 * at one. It is deliberately not a wall-clock second: a pond loaded and left
 * paused should still be silent when it is started, and at 20× a second of
 * arriving is twelve hundred steps of pond.
 */
export const SETTLE_STEPS = 60;

/**
 * What each rung says the moment it is climbed, in the present tense.
 *
 * These are not the ladder's own `done` sentences. A row in the panel is read
 * by somebody scanning six of them and can afford to be a clause; a banner is
 * read once, by somebody who was watching the water, and has to be a sentence
 * that stands on its own. The vocabulary bar is the ladder's — `test/cheer.js`
 * holds these to the same list of words a first-time visitor would not know.
 */
const SAID = Object.freeze({
  young: "the pond has bred, and every animal before this one was put here by the world",
  kill: "something in this water has started hunting its neighbours",
  family: "one bloodline is now big enough to have a name of its own",
  dynasty: `one animal has raised ${DYNASTY_YOUNG} young, which is how a trait spreads`,
  crowd: "this water now holds twice what it was handed",
  deep: `${DEEP_GENERATIONS} generations of descent from the animals this pond began with`,
});

/** Every rung has a line, and no line belongs to a rung that has gone. */
export const CHEER_KEYS = Object.freeze(Object.keys(SAID));

/**
 * The tail of a banner: what to wait for next.
 *
 * A moment is worth having for the one after it, so a banner that ends with the
 * rung just climbed ends the story. The three endings are the three honest
 * states: another rung is ahead, the pond has done everything the list holds,
 * or everything left on the list is forbidden by a rule that is switched off —
 * which the ladder itself already says in the row, and which a banner has to say
 * differently because nobody reading it is looking at the row.
 *
 * The rung being announced is skipped rather than assumed ticked. In the page
 * the ladder is read *after* the latch, so it already reads `done` — but a
 * banner that told a visitor the next thing to wait for was the thing they had
 * just watched happen would be the worst sentence on the page, and it should
 * not depend on the order two lines in `main.js` happen to run in.
 *
 * @param {Array<{key:string, title:string, done:boolean, blocked:boolean}>} rows
 * @param {{key:string}} said the rung this banner is about
 */
function nextUp(rows, said) {
  const rest = rows.filter((r) => r.key !== said.key);
  const next = rest.find((r) => !r.done && !r.blocked);
  if (next) return `Next: ${next.title.toLowerCase()}.`;
  return rest.every((r) => r.done)
    ? "That is the whole ladder."
    : "That is everything this pond's rules allow.";
}

/**
 * One rung's banner: the mark, the rung, what it means, and what is next.
 *
 * Falls back to the row's own sentence for a rung with no line of its own, so a
 * seventh milestone added in a hurry says something true rather than the word
 * `undefined` over the water. `test/cheer.test.js` fails on that day anyway —
 * a fallback is what keeps the page honest between the mistake and the test
 * finding it, not a licence to skip the line.
 *
 * @param {{key:string, mark:string, title:string, why:string}} row
 * @param {Array<{title:string, done:boolean, blocked:boolean}>} rows the ladder
 */
export function cheerLine(row, rows) {
  return `${row.mark} ${row.title} — ${SAID[row.key] || row.why}. ${nextUp(rows, row)}`;
}

/**
 * What the visitor has already been told, for one pond.
 *
 * Built when the page takes up a world and thrown away with it — a watch that
 * outlived its pond would either re-announce a rung on the new one's first step
 * or silence a rung the new pond genuinely climbed, and both are worse than no
 * banner at all. `viewstate.js` owns the lifetime; this owns the rule.
 */
export class CheerWatch {
  /**
   * @param {Array<{key:string, done:boolean}>} rows the ladder as it stands now
   * @param {number} step the pond's own clock as the page takes it up
   */
  constructor(rows, step) {
    /** Rungs that will never be announced: already ticked when this began. */
    this.seen = new Set(rows.filter((r) => r.done).map((r) => r.key));
    /**
     * The step after which a rung counts as news. Zero for a newborn pond —
     * everything it does happens in front of somebody. Later for a restored
     * one, which spends its first few steps re-latching a past that is not an
     * event.
     */
    this.settleUntil = step > 0 ? step + SETTLE_STEPS : 0;
  }

  /**
   * Take in the ladder as it stands, and return whatever is worth saying.
   *
   * A rung is marked seen whether or not it is announced, so a pond that
   * arrives mid-life goes quiet about its past exactly once instead of holding
   * a grudge against it every frame.
   *
   * @param {Array<{key:string, mark:string, title:string, why:string,
   *   done:boolean, blocked:boolean}>} rows
   * @param {number} step the pond's clock now
   * @returns {string[]} banners, in ladder order, oldest rung first
   */
  observe(rows, step) {
    const lines = [];
    for (const row of rows) {
      if (!row.done || this.seen.has(row.key)) continue;
      this.seen.add(row.key);
      if (step > this.settleUntil) lines.push(cheerLine(row, rows));
    }
    return lines;
  }
}
