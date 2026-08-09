// speciation.test.js — where the branches of the Tree of Life come from.
//
// The tree's headline caption has said "N species ever" since v1.6, and that
// number is dominated by an event that is not evolution: forty founders are
// forty species because two random genomes are 0.87–1.31 apart on this metric
// and `speciationDistance` is 0.15. `speciesOrigin` splits the three ways a
// species can start, and these tests pin the split rather than the count — the
// counts move with the seed, the partition does not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { Phylogeny, MULLER_MIN_PEAK, speciesOrigin } from "../src/phylogeny.js";
import { describeLineages } from "../src/describe.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";

test("origin is total: every species is exactly one of the three", () => {
  const world = new World(makeConfig({ seed: 5 }));
  for (let i = 0; i < 3000; i++) world.step();
  const kinds = new Set(["founding", "arrived", "evolved"]);
  for (const s of world.phylogeny.species) {
    assert.ok(kinds.has(speciesOrigin(s)), `unclassified species ${s.id}`);
  }
  const tally = world.phylogeny.originTally();
  assert.equal(
    tally.founding + tally.arrived + tally.evolved,
    world.phylogeny.species.length,
    "the tally must partition the species list, not sample it"
  );
});

test("the opening deal is every founder, and it is not evolution", () => {
  const cfg = makeConfig({ seed: 1 });
  const world = new World(cfg);
  const tally = world.phylogeny.originTally();
  assert.equal(tally.founding, cfg.populationStart);
  assert.equal(tally.evolved, 0, "nothing has been born yet");
  assert.equal(tally.arrived, 0);
});

test("no two founders could ever share a species", () => {
  // The reason the line above is `populationStart` and not a measurement: the
  // threshold is nowhere near the distance between two random genomes, so the
  // count of founding species is a fact about `populationStart` and about
  // nothing else. Pin the gap, not the count it produces.
  const world = new World(makeConfig({ seed: 7 }));
  let min = Infinity;
  const g = world.creatures.map((c) => c.genome);
  for (let i = 0; i < g.length; i++) {
    for (let j = i + 1; j < g.length; j++) min = Math.min(min, g[i].distance(g[j]));
  }
  assert.ok(
    min > 4 * DEFAULT_CONFIG.speciationDistance,
    `closest founder pair ${min.toFixed(3)} should dwarf the threshold ` +
      `${DEFAULT_CONFIG.speciationDistance}`
  );
});

test("an evolved species is descent, and it carries a living parent", () => {
  const world = new World(makeConfig({ seed: 5 }));
  for (let i = 0; i < 6000; i++) world.step();
  const evolved = world.phylogeny.species.filter((s) => speciesOrigin(s) === "evolved");
  assert.ok(evolved.length > 0, "6,000 ticks should branch at least once");
  for (const s of evolved) {
    assert.ok(s.parentId != null, "a branch descends from something");
    assert.ok(world.phylogeny.byId.has(s.parentId), "and that something is on the tree");
    assert.ok(s.birthTick > 0, "a branch cannot predate the first birth");
  }
  // And it is the rare arm: the deal is much the larger number.
  const tally = world.phylogeny.originTally();
  assert.ok(
    tally.evolved < tally.founding,
    `evolved ${tally.evolved} should be the minority against founding ${tally.founding}`
  );
});

test("a stranger posted into a running pond is not a branch", () => {
  const world = new World(makeConfig({ seed: 3 }));
  for (let i = 0; i < 200; i++) world.step();
  const before = world.phylogeny.originTally();
  world.addRandomCreatures(3);
  const after = world.phylogeny.originTally();
  assert.equal(after.evolved, before.evolved, "a random genome evolved from nothing");
  assert.equal(after.founding, before.founding, "and the deal is over");
  assert.ok(after.arrived > before.arrived, "so it arrived");
});

test("the tally is pure observation and does not read the pond back", () => {
  // `originTally` walks the species list every frame. It must not touch it.
  const world = new World(makeConfig({ seed: 11 }));
  for (let i = 0; i < 500; i++) world.step();
  const before = world.phylogeny.species.map((s) => JSON.stringify([s.id, s.parentId, s.birthTick, s.count]));
  world.phylogeny.originTally();
  world.phylogeny.originTally();
  const after = world.phylogeny.species.map((s) => JSON.stringify([s.id, s.parentId, s.birthTick, s.count]));
  assert.deepEqual(after, before);
});

test("the caption names the split and the arms sum to the total", () => {
  const line = describeLineages({ founding: 40, arrived: 0, evolved: 5 }, 38, 7);
  assert.match(line, /45 ever/, "the arms must add up to the headline number");
  assert.match(line, /40 founding/);
  assert.match(line, /5 evolved/);
  assert.doesNotMatch(line, /arrived/, "a permanently-zero arm is furniture");
  assert.match(line, /38 species alive/);
  assert.match(line, /7 extinct/);

  const withArrivals = describeLineages({ founding: 40, arrived: 2, evolved: 5 }, 30, 17);
  assert.match(withArrivals, /47 ever/);
  assert.match(withArrivals, /2 arrived/, "once the valve has tripped, say so");
});

test("the Chronicle announces a branch, and only a branch", () => {
  const world = new World(makeConfig({ seed: 5 }));
  for (let i = 0; i < 6000; i++) world.step();
  const branchLines = world.chronicle.events.filter((e) => e.icon === "🌿");
  const eligible = world.phylogeny.species.filter(
    (s) => speciesOrigin(s) === "evolved" && s.peak >= MULLER_MIN_PEAK
  );
  assert.ok(eligible.length > 0, "seed 5 should grow a band-sized branch");
  assert.equal(
    branchLines.length,
    eligible.length,
    "one line per branch that earned a band — no more, no fewer"
  );
  // The guard that matters: forty founders start a species each on tick 0 and
  // not one of them is news. A line at tick 0 would be v1.16's burnout again.
  for (const e of branchLines) assert.ok(e.tick > 0, "a founder was announced as a branch");
});

test("the Chronicle says a branch once, however long it lives", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 6000; i++) world.step();
  const said = world.chronicle.events.filter((e) => e.icon === "🌿").map((e) => e.msg);
  assert.equal(new Set(said).size, said.length, "a lineage was announced twice");
});

test("the plot and the sentence use one number for what counts as a lineage", () => {
  // A hand-copied 4 in `chronicle.js` would let the band and the line disagree
  // about which lineages exist — v1.61's colour literal, one module over.
  const ph = new Phylogeny(makeConfig({ seed: 1 }));
  const mk = (peak) => ({ id: peak, parentId: 0, birthTick: 1, peak, count: 0 });
  ph.species = [mk(MULLER_MIN_PEAK - 1), mk(MULLER_MIN_PEAK)];
  const drawn = ph.displaySpecies();
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].peak, MULLER_MIN_PEAK);
});
