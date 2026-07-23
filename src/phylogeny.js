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
    // Abundance over time: each entry is { tick, counts: Map<id,count>, total }.
    this.snapshots = [];
    this.maxSnapshots = config.phylogenyHistory || 520;
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

    this.snapshots.push({ tick, counts, total: world.creatures.length });
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
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
