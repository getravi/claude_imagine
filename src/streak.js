// streak.js — when the same thing keeps happening, say so once.
//
// Three cycles running, this project's own notes have ended with the same
// complaint about the panel a visitor actually sits and reads:
//
//   > **the champion streak reads like a log file** — eight *Onyx raises their
//   > Nth* in a row, and the fix is not fewer controls, it is a narrator that
//   > summarises a streak.
//
// This is that narrator. A run of adjacent Chronicle lines that are the same
// sentence about the same animal becomes **one** line, which says the newest
// fact and then how long the run has been going:
//
//     👶  3,283 steps in   Onyx raises their 10th.
//     👶  3,366 steps in   Onyx raises their 11th.          →  one line
//     👶  3,545 steps in   Onyx raises their 12th.
//
//     👶  3,545 steps in   Onyx raises their 12th — 6 times in a row,
//                          over 847 steps.
//
// **What the measurement said.** Twelve seeds, six thousand steps, sampled
// every fifty — the feed as a reader would find it, not as it ends:
//
//   - **13.3%** of adjacent lines on screen were the same sentence as the line
//     above them. Afterwards, **1.6%**.
//   - **11.1%** of all lines fold away (2,286 of 20,541), and the panel goes
//     from a mean of **14.50** lines to **12.88**.
//   - **58.3%** of sampled instants have at least one streak on screen.
//   - The longest run is **six**: seed 80808's champion takes the record from
//     their 7th young to their 12th across 847 steps, six lines that differ by
//     one word.
//
// Three rules, and the second is the one I would not have guessed.
//
//  1. **A streak is one subject doing one thing.** Same category, same animal,
//     same sentence — adjacent, so nothing is ever reordered and no line is
//     lifted over another. The panel stays a chronicle; it just stops stuttering.
//
//  2. **Only somebody can be on a streak.** The obvious rule — group lines that
//     read alike — quietly collapsed the pond's own milestones: *The pond swells
//     past 100 creatures* and *…past 200 creatures* are one sentence shape and
//     **170 adjacent pairs** over the sweep, and a summary of them would print
//     the 200 and swallow the 100. Those are two different facts wearing one
//     sentence, where a champion's tally is one fact restated. So the run needs
//     a `who`: a lineage is a population and the pond is everybody, and neither
//     of them is *somebody again*.
//
//  3. **A shape, not a prefix.** The sentence is compared with its numbers
//     blanked out, so *raises their 11th* and *raises their 12th* are the same
//     line and *is the first animal here to raise 5 young* is not. That line is
//     the interesting one in the run — the moment a pond first had a champion —
//     and a rule that grouped by subject alone would have folded it into the
//     tally under it. The naive rule folds 17.3% of lines; this one folds 11.1%,
//     and the difference is entirely lines worth keeping.
//
// Determinism: this module takes an array of events and returns groups of them.
// It reads no world, draws nothing and takes no random number.

import { stepsOver } from "./pondclock.js";

/**
 * Lines that must run together before they are worth summarising.
 *
 * Two, and it was nearly three. A run of three is unambiguously a log file and
 * a run of two is only a repetition — but the sweep is blunt about the cost of
 * the tighter rule: at three, **half the seeds never fold a single line**, and
 * one of them is seed 314, the default pond that every screenshot and the
 * landing page use. A feature the front door never shows is a feature nobody
 * has. At two, seed 314 folds 15.4% of its lines and three seeds in twelve
 * still never see one, which is the honest floor: some ponds simply never have
 * a champion who goes twice.
 */
export const STREAK_MIN = 2;

/**
 * A sentence with its numbers blanked, so two tallies of the same thing match.
 *
 * The ordinal suffix goes with the digits — *11th* and *12th* have to reduce to
 * the same token or the rule never fires on the one line it was written for.
 * Grouped digits (`1,200`) reduce too, because `stepsIn` writes them that way
 * and a narrator that only understood bare integers would be a rule with a
 * blind spot the day somebody formats a number.
 *
 * @param {string} msg the event's own words
 * @returns {string} the same sentence with every number as `#`
 */
export function lineShape(msg) {
  return msg.replace(/\d[\d,]*(?:st|nd|rd|th)?/g, "#");
}

/**
 * Whether two events are the same line about the same somebody.
 *
 * Exported because the rule is the feature: a test that checked folding by
 * running a pond would be measuring the pond, and this is the sentence the
 * design turns on.
 *
 * @param {{cat:string, who:number, msg:string}} a
 * @param {{cat:string, who:number, msg:string}} b
 */
export function sameStreak(a, b) {
  return a.who >= 0 && a.who === b.who && a.cat === b.cat && lineShape(a.msg) === lineShape(b.msg);
}

/**
 * The chronicle's events, grouped into runs, newest first.
 *
 * One group per line the panel should show. A group of one is an ordinary
 * event and carries `count: 1`; a group of more is a streak, and `event` is
 * the **newest** of them because that is the fact a reader wants — the champion
 * is on their 12th, not their 7th — while `first` is where the run started and
 * is what gives the row an identity that survives the run growing.
 *
 * @param {Array<{tick:number, cat:string, msg:string, who:number}>} events
 *   oldest first, as the chronicle keeps them
 * @returns {Array<{event:object, first:object, count:number, span:number}>}
 *   newest first, as the feed shows them
 */
export function streakRuns(events) {
  const runs = [];
  for (let i = events.length - 1; i >= 0; ) {
    const newest = events[i];
    let j = i - 1;
    while (j >= 0 && sameStreak(newest, events[j])) j--;
    // `j` is now one past the oldest member, walking backwards.
    const oldest = events[j + 1];
    const count = i - j;
    runs.push(
      count >= STREAK_MIN
        ? { event: newest, first: oldest, count, span: newest.tick - oldest.tick }
        : { event: newest, first: newest, count: 1, span: 0 }
    );
    i = count >= STREAK_MIN ? j : i - 1;
  }
  return runs;
}

/**
 * The streak as one sentence: the newest line, and then the run behind it.
 *
 * **The tally is the tail and never the head.** *Onyx raises their 12th* is
 * what happened; *6 times in a row* is context for it, and a line that led with
 * the context would have made the reader work through a summary to reach the
 * event. The panel's other sentences all start with the thing that happened.
 *
 * *twice* rather than *2 times*, because English has a word for it and the
 * commonest run is exactly two — 1,030 of the sweep's 1,579 runs, so the case
 * that reads worst is the case a visitor meets most. Larger counts stay in
 * digits: this panel writes *300 creatures* and *their 12th*, and a lone
 * spelled-out number in a column of figures is a second dialect.
 *
 * The span is dropped when it is zero. Nothing in today's pond can streak
 * inside one step — a record only moves upward, once per tick — but *twice in
 * a row, over 0 steps* is the sentence a narrator writes the day something
 * does, and a clause that can print a lie is worth two lines to prevent.
 *
 * @param {string} msg the newest line's own words, full stop and all
 * @param {number} count how many lines the row stands for
 * @param {number} span steps from the first of them to the last
 * @returns {string} one sentence, ready to sit where `msg` sat
 */
export function streakMsg(msg, count, span) {
  const times = count === 2 ? "twice" : `${count} times`;
  const over = span > 0 ? `, over ${stepsOver(span)}` : "";
  // The event's own full stop comes off and goes back on the end, so the clause
  // lands inside the sentence rather than after it.
  return `${msg.replace(/\.$/, "")} — ${times} in a row${over}.`;
}
