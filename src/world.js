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
import { Stats } from "./stats.js";
import { torusDist2 } from "./vec.js";

export class World {
  constructor(config) {
    this.config = config;
    this.rng = new RNG(config.seed);
    this.tick = 0;

    this.food = new FoodField(config, this.rng);
    /** @type {Creature[]} */
    this.creatures = [];
    for (let i = 0; i < config.populationStart; i++) {
      this.creatures.push(this._randomCreature());
    }

    // Grids sized so each cell is about one vision radius across — that keeps
    // the 3x3 query window a good match for what a creature can actually see.
    const cell = Math.max(40, config.visionRadius * 0.75);
    this.creatureGrid = new SpatialGrid(config.width, config.height, cell);
    this.foodGrid = new SpatialGrid(config.width, config.height, cell);

    this.stats = new Stats();
    this.stats.sample(this);
  }

  _randomCreature() {
    const cfg = this.config;
    return new Creature(
      Genome.random(this.rng),
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

      // Nearest other creature within vision.
      let nm = null;
      let nmD2 = cfg.visionRadius * cfg.visionRadius;
      this.creatureGrid.forEachNear(c.x, c.y, (o) => {
        if (o === c) return;
        const d2 = torusDist2(c.x, c.y, o.x, o.y, cfg.width, cfg.height);
        if (d2 < nmD2) {
          nmD2 = d2;
          nm = o;
        }
      });

      c.sense(nf, nf ? Math.sqrt(nfD2) : Infinity, nm, nm ? Math.sqrt(nmD2) : Infinity);
      c.act(c.think());

      // 3. Eating: consume the nearest pellet if we're on top of it. We reuse
      // the nearest-food result from sensing — good enough, and cheap.
      if (nf && !nf.eaten) {
        const eatR = cfg.eatRadius + c.radius * 0.4;
        if (nfD2 <= eatR * eatR) {
          nf.eaten = true;
          c.energy = Math.min(cfg.energyMax, c.energy + cfg.foodEnergy);
        }
      }

      // 4. Reproduction.
      if (c.canReproduce() && this.creatures.length + born.length < cfg.populationMax) {
        born.push(c.reproduce(this.rng));
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

    // Food upkeep.
    this.food.compact();
    this.food.step();

    // 6. Safety valve: don't let the toy die permanently.
    if (this.creatures.length === 0 && cfg.autoReseed) {
      for (let i = 0; i < cfg.reseedCount; i++) {
        this.creatures.push(this._randomCreature());
      }
    }

    this.tick++;
    this.stats.sample(this);
  }

  /** Add n fresh random creatures (used by the "seed life" button). */
  addRandomCreatures(n) {
    for (let i = 0; i < n; i++) {
      if (this.creatures.length >= this.config.populationMax) break;
      this.creatures.push(this._randomCreature());
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
  }
}
