// cast.js — the animals of this pond, called something a person can remember,
// and one button that hands you the one worth watching.
//
// v1.116 gave the lineages names because *"species 12 has branched off species
// 7"* is a sentence about the most interesting thing this world does and it
// reads like a database. It stopped one level short. A lineage is a band on a
// figure; the thing a visitor actually points at is **an animal**, and every
// surface here still calls that animal `Creature #147`:
//
//     Creature #147                     ← the inspector's heading, since v1.0
//     Following creature #147 — drag…   ← the flash, on a double-tap
//     🎯 #147                            ← the badge over the water
//
// A number is the right identifier and the wrong name, and the argument is the
// same one v1.116 made: nothing distinguishes 147 from 149, you cannot tell a
// friend about creature #147 an hour later, and — the part that matters most on
// this page — a swarm of numbered dots has no protagonist. Everything else this
// project has built for a newcomer is *about the pond*: a headline (v1.117),
// six tiles (v1.118), a Chronicle. None of it is about **somebody**, and a
// person watching an aquarium picks a fish.
//
// So this module does two things and both of them are one sentence long:
//
//  1. **A name.** `Pip`, `Wren`, `Juno` — one word, from a fixed list, chosen by
//     a hash of the creature's id. With the lineage names it composes into
//     *Pip of the Amber Whorls*, which is a thing you can say out loud.
//  2. **A cast pick.** `pickStar` ranks everyone alive by how much they are
//     worth watching *right now* and returns the winner with the reason, so
//     "👋 Meet somebody" can hand a first-time visitor an animal with a story
//     instead of asking them to click a dot and hope.
//
// **A given name is a nickname, not an identifier, and this is the one place
// this project departs from v1.116's rules on purpose.** Species names are
// unique by construction because the name is the thing you *click* — two
// lineages answering to one name would break the legend. A creature's name is
// not clicked: the number is still the identity, it is still in the heading's
// `title`, and every document in this repository still uses it. With sixty-four
// given names and a pond of three hundred there are several Pips, exactly as
// there are in any village, and the family disambiguates most of them. Claiming
// uniqueness here would cost a registry that has to be rebuilt whenever anything
// is born, and would buy a property nobody uses.
//
// **The star is picked, never randomised.** `pickStar` is a total order over the
// living, computed from fields the world already keeps — so pressing the button
// twice on a paused pond gives the same animal, and opening seed 314 tomorrow
// gives the same animal again. That is the second prime directive applied to a
// choice: a creature a visitor cannot return to is not worth meeting. Ties break
// on the lowest id for the same reason.
//
// PURE OBSERVER, in the sense `describe.js`, `headline.js` and `speciesnames.js`
// are: it reads creatures and writes nothing, adds no field to anything, and
// draws no random numbers. No fingerprint can see this release.

import { DEFAULT_CONFIG } from "./config.js";
import { speciesPlural } from "./speciesnames.js";

/**
 * The sixty-four given names: one or two syllables, no gendered pairs, nothing
 * that reads as a surname — they have to sit in front of a family word (*Pip of
 * the Amber Whorls*) without the reader hearing two families.
 */
export const GIVEN = Object.freeze([
  "Ada", "Alder", "Arlo", "Ash", "Bay", "Bex", "Bo", "Bramble",
  "Briar", "Cass", "Cedar", "Clover", "Cove", "Dot", "Dove", "Echo",
  "Elm", "Ember", "Fen", "Fern", "Finch", "Flint", "Fox", "Gale",
  "Hollis", "Indigo", "Iris", "Jem", "Juno", "Kit", "Lark", "Linden",
  "Lux", "Mabel", "Marlow", "Merle", "Milo", "Moss", "Nell", "Nim",
  "Nova", "Olive", "Onyx", "Otto", "Pax", "Pip", "Poppy", "Quill",
  "Reed", "Ren", "Robin", "Rook", "Rowan", "Sage", "Shel", "Sky",
  "Sorrel", "Tamsin", "Teal", "Thistle", "Vale", "Wren", "Yarrow", "Zev",
]);

/**
 * A cheap integer scramble, so consecutive ids do not get consecutive names.
 * The same mixer `speciesnames.js` uses, and for the same reason: an
 * alphabetical march would be just as deterministic and would read like a
 * numbering with extra steps.
 */
function mix(n) {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

/**
 * What to call creature `id`. A pure function of the id, so nothing is stored
 * and nothing has to be looked up.
 *
 * **What that buys, exactly, and what it does not.** A creature's id comes from
 * a module-level `NEXT_ID` in `creature.js` that never resets, so it is stable
 * for as long as the tab is: open the page on seed 314 and Pip is Pip, share the
 * link and your reader meets Pip too, because a fresh load starts the counter
 * again. Press **Reset**, or **Load** a save, and the same animals come back
 * under different numbers and therefore different names — the ids are dealt
 * from where the counter has got to, and `Creature.fromJSON` mints new ones.
 * That is a property of the id and not of this module; `docs/AUTONOMOUS.md`
 * carries the per-world serial that would fix it, which is a new field on
 * `Creature` and a conversation with the fingerprint.
 *
 * @param {number} id
 */
export function givenName(id) {
  return GIVEN[mix(id) % GIVEN.length];
}

/**
 * The full name — given name plus family — for a heading or a sentence.
 *
 * Falls back to the given name alone when there is no name table, which is the
 * honest answer for a caller that has a creature and not a tree (several tests
 * build one without the other, exactly as `speciesLabel` allows).
 *
 * @param {{id:number, speciesId:number}} c
 * @param {Map<number, {plural:string}>|null|undefined} names
 */
export function creatureLabel(c, names = null) {
  const family = names && names.get(c.speciesId);
  return family ? `${givenName(c.id)} of the ${family.plural}` : givenName(c.id);
}

// ---- what kind of animal this is, in words ----

/**
 * The diet clause. Three bands rather than a number, because `carnivory` is a
 * gene between 0 and 1 and a reader wants to know what the animal *eats*.
 *
 * The upper band is the config's own licence to hunt, so the sentence and the
 * rule agree by construction; the lower one is a third, which is far enough
 * below the licence that "graze" is never said about an animal one mutation
 * from hunting.
 *
 * Written for *they*, which is how every sentence about a creature here is
 * written: nothing in this world has a sex to get wrong, and reproduction is a
 * body splitting in two.
 */
export const OMNIVORE_FROM = 0.33;

/**
 * Which of the three bands an animal's diet gene falls in — `meat`, `mixed` or
 * `plants` — with no tense and no wording attached.
 *
 * Split out of `dietClause` in v1.121, when `obituary.js` needed the same three
 * bands said in the past tense. Two `if` chains reading one gene against one
 * threshold is exactly the shape that drifts: move `OMNIVORE_FROM` and one
 * sentence follows it while the other quietly does not. The band is the fact;
 * a clause is one way of saying it.
 */
export function dietBand(c, config = DEFAULT_CONFIG) {
  if (c.carnivory >= config.carnivoreThreshold) return "meat";
  if (c.carnivory >= OMNIVORE_FROM) return "mixed";
  return "plants";
}

/** The present-tense clause for each band, as the inspector's sentence says it. */
export const DIET_CLAUSE = Object.freeze({
  meat: "live on meat",
  mixed: "eat a bit of everything",
  plants: "graze on plants",
});

export function dietClause(c, config = DEFAULT_CONFIG) {
  return DIET_CLAUSE[dietBand(c, config)];
}

/** `1st`, `2nd`, `3rd`, `11th` — the generation, read aloud rather than counted. */
export function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const rem10 = n % 10;
  if (rem10 === 1) return `${n}st`;
  if (rem10 === 2) return `${n}nd`;
  if (rem10 === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * One plain sentence about an animal, for the top of the inspector.
 *
 * Three clauses, always in this order, because they answer the three questions a
 * person asks about a creature in a tank: what does it eat, has it had young,
 * how far down the family is it. No unit appears in it — no pixels, no ticks, no
 * gene between 0 and 1 — which is the same bar `headline.js` holds itself to and
 * which `test/cast.test.js` checks the same way.
 *
 * @param {{carnivory:number, children:number, generation:number}} c
 */
export function creatureIntro(c, config = DEFAULT_CONFIG) {
  const young =
    c.children === 0
      ? "have no young yet"
      : c.children === 1
        ? "have raised one"
        : `have raised ${c.children} young`;
  const line =
    c.generation === 0
      ? "were here when the pond began"
      : `are the ${ordinal(c.generation + 1)} generation of their family`;
  return `They ${dietClause(c, config)}, ${young}, and ${line}.`;
}

// ---- who is worth watching ----

/**
 * The ranks, lowest first. Exported so a test can name one rather than count it,
 * and so the ordering is a table somebody can argue with rather than the order
 * the `if`s happen to be typed in — `headline.js`'s rule, which is the same rule.
 *
 * The ordering is about *story*, not about size: the last of a family is a
 * cliffhanger, a matriarch is a dynasty, a hunter is a threat, and a well-fed
 * animal is only ever the answer when nothing better is true.
 */
export const STAR = Object.freeze({
  LAST: 0,
  PARENT: 1,
  HUNTER: 2,
  GIANT: 3,
  ELDER: 4,
  FED: 5,
});

/** A family this small can be a last survivor; a pond this small has no spare cast. */
export const LAST_MIN_POP = 8;
/**
 * A family has to have *been* something before its last member is a story.
 *
 * This constant is the whole finding of the first browser run of this feature.
 * Without it the rule fires on tick zero and never stops being technically
 * true: `Phylogeny` gives each of the forty founders its own lineage, so at the
 * start of a run **everybody** is the last of their family, and the button's
 * first sentence to a first-time visitor was a dramatic-sounding fact about
 * every animal in the pond. A count of the living cannot tell "alone" from
 * "only ever one" — that needs the peak, which the tree has kept since v1.9 and
 * which nothing outside the Muller plot had ever read.
 */
export const LAST_MIN_PEAK = 4;
/** Young enough to be worth a sentence — below this, half the pond qualifies. */
export const PARENT_MIN_CHILDREN = 4;
/** A body this many times the pond's middling one is visibly a giant. */
export const GIANT_RATIO = 1.35;
/** An animal this many times the middling age has outlived its cohort. */
export const ELDER_RATIO = 2;

/** The middle value of a list of numbers; 0 for an empty one. */
function median(xs) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The best of a list by some measure, ties going to the lowest id.
 *
 * The tie-break is the whole reason this is a function: `reduce` keeping the
 * first maximum makes the answer depend on the order of `world.creatures`, which
 * is birth order and which a shuffled turn order (v1.47) is allowed to change.
 * A star that moves when a switch nobody pressed is flipped is not deterministic
 * in the sense that matters.
 */
function best(list, score) {
  let winner = null;
  let top = -Infinity;
  for (const c of list) {
    const v = score(c);
    if (v > top || (v === top && winner && c.id < winner.id)) {
      top = v;
      winner = c;
    }
  }
  return winner;
}

/**
 * The animal most worth watching in this pond right now, with the reason.
 *
 * @param {{creatures:Array}} world
 * @param {object} config
 * @param {Map<number, {plural:string}>|null} [names]
 * @returns {{creature:object, rank:number, why:string}|null} null on an empty pond
 */
export function pickStar(world, config, names = null) {
  const alive = world.creatures.filter((c) => !c.dead);
  if (alive.length === 0) return null;

  // The last of a family. *Alone* is counted over the living rather than read
  // off the tree, because a lineage's own count includes animals this pond has
  // already buried in the frame we are looking at; *was once more than one* is
  // the tree's `peak`, which is the only place that history exists.
  if (alive.length >= LAST_MIN_POP) {
    const perSpecies = new Map();
    for (const c of alive) perSpecies.set(c.speciesId, (perSpecies.get(c.speciesId) ?? 0) + 1);
    if (perSpecies.size > 1) {
      const peakOf = (id) => world.phylogeny?.byId?.get(id)?.peak ?? 0;
      const lonely = alive.filter(
        (c) => perSpecies.get(c.speciesId) === 1 && peakOf(c.speciesId) >= LAST_MIN_PEAK
      );
      const c = best(lonely, (x) => x.age);
      if (c) {
        return { creature: c, rank: STAR.LAST, why: `the last of the ${speciesPlural(names, c.speciesId)}` };
      }
    }
  }

  const parent = best(alive, (c) => c.children);
  if (parent && parent.children >= PARENT_MIN_CHILDREN) {
    // No count in the reason, though it is the obvious place for one: the
    // banner freezes at the moment of the click and the panel's sentence is
    // patched every frame, so a number in both means a visitor reads "7 young"
    // beside "have raised 8 young" the first time somebody is born while they
    // are looking. One quantity, one place, and the place is the live one.
    return { creature: parent, rank: STAR.PARENT, why: "parent to more of this pond than anyone else" };
  }

  if (config.predation) {
    const hunters = alive.filter((c) => c.carnivory >= config.carnivoreThreshold);
    const hunter = best(hunters, (c) => c.radius);
    if (hunter) {
      return { creature: hunter, rank: STAR.HUNTER, why: "the biggest hunter in the water" };
    }
  }

  const midSize = median(alive.map((c) => c.radius));
  const giant = best(alive, (c) => c.radius);
  if (giant && midSize > 0 && giant.radius >= midSize * GIANT_RATIO) {
    return { creature: giant, rank: STAR.GIANT, why: "the largest animal here by some way" };
  }

  const midAge = median(alive.map((c) => c.age));
  const elder = best(alive, (c) => c.age);
  if (elder && midAge > 0 && elder.age >= midAge * ELDER_RATIO) {
    return { creature: elder, rank: STAR.ELDER, why: "the oldest animal in the pond" };
  }

  const fed = best(alive, (c) => c.energy);
  return { creature: fed, rank: STAR.FED, why: "the best-fed animal in the pond right now" };
}

/**
 * The whole introduction, as the two strings the banner shows.
 *
 * Kept beside `pickStar` rather than in `main.js` so the wording is something
 * `node --test` can read — the lesson v1.97, v1.98 and v1.108 each learned by
 * carving one more string-builder out of the module the suite cannot load.
 */
export function introduceStar(star, config, names = null) {
  if (!star) {
    return { title: "Nobody home", line: "The pond is empty — press ✚ Seed life to start it again." };
  }
  const c = star.creature;
  const why = star.why[0].toUpperCase() + star.why.slice(1);
  return {
    title: `👋 Meet ${creatureLabel(c, names)}`,
    line: `${why}. ${creatureIntro(c, config)}`,
  };
}
