// prosecounts.test.js — a number written out in prose about a collection in
// code is a claim, and this is the test of it.
//
// v1.52 closed one instance. The README said the scenarios strip "offers eight
// one-click worlds" while the strip lived in an array, and the word had been
// wrong for sixteen releases; `test/scenarios.test.js` now reads the sentence
// back out of the file and compares it to `SCENARIOS.length`. The lesson I
// wrote that afternoon was that **anything else stated as a number in prose
// about a collection in code is still drifting**, and then I left it as a
// sentence in `docs/AUTONOMOUS.md` for thirty-three releases — which is that
// file's own rule about an instruction in the imperative reading as
// already-half-done.
//
// It was drifting. `config.js` held seventy-nine numbers when v1.38 swept them
// and holds eighty-four today, and the project carried *three* different counts
// of that one array: "seventy-nine" in the README, in `src/levers.js`, in two
// sections of `docs/SCIENCE.md` and twice in the playbook; "eighty" in
// `test/levers.test.js`; and the truth nowhere. The opt-in flags had gone from
// thirteen to nineteen under a sentence in `SCIENCE.md` boasting that the sweep
// "reads the list out of `DEFAULT_CONFIG` so a future feature is covered the
// day its flag lands" — the code was future-proof and the number beside it was
// not. Worse than the count: the paragraph under it read "twelve of thirteen
// change the pond within 1,000 ticks … the thirteenth is kin recognition",
// whose arithmetic asserts there is exactly *one* exception, and there have
// been two since v1.45 added `deathIsFinal`. A stale count is a wrong number; a
// stale count with an "and the Nth is" after it is a wrong sentence.
//
// The rule this pins: **a number word standing immediately in front of a
// collection's name is a claim about that collection today.** A count that
// means *then* has to say when, and must not sit next to the noun — which is
// why "thirteen of them at the time" passes here and "thirteen opt-in flags"
// would not.
//
// The domain, stated because a sweep that does not name what it excludes
// quietly annexes it (v1.51): every living document and every source and test
// comment — `README.md`, `docs/SCIENCE.md`, `docs/AUTONOMOUS.md`, `src/*.js`
// and `test/**/*.js`, plus the two shipped pages, their stylesheets and
// `splash.js` (v1.88: the front door was outside this list, which is the same
// bug one file over — a domain built out of directories misses the files that
// live at the root, and the root is where the page a visitor sees first is).
// Excluded: `CHANGELOG.md` and `docs/DEVLOG.md`, which are
// dated entries — a count in a release note is a record of what was true that
// day, and correcting it would falsify the diary rather than fix anything. And
// this file, which cannot be inside its own domain without declaring itself a
// site for every claim it holds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config.js";
import { numericKeys } from "../src/levers.js";
import { SERIES, CLOCKS } from "../src/seasonlag.js";
import { STATS_HASHED, STATS_UNHASHED, CHRONICLE_HASHED } from "../src/fingerprint.js";
import { TILES, GROUPS } from "../src/hud.js";
import { FIELD_REPORTS, FIELD_SILENT } from "../src/inspect.js";
import { numberWord, NUMBER_WORDS } from "./support/numberword.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = "test/prosecounts.test.js";

/** Every file whose prose describes the project as it is now. */
function domain() {
  const js = (dir) =>
    readdirSync(join(root, dir))
      .filter((f) => f.endsWith(".js"))
      .map((f) => `${dir}/${f}`);
  return [
    "README.md",
    "CONTRIBUTING.md",
    "docs/SCIENCE.md",
    "docs/AUTONOMOUS.md",
    // v1.103. The map of the modules was a living document outside this sweep
    // from the day the sweep was written, and it was carrying a count of
    // `world.stats` thirteen short and a count of a creature's fields two
    // short. This is v1.88's finding again — a domain that is a list somebody
    // typed has an exclusion nobody wrote down — and the guard below is the
    // part that stops it being found a third time.
    "docs/ARCHITECTURE.md",
    "index.html",
    "splash.js",
    "splash.css",
    "app/index.html",
    "style.css",
    ...js("src"),
    ...js("test"),
    ...js("test/support"),
  ].filter((f) => f !== SELF);
}

/**
 * The claims. One row per collection that this project states the size of in
 * words, with the phrase that carries it and every file expected to say it.
 *
 * `phrase` is a literal with one `{n}` where the number word goes. Whitespace
 * in it matches across a line break and across a `//` comment prefix, because
 * both markdown and this project's source wrap at eighty columns and a claim
 * does not stop being a claim for landing on two lines.
 */
const CLAIMS = [
  {
    what: "the numbers in `config.js`",
    size: () => numericKeys().length,
    phrase: "{n} constants in `config.js`",
    sites: [
      "README.md",
      "docs/AUTONOMOUS.md",
      "docs/SCIENCE.md",
      "src/levers.js",
      "test/levers.test.js",
    ],
  },
  {
    what: "the opt-in flags",
    size: () => Object.keys(DEFAULT_CONFIG).filter((k) => DEFAULT_CONFIG[k] === false).length,
    phrase: "{n} opt-in flags",
    sites: ["docs/SCIENCE.md", "test/levers.test.js"],
  },
  {
    // v1.86's own count, declared in the release that writes it down rather
    // than in the one that finds it stale — which is the whole point of the two
    // rows above.
    what: "the counters a history point carries",
    size: () => Object.values(SERIES).filter((k) => k === "flow").length,
    phrase: "{n} cumulative counters",
    sites: ["docs/SCIENCE.md", "src/seasonlag.js"],
  },
  {
    // The collection v1.89 grew, declared by the release that grows it. It was
    // already wrong before this cycle touched it — three files said `Stats`
    // carried forty-seven own properties and it carried fifty-three, drift of
    // six that arrived one field at a time across v1.78 and v1.86 — and what
    // found it was adding to the collection rather than reading the sentence.
    // A count nobody has a reason to recompute is the one that goes stale, so
    // this is the row that recomputes it.
    //
    // The size is the declared lists rather than a live object's keys, which is
    // not a shortcut: `test/books.test.js` walks a stepped world against those
    // lists in both directions, so a name here that no field carries and a
    // field that no name here declares are both already failures.
    what: "the properties `Stats` carries",
    size: () => STATS_HASHED.length + Object.keys(STATS_UNHASHED).length,
    phrase: "{n} own properties",
    sites: [
      "docs/ARCHITECTURE.md",
      "docs/AUTONOMOUS.md",
      "src/fingerprint.js",
      "test/books.test.js",
    ],
  },
  {
    // The collection v1.94 gave a channel to, declared in the same cycle — the
    // habit the row above asks for, applied on arrival rather than six releases
    // later. A latch is a decision about what the pond may still be told, so
    // the count is what the sixth channel is *for*; the two files that state it
    // are the hash's own list and the ideas list that carried the lead.
    what: "the Chronicle's latches",
    size: () => CHRONICLE_HASHED.filter((n) => n.startsWith("_")).length,
    phrase: "{n} latches",
    sites: ["docs/AUTONOMOUS.md", "src/fingerprint.js"],
  },
  {
    // v1.95's collection, declared in the cycle that creates it. A clock is a
    // periodic time the world keeps, `CLOCKS` is the table of them, and the
    // count is a claim that will grow the moment anything else in here repeats
    // — the biome drift and the plasticity decay are both periodic in the same
    // sense and neither is in the table.
    what: "the clocks this world keeps",
    size: () => Object.keys(CLOCKS).length,
    phrase: "{n} periodic clocks",
    sites: ["docs/SCIENCE.md", "src/seasonlag.js"],
  },
  {
    // The collection v1.97 carved out and v1.101 grew, declared by the release
    // that grows it. It had already drifted the moment the tile was written:
    // three files opened with the old number, one of them the module's own
    // first line. `app/index.html`'s copy of this count is *not* a site — it
    // is held by `test/markup.test.js`, which reads the comment and counts the
    // `<div class="stat">`s rather than the table, so the page and the module
    // are each pinned to the tiles by a test of their own.
    what: "the panel's tiles",
    size: () => TILES.length,
    phrase: "{n} stat tiles",
    // `docs/ARCHITECTURE.md` joined in v1.118, when the map of the modules
    // finally got a row for `hud.js` — the panel had been the largest thing in
    // this project with no line in the document that claims to list everything.
    sites: ["docs/ARCHITECTURE.md", "src/hud.js", "test/hud.test.js"],
  },
  {
    // v1.118's collection, declared in the cycle that creates it — the habit
    // three rows up asks for, applied on arrival. This one is stated on the
    // *page* as well as in the module, which no other claim here is: the
    // comment over the definition lists says how many sections a reader is
    // looking at, and a section added in `hud.js` alone would leave the markup
    // describing a panel that no longer exists.
    what: "the panel's sections",
    size: () => GROUPS.length,
    phrase: "{n} panel sections",
    sites: ["app/index.html", "src/hud.js"],
  },
  {
    // The collection v1.103 gave a second coverage table to, and the one that
    // proves this file is worth its weight: three living documents said a
    // creature had 33 own properties, which was true when v1.77 counted them
    // and stopped being true the moment v1.102 gave the whisker two fields and
    // a distance. The count was invisible here for two separate reasons — it
    // was written in digits, and one of the three documents was not in the
    // domain — so it is spelled out now and the phrase is its own.
    //
    // The size comes from the declared lists rather than from a live creature,
    // for `Stats`' reason one row up: `test/inspect.test.js` and
    // `test/registers.test.js` both walk a live creature against them in both
    // directions, so a name here that no field carries is already a failure.
    what: "the fields of a creature",
    size: () => Object.keys(FIELD_REPORTS).length + Object.keys(FIELD_SILENT).length,
    phrase: "{n} fields of a creature",
    sites: ["docs/ARCHITECTURE.md", "src/inspect.js", "test/inspect.test.js"],
  },
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A line break, an indent, and the `//` a wrapped source comment starts with. */
const GAP = "\\s+(?://\\s*)?";

function matcher(phrase) {
  const parts = phrase.split(/ +/).map((p) => (p === "{n}" ? `(${NUMBER_WORDS.join("|")})` : escape(p)));
  return new RegExp(parts.join(GAP));
}

/** @returns {Array<{file: string, line: number, word: string}>} */
function findClaim(phrase) {
  const re = new RegExp(matcher(phrase).source, "g");
  const found = [];
  for (const file of domain()) {
    const text = readFileSync(join(root, file), "utf8");
    for (const m of text.matchAll(re)) {
      found.push({ file, line: text.slice(0, m.index).split("\n").length, word: m[1] });
    }
  }
  return found;
}

for (const claim of CLAIMS) {
  test(`${claim.what}: the prose says what the code holds`, () => {
    const expected = numberWord(claim.size());
    const found = findClaim(claim.phrase);

    const wrong = found.filter((f) => f.word !== expected);
    assert.deepEqual(
      wrong.map((f) => `${f.file}:${f.line} says "${f.word}"`),
      [],
      `${claim.what}: there are ${claim.size()} — "${expected}"`
    );

    const said = [...new Set(found.map((f) => f.file))].sort();
    assert.deepEqual(
      said,
      [...claim.sites].sort(),
      `every file stating "${claim.phrase}" must be a declared site of this claim, ` +
        "and every declared site must still state it"
    );
  });
}

/**
 * The documents this sweep deliberately does not read, with the reason. A dated
 * entry is a record of what was true that day and correcting it would falsify
 * the diary; this file cannot be inside its own domain without declaring itself
 * a site for every claim it holds.
 */
const NOT_LIVING = {
  "CHANGELOG.md": "dated release notes",
  "docs/DEVLOG.md": "a dated diary",
};

// The domain is a list somebody typed, and until v1.103 `docs/ARCHITECTURE.md`
// was not on it — the map of every module in the project, carrying two counts
// that had gone stale in exactly the way this file exists to catch. v1.88 wrote
// the general form down ("a domain built out of directories misses whatever
// lives at the root") and the remedy it took was to add the missing file, which
// is the fix for an instance. This is the fix for the class: a markdown
// document in this repository is either read or excused, and there is no third
// state a new one can arrive in.
test("every living document is in the domain or excused", () => {
  const md = [
    ...readdirSync(root).filter((f) => f.endsWith(".md")),
    ...readdirSync(join(root, "docs"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => `docs/${f}`),
  ];
  const swept = new Set(domain());
  for (const file of md) {
    assert.ok(
      swept.has(file) || file in NOT_LIVING,
      `${file} is neither swept for stale counts nor declared as a document that may hold them`
    );
  }
  for (const file of Object.keys(NOT_LIVING)) {
    assert.ok(md.includes(file), `${file} is excused from this sweep and does not exist`);
  }
});

// The instrument's own claim of equivalence (v1.32): the matcher has to be able
// to read a phrase that wrapped, or it would pass by finding nothing.
test("a claim that wrapped onto the next line is still found", () => {
  const re = matcher("{n} constants in `config.js`");
  assert.equal("all eighty-four constants in `config.js`".match(re)?.[1], "eighty-four");
  assert.equal("eighty-four constants in\n  `config.js`".match(re)?.[1], "eighty-four");
  assert.equal("// eighty-four constants in\n// `config.js`".match(re)?.[1], "eighty-four");
  assert.equal("four constants in `config.js`".match(re)?.[1], "four");
  assert.equal("the constants in `config.js`".match(re), null);
});

// Pin the failure, not only the fix (v1.24): the sentences this release
// corrected, fed back in, must come out as the wrong word rather than as no
// match at all. A sweep whose negative answer and whose failure mode are the
// same string is not a sweep (v1.60).
test("the drift this was written for would be caught", () => {
  const [constants, flags] = CLAIMS;
  const stale = [
    [constants, "`src/levers.js` sweeps all seventy-nine constants in `config.js`", "seventy-nine"],
    [constants, "The answer the sweep gives is yes, all eighty constants in `config.js`", "eighty"],
    [flags, "the full state hash is identical — for all thirteen opt-in flags", "thirteen"],
  ];
  for (const [claim, line, word] of stale) {
    assert.equal(line.match(matcher(claim.phrase))?.[1], word, `should have read "${word}" out of: ${line}`);
    assert.notEqual(word, numberWord(claim.size()), "this fixture is no longer stale");
  }
});

// Longest-first alternation, or "eighty-four" is read as "eighty" and a correct
// document fails.
test("the vocabulary prefers the longer word", () => {
  assert.equal(numberWord(84), "eighty-four");
  assert.equal(numberWord(19), "nineteen");
  assert.equal(numberWord(20), "twenty");
  assert.equal(numberWord(0), "zero");
  assert.throws(() => numberWord(100), RangeError);
  const re = matcher("{n} constants in `config.js`");
  assert.equal("eighty-four constants in `config.js`".match(re)?.[1], "eighty-four");
});
