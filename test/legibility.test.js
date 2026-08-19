// legibility.test.js — is the text on these two pages readable? (v1.109)
//
// `colourliterals.test.js` asks whether every colour is *known to the palette*.
// `palette.test.js` asks whether every mark is *distinguishable*, at ΔE 25 under
// three dichromacies. Neither asks whether a caption can be read, and neither
// can, because the answer lives in two files no sweep in this project has ever
// opened: `style.css` and `splash.css`. v1.106 wrote that down as a leave. This
// is it closed.
//
// The domain guard at the bottom is the shape v1.103 settled on for markdown: a
// stylesheet in this repository is either swept here or named with a reason, and
// there is no third state a new one can arrive in. The instance was a hole; the
// class is one assertion.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  GRADIENT_INKS,
  TEXT_PAIRS,
  UNMET,
  barFor,
  customProperties,
  inkSites,
  liftToBar,
  parseColour,
  resolveInk,
  toHex,
  verdicts,
} from "../src/legibility.js";
import {
  MIN_DELTA_E,
  WCAG_AA_LARGE,
  WCAG_AA_TEXT,
  chartLines,
  contrastRatio,
  deltaE,
  hslToRgb,
} from "../src/palette.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The two stylesheets, and which page each one dresses. */
const SHEETS = {
  "front door": "splash.css",
  app: "style.css",
};

const css = Object.fromEntries(
  Object.entries(SHEETS).map(([page, file]) => [page, readFileSync(join(ROOT, file), "utf8")]),
);
const vars = Object.fromEntries(
  Object.entries(css).map(([page, text]) => [page, customProperties(text)]),
);

/**
 * An inventory row's ink, resolved *now* rather than remembered. This is the
 * whole reason the pairs store a token name: edit `--ink-faint` down again and
 * the assertions below go red on the next `node --test`, which is the difference
 * between an audit and a note about an audit.
 */
function inkOf(pair) {
  if (pair.ink === "chartLines().pop") return parseColour(chartLines().pop);
  if (pair.ink.startsWith("--")) {
    const value = vars[pair.page][pair.ink];
    assert.ok(value, `${SHEETS[pair.page]} must still define ${pair.ink}`);
    return parseColour(value);
  }
  return parseColour(pair.ink);
}

// ---- the arithmetic ----

test("the contrast ratio is the standard one at both ends of its range", () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  assert.equal(contrastRatio(black, white).toFixed(2), "21.00");
  assert.equal(contrastRatio(white, black).toFixed(2), "21.00", "order must not matter");
  assert.equal(contrastRatio(black, black), 1);
  // The one published pair everybody knows: #767676 is the lightest grey that
  // clears 4.5 on white, and #777777 is the first that does not.
  assert.ok(contrastRatio(parseColour("#767676"), white) >= WCAG_AA_TEXT);
  assert.ok(contrastRatio(parseColour("#777777"), white) < WCAG_AA_TEXT);
});

test("the large-text bar follows WCAG's own thresholds", () => {
  assert.equal(barFor(13, 400), WCAG_AA_TEXT);
  assert.equal(barFor(23.9, 400), WCAG_AA_TEXT);
  assert.equal(barFor(24, 400), WCAG_AA_LARGE);
  assert.equal(barFor(18.66, 400), WCAG_AA_TEXT, "18.66 px is only large when it is bold");
  assert.equal(barFor(18.66, 700), WCAG_AA_LARGE);
});

test("liftToBar returns the smallest eight-bit lift that clears, or null", () => {
  const ground = parseColour("#0c131c");
  const ink = parseColour("#5a6f85");
  const lit = liftToBar(ink, ground, WCAG_AA_TEXT);
  assert.ok(contrastRatio(lit, ground) >= WCAG_AA_TEXT, "the result must clear the bar");
  // Smallest: darken any one channel by one step and it stops clearing.
  for (const ch of ["r", "g", "b"]) {
    const dimmer = { ...lit, [ch]: lit[ch] - 1 };
    assert.ok(
      contrastRatio(dimmer, ground) < WCAG_AA_TEXT,
      `${toHex(lit)} is not minimal — ${toHex(dimmer)} clears too`,
    );
  }
  // Channel ratios survive, so the lift is a level and not a new colour.
  assert.ok(Math.abs(lit.r / lit.b - ink.r / ink.b) < 0.02);
  // And a bar no lift can reach is null rather than white.
  assert.equal(liftToBar(ink, parseColour("#ffffff"), 21), null);
});

// ---- the pages ----

test("every ink the walk met clears its bar on every ground it met it on", () => {
  const failures = verdicts(inkOf)
    .filter((v) => !v.passes)
    .map((v) => `${v.page}: ${v.sample} — ${toHex(v.ink)} on ${v.ground} is ${v.ratio.toFixed(2)}:1, bar ${v.bar}`);
  assert.deepEqual(failures, []);
});

test("the ink hierarchy survives the lift", () => {
  // `--ink-faint` was raised in v1.109 and the cheapest way to pass that test is
  // to raise it to `--ink`, which would pass this file and destroy the page. The
  // three inks are three levels and have to stay three levels.
  for (const page of Object.keys(SHEETS)) {
    const ground = parseColour(vars[page]["--bg"]);
    const [faint, dim, full] = ["--ink-faint", "--ink-dim", "--ink"].map((t) =>
      contrastRatio(parseColour(vars[page][t]), ground),
    );
    assert.ok(faint < dim, `${page}: --ink-faint must stay quieter than --ink-dim`);
    assert.ok(dim < full, `${page}: --ink-dim must stay quieter than --ink`);
    assert.ok(dim - faint > 0.8, `${page}: the two quiet inks must stay a step apart`);
  }
});

test("every `color:` in both stylesheets is in the inventory or excused", () => {
  const met = new Set(TEXT_PAIRS.map((p) => `${p.page}|${p.ink}`));
  const unexplained = [];
  for (const [page, text] of Object.entries(css)) {
    for (const site of inkSites(text)) {
      if (site.value in UNMET) continue;
      const known =
        met.has(`${page}|${site.value.replace(/^var\((--[\w-]+)\)$/, "$1")}`) ||
        met.has(`${page}|${site.value}`);
      if (!known) unexplained.push(`${SHEETS[page]}:${site.line} — ${site.value}`);
    }
  }
  assert.deepEqual(
    unexplained,
    [],
    "an ink with no pair and no reason is a colour nobody has measured (v1.61)",
  );
});

test("every excuse in UNMET is still an ink some stylesheet writes", () => {
  // The other direction, which is the half v1.108 found `FIELD_REPORTS` failing:
  // a list checked only for membership goes stale in the direction nothing reads.
  const written = new Set(
    Object.values(css).flatMap((text) => inkSites(text).map((s) => s.value)),
  );
  for (const value of Object.keys(UNMET)) {
    assert.ok(written.has(value), `UNMET excuses "${value}", which no stylesheet declares any more`);
  }
});

test("the gradient-clipped headings clear the large-text bar on every stop", () => {
  // `color: transparent` plus `background-clip: text`: the ink is the gradient,
  // so a `color:` sweep and a DOM walk both read an alpha of zero and skip type
  // a visitor certainly reads. Five headings, ten stops.
  const thin = [];
  for (const g of GRADIENT_INKS) {
    const ground = parseColour(g.ground);
    for (const stop of g.stops) {
      const ink = parseColour(vars[g.page][stop]);
      assert.ok(ink, `${g.rule} names ${stop}, which ${SHEETS[g.page]} must define`);
      const ratio = contrastRatio(ink, ground);
      if (ratio < WCAG_AA_LARGE) thin.push(`${g.rule} ${stop} on ${g.ground} is ${ratio.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(thin, []);
});

// ---- the two inks that are a ramp, not a pair ----
//
// The ancestry pips are the one mark on either page whose *colour is the datum*:
// a lineage's inherited hue, `--anc-hue`, set per element from JS. So there is
// no pair to pin — there are 360 — and the sweep is a loop rather than a walk.
// Both of these are recorded failures rather than fixed ones, and the second is
// the reason: it cannot be fixed from the ink side at all.

test("a living ancestor's pip fails on the dark hues, and no darker label saves it", () => {
  const label = parseColour("#06121c");
  const failing = [];
  let worst = { ratio: Infinity, hue: null };
  for (let hue = 0; hue < 360; hue++) {
    const fill = hslToRgb(hue, 70, 62);
    const ratio = contrastRatio(label, fill);
    if (ratio < worst.ratio) worst = { ratio, hue };
    if (ratio < WCAG_AA_TEXT) failing.push(hue);
  }
  assert.equal(failing.length, 41, "41 of 360 lineage hues put the pip's label under 4.5:1");
  assert.equal(worst.hue, 240, "the worst hue is pure blue");
  assert.equal(worst.ratio.toFixed(2), "3.60");

  // The proof that the ink is not the thing to move: pure black, the darkest
  // label there is, scores 4.00 on that fill. `hsl(h, 70%, 62%)` is a lightness
  // in a space where lightness is not luminance, and 62% at hue 240 is a much
  // darker colour than 62% at hue 60 — a ratio of 3.4× in relative luminance.
  const black = { r: 0, g: 0, b: 0 };
  const worstFill = hslToRgb(240, 70, 62);
  assert.ok(contrastRatio(black, worstFill) < WCAG_AA_TEXT);
  assert.equal(contrastRatio(black, worstFill).toFixed(2), "4.00");
  assert.ok(contrastRatio(black, hslToRgb(60, 70, 62)) / contrastRatio(black, worstFill) > 3.3);
});

test("a dead ancestor's pip fails on five hues of 360", () => {
  const panel = parseColour(vars.app["--bg-panel"]);
  const failing = [];
  for (let hue = 0; hue < 360; hue++) {
    if (contrastRatio(hslToRgb(hue, 45, 62), panel) < WCAG_AA_TEXT) failing.push(hue);
  }
  assert.equal(failing.length, 5);
  assert.deepEqual(failing, [240, 241, 242, 243, 244], "a five-degree window starting at pure blue");
});

// ---- the control, and the finding ----

test("the project's own instrument would have passed every one of these", () => {
  // This is the release's whole point. Restore the pre-v1.109 ink and every
  // failing pair is comfortably clear of ΔE 25 — the bar `palette.js` has judged
  // colour by since v1.24 — while sitting under 4.5:1. ΔE spends most of its
  // length on chroma and reading small type spends none, so an audit built for
  // marks cannot be pointed at letters and cannot say that it could not.
  const before = { "front door": parseColour("#5f7288"), app: parseColour("#5a6f85") };
  const grounds = {
    "front door": ["#0e151d", "#0a1119", "#050810"],
    app: ["#0d1826", "#111821", "#0c131c", "#070c13"],
  };
  let checked = 0;
  for (const [page, list] of Object.entries(grounds)) {
    for (const hex of list) {
      const ground = parseColour(hex);
      assert.ok(
        contrastRatio(before[page], ground) < WCAG_AA_TEXT,
        `${hex} was supposed to be one of the failures`,
      );
      assert.ok(
        deltaE(before[page], ground) > MIN_DELTA_E * 1.4,
        `${hex}: the ΔE instrument should have been nowhere near failing this`,
      );
      checked++;
    }
  }
  assert.equal(checked, 7, "seven pairs failed the legibility bar and passed the ΔE one");
});

test("the lifted inks are what liftToBar says, and the old ones are not", () => {
  for (const [page, was] of [["front door", "#5f7288"], ["app", "#5a6f85"]]) {
    const old = parseColour(was);
    // The ground that fought hardest: the brightest of the ones this ink sits on.
    const worst = TEXT_PAIRS.filter((p) => p.page === page && p.ink === "--ink-faint")
      .map((p) => parseColour(p.ground))
      .reduce((a, b) => (contrastRatio(old, a) < contrastRatio(old, b) ? a : b));
    const wanted = liftToBar(old, worst, WCAG_AA_TEXT);
    assert.equal(
      vars[page]["--ink-faint"],
      toHex(wanted),
      `${SHEETS[page]}'s --ink-faint should be the derived lift of ${was}`,
    );
  }
});

// ---- the domain ----

/** Stylesheets this sweep deliberately does not read, with the reason. */
const NOT_SWEPT = {};

test("every stylesheet in the repository is swept or excused", () => {
  const sheets = [
    ...readdirSync(ROOT).filter((f) => f.endsWith(".css")),
    ...readdirSync(join(ROOT, "app")).filter((f) => f.endsWith(".css")).map((f) => `app/${f}`),
  ];
  const swept = new Set(Object.values(SHEETS));
  for (const file of sheets) {
    assert.ok(
      swept.has(file) || file in NOT_SWEPT,
      `${file} is in no sweep's domain — read it here or name it in NOT_SWEPT with a reason`,
    );
  }
  assert.equal(sheets.length, 2, "two stylesheets; a third needs a page in SHEETS");
});

test("neither page hides its text in an inline style attribute", () => {
  // The domain above is files. An ink written into the markup is outside it, and
  // v1.88's lesson is that a domain built by walking has an exclusion nobody
  // wrote down — so the exclusion is checked instead of assumed.
  for (const page of ["index.html", "app/index.html"]) {
    const html = readFileSync(join(ROOT, page), "utf8");
    for (const m of html.matchAll(/style="([^"]*)"/g)) {
      assert.ok(
        !/(^|[;\s])color\s*:/.test(m[1]),
        `${page} sets an ink in a style attribute, which no stylesheet sweep can see: ${m[1]}`,
      );
    }
  }
});
