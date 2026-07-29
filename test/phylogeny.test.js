import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Phylogeny } from "../src/phylogeny.js";
import { makeConfig } from "../src/config.js";

test("every founder is classified into a species", () => {
  const cfg = makeConfig({ seed: 1 });
  const world = new World(cfg);
  // Founders are far apart genetically, so each starts as its own species with
  // no parent in the tree.
  assert.equal(world.phylogeny.species.length, cfg.populationStart);
  for (const c of world.creatures) {
    assert.ok(c.speciesId >= 0, "creature should have a species id");
  }
  for (const s of world.phylogeny.species) {
    assert.equal(s.parentId, null, "founding species have no parent");
  }
});

test("new species branch off as lineages drift", () => {
  const world = new World(makeConfig({ seed: 5 }));
  for (let i = 0; i < 6000; i++) world.step();
  const branched = world.phylogeny.species.filter((s) => s.birthTick > 0);
  assert.ok(branched.length > 0, "some species should emerge after the founders");
  // A branched species must point at a real parent species.
  for (const s of branched) {
    assert.ok(s.parentId != null, "a branched species has a parent");
    assert.ok(world.phylogeny.byId.has(s.parentId), "parent species exists");
  }
});

test("species go extinct and are recorded", () => {
  const world = new World(makeConfig({ seed: 5 }));
  for (let i = 0; i < 6000; i++) world.step();
  const extinct = world.phylogeny.species.filter((s) => s.extinctTick >= 0);
  assert.ok(extinct.length > 0, "most founding lineages should die out");
  // Living count never exceeds total species ever.
  assert.ok(world.phylogeny.livingCount() <= world.phylogeny.species.length);
});

test("phylogeny is deterministic for a fixed seed", () => {
  const a = new World(makeConfig({ seed: 314 }));
  const b = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 2500; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.phylogeny.species.length, b.phylogeny.species.length);
  assert.equal(a.phylogeny.livingCount(), b.phylogeny.livingCount());
  assert.equal(a.phylogeny.snapshots.length, b.phylogeny.snapshots.length);
});

test("every living creature belongs to a known species", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 3000; i++) world.step();
  for (const c of world.creatures) {
    assert.ok(world.phylogeny.byId.has(c.speciesId), "species id must resolve");
  }
});

test("a founder's ancestry is just itself", () => {
  const world = new World(makeConfig({ seed: 1 }));
  for (const s of world.phylogeny.species) {
    const chain = world.phylogeny.ancestry(s.id);
    assert.equal(chain.length, 1, "a founding species has no ancestors");
    assert.equal(chain[0].id, s.id);
  }
});

test("ancestry walks a lineage back to a founder", () => {
  const world = new World(makeConfig({ seed: 5 }));
  for (let i = 0; i < 6000; i++) world.step();
  const ph = world.phylogeny;
  let deepest = 0;
  for (const c of world.creatures) {
    const chain = ph.ancestry(c.speciesId);
    assert.ok(chain.length >= 1, "a living creature has a chain");
    // Oldest first, ending with the creature's own species...
    assert.equal(chain[chain.length - 1].id, c.speciesId);
    // ...starting at a founder...
    assert.equal(chain[0].parentId, null, "the chain roots in a founder");
    // ...with every link a true parent of the next, born no later than it.
    for (let i = 1; i < chain.length; i++) {
      assert.equal(chain[i].parentId, chain[i - 1].id, "consecutive links are parent/child");
      assert.ok(chain[i].birthTick >= chain[i - 1].birthTick, "children are born after parents");
    }
    if (chain.length > deepest) deepest = chain.length;
  }
  assert.ok(deepest > 1, "at least one lineage should have branched by now");
});

test("ancestry of an unknown species is empty", () => {
  const world = new World(makeConfig({ seed: 1 }));
  assert.deepEqual(world.phylogeny.ancestry(99999), []);
  assert.deepEqual(world.phylogeny.ancestry(null), []);
});

test("ancestry terminates on a malformed (cyclic) tree", () => {
  const world = new World(makeConfig({ seed: 1 }));
  const ph = world.phylogeny;
  const [a, b] = ph.species;
  a.parentId = b.id; // a loop the real tree can never build, but the UI must survive
  b.parentId = a.id;
  const chain = ph.ancestry(a.id);
  assert.equal(chain.length, 2, "a cycle is walked at most once per species");
  assert.equal(chain[chain.length - 1].id, a.id);
});

test("ancestry is deterministic for a fixed seed", () => {
  const a = new World(makeConfig({ seed: 314 }));
  const b = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 2500; i++) {
    a.step();
    b.step();
  }
  const chains = (w) => w.creatures.map((c) => w.phylogeny.ancestry(c.speciesId).map((s) => s.id));
  assert.deepEqual(chains(a), chains(b));
});

test("snapshot history is bounded", () => {
  const cfg = makeConfig({ seed: 7 });
  const world = new World(cfg);
  for (let i = 0; i < 6000; i++) world.step();
  assert.ok(world.phylogeny.snapshots.length <= cfg.phylogenyHistory);
});

// ---- The abundance record covers the whole run (v1.30) ----
//
// It used to be a ring of `phylogenyHistory` snapshots, so the Tree of Life
// showed the last ~3,120 ticks and dropped the rest with no tell. These pin
// both halves: that the record now reaches back to the first sample, and that
// coarsening it cannot lose a lineage or invent one.

/** Drive a Phylogeny directly with fake populations — no simulation needed. */
function feed(ph, samples) {
  samples.forEach((ids, i) => {
    ph.sample({ creatures: ids.map((id) => ({ speciesId: id })) }, i * ph.sampleInterval);
  });
}

test("the abundance record still starts where the run started", () => {
  const cfg = makeConfig({ seed: 11 });
  const world = new World(cfg);
  // Long enough to overflow the record several times over.
  for (let i = 0; i < 12000; i++) world.step();
  const ph = world.phylogeny;

  const span = ph.snapshotSpan();
  assert.equal(span.from, 0, "the oldest snapshot is the run's first sample");
  assert.equal(span.to, world.tick - (world.tick % cfg.phylogenySampleInterval));
  assert.ok(ph.snapshotStride > 1, "the record must have coarsened by now");
  // The old ring would have covered only this much of the run at the far end.
  const ringSpan = cfg.phylogenyHistory * cfg.phylogenySampleInterval;
  assert.ok(span.to - span.from > 3 * ringSpan, "far more history than the old ring held");
});

test("coarsening partitions the run exactly — no gap, no overlap", () => {
  const ph = new Phylogeny(makeConfig({ phylogenyHistory: 8 }));
  feed(
    ph,
    Array.from({ length: 500 }, () => [0, 0, 1]),
  );
  // Every raw sample is inside exactly one window: the spans must sum to the
  // number of samples taken. An aggregate two cancelling errors can satisfy is
  // no test, so also check the windows tile the tick axis end to end.
  const totalSpan = ph.snapshots.reduce((a, s) => a + s.span, 0);
  assert.equal(totalSpan, ph.snapshotsSeen);
  assert.equal(ph.snapshotsSeen, 500);
  for (let i = 1; i < ph.snapshots.length; i++) {
    const prev = ph.snapshots[i - 1];
    assert.equal(
      ph.snapshots[i].tick,
      prev.tick + prev.span * ph.sampleInterval,
      "window " + i + " begins exactly where the one before it ends",
    );
  }
});

test("a lineage that lived for one sample survives every halving", () => {
  const ph = new Phylogeny(makeConfig({ phylogenyHistory: 8 }));
  const samples = Array.from({ length: 500 }, () => [0, 0, 0, 0]);
  samples[3] = [0, 0, 0, 42]; // a mayfly species, alive for one sample only
  feed(ph, samples);

  assert.ok(ph.snapshotStride >= 32, "sanity: the record halved repeatedly");
  const seen = ph.snapshots.filter((s) => (s.counts.get(42) || 0) > 0);
  assert.equal(seen.length, 1, "it appears in exactly the window it lived in");
  // Attenuated to its true share of that window — one creature in four, for one
  // sample out of `span` — rather than dropped, which is what discarding every
  // second sample would have done to it.
  const w = seen[0];
  assert.ok(Math.abs(w.counts.get(42) / w.total - 1 / (4 * w.span)) < 1e-12);
});

test("bands never sum to more than the whole, at any resolution", () => {
  const ph = new Phylogeny(makeConfig({ phylogenyHistory: 8 }));
  feed(
    ph,
    // A ragged population so windows merge unequal totals.
    Array.from({ length: 400 }, (_, i) => Array.from({ length: 1 + (i % 7) }, (_, k) => k % 3)),
  );
  for (const s of ph.snapshots) {
    let sum = 0;
    for (const n of s.counts.values()) sum += n;
    assert.equal(sum, s.total, "counts account for the whole population of the window");
  }
});

test("the record stays bounded however long the run is", () => {
  const cap = 16;
  const ph = new Phylogeny(makeConfig({ phylogenyHistory: cap }));
  for (let i = 0; i < 4000; i++) {
    ph.sample({ creatures: [{ speciesId: 0 }] }, i * ph.sampleInterval);
    assert.ok(ph.snapshots.length <= cap, "never exceeds its capacity");
  }
  assert.equal(ph.snapshots[0].tick, 0, "and index 0 is never the one evicted");
});
