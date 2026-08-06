// colourliterals.test.js — the sweep `palette.js` was written to make possible
// and nobody had ever run (v1.61).
//
// The rule this project has repeated since v1.25 is that a colour a test cannot
// reach is a colour that will drift, and the remedy has always been "put it in
// `palette.js`". Twelve releases of colour work later, nothing had ever asked
// the obvious follow-up question: *did they all go there?* They had not. Five
// modules import the palette and between them named twenty colours of their
// own, and four of the twenty were marks the audit could not have measured
// because it did not know they existed. v1.57 found one of those by accident —
// the minimap's pellet, the pond's mote colour retyped without the compositing
// that made it legible — and wrote "grep every module that imports palette.js
// for a colour literal" into the playbook, where it sat for four releases.
//
// So this file is the grep, as a test. It reads the shipped sources, finds
// every colour named outside `palette.js`, and fails on any that is not in the
// list below with a reason beside it. Fixing the instances fixes the
// instances; a list checked on every run is what stops the *next* one landing
// outside the instrument (v1.53).
//
// What this sweep's domain is, stated here rather than discovered later — a
// victory sentence that does not name what it excludes quietly annexes it:
//
//   - It sees colour **strings**: `#rrggbb`, `rgb()`, `rgba()`, `hsl()`,
//     `hsla()`. It does not see a colour assembled by arithmetic, which
//     `minimap.js#terrainBandFill` does on purpose (a ramp is a formula, not a
//     value), so a channel computed from constants passes through unnoticed.
//   - It reads `src/*.js`. The stylesheet is not source it can parse, and the
//     colours that live in both are checked by name at the bottom — two of
//     them as of v1.62, which is the shape to expect: a surface that paints
//     before any module runs needs its background in the CSS *and* in the
//     palette, so the pair gets pinned rather than deduplicated.
//   - It says nothing about whether a colour is *good*. That is
//     `test/palette.test.js`; this file only asks whether the palette knows
//     about it. A literal on this list is a colour that has never been
//     measured, which is a lead, not a verdict.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { minimapWater, mullerBackground, rgbCss } from "../src/palette.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/**
 * The colours that are still named outside `palette.js`, and why each one is.
 *
 * Two kinds of entry. Some are colours with no distinction to carry — a
 * hairline over everything, a gradient's transparent end — and a palette entry
 * for them would be filing furniture. The rest are the sweep's actual finding:
 * marks that say something with colour and have never been measured. Those say
 * so, because an allowlist that reads as "all fine" is v1.46's mistake — a list
 * I wrote myself is the one I skim.
 */
const ALLOWED = [
  // ---- marks the audit has still never measured (v1.61's open list) ----
  {
    file: "main.js",
    literal: "hsl(${c.hue},70%,55%)",
    why: "the inspector swatch: a lineage hue in the DOM, and the last mark on the audit's own to-do list. v1.46 proved this exact quantity cannot be an identifier, on the Muller bands; nobody has measured it on this surface, and its sibling — the ancestry pips — is painted from style.css, which is outside every sweep this project has.",
  },
  {
    file: "minimap.js",
    literal: "rgba(226, 238, 255, 0.85)",
    why: "the viewport rectangle. A near-white stroke over anything the little map can draw, and the one mark on that surface v1.57's corpse sweep did not enumerate.",
  },
  {
    file: "render.js",
    literal: "hsla(8, 90%, 60%, ${0.35 + 0.5 * c.carnivory})",
    why: "the predator outline. `predatorMark()` next to it is measured and this is not, because v1.24 replaced the *core* and left the stroke where it was. Its opacity tracks carnivory, which is the thing v1.34 forbids by name (never express degree by fading a mark).",
  },
  {
    file: "render.js",
    literal: "rgba(120, 180, 255, 0.15)",
    why: "the vision overlay at one radius (v1.32). A rule rather than a mark — it draws where a sense reaches — but it has never been held to either bar.",
  },
  { file: "render.js", literal: "rgba(120, 180, 255, 0.06)", why: "the same overlay's intended radius, drawn faintly under the region actually searched — the pair v1.32 added so the picture stops being a quiet fiction." },
  { file: "render.js", literal: "rgba(120, 180, 255, 0.18)", why: "the same overlay's searched region at full strength: the third of the three, and the one a watcher is meant to read." },

  // ---- furniture: no distinction to carry, and nowhere for one to live ----
  {
    file: "minimap.js",
    literal: "rgba(255, 255, 255, 0.9)",
    why: "the selection square. White at 0.9 over a near-black map is the loudest thing available and carries no distinction beyond 'this one' — there is nothing to compare it against.",
  },
  { file: "render.js", literal: "rgba(255, 255, 255, 0.8)", why: "the selection ring in the pond: the same mark as above, in the big view." },
  {
    file: "render.js",
    literal: "rgba(30, 78, 66, 0.16)",
    why: "the pond's biome glow, additive, over a large radius. Not the same colour as the little map's wash (`minimapBiomeWash`) and correctly so — one is a gradient over 1.8 patch radii, the other a flat disc a few pixels across — but the pair is worth remembering: two views of one feature in two colours, neither measured.",
  },
  { file: "render.js", literal: "rgba(30, 70, 62, 0.06)", why: "the same glow's mid stop — one of three colour stops in one gradient, and a stop is a shape in a ramp rather than a colour anything is told apart by." },
  { file: "render.js", literal: "rgba(30, 70, 62, 0)", why: "the same glow's transparent end. An alpha of zero is a shape and not a colour: nothing is drawn there at all." },

  // ---- opacities on colours that do come from somewhere else ----
  {
    file: "render.js",
    literal: "rgba(${vr}, ${vg}, ${vb}, 0.28)",
    why: "the seasonal veil. Its channels are computed from `seasonPhase`; only the strength of the wash is written here.",
  },
  { file: "render.js", literal: "hsla(${c.hue}, ${sat}%, ${light}%, 0.5)", why: "a creature's glow: its own hue and lightness, at a fixed opacity." },
  { file: "render.js", literal: "hsla(${c.hue}, ${sat}%, ${light}%, 0)", why: "the same glow's transparent edge, where the radial gradient runs out. A stop, not a colour." },
];

/** Strip comments, so prose about a colour is not a use of one. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => (/^\s*\/\//.test(line) ? "" : line))
    .join("\n");
}

/**
 * Every colour named as a literal in `src`, in source order.
 *
 * A colour function whose every argument is an interpolation carries no value
 * of its own — `rgba(${t.r}, ${t.g}, ${t.b}, ${t.a})` is the palette's colour,
 * written out — so only a call with at least one constant argument counts.
 */
function coloursIn(src) {
  const out = [];
  const text = code(src);
  for (const m of text.matchAll(/\b(rgba?|hsla?)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    if (m[2].split(",").some((arg) => !arg.includes("${"))) out.push(m[0]);
  }
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) out.push(m[0]);
  return out;
}

test("no module names a colour the palette has never heard of", () => {
  const unexplained = [];
  for (const file of readdirSync(SRC).filter((f) => f.endsWith(".js")).sort()) {
    if (file === "palette.js") continue;
    for (const literal of coloursIn(readFileSync(join(SRC, file), "utf8"))) {
      if (!ALLOWED.some((a) => a.file === file && a.literal === literal)) {
        unexplained.push(`${file}: ${literal}`);
      }
    }
  }
  assert.deepEqual(
    unexplained,
    [],
    `a colour outside palette.js with no entry in this file's list:\n  ${unexplained.join("\n  ")}\n` +
      "Either move it into palette.js and measure it, or add it to ALLOWED with the reason it is not a palette colour."
  );
});

test("the list does not rot", () => {
  // The other half of the same claim, and the half a list like this always
  // loses: an entry describing a colour nobody draws any more is a sentence
  // that reads as coverage. This is the bug v1.61 found in the corpse audit,
  // which had been measuring against the pellet wash v1.57 deleted.
  const drawn = new Map();
  for (const file of readdirSync(SRC).filter((f) => f.endsWith(".js")).sort()) {
    if (file === "palette.js") continue;
    drawn.set(file, coloursIn(readFileSync(join(SRC, file), "utf8")));
  }
  for (const { file, literal } of ALLOWED) {
    assert.ok(
      drawn.get(file)?.includes(literal),
      `${file} no longer draws ${literal} — delete its entry rather than leaving a reason for a colour that is gone`
    );
  }
  for (const entry of ALLOWED) {
    assert.ok(entry.why && entry.why.length > 40, `${entry.file}: ${entry.literal} needs a reason, not a label`);
  }
});

test("the stylesheet and the palette agree about the minimap's water", () => {
  // The colour that made this file's point: `rgb(7, 12, 19)` lived in
  // `minimap.js`, in `style.css` (which paints the same corner, so it does not
  // flash a different colour before the first frame) and in the audit's own
  // constant. Two of the three are gone; the stylesheet has to stay, because it
  // paints before any module runs, so it is pinned instead.
  const css = readFileSync(join(ROOT, "style.css"), "utf8");
  const rule = css.match(/\.minimap\b[^{]*\{[^}]*\}/);
  assert.ok(rule, "no .minimap rule in style.css");
  const declared = rule[0].match(/background:\s*([^;]+);/);
  assert.ok(declared, "the .minimap rule no longer sets a background");
  assert.equal(declared[1].trim(), rgbCss(minimapWater()));
});

test("the stylesheet and the palette agree about the Tree of Life's canvas", () => {
  // The second of the two, and the one v1.61 noticed and left: `#muller` paints
  // itself `#04070b` while every audit in this project reaches for the panel.
  // At 0.9 opacity that is worth up to ΔE 4.4 and nothing turned on it; the
  // "other" band is drawn at 0.16, where it is the difference between ΔE 9.0
  // and 4.8 — so v1.62 gave the canvas an entry and this pins the stylesheet to
  // it, for the same reason the minimap's water is pinned above.
  const css = readFileSync(join(ROOT, "style.css"), "utf8");
  const rule = css.match(/#muller\b[^{]*\{[^}]*\}/);
  assert.ok(rule, "no #muller rule in style.css");
  const declared = rule[0].match(/background:\s*([^;]+);/);
  assert.ok(declared, "the #muller rule no longer sets a background");
  const hex = declared[1].trim();
  assert.match(hex, /^#[0-9a-f]{6}$/i, `#muller's background is ${hex}, which this test cannot compare`);
  const { r, g, b } = mullerBackground();
  assert.equal(hex.toLowerCase(), "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join(""));
});
