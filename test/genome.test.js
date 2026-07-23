import { test } from "node:test";
import assert from "node:assert/strict";
import { Genome, genomeLength, BRAIN } from "../src/genome.js";
import { NeuralNet } from "../src/nn.js";
import { RNG } from "../src/rng.js";

test("genome length = brain weights + plasticity + body genes", () => {
  const brain = NeuralNet.weightCount(BRAIN.inputs, BRAIN.hidden, BRAIN.outputs);
  // As of v1.4 the genome carries a parallel plasticity vector (same length as
  // the weights) plus four body genes: size, metabolism, hue, diet.
  assert.equal(genomeLength(), 2 * brain + 4);
});

test("random genome has the right length and body genes in [0,1)", () => {
  const rng = new RNG(1);
  const g = Genome.random(rng);
  assert.equal(g.data.length, genomeLength());
  assert.ok(g.sizeGene >= 0 && g.sizeGene < 1);
  assert.ok(g.metabolismGene >= 0 && g.metabolismGene < 1);
  assert.ok(g.hueGene >= 0 && g.hueGene < 1);
  assert.ok(g.dietGene >= 0 && g.dietGene < 1);
});

test("body genes are distinct storage slots (no aliasing)", () => {
  // A crafted genome with known trailing values decodes each body gene from
  // its own slot, in the documented order: size, metabolism, hue, diet.
  const data = new Float32Array(genomeLength());
  data[data.length - 4] = 0.11; // size
  data[data.length - 3] = 0.22; // metabolism
  data[data.length - 2] = 0.33; // hue
  data[data.length - 1] = 0.44; // diet
  const g = new Genome(data);
  assert.ok(Math.abs(g.sizeGene - 0.11) < 1e-6);
  assert.ok(Math.abs(g.metabolismGene - 0.22) < 1e-6);
  assert.ok(Math.abs(g.hueGene - 0.33) < 1e-6);
  assert.ok(Math.abs(g.dietGene - 0.44) < 1e-6);
});

test("buildBrain yields a net of the declared topology", () => {
  const rng = new RNG(2);
  const g = Genome.random(rng);
  const net = g.buildBrain();
  assert.equal(net.nIn, BRAIN.inputs);
  assert.equal(net.nHidden, BRAIN.hidden);
  assert.equal(net.nOut, BRAIN.outputs);
});

test("buildBrain does not alias the stored genome", () => {
  const rng = new RNG(3);
  const g = Genome.random(rng);
  const net = g.buildBrain();
  net.w[0] = 999; // mutate the net's copy
  assert.notEqual(g.data[0], 999, "genome must be independent of its brain net");
});

test("mutation preserves length and (usually) changes something", () => {
  const rng = new RNG(4);
  const g = Genome.random(rng);
  const child = g.mutate(rng, 0.9, 0.3); // high rate to force changes
  assert.equal(child.data.length, g.data.length);
  let changed = 0;
  for (let i = 0; i < g.data.length; i++) {
    if (g.data[i] !== child.data[i]) changed++;
  }
  assert.ok(changed > 0, "a high mutation rate should alter genes");
});

test("mutation does not modify the parent in place", () => {
  const rng = new RNG(5);
  const g = Genome.random(rng);
  const before = Float32Array.from(g.data);
  g.mutate(rng, 0.9, 0.3);
  assert.deepEqual(Array.from(g.data), Array.from(before));
});

test("body genes stay within [0, 1] after mutation", () => {
  const rng = new RNG(6);
  let g = Genome.random(rng);
  for (let i = 0; i < 200; i++) g = g.mutate(rng, 1.0, 0.5);
  assert.ok(g.sizeGene >= 0 && g.sizeGene <= 1);
  assert.ok(g.metabolismGene >= 0 && g.metabolismGene <= 1);
  assert.ok(g.hueGene >= 0 && g.hueGene <= 1);
  assert.ok(g.dietGene >= 0 && g.dietGene <= 1);
});

test("crossover takes each gene from one of the two parents", () => {
  const rng = new RNG(7);
  const a = Genome.random(rng);
  const b = Genome.random(rng);
  const child = Genome.crossover(a, b, rng);
  assert.equal(child.data.length, a.data.length);
  for (let i = 0; i < child.data.length; i++) {
    assert.ok(
      child.data[i] === a.data[i] || child.data[i] === b.data[i],
      `gene ${i} came from neither parent`
    );
  }
});

test("distance is zero to self and positive to a random other", () => {
  const rng = new RNG(8);
  const a = Genome.random(rng);
  const b = Genome.random(rng);
  assert.equal(a.distance(a), 0);
  assert.ok(a.distance(b) > 0);
});
