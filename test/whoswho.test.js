// whoswho.test.js — the cast list (v1.123).
//
// The board renders the shortlist "👋 Meet somebody" picks off, and the whole
// design rests on those being one list rather than two. So the claims here are
// mostly about *agreement*:
//
//  1. **The board's first row is the button's answer.** Not approximately, and
//     not usually: the same animal and the same rank, on every pond this file
//     can build. And the board is empty exactly when the button falls through
//     to its last resort, which is the other half of the same statement.
//  2. **A row is a claim about a living animal**, one row per animal, every one
//     of them named, marked and reasoned.
//  3. **The prose clears the vocabulary bar** `cast.js`, `headline.js`,
//     `obituary.js` and `key.js` all clear.
//  4. **Reading the pond does not move it.** The purity claim, made the way
//     this project makes it: a fingerprint either side of a run of the board,
//     and a count of the random numbers it drew.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { nameSpecies } from "../src/speciesnames.js";
import { stateFingerprint, drawStream } from "../src/fingerprint.js";
import { castRoles, givenName, pickStar, STAR } from "../src/cast.js";
import {
  CAST_EMPTY,
  CAST_ID_ATTR,
  ROLE_MARK,
  castHTML,
  castRows,
  castSignature,
} from "../src/whoswho.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const page = read("app/index.html");
const main = read("src/main.js");

const cfg = (over = {}) => makeConfig({ seed: 314, ...over });
const names = (world) => nameSpecies(world.phylogeny.species);

/** A pond stepped far enough to have a cast, with its family names. */
function stepped(seed, ticks, over = {}) {
  const config = makeConfig({ seed, ...over });
  const world = new World(config);
  for (let i = 0; i < ticks; i++) world.step();
  return { world, config, names: names(world) };
}

/** A creature-shaped object, the same six fields `castRoles` reads. */
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
    hue: 200,
    ...over,
  };
}
const pond = (creatures, peaks = {}) => ({
  creatures,
  phylogeny: { byId: new Map(Object.entries(peaks).map(([id, peak]) => [Number(id), { peak }])) },
});

// ---- 1. the board and the button are one list ----

test("the board's first row is the animal the button would hand over", () => {
  // Six ponds and four moments in each: a young pond where nothing stands out,
  // one still sorting itself out, and two settled ones.
  for (const seed of [3, 42, 128, 314, 512, 999]) {
    const config = makeConfig({ seed });
    const world = new World(config);
    for (const upto of [40, 400, 1500, 4000]) {
      while (world.tick < upto) world.step();
      const nm = names(world);
      const rows = castRows(world, config, nm);
      const star = pickStar(world, config, nm);
      if (rows.length === 0) {
        // The one rank that never reaches the board: "the best-fed animal right
        // now" is a fallback, not a stand-out.
        assert.equal(star.rank, STAR.FED, `seed ${seed} at ${upto}: an empty board with a ${star.rank} star`);
        continue;
      }
      assert.equal(rows[0].id, star.creature.id, `seed ${seed} at ${upto}: the board leads with somebody else`);
      assert.equal(rows[0].rank, star.rank, `seed ${seed} at ${upto}: the same animal for two different reasons`);
      assert.notEqual(star.rank, STAR.FED, `seed ${seed} at ${upto}: the fallback reached the board`);
    }
  }
});

test("every row is a role the pond ranks, in the pond's own order", () => {
  const { world, config, names: nm } = stepped(128, 3000);
  const rows = castRows(world, config, nm);
  const ranks = rows.map((r) => r.rank);
  assert.deepEqual([...ranks].sort((a, b) => a - b), ranks, "the board is not in rank order");
  // A row cannot invent a reason: every one of them is a role `cast.js` returned.
  const roles = castRoles(world, config, nm);
  for (const row of rows) {
    assert.ok(
      roles.some((r) => r.creature.id === row.id && r.rank === row.rank && r.why === row.why),
      `row "${row.label}" is not one of the pond's roles`
    );
  }
});

test("the board does not depend on the order of the array", () => {
  // `pickStar`'s property, inherited: `shuffleTurnOrder` is allowed to permute
  // `world.creatures`, and a board that moved when it did would be a board that
  // moves when nobody presses anything.
  const config = cfg();
  const crowd = Array.from({ length: 30 }, (_, i) =>
    beast({ id: i + 1, speciesId: i % 4, age: 100 + i, energy: 10 + i, radius: 4 + i * 0.05, children: i % 7 })
  );
  const sig = (list) => castSignature(castRows(pond(list), config));
  assert.equal(sig([...crowd].reverse()), sig(crowd));
  assert.equal(sig([...crowd.slice(9), ...crowd.slice(0, 9)]), sig(crowd));
});

// ---- 2. a row is a claim about a living animal ----

test("one animal, one row — and every row is somebody still in the water", () => {
  // Sampled along a run rather than at one instant, because the thing this is
  // pinning is *sometimes* true: over twelve ponds sampled every hundred ticks
  // to six thousand, 18.2% of instants have an animal holding two roles, so a
  // single frame misses it about half the time. Two ponds and thirty instants
  // is enough to make that a certainty rather than a coin.
  let doubled = 0;
  for (const seed of [42, 314]) {
    const config = makeConfig({ seed });
    const world = new World(config);
    for (let i = 0; i < 30; i++) {
      while (world.tick % 100 !== 0 || world.tick === 0) world.step();
      world.step();
      const nm = names(world);
      const rows = castRows(world, config, nm);
      const ids = rows.map((r) => r.id);
      assert.equal(new Set(ids).size, ids.length, `seed ${seed} at ${world.tick}: an animal is on the board twice`);
      for (const id of ids) {
        const c = world.creatures.find((x) => x.id === id);
        assert.ok(c && !c.dead, `seed ${seed} at ${world.tick}: the board names ${id}, who is not alive`);
      }
      // The de-duplication is not theoretical: the animal that has raised the
      // most young is very often also the oldest (83 of the 137 dropped rows in
      // that sweep), and the biggest hunter is very often the largest animal
      // here (32 more). Without this count the rule would be dead code with a
      // test in front of it.
      doubled += castRoles(world, config, nm).length - rows.length;
    }
  }
  assert.ok(doubled > 0, "no pond here ever gave one animal two roles — rule 2 is untested");
});

test("every row carries a mark, a name and a reason", () => {
  const { world, config, names: nm } = stepped(512, 2000);
  const rows = castRows(world, config, nm);
  assert.ok(rows.length > 0, "seed 512 has nobody worth watching after 2,000 ticks");
  for (const r of rows) {
    assert.equal(r.icon, ROLE_MARK[r.rank], `rank ${r.rank} wears the wrong mark`);
    assert.ok(r.icon, `rank ${r.rank} has no mark at all`);
    assert.match(r.label, new RegExp(`^${givenName(r.id)}\\b`), `"${r.label}" is not this animal's name`);
    assert.match(r.why, /^[a-z]/, `"${r.why}" is not a clause`);
    assert.ok(Number.isFinite(r.hue), "a row with no colour cannot be found in the water");
  }
});

test("the marks are one per rank, all different, and the fallback has none", () => {
  const ranks = Object.keys(ROLE_MARK).map(Number);
  const named = Object.values(STAR).filter((r) => r !== STAR.FED);
  assert.deepEqual(ranks.sort((a, b) => a - b), named.sort((a, b) => a - b), "a rank is missing a mark, or has one it should not");
  const marks = Object.values(ROLE_MARK);
  assert.equal(new Set(marks).size, marks.length, "two roles wear the same mark");
  assert.equal(ROLE_MARK[STAR.FED], undefined, "the fallback has a mark, so somebody meant to draw it");
});

test("a hunter cannot be on the board in a pond where nothing hunts", () => {
  const { world, config, names: nm } = stepped(42, 1500, { predation: false });
  for (const r of castRows(world, config, nm)) {
    assert.notEqual(r.rank, STAR.HUNTER, "a pond with no hunting put a hunter on the board");
  }
});

test("an empty pond has an empty board, and the board says so in words", () => {
  assert.deepEqual(castRows(pond([]), cfg()), []);
  const html = castHTML([]);
  assert.ok(html.includes(CAST_EMPTY), "the empty board says nothing");
  assert.ok(!html.includes("<button"), "the empty board offers something to press");
});

// ---- the memo ----

test("the signature moves when the cast does and holds still when it does not", () => {
  const { world, config, names: nm } = stepped(314, 2000);
  const rows = castRows(world, config, nm);
  assert.ok(rows.length > 0, "no cast to key on");
  assert.equal(castSignature(castRows(world, config, nm)), castSignature(rows), "the same pond gave two signatures");
  // Take the leading animal out of the water and the board has to notice: this
  // is the memo's whole job, and a signature that survives a death leaves a
  // buried animal on screen with a button that follows them.
  const lead = world.creatures.find((c) => c.id === rows[0].id);
  lead.dead = true;
  assert.notEqual(castSignature(castRows(world, config, nm)), castSignature(rows));
});

// ---- 3. the vocabulary bar ----

test("nothing on the board uses a word only somebody already here knows", () => {
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|RNG|seed)\b/i;
  assert.doesNotMatch(CAST_EMPTY, JARGON, "the empty line reaches for a word a visitor may not have");
  const said = new Set();
  for (const seed of [3, 42, 128, 314]) {
    const { world, config, names: nm } = stepped(seed, 2500);
    for (const r of castRows(world, config, nm)) said.add(r.why);
  }
  assert.ok(said.size >= 3, `only ${said.size} kinds of reason ever appeared — the bar is barely tested`);
  for (const why of said) {
    assert.doesNotMatch(why, JARGON, `"${why}" uses a word only somebody already here knows`);
    assert.ok(!why.endsWith("."), `"${why}" is a clause and does not need a full stop`);
    assert.ok(why.length <= 80, `"${why}" is longer than a row`);
  }
});

// ---- the markup ----

test("a row is a button that names its animal and carries its number", () => {
  const { world, config, names: nm } = stepped(128, 2500);
  const rows = castRows(world, config, nm);
  const html = castHTML(rows);
  assert.equal((html.match(/<li class="castrow">/g) || []).length, rows.length);
  for (const r of rows) {
    assert.ok(html.includes(`${CAST_ID_ATTR}="${r.id}"`), `"${r.label}" has no number for the click to find`);
    assert.ok(html.includes(`aria-label="Watch ${r.label} — ${r.why}"`), `"${r.label}" is not announced as a control`);
    assert.ok(html.includes(`>${r.label}</span>`), `"${r.label}" is not on the board`);
  }
  // The mark is decoration beside a sentence that already says the role, so it
  // is hidden from a listener rather than read out as "leaf".
  assert.equal((html.match(/class="castmark" aria-hidden="true"/g) || []).length, rows.length);
  // Every colour in the produced markup is one `palette.js` hands out — a
  // hand-typed shade would end up here, since markup takes any string.
  for (const m of html.matchAll(/(?:background|color):([^;"]+)/g)) {
    assert.match(m[1].trim(), /^(hsla?|rgba?)\(/, `"${m[1].trim()}" is not a colour palette.js hands out`);
  }
});

test("the page holds the board, between the pond and its story", () => {
  assert.ok(page.includes('id="cast-list"'), "the page has nowhere to put the board");
  assert.ok(page.includes('class="whoswho"'), "the board has no section of its own");
  const key = page.indexOf('class="waterkey"');
  const who = page.indexOf('class="whoswho"');
  const chron = page.indexOf('class="chronicle"');
  assert.ok(key < who && who < chron, "the board is not between the key and the Chronicle");
  assert.match(page.slice(who, chron), /aria-labelledby="whoswho-h"/);
});

test("main.js rebuilds the board only when the cast changes, and the rows do something", () => {
  const fn = main.match(/function updateCast\(world\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "main.js no longer has an adapter for the board");
  const body = fn[0];
  assert.ok(body.includes("castRows("), "the rows are built somewhere other than whoswho.js");
  assert.ok(body.includes("view.castSig"), "the memo is not the one `viewstate.js` owns");
  assert.ok(/return;/.test(body), "the board is rebuilt on every frame");
  assert.ok(/\n  updateCast\(world\);/.test(main), "the frame loop never calls it");
  // One listener on the list, not one per row: the rows are replaced whenever
  // the cast changes, and a listener per row would be a listener per rebuild.
  const wire = main.match(/function wireCastList\(\) \{[\s\S]*?\n\}/);
  assert.ok(wire, "nothing wires the board up");
  assert.ok(wire[0].includes(`[${"${CAST_ID_ATTR}"}]`) || wire[0].includes("CAST_ID_ATTR"), "the handler does not use the module's attribute");
  // The look-up moved into `watchNamed` in v1.127, when the plates on the water
  // became pressable and a press on a name got two surfaces to arrive from. The
  // claim it has always made is unchanged and is now made in one place: a row
  // holds an id, not an animal, and the animal is fetched from the living.
  assert.ok(wire[0].includes("watchNamed("), "the board no longer hands a press to the shared handler");
  const watch = main.match(/function watchNamed\(id\) \{[\s\S]*?\n\}/);
  assert.ok(watch, "nothing takes a press on a name");
  assert.ok(watch[0].includes("!x.dead"), "a row can follow an animal the pond has already buried");
  assert.ok(/\n  wireCastList\(\);/.test(main), "the handler is never attached");
});

test("the observer's roster owns the board's memo", () => {
  const vs = read("src/viewstate.js");
  assert.match(vs, /castSig: "",/, "`castSig` is not on the roster, so a new pond keeps the old one's board");
  // And `main.js` has not grown a private copy of it, which is the bug
  // `viewstate.js` exists to make impossible.
  assert.doesNotMatch(main, /\blet castSig\b/, "main.js declares the memo itself");
});

// ---- 4. reading the pond does not move it ----

test("drawing the board moves nothing and draws no random number", () => {
  const config = makeConfig({ seed: 7 });
  const world = new World(config);
  for (let i = 0; i < 400; i++) world.step();
  const stream = drawStream(world.rng);
  const before = stateFingerprint(world);
  const drawnBefore = stream.count;
  const nm = names(world);
  for (let i = 0; i < 5; i++) castHTML(castRows(world, config, nm));
  castHTML(castRows(world, makeConfig({ seed: 7, predation: false }), nm));
  assert.equal(stateFingerprint(world), before, "the board moved the pond it was reading");
  assert.equal(stream.count, drawnBefore, "the board took numbers out of the world's stream");
});
