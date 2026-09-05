// key.test.js — the placard under the pond, and the three ways it could lie.
//
// The feature is one list of sentences, so most of what could go wrong with it
// is not in the sentences. It is in the joins:
//
//   1. **It could describe a mark the water cannot draw.** Every row but six
//      depends on a rule that can be switched off, and a key that explains a
//      sulphur glow in a pond with no illness in it sends a reader hunting for
//      something that is not there — which is worse than telling them nothing,
//      because they will believe they have failed to see it. So `needs` is
//      checked against `config.js` in both directions: every flag a row names
//      is a real boolean rule, and switching that rule on and off is checked to
//      add and remove exactly that row.
//   2. **It could describe a mark the water no longer draws that way.** The
//      hunter's nose is the one piece of geometry this module copies out of
//      `render.js`, so `render.js` is read back and the two numbers compared.
//      A copy nothing checks is a copy that drifts (v1.26).
//   3. **It could speak the project's own language.** The whole point of a key
//      is the reader who has just arrived, so the sentences are held to
//      `cast.js`'s bar — no *carnivore*, no *lineage*, no *px*, no *tick*.
//
// And the colours, which are the reason this is a key and not a diagram: every
// tone in every swatch has to come out of `palette.js`, because a swatch that
// merely resembles the water is a key to a different picture.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MARKS,
  NOSE,
  SWATCH,
  chevron,
  keyHTML,
  keySignature,
  swatchShapes,
  swatchSvg,
  visibleMarks,
} from "../src/key.js";
import { DEFAULT_CONFIG, makeConfig } from "../src/config.js";
import { SWITCHES } from "../src/switches.js";
import { World } from "../src/world.js";
import { stateFingerprint } from "../src/fingerprint.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const page = read("app/index.html");
const main = read("src/main.js");
const render = read("src/render.js");

test("every row names a rule this world actually has", () => {
  for (const m of MARKS) {
    if (m.needs === null) continue;
    assert.equal(
      typeof DEFAULT_CONFIG[m.needs],
      "boolean",
      `"${m.term}" waits on \`${m.needs}\`, which is not a rule in config.js`,
    );
    // And one a visitor can reach. A row that appears only for somebody who
    // hand-edits a permalink is a row almost nobody will ever see, and the
    // switch column is where the rules a visitor can turn on are listed.
    assert.ok(
      SWITCHES.some((s) => s.flag === m.needs),
      `\`${m.needs}\` is not a switch on the page, so nobody can make "${m.term}" appear`,
    );
  }
});

test("a rule that is off takes its row away, and turning it on brings it back", () => {
  const gated = MARKS.filter((m) => m.needs !== null);
  assert.ok(gated.length > 0, "no row depends on a rule, so this test has nothing to check");
  for (const m of gated) {
    const off = makeConfig({ [m.needs]: false });
    const on = makeConfig({ [m.needs]: true });
    const idsOff = visibleMarks(off).map((r) => r.id);
    const idsOn = visibleMarks(on).map((r) => r.id);
    assert.ok(!idsOff.includes(m.id), `"${m.term}" is shown for a pond that cannot draw it`);
    assert.ok(idsOn.includes(m.id), `"${m.term}" is missing from a pond that does draw it`);
    // Exactly that row and no other: a flag that moved two rows would mean one
    // of them is keyed on the wrong rule.
    assert.deepEqual(
      idsOn.filter((id) => !idsOff.includes(id)),
      [m.id],
      `switching \`${m.needs}\` on changed more than "${m.term}"`,
    );
  }
});

test("the rows a pond always draws are the ones no rule can remove", () => {
  // The floor: with every optional rule off, the placard still says what an
  // arrowhead, a shade, a brightness, a size, a speck and the visitor's own
  // white ring are. A page whose key can empty itself is a page that can show a
  // heading over nothing.
  const bare = makeConfig(Object.fromEntries(SWITCHES.map((s) => [s.flag, false])));
  const ids = visibleMarks(bare).map((m) => m.id);
  assert.deepEqual(ids, MARKS.filter((m) => m.needs === null).map((m) => m.id));
  assert.ok(ids.length >= 5, "the key can nearly empty itself");
});

test("the nose the placard draws is the nose the pond draws", () => {
  // `render.js#_drawCreature` holds these as two inline constants inside a
  // method; `key.js` copies them so the placard's arrowhead is the water's.
  // This is the check that keeps the copy honest.
  const line = render.match(/const nose = isPredator \? ([\d.]+) : ([\d.]+);/);
  assert.ok(line, "render.js no longer chooses a nose the way key.js assumes");
  assert.equal(Number(line[1]), NOSE.hunter, "the hunter's nose moved in render.js");
  assert.equal(Number(line[2]), NOSE.prey, "the ordinary nose moved in render.js");
  // And the shape itself: four points, the first of them the tip.
  const path = chevron(SWATCH.r, NOSE.hunter);
  assert.equal((path.match(/[ML]/g) || []).length, 4);
  assert.ok(path.endsWith("Z"), "the body is not a closed shape");
  const tipX = Number(path.match(/^M([\d.]+),/)[1]);
  assert.ok(
    tipX > SWATCH.cx + SWATCH.r,
    "the hunter's point does not reach past its own body",
  );
});

test("every row has a swatch, and an unknown row has no quiet blank one", () => {
  for (const m of MARKS) {
    const svg = swatchSvg(m.id);
    assert.match(svg, /^<svg /, `"${m.term}" has no swatch`);
    assert.ok(svg.includes("</svg>"));
    assert.ok(
      /<(path|circle)\b/.test(svg),
      `"${m.term}"'s swatch draws nothing`,
    );
    assert.ok(svg.includes('aria-hidden="true"'), "a swatch is read out as well as its sentence");
  }
  assert.throws(() => swatchShapes("no-such-mark"), /no swatch/);
});

test("every colour in a swatch came out of the palette", () => {
  // The rule this project has repeated since v1.25, applied where it is easiest
  // to break: a swatch is markup, and markup takes any string at all. Nothing
  // here may name a colour of its own — `test/colourliterals.test.js` sweeps
  // the source, and this sweeps what the source *produces*, which is where a
  // hand-typed shade would end up if one were ever written as a variable.
  const source = read("src/key.js");
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, "key.js names a colour of its own");
  const marks = MARKS.map((m) => swatchShapes(m.id)).join("");
  for (const m of marks.matchAll(/(?:fill|stroke|stop-color)="([^"]+)"/g)) {
    if (m[1] === "none" || m[1].startsWith("url(#")) continue;
    assert.match(
      m[1],
      /^(hsla?|rgba?)\(/,
      `"${m[1]}" is not a colour in the form palette.js hands out`,
    );
  }
  // A gradient is referred to by id, and every swatch on the placard is inlined
  // into one document — so two rows sharing an id would leave one of them
  // painted in the other's colour. Cheap to check and impossible to see.
  const ids = [...marks.matchAll(/<radialGradient id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "two swatch gradients share an id");
  for (const id of ids) {
    assert.ok(marks.includes(`url(#${id})`), `gradient "${id}" is defined and never used`);
  }
});

test("nothing on the placard uses a word from inside this project", () => {
  // `cast.js`'s bar. A key is for the reader who has just arrived; a key
  // written in the vocabulary of somebody already here is decoration.
  const JARGON =
    /\b(carnivor\w*|herbivor\w*|lineage|genome|genotype|allele|tick|ticks|px|pixels?|predation|neuroevolution|fitness|phenotype|RNG|seed)\b/i;
  for (const m of MARKS) {
    assert.doesNotMatch(m.term, JARGON, `"${m.term}" uses a word only somebody already here knows`);
    assert.doesNotMatch(m.line, JARGON, `"${m.line}" uses a word only somebody already here knows`);
  }
});

test("every row is a name and a finished sentence", () => {
  const ids = new Set();
  for (const m of MARKS) {
    assert.ok(!ids.has(m.id), `two rows are called "${m.id}"`);
    ids.add(m.id);
    assert.match(m.term, /^[A-Z]/, `"${m.term}" is not capitalised`);
    assert.ok(m.term.split(" ").length <= 4, `"${m.term}" is a sentence, not a name`);
    assert.ok(!m.term.endsWith("."), `"${m.term}" is a name and does not need a full stop`);
    assert.match(m.line, /^[A-Z]/, `"${m.line}" is not capitalised`);
    assert.ok(m.line.endsWith("."), `"${m.line}" does not finish its sentence`);
    assert.ok(m.line.length <= 110, `"${m.line}" is longer than a placard line`);
  }
});

test("the page holds the placard, outside the pond and inside the column", () => {
  assert.ok(page.includes('id="key-list"'), "the page has nowhere to put the key");
  assert.ok(page.includes('class="waterkey"'), "the key has no section of its own");
  // Before the Chronicle and after the stage: a key is read while looking at
  // the thing it is a key to.
  const stage = page.indexOf('class="stage"');
  const key = page.indexOf('class="waterkey"');
  const chron = page.indexOf('class="chronicle"');
  assert.ok(stage < key && key < chron, "the key is not between the pond and its story");
  // A heading with a name it can be announced by.
  assert.match(page.slice(key, chron), /aria-labelledby="waterkey-h"/);
});

test("main.js rebuilds the key only when the set of marks changes", () => {
  const fn = main.match(/function updateKey\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "main.js no longer has an adapter for the key");
  const body = fn[0];
  assert.ok(body.includes("keySignature(config, hand)"), "the key is not keyed on the pond's rules");
  assert.ok(body.includes("view.keySig"), "the memo is not the one `viewstate.js` owns");
  assert.ok(body.includes("keyHTML(config, hand)"), "the rows are written somewhere other than key.js");
  assert.ok(/return;/.test(body), "the placard is rebuilt on every frame");
  assert.ok(/\n  updateKey\(\);/.test(main), "the frame loop never calls it");
});

test("the placard is the rows and nothing else", () => {
  const html = keyHTML(DEFAULT_CONFIG);
  const rows = visibleMarks(DEFAULT_CONFIG);
  assert.equal((html.match(/<li class="keyrow">/g) || []).length, rows.length);
  for (const m of rows) {
    assert.ok(html.includes(`<b>${m.term}</b>`), `"${m.term}" is not on the placard`);
    assert.ok(html.includes(m.line), `"${m.term}" has no sentence on the placard`);
  }
  // The default pond hunts, so the row that needs a rule is really there.
  assert.ok(rows.some((m) => m.needs !== null), "the default pond shows no rule-gated row");
});

test("reading the key does not move the pond", () => {
  // The purity claim, made the way this project makes it: build a world, take
  // its fingerprint, write every placard the config table can produce, and take
  // it again. No field is added to anything and no random number is drawn, so
  // the two have to match — and the signature is a pure function of the config,
  // so asking for it twice gives the same answer.
  const config = makeConfig({ seed: 7 });
  const world = new World(config);
  for (let i = 0; i < 300; i++) world.step();
  const before = stateFingerprint(world);
  for (const flag of ["predation", "scavenging", "disease", "signalling"]) {
    keyHTML(makeConfig({ seed: 7, [flag]: true }));
    keyHTML(makeConfig({ seed: 7, [flag]: false }));
  }
  assert.equal(stateFingerprint(world), before);
  assert.equal(keySignature(config), keySignature(config));
});
