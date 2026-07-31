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
  return { pop: "rgba(120, 190, 255, 0.95)", food: "rgba(90, 200, 140, 0.5)" };
}

/** The two chart lines as they are actually composited over the panel. */
export function chartLineTones() {
  return {
    pop: blendOver(panelBackground(), { r: 120, g: 190, b: 255 }, 0.95),
    food: blendOver(panelBackground(), { r: 90, g: 200, b: 140 }, 0.5),
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

/** The opacity of the band between the lines — see `powerLine()`. */
export const POWER_BAND_ALPHA = 0.26;

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
