// cast.test.js — the pond's animals have names now, and one of them is the one
// to watch (v1.119).
//
// Four things worth pinning, and they are the four properties the module's
// header claims:
//
//  1. **A name is a pure function of an id.** The whole point of naming an
//     animal rather than numbering it is that you can come back to it — so the
//     same id gives the same name on a reload, in a save file and through a
//     shared link, and nothing here draws a random number. There are sixty-four
//     given names and every id lands on one of them, which is checked here and
//     counted in `test/prosecounts.test.js`.
//  2. **The star is a total order, not a scan.** `pickStar` must not depend on
//     the order of `world.creatures`, which is birth order and which
//     `shuffleTurnOrder` (v1.47) is allowed to permute. Shuffle the array and
//     the same animal has to come back.
//  3. **The ranks fire in the order the table declares.** `headline.js`'s rule:
//     an ordering that lives in the order the `if`s are typed in is an ordering
//     nobody can argue with. Each rank gets a pond built to trigger it.
//  4. **The prose clears the vocabulary bar.** The same bar `headline.js` holds
//     itself to and for the same reason: this is the sentence a visitor reads
//     about their first animal, and *carnivore*, *lineage*, *px* and *tick* are
//     words for somebody who is already here.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { nameSpecies } from "../src/speciesnames.js";
import { stateFingerprint } from "../src/fingerprint.js";
import {
  creatureIntro,
  creatureLabel,
  dietClause,
  GIANT_RATIO,
  GIVEN,
  givenName,
  LAST_MIN_PEAK,
  introduceStar,
  ordinal,
  PARENT_MIN_CHILDREN,
  pickStar,
  STAR,
} from "../src/cast.js";

const cfg = (over = {}) => makeConfig({ seed: 314, ...over });

/** A creature-shaped object — `pickStar` reads six fields and no methods. */
function beast(over = {}) {
  return {
    id: 1,
    dead: false,
    speciesId: 0,
    age: 100,
    energy: 50,
    children: 0,
    radius: 5,
    carnivory: 0.1,
    generation: 0,
    ...over,
  };
}
/**
 * A pond-shaped object. `peaks` is the tree's memory of how big each family
 * ever got, which is the one thing `pickStar` cannot compute from the living —
 * see `LAST_MIN_PEAK`.
 */
const pond = (creatures, peaks = {}) => ({
  creatures,
  phylogeny: { byId: new Map(Object.entries(peaks).map(([id, peak]) => [Number(id), { peak }])) },
});

// ---- 1. a name is a pure function of an id ----

test("a creature's name is stable, in range, and spread across the list", () => {
  for (const id of [0, 1, 7, 42, 1636, 99999]) {
    assert.equal(givenName(id), givenName(id), "the same id twice gives two names");
    assert.ok(GIVEN.includes(givenName(id)), `${givenName(id)} is not one of the names`);
  }
  // Consecutive ids must not walk the list in order — that is a numbering with
  // extra steps, which is the thing `speciesnames.js` refused for the same
  // reason. Forty consecutive ids should touch a good spread of the sixty-four.
  const run = new Set(Array.from({ length: 40 }, (_, i) => givenName(i)));
  assert.ok(run.size >= 25, `40 consecutive ids gave only ${run.size} distinct names`);
  const marching = Array.from({ length: 8 }, (_, i) => GIVEN.indexOf(givenName(i)));
  const ascending = marching.every((v, i) => i === 0 || v === marching[i - 1] + 1);
  assert.ok(!ascending, "the names march through the list in order");
});

test("the full name is the given name and the family, and degrades to the given name", () => {
  const world = new World(cfg());
  world.step();
  const c = world.creatures[0];
  const names = nameSpecies(world.phylogeny.species);
  const label = creatureLabel(c, names);
  assert.match(label, new RegExp(`^${givenName(c.id)} of the `));
  assert.ok(label.endsWith("s"), `"${label}" is not a plural family`);
  // No tree: the given name alone, exactly as `speciesLabel` falls back to the
  // number when it has no map.
  assert.equal(creatureLabel(c), givenName(c.id));
});

test("a name is stable for as long as the id is, and the id is a tab and not a world", () => {
  // The honest half, pinned so nobody reads the module's first sentence as a
  // stronger promise than it is. `creature.js` deals ids from a module-level
  // counter that never resets, so two worlds built from one seed in one process
  // — which is what Reset and Load do — hold the same animals under different
  // numbers, and therefore under different names. `docs/AUTONOMOUS.md` carries
  // the per-world serial that would close it.
  const first = new World(cfg());
  const again = new World(cfg());
  const ids = (w) => w.creatures.map((c) => c.id);
  assert.notDeepEqual(ids(first), ids(again), "ids reset between worlds — this test is obsolete, and so is the caveat");
  // What *is* promised: within one world nothing renames anybody, ever.
  const before = first.creatures.map((c) => [c.id, givenName(c.id)]);
  for (let i = 0; i < 120; i++) first.step();
  for (const [id, name] of before) assert.equal(givenName(id), name);
});

// ---- 2. the star does not depend on the order of the array ----

test("the star is the same animal however the pond is ordered", () => {
  const config = cfg();
  const crowd = Array.from({ length: 30 }, (_, i) =>
    beast({ id: i + 1, speciesId: i % 4, age: 100 + i, energy: 10 + i, radius: 4 + i * 0.05 })
  );
  const forwards = pickStar(pond(crowd), config);
  const backwards = pickStar(pond([...crowd].reverse()), config);
  const rotated = pickStar(pond([...crowd.slice(9), ...crowd.slice(0, 9)]), config);
  assert.equal(forwards.creature.id, backwards.creature.id);
  assert.equal(forwards.creature.id, rotated.creature.id);
});

test("a tie goes to the lowest id, so nothing rests on array position", () => {
  const config = cfg({ predation: false });
  const twins = [
    beast({ id: 9, energy: 80, radius: 5, age: 50 }),
    beast({ id: 4, energy: 80, radius: 5, age: 50 }),
    beast({ id: 6, energy: 80, radius: 5, age: 50 }),
  ];
  assert.equal(pickStar(pond(twins), config).creature.id, 4);
});

test("an empty pond has no star, and says so in words a person can act on", () => {
  const star = pickStar(pond([]), cfg());
  assert.equal(star, null);
  const { title, line } = introduceStar(star, cfg());
  assert.match(title, /Nobody/);
  assert.match(line, /Seed life/);
});

test("the dead are never introduced", () => {
  const config = cfg({ predation: false });
  const crowd = [
    beast({ id: 1, dead: true, energy: 999, children: 40, age: 9999, radius: 9 }),
    beast({ id: 2, energy: 10 }),
  ];
  assert.equal(pickStar(pond(crowd), config).creature.id, 2);
});

// ---- 3. the ranks fire in the order the table declares ----

test("the last of a family outranks everything else", () => {
  const config = cfg();
  const crowd = [
    ...Array.from({ length: 10 }, (_, i) => beast({ id: i + 1, speciesId: 0, children: 9, radius: 8, carnivory: 0.9 })),
    beast({ id: 99, speciesId: 3, age: 5 }),
  ];
  const star = pickStar(pond(crowd, { 0: 10, 3: 6 }), config);
  assert.equal(star.rank, STAR.LAST);
  assert.equal(star.creature.id, 99);
  assert.match(star.why, /^the last of the /);
});

test("the last of a family has to have had a family — a founder alone is not one", () => {
  // The finding from the first browser run: `Phylogeny` gives every founder its
  // own lineage, so on tick zero everybody is alone in their family and the
  // rule was true of the whole pond. Alone is a count of the living; *was once
  // more than one* is the tree's peak, and only the second makes a story.
  const config = cfg({ predation: false });
  const fresh = Array.from({ length: 12 }, (_, i) => beast({ id: i + 1, speciesId: i, energy: 10 + i }));
  const peaks = Object.fromEntries(fresh.map((_, i) => [i, 1]));
  assert.notEqual(pickStar(pond(fresh, peaks), config).rank, STAR.LAST);

  // One of them was a dynasty once. Now it is one animal, and that is the news.
  const star = pickStar(pond(fresh, { ...peaks, 4: LAST_MIN_PEAK }), config);
  assert.equal(star.rank, STAR.LAST);
  assert.equal(star.creature.speciesId, 4);
  // A tree that has never heard of the lineage cannot vouch for it either.
  assert.notEqual(pickStar(pond(fresh), config).rank, STAR.LAST);
});

test("a pond too small for a cast does not call anyone the last of anything", () => {
  const config = cfg({ predation: false });
  const crowd = [beast({ id: 1, speciesId: 0, energy: 90 }), beast({ id: 2, speciesId: 1, energy: 10 })];
  const star = pickStar(pond(crowd, { 0: 9, 1: 9 }), config);
  assert.notEqual(star.rank, STAR.LAST);
});

test("the biggest family outranks the biggest hunter", () => {
  const config = cfg();
  const crowd = [
    beast({ id: 1, speciesId: 0, children: PARENT_MIN_CHILDREN }),
    beast({ id: 2, speciesId: 0, carnivory: 0.99, radius: 9 }),
    beast({ id: 3, speciesId: 0 }),
  ];
  const star = pickStar(pond(crowd), config);
  assert.equal(star.rank, STAR.PARENT);
  assert.equal(star.creature.id, 1);
  assert.match(star.why, /^parent to more of this pond/);
  // The count belongs to the panel's live sentence and to nothing else — a
  // number frozen in the banner and a number patched every frame disagree the
  // first time anything is born while a visitor is reading.
  assert.doesNotMatch(star.why, /\d/);
});

test("with hunting switched off nobody is introduced as a hunter", () => {
  const crowd = [
    beast({ id: 1, carnivory: 0.99, radius: 9 }),
    beast({ id: 2, radius: 5, energy: 90 }),
  ];
  assert.equal(pickStar(pond(crowd), cfg({ predation: true })).rank, STAR.HUNTER);
  assert.notEqual(pickStar(pond(crowd), cfg({ predation: false })).rank, STAR.HUNTER);
});

test("a giant has to be a giant against the pond it is in", () => {
  const config = cfg({ predation: false });
  const evenly = Array.from({ length: 9 }, (_, i) => beast({ id: i + 1, radius: 5, energy: 10 + i }));
  assert.notEqual(pickStar(pond(evenly), config).rank, STAR.GIANT);
  const withGiant = [...evenly, beast({ id: 50, radius: 5 * GIANT_RATIO + 0.01 })];
  const star = pickStar(pond(withGiant), config);
  assert.equal(star.rank, STAR.GIANT);
  assert.equal(star.creature.id, 50);
});

test("the elder, then the best-fed, are what is left when nobody has a story", () => {
  const config = cfg({ predation: false });
  const flat = Array.from({ length: 9 }, (_, i) => beast({ id: i + 1, age: 100, radius: 5, energy: 10 + i }));
  const fed = pickStar(pond(flat), config);
  assert.equal(fed.rank, STAR.FED);
  assert.equal(fed.creature.id, 9);
  const withElder = [...flat, beast({ id: 50, age: 400, energy: 1 })];
  const elder = pickStar(pond(withElder), config);
  assert.equal(elder.rank, STAR.ELDER);
  assert.equal(elder.creature.id, 50);
});

test("every rank has its own number and they run lowest-is-most-urgent", () => {
  const ranks = Object.values(STAR);
  assert.equal(new Set(ranks).size, ranks.length, "two ranks share a number");
  assert.equal(Math.min(...ranks), STAR.LAST);
  assert.equal(Math.max(...ranks), STAR.FED);
});

// ---- 4. the words ----

test("the diet clause says what the animal eats, and agrees with the rule that lets it", () => {
  const config = cfg();
  const t = config.carnivoreThreshold;
  assert.equal(dietClause(beast({ carnivory: t }), config), "live on meat");
  assert.equal(dietClause(beast({ carnivory: t - 0.001 }), config), "eat a bit of everything");
  assert.equal(dietClause(beast({ carnivory: 0.05 }), config), "graze on plants");
  // The clause and `world.js`'s licence to hunt read one constant, so a config
  // that moves the licence moves the sentence with it.
  const strict = cfg({ carnivoreThreshold: 0.9 });
  assert.equal(dietClause(beast({ carnivory: 0.7 }), strict), "eat a bit of everything");
});

test("the introduction counts young and generations the way a person says them", () => {
  const config = cfg();
  assert.match(creatureIntro(beast({ children: 0, generation: 0 }), config), /have no young yet/);
  assert.match(creatureIntro(beast({ children: 1 }), config), /have raised one,/);
  assert.match(creatureIntro(beast({ children: 5 }), config), /have raised 5 young/);
  assert.match(creatureIntro(beast({ generation: 0 }), config), /were here when the pond began/);
  assert.match(creatureIntro(beast({ generation: 1 }), config), /the 2nd generation/);
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(4), "4th");
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(12), "12th");
  assert.equal(ordinal(13), "13th");
  assert.equal(ordinal(21), "21st");
  assert.equal(ordinal(112), "112th");
});

test("nothing a visitor is handed uses a word from inside this project", () => {
  // `headline.js`'s bar, applied to the other prose a newcomer meets first.
  const JARGON = /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|RNG|seed)\b/i;
  const config = cfg();
  const world = new World(config);
  for (let i = 0; i < 200; i++) world.step();
  const names = nameSpecies(world.phylogeny.species);
  const star = pickStar(world, config, names);
  const { title, line } = introduceStar(star, config, names);
  for (const s of [title, line, star.why]) {
    assert.doesNotMatch(s, JARGON, `"${s}" uses a word only somebody already here knows`);
  }
  // Every rank's sentence, not just the one this pond happened to produce.
  for (const c of world.creatures.slice(0, 20)) {
    assert.doesNotMatch(creatureIntro(c, config), JARGON);
    assert.match(creatureIntro(c, config), /^They .*\.$/);
  }
});

test("the introduction is a title and one finished sentence about somebody", () => {
  const config = cfg();
  const world = new World(config);
  for (let i = 0; i < 200; i++) world.step();
  const names = nameSpecies(world.phylogeny.species);
  const star = pickStar(world, config, names);
  const { title, line } = introduceStar(star, config, names);
  assert.match(title, /^👋 Meet /);
  assert.ok(title.includes(givenName(star.creature.id)));
  assert.match(line, /^[A-Z]/, "the reason is not capitalised");
  assert.ok(line.endsWith("."), "the introduction does not finish its sentence");
});

// ---- the page actually carries the button, and one thing drives it ----

test("the app offers the introduction, by button and by key, and one function does both", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const main = readFileSync(join(root, "src/main.js"), "utf8");
  const css = readFileSync(join(root, "style.css"), "utf8");

  assert.match(html, /id="btn-meet"[^>]*class="meet"/, "no Meet somebody button on the page");
  assert.match(html, /<kbd>M<\/kbd> meet somebody/, "the keyboard hint does not mention it");
  assert.match(css, /button\.meet\s*\{/, "the button has no rule of its own");

  // The two routes have to end in the same place. A button and a shortcut that
  // each build their own sentence is the drift `describe.js` and the panel keep
  // finding in each other (v1.77, v1.102, v1.103) — two renderings of one
  // subject assembled from two hand-written lists.
  assert.match(main, /\$\("btn-meet"\)\.addEventListener\("click", meetSomebody\)/);
  assert.match(main, /case "m":\s*\n\s*case "M":\s*\n\s*meetSomebody\(\);/);
  assert.equal((main.match(/introduceStar\(/g) ?? []).length, 1, "more than one place writes the introduction");
});

// ---- and the thing every module here has to prove ----

test("meeting somebody changes nothing about the world", () => {
  const config = cfg();
  const a = new World(config);
  const b = new World(config);
  for (let i = 0; i < 300; i++) {
    a.step();
    b.step();
    // One pond is read by the whole cast machinery on every tick; the other is
    // left alone. If any of this drew a random number or touched a field, the
    // two would part company.
    const names = nameSpecies(a.phylogeny.species);
    const star = pickStar(a, config, names);
    if (star) introduceStar(star, config, names);
  }
  assert.equal(stateFingerprint(a), stateFingerprint(b));
  assert.equal(a.creatures.length, b.creatures.length);
});
