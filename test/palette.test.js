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
  CVD_TYPES,
  VISION_MODELS,
  MIN_DELTA_E,
} from "../src/palette.js";

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
