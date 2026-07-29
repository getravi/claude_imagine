import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Creature, buildBrainFor, groundSway } from "../src/creature.js";
import { Genome, genomeLength, migrateGenomeData, BRAIN } from "../src/genome.js";
import { NeuralNet } from "../src/nn.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";
import { groundBias } from "../src/terrain.js";

const WLEN = NeuralNet.weightCount(BRAIN.inputs, BRAIN.hidden, BRAIN.outputs);

/** A creature standing alone in nothing, so only the ground can move its mind. */
function loneCreature(config, genome, ground = 1) {
  const c = new Creature(genome, config, 100, 100, new RNG(7));
  c.heading = 0;
  c.vx = 0;
  c.vy = 0;
  c.ground = ground;
  c.sense(null, Infinity, null, Infinity, null, Infinity);
  return c;
}

test("the ground sense is off by default, and nothing feels anything", () => {
  const world = new World(makeConfig({ seed: 5 }));
  assert.equal(world.config.groundSense, false);
  for (let i = 0; i < 200; i++) world.step();
  for (const c of world.creatures) {
    assert.equal(c.groundFeel, 0);
    assert.equal(c.brain.nAux, 0);
  }
});

test("with the sense off, a terrain world is bit-for-bit unaffected", () => {
  const withFlag = new World(makeConfig({ seed: 21, terrain: true, groundSense: false }));
  const withoutFlag = new World(makeConfig({ seed: 21, terrain: true }));
  for (let i = 0; i < 1500; i++) {
    withFlag.step();
    withoutFlag.step();
  }
  assert.equal(withFlag.creatures.length, withoutFlag.creatures.length);
  assert.equal(withFlag.food.items.length, withoutFlag.food.items.length);
  assert.equal(withFlag.stats.births, withoutFlag.stats.births);
  assert.equal(withFlag.stats.deaths, withoutFlag.stats.deaths);
  for (let i = 0; i < withFlag.creatures.length; i++) {
    const a = withFlag.creatures[i];
    const b = withoutFlag.creatures[i];
    assert.equal(a.x, b.x);
    assert.equal(a.y, b.y);
    assert.equal(a.energy, b.energy);
    assert.equal(a.heading, b.heading);
  }
  // The food array too: a feature that touches the world's other collection has
  // to be compared element-by-element there as well (the v1.18 lesson).
  for (let i = 0; i < withFlag.food.items.length; i++) {
    assert.equal(withFlag.food.items[i].x, withoutFlag.food.items[i].x);
    assert.equal(withFlag.food.items[i].y, withoutFlag.food.items[i].y);
  }
});

// The riskiest thing about an extra sense is that it lengthens the genome, and
// the genome is where the RNG stream lives. Every draw site gets its own check,
// exactly as the ear did in v1.20.
test("the foot costs no random draws while it is numb", () => {
  const a = new RNG(9);
  const b = new RNG(9);
  const numb = Genome.random(a);
  const shod = Genome.random(b, false, true);
  assert.equal(numb.data.length, shod.data.length);
  for (let i = 0; i < WLEN; i++) assert.equal(numb.data[i], shod.data[i]); // same brain
  for (const w of numb.footGenes) assert.equal(w, 0);
  assert.ok([...shod.footGenes].some((w) => w !== 0));
  assert.notEqual(numb.sizeGene, shod.sizeGene); // ...and only then diverge

  // Mutation: the silent block must not consume a coin flip either.
  const m1 = new RNG(3);
  const m2 = new RNG(3);
  const child = numb.mutate(m1, 0.09, 0.16, false, false, false);
  const control = new Genome(numb.data.slice()).mutate(m2, 0.09, 0.16, false, false);
  assert.deepEqual(Array.from(child.data), Array.from(control.data));
  assert.equal(m1.float(), m2.float());

  // Crossover: same story, per gene.
  const x1 = new RNG(4);
  const x2 = new RNG(4);
  const off = Genome.crossover(numb, control, x1, false, false);
  Genome.crossover(numb, control, x2, false);
  for (const w of off.footGenes) assert.equal(w, 0);
  assert.equal(x1.float(), x2.float());
});

test("mutation and crossover reach the foot only when the sense is on", () => {
  const parent = Genome.random(new RNG(11), false, true);
  const other = Genome.random(new RNG(12), false, true);

  const untouched = parent.mutate(new RNG(1), 1, 0.5, false, false, false);
  assert.deepEqual(Array.from(untouched.footGenes), Array.from(parent.footGenes));

  const shifted = parent.mutate(new RNG(1), 1, 0.5, false, false, true);
  assert.notDeepEqual(Array.from(shifted.footGenes), Array.from(parent.footGenes));

  // Crossed with the sense off, the foot comes wholesale from the first parent.
  const copied = Genome.crossover(parent, other, new RNG(2), false, false);
  assert.deepEqual(Array.from(copied.footGenes), Array.from(parent.footGenes));

  // The foot is not part of who you are: species distance ignores it entirely,
  // so switching the sense on cannot redraw the tree of life.
  const deafened = new Genome(Float32Array.from(parent.data));
  deafened.footGenes.fill(0);
  assert.equal(parent.distance(deafened), 0);
});

test("an older save keeps its ear and gains a silent foot", () => {
  // A v1.20–v1.32 vector: weights, plasticity, ear, body — no foot.
  const old = new Float32Array(2 * WLEN + BRAIN.hidden + 4);
  for (let i = 0; i < old.length; i++) old[i] = i + 1;
  const migrated = new Genome(migrateGenomeData(old));
  assert.equal(migrated.data.length, genomeLength());
  for (let i = 0; i < 2 * WLEN + BRAIN.hidden; i++) assert.equal(migrated.data[i], old[i]);
  for (const w of migrated.footGenes) assert.equal(w, 0);
  assert.deepEqual(
    [migrated.sizeGene, migrated.metabolismGene, migrated.hueGene, migrated.dietGene],
    [old[old.length - 4], old[old.length - 3], old[old.length - 2], old[old.length - 1]]
  );

  // A pre-v1.20 vector has neither sense, and must come back with both silent.
  const ancient = new Float32Array(2 * WLEN + 4);
  for (let i = 0; i < ancient.length; i++) ancient[i] = i + 1;
  const lifted = new Genome(migrateGenomeData(ancient));
  for (const w of lifted.earGenes) assert.equal(w, 0);
  for (const w of lifted.footGenes) assert.equal(w, 0);
  assert.equal(lifted.dietGene, ancient[ancient.length - 1]);
});

test("two aux senses stack, and one behaves exactly as it always did", () => {
  const nIn = 2;
  const nH = 2;
  const nOut = 1;
  const w = new Float32Array(NeuralNet.weightCount(nIn, nH, nOut)); // all zero...
  w[6] = 1; // ...except the two hidden→output weights, so the aux terms are
  w[7] = 1; //    the only thing that can reach the motor command
  const one = new NeuralNet(nIn, nH, nOut, w, null, null, Float32Array.from([1, 0]));
  assert.equal(one.nAux, 1);
  // With every input weight at zero, the hidden layer is the aux term alone, so
  // the output is a pure function of what it heard.
  const heardOnly = Array.from(one.forward([0, 0], 0.5));
  assert.deepEqual(Array.from(one.forward([0, 0], [0.5])), heardOnly); // scalar == 1-vector

  const two = new NeuralNet(nIn, nH, nOut, w, null, null, Float32Array.from([1, 0, 0, 1]));
  assert.equal(two.nAux, 2);
  // Second channel silent ⇒ exactly the single-sense answer. A sense reading
  // zero must add zero, not nearly zero.
  assert.deepEqual(Array.from(two.forward([0, 0], [0.5, 0])), heardOnly);
  assert.notDeepEqual(Array.from(two.forward([0, 0], [0.5, 0.9])), heardOnly);

  assert.throws(() => new NeuralNet(nIn, nH, nOut, w, null, null, new Float32Array(3)));
});

test("the feel of the ground is 0 on the flat, 1 on the worst ridge", () => {
  const cfg = makeConfig({ terrain: true, groundSense: true, terrainRoughCost: 3 });
  const g = Genome.random(new RNG(2), false, true);
  assert.equal(loneCreature(cfg, g, 1).groundFeel, 0);
  assert.equal(loneCreature(cfg, g, 3).groundFeel, 1);
  assert.equal(loneCreature(cfg, g, 2).groundFeel, 0.5);
  // Monotone in between, and clamped outside.
  assert.ok(loneCreature(cfg, g, 1.5).groundFeel < loneCreature(cfg, g, 2.5).groundFeel);
  assert.equal(loneCreature(cfg, g, 9).groundFeel, 1);

  // A world with no terrain is a world of flat ground, so the sense reads an
  // exact zero rather than an arbitrary baseline.
  const flat = makeConfig({ groundSense: true });
  assert.equal(loneCreature(flat, g, 1).groundFeel, 0);
});

test("without terrain, the foot adds exactly nothing to a brain", () => {
  // The cheapest way to protect determinism is an exact no-op: on flat ground
  // the sense is 0, and w*0 is exactly 0 for every finite weight, so a creature
  // that can feel the ground behaves identically to one that cannot until there
  // is some ground to feel.
  const genome = Genome.random(new RNG(31), false, true);
  const feeling = loneCreature(makeConfig({ groundSense: true }), genome);
  const numb = loneCreature(makeConfig({ groundSense: false }), genome);
  assert.equal(feeling.brain.nAux, 1);
  assert.equal(numb.brain.nAux, 0);
  assert.deepEqual(Array.from(feeling.think()), Array.from(numb.think()));
});

test("with terrain, the ground reaches the motor commands", () => {
  const cfg = makeConfig({ terrain: true, groundSense: true });
  const genome = Genome.random(new RNG(31), false, true);
  const flat = loneCreature(cfg, genome, 1);
  const rough = loneCreature(cfg, genome, cfg.terrainRoughCost);
  assert.notDeepEqual(Array.from(flat.think()), Array.from(rough.think()));

  // And with the sense off the very same difference in ground changes nothing.
  const deaf = makeConfig({ terrain: true, groundSense: false });
  assert.deepEqual(
    Array.from(loneCreature(deaf, genome, 1).think()),
    Array.from(loneCreature(deaf, genome, deaf.terrainRoughCost).think())
  );
});

test("ear and foot together are wired in genome order", () => {
  const cfg = makeConfig({ terrain: true, groundSense: true, signalling: true });
  const genome = Genome.random(new RNG(5), true, true);
  const c = loneCreature(cfg, genome, 2);
  assert.equal(c.brain.nAux, 2);
  // The brain's aux block is the ear block followed by the foot block; feeding
  // the two channels by hand in that order must reproduce think() exactly.
  const expected = c.brain.forward(c._in, [c.heard, c.groundFeel]);
  assert.deepEqual(Array.from(c.think()), Array.from(expected));
  assert.deepEqual(
    Array.from(c.brain.auxW),
    [...genome.earGenes, ...genome.footGenes]
  );
});

test("groundSway measures the wire, and reads exactly 0 without one", () => {
  const genome = Genome.random(new RNG(31), false, true);
  const feeling = loneCreature(makeConfig({ terrain: true, groundSense: true }), genome, 1.5);
  const numb = loneCreature(makeConfig({ terrain: true, groundSense: false }), genome, 1.5);
  assert.ok(groundSway(feeling) > 0);
  assert.equal(groundSway(numb), 0);
  // Where it stands cannot change what the swing between flat and rough is: the
  // readout is a property of the brain, not of the ground it happens to be on.
  const elsewhere = loneCreature(makeConfig({ terrain: true, groundSense: true }), genome, 2.4);
  assert.equal(groundSway(feeling), groundSway(elsewhere));

  // A silent foot sways nothing, however loudly the sense is switched on.
  const silent = new Genome(Float32Array.from(genome.data));
  silent.footGenes.fill(0);
  assert.equal(groundSway(loneCreature(makeConfig({ groundSense: true }), silent, 2)), 0);
});

test("asking a plastic brain a hypothetical does not teach it anything", () => {
  // groundSway is an observer, and an observer that alters what it looks at is
  // not an observer. A plastic brain learns from every forward pass, so the
  // probe has to run with learning suppressed.
  const cfg = makeConfig({ terrain: true, groundSense: true, plasticity: true });
  const genome = Genome.random(new RNG(8), false, true);
  genome.plasticityGenes.fill(0.5);
  const c = loneCreature(cfg, genome, 1.8);
  assert.equal(c.brain.plastic, true);
  const before = Float32Array.from(c.brain.w);
  groundSway(c);
  assert.deepEqual(Array.from(c.brain.w), Array.from(before));
  // ...whereas an ordinary tick does move them, which is what makes the check
  // above worth making.
  c.think();
  assert.notDeepEqual(Array.from(c.brain.w), Array.from(before));
});

test("a world with the sense on still keeps its books and its ground statistic", () => {
  const world = new World(makeConfig({ seed: 3, terrain: true, groundSense: true }));
  for (let i = 0; i < 600; i++) world.step();
  assert.ok(world.creatures.length > 0);
  for (const c of world.creatures) {
    assert.equal(c.brain.nAux, 1);
    assert.ok(c.groundFeel >= 0 && c.groundFeel <= 1);
  }
  // groundBias is the instrument the experiment reads; it must stay in range
  // and stay exactly 0 for a world with no terrain under it.
  const bias = groundBias(world.terrain, world.creatures);
  assert.ok(bias >= -1 && bias <= 1);
  assert.equal(groundBias(null, world.creatures), 0);
  // Newborns inherit the sense from the config, not from a flag captured at
  // world birth.
  const born = world.creatures.find((c) => c.generation > 0);
  if (born) assert.equal(born.brain.nAux, 1);
  assert.equal(buildBrainFor(born ? born.genome : world.creatures[0].genome, world.config).nAux, 1);
});
