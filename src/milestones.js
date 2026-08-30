// milestones.js — the six things a pond does as it grows up, and how far this
// one has got.
//
// Every legible surface this project has built points backwards or at the
// present tense. `headline.js` says what is happening right now. `whoswho.js`
// names who is worth watching right now. `evolved.js` says how far the animals
// have moved from the ones the pond was handed. `records.js` keeps the best
// this water has ever done, and the Chronicle is a log of things that have
// already finished happening. The tour (v1.129) walks a newcomer round all of
// them and explains what each one *is*.
//
// Not one of them tells a visitor **what to wait for**.
//
// That is the whole of what an aquarium asks of a person — stay a bit longer,
// something is about to happen — and this page has never made the promise out
// loud. A reader who arrives at a two-minute-old pond is shown a record book
// that says *no records yet*, a cast board of animals that all look the same,
// and a Muller plot with one band in it. Everything on the page is honest and
// the honest reading of all of it together is **nothing has happened here**,
// which is exactly wrong: the pond is nine ticks from its first birth and four
// hundred from its first family.
//
// So: a ladder. Six things, in the order a pond does them, each one either
// ticked with how far in it happened or still ahead with the number it is
// currently standing at. The unticked rows are the point. A checklist is the
// most widely understood thing in interface design and this page — dense,
// instrumented, proud of its figures — has never had one.
//
// **The sweep that chose the rungs: 12 seeds, 6,000 ticks, first-occurrence
// tick of fifteen candidates.** Three findings, and two of them deleted rows.
//
//   * **A rung that lands on a constant is a fact about `config.js`.** This is
//     `records.js`'s v1.124 lesson arriving one panel over, and it killed the
//     two rows I most wanted. *The founders are all gone* reads **4,200 on
//     eleven seeds of twelve** and *somebody dies of old age* reads the same
//     number, because both are `maxAge` and neither is something the pond did.
//     *The pond reaches year two* is 2,600 on twelve of twelve, which is a
//     clock. A milestone has to be able to arrive early on a lucky pond.
//   * **A rung nobody reaches is a wall.** *Twenty generations* fires on
//     **0 of 12** inside six thousand ticks. A ladder whose top rung is
//     unreachable is not encouraging, it is a scoreboard of failure.
//   * **The first thing that happens to anybody here is being eaten.** The
//     first death and the first kill land on the *same tick* on **11 of 12
//     seeds** — the pond's opening event is a predation, not a starvation, and
//     nothing on this page has ever said so. It is why the kill is rung two.
//
// The six milestones that survived, by median first tick over those twelve
// ponds: first young **74**, first kill **66**, a family takes hold **458**,
// a dynasty **1,004**, twice as full **1,724**, ten generations deep **3,070**.
// Every one of them fires on 12 of 12, and the spread inside each is wide
// enough that the ladder is about *this* pond and not about the rules — first
// young ranges 9–120, ten generations 2,105–5,093. At the default speed that is
// a rung at about one second, two, eight, seventeen, twenty-nine and fifty-one:
// the whole ladder inside the first minute somebody watches.
//
// The two openers are ordered on the *mean* rather than the median, and the
// reason is the third finding above wearing a number: the first kill's median
// is 66 against the first birth's 74, but its mean is 128 against 62, because
// a pond either eats somebody in the first twenty steps or takes three hundred.
// A birth is a threshold everybody crosses at about the same time; a killing is
// a coincidence.
//
// **A fourth finding, and it came from the screenshot rather than the sweep.**
// The dates were written in *years*, because that is the clock every other
// backward-looking surface here uses, and thirty seconds of a default pond drew
// **reached in year 1** five times down one column. See `whenReached`: the whole
// ladder is climbed inside a single one of this world's years, so the habit was
// a unit one tick wide for the only panel that needed a finer one. Fifteen green
// tests said nothing about it.
//
// Determinism: PURE OBSERVER, and latched on the world's clock rather than the
// browser's. Every predicate reads a monotone quantity the books or the tree
// already keep, so *whether* a rung is reached could be recomputed from
// scratch at any frame rate — but *when* could not, and a readout whose value
// depends on how fast a laptop paints is not a reading of this pond. So
// `Milestones.observe` runs inside `World.step`, next to the Chronicle's, and
// draws no random number, touches no creature and writes nothing but its own
// six integers.

import { MULLER_MIN_PEAK } from "./phylogeny.js";

/**
 * Members at once before a bloodline counts as a family. The Muller plot's own
 * floor, imported rather than retyped for `records.js`'s reason: the tree gives
 * every founder a lineage of its own, so a lower number would tick this rung on
 * the day the pond was made.
 */
export const FAMILY_MIN_PEAK = MULLER_MIN_PEAK;

/**
 * Young from one animal before it is a dynasty. Higher than the cast board's
 * four, deliberately — the board is picking somebody worth a sentence out of
 * the pond as it stands, and this is a rung that should take a while. The sweep
 * puts it at a median of 1,004 ticks, between the family and the crowd.
 */
export const DYNASTY_YOUNG = 5;

/** Generations of descent before the ladder calls the pond deep. */
export const DEEP_GENERATIONS = 10;

/** How full, as a multiple of what the pond was handed, before it has doubled. */
export const CROWD_MULTIPLE = 2;

/**
 * The largest a bloodline has ever been, read live off the tree.
 *
 * The tree has kept every lineage's peak since v1.9 and forgets nobody, so this
 * needs no book of its own and an extinct family ticks the rung exactly as well
 * as a living one — which is right: the pond *did* grow a family, and it losing
 * it later does not un-happen.
 */
function largestFamilyEver(world) {
  const species = (world.phylogeny && world.phylogeny.species) || [];
  let peak = 0;
  for (const s of species) if (s.peak > peak) peak = s.peak;
  return peak;
}

/**
 * The six rungs, in the order a pond climbs them.
 *
 * `reached` is a predicate on latched state only — a counter that never goes
 * down, a maximum the books keep, a peak on the tree. That is what makes the
 * latch below safe: a rung cannot un-happen between two ticks, so the first
 * tick it reads true is the tick it happened on, and no rung needs the world to
 * remember anything the world was not already remembering.
 *
 * `standing` is what the row says while the rung is still ahead. It is a live
 * number wherever there is one, because "the busiest parent so far has raised
 * three" is a reason to keep watching and "not yet" is a reason to leave.
 *
 * `blocked` is the one honest way a rung can be unreachable: a rule switched
 * off. Only the kill has one — every other rung is something a pond does under
 * any settings this page offers.
 */
export const MILESTONES = Object.freeze(
  [
    {
      key: "young",
      mark: "👶",
      title: "The first young",
      reached: (w) => (w.stats.births || 0) > 0,
      done: () => "the first animal born here rather than dropped in",
      standing: () =>
        "nobody has bred yet — every animal in the water was placed there by the world",
    },
    {
      key: "kill",
      mark: "🔺",
      title: "One eats another",
      reached: (w) => (w.stats.kills || 0) > 0,
      blocked: (cfg) => (cfg.predation ? null : "hunting is switched off in this pond"),
      done: () => "something in here has started eating its neighbours",
      standing: (w) => {
        const carn = Math.round((w.stats.carnivoreFrac || 0) * 100);
        return carn > 0
          ? `${carn}% of them carry the meat-eating gene, and none has caught anybody yet`
          : "nothing in the water is carrying the meat-eating gene";
      },
    },
    {
      key: "family",
      mark: "🌿",
      title: "A family takes hold",
      reached: (w) => largestFamilyEver(w) >= FAMILY_MIN_PEAK,
      done: () => "a bloodline big enough to earn a name and a band on the tree",
      standing: (w) => {
        const peak = largestFamilyEver(w);
        return `the biggest bloodline yet is ${count(peak, "animal")} — ${FAMILY_MIN_PEAK} makes it a family`;
      },
    },
    {
      key: "dynasty",
      mark: "👑",
      title: "A dynasty",
      reached: (w) => (w.stats.recordYoung?.children || 0) >= DYNASTY_YOUNG,
      done: () => `one animal has raised ${DYNASTY_YOUNG} young — this is how a trait spreads`,
      standing: (w) => {
        const best = w.stats.recordYoung?.children || 0;
        return `the busiest parent so far has raised ${best} of the ${DYNASTY_YOUNG} it takes`;
      },
    },
    {
      key: "crowd",
      mark: "🌊",
      title: "Twice as full",
      reached: (w) =>
        (w.stats.maxPopEver || 0) >= CROWD_MULTIPLE * (w.config.populationStart || 0),
      done: (w) =>
        `${w.stats.maxPopEver} at once, from ${w.config.populationStart} the pond was handed`,
      standing: (w) =>
        `the fullest this water has been is ${w.stats.maxPopEver || 0}; it started with ` +
        `${w.config.populationStart} and needs ${CROWD_MULTIPLE * w.config.populationStart}`,
    },
    {
      key: "deep",
      mark: "🧬",
      title: "Ten generations deep",
      reached: (w) => (w.stats.maxGeneration || 0) >= DEEP_GENERATIONS,
      done: () =>
        `${DEEP_GENERATIONS} generations of descent from the animals this pond was handed`,
      standing: (w) =>
        `the deepest line so far is ${count(w.stats.maxGeneration || 0, "generation")} from the founders`,
    },
  ].map(Object.freeze)
);

/** Every rung's key, in ladder order. */
export const MILESTONE_KEYS = Object.freeze(MILESTONES.map((m) => m.key));

/**
 * The pond's ladder, latched on the world's own clock.
 *
 * One integer per rung: the tick it was first true on, or −1 while it is still
 * ahead. Nothing else is stored, and nothing here is ever read by the
 * simulation — see `WORLD_UNHASHED.milestones` in `src/fingerprint.js`.
 */
export class Milestones {
  constructor() {
    /** @type {Record<string, number>} rung key → tick first reached, or −1 */
    this.at = {};
    for (const m of MILESTONES) this.at[m.key] = -1;
  }

  /**
   * Latch anything that has just become true. Cheap by construction: six
   * comparisons on numbers the books already hold, and a rung that has already
   * fired is never evaluated again.
   *
   * @param {object} world the live world
   * @param {number} tick the tick that has just finished
   */
  observe(world, tick) {
    for (const m of MILESTONES) {
      if (this.at[m.key] >= 0) continue;
      if (m.reached(world)) this.at[m.key] = tick;
    }
  }

  /** How many rungs are ticked. */
  get count() {
    let n = 0;
    for (const key of MILESTONE_KEYS) if (this.at[key] >= 0) n++;
    return n;
  }
}

/**
 * When a rung was reached, in the one unit that can tell these six apart.
 *
 * **This started as the year, and the first browser run deleted it.** Every
 * other backward-looking surface here dates itself in years — `records.js` has
 * said *back in year 3* since v1.124 and the Chronicle stamps every line `yr1`
 * — so the ladder was written to match, and then a default pond left thirty
 * seconds drew *reached in year 1* five times in a column. A year here is 2,600
 * steps and the whole ladder is climbed in about 3,000, so **the ladder lives
 * inside the pond's first year** and the clock this project reaches for by habit
 * is one tick wide for the only panel that needed it to be finer.
 *
 * So: the step, which is the number that actually varies — 9 to 5,093 across
 * the sweep. Not the word `tick`, which is what the engine calls it and what
 * `test/records.test.js` has kept out of a visitor's sentence since v1.124;
 * `step` is the page's own word for the same number, on the keyboard hint under
 * the buttons. Phrased *1,724 steps in* rather than *at step 1,724* because the
 * first is how a person says an elapsed time and the second is a coordinate.
 */
function whenReached(tick) {
  return `${tick.toLocaleString()} ${tick === 1 ? "step" : "steps"} in`;
}

/** `n` of something, with the plural the count actually needs. */
function count(n, noun) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * The ladder's rows: plain data, in rung order, every one of them true.
 *
 * A row is `done` or it is not, and the two carry different sentences on
 * purpose. The done ones are short and past tense — a reader who has seen it
 * happen does not need it explained. The pending ones carry the live number the
 * rung is standing at, because that number is the reason to keep watching.
 *
 * @param {{stats:object, phylogeny:object, milestones:Milestones}} world
 * @param {object} config
 * @returns {Array<{key:string, mark:string, title:string, done:boolean,
 *   blocked:boolean, why:string, when:string}>}
 */
export function milestoneRows(world, config) {
  const at = (world.milestones && world.milestones.at) || {};
  return MILESTONES.map((m) => {
    const tick = at[m.key] ?? -1;
    if (tick >= 0) {
      return {
        key: m.key,
        mark: m.mark,
        title: m.title,
        done: true,
        blocked: false,
        why: m.done(world),
        when: whenReached(tick),
      };
    }
    const stop = m.blocked ? m.blocked(config) : null;
    return {
      key: m.key,
      mark: m.mark,
      title: m.title,
      done: false,
      blocked: Boolean(stop),
      why: stop || m.standing(world),
      when: "",
    };
  });
}

/**
 * How far up the ladder this pond is, in the words a person would use.
 *
 * A blocked rung is still counted in the denominator. The alternative — a
 * ladder that shrinks when you switch hunting off — would move the goalposts
 * under a reader mid-run, and the row itself already says why it cannot fire.
 *
 * @param {Array<{done:boolean}>} rows
 */
export function milestoneProgress(rows) {
  const done = rows.filter((r) => r.done).length;
  const total = rows.length;
  return {
    done,
    total,
    fraction: total > 0 ? done / total : 0,
    text: done === 0 ? `none of ${total} yet` : `${done} of ${total} so far`,
  };
}

/**
 * What the ladder depends on, as a string. The content, because a pending row's
 * sentence carries a live counter and that counter moving is the one change on
 * this panel most worth redrawing for.
 *
 * @param {Array<{key:string, done:boolean, why:string, when:string}>} rows
 */
export function milestoneSignature(rows) {
  return rows.map((r) => `${r.key}:${r.done ? 1 : 0}:${r.when}:${r.why}`).join("|");
}

/**
 * The whole ladder, as markup for one list container.
 *
 * Nothing here is a control. Every rung is a statement about the pond and there
 * is no animal behind it to go and look at — v1.51's rule read the other way, a
 * control that does nothing is worse than no control — so the rows are text and
 * `test/targetsize.test.js` has nothing new to walk. The tick and the ring are
 * `aria-hidden`; the row's state is in the words either way, so a listener is
 * told "reached in year 2" rather than a bare glyph.
 *
 * @param {Array<{key:string, mark:string, title:string, done:boolean,
 *   blocked:boolean, why:string, when:string}>} rows
 */
export function milestonesHTML(rows) {
  return rows
    .map((r) => {
      const cls = r.done ? "msrow done" : r.blocked ? "msrow blocked" : "msrow";
      const tick = r.done ? "✓" : r.blocked ? "—" : "○";
      const when = r.done ? `<span class="mswhen">${r.when}</span>` : "";
      return (
        `<li class="${cls}">` +
        `<span class="msstate" aria-hidden="true">${tick}</span>` +
        `<span class="msmark" aria-hidden="true">${r.mark}</span>` +
        `<span class="msname">${r.title}</span>` +
        `<span class="mswhy">${r.why}</span>${when}` +
        `</li>`
      );
    })
    .join("");
}

/**
 * The ladder in one spoken sentence, for the screen-reader description of the
 * pond. Names the next rung rather than listing the ticked ones: what a person
 * who cannot see the panel wants from it is the same thing everyone else wants
 * from it, which is what to wait for.
 *
 * @param {Array<{title:string, done:boolean, blocked:boolean}>} rows
 */
export function milestonesSay(rows) {
  const { done, total } = milestoneProgress(rows);
  const next = rows.find((r) => !r.done && !r.blocked);
  const head = `This pond has passed ${done} of ${total} milestones`;
  return next ? `${head}. Still ahead: ${next.title.toLowerCase()}.` : `${head} — all of them.`;
}
