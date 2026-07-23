import { test } from "node:test";
import assert from "node:assert/strict";
import { NeuralNet } from "../src/nn.js";
import { Genome, genomeLength, BRAIN } from "../src/genome.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";

const WLEN = NeuralNet.weightCount(BRAIN.inputs, BRAIN.hidden, BRAIN.outputs);

test("genome layout is weights + plasticity + body", () => {
  assert.equal(genomeLength(), 2 * WLEN + 4);
  const g = Genome.random(new RNG(1));
  assert.equal(g.brainWeights.length, WLEN);
  assert.equal(g.plasticityGenes.length, WLEN);
});

test("random genomes start with zero plasticity (learning must evolve)", () => {
  const g = Genome.random(new RNG(2));
  for (const p of g.plasticityGenes) assert.equal(p, 0);
});

test("a static brain never changes its weights across forward passes", () => {
  const g = Genome.random(new RNG(3));
  const brain = g.buildBrain(null); // no learning
  assert.equal(brain.plastic, false);
  const before = Float32Array.from(brain.w);
  for (let i = 0; i < 50; i++) brain.forward([1, -1, 0.5, 0.2, -0.3, 0, 0.9, -0.5, 0.1, 0.7, -0.2, 0.4, 0.6, -0.8, 0.3, -0.1]);
  assert.deepEqual(Array.from(brain.w), Array.from(before));
});

test("a plastic brain adapts its weights but a decay keeps them bounded", () => {
  // Force strong plasticity so the effect is unmistakable.
  const g = Genome.random(new RNG(4));
  g.plasticityGenes.fill(1);
  const learn = { rate: 0.05, decay: 0.02, clamp: 8 };
  const brain = g.buildBrain(learn);
  assert.equal(brain.plastic, true);
  const init = Float32Array.from(brain.w);
  const inputs = [1, 0.8, -0.6, 0.4, 0.9, -0.2, 0.5, 0.3, -0.7, 0.6, 0.1, -0.4, 0.2, 0.8, -0.5, 0.3];
  for (let i = 0; i < 500; i++) brain.forward(inputs);
  let changed = 0;
  for (let k = 0; k < brain.w.length; k++) {
    if (Math.abs(brain.w[k] - init[k]) > 1e-4) changed++;
    assert.ok(Math.abs(brain.w[k]) <= learn.clamp + 1e-6, "weight exceeded clamp");
    assert.ok(Number.isFinite(brain.w[k]), "weight went NaN/Inf");
  }
  assert.ok(changed > 0, "a plastic brain should have adapted some weights");
});

test("plasticity mutation only fires when explicitly enabled", () => {
  const g = Genome.random(new RNG(5));
  // Without the flag, plasticity genes stay exactly zero no matter the rate.
  let child = g;
  for (let i = 0; i < 50; i++) child = child.mutate(new RNG(i), 1.0, 0.3, false);
  for (const p of child.plasticityGenes) assert.equal(p, 0);
  // With the flag, they start to diverge from zero.
  let plastic = g.mutate(new RNG(9), 1.0, 0.3, true);
  let anyNonZero = false;
  for (const p of plastic.plasticityGenes) if (p !== 0) anyNonZero = true;
  assert.ok(anyNonZero, "enabling plasticity mutation should perturb the genes");
});

test("genetic distance ignores plasticity genes", () => {
  const a = Genome.random(new RNG(6));
  const b = a.clone();
  // Change only b's plasticity genes.
  b.plasticityGenes.fill(0.5);
  assert.equal(a.distance(b), 0, "distance must not see plasticity differences");
});

test("a world with plasticity enabled stays stable and bounded", () => {
  const world = new World(makeConfig({ seed: 42, plasticity: true }));
  for (let i = 0; i < 4000; i++) world.step();
  assert.ok(world.creatures.length > 0, "plastic world should not die out");
  for (const c of world.creatures) {
    assert.ok(c.brain.plastic, "brains should be plastic when enabled");
    for (const wv of c.brain.w) assert.ok(Number.isFinite(wv), "no NaN weights");
  }
  assert.ok(world.stats.avgLearning >= 0, "learning stat should be tracked");
});

test("plasticity worlds are deterministic for a fixed seed", () => {
  const a = new World(makeConfig({ seed: 5, plasticity: true }));
  const b = new World(makeConfig({ seed: 5, plasticity: true }));
  for (let i = 0; i < 1500; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.creatures.length, b.creatures.length);
  assert.equal(a.stats.births, b.stats.births);
});
