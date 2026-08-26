// speciesnames.test.js — the names the Tree of Life wears (v1.116).
//
// A name is a label a reader is invited to trust, which makes it a stricter
// thing to ship than a number. Three properties are load-bearing and each one
// fails silently if it breaks:
//
//   * **Unique.** Two lineages answering to one name makes the legend a lie and
//     the click ambiguous. Probing, not hashing, is what guarantees it — a hash
//     wide enough to *usually* avoid a collision is exactly the thing that
//     breaks on the pond nobody tested.
//   * **Stable.** A name is chosen from the ids below it, so appending a
//     species must never rename one already on screen. A pond that renames its
//     lineages as it runs is worse than one that numbers them.
//   * **Inherited.** The first word is the family. If a branch stops taking its
//     parent's stem the whole point of the scheme is gone, and nothing on the
//     page would look wrong.
//
// Plus the one property the *word lists* have to hold, since the Chronicle
// writes in the plural: every epithet takes a plain `-s`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import {
  EPITHETS,
  STEMS,
  nameSpecies,
  speciesLabel,
  speciesPlural,
} from "../src/speciesnames.js";
import { describeMuller } from "../src/describe.js";
import { mullerShares } from "../src/mullerplot.js";
import { inspectorHTML, ancestryRow } from "../src/inspectorview.js";
import { creatureFacts } from "../src/inspect.js";

/** A tree of `{id, parentId}` in the shape `phylogeny.js` builds. */
function tree(pairs) {
  return pairs.map(([id, parentId]) => ({ id, parentId }));
}

// ---- The word lists ----

test("the word lists are clean", () => {
  assert.equal(new Set(STEMS).size, STEMS.length, "a stem appears twice");
  assert.equal(new Set(EPITHETS).size, EPITHETS.length, "an epithet appears twice");
  assert.ok(STEMS.length >= 40, "fewer stems than a default pond has founders");
  for (const w of [...STEMS, ...EPITHETS]) {
    assert.match(w, /^[A-Z][a-z]+$/, `${w} is not one capitalised word`);
  }
  // The Chronicle says "the Amber Whorls are gone". A word needing "-es" or an
  // irregular plural would read wrong there, and the sentence is assembled far
  // from this list.
  for (const w of EPITHETS) {
    assert.doesNotMatch(w, /(s|x|z|ch|sh)$/, `${w} does not take a plain -s plural`);
  }
});

// ---- Uniqueness, stability, inheritance ----

test("every lineage in a real pond gets its own name", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 6000; i++) world.step();
  const species = world.phylogeny.species;
  assert.ok(species.length > 40, "expected the tree to have grown");

  const names = nameSpecies(species);
  assert.equal(names.size, species.length, "a species went unnamed");
  const seen = new Set();
  for (const s of species) {
    const n = names.get(s.id);
    assert.ok(n, `species ${s.id} has no name`);
    assert.match(n.name, /^[A-Z][a-z]+ [A-Z][a-z]+$/, `${n.name} is not two words`);
    assert.ok(!seen.has(n.name), `two lineages are both called ${n.name}`);
    seen.add(n.name);
  }
});

test("a branch keeps its parent's family word", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 6000; i++) world.step();
  const names = nameSpecies(world.phylogeny.species);
  let branches = 0;
  for (const s of world.phylogeny.species) {
    if (s.parentId == null) continue;
    branches++;
    assert.equal(
      names.get(s.id).stem,
      names.get(s.parentId).stem,
      `species ${s.id} left the family of species ${s.parentId}`
    );
    assert.notEqual(
      names.get(s.id).epithet,
      names.get(s.parentId).epithet,
      `species ${s.id} is indistinguishable from its parent`
    );
  }
  assert.ok(branches > 0, "no lineage evolved here, so nothing was inherited");
});

test("founders of a default pond are unrelated, and are named so", () => {
  // Forty founders, forty families: `speciationDistance` guarantees no two
  // founding genomes land in one species, so no two founders may look like
  // cousins either. This is the property `pickFree` exists for — 40 draws from
  // 64 stems collide with probability ~1 under plain hashing.
  const world = new World(makeConfig({}));
  const founders = world.phylogeny.species.filter((s) => s.parentId == null);
  assert.ok(founders.length >= 40, `expected the opening deal, got ${founders.length}`);
  const names = nameSpecies(world.phylogeny.species);
  const stems = founders.map((s) => names.get(s.id).stem);
  assert.equal(new Set(stems).size, stems.length, "two unrelated founders share a family");
});

test("a name, once given, never changes", () => {
  const world = new World(makeConfig({ seed: 42 }));
  /** @type {Map<number,string>} */
  const first = new Map();
  for (let i = 0; i < 6000; i++) {
    world.step();
    if (i % 500) continue;
    const names = nameSpecies(world.phylogeny.species);
    for (const [id, n] of names) {
      if (first.has(id)) assert.equal(n.name, first.get(id), `species ${id} was renamed`);
      else first.set(id, n.name);
    }
  }
  assert.ok(first.size > 40, "the tree never grew, so nothing was at risk");
});

test("the same seed gives back the same names", () => {
  const run = () => {
    const w = new World(makeConfig({ seed: 777 }));
    for (let i = 0; i < 3000; i++) w.step();
    return [...nameSpecies(w.phylogeny.species).values()].map((n) => n.name).join("|");
  };
  assert.equal(run(), run(), "a name is not reproducible from the seed");
});

test("naming draws no random numbers", () => {
  // The second prime directive, applied to a label. `nameSpecies` is called by
  // the Chronicle, which is inside the world's own determinism guarantee.
  const world = new World(makeConfig({ seed: 21 }));
  for (let i = 0; i < 400; i++) world.step();
  const real = Math.random;
  Math.random = () => {
    throw new Error("naming drew a random number");
  };
  try {
    nameSpecies(world.phylogeny.species);
  } finally {
    Math.random = real;
  }
});

// ---- The hard cases ----

test("a family bigger than the epithet list still names everybody", () => {
  // One founder and a hundred branches off it: every one of them wants the same
  // stem, and there are only EPITHETS.length second words to go round.
  const pairs = [[0, null]];
  for (let i = 1; i <= 100; i++) pairs.push([i, 0]);
  const names = nameSpecies(tree(pairs));
  assert.equal(names.size, 101);
  assert.equal(new Set([...names.values()].map((n) => n.name)).size, 101, "a name repeated");
});

test("a parent named after its child is still a parent", () => {
  // `nameSpecies` sorts by id because id order is birth order. Handing it the
  // list backwards must not produce an orphan with a family of its own.
  const names = nameSpecies(tree([[2, 1], [1, 0], [0, null]]));
  assert.equal(names.get(2).stem, names.get(0).stem);
});

test("an unknown id falls back to the number it always had", () => {
  const names = nameSpecies(tree([[0, null]]));
  assert.equal(speciesLabel(names, 9), "species 9");
  assert.equal(speciesLabel(null, 9), "species 9");
  assert.match(speciesPlural(names, 9), /species 9/);
  assert.equal(speciesPlural(names, 0), names.get(0).name + "s");
});

// ---- What the page says with them ----

test("the Chronicle talks about lineages by name", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 8000; i++) world.step();
  const lineage = world.chronicle.events.filter((e) => e.cat === "lineage");
  assert.ok(lineage.length > 0, "no lineage events to check");
  const names = nameSpecies(world.phylogeny.species);
  const plurals = [...names.values()].map((n) => n.plural);
  // Nothing anywhere in the feed still says "Species 12" — the whole point.
  for (const e of world.chronicle.events) {
    assert.doesNotMatch(e.msg, /[Ss]pecies \d/, `still numbered: ${e.msg}`);
  }
  // And the three lines that are *about* one lineage say which. The rest of the
  // "lineage" category is about the pond as a whole ("a lineage reaches
  // generation 10") and names nobody on purpose.
  const named = lineage.filter((e) => plurals.some((p) => e.msg.includes(p)));
  assert.ok(named.length > 0, `no lineage was ever named: ${lineage.map((e) => e.msg)}`);
});

test("the Tree of Life's spoken form uses the names when it has them", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 4000; i++) world.step();
  const shares = mullerShares(world.phylogeny);
  const names = nameSpecies(world.phylogeny.species);
  const said = describeMuller(shares, world.phylogeny.snapshotSpan(), names);
  assert.doesNotMatch(said, /species \d/, `still numbered: ${said}`);
  // And without a tree it says what it always said, so a caller holding only
  // the shares is not handed a broken sentence.
  const bare = describeMuller(shares, world.phylogeny.snapshotSpan());
  assert.match(bare, /species \d/);
});

test("the inspector names the lineage and keeps the number", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 3000; i++) world.step();
  const c = world.creatures.find((x) => world.phylogeny.ancestry(x.speciesId).length > 1);
  assert.ok(c, "no creature with an ancestry to draw");
  const chain = world.phylogeny.ancestry(c.speciesId);
  const names = nameSpecies(world.phylogeny.species);
  const html = inspectorHTML(c, chain, creatureFacts(c, world.config), names);
  assert.ok(html.includes(names.get(c.speciesId).name), "the Species row is still a number");
  assert.ok(html.includes(`title="species ${c.speciesId}"`), "the number is gone entirely");
  // Every ancestry pip carries both, so the tooltip is the bridge between the
  // name on screen and the id in `docs/SCIENCE.md` and the CSV export.
  const pips = ancestryRow(c, chain, names);
  for (const s of chain.slice(-6)) {
    assert.ok(pips.includes(`${names.get(s.id).name} (species ${s.id})`), `pip ${s.id}`);
  }
});
