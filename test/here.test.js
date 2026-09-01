// here.test.js — the mark that says which offer you already took (v1.139).
//
// Seven claims. The first four are about the comparison itself, which is small
// enough to check exhaustively and has exactly one way to be catastrophically
// wrong — `NOBODY === NOBODY` — that would light every sentence in the panel at
// once. The last three are about a real pond, because the *shape* of what the
// mark does is a fact about how often this page names the same animal twice,
// and no fixture knows that.
//
// The sweep constants are pinned as inequalities with room either side, as
// `feed.test.js`'s are: what they protect is the finding that an animal press
// lights several lines and a family press lights one, and a pond in which that
// stopped being true is one where this feature should be built differently.

import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { nameSpecies, speciesPlural } from "../src/speciesnames.js";
import { HERE_LABEL, NOBODY, isHere } from "../src/here.js";
import { WATCH_LABEL } from "../src/milestones.js";
import { STORY_LABEL } from "../src/memorial.js";
import { feedHTML, feedRows, feedSignature } from "../src/feed.js";

/** The pond as the feed asks about it, with nothing buried yet. */
function lookups(world) {
  const alive = new Set();
  const families = new Set();
  for (const c of world.creatures) {
    if (c.dead) continue;
    alive.add(c.id);
    families.add(c.speciesId);
  }
  const names = nameSpecies(world.phylogeny.species);
  return {
    alive: (id) => alive.has(id),
    familyHere: (id) => families.has(id),
    familyName: (id) => speciesPlural(names, id),
    remembered: () => false,
  };
}

/** A pond far enough in to have said something about somebody. */
function pond(seed, ticks = 4000) {
  const world = new World(makeConfig({ seed }));
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

/**
 * A run, sampled — never one instant of one.
 *
 * This project's own note, and it cost two of the tests below a first draft:
 * **the end of a run is the most biased instant there is.** Every animal the
 * Chronicle has named has had the whole run to die in by then, so a pond
 * stopped at tick 4,000 and asked for a line about somebody still alive
 * frequently has none — which is the 36.6% `feed.js` measured, met head-on. A
 * reader stands at every instant, so the tests do too.
 */
function* sampled(seed, ticks = 6000, every = 250) {
  const world = new World(makeConfig({ seed }));
  for (let t = 0; t <= ticks; t++) {
    if (t > 0) world.step();
    if (t % every === 0) yield world;
  }
}

test("a row is here when the page is on the thing it points at", () => {
  assert.ok(isHere({ who: 7, sp: NOBODY, told: NOBODY }, { who: 7 }));
  assert.ok(isHere({ who: NOBODY, sp: 3, told: NOBODY }, { sp: 3 }));
  assert.ok(isHere({ who: NOBODY, sp: NOBODY, told: 9 }, { told: 9 }));
  assert.ok(!isHere({ who: 7, sp: NOBODY, told: NOBODY }, { who: 8 }));
});

test("nobody is never somebody", () => {
  // The one way this comparison could be catastrophically wrong. A row about
  // the pond carries −1 in all three fields and so does a page showing nobody;
  // a bare `a === b` would call every sentence on the panel the place the
  // visitor is standing.
  const nothing = { who: NOBODY, sp: NOBODY, told: NOBODY };
  assert.equal(isHere(nothing, nothing), false);
  assert.equal(isHere(nothing, { who: 4, sp: 5, told: 6 }), false);
  assert.equal(isHere({ who: 4, sp: 5, told: 6 }, nothing), false);
  assert.equal(isHere(), false, "no arguments at all is not a match either");
});

test("the three kinds do not mark each other", () => {
  // The ids come from three different counters and nothing stops an animal and
  // a lineage sharing a number, so the fields have to be compared like with
  // like. A page watching animal 3 must not light a row about family 3.
  const row = { who: NOBODY, sp: 3, told: NOBODY };
  assert.equal(isHere(row, { who: 3, sp: NOBODY, told: NOBODY }), false);
  assert.equal(isHere(row, { who: NOBODY, sp: 3, told: NOBODY }), true);
  // And a page can be on more than one at once — meeting somebody does not put
  // a lit lineage out — so any single match is enough.
  const showing = { who: 11, sp: 3, told: NOBODY };
  assert.ok(isHere({ who: 11, sp: NOBODY, told: NOBODY }, showing));
  assert.ok(isHere({ who: NOBODY, sp: 3, told: NOBODY }, showing));
});

test("only a control is ever here", () => {
  // A sentence has no offer to withdraw. Every line about the pond itself keeps
  // the shape it had however the page is pointed.
  const world = pond(42);
  const look = lookups(world);
  const subject = feedRows(world.chronicle.events, look).find((r) => r.who >= 0);
  assert.ok(subject, "no line about a living animal, so this proves nothing");
  const rows = feedRows(world.chronicle.events, { ...look, showing: { who: subject.who } });
  for (const r of rows) {
    if (!r.live) assert.equal(r.here, false, `"${r.msg}" was marked without being a control`);
  }
  assert.ok(rows.some((r) => r.here), "the animal the page is on lit nothing");
});

test("an animal press lights more than one line and a family press lights one", () => {
  // The finding this release rests on, and the reason the mark is a comparison
  // against the page's state rather than a memory of the press: a press that
  // marked only the row pressed would be doing four fifths less than this.
  //
  // Measured over twelve seeds, six thousand steps, sampled every fifty: an
  // animal press lights a mean of 2.39 lines and more than one 80.7% of the
  // time (2,328 presses, max 5); a family press lights exactly one, 2,130
  // times out of 2,130. One pond, sampled the same way, is enough to hold the
  // shape of that.
  let animals = 0;
  let animalLines = 0;
  let animalMulti = 0;
  let families = 0;
  for (const world of sampled(7)) {
    const look = lookups(world);
    const rows = feedRows(world.chronicle.events, look);
    const seen = new Set();
    for (const r of rows) {
      if (r.who >= 0 && !seen.has(`w${r.who}`)) {
        seen.add(`w${r.who}`);
        const lit = feedRows(world.chronicle.events, {
          ...look,
          showing: { who: r.who },
        }).filter((x) => x.here).length;
        animals++;
        animalLines += lit;
        if (lit > 1) animalMulti++;
        assert.ok(lit >= 1, "the row pressed did not light itself");
      }
      if (r.sp >= 0 && !seen.has(`s${r.sp}`)) {
        seen.add(`s${r.sp}`);
        const lit = feedRows(world.chronicle.events, {
          ...look,
          showing: { sp: r.sp },
        }).filter((x) => x.here).length;
        families++;
        assert.equal(lit, 1, `a family press lit ${lit} lines`);
      }
    }
  }
  assert.ok(animals > 0 && families > 0, "this pond offers only one kind of press");
  assert.ok(
    animalLines / animals > 1.2,
    `an animal press lights a mean of ${(animalLines / animals).toFixed(2)} lines; the sweep says 2.39`
  );
  assert.ok(
    animalMulti / animals > 0.4,
    `${((100 * animalMulti) / animals).toFixed(1)}% of animal presses light more than one line; the sweep says 80.7%`
  );
});

test("the mark replaces the offer rather than joining it", () => {
  // v1.51's rule, one turn further on: a control that says *Show me* while the
  // page is already showing it is a control that lied about what pressing it
  // would do. The row keeps its shape — the same three spans in the same order
  // — and the word at the end of it is the only thing that moves.
  let world = null;
  let look = null;
  let subject = null;
  for (const w of sampled(1234)) {
    const l = lookups(w);
    const s = feedRows(w.chronicle.events, l).find((r) => r.who >= 0);
    if (!s) continue;
    world = w;
    look = l;
    subject = s;
    break;
  }
  assert.ok(subject, "no instant in this run had a line about a living animal");
  const before = feedRows(world.chronicle.events, look);
  const after = feedRows(world.chronicle.events, { ...look, showing: { who: subject.who } });
  const lit = after.filter((r) => r.here);
  assert.ok(lit.length > 0);
  for (const r of lit) {
    assert.equal(r.label, HERE_LABEL);
    assert.ok(!r.label.includes(WATCH_LABEL) && !r.label.includes(STORY_LABEL));
    assert.match(r.action, /^You are watching /, "the accessible name still offered the press");
  }
  // Nothing else about the row moved: the same lines, the same sentences, the
  // same subjects, in the same order.
  assert.equal(after.length, before.length);
  for (let i = 0; i < after.length; i++) {
    assert.equal(after[i].line, before[i].line);
    assert.equal(after[i].key, before[i].key);
    assert.equal(after[i].kind, before[i].kind);
  }
  // And in the markup: one `aria-current` per lit row, and the label on it.
  const html = feedHTML(after);
  assert.equal((html.match(/aria-current="true"/g) || []).length, lit.length);
  assert.equal((html.match(/ here"/g) || []).length, lit.length);
  assert.ok(html.includes(HERE_LABEL));
  assert.equal((feedHTML(before).match(/aria-current/g) || []).length, 0);
});

test("the signature moves when the visitor moves and the pond does not", () => {
  // The mark is the only input to this panel that a *visitor* changes: meeting
  // somebody writes no line and buries nobody. Without it in the signature the
  // panel would return on its first comparison and go on offering to show you
  // what you are already looking at.
  const world = pond(80808);
  const look = lookups(world);
  const rows = feedRows(world.chronicle.events, look);
  const subject = rows.find((r) => r.who >= 0);
  assert.ok(subject, "no line about a living animal, so this proves nothing");
  const idle = feedSignature(rows);
  const watching = feedSignature(
    feedRows(world.chronicle.events, { ...look, showing: { who: subject.who } })
  );
  assert.notEqual(idle, watching, "the panel could not tell that the page had moved");
  // And back again: nothing is remembered, so letting go restores the panel to
  // exactly what it was.
  assert.equal(feedSignature(feedRows(world.chronicle.events, look)), idle);
});
