import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS } from "../src/scenarios.js";
import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";

test("scenarios are well-formed and unique", () => {
  const ids = new Set();
  for (const s of SCENARIOS) {
    assert.ok(s.id && s.name && s.blurb && s.icon, `scenario missing fields: ${s.id}`);
    assert.ok(s.over && typeof s.over.seed === "number", `${s.id} needs a seed`);
    assert.ok(!ids.has(s.id), `duplicate scenario id: ${s.id}`);
    ids.add(s.id);
  }
});

test("every scenario produces a viable, non-extinct world", () => {
  for (const s of SCENARIOS) {
    const world = new World(makeConfig(s.over));
    for (let i = 0; i < 4000; i++) world.step();
    assert.ok(
      world.creatures.length > 0,
      `scenario "${s.name}" (seed ${s.over.seed}) should not die out`
    );
  }
});

test("each scenario delivers the character it advertises", () => {
  const byId = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

  // Genesis: no predators.
  const genesis = new World(makeConfig(byId.genesis.over));
  for (let i = 0; i < 3000; i++) genesis.step();
  assert.equal(genesis.stats.kills, 0, "Genesis should have no predation");

  // The Savanna: predators hunt and scavengers feed.
  const savanna = new World(makeConfig(byId.savanna.over));
  for (let i = 0; i < 5000; i++) savanna.step();
  assert.ok(savanna.stats.kills > 0, "Savanna should have hunting");
  assert.ok(savanna.stats.scavenged > 0, "Savanna should have scavenging");

  // The Thinking Pond: learning actually happens.
  const thinking = new World(makeConfig(byId.thinking.over));
  for (let i = 0; i < 5000; i++) thinking.step();
  assert.ok(thinking.stats.avgLearning > 0, "Thinking Pond should be learning");

  // Augmented Minds: some brain grows structure.
  const augment = new World(makeConfig(byId.augment.over));
  for (let i = 0; i < 6000; i++) augment.step();
  let grew = false;
  for (const c of augment.creatures) if (c.genome.complexity && c.genome.complexity.nodes > 0) grew = true;
  assert.ok(grew, "Augmented Minds should grow hidden neurons");
});
