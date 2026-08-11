import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { makeConfig } from "../src/config.js";
import { assertUnaffected } from "./support/paired.js";
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
  assertUnaffected(
    new World(makeConfig({ seed: 5, kinRecognition: false })),
    new World(makeConfig({ seed: 5 })),
    3000,
    "kinRecognition"
  );
});

test("the landing page's pond is bit-for-bit the same with the rule switched on", () => {
  // Not a determinism test — the opposite of one, and the finding this counter
  // was built to make visible. v1.38 measured that seed 314 never offers the
  // rule a relative to spare, because it evolves a separate predator lineage
  // that hunts genetic strangers; a rule that never fires perturbs nothing and
  // draws nothing, so the two worlds are the *same world*, hash for hash, four
  // thousand ticks in.
  //
  // Pinned because it is contingent. If a future change to the pond makes 314
  // spare so much as one relative, this fails — and that is the notification
  // worth having: the character of the world on the landing page would have
  // changed, and this file is the only place that would notice.
  assertUnaffected(
    new World(makeConfig({ seed: 314, kinRecognition: true })),
    new World(makeConfig({ seed: 314 })),
    4000,
    "kinRecognition (which never fires on this seed)"
  );
});

test("sparesKin is exactly the meals canEat declines for kinship", () => {
  // The decomposition, asserted rather than assumed: `canEat` is the size-and-
  // diet test *and not kin*, `sparesKin` is the same test *and* kin, and the two
  // are therefore mutually exclusive. Written as a property over a field of
  // pairs because the counter in `world.js` reads one and the world reads the
  // other, and a drift between them would be a count of something nobody
  // declined.
  const cfg = makeConfig({ carnivoreThreshold: 0.5, preySizeRatio: 1.1, kinRecognition: true });
  const rng = new RNG(11);
  const family = craftGenome(rng, { size: 1, diet: 0.95 });
  const pool = [];
  for (let i = 0; i < 12; i++) {
    const kin = i % 3 === 0;
    const g = kin ? family.clone() : craftGenome(rng, { size: i / 12, diet: i / 12 });
    const c = new Creature(g, cfg, 0, 0, rng);
    c.radius = 2 + i * 0.4;
    pool.push(c);
  }
  let spared = 0;
  for (const a of pool) {
    for (const b of pool) {
      if (a === b) continue;
      const edible = a._edible(b);
      assert.equal(a.canEat(b), edible && !a._isKin(b));
      assert.equal(a.sparesKin(b), edible && a._isKin(b));
      assert.ok(!(a.canEat(b) && a.sparesKin(b)), "a meal cannot be both taken and spared");
      if (a.sparesKin(b)) spared++;
    }
  }
  assert.ok(spared > 0, "the fixture must actually offer some kin to spare");
});

test("nothing is ever spared in a world without the rule", () => {
  const cfg = makeConfig({ carnivoreThreshold: 0.5, preySizeRatio: 1.1 });
  const rng = new RNG(12);
  const g = craftGenome(rng, { size: 1, diet: 0.95 });
  const pred = new Creature(g, cfg, 0, 0, rng);
  const kin = new Creature(g.clone(), cfg, 0, 0, rng);
  kin.radius = pred.radius * 0.5;
  assert.ok(pred.canEat(kin), "with the flag off the meal is taken");
  assert.ok(!pred.sparesKin(kin), "…so there is nothing for the counter to count");
});

test("the counter counts a hunter turning down its own family", () => {
  // The event, staged: one carnivore, one undersized clone of it inside sight,
  // and nothing else in the pond. `canEat` says no, `sparesKin` says why, and
  // the counter rises by exactly one per tick — one hunter, one relative, one
  // decision. The clone is never approached, so nothing else in the world moves
  // to record it, which is the whole reason this counter exists.
  const cfg = makeConfig({ seed: 1, predation: true, kinRecognition: true });
  const rng = new RNG(13);
  const world = new World(cfg);
  world.food.items = [];
  const g = craftGenome(rng, { size: 1, diet: 0.95 });
  const pred = new Creature(g, cfg, 100, 100, rng);
  const kin = new Creature(g.clone(), cfg, 130, 100, rng);
  kin.radius = pred.radius * 0.5;
  world.creatures = [pred, kin];

  assert.equal(world.stats.kinSpared, 0);
  world.step();
  assert.equal(world.stats.kinSpared, 1, "one hunter, one relative, one declined meal");
  world.step();
  assert.equal(world.stats.kinSpared, 2, "and again the next tick, while it is still in sight");
  assert.equal(world.stats.kills, 0, "a spared relative is never bitten");

  // The same pair in a pond that has never heard of the rule: the meal is taken
  // and the counter stays at zero, which is what makes it a measurement of this
  // mechanism and not of the pond (v1.20).
  const plain = new World(makeConfig({ seed: 1, predation: true }));
  plain.food.items = [];
  const p2 = new Creature(g.clone(), plain.config, 100, 100, rng);
  const k2 = new Creature(g.clone(), plain.config, 130, 100, rng);
  k2.radius = p2.radius * 0.5;
  plain.creatures = [p2, k2];
  plain.step();
  assert.equal(plain.stats.kinSpared, 0, "exactly zero with the mechanism off");
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
