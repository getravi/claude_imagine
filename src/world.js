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
import { FoodField, Food, Corpse } from "./food.js";
import { Creature } from "./creature.js";
import { Genome } from "./genome.js";
import { NeatGenome } from "./neat.js";
import { Stats } from "./stats.js";
import { Phylogeny } from "./phylogeny.js";
import { Chronicle } from "./chronicle.js";
import { FertilityField, seasonalFactor, seasonPhase, dayNightVisionFactor } from "./environment.js";
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
    this.visionFactor = dayNightVisionFactor(0, config);

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
    // Corpses (scavenging). Empty and unused unless the feature is on.
    /** @type {import('./food.js').Corpse[]} */
    this.corpses = [];
    this.corpseGrid = new SpatialGrid(config.width, config.height, cell);

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
      : Genome.random(this.rng, cfg.signalling);
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
    if (cfg.scavenging) {
      this.corpseGrid.clear();
      for (const k of this.corpses) this.corpseGrid.insert(k);
    }

    // 1b. Contagion, if the pathogen exists in this world at all. Runs on the
    // grid just built, before anything moves, so exposure is judged on the same
    // positions a watcher sees. Skipped entirely when the feature is off.
    if (cfg.disease) this._stepDisease();

    const born = [];

    // Effective vision radius for this tick. With the day/night cycle off,
    // visionFactor is a constant 1 and this is exactly cfg.visionRadius, so
    // sensing is unchanged unless the feature is switched on.
    const visionR2 = cfg.visionRadius * this.visionFactor * (cfg.visionRadius * this.visionFactor);

    // Earshot, when there is anything to hear. Unlike sight it does not shrink
    // at night — a voice carries in the dark, which is the whole point of having
    // one. Each creature broadcasts the signal it emitted *last* tick, frozen
    // here before anything moves, so what a creature hears never depends on
    // where it sits in the update order below.
    const earR2 = cfg.signalRadius * cfg.signalRadius;
    if (cfg.signalling) {
      for (const c of this.creatures) c.prevSignal = c.signal;
    }

    // 2. Sense, think, act.
    for (const c of this.creatures) {
      // Nearest food within vision.
      let nf = null;
      let nfD2 = visionR2;
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
      let preyD2 = visionR2;
      let threat = null;
      let threatD2 = visionR2;
      let mate = null; // nearest potential partner (sexual reproduction)
      let mateD2 = cfg.mateRadius * cfg.mateRadius;
      let loudest = 0; // strongest voice in earshot (signalling only)
      this.creatureGrid.forEachNear(c.x, c.y, (o) => {
        if (o === c || o.dead) return;
        const d2 = torusDist2(c.x, c.y, o.x, o.y, cfg.width, cfg.height);
        // Hearing: a call fades linearly with distance, and the loudest one
        // wins — a single channel, so a creature has to be worth listening to
        // over its neighbours. Sign is preserved, so "loudest" means the largest
        // magnitude, not the most positive.
        if (cfg.signalling && d2 < earR2 && o.prevSignal !== 0) {
          const heard = o.prevSignal * (1 - Math.sqrt(d2) / cfg.signalRadius);
          if (Math.abs(heard) > Math.abs(loudest)) loudest = heard;
        }
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

      // Scavenging: a carnivore also perceives the nearest corpse as an edible
      // target. Whichever is nearer — a living prey or a corpse — becomes what it
      // homes in on, so scavenging reuses the very same hunting behaviour. With
      // scavenging off, no corpse is ever found, so preyTarget === prey exactly.
      let preyTarget = prey;
      let preyTargetD2 = preyD2;
      if (cfg.scavenging && c.carnivory >= cfg.carnivoreThreshold) {
        this.corpseGrid.forEachNear(c.x, c.y, (k) => {
          if (k.energy <= 0) return;
          const d2 = torusDist2(c.x, c.y, k.x, k.y, cfg.width, cfg.height);
          if (d2 < preyTargetD2) {
            preyTargetD2 = d2;
            preyTarget = k;
          }
        });
      }

      c.heard = loudest;
      c.sense(
        nf,
        nf ? Math.sqrt(nfD2) : Infinity,
        preyTarget,
        preyTarget ? Math.sqrt(preyTargetD2) : Infinity,
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

      // 3b. Feeding on flesh — the target is whichever the creature homed in on.
      // A corpse is scavenged; a living creature is bitten (predation). Both
      // respect the bite cooldown. With scavenging off, preyTarget is always a
      // living creature, so this is exactly the predation path as before.
      if (preyTarget && c.age - c.lastBiteAge >= cfg.biteCooldown) {
        if (preyTarget.isCorpse) {
          const reach = c.radius + cfg.foodRadius + 6;
          if (preyTargetD2 <= reach * reach && preyTarget.energy > 0) {
            const chunk = Math.min(preyTarget.energy, cfg.biteEnergy);
            preyTarget.energy -= chunk;
            c.energy = Math.min(cfg.energyMax, c.energy + chunk * cfg.meatEfficiency * c.carnivory);
            c.lastBiteAge = c.age;
            this.stats.scavenged++;
          }
        } else if (cfg.predation && !preyTarget.dead) {
          const reach = c.radius + preyTarget.radius + 2;
          if (preyTargetD2 <= reach * reach) {
            const amount = Math.min(preyTarget.energy, cfg.biteEnergy);
            preyTarget.energy -= amount;
            c.energy = Math.min(
              cfg.energyMax,
              c.energy + amount * cfg.meatEfficiency * c.carnivory
            );
            c.lastBiteAge = c.age; // for the rendering "flash"
            if (preyTarget.energy <= 0) {
              preyTarget.die("predation");
              this.stats.kills++;
            }
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

    // 5. Remove the dead; append newborns. When scavenging is on, each corpse
    // left behind holds meat proportional to the creature's body size —
    // recycling its biomass back into the food web.
    if (this.creatures.some((c) => c.dead)) {
      const survivors = [];
      for (const c of this.creatures) {
        if (c.dead) {
          this.stats.deaths++;
          this.stats.recordDeath(c);
          if (cfg.scavenging) {
            const meat = cfg.corpseEnergyBase + c.radius * cfg.corpseEnergyPerRadius;
            this.corpses.push(new Corpse(c.x, c.y, meat));
          }
        } else survivors.push(c);
      }
      this.creatures = survivors;
    }
    for (const b of born) this.creatures.push(b);

    // Corpses rot away over time (and shrink as they're fed on); drop the empty
    // ones. Skipped entirely when scavenging is off, so there's nothing to do.
    if (cfg.scavenging && this.corpses.length > 0) {
      let w = 0;
      for (let i = 0; i < this.corpses.length; i++) {
        const k = this.corpses[i];
        k.energy -= cfg.corpseDecay;
        if (k.energy > 0) this.corpses[w++] = k;
      }
      this.corpses.length = w;
    }

    // Environment upkeep: drift the biomes, then spawn food (seasonally scaled,
    // placed by the now-updated fertility field).
    this.environment.update(cfg.biomeDrift);
    this.seasonFactor = seasonalFactor(this.tick, cfg);
    this.seasonPhase = seasonPhase(this.tick, cfg);
    this.visionFactor = dayNightVisionFactor(this.tick, cfg);
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

  /**
   * One tick of epidemiology: expose the susceptible, recover the long-sick,
   * and — if the pathogen has burned out — let a new case walk in.
   *
   * Only ever called when `config.disease` is on, so a world without the
   * feature draws not one random number here and is unchanged by its existence.
   * Order inside the tick matters for reproducibility, so it is fixed: every
   * infected host rolls against each susceptible neighbour it can reach (more
   * contacts really is more risk), the new cases are collected and applied only
   * *after* the whole pass, so an infection can't chain through three hosts
   * within a single tick, and the epidemic advances one hop at a time no matter
   * what order the creatures happen to sit in the array.
   */
  _stepDisease() {
    const cfg = this.config;
    const r2 = cfg.infectionRadius * cfg.infectionRadius;
    const caught = [];
    let sick = 0;

    for (const c of this.creatures) {
      if (!c.infected) continue;
      sick++;
      this.creatureGrid.forEachNear(c.x, c.y, (o) => {
        if (o === c || o.infected || o.immune || o.dead) return;
        const d2 = torusDist2(c.x, c.y, o.x, o.y, cfg.width, cfg.height);
        if (d2 <= r2 && this.rng.chance(cfg.infectionChance)) caught.push(o);
      });
    }

    // Recovery: an infection runs its course, and the survivor is immune for
    // life. Done before the new cases land so a creature that recovers this
    // tick can't be re-infected by an exposure from the same tick.
    for (const c of this.creatures) {
      if (c.infected && c.age - c.infectedAtAge >= cfg.diseaseDuration) {
        c.infected = false;
        c.immune = true;
        this.stats.recoveries++;
      }
    }

    for (const o of caught) {
      if (o.infected || o.immune) continue; // already exposed earlier in this pass
      o.infected = true;
      o.infectedAtAge = o.age;
      this.stats.infections++;
    }

    // Reintroduction: with no case left anywhere the pathogen is gone for good,
    // so one arrives on a fixed schedule — the first outbreak included. If the
    // creature it lands on happens to be immune, nothing takes hold and the
    // next window tries again.
    if (sick === 0 && caught.length === 0 && this.creatures.length > 0 && this.tick > 0) {
      if (this.tick % cfg.diseaseReintroduce === 0) {
        const host = this.creatures[this.rng.int(0, this.creatures.length - 1)];
        if (!host.immune) {
          host.infected = true;
          host.infectedAtAge = host.age;
          this.stats.infections++;
        }
      }
    }
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
    this.corpses = []; // corpses are transient; start the loaded world clean
    // Species membership isn't serialised, so rebuild a fresh phylogeny by
    // re-clustering the restored population (each treated as a founder). The
    // deep history before the save is gone, but grouping resumes correctly.
    this.phylogeny = new Phylogeny(this.config);
    for (const c of this.creatures) this.phylogeny.assign(c, this.tick, null);
    this.phylogeny.sample(this, this.tick);
    this.chronicle = new Chronicle(this.config); // fresh history for the loaded world
  }
}
