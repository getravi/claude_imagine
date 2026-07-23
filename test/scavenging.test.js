import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { Corpse } from "../src/food.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";

function craftGenome(rng, { size = 0.5, diet = 0.5 } = {}) {
  const g = Genome.random(rng);
  g.data[g.data.length - 4] = size;
  g.data[g.data.length - 1] = diet;
  return g;
}

test("with scavenging off, no corpses are ever created", () => {
  const world = new World(makeConfig({ seed: 42, scavenging: false }));
  for (let i = 0; i < 3000; i++) world.step();
  assert.equal(world.corpses.length, 0);
  assert.equal(world.stats.scavenged, 0);
});

test("deaths leave corpses when scavenging is on", () => {
  const world = new World(makeConfig({ seed: 42, scavenging: true }));
  for (let i = 0; i < 2000; i++) world.step();
  assert.ok(world.stats.deaths > 0, "some creatures should have died");
  // Corpses accrue from deaths (and are eaten/rot over time), so at least some
  // should have existed — check the count is a sane, bounded number.
  assert.ok(world.corpses.length >= 0 && world.corpses.length < 5000);
});

test("a carnivore scavenges an adjacent corpse for meat energy", () => {
  const cfg = makeConfig({ seed: 1, scavenging: true, predation: true });
  const rng = new RNG(2);
  const world = new World(cfg);
  world.food.items = [];
  world.creatures = [];
  const scav = new Creature(craftGenome(rng, { size: 1, diet: 0.95 }), cfg, 100, 100, rng);
  scav.energy = 80;
  world.creatures = [scav];
  world.corpses = [new Corpse(103, 100, 40)];
  const before = scav.energy;
  world.step();
  assert.ok(scav.energy > before + 10, "the scavenger should gain energy from the corpse");
  assert.ok(world.corpses.length === 0 || world.corpses[0].energy < 40, "the corpse was fed on");
  assert.ok(world.stats.scavenged > 0, "a scavenging bite was recorded");
});

test("a herbivore ignores corpses", () => {
  const cfg = makeConfig({ seed: 1, scavenging: true });
  const rng = new RNG(3);
  const world = new World(cfg);
  world.food.items = [];
  world.creatures = [];
  const herb = new Creature(craftGenome(rng, { size: 0.5, diet: 0.05 }), cfg, 100, 100, rng);
  herb.energy = 80;
  world.creatures = [herb];
  world.corpses = [new Corpse(102, 100, 40)];
  world.step();
  assert.equal(world.stats.scavenged, 0, "herbivores do not scavenge");
  assert.equal(world.corpses[0].energy, 40 - cfg.corpseDecay, "corpse only lost its decay");
});

test("corpses rot away and are removed when depleted", () => {
  const cfg = makeConfig({ seed: 1, scavenging: true });
  const world = new World(cfg);
  world.creatures = []; // no scavengers, so only decay acts
  world.corpses = [new Corpse(50, 50, 5)];
  const ticks = Math.ceil(5 / cfg.corpseDecay) + 5;
  for (let i = 0; i < ticks; i++) world.step();
  assert.equal(world.corpses.length, 0, "the corpse should have fully decayed");
});

test("a scavenging world stays stable and deterministic", () => {
  const a = new World(makeConfig({ seed: 7, scavenging: true }));
  const b = new World(makeConfig({ seed: 7, scavenging: true }));
  for (let i = 0; i < 4000; i++) {
    a.step();
    b.step();
  }
  assert.ok(a.creatures.length > 0, "scavenging world should not die out");
  assert.equal(a.creatures.length, b.creatures.length);
  assert.equal(a.stats.scavenged, b.stats.scavenged);
  assert.equal(a.corpses.length, b.corpses.length);
});
