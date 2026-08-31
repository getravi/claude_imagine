// records.js — the pond's book of records: the best this water has ever done.
//
// Every named readout on this page is about **now**. The cast board (v1.123)
// names the stand-outs currently in the water, the headline says what is
// happening this minute, the inspector describes an animal while you watch it,
// and the obituary — the one backward-looking card here — writes up a single
// death you happened to be present for. `docs/AUTONOMOUS.md` has carried the
// gap for four releases in one sentence: *a role is an instant and a life is
// not.* Nobody remembers that somebody held the longest life for four thousand
// ticks before dying. The first thing anybody asks of an aquarium — who is the
// biggest, who is the oldest, who has had the most young — was nobody's
// surface, because every surface here forgets an animal the moment it sinks.
//
// This is the board that does not forget. Three records, all-time, kept from
// the first tick of the run: the most young one animal has ever raised, the
// fullest this pond has ever been, and the largest family it has ever grown.
//
// **The measurement that designed it, and it removed two rows.** The obvious
// hall of fame is *oldest, biggest, most young*, and two of those three are not
// records at all. Over six default ponds run to six thousand ticks:
//
//   * **The longest life is a ceiling, not an achievement.** The oldest anybody
//     has ever got lands on **4,199 of a possible 4,200 on six seeds of six** —
//     `config.maxAge` minus the tick they die on — and the number moves on
//     *every one of the 4,199 ticks before that*, because the record-holder is
//     simply whoever is currently alive and oldest. A row that increments every
//     tick until it hits a constant in `config.js` and then never moves again
//     is a countdown, and what it counts down to is a fact about the rules
//     rather than about this pond.
//   * **The biggest body is the same thing, one gene over.** Body radius is
//     drawn at birth and never grows, so the all-time maximum is settled by the
//     founders: it is within 0.2 px of its final value **by tick ten** on all
//     six seeds, moves between one and six times in six thousand ticks, and
//     lands exactly on `bodyRadiusMax` on two of them. "The biggest animal this
//     pond has ever grown" is a sentence about the size cap.
//
// So the board keeps the one individual record that is genuinely open — young
// raised, which runs 9–12 over those same runs and is broken 9–12 times — and
// spends the other two rows on the pond itself, where the numbers have no
// ceiling to walk into.
//
// **What the board is for, in one number: 57.0% of the instants that show the
// young row name somebody who is already dead.** That is the whole difference
// between a record and a maximum, and it is the common case rather than a
// curiosity. Everywhere else on this page, a name is a living animal you can
// press and go and look at; here, more than half the time, it is somebody the
// pond buried and has not managed to beat since.
//
// Three rules, the same three the cast board holds itself to:
//
//  1. **A row is a claim, so a row that is not true is not drawn.** A record of
//     three young or a family of two is not a record; both floors are imported
//     from the modules that already own that judgement rather than typed again
//     here.
//  2. **No units and no jargon.** Counts of animals and steps of pond time,
//     which are the two quantities a visitor already has — the second of them a
//     year until v1.135, for the reason written above `recordRows`. There is no
//     tick, no pixel and no lineage in any sentence this module produces, and
//     `test/records.test.js` checks it the way `cast.js`, `obituary.js` and
//     `key.js` are checked.
//  3. **A swatch means *go and find them*.** The colour patch that the cast
//     board, the inspector and the obituary all put beside a name appears here
//     only for a record-holder still in the water, because that is the only
//     row where looking is something a visitor can actually do. A dead holder
//     is named and not coloured.
//
// Determinism: PURE OBSERVER. It reads the books, the tree and the living, and
// writes nothing to any of them; it draws no random number. The keeping of the
// record itself is in `stats.js`, in the pass that already walks every creature
// once a tick — a record has to be taken every tick, since the holder can die
// between two frames, and a board whose contents depended on the frame rate
// would not be a record of anything.

import { PARENT_MIN_CHILDREN, givenName } from "./cast.js";
import { MULLER_MIN_PEAK } from "./phylogeny.js";
import { speciesPlural } from "./speciesnames.js";
import { inspectorSwatch } from "./palette.js";
import { stepsIn } from "./pondclock.js";

/**
 * Young enough to be a record. The cast board's floor for calling somebody a
 * parent, imported rather than retyped: "enough young to be worth a sentence"
 * is one judgement, and two copies of it would be two boards disagreeing about
 * the same animal.
 */
export const YOUNG_MIN = PARENT_MIN_CHILDREN;

/**
 * Members at once before a family is worth a line. The Muller plot's own floor
 * — the tree gives every founder a lineage of its own, so without it "the
 * largest family this pond has grown" is true of a pond that has grown nothing
 * at all.
 */
export const FAMILY_MIN_PEAK = MULLER_MIN_PEAK;

/** The mark each record wears. One per row, and no two the same. */
export const RECORD_MARK = Object.freeze({
  young: "👶",
  crowd: "🌊",
  family: "🌿",
});

/** What each record is called, in the fewest words that still say it. */
export const RECORD_TITLE = Object.freeze({
  young: "Most young",
  crowd: "Biggest crowd",
  family: "Biggest family",
});

/** The attribute a pressable row carries its creature's number in. */
export const RECORD_ID_ATTR = "data-record-id";

/**
 * What the board says when the pond has no records yet.
 *
 * Unlike the cast board's empty line — which v1.123 measured at 0 of 1,044
 * instants on a default world — this one is what every visitor sees first, for
 * as long as the pond has not yet done anything twice. It says so plainly
 * rather than apologising: a pond with no history is the correct state of a
 * pond that started a minute ago.
 */
export const RECORDS_EMPTY =
  "No records yet — this pond is too young to have a best of anything. " +
  "Give it a minute.";

// When a record was set: `pondclock.js`, and the change is v1.135's.
//
// This board said **back in year 3** from v1.124, on the argument that a year
// is a unit a visitor already has and a tick is not. Half of that was right.
// The half that was wrong is that a year here is 2,600 steps — about
// forty-five seconds — so on **31.8% of sampled instants** across twelve seeds
// the crowd row read *back in year 1*, which dates a record to "some time in
// the pond's entire life so far".
//
// It also needed a second sentence for a pond with no seasons ("and the pond
// has not been so full since"), because a pond can fail to have years. It
// cannot fail to have steps, so the special case is gone and every pond gets
// the same clause. Losing a branch is usually the sign that a unit was wrong.

/**
 * The board's rows: plain data, best-known-first, every one of them true.
 *
 * Nothing here holds a creature. The young record is three numbers in the books
 * and an id beside them, and a name is a pure function of that id — so a row can
 * outlive its animal by a thousand ticks without keeping a body alive to say so,
 * which is exactly what this board is for. `main.js` looks the number up in the
 * living when a row is pressed, and shrugs if it is gone.
 *
 * @param {{creatures:Array, stats:object, phylogeny:object}} world
 * @param {object} config
 * @param {Map<number, {plural:string}>|null} [names] the tree's family names
 * @returns {Array<{key:string, icon:string, what:string, why:string, id:number, hue:number|null}>}
 */
export function recordRows(world, config, names = null) {
  const rows = [];
  const stats = world.stats || {};

  // 1. The one record about an individual. The holder's colour comes from the
  //    living rather than from the books: a swatch is an invitation to go and
  //    look, and there is nothing to look at once they are gone.
  const rec = stats.recordYoung;
  const holderId = stats.recordYoungId ?? -1;
  if (rec && rec.children >= YOUNG_MIN) {
    const alive = world.creatures.find((c) => c.id === holderId && !c.dead) || null;
    const young = `${rec.children} young`;
    rows.push({
      key: "young",
      icon: RECORD_MARK.young,
      what: RECORD_TITLE.young,
      why: alive
        ? `${givenName(holderId)} has raised ${young}, and is still in the water`
        : `${givenName(holderId)} raised ${young} — gone now, and unbeaten since`,
      id: alive ? holderId : -1,
      hue: alive ? alive.hue : null,
    });
  }

  // 2. The fullest the water has ever been, once that is more than the pond was
  //    handed. A peak equal to `populationStart` is the founders standing where
  //    they were dropped, which is not something the pond has *done* — the row
  //    waits until the water has been fuller than the day it was made, and that
  //    wait is the only reason a visitor ever sees the empty board. And a peak
  //    that *is* the present moment is a reading rather than a record, so the
  //    row says which of the two it is (28.5% of instants: right now) instead
  //    of quietly implying the first.
  const peak = stats.maxPopEver || 0;
  if (peak > config.populationStart) {
    const now = world.creatures.filter((c) => !c.dead).length;
    rows.push({
      key: "crowd",
      icon: RECORD_MARK.crowd,
      what: RECORD_TITLE.crowd,
      why:
        now >= peak
          ? `${peak} animals at once — and that is right now`
          : `${peak} animals at once, ${stepsIn(stats.maxPopTick || 0)}`,
      id: -1,
      hue: null,
    });
  }

  // 3. The largest family. Read live off the tree, which has kept every
  //    lineage's peak since v1.9 and forgets nobody — so this record needs no
  //    book of its own, and an extinct family holds it exactly as long as
  //    nothing else has been bigger.
  const species = (world.phylogeny && world.phylogeny.species) || [];
  let top = null;
  for (const s of species) {
    if (!top || s.peak > top.peak || (s.peak === top.peak && s.id < top.id)) top = s;
  }
  if (top && top.peak >= FAMILY_MIN_PEAK) {
    const still = top.count || 0;
    rows.push({
      key: "family",
      icon: RECORD_MARK.family,
      what: RECORD_TITLE.family,
      why:
        still > 0
          ? `the ${speciesPlural(names, top.id)}, ${top.peak} at once — ${still} still here`
          : `the ${speciesPlural(names, top.id)}, ${top.peak} at once — none left now`,
      id: -1,
      hue: null,
    });
  }

  return rows;
}

/**
 * What the board depends on, as a string.
 *
 * The content itself, because unlike the cast board there is no id-and-rank
 * pair that stands in for it: a record's sentence changes when its holder dies
 * without the record moving at all, and that is the one change on this board
 * most worth redrawing for.
 *
 * @param {Array<{key:string, why:string}>} rows
 */
export function recordSignature(rows) {
  return rows.map((r) => `${r.key}:${r.why}`).join("|");
}

/**
 * The whole board, as markup for one list container.
 *
 * A row is only a `<button>` when pressing it can do something — that is, when
 * the record-holder is still alive to be watched. The other rows are text, for
 * v1.51's reason read the other way: a control that does nothing is worse than
 * no control, and a listener would announce every line here as pressable when
 * most of them name somebody the pond has buried.
 *
 * @param {Array<{key:string, icon:string, what:string, why:string, id:number, hue:number|null}>} rows
 */
export function recordsHTML(rows) {
  if (rows.length === 0) return `<li class="recempty">${RECORDS_EMPTY}</li>`;
  return rows
    .map((r) => {
      const sw =
        r.hue === null
          ? ""
          : (() => {
              const s = inspectorSwatch(r.hue);
              return `<span class="swatch" style="background:${s.fill};color:${s.glow}"></span>`;
            })();
      const inner =
        `<span class="recmark" aria-hidden="true">${r.icon}</span>` +
        `${sw}<span class="recname">${r.what}</span>` +
        `<span class="recwhy">${r.why}</span>`;
      if (r.id >= 0) {
        return (
          `<li class="recrow"><button type="button" ${RECORD_ID_ATTR}="${r.id}" ` +
          `aria-label="Watch the record holder — ${r.what}: ${r.why}">${inner}</button></li>`
        );
      }
      return `<li class="recrow"><span class="recstill">${inner}</span></li>`;
    })
    .join("");
}
