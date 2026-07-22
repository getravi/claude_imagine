import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome, genomeLength } from "../src/genome.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";

// Build a genome with specific body genes (size, diet) but otherwise random
// brain weights. Body genes live in the last four slots: size, metabolism,
// hue, diet.
function craftGenome(rng, { size = 0.5, diet = 0.5 } = {}) {
  const g = Genome.random(rng);
  g.data[g.data.length - 4] = size; // size gene
  g.data[g.data.length - 1] = diet; // diet gene
  return g;
}

test("canEat requires both carnivory and a size advantage", () => {
  const cfg = makeConfig();
  const rng = new RNG(1);
  const bigCarnivore = new Creature(craftGenome(rng, { size: 1, diet: 0.95 }), cfg, 0, 0, rng);
  const smallPrey = new Creature(craftGenome(rng, { size: 0, diet: 0.1 }), cfg, 0, 0, rng);
  const bigHerbivore = new Creature(craftGenome(rng, { size: 1, diet: 0.1 }), cfg, 0, 0, rng);

  assert.ok(bigCarnivore.canEat(smallPrey), "big carnivore should eat small prey");
  assert.ok(!smallPrey.canEat(bigCarnivore), "small prey cannot eat a bigger creature");
  assert.ok(!bigHerbivore.canEat(smallPrey), "herbivores never hunt, regardless of size");
  assert.ok(!bigCarnivore.canEat(bigCarnivore), "cannot eat something its own size");
});

test("a predator biting adjacent prey transfers energy", () => {
  const cfg = makeConfig({ seed: 1, predation: true });
  const rng = new RNG(2);
  const world = new World(cfg);
  // Replace the population with a controlled predator/prey pair, and clear food
  // so the only energy change is the bite.
  world.food.items = [];
  const pred = new Creature(craftGenome(rng, { size: 1, diet: 0.95 }), cfg, 100, 100, rng);
  const prey = new Creature(craftGenome(rng, { size: 0, diet: 0.1 }), cfg, 104, 100, rng);
  pred.energy = 100;
  prey.energy = 50;
  world.creatures = [pred, prey];

  const preyBefore = prey.energy;
  const predBefore = pred.energy;
  world.step();

  assert.ok(prey.energy < preyBefore - 20, "prey should lose a big bite of energy");
  assert.ok(pred.energy > predBefore + 20, "predator should gain from the meat");
  // The bite is recorded after act() advanced age this tick, so it equals age.
  assert.equal(pred.lastBiteAge, pred.age, "predator records the bite for its flash");
});

test("with predation disabled, no kills ever happen", () => {
  const world = new World(makeConfig({ seed: 42, predation: false }));
  for (let i = 0; i < 3000; i++) world.step();
  assert.equal(world.stats.kills, 0, "predation:false must produce zero kills");
});

test("plant nutrition shrinks as a creature becomes carnivorous", () => {
  // Two worlds identical but for one herbivore vs one carnivore sitting on food.
  const cfg = makeConfig({ predation: true });
  const rng = new RNG(3);
  function gainFromGrazing(diet) {
    const w = new World(cfg);
    w.creatures = [];
    const c = new Creature(craftGenome(rng, { size: 0.5, diet }), cfg, 50, 50, rng);
    c.energy = 20;
    w.creatures = [c];
    // Put a single pellet right on top of the creature.
    w.food.items = [{ x: 50, y: 50, eaten: false }];
    const before = c.energy;
    w.step();
    return c.energy - before; // net (grazing gain minus metabolism)
  }
  const herbGain = gainFromGrazing(0.0);
  const carnGain = gainFromGrazing(1.0);
  assert.ok(herbGain > carnGain, "herbivores get more from plants than carnivores");
});

test("predation-enabled worlds stay alive and bounded over a long run", () => {
  const cfg = makeConfig({ seed: 5 }); // a seed known to evolve predators
  const world = new World(cfg);
  let minPop = Infinity;
  for (let i = 0; i < 8000; i++) {
    world.step();
    if (world.creatures.length < minPop) minPop = world.creatures.length;
  }
  assert.ok(world.creatures.length > 0, "world should not be permanently extinct");
  assert.ok(world.creatures.length <= cfg.populationMax, "population within cap");
});
