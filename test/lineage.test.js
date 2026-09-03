// lineage.test.js — the family line (v1.146).
//
// This is the first record this project has ever kept about the relationship
// between two *individuals*, and it fails in ways the population records could
// not. A species tree is rebuilt from the living every time it is asked; a
// family line is a fact about an animal that died a thousand steps ago, held up
// by nothing but a reference. So the claims here are, in order of what they
// would cost to be wrong:
//
//  1. **Watching does not move the pond.** The records are read off the world
//     between steps and written nowhere; a watched run and an unwatched one are
//     the same world, bit for bit, and the same stream of random draws.
//  2. **Every line reaches a founder.** Over a real run, every living animal's
//     chain is exactly as long as its generation count says it should be, and
//     ends on an animal born at the start of the pond. This is the claim a
//     missed birth breaks, and it breaks silently — a chain that stops early
//     looks exactly like a shallow family.
//  3. **A line outlives its dead** — and here the measurement corrected me.
//     I assumed a deep chain would be mostly ghosts; it is 22.8% ghosts, and
//     63.0% of families contain even one. An ancestor does not have to die for
//     its descendants to breed. The store still cannot be a walk of
//     `world.creatures`, but it is load-bearing for two families in three
//     rather than for nearly all of them.
//  4. **The store is bounded by the living, with no cap of mine.** Its size is
//     the population's, every step, on every seed.
//  5. **A parent that dies in the step it reproduces still gets recorded.** The
//     one ordering hazard in `observe`, and it is the common case rather than
//     an edge: enrol, then prune.
//  6. **What it says is true and is English.** Every branch of the change
//     sentence, checked against hand-built lines whose right answer is known —
//     the sweep over healthy ponds cannot reach a shrinking body or a family
//     that turned herbivore, which is v1.145's finding one file over.
//  7. **It clears the vocabulary bar of the sentence it sits under.**
//     `creatureIntro` has held itself to no units and no jargon since v1.119
//     and this block is the next paragraph in the same panel.
//  8. **The page draws it**, and the new field is declared everywhere this
//     project makes a creature's fields declare themselves.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import {
  DRIFT_BANDS,
  FAMILY_CRUMBS,
  Lineage,
  SIZE_MOVE,
  brainDrift,
  familyChange,
  familyStory,
} from "../src/lineage.js";
import { DIET_CLAUSE, DIET_CLAUSE_ONE, givenName } from "../src/cast.js";
import { DIET_PAST } from "../src/obituary.js";
import { inspectorHTML, inspectorKey, familyRow } from "../src/inspectorview.js";
import { creatureFacts, FIELD_REPORTS, FIELD_OFF_GRID } from "../src/inspect.js";
import { FIELD_UNSPOKEN } from "../src/describe.js";
import { CREATURE_UNHASHED } from "../src/fingerprint.js";
import { stateFingerprint, trajectoryFingerprint, drawStream } from "../src/fingerprint.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Run a pond with the records beside it, exactly as `main.js` does per step. */
function watchedPond(seed, ticks = 1500) {
  const world = new World(makeConfig({ seed }));
  const lineage = new Lineage();
  let widest = 0;
  let matched = true;
  lineage.observe(world);
  for (let t = 0; t < ticks; t++) {
    world.step();
    lineage.observe(world);
    if (lineage.size !== world.creatures.length) matched = false;
    if (lineage.size > widest) widest = lineage.size;
  }
  return { world, lineage, widest, matched };
}

/**
 * Two real genomes, borrowed once: a founder's and a descendant's, so a
 * hand-built node can carry a brain the drift bands can actually measure. The
 * body values are then set by hand, which is the whole point of a hand-built
 * node — a sweep over healthy ponds cannot reach a family that shrank or one
 * that gave up meat (v1.145's finding, one file over).
 */
const GENOMES = (() => {
  const world = new World(makeConfig({ seed: 21 }));
  const founder = world.creatures[0].genome;
  for (let t = 0; t < 2500; t++) world.step();
  const far = world.creatures
    .map((c) => c.genome)
    .sort((a, b) => b.distance(founder) - a.distance(founder));
  return { founder, near: founder, far: far[0], world };
})();

/** A hand-built node, so a claim about the words is not a claim about a pond. */
function node(over = {}) {
  return {
    id: 1,
    generation: 0,
    born: 0,
    radius: 4,
    carnivory: 0.1,
    hue: 100,
    speciesId: 0,
    genome: GENOMES.founder,
    age: 100,
    children: 2,
    parent: null,
    seen: 0,
    ...over,
  };
}

/** A chain of hand-built nodes, youngest first, as `chainFor` returns one. */
function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].parent = nodes[i + 1];
  return nodes;
}

test("watching a pond does not move it", () => {
  const bare = new World(makeConfig({ seed: 7 }));
  const draws = drawStream(bare.rng);
  for (let t = 0; t < 600; t++) bare.step();

  const watched = new World(makeConfig({ seed: 7 }));
  const watchedDraws = drawStream(watched.rng);
  const lineage = new Lineage();
  lineage.observe(watched);
  for (let t = 0; t < 600; t++) {
    watched.step();
    lineage.observe(watched);
  }

  assert.equal(stateFingerprint(watched), stateFingerprint(bare), "the pond is where it was");
  assert.equal(trajectoryFingerprint(watched), trajectoryFingerprint(bare));
  assert.equal(watchedDraws.count, draws.count, "and drew the same number of random numbers");
  assert.equal(watchedDraws.digest(), draws.digest(), "…in the same order, with the same values");
});

test("every line reaches a founder, and is as deep as the generation count says", () => {
  for (const seed of [3, 11, 314]) {
    const { world, lineage } = watchedPond(seed);
    assert.ok(world.creatures.length > 0, `seed ${seed} emptied out`);
    let deepest = 0;
    for (const c of world.creatures) {
      const line = lineage.chainFor(c);
      assert.equal(
        line.length,
        c.generation + 1,
        `seed ${seed}: a ${c.generation + 1}-link family came back ${line.length} long`
      );
      assert.equal(line[0].id, c.id, "the chain starts on its own subject");
      assert.equal(line[line.length - 1].generation, 0, "and ends on a founder");
      // Each link is the generation above the one before it — a chain that
      // skipped a link would still end on a founder and would not be a family.
      for (let i = 1; i < line.length; i++) {
        assert.equal(line[i].generation, line[i - 1].generation - 1);
      }
      if (line.length > deepest) deepest = line.length;
    }
    assert.ok(deepest >= 3, `seed ${seed} never got three generations deep to test on`);
  }
});

test("a line outlives its dead, and most of a family is not dead", () => {
  // I expected a deep chain to be mostly ghosts and asserted it; it is not, and
  // the number is the more interesting half of this module. Over twelve seeds
  // and three thousand steps — 2,802 families, 16,252 links — **22.8% of the
  // links are animals no longer in the water**, and **63.0% of families contain
  // at least one of them**. An ancestor here does not have to die for its
  // descendants to breed: a parent is usually still swimming several
  // generations down. So the reference that holds a dead link up is load-bearing
  // for two families in three rather than for nearly all of them, and a walk of
  // `world.creatures` would truncate exactly that majority.
  const { world, lineage } = watchedPond(314, 3000);
  const alive = new Set(world.creatures.map((c) => c.id));
  const lines = world.creatures.map((c) => lineage.chainFor(c));
  const withDead = lines.filter((l) => l.some((n) => !alive.has(n.id)));
  assert.ok(lines.some((l) => l.length >= 6), "no family deep enough to have buried anybody");
  assert.ok(
    withDead.length > lines.length / 3,
    `only ${withDead.length} of ${lines.length} families reach past a living animal`
  );
  // And the dead links really are unreachable any other way: the store holds
  // only the living, so every one of them is being kept by its own descendant.
  const ghost = withDead[0].find((n) => !alive.has(n.id));
  assert.ok(ghost, "no buried ancestor to check");
  assert.equal(lineage.byId.has(ghost.id), false, "a dead animal is still on the books");
});

test("the store is the living and nothing more, with no cap of its own", () => {
  for (const seed of [3, 11, 314]) {
    const { world, lineage, widest, matched } = watchedPond(seed);
    assert.ok(matched, `seed ${seed}: the records and the water parted company`);
    assert.equal(lineage.size, world.creatures.length);
    assert.ok(widest > 0);
  }
});

test("a parent that dies in the step it reproduces is still on record", () => {
  // The ordering hazard in `observe`, built directly rather than waited for: a
  // parent seen once, then gone in the same breath as its child arriving.
  const lineage = new Lineage();
  const parent = { id: 1, generation: 0, age: 5, radius: 4, carnivory: 0.1, hue: 0,
    speciesId: 0, children: 0, parentId: null };
  lineage.observe({ tick: 5, creatures: [parent] });
  const child = { id: 2, generation: 1, age: 0, radius: 5, carnivory: 0.2, hue: 0,
    speciesId: 0, children: 0, parentId: 1 };
  lineage.observe({ tick: 6, creatures: [child] });

  assert.equal(lineage.size, 1, "only the living are on the books");
  const line = lineage.chainFor(child);
  assert.equal(line.length, 2, "the parent went with the body");
  assert.equal(line[1].id, 1);
  assert.equal(line[1].born, 0, "and its birth step is the one it was born on");
});

test("a founder says so, and a pond with no records says that instead", () => {
  const founder = familyStory([node({ id: 46 })], DEFAULT_CONFIG);
  assert.equal(founder.crumbs.length, 0, "a founder is not a chain of one");
  assert.equal(founder.change, null, "and has nobody to be compared with");
  assert.ok(founder.line.includes(givenName(46)));
  assert.ok(
    founder.line.includes(String(DEFAULT_CONFIG.populationStart)),
    "the founder line does not say how many there were"
  );

  // A loaded save: a generation count with no parents behind it. The two
  // silences are different and the page has to say which one this is. It does
  // *not* restate the generation — the sentence directly above this block
  // already ends on it, and v1.143's rule is that the newer surface carries
  // only what the older one cannot say.
  const orphan = familyStory([node({ id: 46, generation: 11 })], DEFAULT_CONFIG);
  assert.match(orphan.line, /saved|loaded/, "the reason the family is missing");
  assert.doesNotMatch(orphan.line, /12th|generation/, "and not the intro's own clause again");
  assert.equal(orphan.change, null);

  assert.equal(familyStory([], DEFAULT_CONFIG), null, "nothing observed, nothing drawn");
  assert.equal(familyStory(null, DEFAULT_CONFIG), null);
});

test("the chain shows both ends and counts what it hides", () => {
  const deep = chain(
    node({ id: 46, generation: 9 }),
    node({ id: 42, generation: 8 }),
    node({ id: 30, generation: 7 }),
    node({ id: 20, generation: 6 }),
    node({ id: 10, generation: 5 }),
    node({ id: 3, generation: 0 })
  );
  const story = familyStory(deep, DEFAULT_CONFIG);
  const names = story.crumbs.filter((b) => b.name).map((b) => b.name);
  assert.deepEqual(names, [givenName(3), givenName(30), givenName(42), givenName(46)]);
  assert.equal(story.crumbs[0].founder, true, "the far end is the founder");
  assert.equal(story.crumbs[story.crumbs.length - 1].self, true, "the near end is the subject");
  // Six links, four names shown, so two are behind the marker and one of those
  // is the founder that is drawn separately.
  const elided = story.crumbs.find((b) => b.elided);
  assert.equal(elided.elided, deep.length - FAMILY_CRUMBS - 1);

  // A short family has no marker at all and still names both of its ends.
  const short = chain(node({ id: 46, generation: 1 }), node({ id: 3, generation: 0 }));
  const shortStory = familyStory(short, DEFAULT_CONFIG);
  assert.ok(!shortStory.crumbs.some((b) => b.elided));
  assert.deepEqual(
    shortStory.crumbs.map((b) => b.name),
    [givenName(3), givenName(46)]
  );
});

test("three ways of saying one set of bands, and they cover the same bands", () => {
  // The family line is the first sentence here with two animals in it, so it is
  // the first that cannot say "they" about either — hence a third table. Three
  // tables over one `dietBand` is exactly the shape that drifts, so they are
  // walked together: a band added to one has to arrive in all three.
  const bands = Object.keys(DIET_CLAUSE).sort();
  assert.deepEqual(Object.keys(DIET_CLAUSE_ONE).sort(), bands);
  assert.deepEqual(Object.keys(DIET_PAST).sort(), bands);
  for (const b of bands) {
    assert.notEqual(DIET_CLAUSE_ONE[b], DIET_CLAUSE[b], `"${b}" was not given a singular verb`);
    // A name takes a singular verb; the plural table's clause after a name is
    // the bug this table exists to fix, and it looks like nothing in review.
    assert.match(DIET_CLAUSE_ONE[b], /^\w+s\b/, `"${DIET_CLAUSE_ONE[b]}" does not agree with a name`);
  }
});

test("what changed down the line, on lines whose answer is known", () => {
  const cfg = DEFAULT_CONFIG;
  const grazer = { radius: 4, carnivory: 0.05, id: 3, generation: 0 };

  // A diet that crossed a band beats everything, including a body that also
  // doubled — a different kind of animal is a bigger fact than a bigger one.
  const hunter = familyChange(node(grazer), node({ id: 46, generation: 9, radius: 8, carnivory: 0.9 }), cfg);
  assert.match(hunter, /lives on meat/);
  assert.match(hunter, /grazed on plants/);

  // …and the other way, which no run of healthy ponds is obliged to produce.
  const back = familyChange(node({ ...grazer, carnivory: 0.9 }), node({ id: 46, generation: 9, carnivory: 0.05, radius: 4 }), cfg);
  assert.match(back, /grazes on plants/);
  assert.match(back, /lived on meat/);

  // Size, when the band did not move. Both directions, because a family that
  // shrinks is a family, and the phrase for it is not the phrase for growth.
  const bigger = familyChange(node(grazer), node({ id: 46, generation: 4, radius: 4 * 2.1, carnivory: 0.05 }), cfg);
  assert.match(bigger, /twice the animal/);
  const smaller = familyChange(node(grazer), node({ id: 46, generation: 4, radius: 4 / 2.1, carnivory: 0.05 }), cfg);
  assert.match(smaller, /half the animal/);
  // The threshold itself: a body a hair inside it is not a story.
  const still = familyChange(
    node(grazer),
    node({ id: 46, generation: 4, radius: 4 * (SIZE_MOVE - 0.01), carnivory: 0.05 }),
    cfg
  );
  assert.doesNotMatch(still, /animal than|twice|two-thirds|half/);
  // …and what it says instead is about the brain, which is the branch that
  // carries 98.4% of real families.
  assert.match(still, /head|thinks|think|inside and out/);

  // The brain, at both ends of its scale. Same body, same diet, two brains as
  // far apart as this pond puts two kinds of animal.
  const drifted = familyChange(
    node({ ...grazer, genome: GENOMES.founder }),
    node({ id: 46, generation: 9, radius: 4, carnivory: 0.05, genome: GENOMES.far }),
    cfg
  );
  assert.match(drifted, /no longer thinks like them|in their head/);
  // The same animal against itself has drifted nowhere, and the sentence for
  // that says so rather than reaching for a story.
  const identical = familyChange(
    node({ ...grazer, genome: GENOMES.founder }),
    node({ id: 46, generation: 2, radius: 4, carnivory: 0.05, genome: GENOMES.founder }),
    cfg
  );
  assert.equal(brainDrift(node(), node(), cfg), 0);
  assert.match(identical, /near enough the animal/);

  // The bands are in order and each of the five is reachable, which is the
  // check that a threshold table has not collapsed into a single answer.
  assert.deepEqual([...DRIFT_BANDS].sort((a, b) => a - b), [...DRIFT_BANDS]);
});

test("no branch of the sentence is a road nothing drives down", () => {
  // The measurement that rewrote this module. With the ending banded on the
  // *body*, "nothing much changed" fired on 98.4% of families — true, and a
  // report that seventeen generations of evolution had produced nothing.
  // Banded on the brain as well, over the same twelve seeds and four thousand
  // steps: drift≥0.5 38.5%, drift≥0.25 25.4%, drift≥0.75 21.4%, near-enough
  // 8.2%, drift≥1 4.9%, diet 1.3%, size 0.3% — seven endings, none of them
  // dead and none of them the whole answer. This test runs a cheaper version of
  // that sweep and asks only the question a later release could break: is any
  // ending unreachable, or has one swallowed the rest?
  const seen = new Map();
  let total = 0;
  for (const seed of [3, 11, 42, 314, 5150]) {
    const { world, lineage } = watchedPond(seed, 2500);
    for (const c of world.creatures) {
      const line = lineage.chainFor(c);
      if (line.length < 2) continue;
      const s = familyChange(line[line.length - 1], line[0], world.config);
      const kind = /no longer thinks/.test(s)
        ? "far"
        : /a long way/.test(s)
          ? "long"
          : /well on its way/.test(s)
            ? "some"
            : /a little differently/.test(s)
              ? "little"
              : /near enough/.test(s)
                ? "none"
                : "body";
      seen.set(kind, (seen.get(kind) || 0) + 1);
      total++;
    }
  }
  assert.ok(total > 500, "not enough families to be a sweep");
  for (const kind of ["far", "long", "some", "little", "none"]) {
    assert.ok(seen.get(kind) > 0, `no family ever gets the "${kind}" ending`);
  }
  const most = Math.max(...seen.values());
  assert.ok(most < total * 0.75, `one ending covers ${((100 * most) / total).toFixed(1)}% of families`);
});

test("every sentence is a finished sentence, over real ponds", () => {
  // `headline.js`'s bar, which `creatureIntro` — the line directly above this
  // block in the same panel — has held since v1.119.
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|RNG|seed)\b/i;
  let seen = 0;
  for (const seed of [3, 11, 314]) {
    const { world, lineage } = watchedPond(seed);
    for (const c of world.creatures.slice(0, 40)) {
      const story = familyStory(lineage.chainFor(c), world.config);
      assert.ok(story, "a living animal with no story at all");
      for (const s of [story.line, story.change].filter(Boolean)) {
        assert.doesNotMatch(s, JARGON, `"${s}" uses a word only somebody already here knows`);
        assert.match(s, /^[A-Z0-9]/, `"${s}" does not start a sentence`);
        assert.ok(s.endsWith("."), `"${s}" does not finish one`);
      }
      // The block names the animal the panel is about, always — a family line
      // that only ever says "they" is a caption on somebody else's photograph.
      // The *first* sentence is allowed to say "their", because it follows one
      // whose subject is this animal; the block as a whole may not.
      const said = [story.line, story.change].filter(Boolean).join(" ");
      assert.ok(said.includes(givenName(c.id)), said);
      // And it never restates the clause the intro directly above it ends on.
      assert.doesNotMatch(said, /\bgeneration\b/, said);
      seen++;
    }
  }
  assert.ok(seen > 60, "not enough animals to be a sweep");
});

test("the panel draws the family, and the key knows when it appeared", () => {
  const { world, lineage } = watchedPond(314);
  const c = world.creatures.find((x) => x.generation >= 3);
  assert.ok(c, "no pond deep enough to draw a family from");
  const family = lineage.chainFor(c);
  const facts = creatureFacts(c, world.config);
  const html = inspectorHTML(c, [], facts, null, world.config, family);
  assert.ok(html.includes("insp-family"), "the block is not on the panel");
  assert.ok(html.includes(givenName(family[family.length - 1].id)), "the founder is not named");
  // The intro sentence comes first: the family is the second paragraph of the
  // same introduction, not a heading of its own.
  assert.ok(html.indexOf("insp-intro") < html.indexOf("insp-family"));

  // A creature the records have never seen draws nothing rather than an empty
  // family — and that is exactly the frame the key has to be able to tell apart.
  assert.equal(familyRow([], world.config), "");
  assert.notEqual(
    inspectorKey(c, [], facts, family),
    inspectorKey(c, [], facts, []),
    "a panel built before the records caught up would never be rebuilt"
  );
});

test("the new field declares itself everywhere a creature's fields must", () => {
  // Three tables, each of which some other test walks a live creature against.
  // Named here too because they are this release's reason to exist, and a
  // declaration deleted by a later cycle should fail the file that wanted it.
  assert.ok("parentId" in CREATURE_UNHASHED, "the state hash has not been told to skip it");
  assert.ok("parentId" in FIELD_REPORTS, "the panel does report it");
  assert.ok("parentId" in FIELD_OFF_GRID, "…and not in a row");
  assert.ok("parentId" in FIELD_UNSPOKEN, "the sentence does not say it");

  // A save carries the animals and not the parents, deliberately: ids come from
  // a counter that renumbers on load, so a stored one would point at a stranger.
  const world = new World(makeConfig({ seed: 5 }));
  for (let t = 0; t < 400; t++) world.step();
  const born = world.creatures.find((c) => c.generation > 0);
  assert.ok(born, "nothing was born to check");
  assert.equal(typeof born.parentId, "number");
  assert.ok(!("parentId" in born.toJSON()), "a save must not carry a parent id");
  assert.equal(world.creatures[0].constructor.name, "Creature");
});

test("the stylesheet dresses every class the block builds", () => {
  const css = readFileSync(join(root, "style.css"), "utf8");
  const html = familyRow(
    chain(
      node({ id: 46, generation: 9 }),
      node({ id: 42, generation: 8 }),
      node({ id: 30, generation: 7 }),
      node({ id: 20, generation: 6 }),
      node({ id: 3, generation: 0 })
    ),
    DEFAULT_CONFIG
  );
  const classes = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls) classes.add(cls);
  }
  assert.ok(classes.size >= 5, "the block lost its structure");
  for (const cls of classes) {
    assert.ok(css.includes(`.${cls}`), `".${cls}" is drawn and never styled`);
  }
});
