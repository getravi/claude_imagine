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
  HAZARD_SOURCE_ALPHA,
  HAZARD_AUDIT_SOURCES,
  sickHalo,
  sickHaloTones,
  immuneRing,
  immuneRingTones,
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
