// moreworlds.test.js — the strip's door (v1.168).
//
// `node --test` cannot lay out a page, so the split is the one this project has
// used since v1.87: a browser measured the rectangles, `src/moreworlds.js`
// holds the arithmetic that judges them, and this file sweeps the arithmetic.
// The numbers in the first two tests are the walk's own, at 390 × 844 with
// touch emulated — a viewport is not a device, and the fade this file subtracts
// is only painted below 960 px.
//
// The three claims worth stating before the assertions, because each is a way
// this control could rot without anything going red:
//
//   1. The label is a **subtraction**, never a typed number, so a fourteenth
//      world changes it the day it lands.
//   2. The button survives its own success — a door that vanishes the moment it
//      is opened is a trap, and the `open ||` in `stripState` is the whole of
//      the remedy.
//   3. The fade is declared in two places that cannot see each other, so the
//      stylesheet is read here and the pair is pinned.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FADE_PX,
  FEWER_LABEL,
  readableChips,
  hiddenWorlds,
  moreLabel,
  stripState,
  centreScroll,
} from "../src/moreworlds.js";
import { SCENARIOS } from "../src/scenarios.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

// The row as a headless Chromium reported it at 390 × 844, left edges and
// widths in page coordinates. Three group headings are in the row too and are
// not chips; only the chips are counted, which is what `main.js` passes.
const WALK = {
  box: { left: 22, right: 368 },
  chips: [
    { left: 110, right: 208 }, // 🌱 Genesis
    { left: 216, right: 352 }, // 🌾 The Commons
  ],
  scrollWidth: 2200,
  clientWidth: 346,
};

// ---- what the walk found ----

test("at 390 px one chip of thirteen is clear of the fade", () => {
  // Two are inside the box. The second ends at 352 and the last 28 px of a
  // 368 px row are masked out, so a visitor reads one name and a smudge.
  assert.equal(readableChips(WALK.chips, WALK.box, 0), 2);
  assert.equal(readableChips(WALK.chips, WALK.box), 1);
});

test("the strip's own count and what it shows are twelve apart", () => {
  const state = stripState({ readable: readableChips(WALK.chips, WALK.box) });
  assert.equal(state.hidden, SCENARIOS.length - 1);
  assert.equal(state.needed, true);
  assert.equal(state.label, `＋ ${SCENARIOS.length - 1} more worlds`);
});

test("the fade this file subtracts is the one the stylesheet paints", () => {
  // Pinned rather than deduplicated: the mask is painted before any module
  // runs, so the number has to be in the CSS, and this file has to subtract it.
  const css = read("style.css");
  const masks = [...css.matchAll(/mask-image:\s*linear-gradient\(to right,[^;]*?(\d+)px/g)];
  assert.ok(masks.length > 0, "the strip's fade mask has gone from the stylesheet");
  for (const m of masks) {
    assert.equal(
      Number(m[1]),
      FADE_PX,
      "the stylesheet fades a different width than `FADE_PX` subtracts",
    );
  }
});

// ---- the arithmetic ----

test("a chip counts only when the whole of it is inside and clear", () => {
  const box = { left: 0, right: 100 };
  const clear = { left: 0, right: 100 - FADE_PX };
  assert.equal(readableChips([clear], box), 1);
  assert.equal(readableChips([{ left: -1, right: 40 }], box), 0, "cut off at the start");
  assert.equal(readableChips([{ left: 40, right: 101 }], box), 0, "past the end");
  assert.equal(readableChips([{ left: 40, right: 100 - FADE_PX + 1 }], box), 0, "under the fade");
});

test("half a pixel of layout rounding does not cost a world", () => {
  // A browser reports a chip flush against an edge as 345.9998 against 346.
  const box = { left: 0, right: 100 };
  assert.equal(readableChips([{ left: -0.4, right: 100 - FADE_PX + 0.4 }], box), 1);
  assert.equal(readableChips([{ left: -0.6, right: 40 }], box), 0);
});

test("a row showing everything hides nothing, and never less than nothing", () => {
  assert.equal(hiddenWorlds(13, 13), 0);
  assert.equal(hiddenWorlds(13, 20), 0, "more seen than exist is a measurement bug, not a negative");
});

test("one hidden world is a world, not worlds", () => {
  assert.equal(moreLabel(1), "＋ 1 more world");
  assert.equal(moreLabel(2), "＋ 2 more worlds");
  assert.equal(moreLabel(0), "＋ 0 more worlds");
});

test("the door does not disappear the moment it works", () => {
  // Open, every chip is readable, so `hidden` is zero — and a button that were
  // only offered while something was hidden would take itself off the page and
  // leave a visitor with a wrapped strip and no way back.
  const open = stripState({ total: 13, readable: 13, open: true });
  assert.equal(open.hidden, 0);
  assert.equal(open.needed, true);
  assert.equal(open.label, `− ${FEWER_LABEL}`);
  // Shut with nothing hidden — a desktop — is the case with no control at all.
  assert.equal(stripState({ total: 13, readable: 13 }).needed, false);
});

test("the two halves of the button agree about the state", () => {
  // The eye gets `＋` and `−`; an ear gets words, because punctuation is not a
  // direction to a screen reader. They are allowed to differ in wording only
  // while they agree about which way the door is facing.
  const shut = stripState({ total: 13, readable: 1 });
  const open = stripState({ total: 13, readable: 13, open: true });
  assert.match(shut.label, /^＋/);
  assert.match(shut.announce, /^Show all 13 worlds$/);
  assert.match(open.label, /^−/);
  assert.ok(open.announce.includes(FEWER_LABEL));
  assert.ok(open.announce.includes("13"));
});

test("the announced count is the collection's, not a number typed here", () => {
  const state = stripState({ readable: 0 });
  assert.ok(state.announce.includes(String(SCENARIOS.length)));
  assert.equal(state.hidden, SCENARIOS.length);
});

// ---- the centring ----

test("a chip in the middle of the row is put in the middle of the view", () => {
  // 346 of 2,200, a chip 98 wide starting at 1,000: centre it on 1,049.
  assert.equal(centreScroll(1000, 98, 346, 2200), 1000 + 49 - 173);
});

test("the first and last chips cannot be centred, and are not chased past the end", () => {
  assert.equal(centreScroll(0, 98, 346, 2200), 0);
  assert.equal(centreScroll(2100, 98, 346, 2200), 2200 - 346);
});

test("a row with nothing to scroll never moves", () => {
  for (const left of [0, 100, 900]) {
    assert.equal(centreScroll(left, 98, 1117, 1117), 0);
  }
});

test("the scroll it asks for is always one the row can take", () => {
  // A sweep rather than three samples: the clamp is the whole function, and an
  // off-by-one in it scrolls the row onto a blank margin at one end or leaves a
  // chip half off at the other.
  const view = 346;
  const content = 2200;
  for (let left = 0; left <= content - 50; left += 7) {
    for (const w of [60, 98, 135]) {
      const at = centreScroll(left, w, view, content);
      assert.ok(at >= 0, `scrolled before the start at ${left}`);
      assert.ok(at <= content - view, `scrolled past the end at ${left}`);
    }
  }
});

test("centring is monotone: a chip further along never scrolls the row back", () => {
  let last = -1;
  for (let left = 0; left <= 2150; left += 5) {
    const at = centreScroll(left, 98, 346, 2200);
    assert.ok(at >= last, `the row went backwards at ${left}`);
    last = at;
  }
});

// ---- the page holds up its end ----

test("the page carries the button, hidden, with a name before anything measures", () => {
  const html = read("app/index.html");
  assert.match(html, /id="btn-more-worlds"/, "the strip has lost its door");
  const tag = html.match(/<button\b[^>]*id="btn-more-worlds"[\s\S]*?>/)[0];
  assert.match(tag, /\bhidden\b/, "it must not be on the page until the row is measured");
  assert.match(tag, /aria-label="[^"]*\S/, "a button with no text needs a name in the markup");
  assert.match(tag, /aria-expanded="false"/, "a disclosure says which way it is facing");
});

test("the row's open state is a class the stylesheet knows", () => {
  const css = read("style.css");
  assert.match(css, /\.scenario-chips\.open\s*\{/, "nothing opens the row");
  const rule = css.match(/\.scenario-chips\.open\s*\{[\s\S]*?\}/)[0];
  assert.match(rule, /flex-wrap:\s*wrap/, "an open row has to wrap or it is still a row");
  assert.match(rule, /mask-image:\s*none/, "an open row has no cut edge, so it must not fade");
});

test("the label and the button share a line, so the strip costs no height", () => {
  // The constraint that decided the design: the pond must not move on first
  // paint. A button on a line of its own would move it for every visitor,
  // including the ones who never open the strip.
  const html = read("app/index.html");
  const head = html.match(/<div class="scenarios-head">[\s\S]*?<\/div>/)[0];
  assert.match(head, /id="scenarios-label"/);
  assert.match(head, /id="btn-more-worlds"/);
});

test("main.js measures the row shut, whatever state it is in", () => {
  // The question the button answers is *how much would be hidden if this were
  // closed*, and asking it of an open row always gets zero.
  const body = read("src/main.js");
  const fn = body.match(/function syncMoreWorlds\(\)[\s\S]*?\n}/)[0];
  const removeAt = fn.indexOf('classList.remove("open")');
  const measureAt = fn.indexOf("getBoundingClientRect");
  assert.ok(removeAt > -1, "the row is never put back into its shut state to be measured");
  assert.ok(measureAt > removeAt, "the row is measured before it is shut, so the count is wrong");
});
