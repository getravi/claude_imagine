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

  /**
   * Mix a string by its code units, length first. `null` and `undefined` mix a
   * marker rather than nothing, so "no cause of death" and the empty string
   * cannot collide.
   */
  text(s) {
    if (s === null || s === undefined) return this.word(0xfeedface);
    this.word(s.length);
    for (let i = 0; i < s.length; i++) this.word(s.charCodeAt(i));
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
 * Every field a creature carries that `stateFingerprint` hashes, in the order it
 * hashes them. Exported as data because a list the hash is *checked against* is
 * the only thing that stops the next release quietly falling outside it — see
 * `CREATURE_UNHASHED` and `test/determinism.test.js`, which walks a live
 * creature's own properties and fails on any name that is in neither list.
 */
export const CREATURE_HASHED = [
  "x", "y", "heading", "vx", "vy", "energy", "age", "generation", "children",
  "dead", "deathCause", "radius", "metabolismScale", "carnivory", "phase",
  "hue", "ground", "groundFeel", "walled", "rockAhead", "wallFeel",
  "infected", "immune",
  "infectedAtAge", "signal", "prevSignal", "heard", "lastBiteAge",
];

/**
 * The two fields a same-process comparison must *not* hash, and why. Both are
 * real state; neither is the pond's.
 */
export const CREATURE_UNHASHED = {
  id: "a module-level counter, so the second world built in a process never " +
    "agrees with the first however identical the pond is",
  speciesId: "written by the observer (`phylogeny.assign`), not by the " +
    "simulation — it lives in `observationFingerprint`, and hashing it here " +
    "would make 'observation never feeds back' fail for something that is not " +
    "feedback",
};

/**
 * Every own field a live `World` carries that `stateFingerprint` reaches, and
 * the two lists are the point rather than either one of them.
 *
 * v1.53 wrote this list for a creature and found three fields moving the pond
 * from outside it. v1.59 wrote it for the books. The world's own fields — the
 * twenty things a `World` *is* — were nobody's list until v1.91, and the sweep
 * that came looking (`src/statesweep.js`) found the state hash blind to six of
 * them. `test/statesweep.test.js` walks a stepped world and fails on any own
 * field that is in neither list, so the next release's addition has to be
 * classified rather than defaulted.
 */
export const WORLD_HASHED = [
  "tick", "visionFactor", "creatures", "food", "corpses", "detritus",
  "environment", "terrain", "barriers",
  "creatureGrid", "foodGrid", "corpseGrid",
];

/**
 * The eight fields the state hash does not reach, and why each is right to be
 * outside it. Five have a channel of their own; three do not, and the third is
 * the gap this release leaves open.
 */
export const WORLD_UNHASHED = {
  config: "the question, not the answer — two worlds built from different " +
    "configs are supposed to differ, and `src/levers.js` has swept every " +
    "number in it since v1.38",
  rng: "its position lives inside the closure `mulberry32` returns, so " +
    "`rng.seed` is a record of how a stream started and not the stream. No " +
    "walk of an object can reach the state that matters; `drawStream` is the " +
    "channel, and it is the one that must be attached before the first tick",
  phylogeny: "the observer's tree — `observationFingerprint`, so that a change " +
    "moving it and not the pond still reads as pure observation",
  stats: "the books — `booksFingerprint` (v1.59)",
  energy: "the books — `booksFingerprint` (v1.59)",
  seasonFactor: "derived from the tick at the end of every step, so a " +
    "perturbation is overwritten before anything reads it. Measured, not " +
    "assumed: the v1.91 sweep moves it and the pond does not part",
  seasonPhase: "the same, one field over",
  chronicle: "the narration — `chronicleFingerprint` (v1.94), the sixth " +
    "channel. It is an output like the tree and the books, so a difference in " +
    "it moves no picture of the pond; v1.91 measured it inert with respect to " +
    "the simulation, which made it a hole in the instrument rather than in " +
    "determinism, and a hole in an instrument is still a hole",
};

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
 * **What v1.53 changed, and why it is the same bug this file was built to
 * catch.** For seventeen releases this hash was a hand-picked list of sixteen
 * creature fields, and a creature carries twenty-eight. Sweeping the state the
 * way `levers.js` sweeps the constants — perturb each field, ask whether any
 * instrument notices — found three of the twelve omissions moving the pond's
 * future while the hash held still: `metabolismScale` and `phase` at the next
 * tick, `lastBiteAge` (the predation cooldown) within three. Six more
 * (`walled`, `groundFeel`, `hue`, `infectedAtAge`, `prevSignal`, `heard`) are
 * inert only because their readers are behind flags that are off — and v1.102's
 * `rockAhead` and `wallFeel` join that half of the list, both read by the
 * whisker and by nothing else. v1.36 wrote
 * "decide what the instrument must be *blind* to, and then write a test
 * asserting the blindness", and wrote that test for the trajectory hash; the
 * complementary question — what must this one *not* be blind to? — went with
 * it, and the answer was nobody's list.
 *
 * @param {import('./world.js').World} world
 * @returns {string} eight hex digits
 */
export function stateFingerprint(world) {
  const h = new Hash();
  h.word(0x5747484c); // domain separator: never collides with a trajectory hash
  h.num(world.tick);
  // The day/night multiplier is carried on the world rather than recomputed, so
  // a hash blind to it is blind to the state of the sky. (`seasonFactor` and
  // `seasonPhase` are next to it and are *derived from the tick every step*, so
  // a perturbation to either is overwritten before anything reads it.)
  h.num(world.visionFactor);
  h.word(world.creatures.length);
  h.word(world.food.items.length);
  h.word(world.corpses ? world.corpses.length : 0);
  for (const c of world.creatures) {
    // Kept in the order of CREATURE_HASHED, which a test holds this to.
    h.num(c.x).num(c.y).num(c.heading).num(c.vx).num(c.vy);
    h.num(c.energy).num(c.age);
    h.word(c.generation).word(c.children).flag(c.dead).text(c.deathCause);
    h.num(c.radius).num(c.metabolismScale).num(c.carnivory).num(c.phase).num(c.hue);
    h.num(c.ground).num(c.groundFeel).flag(c.walled);
    // `rockAhead` is `Infinity` wherever the whisker found nothing, which `num`
    // mixes by its bits like any other double — a miss is a value here, not an
    // absence, and it is distinct from every distance a hit can report.
    h.num(c.rockAhead).num(c.wallFeel);
    h.flag(c.infected).flag(c.immune).num(c.infectedAtAge);
    h.num(c.signal).num(c.prevSignal).num(c.heard).num(c.lastBiteAge);
    h.array(c.genome && c.genome.data);
    // The brain is three arrays, not one: the extra input weights signalling
    // and the ground sense are wired through, and the per-weight plasticity
    // coefficients. Hashing only `w` was the same omission one level down.
    h.array(c.brain && c.brain.w);
    h.array(c.brain && c.brain.auxW);
    h.array(c.brain && c.brain.plastic);
  }
  for (const f of world.food.items) h.num(f.x).num(f.y).flag(f.eaten);
  for (const k of world.corpses || []) h.num(k.x).num(k.y).num(k.energy);
  h.array(world.detritus && world.detritus.cells);
  mixShape(h, world);
  return h.digest();
}

/**
 * The pond's shape: the landscape it is laid out on, the bookkeeping the food
 * field carries between ticks, and the geometry of the index everything is
 * looked up through. Added in v1.91.
 *
 * Everything above this line is the pond's *contents* — where each creature,
 * pellet and corpse is. That was the whole hash from v1.36 to v1.90, and
 * v1.59 noticed the omission and cleared it by reading the code: the landscape
 * is built once at construction and never written again, so two worlds from one
 * config cannot differ in it. The reading was right about most of it and wrong
 * about the conclusion, which is that a claim nothing checks is a claim about
 * the code as it stands today. `src/statesweep.js` is the sweep that asked the
 * question properly, and of 166 pieces of live state in the richest world this
 * project can build it found 23 the pond's future depends on and **17 that no
 * channel could see** — every one of them in this function's subject, spread
 * over six of the world's twenty fields.
 *
 * Note the shape of what was missing, because it is not "a field somebody
 * forgot". The pond's contents move every tick and its shape does not, so a
 * hash written by watching a world run covers exactly the half that moves.
 *
 * @param {Hash} h
 * @param {import('./world.js').World} world
 */
function mixShape(h, world) {
  const fertility = world.environment;
  if (!fertility) h.word(0xdeadbeef);
  else {
    // `_mean` is deliberately absent: it is a lazily-filled cache of a pure
    // function of the fields below it, so hashing it would make a world that
    // has been *asked* its mean fingerprint differently from one that has not
    // — which is the one thing v1.36 says an instrument may never do.
    h.num(fertility.floor).num(fertility.sigma).num(fertility.twoSigma2);
    h.word(fertility.centres.length);
    for (const c of fertility.centres) h.num(c.x).num(c.y);
    for (const d of fertility.driftDirs) h.num(d.x).num(d.y);
  }
  const terrain = world.terrain;
  if (!terrain) h.word(0xdeadbeef);
  else h.word(terrain.cols).word(terrain.rows).num(terrain.mean).array(terrain.grid);
  const barriers = world.barriers;
  if (!barriers) h.word(0xdeadbeef);
  else {
    h.word(barriers.walls.length);
    for (const w of barriers.walls) {
      h.flag(w.vertical).num(w.pos).num(w.half).num(w.gapHalf).array(w.gaps);
    }
  }
  const detritus = world.detritus;
  if (detritus) {
    h.word(detritus.cols).word(detritus.rows);
    h.num(detritus.cellW).num(detritus.cellH).num(detritus.total);
  }
  // What the food field remembers between ticks: the fractional pellet it is
  // part-way through spawning, and the two counters `Stats` reads its rates
  // from. The accumulator is the pond's spawn *phase* — set it to a different
  // fraction and the crop arrives on different ticks.
  h.num(world.food._spawnAccumulator).num(world.food.spawned).num(world.food.sprouted);
  // The index's geometry, not its buckets. `cells` holds the same creature and
  // pellet objects the loops above already hashed, rebuilt from their positions
  // at the top of every tick — hashing it would say nothing new and would make
  // the digest depend on where inside a tick it was taken. The geometry is a
  // different thing: `cellSize` is a term in the physics rather than a tuning
  // knob (v1.75), because with `exactVision` off the 3×3 block *is* what a
  // creature can find.
  for (const g of [world.creatureGrid, world.foodGrid, world.corpseGrid]) {
    h.num(g.width).num(g.height).num(g.cellSize).word(g.cols).word(g.rows);
  }
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
 * exactly what pure observation looks like. `booksFingerprint` is the same idea
 * one output over — see it for why a counter needs its own channel.
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
  // The two the v1.91 sweep found: the id the next branch will be given, and
  // the tick the next snapshot is due after. Both decide the observer's future
  // while saying nothing about its present, which is why a hash written by
  // looking at the tree missed them.
  h.word(p.nextId).num(p._lastSample === null || p._lastSample === undefined ? -1 : p._lastSample);
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

/**
 * How deep `mixValue` will walk before it decides it is lost. The deepest thing
 * the books actually hold is four down — the archive, its rows, a row's `min`
 * envelope, a number — so this has two levels of slack and is a guard against a
 * future field that carries a cycle, not a limit anything real is near.
 */
const MAX_BOOK_DEPTH = 6;

/**
 * Mix any plain value: a number, a string, a boolean, an array, or an object of
 * those. Arrays and objects carry a tag and a length, so `[]` and `{}` are not
 * the same thing and neither is a collection that lost an element.
 *
 * Object keys are sorted, which makes the hash a statement about *what an
 * object holds* rather than about the order some loop happened to write it in —
 * the same choice `observationFingerprint` makes for the abundance Maps. Sorting
 * is not the same as ignoring: each key is mixed by name, so a field that
 * appears, disappears or is renamed moves the digest.
 *
 * The reason this is generic where the three hashes above are hand-written is
 * that they hash a *fixed shape* — a creature has the fields a creature has —
 * and the books do not. A history point is whatever `Stats.sample` assembled
 * that tick, and half of those keys are built by `energyField()` and
 * `buriedField()` from lists that grow. A hand-written mixer for that is a list
 * of names one level further down, which is the thing v1.53 spent a release
 * proving is not an instrument.
 */
function byText(a, b) {
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function mixValue(h, v, depth = 0) {
  if (v === null || v === undefined) return h.word(0xfeedface);
  const t = typeof v;
  if (t === "number") return h.num(v);
  if (t === "boolean") return h.flag(v);
  if (t === "string") return h.text(v);
  if (t !== "object") {
    throw new TypeError(`the books carry a ${t}, which no fingerprint can mean anything about`);
  }
  if (depth >= MAX_BOOK_DEPTH) {
    throw new RangeError(`the books nest deeper than ${MAX_BOOK_DEPTH}; is something cyclic?`);
  }
  if (Array.isArray(v)) {
    h.word(0x0a44a1); // tag: array
    h.word(v.length);
    for (const el of v) mixValue(h, el, depth + 1);
    return h;
  }
  // A `Set` and a `Map` carry everything they hold somewhere `Object.keys`
  // cannot reach, so without these two branches they fall through to the object
  // tag below and hash as `{}` — every set of latched milestones identical to
  // every other, silently. Nothing in the books is one today; the narration is
  // five of them (v1.94), and the tell was that the generic mixer was written
  // for a shape that grows, so the next shape it grows is exactly what it has
  // never been shown.
  //
  // Members are sorted by their string form so the digest is a statement about
  // *what is in the collection* rather than about the order some loop inserted
  // them in — the same choice `observationFingerprint` makes for the abundance
  // Maps, and the reason a `Set` needs it is stronger: insertion order here is
  // the order the pond happened to cross its milestones in.
  if (v instanceof Set) {
    h.word(0x5e770001); // tag: set
    h.word(v.size);
    for (const el of [...v].sort(byText)) mixValue(h, el, depth + 1);
    return h;
  }
  if (v instanceof Map) {
    h.word(0x5e770002); // tag: map
    h.word(v.size);
    for (const k of [...v.keys()].sort(byText)) {
      mixValue(h, k, depth + 1);
      mixValue(h, v.get(k), depth + 1);
    }
    return h;
  }
  h.word(0x0b1ec70b); // tag: object
  const keys = Object.keys(v).sort();
  h.word(keys.length);
  for (const k of keys) {
    h.text(k);
    mixValue(h, v[k], depth + 1);
  }
  return h;
}

/**
 * Every own property of `world.stats` that `booksFingerprint` hashes.
 *
 * Six of these do not exist until the first `sample()`. A list written by
 * reading the constructor, which is the obvious way to write one, gets
 * fifty-two of the fifty-eight and looks complete. That is why the test
 * that walks this list walks a *stepped* world.
 */
export const STATS_HASHED = [
  "historyLength", "popHistory", "runHistory", "tick", "births", "deaths",
  "kills", "deathWindow", "deathsBy", "recentDeaths", "lifespanSum",
  "sizedBy", "radiusSumBy", "poolSumBy",
  "scavenged", "contested", "crowdedOut", "walled", "walledRate", "_walledRing",
  "jostled", "jostledRate", "_jostledRing",
  "kinSpared", "kinSparedRate", "_kinSparedRing", "infections", "recoveries",
  "infectedCount", "immuneCount", "peakInfected", "hazardShare", "power",
  "maxGeneration", "maxPopEver", "maxPopTick", "recordYoung",
  "carnivoreFrac", "avgLearning", "avgVoice",
  "avgHeard", "groundBias", "patchBias", "soilShare", "_lastSpawned", "_lastSprouted",
  "refugeShare", "hunterCeiling", "livedRefugeRadius", "livedRefugeShare",
  "avgGeneration", "currentMaxGeneration", "carnivoreCount",
  "avgHidden", "avgConns", "maxHidden",
  "seasonLag", "seasonLagEvery",
];

/**
 * Nothing. Every measurement the pond keeps is in the channel, including the
 * two construction parameters and the three history buffers — the archive's own
 * thinning state is exactly the kind of thing that can differ while every
 * creature agrees, which is what this channel is for.
 *
 * The list exists anyway, so that a field which *should* stay outside has
 * somewhere to be written down with its reason rather than being deleted from
 * `STATS_HASHED` and forgotten. (`Stats`'s methods and `Energy`'s four derived
 * getters are on the prototype, so they are not own properties and never enter
 * this question. A derived total that disagreed with its own inputs would be a
 * bug in the getter, not a difference between two worlds.)
 */
export const STATS_UNHASHED = {
  recordYoungId: "the *name* on the pond's one individual record (v1.124) — a " +
    "creature id, which is a module-level counter that never resets, so the " +
    "second world built in a process never agrees with the first however " +
    "identical the two ponds are. `CREATURE_UNHASHED.id` has kept ids out of " +
    "the state hash for that reason since v1.53, and a book carrying one " +
    "fails every paired 'this feature is off and changed nothing' assertion " +
    "in the suite on a record that is correct. The record itself — how many " +
    "young, when, and whether the holder is still alive — is in " +
    "`STATS_HASHED` beside it, so what is outside the instrument here is the " +
    "identity and not the measurement",
};

/** Every own property of `world.energy`: the eight stored fields, `buried` split by cause. */
export const ENERGY_HASHED = [
  "crop", "carrion", "founders", "metabolism", "digested", "spilled", "rotted",
  "buriedBy",
];

/** Nothing, for the same reason as `STATS_UNHASHED`. */
export const ENERGY_UNHASHED = {};

/**
 * The fifth channel: the pond's books.
 *
 * The four channels below and above are the world, its representation, the
 * observer's tree, and the random stream — and none of them touches a counter.
 * `world.stats` carries fifty-nine own properties and `world.energy` eight;
 * until v1.59 the shared paired assertion named **three** of them by hand, and a
 * feature that was switched off and wrote to any of the others left every
 * fingerprint in this project bit-identical.
 *
 * That is not a hypothetical gap, it is the same gap `observationFingerprint`
 * was built for one surface over: the books are an *output*, so a difference in
 * them is invisible to any picture of the pond, by construction. A hash of the
 * state cannot fail on a miscount, because a miscount does not move a creature.
 *
 * Same-process only, like `stateFingerprint` — the books gain a field most
 * releases, so a golden constant recorded from this would be a note about the
 * last time somebody re-recorded it. What it is *for* is the paired comparison:
 * two worlds that ought to be identical, one of which may have been counting.
 *
 * Read-only: it draws no random numbers and writes nothing. There is a test.
 *
 * @param {import('./world.js').World} world
 * @returns {string} eight hex digits
 */
export function booksFingerprint(world) {
  const h = new Hash();
  h.word(0x424f4f4b); // domain separator: "BOOK"
  mixBook(h, world.stats, STATS_HASHED);
  mixBook(h, world.energy, ENERGY_HASHED);
  return h.digest();
}

/**
 * Every own property of `world.chronicle` that `chronicleFingerprint` hashes:
 * the feed itself, the length it is capped at, and all thirty-six latches.
 *
 * A latch is not bookkeeping about the past — it is a decision about the
 * future. `_firstKill` says whether "first blood" can ever be written again;
 * `_sawBelowRefuge` is the guard that stops the pond announcing a crossing it
 * never made. Two chronicles holding the same lines and different latches are
 * two narrators who will say different things from here on, which is exactly
 * the shape `observationFingerprint` had to grow in v1.91 (`nextId`,
 * `_lastSample`) after a sweep found the tree's own future outside its hash.
 * Written from a *stepped* chronicle, for the reason `STATS_HASHED` gives.
 */
export const CHRONICLE_HASHED = [
  "events", "max",
  "_popCrossed", "_genCrossed", "_carnCrossed", "_hiddenMax",
  "_firstKill", "_firstSpared", "_learned", "_predsAlive",
  "_inCrash", "_recentMax", "_maxAge", "_lowDiversity", "_dominant",
  "_nightFell", "_dawnBroke", "_nightKill", "_wasDark", "_lastKills",
  "_reportedExtinct", "_reportedBranch", "_dieoff",
  "_outbreak", "_epidemic", "_recovered", "_herd", "_burnout",
  "_peakFood", "_stripped", "_regreened", "_leadingCause",
  "_settled", "_settleStreak", "_soilFed", "_soilStreak",
  "_refugeCrossed", "_sawBelowRefuge",
];

/** The two fields outside the channel, and why each is right to be. */
export const CHRONICLE_UNHASHED = {
  config: "the question, not the answer — the same object `WORLD_UNHASHED` " +
    "names, reached through the narrator instead of through the world",
  rng: "the diversity probe's own stream, and its position lives in the " +
    "closure `mulberry32` returns exactly as `world.rng`'s does. No walk of " +
    "an object can reach it; `drawStream` can, and `assertUnaffected` attaches " +
    "one to this generator as well as to the pond's, because a probe that " +
    "shifted without crossing a threshold would move no line and no latch",
};

/**
 * The sixth channel: what the pond was *said* to have done.
 *
 * The five channels above are the world, its representation, the observer's
 * tree, the random stream and the books. `world.chronicle` is an output like
 * the tree and the books — v1.91 measured it inert with respect to the
 * simulation, so nothing here is a determinism hole — and being an output is
 * precisely why it needs a channel of its own: a difference in a narration
 * moves no creature, so every other hash in this project is blind to it by
 * construction, the same argument `observationFingerprint` and
 * `booksFingerprint` were each built on one surface over.
 *
 * What that blindness covered: thirty-eight own fields, of which the v1.91
 * state sweep could not even *enumerate* five, because a `Set` keeps its
 * members where `Object.keys` cannot see them — so a chronicle that had
 * already announced the pond passing 100 creatures and one that had not were
 * the same object to every instrument here.
 *
 * Same-process only, like `stateFingerprint` and `booksFingerprint`: a line's
 * wording is prose, and prose is edited. What it is *for* is the paired
 * comparison — two worlds that ought to be identical, one of which may have
 * been talking.
 *
 * Read-only: it draws no random numbers and writes nothing. There is a test.
 *
 * @param {import('./world.js').World} world
 * @returns {string} eight hex digits
 */
export function chronicleFingerprint(world) {
  const h = new Hash();
  h.word(0x53414944); // domain separator: "SAID"
  return mixBook(h, world.chronicle, CHRONICLE_HASHED).digest();
}

/** Mix one ledger's named fields, by name, so a rename is a difference. */
function mixBook(h, book, names) {
  if (!book) return h.word(0xdeadbeef);
  h.word(names.length);
  for (const n of names) {
    h.text(n);
    mixValue(h, book[n]);
  }
  return h;
}

/**
 * The fourth channel: the random sequence itself.
 *
 * The three hashes above are all pictures of a world at an instant, and the
 * canonical violation of the second prime directive does not show up in one. A
 * feature that is switched off and draws a number anyway — and throws it away —
 * leaves the pond bit-identical at that moment; the divergence arrives later,
 * when the shifted stream reaches a decision. Measured on seed 21: one
 * discarded `rng.next()` is invisible to all three fingerprints and moves the
 * trajectory **eight ticks later**. So a test comparing states at a horizon
 * shorter than that is comparing two worlds that have already parted.
 *
 * v1.45 and v1.47 both hit this and both solved it by *counting* draws. A count
 * is the right idea and the weaker form of it: two streams can agree on how many
 * numbers were taken and disagree on which consumer took which. Hashing the
 * values makes the whole sequence the assertion, at the cost of two words per
 * draw.
 *
 * Replaces `rng.next` in place, which is what the two counting tests did too —
 * the wrapper is a recorder, not a substitute: it returns exactly what the
 * generator returned, so a recorded world is bit-for-bit an unrecorded one.
 * There is a test.
 *
 * @param {import('./rng.js').RNG} rng
 * @returns {{count: number, digest: () => string}} live view of the stream
 */
export function drawStream(rng) {
  const inner = rng.next;
  const h = new Hash();
  const view = { count: 0, digest: () => h.digest() };
  rng.next = () => {
    const v = inner();
    view.count++;
    h.num(v);
    return v;
  };
  return view;
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
