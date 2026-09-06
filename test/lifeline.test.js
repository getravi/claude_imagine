// lifeline.test.js — the pond's whole run as one small line (v1.157).
//
// The figure exists because the quiet side of v1.149's switch keeps seven
// panels of prose and hides all five pictures, which hands the general visitor
// the reading and gives the specialist the graphics. So the properties worth
// holding are the ones that make a picture readable *without* being read:
//
//   * **The caption carries no number that is only true right now.** It shares
//     a bordered box with a headline that *holds* — a sentence chosen a median
//     of 180 ticks ago, by which time the pond has moved a median of 7 animals
//     — so a live count in the caption is two present-tense numbers disagreeing
//     in one box. The words name the scale; the ink names the moment.
//   * **The peak survives thinning.** The record behind the whole run is an
//     `Archive`; the exact thing it keeps as it thins is the min/max envelope.
//     A peak read off the sampled `pop` would shrink with age.
//   * **It never draws a stub.** Below `MIN_POINTS` there is no shape, and the
//     caller is told so rather than handed a flat line.
//   * **It says nothing a glossary is needed for**, which is `headline.js`'s
//     sweep applied to the one surface most likely to grow an axis label.
//
// And the two this project holds every observer to: reading a pond may not move
// it, and nothing here may draw a random number.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint } from "../src/fingerprint.js";
import { recordingContext } from "../src/rendershot.js";
import { chartLines, chartBands } from "../src/palette.js";
import {
  MIN_POINTS,
  drawLifeline,
  lifelineCaption,
  lifelineSay,
  lifelineSeries,
  whenWord,
} from "../src/lifeline.js";

/**
 * A record shaped like `stats.runHistory.series()`: a sample every four ticks,
 * each carrying the envelope the archive keeps exactly under thinning.
 */
function record(pops, { envelope = 0 } = {}) {
  return pops.map((pop, i) => ({
    tick: i * 4,
    pop,
    food: 100,
    gen: 1,
    min: { pop: pop - envelope },
    max: { pop: pop + envelope },
  }));
}

// ---- what the record says ----

test("a record shorter than MIN_POINTS has no shape to draw", () => {
  for (let n = 0; n < MIN_POINTS; n++) {
    assert.equal(lifelineSeries(record(new Array(n).fill(40))), null, `${n} samples`);
  }
  assert.ok(lifelineSeries(record(new Array(MIN_POINTS).fill(40))), "MIN_POINTS is enough");
});

test("a missing or malformed record is null, not a throw", () => {
  assert.equal(lifelineSeries(null), null);
  assert.equal(lifelineSeries(undefined), null);
  assert.equal(lifelineSeries("not a record"), null);
});

test("the three numbers are the ends and the top of the line", () => {
  const s = lifelineSeries(record([40, 90, 310, 186]));
  assert.equal(s.start, 40);
  assert.equal(s.peak, 310);
  assert.equal(s.now, 186);
  assert.ok(s.peakAt > 0 && s.peakAt < 1, "an interior peak reads as interior");
});

test("the peak is read off the envelope, so thinning cannot shave it", () => {
  // The sampled points never exceed 100; the envelope remembers that the pond
  // touched 130 between two of them. A peak read off `pop` would say 100.
  const s = lifelineSeries(record([40, 80, 100, 90], { envelope: 30 }));
  assert.equal(s.peak, 130);
});

test("a record with no envelope falls back to the sample rather than throwing", () => {
  const bare = record([40, 90, 310, 186]).map(({ tick, pop }) => ({ tick, pop }));
  const s = lifelineSeries(bare);
  assert.equal(s.peak, 310);
  assert.equal(s.now, 186);
});

test("the live count becomes the line's last point, so the picture ends where the caption does", () => {
  const s = lifelineSeries(record([40, 90, 310, 186]), 171);
  assert.equal(s.now, 171, "the caption's now is the live count");
  const last = s.points[s.points.length - 1];
  assert.equal(last.pop, 171, "and so is the ink's right-hand end");
  assert.equal(last.lo, 171);
  assert.equal(last.hi, 171, "one instant has no spread");
});

test("a live count above every sample is still the peak", () => {
  const s = lifelineSeries(record([40, 70, 90, 120]), 400);
  assert.equal(s.peak, 400);
  assert.equal(s.now, 400);
});

test("a live count that is not a number is ignored rather than drawn", () => {
  for (const bad of [undefined, null, NaN, "170"]) {
    const s = lifelineSeries(record([40, 90, 310, 186]), bad);
    assert.equal(s.now, 186, `${String(bad)} did not become a point`);
    assert.equal(s.points.length, 4);
  }
});

// ---- what it says out loud ----

test("the caption names the two ends of the scale, in the order the line runs", () => {
  const cap = lifelineCaption(lifelineSeries(record([40, 90, 310, 186])));
  assert.equal(cap, "40 at the start · 310 at its highest");
  assert.ok(cap.indexOf("310") > cap.indexOf("40"), "the high-water mark comes after the start");
});

test("no caption carries a number that is true only right now", () => {
  // The whole of note 2, as an assertion. The caption sits in one bordered box
  // with a headline that holds its sentence for `HEADLINE_HOLD` ticks, so a
  // live count here is a second present-tense number contradicting the first.
  // The test moves the live count over a wide range and requires the words not
  // to notice — only the ink may.
  const hist = record([40, 90, 310, 186]);
  const said = new Set();
  for (const live of [1, 7, 50, 186, 200, 305]) said.add(lifelineCaption(lifelineSeries(hist, live)));
  assert.equal(said.size, 1, `the caption moved with the live count: ${[...said].join(" / ")}`);
  assert.equal([...said][0], "40 at the start · 310 at its highest");
});

test("a pond still climbing does not name its record twice", () => {
  const cap = lifelineCaption(lifelineSeries(record([40, 90, 200, 310])));
  assert.equal(cap, "40 at the start · 310 at its highest");
  assert.equal((cap.match(/310/g) || []).length, 1, "the same number is not said twice");
});

test("a pond that has only ever fallen names no high-water mark", () => {
  assert.equal(lifelineCaption(lifelineSeries(record([40, 33, 28, 22]))), "40 at the start, and never more");
});

test("an empty pond is the one live state the caption may say, because it cannot change", () => {
  const s = lifelineSeries(record([40, 120, 60, 0]));
  assert.equal(lifelineCaption(s), "40 at the start · 120 at its highest · none left");
  assert.match(lifelineSay(s), /nobody at all/);
});

test("counts over a thousand are grouped, the way every other readout here writes them", () => {
  assert.match(lifelineCaption(lifelineSeries(record([40, 900, 1400, 1200]))), /1,400 at its highest/);
});

test("the spoken form does carry the count, because a listener has no dot to read", () => {
  // The principled exception in note 2: alt text stands in for a picture, where
  // a caption stands beside a sentence.
  assert.match(lifelineSay(lifelineSeries(record([40, 90, 310, 186]))), /186 now/);
});

test("no series means no caption, and a sentence that says why", () => {
  assert.equal(lifelineCaption(null), "");
  assert.match(lifelineSay(null), /not enough/);
});

test("the spoken sentence describes the ink, and puts the peak in time", () => {
  const say = lifelineSay(lifelineSeries(record([40, 90, 310, 260, 186])));
  assert.match(say, /How many are alive/);
  assert.match(say, /40 at the start/);
  assert.match(say, /peak of 310/);
  assert.match(say, /186 now/);
  assert.match(say, /about halfway through|early on|not long ago/);
});

test("where the peak sits is three words and they cover the whole line", () => {
  assert.equal(whenWord(0), "early on");
  assert.equal(whenWord(0.32), "early on");
  assert.equal(whenWord(0.34), "about halfway through");
  assert.equal(whenWord(0.66), "about halfway through");
  assert.equal(whenWord(0.68), "not long ago");
  assert.equal(whenWord(1), "not long ago");
});

test("nothing this figure says needs a glossary", () => {
  // The sweep `headline.js` carries, pointed at the one surface on this page
  // most likely to grow an axis label. A figure whose caption says "population"
  // or "N" has stopped being the picture for the visitor it was built for.
  const JARGON = [
    "population",
    "median",
    "mean",
    "envelope",
    "axis",
    "series",
    "tick",
    "sample",
    "lineage",
    "cohort",
    "biomass",
    "n =",
  ];
  const said = [
    lifelineCaption(lifelineSeries(record([40, 90, 310, 186]))),
    lifelineCaption(lifelineSeries(record([40, 90, 310]))),
    lifelineCaption(lifelineSeries(record([40, 33, 22]))),
    lifelineCaption(lifelineSeries(record([40, 120, 60, 0]))),
    lifelineSay(lifelineSeries(record([40, 90, 310, 186]))),
    lifelineSay(lifelineSeries(record([40, 90, 310]))),
    lifelineSay(lifelineSeries(record([40, 33, 22]))),
    lifelineSay(lifelineSeries(record([40, 120, 60, 0]))),
    lifelineSay(null),
  ];
  for (const line of said) {
    for (const word of JARGON) {
      assert.ok(!line.toLowerCase().includes(word), `"${word}" appears in "${line}"`);
    }
  }
});

// ---- what it draws ----

const draw = (series, W = 240, H = 34) => {
  const { ctx, ops } = recordingContext("lifeline");
  drawLifeline(ctx, W, H, series);
  return ops;
};

test("no series clears the box and draws nothing else", () => {
  assert.deepEqual(draw(null).map(name), ["clearRect"]);
});

test("the picture is a hill, a line and the mark at today", () => {
  const kinds = draw(lifelineSeries(record([40, 90, 310, 186], { envelope: 5 }))).map(name);
  assert.ok(kinds.includes("fill"), "the hill is filled");
  assert.ok(kinds.includes("stroke"), "the sampled line is stroked");
  assert.ok(kinds.includes("arc"), "where the pond stands today is marked");
  assert.equal(kinds[0], "clearRect", "and the box is cleared first");
});

test("the hill stands on none, so its floor is the bottom of the box", () => {
  // A count has a floor a reader already has, and an area standing on it reads
  // as *how many*. The band `chart.js` draws is between two moving edges and
  // reads as uncertainty, which is a different question.
  const H = 34;
  const ops = draw(lifelineSeries(record([40, 90, 310, 186], { envelope: 40 })), 240, H);
  const upto = ops.slice(0, ops.findIndex((o) => name(o) === "fill"));
  const floor = points(upto).filter((p) => p.y >= H - 0.001);
  assert.equal(floor.length, 2, "the filled shape does not sit on the floor at both ends");
});

test("the wash is the chart's own band, thinned rather than renamed", () => {
  const ops = draw(lifelineSeries(record([40, 90, 310, 186], { envelope: 5 })));
  const alphaBeforeFill = [];
  let alpha = 1;
  for (const o of ops) {
    if (name(o) === "set:globalAlpha") alpha = o[2];
    if (name(o) === "fill") alphaBeforeFill.push(alpha);
  }
  assert.ok(alphaBeforeFill[0] > 0 && alphaBeforeFill[0] < 1, `the hill was painted at ${alphaBeforeFill[0]}`);
  assert.equal(alphaBeforeFill[alphaBeforeFill.length - 1], 1, "the mark at today is not thinned too");
});

test("every colour in it is the population series' own", () => {
  // The rule `test/colourliterals.test.js` enforces one level up: a figure that
  // names its own colour drifts away from the one it is quoting. This line is
  // the chart's population line, so it has to *be* it.
  const ops = draw(lifelineSeries(record([40, 90, 310, 186], { envelope: 5 })));
  const used = new Set();
  for (const o of ops) {
    if (name(o) === "set:fillStyle" || name(o) === "set:strokeStyle") used.add(o[2]);
  }
  assert.ok(used.size > 0, "nothing was painted at all");
  const allowed = new Set([chartLines().pop, chartBands().pop]);
  for (const colour of used) assert.ok(allowed.has(colour), `${colour} is not the chart's blue`);
});

/** The recorder logs `[surface, op, ...args]`; this is the op. */
const name = (o) => o[1];

test("the ink stays inside the box, at every size and every shape of run", () => {
  const runs = [
    record([40, 90, 310, 186]),
    record([40, 40, 40, 40]),
    record([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    record([400, 300, 200, 100, 0], { envelope: 50 }),
    record(new Array(300).fill(0).map((_, i) => 40 + (i % 97))),
  ];
  for (const [W, H] of [
    [240, 34],
    [90, 20],
    [700, 34],
  ]) {
    for (const hist of runs) {
      for (const { x, y } of points(draw(lifelineSeries(hist), W, H))) {
        assert.ok(x >= 0 && x <= W, `x ${x} outside 0..${W}`);
        assert.ok(y >= 0 && y <= H, `y ${y} outside 0..${H}`);
      }
    }
  }
});

/** Every coordinate the drawing put on the canvas. */
function points(ops) {
  const out = [];
  for (const o of ops) {
    if (["lineTo", "moveTo", "arc"].includes(name(o))) out.push({ x: o[2], y: o[3] });
  }
  return out;
}

// ---- against a real pond ----

test("a real pond's run reads as a shape, and the reading does not move it", () => {
  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 1800; i++) world.step();

  const before = stateFingerprint(world);
  const series = lifelineSeries(world.stats.runHistory.series(), world.creatures.length);
  const cap = lifelineCaption(series);
  const say = lifelineSay(series);
  draw(series);
  assert.equal(stateFingerprint(world), before, "reading the pond moved it");

  assert.equal(series.start, 40, "every default pond is handed forty");
  assert.ok(series.peak > series.start, "and multiplies");
  assert.equal(series.now, world.creatures.length, "now is the live count");
  assert.ok(cap.startsWith("40 at the start · "), cap);
  assert.ok(say.length > 40 && say.endsWith("."), say);
});

test("a pond that draws this figure draws no random numbers for it", () => {
  // The second prime directive, at this module's own boundary: two ponds, one
  // of which has had its whole run read and drawn every few ticks, end
  // identical — hash, tick and the state of the generator itself.
  const a = new World(makeConfig({ seed: 42 }));
  const b = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 600; i++) {
    a.step();
    b.step();
    if (i % 5 === 0) draw(lifelineSeries(b.stats.runHistory.series(), b.creatures.length));
  }
  assert.equal(stateFingerprint(b), stateFingerprint(a));
  assert.equal(b.rng.next(), a.rng.next(), "the generator itself is at the same place");
});
