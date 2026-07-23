import { test } from "node:test";
import assert from "node:assert/strict";
import { NeatGenome, NEAT_IO } from "../src/neat.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";

const CFG = makeConfig({ evolvableTopology: true });

test("a random NEAT genome starts minimal: no hidden nodes, some connections", () => {
  const g = NeatGenome.random(new RNG(1));
  assert.equal(g.nodes.length, 0, "founders should have no hidden neurons");
  assert.ok(g.conns.length > 0 && g.conns.length <= NEAT_IO.outputs * 4);
  // Body-gene surface must match the fixed genome so Creature works unchanged.
  for (const gene of ["sizeGene", "metabolismGene", "hueGene", "dietGene"]) {
    assert.ok(g[gene] >= 0 && g[gene] < 1, `${gene} out of range`);
  }
});

test("the network produces three finite outputs in (-1, 1)", () => {
  const g = NeatGenome.random(new RNG(2));
  const net = g.buildBrain();
  const out = net.forward(new Array(NEAT_IO.inputs).fill(0.5));
  assert.equal(out.length, NEAT_IO.outputs);
  for (const o of out) {
    assert.ok(Number.isFinite(o), "output must be finite");
    assert.ok(o > -1 && o < 1, "tanh output in range");
  }
});

test("add-node mutation splices a neuron and preserves connectivity", () => {
  let g = NeatGenome.random(new RNG(3));
  // Force node-adds by cranking the rate.
  const cfg = { ...CFG, neatAddNode: 1, neatAddConn: 0, neatWeightRate: 0 };
  const before = g.nodes.length;
  g = g.mutateForConfig(new RNG(4), cfg);
  assert.equal(g.nodes.length, before + 1, "one hidden node should be added");
  // The spliced node has an incoming and an outgoing connection.
  const h = g.nodes[g.nodes.length - 1];
  assert.ok(g.conns.some((c) => c.to === h && c.on), "node has an input link");
  assert.ok(g.conns.some((c) => c.from === h && c.on), "node has an output link");
});

test("add-connection mutation adds a link without duplicating", () => {
  let g = NeatGenome.random(new RNG(5));
  const cfg = { ...CFG, neatAddNode: 0, neatAddConn: 1, neatWeightRate: 0 };
  const before = g.conns.length;
  g = g.mutateForConfig(new RNG(6), cfg);
  assert.ok(g.conns.length >= before, "connections should not decrease");
  // No duplicate (from,to) pairs.
  const keys = new Set();
  for (const c of g.conns) {
    const k = c.from + ">" + c.to;
    assert.ok(!keys.has(k), "no duplicate connection");
    keys.add(k);
  }
});

test("distance is zero to a clone and positive to a mutated descendant", () => {
  const g = NeatGenome.random(new RNG(7));
  assert.equal(g.distance(g.clone()), 0);
  const cfg = { ...CFG, neatAddNode: 1, neatAddConn: 1 };
  const child = g.mutateForConfig(new RNG(8), cfg);
  assert.ok(g.distance(child) > 0, "a structurally different genome is farther");
});

test("serialization round-trips a NEAT genome", () => {
  let g = NeatGenome.random(new RNG(9));
  for (let i = 0; i < 5; i++) g = g.mutateForConfig(new RNG(i), { ...CFG, neatAddNode: 0.5 });
  const restored = NeatGenome.fromData(g.toData());
  assert.equal(restored.distance(g), 0, "restored genome should equal the original");
  assert.equal(restored.toData().k, "neat");
});

test("a NEAT world runs, survives, and evolves structure", () => {
  const world = new World(makeConfig({ seed: 42, evolvableTopology: true }));
  for (let i = 0; i < 5000; i++) world.step();
  assert.ok(world.creatures.length > 0, "NEAT world should not die out");
  let maxHidden = 0;
  for (const c of world.creatures) {
    for (const o of c.brain.forward(new Array(16).fill(0.1))) assert.ok(Number.isFinite(o));
    maxHidden = Math.max(maxHidden, c.genome.complexity.nodes);
  }
  assert.ok(maxHidden >= 1, "some lineage should have grown a hidden neuron");
});

test("NEAT worlds are deterministic for a fixed seed", () => {
  const a = new World(makeConfig({ seed: 314, evolvableTopology: true }));
  const b = new World(makeConfig({ seed: 314, evolvableTopology: true }));
  for (let i = 0; i < 2000; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.creatures.length, b.creatures.length);
  assert.equal(a.stats.births, b.stats.births);
  assert.equal(a.stats.avgConns.toFixed(4), b.stats.avgConns.toFixed(4));
});
