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
// ## Rule 4 (v1.182): everything true gets a turn
//
// v1.180's chore — *sit with the page for as long as somebody else would and
// write down which panels stop changing* — named this line as a suspect and
// never ran the clock on it. Run: the default pond, opened, untouched, the
// sentence read every two seconds for five minutes.
//
//   the line changed                        25 times
//   the line said                            4 sentences
//   from 0:38 to 5:02 — 87% of the visit     2 sentences, alternating
//
// *Food is short — N% of the recent dead starved* thirteen times and *The pond
// is crashing — N left, down from M* eight, with nothing between them but a
// number moving. A reader who glances at the top of this page at one minute, at
// three and at five is shown the same sentence three times, and the *worse*
// half of that is the number: the line keeps ticking, so it looks alive while
// saying nothing new. **A surface that is correct at every instant can still be
// finished** — v1.180's lesson, on the first sentence a visitor reads.
//
// The cause is in rule 1 and is not that rule's fault. `pondHeadline` was a
// cascade of early returns, so the most urgent *true* thing won the line every
// time it was asked; a condition that stays true — hunger, a crash — therefore
// won it forever, and the six quieter rules under it, the calm rotation
// included, never spoke again. Rank is the right answer to *who goes first*
// and had been left answering *who goes at all*.
//
// So the cascade becomes a **list**: every line true of this pond right now, in
// rank order, calm always last so that there is always something left to say.
// Rank still decides the opening and still interrupts. What is new is that a
// rule which has just had the banner steps aside for `REPEAT_COOLDOWN` ticks
// while anything else true is waiting, and when everything is waiting the
// **least recently said** goes next. News first, then a turn each.
//
// Two exemptions, and they are the two states where repetition is not
// wallpaper: an empty pond and a pond down to its last handful say the same
// thing for as long as it is true, because those sentences carry an instruction
// (`↻ Reset`) or an outcome the visitor is about to watch, and a page that
// changed the subject there would be chattering through a funeral.
//
// Like `chronicle.js` and `phylogeny.js` this is a PURE OBSERVER: it reads world
// state, writes none, and draws no random numbers. `main.js` owns the DOM.

import { speciesPlural } from "./speciesnames.js";

/**
 * Ticks a headline keeps the banner before a same-or-lower-rank line may
 * replace it.
 *
 * Six seconds until v1.182, and the number was never the binding constraint:
 * the text-equality guard held each sentence for the ten to fifteen seconds it
 * took its percentage to move, so nobody had to defend six. Now that a line is
 * followed by a *different* line rather than by itself, the hold is what a
 * reader actually gets, and the median headline is 92 characters — the length
 * `banner.js` measured and gave 4,200–5,200 ms. Ten seconds is that with room
 * to look at the water in between, and it is also the pace the page already
 * had, so the change is in what the sentences say and not in how fast they go.
 */
export const HEADLINE_HOLD = 600;
/**
 * Ticks a rule waits, after having the banner, before it may have it again —
 * while anything else true is still waiting its turn.
 *
 * Forty seconds. Long enough that no sentence is read twice in the stretch a
 * visitor is likely to be looking, short enough that a standing emergency comes
 * back round inside the same visit rather than being dropped. With the hold at
 * ten seconds this is four other sentences' worth of turn-taking, which is
 * about as many as this pond has true at once.
 */
export const REPEAT_COOLDOWN = 2400;
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

/**
 * The ranks that may say the same thing for as long as it is true.
 *
 * Both of these are a pond with almost nothing left in it, and both sentences
 * are about what the reader should do or is about to see rather than about news
 * — see rule 4 in the header. Everything else takes turns.
 */
export const STANDING = Object.freeze(new Set([RANK.extinct, RANK.fragile]));

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
 * Everything worth saying about this pond right now, most urgent first.
 *
 * The cascade this replaced (v1.117–v1.181) stopped at the first true rule, so
 * a condition that stayed true owned the banner for the rest of the visit and
 * the quieter rules under it were unreachable — see rule 4 in the header. Every
 * rule is now asked, and the caller decides whose turn it is.
 *
 * The order is `RANK`'s order and the list always ends with the calm line,
 * which is true of every pond with anything alive in it: there is always a
 * next thing to say. The two emergency ranks answer alone, because a pond with
 * six creatures left has one piece of news in it.
 *
 * @param {import('./world.js').World} world
 * @param {object} config
 * @param {Map<number, {plural:string}>|null} [names] lineage names, when the caller has a tree
 * @returns {Array<{rank:number, icon:string, text:string}>} never empty
 */
export function pondHeadlines(world, config, names = null) {
  const pop = world.creatures.length;
  const s = world.stats;
  const tick = world.tick;

  // Nothing alive. The one state where the reader needs an instruction rather
  // than an observation — a pond that has ended does not restart itself.
  if (pop === 0) {
    return [
      {
        rank: RANK.extinct,
        icon: "🕯️",
        text: "Everything here has died. Press ↻ Reset to start the pond over.",
      },
    ];
  }

  // A handful left. Said before the crash line, because by the time a pond is
  // this small *how* it got here has stopped being the point.
  if (pop <= FRAGILE_POP) {
    return [
      {
        rank: RANK.fragile,
        icon: "⚠️",
        text:
          pop === 1
            ? "One creature left. Everything that comes next is descended from it — if it eats."
            : `Only ${n(pop)} creatures left. This pond is one bad stretch from empty.`,
      },
    ];
  }

  const out = [];

  // Falling hard off its own recent high. Measured against the window the pond
  // remembers rather than the run's best ever, so a recovery that plateaus low
  // stops being called a crash instead of being called one forever.
  const peak = recentPeak(s.popHistory);
  if (peak >= CRASH_MIN_PEAK && pop <= CRASH_DROP * peak) {
    out.push({
      rank: RANK.crash,
      icon: "📉",
      text: `The pond is crashing — ${n(pop)} left, down from ${n(peak)} a little while ago.`,
    });
  }

  // A brand-new pond. This is the sentence that explains the whole experiment,
  // and it gets the opening because it is only true for a moment.
  if (tick < YOUNG_TICKS) {
    out.push({
      rank: RANK.young,
      icon: "🥚",
      text:
        `A brand-new pond: ${n(pop)} creatures, and not one of them knows anything. ` +
        "The ones that find food have young; the ones that don't, don't.",
    });
  }

  // Hunger. The mix of the recent dead is the only place the pond says *why* it
  // is not growing, and starvation is the cause a reader can act on — the Food
  // rate slider is right there.
  const starved = starvedShare(s.recentDeaths);
  if (starved !== null && starved >= STARVE_SHARE) {
    out.push({
      rank: RANK.starving,
      icon: "🍽️",
      text: `Food is short — ${Math.round(starved * 100)}% of the recent dead starved.`,
    });
  }

  // Hunting. Gated on `config.predation` *and* on kills, because the diet gene
  // exists in every world and a carnivore that has never caught anything is a
  // trait rather than an event (the distinction v1.101 spent a release on).
  if (config.predation && s.kills > 0 && s.carnivoreFrac >= HUNT_SHARE) {
    out.push({
      rank: RANK.hunting,
      icon: "🔺",
      text:
        `They hunt each other now: ${n(s.carnivoreCount)} of the ${n(pop)} live on meat, ` +
        `and ${n(s.kills)} have been eaten.`,
    });
  }

  // One family holding the water. The single most legible thing the Tree of
  // Life shows, said in the words v1.116 gave the lineages.
  const top = biggestLineage(world.phylogeny);
  if (top && pop >= DOMINANT_MIN_POP && top.count >= DOMINANT_SHARE * pop) {
    out.push({
      rank: RANK.dominant,
      icon: "👑",
      text:
        `The ${speciesPlural(names, top.id)} have taken over — ` +
        `${Math.round((top.count / pop) * 100)}% of the pond is one family.`,
    });
  }

  // The best it has ever been. `maxPopEver` moves with the pond, so this fires
  // on the way up and stops the moment the pond slips off its own record.
  if (s.maxPopEver > 0 && pop >= BOOM_NEAR * s.maxPopEver) {
    out.push({
      rank: RANK.boom,
      icon: "🌱",
      text: `Thriving: ${n(pop)} creatures, the most this pond has ever held.`,
    });
  }

  out.push({ rank: RANK.calm, ...calmLine(world, tick) });
  return out;
}

/**
 * The single most urgent thing true of this pond — the opening line, and what
 * every caller before v1.182 asked for.
 *
 * Kept as its own export because it is the honest name for *the* headline, and
 * because a reader of this module should be able to ask that question without
 * knowing that there is a queue behind it.
 *
 * @param {import('./world.js').World} world
 * @param {object} config
 * @param {Map<number, {plural:string}>|null} [names] lineage names, when the caller has a tree
 * @returns {{rank:number, icon:string, text:string}}
 */
export function pondHeadline(world, config, names = null) {
  return pondHeadlines(world, config, names)[0];
}

/**
 * Whose turn it is, out of the lines true right now.
 *
 * Ranked first among the rules that have not spoken inside `cooldown`; if every
 * rule has, the one that spoke longest ago, so a pond whose only two true
 * things are an alarm and a crash still alternates rather than sticking. The
 * second return value says which branch answered, because the caller treats an
 * urgent *new* line and a round-robin turn differently — see below.
 *
 * @param {Array<{rank:number}>} candidates rank-ordered, non-empty
 * @param {Record<number, number>} spoke rank → tick it last took the banner
 * @param {number} tick
 * @param {number} cooldown
 * @returns {{pick:object, fresh:boolean}} `fresh` when the pick is off cooldown
 */
function whoseTurn(candidates, spoke, tick, cooldown) {
  // One candidate is not a queue. A cooldown is a rule about stepping aside for
  // something else, so with nothing else offered there is nothing here to
  // decide and the caller keeps the contract it had before v1.182 — including
  // the interruption, which is the half a single-candidate caller relies on.
  if (candidates.length === 1) return { pick: candidates[0], fresh: true };
  for (const c of candidates) {
    const last = spoke[c.rank];
    if (last === undefined || tick - last >= cooldown || STANDING.has(c.rank)) {
      return { pick: c, fresh: true };
    }
  }
  let oldest = candidates[0];
  for (const c of candidates) if (spoke[c.rank] < spoke[oldest.rank]) oldest = c;
  return { pick: oldest, fresh: false };
}

/**
 * Decide what the banner shows, given what it is already showing.
 *
 * A headline earns the screen for `hold` ticks. A strictly more urgent line
 * (lower rank) interrupts it immediately — that is what rank is for — and
 * anything else waits its turn. The current line is returned unchanged when it
 * keeps the slot, so the caller can compare by identity and skip the DOM write.
 *
 * Since v1.182 the caller may hand over **every** line true of the pond rather
 * than only the most urgent one, and the turn-taking above decides between
 * them: a rule cannot follow itself while something else is waiting. A single
 * candidate is still accepted and still behaves exactly as it did — there is no
 * queue in a list of one, and the tests that predate this release say so.
 *
 * The interruption is deliberately restricted to a `fresh` pick. A round-robin
 * turn can be lower-ranked than the line on screen — the crash sentence coming
 * back round under a calm one — and letting that jump the hold would cut the
 * calm line off after a single frame, which is the defect `banner.js` spent
 * v1.181 removing from the strip six inches below this one.
 *
 * The returned state carries `spoke`, so this function keeps no memory of its
 * own and the caller keeps no policy: the same split as `banner.js`.
 *
 * @param {{rank:number, icon:string, text:string, since:number, spoke?:object}|null} current
 * @param {{rank:number, icon:string, text:string}|Array<object>} candidate one line, or all of them
 * @param {number} tick
 * @param {number} [hold]
 * @param {number} [cooldown]
 */
export function nextHeadline(
  current,
  candidate,
  tick,
  hold = HEADLINE_HOLD,
  cooldown = REPEAT_COOLDOWN,
) {
  const candidates = Array.isArray(candidate) ? candidate : [candidate];
  // A reset winds the clock back; without this the new pond inherits the old
  // one's hold — and now its turn-taking — and opens on a line about a world
  // that no longer exists.
  if (!current || tick < current.since) {
    return { ...candidates[0], since: tick, spoke: { [candidates[0].rank]: tick } };
  }
  const spoke = current.spoke ?? { [current.rank]: current.since };
  const { pick, fresh } = whoseTurn(candidates, spoke, tick, cooldown);
  const take = () => ({ ...pick, since: tick, spoke: { ...spoke, [pick.rank]: tick } });
  if (fresh && pick.rank < current.rank) return take();
  if (tick - current.since < hold) return current;
  if (pick.text === current.text) return current;
  return take();
}
