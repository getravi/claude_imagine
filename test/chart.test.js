// chart.test.js — the population chart's scale (v1.41).
//
// The figure is the oldest view in the project and until now the least
// examined: two lines, no axis, and a normaliser that grew during the run so
// that the same height meant a different number an hour later. Four claims here.
//
//  1. The axis arithmetic is *nice*: round steps, a ceiling at or just above
//     the peak, and monotone in the peak — a record that goes up can never make
//     the ceiling go down.
//  2. The ceiling is what the lines are drawn against, so the labels and the
//     data cannot disagree. This is checked through the recorder from v1.40:
//     the y a gridline is stroked at is the y the tick's value maps to.
//  3. Drawing a figure changes nothing and draws no random numbers — the same
//     claim `test/render.test.js` makes about the pond, on the other canvas.
//  4. The spoken form carries both scales, because "214 creatures" without a
//     ceiling is the number the picture already failed to give.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AXIS_LINES,
  MIN_TOP,
  niceStep,
  popAxis,
  plotY,
  axisLabels,
  drawChart,
} from "../src/chart.js";
import { recordingContext } from "../src/rendershot.js";
import { describeChart } from "../src/describe.js";
import { chartLines } from "../src/palette.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";

const W = 300;
const H = 90;

/** A plausible history, the shape `stats.popHistory` hands the chart. */
function history(n, popOf = (i) => 100 + i, foodOf = (i) => 300 - i) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ tick: i * 4, pop: popOf(i), food: foodOf(i) });
  return out;
}

/** The same, with the min/max envelopes the whole-run scope carries. */
function wholeHistory(n) {
  return history(n).map((h) => ({
    ...h,
    min: { pop: h.pop - 10, food: h.food - 20 },
    max: { pop: h.pop + 10, food: h.food + 20 },
  }));
}

const draw = (hist, opts) => {
  const { ctx, ops } = recordingContext("chart");
  drawChart(ctx, W, H, hist, opts);
  return ops;
};

// ---- the axis arithmetic ----

test("a step is always 1, 2 or 5 times a power of ten", () => {
  for (let peak = 1; peak <= 20000; peak++) {
    const step = niceStep(peak);
    assert.ok(step > 0, `step ${step} for peak ${peak}`);
    const mantissa = step / 10 ** Math.floor(Math.log10(step) + 1e-9);
    assert.ok(
      [1, 2, 5].some((m) => Math.abs(mantissa - m) < 1e-9),
      `step ${step} for peak ${peak} is not a nice number`
    );
  }
});

test("the ceiling reaches the peak, and does not overshoot by a whole step", () => {
  for (let peak = 0; peak <= 5000; peak += 7) {
    const a = popAxis(peak);
    const reach = Math.max(MIN_TOP, peak);
    assert.ok(a.top >= reach, `top ${a.top} is below the peak ${reach}`);
    assert.ok(a.top - a.step < reach, `top ${a.top} overshoots ${reach} by a full step`);
    assert.equal(a.top % a.step, 0, "the ceiling is not on the grid");
    assert.equal(a.ticks[a.ticks.length - 1], a.top, "the top is not labelled");
    assert.ok(a.ticks.length >= 1 && a.ticks.length <= AXIS_LINES + 2, `${a.ticks.length} labels`);
    for (let i = 0; i < a.ticks.length; i++) {
      assert.equal(a.ticks[i], a.step * (i + 1), "ticks are not evenly spaced from the first step");
      assert.ok(Number.isInteger(a.ticks[i]), `${a.ticks[i]} is not a whole creature`);
    }
  }
});

test("a new record can never lower the ceiling", () => {
  // The whole reason the axis is a round number rather than the peak itself:
  // it moves in visible steps, and only ever upward, so the history already on
  // screen is not silently rescaled by every new high-water mark.
  let prev = 0;
  for (let peak = 0; peak <= 20000; peak++) {
    const top = popAxis(peak).top;
    assert.ok(top >= prev, `peak ${peak} lowered the ceiling from ${prev} to ${top}`);
    prev = top;
  }
});

test("an empty pond still has an axis", () => {
  const a = popAxis(0);
  assert.equal(a.top, MIN_TOP);
  assert.ok(a.ticks.length > 0);
});

test("a label sits exactly where its value does", () => {
  const a = popAxis(237);
  const labels = axisLabels(a, H);
  assert.equal(labels.length, a.ticks.length);
  for (const l of labels) {
    assert.equal(l.frac, plotY(l.value / a.top, H) / H);
    assert.ok(l.frac >= 0 && l.frac <= 1, "a label landed outside the figure");
    assert.equal(l.text, l.value.toLocaleString());
  }
  // The topmost label is the ceiling, at the top of the plot.
  assert.equal(labels[labels.length - 1].value, a.top);
});

// ---- what is actually drawn ----

/** Every y a horizontal rule was stroked at, in draw order. */
function gridYs(ops) {
  const ys = [];
  for (let i = 0; i < ops.length; i++) {
    const [, name, x0, y0] = ops[i];
    const next = ops[i + 1] || [];
    if (name === "moveTo" && next[1] === "lineTo" && x0 === 0 && next[3] === y0 && next[2] === W) {
      ys.push(y0);
    }
  }
  return ys;
}

test("the grid is drawn where the axis says, once per label", () => {
  const a = popAxis(237);
  const ops = draw(history(60), { axis: a, foodMax: 520 });
  const ys = gridYs(ops);
  assert.equal(ys.length, a.ticks.length);
  for (let i = 0; i < a.ticks.length; i++) {
    assert.equal(ys[i], Math.round(plotY(a.ticks[i] / a.top, H)) + 0.5);
  }
});

test("the lines are drawn against the ceiling the labels state", () => {
  // The claim the whole release rests on: the number beside a gridline is the
  // number the line touching it is at. Draw a history whose peak is exactly a
  // labelled value and check that point lands on that rule.
  const a = popAxis(200);
  const hist = history(10, (i) => (i === 5 ? 200 : 50), () => 260);
  const ops = draw(hist, { axis: a, foodMax: 520 });
  const topRule = Math.round(plotY(1, H)) + 0.5;
  const onTop = ops.some(([, name, , y]) => name === "lineTo" && Math.abs(y - (topRule - 0.5)) < 1e-9);
  assert.equal(a.top, 200);
  assert.ok(onTop, "a population equal to the ceiling was not drawn at the ceiling");
  // Food is on its own constant scale, and half of it is half the figure.
  const half = plotY(0.5, H);
  assert.ok(ops.some(([, name, , y]) => name === "lineTo" && Math.abs(y - half) < 1e-9));
});

test("the grid goes down before the data", () => {
  const ops = draw(wholeHistory(40), { axis: popAxis(237), foodMax: 520, whole: true });
  const lastGrid = ops.findLastIndex(([, name, v]) => name === "set:strokeStyle" && v.startsWith("rgba(255, 255, 255"));
  const firstData = ops.findIndex(([, name, v]) => name === "set:fillStyle" || (name === "set:strokeStyle" && !String(v).startsWith("rgba(255, 255, 255")));
  assert.ok(lastGrid >= 0 && firstData > lastGrid, "furniture was drawn over the pond's data");
});

test("the colours drawn are the ones the audit measures", () => {
  const line = chartLines();
  const ops = draw(history(30), { axis: popAxis(237), foodMax: 520 });
  const strokes = ops.filter(([, name]) => name === "set:strokeStyle").map((o) => o[2]);
  assert.ok(strokes.includes(line.pop), "the population line is not the audited colour");
  assert.ok(strokes.includes(line.food), "the food line is not the audited colour");
});

test("an almost-empty history draws the axis and no line", () => {
  // A figure that shows nothing should still show its scale — and must not
  // divide by a span of zero points on the way.
  for (const n of [0, 1]) {
    const ops = draw(history(n), { axis: popAxis(0), foodMax: 520 });
    assert.equal(gridYs(ops).length, popAxis(0).ticks.length);
    assert.ok(ops.every(([, , ...args]) => args.every((v) => typeof v !== "number" || Number.isFinite(v))));
  }
});

test("the same history twice is the same picture", () => {
  const opts = { axis: popAxis(237), foodMax: 520, whole: true };
  assert.deepEqual(draw(wholeHistory(50), opts), draw(wholeHistory(50), opts));
});

// ---- the figure is an observer ----

test("drawing the chart touches neither the world nor the RNG", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 400; i++) world.step();
  const before = stateFingerprint(world);
  let draws = 0;
  const real = world.rng.next;
  world.rng.next = () => {
    draws++;
    return real();
  };
  draw(world.stats.popHistory, {
    axis: popAxis(world.stats.maxPopEver),
    foodMax: world.config.foodMax,
  });
  world.rng.next = real;
  assert.equal(draws, 0, `drawing the chart drew ${draws} random numbers`);
  assert.equal(stateFingerprint(world), before);
});

test("a real run's history is drawn inside the figure", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 1200; i++) world.step();
  const axis = popAxis(world.stats.maxPopEver);
  const ops = draw(world.stats.popHistory, { axis, foodMax: world.config.foodMax });
  const ys = ops.filter(([, name]) => name === "lineTo" || name === "moveTo").map((o) => o[3]);
  assert.ok(ys.length > 0);
  for (const y of ys) assert.ok(y >= 0 && y <= H, `a point was drawn at y=${y}, outside the figure`);
});

// ---- said out loud ----

test("the spoken chart carries both scales", () => {
  const axis = popAxis(237);
  const said = describeChart(history(20, () => 214, () => 388), axis, 520);
  assert.match(said, /214 creatures/);
  assert.match(said, new RegExp(`scale to ${axis.top}`));
  assert.match(said, /388 food pellets of 520/);
  assert.match(said, /ticks 0 to 76/);
});

test("the spoken chart says nothing it cannot know", () => {
  for (const n of [0, 1]) {
    assert.match(describeChart(history(n), popAxis(0), 520), /not enough history/);
  }
});
