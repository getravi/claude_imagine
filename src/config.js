// config.js — the "physics constants" of the Vivarium universe.
//
// Every number that shapes the world's dynamics lives here so the balance is
// tunable from one place (and, for a few of them, from the UI sliders). These
// defaults were hand-tuned to sit in the interesting regime: not so harsh that
// life dies out in seconds, not so generous that the world instantly fills and
// stagnates. Evolution is sensitive to these — nudging metabolism or food rate
// visibly changes what strategies win.

export const DEFAULT_CONFIG = Object.freeze({
  // --- World ---
  width: 900,
  height: 620,
  // The default seed is chosen (from a 17-seed survey) to reliably evolve a
  // visible predator/prey mix within the first couple of minutes, so the
  // headline mechanic shows itself on load. Most seeds stay herbivore; hit the
  // 🎲 button to wander into other worlds.
  seed: 314,

  // --- Food ---
  // These were hand-tuned by sweeping seeds: they give a soft early game (no
  // "death valley" crash), a lively steady state of ~300-500 creatures that
  // oscillates below the cap rather than pinning to it, and food that stays
  // visibly grazed (foraging pressure you can see).
  foodStart: 280, // pellets present at world birth
  foodMax: 520, // hard cap on standing food
  foodSpawnRate: 1.8, // pellets added per simulated tick (fractional accrues)
  foodEnergy: 23, // energy granted by eating one pellet
  foodRadius: 3,

  // --- Population ---
  populationStart: 40,
  populationMax: 650, // safety cap so the sim can't explode
  autoReseed: true, // sprinkle fresh random creatures if life dies out
  reseedCount: 8,

  // --- Creature energy budget ---
  energyStart: 95,
  energyMax: 220,
  reproduceThreshold: 160, // split once energy passes this
  reproduceCost: 0.5, // fraction of energy handed to the child
  metabolicBase: 0.051, // energy drained per tick just by existing
  metabolicMove: 0.09, // extra drain proportional to thrust used
  sizeCostFactor: 0.5, // bigger bodies cost more to run

  // --- Movement ---
  maxSpeed: 2.6,
  maxTurn: 0.32, // radians per tick at full turn command
  thrustAccel: 0.22,
  drag: 0.86, // velocity retained each tick (0..1)

  // --- Senses ---
  visionRadius: 168, // how far a creature can see food/others
  eatRadius: 8, // contact distance to consume food

  // --- Predation (v1.1) ---
  // Creatures with a diet gene at/above the threshold are carnivores and can
  // attack smaller creatures on contact. Nutrition from plants scales with how
  // herbivorous you are, and from meat with how carnivorous — so becoming a
  // predator means giving up efficient grazing. That trade-off, plus the
  // metabolic cost of the size predators need, is what keeps the two niches in
  // balance instead of everyone becoming a carnivore.
  predation: true, // master switch for the whole mechanic
  carnivoreThreshold: 0.55, // diet gene >= this ⇒ can hunt
  preySizeRatio: 1.1, // predator must be > prey.radius * this (clearly bigger)
  biteEnergy: 40, // energy transferred per successful bite
  meatEfficiency: 1.0, // fraction of a bite a full carnivore absorbs
  plantPenaltyFromDiet: 0.4, // how much carnivory reduces plant nutrition (0..1)
  biteCooldown: 8, // ticks a predator must wait between bites ("handling time")
  // Ongoing metabolic cost of carnivory (per unit diet, per tick). This is the
  // upkeep of "hunting apparatus": it makes being a predator cost something
  // even when you aren't eating, so in a world with no viable prey selection
  // pushes the diet gene back down toward herbivory. Predators only persist
  // where hunting actually pays for this cost.
  carnivoreMetabolicCost: 0.03,

  // --- Body ---
  bodyRadiusMin: 3.5,
  bodyRadiusMax: 8.0,
  maxAge: 4200, // ticks; nothing lives forever

  // --- Mutation ---
  mutationRate: 0.09,
  mutationStrength: 0.16,
  // Reproduction mode. Off by default: creatures split asexually (a mutated
  // clone). Turn it on and a reproducing creature crosses genomes with the
  // nearest partner within mateRadius, if one is close enough.
  sexualReproduction: false,
  mateRadius: 34,

  // --- Simulation ---
  stepsPerFrame: 1, // increased by the speed control
});

/** A shallow, writable copy callers can mutate (e.g. from UI sliders). */
export function makeConfig(overrides = {}) {
  return { ...DEFAULT_CONFIG, ...overrides };
}
