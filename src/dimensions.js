// dimensions.js — which *pairs* of constants are levers?
//
// `src/levers.js` moves every number in `config.js` one at a time and asks
// whether the world notices. It is blind by construction to what a **pair**
// decides, and this project already knows one thing a pair decides and the
// one-at-a-time sweep never saw: `bodyRadiusMax / preySizeRatio` is 7.273 px,
// the size above which nothing this world can grow is able to eat you. Neither
// constant is that number. The quotient is, it sits four fifths of the way up
// the body-radius range, and a mean of 75.7% of the pond is past it at 20,000
// ticks (v1.63, v1.64). A conjunction of two numbers turned the headline
// mechanic off partway through every run and no instrument here could see it.
//
// The obvious sweep — move both, 3,486 pairs, 600 ticks each — is a day of CPU
// per cycle and would still only report *that* something moved. This is the
// cheap screen this file's playbook entry asked for instead, and it runs in
// milliseconds because it never steps a world: **ask, for each pair, whether
// their ratio or product has the units of something the pond can be on both
// sides of.**
//
// Three filters, in increasing strength:
//
//  1. **Dimensional.** Every constant carries a unit (`UNITS`, below). A pair
//     is a candidate if `a/b`, `b/a` or `a*b` lands in the dimension of a
//     quantity the code *compares* — a body radius, an energy, an age, a speed,
//     a standing crop, a population, a cell's nutrient, a trait gene, a genome
//     distance. That is `REFERENCES`.
//  2. **Reachable.** The value has to fall strictly *inside* that quantity's
//     range, because a threshold the pond can be on both sides of is a rule and
//     one it cannot reach is v1.38's "a bound that never binds". Both ends of
//     every reference range are pinned by config, so this is a statement about
//     the world and not about my taste.
//  3. **Adjacent.** Both constants have to be read by the same module, or they
//     never meet and their quotient is arithmetic about nothing. The reader map
//     is passed in (`readersFromSources`) rather than read from disk here, so
//     this module stays importable by the page like every other file in `src/`.
//
// What the screen is honestly blind to, stated up front because a filter's
// domain is the thing to distrust (v1.43):
//
//  - **The dimensionless class**, which is excluded. Every ratio of two
//    same-unit constants lands in it, so a reference for it would admit
//    hundreds of pairs and rank none of them: the screen has no power there.
//    A dimensionless conjunction — two probabilities multiplying into a rate —
//    is exactly the kind of thing this cannot find.
//  - **A reference whose range is the whole world is not a filter.** The
//    pond compares separations in pixels constantly, and the range of a
//    separation on this torus is 0 to 546.5 px, which every pixel-valued
//    combination is inside. It is left out for that reason and not because
//    distances do not matter.
//  - **Three constants.** The refuge is a pair; nothing says the next one is.
//  - **A surviving pair is a candidate, not a finding.** The screen says a
//    number of the right kind exists in a range the pond occupies. Whether the
//    code ever forms it is a question for the code.

import { DEFAULT_CONFIG } from "./config.js";

/**
 * The unit of every numeric constant in `config.js`, as a product of powers of
 * base dimensions. Written the way the comments in `config.js` already say them
 * ("in pixels", "per tick", "per unit of body radius"), so this table is a
 * transcription rather than a theory.
 *
 * Bases that are not physical are still bases: `seed` is an index rather than a
 * quantity, and giving it a dimension nothing else carries is what makes it
 * inert here without a special case.
 *
 * @type {Object<string, string>}
 */
export const UNITS = Object.freeze({
  // --- World ---
  width: "px",
  height: "px",
  seed: "seed", // an index, not a quantity: a base of its own so nothing combines with it

  // --- Food ---
  foodStart: "pellet",
  foodMax: "pellet",
  foodSpawnRate: "pellet/tick",
  foodEnergy: "energy/pellet",
  foodRadius: "px",

  // --- Environment ---
  seasonLength: "tick",
  seasonAmplitude: "1",
  patchCount: "biome",
  patchRadius: "px",
  patchFloor: "1",
  biomeDrift: "px/tick",
  regrowthSpread: "1",
  regrowthRadius: "px",
  regrowthFloor: "1",
  terrainRoughCost: "1",
  terrainBarrenness: "1",
  barrierCount: "wall",
  barrierThickness: "px",
  barrierGaps: "gate",
  barrierGapWidth: "px",
  whiskerRange: "px",

  // --- Detritus ---
  detritusPerRadius: "nutrient/px",
  detritusUptake: "nutrient/pellet",
  detritusFull: "nutrient",
  detritusDecay: "1", // a per-tick retained *fraction*, so dimensionless
  detritusSprout: "1",

  // --- Population ---
  populationStart: "creature",
  populationMax: "creature",
  reseedCount: "creature",
  reseedFloor: "creature",

  // --- Energy ---
  energyStart: "energy",
  energyMax: "energy",
  reproduceThreshold: "energy",
  reproduceCost: "1",
  metabolicBase: "energy/tick",
  metabolicMove: "energy/tick",
  sizeCostFactor: "1/px", // billed as `(radius - bodyRadiusMin) * sizeCostFactor * 0.1`

  // --- Movement ---
  maxSpeed: "px/tick",
  maxTurn: "rad/tick",
  thrustAccel: "px/tick^2",
  drag: "1",

  // --- Senses ---
  visionRadius: "px",
  eatRadius: "px",

  // --- Predation ---
  carnivoreThreshold: "gene", // a threshold on the diet gene, which lives in 0..1
  preySizeRatio: "1",
  biteEnergy: "energy",
  meatEfficiency: "1",
  plantPenaltyFromDiet: "1",
  biteCooldown: "tick",
  corpseEnergyBase: "energy",
  corpseEnergyPerRadius: "energy/px",
  corpseDecay: "energy/tick", // meat *lost* per tick, not a retained fraction
  scavengeRadius: "px",
  carnivoreMetabolicCost: "energy/(tick*gene)",
  kinRecognitionDistance: "gdist",

  // --- Day/night ---
  dayLength: "tick",
  nightVisionFactor: "1",

  // --- Contagion ---
  infectionRadius: "px",
  infectionChance: "1/tick",
  diseaseDuration: "tick",
  diseaseMetabolicCost: "energy/tick",
  diseaseReintroduce: "tick",

  // --- Signalling ---
  signalRadius: "px",
  signalCost: "energy/tick", // per unit of |signal|, and a signal is dimensionless

  // --- Body ---
  bodyRadiusMin: "px",
  bodyRadiusMax: "px",
  maxAge: "tick",

  // --- Plasticity ---
  learnRate: "gdist/tick",
  learnDecay: "1/tick",
  weightClamp: "gdist",

  // --- Evolvable topology ---
  neatWeightRate: "1",
  neatWeightStrength: "gdist",
  neatAddConn: "1",
  neatAddNode: "1",
  neatCompatThreshold: "gdist",

  // --- Mutation ---
  mutationRate: "1",
  mutationStrength: "gdist",
  mateRadius: "px",

  // --- Phylogeny ---
  speciationDistance: "gdist",
  phylogenySampleInterval: "tick",
  phylogenyHistory: "sample",

  // --- Simulation ---
  stepsPerFrame: "tick/frame",
});

// ---------------------------------------------------------------------------
// Unit algebra. Small enough to be obvious, which is the point: an instrument
// nobody can check is the thing v1.65 shipped a broken version of.
// ---------------------------------------------------------------------------

/** `"energy/(tick*gene)"` → `{energy: 1, tick: -1, gene: -1}`. `"1"` → `{}`. */
export function parseUnit(text) {
  const out = {};
  const [num, den = ""] = String(text).split("/");
  const add = (part, sign) => {
    for (const term of part.replace(/[()]/g, "").split("*")) {
      const t = term.trim();
      if (!t || t === "1") continue;
      const [base, exp = "1"] = t.split("^");
      out[base] = (out[base] || 0) + sign * Number(exp);
      if (out[base] === 0) delete out[base];
    }
  };
  add(num, 1);
  add(den, -1);
  return out;
}

/** The inverse, in a canonical order so two equal units print identically. */
export function formatUnit(u) {
  const term = (b, e) => (Math.abs(e) === 1 ? b : `${b}^${Math.abs(e)}`);
  const pos = Object.keys(u).filter((b) => u[b] > 0).sort();
  const neg = Object.keys(u).filter((b) => u[b] < 0).sort();
  const top = pos.length ? pos.map((b) => term(b, u[b])).join("*") : "1";
  if (!neg.length) return top;
  const bottom = neg.map((b) => term(b, u[b])).join("*");
  return `${top}/${neg.length > 1 ? `(${bottom})` : bottom}`;
}

/** Combine two units. `sign` is +1 for a product and -1 for a quotient. */
export function combineUnits(a, b, sign) {
  const out = { ...a };
  for (const base of Object.keys(b)) {
    out[base] = (out[base] || 0) + sign * b[base];
    if (out[base] === 0) delete out[base];
  }
  return out;
}

/** Do two units name the same dimension? */
export function sameUnit(a, b) {
  return formatUnit(a) === formatUnit(b);
}

// ---------------------------------------------------------------------------
// What the pond compares against.
// ---------------------------------------------------------------------------

/**
 * The quantities a running world holds and tests against a threshold, with the
 * range each can occupy. Every bound is read out of the config rather than
 * chosen here, so "inside the range" is a claim about the world.
 *
 * `gdist` is the one range with a soft top: a genome distance is a mean
 * absolute weight difference and nothing bounds it except `weightClamp`, which
 * only applies with `plasticity` on. It is used as the ceiling and labelled so.
 *
 * @param {object} [config]
 * @returns {Array<{name: string, unit: string, lo: number, hi: number, why: string}>}
 */
export function references(config = DEFAULT_CONFIG) {
  return [
    {
      name: "body radius",
      unit: "px",
      lo: config.bodyRadiusMin,
      hi: config.bodyRadiusMax,
      why: "a body is compared against another body by `preySizeRatio`, and against `bodyRadiusMax` when it grows",
    },
    {
      name: "energy carried",
      unit: "energy",
      lo: 0,
      hi: config.energyMax,
      why: "compared against `reproduceThreshold` every tick and against zero at every death",
    },
    {
      name: "age",
      unit: "tick",
      lo: 0,
      hi: config.maxAge,
      why: "compared against `maxAge`; every cooldown and period is a duration in the same units",
    },
    {
      name: "speed",
      unit: "px/tick",
      lo: 0,
      hi: config.maxSpeed,
      why: "clamped against `maxSpeed` after every thrust",
    },
    {
      name: "standing crop",
      unit: "pellet",
      lo: 0,
      hi: config.foodMax,
      why: "compared against `foodMax` before every spawn",
    },
    {
      name: "population",
      unit: "creature",
      lo: 0,
      hi: config.populationMax,
      why: "compared against `populationMax` before every birth and `reseedFloor` after every death",
    },
    {
      name: "cell nutrient",
      unit: "nutrient",
      lo: 0,
      hi: config.detritusFull,
      why: "compared against `detritusFull` on every burial and against `detritusUptake` on every sprout",
    },
    {
      name: "trait gene",
      unit: "gene",
      lo: 0,
      hi: 1,
      why: "a gene lives in 0..1 and the diet gene is compared against `carnivoreThreshold`",
    },
    {
      name: "genome distance",
      unit: "gdist",
      lo: 0,
      hi: config.weightClamp,
      why: "compared against `speciationDistance`, `kinRecognitionDistance`, `neatCompatThreshold`; the ceiling is soft — only `weightClamp` bounds a weight, and only with plasticity on",
    },
  ];
}

// ---------------------------------------------------------------------------
// The range the pond actually occupies, which is not the range config declares.
// ---------------------------------------------------------------------------

/**
 * Every reference quantity's value in one world, right now, one number per
 * thing that has one.
 *
 * `references()` bounds each class with a constant, which is what makes
 * "inside the range" a statement about the config rather than about my taste —
 * and a declared range is still not the range anything lives in. Body radius is
 * declared 3.5..8.0 and settles at 7.4..7.75 (v1.63).
 *
 * The statistic matters more than the sampling here, which is why this returns
 * values rather than a span: **the min and max over a run are not the range the
 * pond occupies, they are the range its founders were drawn from.** Every
 * founder's size gene is uniform on 0..1, `autoReseed` posts fresh ones
 * forever, and a `maxAge` of 4,200 means somebody is always newly born and
 * somebody is always about to die — so a min/max touches both declared ends of
 * almost every class within a few hundred ticks and reports the config back at
 * me. Use `quantileBand`.
 *
 * `genome distance` is absent: it is a property of a *pair* of creatures, and
 * there are ~200² of those per sample.
 *
 * @param {object} world
 * @returns {Object<string, number[]>}
 */
export function sampleQuantities(world) {
  const alive = world.creatures || [];
  const out = {
    "body radius": alive.map((c) => c.radius),
    "energy carried": alive.map((c) => c.energy),
    age: alive.map((c) => c.age),
    speed: alive.map((c) => Math.hypot(c.vx, c.vy)),
    "trait gene": alive.map((c) => c.carnivory),
    "standing crop": world.food ? [world.food.items.length] : [],
    population: [alive.length],
  };
  // Only the cells that hold something. A detritus field is mostly empty — the
  // ground is not a burial — so a band over every cell reports where the field
  // *isn't* and would call `detritusFull` a cap that never binds, which v1.27
  // measured and disproved. A sample has a population as well as a statistic.
  if (world.detritus) out["cell nutrient"] = [...world.detritus.cells].filter((v) => v > 0);
  for (const name of Object.keys(out)) if (!out[name].length) delete out[name];
  return out;
}

/** Append one sample of every class onto an accumulator. */
export function mergeSamples(into, next) {
  const out = { ...into };
  for (const name of Object.keys(next)) out[name] = (out[name] || []).concat(next[name]);
  return out;
}

/**
 * The band a quantity spends all but `tail` of its mass inside, at each end.
 * Nearest-rank, so the bounds are values that were actually observed.
 */
export function quantileBand(values, tail = 0.05) {
  const v = [...values].sort((x, y) => x - y);
  const at = (q) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  return { lo: at(tail), hi: at(1 - tail) };
}

/** `mergeSamples`-shaped accumulator → the `ranges` argument of `screenPairs`. */
export function bands(samples, tail = 0.05) {
  return Object.fromEntries(Object.keys(samples).map((n) => [n, quantileBand(samples[n], tail)]));
}

// ---------------------------------------------------------------------------
// Who reads what.
// ---------------------------------------------------------------------------

/** Modules that talk *about* the constants rather than reading them. */
export const NOT_A_READER = ["config.js", "levers.js", "dimensions.js"];

/** `const { width, height } = this.config` — a read the dot pattern cannot see. */
const DESTRUCTURED = /(?:const|let)\s*\{([^}]*)\}\s*=\s*(?:this\.)?(?:cfg|config)\b/g;

/**
 * Which modules read which constants, from the module sources themselves.
 *
 * The main pattern is a property access (`cfg.maxSpeed`, `this.config.maxSpeed`)
 * rather than a bare mention, because this file is surrounded by prose that
 * names constants in backticks — including, three screens up, the very pair the
 * screen exists to rediscover.
 *
 * The second pattern is a destructuring, and it is here because the test that
 * asserted there were none of those went red on the first run: `barriers.js`,
 * `terrain.js` and `environment.js` all pull `{width, height}` out that way, ten
 * times between them, and a dot-only scan calls the two constants that define
 * the size of the world unread by anything. Write the invariant before you need
 * it (v1.48) — this one was wrong within a second of being written.
 *
 * @param {Object<string, string>} sources  filename → file text
 * @returns {Object<string, string[]>} constant → the modules that read it
 */
export function readersFromSources(sources) {
  const files = Object.keys(sources).filter((f) => !NOT_A_READER.includes(f));
  const unpacked = Object.fromEntries(
    files.map((f) => [
      f,
      new Set(
        [...sources[f].matchAll(DESTRUCTURED)].flatMap((m) => m[1].split(",").map((s) => s.trim().split(":")[0])),
      ),
    ]),
  );
  const out = {};
  for (const key of Object.keys(UNITS)) {
    const re = new RegExp(`\\.${key}\\b`);
    out[key] = files.filter((f) => re.test(sources[f]) || unpacked[f].has(key)).sort();
  }
  return out;
}

// ---------------------------------------------------------------------------
// The screen.
// ---------------------------------------------------------------------------

/**
 * The three ways two numbers combine into one. `expr` builds the printed form
 * from the two names directly rather than by substituting into a template —
 * `"a/b".replace("a", "biteEnergy")` then eats the `b` of `biteEnergy`, which
 * is how the first run of this screen reported `corpseDecayiteEnergy/b`.
 */
const COMBINATIONS = [
  { form: "a/b", value: (a, b) => a / b, unit: (ua, ub) => combineUnits(ua, ub, -1), expr: (a, b) => `${a}/${b}` },
  { form: "b/a", value: (a, b) => b / a, unit: (ua, ub) => combineUnits(ub, ua, -1), expr: (a, b) => `${b}/${a}` },
  { form: "a*b", value: (a, b) => a * b, unit: (ua, ub) => combineUnits(ua, ub, 1), expr: (a, b) => `${a}*${b}` },
];

/**
 * Screen every pair of numeric constants for a latent threshold.
 *
 * @param {object} [options]
 * @param {object} [options.config]  the world to screen (defaults to `DEFAULT_CONFIG`)
 * @param {Object<string, string[]>} [options.readers]  from `readersFromSources`;
 *   omit to skip the adjacency filter entirely
 * @param {Object<string, {lo: number, hi: number}>} [options.ranges]  from
 *   `occupancy`; omit to use the ranges `config` declares
 * @returns {Array<{a: string, b: string, form: string, expr: string, value: number,
 *   unit: string, reference: string, inside: boolean, shared: string[]}>}
 *   every dimensional candidate, `inside` saying whether it is also reachable.
 */
export function screenPairs({ config = DEFAULT_CONFIG, readers = null, ranges = null } = {}) {
  const keys = Object.keys(UNITS).filter((k) => typeof config[k] === "number");
  const refs = references(config).map((r) => ({
    ...r,
    ...(ranges && ranges[r.name] ? ranges[r.name] : {}),
    parsed: parseUnit(r.unit),
  }));
  const units = Object.fromEntries(keys.map((k) => [k, parseUnit(UNITS[k])]));
  const found = [];

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      const shared = readers ? readers[a].filter((m) => readers[b].includes(m)) : null;
      if (readers && shared.length === 0) continue;

      for (const c of COMBINATIONS) {
        const unit = c.unit(units[a], units[b]);
        const ref = refs.find((r) => sameUnit(r.parsed, unit));
        if (!ref) continue;
        const value = c.value(config[a], config[b]);
        if (!Number.isFinite(value)) continue;
        found.push({
          a,
          b,
          form: c.form,
          expr: c.expr(a, b),
          value,
          unit: formatUnit(unit),
          reference: ref.name,
          inside: value > ref.lo && value < ref.hi,
          shared: shared || [],
        });
      }
    }
  }
  return found;
}

/** The survivors of all three filters, strongest first: the shortlist. */
export function latentThresholds(options = {}) {
  return screenPairs(options).filter((f) => f.inside);
}
