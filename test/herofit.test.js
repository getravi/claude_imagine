// herofit.test.js — the front door's marks, and the picture they are drawn on.
//
// v1.87 walked the app's five absolutely positioned marks with a ruler and found
// three of them placed against a container wider than the picture. It closed by
// naming the page it had not walked: "the splash page has four absolutely
// positioned marks and has never been walked at all". v1.88 went and was
// interrupted (the page was hiding 92% of itself behind a static import). v1.100
// went and was interrupted (the page's narrowest width was 387 px, a number
// nobody had chosen). `docs/AUTONOMOUS.md` predicted a third interruption.
//
// **The marks are a null.** Measured in a headless Chromium at nine viewports
// from 320×568 to 1920×1080, every one sits where it claims to — `#hero-canvas`
// and `.hero::before` at 0.00 px on all four sides of a `.hero` that is the
// picture, `.showcase .overlay` at 1.00 px (its border) inside an `<a>` that
// wraps nothing but its `<img>`, `.scroll-cue` centred to within 0.01 px at
// every width. The reason is structural: v1.87's bug needs a container that is
// wider than the picture, and every containing block on this page holds the
// picture and nothing else.
//
// There are **five** of them, not four, which is the first thing the inventory
// half of this file is for: `.tl-item::before`, the timeline dot, is a mark in a
// `position: relative` list item and has been since the page shipped. A count
// written in prose about a collection in code is the drift `prosecounts` (v1.85)
// exists for, and a count written in prose about a collection in a *stylesheet*
// was outside its domain.
//
// **The interruption is the picture.** `#hero-canvas` is `object-fit: cover`
// over a simulation sized by two constants in `splash.js`, and a hero box is as
// wide as the window and `100svh` tall, so the two aspect ratios agree nowhere.
// Measured share of the pond a visitor could see, before this release:
//
//     320×568   24.8%      1024×768    76.0%
//     360×780   27.4%      1280×800    91.4%
//     390×844   27.4%      1440×900    95.0%
//     430×932   27.4%      1920×1080   94.7%
//     768×1024  44.5%
//
// No viewport showed the whole pond and a phone showed a quarter of it, under a
// subhead promising "a real ecosystem of neural creatures, evolving in your
// browser as you read".
//
// **This is a text scan and an arithmetic check, not a layout engine** — v1.87's
// division, which `test/splashwidth.test.js` follows too. `node --test` cannot
// lay out a page, so the browser holds the geometry and the suite holds the two
// halves that survive being asked of the source: the **inventory** (every
// absolutely positioned rule in `splash.css`, declared and derived and compared
// both ways, so a sixth cannot arrive unclassified) and the **arithmetic**
// (`heroFit` against `coverCrop`, at the same viewports the browser was pointed
// at). The percentages above are quoted with the width they were measured at,
// because they move with it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { heroFit, coverCrop, HERO_AREA, HERO_FALLBACK, SIGHT_DIAMETERS } from "../src/herofit.js";
import { DEFAULT_CONFIG } from "../src/config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readRoot = (f) => readFileSync(join(ROOT, f), "utf8");

/**
 * The viewports the browser was pointed at. Four phones, a tablet in both
 * orientations, and three laptop/desktop widths. `box` is the hero canvas's
 * measured CSS box at that viewport — not the viewport itself, because the hero
 * is `min-height: 100svh` and its content can push it taller.
 */
const VIEWPORTS = [
  { name: "320×568", box: [320, 767.5], wasVisible: 0.248 },
  { name: "360×780", box: [360, 780], wasVisible: 0.274 },
  { name: "390×844", box: [390, 844], wasVisible: 0.274 },
  { name: "430×932", box: [430, 932], wasVisible: 0.274 },
  { name: "768×1024", box: [768, 1024], wasVisible: 0.445 },
  { name: "1024×768", box: [1024, 800.5], wasVisible: 0.76 },
  { name: "1280×800", box: [1280, 831.8], wasVisible: 0.914 },
  { name: "1440×900", box: [1440, 900], wasVisible: 0.95 },
  { name: "1920×1080", box: [1920, 1080], wasVisible: 0.947 },
];

/** What `splash.js` used to hard-code, kept so the failure stays pinned. */
const OLD_HERO = [1280, 760];

// ---------------------------------------------------------------- inventory

/**
 * Every absolutely positioned rule on the front door, with the box it is placed
 * against and what the browser measured of it. A mark's containing block is its
 * nearest positioned ancestor; `note` says what the offsets were, and `measured`
 * says whether a probe could read a rect at all — a pseudo-element cannot be
 * queried, so its claim is a reading of the declaration and is labelled as one.
 */
const MARKS = [
  {
    selector: "#hero-canvas",
    containingBlock: ".hero",
    measured: true,
    note: "inset: 0 — 0.00 px on all four sides at all nine viewports",
  },
  {
    selector: ".hero::before",
    containingBlock: ".hero",
    measured: false,
    note: "inset: 0 on the same box as #hero-canvas; a pseudo-element has no rect to read",
  },
  {
    selector: ".scroll-cue",
    containingBlock: ".hero",
    measured: true,
    note: "left: 50% + translateX(-50%) — left and right agree to within 0.01 px everywhere",
  },
  {
    selector: ".showcase .overlay",
    containingBlock: ".showcase",
    measured: true,
    note: "inset: 0 — 1.00 px all round, which is the .showcase border",
  },
  {
    selector: ".tl-item::before",
    containingBlock: ".tl-item",
    measured: false,
    note: "the timeline dot; the fifth mark, and the one v1.87's count of four missed",
  },
];

/** Selectors of every rule in a stylesheet whose body sets `position: absolute`. */
function scanAbsoluteRules(css) {
  const found = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of stripped.split("}")) {
    const brace = block.lastIndexOf("{");
    if (brace < 0) continue;
    const body = block.slice(brace + 1);
    if (!/position\s*:\s*absolute/.test(body)) continue;
    const selector = block.slice(0, brace).split(/[{;]/).pop().trim().replace(/\s+/g, " ");
    found.push(selector);
  }
  return found;
}

test("the inventory of absolutely positioned marks is complete, both ways", () => {
  const scanned = scanAbsoluteRules(readRoot("splash.css"));
  const declared = MARKS.map((m) => m.selector);

  for (const s of scanned) {
    assert.ok(
      declared.includes(s),
      `splash.css positions \`${s}\` absolutely and no entry in MARKS claims it. ` +
        `Add one saying which box it is placed against, and measure it in a browser.`,
    );
  }
  for (const s of declared) {
    assert.ok(
      scanned.includes(s),
      `MARKS claims \`${s}\` is an absolutely positioned mark and splash.css no longer positions it.`,
    );
  }
  assert.equal(scanned.length, MARKS.length);
});

test("every mark is placed against a box that is positioned, and holds the picture", () => {
  const css = readRoot("splash.css").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of MARKS) {
    // The containing block must itself be positioned, or the mark falls through
    // to the viewport and v1.87's bug is back in its original form.
    const rule = new RegExp(`(^|[},])\\s*${m.containingBlock.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m");
    const match = css.match(rule);
    assert.ok(match, `splash.css has no rule for ${m.containingBlock}, the box ${m.selector} is placed against`);
    assert.match(
      match[2],
      /position\s*:\s*relative/,
      `${m.containingBlock} must be positioned, or ${m.selector} is placed against the viewport`,
    );
  }
});

test("five marks, not four — the prose count was one short", () => {
  assert.equal(MARKS.length, 5);
  assert.equal(MARKS.filter((m) => m.measured).length, 3);
  assert.equal(MARKS.filter((m) => !m.measured).length, 2);
});

// --------------------------------------------------------------- arithmetic

test("the old hero cropped every viewport, and a phone lost three-quarters of the pond", () => {
  for (const v of VIEWPORTS) {
    const crop = coverCrop(OLD_HERO[0], OLD_HERO[1], v.box[0], v.box[1]);
    assert.ok(
      crop.visibleArea < 0.96,
      `${v.name}: the fixed 1280×760 hero should have been cropped, read ${crop.visibleArea}`,
    );
    // Within a tenth of a point of what the browser reported.
    assert.ok(
      Math.abs(crop.visibleArea - v.wasVisible) < 0.001,
      `${v.name}: coverCrop says ${crop.visibleArea.toFixed(3)}, Chromium said ${v.wasVisible}`,
    );
  }
});

test("a fitted hero crops under a pixel at every measured viewport", () => {
  for (const v of VIEWPORTS) {
    const fit = heroFit(v.box[0], v.box[1]);
    const crop = coverCrop(fit.width, fit.height, v.box[0], v.box[1]);
    assert.ok(crop.cropW < 1, `${v.name}: ${crop.cropW.toFixed(3)} px of width cropped`);
    assert.ok(crop.cropH < 1, `${v.name}: ${crop.cropH.toFixed(3)} px of height cropped`);
    assert.ok(
      crop.visibleArea > 0.999,
      `${v.name}: only ${(crop.visibleArea * 100).toFixed(2)}% of the pond visible`,
    );
  }
});

test("the area ceiling holds, and it is the only thing that binds on a desktop", () => {
  for (const v of VIEWPORTS) {
    const fit = heroFit(v.box[0], v.box[1]);
    // Rounding each side up costs at most half a pixel, so the area can exceed
    // the budget by at most half a perimeter.
    assert.ok(
      fit.area <= HERO_AREA + (fit.width + fit.height) / 2 + 1,
      `${v.name}: ${fit.area} px² simulated against a budget of ${HERO_AREA}`,
    );
  }
  assert.equal(heroFit(1920, 1080).clamp, "area");
  assert.equal(heroFit(1440, 900).clamp, "area");
  assert.equal(heroFit(390, 844).clamp, "none");
});

test("under the budget the pond is drawn at exactly 1:1", () => {
  for (const v of VIEWPORTS) {
    const fit = heroFit(v.box[0], v.box[1]);
    if (fit.clamp !== "none") continue;
    assert.equal(fit.width, Math.round(v.box[0]), `${v.name}: width should be the box's own`);
    assert.equal(fit.magnify, 1, `${v.name}: magnification should be exactly 1`);
  }
});

test("the shorter side never falls under a sense disc's diameter", () => {
  const floor = SIGHT_DIAMETERS * 2 * DEFAULT_CONFIG.visionRadius;
  for (const v of VIEWPORTS) {
    const fit = heroFit(v.box[0], v.box[1]);
    assert.ok(
      Math.min(fit.width, fit.height) >= floor - 0.5,
      `${v.name}: shorter side ${Math.min(fit.width, fit.height)} px under the ${floor} px floor`,
    );
  }
  // It binds on the smallest phone this project has ever measured, and nowhere
  // else in the sweep — which is what makes it a floor rather than a taste.
  assert.equal(heroFit(320, 767.5).clamp, "sight");
  assert.equal(VIEWPORTS.filter((v) => heroFit(v.box[0], v.box[1]).clamp === "sight").length, 1);
});

test("the shipped default pond clears the same floor", () => {
  const floor = SIGHT_DIAMETERS * 2 * DEFAULT_CONFIG.visionRadius;
  assert.ok(Math.min(DEFAULT_CONFIG.width, DEFAULT_CONFIG.height) >= floor);
});

test("a box that cannot be measured falls back rather than simulating nothing", () => {
  for (const bad of [[0, 0], [NaN, 800], [1280, undefined], [-10, 400]]) {
    const fit = heroFit(bad[0], bad[1]);
    assert.equal(fit.width, HERO_FALLBACK.width);
    assert.equal(fit.height, HERO_FALLBACK.height);
    assert.equal(fit.magnify, 1);
  }
});

test("the aspect ratio survives both clamps", () => {
  for (const v of VIEWPORTS) {
    const fit = heroFit(v.box[0], v.box[1]);
    const want = v.box[0] / v.box[1];
    const got = fit.width / fit.height;
    assert.ok(
      Math.abs(got - want) / want < 0.005,
      `${v.name}: aspect ${got.toFixed(4)} against the box's ${want.toFixed(4)}`,
    );
  }
});

test("heroFit is arithmetic — no imports, no randomness, no world", () => {
  const src = readRoot("src/herofit.js").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /^\s*import\s/m, "herofit.js must not import anything");
  assert.doesNotMatch(src, /Math\.random|new Rng|rng\./, "herofit.js must draw no random numbers");
  const a = heroFit(390, 844);
  const b = heroFit(390, 844);
  assert.deepEqual(a, b);
});

test("the front door actually uses it", () => {
  const splash = readRoot("splash.js");
  assert.match(splash, /herofit\.js/, "splash.js must import the fit");
  assert.match(splash, /heroFit\(/, "splash.js must call it");
  assert.doesNotMatch(
    splash,
    /const\s+SW\s*=\s*\d/,
    "splash.js must not go back to hard-coding the hero's width",
  );
});
