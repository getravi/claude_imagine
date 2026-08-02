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
  predatorMarkTones,
  minimapPredatorMark,
  minimapPredatorTones,
  mortalityColours,
  mortalityTones,
  energyColours,
  energyTones,
  barTrack,
  detritusTint,
  DETRITUS_MAX_ALPHA,
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
  powerLine,
  powerLineTones,
  POWER_BAND_ALPHA,
  axisRule,
  axisRuleTone,
  MIN_RULE_DELTA_E,
  MAX_RULE_DELTA_E,
  signalRing,
  signalRingTones,
  SIGNAL_QUIET,
  attackFlashTones,
  lineageFill,
  lineageBandRgb,
  bandHatch,
  HATCH_ALPHA,
} from "../src/palette.js";
import { ENERGY_SINKS } from "../src/energy.js";
import { independentAny } from "../src/contagion.js";
import { terrainBandFill, TERRAIN_BANDS } from "../src/minimap.js";

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

/** The biome glow at its centre: additive, as render.js draws it. */
function overBiome(bg) {
  return addOver(bg, { r: 30, g: 78, b: 66 }, 0.16);
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
      }
    }
    out.push({ name: `season ${phase} flat`, rgb: v });
    out.push({ name: `season ${phase} flat +biome`, rgb: overBiome(v) });
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
  const bg = { r: 7, g: 12, b: 19 };
  const out = [{ name: "mini bare", rgb: bg }];
  for (let band = 0; band < TERRAIN_BANDS; band++) {
    const m = terrainBandFill(band).match(/rgba?\(([^)]+)\)/)[1].split(",").map(Number);
    const g = blendOver(bg, { r: m[0], g: m[1], b: m[2] }, m[3]);
    out.push({ name: `mini band ${band}`, rgb: g });
    // The minimap paints biomes as a flat wash rather than an additive glow.
    out.push({ name: `mini band ${band} +biome`, rgb: blendOver(g, { r: 32, g: 82, b: 70 }, 0.5) });
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
  const mote = { r: 90, g: 220, b: 150 }; // rgba(90, 220, 150, 0.55), additive
  let worst = { d: Infinity };
  for (const { name, rgb } of hazardBackgrounds()) {
    const field = hazardOver(rgb, HAZARD_AUDIT_SOURCES);
    for (const vision of VISION_MODELS) {
      const d = deltaE(addOver(field, mote, 0.55), field, vision);
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
