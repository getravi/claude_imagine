// The first tests `src/render.js` has ever had.
//
// It is the largest module in this project — 575 lines, the whole look of the
// thing — and it has been untested since v1.0 for a good reason: it needs a
// canvas. `src/rendershot.js` supplies one that records instead of painting, so
// the questions worth asking of a renderer can be asked here without a browser.
//
// Three of them, and the first is the one that has been asserted in a comment
// and nowhere else since v1.0: **drawing is read-only.** The header of
// render.js says "it never touches simulation state, so you can freeze the sim
// and still pan/inspect", and v1.28's lesson is that a comment claiming
// something works somewhere I am not is a thing to go and run.
//
// The second is that the marks the palette audit measures actually reach the
// canvas. `test/palette.test.js` has checked since v1.25 that the tones are
// legible; nothing has ever checked that `render.js` draws *those* tones. That
// is one surface measured and another assumed, which is the mistake v1.23,
// v1.25 and v1.30 all made in turn.
//
// The third is that the drawing constants draw. See test/levers.test.js for the
// other half of that — that they do nothing else.

import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { renderOps, renderFingerprint, hashOps } from "../src/rendershot.js";
import { stateFingerprint, trajectoryFingerprint, observationFingerprint } from "../src/fingerprint.js";
import {
  sickHalo,
  immuneRing,
  predatorMark,
  hazardTint,
  signalRing,
  attackFlash,
} from "../src/palette.js";

/** A world with some history in it, so there is something to draw. */
function pond(over = {}, ticks = 300) {
  const w = new World(makeConfig({ seed: 314, ...over }));
  for (let i = 0; i < ticks; i++) w.step();
  return w;
}

/** Every op of one kind: `arcs(ops)` → the arc commands. */
const opsNamed = (ops, name) => ops.filter((o) => o[1] === name);
/** Every style string the frame set, whatever property it was set on. */
const styles = (ops) => ops.filter((o) => o[1].startsWith("set:")).map((o) => String(o[2]));

test("drawing a world changes nothing about it", () => {
  // The claim render.js has made in prose since v1.0. All three channels, so a
  // renderer that quietly sorted a creature list or cached something onto a
  // creature would fail here rather than in a bug report about determinism.
  const w = pond();
  const before = [stateFingerprint(w), trajectoryFingerprint(w), observationFingerprint(w)];
  renderOps(w);
  renderOps(w, null, (r) => {
    r.showVision = true;
    r.selected = w.creatures[0];
    r.highlightSpeciesId = w.creatures[0].speciesId;
  });
  const after = [stateFingerprint(w), trajectoryFingerprint(w), observationFingerprint(w)];
  assert.deepEqual(after, before, "a frame moved the world it was drawing");
});

test("drawing draws no random numbers", () => {
  // Same claim, from the side that matters for directive 2: a renderer that
  // drew one number from the world's RNG would desynchronise every world the
  // moment anybody opened a second view of it.
  const w = pond({}, 120);
  let draws = 0;
  const real = w.rng.next;
  w.rng.next = () => {
    draws++;
    return real();
  };
  renderOps(w);
  w.rng.next = real;
  assert.equal(draws, 0, `drawing drew ${draws} random numbers`);
});

test("the same world drawn twice is the same picture", () => {
  const w = pond({ terrain: true, detritus: true }, 400);
  const a = renderOps(w);
  const b = renderOps(w);
  assert.deepEqual(b, a, "two frames of one unchanged world differ");
  assert.equal(renderFingerprint(w), renderFingerprint(w));
  assert.ok(a.length > 500, `a populated pond drew only ${a.length} operations`);
});

test("the recording reaches the offscreen layers too", () => {
  // Terrain is baked once into an offscreen canvas and blitted; enriched ground
  // is repainted every frame into a second one. A recording that only watched
  // the visible canvas would be blind to both — which is the entire content of
  // the terrain map and the entire content of the nutrient map.
  const plain = renderOps(pond());
  const layered = renderOps(pond({ terrain: true, detritus: true }, 700));
  assert.deepEqual([...new Set(plain.map((o) => o[0]))], ["pond"]);
  const surfaces = new Set(layered.map((o) => o[0]));
  assert.ok(surfaces.size >= 3, `only ${surfaces.size} drawing surfaces in a world with terrain and soil`);
  assert.ok(opsNamed(layered, "putImageData").length >= 2, "no pixels were pushed into the offscreen layers");
  assert.ok(opsNamed(layered, "drawImage").length >= 2, "the offscreen layers were never blitted");

  // And the pixels are part of the picture. A landscape is blitted with the
  // same four arguments whatever it looks like, so a recording that logged only
  // the `drawImage` call would be blind to the entire content of the map —
  // which is the shape of the bug this instrument exists to catch. One cell of
  // the roughness field, moved by hand.
  const t = pond({ terrain: true }, 200);
  const seen = renderFingerprint(t);
  const state = stateFingerprint(t);
  t.terrain.grid[0] = 1 - t.terrain.grid[0];
  assert.notEqual(renderFingerprint(t), seen, "the baked terrain is invisible to the fingerprint");
  assert.equal(stateFingerprint(t), state, "the probe moved the pond as well as the picture");
});

test("at zoom 1 the frame is drawn through the identity", () => {
  // The invariant v1.17 named when it added the camera, and which every
  // screenshot, permalink and hero image rests on. It has been asserted on the
  // camera's own arithmetic ever since; this is the first time it has been
  // asserted about a frame.
  const w = pond();
  const ops = renderOps(w);
  const transforms = opsNamed(ops, "setTransform");
  assert.ok(transforms.length >= 3);
  for (const t of transforms) {
    assert.deepEqual(t.slice(2), [1, 0, 0, 1, 0, 0], "the default view is not the identity");
  }
});

test("the food motes are drawn at the drawing radius", () => {
  // The concrete half of foodRadius's claim: the constant reaches the arcs.
  const w = pond();
  const alive = w.food.items.filter((f) => !f.eaten).length;
  for (const r of [3, 7]) {
    const ops = renderOps(w, makeConfig({ seed: 314, foodRadius: r }));
    const motes = opsNamed(ops, "arc").filter((o) => o[4] === r);
    assert.ok(motes.length >= alive, `${motes.length} arcs at radius ${r} for ${alive} pellets`);
  }
});

test("the marks the palette audit measured are the marks the canvas draws", () => {
  // v1.25, v1.26 and v1.34 each found a mark that had been invisible for
  // versions, and each audit measured the tones in palette.js. Nothing until now
  // has checked that render.js draws those tones rather than a colour of its
  // own that happens to sit next to them in the file.
  const w = pond({ disease: true }, 400);
  // Stage every state on real creatures rather than hoping the pond produced
  // one of each: the assertion is about the drawing, not about the epidemiology.
  const [sick, immune, hunter] = w.creatures;
  sick.infected = true;
  immune.infected = false;
  immune.immune = true;
  hunter.carnivory = 0.9;
  const painted = new Set(styles(renderOps(w)));

  const halo = sickHalo();
  const ring = immuneRing();
  const mark = predatorMark(hunter.carnivory);
  const tint = hazardTint();
  for (const [what, colour] of [
    ["the sick halo's bright tone", halo.ring],
    ["the sick halo's dark rim", halo.rim],
    ["the immune ring's bright tone", ring.ring],
    ["the immune ring's dark rim", ring.rim],
    ["the predator mark's disc", mark.disc],
    ["the predator mark's rim", mark.rim],
    ["the contagious zone", `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${tint.a})`],
  ]) {
    assert.ok(painted.has(colour), `${what} (${colour}) never reached the canvas`);
  }

  // The immune ring is told from the halo by its dashes, not by its colour —
  // the two are indistinguishable to a tritanope at their bright ends, which is
  // why v1.34 spent geometry instead of a tenth hue. A dash pattern that
  // silently stopped being applied would restore the collision.
  const dashes = opsNamed(renderOps(w), "setLineDash").filter((o) => o.length > 2);
  assert.deepEqual(dashes[0].slice(2), ring.dash, "the immune ring is no longer dashed");
});

test("the call and the bite are drawn opaque, in the tones the audit measured", () => {
  // v1.43's half of the same claim, for the two marks the v1.34 sweep skipped.
  // Both were additive over the body — which is not a background either mark
  // controls — and both are now two opaque tones out of palette.js.
  const w = pond({ signalling: true }, 400);
  const [shouter, mutterer, biter] = w.creatures;
  shouter.signal = 0.9;
  mutterer.signal = -0.9;
  biter.carnivory = 0.9;
  biter.lastBiteAge = biter.age;
  const ops = renderOps(w);
  const painted = new Set(styles(ops));

  const tones = signalRing(1);
  const flash = attackFlash();
  for (const [what, colour] of [
    ["a positive call's bright ring", signalRing(0.9).ring],
    ["a negative call's bright ring", signalRing(-0.9).ring],
    ["the call's dark rim", tones.rim],
    ["the attack flash's disc", flash.disc],
    ["the attack flash's rim", flash.rim],
  ]) {
    assert.ok(painted.has(colour), `${what} (${colour}) never reached the canvas`);
  }
  // The exact styles that were wrong, kept out. A suite that only knows the new
  // constants stays green while someone restores the old ones — the v1.24
  // lesson, and the reason `test/palette.test.js` still measures both.
  assert.ok(!painted.has("rgba(255, 120, 90, 0.6)"), "the additive attack flash is back");
  for (const s of painted) {
    assert.ok(
      !/^hsla\((48|205), 95%, 70%,/.test(s),
      `a signal ring is a translucent additive tone again: ${s}`
    );
  }

  // Loudness is geometry: the same creature calling twice as loud must move an
  // arc, not a colour. Drawn through the recorder rather than asserted on the
  // palette, because the palette cannot know whether render.js used the number.
  const radii = (signal) => {
    mutterer.signal = signal;
    return opsNamed(renderOps(w), "arc").map((o) => o[4]);
  };
  const quiet = radii(-0.25);
  const loud = radii(-1);
  assert.notDeepEqual(loud, quiet, "a louder call drew exactly the same rings");
  const grew = loud.filter((r, i) => r > (quiet[i] ?? Infinity)).length;
  assert.ok(grew > 0, "no arc got bigger when the call got louder");
});

test("the picture hash sees a restyled mark", () => {
  // The property that makes this instrument worth having: it is not a hash of
  // geometry with the colours left out. Written against a recorded stream
  // rather than a second world, so it tests the hash and nothing else.
  const ops = renderOps(pond({}, 60));
  const original = hashOps(ops);
  const nudged = ops.map((o) => o.slice());
  const style = nudged.find((o) => o[1] === "set:fillStyle");
  style[2] = String(style[2]).replace("0.28", "0.29");
  assert.notEqual(hashOps(nudged), original, "a colour changed and the hash did not");

  const moved = ops.map((o) => o.slice());
  const arc = moved.find((o) => o[1] === "arc");
  arc[2] += Number.EPSILON * arc[2]; // one ulp
  assert.notEqual(hashOps(moved), original, "a mark moved by one bit and the hash did not");
});

test("reduced motion changes the veil and nothing in the pond", () => {
  // The one renderer setting that changes what is *composited* rather than what
  // is drawn: a full clear instead of a translucent veil. It is a drawing
  // choice, so it must show in the picture and not in the world.
  const w = pond();
  const before = stateFingerprint(w);
  const normal = renderOps(w);
  const reduced = renderOps(w, null, (r) => (r.reducedMotion = true));
  assert.equal(stateFingerprint(w), before);
  const veil = (ops) => ops.find((o) => o[1] === "set:fillStyle")[2];
  assert.ok(veil(normal).startsWith("rgba("), `the trail veil is ${veil(normal)}`);
  assert.ok(veil(reduced).startsWith("rgb("), `reduced motion still paints a veil: ${veil(reduced)}`);
  assert.notEqual(hashOps(reduced), hashOps(normal));
});
