// onset.js — the tick a rule first happens, and what a flag flip can prove.
//
// Two sweeps in this project switch a feature on and watch for the pond to
// move. `src/levers.js` (v1.38) does it for every *number* in `config.js` and
// `test/fingerprint.test.js` (v1.36) does it for every opt-in *flag*. Both
// compute the same quantity on the way to their assertion — the first tick at
// which the two arms disagree — and both then read it as a boolean. `worldAt`
// is returned and tested as `> 0`; the flag sweep's `at` is a local. The number
// itself has been thrown away seventy-five releases running, except where a
// reading was surprising enough to be hand-copied into a comment, which is
// where v1.85 found three different counts of one array.
//
// So this module makes the number the subject. It also asks the question the
// boolean cannot, which turned out to be the reason to write it:
//
// **a flag flip is only a controlled comparison when the two arms start from
// the same pond.**
//
// Switching a sense on draws its gene block, and a genome drawn from the world
// RNG shifts every draw after it. The arms are then not one world with a rule
// added — they are two different samples, and "they disagree at tick 1" is as
// true of any two seeds. Seven of this project's twenty-five flags are in that
// position, and for two of them the flip is provably measuring nothing else:
// `groundSense` reads exactly 0 in a pond with no terrain and `wallSense` reads
// exactly 0 in a pond with no rock, which is the pond both are swept in.
//
// The honest instrument for those is not a flip. It is `blockOnset` below:
// build the same world twice, scramble the genes the flag added on one copy,
// and see whether the pond notices. Same device as `statesweep.js` — perturb
// live state, watch a channel — pointed at the genome instead of the world.
//
// PURE OBSERVER. It builds worlds of its own and steps them; nothing in the
// simulation reads it, no module the app loads imports it, and it draws no
// random numbers itself. Reading the stream is a draw, so the alignment probe
// below runs on throwaway copies: measuring a pond by taking a number out of
// its RNG moves the pond being measured.

import { World } from "./world.js";
import { makeConfig, DEFAULT_CONFIG } from "./config.js";
import { stateFingerprint, trajectoryFingerprint } from "./fingerprint.js";
import { AUX_ORDER } from "./genome.js";

/** Ticks a flag gets to show itself before the sweep calls it mute. */
export const DEFAULT_BUDGET = 600;

/** The pond every sweep here runs in unless a flag asks for another. */
export const DEFAULT_SEED = 314;

/**
 * What a flag flip turned out to be. The verdict is read off the *trajectory*
 * channel — where everything actually is — because that is the cross-version
 * invariant `fingerprint.js` exists to protect.
 *
 * - `resampled` — the arms' random streams part at construction, so this is a
 *   comparison of two draws of the world and a divergence attributes to
 *   nothing. Not a failure of the flag: a sense with genes has to draw them.
 *   It is a failure of the *method*, and `blockOnset` is the replacement.
 * - `built` — the streams stay in step and the arms still start apart: the
 *   flag builds a different pond out of the same numbers. Nothing this project
 *   ships lands here, which `test/onset.test.js` asserts rather than assumes.
 * - `fires` — the arms start identical and part at tick `at.trajectory`. This
 *   is the reading the two older sweeps believe they are taking.
 * - `mute` — the arms start identical and never part inside the budget. The
 *   rule is real and its ecology never arrived (v1.36's kin recognition,
 *   v1.45's posthumous meal).
 */
export const VERDICTS = Object.freeze(["resampled", "built", "fires", "mute"]);

/**
 * Every flag that needs more than "flip it in the default pond": the world
 * that makes it live, how long it gets, and — because a sweep is worth what
 * its exceptions are worth — why.
 *
 * @type {Object<string, {world?: object, ticks?: number, why: string}>}
 */
export const SPECIAL = {
  barrierOcclusion: {
    world: { barriers: true },
    why: "rock that stops sight can only stop it where there is rock",
  },
  massWeightedShove: {
    world: { bodyCollision: true },
    why: "a rule about how an overlap is split needs a pond that has overlaps",
  },
  autoReseed: {
    // The world `levers.js` gives `reseedCount`, for the same reason: the rule
    // is read only when the pond is *completely* empty. No food at all, no
    // trickle-rescue floor and a short life empties this one at tick 200.
    world: { foodStart: 0, foodSpawnRate: 0, reseedFloor: 0, populationStart: 6, maxAge: 200 },
    ticks: 400,
    why: "only read when the pond is completely empty, which the default pond never is",
  },
  disease: {
    ticks: 1000,
    // Measured, not guessed: the first case on seed 314 arrives at tick 901,
    // and a budget under it would file a live mechanic as mute.
    why: "the first infection on the default seed arrives at tick 901",
  },
};

/** Every boolean in `config.js`, read out of the config rather than typed. */
export function flagKeys() {
  return Object.keys(DEFAULT_CONFIG).filter((k) => typeof DEFAULT_CONFIG[k] === "boolean");
}

/**
 * The full specification for one flag: which way it is flipped, in what world,
 * for how long. A flag with no entry in `SPECIAL` gets the plain treatment —
 * flip it in the default pond — so a feature added in a later release is swept
 * the day its flag lands.
 *
 * The flip runs *away from the default*, in both directions: an opt-in feature
 * is switched on and a default-on one is switched off. The four default-on
 * booleans (`seasons`, `foodPatches`, `autoReseed`, `predation`) have never
 * been in either older sweep, which read their inventory as "every key whose
 * value is `false`".
 *
 * @param {string} key
 */
export function flagSpec(key) {
  const from = DEFAULT_CONFIG[key];
  if (typeof from !== "boolean") throw new Error(`${key} is not a flag`);
  const s = SPECIAL[key] || {};
  return {
    key,
    from,
    to: !from,
    world: s.world || {},
    ticks: s.ticks || DEFAULT_BUDGET,
    why: s.why || null,
  };
}

/**
 * Do two configs consume the same number of random draws building their world?
 *
 * There is no counter on `RNG`, and there does not need to be one: if the two
 * streams are still in step, the next number out of each is the same number.
 * The probe is destructive — it takes that number — so it is run on worlds
 * built for the purpose and thrown away.
 */
function streamsAligned(cfgA, cfgB) {
  return new World(cfgA).rng.float() === new World(cfgB).rng.float();
}

/**
 * Run one flag's two arms side by side and report when — and whether — the
 * comparison means anything.
 *
 * @param {string} key
 * @param {{seed?: number, ticks?: number}} [opts]
 * @returns {{key: string, seed: number, ticks: number, from: boolean, to: boolean,
 *   aligned: boolean, builtApart: {state: boolean, trajectory: boolean},
 *   at: {state: number, trajectory: number}, verdict: string, why: string|null}}
 */
export function flagOnset(key, opts = {}) {
  const spec = flagSpec(key);
  const seed = opts.seed ?? DEFAULT_SEED;
  const ticks = opts.ticks ?? spec.ticks;
  const base = { seed, ...spec.world };
  const cfgA = makeConfig({ ...base, [key]: spec.from });
  const cfgB = makeConfig({ ...base, [key]: spec.to });

  const aligned = streamsAligned(cfgA, cfgB);
  const a = new World(cfgA);
  const b = new World(cfgB);
  const builtApart = {
    state: stateFingerprint(a) !== stateFingerprint(b),
    trajectory: trajectoryFingerprint(a) !== trajectoryFingerprint(b),
  };
  // Both channels are followed to the end rather than short-circuited on the
  // first: the gap between them is the second reading this module takes. A
  // flag whose state parts at construction and whose trajectory parts three
  // hundred ticks later added a *field*, and the older sweeps — which hash the
  // strict state — call that a lever on the simulation.
  const at = { state: builtApart.state ? 0 : -1, trajectory: builtApart.trajectory ? 0 : -1 };
  for (let i = 0; i < ticks && (at.state < 0 || at.trajectory < 0); i++) {
    a.step();
    b.step();
    const t = i + 1;
    if (at.state < 0 && stateFingerprint(a) !== stateFingerprint(b)) at.state = t;
    if (at.trajectory < 0 && trajectoryFingerprint(a) !== trajectoryFingerprint(b)) at.trajectory = t;
  }

  let verdict;
  if (!aligned) verdict = "resampled";
  else if (at.trajectory === 0) verdict = "built";
  else if (at.trajectory > 0) verdict = "fires";
  else verdict = "mute";

  return { ...spec, seed, ticks, aligned, builtApart, at, verdict };
}

/** Sweep every flag (or a named subset). */
export function sweepOnsets(keys = flagKeys(), opts = {}) {
  return keys.map((k) => flagOnset(k, opts));
}

/**
 * A deterministic scramble for one gene: an arithmetic ramp through the range
 * a drawn weight plausibly occupies. It has to be *arbitrary* — the point is
 * that the pond cannot tell — and it has to be reproducible, so it is a
 * function of the slot and nothing else. No random numbers are drawn.
 */
function scrambleValue(i) {
  return 3 - ((i * 7) % 13) * 0.5;
}

/**
 * The aligned control: does the block of genes a flag added change anything?
 *
 * Both worlds are built from the *same* config, so they are the same pond down
 * to the bit. One of them then has one aux sense's genes overwritten on every
 * founder. Any divergence after that is the sense, because nothing else moved.
 *
 * A block that is drawn, inherited and mutated and still cannot part the pond
 * is a sense with nothing to read — which is exactly what `groundSense` is in a
 * world with no terrain and `wallSense` is in a world with no rock, and both of
 * those are the world `test/fingerprint.test.js` proves they are levers in.
 *
 * @param {string} blockName one of `AUX_ORDER`'s names: ear, foot, whisker
 * @param {object} [world] config overrides; must switch the block's flag on
 * @param {{seed?: number, ticks?: number}} [opts]
 * @returns {{block: string, flag: string, seed: number, ticks: number, at: number}}
 *   `at` is the first tick the pond parts, or -1 for a block it never noticed.
 */
export function blockOnset(blockName, world = {}, opts = {}) {
  const block = AUX_ORDER.find((b) => b.name === blockName);
  if (!block) throw new Error(`no aux block named ${blockName}`);
  const seed = opts.seed ?? DEFAULT_SEED;
  const ticks = opts.ticks ?? DEFAULT_BUDGET;
  const cfg = makeConfig({ seed, ...world });
  if (!cfg[block.flag]) throw new Error(`${blockName} needs ${block.flag} on: its genes are undrawn`);

  const clean = new World(cfg);
  const scrambled = new World(cfg);
  for (const c of scrambled.creatures) {
    for (let i = block.from; i < block.to; i++) c.genome.data[i] = scrambleValue(i);
  }

  let at = trajectoryFingerprint(clean) !== trajectoryFingerprint(scrambled) ? 0 : -1;
  for (let i = 0; i < ticks && at < 0; i++) {
    clean.step();
    scrambled.step();
    if (trajectoryFingerprint(clean) !== trajectoryFingerprint(scrambled)) at = i + 1;
  }
  return { block: blockName, flag: block.flag, seed, ticks, at };
}
