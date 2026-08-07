// refuge.js — the size above which nothing this world can grow is able to eat you.
//
// Two constants have sat next to each other in `config.js` since v1.0 and
// nobody had ever multiplied them together. `canEat` refuses a target unless
// the hunter is `preySizeRatio` times bigger than it; `bodyRadiusMax` is the
// largest body a genome can express. So the biggest possible predator, at
// 8.0 px, cannot touch anything at or above **8.0 / 1.1 = 7.273 px** — four
// fifths of the way up a size range that starts at 3.5. That is not a soft
// disadvantage for hunters, it is an absolute refuge, and v1.63 found a mean of
// three quarters of the pond standing inside it at 20,000 ticks.
//
// `src/levers.js` moves every constant on its own and cannot see this, because
// what the pair decides is a *conjunction*: neither number is remarkable and
// their quotient is a rule. Nothing in the simulation reads anything here —
// this is an observer, like `stats.js` and `energy.js`, and it draws no
// randomness.

/**
 * The smallest body that nothing in this world can eat, in pixels.
 *
 * A number to *report*: the tiles, the sentence and the chronicle all quote it,
 * and `SCIENCE.md` is about it. The predicate below deliberately does not use
 * it — see there.
 * @param {object} config
 * @returns {number}
 */
export function refugeRadius(config) {
  return config.bodyRadiusMax / config.preySizeRatio;
}

/**
 * Is a body of this radius beyond every hunter this world is capable of
 * growing?
 *
 * Written as the negation of `Creature.canEat`'s size test with the largest
 * possible predator substituted in, rather than as `radius >= refugeRadius()`.
 * The two agree everywhere a float can tell them apart and they are not the
 * same expression: one divides and then compares, the other compares the
 * product, and a body sitting exactly on the boundary is decided by the
 * rounding of whichever is used. The rule in `creature.js` is the thing that
 * actually eats creatures, so the predicate is the rule, and the reported
 * threshold is a caption on it.
 * @param {number} radius
 * @param {object} config
 * @returns {boolean}
 */
export function inRefuge(radius, config) {
  return !(config.bodyRadiusMax > radius * config.preySizeRatio);
}

/**
 * What share of the living are inside the refuge, 0–1.
 *
 * The count says how much of the pond the headline mechanic has stopped
 * applying to. Note what it is *not*: predation can be switched off, and this
 * number does not move when it is, because it is a fact about sizes and not
 * about behaviour. Callers gate the readout on `config.predation` for that
 * reason — a pond where nobody hunts has no refuge to be inside of, and
 * reporting one would be describing arithmetic rather than the world.
 * @param {Array<{radius:number}>} creatures
 * @param {object} config
 * @returns {number}
 */
export function refugeShare(creatures, config) {
  const n = creatures.length;
  if (n === 0) return 0;
  let safe = 0;
  for (let i = 0; i < n; i++) if (inRefuge(creatures[i].radius, config)) safe++;
  return safe / n;
}
