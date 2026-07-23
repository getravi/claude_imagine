// world.js — the simulation itself: the container that steps time forward.
//
// One tick:
//   1. rebuild spatial grids for creatures and food
//   2. for each creature: find nearest food + neighbour, sense, think, act
//   3. resolve eating (creature over a pellet consumes it)
//   4. resolve reproduction (energetic creatures split)
//   5. remove the dead, compact eaten food, spawn new food
//   6. safety valves: population cap, auto-reseed if life dies out
//
// The world owns its own RNG, so a (seed, config) pair fully determines the
// entire future — a property the tests and the "share a seed" feature rely on.

import { RNG } from "./rng.js";
import { SpatialGrid } from "./grid.js";
import { FoodField, Food } from "./food.js";
import { Creature } from "./creature.js";
import { Genome } from "./genome.js";
import { NeatGenome } from "./neat.js";
import { Stats } from "./stats.js";
import { Phylogeny } from "./phylogeny.js";
import { Chronicle } from "./chronicle.js";
import { FertilityField, seasonalFactor, seasonPhase } from "./environment.js";
import { torusDist2 } from "./vec.js";

export class World {
  constructor(config) {
    this.config = config;
    this.rng = new RNG(config.seed);
    this.tick = 0;

    // The phylogeny watches the population and groups it into species. It must
    // exist before we make the founders, so it can classify them.
    this.phylogeny = new Phylogeny(config);

    // Spatial structure: the fertility field (biomes) is built from the RNG so a
    // seed reproduces the same landscape. Food spawns preferentially in it.
    this.environment = new FertilityField(config, this.rng);
    this.seasonFactor = seasonalFactor(0, config);
    this.seasonPhase = seasonPhase(0, config);

    this.food = new FoodField(config, this.rng, this.environment);
    /** @type {Creature[]} */
    this.creatures = [];
    for (let i = 0; i < config.populationStart; i++) {
      const c = this._randomCreature();
      this.phylogeny.assign(c, 0, null); // founders have no parent species
      this.creatures.push(c);
    }

    // Grids sized so each cell is about one vision radius across — that keeps
    // the 3x3 query window a good match for what a creature can actually see.
    const cell = Math.max(40, config.visionRadius * 0.75);
    this.creatureGrid = new SpatialGrid(config.width, config.height, cell);
    this.foodGrid = new SpatialGrid(config.width, config.height, cell);

    this.stats = new Stats();
    this.stats.sample(this);
    this.phylogeny.sample(this, 0);

    // The chronicle narrates the world's history. Pure observer, like the
    // phylogeny — reads state, never changes it, uses its own RNG.
    this.chronicle = new Chronicle(config);
  }

  _randomCreature() {
    const cfg = this.config;
    // A fresh genome of whichever kind this world uses. When evolvableTopology is
    // off (the default), this is exactly Genome.random(this.rng) as before, so
    // the RNG stream — and thus every existing world — is unchanged.
    const genome = cfg.evolvableTopology
      ? NeatGenome.random(this.rng)
      : Genome.random(this.rng);
    return new Creature(
      genome,
      cfg,
      this.rng.range(0, cfg.width),
      this.rng.range(0, cfg.height),
      this.rng,
      0
    );
  }

  /** Advance the world by exactly one tick. */
  step() {
    const cfg = this.config;

    // 1. Spatial indexing.
    this.creatureGrid.clear();
    this.foodGrid.clear();
    for (const c of this.creatures) this.creatureGrid.insert(c);
    for (const f of this.food.items) this.foodGrid.insert(f);

    const born = [];

    // 2. Sense, think, act.
    for (const c of this.creatures) {
      // Nearest food within vision.
      let nf = null;
      let nfD2 = cfg.visionRadius * cfg.visionRadius;
      this.foodGrid.forEachNear(c.x, c.y, (f) => {
        if (f.eaten) return;
        const d2 = torusDist2(c.x, c.y, f.x, f.y, cfg.width, cfg.height);
        if (d2 < nfD2) {
          nfD2 = d2;
          nf = f;
        }
      });

      // Nearest prey (a creature c could eat) and nearest threat (a creature
      // that could eat c), found in a single scan of nearby cells.
      let prey = null;
      let preyD2 = cfg.visionRadius * cfg.visionRadius;
      let threat = null;
      let threatD2 = cfg.visionRadius * cfg.visionRadius;
      let mate = null; // nearest potential partner (sexual reproduction)
      let mateD2 = cfg.mateRadius * cfg.mateRadius;
      this.creatureGrid.forEachNear(c.x, c.y, (o) => {
        if (o === c || o.dead) return;
        const d2 = torusDist2(c.x, c.y, o.x, o.y, cfg.width, cfg.height);
        if (d2 < preyD2 && c.canEat(o)) {
          preyD2 = d2;
          prey = o;
        }
        if (d2 < threatD2 && o.canEat(c)) {
          threatD2 = d2;
          threat = o;
        }
        if (cfg.sexualReproduction && d2 < mateD2) {
          mateD2 = d2;
          mate = o;
        }
      });

      c.sense(
        nf,
        nf ? Math.sqrt(nfD2) : Infinity,
        prey,
        prey ? Math.sqrt(preyD2) : Infinity,
        threat,
        threat ? Math.sqrt(threatD2) : Infinity
      );
      c.act(c.think());

      // 3a. Grazing: consume the nearest pellet if we're on top of it. Nutrition
      // from plants shrinks as a creature becomes more carnivorous, so pure
      // predators get almost nothing from grazing and must hunt.
      if (nf && !nf.eaten) {
        const eatR = cfg.eatRadius + c.radius * 0.4;
        if (nfD2 <= eatR * eatR) {
          nf.eaten = true;
          const plantGain = cfg.foodEnergy * (1 - cfg.plantPenaltyFromDiet * c.carnivory);
          c.energy = Math.min(cfg.energyMax, c.energy + plantGain);
        }
      }

      // 3b. Predation: bite the nearest prey if bodies are touching. The bite
      // drains the victim (which may kill it) and feeds the predator in
      // proportion to how carnivorous it is.
      if (cfg.predation && prey && !prey.dead && c.age - c.lastBiteAge >= cfg.biteCooldown) {
        const reach = c.radius + prey.radius + 2;
        if (preyD2 <= reach * reach) {
          const amount = Math.min(prey.energy, cfg.biteEnergy);
          prey.energy -= amount;
          c.energy = Math.min(
            cfg.energyMax,
            c.energy + amount * cfg.meatEfficiency * c.carnivory
          );
          c.lastBiteAge = c.age; // for the rendering "flash"
          if (prey.energy <= 0) {
            prey.dead = true;
            this.stats.kills++;
          }
        }
      }

      // 4. Reproduction (sexual if enabled and a partner is near, else asexual).
      if (c.canReproduce() && this.creatures.length + born.length < cfg.populationMax) {
        const mateGenome = cfg.sexualReproduction && mate ? mate.genome : null;
        const child = c.reproduce(this.rng, mateGenome);
        // Classify the newborn: it joins its parent's species unless it has
        // drifted far enough to found a new one branching from it.
        this.phylogeny.assign(child, this.tick, c.speciesId);
        born.push(child);
        this.stats.births++;
      }
    }

    // 5. Remove the dead; append newborns.
    if (this.creatures.some((c) => c.dead)) {
      const survivors = [];
      for (const c of this.creatures) {
        if (c.dead) this.stats.deaths++;
        else survivors.push(c);
      }
      this.creatures = survivors;
    }
    for (const b of born) this.creatures.push(b);

    // Environment upkeep: drift the biomes, then spawn food (seasonally scaled,
    // placed by the now-updated fertility field).
    this.environment.update(cfg.biomeDrift);
    this.seasonFactor = seasonalFactor(this.tick, cfg);
    this.seasonPhase = seasonPhase(this.tick, cfg);
    this.food.compact();
    this.food.step(this.seasonFactor);

    // 6. Safety valves: don't let the toy die permanently or linger near-dead.
    // A full extinction gets a burst of founders; a near-crash gets a gentle
    // trickle so it recovers quickly rather than sitting at one or two creatures.
    if (cfg.autoReseed) {
      let reseed = 0;
      if (this.creatures.length === 0) reseed = cfg.reseedCount;
      else if (this.creatures.length < cfg.reseedFloor) reseed = 2;
      for (let i = 0; i < reseed; i++) {
        const c = this._randomCreature();
        this.phylogeny.assign(c, this.tick, null);
        this.creatures.push(c);
      }
    }

    this.tick++;
    this.stats.sample(this);
    this.phylogeny.sample(this, this.tick);
    this.chronicle.observe(this, this.tick);
  }

  /** Add n fresh random creatures (used by the "seed life" button). */
  addRandomCreatures(n) {
    for (let i = 0; i < n; i++) {
      if (this.creatures.length >= this.config.populationMax) break;
      const c = this._randomCreature();
      this.phylogeny.assign(c, this.tick, null);
      this.creatures.push(c);
    }
  }

  /** Scatter n food pellets (used by the "feed" button). */
  addFood(n) {
    for (let i = 0; i < n; i++) this.food.spawnOne();
  }

  /** Serialize the whole world for save/load. */
  toJSON() {
    return {
      tick: this.tick,
      seed: this.config.seed,
      creatures: this.creatures.map((c) => c.toJSON()),
      food: this.food.items.map((f) => ({ x: f.x, y: f.y })),
    };
  }

  loadJSON(obj) {
    this.tick = obj.tick || 0;
    this.creatures = obj.creatures.map((o) => Creature.fromJSON(o, this.config, this.rng));
    this.food.items = obj.food.map((f) => new Food(f.x, f.y));
    // Species membership isn't serialised, so rebuild a fresh phylogeny by
    // re-clustering the restored population (each treated as a founder). The
    // deep history before the save is gone, but grouping resumes correctly.
    this.phylogeny = new Phylogeny(this.config);
    for (const c of this.creatures) this.phylogeny.assign(c, this.tick, null);
    this.phylogeny.sample(this, this.tick);
    this.chronicle = new Chronicle(this.config); // fresh history for the loaded world
  }
}
