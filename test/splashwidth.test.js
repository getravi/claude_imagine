// splashwidth.test.js — the front door has a narrowest width, and this is the
// test that it is a number somebody chose.
//
// v1.87 put a ruler in the corner of the app's pond and found four marks in the
// wrong place; v1.88 went to walk `index.html` — the page a visitor actually
// arrives on — and never reached its marks, because the front door turned out to
// be hiding 92% of itself behind a module that imported the simulation. Two
// releases later the page had still never been *measured* at a phone width.
// v1.28 measured 390 px, on the app, nine releases before this file's subject
// existed. 390 px is the first width at which this bug is invisible.
//
// What the walk found. `.stats-strip` is `grid-template-columns: repeat(4, 1fr)`
// stepping to `repeat(2, 1fr)` under 640 px, and there the ladder stopped. `1fr`
// is `minmax(auto, 1fr)`, and that `auto` floors a track at the *min-content* of
// the items in it — so two columns cannot be narrower than the two widest cards,
// and the widest card here is as wide as `16→12→3`, one unbreakable run of
// glyphs. Two columns want 387 px of viewport. The page therefore had a minimum
// width of 387 px that nobody had decided, computed, or written down: it was a
// property of the longest word on the page.
//
// And `body` sets `overflow-x: hidden`, so the excess was not scrolled to, it
// was **cut off**. At 360 px — the most common phone viewport there is — 7 px
// went. At 320 px, 47 px went, and the strip read `16 → 12 —` and `DEPENDENCI`:
// two of the page's four headline claims, one of them the project's loudest,
// truncated in the middle with no scrollbar to say so.
//
// Then the sweep found the same bug one rung up, in a window two pixels wide.
// Four columns want 674.5 px and the 4→2 step was at 640, so a viewport of
// exactly 641 or 642 clipped 2 px. Spot-checking a ladder finds the rung you
// spot-checked (v1.87: four marks, three wrong, one flush by luck).
//
// **This is a text scan, not a layout engine.** `node --test` cannot lay out a
// page, so — v1.87's division — the browser holds the geometry and the suite
// holds the two halves of the claim that survive being asked of the source: the
// **inventory** (every grid on this page, classified, compared both ways, so a
// fourth cannot arrive unclassified) and the **arithmetic** (each rung's
// narrowest viewport against the width that rung's contents actually need). The
// numbers below were measured in a headless Chromium and are quoted with the
// width they were measured at, because they move with it.
//
// The domain is `splash.css`, and the discriminant is stated rather than
// assumed: a stylesheet owes a declared minimum width exactly when it *clips*
// its overflow. `style.css` does not set `overflow-x: hidden`, so the app scrolls
// sideways below its own floor — visible, and recoverable by the visitor — and
// is out of this file's domain. The last test holds that discriminant, so the
// day the app starts clipping it is in.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const SHEET = "splash.css";
const PAGE = "index.html";

/**
 * Every grid on the front door, and which promise it makes about narrow
 * viewports. Declared here and derived from the sheet below, compared both
 * ways — v1.81's rule, so that a grid added to `splash.css` fails this file
 * until somebody says which kind it is.
 *
 *   "fixed"    — the declaration fixes a column count. It has an undeclared
 *                minimum width (N × the widest item's min-content), so it owes
 *                a ladder that reaches a single column at `--page-min`.
 *   "declared" — `repeat(auto-fit|auto-fill, minmax(<len>, …))`. It states its
 *                own floor and the browser picks the count, so it owes only
 *                that the floor fit inside `--page-min`.
 */
const GRIDS = [
  { selector: ".stats-strip", kind: "fixed" },
  { selector: ".feature-grid", kind: "declared" },
  { selector: ".gallery", kind: "declared" },
];

/**
 * What each rung of the stat strip's ladder actually needs, measured in a
 * headless Chromium against the shipped page.
 *
 * `viewport` is the narrowest viewport at which that column count fits: the
 * strip's min-content plus `section.band`'s two gutters. `grown` is the same
 * arithmetic with every card's *type* 15% wider and its padding unchanged —
 * the font stack starts `-apple-system`, so the width of `16→12→3` belongs to
 * whichever face the device has and not to this machine.
 *
 * Each row was measured **at the narrowest viewport its own rung is in force
 * at**, and that is not a formality: `.num` is `clamp(1.8rem, 4vw, 2.6rem)`, so
 * a card's min-content is a function of the viewport it is measured in. The
 * four-column row read 655.8 when measured at 900 px and 630.55 at 768 px, for
 * the same four cards. A minimum width measured at the wrong width is a
 * different font size.
 */
const RUNGS = [
  { cols: 1, measuredAt: 320, minContent: 175.67, viewport: 215.7, grown: 236.3 },
  { cols: 2, measuredAt: 481, minContent: 347.28, viewport: 387.3, grown: 425.3 },
  { cols: 4, measuredAt: 768, minContent: 630.55, viewport: 674.5, grown: 738.2 },
];

// ---------------------------------------------------------------- parsing --

/** Strip comments, then walk the sheet into rules carrying their media context. */
function parseSheet(src) {
  const css = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const counter = { n: 0 };
  (function walk(text, media) {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith("@media")) walk(body, prelude);
      else if (!prelude.startsWith("@")) {
        // `@keyframes` bodies are never walked: their `0% { … }` blocks are not
        // rules and would arrive here as selectors.
        rules.push({ selector: prelude, media, body, order: counter.n++ });
      }
      i = j;
    }
  })(css, null);
  return rules;
}

/** The `max-width` a media prelude gates on, or Infinity for "always". */
function mediaMax(media) {
  if (!media) return Infinity;
  const m = media.match(/max-width:\s*(\d+(?:\.\d+)?)px/);
  return m ? Number(m[1]) : Infinity;
}

/** The last value of `prop` in a declaration body, or null. */
function decl(body, prop) {
  let out = null;
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;}]+)`, "g");
  for (const m of body.matchAll(re)) out = m[1].trim();
  return out;
}

/** Classify a `grid-template-columns` value. */
function classify(value) {
  const auto = value.match(/repeat\(\s*(auto-fit|auto-fill)\s*,\s*minmax\(\s*(\d+(?:\.\d+)?)px/);
  if (auto) return { kind: "declared", floor: Number(auto[2]) };
  const rep = value.match(/^repeat\(\s*(\d+)\s*,\s*([^)]*(?:\([^)]*\))?[^)]*)\)$/);
  if (rep) return { kind: "fixed", cols: Number(rep[1]) * trackCount(rep[2]) };
  if (/repeat\(/.test(value)) return { kind: "unknown" };
  return { kind: "fixed", cols: trackCount(value) };
}

/** Tracks in a plain list, counting a `minmax(a, b)` or `fit-content(x)` as one. */
function trackCount(list) {
  let depth = 0;
  let n = 0;
  let inTrack = false;
  for (const ch of list.trim()) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (/\s/.test(ch) && depth === 0) { inTrack = false; continue; }
    if (!inTrack) { n++; inTrack = true; }
  }
  return n;
}

/** Every `grid-template-columns` in the sheet, with its selector and gate. */
function gridDeclarations() {
  const out = [];
  for (const rule of parseSheet(read(SHEET))) {
    const value = decl(rule.body, "grid-template-columns");
    if (value === null) continue;
    out.push({
      selector: rule.selector, value, order: rule.order,
      max: mediaMax(rule.media), ...classify(value),
    });
  }
  return out;
}

/** The declaration in force for a selector at a given viewport width. */
function inForce(decls, width) {
  const live = decls.filter((d) => width <= d.max);
  return live.length ? live.reduce((a, b) => (b.order > a.order ? b : a)) : null;
}

/** The page's declared narrowest viewport, read out of the sheet. */
function pageMin() {
  const m = read(SHEET).match(/--page-min:\s*(\d+(?:\.\d+)?)px/);
  assert.ok(m, "splash.css must declare --page-min");
  return Number(m[1]);
}

/** `section.band`'s two horizontal gutters at a given viewport width. */
function gutter(width) {
  const bands = parseSheet(read(SHEET))
    .filter((r) => /(^|,)\s*section\.band\s*$/.test(r.selector) && decl(r.body, "padding"))
    .map((r) => ({ order: r.order, max: mediaMax(r.media), value: decl(r.body, "padding") }));
  assert.ok(bands.length >= 2, "section.band should have a base padding and a narrow one");
  const live = bands.filter((b) => width <= b.max);
  const win = live.reduce((a, b) => (b.order > a.order ? b : a));
  const parts = win.value.split(/\s+/);
  const horizontal = parts.length >= 2 ? parts[1] : parts[0];
  const px = Number(horizontal.replace("px", ""));
  assert.ok(Number.isFinite(px), `section.band padding is not in px: ${win.value}`);
  return px * 2;
}

// ------------------------------------------------------------------ tests --

test("the sheet declares the narrowest viewport it supports", () => {
  const min = pageMin();
  assert.ok(min > 0 && min <= 400, `--page-min is ${min}px, which is not a phone`);
  const occurrences = read(SHEET).match(/--page-min\s*:/g) || [];
  assert.equal(occurrences.length, 1, "--page-min must have exactly one definition");
});

test("every grid on the page is in the inventory, and every entry is on the page", () => {
  const found = new Set(gridDeclarations().map((d) => d.selector));
  const declared = new Set(GRIDS.map((g) => g.selector));
  for (const sel of found) {
    assert.ok(declared.has(sel),
      `${sel} sets grid-template-columns and is not in GRIDS — say whether it fixes ` +
      `a column count or declares its own floor, because only one of those has a minimum width`);
  }
  for (const sel of declared) {
    assert.ok(found.has(sel), `GRIDS names ${sel} and splash.css no longer has it`);
  }
});

test("every declaration parses, and matches the kind the inventory claims", () => {
  for (const d of gridDeclarations()) {
    assert.notEqual(d.kind, "unknown",
      `${d.selector}: cannot classify "${d.value}" — this file would pass by not understanding it`);
    const entry = GRIDS.find((g) => g.selector === d.selector);
    if (entry.kind === "declared") {
      assert.equal(d.kind, "declared",
        `${d.selector} is filed as declaring its own floor but "${d.value}" fixes a count`);
    }
  }
});

test("every fixed-count grid reaches a single column at --page-min", () => {
  const min = pageMin();
  for (const entry of GRIDS.filter((g) => g.kind === "fixed")) {
    const decls = gridDeclarations().filter((d) => d.selector === entry.selector);
    const win = inForce(decls, min);
    assert.ok(win, `${entry.selector} has no declaration in force at ${min}px`);
    assert.equal(win.cols, 1,
      `${entry.selector} is ${win.cols} columns at ${min}px ("${win.value}"). A fixed count ` +
      `floors each track at its widest item's min-content, so this is a minimum width ` +
      `nobody wrote down — and body sets overflow-x: hidden, so it is cut off, not scrolled to`);
  }
});

test("a fixed-count ladder never widens as the viewport narrows", () => {
  for (const entry of GRIDS.filter((g) => g.kind === "fixed")) {
    const decls = gridDeclarations()
      .filter((d) => d.selector === entry.selector)
      .sort((a, b) => b.max - a.max);
    const maxes = decls.map((d) => d.max);
    assert.equal(new Set(maxes).size, maxes.length,
      `${entry.selector} has two declarations gated on the same width — which one wins is source order`);
    for (let i = 1; i < decls.length; i++) {
      assert.ok(decls[i].cols <= decls[i - 1].cols,
        `${entry.selector}: ${decls[i].cols} columns under ${decls[i].max}px but ` +
        `${decls[i - 1].cols} above it — the ladder goes the wrong way`);
    }
    // Source order has to agree with the cascade, or the wider rule overrides
    // the narrower one at equal specificity and the ladder is decorative.
    const bySource = [...decls].sort((a, b) => a.order - b.order);
    assert.deepEqual(bySource.map((d) => d.max), maxes,
      `${entry.selector}: the rungs are not in descending-width source order`);
  }
});

test("each rung sits above the width its own contents need", () => {
  const min = pageMin();
  const decls = gridDeclarations()
    .filter((d) => d.selector === ".stats-strip")
    .sort((a, b) => a.max - b.max);
  assert.equal(decls.length, RUNGS.length,
    `the strip has ${decls.length} rungs and ${RUNGS.length} measurements — every rung needs one`);

  let lo = min; // the narrowest viewport this rung is in force at
  for (let i = 0; i < decls.length; i++) {
    const d = decls[i];
    const rung = RUNGS.find((r) => r.cols === d.cols);
    assert.ok(rung, `no measurement for a ${d.cols}-column rung`);
    assert.equal(rung.measuredAt, lo,
      `the ${d.cols}-column rung is in force from ${lo}px and was measured at ` +
      `${rung.measuredAt}px — .num is clamp(1.8rem, 4vw, 2.6rem), so that is a different font size`);
    assert.ok(lo >= rung.viewport,
      `${d.cols} columns are in force from ${lo}px and need ${rung.viewport}px — ` +
      `${(rung.viewport - lo).toFixed(1)}px of the strip is clipped`);
    assert.ok(lo >= rung.grown,
      `${d.cols} columns are in force from ${lo}px, which fits the type on my machine ` +
      `(${rung.viewport}px) but not type 15% wider (${rung.grown}px) — the font stack ` +
      `starts -apple-system and the measurement is not mine to make`);
    lo = d.max + 1;
  }
  assert.equal(lo, Infinity, "the widest rung must be ungated, or the page has no default");
});

test("the measured min-content of a rung agrees with the viewport it implies", () => {
  // Pins the arithmetic between the two columns of RUNGS, so a re-measurement
  // has to move both. The gutter is read from the sheet rather than typed: the
  // strip's rungs and section.band's padding step at different widths, and a
  // change to either moves this sum.
  for (const rung of RUNGS) {
    const g = gutter(rung.measuredAt);
    assert.ok(Math.abs(rung.minContent + g - rung.viewport) < 0.5,
      `${rung.cols} columns: min-content ${rung.minContent} + gutters ${g} = ` +
      `${(rung.minContent + g).toFixed(1)}, but the row says ${rung.viewport}`);
  }
});

test("every declared-floor grid fits inside --page-min", () => {
  const min = pageMin();
  const content = min - gutter(min);
  for (const entry of GRIDS.filter((g) => g.kind === "declared")) {
    for (const d of gridDeclarations().filter((x) => x.selector === entry.selector)) {
      assert.ok(d.floor <= content,
        `${entry.selector} declares a floor of ${d.floor}px and ${min}px of viewport ` +
        `leaves ${content}px of content — it overflows by ${d.floor - content}px`);
    }
  }
  // .gallery declares 280 against 280 of content: it fits exactly, with no
  // slack at all. That is not a bug and it is not a margin either — it is the
  // pixel this page's floor rests on, so the assertion above is also v1.25's
  // "pin the failure": widen the gutter by one pixel and this fails.
  const gallery = gridDeclarations().find((d) => d.selector === ".gallery");
  assert.equal(content - gallery.floor, 0,
    `.gallery's slack at --page-min moved from 0 to ${content - gallery.floor}px — ` +
    `worth knowing, since the page's floor was resting on it being zero`);
});

test("the widest rung has one column per card in the markup", () => {
  const cards = (read(PAGE).match(/class="stat-card"/g) || []).length;
  const widest = gridDeclarations()
    .filter((d) => d.selector === ".stats-strip")
    .reduce((a, b) => (b.max > a.max ? b : a));
  assert.equal(widest.cols, cards,
    `the strip is ${widest.cols} columns at its widest and the page ships ${cards} cards — ` +
    `a fifth card would wrap to a second row of one`);
});

test("a stylesheet that clips its overflow owes a declared minimum width", () => {
  // The discriminant for this file's domain, so it cannot quietly exclude a
  // sheet that starts clipping. An overflow that scrolls is visible and the
  // visitor can reach it; an overflow that is hidden is a truncated sentence
  // with nothing to say it was truncated.
  for (const sheet of ["splash.css", "style.css"]) {
    const src = read(sheet).replace(/\/\*[\s\S]*?\*\//g, "");
    const clips = parseSheet(src).some(
      (r) => /(^|,)\s*(body|html)\s*$/.test(r.selector) && /^hidden$/.test(decl(r.body, "overflow-x") || ""),
    );
    if (!clips) continue;
    assert.ok(/--page-min:/.test(src),
      `${sheet} sets overflow-x: hidden on the document and declares no --page-min, ` +
      `so anything past its own minimum width is cut off silently`);
  }
});
