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
//  5. **The family is read off the living, not remembered.** Who is still
//     swimming is a question about the pond *now*, so `familyOf` takes the
//     creatures and never a copy: the young are the living children in the
//     order they were born, a dead one is not among them, and a life re-read
//     out of the book minutes later names whoever is alive then. The offer of
//     one of the young exists exactly when there is somebody to offer.
//  6. **It is a pure observer, and the page actually wires it.** Writing an
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
import { OMNIVORE_FROM, dietBand, givenName } from "../src/cast.js";
import {
  CAUSES,
  DIET_PAST,
  FAMILY_NAMES_SHOWN,
  FIRST_DEATH,
  LONGEVITY,
  OBITUARY_CHILD_ID,
  OBITUARY_MEET_ID,
  UNKNOWN_CAUSE,
  causeOf,
  familyLines,
  familyOf,
  longevityLine,
  nameList,
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

// ---- 5. the family, read off the living (v1.151) ----

/** A living animal, as `familyOf` reads one. */
function alive(id, parentId = null) {
  return { id, parentId, dead: false };
}

test("the family is who is alive now, eldest first, and never the dead", () => {
  const rec = obituaryFor(corpse({ id: 3, children: 4 }), null, []);
  rec.parentId = 1;
  const fam = familyOf(rec, [
    alive(1), // the parent, still here
    alive(9, 3),
    alive(5, 3),
    { id: 7, parentId: 3, dead: true }, // a child that has died
    alive(8, 4), // somebody else's child
  ]);
  assert.deepEqual(fam.young, [5, 9], "the young are the living children, eldest first");
  assert.deepEqual(fam.youngNames, [givenName(5), givenName(9)]);
  assert.equal(fam.parentAlive, true);
  assert.equal(fam.parentName, givenName(1));
  // …and the same record against an empty pond keeps the parent's name, which
  // is a fact about the id and not about who is swimming.
  const gone = familyOf(rec, []);
  assert.deepEqual(gone.young, []);
  assert.equal(gone.parentAlive, false);
  assert.equal(gone.parentName, givenName(1));
});

test("a founder, and a pond restored from a save, have no parent to name", () => {
  const founder = obituaryFor(corpse({ generation: 0 }), null, []);
  assert.equal(founder.parentId, null);
  assert.equal(familyOf(founder, []).parentName, null);
  // No sentence about a parent nobody can name — the silence is the design.
  assert.equal(
    familyLines(founder, familyOf(founder, [])).some((s) => /parent/.test(s)),
    false
  );
});

test("the family sentences say what the living say, and name the young", () => {
  const rec = obituaryFor(corpse({ id: 3, children: 3 }), null, []);
  rec.parentId = 1;

  const two = familyLines(rec, familyOf(rec, [alive(5, 3), alive(9, 3)]));
  assert.match(two[0], /Their parent was/, "a parent who is not in the water is past tense");
  assert.match(two[1], /^Two of their young are still swimming: /);
  assert.ok(two[1].includes(givenName(5)) && two[1].includes(givenName(9)));

  const one = familyLines(rec, familyOf(rec, [alive(1), alive(5, 3)]));
  assert.match(one[0], /is still swimming here/, "a parent in the water is present tense");
  assert.match(one[1], /^One of their young is still swimming: /);

  // Young who are all dead is a fact worth saying, and only when there were any.
  const none = familyLines(rec, familyOf(rec, []));
  assert.match(none[1], /None of their young/);
  const childless = obituaryFor(corpse({ children: 0, generation: 0 }), null, []);
  assert.deepEqual(familyLines(childless, familyOf(childless, [])), []);
});

test("the line only goes on while somebody is still swimming", () => {
  // The contradiction a browser walk found and twenty green tests did not: the
  // card said "they left one young behind, so the line goes on" directly above
  // "none of their young are still swimming".
  const rec = obituaryFor(corpse({ id: 3, children: 2 }), null, []);
  assert.match(
    obituaryLines(rec, config).sentences[2],
    /line goes on/,
    "with nobody asked about, the sentence is the one v1.121 wrote"
  );
  assert.match(obituaryLines(rec, config, familyOf(rec, [alive(5, 3)])).sentences[2], /line goes on/);
  const orphaned = obituaryLines(rec, config, familyOf(rec, [])).sentences[2];
  assert.doesNotMatch(orphaned, /line goes on/);
  assert.match(orphaned, /They left 2 young behind\.$/);
  const html = obituaryHTML(rec, config, familyOf(rec, []));
  assert.equal(/line goes on/.test(html), false, "the card contradicted itself");
  assert.match(html, /None of their young/);
});

test("a long family is named up to a point and then counted", () => {
  assert.equal(nameList(["Vale"]), "Vale");
  assert.equal(nameList(["Vale", "Wren"]), "Vale and Wren");
  assert.equal(nameList(["Vale", "Wren", "Fen"]), "Vale, Wren and Fen");
  assert.equal(nameList(["Vale", "Wren", "Fen", "Ash", "Pip"]), "Vale, Wren, Fen and 2 more");
  // The cap is the constant, not a number typed into the sentence.
  const many = Array.from({ length: FAMILY_NAMES_SHOWN + 1 }, (_, i) => `N${i}`);
  assert.match(nameList(many), /and 1 more$/);
  // A word is never printed twice — two animals called Quill read as a stutter,
  // which is what the first browser walk of this card actually said. The count
  // is the family's, not the list's.
  assert.equal(nameList(["Quill", "Arlo", "Quill", "Fen", "Ash", "Bay"]), "Quill, Arlo, Fen and 3 more");
  assert.equal(nameList(["Quill", "Quill"]), "Quill and 1 more");
  assert.equal(nameList(["Quill", "Quill", "Quill"]), "Quill and 2 more");
});

test("the card offers one of the young, and only when there is one to offer", () => {
  const rec = obituaryFor(corpse({ id: 3, children: 2 }), null, []);
  const withHeir = obituaryHTML(rec, config, familyOf(rec, [alive(9, 3), alive(5, 3)]));
  assert.ok(withHeir.includes(`id="${OBITUARY_CHILD_ID}"`));
  assert.ok(withHeir.includes(`👋 Meet ${givenName(5)}`), "the offer is the eldest of the young");
  assert.ok(withHeir.includes(`data-id="5"`));
  // No young, no button — a card that leads nowhere keeps the door it had.
  const alone = obituaryHTML(rec, config, familyOf(rec, []));
  assert.equal(alone.includes(`id="${OBITUARY_CHILD_ID}"`), false);
  assert.ok(alone.includes(`id="${OBITUARY_MEET_ID}"`), "and the old door is still there");
  // A card written before anybody asked about the family is the card it was.
  assert.equal(obituaryHTML(rec, config).includes(`id="${OBITUARY_CHILD_ID}"`), false);
});

test("nothing the family says is a word only somebody already here knows", () => {
  const JARGON = /\b(carnivor\w*|herbivor\w*|lineage|genome|offspring|tick|ticks|px|pixels?)\b/i;
  const rec = obituaryFor(corpse({ id: 3, children: 9 }), null, []);
  rec.parentId = 1;
  const ponds = [
    [],
    [alive(1)],
    [alive(5, 3)],
    [alive(1), alive(5, 3), alive(9, 3)],
    [alive(1), ...Array.from({ length: 9 }, (_, i) => alive(20 + i, 3))],
    // Past the end of the word list, where a lazier sentence would open with a
    // numeral. Beyond anything a pond has been seen to do, and still English.
    [alive(1), ...Array.from({ length: 30 }, (_, i) => alive(20 + i, 3))],
  ];
  for (const pond of ponds) {
    for (const s of familyLines(rec, familyOf(rec, pond))) {
      assert.doesNotMatch(s, JARGON, `"${s}" uses a word only somebody already here knows`);
      assert.match(s, /^[A-Z]/, `"${s}" does not start a sentence`);
      assert.match(s, /\.$/, `"${s}" does not end one`);
    }
  }
});

test("a life is not an instrument, so the switch cannot hide it (v1.151)", () => {
  // v1.149 put the apparatus behind a switch and left this note: *any future
  // feature that hides part of this page owes the same check to every surface
  // that points at another one*. The debt ran the other way. The card had lived
  // inside `#inspector` since v1.121, `#inspector` is `data-expert`, and every
  // visit starts on the side of the switch where that is hidden — so the life
  // of the animal a visitor had been watching was written into an element they
  // could not see. A browser walk found it: the button reported itself present
  // and not visible.
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const at = html.indexOf('id="obituary"');
  assert.ok(at > 0, "the page has no card to write a life into");
  const aside = html.indexOf("<aside");
  assert.ok(at < aside, "the life belongs under the water, not in the column of instruments");
  // Every instrument the switch hides is in the aside or in the tree below it,
  // so *nothing* above the aside carries the attribute — which is the whole
  // assertion: the life is on the side of the page that always shows.
  assert.equal(
    html.slice(0, aside).includes("data-expert"),
    false,
    "something above the water is now hideable, so this test has stopped meaning what it says"
  );
  const src = readFileSync(join(root, "src/main.js"), "utf8");
  assert.match(src, /life\.innerHTML = view\.obitCard \? obituaryHTML/);
  assert.match(src, /panel\.innerHTML = EMPTY_HINT/, "the fact grid goes back to its hint");
});

test("a real pond's family is the pond's own, and the page wires the offer", () => {
  const w = new World(makeConfig({ seed: 31 }));
  for (let i = 0; i < 1500; i++) w.step();
  // Somebody with living young: the pond has thousands of parent links by now.
  const parent = w.creatures.find((c) => w.creatures.some((x) => !x.dead && x.parentId === c.id));
  assert.ok(parent, "no animal in this pond has a living child, so this test measured nothing");
  const rec = obituaryFor(parent, nameSpecies(w.phylogeny.species), w.stats.recentDeaths);
  const fam = familyOf(rec, w.creatures);
  assert.ok(fam.young.length > 0);
  for (const id of fam.young) {
    const kid = w.creatures.find((c) => c.id === id);
    assert.equal(kid.parentId, rec.id);
    assert.equal(kid.dead, false);
  }
  const html = obituaryHTML(rec, w.config, fam);
  for (const s of familyLines(rec, fam)) assert.ok(html.includes(s), `the card left out "${s}"`);

  const src = readFileSync(join(root, "src/main.js"), "utf8");
  assert.match(src, /familyOf\(view\.obitCard, world\.creatures\)/);
  assert.match(src, /getElementById\(OBITUARY_CHILD_ID\)/);
  // The press re-asks the living rather than trusting the draw, and takes the
  // first of the young still swimming rather than insisting on the one the
  // button is named after — a browser walk lost the eldest inside two seconds
  // at 20× while six siblings were still in the water.
  assert.match(src, /heir\.addEventListener\("click", \(\) => meetTheirYoung\(family\)\)/);
  assert.match(src, /family\.young\.find\(\(id\) => world\.creatures\.some/);
  // And a listener is told the same thing a reader is shown, in both places a
  // life is spoken: at the death, and out of the book of the dead.
  assert.equal(src.match(/familyLines\(/g).length, 2);
});

// ---- 6. a pure observer the page actually wires ----

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
