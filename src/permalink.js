// permalink.js — the link, with everything nobody changed left out of it.
//
// The hash this page writes has carried every one of its twenty-nine permalink
// fields since v1.44, whether or not a visitor touched any of them, so the link
// to the pond on the front page is three hundred characters long and all but
// one of its parameters says *the default*:
//
//     #seed=314&food=1.80&metab=0.051&mut=0.09&pred=1&sex=0&sea=1&bio=1&pla=0
//     &neat=0&drift=0&scav=0&lic=0&kin=0&night=0&dis=0&regrow=0&sig=0&ter=0
//     &det=0&eye=0&feel=0&rock=0&dark=0&whisk=0&fin=0&ord=0&body=0&mass=0
//
// That was invisible for ninety-six releases because a share was a link and
// nothing else: a URL is a thing you paste, not a thing you read, and its
// length is a property of somebody else's address bar. **v1.140 put the link
// at the bottom of something a person reads**, and a paragraph of pond followed
// by three hundred characters of `pla=0` is a postcard with a licence plate
// stapled to it. The defect did not change; what changed is that there is now
// a surface it is visible on. That is worth the general note: **a value nobody
// looks at has no quality, and the day something starts looking at it is the
// day its quality becomes a fact.**
//
// The shortening is exact rather than lossy, which is the only reason it is a
// tidy-up and not a feature with a compatibility question attached.
// `parseHash` applies a field **only when the hash carries it** and
// `makeConfig` fills in the rest from `DEFAULT_CONFIG`, so an omitted default
// and a written default build the identical config — and therefore, by
// directive 2, the identical world. `test/permalink.test.js` asserts that
// against the whole field table rather than trusting the sentence.
//
// Comparison is on the **written** form, not the value. `food` is serialised
// with `toFixed(2)`, so a rate of 1.7999999999 and the default 1.8 are one
// string on the wire and there is nothing between them to preserve; comparing
// the numbers would keep a parameter that could not change anything at the far
// end. The question a field has to answer is not *is this different?* but *would
// writing this down change the pond the link opens?*
//
// Determinism: a pure function of a config. No world, no browser, no random
// number.

import { DEFAULT_CONFIG } from "./config.js";

/**
 * Every field the permalink can carry, in the order it is written.
 *
 * One row per parameter, each holding the name on the wire and how the value
 * becomes a string. `main.js` reads these names back in `parseHash`; the two
 * lists have been written out separately since v1.44 and this does not change
 * that, but a name that appears here and nowhere there is now one grep apart
 * rather than one scroll.
 */
export const HASH_FIELDS = Object.freeze([
  { key: "seed", of: (c) => String(c.seed) },
  { key: "food", of: (c) => c.foodSpawnRate.toFixed(2) },
  { key: "metab", of: (c) => String(c.metabolicBase) },
  { key: "mut", of: (c) => String(c.mutationRate) },
  { key: "pred", of: (c) => flag(c.predation) },
  { key: "sex", of: (c) => flag(c.sexualReproduction) },
  { key: "sea", of: (c) => flag(c.seasons) },
  { key: "bio", of: (c) => flag(c.foodPatches) },
  { key: "pla", of: (c) => flag(c.plasticity) },
  { key: "neat", of: (c) => flag(c.evolvableTopology) },
  { key: "drift", of: (c) => flag(c.biomeDrift > 0) },
  { key: "scav", of: (c) => flag(c.scavenging) },
  { key: "lic", of: (c) => flag(c.licensedDietCost) },
  { key: "kin", of: (c) => flag(c.kinRecognition) },
  { key: "night", of: (c) => flag(c.dayNightCycle) },
  { key: "dis", of: (c) => flag(c.disease) },
  { key: "regrow", of: (c) => flag(c.foodRegrowth) },
  { key: "sig", of: (c) => flag(c.signalling) },
  { key: "ter", of: (c) => flag(c.terrain) },
  { key: "det", of: (c) => flag(c.detritus) },
  { key: "eye", of: (c) => flag(c.exactVision) },
  { key: "feel", of: (c) => flag(c.groundSense) },
  { key: "rock", of: (c) => flag(c.barriers) },
  { key: "dark", of: (c) => flag(c.barrierOcclusion) },
  { key: "whisk", of: (c) => flag(c.wallSense) },
  { key: "fin", of: (c) => flag(c.deathIsFinal) },
  { key: "ord", of: (c) => flag(c.shuffleTurnOrder) },
  { key: "body", of: (c) => flag(c.bodyCollision) },
  { key: "mass", of: (c) => flag(c.massWeightedShove) },
]);

/**
 * The field that is written whatever it says.
 *
 * The seed is the pond's identity rather than one of its settings — it is what
 * the plate over the water names and what `#seed=42` means to somebody typing
 * it — and a link with no seed in it is a link to *a* Vivarium rather than to
 * this one. Every other field is a deviation from the default and only earns
 * its place by being one.
 */
export const ALWAYS = "seed";

const flag = (on) => (on ? "1" : "0");

/**
 * The hash for a config: the seed, plus whatever a visitor actually moved.
 *
 * @param {object} config the live config
 * @param {object} [defaults] what to measure it against — the frozen defaults,
 *   overridable so a test can prove the comparison is against something rather
 *   than against nothing
 * @returns {string} a query string, no leading `#`
 */
export function hashFor(config, defaults = DEFAULT_CONFIG) {
  const p = new URLSearchParams();
  for (const f of HASH_FIELDS) {
    const value = f.of(config);
    if (f.key === ALWAYS || value !== f.of(defaults)) p.set(f.key, value);
  }
  return p.toString();
}
