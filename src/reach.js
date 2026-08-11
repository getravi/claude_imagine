// reach.js — how far the 3x3 block actually reaches, and which rules ask for
// more than that.
//
// Four places in this repository state the reach of a `forEachNear` query as
// *one cell*:
//
//   * `grid.js`'s own header — "the 3x3 block covers a disc of `cellSize`
//     around the query point, and no more";
//   * `config.js` beside `exactVision` — "covers a guaranteed 126 px (one cell)
//     of the configured 168";
//   * `config.js` beside `signalRadius` — "kept under the spatial grid's cell
//     size ... so the existing 3x3 neighbour query already covers everything in
//     earshot";
//   * `world.js` above the sense radii — "contact tests elsewhere (eating at
//     8px, biting, infection at 22px) are far inside one cell, so the plain 3x3
//     block covers them exactly".
//
// The guarantee is not one cell. `cellSize` rarely divides the world, so the
// last column and row are stubs, and the distance the block is *guaranteed* to
// cover is the width of the narrowest neighbouring cell — 18 px in the default
// pond, against a cell of 126. A factor of seven, in the direction that costs
// something.
//
// v1.32 knew this for *sight*: `docs/SCIENCE.md` names the 18-px stub, measures
// the mean share of the vision disc a creature actually searches at 90.0% and
// the worst standing spot at 51.1%, and draws the dark band down one edge of
// the world. The comment beside the flag says 96% and 86%, which are neither of
// those numbers — the correction never reached the file a person changing the
// constant would read. That is v1.30's lesson (a rule has surfaces too) with
// the surfaces being two files in the same commit.
//
// What nobody has asked in the forty-three releases since is the same question
// about the **contact** rules, which is where a coverage hole is not a blurred
// sense but a rule that silently does not fire. This module asks it. There are
// four rules riding the block, and against a guarantee of 18 px they read:
//
//   | rule      | reach   | margin |
//   | eating    | 11.2 px | +6.8   |
//   | scavenging| 17.0 px | +1.0   |
//   | biting    | 18.0 px | +0.0   |
//   | infection | 22.0 px | −4.0   |
//
// Three hold and one does not, and the third holds by exactly nothing: a bite
// reaches `bodyRadiusMax * 2 + 2`, which is 18.0 because `bodyRadiusMax` is 8.0
// and the stub is 18 px, and those two numbers have never been in the same
// sentence before this one.
//
// The one that fails is infection, and it fails in a way `exactVision` cannot
// reach: eating, scavenging and biting all take their candidate from the sense
// scan, so switching that flag on moves them onto a disc query that covers
// them. `_stepDisease` calls `forEachNear` directly — it is the only rule in
// the pond with a neighbour query of its own — so it is block-shaped in every
// world there is. Measured over eight seeds of 3,000 ticks with contagion on,
// **7 of 26,555 susceptible contacts are lost** — one roll in 3,800, on two
// seeds of eight (see docs/SCIENCE.md). Real, and small enough that the
// measurement is what decides not to fix it this cycle. v1.56's `_separate` is
// the counter-example that shows the fix, having used `forEachWithin` from the
// day it landed on the stated grounds that what two bodies touching means
// cannot depend on a sight setting.
//
// Nothing in the simulation reads anything here, this draws no randomness, and
// it is not imported by `main.js` — like `levers.js`, `dimensions.js` and
// `workload.js` it is an instrument the suite points at the pond, not a part of
// it. Fixing the hole it finds is a separate cycle: the disease scan is inside
// the RNG's draw order, so covering the disc moves every world with contagion
// switched on, and that is a change to write down before it is a change to
// make.
//
// ---- v1.81: the list, derived — and the second thing in the way ----
//
// v1.76 left three leads and the third was that **the list of query sites above
// is hand-typed**. I read the pond, wrote down the rules I found, and audited
// those; v1.70's warning is that a classification I wrote in one afternoon is
// the one I skim. It is derived now: `scanQuerySites` reads a module's text and
// returns every neighbour query in it, `QUERY_SITES` declares the nine this
// project has, and the suite compares the two. A query added anywhere in `src/`
// is a failing test until somebody says which rules ride it.
//
// Deriving it turned up something the count did not: **the index is not the
// only thing between a rule and its candidate.** Eating, scavenging and biting
// have no query of their own — the entry above says so — and what that means is
// not only that they inherit the scan's *window*. They inherit its *answer*.
// The sweep picks a nearest pellet and a nearest prey by walking candidates
// against distances that start at `visionR2`, and the contact tests below fire
// on those selections. A creature can only bite what it has already seen.
//
// So a carried rule sits behind two constraints and this module had computed
// one of them:
//
//   * the **index**, which decides who is offered — v1.76's whole subject, 18 px;
//   * the **gate**, which decides who is chosen — `visionRadius` times whatever
//     the day/night cycle has done to it, and nothing had ever compared a
//     contact reach to a *sense* radius, because they do not look like the same
//     kind of quantity. In the default pond they are 18 and 168 and the gate has
//     never bound anything.
//
// It binds in the dark. Sight is the one radius here that shrinks — to
// `nightVisionFactor` of itself at midnight — so below a factor of 18/168 =
// 0.107 a hunter cannot bite the creature it is standing on top of, below
// 17/168 a scavenger cannot reach a corpse inside its own mouth, and below
// 11.2/168 a grazer cannot eat the pellet it is sitting on. Nothing that ships
// is near it: the darkest scenario in this project sets 0.28, and the deepest
// night it can produce still reaches 47 px against a bite's 18. The finding is
// not a bug, it is that the margin was never measured and is not made of what
// the audit thought it was made of.
//
// And it corrects a sentence in this file's own header. "Switching that flag on
// moves them onto a disc query that covers them" is true, and in the one regime
// where anything binds it changes nothing at all: the disc covers the radius
// sight asked for, and in the dark sight asks for 8.4 px. `exactVision` is a
// fix for the index. There is no flag for the gate, because the gate is not a
// mistake — it is the pond saying a predator hunts what it can see.
//
// (The coupling I expected to find here and did not: the creature scan asks for
// the widest of sight, earshot and a mate search, so a pond with voices in it
// offers candidates out to `signalRadius` = 120 px at every hour. I had a
// paragraph written about predation being carried through the night by other
// creatures' shouting. The gate throws those candidates away — prey is chosen
// against `visionR2` and nothing else — so the pond does not have the mechanism
// the arithmetic suggested. v1.20's rule, arriving before the release note this
// time rather than after it.)

import { SpatialGrid, indexCellSize } from "./grid.js";

/**
 * The world-coordinate extent of every column and every row of `grid`.
 *
 * All but the last are `cellSize`; the last is whatever is left over, which is
 * the whole subject of this module. Returned as plain arrays because the
 * arithmetic below is about *neighbours*, and a neighbour of the first column
 * is the last one.
 * @param {SpatialGrid} grid
 */
export function cellSpans(grid) {
  const cols = [];
  for (let i = 0; i < grid.cols; i++) {
    cols.push(Math.min((i + 1) * grid.cellSize, grid.width) - i * grid.cellSize);
  }
  const rows = [];
  for (let j = 0; j < grid.rows; j++) {
    rows.push(Math.min((j + 1) * grid.cellSize, grid.height) - j * grid.cellSize);
  }
  return { cols, rows };
}

/**
 * The largest disc centred on (x, y) that lies entirely inside the block a
 * `forEachNear` query from there would search.
 *
 * Read straight off `grid.nearBounds`, which is the geometry the renderer draws
 * and the grid's own account of its block — no second implementation to keep in
 * step (v1.32's accelerator rule).
 * @param {SpatialGrid} grid
 */
export function reachAt(grid, x, y) {
  const b = grid.nearBounds(x, y);
  return Math.min(-b.left, b.right, -b.top, b.bottom);
}

/**
 * One axis of the guarantee, from the list of cell extents along it.
 *
 * A query point sits `t` into a cell of width `W` whose neighbours are `wL` and
 * `wR` wide. The block reaches `t + wL` behind it and `(W − t) + wR` ahead, so
 * the disc it can promise from that spot is the smaller of the two. Worst over
 * `t`: at `t = 0` the left reach is exactly `wL`, at `t = W` the right is
 * exactly `wR`, and nowhere is it less — so the guarantee for the whole axis is
 * the **narrowest cell on it**, and it is attained rather than approached (a
 * target at exactly `wL` sits on the far edge of the neighbouring cell, which
 * the block does search). Best over `t` is where the two are equal.
 *
 * Three cells or fewer and the block is every cell on the axis: the query wraps
 * onto itself and the reach is the whole torus, whose greatest distance is half
 * the extent.
 */
function axisReach(spans, extent) {
  const n = spans.length;
  const half = extent / 2;
  if (n <= 3) return { guaranteed: half, best: half, whole: true };
  let guaranteed = Infinity;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const W = spans[i];
    const wL = spans[(i - 1 + n) % n];
    const wR = spans[(i + 1) % n];
    guaranteed = Math.min(guaranteed, wL, wR);
    const balance = Math.min(W, Math.max(0, (W + wR - wL) / 2));
    best = Math.max(best, Math.min(balance + wL, W - balance + wR));
  }
  return {
    guaranteed: Math.min(guaranteed, half),
    best: Math.min(best, half),
    whole: false,
  };
}

/**
 * What the 3x3 block promises, over every standing position in the world.
 *
 * `radius` is the honest form of the sentence four comments in this repository
 * get wrong: **every entity within `radius` is in the block, from anywhere**,
 * and for any larger distance there is somewhere in the pond it is not. `best`
 * is what the same query reaches from the luckiest spot, and the gap between
 * the two is the anisotropy v1.32 found in the pond's sight.
 * @param {SpatialGrid} grid
 */
export function blockReach(grid) {
  const { cols, rows } = cellSpans(grid);
  const x = axisReach(cols, grid.width);
  const y = axisReach(rows, grid.height);
  return {
    radius: Math.min(x.guaranteed, y.guaranteed),
    best: Math.min(x.best, y.best),
    x: x.guaranteed,
    y: y.guaranteed,
    narrowestCol: Math.min(...cols),
    narrowestRow: Math.min(...rows),
    wholeX: x.whole,
    wholeY: y.whole,
  };
}

/** The share of one axis from which a disc of `radius` overflows the block. */
function axisStranded(spans, extent, radius) {
  const n = spans.length;
  if (n <= 3) return 0;
  let stranded = 0;
  for (let i = 0; i < n; i++) {
    const W = spans[i];
    const wL = spans[(i - 1 + n) % n];
    const wR = spans[(i + 1) % n];
    // Behind: `t + wL < radius`. Ahead: `(W − t) + wR < radius`. The two ends
    // can meet in a narrow cell, so the failing length is capped at the cell.
    const behind = Math.min(W, Math.max(0, radius - wL));
    const ahead = Math.min(W, Math.max(0, radius - wR));
    stranded += Math.min(W, behind + ahead);
  }
  return stranded / extent;
}

/**
 * The share of standing positions from which the block does *not* cover a disc
 * of `radius` — the size of the hole, as a fraction of the pond.
 *
 * Positions, not pairs: a query from inside this share loses only the sliver of
 * its disc that hangs past the block, so the share of *contacts* lost is far
 * smaller again — 0.026% of susceptible contacts at `infectionRadius`, against
 * 0.889% of standing positions.
 * @param {SpatialGrid} grid
 */
export function strandedShare(grid, radius) {
  const { cols, rows } = cellSpans(grid);
  const x = axisStranded(cols, grid.width, radius);
  const y = axisStranded(rows, grid.height, radius);
  return { x, y, any: 1 - (1 - x) * (1 - y) };
}

/**
 * Every neighbour query in this project, declared: where it is, what it asks
 * of, and which rules ride it.
 *
 * The point of writing it down is that `scanQuerySites` reads the same list out
 * of the source, so this is checked rather than believed. Four fields identify
 * a site — the module, the enclosing function, the call, and the grid it is
 * made on — and none of them is a line number, because a line number is a fact
 * about an afternoon's editing rather than about the pond.
 *
 * Three kinds:
 *
 *   - `rule` — a query a rule makes for itself. Two of them: the epidemic's
 *     (block-shaped, and the hole this module found in v1.76) and the shove's
 *     (a disc, handed its own reach, which is what the other one should be).
 *   - `sense` — the three scans in the sweep. Every remaining contact rule in
 *     the pond takes its candidate from one of these rather than asking for
 *     anything itself, which is why `carries` is where the interesting entries
 *     are: a scan is answering questions that are not its own.
 *   - `dispatch` — `_scan` itself, which is both queries and no site. Listed so
 *     the census is a partition and not a filter (v1.61: a sweep that quietly
 *     drops what it cannot classify has annexed it).
 *   - `instrument` — `workload.js` counting candidates. Not in the pond; here
 *     so that adding a query to an instrument is also a change somebody has to
 *     acknowledge.
 *
 * `request` names what the site asks for, as an expression this module can
 * evaluate against a config (`siteRequest`) — `null` where the query is a block
 * and the radius is not read at all.
 */
export const QUERY_SITES = [
  {
    name: "food",
    kind: "sense",
    module: "world.js",
    fn: "step",
    call: "_scan",
    grid: "foodGrid",
    request: "sightR",
    carries: ["sight", "eat"],
  },
  {
    name: "creature",
    kind: "sense",
    module: "world.js",
    fn: "step",
    call: "_scan",
    grid: "creatureGrid",
    request: "nearbyR",
    carries: ["sight", "earshot", "mate", "bite"],
  },
  {
    name: "corpse",
    kind: "sense",
    module: "world.js",
    fn: "step",
    call: "_scan",
    grid: "corpseGrid",
    request: "sightR",
    carries: ["sight", "scavenge"],
  },
  {
    name: "infection",
    kind: "rule",
    module: "world.js",
    fn: "_stepDisease",
    call: "forEachNear",
    grid: "creatureGrid",
    request: null,
    carries: ["infect"],
  },
  {
    name: "separation",
    kind: "rule",
    module: "world.js",
    fn: "_separate",
    call: "forEachWithin",
    grid: "creatureGrid",
    request: "shove",
    carries: ["shove"],
  },
  {
    name: "scan-disc",
    kind: "dispatch",
    module: "world.js",
    fn: "_scan",
    call: "forEachWithin",
    grid: "grid",
    request: null,
    carries: [],
  },
  {
    name: "scan-block",
    kind: "dispatch",
    module: "world.js",
    fn: "_scan",
    call: "forEachNear",
    grid: "grid",
    request: null,
    carries: [],
  },
  {
    name: "load-block",
    kind: "instrument",
    module: "workload.js",
    fn: "nearLoad",
    call: "forEachNear",
    grid: "grid",
    request: null,
    carries: [],
  },
  {
    name: "load-disc",
    kind: "instrument",
    module: "workload.js",
    fn: "withinLoad",
    call: "forEachWithin",
    grid: "grid",
    request: null,
    carries: [],
  },
];

/**
 * Every neighbour query in one module's source text, read out of the text.
 *
 * A line scanner, not a parser, and its domain is worth stating exactly because
 * a sweep that does not name what it excludes has annexed it (v1.61):
 *
 *   - it sees `<grid>.forEachNear(`, `<grid>.forEachWithin(` and
 *     `this._scan(this.<grid>` — a *receiver* is required, so the definitions
 *     in `grid.js` and the dozens of prose mentions in comments across this
 *     repository are not sites and do not register;
 *   - it skips whole-line comments (`//`, ` * `) and nothing else, so a query
 *     written inside a trailing comment would be counted as real. That is the
 *     safe direction: the census fails loudly rather than quietly missing a
 *     query, which is the failure this whole module exists to be about;
 *   - it attributes a site to the nearest preceding class method or top-level
 *     function, which is how this codebase is written and is not a general
 *     truth about JavaScript;
 *   - it sees *lookups*. `regrowthRadius` (v1.18) is a distance the pond
 *     writes rather than one it reads — a seed is placed near its parent, and
 *     nothing ever asks who is nearby — so it is not a query and is not here.
 *     Neither is `nearBounds`, which is geometry the renderer and this module
 *     read; it offers no candidates.
 *
 * @param {string} source - the module's text
 * @param {string} module - its file name, carried through onto every site
 */
export function scanQuerySites(source, module) {
  const found = [];
  let fn = "(module)";
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const named =
      line.match(/^(?:export )?(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/) ||
      line.match(/^ {2}(?:static )?(?:async )?([A-Za-z_$][\w$]*)\s*\(/);
    if (named) fn = named[1];
    const text = line.trim();
    if (text.startsWith("//") || text.startsWith("*") || text.startsWith("/*")) continue;
    const direct = line.match(/(?:this\.)?([A-Za-z_$][\w$]*)\.(forEachNear|forEachWithin)\s*\(/);
    if (direct) found.push({ module, fn, call: direct[2], grid: direct[1], line: i + 1 });
    const scan = line.match(/this\._scan\(\s*this\.([A-Za-z_$][\w$]*)/);
    if (scan) found.push({ module, fn, call: "_scan", grid: scan[1], line: i + 1 });
  }
  return found;
}

/** A site's four identifying fields, as one string, for comparing two lists. */
export function siteKey(site) {
  return `${site.module} ${site.fn} ${site.call} ${site.grid}`;
}

/**
 * The narrowest radius a site ever asks for, over a whole run of this config.
 *
 * The worst case, not the typical one, because the two sense radii here are not
 * constants: sight is multiplied by the day/night cycle, which bottoms out at
 * exactly `nightVisionFactor` (a cosine that reaches −1), so a pond with the
 * cycle on spends part of every day at its floor. Earshot deliberately does not
 * shrink (`world.js`) and a mate search is a plain constant, so the creature
 * scan's request is the largest of the three and can be wider than sight — it
 * is offering candidates for three questions at once. Note that this widens the
 * *offer* only; what a hunter may then bite is settled by `ruleGate`, which is
 * the distinction this cycle exists to draw.
 *
 * `null` for a block query, where the radius is not read at all.
 * @param {object} site - an entry of `QUERY_SITES`
 * @param {object} config
 */
export function siteRequest(site, config) {
  const dark = config.dayNightCycle ? config.nightVisionFactor : 1;
  const sightR = config.visionRadius * dark;
  switch (site.request) {
    case "sightR":
      return sightR;
    case "nearbyR":
      return Math.max(
        sightR,
        config.signalling ? config.signalRadius : 0,
        config.sexualReproduction ? config.mateRadius : 0
      );
    case "shove":
      return config.bodyRadiusMax * 2;
    default:
      return null;
  }
}

/**
 * The distance the sweep itself lets a candidate through at, before the rule
 * gets to fire — `null` where there is no such test.
 *
 * The half of a carried rule v1.76 did not look at. `world.js#step` chooses a
 * nearest pellet and a nearest prey by walking the scan's candidates against
 * squared distances that both start at `visionR2`, and every contact test after
 * that runs on those *selections*. So a pellet outside sight is not eaten
 * however close it is, and a creature outside sight is not bitten however far a
 * bite reaches: the rule is gated by the sense that carries it, at whatever
 * radius the sense has this tick.
 *
 * Infection and the shove have no gate — each walks its own query's candidates
 * and applies its own distance test, which is what having a query of your own
 * means. A sense is not gated either: it *is* the gate.
 * @param {object} rule - an entry of `contactRules`
 * @param {object} config
 */
export function ruleGate(rule, config) {
  if (rule.gate !== "sight") return null;
  return config.visionRadius * (config.dayNightCycle ? config.nightVisionFactor : 1);
}

/**
 * Every distance this world asks a neighbour query for, and which query answers
 * it.
 *
 * `block` is `forEachNear` — the 3x3 window, whose promise is `blockReach`.
 * `disc` is `forEachWithin`, which covers whatever radius it is handed — and
 * that is a fact about the *query*, not about the rule. `sites` is the half
 * v1.76 left out: the entry of `QUERY_SITES` a rule takes its candidates from.
 * A rule that queries for itself hands the disc its own reach and is exempt by
 * construction; a rule *carried* by a sense scan is covered only while the
 * scan is asking for at least as much as the rule needs, which is a quantity
 * (`siteRequest`) rather than a construction, and one that moves with the hour.
 *
 * `sight` names three sites because the sweep runs three scans, and the rule is
 * covered by whichever of them asks for least.
 *
 * The `contact` rules are the ones where a missed candidate means a rule that
 * did not fire: a meal not eaten, a bite not taken, an exposure that did not
 * happen. The `sense` rules are v1.32's subject — there a missed candidate
 * means a creature saw the second-nearest pellet, which is a blurred sense
 * rather than a broken rule, and `exactVision` is the switch for it. Both are
 * listed so the domain is stated rather than assumed (v1.61), and because the
 * three contact rules that ride the sense scan change query with that flag
 * while infection does not.
 *
 * Reaches are the worst case over bodies: every one of them scales with a
 * creature's radius, and `bodyRadiusMax` is the biggest a creature gets.
 */
export function contactRules(config) {
  const body = config.bodyRadiusMax;
  // Eating, scavenging and biting have no query of their own: the candidate is
  // whatever the sense scan already handed over, so their window is the sense
  // window, and `exactVision` moves all three at once.
  const sensed = config.exactVision ? "disc" : "block";
  return [
    {
      name: "eat",
      kind: "contact",
      query: sensed,
      gate: "sight",
      sites: ["food"],
      reach: config.eatRadius + body * 0.4,
      source: "eatRadius + radius * 0.4",
      active: true,
    },
    {
      name: "scavenge",
      kind: "contact",
      query: sensed,
      gate: "sight",
      sites: ["corpse"],
      reach: body + config.scavengeRadius + 6,
      source: "radius + scavengeRadius + 6",
      active: config.scavenging,
    },
    {
      name: "bite",
      kind: "contact",
      query: sensed,
      gate: "sight",
      sites: ["creature"],
      reach: body * 2 + 2,
      source: "radius + prey.radius + 2",
      active: config.predation,
    },
    {
      name: "infect",
      kind: "contact",
      query: "block",
      gate: null,
      sites: ["infection"],
      reach: config.infectionRadius,
      source: "infectionRadius",
      active: config.disease,
    },
    {
      name: "shove",
      kind: "contact",
      query: "disc",
      gate: null,
      sites: ["separation"],
      reach: body * 2,
      source: "bodyRadiusMax * 2",
      active: config.bodyCollision,
    },
    {
      name: "sight",
      kind: "sense",
      query: sensed,
      gate: null,
      sites: ["food", "creature", "corpse"],
      reach: config.visionRadius,
      source: "visionRadius",
      active: true,
    },
    {
      name: "earshot",
      kind: "sense",
      query: sensed,
      gate: null,
      sites: ["creature"],
      reach: config.signalRadius,
      source: "signalRadius",
      active: config.signalling,
    },
    {
      name: "mate",
      kind: "sense",
      query: sensed,
      gate: null,
      sites: ["creature"],
      reach: config.mateRadius,
      source: "mateRadius",
      active: config.sexualReproduction,
    },
  ];
}

/**
 * The audit: this world's index, its guarantee, and every rule measured against
 * it.
 *
 * A rule is `covered` when nothing it is entitled to can be missed, and there
 * are two ways to miss something, which is the correction this release makes to
 * the release that wrote this function:
 *
 *   - **the offer.** What the query covers: the block's guarantee for a
 *     `forEachNear`, and the radius the call was handed for a `forEachWithin`.
 *   - **the gate.** What the sweep lets through before the rule runs at all
 *     (`ruleGate`) — sight, for the three contact rules that take their
 *     candidate from a sense scan, and nothing for the two that query for
 *     themselves.
 *
 * `coverage` is the smaller of the two present, `binds` says which one it was,
 * and `margin` is `coverage − reach`. In the default pond the index binds every
 * carried rule (18 px against a sight of 168) and this is v1.76's audit
 * unchanged; in a dark pond the gate binds instead, and no setting of
 * `exactVision` moves it, because the disc a scan covers is the radius sight
 * asked for.
 *
 * A margin of zero under `binds: "index"` is a passing rule that any change to
 * the pond's size, its vision radius or its bodies can turn into a failing one.
 * A margin of zero under `binds: "self"` is the opposite: a rule handing its own
 * query its own reach, which is what the shove has done since v1.56 and what
 * every sense does under `exactVision`.
 *
 * Two reporting notes. A *block* query is handed a radius and ignores it, so a
 * rule can report an `offer` of 18 beside a request of 168; that gap is v1.32's
 * subject. And a sense can report a `reach` larger than its own offer, because
 * `reach` is the radius the config intends while the offer is the one the
 * day/night cycle left it with — sight shrinking at midnight is the feature
 * working, not a hole, which is why senses are exempt from `binds: "gate"`
 * entirely: a sense *is* the gate.
 * @param {object} config
 */
export function contactAudit(config) {
  const cellSize = indexCellSize(config);
  const grid = new SpatialGrid(config.width, config.height, cellSize);
  const reach = blockReach(grid);
  const byName = Object.fromEntries(QUERY_SITES.map((s) => [s.name, s]));
  const rules = contactRules(config).map((rule) => {
    const blocked = rule.query === "block";
    // What the queries this rule rides ask for, at their narrowest: a rule is
    // only as covered as the stingiest scan that could be the one to offer it a
    // candidate. `null` where every site of the rule is a block query.
    const asks = rule.sites
      .map((name) => siteRequest(byName[name], config))
      .filter((r) => r !== null);
    const request = asks.length ? Math.min(...asks) : null;
    // A rule whose own query is the disc it hands its reach to — every sense
    // under `exactVision`, and the shove in every world since v1.56.
    const self = !blocked && (rule.kind === "sense" || rule.name === "shove");
    const offer = blocked ? reach.radius : self ? rule.reach : request;
    const gate = ruleGate(rule, config);
    const coverage = gate === null ? offer : Math.min(offer, gate);
    const binds = self ? "self" : gate !== null && gate <= offer ? "gate" : "index";
    return {
      ...rule,
      guarantee: reach.radius,
      request,
      offer,
      gateAt: gate,
      coverage,
      binds,
      margin: coverage - rule.reach,
      covered: rule.reach <= coverage,
      stranded: blocked ? strandedShare(grid, rule.reach).any : 0,
    };
  });
  return {
    cellSize,
    cols: grid.cols,
    rows: grid.rows,
    reach,
    rules,
    // The verdict, over the rules this world has actually switched on. Senses
    // are excluded: a clipped sense is v1.32's known, measured, opt-out-able
    // approximation, while a clipped contact rule is one that does not fire.
    uncovered: rules.filter((r) => r.active && r.kind === "contact" && !r.covered),
  };
}
