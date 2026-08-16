import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Creature, buildBrainFor, groundSway, wallSway, auxChannel } from "../src/creature.js";
import { Genome, genomeLength, migrateGenomeData, BRAIN, AUX_ORDER } from "../src/genome.js";
import { NeuralNet } from "../src/nn.js";
import { BarrierField } from "../src/barriers.js";
import { makeConfig } from "../src/config.js";
import { assertUnaffected } from "./support/paired.js";
import { RNG } from "../src/rng.js";

const WLEN = NeuralNet.weightCount(BRAIN.inputs, BRAIN.hidden, BRAIN.outputs);

/**
 * A creature standing alone in nothing, facing east, with `rockAhead` set by
 * hand — so the only thing that can move its mind is the whisker. The mirror of
 * `loneCreature` in `test/groundSense.test.js`, one sense over.
 */
function loneCreature(config, genome, rockAhead = Infinity) {
  const c = new Creature(genome, config, 100, 100, new RNG(7));
  c.heading = 0;
  c.vx = 0;
  c.vy = 0;
  c.rockAhead = rockAhead;
  c.sense(null, Infinity, null, Infinity, null, Infinity);
  return c;
}

test("the whisker is off by default, and nothing feels anything", () => {
  const world = new World(makeConfig({ seed: 5, barriers: true }));
  assert.equal(world.config.wallSense, false);
  for (let i = 0; i < 200; i++) world.step();
  for (const c of world.creatures) {
    assert.equal(c.rockAhead, Infinity);
    assert.equal(c.wallFeel, 0);
    assert.equal(c.brain.nAux, 0);
  }
});

test("with the whisker off, a walled world is bit-for-bit unaffected", () => {
  assertUnaffected(
    new World(makeConfig({ seed: 21, barriers: true, wallSense: false })),
    new World(makeConfig({ seed: 21, barriers: true })),
    1500,
    "wallSense"
  );
});

// The riskiest thing about an extra sense is that it lengthens the genome, and
// the genome is where the RNG stream lives. Every draw site gets its own check,
// exactly as the ear did in v1.20 and the foot in v1.33.
test("the whisker costs no random draws while it is numb", () => {
  const a = new RNG(9);
  const b = new RNG(9);
  const numb = Genome.random(a);
  const feeling = Genome.random(b, false, false, true);
  assert.equal(numb.data.length, feeling.data.length);
  for (let i = 0; i < WLEN; i++) assert.equal(numb.data[i], feeling.data[i]); // same brain
  for (const w of numb.whiskerGenes) assert.equal(w, 0);
  assert.ok([...feeling.whiskerGenes].some((w) => w !== 0));
  assert.notEqual(numb.sizeGene, feeling.sizeGene); // ...and only then diverge

  // Mutation: the silent block must not consume a coin flip either.
  const m1 = new RNG(3);
  const m2 = new RNG(3);
  const child = numb.mutate(m1, 0.09, 0.16, false, false, false, false);
  const control = new Genome(numb.data.slice()).mutate(m2, 0.09, 0.16, false, false, false);
  assert.deepEqual(Array.from(child.data), Array.from(control.data));
  assert.equal(m1.float(), m2.float());

  // Crossover: same story, per gene.
  const x1 = new RNG(4);
  const x2 = new RNG(4);
  const off = Genome.crossover(numb, control, x1, false, false, false);
  Genome.crossover(numb, control, x2, false, false);
  for (const w of off.whiskerGenes) assert.equal(w, 0);
  assert.equal(x1.float(), x2.float());
});

test("mutation and crossover reach the whisker only when the sense is on", () => {
  const parent = Genome.random(new RNG(11), false, false, true);
  const other = Genome.random(new RNG(12), false, false, true);

  const untouched = parent.mutate(new RNG(1), 1, 0.5, false, false, false, false);
  assert.deepEqual(Array.from(untouched.whiskerGenes), Array.from(parent.whiskerGenes));

  const shifted = parent.mutate(new RNG(1), 1, 0.5, false, false, false, true);
  assert.notDeepEqual(Array.from(shifted.whiskerGenes), Array.from(parent.whiskerGenes));

  // Crossed with the sense off, the whisker comes wholesale from the first parent.
  const copied = Genome.crossover(parent, other, new RNG(2), false, false, false);
  assert.deepEqual(Array.from(copied.whiskerGenes), Array.from(parent.whiskerGenes));

  // The whisker is not part of who you are: species distance ignores it entirely,
  // so switching the sense on cannot redraw the tree of life.
  const numbed = new Genome(Float32Array.from(parent.data));
  numbed.whiskerGenes.fill(0);
  assert.equal(parent.distance(numbed), 0);
});

test("an older save keeps its ear and foot and gains a silent whisker", () => {
  // A v1.33–v1.101 vector: weights, plasticity, ear, foot, body — no whisker.
  const old = new Float32Array(2 * WLEN + 2 * BRAIN.hidden + 4);
  for (let i = 0; i < old.length; i++) old[i] = i + 1;
  const migrated = new Genome(migrateGenomeData(old));
  assert.equal(migrated.data.length, genomeLength());
  for (let i = 0; i < 2 * WLEN + 2 * BRAIN.hidden; i++) assert.equal(migrated.data[i], old[i]);
  for (const w of migrated.whiskerGenes) assert.equal(w, 0);
  assert.deepEqual(
    [migrated.sizeGene, migrated.metabolismGene, migrated.hueGene, migrated.dietGene],
    [old[old.length - 4], old[old.length - 3], old[old.length - 2], old[old.length - 1]]
  );

  // A pre-v1.20 vector has none of the three, and must come back with all silent.
  const ancient = new Float32Array(2 * WLEN + 4);
  for (let i = 0; i < ancient.length; i++) ancient[i] = i + 1;
  const lifted = new Genome(migrateGenomeData(ancient));
  for (const w of lifted.earGenes) assert.equal(w, 0);
  for (const w of lifted.footGenes) assert.equal(w, 0);
  for (const w of lifted.whiskerGenes) assert.equal(w, 0);
  assert.equal(lifted.dietGene, ancient[ancient.length - 1]);
});

test("the feel of the rock is 0 at the reach, 1 at the nose, and clamped outside", () => {
  const cfg = makeConfig({ barriers: true, wallSense: true, whiskerRange: 60 });
  const g = Genome.random(new RNG(2), false, false, true);
  assert.equal(loneCreature(cfg, g, Infinity).wallFeel, 0);
  assert.equal(loneCreature(cfg, g, 60).wallFeel, 0);
  assert.equal(loneCreature(cfg, g, 0).wallFeel, 1);
  assert.equal(loneCreature(cfg, g, 30).wallFeel, 0.5);
  assert.ok(loneCreature(cfg, g, 45).wallFeel < loneCreature(cfg, g, 15).wallFeel);
  // Beyond the reach reads the same as no rock at all — the sense says nothing
  // rather than saying something negative.
  assert.equal(loneCreature(cfg, g, 90).wallFeel, 0);

  // A world with no rock in it is a world of open water, so the sense reads an
  // exact zero rather than an arbitrary baseline.
  const open = makeConfig({ wallSense: true });
  assert.equal(loneCreature(open, g).wallFeel, 0);
});

test("without rock, the whisker adds exactly nothing to a brain", () => {
  // The cheapest way to protect determinism is an exact no-op: in open water the
  // sense is 0, and w*0 is exactly 0 for every finite weight, so a creature that
  // can feel the rock behaves identically to one that cannot until there is some
  // rock to feel.
  const genome = Genome.random(new RNG(31), false, false, true);
  const feeling = loneCreature(makeConfig({ wallSense: true }), genome);
  const numb = loneCreature(makeConfig({ wallSense: false }), genome);
  assert.equal(feeling.brain.nAux, 1);
  assert.equal(numb.brain.nAux, 0);
  assert.deepEqual(Array.from(feeling.think()), Array.from(numb.think()));
});

test("with rock ahead, the whisker reaches the motor commands", () => {
  const cfg = makeConfig({ barriers: true, wallSense: true });
  const genome = Genome.random(new RNG(31), false, false, true);
  const open = loneCreature(cfg, genome, Infinity);
  const against = loneCreature(cfg, genome, 4);
  assert.notDeepEqual(Array.from(open.think()), Array.from(against.think()));

  // And with the sense off the very same wall changes nothing.
  const numb = makeConfig({ barriers: true, wallSense: false });
  assert.deepEqual(
    Array.from(loneCreature(numb, genome, Infinity).think()),
    Array.from(loneCreature(numb, genome, 4).think())
  );
});

test("all three aux senses stack, and are wired in genome order", () => {
  const cfg = makeConfig({
    barriers: true,
    wallSense: true,
    terrain: true,
    groundSense: true,
    signalling: true,
  });
  const genome = Genome.random(new RNG(5), true, true, true);
  const c = loneCreature(cfg, genome, 20);
  c.ground = 2;
  c.heard = 0.3;
  c.sense(null, Infinity, null, Infinity, null, Infinity);
  assert.equal(c.brain.nAux, 3);
  // The brain's aux block is ear, then foot, then whisker; feeding the three
  // channels by hand in that order must reproduce think() exactly.
  const expected = c.brain.forward(c._in, [c.heard, c.groundFeel, c.wallFeel]);
  assert.deepEqual(Array.from(c.think()), Array.from(expected));
  assert.deepEqual(Array.from(c.brain.auxW), [
    ...genome.earGenes,
    ...genome.footGenes,
    ...genome.whiskerGenes,
  ]);
});

test("a sense's channel is where the live flags put it, not where it was declared", () => {
  // The channels are packed, so a sense's index is a function of the flags below
  // it. `groundSway` carried a comment saying the foot is the last aux channel,
  // which was true only while it was — this is that assumption made a function.
  const all = makeConfig({ signalling: true, groundSense: true, wallSense: true });
  assert.equal(auxChannel(all, "ear"), 0);
  assert.equal(auxChannel(all, "foot"), 1);
  assert.equal(auxChannel(all, "whisker"), 2);

  const noEar = makeConfig({ groundSense: true, wallSense: true });
  assert.equal(auxChannel(noEar, "ear"), -1);
  assert.equal(auxChannel(noEar, "foot"), 0);
  assert.equal(auxChannel(noEar, "whisker"), 1);

  assert.equal(auxChannel(makeConfig({}), "whisker"), -1);
  // Every entry of AUX_ORDER is addressable, and the list is what both readers
  // walk — a fourth sense added below cannot be silently unreachable.
  for (const block of AUX_ORDER) {
    assert.equal(typeof block.flag, "string");
    assert.ok(auxChannel(all, block.name) >= 0, `${block.name} has no channel with every flag on`);
  }
});

test("the foot's sway is still the foot's with a whisker behind it", () => {
  // The bug the packing rule exists to prevent: before v1.102 `groundSway`
  // probed the *last* channel, so in a world with both senses on it would have
  // been measuring the whisker and calling it the ground.
  const cfg = makeConfig({ terrain: true, groundSense: true, barriers: true, wallSense: true });
  const genome = Genome.random(new RNG(17), false, true, true);
  const c = loneCreature(cfg, genome, 20);
  c.ground = 1.5;
  c.sense(null, Infinity, null, Infinity, null, Infinity);
  assert.equal(c.brain.nAux, 2);

  // Silence one block at a time: a sway is a property of the wire it names, so
  // emptying the *other* block must leave it exactly where it was.
  const quietWhisker = new Genome(Float32Array.from(genome.data));
  quietWhisker.whiskerGenes.fill(0);
  const noWhisker = loneCreature(cfg, quietWhisker, 20);
  assert.equal(groundSway(c), groundSway(noWhisker));
  assert.equal(wallSway(noWhisker), 0);

  const quietFoot = new Genome(Float32Array.from(genome.data));
  quietFoot.footGenes.fill(0);
  const noFoot = loneCreature(cfg, quietFoot, 20);
  assert.equal(wallSway(c), wallSway(noFoot));
  assert.equal(groundSway(noFoot), 0);
});

test("wallSway measures the wire, and reads exactly 0 without one", () => {
  const genome = Genome.random(new RNG(31), false, false, true);
  const feeling = loneCreature(makeConfig({ barriers: true, wallSense: true }), genome, 20);
  const numb = loneCreature(makeConfig({ barriers: true, wallSense: false }), genome, 20);
  assert.ok(wallSway(feeling) > 0);
  assert.equal(wallSway(numb), 0);
  // Where it stands cannot change what the swing between open water and rock is:
  // the readout is a property of the brain, not of the wall it happens to face.
  const elsewhere = loneCreature(makeConfig({ barriers: true, wallSense: true }), genome, 55);
  assert.equal(wallSway(feeling), wallSway(elsewhere));

  // A silent whisker sways nothing, however loudly the sense is switched on.
  const silent = new Genome(Float32Array.from(genome.data));
  silent.whiskerGenes.fill(0);
  assert.equal(wallSway(loneCreature(makeConfig({ wallSense: true }), silent, 10)), 0);
});

test("asking a plastic brain a hypothetical does not teach it anything", () => {
  // wallSway is an observer, and an observer that alters what it looks at is not
  // an observer. A plastic brain learns from every forward pass, so the probe has
  // to run with learning suppressed (v1.33's rule, on the third sense).
  const cfg = makeConfig({ barriers: true, wallSense: true, plasticity: true });
  const genome = Genome.random(new RNG(8), false, false, true);
  genome.plasticityGenes.fill(0.5);
  const c = loneCreature(cfg, genome, 25);
  assert.equal(c.brain.plastic, true);
  const before = Float32Array.from(c.brain.w);
  wallSway(c);
  assert.deepEqual(Array.from(c.brain.w), Array.from(before));
  // ...whereas an ordinary tick does move them, which is what makes the check
  // above worth making.
  c.think();
  assert.notDeepEqual(Array.from(c.brain.w), Array.from(before));
});

test("what the whisker reports is what `blocked()` says is there", () => {
  // The sense is `firstHit` and nothing else, so the distance it reports has to
  // land on rock — the same relationship the vision overlay has to the rule it
  // plots (v1.50). Checked against `blocked()`, which is the predicate the whole
  // mechanic is made of, rather than against a second copy of the geometry.
  const cfg = makeConfig({ seed: 44, barriers: true, wallSense: true });
  const field = new BarrierField(cfg);
  const world = new World(cfg);
  let hits = 0;
  let misses = 0;
  for (let i = 0; i < 400; i++) world.step();
  // The reading is taken *before* the creature moves, so the pose to check it
  // against is the one it had at the top of the tick — not the one it is in when
  // the test looks. Recorded, then stepped once, then read: the same "read
  // before it moves" the world says about `ground` one line up.
  const pose = new Map(world.creatures.map((c) => [c.id, { x: c.x, y: c.y, heading: c.heading }]));
  world.step();
  for (const live of world.creatures) {
    const p = pose.get(live.id);
    if (!p) continue; // born during the step, and never sensed
    const c = { ...p, rockAhead: live.rockAhead, wallFeel: live.wallFeel };
    if (!Number.isFinite(c.rockAhead)) {
      misses++;
      // A miss is a claim too: nothing along the whole reach is rock. Sampled
      // rather than proved, because the exact statement is `firstHit`'s and this
      // is the independent check on it.
      for (let s = 1; s <= 12; s++) {
        const d = (s / 12) * cfg.whiskerRange;
        const x = (((c.x + Math.cos(c.heading) * d) % cfg.width) + cfg.width) % cfg.width;
        const y = (((c.y + Math.sin(c.heading) * d) % cfg.height) + cfg.height) % cfg.height;
        assert.ok(!field.blocked(x, y), `whisker missed rock at ${d.toFixed(1)}px ahead`);
      }
      continue;
    }
    hits++;
    assert.ok(c.rockAhead >= 0 && c.rockAhead <= cfg.whiskerRange);
    assert.ok(c.wallFeel > 0 && c.wallFeel <= 1);
    // Just past the reported distance is rock; just before it is not. The
    // epsilon is a hundredth of a pixel — far under the 14-pixel slabs this
    // world is built from, and far over the rounding of the intersection.
    const at = (d) => [
      (((c.x + Math.cos(c.heading) * d) % cfg.width) + cfg.width) % cfg.width,
      (((c.y + Math.sin(c.heading) * d) % cfg.height) + cfg.height) % cfg.height,
    ];
    assert.ok(field.blocked(...at(c.rockAhead + 0.01)), "nothing at the reported distance");
    if (c.rockAhead > 0.02) {
      assert.ok(!field.blocked(...at(c.rockAhead - 0.01)), "rock before the reported distance");
    }
  }
  assert.ok(hits > 0, "no creature in a walled pond ever faced a wall");
  assert.ok(misses > 0, "every creature faced a wall, which is not a pond");
});

test("the whisker is not gated on whether the rock is opaque", () => {
  // A wall you can see through is still a wall you cannot swim through, and the
  // whisker is about the second of those. `barrierOcclusion` decides what sight
  // does at a wall; it has no business deciding whether a body can feel one.
  const clear = new World(makeConfig({ seed: 44, barriers: true, wallSense: true }));
  for (let i = 0; i < 300; i++) clear.step();
  assert.ok(
    clear.creatures.some((c) => Number.isFinite(c.rockAhead)),
    "a transparent wall was invisible to the whisker as well"
  );
});

test("a world with the whisker on keeps its books, and loses it with the rock", () => {
  const world = new World(makeConfig({ seed: 3, barriers: true, wallSense: true }));
  for (let i = 0; i < 600; i++) world.step();
  assert.ok(world.creatures.length > 0);
  for (const c of world.creatures) {
    assert.equal(c.brain.nAux, 1);
    assert.ok(c.wallFeel >= 0 && c.wallFeel <= 1);
  }
  // Newborns inherit the sense from the config, not from a flag captured at
  // world birth.
  const born = world.creatures.find((c) => c.generation > 0);
  if (born) assert.equal(born.brain.nAux, 1);
  assert.equal(buildBrainFor(born ? born.genome : world.creatures[0].genome, world.config).nAux, 1);

  // Take the rock away under a living pond and the last reading goes with it:
  // a stale distance to a wall that no longer exists is the shape of bug this
  // project keeps finding (v1.99), and `syncBarriers` clears it on the spot.
  world.config.barriers = false;
  world.syncBarriers();
  for (const c of world.creatures) {
    assert.equal(c.rockAhead, Infinity);
    assert.equal(c.wallFeel, 0);
  }
});
