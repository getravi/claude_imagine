// pondname.js — this pond, called something a person can say out loud.
//
// Every world here has an identity and it is a number. The field in the panel
// says `Seed`, the permalink says `#seed=42`, the Reset button rebuilds it and
// the whole promise of the project — *the same seed always grows the same
// pond* — is a sentence with an integer in the middle of it. That is the right
// **identifier** and it has never once been a **name**.
//
// The difference is what a visitor can do with it. Nobody has ever told a
// friend about seed 1837465. Nobody has ever come back to a browser tab reading
// "Vivarium" and known which of their three ponds it was. A number cannot be
// remembered, cannot be recognised at a glance in a tab strip, and cannot be
// said in a sentence — and this page has spent eighteen releases teaching
// itself to be legible to somebody who arrived by accident, while the thing
// they are looking at stayed anonymous.
//
// So a pond is a **place**, and places have names:
//
//     Western Mere          seed 314, the pond this page opens on
//     Sleeping Millpond     seed 42
//     Patient Backwater     seed 1837465
//
// **Three decisions, and each one is the answer to a way this could go wrong.**
//
//  1. *A pond is an adjective and a landform, and a lineage is two nouns.*
//     `speciesnames.js` already names things here — Amber Ripple, Slate Dart —
//     and the family word is the first one, so cousins read as cousins. If a
//     pond could be called "Slate Tarn" a reader would have every reason to
//     think the water was somehow kin to the Slate Darts swimming in it. The
//     two vocabularies are therefore disjoint *and of different word classes*,
//     which is a stronger guarantee than disjointness alone: no adjective is
//     ever a family, and no landform is ever a branch. There is a test.
//
//  2. *The name is a function of the seed alone, not of the config.* Tempting
//     to fold the rules in — a pond with hunting switched off is arguably a
//     different world — and wrong twice over. The sliders move continuously, so
//     a name that read the config would rename itself under a dragging finger,
//     and the seed is already the identity every other surface here uses. A
//     place keeps its name when the weather changes.
//
//  3. *A name is a handle, never an identifier.* 48 × 32 = 1,536 names against
//     an unbounded seed space, so two ponds can share one, and the sweep in
//     `test/pondname.test.js` says exactly how soon: the first repeat is
//     **seed 62, which is seed 34's Nameless Ford** — the birthday problem
//     arriving inside the first hundred seeds a human would ever type, and 96
//     distinct names for those hundred. That is fine, and it is why the seed is
//     printed on the plate beside the name rather than replaced by it.
//     `speciesnames.js` buys uniqueness by construction because a lineage name
//     is a thing you *click*; nothing here is clicked, so nothing here needs
//     it. What the mixer does buy is the absence of *local* structure: over a
//     hundred thousand seeds, two neighbours share a name 69 times against a
//     chance expectation of 65.1, so seeds a visitor steps through with the
//     arrows are no more alike than strangers.
//
// Nothing in this module draws a random number, reads the world, or is read
// back by it. It is a pure function of an integer — the second prime directive
// applied to a label, exactly as `speciesnames.js` states it: a name a visitor
// cannot return to tomorrow is not worth having.

/**
 * The first word. Forty-eight adjectives, because an adjective is a word class
 * no lineage name in this project uses — see decision 1 above. Concrete or
 * atmospheric, never evaluative about the *simulation* (a pond called
 * "Successful Tarn" would be a claim, and this module cannot see the water).
 */
export const ADJECTIVES = Object.freeze([
  "Quiet", "Hidden", "Sunken", "Shallow", "Still", "Restless", "Wandering", "Whispering",
  "Sleeping", "Waking", "Singing", "Shining", "Glimmering", "Wintering", "Sunlit", "Moonlit",
  "Starlit", "Windward", "Northern", "Southern", "Eastern", "Western", "Upper", "Lower",
  "Little", "Great", "Broad", "Narrow", "Crooked", "Winding", "Tangled", "Braided",
  "Nameless", "Forgotten", "Drowsy", "Patient", "Stubborn", "Sheltered", "Merry", "Sombre",
  "Solemn", "Lucky", "Hungry", "Generous", "Bitter", "Sweet", "Clear", "Murky",
]);

/**
 * The second word. Thirty-two landforms, every one of them somewhere water
 * collects or runs. None of them appears in `STEMS` or `EPITHETS` — the three
 * that would have (`Hollow`, `Fen`, `Marsh`) are family words for lineages and
 * are left to them.
 */
export const LANDFORMS = Object.freeze([
  "Tarn", "Mere", "Shallows", "Basin", "Pool", "Spring", "Narrows", "Flats",
  "Bay", "Creek", "Brook", "Lagoon", "Delta", "Bayou", "Backwater", "Millpond",
  "Waterhole", "Oxbow", "Inlet", "Cove", "Lake", "Pond", "Reach", "Bend",
  "Eddy", "Ford", "Weir", "Glen", "Dell", "Vale", "Meadow", "Glade",
]);

/**
 * Spread a seed over the word lists. The same finalizer `speciesnames.js` uses,
 * and for the same reason: it is a mixer, not a generator — it holds no state,
 * draws nothing, and the same input gives the same word forever. An
 * alphabetical march would be just as deterministic and would put seeds 0, 1
 * and 2 in the same corner of the vocabulary, which is a numbering with extra
 * steps.
 *
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
 * The seed as this module is willing to use it. A seed reaches the page from a
 * URL hash (`parseInt`, so `#seed=banana` is `NaN`) and from a number input a
 * visitor can type `-3` or `1e21` into, and a name that throws on the way to a
 * heading takes the whole page with it. Everything that is not a finite number
 * is pond zero.
 *
 * `>>> 0` here is not defensive rounding, it is *agreement*: `RNG` narrows its
 * seed the same way on the same line of its own constructor, so seed −1 and
 * seed 4,294,967,295 are one pond in the water and one name on the plate. A
 * label that disagreed with the simulation about which worlds are the same
 * world would be worse than no label. There is a test, and it compares the two
 * rather than restating either.
 *
 * @param {unknown} seed
 * @returns {number} a 32-bit unsigned integer
 */
function normalise(seed) {
  const n = typeof seed === "number" ? seed : Number(seed);
  return Number.isFinite(n) ? Math.trunc(n) >>> 0 : 0;
}

/**
 * What to call the pond grown from this seed.
 *
 * @param {number} seed
 * @returns {{seed: number, adjective: string, landform: string, name: string}}
 */
export function pondName(seed) {
  const n = normalise(seed);
  // Two draws off one mixer would correlate the halves — seeds one apart would
  // walk both lists in step — so the second word is mixed from a different
  // point in the input space, exactly as an epithet is in `speciesnames.js`.
  const adjective = ADJECTIVES[mix(n) % ADJECTIVES.length];
  const landform = LANDFORMS[mix(n ^ 0x5bf03635) % LANDFORMS.length];
  return { seed: n, adjective, landform, name: `${adjective} ${landform}` };
}

/**
 * The browser tab. A visitor with three ponds open has three tabs reading
 * "Vivarium" and no way to tell which is which; this is the cheapest surface on
 * the page and the one that survives being left alone for an hour.
 *
 * @param {number} seed
 * @returns {string}
 */
export function pondTitle(seed) {
  return `${pondName(seed).name} — Vivarium`;
}

/**
 * The sentence said over the water when a visitor arrives somewhere new.
 *
 * Only for a seed the visitor *chose* — the dice, the field, a saved world.
 * Resetting the same seed rebuilds the same place and says nothing, because a
 * banner that fires on every press of Reset is a banner a reader learns to
 * ignore, which is v1.132's finding read from the other end.
 *
 * @param {number} seed
 * @returns {string}
 */
export function welcomeTo(seed) {
  return `🪷 Welcome to ${pondName(seed).name}.`;
}

/**
 * What the share button says once the link is on the clipboard. The old wording
 * was "share this world!", which named nothing; this names the place, so the
 * receipt and the tab and the plate all say the same three syllables.
 *
 * @param {number} seed
 * @returns {string}
 */
export function shareLine(seed) {
  return `Link copied — share ${pondName(seed).name}!`;
}
