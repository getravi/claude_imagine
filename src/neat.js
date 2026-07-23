// neat.js — evolvable brain *topology* (NEAT-flavoured).
//
// Up to v1.4 every creature's brain had a fixed shape (16→12→3) and evolution
// only tuned the weights. This module is the alternative: a brain whose
// *structure* grows over generations. Genomes are graphs — a list of nodes and
// a list of connections — and mutation can add a new connection or splice a new
// neuron into an existing connection, so lineages can start simple and evolve
// complexity if it pays. This is the idea behind NEAT (NeuroEvolution of
// Augmenting Topologies, Stanley & Miikkulainen 2002), trimmed to the essentials
// that fit Vivarium.
//
// It is deliberately a SEPARATE genome type from the fixed-topology Genome in
// genome.js, selected only when config.evolvableTopology is on. It exposes the
// same surface the rest of the code relies on — body-gene getters, buildBrain(),
// mutate(), static crossover()/random(), distance(), clone(), and array
// serialization via `data` — so Creature and the phylogeny don't need to know
// which kind of genome they hold.
//
// Two simplifications versus canonical NEAT, chosen for legibility:
//   - There is no global innovation counter. Connections are identified by their
//     (source, target) node ids, which is counter-free and fully deterministic;
//     hidden nodes are numbered per-genome. This means crossover can't perfectly
//     align hidden nodes that arose independently in different lineages (the
//     "competing conventions" problem NEAT's innovation numbers solve). It's a
//     non-issue for the default asexual reproduction, where structure only ever
//     grows within a single lineage; with sexual reproduction on it's an
//     approximation.
//   - Distance is a lightweight blend of topological and weight difference —
//     enough for the phylogeny to cluster, not a faithful NEAT compatibility
//     metric.

import { clamp, lerp } from "./vec.js";

// The brain's fixed interface with the world. The INPUT and OUTPUT node counts
// never change (they're wired to senses and motors); only hidden structure
// between them evolves. Must match Creature.sense()/act().
export const NEAT_IO = Object.freeze({ inputs: 16, outputs: 3 });

// Node id layout: [0 .. inputs-1] are inputs, [inputs .. inputs+outputs-1] are
// outputs, and hidden nodes take ids from HIDDEN_BASE upward.
const N_IN = NEAT_IO.inputs;
const N_OUT = NEAT_IO.outputs;
const HIDDEN_BASE = 1000; // hidden node ids start here; keeps id ranges disjoint

const BODY_GENES = 4; // [size, metabolism, hue, diet] — same as fixed genome

function tanh(x) {
  return Math.tanh(x);
}

/**
 * A deterministic "innovation" key for a connection between two node ids. Using
 * the pair itself (not a mutable counter) keeps everything reproducible: the
 * same structural link always has the same key, in every genome, forever.
 */
function connKey(from, to) {
  return from * 100000 + to;
}

export class NeatGenome {
  /**
   * @param {object} g
   * @param {number[]} g.nodes hidden node ids (inputs/outputs are implicit)
   * @param {Array<{from:number,to:number,w:number,on:boolean}>} g.conns
   * @param {number[]} g.body the four body genes, each in [0,1]
   */
  constructor({ nodes, conns, body }) {
    this.nodes = nodes;
    this.conns = conns;
    this.body = body;
  }

  // --- Body-gene getters: identical surface to the fixed-topology Genome. ---
  get sizeGene() {
    return this.body[0];
  }
  get metabolismGene() {
    return this.body[1];
  }
  get hueGene() {
    return this.body[2];
  }
  get dietGene() {
    return this.body[3];
  }

  /** Flat array of enabled connection weights — for the inspector fingerprint. */
  get brainWeights() {
    const out = new Float32Array(this.conns.length);
    for (let i = 0; i < this.conns.length; i++) out[i] = this.conns[i].on ? this.conns[i].w : 0;
    return out;
  }

  /**
   * A minimal starting genome: no hidden nodes, and a sparse set of random
   * direct input→output connections. Evolution grows it from here.
   * @param {import('./rng.js').RNG} rng
   */
  static random(rng) {
    const conns = [];
    // Seed each output with a few random input links so founders can already do
    // something; the exact count is small so there's room to grow.
    for (let o = 0; o < N_OUT; o++) {
      const to = N_IN + o;
      const nLinks = rng.int(2, 4);
      const used = new Set();
      for (let k = 0; k < nLinks; k++) {
        const from = rng.int(0, N_IN - 1);
        if (used.has(from)) continue;
        used.add(from);
        conns.push({ from, to, w: rng.gaussian(0, 1), on: true });
      }
    }
    const body = [rng.float(), rng.float(), rng.float(), rng.float()];
    return new NeatGenome({ nodes: [], conns, body });
  }

  /** Deep copy. */
  clone() {
    return new NeatGenome({
      nodes: this.nodes.slice(),
      conns: this.conns.map((c) => ({ ...c })),
      body: this.body.slice(),
    });
  }

  /**
   * Build an executable network. NEAT graphs can be irregular, so we evaluate by
   * a bounded number of propagation passes rather than assuming layers: values
   * flow along enabled connections, re-summing a few times so signals reach the
   * outputs even through chains of hidden nodes. Cheap and order-independent for
   * the shallow graphs Vivarium evolves.
   */
  buildBrain() {
    return new NeatNetwork(this);
  }

  /**
   * Mutate: perturb weights and body genes (like the fixed genome), and — the
   * whole point — occasionally grow structure: add a connection, or splice a
   * node into an existing connection.
   * @param {import('./rng.js').RNG} rng
   * @param {object} cfg needs neatWeightRate, neatWeightStrength, neatAddConn,
   *   neatAddNode, and (for body) mutationRate
   */
  mutateForConfig(rng, cfg) {
    const nodes = this.nodes.slice();
    const conns = this.conns.map((c) => ({ ...c }));
    const rate = cfg.neatWeightRate;
    const strength = cfg.neatWeightStrength;

    // Weight perturbation (two-scale, mirroring the fixed genome).
    for (const c of conns) {
      if (rng.chance(rate)) {
        if (rng.chance(0.1)) c.w += rng.gaussian(0, strength * 6);
        else c.w += rng.gaussian(0, strength);
      }
    }

    // Body genes.
    const body = this.body.slice();
    for (let i = 0; i < body.length; i++) {
      if (rng.chance(cfg.mutationRate)) body[i] = clamp(body[i] + rng.gaussian(0, 0.05), 0, 1);
    }

    const g = new NeatGenome({ nodes, conns, body });

    // Structural: add a connection between two currently-unconnected nodes.
    if (rng.chance(cfg.neatAddConn)) g._tryAddConnection(rng);
    // Structural: splice a node into an existing enabled connection.
    if (rng.chance(cfg.neatAddNode)) g._tryAddNode(rng);

    return g;
  }

  _allNodeIds() {
    const ins = [];
    for (let i = 0; i < N_IN; i++) ins.push(i);
    const outs = [];
    for (let o = 0; o < N_OUT; o++) outs.push(N_IN + o);
    return { ins, outs, hidden: this.nodes.slice() };
  }

  /** Add one new enabled connection from a valid source to a valid target. */
  _tryAddConnection(rng) {
    const { ins, outs, hidden } = this._allNodeIds();
    // Valid sources: inputs + hidden. Valid targets: outputs + hidden.
    const sources = ins.concat(hidden);
    const targets = outs.concat(hidden);
    const from = sources[rng.int(0, sources.length - 1)];
    const to = targets[rng.int(0, targets.length - 1)];
    if (from === to) return;
    const key = connKey(from, to);
    if (this.conns.some((c) => connKey(c.from, c.to) === key)) return; // exists
    this.conns.push({ from, to, w: rng.gaussian(0, 1), on: true });
  }

  /**
   * Splice a new hidden node into an existing enabled connection: disable the
   * old link A→B and add A→N (weight 1) and N→B (old weight), so behaviour is
   * initially preserved and then free to diverge — the standard NEAT node-add.
   */
  _tryAddNode(rng) {
    const enabled = this.conns.filter((c) => c.on);
    if (enabled.length === 0) return;
    const c = enabled[rng.int(0, enabled.length - 1)];
    c.on = false;
    // New hidden node id: keep them unique and disjoint from input/output ids.
    let id = HIDDEN_BASE;
    while (this.nodes.includes(id)) id++;
    this.nodes.push(id);
    this.conns.push({ from: c.from, to: id, w: 1, on: true });
    this.conns.push({ from: id, to: c.to, w: c.w, on: true });
  }

  /**
   * Uniform crossover: shared connections (same key) take a random parent's
   * weight; connections unique to a parent are inherited as-is. Node lists are
   * unioned. Body genes are picked per-gene. Simple, and enough to mix two
   * evolved topologies without producing invalid graphs.
   */
  static crossover(a, b, rng) {
    const bByKey = new Map(b.conns.map((c) => [connKey(c.from, c.to), c]));
    const conns = [];
    const seen = new Set();
    for (const ca of a.conns) {
      const key = connKey(ca.from, ca.to);
      seen.add(key);
      const cb = bByKey.get(key);
      if (cb && rng.chance(0.5)) conns.push({ ...cb });
      else conns.push({ ...ca });
    }
    for (const cb of b.conns) {
      const key = connKey(cb.from, cb.to);
      if (!seen.has(key) && rng.chance(0.5)) conns.push({ ...cb });
    }
    const nodeSet = new Set([...a.nodes, ...b.nodes]);
    // Keep only hidden nodes that some surviving connection actually references.
    const referenced = new Set();
    for (const c of conns) {
      if (c.from >= HIDDEN_BASE) referenced.add(c.from);
      if (c.to >= HIDDEN_BASE) referenced.add(c.to);
    }
    const nodes = [...nodeSet].filter((n) => referenced.has(n));
    const body = a.body.map((v, i) => (rng.chance(0.5) ? v : b.body[i]));
    return new NeatGenome({ nodes, conns, body });
  }

  /**
   * A lightweight genetic distance for the phylogeny: the fraction of
   * connections not shared between the two genomes (topological difference),
   * blended with the mean weight difference on the connections they do share,
   * plus the body-gene difference. Not canonical NEAT compatibility, but a
   * stable, cheap proxy for "how related".
   */
  distance(other) {
    const aKeys = new Map(this.conns.map((c) => [connKey(c.from, c.to), c.w]));
    const bKeys = new Map(other.conns.map((c) => [connKey(c.from, c.to), c.w]));
    let shared = 0;
    let weightDiff = 0;
    for (const [k, w] of aKeys) {
      if (bKeys.has(k)) {
        shared++;
        weightDiff += Math.abs(w - bKeys.get(k));
      }
    }
    const disjoint = aKeys.size + bKeys.size - 2 * shared;
    const maxN = Math.max(aKeys.size, bKeys.size, 1);
    const topo = disjoint / maxN; // 0 (identical) .. 1 (no overlap)
    const wd = shared > 0 ? weightDiff / shared : 0;
    let bodyDiff = 0;
    for (let i = 0; i < this.body.length; i++) bodyDiff += Math.abs(this.body[i] - other.body[i]);
    bodyDiff /= this.body.length;
    // Weighted blend, kept on a scale comparable to the fixed-genome distance so
    // the same speciation threshold behaves sensibly.
    return 0.6 * topo + 0.25 * clamp(wd / 4, 0, 1) + 0.15 * bodyDiff;
  }

  /** Serialize to a plain object for save/load (tagged so it can be restored). */
  toData() {
    return {
      k: "neat",
      nodes: this.nodes.slice(),
      conns: this.conns.map((c) => [c.from, c.to, c.w, c.on ? 1 : 0]),
      body: this.body.slice(),
    };
  }

  static fromData(d) {
    return new NeatGenome({
      nodes: d.nodes.slice(),
      conns: d.conns.map(([from, to, w, on]) => ({ from, to, w, on: !!on })),
      body: d.body.slice(),
    });
  }

  /** Number of enabled connections and hidden nodes — for stats/inspector. */
  get complexity() {
    let enabled = 0;
    for (const c of this.conns) if (c.on) enabled++;
    return { nodes: this.nodes.length, conns: enabled };
  }
}

/**
 * Executable NEAT network. Holds a value per node and propagates enabled
 * connections a bounded number of times so signals can traverse hidden chains.
 * tanh on hidden and output nodes; inputs pass through.
 */
class NeatNetwork {
  constructor(genome) {
    this.genome = genome;
    this.nIn = N_IN;
    this.nOut = N_OUT;
    // Stable index for every node id so we can use a flat value array.
    this.ids = [];
    for (let i = 0; i < N_IN; i++) this.ids.push(i);
    for (let o = 0; o < N_OUT; o++) this.ids.push(N_IN + o);
    for (const h of genome.nodes) this.ids.push(h);
    this.index = new Map(this.ids.map((id, i) => [id, i]));
    this.values = new Float32Array(this.ids.length);
    // Precompute enabled connections as index triples.
    this.links = [];
    for (const c of genome.conns) {
      if (!c.on) continue;
      const fi = this.index.get(c.from);
      const ti = this.index.get(c.to);
      if (fi === undefined || ti === undefined) continue;
      this.links.push([fi, ti, c.w]);
    }
    this.outStart = N_IN; // output node indices are [N_IN, N_IN+N_OUT)
    this.hiddenStart = N_IN + N_OUT;
    this._out = new Float32Array(N_OUT);
    // A few propagation passes: enough for the shallow graphs we evolve.
    this.passes = 3;
  }

  /**
   * @param {ArrayLike<number>} inputs length N_IN
   * @returns {Float32Array} outputs length N_OUT (reused buffer)
   */
  forward(inputs) {
    const v = this.values;
    // Load inputs; zero everything else before propagating.
    for (let i = 0; i < N_IN; i++) v[i] = inputs[i];
    for (let i = N_IN; i < v.length; i++) v[i] = 0;

    // Propagate. Each pass accumulates contributions along links, then squashes
    // hidden/output nodes. Repeating lets signals cross multi-hop paths.
    for (let p = 0; p < this.passes; p++) {
      // Accumulator so a node's own value isn't consumed mid-pass.
      const acc = new Float32Array(v.length);
      for (let l = 0; l < this.links.length; l++) {
        const [fi, ti, w] = this.links[l];
        acc[ti] += v[fi] * w;
      }
      // Inputs stay fixed; hidden + output nodes squash their accumulated sum.
      for (let i = N_IN; i < v.length; i++) v[i] = tanh(acc[i]);
    }

    for (let o = 0; o < N_OUT; o++) this._out[o] = v[this.outStart + o];
    return this._out;
  }
}
