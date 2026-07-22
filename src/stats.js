// stats.js — rolling measurements of the living world.
//
// None of this feeds back into the simulation; it exists purely so a human
// watching can see what evolution is doing — population booms and crashes, how
// deep the oldest lineages run, how much genetic diversity remains. A history
// ring buffer drives the little live chart in the UI.

export class Stats {
  constructor(historyLength = 480) {
    this.historyLength = historyLength;
    this.popHistory = []; // {pop, food, gen}
    this.tick = 0;
    this.births = 0;
    this.deaths = 0;
    this.maxGeneration = 0;
    this.maxPopEver = 0;
  }

  /**
   * Sample the world. Called once per simulated tick (cheap fields) but only
   * pushes to history periodically to keep the buffer spanning a useful window.
   * @param {import('./world.js').World} world
   */
  sample(world) {
    this.tick = world.tick;
    const pop = world.creatures.length;
    if (pop > this.maxPopEver) this.maxPopEver = pop;

    let maxGen = 0;
    let sumGen = 0;
    for (let i = 0; i < pop; i++) {
      const g = world.creatures[i].generation;
      if (g > maxGen) maxGen = g;
      sumGen += g;
    }
    if (maxGen > this.maxGeneration) this.maxGeneration = maxGen;
    this.avgGeneration = pop > 0 ? sumGen / pop : 0;
    this.currentMaxGeneration = maxGen;

    // Record a history point every 4 ticks.
    if (this.tick % 4 === 0) {
      this.popHistory.push({
        pop,
        food: world.food.items.length,
        gen: maxGen,
      });
      if (this.popHistory.length > this.historyLength) this.popHistory.shift();
    }
  }

  /** Mean genetic distance across a small random sample — a diversity proxy. */
  diversity(world, rng, samples = 24) {
    const cr = world.creatures;
    if (cr.length < 2) return 0;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < samples; i++) {
      const a = cr[rng.int(0, cr.length - 1)];
      const b = cr[rng.int(0, cr.length - 1)];
      if (a !== b) {
        sum += a.genome.distance(b.genome);
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  }
}
