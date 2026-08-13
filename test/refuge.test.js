// refuge.test.js — the size above which nothing this world can grow can eat you.
//
// The subject is a quotient of two constants that have sat beside each other in
// `config.js` since v1.0, so most of what is worth pinning here is arithmetic
// rather than behaviour: that the predicate really is the eating rule with the
// largest possible hunter substituted in, that the boundary is decided the way
// `creature.js` decides it and not one rounding step away, and that the readout
// reaching the panel is the same number the module computes.
//
// The behavioural half — whether predation has anything to do with the pond
// ending up inside the refuge — is a twelve-seed measurement and it lives in
// docs/SCIENCE.md, not here. It is a coin toss (six seeds up, five down, one
// level), and a test that asserted it would be pinning one trajectory and
// teaching a future reader that the *result* is fragile when only the test is
// (the v1.33 rule).

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import {
  refugeRadius,
  inRefuge,
  refugeShare,
  hunterCeiling,
  inLivedRefuge,
  livedRefugeRadius,
  livedRefugeShare,
} from "../src/refuge.js";
import { describePond } from "../src/describe.js";
import { STATS_HASHED } from "../src/fingerprint.js";

/** The double one bit away from `v`, toward +∞. */
function nextUp(v) {
  const b = new ArrayBuffer(8);
  const f = new Float64Array(b);
  const u = new BigUint64Array(b);
  f[0] = v;
  u[0] += 1n;
  return f[0];
}

/** …and toward −∞. */
function nextDown(v) {
  const b = new ArrayBuffer(8);
  const f = new Float64Array(b);
  const u = new BigUint64Array(b);
  f[0] = v;
  u[0] -= 1n;
  return f[0];
}

test("the refuge is where the two constants say it is", () => {
  const cfg = makeConfig();
  assert.equal(refugeRadius(cfg), cfg.bodyRadiusMax / cfg.preySizeRatio);
  // The number itself, spelled out, because it is the whole subject: 7.273 px
  // in a size range that runs 3.5 to 8.0, so the refuge is the top 16% of the
  // range and four fifths of the way up it. If a future release retunes either
  // constant this fails and says so, which is the point — the quotient is a
  // rule and neither number looks like one on its own.
  assert.ok(Math.abs(refugeRadius(cfg) - 7.2727) < 0.001, `${refugeRadius(cfg)}`);
  assert.equal(DEFAULT_CONFIG.bodyRadiusMax, 8.0);
  assert.equal(DEFAULT_CONFIG.preySizeRatio, 1.1);
});

test("the predicate is the eating rule, not a restatement of it", () => {
  // The claim `inRefuge` makes is exactly: *no creature this world is capable
  // of growing can eat a body this size.* So check it against the rule that
  // actually eats creatures, with the largest possible hunter — a creature at
  // `bodyRadiusMax` with full carnivory — asking after every radius in the
  // range at a fine step. Anything else is a paraphrase, and a paraphrase is
  // what v1.32 found in `grid.js`: an assertion of equivalence nothing checked.
  const cfg = makeConfig({ kinRecognition: false });
  const w = new World(cfg);
  const hunter = w.creatures[0];
  hunter.radius = cfg.bodyRadiusMax;
  hunter.carnivory = 1;
  const target = w.creatures[1];

  for (let r = cfg.bodyRadiusMin; r <= cfg.bodyRadiusMax; r += 0.001) {
    target.radius = r;
    assert.equal(
      hunter.canEat(target),
      !inRefuge(r, cfg),
      `the biggest hunter and the refuge disagree at radius ${r}`
    );
  }
});

test("the boundary is decided by the rule's own arithmetic", () => {
  // A body sitting on the line is decided by whether you divide and compare or
  // compare the product, and the two can differ by one ULP. `creature.js`
  // multiplies, so the predicate multiplies. Probing the exact boundary is the
  // only way to tell the two implementations apart, which is why it is here and
  // not left to the sweep above.
  const cfg = makeConfig();
  const edge = refugeRadius(cfg);
  assert.equal(inRefuge(edge, cfg), true, "the reported threshold must itself be safe");
  assert.equal(inRefuge(nextUp(edge), cfg), true, "one bit bigger is safe");
  assert.equal(inRefuge(nextDown(edge), cfg), false, "one bit smaller is not");
  // And the rule and the caption agree on that bit, which is not guaranteed by
  // construction — it is a fact about these two constants, and a retune could
  // break it silently.
  assert.equal(cfg.bodyRadiusMax > nextDown(edge) * cfg.preySizeRatio, true);
});

test("the share counts the living and nothing else", () => {
  const cfg = makeConfig();
  const edge = refugeRadius(cfg);
  assert.equal(refugeShare([], cfg), 0, "an empty pond has no share, not a NaN");
  assert.equal(refugeShare([{ radius: edge }], cfg), 1);
  assert.equal(refugeShare([{ radius: cfg.bodyRadiusMin }], cfg), 0);
  assert.equal(
    refugeShare([{ radius: edge }, { radius: edge }, { radius: 4 }, { radius: 4 }], cfg),
    0.5
  );
});

test("the module is a pure observer", () => {
  // It reads radii and returns a number. Nothing here may write to a creature,
  // and calling it twice must not be different from calling it once — the
  // weakest of the guarantees in this project and the one that lets the panel
  // call it every frame.
  const w = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 200; i++) w.step();
  const before = w.creatures.map((c) => c.radius);
  const a = refugeShare(w.creatures, w.config);
  const b = refugeShare(w.creatures, w.config);
  assert.equal(a, b);
  assert.deepEqual(w.creatures.map((c) => c.radius), before);
});

test("the readout on the panel is the module's own number", () => {
  // `Stats.sample` counts the refuge inside the loop it already runs over the
  // population rather than calling `refugeShare`, because that is one
  // comparison per creature against a scan of its own. Two implementations of
  // one claim is exactly the shape v1.61 found in the palette test — the copy
  // drifts and the drift comes out as a pass — so they are checked against each
  // other on a real pond at several points in a run.
  const w = new World(makeConfig({ seed: 314 }));
  for (const mark of [1, 100, 1000, 2000]) {
    while (w.tick < mark) w.step();
    assert.equal(
      w.stats.refugeShare,
      refugeShare(w.creatures, w.config),
      `the tile and the module disagree at tick ${mark}`
    );
  }
  // And on the default seed it is the majority of the pond well inside the
  // first two thousand ticks — the fact the readout exists to show. Asserted as
  // a floor rather than a value: the trajectory is pinned by the golden hashes
  // in test/fingerprint.test.js, and repeating a number here would only give a
  // future release a second place to re-record.
  assert.ok(w.stats.refugeShare > 0.5, `seed 314 at tick 2000: ${w.stats.refugeShare}`);
});

test("the refuge is in the books' channel", () => {
  // v1.59's rule: a field on `Stats` that is outside `STATS_HASHED` is a field
  // a switched-off feature could write to with every fingerprint in the project
  // staying bit-identical. `test/books.test.js` walks a live object and would
  // catch its absence; this says so by name, where somebody deleting the line
  // will read it.
  assert.ok(STATS_HASHED.includes("refugeShare"));
});

test("the pond says who is out of reach, and only where hunting exists", () => {
  const w = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 500; i++) w.step();
  const said = describePond(w, w.config);
  assert.match(said, /nothing here can eat them/);
  assert.match(said, /7\.3 pixels/, "the sentence must carry the threshold, not just a share");

  // With predation off the same bodies are the same size — the statistic does
  // not move — and the sentence goes away regardless, because a refuge from
  // nobody is arithmetic rather than news. This is the one readout in the
  // project whose "off" state is a judgement about meaning instead of a zero.
  const q = new World(makeConfig({ seed: 314, predation: false }));
  for (let i = 0; i < 500; i++) q.step();
  assert.ok(q.stats.refugeShare > 0, "sizes do not depend on predation being on");
  assert.doesNotMatch(describePond(q, q.config), /eat them/);
});

test("the crossing is announced once, after first blood, and never from above", () => {
  const w = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 4000; i++) w.step();
  const ev = w.chronicle.events;
  const crossings = ev.filter((e) => e.msg.includes("too big for anything here to eat"));
  assert.equal(crossings.length, 1, "the line is one-shot, not one per wobble over a half");
  const firstKill = ev.find((e) => e.msg.includes("First blood"));
  assert.ok(firstKill, "seed 314 hunts within 4,000 ticks");
  assert.ok(crossings[0].tick >= firstKill.tick, "a refuge line before anyone has hunted");

  // The guard that matters, staged rather than waited for (v1.45): a pond whose
  // share never dips below a half must never announce a crossing, because there
  // was nothing to cross. Hand the chronicle a world that starts above the line
  // and has already hunted.
  const q = new World(makeConfig({ seed: 314 }));
  q.chronicle._firstKill = true;
  q.stats.refugeShare = 0.9;
  q.chronicle.observe(q, 1);
  assert.equal(
    q.chronicle.events.filter((e) => e.msg.includes("too big")).length,
    0,
    "a pond that was never below the line announced crossing it"
  );
});

// ── The refuge the pond actually has (v1.89) ───────────────────────────────

test("the ceiling is the biggest hunter, and a big herbivore is not one", () => {
  const cfg = makeConfig();
  const t = cfg.carnivoreThreshold;
  // Hand-built, because the thing worth pinning is which half of `_edible` the
  // ceiling reads: a body at `bodyRadiusMax` with no appetite must not set it,
  // and a small hunter must.
  const pond = [
    { radius: cfg.bodyRadiusMax, carnivory: t - 0.0001 },
    { radius: 5, carnivory: t },
    { radius: 6.4, carnivory: 1 },
    { radius: 7.9, carnivory: 0 },
  ];
  assert.equal(hunterCeiling(pond, cfg), 6.4);
  assert.equal(hunterCeiling([], cfg), 0, "an empty pond has no hunter, not a NaN");
  assert.equal(hunterCeiling([{ radius: 7.9, carnivory: 0 }], cfg), 0);
  // The threshold is `>=`, exactly as `Creature._edible` reads it.
  assert.equal(hunterCeiling([{ radius: 4, carnivory: t }], cfg), 4);

  // And against a real pond, at several points in a run, brute-forced.
  const w = new World(makeConfig({ seed: 314 }));
  for (const mark of [1, 200, 1200, 2500]) {
    while (w.tick < mark) w.step();
    const max = w.creatures
      .filter((c) => c.carnivory >= w.config.carnivoreThreshold)
      .reduce((m, c) => Math.max(m, c.radius), 0);
    assert.equal(hunterCeiling(w.creatures, w.config), max, `tick ${mark}`);
  }
});

test("the lived predicate is the eating rule with the hunter that exists", () => {
  // `inRefuge`'s test one substitution down. There the hunter is the largest
  // this world can grow; here it is the largest it *has* grown, and the claim
  // is the same shape: no creature in this pond can eat a body this size. So
  // ask the pond's own biggest hunter, at a fine step over the whole range.
  const cfg = makeConfig({ kinRecognition: false });
  const w = new World(cfg);
  for (let i = 0; i < 400; i++) w.step();
  const ceiling = hunterCeiling(w.creatures, cfg);
  assert.ok(ceiling > 0, "seed 314 has hunters at tick 400");
  const hunter = w.creatures.find(
    (c) => c.carnivory >= cfg.carnivoreThreshold && c.radius === ceiling
  );
  const target = w.creatures.find((c) => c !== hunter);
  const wasRadius = target.radius;

  for (let r = cfg.bodyRadiusMin; r <= cfg.bodyRadiusMax; r += 0.001) {
    target.radius = r;
    assert.equal(
      hunter.canEat(target),
      !inLivedRefuge(r, ceiling, cfg),
      `the biggest living hunter and the lived refuge disagree at radius ${r}`
    );
  }
  target.radius = wasRadius;

  // The caption on it, and the boundary decided the way `creature.js` decides
  // it — the `inRefuge` bit-probe, one substitution down.
  const edge = livedRefugeRadius(ceiling, cfg);
  assert.equal(edge, ceiling / cfg.preySizeRatio);
  assert.equal(inLivedRefuge(edge, ceiling, cfg), true, "the reported line is itself safe");
  assert.equal(inLivedRefuge(nextUp(edge), ceiling, cfg), true);
  assert.equal(inLivedRefuge(nextDown(edge), ceiling, cfg), false);
});

test("a pond with nothing hunting is entirely out of reach", () => {
  // The reading this statistic exists for, and the one the config's refuge
  // cannot produce: two of twelve seeds hold no hunter at all at 6,000 ticks,
  // and the older tile goes on quoting a line at 7.273 px in exactly that pond.
  const cfg = makeConfig();
  const pond = [{ radius: 3.5, carnivory: 0 }, { radius: 8, carnivory: 0.1 }];
  assert.equal(hunterCeiling(pond, cfg), 0);
  assert.equal(livedRefugeRadius(0, cfg), 0);
  assert.equal(livedRefugeShare(pond, cfg), 1, "with no hunter, everything is safe");
  assert.equal(inLivedRefuge(cfg.bodyRadiusMin, 0, cfg), true, "0 > r * ratio is never true");
  assert.equal(livedRefugeShare([], cfg), 0, "an empty pond has no share, not a NaN");
});

test("the lived refuge is never behind the one the config declares", () => {
  // The invariant that makes the pair worth showing together: a living hunter
  // cannot be bigger than the biggest this world grows, so the line it sets is
  // never higher and the share beyond it never smaller. The two meet exactly
  // when somebody has reached `bodyRadiusMax`, which is the case the older tile
  // is right about.
  const w = new World(makeConfig({ seed: 314 }));
  let sawGap = false;
  for (let i = 0; i < 2500; i++) {
    w.step();
    if (i % 50) continue;
    const ceiling = hunterCeiling(w.creatures, w.config);
    const lived = livedRefugeShare(w.creatures, w.config);
    const decl = refugeShare(w.creatures, w.config);
    assert.ok(
      livedRefugeRadius(ceiling, w.config) <= refugeRadius(w.config),
      `tick ${w.tick}: the lived line is above the declared one`
    );
    assert.ok(lived >= decl, `tick ${w.tick}: ${lived} < ${decl}`);
    if (ceiling === w.config.bodyRadiusMax) {
      assert.equal(lived, decl, `tick ${w.tick}: a hunter at the maximum, and they disagree`);
    } else if (lived > decl) sawGap = true;
  }
  assert.ok(sawGap, "seed 314 never once had a hunter smaller than the world allows");
});

test("the second readout on the panel is the module's own number too", () => {
  // `Stats.sample` counts this in the pass it already runs, like `refugeShare`,
  // so the same two-implementations risk applies and gets the same answer.
  const w = new World(makeConfig({ seed: 314 }));
  for (const mark of [1, 100, 1000, 2000]) {
    while (w.tick < mark) w.step();
    const ceiling = hunterCeiling(w.creatures, w.config);
    assert.equal(w.stats.hunterCeiling, ceiling, `the ceiling disagrees at tick ${mark}`);
    assert.equal(w.stats.livedRefugeRadius, livedRefugeRadius(ceiling, w.config));
    assert.equal(
      w.stats.livedRefugeShare,
      livedRefugeShare(w.creatures, w.config),
      `the tile and the module disagree at tick ${mark}`
    );
  }
  for (const f of ["hunterCeiling", "livedRefugeRadius", "livedRefugeShare"]) {
    assert.ok(STATS_HASHED.includes(f), `${f} is outside the books' channel`);
  }
});

test("the pond says where today's line is, and says nothing when nobody hunts", () => {
  const w = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 500; i++) w.step();
  const said = describePond(w, w.config);
  assert.match(said, /No hunter now alive is bigger than/);
  assert.match(said, /beyond every hunter in it/);

  // Staged rather than waited for (v1.45): strip the appetite out of the pond
  // and re-sample. "None of them hunt" already covers this case, and a line set
  // by nobody must not be quoted on top of it.
  for (const c of w.creatures) c.carnivory = 0;
  w.stats.sample(w);
  const quiet = describePond(w, w.config);
  assert.match(quiet, /None of them hunt/);
  assert.doesNotMatch(quiet, /No hunter now alive/);
  assert.equal(w.stats.livedRefugeShare, 1, "nothing hunts, so everything is beyond reach");

  // And gone entirely with predation off, like the sentence above it.
  const q = new World(makeConfig({ seed: 314, predation: false }));
  for (let i = 0; i < 500; i++) q.step();
  assert.doesNotMatch(describePond(q, q.config), /No hunter now alive/);
});
