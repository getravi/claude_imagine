// creature.js — a single living agent.
//
// Life cycle each tick:
//   1. sense()   build the input vector from the world around it
//   2. think()   run the brain to get motor commands
//   3. act()     turn, thrust, move (with drag), pay the metabolic bill
//   4. (world handles eating, reproduction, and death)
//
// A creature never "knows" its goal. It has no score, no reward. It just moves
// according to weights it inherited. The ones whose weights happen to steer
// them toward food live long enough to copy those weights (with mutations) into
// offspring. Everything that looks like purpose is selection in disguise.

import { wrapDelta, wrap, normalizeAngle, clamp, lerp } from "./vec.js";
import { Genome, migrateGenomeData } from "./genome.js";
import { NeatGenome } from "./neat.js";

let NEXT_ID = 1;

// Index of the "how close is the nearest thing that could eat me" sense within
// the input vector built by sense(). Named because stats.js reads it too, to
// ask whether a creature's call depends on being in danger.
export const INPUT_THREAT_PROX = 10;

/**
 * Reconstruct a genome from its serialized form, dispatching on the kind tag so
 * save/load works for both fixed-topology and NEAT worlds. Falls back to the
 * pre-v1.5 format (a bare array of numbers) for old saves.
 */
export function deserializeGenome(g) {
  // Fixed-topology vectors are run through the layout migration, so a world
  // saved before the ear existed loads with a silent one rather than a genome
  // of the wrong length.
  if (Array.isArray(g)) return new Genome(migrateGenomeData(Float32Array.from(g))); // legacy format
  if (g && g.k === "neat") return NeatGenome.fromData(g);
  return new Genome(migrateGenomeData(Float32Array.from(g.d)));
}

/**
 * Build a creature's brain from its genome, wiring in lifetime learning only if
 * the plasticity feature is switched on in the config. Kept as a free function
 * so the UI can rebuild every brain when the toggle flips.
 */
export function buildBrainFor(genome, config) {
  const learn = config.plasticity
    ? { rate: config.learnRate, decay: config.learnDecay, clamp: config.weightClamp }
    : null;
  return genome.buildBrain(learn, !!config.signalling, !!config.groundSense);
}

/**
 * How much of a creature's steering the ground under it is currently deciding:
 * the mean absolute change in its turn and thrust commands between standing on
 * the flattest ground and the roughest, with every other sense held at what it
 * actually perceived this tick. On the same (-1, 1) scale as the motor commands,
 * so 0.3 means the ground is worth about 15% of the full range of both.
 *
 * Exactly 0 when the creature has no ground sense, which is what makes it worth
 * showing: a readout that is non-zero with its mechanism off is not measuring
 * the mechanism.
 *
 * It is a *hypothetical*, so it runs with learning suppressed — asking a plastic
 * brain what it would do somewhere else must not teach it anything.
 *
 * Note what this number is not. It says the wire carries something, not that
 * the wire is any use: `docs/SCIENCE.md` measures the same quantity against a
 * scrambled arm and finds selection indifferent to it.
 * @param {Creature} c
 */
export function groundSway(c) {
  const brain = c.brain;
  if (!c.config.groundSense || !brain.nAux) return 0;
  const n = brain.nAux;
  // The foot is the last aux channel (see genome.js), whatever else is wired in.
  const lo = new Float32Array(n);
  const hi = new Float32Array(n);
  for (let i = 0; i < n - 1; i++) lo[i] = hi[i] = c._aux[i];
  hi[n - 1] = 1;
  const flat = Float32Array.from(brain.forward(c._in, n === 1 ? 0 : lo, false));
  const rough = brain.forward(c._in, n === 1 ? 1 : hi, false);
  return (Math.abs(rough[0] - flat[0]) + Math.abs(rough[1] - flat[1])) / 2;
}

export class Creature {
  /**
   * @param {Genome} genome
   * @param {object} config
   * @param {number} x
   * @param {number} y
   * @param {RNG} rng
   * @param {number} generation - lineage depth (0 for founders)
   */
  constructor(genome, config, x, y, rng, generation = 0) {
    this.id = NEXT_ID++;
    this.genome = genome;
    this.config = config;
    this.brain = buildBrainFor(genome, config);

    this.x = x;
    this.y = y;
    this.heading = rng.range(-Math.PI, Math.PI);
    this.vx = 0;
    this.vy = 0;

    this.energy = config.energyStart;
    this.age = 0;
    this.generation = generation;
    this.children = 0;
    this.dead = false;
    // What killed it, once something has: "starvation", "age" or "predation".
    // Null while alive. Recorded at the moment death is decided rather than
    // inferred afterwards, because by the time the world sweeps up the body the
    // difference between starving and being eaten is invisible — both leave a
    // creature at zero energy.
    this.deathCause = null;
    // Which species (in phylogeny.js) this creature belongs to. Assigned from
    // outside at birth; -1 means "not yet classified".
    this.speciesId = -1;

    // The terrain cost multiplier under this creature, refreshed by the world
    // each tick before it acts (see terrain.js). It is exactly 1 in every world
    // where terrain is off — and stays 1 for a creature stepped outside a world
    // at all — so multiplying by it unconditionally is a true no-op.
    this.ground = 1;

    // Whether rock refused this creature's move on its last turn (barriers
    // only). Always false in a world without them: the flag is set from the
    // resolver's answer, and the resolver is never asked. Read by the world
    // into `stats.walled` and by nothing in the simulation.
    this.walled = false;

    // What that ground *feels* like, if this creature can feel it: 0 on the
    // flattest ground and 1 on the roughest the config allows. It is derived
    // from `ground`, so it is exactly 0 in every world without terrain — a
    // statistic that reads zero when its mechanism is off, and a sense that
    // says nothing when there is nothing to say. Refreshed by sense().
    this.groundFeel = 0;

    // Body traits decoded from body genes.
    this.radius = lerp(config.bodyRadiusMin, config.bodyRadiusMax, genome.sizeGene);
    // Metabolism gene scales base drain from 70%..130% of the world default.
    this.metabolismScale = 0.7 + 0.6 * genome.metabolismGene;
    // Diet: 0 = pure herbivore, 1 = pure carnivore. Drives what this creature
    // can eat, how much nutrition it gets from plants vs meat, and whether it
    // is a predator to others.
    this.carnivory = genome.dietGene;

    // An internal clock that lets brains produce rhythmic behaviour (the input
    // is sin(phase)); the phase advances a little each tick.
    this.phase = rng.range(0, Math.PI * 2);

    // Hue is a heritable trait that drifts as a lineage mutates, so related
    // creatures share a colour family — a visible "family tree".
    this.hue = (genome.hueGene * 360) % 360;

    // Contagion (opt-in — see `disease` in config.js). Epidemiological state:
    // susceptible until infected, infected for diseaseDuration ticks, then
    // immune for the rest of this creature's life. Immunity is acquired, never
    // inherited, so every newborn starts susceptible. All three fields stay at
    // these values unless the feature is switched on.
    this.infected = false;
    this.immune = false;
    this.infectedAtAge = -1; // age at which the current infection began

    // The "colour signal" output. For seventeen versions this was a display
    // value and nothing more; with signalling on it is also what neighbours
    // hear. `prevSignal` is last tick's value — the world reads *that* one, so
    // what a creature hears cannot depend on where it happens to sit in the
    // update order. `heard` is the loudest voice reaching it right now.
    this.signal = 0;
    this.prevSignal = 0;
    this.heard = 0;
    // Age at which this creature last landed a bite (for a brief attack flash).
    this.lastBiteAge = -1000;

    // Scratch input buffer reused every tick.
    this._in = new Float32Array(this.brain.nIn);
    // Scratch buffer for the auxiliary senses (see think()). Length 2 covers
    // both of them; the brain reads only as many as it was wired for.
    this._aux = new Float32Array(2);
  }

  /**
   * True if this creature could eat `other`: it must be carnivorous enough to
   * bother, and physically bigger than its target. Size having a metabolic
   * cost is what stops everything simply evolving to be huge — being a predator
   * is a real trade-off, not a free win. With kin recognition on, a target
   * genetically close enough to be immediate family (see kinRecognitionDistance
   * in config.js) is spared even when otherwise eligible.
   */
  canEat(other) {
    return this._edible(other) && !this._isKin(other);
  }

  /**
   * The half of `canEat` that is about diet and bodies: carnivorous enough to
   * bother, and big enough by `preySizeRatio` to manage it. Everything the rule
   * decides *before* it asks who anybody is related to.
   */
  _edible(other) {
    return (
      this.carnivory >= this.config.carnivoreThreshold &&
      this.radius > other.radius * this.config.preySizeRatio
    );
  }

  /**
   * The other half: close enough in the genome to be immediate family. Exactly
   * `false` in a world without kin recognition, so `canEat` is the size-and-diet
   * test alone there and no genome distance is ever computed.
   */
  _isKin(other) {
    return (
      this.config.kinRecognition &&
      this.genome.distance(other.genome) < this.config.kinRecognitionDistance
    );
  }

  /**
   * True when kinship is the *only* thing standing between this creature and a
   * meal — the moment the rule actually does something, as opposed to the far
   * more common case of a target that was never edible anyway.
   *
   * Split out rather than folded into `canEat` because the world counts these
   * (`stats.kinSpared`) and a predicate that returns "no, and here is why" would
   * put the reason on the hot path of every candidate in every pond. This is
   * asked only where `canEat` has already said no, and only where the flag is
   * on.
   */
  sparesKin(other) {
    return this._edible(other) && this._isKin(other);
  }

  /**
   * Populate the input vector. The world supplies, via the spatial grid, the
   * nearest food, the nearest creature this one could *eat* (prey), and the
   * nearest creature that could eat *it* (threat). Bearings are relative to the
   * creature's own heading, so "turn toward food" / "flee the threat" are
   * direction-independent rules a brain can learn once and reuse everywhere.
   */
  sense(nearestFood, foodDist, nearestPrey, preyDist, nearestThreat, threatDist) {
    const cfg = this.config;
    const inp = this._in;
    const R = cfg.visionRadius;

    // The ground underfoot, normalised to [0, 1] against the roughest ground
    // the config prices. `ground` is exactly 1 without terrain, so this is
    // exactly 0 there — the sense is present and has nothing to report, which
    // is the honest reading rather than a disabled one.
    const costSpan = (cfg.terrainRoughCost || 1) - 1;
    this.groundFeel = costSpan > 0 ? clamp((this.ground - 1) / costSpan, 0, 1) : 0;

    // Helper: relative bearing (sin, cos) and proximity to a target.
    const rel = (t, dist) => {
      if (!t) return [0, 0, 0];
      const dx = wrapDelta(this.x, t.x, cfg.width);
      const dy = wrapDelta(this.y, t.y, cfg.height);
      const ang = normalizeAngle(Math.atan2(dy, dx) - this.heading);
      return [Math.sin(ang), Math.cos(ang), clamp(1 - dist / R, 0, 1)];
    };

    const [foodSin, foodCos, foodProx] = rel(nearestFood, foodDist);
    const [preySin, preyCos, preyProx] = rel(nearestPrey, preyDist);
    const [threatSin, threatCos, threatProx] = rel(nearestThreat, threatDist);
    const speed = Math.hypot(this.vx, this.vy) / cfg.maxSpeed;

    // The exact input list (length must equal BRAIN.inputs in genome.js):
    inp[0] = 1; // bias
    inp[1] = (this.energy / cfg.energyMax) * 2 - 1; // energy, centred
    inp[2] = foodSin;
    inp[3] = foodCos;
    inp[4] = foodProx;
    inp[5] = preySin;
    inp[6] = preyCos;
    inp[7] = preyProx;
    inp[8] = threatSin;
    inp[9] = threatCos;
    inp[INPUT_THREAT_PROX] = threatProx;
    inp[11] = speed;
    inp[12] = Math.sin(this.phase); // internal oscillator
    inp[13] = clamp(this.age / cfg.maxAge, 0, 1) * 2 - 1; // sense of mortality
    inp[14] = this.carnivory * 2 - 1; // knows its own diet...
    inp[15] =
      ((this.radius - cfg.bodyRadiusMin) / (cfg.bodyRadiusMax - cfg.bodyRadiusMin)) * 2 - 1; // ...and its own size
  }

  /**
   * Run the brain. Returns [turn, thrust, colourSignal], each in (-1, 1).
   *
   * The auxiliary senses — what it hears, what it feels underfoot — live outside
   * the input vector so the genome's weight block keeps the shape it has had
   * since v1.0. They are gathered here in genome order, and only the ones this
   * world has switched on, which is exactly how the brain was wired.
   */
  think() {
    const brain = this.brain;
    if (!brain.nAux) return brain.forward(this._in, 0);
    const cfg = this.config;
    let n = 0;
    if (cfg.signalling) this._aux[n++] = this.heard;
    if (cfg.groundSense) this._aux[n++] = this.groundFeel;
    // A single channel is passed as a bare scalar, which is the arithmetic the
    // ear has always taken.
    return brain.forward(this._in, n === 1 ? this._aux[0] : this._aux);
  }

  /**
   * Apply motor commands and physics for one tick, then pay metabolism.
   * @param {number[]|Float32Array} out - brain outputs
   * @param {import('./barriers.js').BarrierField|null} [barriers] the rock, in a
   *   world that has any. Omitted (and null) everywhere else, which is what
   *   keeps the integration below byte-for-byte the one every earlier version
   *   ran.
   * @returns {number} the metabolic bill paid this tick, for the world's energy
   *   ledger. Nothing in here reads it, so a caller may ignore it entirely.
   */
  act(out, barriers = null) {
    const cfg = this.config;
    const turn = out[0];
    const thrust = clamp(out[1], 0, 1); // only forward thrust; no reverse
    this.signal = out[2];

    // Steer and accelerate along the (new) heading.
    this.heading = normalizeAngle(this.heading + turn * cfg.maxTurn);
    const ax = Math.cos(this.heading) * thrust * cfg.thrustAccel;
    const ay = Math.sin(this.heading) * thrust * cfg.thrustAccel;
    this.vx = (this.vx + ax) * cfg.drag;
    this.vy = (this.vy + ay) * cfg.drag;

    // Clamp to max speed.
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > cfg.maxSpeed) {
      const s = cfg.maxSpeed / sp;
      this.vx *= s;
      this.vy *= s;
    }

    // Integrate position on the torus. With barriers on, rock may refuse one or
    // both components of the step; the refused component's velocity is dropped
    // rather than reflected, so a body meeting a wall stops dead against it and
    // keeps running along it. That is the whole of "finding a gate".
    if (barriers) {
      const nx = wrap(this.x + this.vx, cfg.width);
      const ny = wrap(this.y + this.vy, cfg.height);
      const hit = barriers.resolve(this.x, this.y, nx, ny);
      this.x = hit.x;
      this.y = hit.y;
      if (hit.stoppedX) this.vx = 0;
      if (hit.stoppedY) this.vy = 0;
      this.walled = hit.stoppedX || hit.stoppedY;
    } else {
      this.x = wrap(this.x + this.vx, cfg.width);
      this.y = wrap(this.y + this.vy, cfg.height);
    }

    // Advance internal clock.
    this.phase += 0.15;
    if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;

    // --- Metabolism ---
    // Base cost (scaled by body size and the metabolism gene) plus a movement
    // cost proportional to thrust. Bigger, thirstier, faster creatures must
    // find more food to break even. This trade-off is what makes body genes
    // meaningful rather than free.
    const sizeFactor = 1 + (this.radius - cfg.bodyRadiusMin) * cfg.sizeCostFactor * 0.1;
    const base = cfg.metabolicBase * this.metabolismScale * sizeFactor;
    // Only the *movement* half of the bill is scaled by the ground: crossing a
    // ridge is expensive, sitting on one is not. That asymmetry is what makes
    // terrain a landscape rather than a second metabolism gene — it prices
    // travel, so a lineage can pay it deliberately or settle and stop paying.
    // `ground` is exactly 1 unless terrain is switched on.
    const move = cfg.metabolicMove * thrust * sizeFactor * this.ground;
    // Upkeep of being a predator — see carnivoreMetabolicCost in config.js.
    const dietCost = cfg.carnivoreMetabolicCost * this.carnivory;
    // The price of a fever (contagion). `infected` can only ever be true while
    // that feature is on, so this term is an exact 0 in every other world.
    const illCost = this.infected ? cfg.diseaseMetabolicCost : 0;
    // The price of being heard. Without a cost the channel is free chatter and
    // selection has no opinion about it; with one, a call has to earn its keep.
    // Exactly 0 in every world where nobody is listening — both because the
    // branch isn't taken and because adding 0 leaves the sum bit-for-bit.
    const voiceCost = cfg.signalling ? cfg.signalCost * Math.abs(this.signal) : 0;
    const cost = base + move + dietCost + illCost + voiceCost;
    this.energy -= cost;

    this.age++;
    // Starvation is tested first, and `die()` keeps whichever cause arrived
    // first: a creature bitten to zero energy has already been marked by its
    // killer earlier in this same tick, so it is not counted as having starved.
    if (this.energy <= 0) this.die("starvation");
    else if (this.age >= cfg.maxAge) this.die("age");
    // The bill is returned rather than accumulated on the creature: a creature
    // that dies this tick is about to be swept up and would take its total with
    // it, and summing the survivors every tick would count the same lifetime
    // over and over. The world adds each bill exactly once, as it is paid.
    return cost;
  }

  /**
   * Mark this creature dead and record what killed it. The first cause wins, so
   * a body can't be re-attributed by whatever happens to touch it next in the
   * same tick.
   * @param {"starvation"|"age"|"predation"} cause
   */
  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.deathCause = cause;
  }

  /** True if this creature has enough energy to reproduce. */
  canReproduce() {
    return this.energy >= this.config.reproduceThreshold;
  }

  /**
   * Reproduce: spend part of this creature's energy to make a mutated child
   * placed just behind it. The world calls this and inserts the returned
   * creature into the population.
   *
   * If a `mate` genome is supplied (sexual reproduction), the child's genome is
   * a uniform crossover of the two parents before mutation; otherwise the child
   * is a mutated clone of this parent (asexual). Only the initiating parent
   * pays the energy cost — the mate simply donates genes — which keeps the
   * energy bookkeeping identical to the asexual case.
   * @param {RNG} rng
   * @param {import('./genome.js').Genome|null} [mate]
   */
  reproduce(rng, mate = null) {
    const cfg = this.config;
    const childEnergy = this.energy * cfg.reproduceCost;
    this.energy -= childEnergy;
    this.children++;

    // Dispatch crossover to whichever genome kind this creature carries
    // (fixed-topology or NEAT); both expose a static crossover and a
    // config-driven mutateForConfig, so this code is genome-agnostic.
    const base = mate
      ? this.genome.constructor.crossover(this.genome, mate, rng, cfg.signalling, cfg.groundSense)
      : this.genome;
    const childGenome = base.mutateForConfig(rng, cfg);
    const offset = this.radius + 2;
    const cx = wrap(this.x + Math.cos(this.heading + Math.PI) * offset, cfg.width);
    const cy = wrap(this.y + Math.sin(this.heading + Math.PI) * offset, cfg.height);

    const child = new Creature(childGenome, cfg, cx, cy, rng, this.generation + 1);
    child.energy = childEnergy;
    return child;
  }

  /** Serialize enough to recreate this creature (for save/load). */
  toJSON() {
    return {
      g: this.genome.toData(),
      x: this.x,
      y: this.y,
      h: this.heading,
      e: this.energy,
      age: this.age,
      gen: this.generation,
    };
  }

  static fromJSON(obj, config, rng) {
    const genome = deserializeGenome(obj.g);
    const c = new Creature(genome, config, obj.x, obj.y, rng, obj.gen || 0);
    c.heading = obj.h;
    c.energy = obj.e;
    c.age = obj.age || 0;
    return c;
  }
}
