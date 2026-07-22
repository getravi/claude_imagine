// food.js — the world's energy source.
//
// Food is deliberately dumb: pellets appear at random locations and sit there.
// All the intelligence in Vivarium is in the creatures that must find and reach
// them. Food is the selective pressure — every strategy the creatures evolve
// (wandering, beelining, loitering where pellets are dense) is ultimately about
// getting to these dots before starving.

export class Food {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.eaten = false;
  }
}

export class FoodField {
  constructor(config, rng) {
    this.config = config;
    this.rng = rng;
    /** @type {Food[]} */
    this.items = [];
    this._spawnAccumulator = 0;
    for (let i = 0; i < config.foodStart; i++) this.spawnOne();
  }

  spawnOne() {
    if (this.items.length >= this.config.foodMax) return;
    const { width, height } = this.config;
    this.items.push(new Food(this.rng.range(0, width), this.rng.range(0, height)));
  }

  /** Advance food spawning by one tick. Fractional rates accrue over time. */
  step() {
    this._spawnAccumulator += this.config.foodSpawnRate;
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
