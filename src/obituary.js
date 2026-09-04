// obituary.js — what happened to the animal you were watching.
//
// v1.119 gave this pond a cast: every creature has a name, and `👋 Meet
// somebody` hands a first-time visitor the one worth watching. It closed by
// naming the thing it had not built:
//
//   > **The star is a pick, not a follow.** Meet somebody, watch them for two
//   > minutes, and they die, and the panel goes back to a hint. Nothing tells
//   > you *what happened to them* — the Chronicle narrates lineages and the
//   > pond, never an individual, and the one animal a visitor has been given a
//   > reason to care about is the one thing this page has no obituary for.
//
// This is that. When the creature in the inspector dies, the panel does not
// blank — it writes a short life. Who they were, what killed them, whether they
// had a long life by this pond's standards, what they ate, and what they left.
//
// Four design rules, three of them borrowed from something already here and one
// of them found by measuring the first build of this card:
//
//  1. **No units, no jargon.** The same bar `headline.js` and `cast.js` hold
//     themselves to, checked the same way in `test/obituary.test.js`. A life is
//     not *412 ticks* and a body is not *5.1 px*; those are numbers for
//     somebody already here. Age is therefore said as a **comparison with the
//     pond's other dead**, which is both plainer and more informative than the
//     number would have been — *"they lived far longer than most here"* is a
//     fact about this animal, where 412 is a fact about the simulation's clock.
//  2. **The subject is not in its own comparison.** The window this card reads
//     is `Stats.recentDeaths`, and the newest thing in it is the very death
//     being reported. Comparing a life to a middle it is part of drags every
//     verdict toward *about average* — with one prior death the ratio is pinned
//     near 1 no matter how long the animal lived. So `obituaryFor` drops one
//     entry of its own age first, which is exact whenever the subject is in the
//     window and harmless when it is not (dropping some other animal of the
//     same age leaves the same multiset).
//  3. **"Most here" is a median, and the measurement that fixed it found
//     something else.** The first build of this card divided by the window's
//     *mean* age, because that is the number `Stats.mortality()` already
//     reports. The word in the sentence is *most*, so the statistic has to be
//     the one *most* is about, and the median is now what it divides by — but
//     the sweep run to confirm that came back with the sign the wrong way
//     round, which is the finding. Over six ponds, **61.3% of deaths between
//     ticks 1,000 and 6,000 outlive the middle of the window they are measured
//     against**, and against the mean it was 56.5%. Half of anybody cannot be
//     longer-lived than most of them — unless the *most* is a different set,
//     and it is: `recentDeaths` is a rolling window of the last few hundred
//     bodies, so this card compares a life with **the recent past** rather than
//     with the run. A pond whose animals are still learning to eat buries
//     shorter lives than it is about to, and more than half of them really do
//     beat what came before. It settles as the pond does: the same sweep reads
//     53.6% between ticks 10,000 and 12,000. Both numbers are lower against the
//     mean, which is the ordinary right skew of a pond where most of what dies
//     is a newborn that never fed — and lower for the wrong reason, since a
//     mean's answer to *most* is only ever accidentally right.
//  4. **It is a snapshot, not a reference.** The record is plain data copied out
//     of the creature at the moment of death. The creature object is off the
//     world's list by then and about to be collected; a panel holding the body
//     itself would be the one place on this page keeping a dead thing alive.
//  5. **The family is not in the snapshot** (v1.151). The card had said *they
//     left three young behind* since v1.121 and never said **who**, so the one
//     door out of a death was `👋 Meet somebody else` — a stranger. It now
//     names the parent and the young who are still swimming, and offers one of
//     them. That is deliberately *not* copied in at the moment of death, for
//     v1.139's reason: who is alive is still readable off the pond at the
//     instant a reader looks, a remembered list is a second copy of a fact that
//     can disagree with the first, and this card is re-shown out of the book of
//     the dead minutes later, when a snapshot would be quietly false. See
//     `familyOf`, which takes the living and is called at every rebuild.
//
// ### What it is worth, measured
//
// Over twelve seeds and six thousand ticks, **31.7% of all deaths leave a
// living child** — which very nearly killed this, until the population was
// split the way v1.135 says to split one. The card is only ever read about an
// animal this page has **pointed at** (met, starred, plated, pressed), and
// those die at a median age of 3,885 against 1,177 for everybody else: **59.1%
// of them leave a living child**, against 30.0% for the rest of the pond. The
// obituaries a visitor actually reads are the ones with a family in them.
//
// Determinism: nothing here reads or writes the simulation, and nothing draws a
// random number. It is a rendering of a creature that has already died, exactly
// like `inspect.js`'s rows and `describe.js`'s sentence, and like them it is a
// pure observer — a pond nobody is watching is bit-for-bit a pond with a card
// on the panel.

import { DEFAULT_CONFIG } from "./config.js";
import { creatureLabel, dietBand, givenName, ordinal } from "./cast.js";
import { inspectorSwatch } from "./palette.js";

/**
 * What each way of dying is called, in words, and the mark that goes with it.
 *
 * A table rather than a chain of `if`s, for `cast.js`'s reason: an ordering — or
 * here a vocabulary — that lives in the order the branches happen to be typed
 * in is one nobody can argue with. The keys are the causes `Creature.die` sets,
 * and `test/obituary.test.js` checks this covers every one of them, so a fourth
 * way to die cannot ship with no sentence for it.
 *
 * Written for *they*, like every other sentence about a creature here.
 */
export const CAUSES = Object.freeze({
  starvation: { icon: "🥀", line: "They ran out of food." },
  age: { icon: "🕯️", line: "They died of old age." },
  predation: { icon: "🩸", line: "They were caught and eaten." },
});

/** The heading and the sentence for a death with no cause the table knows. */
export const UNKNOWN_CAUSE = Object.freeze({ icon: "🕯️", line: "They died." });

/**
 * How long a life was, said against the pond's other dead.
 *
 * Read top down and the first band whose `from` the ratio clears wins, so the
 * table is the ordering. `from: 0` is the floor and must be last — a ratio is
 * never negative, so every life lands somewhere.
 */
export const LONGEVITY = Object.freeze([
  { from: 1.5, line: "They lived far longer than most here." },
  { from: 1.1, line: "They lived longer than most here." },
  { from: 0.9, line: "They lived about as long as most here." },
  { from: 0.5, line: "They died younger than most here." },
  { from: 0, line: "They died far younger than most here." },
]);

/** Said instead, when this pond has buried nobody else to measure a life against. */
export const FIRST_DEATH = "They were the first here to die.";

/** The past-tense diet clause for each of `cast.js`'s three bands. */
export const DIET_PAST = Object.freeze({
  meat: "lived on meat",
  mixed: "ate a bit of everything",
  plants: "grazed on plants",
});

/** The middle value of a list of numbers; null for an empty one. */
function median(xs) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Copy a life out of a creature that has just died.
 *
 * @param {object} creature the body, already `dead`, with `deathCause` set
 * @param {Map<number, {plural:string}>|null} [names] the tree's family names
 * @param {Array<{age:number}>} [deaths] `Stats.recentDeaths`, newest last
 * @returns {object} plain data — nothing here refers back to the creature
 */
export function obituaryFor(creature, names = null, deaths = []) {
  // The subject's own death out of the window first (rule 2 in the header).
  // `lastIndexOf` rather than a filter: one entry, and the newest match, which
  // is the one this death just pushed.
  const ages = deaths.map((d) => d.age);
  const mine = ages.lastIndexOf(creature.age);
  if (mine >= 0) ages.splice(mine, 1);

  return {
    id: creature.id,
    label: creatureLabel(creature, names),
    hue: creature.hue,
    cause: creature.deathCause,
    age: creature.age,
    generation: creature.generation,
    children: creature.children,
    // The one link out of this record, and a number rather than a body for the
    // same reason everything else here is: `familyOf` turns it into a name.
    // Null for a founder, and null for every animal in a pond restored from a
    // save — `Creature.toJSON` deliberately drops the link, because ids
    // renumber on load and a kept one would point at a stranger.
    parentId: creature.parentId ?? null,
    carnivory: creature.carnivory,
    peers: ages.length,
    // The middle of the pond's dead, not their mean — rule 3 in the header.
    peerTypical: median(ages),
  };
}

/** The heading mark and sentence for a record's cause of death. */
export function causeOf(record) {
  return CAUSES[record.cause] ?? UNKNOWN_CAUSE;
}

/**
 * How this life measured up, in words.
 *
 * A `peerTypical` of zero or less is treated as no comparison at all rather
 * than as a divide: a window whose middle animal died at age zero says nothing
 * about how long anybody lived, and `Infinity` is not a verdict.
 */
export function longevityLine(record) {
  if (record.peers === 0 || !(record.peerTypical > 0)) return FIRST_DEATH;
  const ratio = record.age / record.peerTypical;
  for (const band of LONGEVITY) if (ratio >= band.from) return band.line;
  return LONGEVITY[LONGEVITY.length - 1].line;
}

/**
 * The life, as the sentences a person reads. Nothing in here carries a unit.
 *
 * The order is the order a person asks: how did it end, was that soon, what
 * kind of animal was this, and what is left of them.
 */
export function obituaryLines(record, config = DEFAULT_CONFIG, family = null) {
  const cause = causeOf(record);
  const diet = DIET_PAST[dietBand(record, config)];
  const born =
    record.generation === 0
      ? "were among the first here"
      : `were the ${ordinal(record.generation + 1)} generation of their family`;
  // *So the line goes on* was written in v1.121, when this page could not check
  // it, and the first browser walk of the family put it directly above **None
  // of their young are still swimming** — one card, two opposite claims. It was
  // never a fact about the young this animal had; it is a fact about who is in
  // the water, and 29.2% of the deaths that had any young at all had already
  // outlived every one of them. So the clause is dropped exactly when the pond
  // says otherwise, and kept whenever nobody has asked (`family` null).
  const kept = family ? family.young.length : null;
  const goesOn = kept === 0 ? "" : ", so the line goes on";
  const left =
    record.children === 0
      ? "They left no young, so their line ends here."
      : record.children === 1
        ? `They left one young behind${goesOn}.`
        : `They left ${record.children} young behind${goesOn}.`;

  return {
    title: `${cause.icon} ${record.label}`,
    sentences: [`${cause.line} ${longevityLine(record)}`, `They ${diet} and ${born}.`, left],
  };
}

/**
 * How many, in words — the card counts young the way a person says it, and no
 * sentence on this page begins with a numeral.
 *
 * The list runs to twelve because the count it has to cover is *living young at
 * the instant a parent dies*, and over 5,290 deaths across twelve seeds the
 * largest was **ten** (1,679 deaths left any at all, a mean of 1.68). Past the
 * end of the list the sentence still carries the number, in `nameList`'s "and N
 * more" — `Many` is the only word here that gives one up, and it is a word for
 * a pond nobody has seen.
 */
const COUNTS = Object.freeze([
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
]);
function countWord(n) {
  return COUNTS[n] ?? "Many";
}

/** At most this many of the young are named; the rest are "and N more". */
export const FAMILY_NAMES_SHOWN = 3;

/**
 * Who is left of this animal's family, read off the pond **now**.
 *
 * Takes the living creatures rather than a remembered list (rule 5 in the
 * header). The young are ordered eldest first, which is just id order: ids come
 * from a counter, so an animal born earlier is numbered lower.
 *
 * On which young to offer, since a card can only lead somewhere once: v1.133
 * found that picking the *oldest living member of a bloodline* sorts on exactly
 * the axis that kills it (88.8% of those picks survive sixty steps, against
 * 97.9% for the newest). That does not transfer to siblings, and it was worth
 * checking rather than assuming — over 659 deaths that left two or more young,
 * the eldest is still there sixty steps later **93.0%** of the time and the
 * youngest **92.3%**. Nothing to choose between them, so the card offers the
 * eldest, which is the one a person means by *their eldest*.
 *
 * @param {object} record a life, as `obituaryFor` wrote it
 * @param {Array<object>} creatures the world's living creatures
 */
export function familyOf(record, creatures = []) {
  const young = [];
  let parentAlive = false;
  const parentId = record.parentId ?? null;
  for (const c of creatures) {
    if (c.dead) continue;
    if (c.parentId === record.id) young.push(c.id);
    if (parentId !== null && c.id === parentId) parentAlive = true;
  }
  young.sort((a, b) => a - b);
  return {
    parentId,
    parentName: parentId === null ? null : givenName(parentId),
    parentAlive,
    young,
    youngNames: young.map(givenName),
  };
}

/**
 * A list of names as a person reads one: `Vale`, `Vale and Wren`, `Vale, Wren
 * and 2 more`.
 *
 * Names are *not* unique in this pond and a family is where that shows. There
 * are sixty-four given names and `givenName` is a scramble of the id, so a
 * litter of six draws six of them with replacement: the first browser walk of
 * this card read **"Quill, Arlo, Quill and 3 more"** — two different animals,
 * one word, and a reader with no way to tell that apart from a stutter. So a
 * name already printed is skipped and the next one is shown in its place. The
 * count is never touched by that, because it comes from the length of the list
 * and not from the names: six young are six young whatever they are called.
 *
 * v1.146 met the same collision in the family *chain* and deliberately let it
 * stand — "real families do that too" — and both calls are right, because the
 * two lists are read differently. A repeated name down a chain of ancestors is
 * a grandmother's name coming round again, which is a thing families do. A
 * repeated name inside one comma list is a typo.
 */
export function nameList(names, shown = FAMILY_NAMES_SHOWN) {
  const seen = new Set();
  const distinct = [];
  for (const n of names) {
    if (seen.has(n)) continue;
    seen.add(n);
    distinct.push(n);
    if (distinct.length === shown) break;
  }
  const extra = names.length - distinct.length;
  if (extra > 0) return `${distinct.join(", ")} and ${extra} more`;
  if (distinct.length <= 1) return distinct.join("");
  return `${distinct.slice(0, -1).join(", ")} and ${distinct[distinct.length - 1]}`;
}

/**
 * The family, as the sentences a person reads. Never a number without a name
 * attached to it — the count on its own is what the card already said.
 *
 * Silent about a parent it cannot name (a founder, or a restored pond), and
 * silent about the young when there never were any, because the third sentence
 * of the life has already said the line ends here.
 */
export function familyLines(record, family) {
  const lines = [];
  if (family && family.parentName) {
    lines.push(
      family.parentAlive
        ? `Their parent, ${family.parentName}, is still swimming here.`
        : `Their parent was ${family.parentName}.`
    );
  }
  const kept = family ? family.young.length : 0;
  if (kept > 0) {
    const names = nameList(family.youngNames);
    lines.push(
      kept === 1
        ? `One of their young is still swimming: ${names}.`
        : `${countWord(kept)} of their young are still swimming: ${names}.`
    );
  } else if (record.children > 0) {
    lines.push("None of their young are still swimming.");
  }
  return lines;
}

/** The card, as the panel's markup. Both buttons are wired by `main.js`. */
export const OBITUARY_MEET_ID = "obit-meet";
/** The offer of one of their young. Absent when none of them are left. */
export const OBITUARY_CHILD_ID = "obit-child";

export function obituaryHTML(record, config = DEFAULT_CONFIG, family = null) {
  const { title, sentences } = obituaryLines(record, config, family);
  const kin = familyLines(record, family);
  // The offer only exists when there is somebody to offer. A card that leads
  // nowhere keeps the one door it has always had; a button naming an animal
  // that is not there would be worse than no button (v1.129's rule).
  const heir = family && family.young.length > 0 ? family.youngNames[0] : null;
  const meetHeir = heir
    ? `<button id="${OBITUARY_CHILD_ID}" type="button" data-id="${family.young[0]}">👋 Meet ${heir}</button>`
    : "";
  // The swatch is the same mark the inspector puts beside a living creature's
  // name, carrying its own colour for the same reason (see `inspectorview.js`):
  // it is how a reader knows this card is about the animal they were watching
  // and not about somebody else.
  const sw = inspectorSwatch(record.hue);
  return `
    <div class="obit">
      <div class="insp-row"><span class="swatch" style="background:${sw.fill};color:${sw.glow}"></span>
        <strong title="creature ${record.id}">${title}</strong></div>
      ${sentences.map((s) => `<p>${s}</p>`).join("\n      ")}
      ${kin.length ? `<p class="obit-kin">${kin.join(" ")}</p>` : ""}
      ${meetHeir}
      <button id="${OBITUARY_MEET_ID}" type="button">👋 Meet somebody else</button>
    </div>`;
}
