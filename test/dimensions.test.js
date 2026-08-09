// Tests for the pair screen (v1.71) — which *conjunctions* of constants are levers?
//
// `src/levers.js` (v1.38) moves every number in `config.js` one at a time and
// asks whether the world notices. It is blind by construction to what a pair
// decides, and this project already knows one thing a pair decides that the
// one-at-a-time sweep never saw: `bodyRadiusMax / preySizeRatio` is 7.273 px,
// the size above which nothing this world can grow is able to eat you. Neither
// constant is that number.
//
// `src/dimensions.js` is the cheap screen for the rest of them — units, not
// ticks. What these tests pin is the *instrument*, not its output, because the
// output is a shortlist of candidates and a candidate is not a finding:
//
//   - the units table covers every numeric constant and nothing else, so a
//     constant added in a later release fails here the day it lands;
//   - the unit algebra round-trips and cancels;
//   - the three filters are strictly nested, so a filter that has quietly
//     stopped filtering is caught;
//   - the known instance survives all three and agrees, to the last bit, with
//     the number `src/refuge.js` ships;
//   - a `stepsPerFrame`-shaped hole — a constant no module reads — is reported
//     rather than passed over. That is what this screen found on its first run.
//
// The numbers the screen produced on twelve seeds are in docs/SCIENCE.md. They
// are not asserted here: 149 survivors out of 10,458 combinations is a
// measurement of one afternoon's config, and pinning it would teach a future
// reader that the result is fragile when only the assertion is.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { refugeRadius } from "../src/refuge.js";
import {
  UNITS,
  NOT_A_READER,
  parseUnit,
  formatUnit,
  combineUnits,
  sameUnit,
  references,
  readersFromSources,
  sampleQuantities,
  mergeSamples,
  quantileBand,
  bands,
  screenPairs,
  latentThresholds,
} from "../src/dimensions.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const sources = Object.fromEntries(
  readdirSync(SRC)
    .filter((f) => f.endsWith(".js"))
    .map((f) => [f, readFileSync(join(SRC, f), "utf8")]),
);
const readers = readersFromSources(sources);
const numericKeys = Object.keys(DEFAULT_CONFIG).filter((k) => typeof DEFAULT_CONFIG[k] === "number");

// --- the table ------------------------------------------------------------

test("every numeric constant has a unit, and no unit names a constant that is gone", () => {
  // Read out of DEFAULT_CONFIG rather than written down, so this fails the day
  // a constant lands without a dimension — the same contract levers.js keeps.
  for (const key of numericKeys) {
    assert.ok(UNITS[key], `${key} has no unit in src/dimensions.js`);
  }
  for (const key of Object.keys(UNITS)) {
    assert.equal(typeof DEFAULT_CONFIG[key], "number", `UNITS names ${key}, which is not a config number`);
  }
});

test("every declared unit parses, and formats back to itself", () => {
  for (const key of Object.keys(UNITS)) {
    const round = formatUnit(parseUnit(UNITS[key]));
    assert.equal(round, formatUnit(parseUnit(round)), `${key}: ${UNITS[key]} does not round-trip`);
    for (const base of Object.keys(parseUnit(UNITS[key]))) {
      assert.match(base, /^[a-z]+$/, `${key}: odd base "${base}" — a typo becomes a dimension of its own`);
    }
  }
});

test("the unit algebra cancels", () => {
  const px = parseUnit("px");
  const tick = parseUnit("tick");
  const speed = combineUnits(px, tick, -1);
  assert.equal(formatUnit(speed), "px/tick");
  assert.equal(formatUnit(combineUnits(speed, tick, 1)), "px");
  assert.equal(formatUnit(combineUnits(px, px, -1)), "1");
  assert.ok(sameUnit(parseUnit("energy/(tick*gene)"), combineUnits(parseUnit("energy/tick"), parseUnit("gene"), -1)));
  assert.equal(formatUnit(parseUnit("px/tick^2")), "px/tick^2");
  assert.ok(!sameUnit(parseUnit("px"), parseUnit("gdist")), "two scalars are not the same dimension");
});

test("seed is inert: an index combines with nothing", () => {
  // Not a special case in the screen — `seed` simply carries a base dimension
  // nothing else does, so no product or quotient of it can land in a reference.
  const hits = screenPairs({}).filter((f) => f.a === "seed" || f.b === "seed");
  assert.equal(hits.length, 0, `seed reached a reference class via ${hits.map((h) => h.expr).join(", ")}`);
});

// --- the filters ----------------------------------------------------------

test("the three filters are strictly nested, and each one bites", () => {
  const all = screenPairs({});
  const adjacent = screenPairs({ readers });
  const shortlist = latentThresholds({ readers });

  const key = (f) => `${f.expr}|${f.reference}`;
  const inAll = new Set(all.map(key));
  const inAdjacent = new Set(adjacent.map(key));
  for (const f of adjacent) assert.ok(inAll.has(key(f)), `${f.expr} survived adjacency but is not a candidate`);
  for (const f of shortlist) assert.ok(inAdjacent.has(key(f)), `${f.expr} is on the shortlist but not adjacent`);

  assert.ok(all.length > adjacent.length, "the adjacency filter removed nothing");
  assert.ok(adjacent.length > shortlist.length, "the reachability filter removed nothing");
  // A screen whose shortlist is the whole space is not a screen. 3,486 pairs in
  // three forms each; the shortlist has to be small enough for a person to read.
  const combinations = (numericKeys.length * (numericKeys.length - 1) * 3) / 2;
  assert.ok(shortlist.length < combinations / 10, `shortlist is ${shortlist.length} of ${combinations}`);
});

test("a printed expression never eats a constant's name", () => {
  // The first run of this screen reported `corpseDecayiteEnergy/b`, because the
  // form was built by substituting into "a/b" and `"a/b".replace("a", …)` then
  // found the `b` inside `biteEnergy`.
  for (const f of screenPairs({})) {
    assert.ok(f.expr.includes(f.a) && f.expr.includes(f.b), `${f.a}, ${f.b} printed as ${f.expr}`);
    assert.match(f.expr, /^[A-Za-z]+[*/][A-Za-z]+$/, `${f.expr} is not two names and an operator`);
  }
});

test("the screen is arithmetic: same answer twice, and the config is untouched", () => {
  const before = JSON.stringify(DEFAULT_CONFIG);
  const a = JSON.stringify(screenPairs({ readers }));
  const b = JSON.stringify(screenPairs({ readers }));
  assert.equal(a, b);
  assert.equal(JSON.stringify(DEFAULT_CONFIG), before);
});

// --- the known instance ---------------------------------------------------

test("the screen rediscovers the refuge, and agrees with the shipped rule", () => {
  const shortlist = latentThresholds({ readers });
  const hit = shortlist.find((f) => f.expr === "bodyRadiusMax/preySizeRatio");
  assert.ok(hit, "the one conjunction this project already knows about did not survive the screen");
  assert.equal(hit.reference, "body radius");
  assert.equal(hit.unit, "px");
  // Bit-exact against the rule as `refuge.js` computes it — an instrument that
  // agreed to three decimals would be a second implementation, not a check.
  assert.equal(hit.value, refugeRadius(DEFAULT_CONFIG));
  assert.ok(hit.shared.includes("creature.js") && hit.shared.includes("refuge.js"), hit.shared.join(","));
});

test("the body-radius class is short enough to read by hand", () => {
  // The point of the screen is not that it answers, it is that it hands back a
  // list a person can go through. If this class ever grows past a screenful the
  // filters have stopped working and the instrument is a firehose again.
  const bodies = latentThresholds({ readers }).filter((f) => f.reference === "body radius");
  assert.ok(bodies.length >= 1 && bodies.length <= 20, `${bodies.length} body-radius candidates`);
});

// --- who reads what -------------------------------------------------------

test("every constant is read by some module, or is named here as one that is not", () => {
  // v1.71 found exactly one: `stepsPerFrame`, which `levers.js` described as
  // "read by the animation loop in main.js" while main.js kept its own
  // `let speed = 1`. It reads the constant now, so this list is empty — and an
  // empty list is the assertion, because the next unread constant is the next
  // instance of a comment that is not a measurement (v1.28).
  const UNREAD = [];
  const orphans = Object.keys(UNITS).filter((k) => readers[k].length === 0);
  assert.deepEqual(orphans.sort(), UNREAD.sort(), `no module reads: ${orphans.join(", ")}`);
});

test("the reader scan sees property access and skips the prose around it", () => {
  assert.ok(readers.preySizeRatio.includes("creature.js"));
  assert.ok(readers.bodyRadiusMax.includes("creature.js"));
  // dimensions.js names both of those constants in its own header, in backticks
  // and in the units table, and must not thereby count as reading either.
  for (const skipped of NOT_A_READER) {
    assert.ok(!readers.preySizeRatio.includes(skipped), `${skipped} counted as a reader`);
  }
  // This assertion was written to say "no module destructures the config, so
  // the dot pattern is complete", and it went red on its first run: three
  // modules pull `{width, height}` out that way, ten times between them, and a
  // dot-only scan called the two constants that define the size of the world
  // unread by anything. So the scan handles both forms and this pins the second.
  assert.ok(readers.width.includes("barriers.js"), "a destructured read is invisible to the scan");
  assert.ok(readers.height.includes("environment.js"));
  assert.ok(readers.height.includes("terrain.js"));
  // Any *third* way to reach a constant is still invisible, so the shape is
  // pinned rather than the list: every module that mentions a destructuring of
  // the config has to be a reader of everything it unpacks.
  for (const [file, text] of Object.entries(sources)) {
    if (NOT_A_READER.includes(file)) continue;
    for (const m of text.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*(?:this\.)?(?:cfg|config)\b/g)) {
      for (const raw of m[1].split(",")) {
        const name = raw.trim().split(":")[0];
        if (!UNITS[name]) continue;
        assert.ok(readers[name].includes(file), `${file} unpacks ${name} and is not counted as reading it`);
      }
    }
  }
});

// --- the range the pond actually occupies ---------------------------------

test("a declared range is not a lived range, and the difference does work", () => {
  // One seed and a short run: what is asserted is the *shape* of the answer,
  // not the band. The twelve-seed numbers are in docs/SCIENCE.md.
  const world = new World(makeConfig({ seed: 314, scavenging: true }));
  let acc = {};
  for (let t = 0; t < 2000; t++) {
    world.step();
    if (t % 100 === 0) acc = mergeSamples(acc, sampleQuantities(world));
  }
  const lived = bands(acc, 0.05);
  const declared = Object.fromEntries(references().map((r) => [r.name, r]));

  for (const name of Object.keys(lived)) {
    assert.ok(lived[name].lo >= declared[name].lo - 1e-9, `${name}: lived below its declared floor`);
    assert.ok(lived[name].hi <= declared[name].hi + 1e-9, `${name}: lived above its declared ceiling`);
  }
  // Body radius is the class this project has a number for: it settles at
  // 7.4–7.75 in a declared range of 3.5–8.0 (v1.63), so the middle 90% cannot
  // be the whole road.
  assert.ok(lived["body radius"].lo > declared["body radius"].lo, "the pond occupies its whole declared size range");

  const before = latentThresholds({ readers }).length;
  const after = latentThresholds({ readers, ranges: lived }).length;
  assert.ok(after < before, `the lived band removed nothing (${before} -> ${after})`);
  // …and the one candidate that is known to be a real rule has to survive it.
  const kept = latentThresholds({ readers, ranges: lived }).map((f) => f.expr);
  assert.ok(kept.includes("bodyRadiusMax/preySizeRatio"), "the lived band threw away the refuge");
});

test("quantileBand is nearest-rank, so its bounds were observed", () => {
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const b = quantileBand(v, 0.1);
  assert.ok(v.includes(b.lo) && v.includes(b.hi));
  assert.ok(b.lo >= 1 && b.hi <= 10 && b.lo < b.hi);
  assert.deepEqual(quantileBand([7], 0.05), { lo: 7, hi: 7 });
  // Order in must not matter.
  assert.deepEqual(quantileBand([5, 1, 3, 2, 4], 0), quantileBand([1, 2, 3, 4, 5], 0));
});

test("a nutrient sample is of the cells that hold nutrient", () => {
  // A detritus field is mostly empty ground. Sampling every cell would put the
  // band at zero and report `detritusFull` as a cap that never binds — which
  // v1.27 measured and disproved. A sample has a population, not just a
  // statistic.
  const world = new World(makeConfig({ seed: 314, detritus: true }));
  for (let t = 0; t < 1200; t++) world.step();
  const s = sampleQuantities(world);
  assert.ok(s["cell nutrient"], "no nutrient sampled at all after 1,200 ticks");
  assert.ok(
    s["cell nutrient"].every((v) => v > 0),
    "an empty cell was counted as an observation of the nutrient a cell holds",
  );
  assert.ok(s["cell nutrient"].length < world.detritus.cells.length, "every cell in the field holds nutrient");
});
