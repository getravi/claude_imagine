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
//
// **A line can now be about somebody (v1.125).** Until this release every
// sentence here was about the pond — a crash, a nightfall, a lineage — and the
// one thing a visitor watching an aquarium actually asks is *who*. An event
// carries an optional `who`, a creature id, and `eventLine` puts that animal's
// name in front of the sentence. The id is deliberately **not** part of the
// stored text and not part of the narration's hash: see `EVENT_UNHASHED` in
// `fingerprint.js`, and `stats.recordYoungId`, which is outside the books'
// hash for exactly the same reason one release earlier.
//
// The measurement that shaped this: over twelve seeds, a six-thousand-tick run
// left a mean of **14.8 lines** in a feed that holds 140 — a fifth full, after
// an hour and a half of pond time. The narrator was never at risk of being
// noisy; it was a world that barely spoke. Records take that to **22.2**, and
// 88 of the 267 lines those twelve runs now write are somebody's best.

import { RNG } from "./rng.js";
import { MULLER_MIN_PEAK, speciesOrigin } from "./phylogeny.js";
import { nameSpecies, speciesPlural } from "./speciesnames.js";
// The floor below which "the most young anybody has raised" is not a record,
// and the name to put in front of the line. Both from `cast.js` rather than
// from `records.js`, which re-exports the first as `YOUNG_MIN`: the board pulls
// the whole palette in behind it, and the narrator has no use for a colour.
// One definition either way — the number lives in `cast.js` and nowhere else.
import { PARENT_MIN_CHILDREN, givenName, ordinal } from "./cast.js";

/**
 * Consecutive observations the population must spend on smoother-than-average
 * ground before the chronicle will call it settled. `observe` runs every tick,
 * so this is a couple of hundred ticks of holding still.
 */
const TERRAIN_SETTLE_TICKS = 240;
/**
 * Ticks the crop must keep growing out of the dead before it is worth saying.
 * The same length as the terrain streak, and for the same reason: the readout it
 * watches is already a mean over a few hundred ticks, so a streak on top of it
 * asks for a state of affairs rather than a lucky sample.
 */
const DETRITUS_FED_TICKS = 240;
/** Deaths the pond must have had before any of them can be said to be feeding it. */
const DETRITUS_MIN_DEATHS = 60;
/** Share of new pellets sprouting from nutrient that counts as "the crop". */
const DETRITUS_FED_SHARE = 0.3;

/**
 * How far the pond has to fall below its own best before climbing back over it
 * counts as news.
 *
 * `stats.maxPopEver` is broken a median **228 times in a six-thousand-tick run**
 * (2,578 over twelve seeds) — every single tick a growing pond adds an animal —
 * so "a new record crowd" said plainly is not an event, it is the population
 * line with a rosette on it. What *is* an event is the pond losing its high
 * water and taking it back, and that is rare enough to be worth a line: at this
 * threshold it happens **8 times over those same twelve runs** before
 * `HIGH_WATER_MIN` takes two of the ponds out of it. Loosen it to 0.95 and it
 * doubles to 16; tighten it to 0.7 and it halves to 4. A tenth is the point
 * where the fall is visible on the chart without being a crash — the crash
 * line has its own detector, at 0.45.
 */
const HIGH_WATER_LOST = 0.9;

/**
 * How full the pond has to have been for its own fullness to be worth a line.
 *
 * `records.js` puts the founders' own number under the board's crowd row — a
 * peak equal to `populationStart` is forty animals standing where they were
 * dropped — and that floor is too low for a *sentence*. Written that way, two
 * of twelve seeds announced "the pond is fuller than it has ever been — 43
 * animals" at tick 1,800, which is true, and is the founders shuffling. The
 * pond's first population milestone is the honest floor: below a hundred,
 * `_popCrossed` has not yet said this water is crowded, and a record crowd
 * cannot be news before crowding is. With it the line fires **5 times over
 * twelve runs instead of 8, on 5 ponds** — and the three it drops are the three
 * that quoted a two-digit crowd.
 */
const HIGH_WATER_MIN = 100;

export class Chronicle {
  constructor(config) {
    this.config = config;
    /** @type {Array<{tick:number, year:number, icon:string, cat:string, msg:string, who:number}>} */
    this.events = [];
    this.max = 140;
    this.rng = new RNG((config.seed ^ 0x9e3779b9) >>> 0); // own stream

    // Debounce / one-shot trackers.
    this._popCrossed = new Set();
    this._genCrossed = new Set();
    this._carnCrossed = new Set();
    this._hiddenMax = 0;
    this._firstKill = false;
    this._firstSpared = false;
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
    this._reportedBranch = new Set();
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
    this._soilFed = false;
    this._soilStreak = 0;
    this._refugeCrossed = false;
    this._sawBelowRefuge = false;
    /** The best "young raised" this narrator has already announced. */
    this._recordYoung = 0;
    /**
     * Who held it when it was last announced, so the next line can tell a
     * champion beating themselves from a champion being dethroned — 65 of the
     * 83 breaks over twelve runs are the same animal going again.
     *
     * A creature id, and therefore **outside the narration's hash**: ids come
     * from a module-level counter that never resets, so two identical ponds
     * built in one process hold the same animals under different numbers. What
     * this latch decides is a *comparison* of two ids, and that comes out the
     * same in both. `CHRONICLE_UNHASHED` carries the argument in full.
     */
    this._recordHolder = -1;
    /** The high-water mark as of the last observation. */
    this._highMark = 0;
    /** Whether the pond has been well below that mark since it was set. */
    this._lostHigh = false;
  }

  /**
   * @param {number} who the creature this line is about, or -1 for the pond
   *   itself. Never written into `msg`: a name is a function of an id, and an
   *   id is not comparable between two worlds in one process.
   */
  _push(tick, icon, cat, msg, who = -1) {
    const year = this.config.seasons ? Math.floor(tick / this.config.seasonLength) + 1 : 0;
    this.events.push({ tick, year, icon, cat, msg, who });
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
    // The first time kin recognition speaks. A one-shot, and it needs no
    // "did this really happen?" guard (v1.16) because the counter *is* the
    // event: `stats.kinSpared` rises on the tick a hunter turns down a relative
    // it could have eaten, and is exactly 0 in every other world and every
    // earlier tick of this one. Worth a line precisely because it is the rule's
    // only trace — nothing on the canvas changes when a meal is declined — and
    // because on most seeds this line is never written at all.
    if (!this._firstSpared && s.kinSpared > 0) {
      this._firstSpared = true;
      this._push(tick, "👪", "predation", "A hunter turns away from its own family.");
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
    // The moment most of the pond stops being edible. Three guards, and each
    // one is a bug this project has already shipped once: the mechanic has to
    // exist (`predation`), somebody has to have actually hunted (`_firstKill`,
    // the same guard the carnivore milestones need), and the pond has to have
    // been *below* the line at some point, or a founding population that
    // happens to start large would announce a crossing that never happened —
    // v1.16's burnout line, which narrated the end of an epidemic that had no
    // beginning. Said once: the share drifts back and forth over a half by a
    // few points for the rest of a run, and a line that re-fires on every
    // wobble is noise rather than news.
    if (this.config.predation && pop > 0) {
      if (s.refugeShare < 0.5) this._sawBelowRefuge = true;
      else if (this._firstKill && this._sawBelowRefuge && !this._refugeCrossed) {
        this._refugeCrossed = true;
        this._push(
          tick,
          "🔒",
          "predation",
          "Most of the pond has grown too big for anything here to eat."
        );
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

    // --- Detritus (only when the ground remembers anything) ---
    if (this.config.detritus) this._checkDetritus(tick, s);

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

    // --- Records falling ---
    this._checkRecords(tick, pop, s);

    // --- Throttled scans ---
    if (tick % 32 === 0) this._checkMortality(tick, s);
    if (tick % 32 === 0) this._checkOldest(world, tick);
    if (tick % 64 === 0) this._checkDiversity(world, tick);
    if (tick % 48 === 0) this._checkSpecies(world, tick, pop);
  }

  /**
   * A record falling, in words.
   *
   * `🏆 Pond records` (v1.124) is the one board here that remembers an animal
   * after it sinks, and it has been changing in total silence: the visitor is
   * watching the water, the board is behind them, and the surface whose whole
   * job is announcing events was looking the other way. This is that line.
   *
   * **Two of the board's three rows survived being measured as news.**
   *
   *   * *Most young* is the one record here about an individual, and it breaks
   *     a median **7 times** in six thousand ticks — 83 over twelve seeds, and
   *     the closest two are 30 ticks apart, so no cooling-off period is needed
   *     in a feed that averages 14.8 lines. **65 of those 83 (78.3%) are the
   *     holder beating their own number**, and only 18 hand the record to a new
   *     name (median 1 a run; on 2 seeds of 12 it never changes hands at all
   *     after the first). A pond, it turns out, mostly has *a* champion rather
   *     than a succession of them — so the wording splits three ways, because
   *     "Robin takes the record" said seven times about the same animal would
   *     be a lie told by a template.
   *   * *Biggest crowd* only counts when it is a comeback — see
   *     `HIGH_WATER_LOST` for why the raw record is not an event.
   *   * *Biggest family* is **dropped**, and the number is the reason: the
   *     largest lineage's peak is broken 2,009 times over twelve runs and
   *     changes *families* only **12 times, none at all on 7 of the 12 ponds**.
   *     A line that fires two thousand times is the Muller plot read aloud, and
   *     the twelve that mean anything are already narrated — `_checkSpecies`
   *     announces a lineage taking 45% of the pond, which is the same story
   *     with a better trigger. One event, one narrator.
   *
   * No cap, no throttle, and no latch set: the guard is that a record only
   * moves upward, so a line per break is a line per genuine improvement.
   */
  _checkRecords(tick, pop, s) {
    // --- The one individual record. ---
    const rec = s.recordYoung;
    if (rec && rec.children >= PARENT_MIN_CHILDREN && rec.children > this._recordYoung) {
      const holder = s.recordYoungId ?? -1;
      const first = this._recordYoung === 0;
      const again = holder === this._recordHolder;
      const young = `${rec.children} young`;
      this._recordYoung = rec.children;
      this._recordHolder = holder;
      this._push(
        tick,
        "👶",
        "record",
        first
          ? `is the first animal here to raise ${young}.`
          : again
            ? // Short, because this is the line that repeats: a champion beats
              // their own number seven times for every once they are dethroned,
              // and eight copies of a full sentence read as a template while
              // eight copies of a tally read as a streak.
              `raises their ${ordinal(rec.children)}.`
            : `takes the pond's record for young raised, with ${rec.children}.`,
        holder
      );
    }

    // --- The pond's own record, but only when it is a recovery. ---
    const peak = s.maxPopEver || 0;
    if (peak > this._highMark) {
      if (this._lostHigh && this._highMark >= HIGH_WATER_MIN) {
        this._push(
          tick,
          "🌊",
          "record",
          `The pond is fuller than it has ever been — ${peak} animals, past a high it had lost.`
        );
      }
      this._highMark = peak;
      this._lostHigh = false;
    } else if (pop < HIGH_WATER_LOST * peak) {
      this._lostHigh = true;
    }
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
   * The pond feeding on itself: reported once, when a sustained share of the
   * crop has been sprouting out of the dead.
   *
   * Three guards, and the middle one is the "did this really happen?" check that
   * v1.16 taught this project to write. The share is exactly 0 without a
   * nutrient field, so the line cannot fire in a pond with no such mechanism;
   * `DETRITUS_MIN_DEATHS` insists the pond has actually buried enough to be fed
   * by them, so a handful of early deaths in a nearly empty world can't carry a
   * claim about the crop; and the streak asks for a state of affairs rather than
   * one favourable sample.
   */
  _checkDetritus(tick, s) {
    if (this._soilFed) return;
    if (s.deaths < DETRITUS_MIN_DEATHS || s.soilShare < DETRITUS_FED_SHARE) {
      this._soilStreak = 0;
      return;
    }
    this._soilStreak++;
    if (this._soilStreak < DETRITUS_FED_TICKS) return;
    this._soilFed = true;
    const pct = Math.round(s.soilShare * 100);
    this._push(
      tick,
      "🍂",
      "detritus",
      `The pond is feeding on its own dead — ${pct}% of new food now grows where something died.`
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
    // What to call them (v1.116). Built here rather than held on the chronicle
    // because it is a pure function of the tree and the tree only ever grows:
    // caching it would be a second copy of the same list, and this scan is
    // throttled to begin with.
    const names = nameSpecies(ph.species);
    const they = (id) => speciesPlural(names, id);
    // New dominant species.
    if (pop > 60) {
      let top = null;
      for (const sp of ph.species) if (sp.count > 0 && (!top || sp.count > top.count)) top = sp;
      if (top && top.count >= 0.45 * pop && top.id !== this._dominant) {
        this._dominant = top.id;
        const pct = Math.round((top.count / pop) * 100);
        this._push(tick, "👑", "lineage", `The ${they(top.id)} now hold the pond (${pct}%).`);
      }
    }
    // A branch — the one event the Tree of Life is actually about, and the one
    // it has never said out loud. Forty of the tree's forty-five species are
    // the genomes tick 0 dealt out, so "a new species" is not news by itself;
    // what is news is a newborn that drifted past `speciationDistance` from
    // every living representative, which happens 0–10 times in 6,000 ticks.
    //
    // Two guards, and the second is the v1.16 rule. `speciesOrigin` is the
    // "did this really happen?" test: a founder and a reseeded stranger both
    // start a species without anything having evolved, and only a branch
    // carries a parent lineage. And it waits for `MULLER_MIN_PEAK` members, so
    // the line fires exactly when the plot beside it grows a band — a lineage
    // of one that dies the same afternoon is churn, and the picture already
    // agrees that it is.
    for (const sp of ph.species) {
      if (sp.peak < MULLER_MIN_PEAK || this._reportedBranch.has(sp.id)) continue;
      if (speciesOrigin(sp) !== "evolved") continue;
      this._reportedBranch.add(sp.id);
      this._push(
        tick,
        "🌿",
        "lineage",
        `The ${they(sp.id)} have split away from the ${they(sp.parentId)} — ` +
          `a new lineage, evolved here.`
      );
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
          `The ${they(sp.id)}, once ${sp.peak} strong, are gone after ~${gens} generations.`
        );
      }
    }
  }
}

/**
 * One line of the chronicle as a sentence, name and all.
 *
 * The name is composed here rather than stored in `msg` for the reason
 * `EVENT_UNHASHED` gives: a creature id is a module-level counter, so two
 * identical ponds in one process would write differently-named narrations of
 * the same events, and the narration has a hash that would call that a
 * difference. Storing the id and spelling the name at the last moment keeps the
 * measurement in the channel and the identity out of it — the split v1.124 made
 * in the books, one surface over.
 *
 * Every line this returns therefore reads *subject verb*: a `who` event's `msg`
 * is a predicate with no subject of its own, which is why they are written
 * starting with a verb.
 *
 * @param {{msg:string, who?:number}} e
 * @returns {string} plain text — the feed marks the name up itself
 */
export function eventLine(e) {
  return e.who >= 0 ? `${givenName(e.who)} ${e.msg}` : e.msg;
}

/**
 * The name a line names, or "" when it is about the pond rather than a body.
 * Split out so the feed can put it in its own element without re-deriving the
 * rule, and so a test can hold the two halves to the same answer.
 *
 * @param {{who?:number}} e
 */
export function eventWho(e) {
  return e.who >= 0 ? givenName(e.who) : "";
}
