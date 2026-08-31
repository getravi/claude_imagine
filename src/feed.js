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
// **v1.137 closed the other half.** The animals above were counted alive or
// dead because a dead one had nowhere to lead; `memorial.js` keeps the life
// `obituary.js` writes at the moment of death, so a buried name opens their
// story instead of nothing. That takes the feed's animal lines from 36.6%
// pressable to **100.0%** — 8,402 of 8,402 over the same twelve seeds — and the
// panel as a whole from 26.2% of its lines to **52.9%**. Every name the
// Chronicle prints is now a door: the living ones lead to the water, and the
// rest tell you what happened.
//
// **v1.138 stopped it stuttering.** A champion beats their own record seven
// times for every once they are dethroned, so the panel's best story arrived as
// eight copies of one sentence with a different ordinal in it — 13.3% of the
// lines on screen repeated the line above them. `streak.js` folds a run of those
// into the newest of them plus how long the run has been going, which takes that
// figure to **1.6%** and the panel from a mean of 14.50 lines to 12.88. Nothing
// is dropped: the row says how many lines it stands for and over what stretch,
// and it keeps the newest line's subject, so the press that was on the top of
// the run is the press that is on the summary.
//
// Three rules, all of them borrowed from panels that got here first:
//
//  1. **A row is a control exactly when pressing it would do something**
//     (v1.51, restated by v1.133). A line about a pond, a lineage already
//     extinct or an animal this pond has no life written for keeps the shape it
//     had, in a `span`, so every row sits on the same grid and nothing moves
//     when a subject dies. A control that does nothing is worse than no
//     control.
//  2. **One promise per mechanism, and no more.** The two presses that put
//     something in the *water* share the ladder's `👀 Show me`, because they do
//     the same thing to a reader; that one selects an animal and the other
//     lights up a lineage is an implementation detail. The press that opens a
//     card is a different promise and wears `📖 Their story`, because a control
//     that says *Show me* and then shows no pond is a control that lied — which
//     is the same defect as one that does nothing.
//  3. **A row holds numbers, not references** (v1.119's rule, `whoswho.js`).
//     Nothing here keeps a creature or a species object alive; the caller looks
//     the id up in the living at the moment of the press and shrugs if it is
//     gone. A row that outlives its subject by a frame names a body the world
//     has already buried rather than holding one.
//
// Determinism: this module reads events and returns strings. It draws nothing,
// touches no world and takes no random number.

import { WATCH_LABEL } from "./milestones.js";
import { STORY_LABEL } from "./memorial.js";
import { stepsIn } from "./pondclock.js";
import { eventWho } from "./chronicle.js";
import { streakMsg, streakRuns } from "./streak.js";

/** Marks the button that leads to an animal; carries the creature id. */
export const FEED_WHO_ATTR = "data-feed-who";
/** Marks the button that lights up a lineage; carries the species id. */
export const FEED_SP_ATTR = "data-feed-sp";
/** Marks the button that reads out a life; carries the creature id (v1.137). */
export const FEED_STORY_ATTR = "data-feed-story";

/** What the panel says before the pond has done anything worth saying. */
export const FEED_EMPTY = "The pond is young. Its story will appear here…";

/**
 * The feed's rows: plain data, newest first, one per line on screen.
 *
 * One per *event* until v1.138, and the difference is the streak: a run of the
 * same sentence about the same animal is one row that says the newest of them.
 * `streak.js` owns which lines those are and how the summary reads; what
 * happens here is that the row takes its subject, its date and its press from
 * the newest line of the run, which is the only one of them still current.
 *
 * @param {Array<{tick:number, icon:string, cat:string, msg:string, who:number,
 *   sp:number}>} events oldest first, as the chronicle keeps them
 * @param {{alive?:(id:number)=>boolean, familyHere?:(id:number)=>boolean,
 *   familyName?:(id:number)=>string, remembered?:(id:number)=>boolean}} lookups
 *   the pond as it stands now, and the book of the dead beside it
 * @returns {Array<{tick:number, when:string, icon:string, cat:string,
 *   who:number, sp:number, told:number, name:string, msg:string, kind:string,
 *   live:boolean, count:number, key:string, paint:string, line:string,
 *   action:string, label:string, fresh:boolean}>}
 */
export function feedRows(events, lookups = {}) {
  const alive = lookups.alive || (() => false);
  const familyHere = lookups.familyHere || (() => false);
  const familyName = lookups.familyName || (() => "");
  const remembered = lookups.remembered || (() => false);
  const rows = [];
  for (const run of streakRuns(events)) {
    const e = run.event;
    const name = eventWho(e);
    // The page's one clock (v1.135). This column read `t244 · yr1` for a
    // hundred and thirty-four releases; `pondclock.js` has the argument.
    const when = stepsIn(e.tick);
    // Which subject a line has decides which of the three presses it offers,
    // and an event never has both kinds of subject: `_push` takes one or the
    // other. The order matters: an animal still in the water is somebody you
    // can go and *see*, and a life to read is what is left when they are not.
    const watchable = e.who >= 0 && alive(e.who);
    const tellable = e.who >= 0 && !watchable && remembered(e.who);
    const highlightable = e.sp >= 0 && familyHere(e.sp);
    // Which control this row is, as one word — not merely *whether* it is one.
    // The distinction is the whole of v1.137's plumbing: an animal dying used
    // to turn a button into a span, which a boolean caught, and now turns a
    // *Show me* into a *Their story*, which it does not. A panel that patches
    // itself has to be told the difference or it leaves the offer to walk over
    // to a body that is no longer there.
    const kind = watchable ? "watch" : tellable ? "story" : highlightable ? "family" : "";
    // What the row says. A run of one says what its event said; a run of more
    // says the newest of them and then how long the run has been going.
    const msg = run.count > 1 ? streakMsg(e.msg, run.count, run.span) : e.msg;
    // The line as one spoken sentence, for the accessible name of the button —
    // which replaces its contents rather than adding to them, so a label of
    // "Watch Cove" would hand a listener the verb and take the story away.
    const line = `${when}. ${name ? `${name} ` : ""}${msg}`;
    const label = kind === "" ? "" : tellable ? STORY_LABEL : WATCH_LABEL;
    rows.push({
      tick: e.tick,
      when,
      icon: e.icon,
      cat: e.cat,
      who: watchable ? e.who : -1,
      sp: highlightable ? e.sp : -1,
      told: tellable ? e.who : -1,
      name,
      msg,
      kind,
      live: kind !== "",
      /** How many of the chronicle's lines this row stands for. */
      count: run.count,
      // Which line this *is*, taken from the **oldest** member of the run — the
      // one thing about a streak that does not move when it grows. Keyed on the
      // newest, a champion going again would replace the row at the top of the
      // panel with a stranger, and a panel that cannot recognise its own head
      // rebuilds itself from scratch — which is v1.136's finding, that a
      // rebuilt row is a press the browser throws away.
      key: `${run.first.tick}|${run.first.msg}`,
      // Everything the markup below is made of, as one string. A row used to
      // change in exactly one way while staying the same line — a subject dying
      // — and its `kind` was enough to notice. A streak growing changes the date
      // and the sentence too, so what the caller compares is now the whole
      // painted row rather than a field of it: v1.137's note said a boolean is
      // only as good as the number of states its subject has, and the answer to
      // that is to stop counting states.
      paint: `${kind}|${line}|${label}`,
      line,
      action: watchable
        ? `Watch ${name}`
        : tellable
          ? `What became of ${name}`
          : highlightable
            ? `Show the ${familyName(e.sp)} in the pond`
            : "",
      // The words on the offer itself. Two of the three presses put the thing
      // the sentence is about into the water and share the ladder's promise;
      // the third opens a card, and says so — see `STORY_LABEL`.
      label,
      // The newest line, which the panel flashes in. Not the newest *event* —
      // the pond does two things on one step often enough to matter (v1.135
      // measured 7.4% of adjacent lines sharing a step) and the animation is
      // about a line arriving, not about a step turning over.
      fresh: rows.length === 0,
    });
  }
  return rows;
}

/**
 * One line's identity: what makes it *that* line rather than a redraw of it.
 *
 * Not whether it is a control, and since v1.138 not what it says either — a
 * streak keeps its identity while its sentence and its date both change, which
 * is the point. Both of those are things about a row that move while the row
 * stays the same line, and telling those apart from a *new* line is the whole
 * reason this exists. The caller uses it to work out how many lines have
 * arrived since the last frame, so it can leave the rest of the panel alone.
 *
 * @param {{key:string}} row a row from `feedRows`, which is where the answer
 *   is worked out — a run knows where it started and a row on its own does not
 */
export function feedLineKey(row) {
  return row.key;
}

/**
 * What the feed depends on, as a string.
 *
 * The length and the newest line, as before — and now, per row, *which kind of
 * control it is*. That is the one piece of state on this panel that changes
 * without a line being written: an animal dies and a button three rows down has
 * to stop offering to walk over to them. Not who it points at, which never
 * moves once written.
 *
 * It was a boolean until v1.137 gave the panel a third kind of press, at which
 * point *is this a control* stopped being enough — a death now turns a
 * `👀 Show me` into a `📖 Their story` rather than into a plain sentence, and a
 * signature that only counted controls would have held both frames identical
 * and left the offer pointing at an empty pond.
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
  // Per row: which control it is, and — since v1.138 — how many lines it stands
  // for. A streak that grows moves the newest line's own text and is caught
  // above; a streak at the *bottom* shrinks silently as the chronicle's buffer
  // drops its oldest member, which changes what a row says without changing the
  // number of rows or the head of the list. It takes a feed of 140 lines to see
  // that and a mean pond writes 14, so this is a character against a rare day
  // rather than a cost anybody pays.
  for (const r of rows) sig += (r.kind === "" ? "-" : r.kind[0]) + (r.count > 1 ? `+${r.count}` : "");
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
        const attr =
          r.who >= 0
            ? `${FEED_WHO_ATTR}="${r.who}"`
            : r.told >= 0
              ? `${FEED_STORY_ATTR}="${r.told}"`
              : `${FEED_SP_ATTR}="${r.sp}"`;
        return (
          `<li class="${cls}"><button type="button" class="c-row" ${attr} ` +
          `aria-label="${r.line} ${r.action}.">${inner}` +
          `<span class="c-go" aria-hidden="true">${r.label}</span></button></li>`
        );
      }
      return `<li class="${cls}"><span class="c-row">${inner}</span></li>`;
    })
    .join("");
}
