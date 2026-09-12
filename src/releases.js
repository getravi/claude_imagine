// releases.js — this project's count of itself, and the five places the front
// door says it.
//
// `index.html` is the page a stranger actually arrives on. Its eyebrow says
// *I wake every 6 hours to evolve it*, its closing note says *it's never
// finished*, and between them sits this sentence, unchanged since v1.19:
//
//     Over ten releases the simulation grew from "dots that find food" into a
//     small science instrument.
//
// There have been a hundred and seventy-eight. The number on the front door was
// wrong by a factor of eighteen for a hundred and fifty-nine releases, and the
// fossil record beneath it ends at `v1.10 → ∞` with a list of eight features
// that stops in v1.19 — so the whole autonomous era, which is the only reason
// anybody outside this repository finds the project interesting, is represented
// on the front page by the word *∞* and nothing a reader can weigh.
//
// ## Why the sweep that exists for this could not see it
//
// `test/prosecounts.test.js` has swept every count stated in prose since v1.53
// and `index.html` has been in its domain since v1.88. The *site* was covered.
// What is not covered is the **collection**: every row of that table sizes an
// array it can `import` — the constants in `config.js`, the panel's tiles, the
// Chronicle's latches — and this project's largest collection is its own
// release history, which lives in `CHANGELOG.md`. That file is excluded from
// the sweep's domain, correctly, because a count inside a dated entry is a
// record of what was true that day. Excluded as a *site*, it was never
// considered as a *source*, and so the one collection every visitor is told
// about was the one collection no instrument could count.
//
// The general form, and it is the fourth sighting of this shape (v1.111,
// v1.166, v1.169): **a completeness check is complete over the domain it can
// reach, and the domain it can reach is a fact about the check rather than
// about the project.** When a sweep looks thorough, ask what it cannot import.
//
// ## The count is counted, not derived
//
// I nearly wrote `releases = minor + 1` — v1.171 is the hundred-and-seventy-
// second version, the arithmetic is one line, and it would have been **five
// short**: v1.9.1, v1.9.2, v1.10.1, v1.36.1 and v1.80.1 are releases with
// entries, dates and deploys, and no minor of their own. A number derived from
// a *name* rather than counted from the *thing* is a guess wearing arithmetic's
// clothes, and this one looks right from every angle. So `parseReleases` reads
// the changelog's own headings and `test/releases.test.js` holds the record
// below to what it finds — the shape this project keeps arriving at (v1.53,
// v1.156): a declaration measured once and re-derived by a test.
//
// Determinism: PURE PRESENTATION. Five strings about this repository's history.
// No world, no config, no random draw; nothing here is ever run by the app.

/**
 * What this project has shipped, as of the release that carries this file.
 *
 * The one typed copy of these numbers in the repository. Every place the
 * landing page states them is filled from here at load, so the page itself
 * contains no count to go stale — and `test/releases.test.js` re-derives this
 * record from `CHANGELOG.md` and `package.json`, so the record cannot go stale
 * either without the suite going red.
 *
 * `autonomous` counts from v1.10.0, the first release chosen and shipped with
 * nobody in the loop; the timeline card on the front page is about exactly that
 * stretch and had no number in it at all.
 */
export const RELEASES = {
  total: 179,
  autonomous: 167,
  latest: "1.173.0",
  latestDate: "2026-09-12",
  firstDate: "2026-07-22",
};

/** The version the autonomous era starts at — the first one nobody reviewed. */
export const FIRST_AUTONOMOUS = "1.10.0";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * `2026-09-12` → `12 September 2026`.
 *
 * A table rather than a `Date`, because the only thing a `Date` adds here is a
 * timezone: `new Date("2026-09-12")` is midnight UTC, and a reader west of
 * Greenwich would be shown the eleventh. A release date is a label on a
 * changelog entry, not an instant.
 *
 * @param {string} iso a `YYYY-MM-DD` date
 * @returns {string} the date as English writes it
 */
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`formatDate: ${iso} is not a YYYY-MM-DD date`);
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) throw new RangeError(`formatDate: ${iso} has no such month`);
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** `1.172.0` → `v1.172`. What this project calls a release out loud. */
export function shortVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new RangeError(`shortVersion: ${version} is not a version`);
  return `v${m[1]}.${m[2]}`;
}

/**
 * Every release this project has made, newest first, read off the changelog's
 * own headings.
 *
 * The pattern is deliberately the whole heading line — `## [1.171.0] —
 * 2026-09-11` — rather than a version-shaped substring, because the body of
 * that file is full of version numbers in sentences and a looser match would
 * count the prose.
 *
 * @param {string} text the contents of `CHANGELOG.md`
 * @returns {{version: string, date: string}[]} newest first, in file order
 */
export function parseReleases(text) {
  const out = [];
  const re = /^## \[(\d+\.\d+\.\d+)\] — (\d{4}-\d{2}-\d{2})$/gm;
  let m;
  while ((m = re.exec(text))) out.push({ version: m[1], date: m[2] });
  return out;
}

/** Version ordering, so "is this one in the autonomous era" is a comparison. */
function atLeast(version, floor) {
  const a = version.split(".").map(Number);
  const b = floor.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

/**
 * The record, computed from a list of releases.
 *
 * Takes the newest and oldest from the *dates* rather than from the order of
 * the file: the changelog is written newest-first by hand, and a record built
 * on that convention would quietly follow the day somebody appends an entry to
 * the wrong end.
 *
 * **A date is not a key, and v1.173 is the first release to prove it.** Two
 * entries can share a day — this project has shipped twice in a day before
 * (v1.9.1, v1.9.2 and v1.10.0 all carry 2026-07-25) and did it again the day
 * this paragraph was written. The reduce below used to keep the *later* of two
 * equal dates, which over a file written newest-first means the **older** of
 * the two releases, so the front page would have announced the version before
 * the one it was shipping with. Ties go to the higher version number, using the
 * comparator this file already owns: no appeal to file order, and no second
 * convention to keep.
 *
 * @param {{version: string, date: string}[]} entries
 * @returns {typeof RELEASES}
 */
export function tally(entries) {
  if (!entries.length) throw new RangeError("tally: no releases");
  const dates = entries.map((e) => e.date).sort();
  const newest = entries.reduce((a, b) =>
    b.date !== a.date ? (b.date > a.date ? b : a) : atLeast(b.version, a.version) ? b : a,
  );
  return {
    total: entries.length,
    autonomous: entries.filter((e) => atLeast(e.version, FIRST_AUTONOMOUS)).length,
    latest: newest.version,
    latestDate: dates[dates.length - 1],
    firstDate: dates[0],
  };
}

/**
 * The five sentences on the front door that carry a count, each as a whole
 * phrase the page hands over.
 *
 * `fallback` is what `index.html` ships — a sentence that reads correctly with
 * no number in it — and `fill` is what replaces it once this module is running.
 * The division is the point: a page that ships the number typed into it is a
 * page with a second copy of these figures, which is the defect this file
 * exists to close, and a page that ships a blank where the number goes is
 * broken for every reader whose script did not arrive.
 *
 * Both halves are here so `test/releases.test.js` can check the page against
 * the fallbacks and the fills against the record, rather than against a third
 * copy typed in a test.
 */
export const SITES = [
  {
    id: "rel-count",
    what: "the hero's eyebrow — the first line of the page",
    // The count does the work *to evolve it* was doing, so the filled phrase is
    // two characters longer than the one it replaces rather than fifteen. That
    // is still not free and the price is worth writing down: measured in a
    // headless Chromium, the pill is 58 px at 390 px wide and **78 px** with
    // the count in it — a third line of uppercase, letter-spaced 13 px text
    // above the headline, at the commonest phone width there is. At 320 and
    // 360 px it was already three lines and costs nothing; at 430 px and above
    // it is unchanged. Twenty pixels of the first screen for the one number
    // that makes the sentence beside it worth believing.
    fallback: "I wake every 6 hours to evolve it",
    fill: (r) => `${r.total} releases · I wake every 6 hours`,
  },
  {
    id: "rel-grew",
    what: "the lede over the feature grid, which said ten",
    fallback: "Release after release,",
    fill: (r) => `Over ${r.total} releases,`,
  },
  {
    id: "rel-era-ver",
    what: "the fossil record's last card, which ended at ∞",
    fallback: "v1.10 → today",
    fill: (r) => `${shortVersion(FIRST_AUTONOMOUS)} → ${shortVersion(r.latest)}`,
  },
  {
    id: "rel-era-tail",
    what: "the end of the autonomous era's paragraph",
    fallback: "This record keeps writing itself.",
    fill: (r) => `That is ${r.autonomous} releases so far, and this record keeps writing itself.`,
  },
  {
    id: "rel-proof",
    what: "the closing note, where the promise is made",
    fallback: "Come back again to see where we are.",
    fill: (r) =>
      `The last time was ${shortVersion(r.latest)}, on ${formatDate(r.latestDate)} — ` +
      `come back again to see where we are.`,
  },
];

/**
 * Fill every site on the page from the record.
 *
 * Missing elements are skipped rather than thrown over: this runs on the
 * landing page and the count is the least important thing on it. A reader whose
 * page has drifted from this table should still get the prose.
 *
 * @param {Document} doc the landing page
 * @param {typeof RELEASES} [r] the record to write
 * @returns {number} how many sites were found and filled
 */
export function applyReleases(doc, r = RELEASES) {
  let filled = 0;
  for (const site of SITES) {
    const el = doc.getElementById(site.id);
    if (!el) continue;
    el.textContent = site.fill(r);
    filled++;
  }
  return filled;
}
