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

// ── The refuge the pond actually has ────────────────────────────────────────
//
// Everything above is a fact about `config.js`: it substitutes the largest body
// this world is *capable* of growing into the eating rule and reports what that
// hunter cannot touch. v1.65 left a note saying the tile built on it "says what
// is beyond *every* hunter, not what is beyond the ones that exist", and then
// nobody asked the second question for twenty-four releases.
//
// The hunters that exist are smaller. At 6,000 ticks on twelve seeds the
// biggest one in the water runs 5.47–8.00 px against a permitted 8.0, and on
// two of those seeds there is no hunter at all — every carnivory gene in the
// pond is under the threshold, so nothing can eat anything, while the tile goes
// on quoting a line at 7.273. The gap between the two readings averages 43
// points of the population and reaches 99.7 (see `docs/SCIENCE.md`).
//
// This is v1.72's audit — *for every total on a panel, ask what its largest
// single contributor is and whether that is the thing the label says* — arriving
// on a threshold instead of on a count. The label said "the size above which
// nothing here can eat them"; the number underneath answers about a creature
// this pond has usually never grown.

/**
 * The largest body that hunts here right now, in pixels — 0 when nothing does.
 *
 * "Hunts" is the diet half of `Creature._edible`: a carnivory gene at or above
 * `carnivoreThreshold`. It is deliberately *not* gated on `config.predation`,
 * for `refugeShare`'s reason — the sizes and the genes are what they are in a
 * pond where nobody bites, and the surfaces are what decide whether saying so
 * is news. 0 is a real reading and the most interesting one this returns: it
 * means the size rule has no one left to apply.
 * @param {Array<{radius:number, carnivory:number}>} creatures
 * @param {object} config
 * @returns {number}
 */
export function hunterCeiling(creatures, config) {
  let ceiling = 0;
  for (let i = 0; i < creatures.length; i++) {
    const cr = creatures[i];
    if (cr.carnivory >= config.carnivoreThreshold && cr.radius > ceiling) ceiling = cr.radius;
  }
  return ceiling;
}

/**
 * Is a body of this radius beyond every hunter currently alive?
 *
 * The same construction as `inRefuge` one substitution down: the negation of
 * `canEat`'s size test with the *biggest living* hunter in place of the biggest
 * possible one. Written as the rule rather than as `radius >= ceiling / ratio`
 * for the reason given there, and with the same consequence — a ceiling of 0
 * makes the comparison false for every radius, so an unhunted pond is entirely
 * out of reach, which is the arithmetic agreeing with the English.
 *
 * What it does not know about is kinship. `canEat` spares family (v1.10) and
 * `inRefuge` has never modelled that either: this is the *size* rule, and a
 * relative spared is spared by a hunter that could still have eaten it.
 * @param {number} radius
 * @param {number} ceiling  the value of `hunterCeiling` for the same pond
 * @param {object} config
 * @returns {boolean}
 */
export function inLivedRefuge(radius, ceiling, config) {
  return !(ceiling > radius * config.preySizeRatio);
}

/**
 * Where the line sits for the hunters that exist, in pixels — 0 when none do.
 *
 * The caption on the predicate above, exactly as `refugeRadius` is the caption
 * on `inRefuge`, and bounded above by it: no living hunter can be larger than
 * the largest this world grows, so this never exceeds `refugeRadius(config)`
 * and equals it only in a pond holding a hunter at `bodyRadiusMax`.
 * @param {number} ceiling
 * @param {object} config
 * @returns {number}
 */
export function livedRefugeRadius(ceiling, config) {
  return ceiling / config.preySizeRatio;
}

/**
 * What share of the living is beyond every hunter alive, 0–1.
 *
 * Never smaller than `refugeShare` on the same pond, because the line it counts
 * against is never higher — the two agree exactly when some hunter has reached
 * `bodyRadiusMax`, and the distance between them is how much the config's
 * answer overstates the reach of the animals in the water.
 * @param {Array<{radius:number, carnivory:number}>} creatures
 * @param {object} config
 * @returns {number}
 */
export function livedRefugeShare(creatures, config) {
  const n = creatures.length;
  if (n === 0) return 0;
  const ceiling = hunterCeiling(creatures, config);
  let safe = 0;
  for (let i = 0; i < n; i++) if (inLivedRefuge(creatures[i].radius, ceiling, config)) safe++;
  return safe / n;
}
