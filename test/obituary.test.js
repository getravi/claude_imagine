// obituary.test.js — the life the panel writes when its subject dies (v1.121).
//
// Five things worth pinning, and they are the five claims the module's header
// makes:
//
//  1. **Every way of dying has a sentence.** `CAUSES` is keyed by the strings
//     `Creature.die` is called with, and a fourth cause could otherwise ship
//     with an obituary that says only "They died." The table is closed against
//     `stats.js#DEATH_CAUSES` in both directions.
//  2. **The subject is not in its own comparison, and the comparison is a
//     middle.** `Stats.recentDeaths`'s newest entry *is* the death being
//     reported, and a centre that includes it drags every verdict toward *about
//     average* — with one prior death the ratio is pinned near 1 however long
//     the animal lived. Three halves are checked: the first death in a pond
//     gets the first-death line, a long life against one short peer reads as
//     long rather than as average, and a right-skewed window — the shape a
//     pond's lifespans actually have — is measured against its middle and not
//     its mean, because the word in the sentence is *most*.
//  3. **The bands are a table, not a chain of `if`s.** `LONGEVITY` has to be
//     ordered, has to reach zero, and each band has to be the one a ratio inside
//     it lands on — `cast.js`'s rule, for `cast.js`'s reason.
//  4. **The prose clears the vocabulary bar.** The same bar `headline.js` and
//     `cast.js` hold themselves to. This is the last thing a visitor reads about
//     the one animal they were given a reason to care about; *carnivore*,
//     *lineage*, *px* and *tick* are words for somebody already here.
//  5. **It is a pure observer, and the page actually wires it.** Writing an
//     obituary must not move the world's state hash, must not touch the RNG, and
//     the button the card draws must be one `main.js` binds — a card with a dead
//     button is worse than no card.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { DEATH_CAUSES } from "../src/stats.js";
import { nameSpecies } from "../src/speciesnames.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { OMNIVORE_FROM, dietBand } from "../src/cast.js";
import {
  CAUSES,
  DIET_PAST,
  FIRST_DEATH,
  LONGEVITY,
  OBITUARY_MEET_ID,
  UNKNOWN_CAUSE,
  causeOf,
  longevityLine,
  obituaryFor,
  obituaryHTML,
  obituaryLines,
} from "../src/obituary.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = makeConfig({ seed: 7 });

/** A body that has just died — the record only ever reads these fields. */
function corpse(over = {}) {
  return {
    id: 3,
    hue: 210,
    speciesId: 0,
    dead: true,
    deathCause: "age",
    age: 400,
    generation: 2,
    children: 1,
    carnivory: 0.1,
    ...over,
  };
}

// ---- 1. every way of dying has a sentence ----

test("the cause table covers exactly the causes a creature can die of", () => {
  for (const cause of DEATH_CAUSES) {
    assert.ok(cause in CAUSES, `nothing is said about a creature that died of "${cause}"`);
  }
  for (const cause of Object.keys(CAUSES)) {
    assert.ok(DEATH_CAUSES.includes(cause), `CAUSES names "${cause}", which nothing dies of`);
  }
});

test("a cause the table has never heard of still gets a sentence", () => {
  assert.equal(causeOf(corpse({ deathCause: "vanished" })), UNKNOWN_CAUSE);
  assert.equal(causeOf(corpse({ deathCause: null })), UNKNOWN_CAUSE);
});

// ---- 2. the subject is not in its own comparison ----

test("the first death in a pond is not measured against itself", () => {
  // The window holds exactly this death, so there is no peer and no ratio.
  const rec = obituaryFor(corpse({ age: 400 }), null, [{ cause: "age", age: 400 }]);
  assert.equal(rec.peers, 0);
  assert.equal(rec.peerTypical, null);
  assert.equal(longevityLine(rec), FIRST_DEATH);
});

test("a long life against one short peer reads as long, not as average", () => {
  const deaths = [{ cause: "starvation", age: 100 }, { cause: "age", age: 400 }];
  const rec = obituaryFor(corpse({ age: 400 }), null, deaths);
  assert.equal(rec.peers, 1);
  assert.equal(rec.peerTypical, 100);
  // Included in its own mean the ratio would be 400/250 = 1.6 — the right band
  // here by luck. Two peers is where the two readings part, so check that too.
  assert.equal(longevityLine(rec), LONGEVITY[0].line);

  const many = [
    { cause: "starvation", age: 100 },
    { cause: "starvation", age: 100 },
    { cause: "age", age: 400 },
  ];
  const rec2 = obituaryFor(corpse({ age: 400 }), null, many);
  assert.equal(rec2.peerTypical, 100); // not 200, which is what including itself gives
  assert.equal(longevityLine(rec2), LONGEVITY[0].line);
});

test("the middle of the window is what `most` is measured against, not the mean", () => {
  // A right-skewed window, which is the shape a pond's lifespans actually have:
  // a crowd of newborns that never fed, and one animal that got going. The mean
  // is 220 and the middle is 10, and a life of 300 is plainly longer than most
  // of these — a mean would call it about average.
  const skewed = [10, 10, 10, 10, 1000].map((age) => ({ age }));
  const rec = obituaryFor(corpse({ age: 300 }), null, [...skewed, { age: 300 }]);
  assert.equal(rec.peerTypical, 10, "the middle of the window, not its mean");
  assert.equal(longevityLine(rec), LONGEVITY[0].line);
});

test("a window of nobody, and a window of ages that are all zero, both hold", () => {
  assert.equal(longevityLine(obituaryFor(corpse(), null, [])), FIRST_DEATH);
  const flat = obituaryFor(corpse({ age: 0 }), null, [{ age: 0 }, { age: 0 }]);
  assert.equal(flat.peerTypical, 0);
  assert.equal(longevityLine(flat), FIRST_DEATH);
});

// ---- 3. the bands are a table ----

test("the longevity bands are ordered, reach the floor, and each claims its own range", () => {
  for (let i = 1; i < LONGEVITY.length; i++) {
    assert.ok(LONGEVITY[i].from < LONGEVITY[i - 1].from, "the bands must descend");
  }
  assert.equal(LONGEVITY[LONGEVITY.length - 1].from, 0, "the last band is the floor");

  // A ratio just inside each band lands on that band and no other.
  for (let i = 0; i < LONGEVITY.length; i++) {
    const band = LONGEVITY[i];
    const above = i === 0 ? band.from + 1 : LONGEVITY[i - 1].from;
    const ratio = (band.from + above) / 2;
    const rec = { peers: 1, peerTypical: 100, age: 100 * ratio };
    assert.equal(longevityLine(rec), band.line, `ratio ${ratio} should read as "${band.line}"`);
  }
});

// ---- 4. the prose clears the vocabulary bar ----

test("nothing an obituary says is a word only somebody already here knows", () => {
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|RNG|seed)\b/i;
  const said = [];
  for (const cause of [...DEATH_CAUSES, "vanished"]) {
    for (const generation of [0, 3]) {
      for (const children of [0, 1, 4]) {
        for (const carnivory of [0.05, 0.5, 0.95]) {
          const rec = obituaryFor(
            corpse({ deathCause: cause, generation, children, carnivory }),
            null,
            [{ age: 100 }, { age: 400 }]
          );
          const { title, sentences } = obituaryLines(rec, config);
          said.push(title, ...sentences);
        }
      }
    }
  }
  for (const s of said) {
    assert.doesNotMatch(s, JARGON, `"${s}" uses a word only somebody already here knows`);
    assert.doesNotMatch(s, /\d+\.\d/, `"${s}" reads a gene out as a number`);
  }
  // And the sentences are sentences: each ends in a full stop.
  for (const s of said.filter((_, i) => i % 4 !== 0)) assert.match(s, /\.$/);
});

test("every diet band has a past tense, and the three bands are the ones cast.js draws", () => {
  const bands = new Set();
  for (const carnivory of [0, OMNIVORE_FROM - 0.01, OMNIVORE_FROM, config.carnivoreThreshold, 1]) {
    bands.add(dietBand({ carnivory }, config));
  }
  assert.deepEqual([...bands].sort(), Object.keys(DIET_PAST).sort());
});

test("the two family lines say what the numbers say", () => {
  const none = obituaryLines(obituaryFor(corpse({ children: 0 }), null, []), config);
  assert.match(none.sentences[2], /line ends here/);
  const one = obituaryLines(obituaryFor(corpse({ children: 1 }), null, []), config);
  assert.match(one.sentences[2], /one young/);
  const many = obituaryLines(obituaryFor(corpse({ children: 6 }), null, []), config);
  assert.match(many.sentences[2], /6 young/);
  const founder = obituaryLines(obituaryFor(corpse({ generation: 0 }), null, []), config);
  assert.match(founder.sentences[1], /among the first here/);
});

// ---- 5. a pure observer the page actually wires ----

test("writing an obituary moves nothing in the pond", () => {
  const w = new World(makeConfig({ seed: 31 }));
  for (let i = 0; i < 400; i++) w.step();
  const before = stateFingerprint(w);
  const names = nameSpecies(w.phylogeny.species);
  const body = corpse({ id: w.creatures[0].id, hue: w.creatures[0].hue });
  const rec = obituaryFor(body, names, w.stats.recentDeaths);
  obituaryHTML(rec, w.config);
  assert.equal(stateFingerprint(w), before, "the card wrote to the pond it read");
  // …and it copied the life out rather than keeping the body.
  assert.equal(Object.values(rec).some((v) => v === body), false);
});

test("a real death in a real pond produces a card with a name and a family", () => {
  const w = new World(makeConfig({ seed: 31, predation: true }));
  let victim = null;
  for (let i = 0; i < 4000 && !victim; i++) {
    const before = new Map(w.creatures.map((c) => [c.id, c]));
    w.step();
    for (const [id, c] of before) if (c.dead && !w.creatures.some((x) => x.id === id)) victim = c;
  }
  assert.ok(victim, "nothing died in four thousand steps, so this test measured nothing");
  const names = nameSpecies(w.phylogeny.species);
  const rec = obituaryFor(victim, names, w.stats.recentDeaths);
  const { title, sentences } = obituaryLines(rec, w.config);
  assert.match(title, /\S/);
  assert.equal(sentences.length, 3);
  const html = obituaryHTML(rec, w.config);
  for (const s of sentences) assert.ok(html.includes(s), `the card left out "${s}"`);
  assert.ok(html.includes(`id="${OBITUARY_MEET_ID}"`));
});

test("main.js takes the record when it notices the death, and binds the card's button", () => {
  // The page cannot be executed here, so it is read — the habit v1.120 used for
  // the switch column, and for the same reason: a card whose button nothing
  // listens to looks finished and is not.
  const src = readFileSync(join(root, "src/main.js"), "utf8");
  assert.match(src, /obituaryFor\(c, namesForTree\(world\.phylogeny\), world\.stats\.recentDeaths\)/);
  assert.match(src, /getElementById\(OBITUARY_MEET_ID\)/);
  assert.match(src, /again\.addEventListener\("click", meetSomebody\)/);
  // And it lets the body go: a panel holding a dead creature is the one place
  // on this page that would keep one alive.
  assert.match(src, /view\.obitCard = obituaryFor[\s\S]{0,120}renderer\.selected = null/);
});
