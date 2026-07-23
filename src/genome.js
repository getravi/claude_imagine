// genome.js — a creature's heritable material.
//
// A genome is a flat Float32Array laid out as:
//   [ brain weights : WLEN ][ plasticity coeffs : WLEN ][ body genes : 4 ]
// The brain weights are the innate wiring; the plasticity coeffs say how much
// each connection is allowed to *learn* within a lifetime (used only when the
// plasticity feature is on — see nn.js); the body genes are size, metabolism,
// hue, and diet. Reproduction copies the genome and perturbs it; selection is
// implicit (bad brains starve). There is no explicit fitness function anywhere
// in Vivarium — fitness is simply "did you gather enough energy to reproduce
// before you died?"
//
// Design note (why the layout is what it is): plasticity genes were added in
// v1.4, but they are engineered to cost ZERO random-number draws and ZERO
// genetic-distance change when the plasticity feature is off. That keeps every
// pre-v1.4 world bit-for-bit identical by default — the plasticity genes are
// simply along for the ride (all zero, never mutated, ignored by `distance`)
// until you switch lifetime learning on.

import { NeuralNet } from "./nn.js";
import { clamp } from "./vec.js";

// Brain topology. Kept in one place so genome, creature, and UI agree.
export const BRAIN = Object.freeze({
  inputs: 16, // see creature.js sense() for the exact list
  hidden: 12,
  outputs: 3, // turn, thrust, and a "colour signal" the creature can flash
});

// Number of weights in one brain, and the number of trailing body genes.
const WLEN = NeuralNet.weightCount(BRAIN.inputs, BRAIN.hidden, BRAIN.outputs);
const BODY_GENES = 4; // [sizeGene, metabolismGene, hueGene, dietGene]

export function genomeLength() {
  return 2 * WLEN + BODY_GENES; // weights + plasticity + body
}

export class Genome {
  /** @param {Float32Array} data */
  constructor(data) {
    this.data = data;
  }

  /**
   * A fresh random genome. Weights ~ N(0, 1); plasticity starts at exactly zero
   * (so brains begin fully innate and learning must be *evolved*); body genes in
   * [0, 1). Note the draw order — WLEN gaussians then 4 floats, with the zero
   * plasticity block consuming no draws — is identical to pre-v1.4, so seeds
   * reproduce the same worlds when plasticity is off.
   */
  static random(rng) {
    const data = new Float32Array(genomeLength());
    for (let i = 0; i < WLEN; i++) data[i] = rng.gaussian(0, 1); // weights
    // plasticity block [WLEN, 2*WLEN) left at 0 — no draws
    for (let i = 2 * WLEN; i < data.length; i++) data[i] = rng.float(); // body
    return new Genome(data);
  }

  get brainWeights() {
    return this.data.subarray(0, WLEN);
  }
  get plasticityGenes() {
    return this.data.subarray(WLEN, 2 * WLEN);
  }

  // Body genes, mapped from raw storage to meaningful ranges. Always the last
  // BODY_GENES slots of the vector, in this fixed order.
  get sizeGene() {
    return this.data[this.data.length - 4];
  }
  get metabolismGene() {
    return this.data[this.data.length - 3];
  }
  get hueGene() {
    return this.data[this.data.length - 2];
  }
  // Diet: 0 = pure herbivore (lives on plants), 1 = pure carnivore (lives on
  // meat), values between are omnivores. This single gene, under selection,
  // is what lets predators and prey differentiate from a common ancestor.
  get dietGene() {
    return this.data[this.data.length - 1];
  }

  /**
   * Build the neural net this genome encodes.
   * @param {{rate:number, decay:number, clamp:number}|null} [learn] when given,
   *   the brain is plastic (learns within its lifetime); otherwise it's static.
   */
  buildBrain(learn = null) {
    // Float32Array copies so the net never mutates the stored genome.
    const weights = Float32Array.from(this.brainWeights);
    if (learn) {
      return new NeuralNet(
        BRAIN.inputs,
        BRAIN.hidden,
        BRAIN.outputs,
        weights,
        Float32Array.from(this.plasticityGenes),
        learn
      );
    }
    return new NeuralNet(BRAIN.inputs, BRAIN.hidden, BRAIN.outputs, weights);
  }

  /**
   * Produce a mutated copy (asexual reproduction).
   * Two-scale mutation: most genes get a small nudge, a few occasionally take a
   * big jump. Small nudges refine working behaviour; rare big jumps let a lineage
   * escape a local optimum.
   *
   * Draw order is weights → body → (plasticity only if `mutatePlasticity`). With
   * plasticity off, the plasticity block is skipped entirely, so the random
   * draws exactly match pre-v1.4 and worlds are preserved.
   * @param {import('./rng.js').RNG} rng
   * @param {number} rate per-gene probability of a mutation event
   * @param {number} strength stdev of the small nudge
   * @param {boolean} mutatePlasticity also mutate the plasticity genes
   */
  mutate(rng, rate = 0.08, strength = 0.15, mutatePlasticity = false) {
    const data = Float32Array.from(this.data);
    const nudge = (i) => {
      if (rng.chance(rate)) {
        if (rng.chance(0.1)) data[i] += rng.gaussian(0, strength * 6); // rare big jump
        else data[i] += rng.gaussian(0, strength); // usual small nudge
      }
    };
    // Brain weights.
    for (let i = 0; i < WLEN; i++) nudge(i);
    // Body genes drift more gently and stay in [0, 1].
    for (let i = 2 * WLEN; i < data.length; i++) {
      if (rng.chance(rate)) data[i] = clamp(data[i] + rng.gaussian(0, 0.05), 0, 1);
    }
    // Plasticity genes — only touched when lifetime learning is enabled, so the
    // draw sequence above is unchanged when it isn't.
    if (mutatePlasticity) {
      for (let i = WLEN; i < 2 * WLEN; i++) nudge(i);
    }
    return new Genome(data);
  }

  /**
   * Uniform crossover of two genomes (sexual reproduction, optional in the sim).
   * Each gene is taken from one parent or the other with equal probability.
   */
  static crossover(a, b, rng) {
    const len = a.data.length;
    const data = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      data[i] = rng.chance(0.5) ? a.data[i] : b.data[i];
    }
    return new Genome(data);
  }

  /**
   * Genetic distance to another genome: mean absolute difference over the brain
   * weights and body genes. Plasticity genes are deliberately excluded, so a
   * species is defined by its innate wiring and body, and so distance is
   * identical to pre-v1.4 when plasticity is off.
   */
  distance(other) {
    const a = this.data;
    const b = other.data;
    let sum = 0;
    for (let i = 0; i < WLEN; i++) sum += Math.abs(a[i] - b[i]); // weights
    const len = a.length;
    for (let i = 2 * WLEN; i < len; i++) sum += Math.abs(a[i] - b[i]); // body
    return sum / (WLEN + BODY_GENES);
  }

  clone() {
    return new Genome(Float32Array.from(this.data));
  }
}
