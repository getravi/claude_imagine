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
    rim: "hsl(8, 85%, 12%)",
    // As a fraction of the body radius. The old core was a flat 0.55.
    radius: 0.4 + 0.2 * c,
  };
}

/** The two tones of the predator mark as RGB, for the audit. */
export function predatorMarkTones() {
  return { disc: hslToRgb(30, 100, 88), rim: hslToRgb(8, 85, 12) };
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
