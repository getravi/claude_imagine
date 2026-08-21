// targetsize.test.js — can a thumb hit it? (v1.115)
//
// The third audit of these two documents, after v1.51's keyboard walk (can it be
// reached?) and v1.109's photometer (can it be read?). The bar is WCAG 2.2
// SC 2.5.8, Level AA: 24 × 24 CSS pixels, with a spacing exemption and an inline
// exemption, both of which this suite states rather than assumes.
//
// The division is v1.87's and v1.109's: `node --test` cannot lay out a page, so
// the geometry was measured by a scratch probe driving a headless Chromium and
// this file holds the inventory plus the arithmetic that judges it. Two claims
// here are *live* rather than remembered, and they are the ones that would rot
// first: the `min-height` the fix rests on is resolved out of `style.css` on
// every run, and the number of world toggles is counted out of `app/index.html`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  TARGET_MIN,
  CONTROLS,
  UNMET,
  WALKED,
  HIT_RULES,
  smallestSide,
  spacedClear,
  verdictFor,
  verdicts,
  declaredMinHeight,
} from "../src/targetsize.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

// ---- the bar, and the two exemptions ----

test("the bar is WCAG 2.2 AA's 24 px, not the AAA 44", () => {
  assert.equal(TARGET_MIN, 24);
});

test("the shorter side is what is judged", () => {
  assert.equal(smallestSide({ w: 316, h: 19 }), 19);
  assert.equal(smallestSide({ w: 13, h: 300 }), 13);
});

test("the spacing exemption is two 24 px circles just touching", () => {
  // Circles of diameter `TARGET_MIN` overlap exactly when the centres are
  // closer than `TARGET_MIN`, so the boundary is inclusive on one side only.
  assert.equal(spacedClear(24), true);
  assert.equal(spacedClear(23.99), false);
  assert.equal(spacedClear(0), false);
});

test("a verdict names why it passes, because the three reasons differ in durability", () => {
  assert.deepEqual(verdictFor({ w: 154, h: 36, nearestCentre: 47.5 }), {
    passes: true,
    by: "size",
  });
  // Short, but nothing else is within a circle's reach.
  assert.deepEqual(verdictFor({ w: 48.6, h: 16, nearestCentre: 774.6 }), {
    passes: true,
    by: "spacing",
  });
  // Short and crowded, but a link inside a sentence is exempt by the rule.
  assert.deepEqual(verdictFor({ w: 42, h: 15, nearestCentre: 7.6, inline: true }), {
    passes: true,
    by: "inline",
  });
  // Short, crowded, not inline: the only combination that fails.
  assert.deepEqual(verdictFor({ w: 316, h: 19, nearestCentre: 19 }), {
    passes: false,
    by: null,
  });
});

test("size is checked before the exemptions, so a big target never passes 'by spacing'", () => {
  const big = verdictFor({ w: 350, h: 260, nearestCentre: 1, inline: true });
  assert.equal(big.by, "size");
});

// ---- what the walk found ----

test("every target on both shipped pages clears the bar", () => {
  const failed = verdicts(CONTROLS).filter((c) => !c.passes);
  assert.deepEqual(
    failed.map((c) => `${c.page} ${c.vp} ${c.sel} ${c.w}×${c.h}`),
    [],
    "a pointer target under 24 px with a neighbour inside a circle's reach"
  );
});

test("the world toggles pass by their own size, not by their neighbourhood", () => {
  // The distinction this release exists for. Before v1.115 the label was 19 px
  // tall and stacked flush, so it failed both the size rule and the spacing one;
  // the ten that passed did so because a long caption wrapped onto a second
  // line, which is the pond's vocabulary deciding which rules are switchable.
  for (const c of verdicts(CONTROLS).filter((c) => c.sel === "label.check")) {
    assert.equal(c.by, "size", `${c.vp}: the toggles must not need the spacing exemption`);
    assert.ok(c.h >= TARGET_MIN, `${c.vp}: ${c.h} px tall`);
  }
});

test("the targets that pass only by spacing or by being inline are named, not discovered", () => {
  // A pass by spacing is a property of everything around the control (v1.104's
  // neighbourhood rule); a pass by inline is a property of the sentence. Both
  // are one layout change from failing, so the list is pinned: growing it is a
  // decision, never an accident.
  const fragile = verdicts(CONTROLS)
    .filter((c) => c.by !== "size")
    .map((c) => `${c.page} ${c.sel} (${c.by})`)
    .sort();
  assert.deepEqual([...new Set(fragile)], [
    "app #chart-scope (spacing)",
    "app .appfoot-links a (inline)",
    "app a.home-link (spacing)",
    "app details summary (spacing)",
    "app nav.links a (spacing)",
    "front door footer a (inline)",
  ]);
});

test("the inventory accounts for every target the walk saw", () => {
  for (const page of Object.keys(WALKED)) {
    const viewports = [...new Set(CONTROLS.filter((c) => c.page === page).map((c) => c.vp))];
    assert.ok(viewports.length >= 2, `${page}: measured at one width only`);
    for (const vp of viewports) {
      const sum = CONTROLS.filter((c) => c.page === page && c.vp === vp)
        .reduce((a, c) => a + c.n, 0);
      assert.equal(sum, WALKED[page], `${page} at ${vp}`);
    }
  }
});

test("a label-bound control records the control's own box as well as the target's", () => {
  // The mistake this instrument nearly made: measure the 13 px checkbox and
  // report thirty-one failures that are not there. Both numbers are kept so the
  // difference between them stays visible.
  const check = CONTROLS.find((c) => c.sel === "label.check");
  assert.equal(check.via, "label");
  assert.equal(check.own, "13x13");
  assert.ok(check.w > 100, "the label is what a pointer hits");
});

test("every gap the walk could not reach is named with a reason", () => {
  assert.ok(Object.keys(UNMET).length > 0);
  for (const [what, why] of Object.entries(UNMET)) {
    assert.ok(why.length > 20, `${what}: a reason, not a label`);
  }
});

// ---- the live claims ----

test("the stylesheet still declares the min-height the arithmetic assumes", () => {
  const css = read("style.css");
  for (const [selector, min] of Object.entries(HIT_RULES)) {
    const declared = declaredMinHeight(css, selector);
    assert.notEqual(declared, null, `style.css: ${selector} has no min-height`);
    assert.ok(
      declared >= min,
      `style.css: ${selector} { min-height: ${declared}px } is under the ${min}px bar`
    );
  }
});

test("declaredMinHeight reads the rule as written, and says so when there is none", () => {
  assert.equal(declaredMinHeight(".a { min-height: 24px; }", ".a"), 24);
  assert.equal(declaredMinHeight(".a { min-height: 24.5px }", ".a"), 24.5);
  assert.equal(declaredMinHeight(".a { color: red }", ".a"), null);
  assert.equal(declaredMinHeight(".a { min-height: 24px }", ".b"), null);
  // A selector that is a suffix of another must not be answered by it.
  assert.equal(declaredMinHeight(".field .check { min-height: 9px }\n.check { min-height: 24px }", ".check"), 24);
});

test("the toggle count in the inventory is the number of toggles on the page", () => {
  // The link that keeps this from being a memory: add a thirty-second world
  // rule and the group's `n` is wrong until somebody re-walks the page.
  const html = read("app/index.html");
  const boxes = [...html.matchAll(/<input[^>]*type="checkbox"/g)].length;
  for (const c of CONTROLS.filter((c) => c.sel === "label.check")) {
    assert.equal(c.n, boxes, "label.check counts every checkbox in the panel");
  }
});

test("the module is a pure observer — no DOM, no world, no imports", () => {
  const src = read("src/targetsize.js");
  // `\bdocument\b` is the wrong regex here and failed on the header's own prose
  // ("either document"), which is v1.101's rule about `doesNotMatch` — the one
  // assertion whose domain is every string the file could contain has to name a
  // *use* rather than a word. A DOM reach is a property access.
  assert.doesNotMatch(src, /\b(document|window)\s*\./, "an audit of a page must not need one");
  assert.doesNotMatch(src, /^import /m, "arithmetic and an inventory, nothing else");
  assert.doesNotMatch(src, /Math\.random|rng/i, "an observer draws no random numbers");
});
