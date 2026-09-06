// lineup.test.js — the cast board's portraits (v1.158).
//
// The board has always said *pick one to follow*, and until this release it
// handed a reader a 14 px rounded square and three hundred moving darts to find
// its owner among. Each row now carries the animal itself, drawn the way the
// pond draws it, and every row on the board at one shared scale.
//
// A drawing makes claims a sentence does not, so this file checks the ones the
// figure would be worthless without:
//
//  1. **The three channels it draws are birth constants.** `radius`,
//     `carnivory` and `hue` are assigned once in `creature.js`'s constructor and
//     never again — which is what makes `castSignature`'s `rank:id` a complete
//     key for the picture as well as for the sentence, and what makes copying
//     them onto a row safe. `portrait.js` needed the first of the three and
//     proved it; this figure needs all three.
//  2. **One scale, and it is the largest that fits.** Every body on a board is
//     drawn at the same multiple of its real radius, nothing overflows the box
//     at either end of what a genome can be, and no room is left over.
//  3. **The picture agrees with the sentence.** The biggest stand-out is the
//     biggest drawing; the nose is `render.js`'s own rule read off the source
//     rather than a second copy of it; a row's drawing belongs to the animal
//     that row names.
//  4. **It reaches the page, and it is owned.** One svg per row, no swatch left
//     behind, unique gradient ids, and the note written from the module that
//     holds the words rather than typed into the markup.
//  5. **Reading the pond does not move it**, the way every observer here says
//     it: a fingerprint either side, and a count of the random numbers drawn.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { nameSpecies } from "../src/speciesnames.js";
import { stateFingerprint, drawStream } from "../src/fingerprint.js";
import { NOSE } from "../src/key.js";
import { castHTML, castRows } from "../src/whoswho.js";
import {
  LINEUP_BOX,
  LINEUP_GLOW,
  LINEUP_NOTE,
  LINEUP_PAD,
  lineupLayout,
  lineupSvg,
} from "../src/lineup.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const page = read("app/index.html");
const main = read("src/main.js");

/** A pond stepped far enough to have a cast, with its family names. */
function stepped(seed, ticks) {
  const config = makeConfig({ seed });
  const world = new World(config);
  for (let i = 0; i < ticks; i++) world.step();
  return { world, config, names: nameSpecies(world.phylogeny.species) };
}

/** A row-shaped object: the four fields the drawing reads. */
const row = (radius, hunter, id = 1, hue = 200) => ({ id, radius, hunter, hue });

// ---- 1. what the figure draws cannot move under it ----

test("the three things a portrait draws are dealt at birth and never written again", () => {
  const src = read("src/creature.js");
  for (const field of ["radius", "carnivory", "hue"]) {
    const writes = src.match(new RegExp(`this\\.${field}\\s*=[^=]`, "g")) || [];
    assert.equal(
      writes.length,
      1,
      `\`${field}\` is written ${writes.length} times in creature.js — a cast row ` +
        "carries a copy of it, and a copy of something that moves is a stale picture"
    );
  }
  // And nowhere else either: a module that reaches in and repaints somebody is
  // the same failure at arm's length. `render.js` is excluded on purpose — it
  // assigns these names on a drawing context, never on a creature.
  for (const file of ["world.js", "creature.js", "genome.js", "main.js", "whoswho.js"]) {
    const other = read(`src/${file}`).match(/\.(radius|carnivory|hue)\s*=[^=]/g) || [];
    assert.equal(
      other.length,
      file === "creature.js" ? 3 : 0,
      `${file} writes something a cast row has already copied`
    );
  }
});

test("over a real run, a row's copy still matches the animal it named", () => {
  // Four ponds, because a settled cast turns over slowly: seed 314 alone puts
  // eight animals on the board in fifteen hundred ticks, and a claim about a
  // copy going stale wants more animals than that passing through it.
  const seen = new Map();
  for (const seed of [314, 42, 1234, 2718]) {
    const { world, config } = stepped(seed, 900);
    for (let i = 0; i < 1500; i++) {
      world.step();
      if (i % 25) continue;
      for (const r of castRows(world, config, nameSpecies(world.phylogeny.species))) {
        const key = `${seed}:${r.id}`;
        const was = seen.get(key);
        if (was) {
          assert.equal(r.radius, was.radius, `creature ${r.id} changed size under the board`);
          assert.equal(r.hue, was.hue, `creature ${r.id} changed colour under the board`);
          assert.equal(r.hunter, was.hunter, `creature ${r.id} changed diet under the board`);
        }
        seen.set(key, r);
      }
    }
  }
  assert.ok(seen.size > 20, `only ${seen.size} animals ever reached a board — too few to test`);
});

// ---- 2. one scale, largest that fits, nothing outside the box ----

test("every animal on a board is drawn at the same multiple of its real size", () => {
  const boards = [
    [row(4, false, 1), row(7.2, true, 2), row(5.5, false, 3)],
    [row(6, true, 1), row(6, true, 2)],
    [row(3.2, false, 1)],
  ];
  for (const rows of boards) {
    const { scale, bodies } = lineupLayout(rows);
    for (let i = 0; i < rows.length; i++) {
      assert.ok(
        Math.abs(bodies[i].r - rows[i].radius * scale) < 1e-9,
        "a body was drawn at a scale of its own — the board's sizes are decoration"
      );
    }
  }
});

test("the scale is the largest that fits — something is always touching an edge", () => {
  // Not *which* limit binds, which is a fact about the constants (today it is
  // the glow, top and bottom, on every case here). The property is that no room
  // goes unused: a board drawn at 90% of what fits is a board of animals
  // smaller than they need to be, and nothing else here would notice.
  const halfW = LINEUP_BOX.w / 2;
  const cy = LINEUP_BOX.h / 2;
  const boards = [
    [row(4, false, 1), row(7.2, true, 2)],
    [row(7.2, true, 1), row(7.2, false, 2)],
    [row(5.8, false, 1)],
  ];
  for (const rows of boards) {
    const { bodies } = lineupLayout(rows);
    let slack = Infinity;
    for (const b of bodies) {
      slack = Math.min(slack, halfW - LINEUP_PAD - (b.r * (b.nose + 1)) / 2);
      slack = Math.min(slack, cy - LINEUP_PAD - b.r * 0.85);
      slack = Math.min(slack, halfW - b.r * (LINEUP_GLOW + (b.nose - 1) / 2));
      slack = Math.min(slack, cy - b.r * LINEUP_GLOW);
    }
    assert.ok(
      Math.abs(slack) < 1e-9,
      `${slack.toFixed(2)} units of the box go unused — the board is drawing small`
    );
  }
});

test("nothing is drawn outside its box, at either end of what a genome can be", () => {
  const cfg = makeConfig({ seed: 1 });
  const boards = [
    ["the extremes", [row(cfg.bodyRadiusMin, false, 1), row(cfg.bodyRadiusMax, true, 2)]],
    ["four hunters", [row(6, true, 1), row(7, true, 2), row(4, true, 3), row(5, true, 4)]],
    ["nobody at all", [row(0, false, 1), row(cfg.bodyRadiusMax, false, 2)]],
  ];
  for (const [what, rows] of boards) {
    for (const b of lineupLayout(rows).bodies) {
      assert.ok(b.cx - b.r >= -1e-9, `${what}: a tail left the box`);
      assert.ok(b.cx + b.r * b.nose <= LINEUP_BOX.w + 1e-9, `${what}: a nose left the box`);
      assert.ok(b.r * 0.85 <= LINEUP_BOX.h / 2 - LINEUP_PAD + 1e-9, `${what}: a body is too tall`);
      // The glow is fitted with no padding: it fades to nothing at its own rim,
      // so one ending on an edge ends invisibly and one ending past it is cut
      // off mid-gradient — a soft light with a straight side.
      assert.ok(b.cx - b.r * LINEUP_GLOW >= -1e-9, `${what}: a glow left the box`);
      assert.ok(
        b.cx + b.r * LINEUP_GLOW <= LINEUP_BOX.w + 1e-9,
        `${what}: a glow left the box`
      );
      assert.ok(b.r * LINEUP_GLOW <= LINEUP_BOX.h / 2 + 1e-9, `${what}: a glow left the box`);
    }
  }
});

test("a board of one animal still draws it, and a board of none draws nothing", () => {
  assert.equal(lineupSvg([]).length, 0, "an empty board found something to draw");
  const solo = lineupLayout([row(5.1, false, 1)]);
  assert.ok(solo.bodies[0].r > 0, "the only stand-out on the board was not drawn");
});

// ---- 3. the picture and the sentence say the same thing ----

test("the biggest stand-out is the biggest drawing", () => {
  const { world, config } = stepped(1234, 2500);
  let boards = 0;
  for (let i = 0; i < 2000; i++) {
    world.step();
    if (i % 50) continue;
    const rows = castRows(world, config, nameSpecies(world.phylogeny.species));
    if (rows.length < 2) continue;
    boards++;
    const { bodies } = lineupLayout(rows);
    const big = rows.reduce((a, b, i) => (b.radius > rows[a].radius ? i : a), 0);
    for (let j = 0; j < rows.length; j++) {
      if (rows[j].radius === rows[big].radius) continue;
      assert.ok(
        bodies[big].r > bodies[j].r,
        "an animal the board calls bigger was drawn smaller than one it does not"
      );
    }
  }
  assert.ok(boards > 15, `only ${boards} boards had two animals on them — too few to test`);
});

test("the nose is the pond's own rule, not a second copy of it", () => {
  // `render.js` decides a silhouette in two lines and this figure has to agree
  // with them, so they are read back rather than remembered.
  const src = read("src/render.js");
  assert.match(src, /c\.carnivory >= cfg\.carnivoreThreshold/, "the water no longer sets a nose here");
  assert.match(
    src,
    new RegExp(`isPredator \\? ${NOSE.hunter} : ${NOSE.prey}`),
    "the water draws a nose this board does not"
  );
  // And the flag a row carries is that same predicate, over a real pond — the
  // hunter's shape is unconditional in the water, so a world with the hunting
  // rule switched off still draws daggers and this board still has to.
  for (const predation of [true, false]) {
    const config = makeConfig({ seed: 42, predation });
    const world = new World(config);
    for (let i = 0; i < 2000; i++) world.step();
    const live = new Map(world.creatures.filter((c) => !c.dead).map((c) => [c.id, c]));
    const rows = castRows(world, config, nameSpecies(world.phylogeny.species));
    assert.ok(rows.length > 0, `a pond with predation ${predation} grew no cast`);
    for (const r of rows) {
      const c = live.get(r.id);
      assert.equal(
        r.hunter,
        c.carnivory >= config.carnivoreThreshold,
        `the board drew ${r.id} with the wrong silhouette`
      );
    }
  }
});

test("a row's drawing belongs to the animal that row names", () => {
  const { world, config } = stepped(7, 3000);
  const rows = castRows(world, config, nameSpecies(world.phylogeny.species));
  assert.ok(rows.length >= 2, "this pond grew no board to check");
  const art = lineupSvg(rows);
  assert.equal(art.length, rows.length, "the board drew a different number of animals than it named");
  const html = castHTML(rows);
  for (let i = 0; i < rows.length; i++) {
    const at = html.indexOf(`${rows[i].id}"`);
    assert.ok(at >= 0, `row ${i} lost its creature's number`);
    assert.ok(html.includes(art[i]), `row ${i}'s drawing is not on the board`);
  }
  // Order, which is the only thing that ties a drawing to a row: the svg for
  // row i appears before the svg for row i+1.
  let last = -1;
  for (const svg of art) {
    const at = html.indexOf(svg);
    assert.ok(at > last, "the drawings are not in the order of the rows");
    last = at;
  }
});

// ---- 4. it reaches the page, and one module owns it ----

test("the board carries a picture per row and no swatch left behind", () => {
  const { world, config } = stepped(314, 2500);
  const rows = castRows(world, config, nameSpecies(world.phylogeny.species));
  const html = castHTML(rows);
  assert.equal(
    (html.match(/<svg class="lineup"/g) || []).length,
    rows.length,
    "a row went without its animal"
  );
  assert.ok(!html.includes('class="swatch"'), "the flat swatch the picture replaced is still there");
  // Every gradient id is inlined into one document, so a repeat would hand two
  // animals one colour — the failure is silent and the fix is one character.
  const ids = html.match(/id="lu\d+"/g) || [];
  assert.equal(new Set(ids).size, ids.length, "two rows share a gradient id");
  // A picture that repeated its row's sentence would make every row say itself
  // twice; the row's own label is where a listener is told who this is.
  assert.equal((html.match(/<svg[^>]*aria-hidden="true"/g) || []).length, rows.length);
});

test("the note is written from the module that owns the words, and put away with the pictures", () => {
  assert.ok(page.includes('id="cast-note"'), "the board has nowhere to put its legend");
  assert.ok(
    !page.includes(LINEUP_NOTE.slice(0, 30)),
    "the legend is typed into the markup — a copy of a constant is a stale sentence waiting to happen"
  );
  assert.match(main, /LINEUP_NOTE/, "nothing on the page ever writes the legend");
  assert.match(main, /note\.hidden = rows\.length === 0/, "the legend outlives the pictures it explains");
  // The legend sits under the list it explains rather than above it.
  const list = page.indexOf('id="cast-list"');
  const note = page.indexOf('id="cast-note"');
  assert.ok(list >= 0 && note > list, "the legend arrives before the thing it is a legend for");
});

test("the legend uses no word a visitor may not have, and no unit", () => {
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|radius|hue|svg|scale factor|RNG|seed|species)\b/i;
  assert.doesNotMatch(LINEUP_NOTE, JARGON, "the legend reaches for a word a visitor may not have");
  assert.ok(LINEUP_NOTE.length <= 140, "the legend outweighs the pictures it is a footnote to");
  // The three jobs it exists to do, each of them a thing the drawing cannot say.
  assert.match(LINEUP_NOTE, /one scale/i, "the legend does not say the scale is shared");
  assert.match(LINEUP_NOTE, /nose/i, "the legend does not say what the long nose means");
  assert.match(LINEUP_NOTE, /family/i, "the legend does not say what the colour is");
});

// ---- 5. reading the pond does not move it ----

test("drawing the board takes nothing out of the world", () => {
  const config = makeConfig({ seed: 99 });
  const world = new World(config);
  for (let i = 0; i < 1500; i++) world.step();
  const stream = drawStream(world.rng);
  const before = stateFingerprint(world);
  const drawn = stream.count;
  const names = nameSpecies(world.phylogeny.species);
  for (let i = 0; i < 5; i++) {
    const rows = castRows(world, config, names);
    lineupLayout(rows);
    lineupSvg(rows);
  }
  assert.equal(stateFingerprint(world), before, "the portraits moved the pond they were drawn from");
  assert.equal(stream.count, drawn, "the portraits took numbers out of the world's stream");
});

test("the same board twice is the same markup", () => {
  const { world, config } = stepped(2718, 2200);
  const names = nameSpecies(world.phylogeny.species);
  const once = castHTML(castRows(world, config, names));
  const twice = castHTML(castRows(world, config, names));
  assert.equal(once, twice, "a paused pond drew two different boards");
});
