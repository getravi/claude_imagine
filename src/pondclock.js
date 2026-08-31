// pondclock.js — the one way this page says *when*.
//
// Three surfaces here date an event, and until v1.135 each of them said it in
// its own dialect:
//
//     the ladder        1,724 steps in
//     the record board  312 animals at once, back in year 1
//     the Chronicle     t244 · yr1
//
// One page, one pond, one clock, three answers — and the third of them is the
// engine's own variable name with a `t` in front of it, on the panel a visitor
// is most likely to actually *read*. `records.js` has banned the word "tick"
// from a visitor's sentence since v1.124 and `milestones.js` since v1.131;
// the Chronicle has been showing them the number itself since v1.3.
//
// **The year is the wrong unit for dating a thing that happened, and there are
// numbers.** A year here is `config.seasonLength` — 2,600 steps, about
// forty-five seconds at the speed the page opens on. Over twelve seeds run six
// thousand steps:
//
//   - **91.8%** of adjacent Chronicle lines carry the same year stamp as the
//     line above them (224 of 244 pairs). A column that repeats itself nine
//     times in ten is not dating anything; it is decoration that looks like
//     data.
//   - **56.3%** of all lines ever written say `yr1`.
//   - A pond's *entire* feed sits inside a single year until step **2,601**
//     (median of twelve; 2,501–3,401), which is longer than most visits.
//   - The record board's crowd row reads "back in year 1" on **31.8%** of
//     sampled instants.
//   - Over those same runs the year takes **two or three** distinct values
//     while the step takes one per line.
//
// This is v1.131's finding arriving on the two panels it named. The ladder
// wrote it down at the time — *the clock this project reaches for by habit is
// one tick wide for the only panel that needed it to be finer* — and then left
// the fix in one function in one module, where the next surface could not
// find it. So the function moves here and the other two read it.
//
// **Why the step and not the year.** The step is the number that actually
// varies, it exists in every pond, and it is already the page's own word for
// it — the keyboard hint under the buttons says `step`, not `tick`. A *year*
// is a thing a pond can fail to have: switch seasons off and there are none,
// which is why the record board used to carry a second sentence for that case
// ("and the pond has not been so full since") and now carries one sentence for
// every pond. Losing a special case is usually a sign the unit was wrong.
//
// **Why "1,724 steps in" and not "at step 1,724".** v1.131 chose this against a
// browser, and the reason holds everywhere: the first is how a person says an
// elapsed time, the second is a coordinate. A chronicle is a list of elapsed
// times.
//
// The year does not go away — it is simply no longer how anything is *dated*.
// `yearOf` is still the one piece of arithmetic behind the season badge over
// the water ("Winter · year 1"), which is a statement about *now* rather than
// about when something happened, and behind the year the Chronicle keeps in
// its own event records for anything that wants it. That arithmetic had been
// written out by hand in three separate modules, each with a comment worrying
// about the other two disagreeing; there is one copy now.
//
// Determinism: nothing here reads the world, writes to it, or draws a random
// number. Two pure functions of a number and a config field.

/**
 * The year a tick falls in, or 0 in a pond with no seasons.
 *
 * The one copy. `chronicle.js` has counted years off `seasonLength` since
 * v1.3, `describe.js` since v1.17 and `records.js` since v1.124, and all three
 * wrote `Math.floor(tick / config.seasonLength) + 1` out by hand — the second
 * of them under a comment observing that "two surfaces saying 'year 2' about
 * different years is the shape this project keeps finding on the wrong side of
 * a bug", which is exactly right and was, at the time, an argument for
 * importing rather than for copying carefully.
 *
 * Zero rather than 1 when seasons are off, because a pond without seasons is
 * not in its first year — it has no years at all, and a caller that wants to
 * say so needs to be able to tell the difference.
 *
 * @param {number} tick
 * @param {{seasons:boolean, seasonLength:number}} config
 * @returns {number} the year, counting from 1, or 0 in a pond with no seasons
 */
export function yearOf(tick, config) {
  return config.seasons ? Math.floor(tick / config.seasonLength) + 1 : 0;
}

/**
 * When something happened, in the pond's own unit: `"1,724 steps in"`.
 *
 * Grouped digits, because a bare `1724` in a column of them is a number a
 * reader has to count the places of; the singular for the one pond in a
 * thousand whose first event lands on step one.
 *
 * @param {number} tick the step the thing happened on
 * @returns {string} a clause, no full stop, safe in the middle of a sentence
 */
export function stepsIn(tick) {
  return `${tick.toLocaleString()} ${tick === 1 ? "step" : "steps"} in`;
}
