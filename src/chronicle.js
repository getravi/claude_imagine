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

/**
 * Consecutive observations the population must spend on smoother-than-average
 * ground before the chronicle will call it settled. `observe` runs every tick,
 * so this is a couple of hundred ticks of holding still.
 */
const TERRAIN_SETTLE_TICKS = 240;

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
    this._nightFell = false;
    this._dawnBroke = false;
    this._nightKill = false;
    this._wasDark = false;
    this._lastKills = 0;
    this._reportedExtinct = new Set();
    this._dieoff = false;
    this._outbreak = false;
    this._epidemic = false;
    this._recovered = false;
    this._herd = false;
    this._burnout = false;
    this._peakFood = 0;
    this._stripped = false;
    this._regreened = false;
    this._leadingCause = null;
    this._settled = false;
    this._settleStreak = 0;
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

    // --- Day and night (only when the cycle is actually running) ---
    if (this.config.dayNightCycle) this._checkNight(world, tick, s);

    // --- Contagion (only when a pathogen exists in this world) ---
    if (this.config.disease) this._checkDisease(tick, pop, s);

    // --- Regrowth (only when the crop is a population that can be ruined) ---
    if (this.config.foodRegrowth) this._checkRegrowth(world, tick);

    // --- Terrain (only when the ground has an opinion) ---
    if (this.config.terrain) this._checkTerrain(tick, pop, s);

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

    // --- Scavenging: a glut of corpses after a die-off ---
    if (this.config.scavenging) {
      const corpses = world.corpses.length;
      if (!this._dieoff && corpses >= 40) {
        this._dieoff = true;
        this._push(tick, "🦴", "death", `A die-off leaves ${corpses} corpses — the scavengers move in.`);
      } else if (this._dieoff && corpses < 15) {
        this._dieoff = false;
      }
    }

    // --- Throttled scans ---
    if (tick % 32 === 0) this._checkMortality(tick, s);
    if (tick % 32 === 0) this._checkOldest(world, tick);
    if (tick % 64 === 0) this._checkDiversity(world, tick);
    if (tick % 48 === 0) this._checkSpecies(world, tick, pop);
  }

  /**
   * The day/night cycle is the one rhythm you can't read off the canvas — the
   * pond looks the same at midnight, the creatures just stop finding things. So
   * the chronicle marks the three moments that carry that story: the first
   * nightfall, the first dawn after it, and the first kill made in the dark.
   * All one-shot: night returns every `dayLength` ticks, and a nightly bulletin
   * would bury everything else in the feed.
   */
  _checkNight(world, tick, s) {
    const cfg = this.config;
    const span = 1 - cfg.nightVisionFactor;
    if (span <= 1e-9) return; // a "night" that costs no sight isn't a night
    // How much of the daylight is left, 0 (deepest night) .. 1 (high noon).
    const daylight = (world.visionFactor - cfg.nightVisionFactor) / span;
    const dark = daylight < 0.25;

    if (dark && !this._nightFell) {
      this._nightFell = true;
      const pct = Math.round(cfg.nightVisionFactor * 100);
      this._push(
        tick,
        "🌙",
        "night",
        `Night falls for the first time — sight shrinks to ${pct}% until dawn.`
      );
    } else if (!dark && this._wasDark && !this._dawnBroke) {
      this._dawnBroke = true;
      this._push(tick, "🌅", "night", `Dawn breaks, and the pond can see again.`);
    }

    // A kill landed during this tick, and this tick is dark.
    if (dark && !this._nightKill && s.kills > this._lastKills) {
      this._nightKill = true;
      this._push(tick, "🌑", "night", `First blood after dark — a hunter that doesn't need the light.`);
    }

    this._wasDark = dark;
    this._lastKills = s.kills;
  }

  /**
   * The arc of an epidemic, in five moments: the first case, the wave cresting,
   * the first creature to survive it, the pond passing half immune, and the
   * pathogen running out of hosts. All one-shot — immunity is acquired but not
   * inherited, so newborn susceptibles let the waves return indefinitely, and a
   * bulletin per wave would bury the rest of the feed.
   */
  _checkDisease(tick, pop, s) {
    if (!this._outbreak && s.infections > 0) {
      this._outbreak = true;
      this._push(tick, "🦠", "disease", `A pathogen appears — the first creature falls sick.`);
    }
    const sick = s.infectedCount || 0;
    if (!this._epidemic && pop >= 40 && sick >= 0.2 * pop) {
      this._epidemic = true;
      const pct = Math.round((sick / pop) * 100);
      this._push(tick, "🤒", "disease", `An epidemic — ${sick} creatures are sick (${pct}% of the pond).`);
    }
    if (!this._recovered && s.recoveries > 0) {
      this._recovered = true;
      this._push(tick, "💪", "disease", `The first survivor shakes off the illness — immune for life.`);
    }
    if (!this._herd && pop >= 40 && (s.immuneCount || 0) >= 0.5 * pop) {
      this._herd = true;
      this._push(tick, "🛡️", "disease", `Half the pond has survived the disease — herd immunity.`);
    }
    // Burnout only counts once the disease actually took hold: a first case that
    // recovers without ever passing the illness on hasn't "run out of hosts",
    // it simply never spread.
    if (!this._burnout && (s.peakInfected || 0) >= 10 && sick === 0 && pop > 0) {
      this._burnout = true;
      this._push(tick, "🧫", "disease", `The pathogen runs out of hosts and burns out.`);
    }
  }

  /**
   * Overgrazing, in two moments: the pond stripped bare, and the green coming
   * back. Only meaningful with regrowth on — with it off the crop refills at a
   * constant rate no matter how hard it is grazed, so a low pellet count is
   * weather rather than damage. Both one-shot: a heavily grazed world oscillates,
   * and a bulletin per swing would bury the rest of the feed.
   */
  _checkRegrowth(world, tick) {
    const standing = world.food.items.length;
    if (standing > this._peakFood) this._peakFood = standing;
    // Guard: only call it stripped if there was a real crop to strip. The world
    // opens with foodStart pellets standing, so this is about grazing, not about
    // a pond that never grew anything.
    const hadCrop = this._peakFood >= 0.4 * this.config.foodMax;
    if (!this._stripped && hadCrop && standing < 0.15 * this._peakFood) {
      this._stripped = true;
      this._push(
        tick,
        "🍂",
        "regrowth",
        `The pond is grazed bare — ${standing} pellets left of about ${this._peakFood}.`
      );
    } else if (this._stripped && !this._regreened && standing > 0.5 * this._peakFood) {
      this._regreened = true;
      this._push(tick, "🌾", "regrowth", `Green returns — the crop regrows to ${standing}.`);
    }
  }

  /**
   * The pond finding its flats: reported once, when the population has spent a
   * sustained stretch on ground meaningfully smoother than the landscape
   * average.
   *
   * Three guards, in the spirit of "a chronicle line needs a did-this-really-
   * happen check". The population has to be big enough that the mean isn't
   * three creatures; the bias has to hold for `TERRAIN_SETTLE_TICKS` of samples
   * rather than being one lucky frame; and the whole check only runs with
   * terrain on, where `groundBias` is the only statistic on the panel that can
   * be non-zero at all. A drifting herd resets the streak, so this narrates a
   * settlement, not a passing crowd.
   */
  _checkTerrain(tick, pop, s) {
    if (this._settled) return;
    if (pop < 40 || s.groundBias > -0.06) {
      this._settleStreak = 0;
      return;
    }
    this._settleStreak++;
    if (this._settleStreak < TERRAIN_SETTLE_TICKS) return;
    this._settled = true;
    const pct = Math.round(-s.groundBias * 100);
    this._push(
      tick,
      "⛰️",
      "terrain",
      `The pond has found its flats — the living are on ground ${pct}% smoother than average.`
    );
  }

  /**
   * What the pond is dying of, reported only when the answer *changes* — a
   * standing figure belongs in the stats panel, not the feed.
   *
   * Two guards keep this from narrating noise. The window has to be full (a
   * "leading cause" drawn from nine deaths is a coin toss with extra steps), and
   * the leader has to hold an outright majority, so three causes sitting at
   * roughly a third each stays silent rather than flip-flopping between them
   * every time a body lands.
   */
  _checkMortality(tick, s) {
    const m = s.mortality();
    if (!m || m.n < s.deathWindow) return;
    if (m.shares[m.leading] < 0.5 || m.leading === this._leadingCause) return;
    this._leadingCause = m.leading;
    const label = { starvation: "Starvation", age: "Old age", predation: "Predation" }[m.leading];
    const pct = Math.round(m.shares[m.leading] * 100);
    this._push(
      tick,
      "⚰️",
      "death",
      `${label} is now the leading cause of death — ${pct}% of the last ${m.n}.`
    );
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
