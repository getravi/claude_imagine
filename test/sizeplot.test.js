// sizeplot.test.js — the body-size figure (v1.104).
//
// The first figure in this project whose x-axis is a property of a creature
// rather than a time, a place or a line of descent, which means it is the first
// one whose axis can be *wrong about the world* rather than merely stale: a
// chart's x is whatever the history says, and this one is a claim that every
// body in the pond falls between two constants.
//
// Five things are asserted here.
//
//   1. **The axis contains the pond**, over a real run and over the extremes a
//      genome can express. This is the claim that lets `sizeBinOf`'s clamp be
//      documented as unreachable, and a clamp nobody has shown to be
//      unreachable is a silent pile-up at one end of a picture.
//   2. **The bars are the population**, exactly: every creature is counted
//      once, in the bar its radius falls in, on the side of the diet threshold
//      the rule puts it. The counting is the whole module, so it is checked
//      against the rule rather than against a second copy of the arithmetic.
//   3. **The drawing is read-only and draws no randomness** — the same claim
//      `test/chart.test.js` and `test/render.test.js` make about the other
//      canvases, made through the same recorder.
//   4. **A body is never rounded out of the picture.** A bar holding one
//      creature is painted at least a pixel tall, which is what makes the loner
//      at the far end of the range — the thing this figure exists to show —
//      visible at all.
//   5. **The reader and the listener agree.** The caption and the `aria-label`
//      are two renderings of one subject, which is v1.103's whole finding one
//      figure over, so the numbers in the first have to appear in the second.
//   6. **The two rules are one colour** (v1.112). The mean is drawn in the
//      refuge's ink and told apart by being dashed, which is the power strip's
//      answer to the same problem, so what needs pinning is not a contrast but
//      the *absence* of a fourth colour — and the fact that `meanHeld`, the
//      bar the mark stands in, is a different question from `nearest`, the
//      distance the caption prints beside it.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { Genome } from "../src/genome.js";
import { Creature } from "../src/creature.js";
import { RNG } from "../src/rng.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { recordingContext } from "../src/rendershot.js";
import { refugeRadius } from "../src/refuge.js";
import { describeSizes } from "../src/describe.js";
import {
  MEAN_DASH,
  SIZE_BINS,
  drawSizes,
  meanFrac,
  refugeFrac,
  sizeAxis,
  sizeBinOf,
  sizeCaption,
  sizeProfile,
} from "../src/sizeplot.js";
import { refugeRing } from "../src/palette.js";

const W = 300;
const H = 46;

/** A world of the given config, run on. */
function ran(overrides, ticks) {
  const world = new World(makeConfig(overrides));
  for (let i = 0; i < ticks; i++) world.step();
  return world;
}

/** A stand-in body — the two fields this module reads, and nothing else. */
const body = (radius, carnivory = 0) => ({ radius, carnivory });

/** Draw into the recorder and hand back the op log. */
function draw(profile, config, axis = sizeAxis(config)) {
  const { ctx, ops } = recordingContext("sizes");
  drawSizes(ctx, W, H, profile, { config, axis });
  return ops;
}

/** The `fillRect` calls, in order, as {x, y, w, h, fill}. */
function rects(ops) {
  const out = [];
  let fill = null;
  for (const [, name, ...args] of ops) {
    if (name === "set:fillStyle") fill = args[0];
    if (name === "fillRect") {
      const [x, y, w, h] = args;
      out.push({ x, y, w, h, fill });
    }
  }
  return out;
}

// ---- the axis ----

test("the axis is the range a genome can express, and the pond is inside it", () => {
  const world = ran({ seed: 314 }, 2000);
  const axis = sizeAxis(world.config);
  assert.equal(axis.lo, world.config.bodyRadiusMin);
  assert.equal(axis.hi, world.config.bodyRadiusMax);
  assert.ok(world.creatures.length > 0, "a pond with nobody in it proves nothing");
  for (const c of world.creatures) {
    assert.ok(c.radius >= axis.lo && c.radius <= axis.hi, `${c.radius} is off the axis`);
  }
});

test("the extremes of the size gene land in the end bars and not past them", () => {
  const config = makeConfig();
  const axis = sizeAxis(config);
  for (const gene of [0, 1]) {
    const genome = Genome.random(new RNG(7));
    genome.data[genome.data.length - 4] = gene;
    const c = new Creature(genome, config, 100, 100, new RNG(11), 0);
    assert.equal(sizeBinOf(c.radius, axis), gene === 0 ? 0 : SIZE_BINS - 1);
  }
});

test("a body outside the axis is held at the end rather than written past it", () => {
  // Unreachable in a pond whose constants have not moved under it, and reachable
  // the moment `src/levers.js` shrinks `bodyRadiusMax`. The clamp is what stops
  // an instrument breaking on the world it is measuring.
  const axis = sizeAxis(makeConfig());
  assert.equal(sizeBinOf(-100, axis), 0);
  assert.equal(sizeBinOf(1e6, axis), SIZE_BINS - 1);
  const flat = sizeAxis(makeConfig({ bodyRadiusMin: 8, bodyRadiusMax: 8 }));
  assert.equal(flat.span, 0);
  assert.deepEqual(flat.marks, []);
  assert.equal(sizeBinOf(8, flat), 0);
});

test("the axis marks are round numbers inside the range, in order", () => {
  const axis = sizeAxis(makeConfig(), W);
  assert.ok(axis.marks.length >= 2, "an axis with one mark is not an axis");
  let last = -Infinity;
  for (const mark of axis.marks) {
    assert.ok(mark.tick >= axis.lo && mark.tick <= axis.hi, `${mark.tick} is off the axis`);
    assert.ok(mark.tick > last, "marks must ascend");
    last = mark.tick;
    // The mark is a radius, and where it sits is a linear map of it — the one
    // property this axis has that the chart's x does not (see `tickFrac`).
    assert.ok(Math.abs(mark.frac - (mark.tick - axis.lo) / axis.span) < 1e-12);
  }
});

// ---- the counting ----

test("every creature is counted exactly once, on the side of the rule it is on", () => {
  const world = ran({ seed: 128 }, 1200);
  const config = world.config;
  const axis = sizeAxis(config);
  const profile = sizeProfile(world.creatures, config, axis);
  let grazers = 0;
  let carnivores = 0;
  for (let i = 0; i < SIZE_BINS; i++) {
    grazers += profile.grazer[i];
    carnivores += profile.carnivore[i];
  }
  assert.equal(grazers + carnivores, world.creatures.length);
  assert.equal(profile.total, world.creatures.length);
  // The split is the rule in `creature.js`, asked of every body rather than
  // re-derived: a carnivore is a diet gene at or above the threshold.
  const expected = world.creatures.filter((c) => c.carnivory >= config.carnivoreThreshold).length;
  assert.equal(carnivores, expected);
  assert.equal(profile.carnivores, expected);
  // And each of them is in the bar its own radius falls in.
  const grid = new Int32Array(SIZE_BINS);
  for (const c of world.creatures) grid[sizeBinOf(c.radius, axis)]++;
  for (let i = 0; i < SIZE_BINS; i++) {
    assert.equal(profile.grazer[i] + profile.carnivore[i], grid[i], `bar ${i}`);
  }
});

test("the peak is the tallest bar and the mean is the mean", () => {
  const config = makeConfig();
  const axis = sizeAxis(config);
  const bodies = [body(4), body(4.05), body(4.1, 1), body(7.9)];
  const profile = sizeProfile(bodies, config, axis);
  assert.equal(profile.peak, 3, "three of the four fall in one 0.15px bar");
  assert.equal(profile.total, 4);
  assert.equal(profile.carnivores, 1);
  assert.equal(profile.min, 4);
  assert.equal(profile.max, 7.9);
  assert.ok(Math.abs(profile.mean - (4 + 4.05 + 4.1 + 7.9) / 4) < 1e-12);
});

test("`nearest` is the distance from the mean to the closest body", () => {
  const config = makeConfig();
  // A pond with a middle: the mean is somebody.
  const together = sizeProfile([body(6), body(6), body(6)], config);
  assert.equal(together.nearest, 0);
  // A pond with a hole where its average is — the state this figure was built
  // to make visible, and the one no mean, maximum or share can express.
  const apart = sizeProfile([body(4), body(4), body(8), body(8)], config);
  assert.equal(apart.mean, 6);
  assert.equal(apart.nearest, 2);
});

test("an empty pond has every field and no early return", () => {
  const config = makeConfig();
  const profile = sizeProfile([], config);
  const keys = ["total", "carnivores", "peak", "min", "max", "mean", "nearest", "meanBin", "meanHeld"];
  for (const key of keys) {
    assert.equal(profile[key], 0, `${key} must be a number in an empty pond`);
  }
  assert.equal(profile.grazer.length, SIZE_BINS);
  assert.match(sizeCaption(profile, config), /No bodies/);
  assert.match(describeSizes(profile, config), /no bodies/i);
  // And it draws — a figure that throws on an empty pond is a figure that
  // throws the moment a scenario is pressed.
  assert.doesNotThrow(() => draw(profile, config));
});

// ---- the refuge rule ----

test("the refuge line sits where the refuge is, and only when there is one", () => {
  const config = makeConfig();
  const axis = sizeAxis(config);
  const frac = refugeFrac(config, axis);
  assert.ok(frac !== null);
  assert.ok(Math.abs(frac - (refugeRadius(config) - axis.lo) / axis.span) < 1e-12);
  // Gated exactly as the two tiles that quote the same threshold are: the
  // arithmetic survives switching hunting off and the meaning does not.
  assert.equal(refugeFrac(makeConfig({ predation: false }), axis), null);
  // And off the end of its own range, there is no line to draw.
  const tiny = makeConfig({ preySizeRatio: 0.1 });
  assert.equal(refugeFrac(tiny, sizeAxis(tiny)), null);
});

test("the line is drawn last, so nothing can be painted over it", () => {
  const config = makeConfig();
  const profile = sizeProfile([body(4), body(7.9)], config);
  const painted = rects(draw(profile, config));
  const last = painted[painted.length - 1];
  assert.equal(last.w, 1, "the rule is a hairline");
  assert.equal(last.h, H, "the rule crosses the whole figure");
  assert.ok(painted.length > 1, "the bars have to be there for the order to mean anything");
});

test("with predation off the figure draws bars and the mean, and no refuge", () => {
  const config = makeConfig({ predation: false });
  const profile = sizeProfile([body(4), body(7.9)], config);
  const painted = rects(draw(profile, config));
  const bars = painted.filter((r) => r.w > 1);
  assert.equal(bars.length, 2, "two bodies, two bars");
  // The refuge rule is gated on the rule it marks; the mean is not gated on
  // anything, because a mean body radius means what it means in a pond where
  // nothing hunts. So the only full-height hairline is gone and the dashes
  // are not.
  assert.ok(!painted.some((r) => r.h === H && r.w === 1), "no refuge rule");
  assert.equal(painted.length - bars.length, dashCount(H), "the mean is still drawn");
});

// ---- the mean rule (v1.112) ----

/** How many dashes `MEAN_DASH` puts on a rule of the given height. */
function dashCount(height) {
  const [on, off] = MEAN_DASH;
  return Math.ceil(height / (on + off));
}

test("the mean rule sits where the mean is, and only when there is a mean", () => {
  const config = makeConfig();
  const axis = sizeAxis(config);
  const profile = sizeProfile([body(4), body(8)], config, axis);
  const frac = meanFrac(profile, axis);
  assert.ok(Math.abs(frac - (profile.mean - axis.lo) / axis.span) < 1e-12);
  // An empty pond has no mean to draw, and an axis with no span has nowhere to
  // draw one — the two states `refugeFrac` guards for its own reasons.
  assert.equal(meanFrac(sizeProfile([], config), axis), null);
  const flat = sizeAxis(makeConfig({ bodyRadiusMin: 8, bodyRadiusMax: 8 }));
  assert.equal(meanFrac(profile, flat), null);
  // And a body left off the end by a swept ceiling is a mark off the figure.
  const shrunk = sizeAxis(makeConfig({ bodyRadiusMax: 5 }));
  assert.equal(meanFrac(sizeProfile([body(20)], config, shrunk), shrunk), null);
});

test("the two rules are one colour, told apart by one of them being dashed", () => {
  // The reason this figure has a second rule at all: v1.104 deferred it for
  // want of "a second measured ink", and the power strip had already shown that
  // a distinction carried by continuity needs no ink and cannot be lost to any
  // vision model. A test, so the next hand to touch this cannot quietly spend a
  // colour instead.
  const config = makeConfig();
  const profile = sizeProfile([body(5), body(5)], config);
  const painted = rects(draw(profile, config));
  const hairlines = painted.filter((r) => r.w === 1);
  assert.ok(hairlines.length > 1, "both rules have to be drawn");
  for (const line of hairlines) {
    assert.equal(line.fill, refugeRing().ring, "both rules are the refuge's ink");
  }
  const solid = hairlines.filter((r) => r.h === H);
  const dashes = hairlines.filter((r) => r.h < H);
  assert.equal(solid.length, 1, "the refuge is one unbroken line");
  assert.equal(dashes.length, dashCount(H), "the mean is dashed");
  // The dashes are one column, evenly spaced, and inside the figure.
  const [on, off] = MEAN_DASH;
  const x = dashes[0].x;
  dashes.forEach((d, i) => {
    assert.equal(d.x, x, "every dash is in the mean's own column");
    assert.equal(d.y, i * (on + off));
    assert.ok(d.y + d.h <= H, "no dash hangs off the bottom");
  });
  assert.notEqual(x, solid[0].x, "5px is not the refuge, so the columns differ");
});

test("the mean rule is drawn under the refuge, because they can share a column", () => {
  // The two rules land in one column only when the mean is within 0.015px of
  // the refuge — 4.5px of axis over 300 backing pixels — and then the solid
  // line is the honest mark, since both readings are the same number to
  // anything this figure can draw.
  const config = makeConfig();
  const axis = sizeAxis(config);
  const r = refugeRadius(config);
  const profile = sizeProfile([body(r), body(r)], config, axis);
  const painted = rects(draw(profile, config, axis));
  const last = painted[painted.length - 1];
  assert.equal(last.h, H, "the refuge is painted last");
  assert.equal(last.x, Math.min(W - 1, Math.round(meanFrac(profile, axis) * W)));
});

test("`meanHeld` is the height of the bar the rule stands in", () => {
  const config = makeConfig();
  const axis = sizeAxis(config);
  // A pond with a middle: the mean's bar holds the pond.
  const together = sizeProfile([body(6), body(6), body(6)], config, axis);
  assert.equal(together.meanBin, sizeBinOf(6, axis));
  assert.equal(together.meanHeld, 3);
  // A pond with a hole where its average is: the rule stands in nothing.
  const apart = sizeProfile([body(4), body(4), body(8), body(8)], config, axis);
  assert.equal(apart.mean, 6);
  assert.equal(apart.meanHeld, 0);
  // And the case the caption exists to keep honest, which is the one the two
  // statistics disagree on: three bodies in two neighbouring bars whose mean
  // falls in the empty bar between them. `meanHeld` is 0 and `nearest` is
  // 0.07px — less than half a bar — and both are true. Over twelve seeds this
  // is 40% of every empty bar the figure draws, so a mark read on its own would
  // report a hole where there is a boundary.
  const edge = axis.lo + 12 * axis.binWidth;
  const split = sizeProfile([body(edge - 0.01), body(edge + 0.2), body(edge + 0.2)], config, axis);
  assert.equal(split.meanBin, 12, "the mean lands in the bar between the two groups");
  assert.equal(split.meanHeld, 0, "which holds nobody");
  assert.ok(split.nearest < axis.binWidth / 2, `nearest is ${split.nearest.toFixed(3)}px`);
});

test("both registers say when the mean's bar is empty, and neither says it alone", () => {
  const config = makeConfig();
  const apart = sizeProfile([body(4), body(4), body(8), body(8)], config);
  const caption = sizeCaption(apart, config);
  assert.match(caption, /nobody in its bar/);
  assert.match(describeSizes(apart, config), /no body falls in the bar it stands in/);
  // The distance is beside it either way — the clause is about the picture and
  // the number is about the pond, and two of every five empty bars measured
  // over twelve seeds have a body inside one bar width.
  assert.match(caption, new RegExp(`nearest body ${apart.nearest.toFixed(2)}px`));
  // A pond with a middle says nothing about bars at all, in either register.
  const together = sizeProfile([body(6), body(6)], config);
  assert.doesNotMatch(sizeCaption(together, config), /bar it|nobody in its bar/);
  assert.doesNotMatch(describeSizes(together, config), /falls in the bar/);
});

// ---- the drawing ----

test("a bar holding one creature is still a pixel tall", () => {
  const config = makeConfig();
  // Three hundred grazers in one bar and a single one at the top of the range:
  // 0.33% of the peak, which rounds to zero everywhere except here.
  const bodies = [...Array(300)].map(() => body(6)).concat([body(7.99)]);
  const profile = sizeProfile(bodies, config);
  const painted = rects(draw(profile, config)).filter((r) => r.w > 1);
  assert.equal(painted.length, 2);
  const loner = painted.find((r) => r.h === Math.min(...painted.map((p) => p.h)));
  assert.equal(loner.h, 1, "the loner must be drawn");
  assert.equal(loner.y + loner.h, H, "and it must sit on the baseline");
});

test("the two halves of a bar are stacked, not overdrawn", () => {
  const config = makeConfig();
  const profile = sizeProfile([body(6), body(6), body(6, 1)], config);
  const painted = rects(draw(profile, config)).filter((r) => r.w > 1);
  assert.equal(painted.length, 2, "one bar, two segments");
  const [grazers, carnivores] = painted;
  assert.equal(grazers.y + grazers.h, H, "grazers sit on the baseline");
  assert.equal(carnivores.y + carnivores.h, grazers.y, "carnivores sit on the grazers");
  assert.notEqual(grazers.fill, carnivores.fill);
  assert.ok(grazers.h > carnivores.h, "two of three against one of three");
});

test("thirty bars span the figure with no seam and no overlap", () => {
  const config = makeConfig();
  const axis = sizeAxis(config);
  // One body in every bar, so every bar is painted.
  const bodies = [];
  for (let i = 0; i < SIZE_BINS; i++) bodies.push(body(axis.lo + (i + 0.5) * axis.binWidth));
  const painted = rects(draw(sizeProfile(bodies, config, axis), config, axis)).filter((r) => r.w > 1);
  assert.equal(painted.length, SIZE_BINS);
  assert.equal(painted[0].x, 0);
  let edge = 0;
  for (const bar of painted) {
    assert.equal(bar.x, edge, "each bar starts where the last one ended");
    edge = bar.x + bar.w;
  }
  assert.equal(edge, W, "and the last one ends at the edge");
});

test("drawing the figure touches neither the world nor the RNG", () => {
  const world = ran({ seed: 314 }, 400);
  const before = stateFingerprint(world);
  let draws = 0;
  const real = world.rng.next;
  world.rng.next = () => {
    draws++;
    return real();
  };
  const axis = sizeAxis(world.config);
  draw(sizeProfile(world.creatures, world.config, axis), world.config, axis);
  world.rng.next = real;
  assert.equal(draws, 0, `drawing the figure drew ${draws} random numbers`);
  assert.equal(stateFingerprint(world), before);
});

// ---- the two registers ----

test("the caption states the scale that moves and the summary it doubts", () => {
  const world = ran({ seed: 128 }, 2000);
  const profile = sizeProfile(world.creatures, world.config);
  const caption = sizeCaption(profile, world.config);
  assert.match(caption, new RegExp(`tallest bar ${profile.peak.toLocaleString()}`));
  assert.match(caption, new RegExp(`mean ${profile.mean.toFixed(1)}px`));
  assert.match(caption, new RegExp(`nearest body ${profile.nearest.toFixed(2)}px`));
  assert.match(caption, new RegExp(`refuge ${refugeRadius(world.config).toFixed(1)}px`));
  // The refuge clause follows the rule's own gate, in both registers.
  const quiet = makeConfig({ seed: 128, predation: false });
  assert.doesNotMatch(sizeCaption(sizeProfile(world.creatures, quiet), quiet), /refuge/);
  assert.doesNotMatch(describeSizes(sizeProfile(world.creatures, quiet), quiet), /able to eat/);
});

test("every number the reader gets, the listener gets", () => {
  const world = ran({ seed: 128 }, 2000);
  const profile = sizeProfile(world.creatures, world.config);
  const spoken = describeSizes(profile, world.config);
  for (const digits of [
    String(profile.peak),
    profile.mean.toFixed(1),
    profile.nearest.toFixed(2),
    refugeRadius(world.config).toFixed(1),
  ]) {
    assert.ok(spoken.includes(digits), `the sentence never says ${digits}: ${spoken}`);
  }
  // And two things the caption has no room for, which is why the sentence is
  // not a transcription of it: what the pond's bodies actually span, and how
  // many of them carry the diet gene.
  assert.ok(spoken.includes(profile.min.toFixed(1)));
  assert.ok(spoken.includes(profile.max.toFixed(1)));
  assert.ok(spoken.includes(String(profile.carnivores)));
});

test("the spoken peak names the bar's own middle, not the mean of what fell in it", () => {
  const config = makeConfig();
  const axis = sizeAxis(config);
  // Two bodies at the two ends of one bar: their mean is the bar's centre, and
  // a sentence that said "the tallest bar is at 4.01px" would be naming a body
  // rather than the thing a reader is looking at.
  const bar = 5;
  const centre = axis.lo + (bar + 0.5) * axis.binWidth;
  const lo = axis.lo + bar * axis.binWidth + 1e-9;
  const profile = sizeProfile([body(lo), body(lo + axis.binWidth / 2)], config, axis);
  assert.match(describeSizes(profile, config), new RegExp(`near ${centre.toFixed(1)} pixels`));
});

// ---- the shape this figure was built to show ----

test("a pond whose mean is nobody reads differently from a pond with a middle", () => {
  // The finding, as an assertion rather than a paragraph: on seed 128 at 6,000
  // ticks the two diets sit 2.9px apart with empty axis between them, and no
  // body is within a quarter of a pixel of the pond's own average. This is the
  // state `Refuge 🔒`, `Safe 🛟` and the death-size line all summarise away.
  const world = ran({ seed: 128 }, 6000);
  const profile = sizeProfile(world.creatures, world.config);
  assert.ok(profile.total > 100, "the finding needs a pond");
  assert.ok(
    profile.nearest > sizeAxis(world.config).binWidth,
    `nearest body ${profile.nearest.toFixed(3)}px from the mean of ${profile.mean.toFixed(3)}`
  );
  // Two spikes: the tallest bar holds a majority of a bimodal pond, and the
  // bars between the two modes are empty.
  let occupied = 0;
  for (let i = 0; i < SIZE_BINS; i++) if (profile.grazer[i] + profile.carnivore[i] > 0) occupied++;
  assert.ok(occupied < SIZE_BINS / 2, `${occupied} of ${SIZE_BINS} bars hold anybody`);
});

test("the default pond has a middle, which is the control", () => {
  const world = ran({ seed: DEFAULT_CONFIG.seed }, 6000);
  const profile = sizeProfile(world.creatures, world.config);
  assert.ok(
    profile.nearest < 0.05,
    `the default pond's mean should be a real body, not ${profile.nearest.toFixed(3)}px off one`
  );
});
