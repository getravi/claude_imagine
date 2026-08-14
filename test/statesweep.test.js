// statesweep.test.js — the world's own fields, and the channel that watches
// each one.
//
// `test/determinism.test.js` walks a live creature against `CREATURE_HASHED`
// and `CREATURE_UNHASHED` and fails on a field that is in neither. That test is
// v1.53's, and it exists because the same walk found three fields moving the
// pond from outside the hash. `test/books.test.js` does it for `Stats`, which
// is v1.59's.
//
// The world itself had no such list. This file is that walk one level up, plus
// the sweep that motivated it: for every piece of live state a `World` carries,
// perturb it and ask which channel notices. A field the pond's future depends
// on and no channel can see is a hole in every "bit-for-bit unaffected" claim
// this project makes, because all twelve of them are comparisons of hashes.
//
// The coverage half of that question needs no ticking at all — a perturbation
// either moves a digest or it does not — so it is swept exhaustively, over
// every site, on every run. The half that asks whether the *pond* depends on a
// field costs two worlds and a few hundred ticks per site, so it is pinned on
// the sites that motivated the release rather than swept.

import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import {
  WORLD_HASHED,
  WORLD_UNHASHED,
  trajectoryFingerprint,
  stateFingerprint,
  observationFingerprint,
  booksFingerprint,
} from "../src/fingerprint.js";
import {
  STATE_OWNERS,
  SITE_SILENT,
  stateSites,
  perturbSite,
  sweepSite,
} from "../src/statesweep.js";

/**
 * A world with every opt-in mechanic switched on. A sweep of live state can
 * only see the state a world actually builds — `world.terrain` is `null` in a
 * default pond and `world.barriers` is `null` in all but a walled one — so the
 * domain has to be the richest world this project can make, not the shipped
 * one. Same device as `SPECIAL` in `src/levers.js`.
 */
const EVERYTHING = {
  ...DEFAULT_CONFIG,
  seed: 314,
  terrain: true,
  barriers: true,
  barrierOcclusion: true,
  detritus: true,
  groundSense: true,
  dayNightCycle: true,
  disease: true,
  signalling: true,
  scavenging: true,
  foodRegrowth: true,
};

/**
 * Long enough for every collection a world carries to hold something. Measured
 * rather than guessed: at 40 ticks four of them are still empty (no corpse has
 * been made, no chronicle line spoken), and an empty collection is a site the
 * sweep silently cannot perturb. At 400 there is exactly one left and it is
 * declared.
 */
const WARM = 400;

function warmed() {
  const w = new World({ ...EVERYTHING });
  for (let i = 0; i < WARM; i++) w.step();
  return w;
}

/** Shallow snapshot of whatever `perturbSite` is about to move, for undo. */
function snapshot(world, site) {
  const parts = site.path.split(".");
  let owner = world;
  for (let i = 0; i < parts.length - 1; i++) owner = owner[parts[i]];
  const key = parts[parts.length - 1];
  const v = owner[key];
  if (typeof v === "number" || typeof v === "boolean") {
    return () => { owner[key] = v; };
  }
  if (ArrayBuffer.isView(v) || Array.isArray(v)) {
    const i = Math.floor(v.length / 2);
    const el = v[i];
    if (el !== null && typeof el === "object") {
      const copy = { ...el };
      return () => { Object.assign(el, copy); };
    }
    return () => { v[i] = el; };
  }
  return () => {};
}

test("every own field of a live world is classified, and the two lists agree", () => {
  const world = warmed();
  const live = Object.keys(world).sort();

  // Both ways, which is the point: a field added to the world fails here until
  // somebody says which channel watches it, and a field deleted from the world
  // fails until the lists forget it.
  assert.deepEqual(
    live,
    Object.keys(STATE_OWNERS).sort(),
    "the world's own fields and STATE_OWNERS have parted"
  );

  // And the machine-readable table has to agree with the one carrying the
  // reasons, or the reasons are about a world that no longer exists.
  const declaredState = Object.keys(STATE_OWNERS)
    .filter((k) => STATE_OWNERS[k] === "state")
    .sort();
  assert.deepEqual(declaredState, [...WORLD_HASHED].sort(), "WORLD_HASHED disagrees with STATE_OWNERS");
  const declaredOther = Object.keys(STATE_OWNERS)
    .filter((k) => STATE_OWNERS[k] !== "state")
    .sort();
  assert.deepEqual(
    declaredOther,
    Object.keys(WORLD_UNHASHED).sort(),
    "WORLD_UNHASHED disagrees with STATE_OWNERS"
  );
  for (const [field, why] of Object.entries(WORLD_UNHASHED)) {
    assert.ok(why.length > 20, `${field}: "outside the hash" needs a reason, not a shrug`);
  }
});

test("every piece of live state is watched by the channel its owner declares", () => {
  const world = warmed();
  const sites = stateSites(world);
  assert.ok(sites.length > 150, `only ${sites.length} sites — the walk stopped early`);

  for (const site of sites) {
    const owner = site.path.split(".")[0];
    assert.ok(owner in STATE_OWNERS, `${site.path}: no owner declaration`);
    const undo = snapshot(world, site);
    const before = digests(world);
    const moved = perturbSite(world, site);
    const seen = seenBy(before, digests(world));
    undo();
    assert.deepEqual(
      digests(world),
      before,
      `${site.path}: the sweep could not put the world back, so every later site is measured in a world it dirtied`
    );

    if (!moved) {
      assert.ok(
        site.path in SITE_SILENT,
        `${site.path}: the sweep has no perturbation for a ${site.kind}, and nothing says so`
      );
      continue;
    }
    if (site.path in SITE_SILENT) {
      assert.deepEqual(seen, [], `${site.path}: declared invisible and a channel saw it`);
      continue;
    }
    const channel = STATE_OWNERS[owner];
    if (channel === "state" || channel === "observation" || channel === "books") {
      assert.ok(
        seen.includes(channel),
        `${site.path}: the pond carries it and ${channel} is blind to it (seen: ${seen.join(",") || "nothing"})`
      );
    } else {
      assert.deepEqual(
        seen,
        [],
        `${site.path}: declared outside every hash (${channel === null ? "no channel" : channel}) and one of them saw it`
      );
    }
  }
});

test("the sweep's own exclusions are all still real", () => {
  const world = warmed();
  const paths = new Set(stateSites(world).map((s) => s.path));
  for (const [path, why] of Object.entries(SITE_SILENT)) {
    assert.ok(paths.has(path), `${path}: declared silent and no longer exists`);
    assert.ok(why.length > 20, `${path}: an exclusion needs a reason`);
  }
});

test("the pond's shape is state its future depends on", () => {
  // The three sites that motivated v1.91, one from each of the landscape, the
  // rock and the index. All three were invisible to all five channels before
  // this release, and all three part two ponds inside forty ticks from a
  // forty-tick warm-up — which is why these three and not the other fourteen.
  // The budget is a claim about a rate (v1.53's lesson, and it is load-bearing
  // here): from a 400-tick warm-up the same perturbation of `environment.floor`
  // takes 176 ticks to show, and `environment.centres` 36, so a sweep run at
  // one warm-up cannot be quoted at another.
  for (const path of ["environment.floor", "barriers.walls", "creatureGrid.cellSize"]) {
    const r = sweepSite({ path }, { config: EVERYTHING, warm: 40, after: 40 });
    assert.equal(r.verdict, "swept", `${path}: ${r.verdict}`);
    assert.ok(r.moved, `${path}: perturbing it left the pond bit-identical`);
    assert.ok(r.seen.includes("state"), `${path}: the pond moved and the state hash did not`);
  }
});

test("asking a world its mean fertility does not change what it hashes", () => {
  // The `environment._mean` exclusion, as a test rather than as a comment. It
  // is a cache, it fills on demand, and an instrument that could see it would
  // fingerprint a world differently for having been read — which is the one
  // thing v1.36 says a fingerprint may never do.
  // The cache is filled before the first tick — laying down the opening crop
  // asks the field its mean — so the experiment runs the other way round:
  // *empty* it, the way `FertilityField.update` does whenever the biomes drift,
  // and fill it again. Both must hash the same as the world that never lost it.
  const w = warmed();
  const full = stateFingerprint(w);
  assert.notEqual(w.environment._mean, null, "nothing has asked, so this proves nothing");
  const remembered = w.environment._mean;
  w.environment._mean = null;
  assert.equal(stateFingerprint(w), full, "the state hash can see an empty cache");
  assert.equal(w.environment.mean(), remembered, "refilling the cache changed the answer");
  assert.equal(stateFingerprint(w), full, "the state hash can see a cache");
});

test("the chronicle is the one output with no channel, and it is not a determinism hole", () => {
  // `WORLD_UNHASHED.chronicle` claims two things. The first is that nothing
  // watches it — the sweep above asserts that, by requiring every chronicle
  // site to be seen by nobody. The second is that this costs determinism
  // nothing, because the narration reads the pond and never writes to it, and
  // that claim needs the pond run rather than hashed.
  const a = new World({ ...EVERYTHING });
  const b = new World({ ...EVERYTHING });
  for (let i = 0; i < 200; i++) {
    a.step();
    b.step();
  }
  let flipped = 0;
  for (const [k, v] of Object.entries(a.chronicle)) {
    if (typeof v === "boolean") {
      a.chronicle[k] = !v;
      flipped++;
    } else if (typeof v === "number") {
      a.chronicle[k] = v + 1;
      flipped++;
    }
  }
  assert.ok(flipped > 20, `only ${flipped} latches — the chronicle changed shape`);
  for (let i = 0; i < 300; i++) {
    a.step();
    b.step();
  }
  assert.equal(
    trajectoryFingerprint(a),
    trajectoryFingerprint(b),
    "the pond's narration wrote back into the pond"
  );
});

/**
 * The three digests a perturbation between two ticks can be caught by. The
 * fourth and fifth channels cannot appear here by construction: `drawStream`
 * has to be attached before the first tick, and `rendershot`'s hash is about a
 * picture rather than a world.
 */
function digests(world) {
  return [stateFingerprint(world), observationFingerprint(world), booksFingerprint(world)];
}

const CHANNEL_NAMES = ["state", "observation", "books"];

function seenBy(before, after) {
  return CHANNEL_NAMES.filter((_, i) => before[i] !== after[i]);
}
