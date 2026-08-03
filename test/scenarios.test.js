import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SCENARIOS } from "../src/scenarios.js";
import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("scenarios are well-formed and unique", () => {
  const ids = new Set();
  for (const s of SCENARIOS) {
    assert.ok(s.id && s.name && s.blurb && s.icon, `scenario missing fields: ${s.id}`);
    assert.ok(s.over && typeof s.over.seed === "number", `${s.id} needs a seed`);
    assert.ok(!ids.has(s.id), `duplicate scenario id: ${s.id}`);
    ids.add(s.id);
  }
});

// The README states the size of this collection twice: once as a word in the
// opening paragraph and once as the full list of names in the controls table.
// Both are prose about an array, and my own playbook has carried the finding
// since v1.37 — *anything stated as a number in prose about a collection in code
// will drift* — after the count sat wrong for sixteen releases. Writing the rule
// down is not the fix; this is. (v1.51 was the first test here to read a shipped
// document, and it read the HTML. This is the same instrument aimed at the file
// a visitor meets first.)
test("the README's account of the scenarios is the scenarios", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const words = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  ];
  const count = words[SCENARIOS.length];
  assert.ok(count, `the word for ${SCENARIOS.length} is not in this test's vocabulary`);
  assert.match(
    readme,
    new RegExp(`offers ${count} one-click worlds`),
    `the README should say there are ${count} scenarios`
  );

  const row = readme.split("\n").find((l) => l.startsWith("| **Scenarios**"));
  assert.ok(row, "the controls table should still have a Scenarios row");
  const listed = row.slice(row.lastIndexOf("(") + 1, row.lastIndexOf(")")).split(", ");
  assert.deepEqual(
    listed,
    SCENARIOS.map((s) => s.name),
    "the README's list of scenarios should be the scenarios, in order"
  );
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

// The Four Rooms ships the isolation-by-distance result v1.48 measured, which
// until now lived only in SCIENCE.md: lineages either side of a wall drift
// apart. The control is the one that cannot inherit a shared baseline, because
// there is no second run for it to share one with — the *same* creatures at the
// *same* instant, partitioned by lines shifted half a room over. If the signal
// were spatial structure this pond has anyway (offspring are born touching their
// parent; lineages pool in the biomes), the shifted lines would find it too.
test("The Four Rooms isolates its lineages, and the walls are where the line is", () => {
  const rooms = SCENARIOS.find((s) => s.id === "rooms");
  assert.ok(rooms, "the rock scenario should exist");

  /** Room index from a set of cut lines, optionally shifted half a room over. */
  const roomsOf = (field, shift) => {
    const axis = (vertical) =>
      field.walls.filter((w) => w.vertical === vertical).map((w) => w.pos).sort((a, b) => a - b);
    const size = (vertical) => (vertical ? field.config.width : field.config.height);
    const lines = (vertical) => {
      const l = axis(vertical);
      const s = shift ? size(vertical) / (2 * Math.max(1, l.length)) : 0;
      return l.map((p) => (p + s) % size(vertical)).sort((a, b) => a - b);
    };
    const vs = lines(true);
    const hs = lines(false);
    const band = (v, l) => {
      if (l.length < 2) return 0;
      let k = 0;
      for (const p of l) if (v >= p) k++;
      return k % l.length;
    };
    return (x, y) => band(x, vs) * 10 + band(y, hs);
  };

  // Mean genetic distance across the partition minus the mean within it, as a
  // fraction of the within-partition distance. Null while a partition is empty.
  const isolation = (creatures, room) => {
    let across = 0;
    let nAcross = 0;
    let within = 0;
    let nWithin = 0;
    for (let i = 0; i < creatures.length; i++) {
      const a = creatures[i];
      const ra = room(a.x, a.y);
      for (let j = i + 1; j < creatures.length; j++) {
        const b = creatures[j];
        const d = a.genome.distance(b.genome);
        if (ra === room(b.x, b.y)) {
          within += d;
          nWithin++;
        } else {
          across += d;
          nAcross++;
        }
      }
    }
    if (!nWithin || !nAcross) return null;
    const w = within / nWithin;
    return w > 0 ? (across / nAcross - w) / w : null;
  };

  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const world = new World(makeConfig(rooms.over));
  assert.ok(world.barriers, "The Four Rooms should have rock in it");
  const real = roomsOf(world.barriers, false);
  const shifted = roomsOf(world.barriers, true);

  // The instantaneous figure over a couple of hundred creatures swings, so this
  // is the run's tendency over its second half, the same window v1.48 used.
  const walls = [];
  const control = [];
  let minPop = Infinity;
  for (let i = 1; i <= 4000; i++) {
    world.step();
    if (i >= 500) minPop = Math.min(minPop, world.creatures.length);
    if (i < 2000 || i % 250 !== 0) continue;
    const a = isolation(world.creatures, real);
    const b = isolation(world.creatures, shifted);
    if (a !== null) walls.push(a);
    if (b !== null) control.push(b);
  }
  assert.ok(walls.length >= 5 && control.length >= 5, "both partitions should have been sampled");

  const signal = median(walls);
  const noise = median(control);
  // Measured +0.807 against +0.052 at 4,000 ticks — a factor of fifteen. The
  // bounds below are a fifth of that and cannot flake on the shipped seed.
  assert.ok(
    signal > 0.15,
    `The Four Rooms should isolate across its walls (isolation ${signal.toFixed(3)})`
  );
  assert.ok(
    Math.abs(noise) < signal / 3,
    `the wall is where the line is, not anywhere: real lines ${signal.toFixed(3)}, ` +
      `lines shifted half a room ${noise.toFixed(3)}`
  );
  assert.ok(minPop > 20, `The Four Rooms should stay a pond (fell to ${minPop})`);
  assert.ok(world.stats.kills > 0, "The Four Rooms should evolve hunting");
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
