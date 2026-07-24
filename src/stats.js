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
    this.kills = 0; // deaths specifically caused by predation
    this.scavenged = 0; // total scavenging bites taken from corpses
    this.maxGeneration = 0;
    this.maxPopEver = 0;
    this.carnivoreFrac = 0; // fraction of the population that are carnivores
    this.avgLearning = 0; // mean within-lifetime weight drift (plasticity on)
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
    let carnivores = 0;
    const threshold = world.config.carnivoreThreshold;
    for (let i = 0; i < pop; i++) {
      const cr = world.creatures[i];
      const g = cr.generation;
      if (g > maxGen) maxGen = g;
      sumGen += g;
      if (cr.carnivory >= threshold) carnivores++;
    }
    if (maxGen > this.maxGeneration) this.maxGeneration = maxGen;
    this.avgGeneration = pop > 0 ? sumGen / pop : 0;
    this.currentMaxGeneration = maxGen;
    this.carnivoreFrac = pop > 0 ? carnivores / pop : 0;
    this.carnivoreCount = carnivores;

    // Learning: how far, on average, plastic brains have drifted from the
    // weights they were born with (0 when plasticity is off). A live readout of
    // how much within-lifetime adaptation is happening across the population.
    if (world.config.plasticity && pop > 0) {
      let drift = 0;
      let n = 0;
      for (let i = 0; i < pop; i++) {
        const b = world.creatures[i].brain;
        if (!b.plastic) continue;
        const w = b.w;
        const wi = b.wInit;
        for (let k = 0; k < w.length; k++) drift += Math.abs(w[k] - wi[k]);
        n += w.length;
      }
      this.avgLearning = n > 0 ? drift / n : 0;
    } else {
      this.avgLearning = 0;
    }

    // Brain complexity: average evolved structure, when topology can evolve.
    if (world.config.evolvableTopology && pop > 0) {
      let hidden = 0;
      let conns = 0;
      let maxHidden = 0;
      for (let i = 0; i < pop; i++) {
        const cx = world.creatures[i].genome.complexity;
        hidden += cx.nodes;
        conns += cx.conns;
        if (cx.nodes > maxHidden) maxHidden = cx.nodes;
      }
      this.avgHidden = hidden / pop;
      this.avgConns = conns / pop;
      this.maxHidden = maxHidden;
    } else {
      this.avgHidden = 0;
      this.avgConns = 0;
      this.maxHidden = 0;
    }

    // Record a history point every 4 ticks.
    if (this.tick % 4 === 0) {
      this.popHistory.push({
        tick: this.tick,
        pop,
        food: world.food.items.length,
        gen: maxGen,
      });
      if (this.popHistory.length > this.historyLength) this.popHistory.shift();
    }
  }

  /**
   * Render the retained population/food/generation history as CSV text, so a
   * visitor can pull the chart's raw numbers into a spreadsheet. Pure and
   * read-only: it never touches the simulation, only formats what sample()
   * already recorded.
   */
  toCSV() {
    const lines = ["tick,population,food,max_generation"];
    for (const h of this.popHistory) {
      lines.push(`${h.tick},${h.pop},${h.food},${h.gen}`);
    }
    return lines.join("\n") + "\n";
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
