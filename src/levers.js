// levers.js — does every number in config.js actually do anything?
//
// v1.36 gave this project a bit-exact identity and used it to ask *is every
// flag a lever?* — switch each opt-in feature on and check the world moves. The
// obvious sibling went unrun: `config.js` holds seventy-nine numbers, and
// twice now one of them has turned out to be doing nothing. v1.27 found
// `detritusPerRadius` clipped by a cell cap that silently discarded a third of
// every large carcass, and v1.29 found `energyMax` sitting above a threshold it
// could never be reached from. Neither was found by reading the code; both were
// found by moving a number and watching for a world that didn't.
//
// So this is that sweep, and its whole design is in one word: **channel.** A
// constant can be a lever on
//
//   - `world`    — the simulation. Move it and the state hash moves.
//   - `observer` — the tree of life and nothing else. `speciationDistance`,
//     `phylogenySampleInterval` and `phylogenyHistory` are levers on what the
//     Muller plot says while leaving the pond bit-for-bit identical, which is
//     the *point* of a pure observer and reads as "dead" to a sweep that only
//     watches the state.
//   - `draw`     — the picture and nothing else. `foodRadius` is the whole
//     category: it is the size of a food mote and of a corpse splotch, read by
//     `render.js` and by nothing in `World.step`. A sweep watching the pond and
//     the tree calls it dead, which is how v1.38 came to record it as a
//     *simulation* constant — see below.
//   - `ui`       — read by the animation loop and not by `World.step`.
//     `stepsPerFrame` is the only one, and its claim is a negative: stepping is
//     the caller's business, so it must move neither channel.
//
// Three things this sweep learned the hard way, all three in `SPECIAL` below:
//
//  1. **A one-sided nudge measures one side.** The first pass moved every
//     constant up by 37% and reported fourteen dead. `populationMax` is not
//     dead — the default pond simply never reaches 650, so raising it is a
//     no-op and *lowering* it bites within 500 ticks. Same for `weightClamp`.
//  2. **A constant is only live in a world where it can bite.** A parameter of
//     an opt-in feature needs that feature on; `reseedCount` needs a world that
//     actually goes extinct. This is the v1.36 kin-recognition lesson
//     generalised: a number can be correct, load-bearing and completely mute in
//     the world anybody looks at.
//  3. **A sweep with no channel for a thing calls that thing something else.**
//     v1.38 found `foodRadius` alive in a scavenging world and filed it as an
//     unusual simulation constant. It was: `world.js` set a scavenger's reach to
//     it, because a corpse-sized distance was needed and a corpse-sized number
//     happened to exist. The sweep could see the coupling and had no vocabulary
//     for what the constant *is*, so it wrote down the coupling. v1.40 gave the
//     rule its own `scavengeRadius` (same value, so no world moved) and gave the
//     sweep a fourth channel to say the rest.
//
// The extra channel is not free — a render fingerprint means drawing a frame —
// so it is taken only for the constants that ask for it, and the two claims a
// `draw` constant makes are checked in opposite directions: it must move the
// picture, and it must leave the pond alone for the whole budget.

import { World } from "./world.js";
import { makeConfig, DEFAULT_CONFIG } from "./config.js";
import { stateFingerprint, observationFingerprint } from "./fingerprint.js";
import { renderFingerprint } from "./rendershot.js";

/** Ticks a constant gets to show itself before the sweep calls it dead. */
export const DEFAULT_BUDGET = 600;

/**
 * Move a number somewhere it should be distinguishable from where it was.
 * Fractions at the top of their range go *down* rather than out of it, so a
 * probability stays a probability and a decay factor stays under one.
 */
export function perturb(v) {
  if (v === 0) return 0.5; // a rate switched off by being zero: switch it on
  if (v <= 1) return v > 0.5 ? v * 0.7 : v * 1.37;
  return Number.isInteger(v) ? Math.round(v * 1.37) : v * 1.37;
}

/**
 * Every constant that needs more than "nudge it in the default pond": the world
 * that makes it live, the value to move it to, the budget, and — because a
 * sweep is only worth what its exceptions are worth — why.
 *
 * @type {Object<string, {world?: object, to?: number, ticks?: number, channel?: string, why: string}>}
 */
export const SPECIAL = {
  // --- Constants of an opt-in feature: they need the feature on. ---
  regrowthSpread: { world: { foodRegrowth: true }, why: "regrowth is opt-in" },
  regrowthRadius: { world: { foodRegrowth: true }, why: "regrowth is opt-in" },
  regrowthFloor: { world: { foodRegrowth: true }, why: "regrowth is opt-in" },
  terrainRoughCost: { world: { terrain: true }, why: "terrain is opt-in" },
  terrainBarrenness: { world: { terrain: true }, why: "terrain is opt-in" },
  detritusPerRadius: { world: { detritus: true }, ticks: 700, why: "detritus is opt-in, and needs a death" },
  detritusUptake: { world: { detritus: true }, ticks: 700, why: "detritus is opt-in, and needs a death" },
  detritusFull: { world: { detritus: true }, ticks: 700, why: "detritus is opt-in; the cap needs a full cell" },
  detritusDecay: { world: { detritus: true }, ticks: 700, why: "detritus is opt-in, and needs a death" },
  detritusSprout: { world: { detritus: true }, ticks: 700, why: "detritus is opt-in, and needs a death" },
  corpseEnergyBase: { world: { scavenging: true }, ticks: 700, why: "scavenging is opt-in, and needs a corpse" },
  corpseEnergyPerRadius: { world: { scavenging: true }, ticks: 700, why: "scavenging is opt-in, and needs a corpse" },
  corpseDecay: { world: { scavenging: true }, ticks: 700, why: "scavenging is opt-in, and needs a corpse" },
  scavengeRadius: { world: { scavenging: true }, ticks: 700, why: "scavenging is opt-in, and a reach needs a corpse to reach for" },
  barrierCount: { world: { barriers: true }, why: "barriers are opt-in" },
  barrierThickness: { world: { barriers: true }, why: "barriers are opt-in" },
  // A count of gates per room border, so the generic ×1.37 nudge (2 → 3) is
  // fine but a future default of 1 would round back to itself. Pinned to one
  // door per border instead — a different pond, and the one v1.48's sweep
  // measured as the layout that kills three seeds in twelve.
  barrierGaps: { world: { barriers: true }, to: 1, why: "barriers are opt-in; a gate count is an integer" },
  barrierGapWidth: { world: { barriers: true }, why: "barriers are opt-in" },
  dayLength: { world: { dayNightCycle: true }, why: "the day/night cycle is opt-in" },
  nightVisionFactor: { world: { dayNightCycle: true }, why: "the day/night cycle is opt-in" },
  signalRadius: { world: { signalling: true }, why: "signalling is opt-in" },
  signalCost: { world: { signalling: true }, why: "signalling is opt-in" },
  learnRate: { world: { plasticity: true }, why: "plasticity is opt-in" },
  learnDecay: { world: { plasticity: true }, why: "plasticity is opt-in" },
  neatWeightRate: { world: { evolvableTopology: true }, why: "evolvable topology is opt-in" },
  neatWeightStrength: { world: { evolvableTopology: true }, why: "evolvable topology is opt-in" },
  mateRadius: { world: { sexualReproduction: true }, why: "sexual reproduction is opt-in" },

  // Disease is opt-in *and* slow: the first case walks into the pond at tick
  // 901 (`diseaseReintroduce`), so nothing about it can be measured before then.
  infectionRadius: { world: { disease: true }, ticks: 1200, why: "disease is opt-in; patient zero arrives at tick 901" },
  infectionChance: { world: { disease: true }, ticks: 1200, why: "disease is opt-in; patient zero arrives at tick 901" },
  diseaseMetabolicCost: { world: { disease: true }, ticks: 1200, why: "disease is opt-in; patient zero arrives at tick 901" },
  diseaseReintroduce: { world: { disease: true }, ticks: 1200, why: "disease is opt-in; patient zero arrives at tick 901" },
  // Lengthening the illness cannot show before the shortened arm recovers, so
  // this one is shortened instead: 901 + 90 rather than 901 + 493.
  diseaseDuration: {
    world: { disease: true },
    to: 90,
    ticks: 1200,
    why: "shortened rather than lengthened: a longer illness shows only after the shorter one has ended",
  },

  // --- Constants that are only reachable somewhere unusual. ---
  populationMax: {
    to: 60,
    ticks: 700,
    why:
      "lowered, not raised: the default pond peaks far below 650, so raising the cap is a no-op — " +
      "the same shape as energyMax, which v1.29 found does nothing until this cap binds",
  },
  reseedCount: {
    world: { foodStart: 0, foodSpawnRate: 0, reseedFloor: 0, populationStart: 6, maxAge: 200 },
    to: 40,
    ticks: 400,
    why:
      "only read when the world is *completely* empty. A pond with no food at all, no trickle-rescue " +
      "floor and a short life empties itself at tick 200; the default pond never does",
  },
  reseedFloor: {
    to: 400,
    why: "raised until it binds: the default pond stays far above 5, so the trickle-rescue never fires",
  },
  weightClamp: {
    world: { plasticity: true },
    to: 0.05,
    why:
      "a bound that never binds. Learned weights do not come near ±8, so raising it is a no-op and " +
      "only tightening it to 0.05 proves the clamp is applied at all — the second energyMax",
  },
  neatAddConn: {
    world: { evolvableTopology: true },
    to: 0.9,
    why:
      "moved rather than nudged: +37% only changes outcomes for draws landing in a 2.6-point window, " +
      "which 1,200 ticks of a young NEAT world never sampled",
  },
  neatAddNode: {
    world: { evolvableTopology: true },
    to: 0.9,
    why: "moved rather than nudged, for the same reason as neatAddConn",
  },
  kinRecognitionDistance: {
    world: { kinRecognition: true, seed: 23 },
    ticks: 5200,
    why:
      "the one constant with no reach in the default pond at all: on seed 314 even ten times the " +
      "default threshold changes nothing in 9,000 ticks, because no predator ever meets a close " +
      "relative there (v1.36 found the same of the flag). Seed 23 is the world where kin meet",
  },

  // --- Levers on the picture, not on the world. ---
  foodRadius: {
    channel: "draw",
    why:
      "a drawing radius, and now only that: the size of a food mote and (×1.15–1.87, by how much " +
      "meat is left) of a corpse. It set a scavenger's reach as well until v1.40 split `scavengeRadius` out, which " +
      "is why the v1.38 sweep recorded it as a simulation constant with an unusual world",
  },

  // --- Levers on the view, not on the world. ---
  speciationDistance: {
    channel: "observer",
    to: 0.05,
    why:
      "pure observation by design. It is also nearly out of road upwards: the default pond records " +
      "five speciation events in 6,000 ticks at 0.15 and *zero* at 0.20, so the sweep lowers it",
  },
  neatCompatThreshold: {
    channel: "observer",
    world: { evolvableTopology: true },
    to: 2.0,
    why: "speciationDistance's counterpart for NEAT genomes — same channel, opt-in world",
  },
  phylogenySampleInterval: { channel: "observer", why: "how often the tree is sampled; the pond never sees it" },
  phylogenyHistory: {
    channel: "observer",
    to: 40,
    why: "the resolution of the abundance record; a smaller one halves itself sooner",
  },

  // --- Not the simulation's business at all. ---
  stepsPerFrame: {
    channel: "ui",
    to: 4,
    why:
      "read by the animation loop in main.js, never by World.step. Its claim is the negative one: " +
      "how often a caller steps the world is not a property of the world. Note that this sweep " +
      "passed for eleven releases for the wrong reason — until v1.71 `main.js` kept its own " +
      "`let speed = 1` and read this constant *nowhere*, so the negative held because nothing " +
      "consulted it at all. `src/dimensions.js` found that by asking which module reads which key",
  },
};

/** Every numeric key in the config, in declaration order. */
export function numericKeys() {
  return Object.keys(DEFAULT_CONFIG).filter((k) => typeof DEFAULT_CONFIG[k] === "number");
}

/**
 * The full specification for one constant: what it is moved to, in what world,
 * for how long, and which channel it is expected to move. Any key with no entry
 * in `SPECIAL` gets the plain treatment — nudge it in the default pond — which
 * is deliberately the default so a constant added in a later release is swept
 * the day it lands, and says so out loud if it needs a world of its own.
 */
export function leverSpec(key) {
  const s = SPECIAL[key] || {};
  return {
    key,
    channel: s.channel || "world",
    world: s.world || {},
    from: DEFAULT_CONFIG[key],
    to: s.to !== undefined ? s.to : perturb(DEFAULT_CONFIG[key]),
    ticks: s.ticks || DEFAULT_BUDGET,
    why: s.why || null,
  };
}

/**
 * Run one constant's two worlds side by side and report the first tick at which
 * each channel disagrees, or -1 for a channel that never did.
 *
 * The world channel short-circuits, because "it is a lever" is settled the
 * moment it moves. The observer and draw channels cannot: half of each claim is
 * that the *state* never moved, and that is only earned by running the whole
 * budget.
 *
 * The picture is only fingerprinted for a constant that claims that channel, and
 * only until it moves — drawing a frame costs a few thousand recorded operations
 * per world, so a `draw` constant that turned out to be dead would pay for its
 * own diagnosis by drawing the whole budget. That is the right way round.
 *
 * @param {string} key
 * @returns {{key: string, channel: string, from: number, to: number, ticks: number, worldAt: number, observerAt: number, drawAt: number}}
 */
export function sweepLever(key) {
  const spec = leverSpec(key);
  const base = { seed: 314, ...spec.world };
  const controlCfg = makeConfig(base);
  const movedCfg = makeConfig({ ...base, [key]: spec.to });
  const control = new World(controlCfg);
  const moved = new World(movedCfg);

  let worldAt = -1;
  let observerAt = -1;
  let drawAt = -1;
  const needsFullRun = spec.channel !== "world";
  const needsDraw = spec.channel === "draw";
  for (let i = 0; i < spec.ticks; i++) {
    control.step();
    moved.step();
    const t = i + 1;
    if (worldAt < 0 && stateFingerprint(moved) !== stateFingerprint(control)) worldAt = t;
    if (observerAt < 0 && observationFingerprint(moved) !== observationFingerprint(control)) observerAt = t;
    if (needsDraw && drawAt < 0 && renderFingerprint(moved, movedCfg) !== renderFingerprint(control, controlCfg)) {
      drawAt = t;
    }
    if (!needsFullRun && worldAt > 0) break;
  }
  return { ...spec, worldAt, observerAt, drawAt };
}

/** Sweep every numeric constant (or a named subset). */
export function sweepLevers(keys = numericKeys()) {
  return keys.map((k) => sweepLever(k));
}
