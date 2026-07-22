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

let NEXT_ID = 1;

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
    this.brain = genome.buildBrain();
    this.config = config;

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

    // Body traits decoded from body genes.
    this.radius = lerp(config.bodyRadiusMin, config.bodyRadiusMax, genome.sizeGene);
    // Metabolism gene scales base drain from 70%..130% of the world default.
    this.metabolismScale = 0.7 + 0.6 * genome.metabolismGene;

    // An internal clock that lets brains produce rhythmic behaviour (the input
    // is sin(phase)); the phase advances a little each tick.
    this.phase = rng.range(0, Math.PI * 2);

    // Hue is a heritable trait that drifts as a lineage mutates, so related
    // creatures share a colour family — a visible "family tree".
    this.hue = (genome.hueGene * 360) % 360;

    // Transient display value: the "colour signal" output, for rendering.
    this.signal = 0;

    // Scratch input buffer reused every tick.
    this._in = new Float32Array(this.brain.nIn);
  }

  /**
   * Populate the input vector from the nearest food and nearest neighbour,
   * both supplied by the world (which found them via the spatial grid).
   * Bearings are expressed relative to the creature's own heading, so a brain
   * learns "turn toward food" independent of absolute compass direction.
   */
  sense(nearestFood, foodDist, nearestMate, mateDist) {
    const cfg = this.config;
    const inp = this._in;
    const R = cfg.visionRadius;

    // Relative bearing + proximity to nearest food.
    let foodSin = 0;
    let foodCos = 0;
    let foodProx = 0;
    if (nearestFood) {
      const dx = wrapDelta(this.x, nearestFood.x, cfg.width);
      const dy = wrapDelta(this.y, nearestFood.y, cfg.height);
      const ang = normalizeAngle(Math.atan2(dy, dx) - this.heading);
      foodSin = Math.sin(ang);
      foodCos = Math.cos(ang);
      foodProx = clamp(1 - foodDist / R, 0, 1);
    }

    // Relative bearing + proximity to nearest other creature.
    let mateSin = 0;
    let mateCos = 0;
    let mateProx = 0;
    if (nearestMate) {
      const dx = wrapDelta(this.x, nearestMate.x, cfg.width);
      const dy = wrapDelta(this.y, nearestMate.y, cfg.height);
      const ang = normalizeAngle(Math.atan2(dy, dx) - this.heading);
      mateSin = Math.sin(ang);
      mateCos = Math.cos(ang);
      mateProx = clamp(1 - mateDist / R, 0, 1);
    }

    const speed = Math.hypot(this.vx, this.vy) / cfg.maxSpeed;

    // The exact input list (length must equal BRAIN.inputs in genome.js):
    inp[0] = 1; // bias
    inp[1] = (this.energy / cfg.energyMax) * 2 - 1; // energy, centred
    inp[2] = foodSin;
    inp[3] = foodCos;
    inp[4] = foodProx;
    inp[5] = mateSin;
    inp[6] = mateCos;
    inp[7] = mateProx;
    inp[8] = speed;
    inp[9] = Math.sin(this.phase); // internal oscillator
    inp[10] = clamp(this.age / cfg.maxAge, 0, 1) * 2 - 1; // sense of mortality
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
    this.energy -= base + move;

    this.age++;
    if (this.energy <= 0 || this.age >= cfg.maxAge) this.dead = true;
  }

  /** True if this creature has enough energy to reproduce. */
  canReproduce() {
    return this.energy >= this.config.reproduceThreshold;
  }

  /**
   * Asexual reproduction: spend half the energy to make a mutated child placed
   * just beside the parent. The world calls this and inserts the returned
   * creature into the population.
   * @param {RNG} rng
   */
  reproduce(rng) {
    const cfg = this.config;
    const childEnergy = this.energy * cfg.reproduceCost;
    this.energy -= childEnergy;
    this.children++;

    const childGenome = this.genome.mutate(rng, cfg.mutationRate, cfg.mutationStrength);
    const offset = this.radius + 2;
    const cx = wrap(this.x + Math.cos(this.heading + Math.PI) * offset, cfg.width);
    const cy = wrap(this.y + Math.sin(this.heading + Math.PI) * offset, cfg.height);

    const child = new Creature(childGenome, cfg, cx, cy, rng, this.generation + 1);
    child.energy = childEnergy;
    // Nudge the child's hue toward its decoded gene but keep lineage cohesion.
    return child;
  }

  /** Serialize enough to recreate this creature (for save/load). */
  toJSON() {
    return {
      g: Array.from(this.genome.data),
      x: this.x,
      y: this.y,
      h: this.heading,
      e: this.energy,
      age: this.age,
      gen: this.generation,
    };
  }

  static fromJSON(obj, config, rng) {
    const genome = new Genome(Float32Array.from(obj.g));
    const c = new Creature(genome, config, obj.x, obj.y, rng, obj.gen || 0);
    c.heading = obj.h;
    c.energy = obj.e;
    c.age = obj.age || 0;
    return c;
  }
}
