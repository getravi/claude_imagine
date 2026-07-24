import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";

// Build a genome with specific body genes (size, diet) but otherwise random
// brain weights. Body genes live in the last four slots: size, metabolism,
// hue, diet.
function craftGenome(rng, { size = 0.5, diet = 0.5 } = {}) {
  const g = Genome.random(rng);
  g.data[g.data.length - 4] = size;
  g.data[g.data.length - 1] = diet;
  return g;
}

test("kin recognition is off by default, so close kin remain edible", () => {
  const cfg = makeConfig({ carnivoreThreshold: 0.5, preySizeRatio: 1.1 });
  const rng = new RNG(1);
  const genome = craftGenome(rng, { size: 1, diet: 0.95 });
  const pred = new Creature(genome, cfg, 0, 0, rng);
  const kin = new Creature(genome.clone(), cfg, 0, 0, rng); // identical genome: distance 0
  kin.radius = pred.radius * 0.5; // undersized, so only kinship could block the bite

  assert.equal(cfg.kinRecognition, false);
  assert.ok(pred.canEat(kin), "off by default, an identical-genome target is still prey");
});

test("kin recognition spares a genetically close target", () => {
  const cfg = makeConfig({ carnivoreThreshold: 0.5, preySizeRatio: 1.1, kinRecognition: true });
  const rng = new RNG(2);
  const genome = craftGenome(rng, { size: 1, diet: 0.95 });
  const pred = new Creature(genome, cfg, 0, 0, rng);
  const kin = new Creature(genome.clone(), cfg, 0, 0, rng); // distance 0 < threshold
  kin.radius = pred.radius * 0.5;

  assert.ok(!pred.canEat(kin), "an identical (kin) genome must be spared when the flag is on");
});

test("kin recognition still lets a genetically distant target be eaten", () => {
  const cfg = makeConfig({ carnivoreThreshold: 0.5, preySizeRatio: 1.1, kinRecognition: true });
  const rng = new RNG(3);
  const pred = new Creature(craftGenome(rng, { size: 1, diet: 0.95 }), cfg, 0, 0, rng);
  const stranger = new Creature(craftGenome(rng, { size: 0, diet: 0.1 }), cfg, 0, 0, rng);
  assert.ok(
    pred.genome.distance(stranger.genome) >= cfg.kinRecognitionDistance,
    "test fixture should produce genuinely distant genomes"
  );
  assert.ok(pred.canEat(stranger), "an unrelated, otherwise-eligible target stays prey");
});

test("kin recognition never grants immunity by size/diet alone", () => {
  const cfg = makeConfig({ kinRecognition: true });
  const rng = new RNG(4);
  const herbivore = new Creature(craftGenome(rng, { size: 1, diet: 0.1 }), cfg, 0, 0, rng);
  const smallPrey = new Creature(craftGenome(rng, { size: 0, diet: 0.1 }), cfg, 0, 0, rng);
  assert.ok(!herbivore.canEat(smallPrey), "herbivores still never hunt, kin or not");
});

test("with kin recognition off, worlds are bit-for-bit unaffected", () => {
  const withFlag = new World(makeConfig({ seed: 5, kinRecognition: false }));
  const withoutFlag = new World(makeConfig({ seed: 5 }));
  for (let i = 0; i < 3000; i++) {
    withFlag.step();
    withoutFlag.step();
  }
  assert.equal(withFlag.creatures.length, withoutFlag.creatures.length);
  assert.equal(withFlag.stats.kills, withoutFlag.stats.kills);
  assert.equal(withFlag.stats.births, withoutFlag.stats.births);
});

test("a kin-recognition world stays alive and deterministic", () => {
  const a = new World(makeConfig({ seed: 5, kinRecognition: true }));
  const b = new World(makeConfig({ seed: 5, kinRecognition: true }));
  for (let i = 0; i < 4000; i++) {
    a.step();
    b.step();
  }
  assert.ok(a.creatures.length > 0, "world should not be permanently extinct");
  assert.equal(a.creatures.length, b.creatures.length);
  assert.equal(a.stats.kills, b.stats.kills);
});
