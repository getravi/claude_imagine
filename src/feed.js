// feed.js — the Chronicle, as something you can press.
//
// The story panel has been the most readable thing on this page since v1.3 and
// the most inert. Every other board here learned to point at the water — the
// cast list in v1.119, the record book in v1.124, the plates over the animals
// in v1.127, the ladder in v1.133 — and the one panel a visitor actually sits
// and *reads* stayed a wall of text. v1.125 even put a name in it, in bold, in
// its own element, which is what a link looks like. Nothing happened when you
// pressed it, for eleven releases.
//
// This is that closed. A line about somebody still in the water goes and finds
// them; a line about a family that still has members lights that family up in
// the pond; every other line stays a statement.
//
// **The finding is that the Chronicle has two kinds of subject and they decay
// at completely different rates.** Twelve seeds, six thousand steps, sampled
// every fifty:
//
//   - **53.6%** of the lines on screen are about somebody or some family at all.
//   - Of the lines about an *animal*, **36.6%** name one still alive.
//   - Of the lines about a *family*, **94.3%** name one that still has members.
//   - Together: **51.0%** of the lines with a subject are pressable, **27.4%**
//     of every line, a mean of **3.63** live controls on screen (max 14), and
//     **79.2%** of sampled instants hold at least one.
//
// A family is nearly three times as durable a thing to point at as an animal,
// which is obvious once written down and was not obvious before: an animal is
// one body with a death in its future, and a lineage is a population that has
// to lose every member at once. It is the difference between the two that makes
// this feature work — animals alone would have left the panel dead four
// instants in five.
//
// **And it reverses the default pond.** With only the animals, seed 314 — the
// world every screenshot and the landing page use, and the one I look at every
// cycle — was the *worst* of twelve at 20.0% of instants with anything to
// press. With families it is the **best, at 93.3%**. This project's own note
// says the world I look at every cycle is a sample of one and not a random one;
// here it was a sample of one that would have talked me out of the feature.
//
// **Pressability decays down the column, and that is the right way round.** The
// feed is newest-first, and a line's subject survives as a function of the
// line's age: **97.9%** pressable under 200 steps, **93.4%** at 200–600,
// **71.6%** at 600–1,500, **32.1%** beyond. So the top of the panel is people
// and families you can go and see, and the bottom is history — which is what a
// reader would guess a story feed meant anyway, arrived at by measurement.
//
// Three rules, all of them borrowed from panels that got here first:
//
//  1. **A row is a control exactly when pressing it would do something**
//     (v1.51, restated by v1.133). A line about a pond, an animal already
//     buried or a lineage already extinct keeps the shape it had, in a `span`,
//     so the two kinds of row sit on the same grid and nothing moves when a
//     subject dies. A control that does nothing is worse than no control.
//  2. **One promise, two mechanisms.** Both kinds of pressable line wear the
//     ladder's `👀 Show me`, because both do the same thing to a reader — they
//     put the thing the sentence is about on the screen. That one of them
//     selects an animal and the other highlights a lineage is an implementation
//     detail, and a panel that grew a second verb would be asking a visitor to
//     learn a vocabulary to read a story.
//  3. **A row holds numbers, not references** (v1.119's rule, `whoswho.js`).
//     Nothing here keeps a creature or a species object alive; the caller looks
//     the id up in the living at the moment of the press and shrugs if it is
//     gone. A row that outlives its subject by a frame names a body the world
//     has already buried rather than holding one.
//
// Determinism: this module reads events and returns strings. It draws nothing,
// touches no world and takes no random number.

import { WATCH_LABEL } from "./milestones.js";
import { stepsIn } from "./pondclock.js";
import { eventWho } from "./chronicle.js";

/** Marks the button that leads to an animal; carries the creature id. */
export const FEED_WHO_ATTR = "data-feed-who";
/** Marks the button that lights up a lineage; carries the species id. */
export const FEED_SP_ATTR = "data-feed-sp";

/** What the panel says before the pond has done anything worth saying. */
export const FEED_EMPTY = "The pond is young. Its story will appear here…";

/**
 * The feed's rows: plain data, newest first, one per event.
 *
 * @param {Array<{tick:number, icon:string, cat:string, msg:string, who:number,
 *   sp:number}>} events oldest first, as the chronicle keeps them
 * @param {{alive?:(id:number)=>boolean, familyHere?:(id:number)=>boolean,
 *   familyName?:(id:number)=>string}} lookups the pond as it stands now
 * @returns {Array<{tick:number, when:string, icon:string, cat:string,
 *   who:number, sp:number, name:string, msg:string, live:boolean,
 *   line:string, action:string, fresh:boolean}>}
 */
export function feedRows(events, lookups = {}) {
  const alive = lookups.alive || (() => false);
  const familyHere = lookups.familyHere || (() => false);
  const familyName = lookups.familyName || (() => "");
  const rows = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const name = eventWho(e);
    // The page's one clock (v1.135). This column read `t244 · yr1` for a
    // hundred and thirty-four releases; `pondclock.js` has the argument.
    const when = stepsIn(e.tick);
    // Which subject a line has decides which of the two presses it offers, and
    // an event never has both: `_push` takes one or the other.
    const watchable = e.who >= 0 && alive(e.who);
    const highlightable = e.sp >= 0 && familyHere(e.sp);
    rows.push({
      tick: e.tick,
      when,
      icon: e.icon,
      cat: e.cat,
      who: watchable ? e.who : -1,
      sp: highlightable ? e.sp : -1,
      name,
      msg: e.msg,
      live: watchable || highlightable,
      // The line as one spoken sentence, for the accessible name of the button
      // — which replaces its contents rather than adding to them, so a label of
      // "Watch Cove" would hand a listener the verb and take the story away.
      line: `${when}. ${name ? `${name} ` : ""}${e.msg}`,
      action: watchable
        ? `Watch ${name}`
        : highlightable
          ? `Show the ${familyName(e.sp)} in the pond`
          : "",
      // The newest line, which the panel flashes in. Not the newest *event* —
      // the pond does two things on one step often enough to matter (v1.135
      // measured 7.4% of adjacent lines sharing a step) and the animation is
      // about a line arriving, not about a step turning over.
      fresh: i === events.length - 1,
    });
  }
  return rows;
}

/**
 * One line's identity: what makes it *that* line rather than a redraw of it.
 *
 * Not whether it is a control — that is the one thing about a row that changes
 * while the row stays the same line, and telling those two apart is the whole
 * reason this exists. The caller uses it to work out how many lines have
 * arrived since the last frame, so it can leave the rest of the panel alone.
 *
 * @param {{tick:number, msg:string}} row
 */
export function feedLineKey(row) {
  return `${row.tick}|${row.msg}`;
}

/**
 * What the feed depends on, as a string.
 *
 * The length and the newest line, as before — and now, per row, *whether it is
 * a control*. That is the one piece of state on this panel that changes without
 * a line being written: an animal dies and a button three rows down has to stop
 * being a button. Not who it points at, which never moves once written.
 *
 * The cost is measured, because this project has a habit of guessing at "would
 * this be too much?" and being wrong. Over twelve seeds sampled every fifty
 * steps the key moves on **16.5%** of samples — about a fifth of the sampled
 * frames rebuild a list that is a mean of twenty lines long, and the rest
 * return on the first comparison.
 *
 * @param {ReturnType<typeof feedRows>} rows
 */
export function feedSignature(rows) {
  let sig = rows.length + "|";
  const newest = rows[0];
  if (newest) sig += newest.tick + newest.msg + newest.who + newest.sp + "|";
  for (const r of rows) sig += r.live ? "1" : r.who >= 0 || r.sp >= 0 ? "0" : "-";
  return sig;
}

/**
 * The whole feed, as markup for one list container.
 *
 * The row's contents are identical either way — the same three spans in the
 * same order — so a subject dying swaps a `button` for a `span` and moves no
 * text. The mark is `aria-hidden`, because the sentence beside it says the same
 * thing in words, and `👀 Show me` is hidden for the ladder's reason: *Show me*
 * names nobody, and the button's accessible name has already said who.
 *
 * **A button's accessible name replaces its contents, it does not precede
 * them**, so the label is the whole line and then the verb — *"1,004 steps in.
 * Cove raises their 12th. Watch Cove."* A label of "Watch Cove" on its own,
 * which is what the ladder can afford because its rows are captions, would hand
 * a listener the control and take the story away.
 *
 * @param {ReturnType<typeof feedRows>} rows
 */
export function feedHTML(rows) {
  if (rows.length === 0) return `<li class="chronicle-empty">${FEED_EMPTY}</li>`;
  return rows
    .map((r) => {
      const said = r.name ? `<b class="c-who">${r.name}</b> ${r.msg}` : r.msg;
      const inner =
        `<span class="c-icon" aria-hidden="true">${r.icon}</span>` +
        `<span class="c-when">${r.when}</span><span class="c-msg">${said}</span>`;
      const cls = `cat-${r.cat}${r.fresh ? " fresh" : ""}`;
      if (r.live) {
        const attr = r.who >= 0 ? `${FEED_WHO_ATTR}="${r.who}"` : `${FEED_SP_ATTR}="${r.sp}"`;
        return (
          `<li class="${cls}"><button type="button" class="c-row" ${attr} ` +
          `aria-label="${r.line} ${r.action}.">${inner}` +
          `<span class="c-go" aria-hidden="true">${WATCH_LABEL}</span></button></li>`
        );
      }
      return `<li class="${cls}"><span class="c-row">${inner}</span></li>`;
    })
    .join("");
}
