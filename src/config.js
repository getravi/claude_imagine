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

  // --- Environment: seasons (temporal) & biomes (spatial) — v1.3 ---
  // Seasons swing the food spawn rate on a sine "year", so the pond booms in
  // summer and bottlenecks in winter. Amplitude is kept moderate so winter
  // never wipes the world out (verified across seasons and seeds).
  seasons: true,
  seasonLength: 2600, // ticks per full year
  seasonAmplitude: 0.3, // food rate swings within [1-amp, 1+amp]
  // Biomes concentrate food into fertile patches instead of spreading it evenly,
  // so where a creature lives matters. patchFloor keeps the barren areas from
  // being total deserts. Total food influx is unchanged — only its placement.
  foodPatches: true,
  patchCount: 4, // number of fertile biome centres
  patchRadius: 135, // spread (sigma) of each biome, in pixels
  patchFloor: 0.15, // minimum fertility far from any biome (0..1)
  // Drifting biomes: pixels/tick each biome roams. 0 = static (default, so
  // worlds are unchanged); a small value makes the food landscape continuously
  // shift, forcing migration and preventing the pond from settling.
  biomeDrift: 0,

  // Regrowth (opt-in): food that grows from food. Until now pellets appeared out
  // of nowhere at a constant rate, so grazing had no lasting consequence — strip
  // a biome bare and it refilled just as fast as an untouched one. With regrowth
  // on, plants reproduce: most new pellets are seeded within regrowthRadius of an
  // existing one, and the spawn rate scales with the standing crop (down to
  // regrowthFloor when nothing is left). A herd can therefore ruin a patch, and
  // the pond has to grow its way back from whatever survived. Off by default, and
  // a pure no-op when off (rate multiplier is exactly 1, placement untouched), so
  // default worlds are bit-for-bit unchanged.
  foodRegrowth: false,
  regrowthSpread: 0.85, // share of new pellets seeded from a parent; the rest appear anywhere
  regrowthRadius: 30, // how far a seed can fall from its parent, in pixels
  // Hand-tuned by sweeping floors from 0.25 to 0.5 across seeds: 0.35 keeps the
  // boom-and-bust obvious (the crop still swings from near-bare to full) while
  // leaving the pond a healthy standing population rather than a thin one.
  regrowthFloor: 0.35, // spawn-rate multiplier when the pond is completely bare (0..1)

  // Terrain (v1.23, opt-in): the ground stops being the same everywhere. Food
  // has had biomes since v1.3 and time has had seasons, but *space* was still
  // uniform — being anywhere cost exactly what being anywhere else cost. With
  // terrain on, a static seed-derived roughness landscape does two things:
  // rough ground costs more to cross (up to terrainRoughCost on the movement
  // half of the metabolic bill) and grows less (terrainBarrenness). Nothing is
  // blocked, and nothing can perceive it — the pond ends up in its basins
  // because that is where the living can afford to be, not because anything
  // steers there. The landscape comes from an integer hash of the seed rather
  // than the world RNG, so switching terrain on draws zero random numbers and
  // every existing world is untouched.
  terrain: false,
  // Swept over four seeds at 9,000 ticks: the settling effect climbs from
  // -0.029 at 1.6x to -0.057 at 2.6x and then flattens, while the population it
  // supports falls steadily (239 -> 209 -> 174 by 4.0x). 2.6 is the knee — very
  // nearly the whole effect, for a pond that is still busy.
  terrainRoughCost: 2.6, // movement-cost multiplier on the roughest ground
  // Ridges are barren as well as expensive: the chance a new pellet takes falls
  // by up to this much across the roughness range.
  //
  // This is the half of the mechanic that actually works, and the number is
  // load-bearing rather than cosmetic. At 0 — a pure movement tax, at the full
  // 2.6x cost — the population settles by -0.003, which is to say not at all;
  // at 0.5 it is -0.011; at 0.85 it is -0.057. The write-up and the control that
  // found this are in docs/SCIENCE.md. 1.0 buys almost nothing over 0.85 and
  // turns the worst ridges into literal bare rock, which reads as a bug.
  terrainBarrenness: 0.85, // 0 = ground doesn't care, 1 = the worst ridge is bare rock

  // Detritus (v1.27, opt-in): the ground remembers where things died. Food has
  // arrived from nowhere since v1.0 — v1.18 made the crop conditional on itself
  // and v1.23 on the ground, but a death still had no consequence for the pond
  // it happened in. With detritus on, a body leaves nutrient in the cell under
  // it, the nutrient rots away, and a share of the pellets that used to appear
  // from nowhere instead sprout out of it and draw it down. Total influx is
  // unchanged (a refused seed simply spawns the old way), so this moves the crop
  // rather than enlarging it — the same contract the biomes have kept since v1.3.
  // Off by default; with it off the field does not exist, so not one branch is
  // taken and not one random number is drawn.
  detritus: false,
  // Nutrient left per unit of body radius. Bodies run 3.5..8, so a typical death
  // leaves ~4 units and can therefore feed ~4 pellets — a little under what the
  // creature ate to grow that big, which is the right side of honest.
  detritusPerRadius: 0.8,
  detritusUptake: 1.0, // nutrient a sprouting pellet consumes
  // What one cell (about 30px square) can hold. The cap is load-bearing — without
  // it a die-off in one biome would own the whole crop for thousands of ticks
  // after — and this value is the smallest round number that never truncates a
  // *single* body, since the largest possible creature is worth 6.4. Set to 4 it
  // silently threw away a third of every big carcass and the share of the crop
  // growing from the dead fell from 24% to 17%; 12 buys one further point (25%)
  // and starts letting one cell bank three bodies.
  detritusFull: 8.0,
  // Per-tick nutrient retained — a half-life of about 230 ticks, so the ground
  // remembers a die-off for roughly a fifth of a season and then forgets it.
  detritusDecay: 0.997,
  // Share of the "from nowhere" pellets that try to grow out of the dead first.
  // Not 1: some of the crop stays unconditional, so a pond that has just been
  // through a crash is not left waiting on the very deaths it needs to recover
  // from.
  detritusSprout: 0.75,

  // --- Population ---
  populationStart: 40,
  populationMax: 650, // safety cap so the sim can't explode
  autoReseed: true, // sprinkle fresh random creatures if life dies out
  reseedCount: 8, // added at once when the world goes fully extinct
  // Gentle rescue: if a crash (e.g. a harsh winter in a predator world) drops
  // the population below this, trickle in a couple of fresh creatures per tick
  // so it bounces back quickly instead of lingering near-dead. Keeps the toy
  // from ever *looking* extinct without erasing the drama of a population crash.
  reseedFloor: 5,

  // --- Creature energy budget ---
  energyStart: 95,
  // The ceiling on what one creature can hold — and, in any normal world, a
  // parameter with no effect whatsoever. It sits above `reproduceThreshold`, so
  // a creature always splits before it can fill up and the clamp is never
  // reached: the energy ledger (v1.29) measures the pond spilling *exactly*
  // zero. It only starts to bite when reproduction is blocked, which happens
  // at `populationMax` — and then it becomes the largest single sink in the
  // world, throwing away a third of everything the pond makes. Raising it,
  // lowering it, or deleting it changes nothing until that cap binds; see
  // docs/SCIENCE.md and `test/energy.test.js`, which pins both halves.
  energyMax: 220,
  reproduceThreshold: 160, // split once energy passes this — below energyMax, which is the point
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

  // Scavenging (v1.8, opt-in): when a creature dies it leaves a corpse that
  // carnivores can feed on — closing the nutrient loop (death → food) and
  // opening a scavenger niche distinct from hunting. Off by default, and a pure
  // no-op when off, so worlds are unchanged.
  scavenging: false,
  corpseEnergyBase: 14, // baseline meat in a corpse...
  corpseEnergyPerRadius: 3.2, // ...plus this much per unit of body radius
  corpseDecay: 0.16, // meat lost per tick as a corpse rots away
  // Ongoing metabolic cost of carnivory (per unit diet, per tick). This is the
  // upkeep of "hunting apparatus": it makes being a predator cost something
  // even when you aren't eating, so in a world with no viable prey selection
  // pushes the diet gene back down toward herbivory. Predators only persist
  // where hunting actually pays for this cost.
  carnivoreMetabolicCost: 0.03,

  // Kin recognition (opt-in): a predator that is genetically close enough to
  // its target — a recent parent, sibling, or offspring — declines to treat
  // it as prey (and, symmetrically, isn't sensed as a threat by that kin
  // either). Reuses the same genome.distance() metric as speciation. The
  // threshold sits well below speciationDistance, so it protects immediate
  // family without granting blanket immunity to the rest of a species — two
  // members separated by many generations of mutation still see each other
  // as fair game. Off by default and draws no randomness either way, so
  // default worlds are unaffected.
  kinRecognition: false,
  kinRecognitionDistance: 0.05,

  // Day/night cycle (opt-in): vision radius breathes on a fixed period, full
  // by day and shrunk toward nightVisionFactor at the deepest night, via a
  // smooth cosine — creatures go effectively night-blind on a schedule with
  // no new sense or gene required. Off by default, and the factor is a
  // constant 1 whenever it's off, so default worlds are bit-for-bit
  // unaffected (see environment.js#dayNightVisionFactor).
  dayNightCycle: false,
  dayLength: 900, // ticks for one full day/night cycle
  nightVisionFactor: 0.35, // vision-radius multiplier at midnight (0..1)

  // Contagion (opt-in): a pathogen that spreads by proximity. A susceptible
  // creature near an infected one can catch it; being sick burns extra energy
  // (a fever costs something) for diseaseDuration ticks, after which the
  // survivor is immune for the rest of its life. Immunity is *acquired*, not
  // inherited, so every newborn is susceptible again — which is what makes the
  // epidemic come in waves instead of burning out once. The cost is
  // density-dependent, so it pushes back against the crowding that fertile
  // biomes encourage. Off by default; the whole mechanic is skipped when off,
  // so it draws no randomness and default worlds are bit-for-bit unchanged.
  disease: false,
  infectionRadius: 22, // contact distance for transmission (pixels)
  infectionChance: 0.045, // per-tick chance one infected neighbour infects you
  diseaseDuration: 360, // ticks an infection runs before recovery
  diseaseMetabolicCost: 0.07, // extra energy drained per tick while sick
  // If the pathogen dies out entirely it can never come back on its own, so a
  // fresh case walks into the pond at the next multiple of this many ticks —
  // which is also how the very first outbreak starts.
  diseaseReintroduce: 900,

  // Signalling (opt-in): give the brain's third output an audience. Every
  // creature since v1.0 has emitted a "colour signal" — it nudges the body's
  // saturation and nothing else, a channel broadcasting to nobody, so selection
  // could never do anything with it either way. Switch this on and a creature
  // also *hears* the loudest voice within signalRadius, attenuated by distance,
  // through an ear (a small block of genes wired into its hidden layer) that
  // evolves like the rest of the brain. Calling costs energy in proportion to
  // how loud it is, which is what stops the channel being free chatter: a call
  // only survives selection if what it buys exceeds what it costs. Hearing is
  // deliberately unaffected by the day/night cycle — a voice carries in the
  // dark. Off by default; while off the ear genes are undrawn, unmutated and
  // unread, so default worlds are bit-for-bit unchanged.
  signalling: false,
  // Kept under the spatial grid's cell size (visionRadius * 0.75) so the
  // existing 3x3 neighbour query already covers everything in earshot.
  signalRadius: 120, // how far a voice carries, in pixels
  signalCost: 0.022, // energy per tick per unit of |signal| — honesty's price

  // --- Body ---
  bodyRadiusMin: 3.5,
  bodyRadiusMax: 8.0,
  maxAge: 4200, // ticks; nothing lives forever

  // --- Neural plasticity / within-lifetime learning (v1.4) ---
  // OFF by default: when off, brains are static from birth and every world is
  // bit-for-bit identical to earlier versions. Switch it on and each connection
  // can adapt during a creature's life, gated by an evolved plasticity gene —
  // a Hebbian nudge toward co-activation plus a decay back to the inherited
  // baseline (see nn.js). Lets a lineage evolve to *learn*, not just to be born
  // knowing (the Baldwin effect).
  plasticity: false,
  learnRate: 0.02, // Hebbian step size per tick
  learnDecay: 0.015, // pull back toward the inherited baseline
  weightClamp: 8, // hard bound on a learned weight (runaway safety net)

  // --- Evolvable brain topology (NEAT-style) — v1.5, opt-in ---
  // OFF by default: brains keep the fixed 16→12→3 shape and every world is
  // identical to earlier versions. Switch it on and brains instead start minimal
  // (a few direct sense→motor links, no hidden neurons) and *grow* structure —
  // new connections and spliced-in neurons — whenever mutation and selection
  // favour more complex wiring.
  evolvableTopology: false,
  neatWeightRate: 0.09, // per-connection weight mutation probability
  neatWeightStrength: 0.16, // stdev of a weight nudge
  neatAddConn: 0.07, // probability of adding a connection per reproduction
  neatAddNode: 0.035, // probability of splicing in a neuron per reproduction
  neatCompatThreshold: 0.28, // species split distance when topology evolves

  // --- Mutation ---
  mutationRate: 0.09,
  mutationStrength: 0.16,
  // Reproduction mode. Off by default: creatures split asexually (a mutated
  // clone). Turn it on and a reproducing creature crosses genomes with the
  // nearest partner within mateRadius, if one is close enough.
  sexualReproduction: false,
  mateRadius: 34,

  // --- Phylogeny / speciation (v1.2, observation only) ---
  // A newborn joins the nearest living species within this genetic distance
  // (mean absolute weight difference), else founds a new one. Smaller = finer
  // splitting into more species; larger = coarser. This never affects the
  // simulation, only how lineages are grouped for the "tree of life" view.
  speciationDistance: 0.15,
  phylogenySampleInterval: 6, // ticks between abundance snapshots
  phylogenyHistory: 520, // snapshots kept for the Muller plot

  // --- Simulation ---
  stepsPerFrame: 1, // increased by the speed control
});

/** A shallow, writable copy callers can mutate (e.g. from UI sliders). */
export function makeConfig(overrides = {}) {
  return { ...DEFAULT_CONFIG, ...overrides };
}
