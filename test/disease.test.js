import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";

// A world with contagion on, deliberately generous so an epidemic actually gets
// going inside a test-sized run (the defaults are tuned for a whole afternoon).
function plagueConfig(over = {}) {
  return makeConfig({
    seed: 11,
    disease: true,
    infectionChance: 0.5,
    infectionRadius: 40,
    diseaseDuration: 120,
    diseaseReintroduce: 100,
    ...over,
  });
}

test("contagion is off by default and no creature is ever sick", () => {
  const world = new World(makeConfig({ seed: 9 }));
  assert.equal(world.config.disease, false);
  for (let i = 0; i < 1500; i++) world.step();
  assert.equal(world.stats.infections, 0);
  assert.equal(world.stats.infectedCount, 0);
  assert.equal(world.stats.immuneCount, 0);
  assert.ok(world.creatures.every((c) => !c.infected && !c.immune));
});

test("with contagion off, worlds are bit-for-bit unaffected", () => {
  const withFlag = new World(makeConfig({ seed: 12, disease: false }));
  const withoutFlag = new World(makeConfig({ seed: 12 }));
  for (let i = 0; i < 3000; i++) {
    withFlag.step();
    withoutFlag.step();
  }
  assert.equal(withFlag.creatures.length, withoutFlag.creatures.length);
  assert.equal(withFlag.stats.births, withoutFlag.stats.births);
  assert.equal(withFlag.stats.deaths, withoutFlag.stats.deaths);
  assert.equal(withFlag.stats.kills, withoutFlag.stats.kills);
  // The strongest form: the whole population, position by position.
  for (let i = 0; i < withFlag.creatures.length; i++) {
    assert.equal(withFlag.creatures[i].x, withoutFlag.creatures[i].x);
    assert.equal(withFlag.creatures[i].energy, withoutFlag.creatures[i].energy);
  }
});

test("an infection starts, spreads, and is survived", () => {
  const world = new World(plagueConfig());
  for (let i = 0; i < 2000; i++) world.step();
  assert.ok(world.stats.infections > 1, "the pathogen should pass from host to host");
  assert.ok(world.stats.recoveries > 0, "infections should run their course");
  assert.ok(world.stats.peakInfected > 1, "there should have been a real wave");
  assert.ok(world.creatures.some((c) => c.immune), "survivors should carry immunity");
  assert.ok(world.creatures.length > 0, "a plague world should not be permanently extinct");
});

test("nothing is infected before the first case is introduced", () => {
  const world = new World(plagueConfig({ diseaseReintroduce: 500 }));
  // The pathogen arrives during tick 500 — i.e. on the step that starts there.
  while (world.tick < 500) world.step();
  assert.equal(world.stats.infections, 0, "no case can exist before the first window");
  world.step();
  assert.equal(world.stats.infections, 1);
  assert.equal(world.stats.infectedCount, 1);
});

test("an infection lasts diseaseDuration ticks, then confers lifelong immunity", () => {
  const cfg = plagueConfig({ diseaseDuration: 40 });
  const world = new World(cfg);
  const patient = world.creatures[0];
  patient.infected = true;
  patient.infectedAtAge = patient.age;
  const startAge = patient.age;

  while (patient.infected && !patient.dead && patient.age - startAge < 200) world.step();
  assert.ok(!patient.dead, "the fixture creature should outlive its illness");
  assert.equal(patient.infected, false);
  assert.equal(patient.immune, true);
  assert.ok(
    patient.age - startAge >= cfg.diseaseDuration,
    "recovery must not arrive early"
  );
});

test("an immune creature is never re-infected", () => {
  const cfg = plagueConfig({ infectionChance: 1, infectionRadius: 200 });
  const world = new World(cfg);
  world.creatures[0].infected = true;
  world.creatures[0].infectedAtAge = 0;
  for (const c of world.creatures.slice(1)) c.immune = true;
  const immune = world.creatures.slice(1);
  for (let i = 0; i < 60; i++) world.step();
  assert.ok(
    immune.every((c) => !c.infected),
    "immunity must hold even under certain, unlimited-range exposure"
  );
});

test("being sick costs extra energy every tick", () => {
  const cfg = makeConfig({ disease: true });
  const rng = new RNG(3);
  const genome = Genome.random(rng);
  const healthy = new Creature(genome, cfg, 100, 100, rng);
  const sick = new Creature(genome.clone(), cfg, 100, 100, rng);
  sick.infected = true;
  sick.infectedAtAge = 0;
  // Identical brains, identical inputs (nothing sensed), so the only difference
  // in what they spend is the fever.
  healthy.sense(null, Infinity, null, Infinity, null, Infinity);
  sick.sense(null, Infinity, null, Infinity, null, Infinity);
  const out = [0, 0, 0];
  healthy.act(out);
  sick.act(out);
  assert.ok(
    Math.abs(healthy.energy - sick.energy - cfg.diseaseMetabolicCost) < 1e-9,
    "a sick creature should pay exactly diseaseMetabolicCost more per tick"
  );
});

test("a plague world is reproducible from its seed", () => {
  const a = new World(plagueConfig());
  const b = new World(plagueConfig());
  for (let i = 0; i < 2500; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.creatures.length, b.creatures.length);
  assert.equal(a.stats.infections, b.stats.infections);
  assert.equal(a.stats.recoveries, b.stats.recoveries);
  assert.equal(a.stats.peakInfected, b.stats.peakInfected);
  assert.equal(a.stats.immuneCount, b.stats.immuneCount);
  assert.deepEqual(
    a.chronicle.events.map((e) => e.tick + e.msg),
    b.chronicle.events.map((e) => e.tick + e.msg)
  );
});

test("the chronicle narrates the epidemic", () => {
  const world = new World(plagueConfig());
  for (let i = 0; i < 3000; i++) world.step();
  const disease = world.chronicle.events.filter((e) => e.cat === "disease");
  assert.ok(disease.length >= 2, "an epidemic should leave a trail in the chronicle");
  assert.ok(
    disease.some((e) => /pathogen appears/.test(e.msg)),
    "the first case should be announced"
  );
  // One-shot: no event may be reported twice, however many waves pass.
  const msgs = disease.map((e) => e.msg);
  assert.equal(new Set(msgs).size, msgs.length, "disease events must be one-shot");
});

test("a world with no pathogen writes no disease events", () => {
  const world = new World(makeConfig({ seed: 11 }));
  for (let i = 0; i < 1500; i++) world.step();
  assert.equal(world.chronicle.events.filter((e) => e.cat === "disease").length, 0);
});
