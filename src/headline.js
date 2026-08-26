// headline.js — the one sentence a visitor reads before they read anything.
//
// This page currently answers the newcomer's first question ("what am I looking
// at?") in a grid of stat tiles, a stack of figures, a column of toggles and a
// scrolling timeline. Every one of those is honest and none of them is an
// *opening*: the tiles are labelled `Refuge 🔒`, `Web 🕸️` and `Bill 🧾`, the Chronicle is a log
// of things that already happened, and the only prose that describes the pond
// as it stands right now — `describePond` — is `sr-only`, written for a screen
// reader and invisible to everyone else. A sighted visitor with no interest in
// artificial life gets dots on a dark rectangle and a wall of numbers.
//
// So: one line, above the water, in words a person who has never heard of
// neuroevolution can read at a glance. It is not a summary of everything — a
// summary of everything is the wall of numbers again. It is **the single most
// newsworthy thing true of this pond at this moment**, chosen by rank, phrased
// as a sentence, and swapped only when something more urgent happens or enough
// time has passed that the old line is stale.
//
// Three rules the design turns on:
//
//  1. **Rank, not aggregate.** A dying pond and a booming one can both be
//     dominated by one lineage; the reader needs the dying part first. Every
//     rule carries a rank and the lowest rank wins, so "four creatures left"
//     always beats "the Shale Sprigs hold 60%".
//  2. **Hold, or it flickers.** A predicate on a live number crosses its own
//     threshold repeatedly — a headline recomputed every frame would strobe.
//     `nextHeadline` keeps the line on screen for `HEADLINE_HOLD` ticks unless
//     something *more* urgent arrives, which is the one interruption a reader
//     forgives.
//  3. **A calm pond is still interesting.** The fallback is not "nothing to
//     report": it is a rotation of four plain facts about what this thing
//     actually is — nobody wrote the behaviour, the brains differ, this many
//     have been born and died here. The rotation is a function of the tick, not
//     a draw, because this module must be invisible to determinism.
//
// Like `chronicle.js` and `phylogeny.js` this is a PURE OBSERVER: it reads world
// state, writes none, and draws no random numbers. `main.js` owns the DOM.

import { speciesPlural } from "./speciesnames.js";

/** Ticks a headline keeps the banner before a same-or-lower-rank line may replace it. */
export const HEADLINE_HOLD = 360;
/** Ticks between rotations of the calm-pond line. */
export const CALM_ROTATE = 900;
/** Below this share of its own recent peak, a population is crashing rather than dipping. */
export const CRASH_DROP = 0.6;
/** A peak this small is a young pond finding its level, not a crash worth alarming anyone about. */
export const CRASH_MIN_PEAK = 25;
/** At or under this many creatures, the pond's survival is the only news. */
export const FRAGILE_POP = 6;
/** Carnivores at this share of the pond, with kills on the board, make hunting the story. */
export const HUNT_SHARE = 0.2;
/** This share of the recent dead being starved makes hunger the story. */
export const STARVE_SHARE = 0.6;
/** Recent deaths needed before their mix says anything at all. */
export const STARVE_MIN_DEATHS = 12;
/** One lineage at this share of the pond has taken it over. */
export const DOMINANT_SHARE = 0.5;
/** A pond needs this many creatures before a share of it is worth a sentence. */
export const DOMINANT_MIN_POP = 20;
/** Within this share of the best population ever seen, and at least that many, is a boom. */
export const BOOM_NEAR = 0.98;
/** Ticks a pond counts as brand new — long enough to read the sentence, short enough to be true. */
export const YOUNG_TICKS = 400;

/**
 * The ranks, lowest first. Exported because the hold rule compares them and a
 * test should be able to name one rather than count it.
 */
export const RANK = Object.freeze({
  extinct: 0,
  fragile: 1,
  crash: 2,
  young: 3,
  starving: 4,
  hunting: 5,
  dominant: 6,
  boom: 7,
  calm: 8,
});

/** Whole numbers, grouped — a headline never shows a decimal. */
const n = (v) => Math.round(v).toLocaleString("en-US");

/** The highest population in the window the pond can still remember. */
function recentPeak(hist) {
  let top = 0;
  for (const p of hist) if (p.pop > top) top = p.pop;
  return top;
}

/** The share of the recent dead that starved, or null if too few have died to say. */
function starvedShare(recent) {
  if (recent.length < STARVE_MIN_DEATHS) return null;
  let starved = 0;
  for (const d of recent) if (d.cause === "starvation") starved++;
  return starved / recent.length;
}

/** The biggest living lineage, as `{id, count}`, or null in a pond with no tree. */
function biggestLineage(phylo) {
  if (!phylo || !phylo.species) return null;
  let top = null;
  for (const sp of phylo.species) if (sp.count > 0 && (!top || sp.count > top.count)) top = sp;
  return top;
}

/**
 * The four things worth saying about a pond with no emergency in it, rotated by
 * tick so a long calm stretch is not one sentence for an hour. Deterministic by
 * construction: the index is arithmetic on the tick.
 */
function calmLine(world, tick) {
  const pop = world.creatures.length;
  const s = world.stats;
  const lines = [
    {
      icon: "🌊",
      text: `${n(pop)} creatures adrift, ${n(world.food.items.length)} scraps of food between them.`,
    },
    {
      icon: "🧠",
      text:
        `Nobody told them how to eat — ${n(s.maxGeneration)} generations of ` +
        "trial and error worked it out.",
    },
    {
      icon: "👪",
      text: `${n(s.births)} have been born in this pond, and ${n(s.deaths)} have died.`,
    },
    {
      icon: "🔬",
      text: "Every creature here has its own small brain, and no two of them are alike.",
    },
  ];
  return lines[Math.floor(Math.max(0, tick) / CALM_ROTATE) % lines.length];
}

/**
 * What this pond's headline should say right now.
 *
 * @param {import('./world.js').World} world
 * @param {object} config
 * @param {Map<number, {plural:string}>|null} [names] lineage names, when the caller has a tree
 * @returns {{rank:number, icon:string, text:string}}
 */
export function pondHeadline(world, config, names = null) {
  const pop = world.creatures.length;
  const s = world.stats;
  const tick = world.tick;

  // Nothing alive. The one state where the reader needs an instruction rather
  // than an observation — a pond that has ended does not restart itself.
  if (pop === 0) {
    return {
      rank: RANK.extinct,
      icon: "🕯️",
      text: "Everything here has died. Press ↻ Reset to start the pond over.",
    };
  }

  // A handful left. Said before the crash line, because by the time a pond is
  // this small *how* it got here has stopped being the point.
  if (pop <= FRAGILE_POP) {
    return {
      rank: RANK.fragile,
      icon: "⚠️",
      text:
        pop === 1
          ? "One creature left. Everything that comes next is descended from it — if it eats."
          : `Only ${n(pop)} creatures left. This pond is one bad stretch from empty.`,
    };
  }

  // Falling hard off its own recent high. Measured against the window the pond
  // remembers rather than the run's best ever, so a recovery that plateaus low
  // stops being called a crash instead of being called one forever.
  const peak = recentPeak(s.popHistory);
  if (peak >= CRASH_MIN_PEAK && pop <= CRASH_DROP * peak) {
    return {
      rank: RANK.crash,
      icon: "📉",
      text: `The pond is crashing — ${n(pop)} left, down from ${n(peak)} a little while ago.`,
    };
  }

  // A brand-new pond. This is the sentence that explains the whole experiment,
  // and it gets the opening because it is only true for a moment.
  if (tick < YOUNG_TICKS) {
    return {
      rank: RANK.young,
      icon: "🥚",
      text:
        `A brand-new pond: ${n(pop)} creatures, and not one of them knows anything. ` +
        "The ones that find food have young; the ones that don't, don't.",
    };
  }

  // Hunger. The mix of the recent dead is the only place the pond says *why* it
  // is not growing, and starvation is the cause a reader can act on — the Food
  // rate slider is right there.
  const starved = starvedShare(s.recentDeaths);
  if (starved !== null && starved >= STARVE_SHARE) {
    return {
      rank: RANK.starving,
      icon: "🍽️",
      text: `Food is short — ${Math.round(starved * 100)}% of the recent dead starved.`,
    };
  }

  // Hunting. Gated on `config.predation` *and* on kills, because the diet gene
  // exists in every world and a carnivore that has never caught anything is a
  // trait rather than an event (the distinction v1.101 spent a release on).
  if (config.predation && s.kills > 0 && s.carnivoreFrac >= HUNT_SHARE) {
    return {
      rank: RANK.hunting,
      icon: "🔺",
      text:
        `They hunt each other now: ${n(s.carnivoreCount)} of the ${n(pop)} live on meat, ` +
        `and ${n(s.kills)} have been eaten.`,
    };
  }

  // One family holding the water. The single most legible thing the Tree of
  // Life shows, said in the words v1.116 gave the lineages.
  const top = biggestLineage(world.phylogeny);
  if (top && pop >= DOMINANT_MIN_POP && top.count >= DOMINANT_SHARE * pop) {
    return {
      rank: RANK.dominant,
      icon: "👑",
      text:
        `The ${speciesPlural(names, top.id)} have taken over — ` +
        `${Math.round((top.count / pop) * 100)}% of the pond is one family.`,
    };
  }

  // The best it has ever been. `maxPopEver` moves with the pond, so this fires
  // on the way up and stops the moment the pond slips off its own record.
  if (s.maxPopEver > 0 && pop >= BOOM_NEAR * s.maxPopEver) {
    return {
      rank: RANK.boom,
      icon: "🌱",
      text: `Thriving: ${n(pop)} creatures, the most this pond has ever held.`,
    };
  }

  return { rank: RANK.calm, ...calmLine(world, tick) };
}

/**
 * Decide what the banner shows, given what it is already showing.
 *
 * A headline earns the screen for `hold` ticks. A strictly more urgent line
 * (lower rank) interrupts it immediately — that is what rank is for — and
 * anything else waits its turn. The current line is returned unchanged when it
 * keeps the slot, so the caller can compare by identity and skip the DOM write.
 *
 * @param {{rank:number, icon:string, text:string, since:number}|null} current
 * @param {{rank:number, icon:string, text:string}} candidate
 * @param {number} tick
 * @param {number} [hold]
 */
export function nextHeadline(current, candidate, tick, hold = HEADLINE_HOLD) {
  if (!current) return { ...candidate, since: tick };
  if (candidate.rank < current.rank) return { ...candidate, since: tick };
  // A reset winds the clock back; without this the new pond inherits the old
  // one's hold and opens on a line about a world that no longer exists.
  if (tick < current.since) return { ...candidate, since: tick };
  if (tick - current.since < hold) return current;
  if (candidate.text === current.text) return current;
  return { ...candidate, since: tick };
}
