// contents.test.js — the contents, and the four ways a contents lies.
//
// This is `tour.test.js`'s subject one release on and one rule stricter. A
// guide's stops are typed, so the test that keeps it honest asks *does the page
// still have this?*; a contents is *read off* the page, so that question cannot
// fail. What can fail instead is everything around the reading:
//
//   1. **A row a reader cannot read.** Every entry here is one of this page's
//      own headings split into a mark and a name, and a heading that is empty
//      or is nothing but a mark would become a blank button that still goes
//      somewhere. The shipped page is read back below and every heading in it
//      has to survive the split with words left over.
//   2. **A "you are here" that goes backwards.** The one failure that makes a
//      reader stop trusting the control, and the one nothing but a sweep can
//      find: a rule that is right in the middle of a document and wrong at its
//      end will pass any three sampled scroll offsets you care to choose.
//   3. **A chapter you can never be in.** Scrolling stops with a screen of page
//      still below the reading line, so every chapter that begins inside that
//      last screenful is unreachable under the obvious rule — and this page has
//      three headings in its last screen. Swept, not argued.
//   4. **A count that is out by one.** The bar is the only place on this page a
//      visitor is asked to count anything, and it counts from one.
//
// The geometry used below is a measurement of `app/index.html` in a headless
// Chromium at 390 × 844, taken the day this was written. It is a *fixture and
// not a contract* — the page's height changes every release, and a test that
// pinned it would be a second copy of the page, which is the exact thing this
// feature exists to avoid. What is asserted about it is the shape of the
// answer, which does not depend on the numbers being current.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  CONTENTS_MIN,
  READING_LINE,
  UNMARKED_ICON,
  barShown,
  chapterAt,
  chapterCount,
  chapters,
  readingLine,
  splitHeading,
  toggleTitle,
} from "../src/contents.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(ROOT, "app/index.html"), "utf8");

/** v1.164's page at 390 × 844: eleven headings, 5,638 px, the water ending at 786. */
const MEASURED = {
  viewport: 844,
  docHeight: 5638,
  pondBottom: 786,
  tops: [260, 1110, 1453, 1832, 2335, 2874, 3079, 3613, 3930, 4149, 4302],
};

/** Every scroll offset this document has, which is what "swept" means here. */
function sweep(geometry, visit) {
  const maxY = Math.max(0, geometry.docHeight - geometry.viewport);
  for (let y = 0; y <= maxY; y += 1) {
    visit(y, { y, viewport: geometry.viewport, docHeight: geometry.docHeight });
  }
}

test("a heading splits into the mark on its front and the words after it", () => {
  assert.deepEqual(splitHeading("🔍 What you are looking at"), {
    icon: "🔍",
    name: "What you are looking at",
  });
  // Punctuation at the end is part of the name — the split is anchored at the
  // front, so a heading that asks a question keeps its question mark.
  assert.deepEqual(splitHeading("🎯 Are they getting better?"), {
    icon: "🎯",
    name: "Are they getting better?",
  });
  // A mark can be more than one code point. Neither of these is a single
  // character and the rule does not need to know that.
  assert.equal(splitHeading("⏩️ Skip ahead").icon, "⏩️");
  assert.equal(splitHeading("👋🏽 Meet somebody").name, "Meet somebody");
  // A heading with no mark says so rather than guessing one.
  assert.deepEqual(splitHeading("Western Mere"), { icon: "", name: "Western Mere" });
  // A number is a word for this purpose: `2,600 steps later` is a name.
  assert.deepEqual(splitHeading("2,600 steps later"), { icon: "", name: "2,600 steps later" });
  assert.deepEqual(splitHeading("   🌳   Tree of Life  "), { icon: "🌳", name: "Tree of Life" });
  assert.deepEqual(splitHeading(""), { icon: "", name: "" });
  assert.deepEqual(splitHeading(null), { icon: "", name: "" });
});

test("a chapter always has a mark and always has words", () => {
  const list = chapters(["🏅 Worth watching", "Western Mere"]);
  assert.equal(list.length, 2);
  assert.equal(list[0].icon, "🏅");
  // The pin, supplied for the one heading here that carries nothing of its own.
  assert.equal(list[1].icon, UNMARKED_ICON);
  assert.equal(list[1].name, "Western Mere");
  // A heading that is only a mark, or is nothing at all, is not a row: the
  // button would still be pressable and would still scroll somewhere.
  assert.deepEqual(chapters(["🌊", "", "   "]), []);
  assert.deepEqual(chapters([]), []);
  assert.deepEqual(chapters(null), []);
});

test("every heading the shipped page carries survives the split", () => {
  // The same reading `main.js` does, done to the source rather than to a DOM:
  // an `<h2>` inside a `<section>`. The overlays — the guide, the postcard, the
  // skip card — carry headings too and are `div`s, which is why they are not in
  // the contents and why this scan has to see the difference.
  const sections = page.split(/<section\b/).slice(1);
  const headings = [];
  for (const chunk of sections) {
    const end = chunk.indexOf("</section>");
    const body = end === -1 ? chunk : chunk.slice(0, end);
    for (const m of body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)) {
      const text = m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (text) headings.push(text);
    }
  }
  assert.ok(
    headings.length >= CONTENTS_MIN,
    `the page has ${headings.length} headings; below ${CONTENTS_MIN} there is no contents to show`,
  );
  const list = chapters(headings);
  assert.equal(list.length, headings.length, "a heading on this page became no chapter at all");
  for (const chapter of list) {
    assert.ok(chapter.name.length > 0, "a chapter with no words is a blank row");
    assert.ok(chapter.icon.length > 0, "a chapter with no mark is a ragged row");
  }
  // The pin is for the exception, and there is meant to be one of it: the pond's
  // name is the only heading here that is a name rather than a label. Two would
  // mean somebody added a panel and forgot the mark every other one carries.
  const bare = list.filter((c) => c.icon === UNMARKED_ICON);
  assert.ok(bare.length <= 1, `${bare.length} headings on this page carry no mark of their own`);
});

test("the reading line starts a third down the screen and ends at the last pixel", () => {
  const { viewport, docHeight } = MEASURED;
  assert.equal(readingLine({ y: 0, viewport, docHeight }), READING_LINE * viewport);
  const maxY = docHeight - viewport;
  assert.equal(readingLine({ y: maxY, viewport, docHeight }), docHeight);
  // Past the end, and before the start: a window reports both during a rubber
  // band scroll, and neither may move the line outside the document.
  assert.equal(readingLine({ y: maxY + 500, viewport, docHeight }), docHeight);
  assert.equal(readingLine({ y: -300, viewport, docHeight }), READING_LINE * viewport);
  // A page shorter than its window has one position and it is the whole page.
  assert.equal(readingLine({ y: 0, viewport: 844, docHeight: 400 }), 844);
  // Nothing a window can report may produce a line that is not a number.
  for (const junk of [{}, { y: NaN, viewport: NaN, docHeight: NaN }, null]) {
    assert.ok(Number.isFinite(readingLine(junk)), "a window with nothing in it broke the line");
  }
});

test("the reading line only ever moves down the page", () => {
  let last = -Infinity;
  sweep(MEASURED, (_y, scroll) => {
    const line = readingLine(scroll);
    assert.ok(line > last, `the line went back up at y=${scroll.y}`);
    last = line;
  });
});

test("you are here never goes backwards, and every chapter can be reached", () => {
  // Four geometries: the measured page, a page whose last three chapters are
  // all inside the final screenful (the case the sliding line exists for), a
  // page barely longer than its window, and one chapter per screen.
  const cases = [
    MEASURED,
    { viewport: 844, docHeight: 3000, tops: [0, 900, 1800, 2400, 2500, 2600] },
    { viewport: 844, docHeight: 900, tops: [0, 300, 600, 880] },
    { viewport: 600, docHeight: 6000, tops: [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800] },
  ];
  for (const geometry of cases) {
    const seen = new Set();
    let last = -1;
    sweep(geometry, (y, scroll) => {
      const at = chapterAt(geometry.tops, scroll);
      assert.ok(at >= last, `the mark jumped back to ${at} from ${last} at y=${y}`);
      assert.ok(at >= 0 && at < geometry.tops.length, `chapter ${at} is not on this page`);
      // Never ahead of the reader. The chapter the bar names has to have begun
      // at or above the bottom edge of the window — a bar naming a panel that
      // is still off the screen is the failure a browser walk found in the
      // first version of the reading line, and it is the reason the slide is
      // confined to the last screenful.
      assert.ok(
        geometry.tops[at] <= y + geometry.viewport,
        `at y=${y} the bar named chapter ${at}, which starts ${geometry.tops[at] - y - geometry.viewport}px below the screen`,
      );
      last = at;
      seen.add(at);
    });
    assert.equal(
      seen.size,
      geometry.tops.length,
      `${geometry.tops.length - seen.size} chapter(s) of ${geometry.tops.length} can never be reached`,
    );
  }
});

test("the middle of the page is read, not anticipated", () => {
  // The walk that found this: at 3,700 px down the shipped page, a line that
  // slid evenly across the whole scroll had already passed the Chronicle — the
  // last of eleven — while two other panels filled the window. The chapter here
  // is the one whose panel a reader at this offset is actually looking at.
  const { viewport, docHeight, tops } = MEASURED;
  assert.equal(chapterAt(tops, { y: 3700, viewport, docHeight }), 8);
  assert.equal(chapterAt(tops, { y: 2400, viewport, docHeight }), 4);
});

test("the top of the page is the first chapter and the bottom is the last", () => {
  const { viewport, docHeight, tops } = MEASURED;
  assert.equal(chapterAt(tops, { y: 0, viewport, docHeight }), 0);
  assert.equal(chapterAt(tops, { y: docHeight - viewport, viewport, docHeight }), tops.length - 1);
  // An empty list is not chapter zero — it is the caller's cue to put the bar
  // away. A page with no headings would otherwise draw "1 of 0".
  assert.equal(chapterAt([], { y: 0, viewport, docHeight }), -1);
  assert.equal(chapterAt(null, { y: 0, viewport, docHeight }), -1);
});

test("the bar waits until the water has left the middle of the screen", () => {
  const { viewport, docHeight, pondBottom } = MEASURED;
  const at = (y) => barShown({ y, viewport, docHeight }, pondBottom);
  assert.equal(at(0), false, "the bar was up on the pond a visitor had just arrived at");
  assert.equal(at(pondBottom - viewport / 2 - 1), false);
  assert.equal(at(pondBottom - viewport / 2 + 1), true);
  assert.equal(at(docHeight - viewport), true);
  // Once it is up it stays up: the test that the threshold is a scroll position
  // and not a state machine with a hole in it.
  let seenUp = false;
  sweep(MEASURED, (_y, scroll) => {
    const up = barShown(scroll, pondBottom);
    if (up) seenUp = true;
    else assert.ok(!seenUp, `the bar went away again at y=${scroll.y}`);
  });
  assert.ok(seenUp);
});

test("the count reads like a book, and cannot be out by one", () => {
  assert.equal(chapterCount(0, 11), "1 of 11");
  assert.equal(chapterCount(10, 11), "11 of 11");
  // Out of range in either direction is clamped rather than printed: a bar that
  // says "0 of 11" or "12 of 11" is a bar a reader stops believing.
  assert.equal(chapterCount(-4, 11), "1 of 11");
  assert.equal(chapterCount(99, 11), "11 of 11");
  assert.equal(chapterCount(0, 0), "");
  assert.equal(chapterCount(NaN, NaN), "");
});

test("the spoken name says where you are and what pressing does", () => {
  const said = toggleTitle({ name: "Worth watching" }, 5, 11);
  assert.match(said, /^Contents/);
  assert.ok(said.includes("6 of 11"), said);
  assert.ok(said.includes("Worth watching"), said);
  // A listener is told what the control *does*, not only what it is about.
  assert.match(said, /list of parts/i);
  // Before there is a chapter to be in, it is still a control with a name.
  assert.match(toggleTitle(null, -1, 0), /^Contents/);
});

test("the contents draws no random numbers and knows nothing of the pond", () => {
  // The house check for a pure observer, done to the source: this module may
  // not reach the world, the clock or the generator. A contents that could
  // would be a scroll position with a vote on what the pond does next.
  // The comments come out first. This module's prose is *about* a document and
  // a window, so a scan of the raw file would be reading the explanation of the
  // rule as a breach of it — which is a whole class of source-scanning test
  // being wrong, and it caught this one on its first run.
  const src = readFileSync(join(ROOT, "src/contents.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.ok(!/\bimport\b/.test(src), "contents.js imports something; it is meant to stand alone");
  assert.ok(!/Math\.random|\brng\b|Date\.now|performance\.now/.test(src));
  assert.ok(!/document\.|window\./.test(src), "contents.js touched the page it is meant to describe");
});
