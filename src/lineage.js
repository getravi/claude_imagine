// lineage.js — who this animal's parents were, by name, back to a founder.
//
// This page has said "family" in three different ways for a hundred releases
// and never once meant a *family*. The Tree of Life groups creatures into
// species by genetic similarity; the ancestry pips in the inspector are that
// tree's chain of clusters; the two-word lineage names are a colour and a
// shape. All three are populations. Not one of them answers the first question
// a person asks about an animal they have just been introduced to, which is not
// *which cluster is it in* but **whose child is it**.
//
// The pond has always known. `Creature.generation` counts the links — the
// inspector has printed "Generation 12" since v1.0 — and a 12 with nothing
// attached to it is the shape of every fact on this page that a visitor reads
// past. Twelve links, twelve animals that lived and had young and died, and
// the page could not name one of them.
//
// So: the family line. Under the heading, in plain words, oldest first —
//
//     Ash › … 8 more › Onyx › Juniper › **Pip**
//     Their family began with Ash, one of the forty animals this pond started
//     with.
//     Pip is built like Ash and no longer thinks like them — their brains are
//     further apart than this pond's own line between one kind of animal and
//     another.
//
// — and the last sentence is the point. Everything else this page says about
// evolution is a population statistic: a share, a mean, a band on a plot, a
// drift number. This is the same claim made about two animals a reader can
// name, and it is the version a person who does not already care about
// evolution can be made to care about.
//
// It is also the sentence that taught me what this pond does. I wrote it about
// bodies — grew, shrank, took to hunting — and the measurement said the bodies
// are nailed down: over 3,511 families, ninety per cent are within three per
// cent of their founder's size, and my "nothing much changed" ending fired
// **98.4% of the time**. Seventeen generations of evolution, reported as
// nothing having happened. What had happened was in their heads, and it moves
// a tenth of a species-gap per generation, near enough in a straight line. See
// `familyChange`.
//
// **PURE OBSERVER.** Nothing here is read by the simulation. The one change
// this module needed inside the pond is `Creature.parentId` — a number copied
// from a parent to its child in `reproduce()`, drawing no randomness, read by
// this file and by nothing else. It is declared as unhashed state in
// `fingerprint.js` for exactly the reason `id` is: an id comes from a
// module-level counter, so two identical ponds in one process never agree
// about it.
//
// ### Why the store is bounded without a cap
//
// v1.137's rule — *a store that exists to answer one surface should be bounded
// by that surface's question, not by a number I chose* — and here the question
// is asked about a **living** creature, because the panel clears the moment its
// subject dies. So the map holds one node per living animal and is pruned to
// the living on every step; population is its bound, and there is no constant
// to pick.
//
// What keeps the *dead* ancestors alive is that each node holds a reference to
// its parent's node. A chain is therefore exactly as long as some living
// animal needs it to be, and the day the last of a line dies the whole line
// becomes garbage in the ordinary way, all at once, with no sweep of mine
// deciding it. This is the first store here that is bounded by the language
// rather than by a rule I wrote — which is worth noticing, because a rule I
// write is a rule that can drift and a reference that nothing holds cannot.
//
// ### What it cannot know, and says so
//
// A pond restored from a save has no family. `Creature.toJSON` carries the
// generation and not the parent, deliberately: ids come from a counter that
// renumbers on load, so a saved `parentId` would point at a stranger. A loaded
// animal is therefore the 12th generation of a line whose first eleven are not
// on record, and the panel says that in words rather than drawing a chain of
// one and calling it a founder.
//
// One thing this does not engineer around: there are sixty-four given names
// and a shown chain is four long, so about one family in twenty-one has two
// adjacent links with the same name. Real families do that too.

import { DIET_CLAUSE_ONE, dietBand, givenName } from "./cast.js";
import { DIET_PAST } from "./obituary.js";
import { DEFAULT_CONFIG } from "./config.js";

/**
 * How many of the most recent links the chain shows by name: the animal
 * itself, its parent, and its parent's parent.
 *
 * Three because the founder is drawn separately at the other end, so a chain is
 * four names and one marker wide — which wraps to two rows in the inspector
 * column at a laptop width and is meant to: the alternative is eliding a
 * grandparent to keep a straight line, and the row exists to be *read* rather
 * than to be a shape. Everything between the founder and the grandparent
 * collapses into one "… n more".
 */
export const FAMILY_CRUMBS = 3;

/** A body must differ from its ancestor's by this much before size is the story. */
export const SIZE_MOVE = 1.15;

/**
 * How far a family's brains have drifted, in units of the pond's own line
 * between one kind of animal and another (`speciationDistance`) — the bands the
 * last sentence of the block is banded on.
 *
 * These are not thresholds I picked out of a feeling. Twelve seeds, four
 * thousand steps, 3,511 families: the distance between an animal's brain and
 * its founder's rises **almost exactly one tenth of a species-gap per
 * generation** — median 0.11 at one link, 0.53 at five, 1.00 at ten — so the
 * quarters below cut the population into bands that are, near enough, *how many
 * generations you are looking at*. The shares that fall in each: 8.2% / 25.8% /
 * 38.9% / 21.7% / 5.4%.
 */
export const DRIFT_BANDS = Object.freeze([0.25, 0.5, 0.75, 1]);

/**
 * The pond's family records: one node per living creature, each pointing at its
 * parent's node.
 *
 * Stepped once per *step*, never once per frame, for `trail.js`'s and
 * `memorial.js`'s reason: at 20× a frame is twenty ticks, and a birth observed
 * once a frame is nineteen births out of twenty whose parent link is lost for
 * good.
 */
export class Lineage {
  constructor() {
    /** @type {Map<number, FamilyNode>} living creature id → its node */
    this.byId = new Map();
  }

  /** Forget everything — a new pond has a new counter and new families. */
  forget() {
    this.byId.clear();
  }

  /** How many animals are on record right now (the living, by construction). */
  get size() {
    return this.byId.size;
  }

  /**
   * One step's worth of bookkeeping: enrol the newborns, refresh the living,
   * drop the dead.
   *
   * The order matters in exactly one case and it is the common one. A parent
   * can reproduce and die inside the same step, so its child is enrolled while
   * the parent's node is still in the map, and only then is the map pruned —
   * at which point the child's node is the one thing holding its parent's, and
   * the line survives its founder's death, which is the entire job.
   *
   * @param {{tick:number, creatures:Array<object>}} world
   */
  observe(world) {
    const tick = world.tick;
    for (const c of world.creatures) {
      let node = this.byId.get(c.id);
      if (!node) {
        node = {
          id: c.id,
          generation: c.generation,
          // Exact rather than approximate: `tick` is the step this animal was
          // first seen on, which is the step after the one it was born in when
          // the pond is running fast enough for that to differ.
          born: tick - c.age,
          // The heritable body, frozen at first sight. It never moves — a
          // creature's radius, diet and hue are decoded from its genome in the
          // constructor and no rule in this world edits them — so this is a
          // copy for the sake of outliving the body rather than a snapshot of
          // something in flight.
          radius: c.radius,
          carnivory: c.carnivory,
          hue: c.hue,
          speciesId: c.speciesId,
          // The genome itself, by reference and never copied. A genome is
          // written once in a constructor and never edited again — a child is
          // a *new* genome, and what plasticity learns it learns in
          // `brain.w` — so a reference is a snapshot here, and holding one
          // costs the two kilobytes it was already costing while its owner
          // was alive.
          genome: c.genome,
          // These two do move, and are refreshed below every step this animal
          // is alive, so what a dead ancestor's node carries is the last true
          // reading rather than a birth value.
          age: c.age,
          children: c.children,
          parent: c.parentId == null ? null : this.byId.get(c.parentId) || null,
          seen: tick,
        };
        this.byId.set(c.id, node);
        continue;
      }
      node.age = c.age;
      node.children = c.children;
      node.speciesId = c.speciesId;
      node.seen = tick;
    }
    // Prune to the living. Deleting from a Map while iterating it is defined
    // behaviour: an entry removed before the walk reaches it is simply not
    // visited.
    for (const [id, node] of this.byId) {
      if (node.seen !== tick) this.byId.delete(id);
    }
  }

  /**
   * One animal's line, youngest first: the creature, its parent, and so on back
   * to the oldest link this pond has on record.
   *
   * Empty for a creature this store has never seen — which is every creature,
   * for exactly one frame after a reset, and forever for one the caller built
   * outside a world.
   *
   * @param {{id:number}} c
   * @returns {FamilyNode[]}
   */
  chainFor(c) {
    /** @type {FamilyNode[]} */
    const out = [];
    let node = c ? this.byId.get(c.id) : undefined;
    while (node) {
      out.push(node);
      node = node.parent;
    }
    return out;
  }
}

/**
 * The size clause, as a comparison rather than a measurement.
 *
 * Six bands and no number, because this sentence sits directly under
 * `creatureIntro`, which has held itself to "no unit appears in it" since
 * v1.119 — no pixels, no ticks, no gene between zero and one — and a paragraph
 * that keeps that bar in its first sentence and breaks it in its second has
 * not kept it. `test/lineage.test.js` holds this file to the same bar
 * `test/cast.test.js` holds that one to.
 */
function sizePhrase(ratio) {
  if (ratio >= 2) return "twice the animal";
  if (ratio >= 1.5) return "half again the animal";
  if (ratio >= SIZE_MOVE) return "a bigger animal than";
  if (ratio <= 0.5) return "half the animal";
  if (ratio <= 1 / 1.5) return "two-thirds the animal";
  if (ratio <= 1 / SIZE_MOVE) return "a smaller animal than";
  return "";
}

/**
 * How far two animals' brains have drifted apart, measured in the pond's own
 * line between one kind of animal and another.
 *
 * `speciationDistance` is the number `phylogeny.js` uses to decide whether a
 * newborn joins its parent's group or founds a new one, so 1.0 here is not an
 * analogy: it is *exactly* as far apart as two animals this pond would file
 * separately. Reusing the world's constant rather than inventing a scale is
 * this project's third-time-lucky habit (v1.125, v1.137, v1.142) — the number I
 * was about to pick already existed.
 */
export function brainDrift(a, b, config = DEFAULT_CONFIG) {
  return a.genome.distance(b.genome) / config.speciationDistance;
}

/**
 * What changed down the line, in one sentence.
 *
 * **This function is where I found out what this pond actually does.** I wrote
 * it expecting bodies: a family that grew, a family that turned to hunting, a
 * taste for meat creeping up. Then I measured 3,511 families over twelve seeds
 * and four thousand steps, and the bodies are *nailed down* — the size of an
 * animal against its founder's sits between 0.97 and 1.03 for ninety per cent
 * of them, the diet gene moves by less than a tenth for ninety-nine, and the
 * sentence I had written fired its "nothing much changed" ending **98.4% of the
 * time**. Which was true, and was also me telling a visitor that seventeen
 * generations of evolution had produced nothing.
 *
 * It had not. The brains had gone a very long way — a tenth of a species-gap
 * per generation, near enough dead straight — and the block was reporting the
 * one part of an animal that selection here barely touches. So the last branch
 * is not a shrug any more, it is the finding: **they are built the same and
 * they no longer think the same**, which is both the honest answer and much the
 * more interesting one.
 *
 * The order in front of it stands, because a body that *did* move is rarer and
 * louder: a diet that crossed a band is a different kind of animal (1.3% of
 * families), and a body an eighth bigger or smaller is the next most visible
 * thing on the canvas (0.3%). Everything else — 98.4% — is a brain.
 *
 * @param {FamilyNode} old the oldest link on record
 * @param {FamilyNode} self the animal in the panel
 * @param {object} config
 */
export function familyChange(old, self, config = DEFAULT_CONFIG) {
  const them = givenName(self.id);
  const they = givenName(old.id);
  const oldBand = dietBand(old, config);
  const newBand = dietBand(self, config);
  if (oldBand !== newBand) {
    return `${them} ${DIET_CLAUSE_ONE[newBand]}; ${they} ${DIET_PAST[oldBand]}.`;
  }
  const phrase = sizePhrase(old.radius === 0 ? 1 : self.radius / old.radius);
  if (phrase) return `${them} is ${phrase} ${they} ever was.`;
  // Neither the body nor the diet moved, which is the ordinary case and the
  // guard that lets the next sentence say "built like": a reader is only told
  // the bodies match after two thresholds have agreed that they do.
  const drift = brainDrift(old, self, config);
  if (drift >= DRIFT_BANDS[3]) {
    return (
      `${them} is built like ${they} and no longer thinks like them — their ` +
      `brains are further apart than this pond's own line between one kind of ` +
      `animal and another.`
    );
  }
  if (drift >= DRIFT_BANDS[2]) {
    return `${them} is built like ${they}. What has changed is in their head, and it has changed a long way.`;
  }
  if (drift >= DRIFT_BANDS[1]) {
    return `${them} is built like ${they}. What has changed is in their head, and it is well on its way.`;
  }
  if (drift >= DRIFT_BANDS[0]) {
    return `${them} is built like ${they}, and has begun to think a little differently.`;
  }
  return `${them} is still near enough the animal ${they} was, inside and out.`;
}

/**
 * The whole block: a row of names, a sentence placing the animal in its family,
 * and a sentence about what the family did.
 *
 * Returns null for a creature with no record at all, which is the caller's
 * signal to draw nothing rather than to draw an empty family.
 *
 * @param {FamilyNode[]} chain youngest first, as `Lineage#chainFor` returns it
 * @param {object} config
 */
export function familyStory(chain, config = DEFAULT_CONFIG) {
  if (!chain || chain.length === 0) return null;
  const self = chain[0];
  const name = givenName(self.id);

  // A founder, and the only case where having no parent is the whole story
  // rather than a gap in the records.
  if (chain.length === 1 && self.generation === 0) {
    return {
      line:
        `${name} is one of the ${config.populationStart} animals this pond ` +
        `began with — the start of a family, not yet a link in one.`,
      crumbs: [],
      change: null,
    };
  }

  // Generation counted, parents not: a pond restored from a save. Say which of
  // the two silences this is (v1.137's rule about a gap in what is known
  // against a gap in what was kept) rather than drawing a one-link chain and
  // letting it read as a founder.
  if (chain.length === 1) {
    return {
      line:
        `Their parents are not on record: this pond was loaded from a saved ` +
        `world, and a save keeps the animals without keeping who their ` +
        `parents were.`,
      crumbs: [],
      change: null,
    };
  }

  const old = chain[chain.length - 1];
  const shown = chain.slice(0, FAMILY_CRUMBS).reverse();
  const behind = chain.length - shown.length;
  /** @type {Array<{name?:string, founder?:boolean, self?:boolean, elided?:number}>} */
  const crumbs = [];
  if (behind > 0) {
    crumbs.push({ name: givenName(old.id), founder: old.generation === 0 });
    if (behind > 1) crumbs.push({ elided: behind - 1 });
  }
  for (const node of shown) {
    crumbs.push({
      name: givenName(node.id),
      founder: node.generation === 0,
      self: node === self,
    });
  }

  // v1.143's rule, and this block is where it bit: the sentence directly above
  // (`creatureIntro`) already ends "…and are the 17th generation of their
  // family", so a line opening with the rank again says the panel's own last
  // clause back to it, one line lower, in the same words. What that sentence
  // cannot say is *whose* family, which is the half worth the space.
  const line =
    old.generation === 0
      ? `Their family began with ${givenName(old.id)}, one of the ` +
        `${config.populationStart} animals this pond started with.`
      : `${givenName(old.id)} is as far back as this pond can still see — ` +
        `everything before them was already over when it started keeping records.`;

  return { line, crumbs, change: familyChange(old, self, config) };
}

/**
 * @typedef {object} FamilyNode
 * @property {number} id
 * @property {number} generation
 * @property {number} born
 * @property {number} radius
 * @property {number} carnivory
 * @property {number} hue
 * @property {number} speciesId
 * @property {object} genome
 * @property {number} age
 * @property {number} children
 * @property {FamilyNode|null} parent
 * @property {number} seen
 */
