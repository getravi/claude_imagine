// palette.js — colour decisions, and the instrument that judges them.
//
// This world says two important things with colour: *that one hunts* (a warm
// core inside a chevron) and *that one is kin to this one* (an inherited hue).
// Both ride on the red–green axis, which is the axis roughly one man in twelve
// cannot see. Twenty-four versions went by without anyone checking, so this
// module exists to check.
//
// It has two halves. The lower half is a standard dichromat simulation — the
// Viénot, Brettel & Mollon (1999) linear model — plus a CIE L*a*b* distance, so
// "can these two be told apart?" becomes a number instead of an opinion. The
// upper half is the palette itself: the project's colour choices as pure
// functions, so the tests hold the *rendered* palette to the measurement rather
// than to a copy of it.
//
// The audit that came out of this, including the two findings it could not fix,
// is written up in docs/SCIENCE.md. Nothing here touches simulation state or
// draws a random number; a palette is a statement about pixels.

// ---- sRGB transfer function ----

/** sRGB channel (0..1, gamma-encoded) → linear-light. */
export function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear-light channel → sRGB (0..1, gamma-encoded), clamped. */
export function toSrgb(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(1, v));
}

/**
 * HSL → RGB, in the same 0..360 / 0..100 / 0..100 units the CSS colour strings
 * in render.js use, returning channels in 0..255. This is the bridge between how
 * the renderer talks about colour and how the eye model measures it.
 */
export function hslToRgb(h, s, l) {
  const hh = (((h % 360) + 360) % 360) / 60;
  const ss = Math.max(0, Math.min(1, s / 100));
  const ll = Math.max(0, Math.min(1, l / 100));
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = ll - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Composite `src` over `dst` the way the canvas does with
 * `globalCompositeOperation = "lighter"`: additive, clamped. Nearly everything
 * bright in this scene is drawn that way, and the clamp is the whole reason the
 * old predator core failed — added to an already-pale body it saturates to the
 * same white the body was heading for.
 */
export function addOver(dst, src, alpha = 1) {
  return {
    r: Math.min(255, dst.r + src.r * alpha),
    g: Math.min(255, dst.g + src.g * alpha),
    b: Math.min(255, dst.b + src.b * alpha),
  };
}

/** Composite `src` over `dst` normally (`source-over`). */
export function blendOver(dst, src, alpha = 1) {
  return {
    r: dst.r * (1 - alpha) + src.r * alpha,
    g: dst.g * (1 - alpha) + src.g * alpha,
    b: dst.b * (1 - alpha) + src.b * alpha,
  };
}

// ---- Dichromat simulation ----

// Viénot, Brettel & Mollon (1999): take linear RGB into Hunt-Pointer-Estévez
// LMS cone space, replace the missing cone's response with the best linear
// prediction from the two that remain, and come back. It is the model most
// accessibility tools use, and it is an idealisation — a real dichromat is not a
// matrix, and anomalous trichromacy (the commoner condition) sits somewhere
// between this and normal vision. Treat it as a *lower bound on confusion*:
// colours this model merges are genuinely hard for someone, which is exactly
// what an audit wants to catch.
const RGB_TO_LMS = [
  [17.8824, 43.5161, 4.11935],
  [3.45565, 27.1554, 3.86714],
  [0.0299566, 0.184309, 1.46709],
];
const LMS_TO_RGB = [
  [0.080944448, -0.1305044, 0.11672106],
  [-0.010248534, 0.054019327, -0.11361471],
  [-0.00036529694, -0.0041216147, 0.69351141],
];

// Each entry rewrites one cone's response as a linear combination of the others.
const CVD = {
  // No L cones ("red-blind").
  protanopia: (L, M, S) => [2.02344 * M - 2.52581 * S, M, S],
  // No M cones ("green-blind") — the commonest dichromacy.
  deuteranopia: (L, M, S) => [L, 0.494207 * L + 1.24827 * S, S],
  // No S cones ("blue-blind") — rare, and included because a palette that dodges
  // the red–green problem by leaning on blue and yellow is leaning on this one.
  tritanopia: (L, M, S) => [L, M, -0.395913 * L + 0.801109 * M],
};

/** The three deficiencies this project audits against. */
export const CVD_TYPES = Object.freeze(Object.keys(CVD));

/** Normal vision plus the three deficiencies — one loop over every viewer. */
export const VISION_MODELS = Object.freeze(["normal", ...CVD_TYPES]);

function mul(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/**
 * What an {r,g,b} colour looks like to a dichromat of the given type. A `type`
 * of "normal" (or anything unrecognised) returns the colour unchanged, so a
 * caller can sweep normal vision and the deficiencies in the same loop.
 */
export function simulateCvd(rgb, type) {
  const f = CVD[type];
  if (!f) return { r: rgb.r, g: rgb.g, b: rgb.b };
  const lin = [toLinear(rgb.r / 255), toLinear(rgb.g / 255), toLinear(rgb.b / 255)];
  const lms = mul(RGB_TO_LMS, lin);
  const out = mul(LMS_TO_RGB, f(lms[0], lms[1], lms[2]));
  return {
    r: toSrgb(out[0]) * 255,
    g: toSrgb(out[1]) * 255,
    b: toSrgb(out[2]) * 255,
  };
}

// ---- Perceptual distance ----

// D65 white, the reference sRGB is defined against.
const WHITE = [0.95047, 1.0, 1.08883];

function toXyz(rgb) {
  const r = toLinear(rgb.r / 255);
  const g = toLinear(rgb.g / 255);
  const b = toLinear(rgb.b / 255);
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

function labF(t) {
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
}

/** {r,g,b} (0..255) → CIE L*a*b* under D65. */
export function toLab(rgb) {
  const xyz = toXyz(rgb);
  const fx = labF(xyz[0] / WHITE[0]);
  const fy = labF(xyz[1] / WHITE[1]);
  const fz = labF(xyz[2] / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * CIE76 ΔE between two colours, optionally as seen with a colour vision
 * deficiency. Rough calibration: ~2.3 is the just-noticeable difference and ~10
 * is "a different colour at a glance". The marks in this pond are a few pixels
 * across and moving, so it wants a good deal more than either.
 */
export function deltaE(a, b, type = "normal") {
  const la = toLab(simulateCvd(a, type));
  const lb = toLab(simulateCvd(b, type));
  const dl = la[0] - lb[0];
  const da = la[1] - lb[1];
  const db = la[2] - lb[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

// ---- The other instrument: legibility ----
//
// ΔE answers *can these two be told apart?* Every colour audit this project has
// run for eighty releases has asked that question, because everything it was
// asking about is a mark — a chevron, a ring, a dot on the little map — and a
// mark either reads as its own thing or it does not.
//
// A letter is not a mark. Reading 12.5 px type is a spatial-frequency task, and
// the thing that carries it is luminance alone: hue and chroma contribute
// almost nothing at the stroke widths a caption is made of. So the two
// questions have two formulas and two bars, and a colour can be a long way
// clear of one while sitting under the other. v1.109 measured that gap and it
// is not small — the ink that fails below scores ΔE 38.3 against a bar of 25.
//
// This is the standard measure (WCAG 2.x): a ratio of relative luminances with
// a 0.05 flare term, 4.5 for body text and 3 for large text. It is not a taste
// and it is not tuned to this palette, which is the point of using it.

/** Relative luminance of {r,g,b} (0..255), per WCAG 2.x. */
export function relativeLuminance({ r, g, b }) {
  return 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
}

/**
 * WCAG contrast ratio between two opaque colours, 1 (identical) to 21 (black on
 * white). Order does not matter.
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG AA for body text, and for large text (≥ 24 px, or ≥ 18.66 px bold). */
export const WCAG_AA_TEXT = 4.5;
export const WCAG_AA_LARGE = 3;

// ---- The palette ----

/**
 * The bar every deliberate colour distinction in this project has to clear,
 * under normal vision and all three dichromacies. It is chosen from the
 * measurements rather than from a standard: the old predator core scores 2.8 in
 * its worst case and the mark that replaced it scores 41, so anywhere in the
 * middle is an arbitrary line, and 25 is comfortably above "obviously a
 * different colour" without being tuned to the answer.
 */
export const MIN_DELTA_E = 25;

/**
 * The blood-dark tone both predator marks are drawn with. One constant, read by
 * `predatorMark` and `predatorOutline` alike, so the eye and the silhouette
 * cannot drift into two different darks — the sameness is a consequence rather
 * than a pair of decisions that happen to agree today (v1.62).
 */
const PREDATOR_DARK_HSL = [8, 85, 12];
const PREDATOR_DARK = `hsl(${PREDATOR_DARK_HSL[0]}, ${PREDATOR_DARK_HSL[1]}%, ${PREDATOR_DARK_HSL[2]}%)`;

/**
 * The predator's mark — the thing that says *this one hunts*, which is the most
 * important sentence this pond speaks.
 *
 * Until v1.25 it was a warm core drawn additively over the body. That fails, and
 * not only for dichromats: body lightness rises with energy, so a well-fed
 * creature is a pale pastel, and adding a bright orange to a pale pastel clamps
 * to the white it was nearly at already. Worst case over the hue wheel, ΔE 2.8 —
 * the just-noticeable difference. The best-fed predator in the pond, the one
 * most worth spotting, wore the faintest mark.
 *
 * What replaces it is an eye: an opaque warm disc with a dark rim. The trick is
 * the one used for subtitles burned into film — a mark carrying *both* a very
 * light and a very dark tone cannot be swallowed by a background, because no
 * background is close to both. Whichever half of it the body happens to
 * resemble, the other half stands out, and it stands out in luminance, which is
 * the one channel no colour vision deficiency touches. Hue is left in it (a
 * warm amber, a blood-dark rim) as flavour for the people who can see it, not
 * as the carrier.
 *
 * How carnivorous the creature is now moves the mark's *size* rather than its
 * opacity. Fading a mark to signal degree costs exactly the contrast the mark
 * exists for; geometry costs nothing and survives every vision model.
 *
 * @param {number} carnivory 0..1 diet gene
 */
export function predatorMark(carnivory) {
  const c = Math.max(0, Math.min(1, carnivory));
  return {
    disc: "hsl(30, 100%, 88%)",
    rim: PREDATOR_DARK,
    // As a fraction of the body radius. The old core was a flat 0.55.
    radius: 0.4 + 0.2 * c,
  };
}

/** The two tones of the predator mark as RGB, for the audit. */
export function predatorMarkTones() {
  return { disc: hslToRgb(30, 100, 88), rim: hslToRgb(...PREDATOR_DARK_HSL) };
}

/**
 * The predator's *silhouette* — the warm line around the chevron, which is the
 * other half of what says "this one hunts" and the half the v1.25 audit did not
 * touch. It replaced the core and left the stroke exactly where it was, so for
 * forty-one releases this was `hsla(8, 90%, 60%, 0.35 + 0.5 * carnivory)`: one
 * translucent warm tone whose opacity tracked the diet gene.
 *
 * Two things are wrong with that and the second is the interesting one.
 *
 * It is invisible. A single translucent tone over a background it does not
 * control is the failure v1.25 found in the core, v1.34 in the halo and v1.43
 * in the call rings, and it fails here the same way: measured against every
 * body this pond can paint and every glow-lit patch of water outside one,
 * **53.5% of those backgrounds sit below the bar and 3.9% below the
 * just-noticeable difference** — 134 of the 360 lineage hues have a body state
 * in which the line around a hunter cannot be seen at all.
 *
 * It fails at the *opposite* end of the energy axis from the core, though, and
 * that is the part worth carrying forward: the core was additive, so a pale
 * well-fed body clamped it to white; this one is `source-over`, so what defeats
 * it is the middle — a mid-lightness warm body is almost exactly what the line
 * composites to. 71.9% of starving bodies score under the bar against 16.8% of
 * fed ones. Two marks that look like one decision are two decisions whenever
 * they are composited differently.
 *
 * And the degree it was spending that contrast on was never there. The diet
 * gene of a creature actually drawn as a predator runs 0.55–1.0, but 94.1% of
 * predator-frames over twelve seeds sit under 0.80, so the opacity a watcher
 * meets spans 0.63–0.74. Over that range the faintest outline and the loudest
 * differ by **ΔE 1.7 on a warm body** — under the just-noticeable difference.
 * The channel v1.34 forbids by name was not merely expensive here; it was
 * empty. Carnivory is already in `predatorMark`'s *radius*, which is where it
 * stays.
 *
 * So the line becomes opaque and two-toned, the house treatment: a dark
 * hairline laid down slightly wider, the warm tone over it. The dark is the
 * eye's own rim, and the warm is pinned between two measurements pulling in
 * opposite directions — it has to clear `MIN_DELTA_E` against every background
 * (which wants it lighter) and stay distinguishable from the eye's pale disc,
 * so the silhouette does not read as a second copy of the mark it surrounds
 * (which wants it darker). At hue 20 those two admit lightness 40–49 and
 * nothing else; this is the middle of that band.
 *
 * A note for whoever moves it: the tone it replaces was hue 8, the *rim's own
 * hue*, and that is why its admissible band was one step wide. A two-tone mark
 * whose tones share a hue is separated in luminance alone, so a mid-luminance
 * background of that hue defeats both halves at once — the warm mid-tone
 * rgb(79, 65, 35) scored 24.9 against the light tone and 24.2 against the dark.
 * Moving the light tone off the dark one's hue is what buys the second axis
 * back, and the band goes from one step to ten.
 */
export function predatorOutline() {
  return {
    edge: "hsl(20, 90%, 45%)",
    rim: PREDATOR_DARK,
    // World units, the same width the warm line has always been. What the fix
    // adds is the dark under it, not a heavier mark: `render.js` lays the rim
    // down at `width + 1.1` the way `_twoToneRing` does, so the hairline is
    // half a pixel either side of a line that has not changed size.
    width: 1,
  };
}

/** The predator outline's two tones as RGB, for the audit. */
export function predatorOutlineTones() {
  return { edge: hslToRgb(20, 90, 45), rim: hslToRgb(...PREDATOR_DARK_HSL) };
}

/**
 * The refuge line: the circle at `bodyRadiusMax / preySizeRatio`, drawn around
 * every body the size rule can still reach (v1.69).
 *
 * Not a creature mark like the three above it — those say what a creature *is*,
 * and this says where a **rule** stops. It is the only thing in this project
 * drawn at a radius that does not depend on the thing it is drawn around: every
 * ring in the pond is the same 7.273 px circle, so a body either fills its own
 * or it does not, and the pond's size structure is one glance rather than a
 * percentage. It is an overlay, off unless a watcher asks for it, and drawn in
 * screen-pixel hairlines the way the selection ring and the vision cone are —
 * the *radius* is a world measurement and the *line* is a drawing.
 *
 * The two tones are the house treatment and they are not decoration here. This
 * ring is drawn straddling a body edge by construction — the gap between a
 * hunted body and its own refuge circle has a median of 0.65–1.93 px over a run
 * — so roughly half of every ring lies over an opaque chevron of some inherited
 * hue and the rest over glow-lit water. A single tone measured against one of
 * those is v1.25's mistake with a new subject. Pale cyan and near-black, hues
 * far apart so the pair is not separated in luminance alone (the note v1.66
 * left on `predatorOutline`): worst case over every body this pond can paint
 * and every glow-lit patch outside one is ΔE 44.6.
 *
 * Cyan rather than the warm family the other predation marks use, deliberately.
 * A hunter's outline and eye are warm because they say *this one hunts*; this
 * says *this one can be hunted*, which is the complement, and putting the two
 * statements in one hue family would invite reading the ring as a third grade
 * of predator. It is also the one mark here whose *absence* is the signal.
 */
export function refugeRing() {
  return {
    ring: "hsl(186, 70%, 90%)",
    rim: "hsl(232, 55%, 7%)",
    // Screen pixels, divided back out of the zoom by `render.js`. The rim goes
    // down at `width + 1.1` like every other two-tone ring here, so the whole
    // mark is under three pixels wide at any zoom and a viewer who zooms in to
    // read the gap gets a thinner line rather than a fatter one.
    width: 0.9,
  };
}

/** The refuge ring's two tones as RGB, for the audit. */
export function refugeRingTones() {
  return { ring: hslToRgb(186, 70, 90), rim: hslToRgb(232, 55, 7) };
}

/**
 * The vision overlay: where a sense reaches, and where it *actually* looked
 * (v1.32, audited here in v1.70).
 *
 * This is the last translucent single tone `render.js` drew, and it survived
 * eleven releases of colour work because it was filed as a **rule** rather than
 * a mark — a line saying where a radius ends, not a badge saying what a
 * creature is — so neither the `MIN_DELTA_E` floor nor the two-sided rule bar
 * was ever pointed at it. Filing decided the audit, and the filing was wrong:
 * a gridline is furniture on a panel whose background *I* choose, and this is
 * drawn over the pond, whose background the world chooses. That is v1.34's
 * lottery, and the numbers are the worst this project has recorded:
 *
 *   - The searched region (`rgba(120, 180, 255, 0.18)`) bottoms out at
 *     **ΔE 0.00** and is under the just-noticeable difference on **4.8%** of
 *     the grounds, glows and bodies a 168-pixel circle crosses.
 *   - The intended radius under it (the same blue at **0.06**) is under the JND
 *     on **26.3%** of them — a quarter of the pond, invisible.
 *   - And the two of them, which are drawn in one frame and whose *difference*
 *     is the entire point of v1.32, are **ΔE 0.00** apart at worst and under
 *     the JND on **8.5%** of backgrounds. The release that stopped this overlay
 *     telling a quiet fiction told it in a second voice: on a twelfth of the
 *     pond the correction and the thing it corrects are the same line.
 *
 * So the alpha goes, and with it both jobs it was doing. **The distinction
 * moves to a dash** — the region really searched is solid, the radius merely
 * asked for is dashed — which is the geometry v1.34 spends when colour has
 * nowhere to live, and the same device that tells the immune ring from the sick
 * halo. **Subordination moves to the width**: a one-pixel opaque hairline is
 * quiet because it is thin, and thinness is a property of the mark, where
 * translucency is a property of the mark *and its background*.
 *
 * The colour itself was never the bug. `rgb(120, 180, 255)` is
 * `hsl(213, 100%, 73.5%)`, and opaque, over a near-black rim, it clears the bar
 * by **38.3** on every one of the 6,636 backgrounds the overlay can cross. What
 * pins the lightness is not that floor — the floor is satisfied at every
 * lightness from 56 up, because the rim carries the dark grounds and any blue
 * carries the bright ones — but the **ceiling against the two other blue marks
 * this pond draws**: the immune ring (ΔE 34.8, and colliding above lightness
 * 78) and the refuge ring (45.3, colliding above 83). Nine releases of colour
 * work here have ended in a value pinned by a floor; this one is pinned by its
 * neighbours, and 73.5 was already inside the band.
 *
 * The pair is not a stylistic choice. Sweeping every opaque tone in HSL against
 * these backgrounds, the best *single* colour that exists — `hsl(240, 100%,
 * 15%)` — scores **17.6** worst-case against a bar of 25. v1.34's "no
 * background is close to both" has been the reason for every two-tone mark here
 * and has never been measured as a claim about the alternative; over this
 * pond's grounds there is no single tone that works, and that is why.
 */
export function visionReach() {
  return {
    ring: "rgb(120, 180, 255)",
    rim: "hsl(232, 55%, 7%)",
    // Screen pixels, divided back out of the zoom by `render.js`, like the
    // selection ring this is drawn beside. The rim goes down at `width + 1.1`
    // the way every two-tone ring here does.
    width: 1,
    // The pitch is read at the scale this is drawn at — a `visionRadius`
    // circle is ~1,050 px around, so the immune ring's [2, 2.4] would read as a
    // solid line at arm's length. Long enough to be a dash, short enough that a
    // shadow's edge still lands on ink.
    dash: [7, 5],
  };
}

/** The vision overlay's two tones as RGB, for the audit. */
export function visionReachTones() {
  return { ring: { r: 120, g: 180, b: 255 }, rim: hslToRgb(232, 55, 7) };
}

/**
 * The selection mark: the ring around the creature a watcher has chosen, and
 * (v1.84) the line showing where it has been.
 *
 * This colour was `rgba(255, 255, 255, 0.8)` in `render.js` from v1.0 to v1.84,
 * and `test/colourliterals.test.js` filed it under **"furniture: no distinction
 * to carry, and nowhere for one to live"** — the half of that list whose entries
 * are supposed to be safe. It was the most-failed mark this project has
 * measured. Translucent white over the pond bottoms out at **ΔE 0.00**, is under
 * the just-noticeable difference on **21.76%** of the 4,388 backgrounds it can
 * be drawn on and under the bar on **51.8%**, and the reason is arithmetic
 * rather than bad luck: a well-fed creature is `hsl(hue, 60..85%, 90%)` and
 * `render.js` lays its own glow over it additively, so the pond is *full* of
 * near-white, and white on white is nothing. Going opaque does not rescue it
 * (still 0.00, still 21.24% under the JND) — the ceiling is white itself.
 *
 * So the mark takes the house treatment every other overlay here has had since
 * v1.34: two tones, hues far apart so the pair is not separated in luminance
 * alone, drawn as a cased stroke. Worst case over every ground, glow and body
 * the pond can paint is **ΔE 48.9** (a dim crimson body under a neighbour's
 * glow, to a protanope), the best of the family — which is what a neutral buys,
 * since white and near-black are the two ends of the one axis every vision
 * model agrees about.
 *
 * The entry that excused it read "no distinction to carry". It carries the only
 * distinction on the canvas that is about the *watcher* rather than about the
 * world: this is the one you asked about. That is why the filing was wrong, and
 * the general form is v1.70's — the descriptions on that list are guesses.
 */
export function selectionMark() {
  return {
    ring: "hsl(0, 0%, 100%)",
    rim: "hsl(232, 55%, 7%)",
    // Screen pixels, divided back out of the zoom by `render.js`. 1.5 is the
    // width the ring has always been drawn at; the rim goes down at
    // `width + 1.1` like every other two-tone mark here.
    width: 1.5,
    // The trail is the same mark saying a quieter thing, so it is the same pair
    // at two thirds the width rather than the same pair at a lower opacity —
    // v1.70's rule, in the release that gave this pair its number. Thinness is
    // a property of the mark; translucency is a property of the mark *and* the
    // background it happens to be over, which is how the old white got away
    // with vanishing.
    trailWidth: 1,
    // How far the trail thins toward its oldest end. A taper reads as direction
    // (this end is now) without spending any of the contrast that was the whole
    // finding above, and the far end is still a whole screen pixel of cased
    // stroke rather than a ghost.
    trailTaper: 0.45,
  };
}

/** The selection mark's two tones as RGB, for the audit. */
export function selectionMarkTones() {
  return { ring: hslToRgb(0, 0, 100), rim: hslToRgb(232, 55, 7) };
}

/** The white this mark used to be, kept so the test that failed it can run. */
export const SELECTION_OLD_INK = Object.freeze({ rgb: { r: 255, g: 255, b: 255 }, alpha: 0.8 });

/**
 * The name tag: the first **letters** this project has ever drawn on the water
 * (v1.126), so the first colour here that has to answer a different question.
 *
 * Every other mark in this file is measured with ΔE, because the question asked
 * of a mark is *can these two be told apart?*. Type is not that question. Small
 * letters are a spatial-frequency task carried almost entirely by luminance, so
 * the bar is WCAG's contrast ratio — 4.5 for body text — which is the
 * instrument `legibility.js` brought in for the stylesheets in v1.109 and which
 * has never had anything on the canvas to point at.
 *
 * **The plate is opaque, and that is the whole design.** Everything else this
 * renderer lays over the pond is translucent, which makes its contrast a
 * property of whatever it happens to be floating above — fine for a ring, fatal
 * for a word. An opaque plate makes the ratio a fact about two colours instead
 * of a hope about a background: ink on plate is **16.6:1** wherever the tag
 * lands, over the deep, over a biome glow, over a body. `test/nametag.test.js`
 * holds it to 4.5.
 *
 * The plate is `selectionMark`'s own rim, and deliberately: a tag and the ring
 * around the animal you picked are one vocabulary — *this page is pointing at
 * somebody* — and the rim is already the most measured near-black here. The
 * hue bar down its left edge is the animal's own lineage colour, so a tag is
 * tied to its body by the one channel this pond has always used for family.
 */
export function nameTag() {
  return {
    plate: "hsl(232, 55%, 7%)",
    ink: "hsl(210, 24%, 93%)",
    // The tag's own geometry, in screen pixels — it is drawn after the camera
    // has been taken back off, so a label is the same size at every zoom. A
    // name that grew with the magnification would be a mark about the lens
    // rather than about the animal.
    fontPx: 11,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontWeight: 600,
    padX: 5,
    height: 16,
    /** Width of the lineage-coloured bar on the plate's leading edge. */
    barW: 2,
    /** Gap between the animal's glow and the underside of its plate. */
    lift: 9,
  };
}

/**
 * The tag's type at a given size, as a CSS `font`.
 *
 * A size rather than a constant string because a name is a *page* mark drawn on
 * a *world* canvas, and on a narrow window those two are not the same pixel:
 * the pond is 900 canvas pixels wide and the stylesheet may be showing it at
 * 350, which would render an 11 px name at 4.3. `render.js` divides that scale
 * back out, the way `scalebar.js` has measured its ruler in the picture rather
 * than in the page since v1.82.
 *
 * @param {number} [px] type size in the canvas's own pixels
 */
export function nameTagFont(px = nameTag().fontPx) {
  const t = nameTag();
  return `${t.fontWeight} ${px}px ${t.fontFamily}`;
}

/** The name tag's two tones as RGB, for the audit and the contrast test. */
export function nameTagTones() {
  return { ink: hslToRgb(210, 24, 93), plate: hslToRgb(232, 55, 7) };
}

/**
 * The bands above and below the pond in a saved picture (v1.141).
 *
 * It borrows the name tag's two tones rather than inventing a pair, and the
 * reason is the same one that made the tag opaque: **a picture leaves this
 * page.** Everything else in this file is measured against a background this
 * project controls, and the moment a PNG lands in somebody's chat window it is
 * sitting on a ground chosen by an app I have never seen, at whatever size that
 * app decided. An opaque plate is the only way the contrast on it stays a fact
 * about two colours — 16.6:1 for the ink, the tag's own figure, because it is
 * the tag's own pair.
 *
 * `dim` is the third tone, for the numbers under the name and the address under
 * the sentence, and it is measured here rather than borrowed: **8.05:1** on the
 * plate. v1.140 learned this the expensive way on the postcard dialog, where
 * `--ink-faint` came out at 4.45 against a 4.5 bar because it had only ever
 * been measured on darker panels — *an ink is only quiet enough on the grounds
 * it was measured on*. This is a new ground, so it inherits nothing, and it is
 * deliberately well clear of the bar rather than just over it: a picture gets
 * resized by whoever reposts it, and a ratio with no headroom is one that
 * survives only at full size.
 */
export function pictureCard() {
  const tag = nameTag();
  return {
    plate: tag.plate,
    ink: tag.ink,
    dim: "hsl(210, 16%, 66%)",
    /** The hairline between a band and the water — the picture's only edge. */
    rule: "hsla(210, 24%, 93%, 0.16)",
    fontFamily: tag.fontFamily,
  };
}

/** The picture's three tones as RGB, for the audit and the contrast test. */
export function pictureCardTones() {
  return {
    ink: hslToRgb(210, 24, 93),
    dim: hslToRgb(210, 16, 66),
    plate: hslToRgb(232, 55, 7),
  };
}

/**
 * The same mark at minimap scale, where a creature is a single square of a few
 * pixels and there is no room for a rim drawn as a stroke.
 *
 * The colour it replaces was `rgba(255, 122, 82, 0.95)` against prey drawn in
 * their lineage hue — a warm orange dot among dots of every hue. Its worst case
 * was ΔE 0.01: to a tritanope, a predator and a prey creature of hue 26 were
 * the same colour to four decimal places. The minimap is the one view where a
 * whole-pond pattern is visible at a glance, and the pattern most worth seeing
 * there is where the hunters are.
 *
 * So it becomes the same two-tone badge, built out of squares: a dark one with a
 * bright one inside it. `size` is in minimap pixels.
 */
export function minimapPredatorMark() {
  return {
    rim: "rgba(10, 8, 12, 0.95)",
    core: "rgba(255, 236, 214, 0.98)",
    rimSize: 4,
    coreSize: 2,
  };
}

/** The minimap predator badge's two tones as RGB, for the audit. */
export function minimapPredatorTones() {
  return { rim: { r: 10, g: 8, b: 12 }, core: { r: 255, g: 236, b: 214 } };
}

/**
 * The little map's water: the background under every other ground it draws, and
 * therefore the first term in every contrast the minimap audit computes.
 *
 * It arrived in v1.61 with nothing wrong with the *value* and everything wrong
 * with the arrangement. `rgb(7, 12, 19)` existed in three places — the module
 * that paints it, `style.css` (which paints the same rectangle underneath, so
 * the corner does not flash a different colour before the first frame), and a
 * `MINIMAP_WATER` constant in `test/palette.test.js`. v1.26's rule is that a
 * colour a test cannot reach is a colour that will drift; the case it did not
 * anticipate is a test that reaches for a *copy*, which is worse, because the
 * audit then measures a world the module is no longer drawing and says so in
 * green. The stylesheet is checked against this function by
 * `test/colourliterals.test.js`.
 */
export function minimapWater() {
  return { r: 7, g: 12, b: 19 };
}

/**
 * Biomes on the little map: a flat wash rather than the pond's additive glow,
 * because at a fifth of the scale a gradient is one pixel of ramp.
 *
 * Here for the same reason as `minimapWater()` — the audit's ground list held a
 * hand-copy of it — and note that this is *not* the pond's biome colour. Two
 * views of one feature have been drawn in two different colours since v1.19
 * (`pondBiomeGlow()`, additive, there; this flat 0.5 here), and both are
 * defensible: the pond's is a glow over a large radius, the map's is a disc of
 * a few pixels that has to survive the terrain ramp under it. What was not
 * defensible was neither of them having a name.
 *
 * v1.93 measured the pair rather than reasoning about it, and the two views do
 * not say the same thing with the same voice: against its own water this wash
 * is worth **ΔE 13.65** at worst, the pond's glow **4.42** at its centre — one
 * feature drawn three times as loudly in the small picture as in the big one.
 * Neither is under the just-noticeable difference, which is the claim
 * `test/palette.test.js` holds; which of the two is the right loudness is not a
 * question a ΔE answers, and is what that release leaves behind.
 */
export function minimapBiomeWash() {
  return { r: 32, g: 82, b: 70, a: 0.5 };
}

/**
 * A prey creature on the little map: two pixels of its inherited lineage hue.
 *
 * The alpha is the point of this entry. The module has drawn the dot at 0.85
 * since v1.19 and the audit compared its neighbours against `hslToRgb(hue, 65,
 * 70)` — the same hue, fully opaque, a colour the minimap has never once put on
 * screen. Fifteen percent of a near-black water sounds like a rounding error
 * and is not: the two differ by up to **ΔE 19.8** (hue 54, where a bright
 * yellow has the most lightness to lose), which is most of the way to the bar
 * the audit judges by. And the direction was the bad one — the audit was
 * measuring against a *brighter* dot than the one drawn, so every mark that has
 * to stand out from a prey creature was being scored against the easier case.
 * Corrected, the corpse badge's worst case against a prey dot moves from 56.0
 * to 48.1; it still clears 25, which is the outcome to want and not the one to
 * assume.
 */
export function minimapPreyDot(hue) {
  return `hsla(${hue}, 65%, 70%, ${MINIMAP_PREY_ALPHA})`;
}

/** How hard a prey dot is drawn over the little map's water — see above. */
export const MINIMAP_PREY_ALPHA = 0.85;

/** A prey dot as it is actually composited, for the audit. */
export function minimapPreyDotRgb(hue) {
  return blendOver(minimapWater(), hslToRgb(hue, 65, 70), MINIMAP_PREY_ALPHA);
}

/**
 * The near-black the little map's two topmost marks are cased in — the same
 * `hsl(232, 55%, 7%)` the refuge ring and the vision overlay use, so the house
 * dark is one value rather than three copies of a taste.
 */
const MINIMAP_CASING_HSL = [232, 55, 7];
const MINIMAP_CASING = `hsl(${MINIMAP_CASING_HSL[0]}, ${MINIMAP_CASING_HSL[1]}%, ${MINIMAP_CASING_HSL[2]}%)`;

/**
 * The pale half of both — `rgb(226, 238, 255)`, the exact colour `minimap.js`
 * has stroked the viewport with since v1.17, now opaque and carrying a dark
 * tone instead of an alpha.
 */
const MINIMAP_FRAME_RGB = { r: 226, g: 238, b: 255 };
const MINIMAP_FRAME = rgbCss(MINIMAP_FRAME_RGB);

/**
 * The viewport rectangle: where the camera is pointed, drawn last and over
 * everything (v1.17, audited here in v1.73).
 *
 * This was the last item on v1.61's list of marks the audit had never
 * measured, and its entry there said what kept it off the list for twelve
 * releases — *"a near-white stroke over anything the little map can draw"*.
 * That sentence is a description, not a number, which is v1.70's finding one
 * item further down the same list: the category I wrote beside an entry is the
 * thing I skim. Near-white is a claim about the mark. What decides whether it
 * reads is the claim nobody wrote down — that this map's brightest pixel is
 * dark — and the map has been painting `rgb(222, 255, 255)` for two releases,
 * because v1.57 gave the pellet the pond's *additive* mote and four of them
 * land in one minimap pixel in a fed biome. That is the brightest pixel the map
 * has been observed to paint, and two of its three channels are clipped.
 *
 * Measured over the 5,088 colours this map can leave under its topmost mark,
 * the old `rgba(226, 238, 255, 0.85)` bottoms out at **ΔE 0.01** and is under
 * the bar on **28.9%** of them; the selection square below was worse still
 * (**0.00**, under the bar on 19.8% and under the *just-noticeable difference*
 * on 2.0%). Over the pixels the frame is really drawn on — twelve ponds, three
 * zooms, everything switched on — it fails on 0.61% and vanishes outright on
 * 0.04%, which is the honest size of the bug and also the reason it survived
 * for fifty-six releases: the failure is rare, total, and lands exactly where a
 * viewer is most likely to be looking, because a fed biome is where the pond is.
 *
 * The colour was never the bug. Opaque, `rgb(226, 238, 255)` paired with the
 * house casing clears the bar by **48.2** on every one of those backgrounds —
 * so the pale tone is the one v1.17 chose, and what the fix adds is the dark
 * under it. Alone that pale scores 0.02 and the casing alone scores 3.36:
 * neither half works and the pair does, which is v1.34's rule restated in the
 * one place it had never been applied.
 *
 * And one thing this surface says that the pond does not. Swept over all of
 * HSL, the best *single* opaque tone here scores **56.9** — v1.70 ran the same
 * search against the pond's backgrounds and got 17.6, which is why two tones
 * were a necessity there and are a *choice* here. The choice is made on
 * durability rather than on the number: this domain has grown in v1.24, v1.27,
 * v1.34, v1.48 and v1.57, and a value pinned by an enumeration that keeps
 * growing has to be re-searched every time the map learns to draw something.
 *
 * `width` is in minimap pixels and the casing is a *ring*, not a wider line:
 * `minimap.js` strokes the same rectangle inflated by one pixel first, so the
 * mark is two crisp hairlines rather than a two-and-a-bit-pixel smear. At a
 * fifth of the pond's scale a sub-pixel casing composites to a grey, which is
 * the tone the mark is trying not to be.
 */
export function minimapViewport() {
  return { line: MINIMAP_FRAME, casing: MINIMAP_CASING, width: 1 };
}

/**
 * How deep the little map's pellets are stacked for the audit.
 *
 * Not a taste. `minimap.js` draws the crop with `globalCompositeOperation =
 * "lighter"`, so two pellets landing in one of the map's 180×120 pixels add
 * rather than cover, and the ceiling is whatever the pond's densest patch
 * manages. Counted over twelve ponds at 6,000 ticks with every mechanic
 * switched on: of the occupied minimap pixels, 93.4% hold one pellet, 5.9%
 * two, 0.6% three and 0.1% **four** — so four is the measured maximum and not a
 * round number, and the brightest pixel this map has been observed to paint is
 * `rgb(222, 255, 255)`, a channel clipped at the top. The old default pond is
 * thinner (three deep at worst) and still reaches `rgb(250, 232, 210)`, which
 * is not the crop at all but a hunter's own badge.
 */
export const MINIMAP_PELLET_STACK = 4;

/** The viewport rectangle's two tones as RGB, for the audit. */
export function minimapViewportTones() {
  return { line: { ...MINIMAP_FRAME_RGB }, casing: hslToRgb(...MINIMAP_CASING_HSL) };
}

/**
 * The selection square: the inspected creature, so a click in the pond tells
 * you where in the pond.
 *
 * `rgba(255, 255, 255, 0.9)`, and v1.61's list filed it under *furniture* —
 * "the loudest thing available … carries no distinction beyond 'this one'".
 * Both halves of that were wrong in the same way. It is not the loudest thing
 * available on a map whose pellets stack additively past it; and a mark with no
 * distinction to carry still has to be *seen*, which is v1.25's whole lesson —
 * the predator core that started this audit also carried no distinction and was
 * invisible to everyone.
 *
 * It is also the *worse* of the two in practice, which is the finding to keep.
 * Drawn around every living creature in twelve ponds — 21,710 pixels — the old
 * white failed on **2.08%** of them against the frame's 0.61%, because a frame
 * is a line laid wherever the camera happens to be and this is drawn around a
 * creature, and creatures are where the food is. Its background is correlated
 * with its own placement. A first pass measured 36 placements, found nothing,
 * and would have shipped "the square was fine" — 36 coin flips at a rate under
 * one in fifty.
 *
 * So it gets the same treatment, in the idiom this surface already uses for
 * the hunter and the corpse: a dark square with a bright one inside it, except
 * that here both are strokes because the thing in the middle is the creature.
 * `size` is the bright square's side in minimap pixels and the casing is drawn
 * one pixel outside it.
 *
 * The pale tone is the frame's, not white, and that is the one deliberate
 * change of colour here: the two marks are drawn on the same map and the
 * viewport rectangle is drawn *over* this one, so where a selection sits on the
 * frame the only thing separating them is the casing between. The two old
 * near-whites were **ΔE 13.9** apart at best — a difference too small to tell
 * two marks apart by the bar this audit judges by, and large enough to look
 * like it was meant to. One pale tone and one dark says what was always true:
 * these two are told apart by their size, which is the channel v1.34 says
 * costs nothing and survives every vision model.
 */
export function minimapSelection() {
  return { line: MINIMAP_FRAME, casing: MINIMAP_CASING, size: 5, width: 1 };
}

/** The selection square's two tones as RGB, for the audit. */
export function minimapSelectionTones() {
  return { line: { ...MINIMAP_FRAME_RGB }, casing: hslToRgb(...MINIMAP_CASING_HSL) };
}

/**
 * The three ways out of this world, as colours.
 *
 * The mortality bar has said *starved / aged / hunted* in gold, grey and orange
 * since v1.21, and the v1.25 audit swept the canvas without ever looking at the
 * DOM. Measured, gold `#d2a13c` against orange `#ff7a4d` scores **ΔE 5.5** under
 * deuteranopia and **7.0** under tritanopia — the two causes that the whole
 * ledger exists to tell apart, indistinguishable to the readers most likely to
 * need the distinction. Starvation and predation are exactly the pair a crash
 * hinges on; grey age, the cause nobody has to identify in a hurry, was the only
 * one safely separated.
 *
 * So the mix is re-cut along the axes a dichromat keeps. Luminance does the
 * work — pale gold, mid slate, deep crimson, in that order, and the ordering is
 * itself a mnemonic — with blue↔yellow carrying what is left. Every pair now
 * clears `MIN_DELTA_E` under all four vision models, and each clears the panel
 * background it is drawn on by more than 40, because a strip of three colours
 * that all read as "dark" is a fourth failure mode.
 */
export function mortalityColours() {
  return {
    starvation: "hsl(46, 95%, 80%)",
    age: "hsl(212, 14%, 56%)",
    predation: "hsl(356, 80%, 44%)",
  };
}

/** The three cause colours as RGB, for the audit. */
export function mortalityTones() {
  return {
    starvation: hslToRgb(46, 95, 80),
    age: hslToRgb(212, 14, 56),
    predation: hslToRgb(356, 80, 44),
  };
}

/**
 * Where the pond's energy goes (v1.29): burned staying alive, leaked away, or
 * buried in the dead.
 *
 * This is the second three-segment bar in the same sidebar, six inches below the
 * mortality one, and that is the whole difficulty. The two bars are not
 * alternatives — nothing ever asks a reader to tell *buried energy* from *died
 * hunted* — so by the letter of the audit they need not be separated at all. But
 * two identically-shaped strips of three colours, stacked, will be compared
 * whether or not they are meant to be, and a reader who reads one bar's grammar
 * onto the other learns something false.
 *
 * So these three clear `MIN_DELTA_E` against each other, against the bar's own
 * track, *and* against all three of `mortalityColours()`, under normal vision
 * and all three dichromacies: twelve constraints, worst case 30.2. My first
 * hand-picked triad scored 13.4 against the cause colours and my second 17.5
 * against itself; the third came out of a search over the feasible set, which
 * is the honest admission that six mutually-legible colours is past the point
 * where picking by eye works.
 *
 * What the two bars *do* share, deliberately, is the luminance ladder: pale,
 * mid, dark, in the order the segments are drawn, with the terminal outcome
 * darkest in both. That is the one similarity worth having, because it is a
 * grammar rather than a claim — bright is the ordinary business of living,
 * dark is where things end.
 */
export function energyColours() {
  return {
    metabolism: "hsl(330, 40%, 90%)",
    waste: "hsl(240, 65%, 52%)",
    buried: "hsl(272, 65%, 22%)",
  };
}

/** The three energy-sink colours as RGB, for the audit. */
export function energyTones() {
  return {
    metabolism: hslToRgb(330, 40, 90),
    waste: hslToRgb(240, 65, 52),
    buried: hslToRgb(272, 65, 22),
  };
}

/**
 * The sidebar panel's own background — `--bg-panel` in `style.css`, and the
 * background every chart, strip and bar in that column is finally drawn on.
 * Here rather than inline so the audit and the stylesheet cannot drift.
 */
export function panelBackground() {
  return { r: 0x0c, g: 0x13, b: 0x1c };
}

/**
 * The mortality and energy bars sit on this: the panel background with the
 * track's own translucent white over it. Both bars are drawn as segments on a
 * strip, so an empty or near-empty segment shows the track, and a colour that
 * disappears into it is a colour that reads as "none of this".
 */
export function barTrack() {
  return blendOver(panelBackground(), { r: 255, g: 255, b: 255 }, 0.06);
}

/**
 * The population and food lines, as the chart has drawn them since v1.0. They
 * move here for the reason the mortality colours did in v1.25: a colour a test
 * cannot reach is a colour that will drift, and these two are the backdrop
 * every later mark in this column has to be legible against. The values are
 * unchanged — `test/palette.test.js` pins the composited results.
 */
export function chartLines() {
  return {
    pop: rgbaCss(CHART_SERIES.pop.rgb, CHART_SERIES.pop.alpha),
    food: rgbaCss(CHART_SERIES.food.rgb, CHART_SERIES.food.alpha),
  };
}

/** The two chart lines as they are actually composited over the panel. */
export function chartLineTones() {
  return {
    pop: blendOver(panelBackground(), CHART_SERIES.pop.rgb, CHART_SERIES.pop.alpha),
    food: blendOver(panelBackground(), CHART_SERIES.food.rgb, CHART_SERIES.food.alpha),
  };
}

/**
 * The two series in their parts, so that everything else drawn in this figure
 * can be *derived* from them rather than retyped. Values unchanged since v1.0.
 *
 * Note which axis separates them. Green against blue is a hue distinction and
 * tritanopia is the model that loses it: the two lines score **25.9** under it,
 * against a bar of 25, and they clear it only because their alphas differ by a
 * factor of two — the population line is nearly opaque and the food line is
 * half-strength, so what a tritanope actually tells apart is their *lightness*.
 * That is the whole reason `CHART_BAND_SCALE` is one number rather than two.
 */
const CHART_SERIES = Object.freeze({
  pop: Object.freeze({ rgb: Object.freeze({ r: 120, g: 190, b: 255 }), alpha: 0.95 }),
  food: Object.freeze({ rgb: Object.freeze({ r: 90, g: 200, b: 140 }), alpha: 0.5 }),
});

/**
 * The whole-run envelope bands (v1.22), which the audit did not reach until
 * v1.61 — and which had never been in it, because they were never colours this
 * file knew about. `chart.js` held `rgba(90, 200, 140, 0.16)` and
 * `rgba(120, 190, 255, 0.22)`: the two series' own RGB, typed a second time in
 * a second module at two alphas picked by eye. The v1.57 shape exactly.
 *
 * Both failed, and the second failure is the interesting one:
 *
 *   - against the panel, ΔE **12.9** (food) and **19.4** (pop) — under the 25 a
 *     mark must clear, and over the 10 that makes a thing furniture. v1.39
 *     already settled the rule for a band in this column: the power strip's
 *     alpha "is chosen so the band itself clears `MIN_DELTA_E` against the
 *     panel rather than by eye". One figure up, nothing was.
 *   - against **each other**, ΔE **9.3** under tritanopia. The bands were drawn
 *     at 0.16 and 0.22, which is very nearly the same alpha, and that threw
 *     away the one axis holding the two series apart (see `CHART_SERIES`). The
 *     envelope is the honest half of a thinned chart — the line is a sample and
 *     the band is the true extreme it was sampled from — so a reader
 *     attributing an envelope to a series by colour was attributing it to the
 *     wrong one.
 *
 * The fix is that a band is no longer a colour at all. It is its own line, at a
 * fixed fraction of that line's opacity, so it inherits the lightness gap by
 * construction and cannot drift from the series it belongs to. One number:
 *
 *   - at 0.70 the bands clear the panel at 27.5 and 53.2 and each other at
 *     36.6, and each stays quieter than its own line (a band is a range, the
 *     line drawn over it is the value).
 *   - below 0.65 the food band falls back under 25; above 0.80 the pair starts
 *     closing again as both approach their opaque colours, where the hue
 *     collision under tritanopia returns.
 */
export const CHART_BAND_SCALE = 0.7;

/**
 * A band's opacity, rounded exactly as `rgbaCss` will write it — so the number
 * measured and the number drawn are one number, not two that agree to four
 * decimal places. (v1.54's rule about two things behind one key, in miniature.)
 */
const bandAlpha = (s) => Number((s.alpha * CHART_BAND_SCALE).toFixed(4));

/** The envelope band for each series: its line's colour, at `CHART_BAND_SCALE`. */
export function chartBands() {
  return {
    pop: rgbaCss(CHART_SERIES.pop.rgb, bandAlpha(CHART_SERIES.pop)),
    food: rgbaCss(CHART_SERIES.food.rgb, bandAlpha(CHART_SERIES.food)),
  };
}

/** The two envelope bands as they are actually composited over the panel. */
export function chartBandTones() {
  return {
    pop: blendOver(panelBackground(), CHART_SERIES.pop.rgb, bandAlpha(CHART_SERIES.pop)),
    food: blendOver(panelBackground(), CHART_SERIES.food.rgb, bandAlpha(CHART_SERIES.food)),
  };
}

/**
 * The population chart's grid (v1.41) — the first colour here whose job is to
 * be *quiet*.
 *
 * Every other mark in this project is audited against `MIN_DELTA_E`, a floor,
 * because every other mark carries a distinction and a mark that vanishes has
 * lost its argument. A gridline carries none: it is a ruler behind the data,
 * and one loud enough to clear that bar would be a third line in a figure that
 * has two. So it is checked from both sides — see `MIN_RULE_DELTA_E` — and it
 * is a neutral, because a hue here would read as belonging to one of the two
 * series.
 *
 * The labels are not in this function. They are the population's numbers, so
 * they are drawn in the population line's own colour, which is the only way a
 * two-scale figure can say which of its scales the marks belong to — and it
 * spends no new colour, so the audit that already covers `chartLines()` covers
 * them too.
 */
export function axisRule() {
  return { line: "rgba(255, 255, 255, 0.07)" };
}

/** The grid as it is actually composited over the panel. */
export function axisRuleTone() {
  return blendOver(panelBackground(), { r: 255, g: 255, b: 255 }, 0.07);
}

/**
 * The window a *rule* has to land in, as opposed to a mark. Both ends come from
 * the calibration on `deltaE`: ~2.3 is the just-noticeable difference, so a
 * rule at twice that is present without being looked for, and ~10 is "a
 * different colour at a glance", which is precisely what a gridline must not
 * be. The pair is the point — a one-sided threshold cannot express "visible and
 * subordinate", and this is the first thing here that needs to be both.
 */
export const MIN_RULE_DELTA_E = 5;
export const MAX_RULE_DELTA_E = 10;

/**
 * Winter, on the population chart (v1.74) — the second piece of furniture in
 * this figure, and the first that is an *area* rather than a line.
 *
 * `seasonalFactor` has swung the food spawn rate by ±30% on a 2,600-tick year
 * since v1.3, and the figure that plots the standing crop has never said which
 * half of the year it is drawing. The band shades the half where that factor is
 * below 1. It is furniture by the same argument as the grid — it carries no
 * value, it says where you are — so it is held to the same two-sided window,
 * `MIN_RULE_DELTA_E`..`MAX_RULE_DELTA_E`, under every vision model.
 *
 * Three measurements decided the number, and only one of them was the one I
 * went looking for.
 *
 *   - **The direction.** Darker, because brightness reads as magnitude and this
 *     is the lean half of the year; a paler winter would say "more".
 *   - **The ceiling, first (v1.62).** The whole darkening direction is worth
 *     ΔE **9.01**: that is *pure black* against this panel under normal vision,
 *     so the top of the rule window is not reachable from below at all. The
 *     feasible alphas are **0.42–0.47** — five hundredths of a unit interval —
 *     because tritanopia scores a darkening of this navy roughly *twice* what
 *     normal vision does (9.56 against 5.32 at the value shipped), while the
 *     same sweep in white agrees across all four models to within 0.1 ΔE and
 *     has four times the room. Removing light from `#0c131c` mostly removes
 *     *blue*, which is a chromatic move; adding white is not. The band is dark
 *     anyway and the window is a measured constraint rather than a taste, which
 *     is what pins it against a future tidy-up.
 *   - **The coverage (v1.62 again).** A gridline is 1% of the figure and this is
 *     half of it, and a reader sees an area as its own loudness rather than as a
 *     line's. So the value sits at the *bottom* of the window (5.32) rather than
 *     in the middle, where the same ΔE spread over half a canvas would stop
 *     being furniture.
 *
 * What the audit does not get to assume is that darkening is free. Every mark
 * in this column is lighter than the panel, so "a darker background can only
 * help them" is a mechanism arriving before the search (v1.48), and it is
 * false: over the band the grid falls 8.00 → 7.21, the food line 38.15 → 38.07
 * and the food envelope 27.46 → 26.97. All still clear their own bars — the
 * tightest is the food envelope at 26.97 against 25 — and `test/palette.test.js`
 * re-runs every one of them over the band, because a new background is a new
 * audit of everything drawn on it (v1.34).
 */
export function seasonBand() {
  return `rgba(0, 0, 0, ${SEASON_BAND_ALPHA})`;
}

/** How much of the panel the winter band takes away — see `seasonBand()`. */
export const SEASON_BAND_ALPHA = 0.45;

/** The winter band as it is actually composited over the panel. */
export function seasonBandTone() {
  return blendOver(panelBackground(), { r: 0, g: 0, b: 0 }, SEASON_BAND_ALPHA);
}

/**
 * The power strip (v1.39): what the pond mints per tick, and what it spends.
 *
 * Two lines that must be told apart, in a column that already spends eight
 * colours — the two chart lines above, the three causes in the death strip
 * between, the three sinks in the energy bar. A ninth and a tenth hue would be
 * a search over a feasible set that is nearly empty, and there is no need for
 * one: this is the v1.34 lesson arriving somewhere it costs nothing. **Both
 * lines are the same colour and the spend line is dashed.** Continuity is not a
 * channel any vision model touches, and a distinction that never depended on
 * hue cannot be lost to one.
 *
 * So the audit has a single subject, and it is the one that actually matters
 * for a 1.5-pixel line: does this read against everything it shares a figure
 * with? The colour came out of a sweep of the hue/saturation/lightness grid
 * scored against the panel, both chart lines composited, all three cause
 * colours and all three sink colours, under normal vision and every
 * dichromacy — worst case **40.0**, against a bar of 25.
 *
 * `band` is the fill between the two lines, which is the strip's real subject:
 * where it shows, the pond's standing stock is moving. An area is a field, not
 * a mark, so opacity is the right carrier here (the same argument as
 * `detritusTint`) — and the alpha is chosen so the band itself clears
 * `MIN_DELTA_E` against the panel rather than by eye.
 */
export function powerLine() {
  return { line: "hsl(70, 92%, 58%)", band: "hsla(70, 92%, 58%, 0.26)", dash: [3, 2.5] };
}

/** The power strip's one tone as RGB, for the audit. */
export function powerLineTones() {
  return { line: hslToRgb(70, 92, 58) };
}

/**
 * The body-size figure (v1.104), which spends no new colour at all.
 *
 * Three inks, every one of them borrowed from the surface whose meaning it
 * already carries: the population line's blue for the bars, because a histogram
 * of bodies is the population the chart draws, cut a different way; the death
 * strip's *hunted* crimson for the carnivore half, because that colour has said
 * predation on this page since v1.25; and the pond's own refuge ring for the
 * line at `bodyRadiusMax / preySizeRatio`, so the threshold's two renderings —
 * a circle around a body, a rule on an axis — are the same colour rather than
 * two colours a reader has to learn separately.
 *
 * Reuse is not a free pass, and this is the case that shows why. Each of the
 * three has been measured against this panel — the blue in v1.25, the crimson
 * in v1.25, the ring in v1.69 — and none of the three *pairs* had ever been
 * measured, because until this figure existed no two of them were drawn in one
 * picture: two live on the chart's stack and one lives on the pond. A colour
 * inherits its background audit and not its neighbours'. All three pairs clear
 * `MIN_DELTA_E` under all four vision models — worst case **39.8**, blue
 * against the ring — and all three clear the panel by more than 40.
 *
 * The ring is quoted here as its opaque tone rather than its two-tone pond
 * treatment. On the pond it is drawn with a near-black rim because it straddles
 * bodies of arbitrary hue (v1.69); here its background is one colour I choose,
 * which is v1.79's distinction between a mark on the canvas and a mark on the
 * panel, and a rim would be a second line 1 px from the first in a figure 46 px
 * tall.
 */
export function sizePlotTones() {
  return {
    grazer: chartLineTones().pop,
    carnivore: mortalityTones().predation,
    refuge: refugeRingTones().ring,
  };
}

/** The opacity of the band between the lines — see `powerLine()`. */
export const POWER_BAND_ALPHA = 0.26;

/**
 * The pond's biomes: an additive glow at each fertile centre (v1.93).
 *
 * This lived in `render.js` as three hand-typed gradient stops from v1.3 to
 * v1.93, filed under *furniture* in `test/colourliterals.test.js` — "a stop is a
 * shape in a ramp rather than a colour anything is told apart by" — which is the
 * heading v1.84's lesson says nobody reads twice. Unlike the seven entries
 * struck off before it, what it was hiding is not a contrast. Measured, the
 * glow's centre reads
 * **ΔE 4.42–13.17** against the grounds it can be drawn on: over the
 * just-noticeable difference everywhere, under `MIN_DELTA_E` everywhere, which
 * is the right register for a field (this is not a mark to be told apart from
 * another mark; it is a hint about the water) and is not the finding. The
 * finding is the *shape*.
 *
 * **The ramp was not the rule.** `FertilityField.at()` is a Gaussian on the
 * torus — fertility above the floor falls as `exp(−r²/2σ²)` with σ =
 * `patchRadius` — and the picture drew two straight segments (0.16 → 0.06 over
 * the first 60% of a 1.8σ disc, then 0.06 → 0 over the rest). Those are two
 * different curves, and the difference is visible: composited and swept over
 * the sixty-six grounds this pond can draw and all four vision models, the old
 * ramp crossed under the just-noticeable difference at a median of **0.99σ**
 * (0.67–1.46), so the glow a watcher could actually see stopped where the ground
 * was still at 61.3% of its peak excess fertility. Measured against a real crop
 * — 5,256 pellets over three seeds — the picture accounted for **38.4%** of the
 * standing crop and drew nothing legible about the rest.
 *
 * So the ramp is the rule now: one ink, and the alpha carries `biomeGlowFalloff`,
 * which *is* the field's own bump. That moves the visible edge to a median of
 * **1.38σ** and the crop it accounts for to **60.9%**, without changing the ink,
 * the peak or anything the audit had already measured — every "+biome"
 * background in `test/palette.test.js` is the same colour it was, because that
 * background is this glow's centre.
 *
 * @returns {{rgb:{r:number,g:number,b:number}, alpha:number, span:number}}
 */
export function pondBiomeGlow() {
  return { rgb: { r: 30, g: 78, b: 66 }, alpha: BIOME_GLOW_PEAK, span: BIOME_GLOW_SPAN };
}

/**
 * The glow's opacity at a biome centre. Unchanged since v1.3 and deliberately
 * so: it is what every mark drawn over fertile water has been audited against,
 * and this release changed the shape of the ramp rather than its loudness.
 */
export const BIOME_GLOW_PEAK = 0.16;

/**
 * How far the glow is drawn, in patch radii (σ) — and it is the first radius
 * here chosen by measurement rather than by eye.
 *
 * A gradient ends at its radius, so wherever the ramp is truncated there is a
 * hard step from whatever alpha it had reached to nothing. The old 1.8σ cut at
 * an alpha of 0.032, which is **ΔE 2.97** on the ground where it shows most —
 * over the just-noticeable difference, so the picture drew a faint ring the rule
 * has no edge at. 2.0σ cuts at 0.022, worst case **2.05**, under it everywhere;
 * 1.9σ is still 2.48. So the glow now ends where a watcher stops being able to
 * see it, and `test/palette.test.js` holds that as a squeeze rather than a
 * number.
 */
export const BIOME_GLOW_SPAN = 2;

/**
 * How many stops the Gaussian is sampled at. A canvas gradient interpolates
 * linearly between stops, so this is the resolution of the curve: nine stops put
 * the worst chord **0.00099** of alpha off the true falloff, which composites to
 * ΔE 0.08 — two orders of magnitude under the just-noticeable difference, and
 * the reason the ramp can be a rule rather than an approximation of one.
 */
export const BIOME_GLOW_STOPS = 9;

/**
 * The field's own falloff, as a fraction of peak, at `t` across the drawn
 * radius. This is `exp(−r²/2σ²)` with `r = t · span · σ` — the same curve
 * `FertilityField.at()` puts the excess fertility on, and `test/palette.test.js`
 * checks it against that method rather than against a copy of this expression.
 *
 * @param {number} t 0 at the centre, 1 at the drawn edge
 */
export function biomeGlowFalloff(t) {
  const r = BIOME_GLOW_SPAN * Math.max(0, Math.min(1, t));
  return Math.exp(-(r * r) / 2);
}

/**
 * The glow as a canvas gradient: one ink at `BIOME_GLOW_STOPS` opacities.
 *
 * The ink is constant along the ramp, which the old two-segment version was not
 * — it drifted from `rgb(30, 78, 66)` to `rgb(30, 70, 62)` on the way out. A
 * gradient with one colour and a moving alpha is the same picture under either
 * reading of how a canvas interpolates a stop (premultiplied or not), so this
 * also removes a difference between what this file measures and what a browser
 * paints that nobody had ever noticed was there to have.
 *
 * @returns {Array<{offset:number, alpha:number, css:string}>}
 */
export function biomeGlowStops() {
  const glow = pondBiomeGlow();
  const out = [];
  for (let i = 0; i < BIOME_GLOW_STOPS; i++) {
    const offset = i / (BIOME_GLOW_STOPS - 1);
    const alpha = glow.alpha * biomeGlowFalloff(offset);
    out.push({ offset, alpha, css: rgbaCss(glow.rgb, alpha) });
  }
  return out;
}

/**
 * Enriched ground — the map of where this pond's dead went (v1.27).
 *
 * This is the fourth thing drawn under the water, and the first that *changes*,
 * so it has to be told apart from the three static ones: the seasonal veil the
 * scene is cleared with, the cool slate of the terrain ramp, and — the hard one —
 * the biomes' green glow, because both of those are claims about fertility and a
 * watcher who confuses them learns the opposite of the truth about where food
 * comes from.
 *
 * So it goes warm, and it goes bright: an ochre with a good deal more luminance
 * than anything else down there. Luminance is the channel no colour vision
 * deficiency touches, and warm-against-cool survives every dichromacy the a*
 * axis does not. Measured composited — over the veil at both season extremes,
 * over the biome glow, and over the whole terrain ramp, which is the set of
 * backgrounds it can actually appear on — the worst pair clears `MIN_DELTA_E`;
 * `test/palette.test.js` holds it there.
 *
 * Richness is carried in opacity, which the v1.25 note forbids for a *mark* and
 * which is right for a *field*: this is a quantity spread over an area, the way
 * terrain's roughness is, and it has no fixed shape whose contrast could be
 * spent. The square root is there because the interesting thing about a patch of
 * enriched ground is usually that it exists.
 *
 * @param {number} richness 0..1, from `DetritusField`
 * @returns {{r:number, g:number, b:number, a:number}}
 */
export function detritusTint(richness) {
  const t = Math.max(0, Math.min(1, richness));
  return { r: 226, g: 156, b: 76, a: DETRITUS_MAX_ALPHA * Math.sqrt(t) };
}

/**
 * Opacity of fully enriched ground. Chosen from the measurement rather than by
 * eye: 0.50 clears the bar at full richness and misses it at half (24.7), and
 * 0.54 is the first step that puts *half*-enriched ground over the line too —
 * which is the claim worth holding, since the ground spends most of its time
 * part-way up.
 */
export const DETRITUS_MAX_ALPHA = 0.54;

/**
 * A food mote. It has lived as a literal in `render.js` since v1.0 and as a
 * copy of that literal in the test file since v1.34, which is the arrangement
 * v1.26 wrote a rule against: a colour a test cannot reach is a colour that
 * will drift. It is here now because the corpse audit below needs it — a mote
 * is drawn *over* a corpse, so it is part of that mark's domain, not merely
 * next to it.
 *
 * Additive, so dense patches glow. Unchanged in value.
 */
export function foodMote() {
  return { r: 90, g: 220, b: 150, a: 0.55 };
}

/**
 * A corpse (v1.55) — the last mark in the pond the colour audit had never
 * measured, and the one whose background it makes itself.
 *
 * From v1.8 to v1.54 this was `rgba(150, 55, 48, a)` with
 * `a = min(0.7, 0.15 + meat/60)`: one translucent maroon tone, fading as the
 * body rots. Two things are wrong with that and they compound.
 *
 * The first is the background. Every audit since v1.25 has measured a mark
 * against the water, and a corpse is not on the water — it is on **enriched
 * ground**, because detritus is minted where things die and a corpse rots into
 * the soil directly beneath it (`world.js#step`, stage 5). Soil is a warm
 * ochre and the splotch was a warm maroon, so the mark's own background was
 * chosen by the mark: over enriched ground it scored **ΔE 0.0 under
 * tritanopia, 0.2 under deuteranopia and 0.1 under protanopia at every opacity
 * it can take, including the maximum**, and 4.9–21.7 under normal vision,
 * against a bar of 25. Not faint — the same colour. Over plain water it was
 * only better in places: 2.1 under protanopia at the low end of the ramp.
 *
 * The second is the ramp itself. v1.34's rule is that degree must never be
 * carried by fading a mark, because fading spends exactly the contrast the mark
 * exists for, and here the faint end is *most* of the mark's life: over twelve
 * 12,000-tick scavenging worlds, 27.4% of all corpse-frames sit below opacity
 * 0.35 and 50.2% below 0.5. Half of every corpse ever drawn was in the dimmer
 * half of a ramp that had no contrast to spend.
 *
 * So it becomes what v1.25 built for the predator and v1.34 for the epidemic:
 * two opaque tones, a very dark one and a very light one, because no background
 * is close to both — and degree moves into **size**, which costs nothing and
 * survives every vision model. A pale bone ring around a near-black core, drawn
 * as two filled discs rather than a fill and a stroke so that neither tone is
 * an antialiased blend of the other. It is deliberately the *inverse* of the
 * predator mark's pale disc inside a dark rim: the two are the only pale marks
 * in the pond and they are never on the same layer, but inverting the geometry
 * means a glance can tell them apart without reading the colours (they sit ΔE
 * 7.7 from each other, which is not a distinction anything should rest on).
 *
 * Worst case over 480 grounds — both seasons, the whole terrain ramp with and
 * without contours, the biome glow, enriched ground at four richnesses, the
 * contagious zone, **and every one of those with a food mote already on it** —
 * under all four vision models: **ΔE 42.1**. The binding constraint was not any
 * of those; it was the mote drawn *on* the corpse, which clamps against a pale
 * tone the way v1.43's rings clamped against a bright body. That check
 * (`ΔE 25.6`, a hair over the bar) is what picks the ring's lightness, and it is
 * the reason the ring is bone rather than the brighter cream the ground sweep
 * alone would have chosen.
 *
 * @param {number} meat energy still in the corpse
 * @returns {{core:string, ring:string, radius:number, ringWidth:number}}
 *   `radius` as a multiple of a food mote's radius; `ringWidth` as a fraction
 *   of that radius.
 */
export function corpseMark(meat) {
  const t = Math.max(0, Math.min(1, meat / CORPSE_FULL_MEAT));
  return {
    core: "hsl(350, 55%, 7%)",
    ring: "hsl(50, 40%, 76%)",
    // A flat 1.4 (`foodRadius + 1.2`, at the default radius of 3) until v1.55.
    // The old opacity ramp is not merely moved here, it is the same curve: the
    // channel changed and the arithmetic did not.
    radius: 1.15 + 0.72 * t,
    ringWidth: 0.32,
  };
}

/**
 * The meat at which a corpse's mark stops growing — inherited from the opacity
 * ramp this replaces, where it was the `60` in `0.15 + meat/60` under a cap of
 * 0.7. It saturates: a fresh corpse holds `corpseEnergyBase + radius ×
 * corpseEnergyPerRadius`, which is over the cap for any creature of average
 * size, so the mark is at full size for the first stretch of every rot and the
 * size channel says "fresh" rather than "this much meat". That was true of the
 * opacity too (10–43% of corpse-frames were at the cap, by seed), and it is
 * worth stating rather than quietly fixing: making the mark proportional to a
 * corpse's *own* starting meat would mean storing that on the corpse, and
 * `src/food.js`'s `Corpse` is simulation state the determinism sweep walks.
 */
export const CORPSE_FULL_MEAT = 60;

/** The corpse mark's two tones as RGB, for the audit. */
export function corpseMarkTones() {
  return { core: hslToRgb(350, 55, 7), ring: hslToRgb(50, 40, 76) };
}

/**
 * The same mark at minimap scale (v1.57), where a corpse is a few pixels across
 * and there is no room for a ring drawn around a disc.
 *
 * The colour is not a new one: it is `corpseMarkTones()`, built from that
 * function rather than copied out of it, because the little map disagreeing with
 * the big one about what a corpse looks like is the failure `terrainBandFill`
 * was written to avoid. Only the *geometry* changes — two squares, the way the
 * predator badge is two squares — and it changes to the inverse of the
 * predator's: a pale outer square with a dark one inside it, where the hunter is
 * a dark square with a pale one inside it. That inversion is doing real work,
 * because the two pale tones sit **ΔE 13.6–21.9** apart and the bar is 25: at
 * this size the colours cannot tell a corpse from a hunter, and the arrangement
 * can. It is the same division of labour the pond makes between these two marks,
 * one view down.
 *
 * What the mark does *not* carry is how fresh the corpse is. The pond ramps its
 * radius from 1.15 to 1.87 mote-radii as the meat rots; three minimap pixels have
 * no such range to spend, and a mark that shrank below its two tones would be
 * spending exactly the contrast v1.34 forbids spending. The whole-pond view
 * answers *how many, and where* — which is the question a die-off raises — and
 * leaves *how fresh* to the pond, which is the view that can draw it.
 */
export function minimapCorpseMark() {
  const t = corpseMarkTones();
  return { rim: rgbCss(t.ring), core: rgbCss(t.core), rimSize: 3, coreSize: 1.5 };
}

/**
 * Rock (v1.48, barriers) — the one thing down there that is not water.
 *
 * Every other layer under the pond is translucent, because every other layer is
 * a *field*: roughness, fertility, nutrient, hazard, all of them quantities
 * spread over ground you can still swim through. Rock is the first that is not a
 * quantity at all but a fact — you cannot be here — so it is the first that is
 * opaque, and opacity is what the claim needs: a translucent wall is a wall you
 * can see the water through, which is precisely the wrong sentence.
 *
 * The hue is **not** forced by the constraint, and it is worth saying so plainly
 * rather than dressing a taste up as a search. I began writing the paragraph
 * where warm stone turns out to be impossible next to enriched ground — the
 * `hazardTint` story, which really was impossible — and the sweep in
 * `test/palette.test.js` refused it: a pale sandstone at `hsl(20, 10%, 74%)`
 * scores 35, and even a properly saturated one clears the bar if it is light
 * enough. That is v1.29's rule arriving on schedule: an infeasibility claim is
 * the most expensive thing I can write down, and this one was false.
 *
 * So the reason is a judgement, stated as one. The two other things down there
 * with any warmth in them — the biome glow and enriched ground — are both claims
 * about *fertility*, and a warm slab would be read as a third. Cool and nearly
 * neutral says "not water, not food, not soil" with nothing left over.
 *
 * What is measured: `hsl(210, 8%, 52%)` scores **29.7** against the worst of
 * every ground either view can draw — both seasons, the biome glow, the whole
 * terrain ramp with and without contours, full enriched ground, five overlapping
 * cases of hazard — under all four vision models. Four steps darker (48%) is
 * 25.5, one step under that misses the bar outright, and the test pins the
 * failure as well as the pass. Deliberately no further over the line than that:
 * this is a seventh of the pond's area, and a slab that out-shouts the creatures
 * would be the v1.23 terrain complaint with the volume turned up.
 *
 * What the audit does *not* cover, said out loud because v1.43 was three
 * versions ago: the creature bodies. They span the whole hue wheel, so no colour
 * is far from all of them, and no colour could be — but a body is a small moving
 * mark with a glow and rock is a static slab, and nothing is ever drawn *on*
 * rock, because nothing can be there.
 */
export function barrierRock() {
  return { fill: "hsl(210, 8%, 52%)", edge: "hsl(210, 12%, 33%)" };
}

/** Rock's two tones as RGB, for the audit. */
export function barrierRockTones() {
  return { fill: hslToRgb(210, 8, 52), edge: hslToRgb(210, 12, 33) };
}

/**
 * The contagious zone (v1.34) — the water within `infectionRadius` of somebody
 * infected, which is the only question a watcher of an epidemic actually has.
 *
 * This is a *field*, like enriched ground, so opacity may carry degree: one disc
 * per case, and where cases overlap the layers compound. What it may not be is
 * any of the colours already down there, and that constraint turned out to
 * decide the hue by itself. A search over the hue wheel against every ground
 * this pond can produce — both seasons, the whole terrain ramp with and without
 * contours, the biome glow, enriched ground at half and full, in the pond and in
 * the minimap — asked for three things at once: visible against all of them,
 * unmistakable for either fertility claim (biome, soil), and *still leaving the
 * food motes legible on top of it*, since a mote is a mark drawn over this
 * field. Every colour that clears all three is blue: hue 210–250, nothing else.
 *
 * Which means the zone cannot be sulphur — the colour of the halo on the sick
 * creature it belongs to, and my first choice for exactly that reason. Sulphur
 * clears the first two constraints and fails the third, because it is next door
 * to the green of the food. A mark and the field it belongs to could not share a
 * hue here, and the thing standing between them was the crop.
 */
export function hazardTint() {
  const rgb = hslToRgb(220, 100, 55);
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: HAZARD_SOURCE_ALPHA };
}

/**
 * Opacity of one case's disc. The compounding is the point: n overlapping discs
 * come out at 1 − (1 − a)^n, the same arithmetic as the risk of catching it from
 * n independent neighbours, so the field's opacity is a monotone function of the
 * real per-tick risk (`contagion.js` has the algebra).
 *
 * Chosen from the measurement, like `DETRITUS_MAX_ALPHA`: 0.10 puts the
 * `HAZARD_AUDIT_SOURCES` level at 0.41 opaque, whose worst case over every
 * ground either view can draw is ΔE 35.0, and which still leaves a food mote on
 * top of it at 34.8. Sulphur has no opacity that clears both at once — faint
 * enough for the crop it vanishes into the ground, strong enough to see it
 * swallows the crop — and `test/palette.test.js` sweeps the opacity to say so.
 */
export const HAZARD_SOURCE_ALPHA = 0.1;

/**
 * The overlap the field is audited at: five cases in range, a 20.6% chance per
 * tick of catching it at the default `infectionChance`. A single case is drawn
 * fainter than the bar on purpose — one disc is a hint that something is nearby,
 * five is water you should not be standing in, and the audit is about the level
 * that means something rather than the faintest one drawable.
 */
export const HAZARD_AUDIT_SOURCES = 5;

/**
 * The mark on a sick creature, and the mark on one that has survived — the two
 * halves of the epidemiological state, and until v1.34 the two least legible
 * things in this project.
 *
 * Both were single translucent tones drawn over a creature's own additive glow,
 * which is the v1.25 predator-core failure exactly: the glow can be any hue at
 * any lightness, and two or three overlapping bodies push it brighter still, so
 * a pale mark over it is measured against a background it does not control.
 * Composited over the range the glow can really take, the immune ring's worst
 * case is **ΔE 0.2** and the sick halo's is **11.0** — the ring is invisible and
 * the halo is under the "different colour at a glance" line, both of them for
 * everyone, worse for a dichromat.
 *
 * So both go opaque and two-tone, the subtitle trick: a mark carrying a very
 * light *and* a very dark tone cannot be swallowed, because no background is
 * close to both. Worst case over every background either can appear on,
 * including the new hazard field: 45.5 for the halo, 41.8 for the ring.
 *
 * What colour cannot do here is tell the two of them *apart*. An additive halo
 * can reach almost any bright colour, and under tritanopia bright sulphur and
 * pale blue are the same thing — measured, ΔE 0.0, against 37.2 for the ring's
 * dark half, which nothing additive can imitate because adding light can only
 * brighten. Both marks need a dark tone and every dark tone resembles every
 * other, so what is left over for the distinction is carried
 * by geometry, which no vision model touches: **the halo is continuous and the
 * immune ring is dashed.** That is why `immuneRing().dash` exists, and a test
 * asserts it is non-empty for this reason.
 */
export function sickHalo() {
  return { ring: "hsl(68, 85%, 62%)", rim: "hsl(66, 60%, 7%)", width: 1.4 };
}

/** The sick halo's two tones as RGB, for the audit. */
export function sickHaloTones() {
  return { ring: hslToRgb(68, 85, 62), rim: hslToRgb(66, 60, 7) };
}

/** Acquired immunity: the same two-tone treatment, dashed so it reads as itself. */
export function immuneRing() {
  return { ring: "hsl(205, 85%, 88%)", rim: "hsl(210, 40%, 6%)", width: 0.9, dash: [2, 2.4] };
}

/** The immune ring's two tones as RGB, for the audit. */
export function immuneRingTones() {
  return { ring: hslToRgb(205, 85, 88), rim: hslToRgb(210, 40, 6) };
}

/**
 * The quietest call this pond draws. Below it a creature is treated as silent,
 * so a pond where nothing is saying anything looks like one — and it is the
 * level the signal ring is audited at, the way `HAZARD_AUDIT_SOURCES` is the
 * level the contagious zone is audited at. The faintest drawable state is the
 * one an audit has to survive, because the old mark's opacity started there.
 */
export const SIGNAL_QUIET = 0.2;

/**
 * A creature calling — the mark the v1.34 sweep did not reach.
 *
 * v1.25 found the predator core invisible, v1.34 found the immune ring
 * invisible, and each time I wrote the same rule down: *a translucent mark over
 * something the simulation colours is not a colour, it is a lottery.* Both
 * sweeps then measured the marks they had come for and stopped. The signal
 * rings (v1.20) and the attack flash (v1.8) were still `globalCompositeOperation
 * = "lighter"` over the same body, three lines below the comment explaining why
 * the halo had stopped doing that.
 *
 * Measured, the rings are fine over open water and fail everywhere a body is:
 * on the opaque chevron the worst case is **ΔE 8.1**, and where a neighbour's
 * glow lands on that chevron the channel is already clamped and adding light to
 * it does *nothing* — **ΔE 0.0**, the mark and its background bit-identical.
 * The quietest audible call scores **15.1 even over open water**, below the bar
 * on 89% of the backgrounds there, because loudness was carried in opacity: the
 * mark spent exactly the contrast it exists for to say how loud it was.
 *
 * So the same two fixes as every time before. Opaque and two-tone, a bright
 * ring over a dark hairline, which no additive glow can imitate because adding
 * light can only brighten. And loudness moves to **geometry**: the inner ring
 * is fixed and the outer one steps outward with the call, so a shout is a wider
 * pair of rings rather than a brighter one.
 *
 * Colour does carry the *sign* here, unlike the sick/immune pair — two opaque
 * tones I choose are separated by ΔE 63.4 at worst across every vision model,
 * where two additive ones over a shared background collided at 0.0. What colour
 * cannot do is tell a call from an epidemiological mark: the cool ring and the
 * immune ring meet at 9.6, and a creature can wear both at once. Geometry does
 * that too, as it did in v1.34 — **a call is two concentric rings, and every
 * other mark on a creature is one**, drawn further out than either of them.
 *
 * @param {number} signal the brain's third motor output, −1..1
 */
export function signalRing(signal) {
  const loud = Math.min(1, Math.abs(signal));
  return {
    ring: signal > 0 ? "hsl(30, 100%, 72%)" : "hsl(200, 90%, 78%)",
    rim: "hsl(210, 40%, 6%)",
    width: 1.1,
    // Offsets from the body radius. The inner ring clears the sick halo
    // (r + 3 + throb) and the immune ring (r + 2.4) so the three never sit on
    // top of each other; the outer one is the volume knob.
    inner: 4.5,
    outer: 7 + 4 * loud,
  };
}

/** The signal ring's tones as RGB, for the audit — both signs and the shared rim. */
export function signalRingTones() {
  return {
    positive: hslToRgb(30, 100, 72),
    negative: hslToRgb(200, 90, 78),
    rim: hslToRgb(210, 40, 6),
  };
}

/**
 * A bite landing — the shortest-lived mark in this world and, until now, the
 * least visible one, which is a poor combination for the event the whole
 * predator/prey story is made of.
 *
 * It was `rgba(255, 120, 90, 0.6)` drawn additively at the nose, which is to
 * say drawn over the *body*: not the water, not the glow, but the opaque chevron
 * whose lightness rises with energy. Worst case there, **ΔE 5.4**, below the bar
 * on half of the bodies this pond can produce; with a neighbour's glow over it,
 * **0.0**. A predator that has just fed is exactly the creature whose body is
 * brightest, so — the v1.25 finding again, one mark over — the flash was
 * faintest at the moment it had most to report.
 *
 * Opaque, two-tone, unchanged in size and duration. It stays warm, and so does
 * the predator's eye it appears beside; the two meet at ΔE 15.1, and what tells
 * them apart is not colour but that one is at the nose for four ticks and the
 * other is at the centre for a lifetime.
 */
export function attackFlash() {
  return { disc: "hsl(14, 100%, 70%)", rim: "hsl(350, 70%, 10%)" };
}

/** The attack flash's two tones as RGB, for the audit. */
export function attackFlashTones() {
  return { disc: hslToRgb(14, 100, 70), rim: hslToRgb(350, 70, 10) };
}

/**
 * A lineage's colour, in the two places the Tree of Life draws it: the Muller
 * plot's band and the legend chip's dot. They have disagreed since v1.2 — the
 * band was `hsla(hue, 68%, 55%, 0.9)` in `mullerplot.js` and the dot
 * `hsl(hue, 70%, 55%)` inline in `main.js` — which is the v1.26 complaint
 * exactly: a colour a test cannot reach is a colour that will drift, and these
 * two are a *key* and the thing it is a key to.
 *
 * What the audit found when it finally reached them (v1.46) is not about the
 * tones at all. A species' hue is its founder's, and hue is inherited, so a
 * daughter species is very nearly its parent's colour: over twelve seeds every
 * single one draws at least two bands that collide under **normal** vision, and
 * seed 88 draws six of nineteen at hue 106 — ΔE 0.0, the same colour. The
 * default pond draws four of eleven at hue 335. The hue is honest about
 * *ancestry* and was being read as a name. See `bandTextures()`.
 *
 * @param {number} hue 0..360
 * @param {"band"|"dim"|"lit"|"dot"} [role]
 */
export function lineageFill(hue, role = "band") {
  if (role === "dim") return `hsla(${hue}, 25%, 45%, ${BAND_ALPHA.dim})`; // a band the highlight is not on
  if (role === "lit") return `hsla(${hue}, 85%, 62%, ${BAND_ALPHA.lit})`; // the highlighted band
  if (role === "dot") return `hsl(${hue}, 68%, 55%)`; // the legend chip, opaque
  return `hsla(${hue}, 68%, 55%, ${BAND_ALPHA.band})`;
}

/** How opaque a lineage band is in each of its three roles. */
const BAND_ALPHA = Object.freeze({ band: 0.9, dim: 0.35, lit: 0.98 });

/**
 * What the highlight does to a band it is not on, as a factor rather than as a
 * second value: `dim` is `band` at this much of its opacity. Anything else in
 * this figure that has to recede when a lineage is spotlighted multiplies by it
 * instead of choosing a number, so the two cannot drift apart (v1.61's rule —
 * two things that must differ by a fixed amount should differ by construction).
 */
export const BAND_DIM_SCALE = BAND_ALPHA.dim / BAND_ALPHA.band;

/**
 * A lineage band's composited colour, for the audit and for `bandTextures()`.
 *
 * Over the *panel*, not `mullerBackground()` — which is wrong and known to be,
 * and left alone deliberately. At 0.9 opacity the two surfaces differ by up to
 * ΔE 4.4, which changes 0.58% of the 64,620 hue pairs' collision costs, and
 * `bandTextures` deals hatches by those: correcting it would redraw the key on
 * some existing runs. A measured lead rather than a fix (v1.62).
 */
export function lineageBandRgb(hue) {
  return blendOver(panelBackground(), hslToRgb(hue, 68, 55), BAND_ALPHA.band);
}

/**
 * The hatch a Muller band wears so it is not identified by colour alone.
 *
 * Colour cannot do this job and the reason is arithmetic, not taste: the hue
 * wheel affords **16** pairwise-`MIN_DELTA_E` colours under normal vision, 12
 * under tritanopia, 9 under protanopia and **7** under deuteranopia, and this
 * plot has drawn as many as **19** bands at once. Even with a perfect palette
 * there are not enough colours; with an *inherited* one there are far fewer.
 * So the cue is geometry, which v1.34 established survives every vision model
 * and costs nothing — the same escape the immune ring's dashes took.
 *
 * One dark tone rather than the usual two, because unlike every mark audited
 * before it this one is not drawn on a background the world chooses: a band is
 * always `lineageFill` at 55% lightness, so a near-black line has no bright
 * case to fail on. Swept over all 360 hues under all four vision models at
 * `HATCH_ALPHA`, worst case **26.6** against a bar of 25 (hue 344, protanopia).
 *
 * A *dimmed* band is the exception and deliberately so: the highlight exists to
 * push the other bands towards the background, and a cue that stayed legible
 * there would be undoing it. Its hatch dims with its colour.
 */
export function bandHatch() {
  return { r: 4, g: 8, b: 14 };
}

/** How hard the hatch is drawn over its band — see `bandHatch()`. */
export const HATCH_ALPHA = 0.7;

/**
 * The Muller plot's own background — `#muller`'s `background` in `style.css`,
 * and *not* `panelBackground()`.
 *
 * Here because of what v1.61 noticed on its way past and did not chase: this
 * canvas paints itself a shade darker than the column it sits in, while
 * `lineageBandRgb` above models the panel. On a band at 0.9 opacity that is
 * worth up to ΔE 4.4 and nothing turns on it; on a band at **0.16** it is the
 * whole measurement — the "other" band reads 9.0 from the surface it is
 * actually drawn on and 4.8 from the one an audit would reach for by mistake,
 * which is the difference between a fixable complaint and an invisible one.
 * The lesson is v1.34's: a mark's background is the thing beneath it, not the
 * thing beside it.
 */
export function mullerBackground() {
  return { r: 0x04, g: 0x07, b: 0x0b };
}

/**
 * The "other" band: the churn of lineages too small to earn a name, drawn along
 * the bottom of the Muller plot.
 *
 * It lived in `mullerplot.js` as a literal until v1.62 and was the loudest entry
 * on v1.61's list of colours the audit had never reached. Measured against
 * `mullerBackground()`, it is **ΔE 9.0** (9.0/9.2/9.1/12.3 across the four
 * vision models) — at or under the [`MIN_RULE_DELTA_E`, `MAX_RULE_DELTA_E`]
 * ceiling this project reserves for *gridlines* on three of the four. The band
 * holding the unnamed species was drawn as furniture, while holding a mean 9.1%
 * of the plot over twelve seeds and peaking between 70% and 97% on every one of
 * them.
 *
 * And it cannot be fixed by choosing a better value, which one sweep settled:
 * the lineage fills are `hsl(h, 68%, 55%)` around the whole hue wheel, so
 * anything dark enough to sit near the background fails the background and
 * anything bright enough to clear it walks into some lineage — pure white at
 * full opacity still only reaches ΔE 23.9 from the nearest lineage band,
 * against a bar of 25. So the escape is geometry, the same one v1.46 took one
 * figure over (`mullerplot.js#OTHER_TEXTURE`), and the *fill* below is
 * unchanged from the value it has had since v1.2.
 */
export function otherBand() {
  return { r: 120, g: 140, b: 160 };
}

/** How much of `otherBand()` the band's fill actually is. */
export const OTHER_BAND_ALPHA = 0.16;

/** The "other" band's fill, as the plot draws it. */
export function otherBandFill() {
  return rgbaCss(otherBand(), OTHER_BAND_ALPHA);
}

/** The same, composited — the colour a viewer actually sees, and the chip's. */
export function otherBandRgb() {
  return blendOver(mullerBackground(), otherBand(), OTHER_BAND_ALPHA);
}

/**
 * The ink of the stipple that identifies the band, and it is *derived* rather
 * than chosen: the band is its own colour at `OTHER_BAND_ALPHA`, and the
 * stipple is that same colour undiluted. Nothing new is picked, so no future
 * edit can move one without the other.
 *
 * Two measurements pin it, and the second is the one that decided the shape —
 * v1.55's rule that the constraint settling a value is usually not the one the
 * sweep is about:
 *
 *   - **A dot must read.** Against the band it lies on it scores 47.8–53.1
 *     across the four vision models, against a bar of 25.
 *   - **The band must stay the quiet one.** It is the churn, not a lineage, so
 *     it must not out-shout one. The stipple covers 1/28 of the band
 *     (`HATCH_PITCH` apart, dotted 1-on-3-off), which puts the band's
 *     area-weighted mean at ΔE **14.3** from the background at its loudest
 *     model — above the 10 that makes a thing furniture, and well under the
 *     **35.6** of the quietest lineage band there is (hue 347).
 *
 * Under a highlight it recedes to `BAND_DIM_SCALE` of that, landing at 20.0 —
 * deliberately under the bar a mark must clear, for the reason `bandHatch()`
 * gives: a cue that stayed legible while the spotlight was on something else
 * would be undoing the spotlight.
 *
 * @param {boolean} [dimmed] true while some other band is highlighted
 */
export function otherBandHatch(dimmed = false) {
  return rgbaCss(otherBand(), dimmed ? BAND_DIM_SCALE : 1);
}

// ---- The inspector (v1.49) ----
//
// The panel where a creature's brain is drawn, and the last surface the audit
// had never opened. Every sweep since v1.25 has been about the canvas or about
// the DOM readouts *beside* the canvas; the inspector draws two figures of its
// own — a weight strip and, with `evolvableTopology` on, a network diagram —
// and both of them chose their colours inline in `main.js`, which is the v1.26
// complaint (a colour a test cannot reach is a colour that will drift) on the
// two figures nobody had thought to name.

/**
 * The weight strip's own track: the cell a weight is drawn in when the weight is
 * nothing. `#142130` in `style.css` since v1.0, here now for the same reason
 * `panelBackground()` is — the audit and the stylesheet cannot both be the
 * source of truth.
 */
export function inspectorTrack() {
  return { r: 0x14, g: 0x21, b: 0x30 };
}

/** The brain diagram's plate — `.braingraph`'s background, near-black. */
export function brainGraphBackground() {
  return { r: 0x05, g: 0x08, b: 0x0d };
}

/**
 * What a `box-shadow: 0 0 Npx C` actually leaves against the shape's own edge.
 *
 * A zero-offset box-shadow is the element's silhouette blurred, and a blur of
 * `N` runs from full strength to nothing across `N` pixels *centred on the
 * silhouette's boundary*. The shape is opaque and covers the inner half, so the
 * first pixel outside the mark — the one the eye reads the mark's edge against
 * — sits at half strength, falling to zero `N/2` pixels out.
 *
 * This is the number the whole of v1.79 turns on, and it is not a colour: it is
 * the answer to *what is this mark drawn on*, for a mark whose background is
 * painted by its own rule. Every audit in this file before it took the surface
 * underneath as given, because on the canvas it is — `render.js` draws a mark
 * over a pond it did not choose. In the DOM a mark can lay its own ground and
 * then be measured against the one it isn't on.
 */
export const DOM_HALO_ALPHA = 0.5;

/**
 * The inspector's swatch — the 14-pixel square beside *Creature #n*, and the
 * only place on the page a creature's own hue is reported (v1.77 wrote that
 * down in `FIELD_REPORTS`; this measures it).
 *
 * It was the last entry on v1.61's list of colours named outside this file, and
 * the last of the six to be measured. Against the panel it is safe and always
 * was — worst **ΔE 35.80** over all 360 hues and all four vision models, no hue
 * within a factor of anything of the bar — which is the measurement an audit
 * of this project's usual shape would have made, and it would have struck the
 * entry off with "the swatch was fine".
 *
 * The swatch is not drawn on the panel. `style.css` has given it
 * `box-shadow: 0 0 8px currentColor` since v1.0, and `currentColor` in a
 * `.insp-row` is `--ink`, `#dce7f2` — the paragraph's text colour, because the
 * span has a background and no colour of its own. So the mark's actual
 * surround is the panel with near-white at `DOM_HALO_ALPHA` over it,
 * `rgb(116, 125, 135)`, a mid slate; and against *that* the swatch is under
 * `MIN_DELTA_E` on **55 of the 360 lineage hues (15.3%)** — 29 for a
 * protanope, 31 for a deuteranope, 9 for a tritanope — bottoming out at
 * **ΔE 5.04** at hue 326. Two bands, and neither is exotic: 260–268, the
 * blue-violets, and **311–356**, which is the whole magenta-to-red arc. Over
 * twelve seeds and 32,269 creature-frames, **9.56%** of the creatures a visitor
 * could click on have a swatch that fails for some reader.
 *
 * The glow is what the rule was reaching for and not what it got. Every
 * creature in the pond is drawn with a radial gradient in its own hue
 * (`render.js#_drawCreature`), so a small glowing square is the panel restating
 * the canvas — and the property that was supposed to name the creature named
 * the paragraph instead. The proof is nine hundred lines down the same
 * stylesheet: `.legend .chip .dot` is the same 14-pixel chip with the same
 * `box-shadow: 0 0 6px currentColor`, and `main.js` sets `color` on that span
 * to the lineage's own fill, so its halo *is* its mark. Measured, the dot
 * clears the bar on every hue by 35.83 or better. One idiom, twice, one of them
 * naming itself — and the one that did not is the one no test had reached.
 *
 * So the fix is the sibling's, not a new colour: the swatch names itself, the
 * glow becomes the fill by construction rather than by coincidence, and the
 * mark is read against the panel again, where it always scored. `glow` is
 * returned separately from `fill` so that the invariant *the swatch's halo is
 * its own colour* is a thing a test can state, rather than an equality nobody
 * would notice breaking.
 *
 * What this does **not** claim, since a victory sentence that does not name
 * what it excludes annexes it: the swatch reports a *hue*, and the body it
 * stands for is `hsl(hue, 60 + signal·25, 45 + energy·45)`, which moves. Over
 * the same 32,269 frames the swatch sits a median of **ΔE 20.5** from the
 * creature it names and over the bar on **43.2%** of them. That is not a
 * contrast bug — nothing is illegible — and it is not fixable by choosing a
 * lightness, because the body's is a variable. It is a lead, and it is written
 * up in `docs/DEVLOG.md` rather than pinned here.
 *
 * @param {number} hue 0..360
 */
export function inspectorSwatch(hue) {
  const fill = `hsl(${hue}, 70%, 55%)`;
  return { fill, glow: fill, blur: 8 };
}

/** The swatch's fill and the halo it now lays, as RGB, for the audit. */
export function inspectorSwatchTones(hue) {
  const fill = hslToRgb(hue, 70, 55);
  return { fill, halo: blendOver(panelBackground(), fill, DOM_HALO_ALPHA) };
}

/**
 * The ancestry pips — one rounded chip per species in a creature's descent,
 * `style.css` since v1.9, and the swatch's sibling in every sense that matters:
 * a 14-ish-pixel chip carrying an inherited hue, four rows below it in the same
 * panel. v1.61's entry for the swatch named these as the reason it could not
 * finish the job — *"its sibling is painted from style.css, which is outside
 * every sweep this project has"* — so striking the swatch off without them
 * would leave a known gap filed under a closed list, which v1.66 calls the most
 * expensive kind of note.
 *
 * They pass, and comfortably. Over all 360 hues and all four vision models:
 * the filled pip clears the panel by **43.39** at worst (hue 345, protanopia);
 * its dark label clears its own fill by **43.95**; and an extinct ancestor's
 * hollow pip — 45% saturation, no fill, a dashed border — clears the panel by
 * **47.92**. Nothing here needs changing, and that is the finding: five of the
 * six items on v1.61's list were hiding something and the sixth's sibling is
 * not, which is what a control is for.
 *
 * The values stay in the stylesheet rather than moving here, because the pip's
 * hue arrives as a custom property and the chip is painted before any module
 * runs — the same case as the minimap's water and the Tree of Life's canvas.
 * So they are *pinned* by name in `test/colourliterals.test.js` rather than
 * deduplicated (v1.62), and this function is what they are pinned to.
 */
export function ancestryPip() {
  return { sat: 70, light: 62, goneSat: 45, label: "#06121c" };
}

/** A pip's tones at one hue, for the audit. */
export function ancestryPipTones(hue) {
  const p = ancestryPip();
  return {
    fill: hslToRgb(hue, p.sat, p.light),
    gone: hslToRgb(hue, p.goneSat, p.light),
    label: { r: 0x06, g: 0x12, b: 0x1c },
  };
}

/** `{r,g,b}` → a CSS colour, for the places the DOM is painted from this file. */
export function rgbCss({ r, g, b }) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * The same for a colour that carries an alpha. Kept parseable by the audit —
 * plain integers and a decimal — because several tests read a value back out of
 * the string this produces and rebuild the composite from it, which is the only
 * way the measured colour and the drawn one cannot be two different colours.
 */
export function rgbaCss({ r, g, b }, alpha) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(alpha.toFixed(4))})`;
}

/** Where the weight strip's bar reaches full height. Weights beyond it clamp. */
export const WEIGHT_FULL_SCALE = 2;

/**
 * The floor under a bar's height, as a fraction of the cell. A weight is
 * essentially never exactly zero, so the smallest ones still have a sign, and a
 * sign the strip declines to draw is information the figure had and threw away.
 */
export const WEIGHT_MIN_FILL = 0.14;

/**
 * One cell of the weight strip: **sign by colour and by direction, magnitude by
 * height**, and nothing by opacity.
 *
 * What it replaces, and why it is the same bug the project has now found four
 * times. The strip drew `hsla(hue, 80%, 55%, |w| / 2)` — degree expressed by
 * fading a mark, which v1.34 wrote down as the one thing never to do, because
 * fading spends exactly the contrast the mark exists for. Measured against this
 * cell's own track: a weight of 0.1 scores **ΔE 3.7**, under the just-noticeable
 * difference; 0.25 scores 9.0, and its *sign* — the only thing the colour was
 * carrying — scores 10.7 to a protanope against a bar of 25. And this is not a
 * tail. Over three seeds at 6,000 ticks the median |w| is **0.71**, a fifth of
 * every strip is under 0.25 and **a third is under 0.5**, so a third of the
 * fingerprint was being drawn in tones its own background could swallow.
 *
 * Height cannot do that: a bar is either there or it is not, at any magnitude.
 * And direction is free — positive bars stand on the floor, negative ones hang
 * from the ceiling — so the sign survives even a viewer for whom the two hues
 * are one hue. That is v1.34's escape (geometry survives every vision model)
 * applied to a figure that had no geometry at all.
 *
 * The two tones are the same blue and red the network diagram uses for the same
 * claim, opaque: `hsl(205, 85%, 60%)` and `hsl(8, 85%, 60%)`, ΔE **76.1**
 * apart at worst and 54.9 at worst from the track.
 *
 * @param {number} w a brain weight
 * @returns {{colour:string, fill:number, sign:number}}
 */
export function weightMark(w) {
  const mag = Math.min(Math.abs(w), WEIGHT_FULL_SCALE) / WEIGHT_FULL_SCALE;
  return {
    colour: w >= 0 ? "hsl(205, 85%, 60%)" : "hsl(8, 85%, 60%)",
    fill: WEIGHT_MIN_FILL + (1 - WEIGHT_MIN_FILL) * mag,
    sign: w >= 0 ? 1 : -1,
  };
}

/** The strip's two tones as RGB, for the audit. Opaque, so no compositing. */
export function weightMarkTones() {
  return { positive: hslToRgb(205, 85, 60), negative: hslToRgb(8, 85, 60) };
}

/**
 * How hard a connection is drawn in the network diagram. Constant, on purpose.
 *
 * The edges had the weight strip's bug in the strip's own words — opacity
 * `0.15 + |w| / 3` — so a weak connection's sign read ΔE 17.3 to a protanope
 * and the connection itself 9.0 against the plate. Width was *already* carrying
 * the magnitude alongside the fade; removing the fade loses nothing the figure
 * was saying and gives every line back its colour.
 */
export const BRAIN_EDGE_ALPHA = 0.7;

/** A connection's colour and width: sign by hue, magnitude by width alone. */
export function brainEdge(w) {
  const hue = w >= 0 ? 205 : 8;
  return {
    colour: `hsla(${hue}, 85%, 60%, ${BRAIN_EDGE_ALPHA})`,
    width: Math.min(2.4, 0.5 + Math.abs(w) / 2.2),
  };
}

/** The two edge tones as they are actually composited over the plate. */
export function brainEdgeTones() {
  const bg = brainGraphBackground();
  return {
    positive: blendOver(bg, hslToRgb(205, 85, 60), BRAIN_EDGE_ALPHA),
    negative: blendOver(bg, hslToRgb(8, 85, 60), BRAIN_EDGE_ALPHA),
  };
}

/**
 * The three kinds of neuron in the diagram: sense, evolved hidden, motor.
 *
 * The shipped set was `#5adc96` green, `#e0e6f0` near-white and `#ffb060`
 * orange, and green-against-orange is the pair one man in twelve cannot see:
 * **ΔE 17.7 under protanopia** (35.6 deuteranopia, 77.9 normal), against a bar
 * of 25. Inputs and outputs are the two ends of the picture, so that was the
 * one pair a reader most needs.
 *
 * The reason it failed is one number: the two were the *same lightness*, L*
 * 79.4 and 78.0, so the entire distinction rode on the red-green axis and a
 * protanope had nothing left to read it with. So the near-white is kept — it
 * scores 89 against the plate on every model and is the only one of the three
 * that could not be confused with an edge — and the two that failed are pulled
 * apart in **luminance**, the channel no deficiency touches, from ΔL* 1.4 to
 * **15.1**: a deep leaf green at 48% lightness and a pale gold at 78%. Worst
 * case over every constraint is **30.2**: the three roles pairwise, each
 * against the plate, and each against both composited edge tones, since a node
 * is a disc sitting on the lines it terminates and a node that reads as a
 * thickening of its own wire is not a node.
 *
 * The search had 419 single-role candidates clearing the fixed backgrounds
 * alone, so this was taste inside a large feasible set, not a rescue — worth
 * saying, because v1.48 caught me writing the impossibility paragraph first for
 * the third time.
 *
 * Also removed here rather than kept: `#7fd0ff`, a fourth colour initialised as
 * the "hidden default" and overwritten on every branch of the conditional
 * beneath it. It has been dead since v1.5 and it is the reason the audit's own
 * to-do list said the diagram had a blue in it.
 */
export function brainNodeColours() {
  return {
    input: "hsl(105, 70%, 48%)", // senses — deep leaf
    hidden: "#e0e6f0", // evolved interneurons — unchanged since v1.5
    output: "hsl(45, 85%, 78%)", // motors — pale gold
  };
}

/** The three neuron tones as RGB, for the audit. */
export function brainNodeTones() {
  return {
    input: hslToRgb(105, 70, 48),
    hidden: { r: 0xe0, g: 0xe6, b: 0xf0 },
    output: hslToRgb(45, 85, 78),
  };
}

/**
 * How well a mark stands out from a background: the *best* of its tones, since a
 * viewer only needs one of them to read. This is the scoring function the audit
 * and the tests both use, so "the mark is legible" means one thing in this
 * project rather than two.
 *
 * @param {Array<{r:number,g:number,b:number}>} tones
 */
export function markContrast(tones, background, vision) {
  let best = 0;
  for (const t of tones) best = Math.max(best, deltaE(t, background, vision));
  return best;
}
