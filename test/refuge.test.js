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
import { refugeRadius, inRefuge, refugeShare } from "../src/refuge.js";
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
