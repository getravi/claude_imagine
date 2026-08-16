// bars.js — the mortality bar and the energy bar, as data.
//
// v1.97 carved the stat tiles out of `main.js` into `src/hud.js` and left one
// sentence behind: *the two other panels are still in `main.js`,
// same shape, smaller, and they ship hand-typed text of their own that nothing
// has checked for reachability.* These are those two panels. A row is an `id`
// on the page, a `kind` saying which of the three things a bar writes to that
// element (its text, its width, its accessible name), and a `read` that turns a
// world into the string. `main.js` keeps one loop over the table and nothing
// else, exactly as it does for the tiles.
//
// **What the carve found is not the same as what v1.97 found, and the
// difference is the release.** A tile is written on every frame, so its shipped
// text is a *still* — wrong or right, it lasts one frame. These two panels have
// an empty state, and the empty state was not written by anything: both
// updaters returned early when there was no subject, so the markup's text was
// not a placeholder at all, it was the live readout for as long as the state
// lasted. Two consequences, and the second is a bug rather than an infelicity:
//
//   1. Three of those strings were owned by `app/index.html` alone. The
//      formatter could not produce them and nothing could check them — which is
//      the playbook's oldest lesson (anything defaulted needs an owner, and the
//      owner has to be provably alive) arriving on a readout instead of on the
//      front door's `opacity: 0`.
//   2. **An early return leaves the previous pond's numbers on screen.** Press a
//      scenario chip and `world` is replaced, but the death mix, its caption,
//      its window count, the cost and size lines and the three segment widths
//      all keep the *old* world's values until the new pond's first death —
//      17 to 598 ticks depending on the scenario, 244 on the default seed, so
//      between a third of a second and ten seconds of a bar that looks live and
//      is a photograph of a world that no longer exists. That is v1.23's Ground
//      readout exactly ("zero out the cheap case unconditionally and throttle
//      only the expensive one"), eleven releases after the lesson was written
//      down, in the panel directly below the one it was written about.
//
// So every row here returns a string in every state. There is no early return
// in this file and there is nothing for one to skip: a bar with no deaths in it
// says so, in the code, where `test/bars.test.js` can read it.

import { wholePercents, deathCosts, deathSizes } from "./stats.js";
import { ENERGY_SINKS } from "./energy.js";

/**
 * The three ways out of this world, paired with the word the caption uses, in
 * the order the bar lays them out. Named rather than indexed so the words and
 * the causes cannot drift apart — the rule `hud.js` applies to a gate.
 */
const CAUSES = Object.freeze([
  ["starvation", "starved"],
  ["age", "aged"],
  ["predation", "hunted"],
]);

/** The word each bar says when it has no subject yet, on both of its surfaces. */
export const EMPTY = Object.freeze({
  // Two registers for one state, deliberately: the caption is read beside a bar
  // that is visibly empty, and the accessible name has to carry the bar too.
  mortalityLegend: "Nothing has died yet.",
  mortalityAria: "No deaths recorded yet.",
  // The window count is a caption on the heading rather than a reading, so with
  // nothing counted it names the window instead of measuring it.
  mortalityWindow: "rolling window",
  energy: "Nothing has been eaten yet.",
});

/**
 * The death mix as three whole percentages that sum to 100, plus the size of
 * the window they were taken over — or null while nothing has died.
 * @param {import("./world.js").World} world
 */
function deathMix(world) {
  const m = world.stats.mortality();
  if (!m) return null;
  // Bar and caption are drawn from the same integers, so the widths on screen
  // are exactly the numbers underneath them (v1.26).
  return { n: m.n, pct: wholePercents(CAUSES.map(([cause]) => m.shares[cause])) };
}

/**
 * The three energy sinks as whole percentages that sum to 100, or null while
 * nothing has been spent. Matters more here than anywhere else on the panel:
 * one segment is normally around 90% and the eye has nothing else to check the
 * arithmetic against.
 * @param {import("./world.js").World} world
 */
function spendMix(world) {
  const shares = world.energy.shares();
  if (!shares) return null;
  return { pct: wholePercents(ENERGY_SINKS.map((k) => shares[k])) };
}

/** Two decimals with an explicit sign, so the near-zero columns read as near-zero. */
function signed(v) {
  // `-0.00` is a true statement about a rounded number and reads as a bug, so
  // the sign comes from the rounded value rather than from the raw one.
  const r = Math.round(v * 100) / 100;
  return `${r < 0 ? "−" : "+"}${Math.abs(r).toFixed(2)}`;
}

/** A caption turned into a sentence for the accessible name. */
const spoken = (text) => text.replace(/ · /g, ", ");

/**
 * Every row of both bars, in the order the page lays them out.
 *
 * `kind` is what the adapter does with the string: `"text"` sets
 * `textContent`, `"width"` sets `style.width`, `"aria"` sets `aria-label`. It
 * is a field rather than three separate tables so that the audit walks the same
 * list the panel writes — the same reason `hud.js` makes its gate a field.
 *
 * @type {Array<{id: string, bar: "mortality"|"energy", kind: "text"|"width"|"aria", read: (world: import("./world.js").World) => string}>}
 */
export const BARS = [
  // ---- What they die of ----
  {
    id: "mort-window",
    bar: "mortality",
    kind: "text",
    read: (world) => {
      const mix = deathMix(world);
      return mix ? `last ${mix.n}` : EMPTY.mortalityWindow;
    },
  },
  {
    id: "mort-bar",
    bar: "mortality",
    kind: "aria",
    read: (world) => {
      const mix = deathMix(world);
      if (!mix) return EMPTY.mortalityAria;
      return `Of the last ${mix.n} deaths, ${spoken(mortalityCaption(mix))}.`;
    },
  },
  ...CAUSES.map(([cause], i) => ({
    id: `mort-${{ starvation: "starve", age: "age", predation: "pred" }[cause]}`,
    bar: /** @type {const} */ ("mortality"),
    kind: /** @type {const} */ ("width"),
    read: (/** @type {import("./world.js").World} */ world) => {
      const mix = deathMix(world);
      return `${mix ? mix.pct[i] : 0}%`;
    },
  })),
  {
    id: "mort-legend",
    bar: "mortality",
    kind: "text",
    read: (world) => {
      const mix = deathMix(world);
      return mix ? mortalityCaption(mix) : EMPTY.mortalityLegend;
    },
  },
  // What each of those deaths costs, which the bar above cannot say and the
  // energy bar below it cannot either. Run-to-date rather than over the death
  // window, because this is a per-body figure and not a mix: it is what one
  // death of each kind takes out of the pond, and averaging it over more bodies
  // makes it truer rather than staler. Old age is normally two to three
  // thousand times the other two — see docs/SCIENCE.md.
  {
    id: "mort-cost",
    bar: "mortality",
    kind: "text",
    read: (world) => {
      const cost = deathCosts(world.stats.deathsBy, world.energy.buriedBy);
      if (!cost) return "";
      // Whole units: the interesting thing about the first and third is that
      // they round to nothing.
      const per = (c) => Math.round(cost.causes[c].perDeath);
      return `buried with each: ${CAUSES.map(([c, word]) => `${per(c)}⚡ ${word}`).join(" · ")}`;
    },
  },
  // And what size of body each cause takes, measured against the pond standing
  // at the instant it took it. Run-to-date for the same reason the costs are.
  // Signed, and the sign is the whole point — two of these three are the
  // control (see docs/SCIENCE.md), and a watcher who reads −0.02, +0.02, −1.81
  // has the finding without any prose.
  {
    id: "mort-size",
    bar: "mortality",
    kind: "text",
    read: (world) => {
      const s = world.stats;
      const size = deathSizes(s.sizedBy, s.radiusSumBy, s.poolSumBy);
      if (!size) return "";
      // Only causes that have actually happened, unlike the costs: a delta is a
      // comparison and 0.00 out of nothing invites being read as "no selection"
      // rather than as "no deaths". A cause with an empty column simply waits.
      const parts = CAUSES.filter(([cause]) => size.causes[cause].n > 0).map(
        ([cause, word]) => `${signed(size.causes[cause].delta)} ${word}`
      );
      return parts.length ? `size vs the pond (px): ${parts.join(" · ")}` : "";
    },
  },

  // ---- Where the energy goes ----
  // How much this pond has ever minted. Unlike everything else on these two
  // bars there is no empty state to report: a world has a founding stock before
  // its first tick, so this reads a number from the instant the page boots —
  // which is why the markup shipped the only string in either panel that was
  // simply wrong rather than merely unowned.
  {
    id: "nrg-made",
    bar: "energy",
    kind: "text",
    read: (world) => `${Math.round(world.energy.created).toLocaleString()} minted`,
  },
  {
    id: "nrg-bar",
    bar: "energy",
    kind: "aria",
    read: (world) => {
      const mix = spendMix(world);
      if (!mix) return EMPTY.energy;
      return `Of all the energy this world has spent: ${spoken(energyCaption(mix))}.`;
    },
  },
  ...ENERGY_SINKS.map((sink, i) => ({
    id: `nrg-${sink}`,
    bar: /** @type {const} */ ("energy"),
    kind: /** @type {const} */ ("width"),
    read: (/** @type {import("./world.js").World} */ world) => {
      const mix = spendMix(world);
      return `${mix ? mix.pct[i] : 0}%`;
    },
  })),
  {
    id: "nrg-legend",
    bar: "energy",
    kind: "text",
    read: (world) => {
      const mix = spendMix(world);
      return mix ? energyCaption(mix) : EMPTY.energy;
    },
  },
];

/** @param {{pct: number[]}} mix */
function mortalityCaption(mix) {
  return CAUSES.map(([, word], i) => `${mix.pct[i]}% ${word}`).join(" · ");
}

/** @param {{pct: number[]}} mix */
function energyCaption(mix) {
  const [burned, lost, buried] = mix.pct;
  return `${burned}% burned living · ${lost}% lost · ${buried}% buried`;
}

/**
 * Every row's id, kind and the string it should be showing, for one instant of
 * one world. Pure and read-only: it never touches the simulation, and unlike
 * the tiles it never draws either, so the pond cannot notice being read.
 *
 * @param {import("./world.js").World} world
 * @returns {Array<{id: string, kind: string, text: string}>}
 */
export function barRows(world) {
  return BARS.map(({ id, kind, read }) => ({ id, kind, text: read(world) }));
}
