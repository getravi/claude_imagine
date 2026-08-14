// statesweep.js — the sweep v1.53 ran on a creature, run on the world.
//
// v1.38 asked whether every number in `config.js` is a lever and swept them to
// find out. v1.53 asked the same question one level in — is every field a
// *creature* carries visible to the instrument that claims to hash a world? —
// and found three of twelve omissions moving the pond while `stateFingerprint`
// held still. v1.59 asked it of the books and added a fifth channel.
//
// The world itself was never asked. `stateFingerprint` walks `world.creatures`,
// `world.food.items`, `world.corpses` and `world.detritus.cells`, which is the
// pond's *contents*; the fields that describe the pond's **shape** — where the
// biomes are, how rough the ground is, where the rock stands, how coarse the
// spatial index is — were never in it, from v1.36 when the hash was built to
// v1.91 when this module went looking. v1.59 wrote the gap down and closed it
// by reading: "`barriers`/`terrain`/`environment` were
// cleared by *reading* rather than by sweeping, which is the thing this release
// exists to distrust."
//
// This module is the sweeping. It enumerates the state a live world carries
// (from the object, not from the constructor — v1.53's rule), perturbs each
// field the way `levers.js` perturbs a constant, and asks two questions of
// each: does the pond's future depend on it, and does any channel notice it
// moved. A field that answers *yes, no* is a hole in the instrument.
//
// It found seventeen. A world with every mechanic on carries 166 sites of live
// state across its twenty own fields; 23 of them part two ponds within 300
// ticks, and until v1.91 seventeen of those 23 were invisible to all five
// channels — the biome field's floor, width and centres, the roughness grid's
// dimensions, the detritus lattice's, every wall, and the cell size and shape
// of all three spatial indices. The shape of the omission is the finding: a
// pond's *contents* move every tick and its *shape* does not, so a hash
// written by watching a world run covers exactly the half that moves.
//
// **What the sweep cannot reach, stated here rather than discovered later.**
//
//   * `world.config` — that is `levers.js`'s domain, swept since v1.38.
//   * A generator's state. `RNG` keeps its position inside the closure
//     `mulberry32` returns, so `rng.seed` is a *record* of how a stream started
//     and not the stream; perturbing it moves nothing and no walk of an object
//     can reach what does. `drawStream` is the channel for that, and it is the
//     one channel that has to be attached before the first tick.
//   * Anything a perturbation cannot express. Strings and functions are passed
//     over; an array with no number in it is *reported* rather than skipped
//     silently, so a site that happens to be empty in the world the sweep was
//     run in shows up as a coverage question instead of as a pass.
//
// The sweep is a two-arm experiment, so it costs two worlds per site and its
// answers are about the world it was run in — a field that only matters when a
// flag is on needs that flag on, exactly as `SPECIAL` in `levers.js` does.

import { World } from "./world.js";
import { perturb } from "./levers.js";
import {
  trajectoryFingerprint,
  stateFingerprint,
  observationFingerprint,
  booksFingerprint,
} from "./fingerprint.js";

/**
 * Every own field of a live `World`, and the channel that watches it.
 *
 * The reasons live in `WORLD_HASHED` and `WORLD_UNHASHED` in `fingerprint.js`,
 * because that is where the decisions are made; this is the machine-readable
 * half, and `test/statesweep.test.js` holds the two in step both ways so
 * neither can grow a field the other has not heard of.
 *
 * `null` means no channel watches it. Three fields carry it: two are recomputed
 * from the tick at the end of every step, so there is nothing for a channel to
 * watch, and the third is `chronicle` — a real output that nothing watches,
 * which is a lead rather than a bug. See `WORLD_UNHASHED` for both reasons.
 */
export const STATE_OWNERS = {
  config: "config",
  rng: "draws",
  tick: "state",
  phylogeny: "observation",
  environment: "state",
  seasonFactor: null,
  seasonPhase: null,
  visionFactor: "state",
  terrain: "state",
  detritus: "state",
  barriers: "state",
  food: "state",
  energy: "books",
  creatures: "state",
  creatureGrid: "state",
  foodGrid: "state",
  corpses: "state",
  corpseGrid: "state",
  stats: "books",
  chronicle: null,
};

/**
 * Sites under a watched owner that its channel deliberately cannot see, and
 * sites no perturbation can express. Both are exclusions, so both are written
 * down with a reason — v1.51's rule, and v1.68's correction to it: a sweep's
 * skips are where the next finding hides.
 */
export const SITE_SILENT = {
  "environment._mean": "a lazily-filled cache of a pure function of the " +
    "fields beside it. Hashing it would make a world that has been asked its " +
    "mean fingerprint differently from one that has not",
  "creatureGrid.cells": "the index's buckets: the same objects the hash walks " +
    "already, re-filled at the top of every tick. Arrays of arrays, so there " +
    "is no number in them a perturbation could move either",
  "foodGrid.cells": "the same, one index over",
  "corpseGrid.cells": "the same, one index over",
  "stats.runHistory.fields": "the archive's column *names* — strings, which " +
    "this sweep has no perturbation for. `booksFingerprint` hashes them",
};

/**
 * How deep into the objects a world owns the walk goes. Two is enough for
 * everything this world holds — `world.terrain.grid` is the deepest live field,
 * and `world.stats.runHistory.stride` is the deepest field of any kind — and a
 * bound is here because a walk of a live object graph is a walk of whatever the
 * next release attaches to it.
 */
export const MAX_DEPTH = 2;

/** True for a typed array or a plain array of numbers. */
function isNumberArray(v) {
  return (
    ArrayBuffer.isView(v) ||
    (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number"))
  );
}

/** True for a non-empty array whose every element is an object. */
function isRecordArray(v) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => x !== null && typeof x === "object");
}

function walk(out, path, v, depth, seen) {
  if (v === null || v === undefined) return;
  const t = typeof v;
  if (t === "number" || t === "boolean") return void out.push({ path, kind: t });
  if (t === "string" || t === "function") return;
  if (t !== "object") return;
  if (isNumberArray(v)) return void out.push({ path, kind: "numbers" });
  if (isRecordArray(v)) return void out.push({ path, kind: "records" });
  if (Array.isArray(v)) return void out.push({ path, kind: "opaque" });
  if (seen.has(v)) return;
  seen.add(v);
  if (depth >= MAX_DEPTH) return;
  for (const [k, child] of Object.entries(v)) {
    if (k === "config") continue; // levers.js's domain, and a back-reference
    walk(out, `${path}.${k}`, child, depth + 1, seen);
  }
}

/**
 * Every perturbable piece of state a live world carries, as dotted paths.
 *
 * Read off the object rather than off the constructors, because a field that
 * only exists after a tick — `stats` grows six of them at the first `sample()`
 * — is exactly the kind a list written from source misses. Sweep a *stepped*
 * world for the same reason.
 *
 * @param {World} world
 * @returns {Array<{path: string, kind: "number"|"boolean"|"numbers"|"records"|"empty"}>}
 */
export function stateSites(world) {
  const out = [];
  const seen = new Set([world.config]);
  for (const [k, v] of Object.entries(world)) {
    if (k === "config") continue;
    walk(out, k, v, 0, seen);
  }
  return out;
}

/** Resolve a dotted path to the object holding it and the final key. */
function resolve(world, path) {
  const parts = path.split(".");
  let owner = world;
  for (let i = 0; i < parts.length - 1; i++) owner = owner[parts[i]];
  return { owner, key: parts[parts.length - 1] };
}

/**
 * Move one site, using the same perturbation `levers.js` applies to a constant
 * — a 37% push, or a switch-on for a zero — so the two sweeps disagree about
 * nothing. A one-ULP nudge would be a different experiment: it would ask what
 * the instrument can *see*, and this asks what the pond *depends on*.
 *
 * A collection is moved at one element, the middle one, because moving all of
 * them measures a different thing (a landscape that is wrong everywhere) and
 * because the middle is the element least likely to be a boundary case.
 *
 * A record is moved at *every* number and flag it carries, not at the first
 * one. Moving the first was the version I wrote initially and it is a trap:
 * `Object.entries` hands back a creature's `id` first, which is the one field
 * `CREATURE_UNHASHED` names as deliberately invisible, so the sweep would have
 * reported the whole `creatures` array as state no instrument can see.
 *
 * @returns {boolean} false if there was nothing there a perturbation can move
 */
export function perturbSite(world, site) {
  const { owner, key } = resolve(world, site.path);
  const v = owner[key];
  if (typeof v === "boolean") {
    owner[key] = !v;
    return true;
  }
  if (typeof v === "number") {
    owner[key] = perturb(v);
    return true;
  }
  if (isNumberArray(v)) {
    if (!v.length) return false;
    const i = Math.floor(v.length / 2);
    v[i] = perturb(v[i]);
    return true;
  }
  if (isRecordArray(v)) {
    const record = v[Math.floor(v.length / 2)];
    let moved = false;
    for (const [k, x] of Object.entries(record)) {
      if (typeof x === "number") {
        record[k] = perturb(x);
        moved = true;
      } else if (typeof x === "boolean") {
        record[k] = !x;
        moved = true;
      }
    }
    return moved;
  }
  return false;
}

/**
 * The experiment, for one site.
 *
 * Two worlds from one config, stepped together to `warm` so the site holds
 * whatever a lived pond puts in it; one of them perturbed; both stepped on to
 * `warm + after`. The verdict has two independent halves:
 *
 *   `seen` — which channels noticed *at the instant of the perturbation*, before
 *   any tick could carry it anywhere. This is the instrument's answer.
 *
 *   `moved` — whether the pond's *trajectory* parted by the end. This is the
 *   world's answer, and it is the one that decides whether `seen` mattered.
 *   Deliberately the trajectory and not the state: once a field is hashed, a
 *   state comparison of the two arms differs by construction, and a verdict
 *   that a fix makes true of itself is not a verdict.
 *
 * A perturbation that makes the world throw counts as `moved`: a field the
 * simulation cannot step without is as load-bearing as one it steps differently
 * with, and reporting the throw is more honest than swallowing it.
 *
 * @param {{path: string, kind: string}} site
 * @param {{config: object, warm?: number, after?: number}} opts
 */
export function sweepSite(site, { config, warm = 40, after = 40 }) {
  const a = new World({ ...config });
  const b = new World({ ...config });
  for (let i = 0; i < warm; i++) {
    a.step();
    b.step();
  }
  const live = stateSites(a).find((s) => s.path === site.path);
  if (!live) return { path: site.path, kind: site.kind, verdict: "vanished", seen: [], moved: false };
  const before = {
    state: stateFingerprint(a),
    observation: observationFingerprint(a),
    books: booksFingerprint(a),
  };
  if (!perturbSite(a, live)) {
    return { path: site.path, kind: live.kind, verdict: "empty", seen: [], moved: false };
  }
  const seen = [];
  if (stateFingerprint(a) !== before.state) seen.push("state");
  if (observationFingerprint(a) !== before.observation) seen.push("observation");
  if (booksFingerprint(a) !== before.books) seen.push("books");
  try {
    for (let i = 0; i < after; i++) {
      a.step();
      b.step();
    }
  } catch (err) {
    return { path: site.path, kind: live.kind, verdict: "threw", seen, moved: true, err };
  }
  const moved = trajectoryFingerprint(a) !== trajectoryFingerprint(b);
  return { path: site.path, kind: live.kind, verdict: "swept", seen, moved };
}
