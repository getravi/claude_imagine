import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Creature, deserializeGenome } from "../src/creature.js";
import { Genome, genomeLength, migrateGenomeData, BRAIN } from "../src/genome.js";
import { NeuralNet } from "../src/nn.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";

const WLEN = NeuralNet.weightCount(BRAIN.inputs, BRAIN.hidden, BRAIN.outputs);

test("signalling is off by default, and nobody hears anything", () => {
  const world = new World(makeConfig({ seed: 5 }));
  assert.equal(world.config.signalling, false);
  for (let i = 0; i < 200; i++) world.step();
  for (const c of world.creatures) assert.equal(c.heard, 0);
  assert.equal(world.stats.avgVoice, 0);
});

test("with signalling off, worlds are bit-for-bit unaffected", () => {
  const withFlag = new World(makeConfig({ seed: 21, signalling: false }));
  const withoutFlag = new World(makeConfig({ seed: 21 }));
  for (let i = 0; i < 2500; i++) {
    withFlag.step();
    withoutFlag.step();
  }
  assert.equal(withFlag.creatures.length, withoutFlag.creatures.length);
  assert.equal(withFlag.stats.births, withoutFlag.stats.births);
  assert.equal(withFlag.stats.deaths, withoutFlag.stats.deaths);
  assert.equal(withFlag.stats.kills, withoutFlag.stats.kills);
  for (let i = 0; i < withFlag.creatures.length; i++) {
    const a = withFlag.creatures[i];
    const b = withoutFlag.creatures[i];
    assert.equal(a.x, b.x);
    assert.equal(a.y, b.y);
    assert.equal(a.energy, b.energy); // the voice cost must be an exact zero
    assert.equal(a.signal, b.signal);
  }
});

// The riskiest thing about an extra sense is that it lengthens the genome, and
// the genome is where the RNG stream lives. Every draw site gets its own check.
test("the ear costs no random draws while it is silent", () => {
  const a = new RNG(9);
  const b = new RNG(9);
  const deaf = Genome.random(a);
  const eared = Genome.random(b, true);
  assert.equal(deaf.data.length, eared.data.length);
  // The eared genome consumed BRAIN.hidden extra gaussians, so its stream is
  // now ahead; the deaf one must be exactly where a pre-ear version left it.
  for (let i = 0; i < WLEN; i++) assert.equal(deaf.data[i], eared.data[i]); // same brain
  for (const w of deaf.earGenes) assert.equal(w, 0);
  assert.ok([...eared.earGenes].some((w) => w !== 0));
  assert.notEqual(deaf.sizeGene, eared.sizeGene); // ...and only then diverge

  // Mutation: the silent block must not consume a coin flip either.
  const m1 = new RNG(3);
  const m2 = new RNG(3);
  const child = deaf.mutate(m1, 0.09, 0.16, false, false);
  const control = new Genome(deaf.data.slice()).mutate(m2, 0.09, 0.16, false, false);
  assert.deepEqual(Array.from(child.data), Array.from(control.data));
  assert.equal(m1.float(), m2.float());

  // Crossover: same story, per gene.
  const x1 = new RNG(4);
  const x2 = new RNG(4);
  const off = Genome.crossover(deaf, control, x1, false);
  Genome.crossover(deaf, control, x2, false);
  for (const w of off.earGenes) assert.equal(w, 0);
  assert.equal(x1.float(), x2.float());
});

test("mutation and crossover reach the ear only when signalling is on", () => {
  const parent = Genome.random(new RNG(11), true);
  const other = Genome.random(new RNG(12), true);

  const untouched = parent.mutate(new RNG(1), 1, 0.5, false, false); // rate 1: every gene
  assert.deepEqual(Array.from(untouched.earGenes), Array.from(parent.earGenes));

  const shifted = parent.mutate(new RNG(1), 1, 0.5, false, true);
  assert.ok(
    [...shifted.earGenes].some((w, i) => w !== parent.earGenes[i]),
    "an eared mutation must move ear genes"
  );

  // Crossover with the ear off copies the first parent's ear wholesale.
  const kept = Genome.crossover(parent, other, new RNG(2), false);
  assert.deepEqual(Array.from(kept.earGenes), Array.from(parent.earGenes));
  const mixed = Genome.crossover(parent, other, new RNG(2), true);
  assert.ok(
    [...mixed.earGenes].some((w, i) => w === other.earGenes[i] && w !== parent.earGenes[i]),
    "an eared crossover must be able to take genes from the second parent"
  );
});

test("species distance ignores the ear, so the tree of life is unchanged", () => {
  const a = Genome.random(new RNG(31));
  const b = Genome.random(new RNG(32));
  const before = a.distance(b);
  // Give one of them a wildly different ear; it must not register as a species
  // difference, exactly as plasticity genes don't.
  const loud = new Genome(a.data.slice());
  for (let i = 0; i < loud.earGenes.length; i++) loud.earGenes[i] = 7 * (i + 1);
  assert.equal(loud.distance(b), before);
});

test("a net without an ear is arithmetically identical whatever it is told", () => {
  const g = Genome.random(new RNG(41), true);
  const deafBrain = g.buildBrain(null, false);
  const inputs = new Float32Array(BRAIN.inputs).fill(0.3);
  const quiet = Array.from(deafBrain.forward(inputs, 0));
  const shouted = Array.from(deafBrain.forward(inputs, 0.97));
  assert.deepEqual(shouted, quiet);

  // With the ear wired in, the same shout must actually change the answer.
  const earedBrain = g.buildBrain(null, true);
  const heard = Array.from(earedBrain.forward(inputs, 0.97));
  const unheard = Array.from(earedBrain.forward(inputs, 0));
  assert.notDeepEqual(heard, unheard);
  // ...and a silent world through an eared brain is the deaf brain exactly.
  assert.deepEqual(unheard, quiet);
});

test("a voice fades with distance and the loudest one wins", () => {
  const config = makeConfig({
    seed: 2,
    signalling: true,
    populationStart: 0,
    foodStart: 0,
    signalRadius: 100,
  });
  const world = new World(config);
  const rng = new RNG(77);
  const at = (x, y) => {
    const c = new Creature(Genome.random(rng, true), config, x, y, rng, 0);
    world.creatures.push(c);
    return c;
  };
  const listener = at(400, 300);
  const near = at(425, 300); // 25px away
  const far = at(470, 300); // 70px away
  // Freeze the speakers so `act()` can't overwrite what they are saying.
  near.prevSignal = near.signal = 0.4;
  far.prevSignal = far.signal = 0.9;
  listener.prevSignal = listener.signal = 1;

  world.step();
  // Near: 0.4 * (1 - 25/100) = 0.30. Far: 0.9 * (1 - 70/100) = 0.27.
  assert.ok(Math.abs(listener.heard - 0.3) < 1e-6, `heard ${listener.heard}`);

  // Move the loud one into range and it takes over the channel. Positions are
  // restored too: everyone drifted a little while acting during the step above.
  listener.x = 400;
  listener.y = near.y = far.y = 300;
  near.x = 425;
  far.x = 440; // 40px away: 0.9 * 0.6 = 0.54
  near.prevSignal = near.signal = 0.4;
  far.prevSignal = far.signal = 0.9;
  world.step();
  assert.ok(Math.abs(listener.heard - 0.54) < 1e-6, `heard ${listener.heard}`);

  // A creature never hears itself, however loud it is.
  near.x = far.x = 20;
  near.prevSignal = far.prevSignal = 0;
  listener.prevSignal = listener.signal = 1;
  world.step();
  assert.equal(listener.heard, 0);
});

test("calling costs energy in proportion to how loud the call is", () => {
  const quiet = makeConfig({ seed: 3, signalling: true, signalCost: 0.05 });
  const rng = new RNG(5);
  const g = Genome.random(rng, true);
  const c = new Creature(g, quiet, 100, 100, rng, 0);
  const before = c.energy;
  c.act([0, 0, 0.8]); // turn, thrust, signal
  const withVoice = before - c.energy;

  const free = makeConfig({ seed: 3, signalling: false, signalCost: 0.05 });
  const c2 = new Creature(new Genome(g.data.slice()), free, 100, 100, new RNG(5), 0);
  c2.heading = c.heading; // same body, same physics
  const before2 = c2.energy;
  c2.act([0, 0, 0.8]);
  const withoutVoice = before2 - c2.energy;

  assert.ok(Math.abs(withVoice - withoutVoice - 0.05 * 0.8) < 1e-6);
  // Silence is free even with the feature on.
  const c3 = new Creature(new Genome(g.data.slice()), quiet, 100, 100, new RNG(5), 0);
  c3.heading = c.heading;
  const before3 = c3.energy;
  c3.act([0, 0, 0]);
  assert.ok(Math.abs(before3 - c3.energy - withoutVoice) < 1e-9);
});

test("everyone hears last tick's pond, not a half-updated one", () => {
  // Creatures act one after another, so if hearing read the *live* signal the
  // first creature in the array would hear yesterday and the last would hear
  // today. Both here are given a known voice; after one step each must have
  // heard what the other was saying when the tick began, even though both are
  // by then saying something else.
  const config = makeConfig({
    seed: 8,
    signalling: true,
    populationStart: 0,
    foodStart: 0,
    signalRadius: 100,
  });
  const world = new World(config);
  const rng = new RNG(88);
  const a = new Creature(Genome.random(rng, true), config, 400, 300, rng, 0);
  const b = new Creature(Genome.random(rng, true), config, 450, 300, rng, 0); // 50px
  world.creatures.push(a, b);
  a.signal = 0.8;
  b.signal = -0.2;

  world.step();
  assert.ok(Math.abs(a.heard - -0.1) < 1e-6, `a heard ${a.heard}`); // -0.2 * 0.5
  assert.ok(Math.abs(b.heard - 0.4) < 1e-6, `b heard ${b.heard}`); // 0.8 * 0.5
  // The live values did move on, so reading them would have given a different
  // answer for whichever creature happened to be updated second.
  assert.notEqual(a.signal, 0.8);
  assert.notEqual(b.signal, -0.2);
});

test("a signalling world is reproducible from its seed", () => {
  const run = () => {
    const w = new World(makeConfig({ seed: 44, signalling: true }));
    for (let i = 0; i < 800; i++) w.step();
    return w;
  };
  const a = run();
  const b = run();
  assert.equal(a.creatures.length, b.creatures.length);
  assert.equal(a.stats.avgVoice, b.stats.avgVoice);
  for (let i = 0; i < a.creatures.length; i++) {
    assert.equal(a.creatures[i].x, b.creatures[i].x);
    assert.equal(a.creatures[i].energy, b.creatures[i].energy);
  }
});

test("the channel is measured only where it is a channel", () => {
  const loud = new World(makeConfig({ seed: 12, signalling: true }));
  const silent = new World(makeConfig({ seed: 12 }));
  for (let i = 0; i < 120; i++) {
    loud.step();
    silent.step();
  }
  assert.ok(loud.stats.avgVoice > 0, "a signalling pond has a measurable voice");
  assert.ok(loud.stats.avgHeard > 0, "and its creatures are within earshot of it");
  assert.equal(silent.stats.avgVoice, 0);
  assert.equal(silent.stats.avgHeard, 0);
});

test("traffic on the channel follows the crowd, not the volume", () => {
  // Two ponds saying exactly the same thing, one packed and one scattered. The
  // loudness reading cannot tell them apart; the heard reading is the point.
  const config = makeConfig({ seed: 15, signalling: true, populationStart: 0, foodStart: 0 });
  const build = (spread) => {
    const world = new World(config);
    const rng = new RNG(150);
    for (let i = 0; i < 20; i++) {
      const c = new Creature(
        Genome.random(rng, true),
        config,
        400 + (i % 5) * spread,
        300 + Math.floor(i / 5) * spread,
        rng,
        0
      );
      c.signal = c.prevSignal = 0.9;
      world.creatures.push(c);
    }
    world.step();
    world.stats.sample(world);
    return world.stats;
  };
  const packed = build(12);
  const scattered = build(150);
  assert.ok(
    packed.avgHeard > scattered.avgHeard * 2,
    `packed ${packed.avgHeard} vs scattered ${scattered.avgHeard}`
  );
});

test("a pre-ear save loads with a silent ear and its body genes intact", () => {
  const modern = Genome.random(new RNG(63), true);
  // Reconstruct what v1.19 would have written: weights, plasticity, body.
  const old = new Float32Array(2 * WLEN + 4);
  old.set(modern.data.subarray(0, 2 * WLEN), 0);
  old.set(modern.data.subarray(modern.data.length - 4), 2 * WLEN);

  const loaded = deserializeGenome({ k: "fixed", d: Array.from(old) });
  assert.equal(loaded.data.length, genomeLength());
  for (let i = 0; i < 2 * WLEN; i++) assert.equal(loaded.data[i], modern.data[i]);
  for (const w of loaded.earGenes) assert.equal(w, 0);
  assert.equal(loaded.sizeGene, modern.sizeGene);
  assert.equal(loaded.dietGene, modern.dietGene);
  // A current-length vector passes through untouched.
  assert.equal(migrateGenomeData(modern.data), modern.data);
});

test("hearing does not shrink at night the way sight does", () => {
  // Sight collapses toward nightVisionFactor on a schedule; a voice does not.
  // Worth pinning: the two ranges are read from different places, and quietly
  // multiplying earshot by visionFactor would be an easy accident.
  const config = makeConfig({
    seed: 17,
    signalling: true,
    dayNightCycle: true,
    dayLength: 40,
    nightVisionFactor: 0.05,
    populationStart: 0,
    foodStart: 0,
    signalRadius: 100,
  });
  const world = new World(config);
  const rng = new RNG(171);
  const listener = new Creature(Genome.random(rng, true), config, 400, 300, rng, 0);
  const speaker = new Creature(Genome.random(rng, true), config, 450, 300, rng, 0);
  world.creatures.push(listener, speaker);

  let heardAtNight = null;
  let heardByDay = null;
  for (let t = 0; t < 80; t++) {
    listener.x = 400;
    speaker.x = 450;
    listener.y = speaker.y = 300;
    speaker.signal = speaker.prevSignal = 0.6;
    world.step();
    if (world.visionFactor < 0.2) heardAtNight = listener.heard;
    if (world.visionFactor > 0.95) heardByDay = listener.heard;
  }
  assert.ok(Math.abs(heardByDay - 0.3) < 1e-6, `by day ${heardByDay}`); // 0.6 * 0.5
  assert.equal(heardAtNight, heardByDay);
});
