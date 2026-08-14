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
//     colours that live in both are checked by name at the bottom — three of
//     them as of v1.79, and that count is itself checked below, because a
//     number stated in prose about a collection in code drifts (v1.52, v1.78).
//     A surface that paints before any module runs, or one whose colour arrives
//     as a custom property, needs its value in the CSS *and* in the palette, so
//     the pair gets pinned rather than deduplicated.
//   - It says nothing about whether a colour is *good*. That is
//     `test/palette.test.js`; this file only asks whether the palette knows
//     about it. A literal on this list is a colour that has never been
//     measured, which is a lead, not a verdict.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ancestryPip, minimapWater, mullerBackground, rgbCss } from "../src/palette.js";

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
  // ---- marks the audit has still never measured ----
  // (Empty as of v1.79. v1.61 opened this half of the list with four entries
  // and every one of them was hiding something; the last was the inspector
  // swatch, and it needed a question this project had not asked. Its entry read
  // "nobody has measured it on this surface" and the surface turned out to be
  // the finding: a DOM mark can paint its own background, and this one did —
  // `box-shadow: 0 0 8px currentColor` on a span with no colour of its own, so
  // the halo was the *paragraph's* ink and 15.3% of lineage hues were under the
  // bar against it. Against the panel, which is what an audit here would have
  // measured, it passed on all 360. `main.js` is off this list entirely now,
  // the second module to leave it after `render.js` in v1.70; the entry's
  // named blind spot — the ancestry pips, in `style.css` — is pinned at the
  // bottom of this file and swept in `test/palette.test.js`. Six struck off,
  // five were hiding something, and the sixth's sibling is the control that
  // says so.)
  // (The predator outline was here until v1.66, which measured it — 56.3% of
  // its backgrounds under the bar — and moved it into `predatorOutline()`. It
  // is the second item this list has struck off, and like the first it was
  // hiding something: the opacity ramp it spent its contrast on encoded ΔE 1.7
  // over 94% of the frames it appeared in.)
  // (The viewport rectangle and the selection square were here until v1.73 —
  // the last two entries on this list, one filed as a mark nobody had measured
  // and one as furniture, and the second filing was the interesting one. Both
  // are two-tone cased strokes now (`minimapViewport`, `minimapSelection`).
  // Measured, both bottomed out at ΔE 0.00–0.01 against the little map's own
  // crop: v1.57 gave the pellet the pond's *additive* mote, and four of them in
  // one minimap pixel paint `rgb(222, 255, 255)`. The entry that read "the
  // loudest thing available" had been false for two releases and for a reason
  // recorded in this very file. Fourth and fifth items struck off, and both
  // were hiding something — which is now five for five.)
  // (The vision overlay's three strengths were here until v1.70. Their entries
  // said the overlay is "a rule rather than a mark … never held to either bar",
  // and the filing was the bug: a gridline's background is chosen by me, this
  // one's is chosen by the world. Measured, the faintest of the three sat under
  // the just-noticeable difference on 26.3% of the pond and the *pair* whose
  // difference is the whole point of v1.32 was ΔE 0.00 apart at worst. They are
  // one two-tone `visionReach()` now, told apart by a dash. Third item struck
  // off this list, third one that was hiding something.)

  // ---- furniture: no distinction to carry, and nowhere for one to live ----
  // (The pond's selection ring was here until v1.84 — the first entry ever
  // struck off the *furniture* half of this list, and the six above it are the
  // reason to have looked. Its reason read "the same mark as above, in the big
  // view", which was true and was not a measurement. Translucent white over the
  // pond bottoms out at ΔE 0.00 and is under the just-noticeable difference on
  // a fifth of the backgrounds it can be drawn on, because a well-fed body is
  // `hsl(hue, 60..85%, 90%)` under its own additive glow and the pond is full
  // of near-white; opaque white is no better, so the ceiling is the colour
  // itself. It is a cased two-tone stroke now (`selectionMark`), shared with
  // the trail v1.84 added. Seven struck off, six were hiding something — and
  // the filing that protected this one for eighty-four releases said it carried
  // no distinction, when it carries the only one on the canvas that is about
  // the *watcher* rather than about the world.)
  // (The pond's biome glow — all three of its stops — was here until v1.93, and
  // it is the eighth item off this list and the seventh that was hiding
  // something. Its filing was the strongest form of the furniture claim this
  // list makes: "a stop is a shape in a ramp rather than a colour anything is
  // told apart by", which is true, and which answers a question about *colour*
  // for a mark whose content is its *shape*. Measured, the colour really was
  // fine — over the just-noticeable difference at the centre of every ground it
  // can be drawn on, under `MIN_DELTA_E` on all of them, which is where a field
  // belongs. The ramp was not: two straight segments where `FertilityField.at()`
  // is a Gaussian, so the visible glow died at 0.99σ with the ground still at
  // 61.3% of its peak fertility, and it accounted for 38.4% of a real crop.
  // `pondBiomeGlow()` now samples the rule's own falloff out to the radius where
  // it stops being visible, and the crop it accounts for is 60.9%. The lesson to
  // carry: this list's headings sort colours, and a colour is not always what a
  // colour literal is carrying.)

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

test("the stylesheet and the palette agree about the ancestry pips", () => {
  // The third pin, and the one that closes the top half of the list above. The
  // swatch's entry named these as the reason it could not be finished — a
  // lineage hue in the DOM, painted from a stylesheet no sweep here can parse —
  // and striking the swatch off without them would leave a known gap filed
  // under a closed list, which is the note v1.66 calls the most expensive kind.
  //
  // They stay in the CSS for the reason the two colours above do: the hue
  // arrives as a custom property per pip, so the fixed part is all a module can
  // own. Pinned rather than deduplicated (v1.62), and the values are swept over
  // all 360 hues in `test/palette.test.js`, where they pass by 40 or better.
  const css = readFileSync(join(ROOT, "style.css"), "utf8");
  const p = ancestryPip();
  const rule = css.match(/^\.anc\s*\{[^}]*\}/m);
  assert.ok(rule, "no .anc rule in style.css");
  const bg = rule[0].match(/background:\s*([^;]+);/);
  assert.ok(bg, "the .anc rule no longer sets a background");
  assert.equal(bg[1].trim(), `hsl(var(--anc-hue), ${p.sat}%, ${p.light}%)`);
  const ink = rule[0].match(/color:\s*([^;]+);/);
  assert.ok(ink, "the .anc rule no longer sets a label colour");
  assert.equal(ink[1].trim(), p.label);

  // The hollow pip: an ancestor that has died out carries its hue in the text
  // and the border instead of in a fill, at a lower saturation.
  const goneRule = css.match(/\.anc\.gone\s*\{[^}]*\}/);
  assert.ok(goneRule, "no .anc.gone rule in style.css");
  assert.equal(
    goneRule[0].match(/color:\s*([^;]+);/)?.[1].trim(),
    `hsl(var(--anc-hue), ${p.goneSat}%, ${p.light}%)`
  );
});

test("this file's own count of its stylesheet pins is honest", () => {
  // v1.52's rule on the surface that keeps producing it: the header above says
  // how many colours are pinned by name, and a sentence saying "two" over three
  // tests is the same drift this project has now found in a README, a comment
  // over a list of stat tiles, and here.
  const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const claimed = self.match(/checked by name at the bottom — (\w+) of\b/);
  assert.ok(claimed, "the header no longer states how many pins there are");
  const pins = [...self.matchAll(/^test\("the stylesheet and the palette agree about /gm)].length;
  assert.equal(WORDS[claimed[1]], pins, `the header says ${claimed[1]}; there are ${pins}`);
});
