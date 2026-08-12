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
import { Corpse } from "../src/food.js";
import { makeConfig } from "../src/config.js";
import { renderOps, renderFingerprint, hashOps } from "../src/rendershot.js";
import { refugeRadius, inRefuge } from "../src/refuge.js";
import { stateFingerprint, trajectoryFingerprint, observationFingerprint } from "../src/fingerprint.js";
import {
  sickHalo,
  immuneRing,
  predatorMark,
  predatorOutline,
  hazardTint,
  signalRing,
  attackFlash,
  corpseMark,
  CORPSE_FULL_MEAT,
  refugeRing,
  visionReach,
  selectionMark,
} from "../src/palette.js";
import { Trail } from "../src/trail.js";

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
  const outline = predatorOutline();
  const tint = hazardTint();
  for (const [what, colour] of [
    ["the sick halo's bright tone", halo.ring],
    ["the sick halo's dark rim", halo.rim],
    ["the immune ring's bright tone", ring.ring],
    ["the immune ring's dark rim", ring.rim],
    ["the predator mark's disc", mark.disc],
    ["the predator mark's rim", mark.rim],
    ["the predator outline's warm tone", outline.edge],
    ["the predator outline's dark hairline", outline.rim],
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

test("a corpse is drawn in two opaque tones, and its meat is its size", () => {
  // v1.55's half. The old splotch was one translucent maroon whose opacity fell
  // as the body rotted — the exact thing v1.34 forbids — and the tone was the
  // colour of the enriched ground a corpse lies on by construction.
  const w = pond({ scavenging: true }, 600);
  // Stage the corpses rather than wait for a die-off: two at the same spot, one
  // fresh and one nearly rotted, so the only thing that differs is the meat.
  w.corpses = [new Corpse(100, 100, CORPSE_FULL_MEAT), new Corpse(300, 300, 1)];
  const ops = renderOps(w);
  const painted = new Set(styles(ops));
  const m = corpseMark(CORPSE_FULL_MEAT);
  assert.ok(painted.has(m.core), `the corpse's core (${m.core}) never reached the canvas`);
  assert.ok(painted.has(m.ring), `the corpse's ring (${m.ring}) never reached the canvas`);
  // The exact style that was wrong, kept out — at either end of its old ramp.
  for (const s of painted) {
    assert.ok(!/^rgba\(150, 55, 48,/.test(s), `the translucent maroon splotch is back: ${s}`);
  }

  // Size carries the meat: the fresh corpse's discs are strictly larger than the
  // spent one's, and both are drawn. Asserted through the recorder because the
  // palette cannot know whether render.js used the number it returned.
  const cfg = w.config;
  const spent = corpseMark(1);
  const radii = opsNamed(ops, "arc").map((o) => o[4]);
  for (const [what, mark] of [["fresh", m], ["spent", spent]]) {
    for (const [half, r] of [
      ["ring", cfg.foodRadius * mark.radius],
      ["core", cfg.foodRadius * mark.radius * (1 - mark.ringWidth)],
    ]) {
      assert.ok(radii.some((x) => Math.abs(x - r) < 1e-9), `the ${what} corpse's ${half} (r=${r}) is not drawn`);
    }
  }
  assert.ok(
    cfg.foodRadius * m.radius > cfg.foodRadius * spent.radius,
    "a fresh corpse is not drawn larger than a spent one"
  );
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

test("the vision overlay draws the shadows opaque rock actually casts", () => {
  // v1.32 gave this overlay the region the index really searches, on the
  // principle that a bug you keep for compatibility is defensible and a view
  // that hides it is not. Opaque rock (v1.50) puts a second bite in the same
  // disc, and this asserts the drawing is `barriers.firstHit` and not a drawing
  // *about* it: every vertex of the path the renderer emits has to be a point
  // the rule itself calls visible, and the one just beyond it hidden.
  const w = new World(makeConfig({ seed: 314, barriers: true, barrierOcclusion: true }));
  for (let i = 0; i < 60; i++) w.step();
  // A creature with rock in front of it, so the polygon is not just the circle.
  const R = w.config.visionRadius;
  const subject = w.creatures.find((c) => {
    const radii = w.barriers.visibleRadii(c.x, c.y, R, 128);
    for (const d of radii) if (d < R - 1) return true;
    return false;
  });
  assert.ok(subject, "no creature in the pond had rock in sight");

  const ops = renderOps(w, null, (r) => {
    r.showVision = true;
    r.selected = subject;
  });
  // The overlay is the only thing here drawn as a long run of lineTo, so the
  // path is found by shape rather than by counting calls into the frame.
  // An op is [canvasId, name, ...args].
  let run = [];
  let best = [];
  for (const op of ops) {
    if (op[1] === "lineTo" || op[1] === "moveTo") run.push([op[2], op[3]]);
    else {
      if (run.length > best.length) best = run;
      run = [];
    }
  }
  if (run.length > best.length) best = run;
  assert.equal(best.length, 128, `the visibility path has ${best.length} vertices`);

  // At zoom 1 the camera is the identity, so a vertex is a world point.
  let shadowed = 0;
  for (const [px, py] of best) {
    const dx = px - subject.x;
    const dy = py - subject.y;
    const d = Math.hypot(dx, dy);
    assert.ok(d <= R + 1e-6, `a vertex sits ${d} out, past a radius of ${R}`);
    // Just inside the drawn distance is visible; just past it is not, unless
    // the ray never met rock at all and the vertex is simply the disc's edge.
    const ux = dx / (d || 1);
    const uy = dy / (d || 1);
    assert.equal(
      w.barriers.occluded(subject.x, subject.y, subject.x + ux * (d - 1), subject.y + uy * (d - 1)),
      false,
      "the overlay claims a point is visible that the rule hides"
    );
    if (d < R - 1) {
      shadowed++;
      assert.equal(
        w.barriers.occluded(subject.x, subject.y, subject.x + ux * (d + 1), subject.y + uy * (d + 1)),
        true,
        "the overlay stopped short of something the rule shows"
      );
    }
  }
  assert.ok(shadowed > 3, `only ${shadowed} of 128 rays were cut short`);
});

// ---------------------------------------------------------------------------
// The refuge line (v1.69). The mark whose *absence* is the statement, which is
// the only thing here that cannot be checked by looking at what was drawn: a
// ring missing because the body outgrew the rule and a ring missing because
// nothing was drawn at all are the same empty patch of water. So every
// assertion below is about the count, against the pond's own arithmetic.

/** How many living creatures the size rule can still reach. */
function edible(w) {
  return w.creatures.filter((c) => !c.dead && !inRefuge(c.radius, w.config)).length;
}

/** Arcs drawn at exactly the refuge radius, whatever else the frame contains. */
function refugeArcs(ops, radius) {
  return opsNamed(ops, "arc").filter((o) => o[4] === radius).length;
}

test("the refuge line is drawn once around everyone the eating rule can reach", () => {
  const w = pond();
  const radius = refugeRadius(w.config);
  const n = edible(w);
  assert.ok(n > 0 && n < w.creatures.length, `nothing to compare: ${n} of ${w.creatures.length}`);

  const off = renderOps(w);
  const on = renderOps(w, null, (r) => {
    r.showRefuge = true;
  });
  // Two strokes per ring — the dark rim and the pale tone over it — so the
  // difference is the count doubled. Taken as a difference rather than as an
  // absolute so a body arc that happens to land on 7.273 px cannot flatter it.
  assert.equal(
    refugeArcs(on, radius) - refugeArcs(off, radius),
    2 * n,
    "the number of rings is not the number of creatures still inside the rule"
  );
});

test("nothing is drawn where there is no rule to draw the edge of", () => {
  // Two ways for the line to be silent, and both have to be silent for the
  // right reason. Off is the default view every screenshot in this project was
  // taken of. Predation off is `refugeShare`'s own gate: the refuge is a fact
  // about two constants and does not move when hunting stops, so a pond where
  // nobody hunts has no refuge to be inside of.
  const w = pond();
  const radius = refugeRadius(w.config);
  assert.equal(refugeArcs(renderOps(w), radius), refugeArcs(renderOps(w), radius));

  const quiet = pond({ predation: false });
  const qr = refugeRadius(quiet.config);
  assert.ok(edible(quiet) > 0, "the sizes are there; only the rule that reads them is gone");
  assert.equal(
    refugeArcs(renderOps(quiet, null, (r) => (r.showRefuge = true)), qr),
    refugeArcs(renderOps(quiet), qr),
    "a pond with no hunters drew a refuge line"
  );
});

test("the refuge line draws the palette's tones, in screen-pixel hairlines", () => {
  // The v1.25 family of bug, asked of this mark: the audit measures the tones
  // in palette.js and nothing until this line checks that render.js draws them.
  const w = pond();
  const mark = refugeRing();
  const ops = renderOps(w, null, (r) => {
    r.showRefuge = true;
  });
  const drawn = new Set(styles(ops));
  assert.ok(drawn.has(mark.ring), `the pale tone ${mark.ring} never reached the canvas`);
  assert.ok(drawn.has(mark.rim), `the dark tone ${mark.rim} never reached the canvas`);

  // And the widths are the viewer's units, not the world's: the ring's radius
  // is a world measurement and the line over it is a drawing, so zooming in
  // shows more of the gap rather than a fatter mark.
  const widths = (zoom) =>
    new Set(
      renderOps(w, null, (r) => {
        r.showRefuge = true;
        r.camera.zoom = zoom;
      })
        .filter((o) => o[1] === "set:lineWidth")
        .map((o) => o[2])
    );
  const at1 = widths(1);
  const at4 = widths(4);
  assert.ok(at1.has(mark.width), `no line at the mark's own width: ${[...at1]}`);
  assert.ok(at4.has(mark.width / 4), "the hairline did not thin with the zoom");
});

test("the vision overlay says 'asked for' with a dash and 'looked at' with a solid line", () => {
  // v1.32 put two lines in this overlay — the radius a sense asks for, and the
  // region the index really searched — and separated them by opacity alone,
  // which is the one channel v1.34 forbids and the one a background can take
  // back. Measured, the pair was ΔE 0.00 apart at worst (palette.js has the
  // audit). The distinction is a dash now, so this asserts the dash exists, is
  // applied to exactly one of the two, and is cleared before anything else in
  // the frame can inherit it.
  const w = pond();
  const mark = visionReach();
  const ops = renderOps(w, null, (r) => {
    r.showVision = true;
    r.selected = w.creatures[0];
  });
  const drawn = new Set(styles(ops));
  assert.ok(drawn.has(mark.ring), `the pale tone ${mark.ring} never reached the canvas`);
  assert.ok(drawn.has(mark.rim), `the dark tone ${mark.rim} never reached the canvas`);

  // The default pond runs the inexact index, so both lines are drawn: the dash
  // is set once with a pattern and once back to nothing per solid stroke.
  const dashes = opsNamed(ops, "setLineDash").map((o) => o.slice(2));
  assert.ok(
    dashes.some((d) => d.length > 0),
    "nothing in the frame is dashed, so the two lines are told apart by nothing"
  );
  assert.deepEqual(dashes.filter((d) => d.length > 0)[0], mark.dash, "the dash is not the palette's");
  assert.deepEqual(dashes.at(-1), [], "the frame left a dash set for whatever draws next");

  // The pattern is a screen measurement like the width: at 4× the same dash
  // covers a quarter of the world distance, so the picture is the same picture.
  const at4 = opsNamed(
    renderOps(w, null, (r) => {
      r.showVision = true;
      r.selected = w.creatures[0];
      r.camera.zoom = 4;
    }),
    "setLineDash"
  ).map((o) => o.slice(2));
  assert.deepEqual(
    at4.filter((d) => d.length > 0)[0],
    mark.dash.map((d) => d / 4),
    "the dash did not shrink with the zoom"
  );
});

test("with nothing bounding the search, the overlay draws one solid line", () => {
  // The other arm of the same rule, and the one that says what the dash means:
  // when the radius *is* the region searched there is no aspiration to mark as
  // unmet, so nothing is dashed. `exactVision` is the config that makes the
  // disc honest, which is why it is the arm that has no dash in it.
  const w = pond({ exactVision: true });
  const ops = renderOps(w, null, (r) => {
    r.showVision = true;
    r.selected = w.creatures[0];
  });
  const dashed = opsNamed(ops, "setLineDash").filter((o) => o.length > 2);
  assert.deepEqual(dashed, [], "an exact sense drew a line marked as merely asked for");
  assert.ok(new Set(styles(ops)).has(visionReach().ring), "and it still drew the overlay");
});

// ---------------------------------------------------------------------------
// The trail (v1.84)

/** A trail holding `ticks` of a real creature's path through a real pond. */
function walked(w, ticks = 120) {
  const trail = new Trail();
  const subject = w.creatures.find((c) => !c.dead);
  for (let i = 0; i < ticks; i++) {
    w.step();
    trail.record(subject, w.tick);
  }
  return { trail, subject };
}

test("the trail draws the selection mark's tones, tapering toward its oldest end", () => {
  const w = pond();
  const { trail, subject } = walked(w);
  const mark = selectionMark();
  const ops = renderOps(w, null, (r) => {
    r.showTrail = true;
    r.trail = trail;
    r.selected = subject;
  });
  const drawn = new Set(styles(ops));
  assert.ok(drawn.has(mark.ring), `the pale tone ${mark.ring} never reached the canvas`);
  assert.ok(drawn.has(mark.rim), `the dark tone ${mark.rim} never reached the canvas`);

  // The fade is a width, not an opacity — the whole point of the release that
  // measured this mark. So the frame must set several distinct widths inside
  // the trail's band and never touch globalAlpha to do it.
  const widths = new Set(
    ops.filter((o) => o[1] === "set:lineWidth").map((o) => Number(o[2]).toFixed(6))
  );
  const full = mark.trailWidth;
  const thinnest = mark.trailWidth * mark.trailTaper;
  assert.ok(widths.has(full.toFixed(6)), `no line at the trail's full width: ${[...widths]}`);
  assert.ok(
    [...widths].some((v) => Number(v) < full && Number(v) >= thinnest - 1e-9),
    "the trail never thinned, so nothing says which end is now"
  );
  const alphas = ops.filter((o) => o[1] === "set:globalAlpha").map((o) => o[2]);
  assert.deepEqual(alphas, [], `the trail faded with opacity after all: ${alphas}`);
});

test("a trail is drawn only for the creature it belongs to", () => {
  // Three ways of asking for a line that would be a lie, and all three draw
  // nothing: the overlay switched off, no trail at all, and a trail recorded
  // from somebody other than the selection.
  const w = pond();
  const { trail, subject } = walked(w);
  const other = w.creatures.find((c) => !c.dead && c.id !== subject.id);
  // Each arm is compared against the *same selection* with no trail in it, so
  // the only difference either frame can carry is the line.
  const traces = (who, tune) => {
    const before = hashOps(renderOps(w, null, (r) => (r.selected = who)));
    return hashOps(renderOps(w, null, (r) => {
      r.selected = who;
      tune(r);
    })) !== before;
  };
  assert.ok(
    traces(subject, (r) => {
      r.showTrail = true;
      r.trail = trail;
    }),
    "the trail drew nothing when everything was in place"
  );
  assert.ok(!traces(subject, (r) => (r.trail = trail)), "the trail drew with the overlay switched off");
  assert.ok(!traces(subject, (r) => (r.showTrail = true)), "a renderer with no trail drew one");
  assert.ok(
    !traces(other, (r) => {
      r.showTrail = true;
      r.trail = trail;
    }),
    "somebody else's path was drawn under this creature"
  );
});

test("the trail is drawn in world coordinates and its ink in screen pixels", () => {
  // The same split every overlay here keeps: the *path* is a world measurement,
  // so zooming in spreads it out, and the *line over it* is a drawing, so
  // zooming in thins it. A trail whose width did not divide out of the zoom
  // would be a rope at 8×.
  const w = pond();
  const { trail, subject } = walked(w);
  const mark = selectionMark();
  const widths = (zoom) =>
    renderOps(w, null, (r) => {
      r.showTrail = true;
      r.trail = trail;
      r.selected = subject;
      r.camera.zoom = zoom;
    })
      .filter((o) => o[1] === "set:lineWidth")
      .map((o) => Number(o[2]));
  assert.ok(widths(1).includes(mark.trailWidth));
  assert.ok(widths(4).includes(mark.trailWidth / 4), "the trail did not thin with the zoom");
});

test("drawing a trail changes nothing about the pond, or about the trail", () => {
  // The header's claim, asked of the newest thing to read state — and of the
  // one piece of state a renderer has ever been handed that it could plausibly
  // want to write to.
  const w = pond();
  const { trail, subject } = walked(w);
  const before = [stateFingerprint(w), trajectoryFingerprint(w), observationFingerprint(w)];
  const path = JSON.stringify(trail.points());
  renderOps(w, null, (r) => {
    r.showTrail = true;
    r.trail = trail;
    r.selected = subject;
  });
  assert.deepEqual(
    [stateFingerprint(w), trajectoryFingerprint(w), observationFingerprint(w)],
    before,
    "a frame with a trail in it moved the world"
  );
  assert.equal(JSON.stringify(trail.points()), path, "drawing the path rewrote it");
});

test("drawing the refuge line changes nothing about the pond", () => {
  // The header's claim, asked of the newest thing to read `world.creatures`.
  const w = pond();
  const before = [stateFingerprint(w), trajectoryFingerprint(w), observationFingerprint(w)];
  renderOps(w, null, (r) => {
    r.showRefuge = true;
  });
  assert.deepEqual(
    [stateFingerprint(w), trajectoryFingerprint(w), observationFingerprint(w)],
    before
  );
});
