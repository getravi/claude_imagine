// legibility.js — the other colour question, asked for the first time in v1.109.
//
// This project has audited colour since v1.24 and every one of those audits
// asked the same thing: *can these two be told apart?* `palette.js` answers it
// with a CIE ΔE under three dichromacies against a bar of 25, and the subject
// has always been a **mark** — a chevron, a ring, a dot on the little map, a
// bar on a chart. A mark either reads as its own thing or it does not.
//
// Nobody had ever asked whether the **letters** are readable. That is a
// different question with a different formula and a different bar: reading
// small type is a spatial-frequency task carried almost entirely by luminance,
// so the standard measure (WCAG 2.x) is a ratio of relative luminances, 4.5 for
// body text and 3 for large. The two instruments disagree by construction —
// ΔE spends most of its length on chroma, which type is nearly blind to — and
// the size of the disagreement here is the finding: **every ink this sweep
// failed clears the project's own bar comfortably.** `--ink-faint` on the app's
// panel is ΔE 41.1 against a bar of 25 and 3.60:1 against a bar of 4.5.
//
// The second reason it went a hundred and eight releases unasked is where the
// colours live. `colourliterals.test.js` says its domain out loud — "It reads
// `src/*.js`. The stylesheet is not source it can parse" — and v1.106 wrote
// down that `style.css` and `splash.css` are consequently in no sweep's domain
// at all. Both pages' text colours are custom properties in those two files, so
// the ink a visitor actually reads was outside every instrument this project
// owns. This module is that domain, and `test/legibility.test.js` closes it the
// way v1.103 closed the markdown one: every stylesheet in the repository is
// either swept or named with a reason, with no third state a new one can
// arrive in.
//
// **What this module is and is not.** It is arithmetic and an inventory. The
// pairs it holds were measured by walking both shipped pages in a headless
// Chromium (v1.84's recipe) and compositing every ink and every ground down to
// two opaque colours; `node --test` cannot lay out a page, so the walk lives in
// a scratch probe and the suite holds what the walk found plus the sums that
// judge it — the same division v1.87 settled on for the stage's geometry. The
// ink values are *not* pinned: the test resolves them out of the stylesheet on
// every run, so dimming one is a failing build rather than a regression nobody
// meets until they read the page.
//
// PURE OBSERVER. No DOM, no simulation state, no random numbers.

import { contrastRatio, WCAG_AA_TEXT, WCAG_AA_LARGE } from "./palette.js";

// ---- reading colour out of a stylesheet ----

/**
 * A CSS colour string → {r, g, b} (0..255), or null if it is not a literal this
 * understands. Alpha is deliberately dropped: a translucent ink has no contrast
 * of its own, only a contrast against whatever it was composited over, and that
 * compositing is what the walk did.
 */
export function parseColour(str) {
  const s = String(str).trim();
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    const h = m[1];
    const wide = h.length > 4;
    const at = (i) => {
      const part = wide ? h.slice(i * 2, i * 2 + 2) : h[i] + h[i];
      return parseInt(part, 16);
    };
    if (h.length === 3 || h.length === 4 || h.length === 6 || h.length === 8) {
      return { r: at(0), g: at(1), b: at(2) };
    }
    return null;
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (n.length < 3 || n.slice(0, 3).some(Number.isNaN)) return null;
    return { r: n[0], g: n[1], b: n[2] };
  }
  return null;
}

/**
 * The `:root` custom properties of a stylesheet, as a plain object. Only the
 * first `:root` block is read, because that is the only one either sheet has and
 * a second one would be a cascade this cannot model — it would be found by the
 * coverage test below rather than silently averaged.
 */
export function customProperties(css) {
  const root = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!root) return {};
  const out = {};
  for (const m of root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/**
 * Every `color:` declaration in a stylesheet, with the value as written.
 *
 * The regex has to refuse `background-color`, `border-color`, `accent-color`
 * and `-webkit-text-fill-color`, all of which end in the same eight characters
 * and none of which is an ink. A leading `-` or word character disqualifies it;
 * a `{`, a `;` or whitespace is the only thing a real declaration can follow.
 */
export function inkSites(css) {
  const out = [];
  for (const m of css.matchAll(/(^|[;{\s])color\s*:\s*([^;}]+)/g)) {
    out.push({
      value: m[2].trim(),
      line: css.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

/**
 * Resolve a declaration value to a colour, following one level of `var()`.
 * Returns null for anything that is not a colour a reader ever sees as ink —
 * `transparent`, `inherit`, and the hue-carrying `hsl(var(--anc-hue), …)` forms
 * whose value is a property of a lineage rather than of the sheet.
 */
export function resolveInk(value, vars) {
  const direct = parseColour(value);
  if (direct) return direct;
  const m = value.match(/^var\((--[\w-]+)\)$/);
  if (m && vars[m[1]]) return parseColour(vars[m[1]]);
  return null;
}

// ---- the bar ----

/** WCAG's large-text threshold: ≥ 24 px, or ≥ 18.66 px at weight 700 or more. */
export function barFor(px, weight) {
  const large = px >= 24 || (px >= 18.66 && weight >= 700);
  return large ? WCAG_AA_LARGE : WCAG_AA_TEXT;
}

/**
 * The smallest uniformly brighter version of `ink` that clears `bar` against
 * `ground`, as an 8-bit colour.
 *
 * Uniform scaling in gamma-encoded sRGB is the cheapest lift that keeps a
 * colour recognisably itself — the channel ratios are untouched, so the hue and
 * the character of the tint survive and only the level moves. The search is over
 * the *rounded* result rather than the continuous one, because a stylesheet can
 * only say eight bits per channel and rounding down by one is how a derived
 * constant misses its own bar by 0.01.
 *
 * Returns null if no scale clears it — which happens, and is a real answer: the
 * ancestry pip's dark label cannot reach 4.5 on the darkest lineage hues at any
 * darkness at all, because the *ground* is what is too dim.
 */
export function liftToBar(ink, ground, bar) {
  for (let step = 0; step <= 400; step++) {
    const k = 1 + step / 1000;
    const lit = {
      r: Math.min(255, Math.round(ink.r * k)),
      g: Math.min(255, Math.round(ink.g * k)),
      b: Math.min(255, Math.round(ink.b * k)),
    };
    if (contrastRatio(lit, ground) >= bar) return lit;
    if (lit.r === 255 && lit.g === 255 && lit.b === 255) return null;
  }
  return null;
}

/** {r,g,b} → `#rrggbb`. */
export function toHex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

// ---- what the walk found ----

/**
 * Every (ink, ground, size) the two shipped pages actually put in front of a
 * reader, measured in a headless Chromium at 1280 × 900 with the front door's
 * reveals opened and the app left to run for six seconds.
 *
 * `ink` is either a custom property — resolved live out of the stylesheet, so
 * this inventory tracks the colour rather than remembering it — or a literal
 * hex, for the two inks that are not tokens. `ground` is a *composite*: every
 * translucent layer between the text and the first opaque paint, flattened, and
 * for a gradient the worst of its stops. So `#0d1826` is the app's page glow at
 * its brightest and `#0c131c` is the panel, and both are grounds no single
 * declaration in either sheet contains.
 *
 * v1.109's walk saw 341 text-bearing elements and 40 rows came out of it — the
 * sentence here said **39** for twenty-four releases, which is this project's
 * own rule about prose describing a collection (v1.52, v1.78) failing on the
 * file that states it. The list is 42 now: v1.133 put two more inks on the app
 * page and measured them with the same probe in the same headless Chromium at
 * 1280 × 900, flattening the same stack of translucent layers. A row added
 * without that measurement would be a guess wearing an inventory's clothes.
 *
 * It is one
 * viewport and one pond, which is the honest limit of it: a layout that only
 * appears on a phone, or a panel that only appears when something is selected,
 * is a pair this list does not have. `UNMET` below is that gap, said out loud.
 */
export const TEXT_PAIRS = Object.freeze([
  // ---- the front door (index.html, splash.css) ----
  { page: "front door", ink: "--ink-faint", ground: "#0e151d", px: 13.12, weight: 400, seen: 4, sample: "div.lbl 'lines of AI logic'" },
  { page: "front door", ink: "--ink-faint", ground: "#0a1119", px: 13.6, weight: 400, seen: 8, sample: "span 'Foragers swarming a bloom of food.'" },
  { page: "front door", ink: "--ink-faint", ground: "#050810", px: 12, weight: 400, seen: 3, sample: "div.made 'Concept by · Designed, built…'" },
  { page: "front door", ink: "--ink-dim", ground: "#11232a", px: 16.8, weight: 400, seen: 1, sample: "p.evolve-note 'And it's I wake up every six hours…'" },
  { page: "front door", ink: "--ink-dim", ground: "#0c1723", px: 20.48, weight: 400, seen: 1, sample: "p.lede 'It runs entirely in your browser.'" },
  { page: "front door", ink: "--ink-dim", ground: "#0f161e", px: 15.68, weight: 400, seen: 8, sample: "p 'A feed-forward net per creature.'" },
  { page: "front door", ink: "--ink-dim", ground: "#0a1119", px: 17.28, weight: 400, seen: 10, sample: "p 'Each creature carries a tiny neural network'" },
  { page: "front door", ink: "--ink-dim", ground: "#050810", px: 22.4, weight: 400, seen: 14, sample: "p.subhead 'So I built a world.'" },
  { page: "front door", ink: "--accent", ground: "#0c1723", px: 12, weight: 650, seen: 1, sample: "p.kicker 'Your move'" },
  { page: "front door", ink: "--accent", ground: "#0a1119", px: 12, weight: 650, seen: 2, sample: "p.kicker 'What's inside'" },
  { page: "front door", ink: "--accent", ground: "#050810", px: 12, weight: 650, seen: 3, sample: "p.kicker 'The premise'" },
  { page: "front door", ink: "--accent-2", ground: "#0b1719", px: 13, weight: 400, seen: 1, sample: "span.eyebrow 'A Claude experiment'" },
  { page: "front door", ink: "--accent-2", ground: "#0a1119", px: 13.12, weight: 400, seen: 6, sample: "div.ver 'v1.0'" },
  { page: "front door", ink: "#041016", ground: "#62c8ff", px: 16.32, weight: 650, seen: 2, sample: "a.btn '▶ Enter the Vivarium'" },
  { page: "front door", ink: "--ink", ground: "#15202c", px: 16.32, weight: 650, seen: 1, sample: "a.btn 'Read the devlog'" },
  { page: "front door", ink: "--ink", ground: "#0c1723", px: 24, weight: 700, seen: 1, sample: "h2 'Go make a world evolve.'" },
  { page: "front door", ink: "--ink", ground: "#0f161e", px: 30, weight: 400, seen: 16, sample: "h3 'Brains that are genomes'" },
  { page: "front door", ink: "--ink", ground: "#0e1119", px: 16.32, weight: 650, seen: 1, sample: "a.btn 'The story ↓'" },
  { page: "front door", ink: "--ink", ground: "#0a1119", px: 44.8, weight: 700, seen: 3, sample: "h2 'It kept growing new organs.'" },
  { page: "front door", ink: "--ink", ground: "#0a1119", px: 17.28, weight: 650, seen: 15, sample: "b 'The pond, thriving'" },
  { page: "front door", ink: "--ink", ground: "#050810", px: 89.6, weight: 800, seen: 4, sample: "h1 'I was handed an empty repo and told:'" },
  { page: "front door", ink: "--ink", ground: "#050810", px: 17.28, weight: 650, seen: 3, sample: "strong 'build whatever you want'" },

  // ---- the app (app/index.html, style.css) ----
  { page: "app", ink: "--ink-faint", ground: "#0d1826", px: 12.5, weight: 400, seen: 13, sample: "p.phylo-sub 'Each band is a species…'" },
  { page: "app", ink: "--ink-faint", ground: "#111821", px: 11, weight: 400, seen: 2, sample: "span.c-when '244 steps in'" },
  { page: "app", ink: "--ink-faint", ground: "#0c131c", px: 12.5, weight: 400, seen: 60, sample: "span.chronicle-sub 'the natural history of this pond'" },
  { page: "app", ink: "--ink-faint", ground: "#070c13", px: 11, weight: 400, seen: 1, sample: "span.yr '· year 1'" },
  { page: "app", ink: "--ink-dim", ground: "#111a26", px: 11, weight: 400, seen: 17, sample: "kbd 'Space'" },
  { page: "app", ink: "--ink-dim", ground: "#0d1826", px: 13, weight: 400, seen: 11, sample: "p.tagline 'a digital pond where little brains evolve'" },
  { page: "app", ink: "--ink-dim", ground: "#0c131c", px: 13, weight: 400, seen: 43, sample: "span 'Seed'" },
  { page: "app", ink: "--accent", ground: "#0d1826", px: 13.5, weight: 600, seen: 1, sample: "a.home-link '← Vivarium — the experiment'" },
  { page: "app", ink: "chartLines().pop", ground: "#0c131c", px: 9, weight: 400, seen: 3, sample: "#chart-ticks span '40'" },
  { page: "app", ink: "--ink", ground: "#12293a", px: 13, weight: 400, seen: 1, sample: "button.primary '⏸ Pause'" },
  { page: "app", ink: "--ink", ground: "#111a26", px: 13, weight: 400, seen: 8, sample: "button '↻ Reset'" },
  { page: "app", ink: "--ink", ground: "#16261c", px: 13, weight: 400, seen: 1, sample: "button.meet '👋 Meet somebody'" },
  { page: "app", ink: "--ink", ground: "#111821", px: 15, weight: 400, seen: 4, sample: "span.c-msg 'Predators are now half of the pond.'" },
  { page: "app", ink: "--ink", ground: "#0d1826", px: 34, weight: 400, seen: 2, sample: "h1 'Vivarium'" },
  { page: "app", ink: "--ink", ground: "#0d1826", px: 17, weight: 600, seen: 1, sample: "h2 '🌳 Tree of Life'" },
  { page: "app", ink: "--ink", ground: "#0c131c", px: 13, weight: 400, seen: 63, sample: "button 'Genesis'" },
  { page: "app", ink: "--ink", ground: "#070c13", px: 12.5, weight: 400, seen: 2, sample: "div.season-badge 'Summer'" },
  { page: "app", ink: "--ink", ground: "#04070b", px: 16, weight: 400, seen: 1, sample: "p.sr-only 'Arrow keys select a creature…'" },
  // v1.133's two: the offer on a ladder row that is about an animal, and the
  // same offer on the banner over the water. One ink, two grounds — the panel
  // and the toast's own dark plate — and the row's was measured at 390 px as
  // well as at 1280, where it comes out on the same panel composite.
  { page: "app", ink: "--accent-2", ground: "#0c131c", px: 12, weight: 400, seen: 2, sample: "span.msgo '👀 Show me'" },
  { page: "app", ink: "--accent-2", ground: "#09131c", px: 12.5, weight: 400, seen: 1, sample: "button.flash-go '👀 Show me'" },
  // v1.136's: the same offer a third time, at the end of a Chronicle line. The
  // ink and the size are the ladder's on purpose — this is one promise wearing
  // one face, and a dimmer version of it would have been a new pair to price
  // for no reader's benefit. The ground is the *striped* row, `#111821`, which
  // is where the row above already puts `span.c-when`: the panel's own
  // `#0c131c` is the lighter case and is already measured two rows up, so the
  // stripe is the one that decides.
  { page: "app", ink: "--accent-2", ground: "#111821", px: 12, weight: 400, seen: 2, sample: "span.c-go '👀 Show me'" },
]);

/**
 * The `color:` declarations the walk never met, and why each one is not in the
 * inventory above. Keyed by the value exactly as the stylesheet writes it.
 *
 * Two of these are the interesting ones and both are the same shape: an ink or a
 * ground that is a **function of a lineage hue**, so there is no pair to pin —
 * there are 360 of them. `test/legibility.test.js` sweeps both, because a hue
 * ramp is arithmetic and needs no browser, and the answer is that the ancestry
 * pip's label fails on 41 hues of 360. That one cannot be fixed from the ink
 * side at all: at hue 240 the fill is dark enough that even a pure black label
 * scores 4.00, so the constant that is wrong is the fill's **62% HSL lightness**
 * — which is a lightness in a space where lightness is not luminance, and moving
 * it moves every pip. It is named here rather than fixed in v1.109 because a
 * change to the pip is a change to the one mark on this page that carries
 * identity, and that wants its own cycle and its own control.
 */
export const UNMET = Object.freeze({
  transparent: "`background-clip: text` — the ink is a gradient, swept as GRADIENT_INKS below",
  inherit: "takes its colour from a pair already in the inventory",
  "hsl(var(--anc-hue), 45%, 62%)": "a dead ancestor's pip: the ink is a lineage hue, so it is 360 pairs and swept as a ramp",
  "#06121c": "a living ancestor's pip: the ground is a lineage hue, so it is 360 pairs and swept as a ramp",
  "#78beff": "the chart legend's pressed scope button — a state the walk did not put the page into",
  "var(--accent-2)": "`.learn-hero em` — fourteen rules of `.learn-*` that no page in this repository uses",
});

/**
 * The five headings whose ink is not a colour but a gradient clipped to the
 * glyphs. A `color:` sweep sees `transparent` and a walker reads an alpha of
 * zero, so both instruments skip them and the letters a visitor actually reads
 * are the *stops*. All five are display type, so the bar is 3.
 *
 * This is the same blind spot in two instruments for the same reason, which is
 * v1.106's lesson about absorbers arriving on an ink: `background-clip: text` is
 * a word that moves a colour out of the property everybody measures.
 */
export const GRADIENT_INKS = Object.freeze([
  { page: "front door", rule: ".hero h1 .grad", stops: ["--accent", "--accent-2", "--accent-3"], ground: "#050810" },
  { page: "front door", rule: ".statement .grad", stops: ["--accent", "--accent-2", "--accent-3"], ground: "#0a1119" },
  { page: "front door", rule: ".stat-card .num", stops: ["--accent", "--accent-2"], ground: "#0e151d" },
  { page: "front door", rule: ".evolve-note .grad", stops: ["--accent", "--accent-2", "--accent-3"], ground: "#11232a" },
  { page: "app", rule: ".learn-hero h2", stops: ["--ink", "--accent"], ground: "#0c131c" },
]);

/**
 * Every pair in the inventory, judged. `inkOf` resolves an ink name to a colour
 * (a custom property out of the right stylesheet, a literal, or a palette
 * function), which is what keeps this a live measurement rather than a memory.
 */
export function verdicts(inkOf) {
  return TEXT_PAIRS.map((p) => {
    const ink = inkOf(p);
    const ground = parseColour(p.ground);
    const bar = barFor(p.px, p.weight);
    const ratio = contrastRatio(ink, ground);
    return { ...p, ink, ground, bar, ratio, passes: ratio >= bar };
  });
}
