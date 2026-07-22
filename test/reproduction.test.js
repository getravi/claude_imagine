import { test } from "node:test";
import assert from "node:assert/strict";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";
import { World } from "../src/world.js";

function uniformGenome(value) {
  const g = Genome.random(new RNG(1));
  g.data.fill(value);
  return g;
}

test("asexual reproduction yields a mutated child one generation deeper", () => {
  const cfg = makeConfig();
  const rng = new RNG(7);
  const parent = new Creature(Genome.random(rng), cfg, 0, 0, rng, 4);
  parent.energy = cfg.reproduceThreshold;
  const child = parent.reproduce(rng);
  assert.equal(child.generation, 5);
  assert.ok(parent.energy < cfg.reproduceThreshold, "parent pays an energy cost");
  assert.ok(child.energy > 0, "child starts with the transferred energy");
});

test("sexual reproduction takes each gene from one of the two parents", () => {
  // With mutation switched off, a crossover child is exactly a mosaic of its
  // parents — every gene must match one parent or the other.
  const cfg = makeConfig({ mutationRate: 0, mutationStrength: 0 });
  const rng = new RNG(8);
  const parentGenomeA = uniformGenome(0.2);
  const parentGenomeB = uniformGenome(0.8);
  const parentA = new Creature(parentGenomeA, cfg, 0, 0, rng, 0);
  parentA.energy = cfg.reproduceThreshold;

  const child = parentA.reproduce(rng, parentGenomeB);
  for (let i = 0; i < child.genome.data.length; i++) {
    const v = child.genome.data[i];
    assert.ok(
      Math.abs(v - 0.2) < 1e-6 || Math.abs(v - 0.8) < 1e-6,
      `gene ${i} = ${v} came from neither parent`
    );
  }
});

test("sexual reproduction actually mixes (not a pure clone of one parent)", () => {
  const cfg = makeConfig({ mutationRate: 0, mutationStrength: 0 });
  const rng = new RNG(9);
  const a = uniformGenome(0.2);
  const b = uniformGenome(0.8);
  const parentA = new Creature(a, cfg, 0, 0, rng, 0);
  const child = parentA.reproduce(rng, b);
  let fromA = 0;
  let fromB = 0;
  for (const v of child.genome.data) {
    if (Math.abs(v - 0.2) < 1e-6) fromA++;
    else fromB++;
  }
  assert.ok(fromA > 0 && fromB > 0, "child should inherit from both parents");
});

test("enabling sexual reproduction keeps the world stable and deterministic", () => {
  const a = new World(makeConfig({ seed: 123, sexualReproduction: true }));
  const b = new World(makeConfig({ seed: 123, sexualReproduction: true }));
  for (let i = 0; i < 1500; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.creatures.length, b.creatures.length, "same seed ⇒ same population");
  assert.ok(a.creatures.length > 0, "sexual world should not die out");
});
