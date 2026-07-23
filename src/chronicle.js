// chronicle.js — a living natural history of the pond.
//
// Everything dramatic in Vivarium (a population crash, the first predator, a
// lineage sweeping to dominance and later going extinct, a brain growing its
// first hidden neuron) already happens — but silently, buried in the stats. The
// Chronicle watches the world each tick and turns those moments into a readable
// timeline, the way a naturalist's field journal turns a forest into a story.
//
// Like the phylogeny, it is a PURE OBSERVER: it reads world state and never
// changes it, and it draws its randomness (for the diversity probe) from its own
// seeded generator, so it can't affect the world's determinism. Two identical
// worlds therefore write identical chronicles.

import { RNG } from "./rng.js";

export class Chronicle {
  constructor(config) {
    this.config = config;
    /** @type {Array<{tick:number, year:number, icon:string, cat:string, msg:string}>} */
    this.events = [];
    this.max = 140;
    this.rng = new RNG((config.seed ^ 0x9e3779b9) >>> 0); // own stream

    // Debounce / one-shot trackers.
    this._popCrossed = new Set();
    this._genCrossed = new Set();
    this._carnCrossed = new Set();
    this._hiddenMax = 0;
    this._firstKill = false;
    this._learned = false;
    this._predsAlive = false;
    this._inCrash = false;
    this._recentMax = 0;
    this._maxAge = 0;
    this._lowDiversity = false;
    this._dominant = -1;
    this._reportedExtinct = new Set();
  }

  _push(tick, icon, cat, msg) {
    const year = this.config.seasons ? Math.floor(tick / this.config.seasonLength) + 1 : 0;
    this.events.push({ tick, year, icon, cat, msg });
    if (this.events.length > this.max) this.events.shift();
  }

  /**
   * Inspect the world and record anything noteworthy. Cheap checks run every
   * tick; the few costly scans (ages, diversity, species) are throttled.
   * @param {import('./world.js').World} world
   * @param {number} tick
   */
  observe(world, tick) {
    const pop = world.creatures.length;
    const s = world.stats;

    // --- Population milestones (rising) ---
    for (const m of [100, 200, 300, 400, 500]) {
      if (pop >= m && !this._popCrossed.has(m)) {
        this._popCrossed.add(m);
        this._push(tick, "🌊", "pop", `The pond swells past ${m} creatures.`);
      }
    }

    // --- Crash detection ---
    if (pop > this._recentMax) this._recentMax = pop;
    else this._recentMax = Math.max(pop, this._recentMax * 0.999); // slow decay
    if (!this._inCrash && this._recentMax > 140 && pop < 0.45 * this._recentMax) {
      this._inCrash = true;
      this._push(
        tick,
        "💀",
        "crash",
        `A population crash — down to ${pop} from about ${Math.round(this._recentMax)}.`
      );
    } else if (this._inCrash && pop > 0.8 * this._recentMax) {
      this._inCrash = false;
      this._push(tick, "🌱", "recover", `The pond recovers to ${pop}.`);
    }

    // --- Predation ---
    if (!this._firstKill && s.kills > 0) {
      this._firstKill = true;
      this._push(tick, "🔺", "predation", `First blood — a lineage has begun to hunt.`);
    }
    // Carnivore-fraction milestones, but only once real hunting has begun — the
    // founding population has random diet genes, which would otherwise trip this
    // on tick 1 before any creature has actually hunted.
    if (this._firstKill) {
      const carnFrac = pop > 0 ? (s.carnivoreCount || 0) / pop : 0;
      for (const [thr, label] of [
        [0.25, "a quarter"],
        [0.5, "half"],
      ]) {
        const key = "carn" + thr;
        if (carnFrac >= thr && !this._carnCrossed.has(key)) {
          this._carnCrossed.add(key);
          this._push(tick, "🩸", "predation", `Predators are now ${label} of the pond.`);
        }
      }
    }
    if ((s.carnivoreCount || 0) > 0) this._predsAlive = true;
    else if (this._predsAlive && (s.carnivoreCount || 0) === 0) {
      this._predsAlive = false;
      this._carnCrossed.clear();
      this._push(tick, "🕊️", "predation", `The predators have died out.`);
    }

    // --- Generation depth ---
    for (const g of [10, 25, 50, 100, 200]) {
      if (s.currentMaxGeneration >= g && !this._genCrossed.has(g)) {
        this._genCrossed.add(g);
        this._push(tick, "🧬", "lineage", `A lineage reaches generation ${g}.`);
      }
    }

    // --- Learning discovered (plasticity) ---
    if (this.config.plasticity && !this._learned && s.avgLearning > 0.02) {
      this._learned = true;
      this._push(tick, "🧠", "learning", `Creatures have begun to learn within their lifetimes.`);
    }

    // --- Brain complexity (NEAT) ---
    if (this.config.evolvableTopology && (s.maxHidden || 0) > this._hiddenMax) {
      this._hiddenMax = s.maxHidden;
      const word = this._hiddenMax === 1 ? "its first hidden neuron" : `${this._hiddenMax} hidden neurons`;
      this._push(tick, "🕸️", "brain", `A brain has grown ${word}.`);
    }

    // --- Throttled scans ---
    if (tick % 32 === 0) this._checkOldest(world, tick);
    if (tick % 64 === 0) this._checkDiversity(world, tick);
    if (tick % 48 === 0) this._checkSpecies(world, tick, pop);
  }

  _checkOldest(world, tick) {
    let oldest = 0;
    for (const c of world.creatures) if (c.age > oldest) oldest = c.age;
    if (oldest > this._maxAge + 400 && oldest > 1800) {
      this._maxAge = oldest;
      this._push(tick, "⏳", "longevity", `A creature reaches age ${oldest} — the oldest yet.`);
    } else if (oldest > this._maxAge) {
      this._maxAge = oldest; // track quietly
    }
  }

  _checkDiversity(world, tick) {
    const div = world.stats.diversity(world, this.rng, 20);
    if (!this._lowDiversity && div > 0 && div < 0.12 && world.creatures.length > 60) {
      this._lowDiversity = true;
      this._push(tick, "🎯", "diversity", `A selective sweep — genetic diversity collapses.`);
    } else if (this._lowDiversity && div > 0.25) {
      this._lowDiversity = false;
      this._push(tick, "🌈", "diversity", `Diversity blooms again as lineages diverge.`);
    }
  }

  _checkSpecies(world, tick, pop) {
    const ph = world.phylogeny;
    // New dominant species.
    if (pop > 60) {
      let top = null;
      for (const sp of ph.species) if (sp.count > 0 && (!top || sp.count > top.count)) top = sp;
      if (top && top.count >= 0.45 * pop && top.id !== this._dominant) {
        this._dominant = top.id;
        const pct = Math.round((top.count / pop) * 100);
        this._push(tick, "👑", "lineage", `Species ${top.id} now dominates the pond (${pct}%).`);
      }
    }
    // Notable extinctions: a species that once grew large has just died out.
    for (const sp of ph.species) {
      if (sp.extinctTick >= 0 && sp.peak >= 45 && !this._reportedExtinct.has(sp.id)) {
        this._reportedExtinct.add(sp.id);
        const gens = Math.max(1, Math.round((sp.extinctTick - sp.birthTick) / 300));
        this._push(
          tick,
          "⚰️",
          "lineage",
          `Species ${sp.id}, once ${sp.peak} strong, is gone after ~${gens} generations.`
        );
      }
    }
  }
}
