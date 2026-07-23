import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
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

test("snapshot history is bounded", () => {
  const cfg = makeConfig({ seed: 7 });
  const world = new World(cfg);
  for (let i = 0; i < 6000; i++) world.step();
  assert.ok(world.phylogeny.snapshots.length <= cfg.phylogenyHistory);
});
