// foodweb.js — who can eat whom, counted for every animal at once.
//
// `src/refuge.js` answers the question from the prey's end: what share of the
// pond is beyond the biggest hunter this world can grow (v1.64), and beyond the
// biggest one actually in the water (v1.89). Both readings count the pond
// against **one** hunter, and v1.65 left the other end of the question written
// down and untouched for thirty-five releases:
//
// > the eligible set is 11.6%–64.5% of the pond depending on the hunter and no
// > readout plots it … the distribution over all of them is what would say
// > whether a pond has an apex animal or a graded web.
//
// That is what this module is. For every creature it counts the *eligible set*
// — the living bodies the eating rule admits it — and reports the shape of the
// resulting distribution: how many animals can eat anything at all, how far the
// widest one reaches, and how far the middle one does. A pond where those last
// two numbers are far apart has an apex animal; a pond where they are close is
// a web everybody is inside of.
//
// **The rule this counts is the size-and-diet half** (`Creature._edible`): a
// carnivory gene at or above `carnivoreThreshold`, and a body more than
// `preySizeRatio` times its target's. Kinship is excluded, exactly as
// `inRefuge` excludes it and for the reason given there — a relative spared is
// spared by a hunter that could still have eaten it — and here there is a
// second reason: `_isKin` compares two genomes, so asking it of every ordered
// pair would put a genome distance on a per-frame readout.
//
// Nothing in the simulation reads anything here. This is an observer, like
// `stats.js`, `energy.js` and `refuge.js`, and it draws no randomness.

/**
 * How many living bodies each creature could eat, in the population's own order.
 *
 * Computed by sorting the radii once and binary-searching **the rule itself**
 * rather than its rearrangement: the predicate below is `_edible`'s size test
 * character for character, so the boundary case is decided by the same float
 * comparison that decides whether a bite lands. (`radius < self / ratio` is the
 * same rule to a mathematician and not always to a `double` — the note on
 * `inRefuge` is about this, and the same care is owed here, where the
 * comparison is made a few hundred thousand times a frame instead of once.)
 *
 * O(n log n) rather than the O(n²) the question is written in. The search is
 * valid because `self.radius > r * ratio` is monotone in `r` — which needs
 * `preySizeRatio >= 0`, true of every value `src/levers.js` can reach and of
 * every value that means anything (a negative ratio would make a body's size a
 * qualification for being eaten by something smaller).
 *
 * @param {Array<{radius:number, carnivory:number}>} creatures
 * @param {object} config
 * @returns {Int32Array} one count per creature, in `creatures` order
 */
export function eligibleCounts(creatures, config) {
  const n = creatures.length;
  const out = new Int32Array(n);
  if (n === 0) return out;
  // `Float64Array#sort` is numeric with no comparator, so nothing here can pick
  // up `Array#sort`'s lexicographic default by omission.
  const radii = Float64Array.from(creatures, (c) => c.radius).sort();
  const ratio = config.preySizeRatio;
  const threshold = config.carnivoreThreshold;
  for (let i = 0; i < n; i++) {
    const c = creatures[i];
    if (c.carnivory < threshold) continue;
    // The first index the rule refuses. Everything below it, the rule admits.
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (c.radius > radii[mid] * ratio) lo = mid + 1;
      else hi = mid;
    }
    // A hunter is in the array it just searched. At the ratio this world ships
    // it cannot admit its own body — `r > r * 1.1` is false for every positive
    // r — but the ratio is a lever, and at any value below 1 a creature would
    // count itself. Asked as the rule rather than as `ratio < 1` so that the
    // exclusion is decided by the same expression as the inclusion.
    out[i] = lo - (c.radius > c.radius * ratio ? 1 : 0);
  }
  return out;
}

/**
 * @typedef {object} WebProfile
 * @property {number} carnivores how many carry the diet gene
 * @property {number} hunters how many of those have a non-empty eligible set
 * @property {number} top the widest hunter's share of the rest of the pond, 0–1
 * @property {number} mid the middle hunter's share of the rest of the pond, 0–1
 */

/**
 * The shape of the pond's predation web, right now.
 *
 * Two definitions worth having in one place, because the gap between them is
 * this module's finding: a **carnivore** is a gene, and a **hunter** is a
 * carnivore with something in the water it can actually eat. `Stats` has
 * counted the first since v1.0 and nothing has ever counted the second — on
 * seed 256 at 6,000 ticks the whole pond carries the gene and two thirds of
 * them have an empty set, and on the default seed the last hunter loses its
 * prey before the run is over while the tile above goes on reporting a
 * carnivore (docs/SCIENCE.md).
 *
 * Shares are of the **rest** of the pond (`n - 1`), because a creature is not a
 * candidate for its own eligible set and a denominator that included it would
 * put a ceiling of `(n-1)/n` on a hunter that can eat everything else. `mid` is
 * the lower median of the hunters' shares — of the hunters, deliberately, not
 * of the population: the median of a pond that is nine tenths grazers is zero
 * on almost every seed, which measures the diet distribution and not the web.
 *
 * @param {Array<{radius:number, carnivory:number}>} creatures
 * @param {object} config
 * @returns {WebProfile}
 */
export function webProfile(creatures, config) {
  const counts = eligibleCounts(creatures, config);
  const n = counts.length;
  const threshold = config.carnivoreThreshold;
  let carnivores = 0;
  const reach = [];
  for (let i = 0; i < n; i++) {
    if (creatures[i].carnivory >= threshold) carnivores++;
    if (counts[i] > 0) reach.push(counts[i]);
  }
  reach.sort((a, b) => a - b);
  const hunters = reach.length;
  const rest = n - 1;
  return {
    carnivores,
    hunters,
    top: hunters > 0 ? reach[hunters - 1] / rest : 0,
    mid: hunters > 0 ? reach[(hunters - 1) >> 1] / rest : 0,
  };
}
