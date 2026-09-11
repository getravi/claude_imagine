// pondstick.test.js — the pinned pond, and the two ways pinning it goes wrong.
//
// `src/pondstick.js` exists because a stylesheet cannot divide its own width by
// its own height. The rule it stands in for is *pin the pond when the pond is a
// small part of the screen*, and what a stylesheet can actually say is a pair of
// thresholds — so the whole feature rests on one derivation, and a derivation
// nobody sweeps is a number somebody tried until it looked right.
//
// Two failures, and neither is visible in a screenshot of the device I happen to
// be holding:
//
//   1. **A pinned pond that eats the screen.** Turn a phone sideways and the
//      one-column layout is still on — 844 px is under the 960 px fold — while
//      the window is 390 px tall and the pond wants 550 of them. The guard is
//      swept over every window this page can be opened in rather than sampled at
//      the four sizes I would have thought to check.
//   2. **A stylesheet that has drifted from the derivation.** The two numbers in
//      the media query are the module's constants written in the one syntax a
//      browser reads, which is to say a second copy. It is read back here, the
//      same way `key.test.js` reads the renderer's nose lengths back — the copy
//      is not left to trust.
//
// And one property that is the whole point of the release: the readable share.
// It is asserted against the browser measurement that prompted this, so a future
// layout that quietly undoes it fails here rather than in a devlog entry nobody
// writes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MAX_SHARE,
  PAGE_GUTTER,
  POND_ASPECT,
  POND_NATURAL_WIDTH,
  STAGE_BORDERS,
  STICK_MAX_RATIO,
  STICK_MAX_WIDTH,
  pondHeight,
  pondShare,
  pondWidth,
  readableWithPond,
  sticks,
} from "../src/pondstick.js";
import { DEFAULT_CONFIG } from "../src/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/**
 * The stage, measured in a headless Chromium at 390 × 844 with the default pond
 * and the guide dismissed, the day this was written.
 *
 * A fixture in the sense `contents.test.js` means it — the page moves every
 * release — except for the height, which is not a fact about the page at all.
 * It is `(390 − gutter) / aspect + borders`, and it is here to hold the
 * arithmetic to something a browser actually reported.
 */
const MEASURED = Object.freeze({
  viewportWidth: 390,
  viewportHeight: 844,
  stageTop: 556,
  stageHeight: 239,
  docHeight: 4977,
  leftColumnBottom: 4028,
  readable: 1638,
  readablePinned: 4871,
});

test("the pond's shape is the world's shape, not a second copy of it", () => {
  assert.equal(POND_ASPECT, DEFAULT_CONFIG.width / DEFAULT_CONFIG.height);
  assert.equal(POND_NATURAL_WIDTH, DEFAULT_CONFIG.width);
});

test("the arithmetic reproduces the stage a browser measured", () => {
  assert.equal(pondWidth(MEASURED.viewportWidth), MEASURED.viewportWidth - PAGE_GUTTER);
  assert.equal(Math.round(pondHeight(MEASURED.viewportWidth)), MEASURED.stageHeight);
  // And the canvas inside it, which is the height without the two borders.
  assert.equal(
    Math.round(pondHeight(MEASURED.viewportWidth) - STAGE_BORDERS),
    MEASURED.stageHeight - STAGE_BORDERS
  );
});

test("the canvas never displays wider than itself", () => {
  assert.equal(pondWidth(4000), POND_NATURAL_WIDTH);
  assert.equal(pondWidth(POND_NATURAL_WIDTH + PAGE_GUTTER), POND_NATURAL_WIDTH);
  // A window narrower than its own gutters is a window with no pond in it.
  assert.equal(pondWidth(PAGE_GUTTER - 1), 0);
  assert.equal(pondHeight(PAGE_GUTTER - 1), 0);
});

test("every window that pins the pond keeps most of the screen for the page", () => {
  let pinned = 0;
  let worst = 0;
  for (let vw = 240; vw <= 1600; vw += 2) {
    for (let vh = 320; vh <= 1600; vh += 2) {
      if (!sticks(vw, vh)) continue;
      pinned += 1;
      const share = pondShare(vw, vh);
      worst = Math.max(worst, share);
      assert.ok(
        share <= MAX_SHARE,
        `pinned at ${vw}x${vh} with the pond at ${(share * 100).toFixed(1)}% of the screen`
      );
    }
  }
  // A guard that pinned nothing would pass the assertion above and ship a
  // feature nobody can see, which is v1.156's lesson: a flag says a rule is
  // allowed, only a run says whether it speaks.
  assert.ok(pinned > 10000, `only ${pinned} windows pin the pond`);
  assert.ok(worst > 0.3, `the guard never gets near its own cap (worst ${worst})`);
});

test("the phones this page is sized for pin the pond; sideways and desktop do not", () => {
  for (const [vw, vh] of [
    [320, 568],
    [360, 640],
    [360, 800],
    [390, 844],
    [412, 915],
    [430, 932],
  ]) {
    assert.ok(sticks(vw, vh), `${vw}x${vh} does not pin the pond`);
    // The oldest and squarest phone on the list is the worst case, and it is
    // still a third of the screen rather than half of it.
    assert.ok(pondShare(vw, vh) < 0.35, `${vw}x${vh} gives the pond ${pondShare(vw, vh)}`);
  }
  for (const [vw, vh] of [
    [844, 390], // a phone turned sideways: under the fold, and far too wide for its height
    [932, 430],
    [1024, 768], // a desktop: the aside is a second column and the pond is 620 px
    [1280, 800],
    [1920, 1080],
  ]) {
    assert.equal(sticks(vw, vh), false, `${vw}x${vh}`);
  }
});

test("the ratio is derived from the cap rather than chosen", () => {
  // vw ≤ MAX_SHARE × aspect × vh + gutter, with the gutter dropped, which only
  // ever makes the guard stricter.
  assert.ok(STICK_MAX_RATIO <= MAX_SHARE * POND_ASPECT);
  // And not so much stricter that it is a different rule: within a hundredth.
  assert.ok(MAX_SHARE * POND_ASPECT - STICK_MAX_RATIO < 0.01);
});

test("the stylesheet's query is the module's two thresholds", () => {
  const css = read("style.css");
  const query = `@media (max-width: ${STICK_MAX_WIDTH}px) and (max-aspect-ratio: 13/20)`;
  assert.ok(css.includes(query), `style.css has no ${query}`);
  assert.equal(13 / 20, STICK_MAX_RATIO);
  // The pin itself, and it belongs to that query and to nothing else: a `.stage`
  // pinned unconditionally is the sideways-phone failure with no guard at all.
  const at = css.indexOf(query);
  const block = css.slice(at, css.indexOf("\n}", at));
  assert.ok(/\.stage\s*\{[^}]*position:\s*sticky/.test(block), "the stage is not pinned in it");
  assert.equal(css.match(/position:\s*sticky/g).length, 1, "something else is sticky too");
  // Every jump on the page has to clear the water, and the length it clears it
  // by is the one main.js measures.
  assert.ok(/scroll-padding-top:\s*calc\(var\(--pond-h, 0px\)/.test(block));
});

test("main.js writes the height the stylesheet asks for", () => {
  const main = read("src/main.js");
  assert.ok(main.includes('setProperty("--pond-h"'), "nothing writes --pond-h");
});

test("the readable share is what the release claims", () => {
  const loose = {
    docHeight: MEASURED.docHeight,
    viewport: MEASURED.viewportHeight,
    stageTop: MEASURED.stageTop,
    stageHeight: MEASURED.stageHeight,
  };
  assert.equal(readableWithPond(loose), MEASURED.readable);
  assert.equal(Math.round((1000 * MEASURED.readable) / MEASURED.docHeight) / 10, 32.9);

  // Pinned: 97.9%, and the missing 2% is the honest part. The water stays with
  // the left column and stops at its foot, 4,028 px in; below that is the
  // control panel, and the last hundred pixels of this document are a place
  // with no pond in it. That is why the container's foot is an input here
  // rather than an assumption — a page whose aside grew would show up as a
  // smaller number instead of as a claim that had quietly stopped being true.
  const pinned = readableWithPond({ ...loose, stickyUntil: MEASURED.leftColumnBottom });
  assert.equal(pinned, MEASURED.readablePinned);
  assert.ok(pinned < MEASURED.docHeight);
  assert.ok(pinned > MEASURED.readable * 2.9, `pinned only reaches ${pinned}`);
});

test("a document shorter than its own window is all readable either way", () => {
  const page = { docHeight: 700, viewport: 844, stageTop: 100, stageHeight: 239 };
  assert.equal(readableWithPond(page), 700);
  assert.equal(readableWithPond({ ...page, stickyUntil: 690 }), 700);
});

test("garbage in gives zero rather than NaN", () => {
  for (const bad of [undefined, null, {}, { docHeight: NaN, viewport: "x" }]) {
    const n = readableWithPond(bad);
    assert.ok(Number.isFinite(n), `${JSON.stringify(bad)} gave ${n}`);
  }
  assert.ok(Number.isFinite(pondShare(undefined, undefined)));
  assert.equal(sticks(0, 0), false);
  assert.equal(sticks(NaN, 800), false);
});
