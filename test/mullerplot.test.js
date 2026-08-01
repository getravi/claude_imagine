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
import { drawMuller, mullerShares } from "../src/mullerplot.js";
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
