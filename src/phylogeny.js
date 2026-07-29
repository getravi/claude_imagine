// phylogeny.js — tracks the "tree of life" as it unfolds in the pond.
//
// The simulation itself knows nothing about species; every creature is just an
// individual with a genome. This module watches that population from the
// outside and groups creatures into *species* by genetic similarity, so a human
// can see the branching, rising, and extinction of lineages over time — the
// same kind of view (a "Muller plot") biologists use for long-running evolution
// experiments. Nothing here feeds back into the simulation: it is pure
// observation, and it must stay deterministic so a seed still reproduces a world
// exactly, phylogeny and all.
//
// How species are formed (online phenetic clustering):
//   - Each species has a fixed *representative* genome (its founder's) and a
//     colour taken from that founder's hue.
//   - When a creature is born we compare its genome to the representatives of
//     the currently-living species. If it is within `speciationDistance` of one,
//     it joins that species; otherwise it founds a NEW species, whose parent in
//     the tree is the species of its biological parent.
// This is O(living species) per birth — cheap, because only a handful of species
// coexist at once.

export class Phylogeny {
  constructor(config) {
    this.config = config;
    // NEAT genomes use a different distance metric, so they get their own
    // species-split threshold.
    this.threshold = config.evolvableTopology
      ? config.neatCompatThreshold
      : config.speciationDistance;
    this.sampleInterval = config.phylogenySampleInterval;
    /** @type {Species[]} */
    this.species = [];
    this.byId = new Map();
    this.nextId = 0;
    // Abundance over time, covering the *whole run* rather than a sliding
    // window — see `_record` for how, and why the merge is a sum.
    // Each entry is { tick, counts: Map<id,count>, total, span }.
    this.snapshots = [];
    this.maxSnapshots = config.phylogenyHistory || 520;
    /** Raw samples per stored snapshot; doubles every time the record fills. */
    this.snapshotStride = 1;
    /** How many raw samples have been taken. */
    this.snapshotsSeen = 0;
    /** Tick of the newest raw sample, which may sit inside the last window. */
    this.latestTick = null;
    this._lastSample = -Infinity;
  }

  _newSpecies(genome, hue, parentId, tick) {
    const s = {
      id: this.nextId++,
      parentId, // null for founders
      rep: genome.clone(), // fixed representative; defines the species
      hue,
      birthTick: tick,
      extinctTick: -1,
      count: 0, // live members (refreshed each sample; bumped on assign)
      peak: 0,
    };
    this.species.push(s);
    this.byId.set(s.id, s);
    return s;
  }

  /**
   * Assign a creature to a species, creating a new one if it has drifted too far
   * from every living species. Returns the species id (also sets it on the
   * creature). `parentSpeciesId` is the species of the biological parent, used
   * as the new species' parent in the tree (null for founders).
   * @param {import('./creature.js').Creature} creature
   * @param {number} tick
   * @param {number|null} parentSpeciesId
   */
  assign(creature, tick, parentSpeciesId = null) {
    let best = null;
    let bestD = this.threshold;
    for (const s of this.species) {
      // Only cluster against species believed to be alive (or just created).
      if (s.count <= 0) continue;
      const d = creature.genome.distance(s.rep);
      if (d <= bestD) {
        bestD = d;
        best = s;
      }
    }
    if (!best) {
      best = this._newSpecies(creature.genome, creature.hue, parentSpeciesId, tick);
    }
    best.count++;
    if (best.count > best.peak) best.peak = best.count;
    creature.speciesId = best.id;
    return best.id;
  }

  /**
   * Periodically re-tally the true membership of every species from the live
   * population (authoritative — corrects the incremental counts, which don't see
   * deaths) and record a snapshot for the Muller plot.
   * @param {import('./world.js').World} world
   */
  sample(world, tick) {
    if (tick - this._lastSample < this.sampleInterval) return;
    this._lastSample = tick;

    for (const s of this.species) s.count = 0;
    const counts = new Map();
    for (const c of world.creatures) {
      const id = c.speciesId;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    for (const [id, n] of counts) {
      const s = this.byId.get(id);
      if (s) {
        s.count = n;
        if (n > s.peak) s.peak = n;
      }
    }
    // Mark freshly-extinct species.
    for (const s of this.species) {
      if (s.count === 0 && s.extinctTick < 0 && s.peak > 0) s.extinctTick = tick;
      else if (s.count > 0) s.extinctTick = -1; // resurrected (re-clustered)
    }

    this._record({ tick, counts, total: world.creatures.length, span: 1 });
  }

  /**
   * Store one abundance sample, keeping the record bounded *without* throwing
   * away the beginning of the run.
   *
   * Until v1.30 this was a plain ring: 520 snapshots at one every six ticks, so
   * the Tree of Life remembered the last ~3,120 ticks — under a minute of
   * watching — and silently dropped everything before that. The population
   * chart stopped doing this in v1.22; the other time-series view on the same
   * page kept doing it for eight more versions, which is the "one surface
   * passes while the same claim fails on another" trap in its purest form.
   *
   * So this halves its own resolution when it fills, exactly like `Archive`:
   * index 0 survives every halving, the record always starts where the run
   * started, and it gets *coarser* as the run grows rather than shorter.
   *
   * What it does **not** borrow from `Archive` is the min/max envelope, because
   * a species count is a third kind of quantity. Population is instantaneous
   * (thinning loses its peaks, hence the envelope); a death toll is extensive
   * and cumulative (thinning is lossless). A count here is extensive *within*
   * the merged window, so summing the counts and summing the totals gives the
   * population-weighted mean share over that window — which is what a stacked
   * share plot wants, keeps the bands summing to at most the whole, and, unlike
   * dropping every other sample, can never erase a lineage that only ever
   * existed inside one discarded window.
   */
  _record(snap) {
    this.latestTick = snap.tick;
    if (this.snapshotsSeen % this.snapshotStride === 0) {
      // A new representative, covering raw samples
      // [i·stride, (i+1)·stride) — the alignment that keeps every window the
      // same width after any number of halvings.
      this.snapshots.push(snap);
      if (this.snapshots.length > this.maxSnapshots) this._halveSnapshots();
    } else {
      mergeSnapshot(this.snapshots[this.snapshots.length - 1], snap);
    }
    this.snapshotsSeen++;
  }

  /** Fold every second snapshot into the one before it; the stride doubles. */
  _halveSnapshots() {
    const kept = [];
    for (let i = 0; i < this.snapshots.length; i += 2) {
      const snap = this.snapshots[i];
      const next = this.snapshots[i + 1];
      if (next) mergeSnapshot(snap, next);
      kept.push(snap);
    }
    this.snapshots = kept;
    this.snapshotStride *= 2;
  }

  /**
   * The tick range the abundance record covers, or null before any sample.
   * `to` is the newest raw sample, which can sit up to one window past the last
   * snapshot's `tick` (a window is labelled by where it starts).
   */
  snapshotSpan() {
    if (this.latestTick === null) return null;
    return { from: this.snapshots[0].tick, to: this.latestTick };
  }

  /** Ticks of history behind each stored snapshot. */
  snapshotResolution() {
    return this.snapshotStride * this.sampleInterval;
  }

  /**
   * Walk a species' parent links back to the founder it descends from — the
   * genealogy of whatever is alive now. Returns the chain oldest-first and
   * ending with the species itself, so `chain.length - 1` is how many times
   * this lineage has branched since the pond began. An unknown id gives an
   * empty chain. The walk is cycle-guarded and depth-bounded: the tree should
   * never contain a loop, but this runs in a render loop and must not hang.
   * @param {number} speciesId
   * @returns {object[]} species records, root first
   */
  ancestry(speciesId, maxDepth = 64) {
    const chain = [];
    const seen = new Set();
    let s = this.byId.get(speciesId);
    while (s && !seen.has(s.id) && chain.length < maxDepth) {
      seen.add(s.id);
      chain.push(s);
      s = s.parentId == null ? undefined : this.byId.get(s.parentId);
    }
    chain.reverse();
    return chain;
  }

  /** Number of species with living members right now. */
  livingCount() {
    let n = 0;
    for (const s of this.species) if (s.count > 0) n++;
    return n;
  }

  /**
   * The species to actually draw, chosen as those whose peak abundance reached
   * `minPeak`; everything else is folded into a synthetic "other" bucket so the
   * plot stays legible amid the churn of tiny short-lived lineages. Returned in
   * birth order (older lineages first) for stable stacking.
   */
  displaySpecies(minPeak = 4) {
    const shown = this.species.filter((s) => s.peak >= minPeak);
    shown.sort((a, b) => a.birthTick - b.birthTick || a.id - b.id);
    return shown;
  }
}

/**
 * Fold `other` into `into`, keeping `into`'s tick (a window is labelled by
 * where it starts). Counts and totals add, so `count / total` stays the share
 * of the pond that belonged to a species across the whole merged window.
 */
function mergeSnapshot(into, other) {
  for (const [id, n] of other.counts) into.counts.set(id, (into.counts.get(id) || 0) + n);
  into.total += other.total;
  into.span += other.span;
}
