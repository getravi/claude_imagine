// food.js — the world's energy source.
//
// Food is deliberately dumb: pellets appear and sit there. All the intelligence
// in Vivarium is in the creatures that must find and reach them. Food is the
// selective pressure — every strategy the creatures evolve (wandering,
// beelining, loitering where pellets are dense) is ultimately about getting to
// these dots before starving. WHERE and HOW FAST pellets appear is shaped by the
// environment (biomes and seasons); see environment.js. With regrowth switched on
// it is also shaped by the food itself: pellets seed from pellets, so the crop is
// a population too, and one that grazers can drive down.

export class Food {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.eaten = false;
  }
}

// A corpse: the remains of a dead creature, left behind when scavenging is on.
// It holds a pool of "meat" energy that carnivores can feed on over several
// bites, and it rots away over time if nothing eats it. Sensed and consumed only
// by carnivores (via the same prey channel they hunt with), so scavenging reuses
// hunting behaviour rather than needing a new sense.
export class Corpse {
  constructor(x, y, energy) {
    this.x = x;
    this.y = y;
    this.energy = energy;
    this.isCorpse = true; // lets the eating code tell a corpse from live prey
  }
}

export class FoodField {
  /**
   * @param {object} config
   * @param {import('./rng.js').RNG} rng
   * @param {import('./environment.js').FertilityField} [fertility] biome field
   */
  constructor(config, rng, fertility = null) {
    this.config = config;
    this.rng = rng;
    this.fertility = fertility;
    /** @type {Food[]} */
    this.items = [];
    this._spawnAccumulator = 0;
    // The world opens with an established standing crop, scattered across the
    // biomes — regrowth governs how the pond *recovers*, not how it was sown, and
    // seeding the first 280 pellets from each other would grow the whole crop out
    // of a single point.
    for (let i = 0; i < config.foodStart; i++) this.spawnAnywhere();
  }

  spawnOne() {
    if (this.items.length >= this.config.foodMax) return;
    // Regrowth: most new pellets are the offspring of one already standing. The
    // whole branch is skipped when the feature is off (and when nothing is left
    // to seed from), so it draws no randomness and default worlds are unchanged.
    if (
      this.config.foodRegrowth &&
      this.items.length > 0 &&
      this.rng.chance(this.config.regrowthSpread)
    ) {
      const seed = this._seedNear(this.rng.pick(this.items));
      if (seed) this.items.push(new Food(seed.x, seed.y));
      return; // a seed that fell on barren ground simply didn't take
    }
    this.spawnAnywhere();
  }

  /** A pellet appearing from nowhere: uniform, or biased toward the biomes. */
  spawnAnywhere() {
    if (this.items.length >= this.config.foodMax) return;
    let x, y;
    if (this.config.foodPatches && this.fertility) {
      ({ x, y } = this.fertility.sample(this.rng)); // concentrate in biomes
    } else {
      x = this.rng.range(0, this.config.width);
      y = this.rng.range(0, this.config.height);
    }
    this.items.push(new Food(x, y));
  }

  /**
   * A seed dropped near an existing pellet: a uniformly random point within
   * `regrowthRadius` of the parent, wrapped onto the torus. Returns null when the
   * ground it lands on refuses it — the chance of taking is the local fertility,
   * which is what stops a bloom from diffusing out of its biome and slowly
   * carpeting the whole pond.
   * @returns {{x:number, y:number}|null}
   */
  _seedNear(parent) {
    const cfg = this.config;
    const angle = this.rng.range(0, Math.PI * 2);
    // sqrt keeps the offsets spread evenly over the disc instead of bunching at
    // the parent.
    const dist = cfg.regrowthRadius * Math.sqrt(this.rng.float());
    const x = (((parent.x + Math.cos(angle) * dist) % cfg.width) + cfg.width) % cfg.width;
    const y = (((parent.y + Math.sin(angle) * dist) % cfg.height) + cfg.height) % cfg.height;
    if (cfg.foodPatches && this.fertility && this.rng.float() > this.fertility.at(x, y)) return null;
    return { x, y };
  }

  /**
   * Density-dependent growth: with regrowth on, plants can only spawn from other
   * plants, so a bare pond regrows slowly and a full one at the usual rate. The
   * floor is what lets a stripped world come back at all rather than dying with
   * its last pellet. Exactly 1 when regrowth is off, so callers can multiply by it
   * unconditionally without changing a single existing world.
   */
  growthFactor() {
    if (!this.config.foodRegrowth) return 1;
    const stock = Math.min(1, this.items.length / this.config.foodMax);
    return this.config.regrowthFloor + (1 - this.config.regrowthFloor) * stock;
  }

  /**
   * Advance food spawning by one tick. Fractional rates accrue over time.
   * @param {number} rateMultiplier seasonal multiplier on the base spawn rate
   */
  step(rateMultiplier = 1) {
    this._spawnAccumulator += this.config.foodSpawnRate * rateMultiplier * this.growthFactor();
    while (this._spawnAccumulator >= 1) {
      this.spawnOne();
      this._spawnAccumulator -= 1;
    }
  }

  /** Drop eaten pellets. Called once per tick after creatures have fed. */
  compact() {
    if (this.items.length === 0) return;
    let w = 0;
    for (let i = 0; i < this.items.length; i++) {
      const f = this.items[i];
      if (!f.eaten) this.items[w++] = f;
    }
    this.items.length = w;
  }
}
