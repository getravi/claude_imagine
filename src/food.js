// food.js — the world's energy source.
//
// Food is deliberately dumb: pellets appear and sit there. All the intelligence
// in Vivarium is in the creatures that must find and reach them. Food is the
// selective pressure — every strategy the creatures evolve (wandering,
// beelining, loitering where pellets are dense) is ultimately about getting to
// these dots before starving. WHERE and HOW FAST pellets appear is shaped by the
// environment (biomes and seasons); see environment.js.

export class Food {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.eaten = false;
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
    for (let i = 0; i < config.foodStart; i++) this.spawnOne();
  }

  spawnOne() {
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
   * Advance food spawning by one tick. Fractional rates accrue over time.
   * @param {number} rateMultiplier seasonal multiplier on the base spawn rate
   */
  step(rateMultiplier = 1) {
    this._spawnAccumulator += this.config.foodSpawnRate * rateMultiplier;
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
