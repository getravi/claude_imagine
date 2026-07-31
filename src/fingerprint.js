// fingerprint.js — an exact identity for a world, and for the engine under it.
//
// The second prime directive of this project is that a `(seed, config)` pair
// reproduces a world exactly, and that a default world stays bit-for-bit
// identical to every version that came before. Thirty-five versions of tests
// have asserted the first half — two worlds built in the same process from the
// same seed agree — and nothing has ever asserted the second, because a test
// cannot run last month's code. So the promise that actually matters, the one
// every permalink, screenshot and earned seed rests on, was enforced by care
// alone. A hash fixes that: record a number once, check it forever.
//
// Three things make it honest rather than superstitious.
//
//  1. **It has to be able to see one bit.** Both hashes below take the raw 64
//     bits of every double, so a change of one ULP in one creature's position
//     moves them. A hash built on `(v * 1e6) | 0` — which is what the ad-hoc
//     helpers in the suite do — is blind to exactly the drift a recorded
//     constant exists to catch.
//  2. **It has to be blind to things that are allowed to change.** There are
//     two hashes, not one, and the difference is the whole design: see below.
//  3. **It has to say when a failure is not the simulation's fault.**
//     `Math.sin`, `Math.tanh`, `Math.exp` and friends are
//     *implementation-approximated* in ECMAScript — nothing requires two
//     engines to return the same bits, and the pond calls them about 4,900
//     times a tick. A golden world hash is therefore a statement about this
//     project *given* an engine's libm, and `mathFingerprint` is what lets a
//     failure tell the two apart.
//
// **Why two hashes.** `trajectoryFingerprint` is the cross-version invariant:
// where every creature and pellet actually is, and nothing else. It is
// deliberately blind to *representation*, because almost every release adds a
// field or a genome slot, and a golden constant that has to be re-recorded
// whenever it does is not a test — it is a note about the last time somebody
// re-recorded it. This is measured, not assumed: `stateFingerprint`, which does
// hash the genome and every per-creature field, moves at v1.20, v1.23 and v1.33
// — three releases that added representation while leaving the default world
// bit-for-bit untouched — and `trajectoryFingerprint` holds across all of them.
// So the strict hash belongs in same-process comparisons, where representation
// *should* match, and the blind one carries the promise across time.
//
// **And a third that is not about the world at all.** `observationFingerprint`
// hashes the tree of life — what the observer made of the pond. It was added in
// v1.38 for the constant sweep (`levers.js`), which found that three of this
// project's numbers move the view and nothing else; a sweep holding only a state
// hash calls those three dead. It doubles as the test of `phylogeny.js`'s oldest
// claim, that observation never feeds back.
//
// docs/SCIENCE.md measures what caveat (3) is worth: with the last bit of every
// implementation-defined Math result flipped, four seeds run 20,000 ticks with
// *identical populations* and a worst per-creature drift of 3e-12. The bits are
// fragile; the pond is not.

/**
 * FNV-1a over 32-bit words, fed the exact bit pattern of every double. Not a
 * cryptographic hash and not trying to be — it needs to be stable, order-
 * sensitive, and incapable of ignoring a low bit.
 *
 * Exported so the fourth channel — `rendershot.js`, which hashes what the
 * renderer draws — mixes its numbers exactly the way these three do.
 */
export class Hash {
  constructor() {
    this.h = 0x811c9dc5 | 0;
    this.buf = new ArrayBuffer(8);
    this.f64 = new Float64Array(this.buf);
    this.u32 = new Uint32Array(this.buf);
  }

  /** Mix one 32-bit word. */
  word(w) {
    this.h = Math.imul(this.h ^ (w >>> 0), 16777619) | 0;
    return this;
  }

  /** Mix a number by its IEEE-754 bits, so 1 ULP is visible. */
  num(v) {
    this.f64[0] = v;
    return this.word(this.u32[0]).word(this.u32[1]);
  }

  /** Mix a boolean as a distinct word, so `false` is not `0` is not absent. */
  flag(b) {
    return this.word(b ? 0x9e3779b9 : 0x85ebca6b);
  }

  /**
   * Mix an array-like of numbers, length first. A missing collection mixes a
   * distinguishable marker rather than nothing, so "no nutrient field" and "a
   * nutrient field of length zero" cannot collide.
   */
  array(a) {
    if (!a) return this.word(0xdeadbeef);
    this.word(a.length);
    for (let i = 0; i < a.length; i++) this.num(a[i]);
    return this;
  }

  /** Eight lowercase hex digits. */
  digest() {
    return (this.h >>> 0).toString(16).padStart(8, "0");
  }
}

/**
 * Where the world *is*: the tick, every creature's position, motion, energy,
 * age and lineage counters, every pellet, every corpse. Nothing else.
 *
 * This is the hash a golden constant is recorded from, so what it leaves out is
 * as deliberate as what it keeps. No genome or brain weights (their layout grows
 * when a release adds a gene, while the default world's future does not — an
 * unused gene draws no random numbers). No infection, signal or ground state
 * (each is a constant in a world with that feature off). Any change to a
 * genome, a brain or a feature that *does* reach the simulation reaches these
 * numbers within a tick or two, because it moves something.
 *
 * Read-only: it draws no random numbers and writes nothing, so fingerprinting a
 * world cannot change it. There is a test.
 *
 * @param {import('./world.js').World} world
 * @returns {string} eight hex digits
 */
export function trajectoryFingerprint(world) {
  const h = new Hash();
  h.num(world.tick);
  h.word(world.creatures.length);
  h.word(world.food.items.length);
  h.word(world.corpses ? world.corpses.length : 0);
  for (const c of world.creatures) {
    h.num(c.x).num(c.y).num(c.heading).num(c.vx).num(c.vy);
    h.num(c.energy).num(c.age);
    h.word(c.generation).word(c.children).flag(c.dead);
  }
  for (const f of world.food.items) h.num(f.x).num(f.y).flag(f.eaten);
  for (const k of world.corpses || []) h.num(k.x).num(k.y).num(k.energy);
  return h.digest();
}

/**
 * Everything the trajectory hash covers, plus how this build *represents* it:
 * the genome a child would inherit, the brain the creature currently is, its
 * body genes, its disease and signalling state, the ground under it, and the
 * nutrient field.
 *
 * Strictly stronger than `trajectoryFingerprint`, and correspondingly not a
 * cross-version invariant — use it where representation should match too, which
 * is any comparison inside one process: two seeds agreeing, a feature switched
 * off leaving a world untouched, a readout that must not write to what it reads.
 *
 * @param {import('./world.js').World} world
 * @returns {string} eight hex digits
 */
export function stateFingerprint(world) {
  const h = new Hash();
  h.word(0x5747484c); // domain separator: never collides with a trajectory hash
  h.num(world.tick);
  h.word(world.creatures.length);
  h.word(world.food.items.length);
  h.word(world.corpses ? world.corpses.length : 0);
  for (const c of world.creatures) {
    h.num(c.x).num(c.y).num(c.heading).num(c.vx).num(c.vy);
    h.num(c.energy).num(c.age).num(c.radius).num(c.carnivory);
    h.word(c.generation).word(c.children).flag(c.dead);
    h.flag(c.infected).flag(c.immune).num(c.signal).num(c.ground);
    h.array(c.genome && c.genome.data);
    h.array(c.brain && c.brain.w);
  }
  for (const f of world.food.items) h.num(f.x).num(f.y).flag(f.eaten);
  for (const k of world.corpses || []) h.num(k.x).num(k.y).num(k.energy);
  h.array(world.detritus && world.detritus.cells);
  return h.digest();
}

/**
 * What the *observer* made of the world: the tree of life. Every species'
 * identity, parentage, birth, extinction, standing count and peak, plus the
 * abundance record the Muller plot draws from — its samples, the windows they
 * cover, and the resolution it has thinned itself down to.
 *
 * This is a third channel, not a stronger hash, and the reason it exists is
 * that some of this project's constants are levers on the view and on nothing
 * else. `speciationDistance`, `phylogenySampleInterval` and `phylogenyHistory`
 * decide what the Tree of Life *says* while leaving the pond bit-for-bit
 * identical — a sweep with only a state hash calls all three dead. It also
 * gives the header comment in `phylogeny.js` ("nothing here feeds back into the
 * simulation") a test: a change that moves this hash and not the state hash is
 * exactly what pure observation looks like.
 *
 * Deliberately excludes each species' representative genome, for the same
 * reason `trajectoryFingerprint` excludes genomes: it is representation, and it
 * would move whenever a release adds a gene.
 *
 * Read-only, like the other two.
 *
 * @param {import('./world.js').World} world
 * @returns {string} eight hex digits
 */
export function observationFingerprint(world) {
  const h = new Hash();
  h.word(0x54524545); // domain separator: "TREE"
  const p = world.phylogeny;
  if (!p) return h.word(0xdeadbeef).digest();
  h.num(p.threshold).num(p.sampleInterval).word(p.maxSnapshots);
  h.word(p.snapshotStride).word(p.snapshotsSeen).num(p.latestTick === null ? -1 : p.latestTick);
  h.word(p.species.length);
  for (const s of p.species) {
    h.word(s.id).word(s.parentId === null ? -1 : s.parentId);
    h.num(s.hue).num(s.birthTick).num(s.extinctTick);
    h.word(s.count).word(s.peak);
  }
  h.word(p.snapshots.length);
  for (const snap of p.snapshots) {
    h.num(snap.tick).num(snap.total).word(snap.span);
    h.word(snap.counts.size);
    // A Map iterates in insertion order, which is deterministic here (species
    // are counted in population order) — but sort anyway, so the hash is a
    // statement about the abundances rather than about the tallying loop.
    for (const id of [...snap.counts.keys()].sort((a, b) => a - b)) {
      h.word(id).num(snap.counts.get(id));
    }
  }
  return h.digest();
}

/** How many arguments the math probe evaluates each function at. */
const PROBES = 64;

/**
 * A hash of this engine's implementation-defined transcendental functions.
 *
 * Every function the simulation actually calls, at a fixed low-discrepancy set
 * of arguments built from integer arithmetic and the golden ratio — so the probe
 * never calls the library it is measuring in order to choose where to measure
 * it. If this matches the value a golden world hash was recorded under, a
 * mismatched world hash is a change in *this project*. If it differs, the
 * engine's libm differs and the world hash cannot be attributed either way,
 * which is a diagnosis rather than an excuse: see the tiered assertions in
 * test/fingerprint.test.js.
 *
 * `Math.sqrt` is excluded on purpose. IEEE-754 requires it to be correctly
 * rounded, so it is not a portability risk, and including it would add noise to
 * a signal about the functions that are.
 *
 * @returns {string} eight hex digits
 */
export function mathFingerprint() {
  const h = new Hash();
  for (let i = 0; i < PROBES; i++) {
    const u = ((i + 1) * 0.6180339887498949) % 1; // (0, 1)
    const t = u * 2 - 1; // (-1, 1)
    const big = t * 12; // wide enough to exercise argument reduction
    h.num(Math.sin(big)).num(Math.cos(big)).num(Math.tan(big));
    h.num(Math.atan(big)).num(Math.atan2(t, u)).num(Math.hypot(t, u));
    h.num(Math.asin(t)).num(Math.acos(t));
    h.num(Math.exp(big)).num(Math.log(u)).num(Math.pow(u, big)).num(Math.cbrt(t));
    h.num(Math.tanh(big));
  }
  return h.digest();
}
