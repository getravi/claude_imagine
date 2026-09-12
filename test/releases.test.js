// releases.test.js — the front door may not state a release count it did not
// count.
//
// The defect this file closes, in one line: `index.html` said *Over ten
// releases* from v1.19 to v1.171, and there had been a hundred and
// seventy-eight. The sweep built for exactly this class of claim —
// `test/prosecounts.test.js`, which has covered `index.html` since v1.88 —
// could not see it, because every row of that table sizes a collection it can
// `import`, and this project's largest collection is its own release history in
// `CHANGELOG.md`, a file that sweep excludes as a site and never considered as
// a source.
//
// So this file holds three things the other one cannot:
//
//  1. **The record is re-derived.** `RELEASES` is the one typed copy of these
//     figures in the repository, and it is compared here against the changelog's
//     own headings and `package.json`. A cycle that ships without bumping it
//     goes red — which is the point, because the alternative is a front page
//     that quietly ages out again over the next hundred releases.
//  2. **The page is walked, not the table.** v1.169's rule: a completeness
//     check must iterate over the domain, never over the answer. The domain
//     here is the landing page's own text, and the sweep is for *any* release
//     count typed anywhere in it — so the next one typed by hand fails on the
//     way in, whether or not anybody adds a row below.
//  3. **The fallbacks are sentences.** Every phrase the module fills ships in
//     the markup with the number left out, so a reader whose script never
//     arrived gets prose rather than a gap. That is a property of the page and
//     of the table at once, and it is checked in both directions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FIRST_AUTONOMOUS,
  RELEASES,
  SITES,
  applyReleases,
  formatDate,
  parseReleases,
  shortVersion,
  tally,
} from "../src/releases.js";
import { NUMBER_WORDS } from "./support/numberword.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(root, f), "utf8");

const CHANGELOG = read("CHANGELOG.md");
const PAGE = read("index.html");
const PKG = JSON.parse(read("package.json"));

/** Whitespace in the markup wraps; a sentence does not stop being one for it. */
const loose = (s) => s.replace(/\s+/g, " ").trim();
const PAGE_LOOSE = loose(PAGE);

/**
 * Any count of releases, typed. Digits or the English word, immediately in
 * front of the noun — `prosecounts.test.js`'s discriminant, borrowed: a number
 * standing against a collection's name is a claim about that collection today.
 */
const TYPED_COUNT = new RegExp(`\\b(\\d+|${NUMBER_WORDS.join("|")})\\s+releases?\\b`, "i");

test("the changelog parses into one entry per release", () => {
  const entries = parseReleases(CHANGELOG);
  assert.ok(entries.length > 170, `only ${entries.length} entries found`);

  const seen = new Set();
  for (const e of entries) {
    assert.match(e.version, /^\d+\.\d+\.\d+$/);
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!seen.has(e.version), `${e.version} appears twice`);
    seen.add(e.version);
  }

  // Newest first, which is the convention `tally` deliberately does not rely on
  // — so it is asserted here instead, where a broken convention is the finding
  // rather than a silently different record.
  for (let i = 1; i < entries.length; i++) {
    assert.ok(
      entries[i].date <= entries[i - 1].date,
      `${entries[i].version} (${entries[i].date}) sits below an older entry`
    );
  }

  // The count is counted. Deriving it from the newest version number — the
  // one-line arithmetic I nearly shipped — is five short, because five releases
  // were patches with no minor of their own.
  const minors = new Set(entries.map((e) => e.version.split(".").slice(0, 2).join(".")));
  assert.ok(
    minors.size < entries.length,
    "no patch releases: the derived count would be right, and this guard is stale"
  );
});

test("the record is what the changelog says", () => {
  assert.deepEqual(tally(parseReleases(CHANGELOG)), RELEASES);
});

// v1.173's finding, and it was waiting from the day this file was written: two
// releases can land on the same day, and a reduce that kept the later of two
// *equal* dates kept the one further down a newest-first file — the older one.
// The front page would have announced the release before the one it shipped
// with, on the one day of the year anybody would be looking.
test("two releases on one day are separated by their version, not by their place in the file", () => {
  const day = "2026-09-12";
  const pair = [
    { version: "1.173.0", date: day },
    { version: "1.172.0", date: day },
  ];
  assert.equal(tally(pair).latest, "1.173.0");
  assert.equal(tally([...pair].reverse()).latest, "1.173.0", "the answer moved with the file order");
  // And a patch on the same day as its own minor, which is the shape this
  // project has already shipped three times over (v1.9.1, v1.9.2, v1.10.0).
  assert.equal(
    tally([
      { version: "1.9.2", date: "2026-07-25" },
      { version: "1.9.1", date: "2026-07-25" },
      { version: "1.9.0", date: "2026-07-25" },
    ]).latest,
    "1.9.2",
  );
});

test("the record's latest release is the version being shipped", () => {
  assert.equal(RELEASES.latest, PKG.version);
  assert.equal(parseReleases(CHANGELOG)[0].version, PKG.version);
});

test("the autonomous era is a suffix of the whole history", () => {
  const entries = parseReleases(CHANGELOG);
  assert.ok(RELEASES.autonomous > 150, "the era should be most of the history by now");
  assert.ok(RELEASES.autonomous < RELEASES.total, "the era starts after the first release");
  assert.ok(entries.some((e) => e.version === FIRST_AUTONOMOUS));

  // The floor is a version rather than a date, and the reason is in the file:
  // v1.9.1 and v1.9.2 carry the same date as v1.10.0, so *the day the human
  // stepped back* does not separate the two eras and a date floor would count
  // two reviewed releases into the unreviewed one.
  const sameDay = entries.filter((e) => e.date === "2026-07-24");
  assert.ok(
    sameDay.some((e) => e.version.startsWith("1.9.")),
    "the two eras no longer share a day: a date floor would now be safe, and this note is stale"
  );
});

test("every site the module fills exists on the page exactly once", () => {
  for (const site of SITES) {
    const hits = PAGE.split(`id="${site.id}"`).length - 1;
    assert.equal(hits, 1, `${site.id} appears ${hits} times in index.html`);
  }
});

test("every site ships a fallback sentence with no number in it", () => {
  for (const site of SITES) {
    assert.ok(
      PAGE_LOOSE.includes(loose(site.fallback)),
      `${site.id}: index.html does not carry its fallback (${site.fallback})`
    );
    assert.doesNotMatch(
      site.fallback,
      TYPED_COUNT,
      `${site.id}: the fallback states a count, which is the defect this closes`
    );
  }
});

test("the page states no release count of its own", () => {
  // The sweep that would have caught *Over ten releases* in v1.19. It walks the
  // page rather than the table above, so a count typed into a sentence nobody
  // has given an id to fails just the same.
  const found = TYPED_COUNT.exec(PAGE_LOOSE);
  assert.equal(
    found,
    null,
    found && `index.html types a release count: "${found[0]}" — fill it from src/releases.js`
  );
});

test("filling the page replaces every fallback with a sentence carrying the count", () => {
  const els = new Map(SITES.map((s) => [s.id, { textContent: s.fallback }]));
  const doc = { getElementById: (id) => els.get(id) ?? null };

  assert.equal(applyReleases(doc), SITES.length);

  for (const site of SITES) {
    const after = els.get(site.id).textContent;
    assert.notEqual(after, site.fallback, `${site.id} was left as its fallback`);
    assert.match(after, /\d/, `${site.id} filled without a number in it`);
  }

  // The two figures this release exists to publish, each on the page somewhere.
  const all = [...els.values()].map((e) => e.textContent).join(" ");
  assert.ok(all.includes(String(RELEASES.total)), "the total is nowhere on the page");
  assert.ok(all.includes(String(RELEASES.autonomous)), "the era's count is nowhere on the page");
  assert.ok(all.includes(shortVersion(RELEASES.latest)), "the latest version is not named");
  assert.ok(all.includes(formatDate(RELEASES.latestDate)), "the latest date is not named");
});

test("a missing element is skipped rather than thrown over", () => {
  const doc = { getElementById: () => null };
  assert.equal(applyReleases(doc), 0);
});

test("dates are written the way English writes them", () => {
  assert.equal(formatDate("2026-09-12"), "12 September 2026");
  assert.equal(formatDate("2026-07-22"), "22 July 2026");
  // No leading zero on the day, and no timezone anywhere near it: a release
  // date is a label on an entry, and `new Date("2026-09-12")` is an instant
  // that lands on the eleventh for most of the Americas.
  assert.equal(formatDate("2026-01-01"), "1 January 2026");
  assert.throws(() => formatDate("2026-13-01"), RangeError);
  assert.throws(() => formatDate("12 September 2026"), RangeError);
});

test("a release is named the way this project names one", () => {
  assert.equal(shortVersion("1.172.0"), "v1.172");
  assert.equal(shortVersion("1.80.1"), "v1.80");
  assert.throws(() => shortVersion("v1.172"), RangeError);
});

test("the record cannot be built out of nothing", () => {
  assert.throws(() => tally([]), RangeError);
});
