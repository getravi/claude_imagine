// pondname.test.js — the pond's name, audited.
//
// A name is the one kind of output in this project that nothing downstream
// checks. A wrong number moves a bar somebody can see; a wrong name reads
// perfectly and is simply a lie about which pond you are in. So the sweeps here
// are mostly about *identity*: that the name follows the seed and nothing else,
// that it narrows a seed exactly where the simulation narrows it, and that it
// can never be mistaken for the other family of names this project generates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ADJECTIVES,
  LANDFORMS,
  pondName,
  pondTitle,
  shareLine,
  welcomeTo,
} from "../src/pondname.js";
import { STEMS, EPITHETS } from "../src/speciesnames.js";
import { RNG } from "../src/rng.js";
import { DEFAULT_CONFIG } from "../src/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Every name in the space, keyed by the lowest seed that reaches it. */
function sweep(upTo) {
  const first = new Map();
  for (let s = 0; s < upTo; s++) {
    const name = pondName(s).name;
    if (!first.has(name)) first.set(name, s);
  }
  return first;
}

test("the vocabularies are the size the module says, with nothing said twice", () => {
  assert.equal(ADJECTIVES.length, 48);
  assert.equal(LANDFORMS.length, 32);
  assert.equal(new Set(ADJECTIVES).size, 48, "a repeated adjective is a name half as likely");
  assert.equal(new Set(LANDFORMS).size, 32);
});

test("every word is one capitalised word", () => {
  // A two-word landform would make "Sleeping Old Mill Pond", and a lower-case
  // adjective would make a heading that reads like a sentence fragment. Both
  // are the sort of thing that arrives in a list of eighty words by hand.
  for (const w of [...ADJECTIVES, ...LANDFORMS]) {
    assert.match(w, /^[A-Z][a-z]+$/, `"${w}" is not one capitalised word`);
  }
});

test("no pond can be mistaken for a lineage", () => {
  // Decision 1 in the module. `speciesnames.js` puts the *family* first, so a
  // pond called "Slate Tarn" would tell a reader the water was kin to the Slate
  // Darts in it. Disjointness is the weak half of the guarantee; the strong
  // half is that these are adjectives and those are nouns, which no test can
  // assert and which this one at least stops from eroding one word at a time.
  const lineage = new Set([...STEMS, ...EPITHETS]);
  const shared = [...ADJECTIVES, ...LANDFORMS].filter((w) => lineage.has(w));
  assert.deepEqual(shared, [], "a word cannot name both a pond and a bloodline");
});

test("a name is one adjective and one landform, and both come from the lists", () => {
  const adj = new Set(ADJECTIVES);
  const land = new Set(LANDFORMS);
  for (let s = 0; s < 2000; s++) {
    const p = pondName(s);
    assert.equal(p.name, `${p.adjective} ${p.landform}`);
    assert.ok(adj.has(p.adjective), `seed ${s}: "${p.adjective}" is not an adjective here`);
    assert.ok(land.has(p.landform), `seed ${s}: "${p.landform}" is not a landform here`);
  }
});

test("the same seed always gives the same name", () => {
  // The whole promise of a permalink, applied to the label on it. Pinned by
  // value as well as by repetition: a reordered word list would still be
  // self-consistent and would rename every pond anybody had ever shared.
  for (const s of [0, 1, 42, 314, 2024, 1837465]) {
    assert.equal(pondName(s).name, pondName(s).name);
  }
  assert.equal(pondName(0).name, "Drowsy Lake");
  assert.equal(pondName(42).name, "Sleeping Millpond");
  assert.equal(pondName(2024).name, "Western Bay");
  assert.equal(pondName(1837465).name, "Patient Backwater");
});

test("the pond this page opens on is Western Mere, and the markup says so", () => {
  // The plate ships with the default pond's name written into it, because the
  // page is readable before a script runs and a placeholder that names the
  // wrong pond is worse than an empty one. Two things to keep in step, so this
  // is the thing that keeps them.
  const name = pondName(DEFAULT_CONFIG.seed).name;
  assert.equal(name, "Western Mere");
  const page = readFileSync(join(root, "app/index.html"), "utf8");
  assert.match(page, new RegExp(`id="pond-name"[^>]*>${name}<`));
  assert.match(page, new RegExp(`id="pond-seed"[^>]*>${DEFAULT_CONFIG.seed}<`));
});

test("the whole vocabulary is reachable, and every word of it is used", () => {
  // 1,536 names and all of them within the first ten thousand seeds: a word
  // list a hash never points at is eighty words of dead weight, and the way
  // that happens is a modulus taken against the wrong length.
  const first = sweep(10000);
  assert.equal(first.size, ADJECTIVES.length * LANDFORMS.length);
  assert.equal(new Set([...first.keys()].map((n) => n.split(" ")[0])).size, ADJECTIVES.length);
  assert.equal(new Set([...first.keys()].map((n) => n.split(" ")[1])).size, LANDFORMS.length);
});

test("the first repeat is seed 62, and the first hundred seeds hold 96 names", () => {
  // The measurement behind decision 3. 1,536 names is a handle and not an
  // identifier, and the birthday problem says so inside the first hundred seeds
  // a person would ever type by hand — four collisions where the arithmetic
  // predicts 3.2. This is pinned so that a future release which *widens* the
  // lists has to come here and say what it changed.
  let firstRepeat = null;
  const seen = new Map();
  for (let s = 0; s < 10000 && !firstRepeat; s++) {
    const name = pondName(s).name;
    if (seen.has(name)) firstRepeat = { seed: s, shares: seen.get(name), name };
    else seen.set(name, s);
  }
  assert.deepEqual(firstRepeat, { seed: 62, shares: 34, name: "Nameless Ford" });

  const hundred = new Set();
  for (let s = 0; s < 100; s++) hundred.add(pondName(s).name);
  assert.equal(hundred.size, 96);
});

test("neighbouring seeds are no more alike than strangers", () => {
  // The reason `mix` exists at all. An alphabetical march would be just as
  // deterministic and would give seeds 0, 1 and 2 the same adjective, so a
  // visitor stepping the field with the arrow keys would think the name was
  // broken. Over a hundred thousand neighbours the collision count is 69
  // against a chance expectation of 100000 / 1536 = 65.1 — a mixer with local
  // structure would land far off that, in either direction.
  let shared = 0;
  for (let s = 0; s < 100000; s++) if (pondName(s).name === pondName(s + 1).name) shared++;
  assert.equal(shared, 69);
  const chance = 100000 / (ADJECTIVES.length * LANDFORMS.length);
  assert.ok(Math.abs(shared - chance) < 3 * Math.sqrt(chance), `${shared} is not chance-like`);
});

test("the name narrows a seed exactly where the simulation narrows it", () => {
  // Seed −1 and seed 4,294,967,295 are one world, because `RNG` takes `>>> 0`
  // on the first line of its constructor. A plate that called them two places
  // would be a label disagreeing with the thing it labels — and this compares
  // the two rather than restating either, so moving one moves the test.
  for (const s of [0, 1, -1, -7, 4294967295, 2147483648, 1e21, NaN, 3.7]) {
    assert.equal(pondName(s).seed, new RNG(s).seed, `seed ${s}`);
  }
  assert.equal(pondName(-1).name, pondName(4294967295).name);
});

test("nothing a field or a URL can hold makes this throw", () => {
  // The seed reaches here from `parseInt` on a hash and from a number input, so
  // `#seed=banana`, an empty field and a pasted `1e21` are all real. A name is
  // written into a heading during boot: one throw here and the page never
  // paints.
  for (const s of [NaN, Infinity, -Infinity, undefined, null, "", "banana", "42", 1.5, -0]) {
    const p = pondName(s);
    assert.match(p.name, /^[A-Z][a-z]+ [A-Z][a-z]+$/, `seed ${String(s)} gave "${p.name}"`);
  }
});

test("the tab, the welcome and the receipt all say the same three syllables", () => {
  // Four surfaces name the pond and one function names it. The failure this
  // guards is the ordinary one: a second place that formats a name and drifts.
  const name = pondName(42).name;
  assert.equal(pondTitle(42), `${name} — Vivarium`);
  assert.ok(welcomeTo(42).includes(name), welcomeTo(42));
  assert.ok(shareLine(42).includes(name), shareLine(42));
  assert.ok(pondTitle(42).endsWith("Vivarium"), "the tab still says whose page this is");
});

test("this module cannot see the pond it names", () => {
  // The property `speciesnames.js` states about itself, asserted rather than
  // asserted-in-prose: a name here is a pure function of an integer. If this
  // file ever imports the world, the config or the generator, a name could
  // depend on what is happening in the water — and a label that moves while you
  // are reading it is worse than a number.
  const src = readFileSync(join(root, "src/pondname.js"), "utf8");
  assert.equal(
    [...src.matchAll(/^import\b/gm)].length,
    0,
    "pondname.js imports something; it is meant to be a pure function of a seed",
  );
  assert.ok(!/Math\.random/.test(src), "a name that is not reproducible is not a name");
});
