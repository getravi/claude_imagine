// palette.test.js — the colour audit, kept honest.
//
// Two kinds of test live here. The first kind checks the *instrument*: a
// dichromat simulation that got the matrices wrong would happily bless any
// palette, so it is pinned against colours whose answers are known independently
// (greys survive untouched, red and green collapse onto each other, and the
// model is idempotent). The second kind checks the *palette*, by sweeping the
// whole space a creature can occupy — every hue, every energy level, every
// signal state — and insisting the marks stay legible under all four vision
// models.
//
// The control matters as much as the assertion. Two of these tests exist to
// hold a failure in place: the v1.24 marks scored 2.8 and 0.01, and a test that
// only checked the new numbers would let someone reintroduce the old ones while
// the suite stayed green.

import test from "node:test";
import assert from "node:assert/strict";

import {
  hslToRgb,
  addOver,
  simulateCvd,
  deltaE,
  toLab,
  markContrast,
  predatorMark,
  predatorOutline,
  predatorOutlineTones,
  refugeRing,
  refugeRingTones,
  visionReach,
  visionReachTones,
  selectionMark,
  selectionMarkTones,
  SELECTION_OLD_INK,
  predatorMarkTones,
  minimapPredatorMark,
  minimapPredatorTones,
  minimapCorpseMark,
  minimapViewport,
  minimapViewportTones,
  minimapSelection,
  minimapSelectionTones,
  MINIMAP_PELLET_STACK,
  MINIMAP_PREY_ALPHA,
  minimapWater,
  minimapBiomeWash,
  minimapPreyDotRgb,
  mortalityColours,
  mortalityTones,
  sizePlotTones,
  energyColours,
  energyTones,
  barTrack,
  detritusTint,
  DETRITUS_MAX_ALPHA,
  pondBiomeGlow,
  biomeGlowFalloff,
  biomeGlowStops,
  BIOME_GLOW_PEAK,
  BIOME_GLOW_SPAN,
  BIOME_GLOW_STOPS,
  blendOver,
  CVD_TYPES,
  VISION_MODELS,
  MIN_DELTA_E,
  hazardTint,
  barrierRockTones,
  HAZARD_SOURCE_ALPHA,
  HAZARD_AUDIT_SOURCES,
  sickHalo,
  sickHaloTones,
  immuneRing,
  immuneRingTones,
  panelBackground,
  chartLines,
  chartLineTones,
  chartBands,
  chartBandTones,
  CHART_BAND_SCALE,
  powerLine,
  powerLineTones,
  POWER_BAND_ALPHA,
  axisRule,
  axisRuleTone,
  MIN_RULE_DELTA_E,
  MAX_RULE_DELTA_E,
  seasonBand,
  seasonBandTone,
  SEASON_BAND_ALPHA,
  signalRing,
  corpseMark,
  corpseMarkTones,
  CORPSE_FULL_MEAT,
  foodMote,
  signalRingTones,
  SIGNAL_QUIET,
  attackFlashTones,
  lineageFill,
  lineageBandRgb,
  bandHatch,
  HATCH_ALPHA,
  mullerBackground,
  otherBand,
  otherBandRgb,
  otherBandHatch,
  OTHER_BAND_ALPHA,
  BAND_DIM_SCALE,
  rgbCss,
  inspectorTrack,
  brainGraphBackground,
  weightMark,
  weightMarkTones,
  WEIGHT_FULL_SCALE,
  WEIGHT_MIN_FILL,
  brainEdge,
  brainEdgeTones,
  BRAIN_EDGE_ALPHA,
  brainNodeColours,
  brainNodeTones,
  inspectorSwatch,
  inspectorSwatchTones,
  ancestryPip,
  ancestryPipTones,
  DOM_HALO_ALPHA,
} from "../src/palette.js";
import { ENERGY_SINKS } from "../src/energy.js";
import { independentAny } from "../src/contagion.js";
import { terrainBandFill, TERRAIN_BANDS } from "../src/minimap.js";
import { FertilityField } from "../src/environment.js";
import { makeConfig } from "../src/config.js";
import { RNG } from "../src/rng.js";

// The body colour render.js paints for a given creature state, reproduced here
// so the sweep measures what is actually drawn.
function bodyColour(hue, energyFrac, signal) {
  const light = 30 + energyFrac * 45;
  const sat = 60 + signal * 25;
  return hslToRgb(hue, sat, light + 15);
}

const ENERGIES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const SIGNALS = [-1, -0.5, 0, 0.5, 1];

/** Worst case of `score(body, vision)` over every creature a pond can contain. */
function sweepBodies(score) {
  let worst = Infinity;
  let where = null;
  for (let hue = 0; hue < 360; hue++) {
    for (const e of ENERGIES) {
      for (const s of SIGNALS) {
        const body = bodyColour(hue, e, s);
        for (const vision of VISION_MODELS) {
          const d = score(body, vision);
          if (d < worst) {
            worst = d;
            where = `hue ${hue}, energy ${e}, signal ${s}, ${vision}`;
          }
        }
      }
    }
  }
  return { worst, where };
}

// ---- The instrument ----

test("hslToRgb agrees with the CSS colours it stands in for", () => {
  assert.deepEqual(hslToRgb(0, 100, 50), { r: 255, g: 0, b: 0 });
  assert.deepEqual(hslToRgb(120, 100, 50), { r: 0, g: 255, b: 0 });
  assert.deepEqual(hslToRgb(240, 100, 50), { r: 0, g: 0, b: 255 });
  assert.deepEqual(hslToRgb(0, 0, 100), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hslToRgb(0, 0, 0), { r: 0, g: 0, b: 0 });
  // Hue is periodic, and negative hues are a thing the callers can produce.
  assert.deepEqual(hslToRgb(360, 100, 50), hslToRgb(0, 100, 50));
  assert.deepEqual(hslToRgb(-120, 100, 50), hslToRgb(240, 100, 50));
});

test("a dichromat sees greys exactly as everyone else does", () => {
  // The confusion lines all pass through the achromatic axis, so an
  // implementation that moves a grey has its matrices wrong.
  for (const type of CVD_TYPES) {
    for (const g of [0, 32, 64, 128, 200, 255]) {
      const seen = simulateCvd({ r: g, g, b: g }, type);
      assert.ok(Math.abs(seen.r - g) < 0.6, `${type} moved grey ${g}: ${seen.r}`);
      assert.ok(Math.abs(seen.g - g) < 0.6, `${type} moved grey ${g}: ${seen.g}`);
      assert.ok(Math.abs(seen.b - g) < 0.6, `${type} moved grey ${g}: ${seen.b}`);
    }
  }
});

test("simulating a deficiency twice is the same as simulating it once", () => {
  // Each model is a projection onto the plane of colours that deficiency can
  // represent. Projecting a second time must be a no-op; if it isn't, the
  // substitution matrix isn't a projection and the distances are meaningless.
  for (const type of CVD_TYPES) {
    for (const c of [
      { r: 220, g: 40, b: 30 },
      { r: 30, g: 200, b: 90 },
      { r: 60, g: 90, b: 240 },
      { r: 255, g: 236, b: 214 },
    ]) {
      const once = simulateCvd(c, type);
      const twice = simulateCvd(once, type);
      assert.ok(deltaE(once, twice) < 1.0, `${type} is not idempotent (ΔE ${deltaE(once, twice)})`);
    }
  }
});

test("red and green collapse for a red-green dichromat and not for anyone else", () => {
  const red = { r: 255, g: 0, b: 0 };
  const green = { r: 0, g: 255, b: 0 };
  const normal = deltaE(red, green, "normal");
  assert.ok(normal > 150, `normal vision should see these as wildly different, got ${normal}`);
  for (const type of ["protanopia", "deuteranopia"]) {
    assert.ok(deltaE(red, green, type) < normal / 2, `${type} should merge red and green`);
  }
  // A tritanope keeps the red-green axis and loses blue-yellow instead, so this
  // pair stays wide open for them while a yellow/pink one closes to nothing.
  assert.ok(deltaE(red, green, "tritanopia") > 100);
  const yellow = { r: 255, g: 230, b: 60 };
  const pink = { r: 255, g: 190, b: 190 };
  assert.ok(deltaE(yellow, pink, "normal") > 70);
  assert.ok(deltaE(yellow, pink, "tritanopia") < 10);
});

test("an unknown vision model is normal vision, and ΔE of a colour with itself is zero", () => {
  const c = { r: 123, g: 45, b: 67 };
  assert.deepEqual(simulateCvd(c, "normal"), c);
  assert.deepEqual(simulateCvd(c, "nonsense"), c);
  for (const vision of VISION_MODELS) assert.equal(deltaE(c, c, vision), 0);
});

test("Lab lightness is ordered the way lightness is", () => {
  const ls = [0, 25, 50, 75, 100].map((l) => toLab(hslToRgb(0, 0, l))[0]);
  for (let i = 1; i < ls.length; i++) assert.ok(ls[i] > ls[i - 1]);
  assert.ok(Math.abs(ls[0]) < 1e-9);
  assert.ok(Math.abs(ls[4] - 100) < 0.01);
});

// ---- The palette ----

test("the predator mark clears the threshold against every body in the pond", () => {
  const tones = predatorMarkTones();
  const { worst, where } = sweepBodies((body, vision) =>
    markContrast([tones.disc, tones.rim], body, vision)
  );
  assert.ok(
    worst >= MIN_DELTA_E,
    `worst predator-mark contrast ΔE ${worst.toFixed(1)} at ${where}, below ${MIN_DELTA_E}`
  );
});

test("the v1.24 predator core did not — the control this replaced", () => {
  // A bright warm core drawn additively over a body that pales as it feeds.
  // Kept as a test so the failure is pinned: without it, someone could restore
  // the old colours and the suite would stay green.
  const core = hslToRgb(14, 100, 60);
  const { worst } = sweepBodies((body, vision) => {
    let best = Infinity;
    for (const carnivory of [0.55, 0.7, 0.85, 1]) {
      best = Math.min(best, deltaE(addOver(body, core, 0.5 + 0.4 * carnivory), body, vision));
    }
    return best;
  });
  assert.ok(worst < 5, `expected the old core to be near-invisible, got ΔE ${worst.toFixed(1)}`);
});

test("the predator mark carries a light tone and a dark one", () => {
  // This is *why* it works, and it is the property a future edit is most likely
  // to break by "tidying" the two tones toward each other. No background can be
  // close to both.
  const { disc, rim } = predatorMarkTones();
  assert.ok(toLab(disc)[0] > 80, "the disc should be a light tone");
  assert.ok(toLab(rim)[0] < 20, "the rim should be a dark tone");
  for (const vision of VISION_MODELS) {
    assert.ok(deltaE(disc, rim, vision) > 60, `the two tones merge under ${vision}`);
  }
});

test("how carnivorous a predator is moves the mark's size, not its opacity", () => {
  // Fading a mark to express degree spends exactly the contrast the mark exists
  // for. Geometry is free and survives every vision model.
  const a = predatorMark(0.55);
  const b = predatorMark(1);
  assert.ok(b.radius > a.radius);
  assert.equal(a.disc, b.disc);
  assert.equal(a.rim, b.rim);
  assert.ok(!/rgba|hsla/.test(a.disc + a.rim), "the mark's tones must be opaque");
  // Out-of-range diets are clamped rather than producing a mark bigger than the
  // body it sits in.
  assert.equal(predatorMark(5).radius, predatorMark(1).radius);
  assert.equal(predatorMark(-1).radius, predatorMark(0).radius);
  assert.ok(predatorMark(1).radius < 1);
});

// ---- The silhouette, which the v1.25 audit walked past ----
//
// The outline is the other half of the predator mark, and it was still the
// pre-v1.25 shape until v1.66: one translucent warm tone over a background it
// does not control, with the diet gene in its opacity. Its backgrounds are both
// sides of the chevron's edge — the body inside, and outside it the water with
// the creature's *own* glow on it, which is the one background a mark cannot
// avoid (v1.55).

/** The water under a creature, with its own additive glow over it. */
function glowBackgrounds() {
  const water = { r: 7, g: 12, b: 19 };
  const out = [];
  for (let hue = 0; hue < 360; hue += 5) {
    for (const e of [0, 0.5, 1]) {
      // The glow is a radial gradient from 0.5 at the centre to 0 at three
      // radii; at the body's edge it is a third of that, and overlapping
      // neighbours stack it higher.
      for (const k of [0.15, 0.33, 0.5, 0.8]) {
        out.push({ name: `glow hue ${hue} e ${e} k ${k}`, rgb: addOver(water, hslToRgb(hue, 70, 30 + 45 * e), k) });
      }
    }
  }
  return out;
}

/** Worst case over every body *and* every glow-lit patch of water outside one. */
function sweepOutlineBackgrounds(score) {
  const { worst, where } = sweepBodies(score);
  let w = worst;
  let at = where;
  for (const bg of glowBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = score(bg.rgb, vision);
      if (d < w) {
        w = d;
        at = `${bg.name}, ${vision}`;
      }
    }
  }
  return { worst: w, where: at };
}

test("the predator outline reads on both sides of the edge it is drawn on", () => {
  const t = predatorOutlineTones();
  const { worst, where } = sweepOutlineBackgrounds((bg, vision) =>
    markContrast([t.edge, t.rim], bg, vision)
  );
  assert.ok(
    worst >= MIN_DELTA_E,
    `worst predator-outline contrast ΔE ${worst.toFixed(1)} at ${where}, below ${MIN_DELTA_E}`
  );
});

test("the outline it replaces was invisible on half the pond — the failure, pinned", () => {
  // `hsla(8, 90%, 60%, 0.35 + 0.5 * carnivory)`, at the opacities twelve seeds
  // of real predators actually produce (p0 to p100: carnivory 0.551 to 1.0).
  // Without this assertion the suite stays green if someone restores it.
  const old = hslToRgb(8, 90, 60);
  const alphas = [0.626, 0.656, 0.679, 0.702, 0.742, 0.85];
  const score = (bg, vision) => {
    let best = Infinity;
    for (const a of alphas) best = Math.min(best, deltaE(blendOver(bg, old, a), bg, vision));
    return best;
  };
  const { worst } = sweepOutlineBackgrounds(score);
  assert.ok(worst < 1, `expected an outright collision, got ΔE ${worst.toFixed(2)}`);

  // And the share, which is what made it worth a release rather than a note
  // (v1.49): a rule violation is a lead, the finding is how much data lands in
  // the broken part.
  const all = [...glowBackgrounds().map((b) => b.rgb)];
  for (let hue = 0; hue < 360; hue += 1) all.push(bodyColour(hue, 1, 0), bodyColour(hue, 0.25, -1));
  let under = 0;
  for (const bg of all) {
    let w = Infinity;
    for (const vision of VISION_MODELS) w = Math.min(w, score(bg, vision));
    if (w < MIN_DELTA_E) under++;
  }
  assert.ok(under / all.length > 0.4, `only ${((under / all.length) * 100).toFixed(1)}% of backgrounds failed`);
});

test("the outline is pinned between two measurements, not chosen", () => {
  // One wants it lighter: it has to clear the bar against every background.
  // The other wants it darker: a silhouette that reads as the eye's pale disc
  // is a second copy of the mark it surrounds rather than an outline of it.
  // At hue 20 the two admit lightness 40..49 and nothing else, and this is the
  // middle of that band — a value a future edit cannot quietly retune.
  const t = predatorOutlineTones();
  const disc = predatorMarkTones().disc;
  for (const vision of VISION_MODELS) {
    assert.ok(
      deltaE(t.edge, disc, vision) >= MIN_DELTA_E,
      `the outline reads as the eye's disc under ${vision}`
    );
  }
  // And the ceiling: the eye carries the sentence, so the outline must not be
  // the louder of the two on the background where each is weakest (v1.62).
  const eye = sweepOutlineBackgrounds((bg, vision) =>
    markContrast([predatorMarkTones().disc, predatorMarkTones().rim], bg, vision)
  ).worst;
  const line = sweepOutlineBackgrounds((bg, vision) => markContrast([t.edge, t.rim], bg, vision)).worst;
  assert.ok(line < eye, `the outline (${line.toFixed(1)}) out-shouts the eye (${eye.toFixed(1)})`);
});

test("the outline carries no degree and no opacity, and shares the eye's dark", () => {
  // The diet gene lives in `predatorMark`'s radius. It was in the outline's
  // alpha too, which is the channel v1.34 forbids by name — and over the middle
  // 80% of real predator-frames that alpha spanned ΔE 1.7 on a fed warm body,
  // under the just-noticeable difference. It was paying for a signal it never
  // sent.
  const o = predatorOutline();
  assert.equal(predatorOutline.length, 0, "the outline must not take a diet gene");
  assert.ok(!/rgba|hsla/.test(o.edge + o.rim), "both tones must be opaque");
  assert.equal(o.rim, predatorMark(0.7).rim, "the two predator marks must share one dark");
  const t = predatorOutlineTones();
  assert.ok(toLab(t.rim)[0] < 20, "the outline needs a dark tone");
  assert.ok(toLab(t.edge)[0] > toLab(t.rim)[0] + 30, "and one far enough from it to be a second tone");
  assert.ok(o.width > 0);
});

// ---------------------------------------------------------------------------
// The refuge line (v1.69). Audited with the predator outline's background set
// rather than with `bodyBackgrounds()` alone, and for the same reason: this ring
// is drawn *straddling* a body edge by construction — the median hunted body
// sits 0.65–1.93 px inside its own refuge circle over a run — so part of every
// ring lies on an opaque chevron and the rest on glow-lit water. Measuring it
// against one of those is v1.25's mistake with a new subject.

test("the refuge line reads on both sides of the edge it straddles", () => {
  const t = refugeRingTones();
  const { worst, where } = sweepOutlineBackgrounds((bg, vision) =>
    markContrast([t.ring, t.rim], bg, vision)
  );
  assert.ok(
    worst >= MIN_DELTA_E,
    `worst refuge-line contrast ΔE ${worst.toFixed(1)} at ${where}, below ${MIN_DELTA_E}`
  );
});

test("the refuge line is two opaque tones, and they do not share a hue", () => {
  // The note v1.66 left on `predatorOutline`: a two-tone mark whose tones share
  // a hue is separated in luminance alone, so a mid-luminance background of
  // that hue defeats both halves at once. Held here as an assertion rather than
  // as a comment, because this ring's whole job is to be seen over a background
  // the world picks.
  const m = refugeRing();
  assert.ok(!/rgba|hsla/.test(m.ring + m.rim), "both tones must be opaque");
  const t = refugeRingTones();
  assert.ok(toLab(t.rim)[0] < 20, "the ring needs a dark tone");
  assert.ok(toLab(t.ring)[0] > toLab(t.rim)[0] + 50, "and a very light one, far from it");
  for (const vision of VISION_MODELS) {
    // The single worst background a shared hue would hand it: the mid-luminance
    // version of the dark tone's own hue.
    const trap = hslToRgb(232, 55, 50);
    assert.ok(
      markContrast([t.ring, t.rim], trap, vision) >= MIN_DELTA_E,
      `the pair collapses on its own hue at mid luminance under ${vision}`
    );
  }
  assert.ok(m.width > 0);
});

test("the refuge line carries no degree — a body is inside it or it is not", () => {
  // v1.25's rule, and the one the signal rings and the predator outline each
  // broke in turn: fading a mark to express degree spends exactly the contrast
  // the mark exists for. There is no degree to express here — the eating rule
  // is a strict inequality — so the mark takes no argument at all, which is the
  // cheapest possible way to keep it that way.
  assert.equal(refugeRing.length, 0, "the refuge line must not take a parameter");
  assert.equal(refugeRingTones.length, 0);
});

// ---------------------------------------------------------------------------
// The vision overlay (v1.32, audited in v1.70). The last translucent single
// tone `render.js` drew, and the one the sweeps kept walking past because it
// was filed as a *rule* — a line saying where a radius ends — rather than as a
// mark. A gridline is furniture on a panel whose background this project picks;
// this is a 168-pixel circle over the pond, whose background the world picks,
// which is v1.34's lottery. Its domain is therefore everything: the grounds
// rock is audited against, the glow-lit water either epidemiological mark sits
// on, and the opaque bodies it crosses.

/** Every ground, glow and body a `visionRadius` circle can be drawn over. */
function visionBackgrounds() {
  return [...rockBackgrounds(), ...ringBackgrounds(), ...bodyBackgrounds()];
}

/** The just-noticeable difference the `deltaE` calibration is written against. */
const JND = 2.3;

test("the vision overlay reads on every ground, glow and body its circle crosses", () => {
  const t = visionReachTones();
  let worst = { d: Infinity };
  for (const bg of visionBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = markContrast([t.ring, t.rim], bg.rgb, vision);
      if (d < worst.d) worst = { d, where: bg.name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `the vision overlay scores only ${worst.d.toFixed(1)} on ${worst.where} (${worst.vision})`
  );
});

test("neither of its tones would have done on its own", () => {
  // The reason every mark here is two-toned, as an assertion rather than as the
  // sentence v1.34 wrote. The pair is not a house style: over this pond's
  // backgrounds the bright tone alone and the dark tone alone each vanish
  // somewhere, and it is not the same somewhere — the bright one dies on a
  // well-fed body, the dark one on the water. (Swept over all of HSL, the best
  // single opaque colour that exists anywhere scores 17.6 against a bar of 25;
  // SCIENCE.md has that sweep. This is the cheap local form of it.)
  const t = visionReachTones();
  const worstAlone = { ring: Infinity, rim: Infinity };
  for (const bg of visionBackgrounds()) {
    for (const vision of VISION_MODELS) {
      for (const tone of ["ring", "rim"]) {
        worstAlone[tone] = Math.min(worstAlone[tone], deltaE(t[tone], bg.rgb, vision));
      }
    }
  }
  assert.ok(worstAlone.ring < MIN_DELTA_E, `the bright tone alone scores ${worstAlone.ring.toFixed(1)}`);
  assert.ok(worstAlone.rim < MIN_DELTA_E, `the dark tone alone scores ${worstAlone.rim.toFixed(1)}`);
});

test("the three translucent strengths it replaces were a lottery — the failure, pinned", () => {
  // `rgba(120, 180, 255, α)` at 0.06, 0.15 and 0.18, source-over, from v1.32 to
  // v1.70. Without these assertions the suite stays green if someone puts the
  // alpha back, and the reason it was wrong is nowhere in the code.
  const line = { r: 120, g: 180, b: 255 };
  const bgs = visionBackgrounds();
  const worst = { 0.06: Infinity, 0.15: Infinity, 0.18: Infinity };
  let pair = Infinity;
  for (const bg of bgs) {
    for (const vision of VISION_MODELS) {
      for (const alpha of [0.06, 0.15, 0.18]) {
        worst[alpha] = Math.min(worst[alpha], deltaE(blendOver(bg.rgb, line, alpha), bg.rgb, vision));
      }
      // The pair v1.32 added so the picture would stop being a quiet fiction:
      // the radius asked for, under the region actually searched. Both are
      // drawn in the same frame in the default pond, and their *difference* is
      // the entire content of that release.
      pair = Math.min(pair, deltaE(blendOver(bg.rgb, line, 0.06), blendOver(bg.rgb, line, 0.18), vision));
    }
  }
  for (const alpha of [0.06, 0.15, 0.18]) {
    assert.ok(worst[alpha] < JND, `the old overlay at ${alpha} scored ${worst[alpha].toFixed(2)} at worst`);
  }
  assert.ok(pair < JND, `the old pair differed by ${pair.toFixed(2)} at worst`);
});

test("the overlay is told apart from the other two blue marks this pond draws", () => {
  // What actually pins this value. The floor does not: with a near-black rim
  // under it, every blue from lightness 56 up clears 25 on every background, so
  // the sweep is happy anywhere. The ceiling is the constraint — the immune
  // ring and the refuge line are both pale blues, both drawn on creatures, and
  // all three can be on screen at once. Above lightness 78 this line collides
  // with the immune ring; the colour it has had since v1.32 sits at 73.5.
  const t = visionReachTones();
  for (const [name, other] of [["the immune ring", immuneRingTones().ring], ["the refuge line", refugeRingTones().ring]]) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(t.ring, other, vision);
      assert.ok(d >= MIN_DELTA_E, `the vision overlay is ${d.toFixed(1)} from ${name} under ${vision}`);
    }
  }
});

test("the overlay spends geometry on its distinction, not opacity", () => {
  // Two lines, one meaning "asked for" and one "actually looked at", and the
  // thing that separates them must survive every vision model — so it is a
  // dash, the same device that tells the immune ring from the sick halo. The
  // subordination that the alpha used to buy is a *width* now: thinness is a
  // property of the mark, translucency a property of the mark and whatever
  // happens to be under it.
  const m = visionReach();
  assert.ok(!/rgba|hsla/.test(m.ring + m.rim), "both tones must be opaque");
  assert.ok(Array.isArray(m.dash) && m.dash.length >= 2, "the aspiration line needs a dash pattern");
  assert.ok(m.dash.every((d) => d > 0));
  // A pitch fine enough to read as solid on a circle this size would spend the
  // distinction it exists for: `visionRadius` is 168, so the circumference is
  // over a thousand pixels.
  assert.ok(m.dash[0] >= 4, "the dash reads as a solid line at this radius");
  assert.ok(m.width > 0 && m.width <= 1.5, "the overlay stays a hairline");
  assert.equal(visionReach.length, 0, "the overlay carries no degree");
});

// ---------------------------------------------------------------------------
// The selection mark (v1.0, audited in v1.84). The ring around the creature a
// watcher chose, and the trail behind it. Its domain is `visionBackgrounds()`
// for the same reason the overlay's is: both are drawn over the pond, and the
// pond picks their background, not this project.
//
// This one was not on the "never measured" half of `colourliterals`'s list. It
// was on the *furniture* half — "no distinction to carry, and nowhere for one
// to live" — which is the half whose entries are supposed to be safe, and it
// was the worst-scoring mark this project has put a number on.

test("the selection mark reads on every ground, glow and body it can be drawn over", () => {
  const t = selectionMarkTones();
  let worst = { d: Infinity };
  for (const bg of visionBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = markContrast([t.ring, t.rim], bg.rgb, vision);
      if (d < worst.d) worst = { d, where: bg.name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `the selection mark scores only ${worst.d.toFixed(1)} on ${worst.where} (${worst.vision})`
  );
});

test("the white it was drawn in for eighty-four releases — the failure, pinned", () => {
  // `rgba(255, 255, 255, 0.8)`, source-over, from v1.0 to v1.84. Without this
  // the suite stays green if someone puts the single tone back, and the reason
  // it was wrong is nowhere in the code.
  //
  // The shape of the failure is what makes it worth keeping: it is not a near
  // miss on a handful of unlucky grounds. A creature's body is
  // `hsl(hue, 60..85%, 45 + 45·energy%)` and `render.js` lays the same hue over
  // it as an additive glow, so a well-fed body under its own light is very
  // nearly white — and white over white is nothing at all.
  const bgs = visionBackgrounds();
  const white = SELECTION_OLD_INK.rgb;
  let worst = Infinity;
  let under = 0;
  let underJnd = 0;
  let opaqueUnderJnd = 0;
  for (const bg of bgs) {
    let here = Infinity;
    let opaque = Infinity;
    for (const vision of VISION_MODELS) {
      const ink = blendOver(bg.rgb, white, SELECTION_OLD_INK.alpha);
      here = Math.min(here, deltaE(ink, bg.rgb, vision));
      opaque = Math.min(opaque, deltaE(white, bg.rgb, vision));
    }
    worst = Math.min(worst, here);
    if (here < MIN_DELTA_E) under++;
    if (here < JND) underJnd++;
    if (opaque < JND) opaqueUnderJnd++;
  }
  assert.ok(worst < 0.01, `expected an outright collision, got ΔE ${worst.toFixed(3)}`);
  assert.ok(under / bgs.length > 0.4, `only ${((under / bgs.length) * 100).toFixed(1)}% were under the bar`);
  assert.ok(
    underJnd / bgs.length > 0.15,
    `only ${((underJnd / bgs.length) * 100).toFixed(2)}% were under the just-noticeable difference`
  );
  // And the fix that suggests itself first — turn the opacity up — is not one.
  // The ceiling is the colour, so this has to fail too or the two-tone pair
  // above is decoration.
  assert.ok(
    opaqueUnderJnd / bgs.length > 0.15,
    `opaque white was fine after all (${((opaqueUnderJnd / bgs.length) * 100).toFixed(2)}% under the JND)`
  );
});

test("the selection mark spends width on its trail, not opacity", () => {
  // The lesson v1.70 wrote, applied in the release that measured the mark it
  // was written about: the trail says a quieter thing than the ring, and it
  // says it by being thinner. Both tones stay opaque along the whole path, so
  // the contrast measured above holds at the old end as well as the new.
  const m = selectionMark();
  assert.ok(!/rgba|hsla/.test(m.ring + m.rim), "both tones must be opaque");
  assert.ok(m.trailWidth > 0 && m.trailWidth < m.width, "the trail is quieter than the ring");
  assert.ok(m.trailTaper > 0 && m.trailTaper < 1, "the taper is a fraction of the trail's width");
  // A taper that runs to a hair is a fade by another name: the oldest end still
  // has to be a line somebody can see.
  assert.ok(m.trailWidth * m.trailTaper >= 0.4, "the oldest end tapers away to nothing");
  assert.equal(selectionMark.length, 0, "the selection mark carries no degree");
  assert.equal(selectionMarkTones.length, 0);
});

test("the selection mark is told apart from the pale marks it can be drawn beside", () => {
  // The ring, the refuge line and the immune ring can all be on one creature at
  // once, and all three are near-white or near-white-blue. This is the ceiling
  // that pins the neutral: white is as far from the two pale blues as the axis
  // allows, which is not far, so what separates them here is *geometry* — a
  // ring at the body's own radius, a ring at a fixed 7.273 px, a dashed circle
  // at 168 — and the colours are only required not to collide outright.
  const t = selectionMarkTones();
  for (const [name, other] of [
    ["the refuge line", refugeRingTones().ring],
    ["the immune ring", immuneRingTones().ring],
  ]) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(t.ring, other, vision);
      assert.ok(d >= JND, `the selection ring is ${d.toFixed(2)} from ${name} under ${vision}`);
    }
  }
});

test("the minimap badge clears the threshold against every lineage hue", () => {
  const tones = minimapPredatorTones();
  let worst = Infinity;
  let where = null;
  for (let hue = 0; hue < 360; hue++) {
    const prey = hslToRgb(hue, 65, 70); // exactly what drawMinimap paints prey
    for (const vision of VISION_MODELS) {
      const d = markContrast([tones.rim, tones.core], prey, vision);
      if (d < worst) {
        worst = d;
        where = `hue ${hue}, ${vision}`;
      }
    }
  }
  assert.ok(worst >= MIN_DELTA_E, `worst minimap badge ΔE ${worst.toFixed(1)} at ${where}`);
});

test("the v1.24 minimap dot did not — a predator and a prey were the same colour", () => {
  const old = { r: 255, g: 122, b: 82 };
  let worst = Infinity;
  for (let hue = 0; hue < 360; hue++) {
    for (const vision of VISION_MODELS) {
      worst = Math.min(worst, deltaE(old, hslToRgb(hue, 65, 70), vision));
    }
  }
  assert.ok(worst < 1, `expected an outright collision, got ΔE ${worst.toFixed(3)}`);
});

test("the minimap badge is a badge — a dark square with a smaller bright one in it", () => {
  const m = minimapPredatorMark();
  assert.ok(m.rimSize > m.coreSize, "the rim has to be visible around the core");
  assert.ok(m.coreSize >= 2, "the core must survive being drawn at minimap scale");
  const { rim, core } = minimapPredatorTones();
  assert.ok(toLab(core)[0] > 80);
  assert.ok(toLab(rim)[0] < 20);
});

test("markContrast reports the better tone, not the average of them", () => {
  const dark = { r: 0, g: 0, b: 0 };
  const light = { r: 255, g: 255, b: 255 };
  const grey = { r: 128, g: 128, b: 128 };
  const best = Math.max(deltaE(dark, grey), deltaE(light, grey));
  assert.equal(markContrast([dark, light], grey, "normal"), best);
  assert.equal(markContrast([grey], grey, "normal"), 0);
});

// ---- The three ways out of this world ----
//
// The v1.25 audit swept the canvas and never opened the stylesheet, where the
// mortality bar had been saying *starved* in gold and *hunted* in orange since
// v1.21. Those are the two causes the whole ledger exists to distinguish — a
// crash is either winter or predators, and the panel's job is to say which.

/** The panel and chart backgrounds these three are ever drawn on. */
const SURFACES = [
  { name: "panel", rgb: { r: 12, g: 19, b: 28 } }, // --bg-panel
  { name: "panel-2", rgb: { r: 17, g: 26, b: 38 } }, // --bg-panel-2
];

test("every pair of cause colours is distinguishable under every vision model", () => {
  const tones = mortalityTones();
  const names = Object.keys(tones);
  let worst = Infinity;
  let where = null;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (const vision of VISION_MODELS) {
        const d = deltaE(tones[names[i]], tones[names[j]], vision);
        if (d < worst) {
          worst = d;
          where = `${names[i]}/${names[j]}, ${vision}`;
        }
      }
    }
  }
  assert.ok(worst >= MIN_DELTA_E, `worst cause pair ΔE ${worst.toFixed(1)} at ${where}`);
});

test("the v1.25 cause colours did not — starved and hunted collided", () => {
  // The exact pair that shipped in style.css from v1.21 to v1.25.
  const starve = { r: 0xd2, g: 0xa1, b: 0x3c };
  const hunted = { r: 0xff, g: 0x7a, b: 0x4d };
  let worst = Infinity;
  for (const vision of VISION_MODELS) {
    worst = Math.min(worst, deltaE(starve, hunted, vision));
  }
  assert.ok(worst < 10, `expected a collision, got ΔE ${worst.toFixed(1)}`);
  // Grey age was never the problem — it is the one nobody has to identify in a
  // hurry, and it was the only one safely separated.
  const aged = { r: 0x8b, g: 0x93, b: 0xa7 };
  let agedWorst = Infinity;
  for (const vision of VISION_MODELS) {
    agedWorst = Math.min(agedWorst, deltaE(starve, aged, vision), deltaE(hunted, aged, vision));
  }
  assert.ok(agedWorst >= MIN_DELTA_E, `age was fine, but scored ${agedWorst.toFixed(1)}`);
});

test("each cause colour stands off the surface it is drawn on", () => {
  // Three colours that are all mutually distinct and all nearly the background
  // is the fourth way this can fail, and the strip is small enough that it
  // would fail quietly.
  const tones = mortalityTones();
  for (const [name, rgb] of Object.entries(tones)) {
    for (const surface of SURFACES) {
      for (const vision of VISION_MODELS) {
        const d = deltaE(rgb, surface.rgb, vision);
        assert.ok(
          d >= 40,
          `${name} on ${surface.name} is ΔE ${d.toFixed(1)} under ${vision}`
        );
      }
    }
  }
});

// ---- the body-size figure (v1.104) ----
//
// Three borrowed inks in one picture, and the point of measuring them is that
// reuse inherits a *background* audit and not a *neighbour* audit. The
// population line was measured against this panel in v1.25, the cause colours
// in v1.25 and the refuge ring against the pond in v1.69; no two of the three
// had ever been drawn in one figure, so no pair had ever been asked.

test("the body-size figure's three inks are told apart from each other", () => {
  const tones = sizePlotTones();
  const names = Object.keys(tones);
  let worst = Infinity;
  let where = null;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (const vision of VISION_MODELS) {
        const d = deltaE(tones[names[i]], tones[names[j]], vision);
        if (d < worst) {
          worst = d;
          where = `${names[i]}/${names[j]}, ${vision}`;
        }
      }
    }
  }
  assert.ok(worst >= MIN_DELTA_E, `worst pair in the size figure is ΔE ${worst.toFixed(1)} at ${where}`);
});

test("each of them stands off the panel it is drawn on", () => {
  // The same 40 the cause colours are held to, and for the same reason: three
  // mutually distinct colours that are all nearly the background is a fourth
  // way for a small figure to fail quietly.
  for (const [name, rgb] of Object.entries(sizePlotTones())) {
    for (const surface of SURFACES) {
      for (const vision of VISION_MODELS) {
        const d = deltaE(rgb, surface.rgb, vision);
        assert.ok(d >= 40, `${name} on ${surface.name} is ΔE ${d.toFixed(1)} under ${vision}`);
      }
    }
  }
});

test("the figure borrows its inks rather than minting them", () => {
  // The claim `sizeplot.js` opens with, as an assertion: every colour in that
  // figure is a colour something else on this page already draws, so a change
  // to one of the three moves both surfaces together and neither can drift.
  const tones = sizePlotTones();
  assert.deepEqual(tones.grazer, chartLineTones().pop);
  assert.deepEqual(tones.carnivore, mortalityTones().predation);
  assert.deepEqual(tones.refuge, refugeRingTones().ring);
});

test("the cause colours are ordered by luminance, which is the channel that survives", () => {
  // Starvation pale, age mid, predation deep. Luminance is untouched by any
  // colour vision deficiency, so an ordering carried in L* is one a dichromat
  // reads exactly as everyone else does — and the strip stacks in this order.
  const tones = mortalityTones();
  const L = (c) => toLab(c)[0];
  assert.ok(L(tones.starvation) > L(tones.age) + 15);
  assert.ok(L(tones.age) > L(tones.predation) + 12);
});

test("the colours the DOM is painted with are the colours that were measured", () => {
  // mortalityColours() feeds main.js; mortalityTones() feeds these tests. If
  // they ever drift, every assertion above is measuring a colour nobody sees.
  const css = mortalityColours();
  const tones = mortalityTones();
  assert.deepEqual(Object.keys(css), Object.keys(tones));
  for (const [name, text] of Object.entries(css)) {
    const m = text.match(/^hsl\((\d+), (\d+)%, (\d+)%\)$/);
    assert.ok(m, `${name} is not a plain hsl() this test can parse: ${text}`);
    assert.deepEqual(hslToRgb(Number(m[1]), Number(m[2]), Number(m[3])), tones[name]);
  }
});

// ---- Enriched ground (v1.27) ----
//
// The fourth thing drawn under the water, and the first that moves. It has to be
// told apart from the three static ones, and the dangerous confusion is with the
// biomes: both are claims about where food comes from, and a watcher who mixes
// them up reads the map backwards.
//
// The v1.25 lesson is the method here — measure the *composited* result against
// its actual background, over the whole range of states that background can
// take. Enriched ground can be drawn over the seasonal veil at either extreme,
// over any point of the terrain ramp (with or without a contour line), and over
// the biome glow, in any combination.

/** The seasonal veil the scene is cleared with, at season phase 0..1. */
function veil(phase) {
  return {
    r: Math.round(6 + 4 * phase),
    g: Math.round(10 + 4 * phase),
    b: Math.round(20 - 8 * phase),
  };
}

/**
 * The biome glow at `t` of its drawn radius: additive, as render.js draws it.
 *
 * The default is the centre, which is what this list has always modelled — and
 * until v1.93 it modelled it with a hand-copy of the literal in `render.js`,
 * which is the arrangement v1.57 found in the minimap's pellet and v1.61 wrote a
 * test against. It is the palette's glow now, and the parameter is the other
 * half of the correction: the mark is a *ramp*, so every ground between bare
 * water and the centre is a ground something can be drawn over too.
 */
function overBiome(bg, t = 0) {
  const glow = pondBiomeGlow();
  return addOver(bg, glow.rgb, glow.alpha * biomeGlowFalloff(t));
}

/** The terrain ramp at roughness r, with or without a contour line on it. */
function overTerrain(bg, r, contour) {
  let cr = 24 + 84 * r;
  let cg = 42 + 76 * r;
  let cb = 54 + 84 * r;
  let a = 0.03 + 0.13 * r;
  if (contour) {
    cr += 26;
    cg += 34;
    cb += 40;
    a = Math.min(0.34, a + 0.1);
  }
  return blendOver(bg, { r: cr, g: cg, b: cb }, a);
}

/** Every background enriched ground can appear on, named. */
function soilBackgrounds() {
  const out = [];
  for (const phase of [0, 1]) {
    const v = veil(phase);
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      for (const contour of [false, true]) {
        const ground = overTerrain(v, r, contour);
        const tag = `season ${phase} terrain ${r}${contour ? "+contour" : ""}`;
        out.push({ name: tag, rgb: ground });
        out.push({ name: `${tag} +biome`, rgb: overBiome(ground) });
        // Half-way out along the glow's ramp: a ground this list did not have
        // until v1.93, because it modelled the glow as one value.
        out.push({ name: `${tag} +biome edge`, rgb: overBiome(ground, 0.5) });
      }
    }
    out.push({ name: `season ${phase} flat`, rgb: v });
    out.push({ name: `season ${phase} flat +biome`, rgb: overBiome(v) });
    out.push({ name: `season ${phase} flat +biome edge`, rgb: overBiome(v, 0.5) });
  }
  return out;
}

/** Enriched ground of the given richness, composited onto a background. */
function soilOver(bg, richness) {
  const tint = detritusTint(richness);
  return blendOver(bg, tint, tint.a);
}

/**
 * Every ground rock can be drawn *beside* — the same set enriched ground is
 * audited on, plus soil and the hazard field, because rock is drawn over both
 * of those and therefore borders them.
 */
function rockBackgrounds() {
  const out = [];
  for (const { name, rgb } of soilBackgrounds()) {
    out.push({ name, rgb });
    out.push({ name: `${name} +soil`, rgb: soilOver(rgb, 1) });
    out.push({ name: `${name} +hazard`, rgb: hazardOver(rgb, HAZARD_AUDIT_SOURCES) });
  }
  return out;
}

test("rock reads as rock against every ground it can border", () => {
  // Rock is opaque, so unlike every other layer under the water there is no
  // compositing lottery here — the only question is whether the one tone it has
  // can be told from the water beside it, everywhere and by everyone.
  const { fill } = barrierRockTones();
  let worst = { d: Infinity };
  for (const { name, rgb } of rockBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(fill, rgb, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `rock scores only ${worst.d.toFixed(1)} on ${worst.name} (${worst.vision})`
  );
});

test("a darker stone would have failed — the lightness is a measurement", () => {
  // Pins the failure alongside the pass (v1.24's rule). The chosen stone scores
  // 29.7; the same hue four steps darker scores 21.5 and would leave a wall you
  // have to look for in a scene whose whole subject is a near-black deep.
  const dim = hslToRgb(210, 8, 44);
  let worst = Infinity;
  for (const { rgb } of rockBackgrounds()) {
    for (const vision of VISION_MODELS) worst = Math.min(worst, deltaE(dim, rgb, vision));
  }
  assert.ok(
    worst < MIN_DELTA_E,
    `a darker stone clears the bar after all (${worst.toFixed(1)}) — the note in palette.js is wrong`
  );
});

test("a warm stone was possible, and the note says so", () => {
  // The other half, and the reason this pair exists: I had written "rock cannot
  // be warm" into palette.js before checking, which is exactly the claim v1.29
  // says costs the most to get wrong. It is false — a pale sandstone clears the
  // bar comfortably — so the palette note now gives a judgement as a judgement.
  // If this ever fails, the *note* is what needs rewriting, not the colour.
  let best = 0;
  for (let hue = 20; hue <= 60; hue += 5) {
    for (let sat = 10; sat <= 30; sat += 10) {
      for (let light = 60; light <= 80; light += 2) {
        const candidate = hslToRgb(hue, sat, light);
        let worst = Infinity;
        for (const { rgb } of rockBackgrounds()) {
          for (const vision of VISION_MODELS) {
            worst = Math.min(worst, deltaE(candidate, rgb, vision));
          }
        }
        best = Math.max(best, worst);
      }
    }
  }
  assert.ok(best >= MIN_DELTA_E, `no warm stone clears the bar (best ${best.toFixed(1)})`);
});

test("enriched ground reads against every background it can be drawn on", () => {
  let worst = { d: Infinity };
  for (const { name, rgb } of soilBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(soilOver(rgb, 1), rgb, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `full nutrient scores only ${worst.d.toFixed(1)} on ${worst.name} (${worst.vision})`
  );
});

test("half-enriched ground reads too, which is where the ground mostly sits", () => {
  let worst = { d: Infinity };
  for (const { name, rgb } of soilBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(soilOver(rgb, 0.5), rgb, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `half nutrient scores only ${worst.d.toFixed(1)} on ${worst.name} (${worst.vision})`
  );
});

test("enriched ground cannot be mistaken for a biome — the confusion that matters", () => {
  let worst = { d: Infinity };
  for (const phase of [0, 1]) {
    for (const r of [0, 0.5, 1]) {
      const ground = overTerrain(veil(phase), r, false);
      const soil = soilOver(ground, 1);
      const fertile = overBiome(ground);
      for (const vision of VISION_MODELS) {
        const d = deltaE(soil, fertile, vision);
        if (d < worst.d) worst = { d, vision, where: `season ${phase} terrain ${r}` };
      }
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `soil vs biome is only ${worst.d.toFixed(1)} at ${worst.where} (${worst.vision})`
  );
});

test("a quieter tint would have failed — the opacity is a measurement, not a taste", () => {
  // Pins the reason DETRITUS_MAX_ALPHA is what it is. At 0.5 the half-richness
  // case misses the bar; a suite that only knew the passing number would let
  // someone dim the layer back down and stay green.
  const dim = (richness) => {
    const t = detritusTint(richness);
    return { ...t, a: (t.a / DETRITUS_MAX_ALPHA) * 0.5 };
  };
  let worst = Infinity;
  for (const { rgb } of soilBackgrounds()) {
    const t = dim(0.5);
    for (const vision of VISION_MODELS) {
      worst = Math.min(worst, deltaE(blendOver(rgb, t, t.a), rgb, vision));
    }
  }
  assert.ok(worst < MIN_DELTA_E, `a 0.5 alpha would have scored ${worst.toFixed(1)}`);
});

test("nutrient is carried in opacity, and bare ground is drawn not at all", () => {
  assert.equal(detritusTint(0).a, 0);
  assert.equal(detritusTint(1).a, DETRITUS_MAX_ALPHA);
  // Monotone, clamped, and the same hue throughout: richness is a quantity, so
  // it may not change what colour the ground claims to be.
  let prev = -1;
  for (const r of [0, 0.1, 0.3, 0.5, 0.8, 1]) {
    const t = detritusTint(r);
    assert.ok(t.a > prev, `alpha must rise with richness (${r})`);
    prev = t.a;
    assert.deepEqual(
      { r: t.r, g: t.g, b: t.b },
      { r: detritusTint(1).r, g: detritusTint(1).g, b: detritusTint(1).b }
    );
  }
  assert.equal(detritusTint(-3).a, 0);
  assert.equal(detritusTint(9).a, DETRITUS_MAX_ALPHA);
});

test("enriched ground is the lightest thing under the water, which is why it survives", () => {
  // Luminance is the one channel no colour vision deficiency touches, so the
  // layer is required to carry its distinction there and not only in hue.
  const t = detritusTint(1);
  const bg = veil(0.5);
  const soil = blendOver(bg, t, t.a);
  const ridge = overTerrain(bg, 1, true);
  const biome = overBiome(bg);
  const L = (rgb) => toLab(rgb)[0];
  assert.ok(L(soil) > L(ridge) + 10, `soil L* ${L(soil)} vs ridge ${L(ridge)}`);
  assert.ok(L(soil) > L(biome) + 10, `soil L* ${L(soil)} vs biome ${L(biome)}`);
});

// ---- the biomes' glow, and the shape of a claim (v1.93) ----
//
// The three stops of this gradient sat in `render.js` from v1.3 to v1.93 under
// the *furniture* heading of `test/colourliterals.test.js` — no distinction to
// carry, nowhere for one to live — which is the eighth entry struck off that
// list and the seventh that was hiding something. What it was hiding is not a
// contrast: at its centre the glow is over the just-noticeable difference on
// every ground and under `MIN_DELTA_E` on all of them, which is the correct
// register for a field. It is the *shape*. A gradient is a ramp, a ramp is a
// curve, and this one was two straight segments standing in for the Gaussian
// that decides where food actually goes.
//
// So these tests hold the picture to the rule (the falloff is `at()`'s own,
// checked against the module rather than against a copy of the formula), and
// they hold the edge to the eye (the drawn radius is where the ramp stops being
// visible, squeezed from both sides).

/** A one-biome fertility landscape, so `at()` describes a single bump. */
function oneBiome() {
  const config = makeConfig({ patchCount: 1, seed: 4 });
  return { field: new FertilityField(config, new RNG(4)), config };
}

test("the glow's ramp is the fertility rule, not a shape that resembles it", () => {
  // The test the old gradient could not have passed: its alpha fell to 37.5% of
  // peak where the rule was still at 55.7%, and to nothing where the rule was at
  // 19.8%. Read out of `environment.js` rather than re-typed here — a picture
  // checked against a copy of the formula it draws is two copies of one guess.
  const { field, config } = oneBiome();
  const centre = field.centres[0];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const r = t * BIOME_GLOW_SPAN * config.patchRadius;
    const fertility = field.at(centre.x + r, centre.y);
    const excess = (fertility - config.patchFloor) / (1 - config.patchFloor);
    assert.ok(
      Math.abs(excess - biomeGlowFalloff(t)) < 1e-9,
      `at ${t.toFixed(2)} of the drawn radius the ground is ${excess.toFixed(4)} of the way up and the glow is ${biomeGlowFalloff(t).toFixed(4)}`
    );
  }
});

test("the glow ends where a watcher stops seeing it — a squeeze, not a radius", () => {
  // A gradient is truncated at its radius, so whatever alpha the ramp has
  // reached there becomes a hard step to nothing. 1.8σ (v1.3–v1.93) cut at an
  // alpha still worth ΔE 2.97 on the ground it shows most, which is a ring the
  // rule has no edge at. Both halves are asserted: the span that shipped is
  // invisible everywhere, and a tenth of a σ shorter is not.
  const edgeDelta = (span) => {
    const glow = pondBiomeGlow();
    const alpha = glow.alpha * Math.exp(-(span * span) / 2);
    let worst = 0;
    for (const { rgb } of soilBackgrounds()) {
      for (const vision of VISION_MODELS) {
        worst = Math.max(worst, deltaE(addOver(rgb, glow.rgb, alpha), rgb, vision));
      }
    }
    return worst;
  };
  const here = edgeDelta(BIOME_GLOW_SPAN);
  assert.ok(here < JND, `the drawn edge is visible at ΔE ${here.toFixed(2)}`);
  const shorter = edgeDelta(BIOME_GLOW_SPAN - 0.1);
  assert.ok(shorter >= JND, `a span of ${BIOME_GLOW_SPAN - 0.1} would also have been invisible (${shorter.toFixed(2)})`);
});

test("the glow is visible at its centre and quiet enough to be a field", () => {
  // Both bars, in the register a field belongs in. Over the just-noticeable
  // difference everywhere, so the picture says *something* about fertile water;
  // under MIN_DELTA_E everywhere, because this is a hint about the ground and
  // not a mark to be told from another mark — the pond's own marks are drawn on
  // top of it and the next test is what protects them.
  let worst = { d: Infinity };
  let loudest = 0;
  for (const { name, rgb } of soilBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(overBiome(rgb), rgb, vision);
      if (d < worst.d) worst = { d, name, vision };
      loudest = Math.max(loudest, d);
    }
  }
  assert.ok(worst.d >= JND, `the glow scores only ${worst.d.toFixed(2)} on ${worst.name} (${worst.vision})`);
  assert.ok(loudest < MIN_DELTA_E, `the glow reached ${loudest.toFixed(1)}, which is a mark's register, not a field's`);
});

test("nothing drawn on fertile water is swallowed by the glow", () => {
  // The constraint that keeps `BIOME_GLOW_PEAK` where it is. A pellet is the
  // thing a watcher is looking *for* in a biome, so the glow that advertises the
  // biome may not hide it — measured over the whole ramp, and over the worst
  // stack four overlapping biomes can build (the picture adds where the rule
  // takes a max, so the brightest fertile water is 0.412 of ink, not 0.16).
  const mote = foodMote();
  let worst = { d: Infinity };
  for (const { name, rgb } of soilBackgrounds()) {
    for (const t of [0, 0.5, 1]) {
      const glow = overBiome(rgb, t);
      for (const vision of VISION_MODELS) {
        const d = deltaE(addOver(glow, mote, mote.a), glow, vision);
        if (d < worst.d) worst = { d, name: `${name} @${t}`, vision };
      }
    }
    const stack = addOver(rgb, pondBiomeGlow().rgb, 0.412);
    for (const vision of VISION_MODELS) {
      const d = deltaE(addOver(stack, mote, mote.a), stack, vision);
      if (d < worst.d) worst = { d, name: `${name} +stack`, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `a mote on the glow scores only ${worst.d.toFixed(1)} on ${worst.name} (${worst.vision})`
  );
});

test("the gradient's chords are a resolution, not an approximation", () => {
  // A canvas interpolates linearly between stops, so `BIOME_GLOW_STOPS` decides
  // how closely the drawn ramp follows the curve above. Nine puts the worst
  // chord two orders of magnitude under the just-noticeable difference; the
  // assertion is on what the error is *worth*, because an alpha tolerance is a
  // number and a ΔE is the thing a watcher has.
  const stops = biomeGlowStops();
  assert.equal(stops.length, BIOME_GLOW_STOPS);
  assert.equal(stops[0].alpha, BIOME_GLOW_PEAK);
  const glow = pondBiomeGlow();
  let worst = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    for (let s = 0; s <= 50; s++) {
      const k = s / 50;
      const chord = a.alpha + (b.alpha - a.alpha) * k;
      const truth = glow.alpha * biomeGlowFalloff(a.offset + (b.offset - a.offset) * k);
      for (const { rgb } of soilBackgrounds()) {
        for (const vision of VISION_MODELS) {
          worst = Math.max(
            worst,
            deltaE(addOver(rgb, glow.rgb, chord), addOver(rgb, glow.rgb, truth), vision)
          );
        }
      }
    }
  }
  assert.ok(worst < JND, `the linear chords cost ΔE ${worst.toFixed(2)}, which a watcher can see`);
});

test("one ink along the ramp, so the measured glow and the painted one agree", () => {
  // The old gradient drifted from rgb(30, 78, 66) to rgb(30, 70, 62) on the way
  // out, and a canvas is specified to interpolate stops in *premultiplied*
  // space — so a ramp that moves in both colour and alpha is a slightly
  // different picture from the one this file composites. With a constant ink the
  // two readings coincide, which is a difference between the instrument and the
  // browser that nobody here had noticed was available to have.
  for (const s of biomeGlowStops()) {
    assert.equal(s.css, `rgba(30, 78, 66, ${Number(s.alpha.toFixed(4))})`);
  }
});

test("both views of one feature are audible, and they are not equally loud", () => {
  // The pair `minimapBiomeWash` has named in prose since v1.57 and nobody had
  // measured: the same biome, drawn twice. Each against its own water, worst
  // case over every vision model — the assertion is that neither view is silent,
  // because which loudness is *right* is not a question a ΔE answers.
  let pond = Infinity;
  for (const { rgb } of soilBackgrounds()) {
    for (const vision of VISION_MODELS) pond = Math.min(pond, deltaE(overBiome(rgb), rgb, vision));
  }
  const water = minimapWater();
  const wash = minimapBiomeWash();
  let map = Infinity;
  for (const vision of VISION_MODELS) {
    map = Math.min(map, deltaE(blendOver(water, wash, wash.a), water, vision));
  }
  assert.ok(pond >= JND, `the pond's glow is inaudible at ${pond.toFixed(2)}`);
  assert.ok(map >= JND, `the little map's wash is inaudible at ${map.toFixed(2)}`);
  assert.ok(map > pond, `the two views have converged (${map.toFixed(2)} vs ${pond.toFixed(2)}) — re-read the note on minimapBiomeWash`);
});

// ---- Corpses (v1.55) ----
//
// The last mark in the pond the audit had never touched, and the one that
// makes its own background: detritus is minted where things die, so a corpse
// lies on enriched ground by construction. Its domain is therefore the soil
// sweep above — plus every one of those grounds with a food mote already on
// it, because a corpse and a pellet are both small discs and a watcher has to
// tell the scavenger's meal from the grazer's.

/** Every ground a corpse can lie on, and every one of them with a mote on it. */
function corpseBackgrounds() {
  const out = [];
  for (const { name, rgb } of soilBackgrounds()) {
    for (const richness of [0, 0.25, 0.5, 0.75, 1]) {
      const ground = richness ? soilOver(rgb, richness) : rgb;
      const tag = richness ? `${name} soil ${richness}` : name;
      for (const zone of [false, true]) {
        const g = zone ? hazardOver(ground, HAZARD_AUDIT_SOURCES) : ground;
        const t2 = zone ? `${tag} +zone` : tag;
        out.push({ name: t2, rgb: g });
        const m = foodMote();
        out.push({ name: `${t2} +mote`, rgb: addOver(g, m, m.a) });
      }
    }
  }
  return out;
}

test("a corpse reads against every ground it can lie on, including the one it makes", () => {
  const { core, ring } = corpseMarkTones();
  let worst = { d: Infinity };
  for (const { name, rgb } of corpseBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = markContrast([core, ring], rgb, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `a corpse scores only ${worst.d.toFixed(1)} on ${worst.name} (${worst.vision})`
  );
});

test("the maroon splotch did not — it was the colour of the soil it rots into", () => {
  // The failure, pinned (v1.25's rule): a suite that only knows the new numbers
  // stays green while someone restores the old colour. `rgba(150, 55, 48, a)`
  // over enriched ground, at *every* opacity the ramp could reach including its
  // maximum, was not faint — it was the same colour for all three dichromacies.
  const old = { r: 150, g: 55, b: 48 };
  const worst = Object.fromEntries(VISION_MODELS.map((v) => [v, Infinity]));
  for (const { rgb } of soilBackgrounds()) {
    for (const richness of [0.25, 0.5, 0.75, 1]) {
      for (const zone of [false, true]) {
        const bare = soilOver(rgb, richness);
        const soil = zone ? hazardOver(bare, HAZARD_AUDIT_SOURCES) : bare;
        for (const alpha of [0.15, 0.35, 0.7]) {
          const drawn = blendOver(soil, old, alpha);
          for (const vision of VISION_MODELS) {
            worst[vision] = Math.min(worst[vision], deltaE(drawn, soil, vision));
          }
        }
      }
    }
  }
  // Two different failures, and only one of them is about colour blindness. On
  // its *worst* enriched ground the mark missed the bar for everybody — that is
  // the general case, and it is why this is filed as legibility rather than as
  // CVD (v1.46's lesson: check the trichromat first).
  assert.ok(
    worst.normal < MIN_DELTA_E,
    `the old splotch's worst soil scored ${worst.normal.toFixed(1)} under normal vision — above the bar`
  );
  // For a dichromat it was not faint anywhere but *identical* somewhere, at
  // every opacity including the maximum. A bound of "under the bar" would still
  // pass for a mark scoring 20, so the collision is what gets pinned.
  for (const vision of CVD_TYPES) {
    assert.ok(
      worst[vision] < 0.5,
      `the old splotch's best case under ${vision} was ${worst[vision].toFixed(1)}, not a collision`
    );
  }
});

test("a food mote stays a food mote on top of a corpse — the constraint that picked the ring", () => {
  // v1.43's lesson is that a mark's domain is what is drawn *over* it as well
  // as what is beside it, and this is the check that binds: the mote is
  // additive, so a ring any lighter clamps it out of existence. It clears the
  // bar by 0.6, which is why the ring is bone rather than cream.
  const m = foodMote();
  const tones = corpseMarkTones();
  let worst = { d: Infinity };
  for (const [name, tone] of Object.entries(tones)) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(addOver(tone, m, m.a), tone, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `a mote on the corpse's ${worst.name} scores only ${worst.d.toFixed(1)} (${worst.vision})`
  );
});

test("a brighter ring would have failed that check — the lightness is a measurement", () => {
  // The squeeze, so the number above reads as a constraint rather than a taste.
  // Lighter than 76% and the mote on top stops being legible; the ground sweep
  // on its own would happily have taken 84%.
  const m = foodMote();
  for (const l of [80, 84, 88]) {
    const brighter = hslToRgb(50, 40, l);
    const worst = Math.min(...VISION_MODELS.map((v) => deltaE(addOver(brighter, m, m.a), brighter, v)));
    assert.ok(worst < MIN_DELTA_E, `a ring at lightness ${l} would have kept the mote (${worst.toFixed(1)})`);
  }
});

test("a corpse carries a light tone and a dark one, which is what makes it background-proof", () => {
  const { core, ring } = corpseMarkTones();
  const L = (rgb) => toLab(rgb)[0];
  assert.ok(L(core) < 15, `the core is not dark enough: L* ${L(core).toFixed(1)}`);
  assert.ok(L(ring) > 75, `the ring is not light enough: L* ${L(ring).toFixed(1)}`);
  // And the two are far apart under every model, or the mark is one tone.
  for (const vision of VISION_MODELS) {
    assert.ok(deltaE(core, ring, vision) >= MIN_DELTA_E, `the two tones collide under ${vision}`);
  }
});

test("how much meat is left moves the mark's size, not its opacity", () => {
  // v1.34's rule, and the reason this release exists: the old ramp spent
  // opacity on degree and 27.4% of all corpse-frames sat below 0.35 of it.
  const empty = corpseMark(0);
  const full = corpseMark(CORPSE_FULL_MEAT);
  assert.ok(full.radius > empty.radius, "a fresh corpse is not drawn larger than a spent one");
  assert.equal(empty.core, full.core, "the core tone moved with the meat");
  assert.equal(empty.ring, full.ring, "the ring tone moved with the meat");
  for (const tone of [empty.core, empty.ring, full.core, full.ring]) {
    assert.ok(!/rgba|hsla/.test(tone), `${tone} is translucent — a corpse's tones must be opaque`);
  }
  // Clamped at both ends, and the ring is always a real share of the mark.
  assert.equal(corpseMark(-5).radius, empty.radius);
  assert.equal(corpseMark(CORPSE_FULL_MEAT * 4).radius, full.radius);
  assert.ok(empty.ringWidth > 0 && empty.ringWidth < 1);
});

// ---- Corpses in the corner (v1.57) ----
//
// v1.55 audited the corpse against every ground *the pond* draws it on, and the
// minimap did not draw it at all — so the sweep was complete and the surface was
// missing, which is the v1.23/v1.25 shape one more time. Now that the little map
// draws the dead, their two tones have a second domain: the map's own grounds,
// the rock they can lie against, and the marks a watcher has to tell them from.

// The minimap's water, its biome wash and its prey dot were three constants in
// this file until v1.61 — hand-copies of colours three other lines of
// `minimap.js` draw. v1.26's rule is that a colour a test cannot reach will
// drift; a test that reaches for its *own copy* of the colour is the same bug
// with the failure moved into the instrument, where it reads as a pass.

/** `rgb(r, g, b)` back to `{r,g,b}`, so a mark stored as a CSS string is measurable. */
function rgbToneOf(css) {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  assert.ok(m, `${css} is not a plain rgb() this audit can measure`);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

/** Every ground the minimap can put under a corpse. */
function minimapCorpseBackgrounds() {
  const out = [];
  for (const { name, rgb } of minimapGrounds()) {
    out.push({ name, rgb });
    out.push({ name: `${name} +zone`, rgb: hazardOver(rgb, HAZARD_AUDIT_SOURCES) });
  }
  // Nothing can *die* inside rock, but a corpse a few world pixels from a wall
  // is a square drawn over one at a fifth of the scale. v1.55's rule was to ask
  // what the world puts underneath a mark; at this size the answer includes the
  // neighbours.
  out.push({ name: "rock", rgb: barrierRockTones().fill });
  out.push({ name: "rock edge", rgb: barrierRockTones().edge });
  return out;
}

test("a corpse reads against every ground the little map can draw it on", () => {
  const { rim, core } = minimapCorpseMark();
  const tones = [rgbToneOf(rim), rgbToneOf(core)];
  let worst = { d: Infinity };
  for (const { name, rgb } of minimapCorpseBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = markContrast(tones, rgb, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `a corpse scores only ${worst.d.toFixed(1)} on the minimap's ${worst.name} (${worst.vision})`
  );
});

test("a corpse is not any of the things the minimap draws beside it", () => {
  // The mistake the v1.24 dot made: at this size everything is a square of a few
  // pixels, so the marks are each other's backgrounds. Every lineage hue, the
  // pellet, and both tones of the hunter's badge.
  const { rim, core } = minimapCorpseMark();
  const tones = [rgbToneOf(rim), rgbToneOf(core)];
  const neighbours = [];
  for (let hue = 0; hue < 360; hue++) {
    neighbours.push({ name: `prey hue ${hue}`, rgb: minimapPreyDotRgb(hue) });
  }
  // The pellet, as v1.57 left it: the pond's own mote, drawn additively. This
  // line held `rgba(80, 205, 140, 0.5)` — the wash v1.57 *removed* — for three
  // releases, so the corpse was being checked against a pellet the little map
  // had stopped drawing.
  const mote = foodMote();
  neighbours.push({ name: "pellet", rgb: addOver(minimapWater(), mote, mote.a) });
  for (const [n, rgb] of Object.entries(minimapPredatorTones())) {
    neighbours.push({ name: `hunter ${n}`, rgb });
  }
  let worst = { d: Infinity };
  for (const { name, rgb } of neighbours) {
    for (const vision of VISION_MODELS) {
      const d = markContrast(tones, rgb, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `a corpse scores only ${worst.d.toFixed(1)} against the ${worst.name} (${worst.vision})`
  );
});

// The corpse's arrival is what put a pellet on a bright background here for the
// first time, and the pellet turned out not to survive one. The minimap had its
// own copy of the mote — `rgba(80, 205, 140, 0.5)`, a flat wash, a literal in
// `minimap.js` no test could reach — and a wash reads against the water and
// against nothing else. So the pellet is the pond's `foodMote()` now, drawn the
// way the pond draws it, and these three tests are the audit it never had.

/** Everything the little map can put *under* a pellet. */
function minimapMoteBackgrounds() {
  const out = [];
  for (const { name, rgb } of minimapCorpseBackgrounds()) out.push({ name, rgb });
  const { core, ring } = corpseMarkTones();
  out.push({ name: "corpse bone", rgb: ring }, { name: "corpse core", rgb: core });
  return out;
}

test("a pellet reads on every ground the minimap can draw under it, corpses included", () => {
  const m = foodMote();
  let worst = { d: Infinity };
  for (const { name, rgb } of minimapMoteBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(addOver(rgb, m, m.a), rgb, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `a pellet scores only ${worst.d.toFixed(1)} on the minimap's ${worst.name} (${worst.vision})`
  );
  // And the binding case is the corpse's bone at 25.6 — the same constraint,
  // to the same tenth, that picked that lightness in the pond (v1.55). Once the
  // little map does the pond's arithmetic it inherits the pond's tight spot.
  assert.ok(worst.name.startsWith("corpse"), `the binding ground is ${worst.name}, not the corpse`);
  assert.ok(worst.d < 26, `the constraint has gone slack at ${worst.d.toFixed(1)}`);
});

test("the flat wash did not — it was legible on water and on almost nothing else", () => {
  // The failure, pinned. A future me tidying this back into one `fillStyle`
  // string restores a pellet that vanishes on two thirds of its own map.
  const old = { r: 80, g: 205, b: 140 };
  const washed = ({ rgb }) =>
    Math.min(...VISION_MODELS.map((v) => deltaE(blendOver(rgb, old, 0.5), rgb, v)));
  // Stated as classes rather than as a count: what the wash could not survive
  // was everything this map has learned to draw since v1.27 — enriched ground
  // at any richness, either tone of rock, and now the dead. Bare water and
  // plain terrain, the grounds it was chosen against in v1.19, are the only
  // ones it reliably cleared, and the brightest of the tinted waters caught it
  // too (a biome under the contagious zone, at 23.2).
  const domain = minimapMoteBackgrounds();
  const bright = (g) => /soil|rock|corpse bone/.test(g.name) && !/zone/.test(g.name);
  for (const g of domain.filter(bright)) {
    assert.ok(washed(g) < MIN_DELTA_E, `the wash on ${g.name} scored ${washed(g).toFixed(1)}`);
  }
  // 32 of the 70 grounds in this domain, as a lower bound rather than a
  // number: a future domain can only be larger.
  const failed = domain.filter((g) => washed(g) < MIN_DELTA_E);
  assert.ok(failed.length >= 32, `only ${failed.length} of ${domain.length} failed`);
  // Worst of all on the mark this release added, which is how it was found.
  const bone = corpseMarkTones().ring;
  const onBone = Math.min(...VISION_MODELS.map((v) => deltaE(blendOver(bone, old, 0.5), bone, v)));
  assert.ok(onBone < 5, `a wash on bone scored ${onBone.toFixed(1)} — not the collision this was`);
});

test("the corpse badge is the pond's colour and the hunter's geometry, inverted", () => {
  const dead = minimapCorpseMark();
  const pond = corpseMarkTones();
  // Built from the pond's tones rather than copied out of them: a colour a test
  // cannot reach is a colour that will drift, and two views disagreeing about
  // what a corpse looks like is the v1.23 failure in a palette.
  assert.equal(dead.rim, rgbCss(pond.ring));
  assert.equal(dead.core, rgbCss(pond.core));
  assert.ok(!/rgba|hsla/.test(dead.rim + dead.core), "the two tones must be opaque");
  assert.ok(dead.rimSize > dead.coreSize, "the outer tone has to show around the inner one");

  // The inversion, stated as an assertion rather than as a comment: the hunter
  // is dark outside and pale inside, the corpse pale outside and dark inside.
  const hunter = minimapPredatorTones();
  const L = (rgb) => toLab(rgb)[0];
  assert.ok(L(hunter.rim) < 20 && L(hunter.core) > 80, "the hunter's badge is dark around pale");
  assert.ok(L(pond.ring) > 75 && L(pond.core) < 15, "the corpse's badge is pale around dark");
});

test("and the colours could not have carried that distinction — which is why the shapes do", () => {
  // Pinning the thing that is *not* true (v1.25's rule, aimed at a design
  // decision rather than at an old colour): the two pale tones are the two
  // brightest marks on the map and they are nowhere near `MIN_DELTA_E` apart.
  // If a future me deletes the geometry and leaves the colours to it, this fails.
  const pale = corpseMarkTones().ring;
  const hunterPale = minimapPredatorTones().core;
  let worst = 0;
  for (const vision of VISION_MODELS) worst = Math.max(worst, deltaE(pale, hunterPale, vision));
  assert.ok(
    worst < MIN_DELTA_E,
    `the two pale tones score ${worst.toFixed(1)} — if that clears the bar the inversion is optional`
  );
  assert.equal(minimapCorpseMark().rimSize < minimapPredatorMark().rimSize, true, "and the corpse is the smaller badge");
});

// ---- The two marks drawn last (v1.73) ----
//
// The frame that says where the camera is pointed and the square that says
// which creature is selected are the top two layers of this map, and both were
// single translucent near-whites that no audit had ever measured — the last two
// entries on v1.61's list. The reasons they survived are the *sentences* that
// list carried, which is v1.70's finding one entry earlier: the frame was "a
// near-white stroke over anything the little map can draw" and the square was
// filed under furniture, "the loudest thing available … carries no distinction
// beyond 'this one'". Near-white is a claim about the mark; loudest is a claim
// about the map. Neither is a number, and the second one stopped being true in
// v1.57, when the pellet became the pond's *additive* mote.
//
// Their domain is everything, because they are drawn last: every ground, every
// field over it, and every mark the map paints — at this scale the marks are
// each other's backgrounds (v1.57), and the topmost mark's backgrounds are all
// of them.

/** Everything the little map can leave under a mark drawn last. */
function minimapTopBackgrounds() {
  const out = [];
  const base = [];
  for (const { name, rgb } of minimapGrounds()) {
    base.push({ name, rgb });
    base.push({ name: `${name} +zone`, rgb: hazardOver(rgb, HAZARD_AUDIT_SOURCES) });
  }
  out.push(...base);
  out.push({ name: "rock", rgb: barrierRockTones().fill });
  out.push({ name: "rock edge", rgb: barrierRockTones().edge });
  const corpse = minimapCorpseMark();
  out.push({ name: "corpse rim", rgb: rgbToneOf(corpse.rim) });
  out.push({ name: "corpse core", rgb: rgbToneOf(corpse.core) });
  for (const [n, rgb] of Object.entries(minimapPredatorTones())) out.push({ name: `hunter ${n}`, rgb });
  // The crop, stacked. `minimap.js` draws pellets additively, so a fed biome
  // pushes a pixel far past the colour one pellet makes — which is the whole
  // bug, and it is invisible to a sweep that composites a single mote.
  const mote = foodMote();
  for (const g of base) {
    let c = g.rgb;
    for (let k = 1; k <= MINIMAP_PELLET_STACK; k++) {
      c = addOver(c, mote, mote.a);
      out.push({ name: `${g.name} +${k} pellet`, rgb: c });
    }
  }
  // And a prey dot in every lineage hue, over every ground: the dot is 85%
  // opaque, so its composite depends on what it is standing on.
  for (const g of base) {
    for (let hue = 0; hue < 360; hue += 5) {
      out.push({ name: `${g.name} +prey ${hue}`, rgb: blendOver(g.rgb, hslToRgb(hue, 65, 70), MINIMAP_PREY_ALPHA) });
    }
  }
  return out;
}

/**
 * The worst a two-tone mark scores over that domain. Best-of-tones against a
 * common background, which is the model every cased mark here has been scored
 * by since v1.66 — the casing is drawn a pixel away rather than under the line,
 * so this asks whether *some* tone of the mark survives the colour beneath it.
 */
function worstOnTop(tones) {
  let worst = { d: Infinity };
  for (const { name, rgb } of minimapTopBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = markContrast(tones, rgb, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  return worst;
}

test("the frame and the selection square read against everything drawn under them", () => {
  for (const [what, tones] of [
    ["frame", minimapViewportTones()],
    ["selection", minimapSelectionTones()],
  ]) {
    const worst = worstOnTop(Object.values(tones));
    assert.ok(
      worst.d >= MIN_DELTA_E,
      `the ${what} scores only ${worst.d.toFixed(1)} on ${worst.name} (${worst.vision})`
    );
  }
});

test("the single near-whites did not — a fed biome erased both of them", () => {
  // The failure, pinned (v1.25's rule). Translucent, so the score is the
  // composite against the ground, the way the contagious zone is scored.
  const domain = minimapTopBackgrounds();
  const washed = (rgb, tone, alpha) =>
    Math.min(...VISION_MODELS.map((v) => deltaE(blendOver(rgb, tone, alpha), rgb, v)));
  for (const [what, tone, alpha, bar] of [
    ["frame", { r: 226, g: 238, b: 255 }, 0.85, 0.2],
    ["selection", { r: 255, g: 255, b: 255 }, 0.9, 0.2],
  ]) {
    const scores = domain.map((g) => washed(g.rgb, tone, alpha));
    const worst = Math.min(...scores);
    assert.ok(worst < bar, `the old ${what} scored ${worst.toFixed(2)} — not the collision this was`);
    // Not one background: a sixth of the domain, as a lower bound. A future
    // domain can only be larger, and the marks it adds will be brighter.
    const failed = scores.filter((d) => d < MIN_DELTA_E).length;
    assert.ok(failed / domain.length > 0.15, `only ${((failed / domain.length) * 100).toFixed(1)}% of backgrounds failed`);
  }
  // And the reason, which is the thing worth keeping: the map's own crop, four
  // deep, is brighter than either of them.
  const mote = foodMote();
  let bright = minimapWater();
  for (let k = 0; k < MINIMAP_PELLET_STACK; k++) bright = addOver(bright, mote, mote.a);
  assert.ok(toLab(bright)[0] > 90, `a stacked patch is only L* ${toLab(bright)[0].toFixed(0)} — the premise has moved`);
});

test("a single tone would have cleared this bar, and the pair is still the mark", () => {
  // v1.70 swept HSL against the pond's backgrounds and found the best single
  // opaque colour anywhere scored 17.6 against a bar of 25 — so two tones were
  // a necessity there. This surface is the first where that is *not* true: the
  // little map's darkest ground is nearly black and its brightest pixel is
  // nearly white, but a saturated blue splits them, and hsl(240, 100%, 52%)
  // clears every background here by 56.9. The pair ships anyway, and this test
  // is the honest half of that choice — a future me is entitled to know the
  // single tone existed, and that the argument for the pair is durability
  // (this domain has grown in v1.24, v1.27, v1.34, v1.48 and v1.57) rather
  // than a number.
  const single = worstOnTop([hslToRgb(240, 100, 52)]);
  assert.ok(single.d > MIN_DELTA_E, `even the best single tone scores ${single.d.toFixed(1)} — v1.70's case, not this one`);
  // Neither half of the shipped mark works alone, which is what makes it a pair
  // rather than a line with a decoration on it.
  const { line, casing } = minimapViewportTones();
  assert.ok(worstOnTop([line]).d < 1, `the pale tone alone scores ${worstOnTop([line]).d.toFixed(2)}`);
  assert.ok(worstOnTop([casing]).d < MIN_DELTA_E, `the casing alone scores ${worstOnTop([casing]).d.toFixed(2)}`);
});

test("both marks are opaque, two-toned, and share their tones", () => {
  const frame = minimapViewport();
  const box = minimapSelection();
  for (const css of [frame.line, frame.casing, box.line, box.casing]) {
    assert.ok(!/rgba|hsla/.test(css), `${css} is translucent — a cased mark carries a dark tone, not an alpha`);
  }
  // One pale and one dark, or the casing is decoration.
  const L = (rgb) => toLab(rgb)[0];
  const { line, casing } = minimapViewportTones();
  assert.ok(L(line) > 90, `the pale tone is only L* ${L(line).toFixed(1)}`);
  assert.ok(L(casing) < 10, `the casing is L* ${L(casing).toFixed(1)} — not dark enough to be one`);
  // The two marks are the same pair on purpose: the frame is drawn *over* the
  // square, so where they cross the only thing between them is the casing, and
  // that separation is a property of the pair rather than of two near-whites
  // three ΔE apart — which is what they used to be.
  assert.deepEqual(minimapSelectionTones(), minimapViewportTones());
  const old = Math.max(...VISION_MODELS.map((v) => deltaE({ r: 226, g: 238, b: 255 }, { r: 255, g: 255, b: 255 }, v)));
  assert.ok(
    old < MIN_DELTA_E,
    `the two old tones were ${old.toFixed(1)} apart at best — if that clears the bar they were telling themselves apart`
  );
  let apart = Infinity;
  for (const v of VISION_MODELS) apart = Math.min(apart, deltaE(line, casing, v));
  assert.ok(apart >= MIN_DELTA_E, `the pale and the casing are only ${apart.toFixed(1)} apart`);
});

// ---- The energy bar (v1.29) ----
//
// A second three-segment strip in the same sidebar as the mortality one. It
// carries the harder constraint of the two: not only must its own colours be
// mutually legible and stand off the track, they must not be readable as the
// cause colours six inches above them.

test("every pair of energy-sink colours is distinguishable under every vision model", () => {
  const tones = energyTones();
  const names = Object.keys(tones);
  let worst = Infinity;
  let where = null;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (const vision of VISION_MODELS) {
        const d = deltaE(tones[names[i]], tones[names[j]], vision);
        if (d < worst) {
          worst = d;
          where = `${names[i]}/${names[j]}, ${vision}`;
        }
      }
    }
  }
  assert.ok(worst >= MIN_DELTA_E, `worst sink pair ΔE ${worst.toFixed(1)} at ${where}`);
});

test("no energy colour can be read as a cause colour", () => {
  // The constraint that made this palette a search rather than a choice. Two
  // bars of the same shape in the same panel invite comparison, so the twelve
  // cross-pairs are held to the same bar as the within-bar ones.
  const sinks = energyTones();
  const causes = mortalityTones();
  let worst = Infinity;
  let where = null;
  for (const [sn, s] of Object.entries(sinks)) {
    for (const [cn, c] of Object.entries(causes)) {
      for (const vision of VISION_MODELS) {
        const d = deltaE(s, c, vision);
        if (d < worst) {
          worst = d;
          where = `${sn}/${cn}, ${vision}`;
        }
      }
    }
  }
  assert.ok(worst >= MIN_DELTA_E, `worst cross pair ΔE ${worst.toFixed(1)} at ${where}`);
});

test("two triads I picked by eye would have failed, in two different ways", () => {
  // Pinned because the lesson is the reusable part: at six colours, "these look
  // different to me" stops being evidence. The first attempt collided with the
  // cause colours; the second collided with itself.
  const eyeOne = { metabolism: hslToRgb(188, 85, 82), waste: hslToRgb(318, 55, 55), buried: hslToRgb(28, 60, 26) };
  const causes = mortalityTones();
  let crossWorst = Infinity;
  for (const s of Object.values(eyeOne)) {
    for (const c of Object.values(causes)) {
      for (const vision of VISION_MODELS) crossWorst = Math.min(crossWorst, deltaE(s, c, vision));
    }
  }
  assert.ok(crossWorst < 10, `expected a collision with the cause colours, got ${crossWorst.toFixed(1)}`);

  const eyeTwo = [hslToRgb(300, 40, 88), hslToRgb(174, 55, 50), hslToRgb(240, 55, 22)];
  let selfWorst = Infinity;
  for (let i = 0; i < eyeTwo.length; i++) {
    for (let j = i + 1; j < eyeTwo.length; j++) {
      for (const vision of VISION_MODELS) selfWorst = Math.min(selfWorst, deltaE(eyeTwo[i], eyeTwo[j], vision));
    }
  }
  assert.ok(selfWorst < MIN_DELTA_E, `expected a within-bar failure, got ${selfWorst.toFixed(1)}`);
});

test("each energy colour stands off the track it is drawn on", () => {
  // A segment at 0% shows the track. A colour close to it reads as an empty
  // segment, which is the one thing a bar of shares must never say by accident.
  const track = barTrack();
  for (const [name, rgb] of Object.entries(energyTones())) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(rgb, track, vision);
      assert.ok(d >= MIN_DELTA_E, `${name} on the track is ΔE ${d.toFixed(1)} under ${vision}`);
    }
    // And off the panel the strip is inset into. Only `--bg-panel`: unlike the
    // cause colours, which also appear as legend dots in the chart card, these
    // three exist in exactly one place, so `--bg-panel-2` is not a surface this
    // bar is ever drawn on and asserting against it would be measuring fiction.
    const panel = SURFACES[0];
    for (const vision of VISION_MODELS) {
      const d = deltaE(rgb, panel.rgb, vision);
      assert.ok(d >= MIN_DELTA_E, `${name} on ${panel.name} is ΔE ${d.toFixed(1)} under ${vision}`);
    }
  }
});

test("the energy colours climb the same luminance ladder as the cause colours", () => {
  // The one thing the two bars share on purpose: pale, mid, dark, terminal
  // outcome darkest. A grammar rather than a claim — and one no colour vision
  // deficiency can take away, because luminance is untouched by all of them.
  const tones = energyTones();
  const L = (c) => toLab(c)[0];
  assert.ok(L(tones.metabolism) > L(tones.waste) + 15);
  assert.ok(L(tones.waste) > L(tones.buried) + 12);
});

test("the energy colours the DOM is painted with are the ones that were measured", () => {
  const css = energyColours();
  const tones = energyTones();
  assert.deepEqual(Object.keys(css), Object.keys(tones));
  assert.deepEqual(Object.keys(css), [...ENERGY_SINKS]);
  for (const [name, text] of Object.entries(css)) {
    const m = text.match(/^hsl\((\d+), (\d+)%, (\d+)%\)$/);
    assert.ok(m, `${name} is not a plain hsl() this test can parse: ${text}`);
    assert.deepEqual(hslToRgb(Number(m[1]), Number(m[2]), Number(m[3])), tones[name]);
  }
});

// ---- the power strip (v1.39) ----
//
// A ninth colour in a column that already spends eight, drawn as a 1.5-pixel
// line. Two claims: it reads against every one of the eight and against the
// panel under every vision model, and the distinction it does *not* ask colour
// to carry — minted against spent — is carried by dashing instead.

/** Everything the power line shares its figure with, as it is actually drawn. */
function chartColumn() {
  const out = [{ name: "panel", rgb: panelBackground() }];
  for (const [name, rgb] of Object.entries(chartLineTones())) out.push({ name: `${name} line`, rgb });
  for (const [name, rgb] of Object.entries(mortalityTones())) out.push({ name, rgb });
  for (const [name, rgb] of Object.entries(energyTones())) out.push({ name, rgb });
  return out;
}

test("the power line reads against everything in the chart column", () => {
  const tone = powerLineTones().line;
  let worst = Infinity;
  let where = null;
  for (const s of chartColumn()) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(tone, s.rgb, vision);
      if (d < worst) {
        worst = d;
        where = `${s.name} under ${vision}`;
      }
    }
  }
  assert.ok(worst >= MIN_DELTA_E, `power line is ΔE ${worst.toFixed(1)} from ${where}`);
});

test("the power strip's two lines are separated by geometry, not by colour", () => {
  // The v1.34 rule, applied before it costs anything rather than after a mark
  // has been invisible for fourteen versions: there is one colour here, and the
  // spend line is dashed. A future edit that gives the two lines two hues has to
  // delete this test to do it.
  const p = powerLine();
  assert.ok(Array.isArray(p.dash) && p.dash.length >= 2, "the spend line must be dashed");
  assert.ok(p.dash.every((n) => n > 0));
  assert.equal(Object.keys(powerLineTones()).length, 1, "the strip owns exactly one colour");
});

test("the band between the lines is visible on the panel it is drawn on", () => {
  // The band is the only part of this figure the energy identity makes exact —
  // where it shows, the standing stock is moving — so a fill that vanishes into
  // the panel loses the one thing the strip knows for certain.
  const fill = blendOver(panelBackground(), powerLineTones().line, POWER_BAND_ALPHA);
  for (const vision of VISION_MODELS) {
    const d = deltaE(fill, panelBackground(), vision);
    assert.ok(d >= MIN_DELTA_E, `the band is ΔE ${d.toFixed(1)} from the panel under ${vision}`);
  }
  // And the alpha the canvas actually paints is the one that was measured.
  const m = powerLine().band.match(/^hsla\(\d+, \d+%, \d+%, ([\d.]+)\)$/);
  assert.ok(m, `the band is not a plain hsla() this test can parse: ${powerLine().band}`);
  assert.equal(Number(m[1]), POWER_BAND_ALPHA);
});

test("the chart lines the canvas is painted with are the ones that were measured", () => {
  // The same guard the energy bar has had since v1.29, for the two colours that
  // predate the audit entirely: parse what `drawChart` strokes and rebuild the
  // tone from it, so the measured value cannot drift from the drawn one.
  const css = chartLines();
  const tones = chartLineTones();
  assert.deepEqual(Object.keys(css), Object.keys(tones));
  for (const [name, text] of Object.entries(css)) {
    const m = text.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
    assert.ok(m, `${name} is not a plain rgba() this test can parse: ${text}`);
    const rgb = { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    assert.deepEqual(blendOver(panelBackground(), rgb, Number(m[4])), tones[name]);
  }
});

// ---- the whole-run envelope bands (v1.22, audited v1.61) ----
//
// The bands are the honest half of a thinned chart: past the first halving the
// line is a sample and the band is the true extreme it was sampled from. They
// were two literals in `chart.js` — the series' own RGB retyped at two alphas
// picked by eye — and so were outside this file's domain by construction, which
// is why every sweep since v1.25 passed over them. See `chartBands()`.

test("an envelope band reads against the panel it is drawn on", () => {
  // v1.39's rule for the power strip's band, one figure up: the alpha is chosen
  // so the band clears MIN_DELTA_E rather than by eye. It scored 12.9 and 19.4.
  for (const [name, tone] of Object.entries(chartBandTones())) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(tone, panelBackground(), vision);
      assert.ok(d >= MIN_DELTA_E, `the ${name} envelope is ΔE ${d.toFixed(1)} from the panel under ${vision}`);
    }
  }
});

test("the two envelopes are not each other", () => {
  // The failure this release exists for: at 0.16 and 0.22 the bands were very
  // nearly the same alpha, which threw away the lightness gap that is the only
  // thing a tritanope has to tell green from blue here. ΔE 9.3.
  const { pop, food } = chartBandTones();
  for (const vision of VISION_MODELS) {
    const d = deltaE(pop, food, vision);
    assert.ok(d >= MIN_DELTA_E, `the two envelopes are ΔE ${d.toFixed(1)} apart under ${vision}`);
  }
});

test("a band belongs to its own line, and the line still reads on it", () => {
  // The pair a reader actually has to resolve is "which series is this
  // envelope", and it fails if a band is closer in colour to the *other*
  // series' band than to its own line. It was: 9.3 against the other band
  // against 25.2 to its own line, so the answer a reader got was the wrong one.
  //
  // What is deliberately not asserted here is that a band is quieter than its
  // line. It reads like the obvious claim — a band is a wash, a line is the
  // value — and it is false: under tritanopia the pop band sits *further* from
  // the panel than the pop line does, because a desaturated blue is not
  // monotone in that model. The relation that is actually true is the one in
  // the CSS (a band is its line's alpha times one scale), and the test below
  // pins that instead. A perceptual claim standing in for an arithmetic one
  // fails on the one model nobody pictures.
  const bands = chartBandTones();
  const lines = chartLineTones();
  for (const name of Object.keys(bands)) {
    const other = name === "pop" ? "food" : "pop";
    for (const vision of VISION_MODELS) {
      const own = deltaE(bands[name], lines[name], vision);
      const cross = deltaE(bands[name], bands[other], vision);
      assert.ok(own < cross, `the ${name} envelope is nearer the ${other} band than its own line under ${vision}`);
      // And the line has to stay visible where it crosses its own band. Not the
      // bar for a mark — the line carries shape as well as colour — but the bar
      // this project uses for "present without being looked for".
      assert.ok(own >= MIN_RULE_DELTA_E, `the ${name} line is ΔE ${own.toFixed(1)} from its own band under ${vision}`);
    }
  }
});

test("a band is its line, at one scale, and cannot drift from it", () => {
  // The point of deriving rather than retyping: parse both back out of the CSS
  // and assert the band is the line's own colour with its alpha scaled. This is
  // the assertion the two literals in `chart.js` could never have had.
  const lines = chartLines();
  const bands = chartBands();
  assert.deepEqual(Object.keys(lines), Object.keys(bands));
  const parse = (text) => {
    const m = text.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
    assert.ok(m, `not a plain rgba() this test can parse: ${text}`);
    return { rgb: { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }, a: Number(m[4]) };
  };
  for (const name of Object.keys(lines)) {
    const line = parse(lines[name]);
    const band = parse(bands[name]);
    assert.deepEqual(band.rgb, line.rgb, `the ${name} band is not the ${name} line's colour`);
    assert.ok(Math.abs(band.a - line.a * CHART_BAND_SCALE) < 1e-9);
    assert.deepEqual(blendOver(panelBackground(), band.rgb, band.a), chartBandTones()[name]);
  }
});

// ---- the chart's grid (v1.41) ----
//
// The first colour in this project that can fail for being too *loud*. A
// gridline is a ruler behind two lines of data: invisible and it is not an
// axis, prominent and it is a third series. So it is measured from both sides,
// and its labels — which are numbers a reader has to actually read — are held
// to the ordinary bar for a mark.

test("the grid is visible without competing with the data", () => {
  const tone = axisRuleTone();
  for (const vision of VISION_MODELS) {
    const d = deltaE(tone, panelBackground(), vision);
    assert.ok(d >= MIN_RULE_DELTA_E, `the grid is ΔE ${d.toFixed(1)} from the panel under ${vision}`);
    assert.ok(d <= MAX_RULE_DELTA_E, `the grid is ΔE ${d.toFixed(1)} from the panel — that is data, not furniture`);
  }
  // And quieter than both lines it sits under, under every vision model: a rule
  // that out-shouts the quieter series has changed what the figure is about.
  for (const [name, line] of Object.entries(chartLineTones())) {
    for (const vision of VISION_MODELS) {
      const rule = deltaE(tone, panelBackground(), vision);
      const data = deltaE(line, panelBackground(), vision);
      assert.ok(rule < data, `the grid is louder than the ${name} line under ${vision}`);
    }
  }
});

test("the grid the canvas strokes is the grid that was measured", () => {
  const m = axisRule().line.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  assert.ok(m, `the grid is not a plain rgba() this test can parse: ${axisRule().line}`);
  const rgb = { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  assert.deepEqual(blendOver(panelBackground(), rgb, Number(m[4])), axisRuleTone());
  // A neutral on purpose: a tinted rule reads as belonging to one of the series.
  assert.equal(rgb.r, rgb.g);
  assert.equal(rgb.g, rgb.b);
});

// ---- winter, behind the figure (v1.74) ----
//
// The second piece of furniture on this chart and the first that is an area.
// It is held to the grid's two-sided window — visible, and never data — and
// then, because it is a *background* and not a mark, every colour already drawn
// on this figure is re-scored over it. v1.34's rule: a new layer is a new audit
// of everything that lands on it.

/** Every mark this figure draws, as a function of what it is drawn over. */
const CHART_MARKS = {
  pop: (bg) => blendOver(bg, { r: 120, g: 190, b: 255 }, 0.95),
  food: (bg) => blendOver(bg, { r: 90, g: 200, b: 140 }, 0.5),
  popBand: (bg) => blendOver(bg, { r: 120, g: 190, b: 255 }, Number((0.95 * CHART_BAND_SCALE).toFixed(4))),
  foodBand: (bg) => blendOver(bg, { r: 90, g: 200, b: 140 }, Number((0.5 * CHART_BAND_SCALE).toFixed(4))),
};

test("winter is present, and is never a third series", () => {
  const tone = seasonBandTone();
  for (const vision of VISION_MODELS) {
    const d = deltaE(tone, panelBackground(), vision);
    assert.ok(d >= MIN_RULE_DELTA_E, `the winter band is ΔE ${d.toFixed(1)} from the panel under ${vision}`);
    assert.ok(d <= MAX_RULE_DELTA_E, `the winter band is ΔE ${d.toFixed(1)} from the panel — that is data, not furniture`);
  }
  // Quieter than every line it sits behind, under every model — the same claim
  // the grid makes, on a mark that covers half the figure rather than 1% of it.
  for (const [name, line] of Object.entries(chartLineTones())) {
    for (const vision of VISION_MODELS) {
      const back = deltaE(tone, panelBackground(), vision);
      const data = deltaE(line, panelBackground(), vision);
      assert.ok(back < data, `winter is louder than the ${name} line under ${vision}`);
    }
  }
});

test("the ceiling: the whole darkening direction is worth nine", () => {
  // The measurement that decided the alpha, pinned as the failure and not only
  // as the fix (v1.24). Pure black — everything there is in this direction —
  // scores 9.01 against this panel under normal vision, so the top of the rule
  // window cannot be reached by shading at all, and the feasible alphas are a
  // five-hundredth-wide strip. A future me widening the band has to move the
  // panel, not the number.
  const black = deltaE({ r: 0, g: 0, b: 0 }, panelBackground(), "normal");
  assert.ok(black < MAX_RULE_DELTA_E, `pure black scores ${black.toFixed(2)} — the sweep's premise has moved`);
  assert.ok(Math.abs(black - 9.01) < 0.05, `the ceiling is ${black.toFixed(2)}, not 9.01`);
  // And the strip: 0.42 is the first alpha that clears the floor under every
  // model, 0.47 the last that stays under the ceiling. The band is inside it.
  const at = (a) => {
    const t = blendOver(panelBackground(), { r: 0, g: 0, b: 0 }, a);
    return VISION_MODELS.map((v) => deltaE(t, panelBackground(), v));
  };
  assert.ok(Math.min(...at(0.41)) < MIN_RULE_DELTA_E, "0.41 was expected to be too faint");
  assert.ok(Math.max(...at(0.48)) > MAX_RULE_DELTA_E, "0.48 was expected to be too loud");
  assert.ok(SEASON_BAND_ALPHA >= 0.42 && SEASON_BAND_ALPHA <= 0.47);
  // Tritanopia is what makes the strip that narrow: darkening this navy takes
  // away mostly blue, so it is a chromatic move and the four models disagree
  // about it by a factor the same sweep in white does not produce.
  const dark = at(SEASON_BAND_ALPHA);
  assert.ok(Math.max(...dark) / Math.min(...dark) > 1.5, "the models agree — re-read the sweep");
  const pale = (a) => {
    const t = blendOver(panelBackground(), { r: 255, g: 255, b: 255 }, a);
    return VISION_MODELS.map((v) => deltaE(t, panelBackground(), v));
  };
  const light = pale(0.05);
  assert.ok(Math.max(...light) - Math.min(...light) < 0.2, "a lightening is not model-neutral after all");
});

test("everything drawn over winter still clears its own bar", () => {
  // The claim I went in with — every mark here is lighter than the panel, so a
  // darker background can only help them — is a mechanism arriving before the
  // search (v1.48), and it is false. Three of the five lose contrast over the
  // band. All of them still clear, and that is the assertion.
  const band = seasonBandTone();
  const panel = panelBackground();
  for (const [name, mark] of Object.entries(CHART_MARKS)) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(mark(band), band, vision);
      assert.ok(d >= MIN_DELTA_E, `the ${name} is ΔE ${d.toFixed(1)} from the winter band under ${vision}`);
    }
  }
  // The grid is furniture over furniture, and stays inside its own window.
  for (const vision of VISION_MODELS) {
    const d = deltaE(blendOver(band, { r: 255, g: 255, b: 255 }, 0.07), band, vision);
    assert.ok(d >= MIN_RULE_DELTA_E && d <= MAX_RULE_DELTA_E, `the grid is ΔE ${d.toFixed(1)} over winter under ${vision}`);
  }
  // And the pair of series stays apart over it: tritanopia is the model that
  // nearly loses them (25.9 over the panel), so a new background under both is
  // exactly where that margin would go.
  for (const vision of VISION_MODELS) {
    const d = deltaE(CHART_MARKS.pop(band), CHART_MARKS.food(band), vision);
    assert.ok(d >= MIN_DELTA_E, `the two lines are ΔE ${d.toFixed(1)} apart over winter under ${vision}`);
  }
  // Pinning the direction, so the wrong intuition cannot come back as a
  // comment: the food envelope is the tightest of them and it *falls* over the
  // band, from 27.5 to 27.0.
  const worst = (a, b) => Math.min(...VISION_MODELS.map((v) => deltaE(a, b, v)));
  assert.ok(
    worst(CHART_MARKS.foodBand(band), band) < worst(CHART_MARKS.foodBand(panel), panel),
    "the food envelope was expected to lose contrast over a darker ground"
  );
});

test("the winter the canvas fills is the winter that was measured", () => {
  const m = seasonBand().match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  assert.ok(m, `the winter band is not a plain rgba() this test can parse: ${seasonBand()}`);
  const rgb = { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  assert.equal(Number(m[4]), SEASON_BAND_ALPHA);
  assert.deepEqual(blendOver(panelBackground(), rgb, Number(m[4])), seasonBandTone());
  // A neutral, for the grid's reason: a tinted ground would read as belonging
  // to one of the two series.
  assert.equal(rgb.r, rgb.g);
  assert.equal(rgb.g, rgb.b);
});

test("the axis numbers are legible, and are the population's own colour", () => {
  // The labels spend no new colour — they are the population line's, which is
  // what says which of this figure's two scales they belong to. So the claim is
  // an identity plus the ordinary bar for something a reader must read.
  const label = chartLineTones().pop;
  for (const vision of VISION_MODELS) {
    const d = deltaE(label, panelBackground(), vision);
    assert.ok(d >= MIN_DELTA_E, `the axis numbers are ΔE ${d.toFixed(1)} from the panel under ${vision}`);
  }
});

// ---- the epidemic: the zone, and the two marks (v1.34) ----
//
// Contagion has been drawn one creature at a time since v1.16 and never
// measured. Three claims get audited here: the new hazard field (visible over
// every ground, not mistakable for either fertility claim, and *leaving the food
// motes legible on top of it* — the constraint that decided its hue), and the
// two marks of the epidemiological state, both of which failed outright.

/** The minimap's own grounds, which the field is drawn on too. */
function minimapGrounds() {
  const bg = minimapWater();
  const out = [{ name: "mini bare", rgb: bg }];
  for (let band = 0; band < TERRAIN_BANDS; band++) {
    const m = terrainBandFill(band).match(/rgba?\(([^)]+)\)/)[1].split(",").map(Number);
    const g = blendOver(bg, { r: m[0], g: m[1], b: m[2] }, m[3]);
    out.push({ name: `mini band ${band}`, rgb: g });
    // The minimap paints biomes as a flat wash rather than an additive glow.
    const wash = minimapBiomeWash();
    out.push({ name: `mini band ${band} +biome`, rgb: blendOver(g, wash, wash.a) });
    for (const rich of [0.5, 1]) {
      const t = detritusTint(rich);
      out.push({ name: `mini band ${band} +soil ${rich}`, rgb: blendOver(g, t, t.a) });
    }
  }
  return out;
}

/** Every ground the contagious zone can be drawn over, in either view. */
function hazardBackgrounds() {
  const out = [...soilBackgrounds(), ...minimapGrounds()];
  // soilBackgrounds() covers bare and biome ground; the field can also sit on
  // enriched ground, which is the brightest thing under the water.
  for (const { name, rgb } of soilBackgrounds()) {
    for (const rich of [0.5, 1]) out.push({ name: `${name} +soil ${rich}`, rgb: soilOver(rgb, rich) });
  }
  return out;
}

/** The field at `sources` overlapping cases, composited onto a background. */
function hazardOver(bg, sources) {
  const t = hazardTint();
  return blendOver(bg, t, independentAny(t.a, sources));
}

test("the contagious zone reads against every ground either view can draw it on", () => {
  let worst = { d: Infinity };
  for (const { name, rgb } of hazardBackgrounds()) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(hazardOver(rgb, HAZARD_AUDIT_SOURCES), rgb, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `the zone scores only ${worst.d.toFixed(1)} on ${worst.name} (${worst.vision})`
  );
});

test("the zone is neither of the two things this pond already says with a wash", () => {
  // Biome glow and enriched ground are both claims about *fertility*. A watcher
  // who reads the zone as either of them learns the opposite of the truth about
  // where it is safe to feed.
  let worst = { d: Infinity };
  for (const phase of [0, 1]) {
    for (const r of [0, 0.5, 1]) {
      const ground = overTerrain(veil(phase), r, false);
      const zone = hazardOver(ground, HAZARD_AUDIT_SOURCES);
      const rivals = { biome: overBiome(ground), soil: soilOver(ground, 1), halfSoil: soilOver(ground, 0.5) };
      for (const [rival, rgb] of Object.entries(rivals)) {
        for (const vision of VISION_MODELS) {
          const d = deltaE(zone, rgb, vision);
          if (d < worst.d) worst = { d, vision, rival, where: `season ${phase} terrain ${r}` };
        }
      }
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `zone vs ${worst.rival} is only ${worst.d.toFixed(1)} at ${worst.where} (${worst.vision})`
  );
});

test("food is still findable inside a plague zone — the constraint that picked the hue", () => {
  // A mote is a mark drawn *over* this field, so the field is one of its
  // backgrounds. This is the test that rules out sulphur, and with it the idea
  // that the zone could wear the same colour as the halo it belongs to.
  const mote = foodMote(); // additive, and now reachable from the palette (v1.55)
  let worst = { d: Infinity };
  for (const { name, rgb } of hazardBackgrounds()) {
    const field = hazardOver(rgb, HAZARD_AUDIT_SOURCES);
    for (const vision of VISION_MODELS) {
      const d = deltaE(addOver(field, mote, mote.a), field, vision);
      if (d < worst.d) worst = { d, name, vision };
    }
  }
  assert.ok(
    worst.d >= MIN_DELTA_E,
    `a mote on the zone scores only ${worst.d.toFixed(1)} on ${worst.name} (${worst.vision})`
  );
});

test("a sulphur zone cannot be made to work, which is why the zone is blue", () => {
  // Pins the reason, as a squeeze rather than as a single number: at *no*
  // opacity does sulphur clear both constraints at once. Faint enough to leave
  // the crop legible, it disappears into the ground; strong enough to be seen,
  // it swallows the food. The blue that shipped clears both at the audited
  // level, which the two tests above assert. A suite that only knew the passing
  // colour would let someone "unify" the palette with the halo and quietly hide
  // the crop.
  const sulphur = hslToRgb(70, 100, 55);
  const mote = { r: 90, g: 220, b: 150 };
  const grounds = hazardBackgrounds();
  const score = (rgb, opacity) => {
    let visible = Infinity;
    let motes = Infinity;
    for (const { rgb: bg } of grounds) {
      const field = blendOver(bg, rgb, opacity);
      for (const vision of VISION_MODELS) {
        visible = Math.min(visible, deltaE(field, bg, vision));
        motes = Math.min(motes, deltaE(addOver(field, mote, 0.55), field, vision));
      }
    }
    return { visible, motes };
  };
  for (const opacity of [0.2, 0.3, 0.41, 0.5, 0.55, 0.6, 0.7]) {
    const s = score(sulphur, opacity);
    assert.ok(
      s.visible < MIN_DELTA_E || s.motes < MIN_DELTA_E,
      `sulphur at ${opacity} cleared both: visible ${s.visible.toFixed(1)}, motes ${s.motes.toFixed(1)}`
    );
  }
});

test("the zone's opacity is the risk arithmetic, not a ramp that resembles it", () => {
  // n discs at alpha a composite to 1-(1-a)^n; n infectious neighbours at
  // chance p give a risk of 1-(1-p)^n. Same function, so the drawn opacity is a
  // strictly increasing function of the real per-tick risk.
  assert.equal(hazardTint().a, HAZARD_SOURCE_ALPHA);
  assert.ok(independentAny(HAZARD_SOURCE_ALPHA, HAZARD_AUDIT_SOURCES) >= 0.4);
  let prev = -1;
  for (const n of [1, 2, 5, 20]) {
    const o = independentAny(HAZARD_SOURCE_ALPHA, n);
    assert.ok(o > prev && o < 1);
    prev = o;
  }
});

// The background either epidemiological mark actually sits on: the water, plus
// the creature's own additive glow (any hue, any energy, and brighter still
// where bodies overlap), plus the new hazard field, which a sick creature is by
// definition standing in.
function ringBackgrounds() {
  const out = [];
  for (const phase of [0, 1]) {
    for (const sources of [0, 1, HAZARD_AUDIT_SOURCES, 20]) {
      const water = sources ? hazardOver(veil(phase), sources) : veil(phase);
      for (const light of [30, 50, 65, 75]) {
        for (const hue of [0, 40, 68, 120, 200, 260, 320]) {
          // The glow is a radial gradient from 0.5 at the body's centre to 0 at
          // three radii out; the marks sit inside that, and overlapping bodies
          // stack it further.
          for (const k of [0.1, 0.21, 0.4, 0.6]) {
            out.push({
              name: `season ${phase} zone ${sources} body ${hue}/${light} glow ${k}`,
              rgb: addOver(water, hslToRgb(hue, 80, light), k),
            });
          }
        }
      }
    }
  }
  return out;
}

/** Every appearance the sick halo can take on a background, over its throb. */
function haloAppearances(bg) {
  const t = sickHaloTones();
  return [0, 0.5, 1].map((throb) => addOver(bg, t.ring, 0.35 + 0.45 * throb));
}

test("both epidemiological marks read, on every background either can appear on", () => {
  const marks = {
    "sick halo": Object.values(sickHaloTones()),
    "immune ring": Object.values(immuneRingTones()),
  };
  for (const [name, tones] of Object.entries(marks)) {
    let worst = { d: Infinity };
    for (const bg of ringBackgrounds()) {
      for (const vision of VISION_MODELS) {
        const d = markContrast(tones, bg.rgb, vision);
        if (d < worst.d) worst = { d, where: bg.name, vision };
      }
    }
    assert.ok(
      worst.d >= MIN_DELTA_E,
      `${name} scores only ${worst.d.toFixed(1)} on ${worst.where} (${worst.vision})`
    );
  }
});

test("the marks they replace were invisible — the failure, pinned", () => {
  // The immune ring was one translucent pale blue at 0.32; the halo was one
  // additive sulphur at 0.35–0.80. Both were measured against a glow they do not
  // control, which is the v1.25 predator-core failure exactly. Without these two
  // assertions the suite would stay green if someone restored either.
  let worstRing = Infinity;
  let worstHalo = Infinity;
  const sulphur = sickHaloTones().ring;
  for (const bg of ringBackgrounds()) {
    const ring = blendOver(bg.rgb, { r: 150, g: 205, b: 255 }, 0.32);
    for (const vision of VISION_MODELS) {
      worstRing = Math.min(worstRing, deltaE(ring, bg.rgb, vision));
      for (const throb of [0, 0.5, 1]) {
        const halo = addOver(bg.rgb, sulphur, 0.35 + 0.45 * throb);
        worstHalo = Math.min(worstHalo, deltaE(halo, bg.rgb, vision));
      }
    }
  }
  assert.ok(worstRing < MIN_DELTA_E, `the old immune ring scored ${worstRing.toFixed(1)}`);
  assert.ok(worstHalo < MIN_DELTA_E, `the old sulphur halo scored ${worstHalo.toFixed(1)}`);
});

test("the dark tone is the half an additive halo cannot imitate", () => {
  // Why two tones is the fix and not just a brighter one: everything additive
  // can only *brighten*, so a mark carrying a dark tone can never be produced by
  // a glow or a halo, whatever colour it is.
  const dark = immuneRingTones().rim;
  let worst = Infinity;
  for (const bg of ringBackgrounds()) {
    for (const halo of haloAppearances(bg.rgb)) {
      for (const vision of VISION_MODELS) worst = Math.min(worst, deltaE(dark, halo, vision));
    }
  }
  assert.ok(worst >= MIN_DELTA_E, `the immune ring's dark tone scores ${worst.toFixed(1)} against a halo`);
});

test("colour cannot tell sick from immune, which is why the ring is dashed", () => {
  // The structural finding. An additive halo over a bright body can reach almost
  // any light colour, and under tritanopia bright sulphur and pale blue are the
  // same thing. So the bright halves of the two marks collide, both marks need a
  // dark half, and every dark half resembles every other: the distinction has to
  // live somewhere colour is not. Geometry is that somewhere, and no vision model
  // touches it.
  const pale = immuneRingTones().ring;
  let worst = Infinity;
  for (const bg of ringBackgrounds()) {
    for (const halo of haloAppearances(bg.rgb)) {
      for (const vision of VISION_MODELS) worst = Math.min(worst, deltaE(pale, halo, vision));
    }
  }
  assert.ok(worst < MIN_DELTA_E, `expected a collision; the closest pair was ${worst.toFixed(1)}`);
  assert.ok(immuneRing().dash.length > 0, "the immune ring must carry a non-colour cue");
  assert.ok(sickHalo().dash === undefined, "and the halo must not, or the pair is symmetrical again");
});

// ---------------------------------------------------------------------------
// The background the audit never had (v1.43).
//
// `ringBackgrounds()` above is the water: the seasonal veil, the hazard field,
// and the creature's additive *glow* over them. Every audit since v1.25 has
// measured against some version of that set, and two marks in `render.js` are
// not drawn on it. The signal rings sit close enough to the body that a
// neighbour's glow lands on the chevron underneath them, and the attack flash
// is drawn at the nose, straight onto the opaque body.
//
// So this set is the creature: the chevron at every hue, saturation and energy
// level it can take, and the chevron with another creature's glow added on top,
// which is where an additive mark runs out of headroom entirely.

/**
 * Every background a mark drawn *on* a creature can appear over: the opaque
 * chevron `bodyColour()` already reproduces, and that chevron with a
 * neighbour's glow added over it, which is where an additive mark runs out of
 * headroom entirely. Coarser in hue than `sweepBodies()` because each entry is
 * measured against several marks under every vision model.
 */
function bodyBackgrounds() {
  const out = [];
  for (let hue = 0; hue < 360; hue += 15) {
    for (const e of ENERGIES) {
      for (const s of SIGNALS) {
        const body = bodyColour(hue, e, s);
        const tag = `body hue ${hue} energy ${e} signal ${s}`;
        out.push({ name: tag, rgb: body });
        for (const k of [0.25, 0.5, 0.9]) {
          out.push({ name: `${tag} + neighbour glow ${k}`, rgb: addOver(body, body, k) });
        }
      }
    }
  }
  return out;
}

/** Both background sets: a mark on a creature can be over either. */
function creatureBackgrounds() {
  return [...ringBackgrounds(), ...bodyBackgrounds()];
}

test("the call and the bite read, on every background either can appear on", () => {
  const tones = signalRingTones();
  const flash = attackFlashTones();
  const marks = {
    "a positive call": [tones.positive, tones.rim],
    "a negative call": [tones.negative, tones.rim],
    "the attack flash": [flash.disc, flash.rim],
  };
  for (const [name, pair] of Object.entries(marks)) {
    let worst = { d: Infinity };
    for (const bg of creatureBackgrounds()) {
      for (const vision of VISION_MODELS) {
        const d = markContrast(pair, bg.rgb, vision);
        if (d < worst.d) worst = { d, where: bg.name, vision };
      }
    }
    assert.ok(
      worst.d >= MIN_DELTA_E,
      `${name} scores only ${worst.d.toFixed(1)} on ${worst.where} (${worst.vision})`
    );
  }
});

test("the additive marks they replace were invisible — the failure, pinned", () => {
  // Both were `globalCompositeOperation = "lighter"`, which is the v1.25
  // predator-core failure and the v1.34 halo failure for a third and fourth
  // time. Without these assertions the suite stays green if someone puts either
  // back, and the reason they were wrong is nowhere in the code.
  const call = (bg, hue, loud) => addOver(bg, hslToRgb(hue, 95, 70), 0.1 + 0.4 * loud);
  let worstCall = Infinity;
  let worstQuiet = Infinity;
  let worstFlash = Infinity;
  for (const bg of creatureBackgrounds()) {
    for (const vision of VISION_MODELS) {
      for (const hue of [48, 205]) {
        for (const loud of [SIGNAL_QUIET, 0.5, 1]) {
          const d = deltaE(call(bg.rgb, hue, loud), bg.rgb, vision);
          worstCall = Math.min(worstCall, d);
          if (loud === SIGNAL_QUIET) worstQuiet = Math.min(worstQuiet, d);
        }
      }
      const burst = addOver(bg.rgb, { r: 255, g: 120, b: 90 }, 0.6);
      worstFlash = Math.min(worstFlash, deltaE(burst, bg.rgb, vision));
    }
  }
  assert.ok(worstCall < MIN_DELTA_E, `the old signal ring scored ${worstCall.toFixed(1)}`);
  assert.ok(worstFlash < MIN_DELTA_E, `the old attack flash scored ${worstFlash.toFixed(1)}`);
  // The quietest audible call is the sharpest form of the loudness-in-opacity
  // mistake: it was the *faintest* thing drawn, and it was drawn faint on
  // purpose, to report that it was quiet.
  assert.ok(worstQuiet < MIN_DELTA_E, `the quietest old call scored ${worstQuiet.toFixed(1)}`);
});

test("loudness is carried in geometry, never in opacity", () => {
  // The v1.25 rule, which the signal ring broke for twenty-three versions:
  // fading a mark to express degree spends exactly the contrast it exists for.
  // Every tone the ring can take is one of two opaque constants, and the only
  // thing a louder call changes is where the outer ring is.
  const quiet = signalRing(SIGNAL_QUIET);
  const shout = signalRing(1);
  assert.equal(quiet.ring, shout.ring, "loudness must not change the colour");
  assert.equal(quiet.rim, shout.rim);
  assert.equal(quiet.inner, shout.inner, "the inner ring is the fixed reference");
  assert.ok(shout.outer > quiet.outer, "a louder call must be a wider pair of rings");
  for (const style of [quiet.ring, quiet.rim, shout.ring, shout.rim]) {
    assert.ok(!/hsla|rgba/.test(style), `${style} is translucent; the mark must be opaque`);
  }
  // Monotone, so the ring is a readable scale rather than two states.
  let prev = -Infinity;
  for (const s of [SIGNAL_QUIET, 0.4, 0.6, 0.8, 1]) {
    const o = signalRing(s).outer;
    assert.ok(o > prev, "the outer radius must rise with loudness");
    prev = o;
  }
  // ...and a call of −1 is exactly as loud as a call of +1: the sign picks the
  // colour, the magnitude picks the geometry, and neither reaches the other.
  assert.equal(signalRing(-1).outer, signalRing(1).outer);
  assert.notEqual(signalRing(-1).ring, signalRing(1).ring);
});

test("colour tells the two calls apart, and geometry tells a call from a symptom", () => {
  // The mirror of the v1.34 finding, and worth stating because it comes out the
  // other way. Two *opaque* tones I choose are far apart under every vision
  // model, so the sign of a call can be a colour — where two *additive* ones
  // over a shared background collided at ΔE 0.0, since a clamped channel is a
  // clamped channel whatever you add to it.
  const t = signalRingTones();
  let worstSign = Infinity;
  let worstAdditive = Infinity;
  for (const vision of VISION_MODELS) {
    worstSign = Math.min(worstSign, deltaE(t.positive, t.negative, vision));
    for (const bg of creatureBackgrounds()) {
      const a = addOver(bg.rgb, hslToRgb(48, 95, 70), 0.5);
      const b = addOver(bg.rgb, hslToRgb(205, 95, 70), 0.5);
      worstAdditive = Math.min(worstAdditive, deltaE(a, b, vision));
    }
  }
  assert.ok(worstSign >= MIN_DELTA_E, `the two calls collide at ${worstSign.toFixed(1)}`);
  assert.ok(worstAdditive < MIN_DELTA_E, `expected the old pair to collide; got ${worstAdditive.toFixed(1)}`);

  // What colour cannot do: a creature can be calling *and* infected, or calling
  // and immune, and the cool call meets the immune ring well under the bar. So
  // the distinction lives where v1.34 put the sick/immune one — in geometry.
  // A call is two concentric rings and every other mark on a creature is one,
  // and the inner of the two is drawn outside both epidemiological marks.
  let worstAgainstSymptom = Infinity;
  for (const vision of VISION_MODELS) {
    for (const mark of [sickHaloTones().ring, immuneRingTones().ring]) {
      for (const call of [t.positive, t.negative]) {
        worstAgainstSymptom = Math.min(worstAgainstSymptom, deltaE(call, mark, vision));
      }
    }
  }
  assert.ok(
    worstAgainstSymptom < MIN_DELTA_E,
    `expected a collision that geometry has to solve; got ${worstAgainstSymptom.toFixed(1)}`
  );
  assert.ok(signalRing(SIGNAL_QUIET).inner > 3 + 1, "a call's inner ring must clear the sick halo");
  assert.ok(signalRing(SIGNAL_QUIET).inner > 2.4, "and the immune ring");
});

// ---- The Tree of Life's lineage colours (v1.46) ----
//
// The last of the surfaces v1.25's colour audit never reached, and the one
// where the answer is not a better palette. A species' hue is its founder's,
// hue is inherited, and the plot draws parents and daughters side by side — so
// the failure here is not a pair of tones chosen badly but a *namespace*: the
// picture is using an inherited quantity as an identifier.

test("two lineages of the same hue are the same colour, which is the whole bug", () => {
  // The default pond draws four of its eleven bands at hue 335. This is the
  // pinned failure: not "nearly", exactly.
  const a = lineageBandRgb(335);
  const b = lineageBandRgb(335);
  for (const vision of VISION_MODELS) {
    assert.equal(deltaE(a, b, vision), 0, `hue 335 against itself moved under ${vision}`);
  }
  // And a daughter one degree away is no better off.
  for (const vision of VISION_MODELS) {
    assert.ok(
      deltaE(lineageBandRgb(335), lineageBandRgb(336), vision) < MIN_DELTA_E,
      `a one-degree hue drift should not be a different colour under ${vision}`
    );
  }
});

test("the hue wheel has fewer colours in it than the plot has bands", () => {
  // Why the cue has to be geometry. A greedy walk of the wheel taking every hue
  // that clears MIN_DELTA_E against everything already taken is an upper bound
  // on how many lineages colour could ever name at once. The Muller plot has
  // drawn nineteen bands (seed 88, 6,000 ticks) — more than the *best case*
  // under any vision model, let alone the inherited case.
  const capacity = {};
  for (const vision of VISION_MODELS) {
    const taken = [];
    for (let h = 0; h < 360; h++) {
      if (taken.every((t) => deltaE(lineageBandRgb(t), lineageBandRgb(h), vision) >= MIN_DELTA_E)) {
        taken.push(h);
      }
    }
    capacity[vision] = taken.length;
  }
  assert.ok(capacity.normal <= 19, `normal vision affords ${capacity.normal} lineage colours`);
  assert.ok(
    capacity.deuteranopia < capacity.normal,
    "a dichromacy should afford strictly fewer, or this audit is measuring nothing"
  );
  assert.ok(capacity.deuteranopia <= 9, `deuteranopia affords ${capacity.deuteranopia}`);
});

test("the hatch reads on every hue a lineage can take", () => {
  // One tone, not the usual two, and the reason is in `bandHatch()`: this is the
  // one mark in the project whose background is not chosen by the world. Both
  // undimmed band styles, all 360 hues, all four vision models.
  const ink = bandHatch();
  let worst = Infinity;
  let worstAt = null;
  for (let h = 0; h < 360; h++) {
    for (const [role, rgb] of [
      ["band", blendOver(panelBackground(), hslToRgb(h, 68, 55), 0.9)],
      ["lit", blendOver(panelBackground(), hslToRgb(h, 85, 62), 0.98)],
    ]) {
      const hatched = blendOver(rgb, ink, HATCH_ALPHA);
      for (const vision of VISION_MODELS) {
        const d = deltaE(rgb, hatched, vision);
        if (d < worst) {
          worst = d;
          worstAt = `hue ${h} ${role} ${vision}`;
        }
      }
    }
  }
  assert.ok(worst >= MIN_DELTA_E, `the hatch fades into its band at ${worst.toFixed(1)} (${worstAt})`);
});

test("the band and its key are one colour, not two that agree", () => {
  // The legend's dot carried a hand-written `hsl(hue,70%,55%)` in main.js from
  // v1.2 to v1.46, one point of saturation away from the band it was a key to —
  // the v1.26 rule (a colour a test cannot reach is a colour that will drift)
  // proven on the surface that names the lineages.
  assert.equal(lineageFill(210), "hsla(210, 68%, 55%, 0.9)");
  assert.equal(lineageFill(210, "dot"), "hsl(210, 68%, 55%)");
  assert.ok(lineageFill(210).includes("68%, 55%"), "the band and the dot must share a hue and a tone");
  assert.ok(lineageFill(210, "dot").includes("68%, 55%"));
});

// ---- The "other" band (v1.62) ----
//
// The loudest entry on v1.61's list of colours the palette had never owned, and
// the one it measured and deliberately did not fix: the churn of lineages too
// small to name, at ΔE 9.0 from the background it is drawn on, holding a mean
// 9.1% of the plot and a peak of 70–97% on every seed. v1.61 also established
// that no *value* fixes it, which is why the release after it is geometry.
//
// Five tests. The one that earns its keep is the *ceiling*: a floor alone would
// license a stipple bright enough to make the churn the loudest thing in a
// figure about lineages, which is a different lie from the one being fixed.

test("the plot's background is the plot's, not the panel's", () => {
  // The thing v1.61 saw and left, and the reason every number below is what it
  // is. `#muller` paints itself darker than the column it sits in, so an audit
  // that reaches for `panelBackground()` — as this one nearly did — is holding
  // a 0.16 band up against a surface it is not drawn on. It reads **9.0**
  // against its own canvas and **4.8** against the panel: the same band, and
  // the second number is half a complaint.
  assert.equal(rgbCss(mullerBackground()), "rgb(4, 7, 11)");
  assert.notDeepEqual(mullerBackground(), panelBackground());
  const band = otherBandRgb();
  const right = deltaE(band, mullerBackground(), "normal");
  const wrongReference = deltaE(band, panelBackground(), "normal");
  assert.ok(
    right > 1.5 * wrongReference,
    `the reference should matter here (${right.toFixed(1)} against the canvas, ${wrongReference.toFixed(1)} against the panel)`
  );
  // And the composite itself moves, which is why `otherBandRgb` cannot borrow
  // the panel the way `lineageBandRgb` does at 0.9.
  const onPanel = blendOver(panelBackground(), otherBand(), OTHER_BAND_ALPHA);
  assert.ok(deltaE(band, onPanel, "normal") > MIN_RULE_DELTA_E, "the two composites should be visibly different colours");
});

test("the churn was furniture, which is the failure being fixed", () => {
  // Pinned, not merely fixed (v1.25): the fill is untouched — it is still the
  // value the plot has drawn since v1.2 — so this measures the same thing it
  // always did and says what was wrong with it. The [5, 10] window is the one
  // this project reserves for *gridlines*, and a band holding up to 97% of the
  // picture is not a gridline.
  const band = otherBandRgb();
  const bg = mullerBackground();
  for (const vision of VISION_MODELS) {
    const d = deltaE(band, bg, vision);
    assert.ok(d >= MIN_RULE_DELTA_E, `the fill is invisible under ${vision} at ${d.toFixed(1)}`);
    assert.ok(d < MIN_DELTA_E, `the fill has been changed; this test is about what it could not do`);
  }
  assert.ok(deltaE(band, bg, "normal") <= MAX_RULE_DELTA_E, "the fill read as a gridline, and that was the finding");
  // And the reason a *darker* hatch was not the answer: `bandHatch()` works
  // because a lineage band is a 55%-lightness fill, and this band is not one.
  const dark = blendOver(band, bandHatch(), HATCH_ALPHA);
  assert.ok(
    Math.min(...VISION_MODELS.map((v) => deltaE(dark, band, v))) < MIN_DELTA_E,
    "if the lineage ink reads on this band, the stipple did not need its own colour"
  );
});

test("a dot of the churn's stipple reads, on every vision model", () => {
  // The floor. The ink is the band's own colour undiluted, so this is a
  // statement about what 16% of a colour looks like next to 100% of it.
  const band = otherBandRgb();
  const dot = blendOver(band, otherBand(), 1);
  for (const vision of VISION_MODELS) {
    const d = deltaE(dot, band, vision);
    assert.ok(d >= MIN_DELTA_E, `the stipple fades into its band at ${d.toFixed(1)} under ${vision}`);
  }
  // It has to clear the empty canvas too, since a thin band is mostly edge.
  for (const vision of VISION_MODELS) {
    assert.ok(deltaE(dot, mullerBackground(), vision) >= MIN_DELTA_E, `the stipple fades into the canvas under ${vision}`);
  }
});

test("the churn stays the quietest band in the figure", () => {
  // The ceiling, and the constraint that actually decided the geometry (v1.55 —
  // the column that settles a value is usually not the one the sweep is about).
  // What a reader sees over a stretch of band is its area-weighted mean, so a
  // stipple is as loud as its coverage: `HATCH_PITCH` apart, dotted 1-on-3-off,
  // is 1/28 of the band. Against that, the *quietest* colour any lineage can
  // take — because "other" outshouting the faintest real species would invert
  // the thing the figure is about.
  const COVER = 1 / (7 * 4); // HATCH_PITCH × the dash's period
  const bg = mullerBackground();
  const band = otherBandRgb();
  const dot = blendOver(band, otherBand(), 1);
  const mean = blendOver(band, dot, COVER);

  const loudest = Math.max(...VISION_MODELS.map((v) => deltaE(mean, bg, v)));
  let quietestLineage = Infinity;
  for (let h = 0; h < 360; h++) {
    // `lineageBandRgb` models the panel, so it is rebuilt here on the surface
    // the bands are actually painted on — the difference is worth up to ΔE 4.4
    // and changes 0.58% of the collision costs `bandTextures` deals hatches by,
    // which is a lead this release states rather than takes.
    const on = blendOver(bg, hslToRgb(h, 68, 55), 0.9);
    const d = Math.min(...VISION_MODELS.map((v) => deltaE(on, bg, v)));
    if (d < quietestLineage) quietestLineage = d;
  }
  assert.ok(
    loudest < quietestLineage,
    `the churn reads at ${loudest.toFixed(1)} against the quietest lineage's ${quietestLineage.toFixed(1)}`
  );
  // And it is no longer furniture, which is the whole point of doing anything.
  assert.ok(loudest > MAX_RULE_DELTA_E, `the stippled band still reads as a gridline at ${loudest.toFixed(1)}`);
});

test("the churn dims by the factor the lineages dim by, not by a chosen one", () => {
  // v1.61's rule: two values that must move together should be derived from one
  // another. The dimmed stipple is deliberately *under* the bar a mark clears —
  // `bandHatch()`'s argument, that a cue surviving the spotlight undoes the
  // spotlight — and that is an outcome of the factor rather than a target.
  assert.equal(BAND_DIM_SCALE, 0.35 / 0.9);
  assert.equal(otherBandHatch(false), `rgba(120, 140, 160, 1)`);
  assert.equal(otherBandHatch(true), `rgba(120, 140, 160, ${Number(BAND_DIM_SCALE.toFixed(4))})`);
  const band = otherBandRgb();
  const dimmed = blendOver(band, otherBand(), BAND_DIM_SCALE);
  assert.ok(
    Math.max(...VISION_MODELS.map((v) => deltaE(dimmed, band, v))) < MIN_DELTA_E,
    "a dimmed stipple that still reads as a mark is competing with the highlight"
  );
  // Still the fill it always was: the highlight moves the cue, not the band.
  assert.equal(OTHER_BAND_ALPHA, 0.16);
});

// ---- The inspector (v1.49) ----
//
// The last DOM surface the audit had never opened. Three tests assert the new
// marks and three pin the failures they replace, because a suite that only
// knows the new numbers stays green while someone restores the old ones.

test("a weight's sign reads at every magnitude, and its size is not its opacity", () => {
  const track = inspectorTrack();
  const t = weightMarkTones();
  // The tones themselves, opaque, against the cell they are drawn in.
  for (const [name, rgb] of Object.entries(t)) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(rgb, track, vision);
      assert.ok(d >= MIN_DELTA_E, `the ${name} bar is ΔE ${d.toFixed(1)} on its track under ${vision}`);
    }
  }
  // And from each other: the sign is what the colour is for.
  let worst = Infinity;
  let where = null;
  for (const vision of VISION_MODELS) {
    const d = deltaE(t.positive, t.negative, vision);
    if (d < worst) {
      worst = d;
      where = vision;
    }
  }
  assert.ok(worst >= MIN_DELTA_E, `the two signs are ΔE ${worst.toFixed(1)} apart under ${where}`);

  // The magnitude is a height, so it is the same colour all the way down. A
  // vanishing weight still draws a bar, and its sign still has a direction.
  const tiny = weightMark(0.001);
  assert.equal(tiny.colour, weightMark(2).colour, "a weak positive weight is the same blue as a strong one");
  assert.ok(tiny.fill >= WEIGHT_MIN_FILL, "a bar never shrinks past the floor that keeps its sign readable");
  assert.equal(weightMark(-0.001).sign, -1, "a weak negative weight still hangs downward");
  assert.equal(weightMark(0.5).sign, 1);
  // Monotone in magnitude, and clamped at full scale rather than overflowing.
  assert.ok(weightMark(1.5).fill > weightMark(0.5).fill);
  assert.equal(weightMark(WEIGHT_FULL_SCALE).fill, 1);
  assert.equal(weightMark(9).fill, 1, "a runaway learned weight fills the cell, it does not exceed it");
  assert.equal(weightMark(-9).fill, 1);
});

test("the strip's old fade is pinned as the failure it was", () => {
  // `hsla(hue, 80%, 55%, |w| / 2)` over the same track, v1.0 to v1.48. The
  // median weight in a 6,000-tick pond is 0.71 and a fifth of every strip is
  // under 0.25, so this is the typical cell, not the tail of one.
  const track = inspectorTrack();
  for (const [sign, hue] of [["positive", 200], ["negative", 10]]) {
    const faded = blendOver(track, hslToRgb(hue, 80, 55), 0.1 / WEIGHT_FULL_SCALE);
    let best = 0;
    for (const vision of VISION_MODELS) best = Math.max(best, deltaE(faded, track, vision));
    assert.ok(
      best < MIN_DELTA_E,
      `a ${sign} weight of 0.1 used to score ${best.toFixed(1)} — expected it to fail`
    );
  }
  // And the sign itself was unreadable to a protanope at a quarter of full scale.
  const a = blendOver(track, hslToRgb(200, 80, 55), 0.125);
  const b = blendOver(track, hslToRgb(10, 80, 55), 0.125);
  assert.ok(
    deltaE(a, b, "protanopia") < MIN_DELTA_E,
    "the faded sign used to fail under protanopia — expected the failure to still be measurable"
  );
});

test("every neuron role in the brain diagram is legible, and so is every connection", () => {
  const plate = brainGraphBackground();
  const nodes = brainNodeTones();
  const edges = brainEdgeTones();
  // Everything drawn on the plate has to clear the plate.
  for (const [name, rgb] of [...Object.entries(nodes), ...Object.entries(edges)]) {
    for (const vision of VISION_MODELS) {
      const d = deltaE(rgb, plate, vision);
      assert.ok(d >= MIN_DELTA_E, `${name} is ΔE ${d.toFixed(1)} on the plate under ${vision}`);
    }
  }
  // The three roles from each other, the two signs from each other, and — the
  // constraint v1.49 nearly missed — every node from every edge, because a node
  // is a disc sitting on the lines it terminates.
  const marks = { ...nodes, "edge+": edges.positive, "edge-": edges.negative };
  const names = Object.keys(marks);
  let worst = Infinity;
  let where = null;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (const vision of VISION_MODELS) {
        const d = deltaE(marks[names[i]], marks[names[j]], vision);
        if (d < worst) {
          worst = d;
          where = `${names[i]}/${names[j]} under ${vision}`;
        }
      }
    }
  }
  assert.ok(worst >= MIN_DELTA_E, `the diagram's worst pair is ΔE ${worst.toFixed(1)} — ${where}`);
});

test("the diagram's old green-against-orange is pinned as the failure it was", () => {
  // `#5adc96` inputs and `#ffb060` outputs, v1.5 to v1.48: the two ends of the
  // picture, ΔE 17.7 apart for one man in twelve. Both passed against the plate
  // and against the near-white hidden node, which is why nothing caught it —
  // the audit had simply never been pointed at this figure.
  const green = { r: 0x5a, g: 0xdc, b: 0x96 };
  const orange = { r: 0xff, g: 0xb0, b: 0x60 };
  assert.ok(
    deltaE(green, orange, "protanopia") < MIN_DELTA_E,
    "expected the shipped input/output pair to fail under protanopia"
  );
  assert.ok(
    deltaE(green, orange, "normal") >= MIN_DELTA_E,
    "and to pass under normal vision — that is what made it invisible to me"
  );
  // Why the old pair failed, in one number: they are the *same lightness*
  // (79.4 and 78.0, ΔL* 1.4), so the whole distinction rode on the red-green
  // axis and a protanope has nothing left. The replacement separates them in
  // lightness too — the one channel no deficiency touches — which is what turns
  // 17.7 into 30.2.
  const green0 = toLab(green)[0];
  const orange0 = toLab(orange)[0];
  assert.ok(Math.abs(green0 - orange0) < 5, `the old pair shared a lightness (ΔL* ${Math.abs(green0 - orange0).toFixed(1)})`);
  const now = brainNodeTones();
  const dL = Math.abs(toLab(now.input)[0] - toLab(now.output)[0]);
  assert.ok(dL > 12, `the replacement pair is only ΔL* ${dL.toFixed(1)} apart — hue is doing all the work again`);
});

test("a connection's magnitude is its width, and its opacity is a constant", () => {
  const weak = brainEdge(0.1);
  const strong = brainEdge(3);
  assert.ok(strong.width > weak.width, "width carries the magnitude");
  assert.ok(weak.colour.includes(String(BRAIN_EDGE_ALPHA)), "and opacity carries nothing");
  assert.equal(
    weak.colour,
    brainEdge(2).colour,
    "two positive connections of different strength are the same colour"
  );
  assert.notEqual(weak.colour, brainEdge(-0.1).colour, "sign still changes the colour");
  assert.ok(brainEdge(99).width <= 2.4, "width is clamped so a runaway weight is not a bar");

  // The pre-v1.49 fade, pinned: a weak connection's sign under protanopia.
  const plate = brainGraphBackground();
  const op = 0.15 + 0.1 / 3;
  const a = blendOver(plate, hslToRgb(205, 85, 60), op);
  const b = blendOver(plate, hslToRgb(8, 85, 60), op);
  assert.ok(
    deltaE(a, b, "protanopia") < MIN_DELTA_E,
    "expected the old faded edge sign to fail under protanopia"
  );
});

// ---- the inspector swatch, and the ground its own rule lays (v1.79) ----
//
// The last of the six marks on v1.61's list of colours named outside the
// palette, and the one that needed a different question. Every audit before it
// asked "does this mark clear the surface underneath it", and on the canvas
// that surface is chosen by the world. In the DOM a mark can paint its own,
// which is what `box-shadow: 0 0 8px currentColor` had been doing here since
// v1.0 — in the paragraph's ink, because the span had a background and no
// colour of its own.

/** The near-white the swatch used to glow with: `--ink` in `style.css`. */
const PANEL_INK = { r: 0xdc, g: 0xe7, b: 0xf2 };

/** Worst `score(hue, vision)` over every lineage hue and all four models. */
function sweepHues(score) {
  let worst = Infinity;
  let n = 0;
  for (const vision of VISION_MODELS) {
    for (let hue = 0; hue < 360; hue++) {
      const d = score(hue, vision);
      worst = Math.min(worst, d);
      if (d < MIN_DELTA_E) n++;
    }
  }
  return { worst, failures: n };
}

test("the swatch's glow is its own colour, by construction", () => {
  // Not an equality anybody would notice breaking, which is why it is stated:
  // `main.js` writes `color` from `glow` and the stylesheet glows with
  // `currentColor`, so this one assertion is what stops the halo drifting back
  // into being a second colour the mark has to survive.
  for (const hue of [0, 90, 207, 326, 359]) {
    const s = inspectorSwatch(hue);
    assert.equal(s.glow, s.fill, `hue ${hue}: the halo is not the mark's colour`);
    assert.match(s.fill, /^hsl\(/);
    assert.ok(s.blur > 0, "a glow with no blur is not a glow");
  }
  const tones = inspectorSwatchTones(207);
  assert.deepEqual(tones.fill, hslToRgb(207, 70, 55), "the audit and the CSS are one value");
  assert.deepEqual(
    tones.halo,
    blendOver(panelBackground(), tones.fill, DOM_HALO_ALPHA),
    "the halo is the fill at the edge strength, over the panel"
  );
});

test("the swatch reads on every lineage hue, against the ground it lays", () => {
  const swept = sweepHues((hue, vision) =>
    deltaE(inspectorSwatchTones(hue).fill, panelBackground(), vision)
  );
  assert.equal(swept.failures, 0, "some hue's swatch is under the bar against the panel");
  assert.ok(swept.worst > 35, `worst case ΔE ${swept.worst.toFixed(2)}, expected > 35`);

  // And the mark against its own halo, which is now a shade of itself rather
  // than a competitor: the two are close on purpose, so this asserts the sign
  // of the difference rather than a bar. A halo brighter than its mark is the
  // bug coming back in a new colour.
  for (let hue = 0; hue < 360; hue += 7) {
    const t = inspectorSwatchTones(hue);
    assert.ok(
      toLab(t.fill)[0] > toLab(t.halo)[0],
      `hue ${hue}: the glow is lighter than the square it surrounds`
    );
  }
});

test("the near-white halo the swatch used to draw is pinned as a failure", () => {
  // v1.24's rule: a suite that only knows the new numbers stays green while
  // someone restores the old ones. The old halo is what `currentColor` resolved
  // to in an `.insp-row`, and it is not a colour this file can reach by
  // accident — it is the paragraph's ink, so it is written out here.
  const oldHalo = blendOver(panelBackground(), PANEL_INK, DOM_HALO_ALPHA);
  const swept = sweepHues((hue, vision) => deltaE(hslToRgb(hue, 70, 55), oldHalo, vision));
  assert.ok(
    swept.worst < 6,
    `expected the old halo to swallow a swatch outright, got ΔE ${swept.worst.toFixed(2)}`
  );

  // 55 of the 360 hues failed for some reader — two contiguous bands, the
  // blue-violets and the whole magenta-to-red arc — and 9.56% of the creatures
  // in twelve ponds wore one. The count is asserted loosely because the bands'
  // edges move with the ΔE model; the bands themselves are the finding.
  const failing = new Set();
  for (const vision of VISION_MODELS) {
    for (let hue = 0; hue < 360; hue++) {
      if (deltaE(hslToRgb(hue, 70, 55), oldHalo, vision) < MIN_DELTA_E) failing.add(hue);
    }
  }
  assert.ok(failing.size > 40, `expected the old failure to be broad, got ${failing.size} hues`);
  for (const hue of [265, 326, 342]) {
    assert.ok(failing.has(hue), `hue ${hue} was one of the worst and is no longer counted`);
  }

  // The control, and the whole reason this took until v1.79: measured against
  // the panel — the surface an audit of this project's usual shape would have
  // reached for — the very same swatch passes everywhere.
  const onPanel = sweepHues((hue, vision) => deltaE(hslToRgb(hue, 70, 55), panelBackground(), vision));
  assert.equal(onPanel.failures, 0, "the swatch was always safe on the panel; that was never the question");
});

test("the species legend's dot is the same rule, and always named itself", () => {
  // The sibling that got it right: `main.js` sets `color` on the dot span, so
  // `.legend .chip .dot`'s `box-shadow: 0 0 6px currentColor` glows in the
  // lineage's own fill. This is the control for the finding above — one idiom,
  // two instances, and the difference between them is a single declaration.
  const swept = sweepHues((hue, vision) =>
    deltaE(hslToRgb(hue, 68, 55), panelBackground(), vision)
  );
  assert.equal(swept.failures, 0);
  assert.ok(swept.worst > 35, `worst case ΔE ${swept.worst.toFixed(2)}`);
  assert.equal(lineageFill(0, "dot"), "hsl(0, 68%, 55%)", "the dot's fill is still the band's");
});

test("the ancestry pips clear every bar they are held to", () => {
  // The swatch's sibling four rows down, and the reason v1.61 could not finish:
  // painted from `style.css`, outside every sweep this project had. Brought in
  // here rather than left named-but-unmeasured under a closed list.
  const fill = sweepHues((hue, vision) => deltaE(ancestryPipTones(hue).fill, panelBackground(), vision));
  assert.equal(fill.failures, 0, "a filled pip disappears into the panel at some hue");
  assert.ok(fill.worst > 40, `filled pip worst ΔE ${fill.worst.toFixed(2)}`);

  // Its label is dark text on that fill — the pip's actual content, and the
  // only one of these three that carries a word rather than a colour.
  const label = sweepHues((hue, vision) => {
    const t = ancestryPipTones(hue);
    return deltaE(t.label, t.fill, vision);
  });
  assert.equal(label.failures, 0, "a species number vanishes into its own pip");
  assert.ok(label.worst > 40, `pip label worst ΔE ${label.worst.toFixed(2)}`);

  // An extinct ancestor: hollow, so the hue is carried by the text and the
  // dashed border, at 45% saturation against the panel itself.
  const gone = sweepHues((hue, vision) => deltaE(ancestryPipTones(hue).gone, panelBackground(), vision));
  assert.equal(gone.failures, 0, "a dead ancestor's pip is unreadable at some hue");
  assert.ok(gone.worst > 40, `hollow pip worst ΔE ${gone.worst.toFixed(2)}`);
});

test("the inspector's plates come from the palette, not from the stylesheet", () => {
  // v1.26's rule on the two backgrounds every mark above is measured against.
  // If someone edits style.css instead of this file, these stop agreeing and
  // the whole audit above is measuring a colour nobody sees.
  assert.equal(rgbCss(inspectorTrack()), "rgb(20, 33, 48)", "--insp-track / .genome span");
  assert.equal(rgbCss(brainGraphBackground()), "rgb(5, 8, 13)", "--braingraph-bg / .braingraph");
  const role = brainNodeColours();
  assert.equal(Object.keys(role).length, 3, "three roles, and no fourth dead default");
  for (const k of ["input", "hidden", "output"]) assert.ok(role[k], `${k} has a colour`);
  assert.ok(
    !Object.values(role).includes("#7fd0ff"),
    "the dead `hidden default` from v1.5 is gone, not merely unreachable"
  );
});
