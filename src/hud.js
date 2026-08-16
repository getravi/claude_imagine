// hud.js — the twenty-nine stat tiles at the top of the panel, as data.
//
// These lines lived in `main.js` from v1.0 until v1.97, which is to say
// they lived in the one module `node --test` cannot open. Every other figure on
// this page has been carved out for exactly that reason — the chart in v1.41,
// the Muller plot in v1.42, the voice in v1.31, the pointer in v1.28 — and each
// carve-out was followed within a release by a finding, because a surface the
// suite cannot reach is a surface nobody has swept. The tiles were the largest
// thing left.
//
// What a tile is, stated because the shape is the whole of the design: an `id`
// on the page, an optional `gate` of config flags that all have to be true for
// the tile to have a subject at all, the word it shows when they are not, and a
// `read` that turns the world into a string. The gate is a *field* rather than
// an `if` inside the reader so that the audit and the panel cannot come to
// different views about when a rule is switched off — the same rule
// `test/colourliterals.test.js` applies to a colour and `src/reach.js` to a
// distance.
//
// The blank word is `off` everywhere but Brain, where the alternative to an
// evolving topology is not the absence of a brain but a fixed one. A tile whose
// rule is off says a word rather than a number for the reason v1.89 wrote down
// and v1.96 restated: a formatted zero in the place where a real quantity would
// go is three true symbols arranged into a falsehood. The exception is Biome,
// whose statistic stays live with `foodPatches` off and is blanked anyway —
// see its own note below, which is the only place in this file where the gate
// is a judgement rather than an arithmetic fact.

import { EnergyLedger } from "./energy.js";
import { webProfile } from "./foodweb.js";
import { refugeRadius } from "./refuge.js";
import { readable } from "./seasonlag.js";

/**
 * The seed of the UI's own random stream. Exported because the Diversity tile
 * samples, so "what does this panel say about a fresh world?" has an answer
 * only if the stream is named — and the page's own opening values are audited
 * against exactly that question (`test/hud.test.js`).
 */
export const UI_RNG_SEED = 12345;

/**
 * @typedef {object} TileContext
 * @property {import("./world.js").World} world
 * @property {object} config the live config, which the panel may have nudged
 * @property {number} fps the smoothed frame rate, which only `main.js` knows
 * @property {import("./rng.js").RNG} uiRng the UI's own stream (never the pond's)
 */

/**
 * A whole-number percentage that refuses to round a real quantity down to zero.
 *
 * Character for character `describe.js`'s `percent`, which has said `<1%` since
 * v1.31 for the reason v1.89's Safe tile then wrote down: a hunter that reaches
 * one body in four hundred reaches 0.25% of the pond, and printing that as `0%`
 * is three true symbols arranged into a falsehood. Zero stays `0%` — there the
 * symbol and the fact agree.
 *
 * The same rendering in both places on purpose. v1.67's and v1.79's question is
 * whether the listener and the reader are being told the same thing, and this
 * tile and that sentence are the same statistic on two surfaces; a tile that
 * floored at 1% while the voice said `<1%` would be two answers to one question
 * (`docs/AUTONOMOUS.md` — the empty state with two registers).
 */
const share = (v) => {
  const p = Math.round(v * 100);
  return `${p === 0 && v > 0 ? "<1" : p}%`;
};

/**
 * Every tile, in the order the page lays them out.
 *
 * @type {Array<{id: string, gate?: string[], blank?: string, read: (c: TileContext) => string}>}
 */
export const TILES = [
  { id: "stat-pop", read: ({ world }) => `${world.creatures.length}` },
  { id: "stat-food", read: ({ world }) => `${world.food.items.length}` },
  { id: "stat-gen", read: ({ world }) => `${world.stats.currentMaxGeneration}` },
  // The diversity proxy is the one tile that costs a random draw. It samples
  // pairs, so it needs a stream — and it takes the UI's, never the pond's,
  // because a readout that consumed the world's RNG would make watching the
  // pond change it (v1.33's rule, and directive 2 of the playbook).
  { id: "stat-div", read: ({ world, uiRng }) => world.stats.diversity(world, uiRng).toFixed(3) },
  // Carnivores: count and share of the population.
  {
    id: "stat-carn",
    read: ({ world }) => {
      const pop = world.creatures.length;
      const carn = world.stats.carnivoreCount || 0;
      return `${carn} (${pop > 0 ? Math.round((carn / pop) * 100) : 0}%)`;
    },
  },
  { id: "stat-kills", read: ({ world }) => world.stats.kills.toLocaleString() },
  // The refuge: what share of the pond is at or above the size nothing here can
  // eat, and where that line is. Both halves are needed — the percentage is the
  // news and the threshold is what makes it a fact rather than a mood — and the
  // threshold is a config quotient, so it is printed rather than hard-coded.
  // "off" without predation: the same bodies are the same size, but a refuge
  // from nobody is arithmetic and not a readout.
  {
    id: "stat-refuge",
    gate: ["predation"],
    read: ({ world, config }) =>
      `${Math.round(world.stats.refugeShare * 100)}% ≥${refugeRadius(config).toFixed(1)}px`,
  },
  // And the same reading taken from the pond rather than from `config.js`: the
  // line the largest hunter *alive* sets, and what is beyond it. The tile above
  // quotes a hunter at `bodyRadiusMax`, which most ponds never grow — so these
  // two disagree by an average of 43 points of the population, and a pond whose
  // Refuge reads 0% can have all of itself standing outside the reach of every
  // animal in the water.
  //
  // A word rather than a number when nothing hunts, because "100% ≥0.0px" is
  // three true symbols arranged into a lie: there is no line, and the reason
  // there is none is the reading. Gated on `predation` like the tile above it.
  {
    id: "stat-safe",
    gate: ["predation"],
    read: ({ world }) => {
      const s = world.stats;
      if (s.hunterCeiling === 0) return "all — no hunter";
      return `${Math.round(s.livedRefugeShare * 100)}% ≥${s.livedRefugeRadius.toFixed(1)}px`;
    },
  },
  // And the same question asked of every hunter at once rather than of the
  // biggest one. The two tiles above count the pond against a single line — the
  // one `config.js` permits, and the one the largest living carnivore sets — and
  // v1.65 left the rest of it written down: the eligible set is a different size
  // for every hunter, and the *spread* of those sizes is what says whether this
  // pond has an apex animal or a graded web. Wide apart (37% against 0.4% on
  // seed 128) is one animal eating a world nobody else can reach; close together
  // (25% against 21% on seed 7) is a web everybody is inside of.
  //
  // No separator between the two halves, which is the Kin tile's convention one
  // row down and is wrong here: this column is 72 px, a `·` is a token of its
  // own, and it wraps onto a line by itself — 57 px of tile against 38 for the
  // same two readings without it. Measured in a browser, like the token width
  // that shaped the Kin tile, because a panel is a layout and this suite cannot
  // lay one out.
  //
  // Two words rather than a number in the two empty cases, and they are
  // different empty cases, which is the reason this tile has both: `none hunt`
  // is a pond with no diet gene over the threshold, and `none reach` is a pond
  // full of carnivores with nothing small enough to eat. The Safe tile above
  // cannot tell them apart — it is drawn against the biggest gene-carrier
  // whether or not that animal can eat anybody — and the default seed ends its
  // run in the second state (docs/SCIENCE.md).
  {
    id: "stat-web",
    gate: ["predation"],
    read: ({ world, config }) => {
      const web = webProfile(world.creatures, config);
      if (web.hunters === 0) return web.carnivores === 0 ? "none hunt" : "none reach";
      return `${share(web.top)} top ${share(web.mid)} mid`;
    },
  },
  // Kin recognition: meals declined for being family — the run's total, and how
  // fast they are being declined now. Both halves, unlike the two other counters
  // of a rule's work (Walled, Jostled), which show a rate alone: those describe
  // rules that fire constantly from the first tick, and this one is
  // *ecologically conditional*. A pond can run twenty thousand ticks with the
  // flag on and never once offer a hunter a relative it could have eaten
  // (docs/SCIENCE.md), so "has this rule ever spoken here?" and "is it speaking
  // now?" are different questions and a rate answers only the second. A total of
  // 0 is this tile's most interesting reading.
  //
  // Gated on `predation` as well as on its own flag, which the counter behind it
  // is not: the rule still steers what a carnivore chases in a pond where
  // nothing may bite, but a *declined meal* in a world where no meal is ever
  // taken is arithmetic rather than news — the Refuge tile's rule, one row up.
  //
  // Two tokens with a separator rather than `total (rate/100t)`: these tiles are
  // an 80-pixel column and they wrap, so a value's longest *unbreakable* token
  // is what has to fit. `(0.0/100t)` is one such token, 96 px wide, and it hung
  // 8 px outside the panel — measured in a browser, because until this release
  // `main.js` was the one module `node --test` could not open.
  {
    id: "stat-kin",
    gate: ["kinRecognition", "predation"],
    read: ({ world }) =>
      `${world.stats.kinSpared.toLocaleString()} · ${world.stats.kinSparedRate.toFixed(0)}/100t`,
  },
  // Contagion: the live sick / immune split (both "off" without a pathogen).
  {
    id: "stat-sick",
    gate: ["disease"],
    read: ({ world }) => {
      const pop = world.creatures.length;
      const n = world.stats.infectedCount;
      return `${n} (${pop > 0 ? Math.round((n / pop) * 100) : 0}%)`;
    },
  },
  { id: "stat-immune", gate: ["disease"], read: ({ world }) => `${world.stats.immuneCount}` },
  // How much of the water is inside catching distance of somebody sick — the
  // number the blue field in the pond and the minimap draws. Zero on its own
  // whenever nobody is ill, which is every world with no pathogen in it.
  {
    id: "stat-reach",
    gate: ["disease"],
    read: ({ world }) => `${Math.round(world.stats.hazardShare * 100)}%`,
  },
  { id: "stat-learn", gate: ["plasticity"], read: ({ world }) => world.stats.avgLearning.toFixed(3) },
  // Traffic on the signalling channel: how strong a call the average creature is
  // hearing right now. "off" where nobody can hear at all.
  { id: "stat-heard", gate: ["signalling"], read: ({ world }) => world.stats.avgHeard.toFixed(2) },
  // Terrain: how much smoother the ground under the living is than the
  // landscape as a whole. Negative — shown as a "flatter by" percentage — means
  // the pond has genuinely drifted into its basins rather than spreading evenly
  // over ground it cannot perceive. Reads exactly 0 without terrain, so it is
  // shown as "off" rather than as a suspiciously steady zero.
  {
    id: "stat-ground",
    gate: ["terrain"],
    read: ({ world }) => {
      const b = world.stats.groundBias;
      return `${b <= 0 ? "−" : "+"}${Math.abs(Math.round(b * 100))}%`;
    },
  },
  // Biomes: how much more fertile the ground under the living is than this
  // pond's own average. The fertility field has decided where food falls since
  // v1.3 and no number on this page had ever described it — the tile beside
  // this one measures the pond against the *terrain*, and until v1.68 there was
  // no equivalent for the thing that actually moves the crop.
  //
  // "off" without `foodPatches`, and the number behind it stays live there: a
  // field the spawner never consults is a landscape nothing is standing in
  // *because of*, so the tile is the wrong place for its noise — and the noise
  // is what it reads (+0.000 over twelve seeds, against +0.089 with the patches
  // on), which is the measurement that makes the blank honest rather than a
  // mask. Same shape as the Refuge tile, which is a real number in a pond with
  // nobody hunting and says "off" anyway.
  {
    id: "stat-biome",
    gate: ["foodPatches"],
    read: ({ world }) => {
      const b = world.stats.patchBias;
      return `${b < 0 ? "−" : "+"}${Math.abs(Math.round(b * 100))}%`;
    },
  },
  // Barriers: how often the rock is refusing a move, per hundred ticks over the
  // trailing window. The walls are visible and the detours are not, so this is
  // the number that says what the layout is actually costing — and it is a rate
  // rather than the run's total, which would stop moving by tick 3,000. Reads
  // exactly 0 with no walls in the pond, so it says "off" instead.
  { id: "stat-walled", gate: ["barriers"], read: ({ world }) => `${world.stats.walledRate.toFixed(1)}/100t` },
  // Solid bodies: how many pairs the pond is pushing apart, per hundred ticks
  // over the same window. This is the only readout of a rule that is almost
  // invisible — two creatures that cannot overlap look very like two that can —
  // and it is a rate for the same reason `walled` is: a run's total stops
  // moving. Exactly 0 in a pond where bodies pass through each other.
  // The mode is on the tile because nothing else on the page could carry it:
  // `massWeightedShove` changes *who* gives up the ground and leaves the pair
  // count, the picture and the population where they were, so a watcher with
  // only a rate in front of them cannot tell the two rules apart (v1.13).
  {
    id: "stat-jostled",
    gate: ["bodyCollision"],
    read: ({ world, config }) =>
      `${world.stats.jostledRate.toFixed(0)}/100t${config.massWeightedShove ? " ⚖" : ""}`,
  },
  // Detritus: what share of the crop is currently growing out of the pond's own
  // dead, averaged over the last few hundred ticks. Exactly 0 without a nutrient
  // field, so it says "off" rather than showing a steady, plausible zero.
  { id: "stat-soil", gate: ["detritus"], read: ({ world }) => `${Math.round(world.stats.soilShare * 100)}%` },
  // How far the pond is running behind its own year. Three states, and the
  // middle one is the point: "off" in a world with no seasons, "…" while the
  // record is still shorter than the three years the estimate needs (which is
  // tick 10,400 — measured, see docs/SCIENCE.md), and the lag once there is
  // one. A number here before the record can support it would be v1.22's
  // always-full buffer with a clock on it, so the wait is stated rather than
  // filled in.
  //
  // The bar between a reading and a shrug is `readable()`, in the module, so
  // this tile and the spoken description cannot come to different views about
  // whether the pond is keeping time.
  {
    id: "stat-lag",
    gate: ["seasons"],
    read: ({ world }) => {
      const lag = readable(world.stats.seasonLag);
      if (!lag) return "…";
      return `${Math.abs(Math.round(lag.lag)).toLocaleString()}t ${lag.lag < 0 ? "ahead" : "behind"}`;
    },
  },
  {
    id: "stat-brain",
    gate: ["evolvableTopology"],
    blank: "fixed",
    read: ({ world }) => `${world.stats.avgConns.toFixed(0)}c ${world.stats.avgHidden.toFixed(1)}h`,
  },
  { id: "stat-births", read: ({ world }) => world.stats.births.toLocaleString() },
  { id: "stat-deaths", read: ({ world }) => world.stats.deaths.toLocaleString() },
  // Mean lifespan over the rolling death window, or an em dash while nothing has
  // died yet — the same "no subject, so a mark rather than a number" move the
  // Safe tile makes, and the oldest instance of it on this panel.
  {
    id: "stat-life",
    read: ({ world }) => {
      const m = world.stats.mortality();
      return m ? Math.round(m.meanLifespan).toLocaleString() : "—";
    },
  },
  // The two energy tiles. Neither is gated: there is no config flag for the
  // books, so unlike Ground or Soil there is no "off" state to report.
  //
  // Standing is how much energy is in this pond right now — every living body
  // plus every corpse — and it is worth reading beside the `minted` figure on
  // the energy bar below (`src/bars.js`): the stock is a rounding error beside
  // the throughput, because this world does not store its energy, it runs it
  // straight through. Power is the only number on either panel that moves:
  // energy minted per tick over the last 120 ticks, differenced out of the
  // cumulative books the history carries. Everything else is run-to-date and
  // therefore settles into a number that cannot change, which is v1.22's
  // complaint about readouts that look live and are not. On the default seed
  // power runs between about 5 and 78 over a single run.
  { id: "stat-standing", read: ({ world }) => Math.round(EnergyLedger.standing(world)).toLocaleString() },
  { id: "stat-power", read: ({ world }) => `${world.stats.power.toFixed(1)}/t` },
  { id: "stat-tick", read: ({ world }) => world.tick.toLocaleString() },
  // The only tile whose subject is the machine rather than the pond, which is
  // why it is the only one whose value cannot be derived from a world.
  { id: "stat-fps", read: ({ fps }) => `${Math.round(fps)}` },
];

/** The word a gated tile shows when its rule is switched off. */
export const blankOf = (tile) => tile.blank ?? "off";

/** True when every flag this tile's subject depends on is set. */
export const isLive = (tile, config) => !tile.gate || tile.gate.every((flag) => config[flag]);

/**
 * Every tile's id and the text it should be showing, for one instant of one
 * world. Reads the world and draws from `uiRng` alone; the pond is untouched.
 *
 * @param {TileContext} ctx
 * @returns {Array<{id: string, text: string}>}
 */
export function hudTiles(ctx) {
  return TILES.map((tile) => ({
    id: tile.id,
    text: isLive(tile, ctx.config) ? tile.read(ctx) : blankOf(tile),
  }));
}
