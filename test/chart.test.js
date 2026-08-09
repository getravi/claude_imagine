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
//
// And, since v1.58, the other axis. The x has been a caption naming two ends
// since v1.22 — which is what v1.41 says a *moving* scale cannot use — and
// marking it turns on one property the figure has never had to state: where a
// tick sits. The recent window is evenly spaced in time and the whole-run
// archive is not, so the two claims here are that the map is exactly linear in
// the first case and exactly *not* in the second.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AXIS_LINES,
  MAX_MARKS,
  MIN_TOP,
  niceStep,
  popAxis,
  plotY,
  axisLabels,
  axisMarks,
  chartAxis,
  tickFrac,
  drawChart,
  seasonBands,
  MIN_BAND_PX,
} from "../src/chart.js";
import { Archive } from "../src/archive.js";
import { recordingContext } from "../src/rendershot.js";
import { describeChart } from "../src/describe.js";
import { chartLines, seasonBand } from "../src/palette.js";
import { seasonalFactor } from "../src/environment.js";
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

// ---- the x-axis ----

/** Where the naive map — the one a caption's two ends invite — would put a tick. */
const naiveFrac = (hist, tick) => {
  const from = hist[0].tick;
  const to = hist[hist.length - 1].tick;
  return (tick - from) / (to - from);
};

test("every mark is a round number, in order, inside the figure", () => {
  const hist = history(400);
  const axis = chartAxis(hist, 900);
  assert.ok(axis.marks.length >= 2);
  assert.ok(axis.marks.length <= MAX_MARKS + 1, `${axis.marks.length} marks`);
  let last = -Infinity;
  for (const m of axis.marks) {
    assert.equal(m.tick % axis.step, 0, `${m.tick} is not a multiple of ${axis.step}`);
    assert.ok(m.tick > last, "marks must climb");
    last = m.tick;
    assert.ok(m.frac >= 0 && m.frac <= 1, `${m.tick} sits at ${m.frac}`);
    assert.ok(m.tick >= axis.from && m.tick <= axis.to, `${m.tick} is outside the window`);
  }
});

test("a wider figure asks for more marks", () => {
  const hist = history(400);
  assert.ok(chartAxis(hist, 1200).marks.length > chartAxis(hist, 300).marks.length);
});

test("a sample sits exactly where the chart draws it", () => {
  // `drawSeries` puts sample i at i / (n - 1) of the width, whatever its tick
  // says. Every mark is placed by interpolating that same index, so the two
  // cannot drift apart — which is the whole claim an axis makes.
  const hist = history(41);
  for (let i = 0; i < hist.length; i++) {
    assert.equal(tickFrac(hist, hist[i].tick), i / (hist.length - 1));
  }
});

test("the recent window is evenly spaced, so the map is exactly linear there", () => {
  // `Stats.sample` records one point every four ticks forever, so the ring the
  // chart has always drawn has no raggedness in it at all. Exactly zero, not
  // nearly zero: if this ever reads non-zero the ring has stopped being uniform.
  const hist = history(480);
  for (const m of chartAxis(hist, 900).marks) {
    assert.equal(m.frac - naiveFrac(hist, m.tick), 0);
  }
});

test("the whole-run archive is not, and the axis knows it", () => {
  // `Archive.series()` appends the newest raw sample after the last
  // representative, so the final column stands for as little as one sample
  // while being drawn as wide as every other. The naive map — the one the
  // caption's two ends invite — puts every mark too far right, and this pins
  // that it does, so a future tidy-up back into one division fails loudly.
  const archive = new Archive({ capacity: 8, fields: ["pop"] });
  for (let i = 0; i <= 41; i++) archive.push({ tick: i * 4, pop: 100 + i });
  const hist = archive.series();
  const last = hist[hist.length - 1];
  const penultimate = hist[hist.length - 2];
  assert.ok(
    last.tick - penultimate.tick < penultimate.tick - hist[hist.length - 3].tick,
    "this history is supposed to have a short final column"
  );

  const axis = chartAxis(hist, 900);
  assert.ok(axis.marks.length >= 2);
  let worst = 0;
  for (const m of axis.marks) {
    const gap = naiveFrac(hist, m.tick) - m.frac;
    assert.ok(gap >= 0, "the naive map is one-sided: it can only run late");
    worst = Math.max(worst, gap);
  }
  // One column, and no more: the raggedness is confined to the last segment.
  assert.ok(worst > 0, "the two maps agree, so this history is not testing anything");
  assert.ok(worst <= 1 / (hist.length - 1) + 1e-12, `off by ${worst}, more than one column`);
});

test("a mark lands between the two samples that bracket its tick", () => {
  const archive = new Archive({ capacity: 8, fields: ["pop"] });
  for (let i = 0; i <= 57; i++) archive.push({ tick: i * 4, pop: 100 + i });
  const hist = archive.series();
  const span = hist.length - 1;
  for (const m of chartAxis(hist, 900).marks) {
    const i = Math.floor(m.frac * span + 1e-9);
    const lo = hist[Math.min(i, span)];
    const hi = hist[Math.min(i + 1, span)];
    assert.ok(
      m.tick >= lo.tick && m.tick <= Math.max(hi.tick, lo.tick),
      `tick ${m.tick} was placed between samples at ${lo.tick} and ${hi.tick}`
    );
  }
});

test("a window with no width has no axis", () => {
  assert.deepEqual(chartAxis([], 900).marks, []);
  assert.deepEqual(chartAxis(history(1), 900).marks, []);
  // Every sample at the same tick: two ends that coincide cannot be divided.
  const flat = [
    { tick: 12, pop: 1, food: 1 },
    { tick: 12, pop: 2, food: 2 },
  ];
  assert.deepEqual(chartAxis(flat, 900).marks, []);
  assert.equal(chartAxis(flat, 900).step, 0);
});

test("a tick outside the window clamps to the edge it left by", () => {
  const hist = history(20);
  assert.equal(tickFrac(hist, -400), 0);
  assert.equal(tickFrac(hist, 1e9), 1);
  assert.equal(tickFrac([], 4), 0);
});

test("the end marks anchor to the ends, so the numbers stay inside the figure", () => {
  // The same rule the Tree of Life's axis follows, through the same helper.
  const marks = axisMarks(0, 1000, 900, (t) => t / 1000).marks;
  assert.equal(marks[0].anchor, "start");
  assert.equal(marks[marks.length - 1].anchor, "end");
  for (const m of marks.slice(1, -1)) assert.equal(m.anchor, "mid");
});

test("a real run's axis labels the history the chart is drawn from", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 2000; i++) world.step();
  for (const hist of [world.stats.popHistory, world.stats.runHistory.series()]) {
    const axis = chartAxis(hist, 900);
    assert.equal(axis.from, hist[0].tick);
    assert.equal(axis.to, hist[hist.length - 1].tick);
    assert.ok(axis.marks.length >= 2, "a 2,000-tick run has room for marks");
    for (const m of axis.marks) assert.ok(m.frac >= 0 && m.frac <= 1);
  }
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

// ---- the clock (v1.74) ----
//
// The figure's x-axis is time and its two scales are both marked, and the pond's
// time has a season on it that neither of them mentions. `seasonalFactor` swings
// the food spawn rate ±30% on a 2,600-tick year by default, so the line plotting
// the standing crop has been drawing a quantity whose driver is off-picture since
// v1.3. Four claims: the shading is exactly the mechanism it names, it lands on
// the same map the x-marks use, it reads nothing at all with seasons off, and it
// refuses to draw rather than alias when a year gets too narrow to be a place.

/** A window of `span` ticks, sampled the way `Stats` samples: one point per 4. */
const seasonHistory = (span, start = 0) =>
  history(Math.floor(span / 4) + 1).map((h) => ({ ...h, tick: h.tick + start }));

const seasonCfg = (over = {}) => ({
  seasons: true,
  seasonLength: 2600,
  seasonAmplitude: 0.3,
  ...over,
});

test("the shaded stretch is exactly where food arrives more slowly", () => {
  // The v1.20 bar: a readout about a mechanism has to be the mechanism. Walk
  // every tick of a three-year window and check membership of a band against
  // `seasonalFactor` itself, which is the function the pond actually runs.
  const cfg = seasonCfg();
  const hist = seasonHistory(3 * cfg.seasonLength);
  const { state, bands } = seasonBands(hist, cfg, 300);
  assert.equal(state, "ok");
  const inBand = (t) => bands.some((b) => t > b.from && t < b.to);
  for (let t = hist[0].tick; t <= hist[hist.length - 1].tick; t += 7) {
    const lean = seasonalFactor(t, cfg) < 1;
    assert.equal(inBand(t), lean, `tick ${t}: shaded ${inBand(t)}, factor ${seasonalFactor(t, cfg)}`);
  }
});

test("the winters are the half-year multiples, whole and in order", () => {
  const cfg = seasonCfg();
  const hist = seasonHistory(3 * cfg.seasonLength);
  const { bands } = seasonBands(hist, cfg, 300);
  assert.equal(bands.length, 3, "three years, three winters");
  let last = -Infinity;
  for (const b of bands) {
    assert.ok(b.from > last, "the bands are out of order or overlap");
    last = b.to;
    // Every edge is a zero crossing of the season, not a sampled sign change.
    const k = Math.round((b.from - cfg.seasonLength / 2) / cfg.seasonLength);
    assert.equal(b.from, k * cfg.seasonLength + cfg.seasonLength / 2);
    assert.equal(b.to, (k + 1) * cfg.seasonLength);
    assert.equal(b.to - b.from, cfg.seasonLength / 2, "a whole winter is half a year");
  }
  // Half the year, so half the figure — the arithmetic the picture asserts.
  const shaded = bands.reduce((s, b) => s + (b.x1 - b.x0), 0);
  assert.ok(Math.abs(shaded - 0.5) < 0.02, `${shaded} of the figure is shaded`);
});

test("a band is placed by the same map as the x-axis marks", () => {
  // Two pieces of furniture on one axis disagreeing about where a tick sits
  // would be worse than either of them (v1.58: what you port is the
  // preconditions). The whole-run scope is the case where the naive division
  // and `tickFrac` come apart, so use a history with an uneven last column.
  const cfg = seasonCfg();
  const hist = seasonHistory(2 * cfg.seasonLength);
  hist.push({ tick: hist[hist.length - 1].tick + 37, pop: 100, food: 100 });
  const { bands } = seasonBands(hist, cfg, 300);
  assert.ok(bands.length >= 2);
  for (const b of bands) {
    assert.equal(b.x0, tickFrac(hist, b.from));
    assert.equal(b.x1, tickFrac(hist, b.to));
    assert.ok(b.x0 >= 0 && b.x1 <= 1 && b.x1 > b.x0, `a band ran outside the figure: ${b.x0}–${b.x1}`);
  }
});

test("a world with no season shades nothing, and says so", () => {
  const hist = seasonHistory(3 * 2600);
  for (const cfg of [seasonCfg({ seasons: false }), seasonCfg({ seasonAmplitude: 0 })]) {
    const s = seasonBands(hist, cfg, 300);
    assert.equal(s.state, "off");
    assert.equal(s.bands.length, 0);
    // And the factor really is flat, so there is nothing being hidden.
    for (let t = 0; t < 3000; t += 100) assert.equal(seasonalFactor(t, cfg), 1);
  }
});

test("a window too short or too compressed to be a place is not drawn", () => {
  const cfg = seasonCfg();
  for (const n of [0, 1]) assert.equal(seasonBands(history(n), cfg, 300).state, "short");
  assert.equal(seasonBands([{ tick: 5 }, { tick: 5 }], cfg, 300).state, "short");

  // The threshold, stated: a half-year has to be worth MIN_BAND_PX of the
  // figure. At 300 pixels and a 2,600-tick year that is a run of 130,000 ticks.
  const limit = (cfg.seasonLength / 2 / MIN_BAND_PX) * 300;
  assert.equal(limit, 130000);
  assert.equal(seasonBands(seasonHistory(limit - 4000), cfg, 300).state, "ok");
  assert.equal(seasonBands(seasonHistory(limit + 4000), cfg, 300).state, "aliased");
  assert.equal(seasonBands(seasonHistory(limit + 4000), cfg, 300).bands.length, 0);
  // A wider figure holds more of them: the same window is fine at three times
  // the width, which is what the phone layout gives this canvas.
  assert.equal(seasonBands(seasonHistory(limit + 4000), cfg, 900).state, "ok");
});

test("winter goes down before the grid, and the grid before the data", () => {
  const cfg = seasonCfg();
  const hist = seasonHistory(2 * cfg.seasonLength).map((h) => ({
    ...h,
    min: { pop: h.pop - 10, food: h.food - 20 },
    max: { pop: h.pop + 10, food: h.food + 20 },
  }));
  const season = seasonBands(hist, cfg, W);
  const ops = draw(hist, { axis: popAxis(237), foodMax: 520, whole: true, season });

  const fills = ops.filter(([, name]) => name === "fillRect");
  assert.equal(fills.length, season.bands.length, "one rectangle per winter, and no more");
  const bandFill = ops.findIndex(([, name, v]) => name === "set:fillStyle" && v === seasonBand());
  const firstGrid = ops.findIndex(([, name, v]) => name === "set:strokeStyle" && String(v).startsWith("rgba(255, 255, 255"));
  const firstData = ops.findIndex(([, name, v]) => name === "set:strokeStyle" && !String(v).startsWith("rgba(255, 255, 255"));
  assert.ok(bandFill >= 0, "the winter band is not the colour the audit measures");
  assert.ok(bandFill < firstGrid, "the season was drawn over the grid");
  assert.ok(firstGrid < firstData, "furniture was drawn over the pond's data");

  // Each rectangle is its band, full height, in figure pixels.
  for (let i = 0; i < fills.length; i++) {
    const [, , x, y, w, h] = fills[i];
    const b = season.bands[i];
    assert.ok(Math.abs(x - b.x0 * W) < 1e-9 && Math.abs(w - (b.x1 - b.x0) * W) < 1e-9);
    assert.equal(y, 0);
    assert.equal(h, H);
  }
});

test("no season, no ink — the absence is a count, not a look", () => {
  // v1.69's rule: a mark missing because the rule is off and a mark missing
  // because nothing was drawn are the same empty picture, so the test is a
  // count. A world with seasons off must leave the figure byte-identical to one
  // that was never told about seasons at all.
  const hist = seasonHistory(3 * 2600);
  const opts = { axis: popAxis(237), foodMax: 520 };
  const bare = draw(hist, opts);
  for (const cfg of [seasonCfg({ seasons: false }), seasonCfg({ seasonAmplitude: 0 })]) {
    const ops = draw(hist, { ...opts, season: seasonBands(hist, cfg, W) });
    assert.deepEqual(ops, bare);
    assert.equal(ops.filter(([, name]) => name === "fillRect").length, 0);
  }
});

test("the spoken chart says which half of the year it is drawing", () => {
  const cfg = seasonCfg();
  const axis = popAxis(237);
  // A window ending deep in winter, and one ending deep in summer.
  const winter = seasonHistory(300, 2 * cfg.seasonLength - 400);
  const summer = seasonHistory(300, 2 * cfg.seasonLength + 700);
  const saidWinter = describeChart(winter, axis, 520, seasonBands(winter, cfg, W));
  const saidSummer = describeChart(summer, axis, 520, seasonBands(summer, cfg, W));
  assert.match(saidWinter, /newest tick is in winter, when food arrives more slowly/);
  assert.match(saidSummer, /newest tick is in summer/);
  // The all-summer window shades nothing, and the sentence carries the share a
  // reader gets from the picture for free.
  assert.match(saidWinter, /100% of this window is winter/);
  assert.match(saidSummer, /0% of this window is winter/);
  assert.ok(seasonalFactor(winter[winter.length - 1].tick, cfg) < 1);
  assert.ok(seasonalFactor(summer[summer.length - 1].tick, cfg) > 1);

  // Silent where there is nothing to say, and honest where it cannot say it.
  const off = seasonBands(winter, seasonCfg({ seasons: false }), W);
  assert.equal(describeChart(winter, axis, 520, off), describeChart(winter, axis, 520));
  assert.doesNotMatch(describeChart(winter, axis, 520), /winter|summer|season/);
  const long = seasonHistory(200000);
  assert.match(
    describeChart(long, axis, 520, seasonBands(long, cfg, W)),
    /too long to show the seasons/
  );
});
