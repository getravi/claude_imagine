// Tests for mortality accounting (v1.21) — the pond finally saying what it
// dies of. The feature is pure bookkeeping: it reads state that already existed
// and writes only into Stats, so the first thing these tests pin down is that
// the world's trajectory is untouched by its existence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { Stats, DEATH_CAUSES, wholePercents } from "../src/stats.js";
import { RNG } from "../src/rng.js";
import { makeConfig } from "../src/config.js";

/**
 * A cheap hash of a world's exact state: every creature's position, energy,
 * age, heading and generation, plus every pellet and the headline counters.
 * Any change to the simulation at all moves this number.
 */
function fingerprint(overrides, ticks) {
  const w = new World(makeConfig(overrides));
  for (let i = 0; i < ticks; i++) w.step();
  let h = 0;
  const mix = (v) => {
    h = (Math.imul(h ^ (v | 0), 2654435761) + ((v * 1e6) | 0)) | 0;
  };
  mix(w.creatures.length);
  mix(w.stats.births);
  mix(w.stats.deaths);
  mix(w.stats.kills);
  for (const c of w.creatures) {
    mix(c.x);
    mix(c.y);
    mix(c.energy);
    mix(c.age);
    mix(c.heading);
    mix(c.generation);
  }
  for (const f of w.food.items) {
    mix(f.x);
    mix(f.y);
  }
  return h;
}

test("counting causes of death does not change a single world", () => {
  // Captured by running this same fingerprint against the sources as they stood
  // before mortality accounting existed (v1.20.0). Observation must never cost
  // the thing observed so much as a floating-point bit — if one of these moves,
  // the bookkeeping has grown a side effect and every seeded world in every
  // permalink has silently changed with it.
  assert.equal(fingerprint({ seed: 314 }, 2000), 1366343733);
  assert.equal(fingerprint({ seed: 42 }, 3000), -1793562804);
  assert.equal(fingerprint({ seed: 314, predation: false }, 1500), 1974254839);
  assert.equal(fingerprint({ seed: 7, disease: true }, 1500), 1002323393);
});

test("a creature that runs out of energy is recorded as starved", () => {
  const cfg = makeConfig({});
  const rng = new RNG(1);
  const c = new Creature(Genome.random(rng, false), cfg, 10, 10, rng, 0);
  c.energy = 0.001;
  c.act([0, 0, 0]);
  assert.equal(c.dead, true);
  assert.equal(c.deathCause, "starvation");
});

test("a creature that reaches maxAge is recorded as old, not starved", () => {
  const cfg = makeConfig({});
  const rng = new RNG(2);
  const c = new Creature(Genome.random(rng, false), cfg, 10, 10, rng, 0);
  c.energy = cfg.energyMax;
  c.age = cfg.maxAge - 1;
  c.act([0, 0, 0]);
  assert.equal(c.dead, true);
  assert.equal(c.deathCause, "age");
});

test("the first cause recorded wins — a killed creature has not starved", () => {
  const cfg = makeConfig({});
  const rng = new RNG(3);
  const c = new Creature(Genome.random(rng, false), cfg, 10, 10, rng, 0);
  // A predator empties it, then it finishes its own tick with no energy left:
  // exactly the sequence that happens inside world.step().
  c.energy = 0;
  c.die("predation");
  c.act([0, 0, 0]);
  assert.equal(c.deathCause, "predation");
});

test("a living creature has no cause of death", () => {
  const world = new World(makeConfig({ seed: 99 }));
  for (let i = 0; i < 400; i++) world.step();
  assert.ok(world.creatures.length > 0);
  for (const c of world.creatures) {
    assert.equal(c.dead, false);
    assert.equal(c.deathCause, null);
  }
});

test("every death is attributed to exactly one cause", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 4000; i++) world.step();
  const by = world.stats.deathsBy;
  const sum = DEATH_CAUSES.reduce((t, c) => t + by[c], 0);
  assert.ok(world.stats.deaths > 100, "the run should have produced deaths to attribute");
  assert.equal(sum, world.stats.deaths, "causes must account for every death, no more and no less");
});

test("the predation tally agrees with the independent kill counter", () => {
  const world = new World(makeConfig({ seed: 777 }));
  for (let i = 0; i < 6000; i++) world.step();
  assert.ok(world.stats.kills > 0, "seed 777 should evolve hunters");
  assert.equal(world.stats.deathsBy.predation, world.stats.kills);
});

test("predation deaths read exactly zero when predation is off", () => {
  // The control the whole readout depends on: a cause that can't happen must
  // report none, not a small number that looks like signal.
  const world = new World(makeConfig({ seed: 777, predation: false }));
  for (let i = 0; i < 6000; i++) world.step();
  assert.equal(world.stats.deathsBy.predation, 0);
  assert.equal(world.stats.kills, 0);
  const m = world.stats.mortality();
  assert.equal(m.counts.predation, 0);
  assert.equal(m.shares.predation, 0);
});

test("the recent-death window is bounded and holds the newest deaths", () => {
  const s = new Stats(480, 5);
  for (let i = 0; i < 40; i++) s.recordDeath({ deathCause: "starvation", age: i });
  assert.equal(s.recentDeaths.length, 5);
  assert.deepEqual(
    s.recentDeaths.map((d) => d.age),
    [35, 36, 37, 38, 39]
  );
  assert.equal(s.deathsBy.starvation, 40, "the cumulative tally keeps every death");
});

test("mortality() reports shares, a leader and a mean lifespan", () => {
  const s = new Stats();
  for (let i = 0; i < 6; i++) s.recordDeath({ deathCause: "starvation", age: 100 });
  for (let i = 0; i < 3; i++) s.recordDeath({ deathCause: "predation", age: 400 });
  s.recordDeath({ deathCause: "age", age: 4200 });
  const m = s.mortality();
  assert.equal(m.n, 10);
  assert.equal(m.leading, "starvation");
  assert.equal(m.shares.starvation, 0.6);
  assert.equal(m.shares.predation, 0.3);
  assert.equal(m.shares.age, 0.1);
  assert.equal(m.meanLifespan, (6 * 100 + 3 * 400 + 4200) / 10);
});

test("a tie resolves to a fixed order, not to whoever died last", () => {
  const a = new Stats();
  a.recordDeath({ deathCause: "predation", age: 10 });
  a.recordDeath({ deathCause: "starvation", age: 10 });
  const b = new Stats();
  b.recordDeath({ deathCause: "starvation", age: 10 });
  b.recordDeath({ deathCause: "predation", age: 10 });
  assert.equal(a.mortality().leading, b.mortality().leading);
});

test("mortality() is null until something has actually died", () => {
  const s = new Stats();
  assert.equal(s.mortality(), null);
  const world = new World(makeConfig({ seed: 314 }));
  assert.equal(world.stats.mortality(), null);
});

test("mean lifespan is a real age, never beyond the hard limit", () => {
  const cfg = makeConfig({ seed: 42 });
  const world = new World(cfg);
  for (let i = 0; i < 5000; i++) world.step();
  const m = world.stats.mortality();
  assert.ok(m.meanLifespan > 0, "creatures live for some time before dying");
  assert.ok(m.meanLifespan <= cfg.maxAge, "nothing outlives maxAge");
});

test("the chronicle names a leading cause only from a full window and a majority", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 12000; i++) world.step();
  const events = world.chronicle.events.filter((e) => e.msg.includes("leading cause"));
  assert.ok(events.length > 0, "a 12k-tick run should settle on a leading cause at least once");
  let previous = null;
  for (const e of events) {
    const pct = Number(e.msg.match(/(\d+)%/)[1]);
    assert.ok(pct >= 50, `a "leading cause" line must claim a majority, got ${pct}%`);
    assert.notEqual(e.msg, previous, "the same claim is never announced twice in a row");
    previous = e.msg;
  }
  // Never before there are enough deaths for the percentage to mean anything.
  const firstAt = events[0].tick;
  const early = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < firstAt; i++) early.step();
  assert.ok(
    early.stats.recentDeaths.length >= early.stats.deathWindow - 1,
    "the window must be full before the first announcement"
  );
});

test("the displayed percentages always add up to 100", () => {
  assert.deepEqual(wholePercents([1, 0, 0]), [100, 0, 0]);
  assert.deepEqual(wholePercents([1 / 3, 1 / 3, 1 / 3]), [34, 33, 33]);
  // 98.33 / 0 / 1.67 — the case that read "98% + 0% + 3% = 101%" on screen.
  assert.deepEqual(wholePercents([118 / 120, 0, 2 / 120]), [98, 0, 2]);
  // Exhaustive over every three-way split of a 120-death window.
  for (let a = 0; a <= 120; a++) {
    for (let b = 0; a + b <= 120; b++) {
      const p = wholePercents([a / 120, b / 120, (120 - a - b) / 120]);
      assert.equal(p[0] + p[1] + p[2], 100, `shares ${a}/${b} summed to ${p.join("+")}`);
      for (const v of p) assert.ok(v >= 0 && v <= 100);
    }
  }
});

test("two worlds from one seed die of the same things", () => {
  const a = new World(makeConfig({ seed: 555 }));
  const b = new World(makeConfig({ seed: 555 }));
  for (let i = 0; i < 3000; i++) {
    a.step();
    b.step();
  }
  assert.deepEqual(a.stats.deathsBy, b.stats.deathsBy);
  assert.deepEqual(a.stats.mortality(), b.stats.mortality());
});
