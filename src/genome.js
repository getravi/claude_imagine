// genome.js — a creature's heritable material.
//
// A genome is a flat Float32Array laid out as:
//   [ brain weights : WLEN ][ plasticity coeffs : WLEN ][ ear : 12 ][ foot : 12 ][ body : 4 ]
// The brain weights are the innate wiring; the plasticity coeffs say how much
// each connection is allowed to *learn* within a lifetime (used only when the
// plasticity feature is on — see nn.js); the ear is one weight per hidden neuron
// carrying the signal a creature hears from its neighbours (used only when the
// signalling feature is on); the foot is one weight per hidden neuron carrying
// the roughness of the ground underfoot (used only when the ground sense is on);
// the body genes are size, metabolism,
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
// until you switch lifetime learning on. The ear genes (v1.20) and the foot
// genes (v1.33) ride along the same way: every function that draws randomness
// here takes a flag saying whether that block is live, and skips it entirely
// when it isn't, so the draw sequence for a default world is exactly what it
// was in v1.0.

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
// The ear: one weight from "the loudest voice I can hear" into each hidden
// neuron. It lives outside the brain's weight vector so WLEN — and with it the
// draw order of every genome ever generated — is exactly what it was.
const EAR_GENES = BRAIN.hidden;
// The foot: one weight from "how rough is the ground I am standing on" into
// each hidden neuron. Same trick as the ear, for the same reason.
const FOOT_GENES = BRAIN.hidden;
// The whisker: one weight from "how close is the rock straight ahead" into each
// hidden neuron. Third of the same trick, and the third block to go on the end
// of the aux region rather than into the brain's vector.
const WHISKER_GENES = BRAIN.hidden;
const BODY_GENES = 4; // [sizeGene, metabolismGene, hueGene, dietGene]

export function genomeLength() {
  return 2 * WLEN + EAR_GENES + FOOT_GENES + WHISKER_GENES + BODY_GENES;
}

// Where the auxiliary sense blocks start and end. Body genes are always
// addressed from the end of the vector, so appending a sense here moves nothing
// that mattered — and each new one goes on the end of the aux region, so an
// older layout is always a prefix of a newer one.
const EAR_START = 2 * WLEN;
const EAR_END = EAR_START + EAR_GENES;
const FOOT_START = EAR_END;
const FOOT_END = FOOT_START + FOOT_GENES;
const WHISKER_START = FOOT_END;
const WHISKER_END = WHISKER_START + WHISKER_GENES;
const AUX_END = WHISKER_END;

/**
 * Bring a genome vector saved by an older version up to the current layout.
 * Pre-v1.20 saves end `[...plasticity][body 4]` with no aux senses between them,
 * pre-v1.33 saves have an ear but no foot, and pre-v1.102 saves have both but no
 * whisker. In every case the body genes are
 * lifted to the new end of the vector and whatever aux blocks the save is
 * missing are left silent (all zero) — which is exactly what a creature that
 * has never had that sense should inherit. The senses being laid out in the
 * order they were invented is what makes this a single copy: everything the old
 * vector has before its body genes is still in the right place.
 */
export function migrateGenomeData(src) {
  const want = genomeLength();
  if (src.length === want) return src;
  const out = new Float32Array(want);
  const head = Math.max(0, Math.min(src.length - BODY_GENES, AUX_END));
  out.set(src.subarray(0, head), 0);
  if (src.length >= BODY_GENES) {
    out.set(src.subarray(src.length - BODY_GENES), want - BODY_GENES);
  }
  return out;
}

/**
 * The aux sense blocks, in genome order, as data.
 *
 * Two senses could be written out by hand; three is where the hand-written form
 * starts costing a combinatorial case per sense, and v1.20's and v1.33's
 * pairwise version had exactly the shape this project keeps finding stale (see
 * `AUX_ORDER`'s two readers below — `auxWeightsFor` here and `Creature.think`
 * — which must walk the same flags in the same order or the brain is wired to
 * the wrong channel). One list, three readers, and the order is stated once.
 *
 * @type {ReadonlyArray<{name: string, from: number, to: number, flag: string}>}
 */
export const AUX_ORDER = Object.freeze([
  { name: "ear", from: EAR_START, to: EAR_END, flag: "signalling" },
  { name: "foot", from: FOOT_START, to: FOOT_END, flag: "groundSense" },
  { name: "whisker", from: WHISKER_START, to: WHISKER_END, flag: "wallSense" },
]);

/**
 * The auxiliary weight block a brain gets: the enabled sense blocks
 * concatenated in genome order (ear, then foot, then whisker). Null when no aux
 * sense is on, which is the case the forward pass is optimised — and pinned —
 * for.
 * @param {Genome} genome
 * @param {boolean[]} live one flag per entry of `AUX_ORDER`, in that order
 */
function auxWeightsFor(genome, live) {
  let n = 0;
  for (let i = 0; i < AUX_ORDER.length; i++) if (live[i]) n += AUX_ORDER[i].to - AUX_ORDER[i].from;
  if (n === 0) return null;
  const out = new Float32Array(n);
  let at = 0;
  for (let i = 0; i < AUX_ORDER.length; i++) {
    if (!live[i]) continue;
    const b = AUX_ORDER[i];
    out.set(genome.data.subarray(b.from, b.to), at);
    at += b.to - b.from;
  }
  return out;
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
   *
   * Founders are born with a *random* ear rather than a deaf one when signalling
   * is on: unlike plasticity, which is interesting precisely because the capacity
   * to learn has to appear from nothing, a channel with no listeners at all has
   * nothing for selection to grade, so the pond would simply stay silent.
   * The foot is drawn on the same terms and for the same reason: a sense whose
   * every weight starts at zero is a sense the world cannot select on, because
   * a founder that cannot feel the ground has no variation for selection to
   * grade.
   * @param {import('./rng.js').RNG} rng
   * @param {boolean} [withEar] draw the ear genes too (signalling worlds only)
   * @param {boolean} [withFoot] draw the foot genes too (ground-sense worlds only)
   * @param {boolean} [withWhisker] draw the whisker genes too (wall-sense worlds
   *   only). Last in the order, so a world that leaves it off draws exactly what
   *   it drew before the block existed.
   */
  static random(rng, withEar = false, withFoot = false, withWhisker = false) {
    const data = new Float32Array(genomeLength());
    for (let i = 0; i < WLEN; i++) data[i] = rng.gaussian(0, 1); // weights
    // plasticity block [WLEN, 2*WLEN) left at 0 — no draws
    const live = [withEar, withFoot, withWhisker];
    for (let b = 0; b < AUX_ORDER.length; b++) {
      if (!live[b]) continue;
      for (let i = AUX_ORDER[b].from; i < AUX_ORDER[b].to; i++) data[i] = rng.gaussian(0, 1);
    }
    for (let i = data.length - BODY_GENES; i < data.length; i++) data[i] = rng.float();
    return new Genome(data);
  }

  get brainWeights() {
    return this.data.subarray(0, WLEN);
  }
  get plasticityGenes() {
    return this.data.subarray(WLEN, 2 * WLEN);
  }
  /** One weight per hidden neuron for the heard-signal sense (see nn.js#auxW). */
  get earGenes() {
    return this.data.subarray(EAR_START, EAR_END);
  }
  /** One weight per hidden neuron for the ground-underfoot sense. */
  get footGenes() {
    return this.data.subarray(FOOT_START, FOOT_END);
  }
  /** One weight per hidden neuron for the rock-ahead sense (see barriers.js). */
  get whiskerGenes() {
    return this.data.subarray(WHISKER_START, WHISKER_END);
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
   * @param {boolean} [ear] wire in the heard-signal sense (signalling worlds).
   *   When false the net is built without it and behaves exactly as before.
   * @param {boolean} [foot] wire in the ground-underfoot sense.
   * @param {boolean} [whisker] wire in the rock-ahead sense.
   */
  buildBrain(learn = null, ear = false, foot = false, whisker = false) {
    // Float32Array copies so the net never mutates the stored genome.
    const weights = Float32Array.from(this.brainWeights);
    // The aux channels the brain gets are whichever senses are switched on, in
    // the order they are laid out in the genome. Creature.think() fills its aux
    // vector by walking the same flags in the same order.
    const auxW = auxWeightsFor(this, [ear, foot, whisker]);
    if (learn) {
      return new NeuralNet(
        BRAIN.inputs,
        BRAIN.hidden,
        BRAIN.outputs,
        weights,
        Float32Array.from(this.plasticityGenes),
        learn,
        auxW
      );
    }
    return new NeuralNet(BRAIN.inputs, BRAIN.hidden, BRAIN.outputs, weights, null, null, auxW);
  }

  /**
   * Produce a mutated copy (asexual reproduction).
   * Two-scale mutation: most genes get a small nudge, a few occasionally take a
   * big jump. Small nudges refine working behaviour; rare big jumps let a lineage
   * escape a local optimum.
   *
   * Draw order is weights → body → (plasticity only if `mutatePlasticity`) →
   * then the aux blocks in `AUX_ORDER`, each only if its world switched it on.
   * With those features off, every one of those blocks is skipped entirely, so
   * the random draws exactly match pre-v1.4 and worlds are preserved.
   * @param {import('./rng.js').RNG} rng
   * @param {number} rate per-gene probability of a mutation event
   * @param {number} strength stdev of the small nudge
   * @param {boolean} mutatePlasticity also mutate the plasticity genes
   * @param {boolean} mutateEar also mutate the ear genes
   * @param {boolean} mutateFoot also mutate the foot genes
   * @param {boolean} mutateWhisker also mutate the whisker genes
   */
  mutate(
    rng,
    rate = 0.08,
    strength = 0.15,
    mutatePlasticity = false,
    mutateEar = false,
    mutateFoot = false,
    mutateWhisker = false
  ) {
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
    for (let i = data.length - BODY_GENES; i < data.length; i++) {
      if (rng.chance(rate)) data[i] = clamp(data[i] + rng.gaussian(0, 0.05), 0, 1);
    }
    // Plasticity genes — only touched when lifetime learning is enabled, so the
    // draw sequence above is unchanged when it isn't.
    if (mutatePlasticity) {
      for (let i = WLEN; i < 2 * WLEN; i++) nudge(i);
    }
    // The aux senses — likewise, only when the world has switched each on, and
    // in genome order after every block above, so that turning any one of them
    // on cannot disturb a single draw belonging to the blocks before it.
    const live = [mutateEar, mutateFoot, mutateWhisker];
    for (let b = 0; b < AUX_ORDER.length; b++) {
      if (!live[b]) continue;
      for (let i = AUX_ORDER[b].from; i < AUX_ORDER[b].to; i++) nudge(i);
    }
    return new Genome(data);
  }

  /**
   * Config-driven mutation entry point, matching the surface NeatGenome also
   * exposes so Creature can reproduce without knowing which genome type it holds.
   */
  mutateForConfig(rng, config) {
    return this.mutate(
      rng,
      config.mutationRate,
      config.mutationStrength,
      config.plasticity,
      config.signalling,
      config.groundSense,
      config.wallSense
    );
  }

  /** Serialize for save/load (tagged so it can be restored alongside NEAT). */
  toData() {
    return { k: "fixed", d: Array.from(this.data) };
  }

  /**
   * Uniform crossover of two genomes (sexual reproduction, optional in the sim).
   * Each gene is taken from one parent or the other with equal probability.
   *
   * An aux block is only *shuffled* when its sense is on; otherwise it is
   * copied wholesale from the first parent and consumes no draws, because a coin
   * flipped per silent gene would shift the RNG stream for every sexual world
   * that predates that sense.
   * @param {boolean} [withEar] cross the ear genes too
   * @param {boolean} [withFoot] cross the foot genes too
   * @param {boolean} [withWhisker] cross the whisker genes too
   */
  static crossover(a, b, rng, withEar = false, withFoot = false, withWhisker = false) {
    const len = a.data.length;
    const data = new Float32Array(len);
    const pick = (i) => {
      data[i] = rng.chance(0.5) ? a.data[i] : b.data[i];
    };
    const live = [withEar, withFoot, withWhisker];
    for (let i = 0; i < EAR_START; i++) pick(i); // brain weights + plasticity
    for (let bi = 0; bi < AUX_ORDER.length; bi++) {
      const block = AUX_ORDER[bi];
      if (live[bi]) for (let i = block.from; i < block.to; i++) pick(i);
      else data.set(a.data.subarray(block.from, block.to), block.from);
    }
    for (let i = AUX_END; i < len; i++) pick(i); // body
    return new Genome(data);
  }

  /**
   * Genetic distance to another genome: mean absolute difference over the brain
   * weights and body genes. Plasticity and every aux sense block are deliberately excluded,
   * so a species is defined by its innate wiring and body — and so distance is
   * the same function it has always been, in every world, whichever of those two
   * features happens to be switched on. (Speciation thresholds, kin recognition
   * and the phylogeny all read this number; making it config-dependent would
   * quietly redraw the tree of life the moment you flipped a toggle.)
   */
  distance(other) {
    const a = this.data;
    const b = other.data;
    let sum = 0;
    for (let i = 0; i < WLEN; i++) sum += Math.abs(a[i] - b[i]); // weights
    const len = a.length;
    for (let i = len - BODY_GENES; i < len; i++) sum += Math.abs(a[i] - b[i]); // body
    return sum / (WLEN + BODY_GENES);
  }

  clone() {
    return new Genome(Float32Array.from(this.data));
  }
}
