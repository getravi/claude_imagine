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
import { Genome } from "./genome.js";
import { NeatGenome } from "./neat.js";

let NEXT_ID = 1;

/**
 * Reconstruct a genome from its serialized form, dispatching on the kind tag so
 * save/load works for both fixed-topology and NEAT worlds. Falls back to the
 * pre-v1.5 format (a bare array of numbers) for old saves.
 */
export function deserializeGenome(g) {
  if (Array.isArray(g)) return new Genome(Float32Array.from(g)); // legacy format
  if (g && g.k === "neat") return NeatGenome.fromData(g);
  return new Genome(Float32Array.from(g.d));
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
  return genome.buildBrain(learn);
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
    // Which species (in phylogeny.js) this creature belongs to. Assigned from
    // outside at birth; -1 means "not yet classified".
    this.speciesId = -1;

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

    // Transient display value: the "colour signal" output, for rendering.
    this.signal = 0;
    // Age at which this creature last landed a bite (for a brief attack flash).
    this.lastBiteAge = -1000;

    // Scratch input buffer reused every tick.
    this._in = new Float32Array(this.brain.nIn);
  }

  /**
   * True if this creature could eat `other`: it must be carnivorous enough to
   * bother, and physically bigger than its target. Size having a metabolic
   * cost is what stops everything simply evolving to be huge — being a predator
   * is a real trade-off, not a free win.
   */
  canEat(other) {
    return (
      this.carnivory >= this.config.carnivoreThreshold &&
      this.radius > other.radius * this.config.preySizeRatio
    );
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
    inp[10] = threatProx;
    inp[11] = speed;
    inp[12] = Math.sin(this.phase); // internal oscillator
    inp[13] = clamp(this.age / cfg.maxAge, 0, 1) * 2 - 1; // sense of mortality
    inp[14] = this.carnivory * 2 - 1; // knows its own diet...
    inp[15] =
      ((this.radius - cfg.bodyRadiusMin) / (cfg.bodyRadiusMax - cfg.bodyRadiusMin)) * 2 - 1; // ...and its own size
  }

  /** Run the brain. Returns [turn, thrust, colourSignal], each in (-1, 1). */
  think() {
    return this.brain.forward(this._in);
  }

  /**
   * Apply motor commands and physics for one tick, then pay metabolism.
   * @param {number[]|Float32Array} out - brain outputs
   */
  act(out) {
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

    // Integrate position on the torus.
    this.x = wrap(this.x + this.vx, cfg.width);
    this.y = wrap(this.y + this.vy, cfg.height);

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
    const move = cfg.metabolicMove * thrust * sizeFactor;
    // Upkeep of being a predator — see carnivoreMetabolicCost in config.js.
    const dietCost = cfg.carnivoreMetabolicCost * this.carnivory;
    this.energy -= base + move + dietCost;

    this.age++;
    if (this.energy <= 0 || this.age >= cfg.maxAge) this.dead = true;
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
    const base = mate ? this.genome.constructor.crossover(this.genome, mate, rng) : this.genome;
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
