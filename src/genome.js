// genome.js — a creature's heritable material.
//
// A genome is just a flat Float32Array of neural-network weights plus a handful
// of "body" genes (size, metabolism, hue, diet). Reproduction copies the genome
// and perturbs it; selection is implicit (bad brains starve). There is no
// explicit fitness function anywhere in Vivarium — that is the whole point.
// Fitness is simply "did you gather enough energy to reproduce before you died?"

import { NeuralNet } from "./nn.js";
import { clamp } from "./vec.js";

// Brain topology. Kept in one place so genome, creature, and UI agree.
// As of v1.1 the brain also senses prey and threats separately and knows its
// own diet and size, so it grew from 11 inputs to 16 and 10 hidden to 12.
export const BRAIN = Object.freeze({
  inputs: 16, // see creature.js sense() for the exact list
  hidden: 12,
  outputs: 3, // turn, thrust, and a "colour signal" the creature can flash
});

// Number of extra body genes appended after the brain weights.
const BODY_GENES = 4; // [sizeGene, metabolismGene, hueGene, dietGene]

export function genomeLength() {
  return NeuralNet.weightCount(BRAIN.inputs, BRAIN.hidden, BRAIN.outputs) + BODY_GENES;
}

export class Genome {
  /** @param {Float32Array} data */
  constructor(data) {
    this.data = data;
  }

  /** A fresh random genome. Weights ~ N(0, 1); body genes in [0, 1). */
  static random(rng) {
    const len = genomeLength();
    const data = new Float32Array(len);
    const brainLen = len - BODY_GENES;
    for (let i = 0; i < brainLen; i++) data[i] = rng.gaussian(0, 1);
    for (let i = brainLen; i < len; i++) data[i] = rng.float();
    return new Genome(data);
  }

  get brainWeights() {
    return this.data.subarray(0, this.data.length - BODY_GENES);
  }

  // Body genes, mapped from raw storage to meaningful ranges. Stored in the
  // last BODY_GENES slots of the vector, in this fixed order.
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

  /** Build the neural net this genome encodes. */
  buildBrain() {
    // Float32Array copy so the net never mutates the stored genome.
    return new NeuralNet(
      BRAIN.inputs,
      BRAIN.hidden,
      BRAIN.outputs,
      Float32Array.from(this.brainWeights)
    );
  }

  /**
   * Produce a mutated copy (asexual reproduction).
   * Two-scale mutation: most genes get a small nudge, a few occasionally take
   * a big jump. Small nudges refine working behaviour; rare big jumps let a
   * lineage escape a local optimum. This mirrors how real mutation combines
   * frequent tiny changes with rarer dramatic ones.
   * @param {RNG} rng
   * @param {number} rate - per-gene probability of a mutation event
   * @param {number} strength - stdev of the small nudge
   */
  mutate(rng, rate = 0.08, strength = 0.15) {
    const data = Float32Array.from(this.data);
    const brainLen = data.length - BODY_GENES;
    for (let i = 0; i < brainLen; i++) {
      if (rng.chance(rate)) {
        if (rng.chance(0.1)) {
          data[i] += rng.gaussian(0, strength * 6); // rare big jump
        } else {
          data[i] += rng.gaussian(0, strength); // usual small nudge
        }
      }
    }
    // Body genes drift more gently and stay in [0, 1].
    for (let i = brainLen; i < data.length; i++) {
      if (rng.chance(rate)) {
        data[i] = clamp(data[i] + rng.gaussian(0, 0.05), 0, 1);
      }
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
   * Genetic distance to another genome (mean absolute weight difference).
   * Used only for stats/visualisation — a rough proxy for "how related".
   */
  distance(other) {
    const a = this.data;
    const b = other.data;
    const n = Math.min(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
    return sum / n;
  }

  clone() {
    return new Genome(Float32Array.from(this.data));
  }
}
