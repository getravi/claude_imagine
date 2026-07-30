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

  // The Long Night: the sun really sets, and the hunting survives it.
  const night = new World(makeConfig(byId.longnight.over));
  let minVision = Infinity;
  let maxVision = -Infinity;
  for (let i = 0; i < 4000; i++) {
    night.step();
    minVision = Math.min(minVision, night.visionFactor);
    maxVision = Math.max(maxVision, night.visionFactor);
  }
  assert.ok(maxVision > 0.99, "The Long Night should reach full daylight");
  assert.ok(minVision < 0.35, "The Long Night should go properly dark");
  assert.ok(night.stats.kills > 0, "The Long Night should still be a predator world");

  // The Plague: a real epidemic arrives, is survived, and comes back in waves.
  const plague = new World(makeConfig(byId.plague.over));
  let waves = 0;
  let inWave = false;
  for (let i = 0; i < 6000; i++) {
    plague.step();
    const sick = plague.stats.infectedCount;
    if (!inWave && sick >= 18) {
      inWave = true;
      waves++;
    } else if (inWave && sick <= 3) inWave = false;
  }
  assert.ok(plague.stats.recoveries > 0, "The Plague should be survivable");
  assert.ok(waves >= 2, `The Plague should come in waves (saw ${waves})`);
  assert.ok(plague.creatures.length > 60, "The Plague should leave a living pond");

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

// The Lay of the Land makes a claim about *why* its pond ends up where it does:
// not because anything avoids rough ground (nothing can perceive it) but because
// the ridges grow nothing. v1.23 established that in general over four seeds
// (docs/SCIENCE.md, "Terrain: why a cost is not a landscape"); this pins it on
// the one seed the scenario ships, where the control happens to be clean. On the
// default seed 314 the terrain-off arm already reads -0.034, because that world's
// biomes sit in ground the roughness field also calls flat — settling you would
// get with the mechanic switched off. Here there is no such coincidence to lean on.
test("The Lay of the Land settles into its basins, and barrenness is why", () => {
  const lay = SCENARIOS.find((s) => s.id === "lay");
  assert.ok(lay, "the ground scenario should exist");

  // Time-averaged: the instantaneous bias over a few dozen creatures swings a
  // lot, and what the blurb promises is the run's tendency, not any one tick.
  const settling = (over) => {
    const world = new World(makeConfig(over));
    let sum = 0;
    let n = 0;
    for (let i = 1; i <= 4000; i++) {
      world.step();
      if (i > 400 && i % 20 === 0) {
        sum += world.stats.groundBias;
        n++;
      }
    }
    return { world, bias: sum / n };
  };

  const shipped = settling(lay.over);
  assert.ok(
    shipped.bias < -0.04,
    `The Lay of the Land should settle into the flats (bias ${shipped.bias.toFixed(4)})`
  );
  assert.ok(
    shipped.world.stats.soilShare > 0.05,
    `its dead should be feeding its crop (soil share ${shipped.world.stats.soilShare.toFixed(3)})`
  );
  assert.ok(shipped.world.stats.kills > 0, "The Lay of the Land should evolve hunting");

  // The control arm: ridges still cost 2.6x to cross, but they grow food like
  // anywhere else. Measured -0.013 against the shipped arm's -0.062 at 4,000
  // ticks, and -0.003 against -0.111 at 20,000.
  const taxOnly = settling({ ...lay.over, terrainBarrenness: 0 });
  assert.ok(
    Math.abs(shipped.bias) > 3 * Math.abs(taxOnly.bias),
    `barrenness should do the settling, not the movement cost ` +
      `(shipped ${shipped.bias.toFixed(4)}, tax-only ${taxOnly.bias.toFixed(4)})`
  );
});
