// mullerplot.test.js — the Tree of Life's arithmetic and its picture (v1.42).
//
// The Muller plot is the headline view of this project's headline claim, and
// until now the only figure with no test of any kind. It makes one claim an eye
// cannot check and a recording can: **the bands tile each column exactly** —
// every band's bottom edge is the one below it's top edge, and the stack sums
// to at most the whole pond. A stacked share plot that oversums is a picture
// drawing more than 100% of something, and it fails silently: the extra is
// simply painted off the top of the canvas.
//
// Walking the recorded path is the point. "The bands' heights add up" is an
// aggregate, and v1.24 taught me that an aggregate two cancelling errors can
// satisfy is not a test of either — so this checks each band's own edges
// against the share it claims, column by column, which is the per-element form.
//
// What the walk found: a window in which nothing was alive drew a *full-height*
// grey band, because the share was taken over `Math.max(1, total)` and `1 − 0`
// is one. An extinction rendered as the picture of a thriving pond full of
// lineages too small to name. That test is here as a pin on the failure, not
// only on the fix (v1.25's rule), because the clamp is the obvious thing to
// write back the next time something divides by a total.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  drawMuller,
  mullerShares,
  bandTextures,
  collisionCost,
  textureCss,
  BAND_TEXTURES,
} from "../src/mullerplot.js";
import { describeMuller } from "../src/describe.js";
import { recordingContext } from "../src/rendershot.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { stateFingerprint, trajectoryFingerprint, observationFingerprint } from "../src/fingerprint.js";

const W = 300;
const H = 100;

/**
 * A phylogeny stand-in: exactly the two things `mullerShares` reads. Hand-built
 * so a window with no pond, a species that arrives late, and a pond made
 * entirely of unnameable churn are all reachable — none of which the default
 * seed produces, and all of which the drawing has to survive.
 */
function record(columns, species) {
  return {
    snapshots: columns.map((c, i) => ({
      tick: i * 6,
      counts: new Map(c.counts),
      total: c.total,
      span: 1,
    })),
    displaySpecies: () => species,
  };
}

const SPECIES = [
  { id: 0, hue: 10, birthTick: 0, peak: 20, count: 4 },
  { id: 1, hue: 120, birthTick: 5, peak: 20, count: 8 },
];

/** Draw and hand back the recorded ops. */
function draw(shares, opts = {}) {
  const { ctx, ops } = recordingContext("muller");
  const shown = drawMuller(ctx, shares, { width: W, height: H, ...opts });
  return { ops, shown };
}

/**
 * Read the bands back out of the op stream. Each is `beginPath`, n points along
 * the bottom (left→right), n along the top (right→left), `closePath`, a fill
 * style, `fill` — so the geometry is recovered without the drawing code's help.
 */
function bands(ops, n) {
  const out = [];
  let cur = null;
  for (const [, name, ...args] of ops) {
    if (name === "beginPath") cur = { pts: [] };
    else if (cur && (name === "moveTo" || name === "lineTo")) cur.pts.push(args);
    else if (cur && name === "set:fillStyle") cur.fill = args[0];
    else if (cur && name === "fill") {
      assert.equal(cur.pts.length, 2 * n, "a band did not draw one point per column per edge");
      out.push({
        fill: cur.fill,
        // In share units, where 0 is the floor of the plot and 1 the ceiling.
        bottom: cur.pts.slice(0, n).map((p) => (H - p[1]) / H),
        top: cur.pts.slice(n).reverse().map((p) => (H - p[1]) / H),
        x: cur.pts.slice(0, n).map((p) => p[0]),
      });
      cur = null;
    }
  }
  return out;
}

/** A pond with real history in it, so the claims are checked on real snapshots too. */
function pond(over = {}, ticks = 900) {
  const w = new World(makeConfig({ seed: 314, ...over }));
  for (let i = 0; i < ticks; i++) w.step();
  return w;
}

test("the bands tile every column exactly, and never oversum", () => {
  const w = pond();
  const shares = mullerShares(w.phylogeny);
  const n = shares.n;
  assert.ok(n > 2 && shares.shown.length > 1, "expected a record with several lineages in it");

  const drawn = bands(draw(shares).ops, n);
  assert.equal(drawn.length, shares.shown.length + 1, "one band per species, plus 'other'");

  for (let i = 0; i < n; i++) {
    // The floor is the floor.
    assert.equal(drawn[0].bottom[i], 0, `column ${i} does not start at the baseline`);
    for (let b = 0; b < drawn.length; b++) {
      const band = drawn[b];
      assert.ok(band.top[i] >= band.bottom[i] - 1e-12, `band ${b} is inverted at column ${i}`);
      // No gap and no overlap: an aggregate would pass with one of each.
      if (b > 0) {
        assert.ok(
          Math.abs(band.bottom[i] - drawn[b - 1].top[i]) < 1e-12,
          `bands ${b - 1} and ${b} do not meet at column ${i}`
        );
      }
    }
    const total = drawn[drawn.length - 1].top[i];
    assert.ok(total <= 1 + 1e-12, `column ${i} sums to ${total}: the stack is drawn off the canvas`);
    // A live pond fills its column exactly; the record's every column is live here.
    assert.ok(Math.abs(total - 1) < 1e-12, `column ${i} sums to ${total}, not one`);
  }
});

test("each band's height is the share its species actually held", () => {
  // The tiling test says the bands agree with each other. This one says they
  // agree with the pond — the claim the figure is *for*.
  const w = pond();
  const ph = w.phylogeny;
  const shares = mullerShares(ph);
  const drawn = bands(draw(shares).ops, shares.n);

  for (let k = 0; k < shares.shown.length; k++) {
    const band = drawn[k + 1]; // band 0 is "other"
    for (let i = 0; i < shares.n; i++) {
      const snap = ph.snapshots[i];
      const want = (snap.counts.get(shares.shown[k].id) || 0) / snap.total;
      const got = band.top[i] - band.bottom[i];
      assert.ok(
        Math.abs(got - want) < 1e-12,
        `species ${shares.shown[k].id} is drawn at ${got} in column ${i}, held ${want}`
      );
    }
  }
});

test("columns are evenly spaced and span the full width", () => {
  // A window is a fixed number of ticks wide after any number of halvings, so
  // even spacing by index is even spacing in time — the reason the caption can
  // state one resolution for the whole plot.
  const shares = mullerShares(pond().phylogeny);
  const { x } = bands(draw(shares).ops, shares.n)[0];
  assert.equal(x[0], 0);
  assert.equal(x[x.length - 1], W);
  const step = W / (shares.n - 1);
  for (let i = 1; i < x.length; i++) {
    assert.ok(Math.abs(x[i] - x[i - 1] - step) < 1e-9, `column ${i} is not one step from ${i - 1}`);
  }
});

test("a window with nothing alive draws no band at all", () => {
  // The bug the walk found. With `autoReseed` off — how every headless
  // experiment in SCIENCE.md runs — a crash to zero produced a column whose
  // "other" band filled the plot from floor to ceiling: an extinction drawn as
  // a pond full of lineages too small to name.
  const shares = mullerShares(
    record(
      [
        { counts: [[0, 10], [1, 10]], total: 20 },
        { counts: [], total: 0 }, // nothing alive in this window
        { counts: [[0, 8], [1, 4]], total: 12 },
      ],
      SPECIES
    )
  );
  assert.deepEqual([...shares.live], [1, 0, 1]);
  assert.equal(shares.other[1], 0, "an empty window still claims a share of the pond");

  const drawn = bands(draw(shares).ops, 3);
  for (const [b, band] of drawn.entries()) {
    assert.equal(band.top[1] - band.bottom[1], 0, `band ${b} has height in an empty window`);
  }
  assert.equal(drawn[drawn.length - 1].top[1], 0, "the stack is not pinched shut by extinction");
  // And the neighbours are untouched: the pinch is one column wide.
  assert.ok(Math.abs(drawn[drawn.length - 1].top[0] - 1) < 1e-12);
  assert.ok(Math.abs(drawn[drawn.length - 1].top[2] - 1) < 1e-12);
});

test("a pond of nothing but unnameable churn is all 'other'", () => {
  // The other end of the same arithmetic, and the one the grey band exists for:
  // a live pond in which no lineage has earned a band yet is a full grey column,
  // which is exactly what the empty window must *not* look like.
  const shares = mullerShares(
    record([{ counts: [[9, 6]], total: 6 }, { counts: [[9, 7]], total: 7 }], [])
  );
  assert.deepEqual([...shares.other], [1, 1]);
  const drawn = bands(draw(shares).ops, 2);
  assert.equal(drawn.length, 1);
  assert.deepEqual(drawn[0].top, [1, 1]);
});

test("a record too short to plot draws nothing but a clear", () => {
  const short = mullerShares(record([{ counts: [[0, 3]], total: 3 }], SPECIES));
  const { ops, shown } = draw(short);
  assert.deepEqual(shown, []);
  assert.deepEqual(
    ops.map((o) => o[1]),
    ["clearRect"]
  );
});

test("highlighting changes colours and not one coordinate", () => {
  // The legend's spotlight is a restyle. If it moved anything, a click would be
  // changing the picture's content rather than its emphasis.
  const shares = mullerShares(pond().phylogeny);
  const plain = bands(draw(shares).ops, shares.n);
  const lit = bands(draw(shares, { highlightId: shares.shown[1].id }).ops, shares.n);
  assert.deepEqual(
    lit.map((b) => [b.bottom, b.top, b.x]),
    plain.map((b) => [b.bottom, b.top, b.x])
  );
  assert.notDeepEqual(
    lit.map((b) => b.fill),
    plain.map((b) => b.fill),
    "the highlight repainted nothing"
  );
});

test("drawing the plot changes nothing about the world and draws no randomness", () => {
  // The claim `test/render.test.js` makes about the pond, on the surface whose
  // whole input is the observer's own record. All three channels, so a figure
  // that sorted `phylogeny.species` in place would fail here.
  const w = pond();
  let draws = 0;
  const real = w.rng.next;
  w.rng.next = () => {
    draws++;
    return real();
  };
  const before = [stateFingerprint(w), trajectoryFingerprint(w), observationFingerprint(w)];
  const shares = mullerShares(w.phylogeny);
  draw(shares);
  draw(shares, { highlightId: shares.shown[0].id });
  describeMuller(shares, w.phylogeny.snapshotSpan());
  w.rng.next = real;
  assert.equal(draws, 0, "the Tree of Life drew a random number");
  assert.deepEqual(
    [stateFingerprint(w), trajectoryFingerprint(w), observationFingerprint(w)],
    before,
    "drawing the Tree of Life moved the world it was drawing"
  );
});

test("the spoken form carries shares that add to a whole", () => {
  const w = pond();
  const shares = mullerShares(w.phylogeny);
  const said = describeMuller(shares, w.phylogeny.snapshotSpan());
  const percents = [...said.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
  // Every percentage in the sentence but the last — which is the largest
  // lineage's share when the record began, a different column.
  const parts = percents.slice(0, -1);
  assert.ok(parts.length >= 2, `expected several shares, got: ${said}`);
  assert.equal(
    parts.reduce((a, b) => a + b, 0),
    100,
    `the shares do not add to 100: ${said}`
  );
  assert.match(said, /^Species over time, ticks 0 to [\d,]+: /);
  assert.match(said, /The largest, species \d+, (held|did not exist)/);
});

test("the spoken form says what it cannot say", () => {
  // A description that reports 0% of an empty pond is the spoken form of the
  // full grey column this release removed.
  assert.match(describeMuller(mullerShares(record([], []))), /not enough history yet/);
  const dead = mullerShares(
    record([{ counts: [[0, 4]], total: 4 }, { counts: [], total: 0 }], SPECIES)
  );
  assert.match(describeMuller(dead, { from: 0, to: 6 }), /nothing is alive in the newest window/);

  const churn = mullerShares(record([{ counts: [[9, 6]], total: 6 }, { counts: [[9, 7]], total: 7 }], []));
  assert.match(describeMuller(churn), /no lineage has yet reached the size/);

  // A lineage that was not there at the start says so rather than claiming 0%.
  const late = mullerShares(
    record([{ counts: [[0, 10]], total: 10 }, { counts: [[0, 2], [1, 8]], total: 10 }], SPECIES)
  );
  assert.match(describeMuller(late), /The largest, species 1, did not exist when the record began\./);
  assert.match(describeMuller(late), /species 1 at 80%, species 0 at 20%/);
});

// ---- The hatch (v1.46) ----
//
// What the colour audit found when it finally reached this figure: the band
// colour was never a name. A species' hue is its founder's and hue is
// inherited, so the plot draws parents and daughters in the same colour — over
// twelve seeds, every one draws at least one pair at ΔE 0.0 under *normal*
// vision, and the default pond draws four of eleven bands at hue 335. The
// legend calls those four different species and gives them one dot.
//
// So the cue is geometry, which v1.34 established survives every vision model.
// The hues below are the real ones: the eleven the default seed produces at
// 6,000 ticks, hard-coded rather than waited for (the v1.45 rule — stage the
// state that produces the behaviour; it is a better description than catching
// it in the wild, and it runs in a millisecond).
const DEFAULT_SEED_HUES = [335, 311, 333, 250, 106, 260, 226, 335, 343, 335, 335];

/** Read each band's hatch back out of the op stream, in stacking order. */
function hatches(ops) {
  const out = [];
  let after = false; // sitting just past a band's fill
  let cur = null;
  for (const [, name, ...args] of ops) {
    if (cur) {
      if (name === "clip") cur.clipped = true;
      else if (name === "moveTo" || name === "lineTo") cur.pts.push(args);
      else if (name === "set:strokeStyle") cur.ink = args[0];
      else if (name === "restore") {
        out.push(cur);
        cur = null;
        after = false;
      }
    } else if (name === "fill") {
      after = true;
    } else if (after && name === "save") {
      cur = { pts: [], clipped: false };
    } else if (after && name === "beginPath") {
      // A band with no hatch: the next band's path starts instead.
      out.push(null);
      after = false;
    }
  }
  if (after) out.push(null); // a plain band with nothing drawn after it
  return out;
}

test("every named band wears a hatch, and the unnameable churn does not", () => {
  const shares = mullerShares(pond().phylogeny);
  const marks = hatches(draw(shares).ops);
  // One entry per band drawn: `other` first, then the shown species.
  assert.equal(marks.length, shares.shown.length + 1);
  assert.equal(marks[0], null, "the 'other' band has nothing to identify and stays plain");
  for (let k = 0; k < shares.shown.length; k++) {
    const t = BAND_TEXTURES[shares.texture[k]];
    const mark = marks[k + 1];
    if (t.lines.length === 0) {
      assert.equal(mark, null, `band ${k} is plain and should draw nothing`);
    } else {
      assert.ok(mark, `band ${k} wears ${t.id} and drew nothing`);
      assert.ok(mark.clipped, `band ${k}'s hatch was not clipped to its band`);
      assert.ok(mark.pts.length >= 2 * t.lines.length, `band ${k}'s hatch is empty`);
    }
  }
});

test("neighbouring bands never share a hatch", () => {
  // Two touching bands are the one pair with no gap between them, so a shared
  // hatch there reads as a single band whatever the colours are doing.
  const t = bandTextures(DEFAULT_SEED_HUES.map((hue, id) => ({ id, hue })));
  for (let i = 1; i < t.length; i++) {
    assert.notEqual(t[i], t[i - 1], `bands ${i - 1} and ${i} wear the same hatch`);
  }
});

test("bands a viewer cannot tell apart by colour do not also share a hatch", () => {
  const shown = DEFAULT_SEED_HUES.map((hue, id) => ({ id, hue }));
  const t = bandTextures(shown);
  let collisions = 0;
  let unresolved = 0;
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      // 4 means "the same colour under every vision model" — the four hue-335
      // bands are exactly that.
      if (collisionCost(shown[i].hue, shown[j].hue) < 4) continue;
      collisions++;
      if (t[i] === t[j]) unresolved++;
    }
  }
  assert.ok(collisions >= 6, `expected the default pond's hue-335 clique; found ${collisions} pairs`);
  assert.equal(unresolved, 0, `${unresolved} of ${collisions} identical-colour pairs still share a hatch`);
});

test("the shortfall is a shortfall, not a silent wrap", () => {
  // Seven hatches cannot separate an arbitrary number of identical bands, and
  // the honest form of that is to degrade to the least-bad clash rather than to
  // an arbitrary one. Nine bands of one colour: the first seven are distinct,
  // and the two that overflow land on the least-used hatches rather than
  // doubling up on one.
  const t = bandTextures(Array.from({ length: 9 }, (_, id) => ({ id, hue: 200 })));
  assert.equal(new Set(t.slice(0, BAND_TEXTURES.length)).size, BAND_TEXTURES.length);
  const counts = new Map();
  for (const x of t) counts.set(x, (counts.get(x) || 0) + 1);
  assert.equal(Math.max(...counts.values()), 2, "the overflow piled onto one hatch");
});

test("a lineage keeps its hatch as the pond goes on", () => {
  // `displaySpecies` filters on a peak and a peak never falls, so a band once
  // shown is shown forever and new ones append. That makes stacking order a
  // stable name — which is the only reason a hatch assigned by position is
  // something a reader can rely on.
  const grow = DEFAULT_SEED_HUES.map((hue, id) => ({ id, hue }));
  const early = bandTextures(grow.slice(0, 6));
  const late = bandTextures(grow);
  assert.deepEqual([...late.slice(0, 6)], [...early], "an existing band's hatch moved under the reader");
});

test("the legend's dot and the band draw the same hatch", () => {
  // The key and the thing it is a key to, from one definition. If these ever
  // disagree the cue is worse than none: it names bands wrongly.
  for (let i = 0; i < BAND_TEXTURES.length; i++) {
    const css = textureCss(i, 210);
    const layers = css.split("), ").length;
    assert.equal(
      layers,
      BAND_TEXTURES[i].lines.length + 1,
      `${BAND_TEXTURES[i].id}: ${BAND_TEXTURES[i].lines.length} line families should be that many gradients plus the colour`
    );
    assert.ok(css.endsWith("hsl(210, 68%, 55%)"), "the dot must end in its lineage colour");
  }
  // Direction is the part a 14-pixel dot actually carries, so the two surfaces
  // have to agree about it: vertical bars are a 90° gradient, horizontal rules 0°.
  assert.ok(textureCss(3, 0).includes("90deg"), "bars should be vertical in CSS too");
  assert.ok(textureCss(4, 0).includes("0deg"), "rules should be horizontal in CSS too");
  assert.ok(textureCss(0, 0).startsWith("hsl("), "plain is a colour and nothing else");
});

test("the highlight moves no hatch", () => {
  // The spotlight is a restyle (see above); the hatch is identity, and identity
  // is not something a click is allowed to change.
  const shares = mullerShares(pond().phylogeny);
  const plain = hatches(draw(shares).ops);
  const lit = hatches(draw(shares, { highlightId: shares.shown[1].id }).ops);
  assert.deepEqual(
    lit.map((m) => m && m.pts),
    plain.map((m) => m && m.pts)
  );
});

test("the hatch adds not one point to the band it rides", () => {
  // The bands are recovered from the op stream by counting path points, and
  // every claim this file makes about tiling depends on that recovery. A hatch
  // drawn into the band's own path instead of a clipped one of its own would
  // corrupt the geometry as well as the picture.
  const shares = mullerShares(pond().phylogeny);
  const walked = bands(draw(shares).ops, shares.n);
  assert.equal(walked.length, shares.shown.length + 1);
});
