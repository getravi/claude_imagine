// speciesnames.js — the lineages of this pond, called something a person can
// remember.
//
// The Tree of Life is the figure this project leads with, and for a hundred and
// fifteen releases every band in it was called "species 7". So was the chip in
// its legend, the link in the inspector, the pip in an ancestry row and the
// three lines the Chronicle writes about lineages — *"Species 12 has branched
// off species 7"*. That sentence is about the most interesting thing this world
// does, and it reads like a database.
//
// A number is the right identifier and the wrong name. It is dense (nothing
// distinguishes 7 from 9), it is unpronounceable in the sense that matters —
// you cannot tell a friend about species 7 an hour later — and, worst for the
// figure it labels, **it carries no family**. Species 12 descends from species 7
// and the two numbers say nothing about that; the plot draws the relationship in
// inherited hue and the words beside it throw it away.
//
// So a name here is two words and the first one is the family:
//
//     Amber Ripple          a founder
//     Amber Whorl           a lineage that branched off it
//     Amber Whorl → Amber Sprig, Amber Kite …   everything downstream
//     Slate Dart            somebody else entirely
//
// One glance at the legend now says which bands are cousins, which is a fact the
// figure has always contained and never stated. The plural is the family:
// *"the Amber Whorls are gone after ~14 generations"*.
//
// **Three properties, because a name that moves is worse than a number.**
//
//  1. *Deterministic.* Nothing here draws a random number. A name is a pure
//     function of the species ids and parent links in the tree, which are
//     themselves a pure function of `(seed, config)` — `Phylogeny` numbers from
//     zero per world, so reloading seed 314 tomorrow gives back the same Amber
//     Ripple. That is the second prime directive applied to a label: a name a
//     visitor cannot return to is not worth having.
//  2. *Unique.* Two living lineages never share a name, so a name can be used
//     the way the number was — as the thing you click. Uniqueness is not left
//     to a wide-enough hash; it is built by construction (see `pickFree`) and
//     pinned by a test.
//  3. *Outside the simulation.* This module is a pure observer in the sense
//     `describe.js` and `energy.js` are: it reads a list of `{id, parentId}`
//     and nothing in the world ever reads it back. No field is added to a
//     species, so no fingerprint can see this release.
//
// The hash exists only to *spread* the choice — an alphabetical march (species 0
// is Amber, species 1 is Ash) would be just as unique and would read like a
// numbering with extra steps.

/**
 * Family words. Sixty-four, so the forty founders of a default pond each get
 * their own and no two unrelated lineages are made to look like cousins. One
 * syllable or two, concrete, and none of them a plural.
 */
export const STEMS = Object.freeze([
  "Amber", "Ash", "Basalt", "Bracken", "Bramble", "Cinder", "Cobalt", "Copper",
  "Coral", "Dapple", "Dusk", "Ember", "Fen", "Flint", "Frost", "Garnet",
  "Glass", "Gloam", "Gorse", "Granite", "Hazel", "Heather", "Hollow", "Indigo",
  "Iron", "Ivory", "Jade", "Kelp", "Lichen", "Loam", "Marble", "Marsh",
  "Mica", "Mist", "Moss", "Nettle", "Ochre", "Onyx", "Opal", "Pearl",
  "Peat", "Pewter", "Quartz", "Reed", "Rush", "Rust", "Sable", "Saffron",
  "Salt", "Sedge", "Shale", "Silt", "Silver", "Slate", "Sorrel", "Spruce",
  "Storm", "Tansy", "Teal", "Thorn", "Tide", "Umber", "Willow", "Yarrow",
]);

/**
 * The second word, which distinguishes one branch of a family from another.
 * Thirty-two: a family with more branches than that living at once has never
 * happened here, and `pickFree` handles it anyway.
 *
 * Every one of these takes a plain `-s` plural, because the Chronicle talks
 * about lineages in the plural ("the Amber Whorls") and a special case in a
 * word list is a bug waiting for the release that adds "Moss" to it. There is
 * a test.
 */
export const EPITHETS = Object.freeze([
  "Wren", "Minnow", "Thistle", "Quill", "Drift", "Bloom", "Crest", "Dart",
  "Fin", "Frond", "Glider", "Husk", "Kite", "Lark", "Mote", "Plume",
  "Ripple", "Shoal", "Skimmer", "Spore", "Sprig", "Tuft", "Vane", "Whorl",
  "Wisp", "Barb", "Coil", "Ridge", "Scale", "Shard", "Spindle", "Tendril",
]);

/**
 * Spread an id over the word lists. A finalizer, not a generator: it holds no
 * state, draws nothing, and the same id gives the same word forever.
 * @param {number} n
 * @returns {number} a well-mixed unsigned 32-bit integer
 */
function mix(n) {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

/**
 * Pick the first word this species can have, starting where the hash points and
 * walking forward. Uniqueness by construction rather than by hoping a hash does
 * not collide: with 64 stems and 40 founders a birthday collision is not a rare
 * event, it is the *likely* one, and two unrelated founders sharing a family
 * name would be this module telling a lie about the tree.
 *
 * If every word is taken the hashed one is reused, which is the only graceful
 * answer left and is what the caller's own probe is there to catch.
 *
 * @param {ReadonlyArray<string>} words
 * @param {number} start where the hash points
 * @param {(word: string) => boolean} free
 * @returns {string}
 */
function pickFree(words, start, free) {
  for (let k = 0; k < words.length; k++) {
    const word = words[(start + k) % words.length];
    if (free(word)) return word;
  }
  return words[start % words.length];
}

/**
 * Name every lineage in a tree.
 *
 * Walked in id order, which is birth order, so a parent is always named before
 * its children and a child can simply take the family word its parent got. The
 * three ways a species can start (`speciesOrigin` in `phylogeny.js`) collapse to
 * two here: anything with a living parent link joins that family, and a founder
 * or a stranger reseeded into the pond starts one.
 *
 * @param {ReadonlyArray<{id:number, parentId:number|null}>} species
 * @returns {Map<number, {id:number, stem:string, epithet:string, name:string, plural:string}>}
 */
export function nameSpecies(species) {
  const named = new Map();
  const stemsUsed = new Set();
  const namesUsed = new Set();
  const ordered = [...species].sort((a, b) => a.id - b.id);

  for (const s of ordered) {
    const parent = s.parentId == null ? null : named.get(s.parentId);
    let stem;
    if (parent) {
      stem = parent.stem; // a branch keeps the family
    } else {
      stem = pickFree(STEMS, mix(s.id) % STEMS.length, (w) => !stemsUsed.has(w));
      stemsUsed.add(stem);
    }
    const start = mix(s.id ^ 0x5bf03635) % EPITHETS.length;
    const epithet = pickFree(EPITHETS, start, (w) => !namesUsed.has(`${stem} ${w}`));
    // Past 2,048 lineages in one pond both lists are exhausted and the id comes
    // back — an ugly name is a better failure than two lineages answering to
    // one, since the name is what a reader clicks.
    let name = `${stem} ${epithet}`;
    if (namesUsed.has(name)) name = `${name} ${s.id}`;
    namesUsed.add(name);
    named.set(s.id, { id: s.id, stem, epithet, name, plural: `${name}s` });
  }
  return named;
}

/**
 * What to call species `id` in a sentence about one lineage.
 *
 * Falls back to the old number when the map has never heard of the id, which is
 * the honest answer for a caller that has one and not the other — `describeMuller`
 * is reachable from tests that build a `shares` object and no tree.
 *
 * @param {Map<number, {name:string}>|null|undefined} names
 * @param {number} id
 */
export function speciesLabel(names, id) {
  const n = names && names.get(id);
  return n ? n.name : `species ${id}`;
}

/**
 * The same lineage as a group of animals: "the Amber Whorls". The Chronicle
 * writes about lineages doing things, and a lineage is a plural noun.
 *
 * @param {Map<number, {plural:string}>|null|undefined} names
 * @param {number} id
 */
export function speciesPlural(names, id) {
  const n = names && names.get(id);
  return n ? n.plural : `members of species ${id}`;
}
