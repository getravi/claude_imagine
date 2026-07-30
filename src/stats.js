// stats.js — rolling measurements of the living world.
//
// None of this feeds back into the simulation; it exists purely so a human
// watching can see what evolution is doing — population booms and crashes, how
// deep the oldest lineages run, how much genetic diversity remains. A history
// ring buffer drives the little live chart in the UI, and an Archive alongside
// it keeps the *whole* run at falling resolution, so the early history of a
// world is still there to look at hours later.

import { Archive } from "./archive.js";
import { groundBias } from "./terrain.js";
import { hazardShare } from "./contagion.js";
import { ENERGY_SOURCES, LEDGER_FIELDS, energyField } from "./energy.js";

/**
 * The ways a creature can die, in the order they are reported. Every death in
 * the world is attributed to exactly one of these at the moment it happens —
 * see `Creature.die()`.
 */
export const DEATH_CAUSES = Object.freeze(["starvation", "age", "predation"]);

/**
 * Ticks of history the "Soil" readout averages over. A share of a handful of
 * pellets per tick is far too noisy to read, and a cumulative share over the
 * whole run stops moving after a few thousand ticks — the v1.22 complaint about
 * readouts that look live and are not. An exponential mean with a stated horizon
 * is honest about being a recent average, and it still reads exactly 0 when
 * nothing has ever sprouted.
 */
export const SOIL_HORIZON = 240;

/**
 * How many history samples back the live `power` readout differences the books
 * over — 30 samples, so 120 ticks. Short enough that a crash moves it while you
 * are watching, long enough that it is not reporting the four ticks since the
 * last sample, where a single pellet is worth six energy per tick.
 */
export const POWER_WINDOW = 30;

/**
 * The history-point field carrying the *cumulative* number of deaths of one
 * cause up to that sample — and the CSV column name for it, so the file and the
 * buffer can never drift apart.
 * @param {string} cause one of DEATH_CAUSES
 */
export function deathField(cause) {
  return `deaths_${cause}`;
}

/**
 * Turn a run of history points into deaths-per-tick, split by cause: one
 * interval per adjacent pair of samples.
 *
 * The reason the counters in those points are cumulative rather than
 * per-interval is the whole trick here. v1.22 established that thinning a
 * history loses the extremes, and paid for an exact min/max envelope to get
 * them back. A cumulative counter needs no envelope: it is monotone, and
 * consecutive samples partition the run's ticks with no gap and no overlap, so
 * differencing any two of them returns *exactly* the deaths between — including
 * every death in the samples the archive threw away. The line gets coarser and
 * the arithmetic stays exact, at any capacity, forever. Extensive quantities are
 * lossless under decimation in a way instantaneous ones can never be.
 *
 * Pure and read-only. Returns an empty series for fewer than two points.
 * @param {Array<object>} hist history points, oldest first
 * @returns {{intervals: Array<object>, peak: number, total: number}}
 */
export function mortalitySeries(hist) {
  const intervals = [];
  let peak = 0;
  let total = 0;
  for (let i = 1; i < hist.length; i++) {
    const a = hist[i - 1];
    const b = hist[i];
    const dt = b.tick - a.tick;
    if (dt <= 0) continue;
    const counts = {};
    let n = 0;
    for (const c of DEATH_CAUSES) {
      // Clamped because a caller may splice two histories together; a negative
      // difference is a broken input, not a negative number of deaths.
      const d = Math.max(0, (b[deathField(c)] || 0) - (a[deathField(c)] || 0));
      counts[c] = d;
      n += d;
    }
    const rate = n / dt;
    if (rate > peak) peak = rate;
    total += n;
    // `index` is the position of the *later* sample, so a caller plotting the
    // history by index — which is how every chart in this project spaces its
    // points — can place the interval without assuming none were skipped.
    intervals.push({ index: i, from: a.tick, to: b.tick, dt, counts, deaths: n, rate });
  }
  return { intervals, peak, total };
}

/**
 * Round a set of shares (which sum to 1) into whole percentages that still sum
 * to exactly 100: floor them all, then hand the leftover points to the largest
 * remainders. Rounding each share on its own produces totals of 99 or 101 often
 * enough to notice, and a caption that adds up to 101% teaches a reader to
 * distrust every other number on the panel.
 * @param {number[]} shares
 * @returns {number[]} whole percentages, in the same order
 */
export function wholePercents(shares) {
  const raw = shares.map((v) => v * 100);
  const out = raw.map(Math.floor);
  const left = 100 - out.reduce((a, b) => a + b, 0);
  // Biggest fractional part first; index breaks ties so the result depends only
  // on the numbers, not on the sort's stability.
  const order = raw
    .map((_, i) => i)
    .sort((a, b) => raw[b] - out[b] - (raw[a] - out[a]) || a - b);
  for (let i = 0; i < left; i++) out[order[i % order.length]]++;
  return out;
}

/**
 * Total energy created as of one history point — the three sources summed. Not
 * a recorded column: a stored total is a number that can disagree with its own
 * parts, and these three are cheap to add up.
 * @param {object} row
 */
function created(row) {
  return ENERGY_SOURCES.reduce((s, k) => s + (row[energyField(k)] ?? 0), 0);
}

/**
 * One energy quantity, for the file. Rounded before formatting so a sink that
 * has never been touched — `spilled` sits at −2e−16 in most worlds — reads as
 * `0.000` and not as `-0.000`, which looks like a broken ledger and is only a
 * sum of nothing arriving at a signed zero.
 * @param {number} [x]
 */
function nrg(x) {
  const v = Math.round((x ?? 0) * 1000) / 1000;
  return (v === 0 ? 0 : v).toFixed(3);
}

/** The residual, which needs a scale rather than a number of decimals. */
function res(x) {
  return (x ?? 0).toExponential(3);
}

export class Stats {
  constructor(historyLength = 480, deathWindow = 120, runLength = 240) {
    this.historyLength = historyLength;
    this.popHistory = []; // {pop, food, gen} — the recent window, at full detail
    // The same points, kept for the entire run at whatever resolution fits in
    // `runLength` rows. `popHistory` answers "what is happening"; this answers
    // "what has happened", which for twenty-one versions nothing could.
    // Two of the archive's four envelope fields are energy, and both for the
    // reason v1.30 wrote down: an *instantaneous* quantity loses its extremes to
    // decimation and needs a min/max, while a cumulative one is lossless without
    // it. The eight ledger fields are cumulative, so they ride along as plain
    // representative values; the standing stock and the residual are stocks
    // measured at an instant, so they do not.
    this.runHistory = new Archive({
      capacity: runLength,
      fields: ["pop", "food", energyField("standing"), energyField("residual")],
    });
    this.tick = 0;
    this.births = 0;
    this.deaths = 0;
    this.kills = 0; // deaths specifically caused by predation
    // Mortality accounting. The pond has counted its dead since v1.0 and never
    // once asked what of, which makes a crash unreadable: a population halving
    // because winter starved it and one halving because predators found it look
    // identical from the outside. `deathsBy` is the whole run; `recentDeaths` is
    // a ring of the last `deathWindow` deaths, which is what the UI reports —
    // a cumulative share would be dominated by ancient history and would stop
    // moving after a few thousand ticks.
    this.deathWindow = deathWindow;
    this.deathsBy = { starvation: 0, age: 0, predation: 0 };
    /** @type {Array<{cause:string, age:number}>} newest last */
    this.recentDeaths = [];
    this.lifespanSum = 0; // total ticks lived, over every death so far
    this.scavenged = 0; // total scavenging bites taken from corpses
    this.infections = 0; // cumulative cases of the disease (contagion on)
    this.recoveries = 0; // cumulative recoveries, each one a new immune creature
    this.infectedCount = 0; // currently sick
    this.immuneCount = 0; // currently alive and immune
    this.peakInfected = 0; // worst simultaneous caseload ever seen
    // How much of the pond is currently within catching distance of somebody
    // sick — the size of the thing the two views now draw. A caseload says how
    // many are ill; this says how much of the water it costs you to be well.
    this.hazardShare = 0;
    // The pond's power: energy created per tick over the trailing
    // `POWER_WINDOW` samples. The energy panel has shown the run-to-date totals
    // since v1.29 and they are, by construction, numbers that stop moving; this
    // is the same books read as a rate, and it swings by most of an order of
    // magnitude across a single run.
    this.power = 0;
    this.maxGeneration = 0;
    this.maxPopEver = 0;
    this.carnivoreFrac = 0; // fraction of the population that are carnivores
    this.avgLearning = 0; // mean within-lifetime weight drift (plasticity on)
    this.avgVoice = 0; // mean |signal| across the pond (signalling on)
    this.avgHeard = 0; // mean strength of the call reaching each creature
    // Terrain: how much flatter the ground under the population is than the
    // landscape average. Negative means the pond has settled into its flats.
    // Exactly 0 in every world without terrain — a statistic that is non-zero
    // with its mechanism off is not measuring the mechanism.
    this.groundBias = 0;
    // Detritus: what share of the crop is currently growing out of the pond's
    // own dead, smoothed over roughly `SOIL_HORIZON` ticks. Exactly 0 in every
    // world without detritus, because no pellet can ever sprout from a field
    // that does not exist.
    this.soilShare = 0;
    this._lastSpawned = 0;
    this._lastSprouted = 0;
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

    // The channel — measured only where there is a channel at all.
    //
    // `avgVoice` is how loud the pond is, and it is the duller of the two: the
    // third output is a tanh, so it saturates near ±1 for almost any weights,
    // and sweeping the signal cost from zero up to five times base metabolism
    // barely moves it. Volume is not the interesting variable here.
    //
    // `avgHeard` is the traffic on the channel: the mean strength of the loudest
    // call actually reaching a creature, after distance has worn it down. It is
    // exactly zero in a world where nobody can hear, and unlike volume it
    // *moves* — it tracks how crowded the pond is, so it collapses in a crash
    // and swells as the survivors pack back into the fertile ground.
    if (world.config.signalling && pop > 0) {
      let loud = 0;
      let heard = 0;
      for (let i = 0; i < pop; i++) {
        loud += Math.abs(world.creatures[i].signal);
        heard += Math.abs(world.creatures[i].heard);
      }
      this.avgVoice = loud / pop;
      this.avgHeard = heard / pop;
    } else {
      this.avgVoice = 0;
      this.avgHeard = 0;
    }

    // Contagion: the live S/I/R split of the population. Counted only when the
    // feature is on — with it off no creature is ever sick or immune, so the
    // loop would be a per-tick scan for a guaranteed pair of zeroes.
    if (world.config.disease) {
      let sick = 0;
      let immune = 0;
      for (let i = 0; i < pop; i++) {
        const cr = world.creatures[i];
        if (cr.infected) sick++;
        else if (cr.immune) immune++;
      }
      this.infectedCount = sick;
      this.immuneCount = immune;
      if (sick > this.peakInfected) this.peakInfected = sick;
    } else {
      this.infectedCount = 0;
      this.immuneCount = 0;
    }

    // The size of the contagious zone. Only the *scan* is throttled — a pond
    // with nobody sick is zeroed on every tick, so curing the pond (or switching
    // the pathogen off) clears the readout in the same frame instead of leaving
    // the last epidemic's number sitting there looking live. That mistake has
    // been made twice here already, in v1.22's chart buffer and v1.23's ground
    // readout.
    if (this.infectedCount === 0) this.hazardShare = 0;
    else if (this.tick % 4 === 0) this.hazardShare = hazardShare(world.creatures, world.config);

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

    // Where the pond is standing, relative to where standing anywhere would put
    // it. Only the scan is throttled: a world with no terrain is zeroed on every
    // tick, so switching terrain off mid-run clears the readout in the same
    // frame instead of leaving the last landscape's number sitting there.
    if (!world.terrain) this.groundBias = 0;
    else if (this.tick % 4 === 0) this.groundBias = groundBias(world.terrain, world.creatures);

    // How much of the crop is growing out of the pond's own dead. Both counters
    // are cumulative, so differencing them gives exactly this tick's spawns —
    // and with no field to sprout from, `sprouted` never moves and the mean
    // stays at the zero it started at. Zeroed outright without a field, so
    // switching detritus off clears the readout in the same frame rather than
    // leaving the last pond's number sitting there looking live.
    const spawned = world.food.spawned - this._lastSpawned;
    const sprouted = world.food.sprouted - this._lastSprouted;
    this._lastSpawned = world.food.spawned;
    this._lastSprouted = world.food.sprouted;
    if (!world.detritus) this.soilShare = 0;
    else if (spawned > 0) {
      this.soilShare += (sprouted / spawned - this.soilShare) / SOIL_HORIZON;
    }

    // Record a history point every 4 ticks.
    if (this.tick % 4 === 0) {
      const point = {
        tick: this.tick,
        pop,
        food: world.food.items.length,
        gen: maxGen,
      };
      // The death toll as of this sample, cumulative. v1.21 gave every death a
      // cause and v1.22 gave the run a memory, and for four versions the two
      // never met: the mix on screen is the last 120 bodies, so by the time a
      // crash is far enough back to see on the chart, what killed it is already
      // out of the window. Carried here it is in the chart, the archive and both
      // CSV scopes at once — the archive needs no change to hold it, which is
      // what "generic over its fields" was supposed to mean.
      for (const c of DEATH_CAUSES) point[deathField(c)] = this.deathsBy[c];
      // The other three extensive counters this class keeps. They cost a column
      // each and, being cumulative, they are exact under any amount of thinning
      // — there was never a reason for them not to be here except that nobody
      // wrote them down.
      point.births = this.births;
      point.kills = this.kills;
      point.scavenged = this.scavenged;
      // And the books. Eight cumulative fields plus the standing stock and the
      // residual of the identity, at this tick. `snapshot()` reads the world and
      // writes nothing to it, and the ledger exists in every world, so there is
      // no toggle here and no branch — the books are always open.
      Object.assign(point, world.energy.snapshot(world));
      this.popHistory.push(point);
      if (this.popHistory.length > this.historyLength) this.popHistory.shift();
      // The same point, into a record that never drops the far end. Nobody
      // mutates a history point after it is made, so both may hold the one
      // object.
      this.runHistory.push(point);
      // The live rate, from the ring the chart draws. Differencing two
      // cumulative samples is exact, so this is the pond's real throughput over
      // the window and not a smoothed estimate of it.
      const h = this.popHistory;
      const back = h[Math.max(0, h.length - 1 - POWER_WINDOW)];
      const dt = point.tick - back.tick;
      this.power = dt > 0 ? (created(point) - created(back)) / dt : 0;
    }
  }

  /**
   * Record one death and what caused it. Called by the world as it sweeps up
   * the bodies, which is the last moment the evidence still exists — a creature
   * is removed from the population immediately afterwards and nothing about it
   * survives. Draws no randomness and touches no creature, so a world that has
   * this bookkeeping is bit-for-bit the world that doesn't.
   * @param {import('./creature.js').Creature} creature
   */
  recordDeath(creature) {
    const cause = creature.deathCause;
    if (cause in this.deathsBy) this.deathsBy[cause]++;
    this.lifespanSum += creature.age;
    this.recentDeaths.push({ cause, age: creature.age });
    if (this.recentDeaths.length > this.deathWindow) this.recentDeaths.shift();
  }

  /**
   * The recent mortality mix: of the last `deathWindow` creatures to die, how
   * many died of each cause, and how long they lived on average. Returns null
   * until something has actually died, so callers never have to render a bar
   * made of three zeroes.
   */
  mortality() {
    const n = this.recentDeaths.length;
    if (n === 0) return null;
    const counts = { starvation: 0, age: 0, predation: 0 };
    let ageSum = 0;
    for (const d of this.recentDeaths) {
      counts[d.cause]++;
      ageSum += d.age;
    }
    const shares = {};
    // Ties resolve to the earlier cause in DEATH_CAUSES, so the answer depends
    // only on the counts and never on which body happened to be swept up first.
    let leading = DEATH_CAUSES[0];
    for (const c of DEATH_CAUSES) {
      shares[c] = counts[c] / n;
      if (counts[c] > counts[leading]) leading = c;
    }
    return { n, counts, shares, leading, meanLifespan: ageSum / n };
  }

  /**
   * Render the population/food/generation history as CSV text, so a visitor can
   * pull the chart's raw numbers into a spreadsheet. Pure and read-only: it
   * never touches the simulation, only formats what sample() already recorded.
   *
   * `"recent"` is the full-detail window the live chart draws — one row per
   * four ticks, most recent 480 rows. `"whole"` is the entire run from tick 0,
   * thinned to fit, and carries the envelope columns: each row's `pop_min` /
   * `pop_max` are exact over the `samples` raw points it stands for, so a peak
   * that fell between two retained rows is still in the file.
   *
   * Both scopes carry the `deaths_*` columns, the three other counters, and the
   * energy books, and every one of them is cumulative on purpose: subtract one
   * row's from the next's and you have exactly what happened in between,
   * whatever the thinning did to the rows around it. A per-interval column
   * would have been the more obvious choice and would have quietly
   * under-reported the whole run.
   *
   * Energy is written to three decimals, which is four parts in a hundred
   * thousand of a single pellet — enough that differences stay honest and
   * little enough that a spreadsheet is readable. The residual is the exception
   * and goes out in exponential form, because it is the one column whose
   * interesting values span from 1e−9 (floating-point drift, the books fine) to
   * whole units (the books broken), and no fixed number of decimals shows both.
   * @param {"recent"|"whole"} [scope]
   */
  toCSV(scope = "recent") {
    const deathCols = DEATH_CAUSES.map(deathField).join(",");
    const deathVals = (h) => DEATH_CAUSES.map((c) => h[deathField(c)] ?? 0).join(",");
    const tallyCols = "births,kills,scavenged";
    const tallyVals = (h) => [h.births ?? 0, h.kills ?? 0, h.scavenged ?? 0].join(",");
    const nrgCols = [...LEDGER_FIELDS, "standing", "residual"].map(energyField).join(",");
    const nrgVals = (h) =>
      [...LEDGER_FIELDS, "standing"]
        .map((f) => nrg(h[energyField(f)]))
        .concat(res(h[energyField("residual")]))
        .join(",");
    if (scope === "whole") {
      const lines = [
        "tick,population,food,max_generation,pop_min,pop_max,food_min,food_max," +
          "energy_standing_min,energy_standing_max,energy_residual_min,energy_residual_max," +
          `samples,${deathCols},${tallyCols},${nrgCols}`,
      ];
      // Rows pushed by hand carry no envelope for a field they never had, so an
      // absent bound reads as zero — the same graceful case as an absent
      // counter, rather than the word "undefined" landing in a spreadsheet.
      const band = (r, f, fmt) => `${fmt(r.min[f] ?? 0)},${fmt(r.max[f] ?? 0)}`;
      for (const r of this.runHistory.series()) {
        lines.push(
          `${r.tick},${r.pop},${r.food},${r.gen},` +
            `${r.min.pop},${r.max.pop},${r.min.food},${r.max.food},` +
            `${band(r, energyField("standing"), nrg)},` +
            `${band(r, energyField("residual"), res)},` +
            `${r.span},${deathVals(r)},${tallyVals(r)},${nrgVals(r)}`
        );
      }
      return lines.join("\n") + "\n";
    }
    const lines = [
      `tick,population,food,max_generation,${deathCols},${tallyCols},${nrgCols}`,
    ];
    for (const h of this.popHistory) {
      lines.push(
        `${h.tick},${h.pop},${h.food},${h.gen},${deathVals(h)},${tallyVals(h)},${nrgVals(h)}`
      );
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
