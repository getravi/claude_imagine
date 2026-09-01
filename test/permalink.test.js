// permalink.test.js — the short link, and the proof that it is the same link
// (v1.140).
//
// Five claims. The first two are the only ones that matter: **a shortened hash
// opens the identical pond**, asserted field by field against the whole table
// rather than on the two or three settings a test author happens to think of,
// and asserted again all the way through to a world's state hash, because
// "builds the same config" is a claim about `makeConfig` and directive 2 is a
// claim about the pond.
//
// The reader on the other side of this is the one this project cannot test: a
// person who was sent a link. Everything here is about not breaking them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DEFAULT_CONFIG, makeConfig } from "../src/config.js";
import { ALWAYS, HASH_FIELDS, hashFor } from "../src/permalink.js";
import { World } from "../src/world.js";
import { stateFingerprint } from "../src/fingerprint.js";

/**
 * `main.js`'s own reader, as a function of a query string.
 *
 * A copy, and it is the honest kind: `parseHash` reads `location`, so it cannot
 * be imported into a test process that has no browser. What this pins is that
 * every name `hashFor` writes is a name something reads back — the pair of
 * lists is the standing risk in this design, and the test below walks the
 * writer's table to find a field the reader has never heard of.
 */
function readerNames() {
  const text = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const body = text.slice(text.indexOf("function parseHash"), text.indexOf("const DRIFT_SPEED"));
  // Two shapes, because the reader has two: a flag is `p.has("pred")` and a
  // number goes through the `num("food", …)` helper that guards `Number.isFinite`.
  return new Set([...body.matchAll(/(?:p\.has|num)\("(\w+)"/g)].map((m) => m[1]));
}

test("a default pond's link is its seed and nothing else", () => {
  // The whole point, in one assertion. Three hundred characters became fifteen,
  // and the fourteen of them after `seed=` are the pond's identity.
  assert.equal(hashFor(makeConfig({ seed: 314 })), "seed=314");
});

test("every field that is moved is written, one at a time", () => {
  // Field by field rather than a sample of them: a serialiser that quietly
  // compared a value against itself would pass a test that moved `pred` and
  // nothing else, and would drop everything a visitor had actually changed.
  for (const f of HASH_FIELDS) {
    if (f.key === ALWAYS) continue;
    const moved = moveOne(f);
    if (!moved) continue;
    const hash = hashFor(makeConfig(moved));
    assert.match(hash, new RegExp(`(^|&)${f.key}=`), `${f.key} was moved and did not appear`);
  }
});

test("an omitted default and a written default open the same pond", () => {
  // Directive 2, on the surface where breaking it would be silent: a link is
  // opened somewhere else, by somebody who cannot compare.
  const long = new URLSearchParams();
  for (const f of HASH_FIELDS) long.set(f.key, f.of(makeConfig({ seed: 314 })));
  const short = new URLSearchParams(hashFor(makeConfig({ seed: 314 })));
  const a = configFrom(long);
  const b = configFrom(short);
  assert.deepEqual(b, a);

  const worldA = new World(a);
  const worldB = new World(b);
  for (let i = 0; i < 400; i++) {
    worldA.step();
    worldB.step();
  }
  assert.equal(stateFingerprint(worldB), stateFingerprint(worldA));
});

test("every name the link writes is a name the page reads back", () => {
  // The standing risk in this design: the writer's table lives in
  // `permalink.js` and the reader's in `main.js`, as they have since v1.44, and
  // a field added to one of them is a setting that silently stops travelling.
  const read = readerNames();
  for (const f of HASH_FIELDS) {
    if (f.key === ALWAYS) continue; // the seed is read by name, not by `has`
    assert.ok(read.has(f.key), `the link writes "${f.key}" and nothing reads it back`);
  }
});

test("the comparison is against the defaults, not against itself", () => {
  // A serialiser comparing a config with itself would emit `seed=314` for every
  // pond ever configured and lose the lot. Handed a different yardstick, the
  // same config has to come out different.
  const config = makeConfig({ seed: 314 });
  const others = { ...DEFAULT_CONFIG, predation: !DEFAULT_CONFIG.predation };
  assert.match(hashFor(config, others), /(^|&)pred=/);
  assert.doesNotMatch(hashFor(config, DEFAULT_CONFIG), /(^|&)pred=/);
});

/** One field, nudged off its default in whichever direction it has. */
function moveOne(f) {
  const key = CONFIG_KEY[f.key];
  if (!key) return null;
  const now = DEFAULT_CONFIG[key];
  if (typeof now === "boolean") return { seed: 314, [key]: !now };
  if (typeof now === "number") return { seed: 314, [key]: now + 0.25 };
  return null;
}

/** The wire name → the config key, for the fields a test moves. */
const CONFIG_KEY = {
  food: "foodSpawnRate",
  metab: "metabolicBase",
  mut: "mutationRate",
  pred: "predation",
  sex: "sexualReproduction",
  sea: "seasons",
  bio: "foodPatches",
  pla: "plasticity",
  neat: "evolvableTopology",
  drift: "biomeDrift",
  scav: "scavenging",
  lic: "licensedDietCost",
  kin: "kinRecognition",
  night: "dayNightCycle",
  dis: "disease",
  regrow: "foodRegrowth",
  sig: "signalling",
  ter: "terrain",
  det: "detritus",
  eye: "exactVision",
  feel: "groundSense",
  rock: "barriers",
  dark: "barrierOcclusion",
  whisk: "wallSense",
  fin: "deathIsFinal",
  ord: "shuffleTurnOrder",
  body: "bodyCollision",
  mass: "massWeightedShove",
};

/** `parseHash`'s arithmetic, over a `URLSearchParams` a test can hand it. */
function configFrom(p) {
  const o = {};
  if (p.has("seed")) o.seed = Number(p.get("seed"));
  if (p.has("food")) o.foodSpawnRate = Number(p.get("food"));
  if (p.has("metab")) o.metabolicBase = Number(p.get("metab"));
  if (p.has("mut")) o.mutationRate = Number(p.get("mut"));
  for (const [wire, key] of Object.entries(CONFIG_KEY)) {
    if (typeof DEFAULT_CONFIG[key] !== "boolean") continue;
    if (p.has(wire)) o[key] = p.get(wire) === "1";
  }
  if (p.has("drift")) o.biomeDrift = p.get("drift") === "1" ? 0.1 : 0;
  return makeConfig(o);
}
