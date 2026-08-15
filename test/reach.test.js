// Tests for the block's real guarantee (v1.76) — how far *can* a 3x3 neighbour
// query see, and which of this world's rules ask for more?
//
// Four comments in this repository said the answer was one cell. It is not:
// `cellSize` does not divide the world, the last column of the default pond is
// an 18-px stub, and the distance the block promises from anywhere is the
// narrowest neighbouring cell. 18, not 126. v1.32 measured exactly this seam
// for *sight* and wrote it into `docs/SCIENCE.md`; the same release left "a
// guaranteed 126 px" in `config.js`, four lines above the flag that fixes it,
// where it stood for forty-three releases.
//
// What these tests pin:
//
//   - **the guarantee is exact and it is attained**, checked against the grid's
//     own `forEachNear` by inserting probes rather than by re-deriving the
//     geometry: a target at exactly the guarantee is found from every position
//     tried, and a target one step past it is missed from at least one;
//   - **the default pond's numbers**: cells of 126 in an 8x5 grid, an 18-px
//     stub column and a 116-px stub row, a promise of 18 px from anywhere and
//     189 px from the luckiest spot;
//   - **the audit of every rule that rides the block**. Eating clears the
//     guarantee by 6.8 px, scavenging by 1.0, biting by **exactly zero**, and
//     infection fails it by 4.0. The zero is pinned as a zero and as a lever:
//     one tenth of a pixel on `bodyRadiusMax` turns predation's contact test
//     into a rule the index cannot answer;
//   - **the failure, not only the fix** (v1.25). An exposure inside
//     `infectionRadius` that `forEachNear` does not find, built by hand at the
//     seam and confirmed against `forEachWithin`, so the day the disease scan
//     is corrected this test says which behaviour changed;
//   - **the domain**: `shove` is exempt because v1.56 gave it a disc query, and
//     the three contact rules that ride the sense scan move onto a disc with
//     `exactVision` while infection does not, because it is the only rule in
//     the pond with a neighbour query of its own.
//
// v1.81 adds the two halves the audit had been taking on trust.
//
//   - **the list of sites is derived** rather than read off by me. `QUERY_SITES`
//     declares the nine neighbour queries in `src/`; `scanQuerySites` finds them
//     in the source; the first test below compares the two, so a query added
//     anywhere fails until somebody says which rules ride it. The scanner's
//     domain is pinned too, on a synthetic module, because a sweep is only worth
//     what its stated exclusions are.
//   - **the index is not the only thing between a rule and its candidate.**
//     Eating, scavenging and biting have no query of their own, so they inherit
//     the sense scan's *answer* as well as its window: a creature can only bite
//     what it has already seen. That gate is `visionRadius` times the day/night
//     cycle, and it binds below a night factor of 17.273/168 — in both arms,
//     because `exactVision` fixes the index and this is not the index. The
//     floors are computed, the default night is measured (a margin of 41.5 px,
//     construction), and the failure is staged in the pond itself: one hunter,
//     one neighbour inside its jaws, unbitten at midnight and eaten at noon.
//     The coupling that looked real and is not — a pond with voices offers
//     candidates out to `signalRadius` at every hour — is pinned as a negative
//     result, because the gate throws every one of them away.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { SpatialGrid, indexCellSize } from "../src/grid.js";
import { RNG } from "../src/rng.js";
import { dayNightVisionFactor } from "../src/environment.js";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  QUERY_SITES,
  blockReach,
  cellSpans,
  contactAudit,
  contactRules,
  creatureReaches,
  reachAt,
  ruleGate,
  scanQuerySites,
  siteKey,
  sightWindow,
  siteRequest,
  strandedShare,
} from "../src/reach.js";
import { trajectoryFingerprint } from "../src/fingerprint.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * The largest bite this world admits: `bodyRadiusMax + prey + 2` where the prey
 * is as big as `canEat` will allow, which is `bodyRadiusMax / preySizeRatio` —
 * the refuge radius. 190/11 = 17.2727 with the shipped constants, and an *open*
 * bound, because the size test is a strict `>`. This file asserted 18.0 for two
 * releases (v1.76, v1.81), which is the sum over a pair predation forbids.
 */
const BITE =
  DEFAULT_CONFIG.bodyRadiusMax +
  DEFAULT_CONFIG.bodyRadiusMax / DEFAULT_CONFIG.preySizeRatio +
  2;

/** Every neighbour query in the shipped sources, read out of the sources. */
function sweepSources() {
  return readdirSync(SRC)
    .filter((n) => n.endsWith(".js"))
    .sort()
    .flatMap((n) => scanQuerySites(readFileSync(join(SRC, n), "utf8"), n));
}

const defaultGrid = () =>
  new SpatialGrid(DEFAULT_CONFIG.width, DEFAULT_CONFIG.height, indexCellSize(DEFAULT_CONFIG));

/** Does the block at (qx, qy) contain a point `d` away in direction `th`? */
function blockFinds(grid, qx, qy, d, th) {
  const wrap = (v, extent) => ((v % extent) + extent) % extent;
  grid.clear();
  grid.insert({
    x: wrap(qx + d * Math.cos(th), grid.width),
    y: wrap(qy + d * Math.sin(th), grid.height),
  });
  let hit = false;
  grid.forEachNear(qx, qy, () => {
    hit = true;
  });
  return hit;
}

test("the grid's cell size has one definition, and the world uses it", () => {
  // Two copies of `Math.max(40, visionRadius * 0.75)` would be two things to
  // keep in step, and this module audits contact rules against the number.
  const w = new World(makeConfig({}));
  assert.equal(w.creatureGrid.cellSize, indexCellSize(DEFAULT_CONFIG));
  assert.equal(indexCellSize({ visionRadius: 168 }), 126);
  assert.equal(indexCellSize({ visionRadius: 10 }), 40, "and it is floored at 40");
});

test("the default pond's index is 8x5 with an 18-px stub column", () => {
  const g = defaultGrid();
  const { cols, rows } = cellSpans(g);
  assert.equal(g.cellSize, 126);
  assert.deepEqual(cols, [126, 126, 126, 126, 126, 126, 126, 18]);
  assert.deepEqual(rows, [126, 126, 126, 126, 116]);
  assert.equal(
    cols.reduce((a, b) => a + b, 0),
    DEFAULT_CONFIG.width,
    "the columns have to be the world"
  );
  assert.equal(
    rows.reduce((a, b) => a + b, 0),
    DEFAULT_CONFIG.height
  );
});

test("the block guarantees 18 px, not the 126 of one cell", () => {
  const r = blockReach(defaultGrid());
  assert.equal(r.radius, 18, "the narrowest neighbouring cell, and nothing more");
  assert.equal(r.x, 18);
  assert.equal(r.y, 116, "the row stub is generous; the column stub is not");
  assert.equal(r.best, 189, "and from the luckiest standing spot, 189");
  assert.equal(r.narrowestCol, 18);
  assert.equal(r.narrowestRow, 116);
});

test("the guarantee agrees with `nearBounds` from every standing position", () => {
  // `blockReach` is an argument about cell extents; `reachAt` reads the block
  // the grid says it will search. They must not be able to disagree.
  const g = defaultGrid();
  const promise = blockReach(g).radius;
  let worst = Infinity;
  let best = 0;
  for (let x = 0; x < g.width; x += 1.5) {
    for (let y = 0; y < g.height; y += 1.5) {
      const r = reachAt(g, x, y);
      worst = Math.min(worst, r);
      best = Math.max(best, r);
      assert.ok(r >= promise, `reach ${r} at (${x}, ${y}) is under the promise`);
    }
  }
  assert.equal(worst, promise, "and the promise is attained, not merely respected");
  assert.equal(best, blockReach(g).best);
});

test("a target at exactly the guarantee is always found, and one past it is not", () => {
  // The check that matters: not that the arithmetic is self-consistent, but
  // that `forEachNear` — the function the pond actually calls — behaves the way
  // the number says. Probes are inserted and the real query is run.
  const g = defaultGrid();
  const promise = blockReach(g).radius;
  const dirs = 16;
  let missedPastIt = 0;
  for (let x = 0; x < g.width; x += 7) {
    for (let y = 0; y < g.height; y += 7) {
      for (let i = 0; i < dirs; i++) {
        const th = (i * 2 * Math.PI) / dirs;
        assert.ok(
          blockFinds(g, x, y, promise, th),
          `a neighbour ${promise} px away at (${x}, ${y}) must be in the block`
        );
        if (!blockFinds(g, x, y, promise + 0.5, th)) missedPastIt++;
      }
    }
  }
  assert.ok(missedPastIt > 0, "and the promise must be tight: something past it is missed");
});

test("the hole is 0.9% of the pond, and it is all in one axis", () => {
  const g = defaultGrid();
  const s = strandedShare(g, DEFAULT_CONFIG.infectionRadius);
  // 22 px asked for, 18 px promised: a 4-px strip at each side of the seam.
  assert.equal(s.x, 8 / DEFAULT_CONFIG.width);
  assert.equal(s.y, 0, "the row stub is 116 px, so nothing is stranded vertically");
  assert.ok(Math.abs(s.any - 8 / 900) < 1e-12);
  assert.equal(strandedShare(g, 18).any, 0, "nothing is stranded inside the promise");
  assert.ok(strandedShare(g, 168).any > 0.5, "and sight strands most of the pond");
});

test("three contact rules clear the guarantee and infection does not", () => {
  const audit = contactAudit(makeConfig({ disease: true, scavenging: true }));
  const by = Object.fromEntries(audit.rules.map((r) => [r.name, r]));

  assert.equal(by.eat.reach, 11.2);
  assert.equal(by.scavenge.reach, 17);
  assert.ok(Math.abs(by.bite.reach - BITE) < 1e-12, "a bite cannot reach 18 (v1.83)");
  assert.equal(by.infect.reach, 22);

  assert.ok(by.eat.covered && by.scavenge.covered && by.bite.covered);
  assert.equal(by.infect.covered, false);

  assert.ok(Math.abs(by.eat.margin - 6.8) < 1e-12);
  assert.equal(by.scavenge.margin, 1);
  assert.ok(Math.abs(by.bite.margin - 8 / 11) < 1e-12, "0.727, and the slack is the refuge");
  assert.equal(by.infect.margin, -4);

  assert.deepEqual(
    audit.uncovered.map((r) => r.name),
    ["infect"],
    "one rule in the pond asks the index for more than it can answer"
  );
});

test("the bite's margin is a lever, and it is not where v1.76 put it", () => {
  // Pin the failure, not only the fix. v1.76 read the bite's reach as
  // `bodyRadiusMax * 2 + 2` = 18.0 against a stub of 18 and called the zero a
  // coincidence between the pond's aesthetic dimensions; v1.83 found that pair
  // of bodies is the one `canEat` forbids. So the old lever is gone — a tenth
  // of a pixel on the biggest body no longer breaks anything...
  const bite = (extra) => contactAudit(makeConfig(extra)).rules.find((r) => r.name === "bite");
  assert.equal(bite({ bodyRadiusMax: 8.1 }).covered, true, "18.2 by the old sum, 17.5 by the rule");

  // ...and the real one sits where the admissible supremum crosses the stub:
  // `B * (1 + 1/preySizeRatio) + 2 = 18`, which is 8.381 rather than 8.0.
  const P = DEFAULT_CONFIG.preySizeRatio;
  const edge = 16 / (1 + 1 / P);
  assert.ok(Math.abs(edge - 8.381) < 5e-4, "the body size at which a bite outgrows the index");
  assert.equal(bite({ bodyRadiusMax: edge * 0.999 }).covered, true);
  const wider = contactAudit(makeConfig({ bodyRadiusMax: edge * 1.001 }));
  assert.equal(wider.rules.find((r) => r.name === "bite").covered, false);
  assert.deepEqual(wider.uncovered.map((r) => r.name), ["bite"]);

  // And the other side of the same coin: the stub is a fact about the *world's*
  // size, so widening the pond to a multiple of the cell removes it entirely.
  const even = contactAudit(makeConfig({ width: 126 * 8, height: 126 * 5 }));
  assert.equal(blockReach(new SpatialGrid(126 * 8, 126 * 5, 126)).radius, 126);
  assert.equal(even.uncovered.length, 0, "with no stub, even infection is covered");
});

test("the audit states its domain: discs are exempt, senses are v1.32's subject", () => {
  const on = makeConfig({
    disease: true,
    scavenging: true,
    bodyCollision: true,
    signalling: true,
    sexualReproduction: true,
  });
  const rules = contactRules(on);
  const by = Object.fromEntries(rules.map((r) => [r.name, r]));

  // v1.56 gave the shove a disc query on the stated grounds that what two
  // bodies touching means cannot depend on a sight setting. It is the only
  // contact rule in the pond that took that advice, and the exemption is by
  // construction rather than by luck: widen the bodies until the reach is past
  // the promise and the shove is still exact while the bite is not.
  assert.equal(by.shove.query, "disc");
  assert.equal(by.shove.reach, 16);
  assert.equal(contactAudit(on).uncovered.length, 1);
  const heavy = contactAudit(makeConfig({ ...on, bodyRadiusMax: 20 }));
  assert.equal(heavy.rules.find((r) => r.name === "shove").covered, true, "40 px, still exact");
  assert.equal(heavy.rules.find((r) => r.name === "bite").covered, false);

  // Every sense, and the three contact rules that take their candidate from a
  // sense scan, move onto a disc when `exactVision` is on. Infection does not,
  // because `_stepDisease` is the one rule with a query of its own.
  const exact = contactRules({ ...on, exactVision: true });
  for (const r of exact) {
    if (r.name === "infect") assert.equal(r.query, "block");
    else assert.equal(r.query, "disc", `${r.name} rides a scan exactVision fixes`);
  }
  assert.deepEqual(
    contactAudit({ ...on, exactVision: true }).uncovered.map((r) => r.name),
    ["infect"],
    "the flag that fixes sight cannot reach the one rule that is not a sense"
  );
});

test("an exposure inside infectionRadius that the pond cannot see", () => {
  // The failure itself, built at the seam. Two creatures 21 px apart across
  // x=0 — inside the 22-px infection radius — and the query the epidemic
  // actually runs does not find the second from the first. The host stands two
  // pixels into column 0, whose left neighbour is the 18-px stub, so its block
  // ends 20 px behind it; the other creature is one pixel further away than
  // that, in column 6, which the block never reaches.
  const cfg = makeConfig({ seed: 5, disease: true, populationStart: 0, foodStart: 0 });
  const world = new World(cfg);
  const rng = new RNG(1);
  const at = (x) => new Creature(Genome.random(rng), cfg, x, 300, rng);
  const host = at(2);
  const other = at(881);
  world.creatures.push(host, other);
  world.creatureGrid.clear();
  world.creatureGrid.insert(host);
  world.creatureGrid.insert(other);

  const gap = host.x + cfg.width - other.x;
  assert.equal(gap, 21, "the two are 21 px apart around the seam");
  assert.ok(gap < cfg.infectionRadius, "and that is inside the rule");

  let block = 0;
  world.creatureGrid.forEachNear(host.x, host.y, (o) => {
    if (o !== host) block++;
  });
  let disc = 0;
  world.creatureGrid.forEachWithin(host.x, host.y, cfg.infectionRadius, (o) => {
    if (o !== host) disc++;
  });
  assert.equal(block, 0, "the query the epidemic runs does not find the contact");
  assert.equal(disc, 1, "the query that covers its radius does");
});

test("every neighbour query in `src/` is declared, and every declaration is one", () => {
  const found = sweepSources();
  assert.deepEqual(
    found.map(siteKey).sort(),
    QUERY_SITES.map(siteKey).sort(),
    "the census and the source disagree — a query was added, moved or renamed"
  );
  assert.equal(
    new Set(QUERY_SITES.map(siteKey)).size,
    QUERY_SITES.length,
    "two sites sharing all four identifying fields would be one entry hiding another"
  );

  // The shape of it, stated as a number so the next query has to change this
  // line as well as the list: nine, and only five of them are the pond.
  const kinds = {};
  for (const s of QUERY_SITES) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  assert.deepEqual(kinds, { sense: 3, rule: 2, dispatch: 2, instrument: 2 });
  assert.equal(QUERY_SITES.length, 9);

  // And the pond's five are all in one module. `world.js` is the only file that
  // asks the index anything; that is worth knowing and worth being told when it
  // stops being true.
  const pond = QUERY_SITES.filter((s) => s.kind === "sense" || s.kind === "rule");
  assert.deepEqual([...new Set(pond.map((s) => s.module))], ["world.js"]);
});

test("every rule rides a declared site, and every site of the pond carries a rule", () => {
  const cfg = makeConfig({
    disease: true,
    scavenging: true,
    bodyCollision: true,
    signalling: true,
    sexualReproduction: true,
  });
  const rules = contactRules(cfg);
  const named = new Set(QUERY_SITES.map((s) => s.name));
  for (const r of rules) {
    assert.ok(r.sites.length > 0, `${r.name} rides nothing`);
    for (const s of r.sites) assert.ok(named.has(s), `${r.name} rides an undeclared site ${s}`);
  }

  // Both directions. A site nobody rides is a query this audit has never asked
  // a question about, which is the hole v1.76 closed for the rules and left
  // open for the sites.
  for (const s of QUERY_SITES) {
    const riders = rules
      .filter((r) => r.sites.includes(s.name))
      .map((r) => r.name)
      .sort();
    if (s.kind === "sense" || s.kind === "rule") {
      assert.ok(riders.length > 0, `${s.name} carries nothing`);
      assert.deepEqual(riders, [...s.carries].sort(), `${s.name}'s manifest`);
    } else {
      assert.deepEqual(riders, [], `${s.name} is a dispatcher or an instrument`);
    }
  }
});

test("the census reads receivers, not prose", () => {
  // The scanner's stated domain, on a module written to break it: a query named
  // in a comment, a query named in a doc block, the *definition* of one (no
  // receiver, so not a site), and two real calls.
  const source = [
    "// this.creatureGrid.forEachNear() here is prose about a query",
    "/**",
    " * ...and `forEachWithin` in a doc block is prose too.",
    " */",
    "export function realOne(x) {",
    "  grid.forEachWithin(x, 4, () => {});",
    "}",
    "class G {",
    "  forEachNear(x, y, fn) {",
    "    return fn;",
    "  }",
    "  method() {",
    "    this._scan(this.foodGrid, 1, 2, 3, () => {});",
    "  }",
    "}",
  ].join("\n");

  assert.deepEqual(scanQuerySites(source, "synthetic.js").map(siteKey), [
    "synthetic.js realOne forEachWithin grid",
    "synthetic.js method _scan foodGrid",
  ]);

  // A trailing comment *does* register, and that is the deliberate direction of
  // the error: a census that over-reports fails loudly, and one that
  // under-reports is the bug this whole module is about.
  assert.equal(scanQuerySites("  foo(); // g.forEachNear(x, y)", "t.js").length, 1);
});

test("a disc covers what it was handed, which is not the same as covering a rule", () => {
  const audit = contactAudit(
    makeConfig({ exactVision: true, disease: true, scavenging: true, bodyCollision: true })
  );
  const by = Object.fromEntries(audit.rules.map((r) => [r.name, r]));

  // The three carried rules ask for nothing. With `exactVision` on, the query
  // that offers them a candidate covers 168 px — and so does the sense test
  // that then chooses one, which is what actually stands between the rule and
  // its candidate. The exemption v1.76 wrote is a number now, and the number is
  // somebody else's radius.
  for (const name of ["eat", "scavenge", "bite"]) {
    assert.equal(by[name].binds, "gate", `${name} is limited by the sense that carries it`);
    assert.equal(by[name].offer, 168);
    assert.equal(by[name].gateAt, 168);
    assert.equal(by[name].covered, true);
  }
  assert.ok(Math.abs(by.bite.margin - (168 - BITE)) < 1e-12);

  // The two rules that query for themselves, and the senses. A margin of zero
  // here means the opposite of the bite's zero in the block arm: the rule is
  // asking for exactly what it needs, in every pond, at every hour.
  assert.equal(by.shove.binds, "self");
  assert.equal(by.shove.offer, by.shove.reach);
  assert.equal(by.shove.margin, 0);
  assert.equal(by.shove.gateAt, null, "a rule with its own query has no gate");
  assert.equal(by.infect.gateAt, null);
  for (const name of ["sight", "earshot", "mate"]) {
    assert.equal(by[name].binds, "self", `a sense cannot be gated: it is the gate`);
  }

  // And in the pond as it ships, the index is still the tighter of the two —
  // 18 px against a sight of 168 — so v1.76's audit is unchanged where it was
  // measured. The gate has been there all along and has never bound anything.
  const block = Object.fromEntries(
    contactAudit(makeConfig({ disease: true, scavenging: true })).rules.map((r) => [r.name, r])
  );
  for (const name of ["eat", "scavenge", "bite"]) {
    assert.equal(block[name].binds, "index");
    assert.equal(block[name].gateAt, 168);
    assert.equal(block[name].offer, 18);
  }
  assert.ok(Math.abs(block.bite.margin - 8 / 11) < 1e-12);
});

test("the gate binds in the dark, and no flag moves it", () => {
  const at = (nightVisionFactor, extra = {}) =>
    contactAudit(
      makeConfig({ dayNightCycle: true, nightVisionFactor, scavenging: true, ...extra })
    );
  const rule = (audit, name) => audit.rules.find((r) => r.name === name);

  // The default night. Sight bottoms out at 58.8 px, which is still wider than
  // the index, so nothing about the audit changes and every carried rule holds.
  const dusk = at(DEFAULT_CONFIG.nightVisionFactor);
  assert.ok(Math.abs(rule(dusk, "bite").gateAt - 58.8) < 1e-12, "midnight is the factor exactly");
  assert.equal(rule(dusk, "bite").binds, "index");
  assert.ok(Math.abs(rule(dusk, "bite").margin - 8 / 11) < 1e-12);
  // ...and with the index taken out of the way, what is left is the gate, in
  // pixels rather than in a construction.
  const exact = at(DEFAULT_CONFIG.nightVisionFactor, { exactVision: true });
  assert.ok(Math.abs(rule(exact, "bite").margin - (58.8 - BITE)) < 1e-9);
  assert.ok(Math.abs(rule(exact, "eat").margin - 47.6) < 1e-12);
  assert.ok(Math.abs(rule(exact, "scavenge").margin - 41.8) < 1e-12);

  // The floor: the night factor at which each rule stops being answerable at
  // all, which is its reach as a share of the vision radius. A bite goes first,
  // at 0.1028 — and it goes in *both* arms, because `exactVision` is a fix for
  // the index and this is not the index.
  for (const name of ["eat", "scavenge", "bite"]) {
    const floor = rule(dusk, name).reach / DEFAULT_CONFIG.visionRadius;
    for (const eye of [false, true]) {
      const opt = { exactVision: eye };
      assert.equal(rule(at(floor, opt), name).covered, true, `${name} holds at its floor`);
      const under = rule(at(floor * 0.999, opt), name);
      assert.equal(under.covered, false, `${name} fails below it, exactVision ${eye}`);
      assert.equal(under.binds, "gate", "and it is sight that took it, not the index");
    }
  }
  assert.ok(Math.abs(BITE / DEFAULT_CONFIG.visionRadius - 0.1028) < 5e-5, "a bite's floor");
});

test("voices widen the offer and do not carry the bite — the coupling that is not there", () => {
  // A negative result, pinned (v1.20). The creature scan asks for the widest of
  // sight, earshot and a mate search, so in a pond where anybody can shout it
  // offers candidates out to `signalRadius` = 120 px at every hour of the
  // night. It looks exactly like predation being carried through the dark by
  // other creatures' voices. It is not: prey is chosen against `visionR2` and
  // nothing else, so every one of those extra candidates is thrown away.
  const dark = { exactVision: true, dayNightCycle: true, nightVisionFactor: 0.01 };
  const by = (cfg) => Object.fromEntries(contactAudit(cfg).rules.map((r) => [r.name, r]));
  const quiet = by(makeConfig(dark));
  const loud = by(makeConfig({ ...dark, signalling: true }));

  assert.equal(quiet.bite.offer, 1.68, "with no voices the scan asks for sight alone");
  assert.equal(loud.bite.offer, 120, "with voices it asks for earshot");
  assert.equal(loud.bite.gateAt, quiet.bite.gateAt, "and the gate does not hear a thing");
  assert.equal(quiet.bite.covered, false);
  assert.equal(loud.bite.covered, false, "a seventyfold wider offer changes nothing");
  assert.equal(loud.bite.binds, "gate");

  // The site's request is where the widening lives, so the two halves of the
  // finding are separable: this one is real, and it is not about the bite.
  const site = QUERY_SITES.find((s) => s.name === "creature");
  assert.equal(siteRequest(site, makeConfig({ ...dark, signalling: true })), 120);
  assert.equal(siteRequest(QUERY_SITES.find((s) => s.name === "food"), makeConfig(dark)), 1.68);
});

test("a bite at midnight the pond does not take", () => {
  // The failure itself, in the pond rather than in the arithmetic (v1.25: pin
  // the failure, not only the fix). One carnivore, one small neighbour inside
  // its jaws, and a night dark enough that the gate is under the gap. The bite
  // does not happen — and the same pair at noon, one line apart, is eaten.
  const stage = (visionFactor) => {
    const cfg = makeConfig({
      seed: 1,
      predation: true,
      dayNightCycle: true,
      nightVisionFactor: 0.05,
      foodStart: 0,
    });
    const rng = new RNG(13);
    const world = new World(cfg);
    world.food.items = [];
    const g = Genome.random(rng);
    g.data[g.data.length - 4] = 1; // the biggest body this world grows
    g.data[g.data.length - 1] = 0.95; // ...and a carnivore's diet
    const pred = new Creature(g, cfg, 100, 100, rng);
    const prey = new Creature(Genome.random(rng), cfg, 100, 100, rng);
    prey.radius = pred.radius * 0.5;
    const reach = pred.radius + prey.radius + 2;
    prey.x = 100 + reach - 0.5; // inside a bite, by half a pixel
    world.creatures = [pred, prey];
    world.tick = cfg.dayLength / 2; // midnight, so the clock agrees with the arm
    world.visionFactor = visionFactor;
    return { world, pred, prey, reach };
  };

  // A bite stamps `lastBiteAge`, which is the one signal here that no other
  // part of a tick moves — a prey's energy falls to metabolism whether or not
  // anything ate it, which is the reading that would have made this test pass
  // by accident.
  const dark = stage(0.05);
  assert.ok(dark.reach > 0.05 * DEFAULT_CONFIG.visionRadius, "the gap is outside the gate");
  dark.world.step();
  assert.equal(dark.pred.lastBiteAge, -1000, "unseen, and so unbitten");
  assert.equal(dark.world.stats.kills, 0);

  const noon = stage(1);
  const full = noon.prey.energy;
  noon.world.step();
  assert.ok(noon.pred.lastBiteAge > -1000, "the same pair, the same gap, in daylight");
  assert.ok(noon.prey.energy < full - 1, "and the prey pays for it");
});

test("every reach is the supremum over the pairs its own rule admits", () => {
  // The sweep that found the bug, run over all five contact rules rather than
  // over the one that was wrong. `contactRules` derives each reach from an `at`
  // expression and a bound on the second body; this walks a fine grid of real
  // radii, applies the rule's own precondition, and checks both halves of the
  // claim — nothing admissible is above the declared number, and something
  // admissible gets arbitrarily near it. A rule added later with a hand-typed
  // reach fails here (v1.53: fix the instances, then make the class
  // unrepresentable).
  const cfg = makeConfig({
    predation: true,
    disease: true,
    scavenging: true,
    bodyCollision: true,
  });
  const { bodyRadiusMin: lo, bodyRadiusMax: hi, preySizeRatio: P } = cfg;
  // The predicates, written from the shipped code rather than from the
  // declarations under test: `creature.js#_edible` for the bite, and nothing at
  // all for the shove, which is `world.js#_separate` asking only that two
  // bodies overlap.
  const admits = {
    bite: (self, other) => self > other * P,
    shove: () => true,
  };
  const STEPS = 400;
  const grid = Array.from({ length: STEPS + 1 }, (_, i) => lo + ((hi - lo) * i) / STEPS);

  for (const rule of contactRules(cfg).filter((r) => r.kind === "contact")) {
    let best = -Infinity;
    for (const self of grid) {
      if (rule.bodies === 0) best = Math.max(best, rule.at());
      else if (rule.bodies === 1) best = Math.max(best, rule.at(self));
      else {
        for (const other of grid) {
          if (!admits[rule.name](self, other)) continue;
          best = Math.max(best, rule.at(self, other));
        }
      }
    }
    assert.ok(
      best <= rule.reach + 1e-12,
      `${rule.name}: an admissible pair reaches ${best}, past a declared ${rule.reach}`
    );
    // Tight to within the grid's own step, which is the resolution this search
    // has and not a slack the rule is allowed.
    const step = (hi - lo) / STEPS;
    assert.ok(
      rule.reach - best <= 2 * step,
      `${rule.name}: declared ${rule.reach} but nothing admissible gets past ${best}`
    );
    // And the second column: whether the supremum is ever actually taken. Only
    // the bite's is open, and it is open because `canEat` tests `>`.
    assert.equal(rule.open, rule.name === "bite", `${rule.name}: open supremum?`);
    if (rule.open) assert.ok(best < rule.reach, "an open bound is not attained");
  }
});

test("both bodies at bodyRadiusMax is the one pair predation forbids", () => {
  // The wrong number, staged. `bodyRadiusMax * 2 + 2` = 18.0 needs a hunter and
  // a prey both at 8.0 px, and that is the single pair `canEat` exists to
  // refuse — so the reach this project published for two releases was the
  // maximum over a set with the answer taken out of it (v1.64's eligible-set
  // lesson, one level down, on a distance instead of a statistic).
  const cfg = makeConfig({ predation: true });
  const rng = new RNG(5);
  const big = () => {
    const c = new Creature(Genome.random(rng), cfg, 0, 0, rng);
    c.radius = cfg.bodyRadiusMax;
    c.carnivory = 1;
    return c;
  };
  const [hunter, equal] = [big(), big()];
  assert.equal(hunter.radius + equal.radius + 2, 18, "the sum the old audit took");
  assert.equal(hunter.canEat(equal), false, "and the pair it is over");

  // The largest prey it will take is the refuge radius, approached and never
  // reached — half a thousandth under it is a meal, half a thousandth over is
  // not, and the bite that follows is the number `contactRules` declares.
  const refuge = cfg.bodyRadiusMax / cfg.preySizeRatio;
  const prey = big();
  prey.radius = refuge - 5e-4;
  assert.equal(hunter.canEat(prey), true);
  assert.ok(hunter.radius + prey.radius + 2 < BITE);
  prey.radius = refuge + 5e-4;
  assert.equal(hunter.canEat(prey), false, "the bound is the rule, not a rounding");
});

test("no pair the pond ever offers asks for more than the declared bite", () => {
  // The declaration pinned against the pond rather than against itself. Every
  // living pair a real run produces, tested with `canEat` itself: none of them
  // reaches the bound, and the largest gets close enough that the bound is not
  // idle. (SCIENCE.md carries the full sweep — 36,416,658 eligible pairs over
  // twelve seeds, topping out at 17.2200 px.)
  const world = new World(makeConfig({ seed: 314, predation: true }));
  let most = 0;
  let pairs = 0;
  for (let t = 0; t < 1200; t++) {
    world.step();
    if (t % 100) continue;
    const live = world.creatures.filter((c) => !c.dead);
    for (const c of live) {
      for (const o of live) {
        if (c === o || !c.canEat(o)) continue;
        pairs++;
        most = Math.max(most, c.radius + o.radius + 2);
      }
    }
  }
  assert.ok(pairs > 1000, `a pond with something to measure (${pairs} eligible pairs)`);
  assert.ok(most < BITE, `the pond's widest bite ${most} is under the bound ${BITE}`);
  assert.ok(most > BITE - 1, "and near enough it that the bound is about this pond");
  assert.ok(most < 18, "the number two releases published is one no pair ever asks for");
});

test("the audit is an instrument: it leaves the world exactly as it found it", () => {
  const a = new World(makeConfig({ seed: 31 }));
  const b = new World(makeConfig({ seed: 31 }));
  for (let i = 0; i < 40; i++) {
    contactAudit(a.config);
    blockReach(a.creatureGrid);
    reachAt(a.creatureGrid, 100, 100);
    a.step();
    b.step();
  }
  assert.equal(trajectoryFingerprint(a), trajectoryFingerprint(b));
});

// ---------------------------------------------------------------------------
// The reach one animal has (v1.90)
//
// `contactRules` answers "what is the widest this rule can ever be", which is
// the question an index audit asks. `creatureReaches` answers "what is it for
// *this* body", which is the question a drawing asks — and the two have to be
// the same arithmetic, or the overlay is a second copy of `world.js` that can
// drift from the rule it plots. So the tests below are mostly substitutions:
// the per-creature answer at `bodyRadiusMax` must be the audit's answer, and at
// every other body it must agree with `canEat` itself.

/** The reaches by rule name, for a body of `radius`. */
function reachesOf(radius, over = {}) {
  const cfg = makeConfig(over);
  return Object.fromEntries(creatureReaches(radius, cfg).map((r) => [r.name, r]));
}

test("the biggest body's reach is the reach the audit declares", () => {
  // The substitution stated as an identity: `creatureReaches` is
  // `ruleSupremum` with one argument replaced, so at the argument it replaced
  // it must return what the audit returns, rule for rule and open for open.
  const cfg = makeConfig({ scavenging: true, disease: true, bodyCollision: true });
  const declared = contactRules(cfg).filter((r) => r.kind === "contact" && r.active);
  const drawn = Object.fromEntries(
    creatureReaches(cfg.bodyRadiusMax, cfg).map((r) => [r.name, r])
  );
  assert.deepEqual(Object.keys(drawn).sort(), declared.map((r) => r.name).sort());
  for (const rule of declared) {
    assert.equal(drawn[rule.name].outer, rule.reach, `${rule.name}: the far edge is the supremum`);
    assert.equal(drawn[rule.name].open, rule.open, `${rule.name}: openness is the same claim`);
  }
});

test("a drawn reach says what gates it, and the gate is the audit's own", () => {
  // v1.96 gave `creatureReaches` the `gate` field so a surface can say which of
  // the distances it shows are the *second* of two tests. It has to be the same
  // claim `ruleGate` makes, or the panel and the audit disagree about which
  // rules ride the sense scan.
  const cfg = makeConfig({ scavenging: true, disease: true, bodyCollision: true });
  const declared = new Map(
    contactRules(cfg)
      .filter((r) => r.kind === "contact" && r.active)
      .map((r) => [r.name, r])
  );
  for (const reach of creatureReaches(6, cfg)) {
    const rule = declared.get(reach.name);
    assert.equal(reach.gate, rule.gate, `${reach.name}'s gate`);
    assert.equal(reach.gate === "sight", ruleGate(rule, cfg) !== null, `${reach.name} is carried`);
  }
  assert.deepEqual(
    creatureReaches(6, cfg).filter((r) => r.gate === "sight").map((r) => r.name),
    ["eat", "scavenge", "bite"]
  );
});

test("sight is a window, and ruleGate is its floor", () => {
  // One expression, two callers. The audit takes midnight because an index must
  // cover the worst case; a reader is owed both ends, because the number moves
  // with the hour and one number would say it does not.
  const flat = makeConfig({});
  assert.deepEqual(sightWindow(flat), { least: flat.visionRadius, most: flat.visionRadius });

  const dark = makeConfig({ dayNightCycle: true });
  const window = sightWindow(dark);
  assert.equal(window.most, dark.visionRadius);
  assert.equal(window.least, dark.visionRadius * dark.nightVisionFactor);
  assert.ok(window.least < window.most);

  for (const cfg of [flat, dark]) {
    const eat = contactRules(cfg).find((r) => r.name === "eat");
    assert.equal(ruleGate(eat, cfg), sightWindow(cfg).least);
    assert.equal(ruleGate(contactRules(cfg).find((r) => r.name === "infect"), cfg), null);
  }
});

test("a rule reading one body is a circle; a rule reading two is a band", () => {
  // The sentence v1.83 left behind, as an assertion: three of the five contact
  // reaches are circles and two are bands, and which is which is decided by how
  // many radii the expression reads rather than by anything about the mark.
  const all = reachesOf(6, { scavenging: true, disease: true, bodyCollision: true });
  const bands = Object.values(all).filter((r) => r.band).map((r) => r.name);
  assert.deepEqual(bands.sort(), ["bite", "shove"]);
  for (const name of ["eat", "scavenge", "infect"]) {
    assert.equal(all[name].inner, all[name].outer, `${name} fires at one distance`);
  }
  for (const name of bands) {
    assert.ok(all[name].outer > all[name].inner, `${name}'s edges are two distances`);
  }
});

test("the band's edges are the smallest body and the largest one the rule admits", () => {
  const cfg = makeConfig({ bodyCollision: true });
  const min = cfg.bodyRadiusMin;
  const self = 7;
  const all = reachesOf(self, { bodyCollision: true });
  // A bite: the near edge is the smallest thing in the pond, the far edge the
  // biggest thing `canEat` allows this body — `self / preySizeRatio`, under the
  // largest body the world grows, so the bound is open.
  assert.equal(all.bite.inner, self + min + 2);
  assert.equal(all.bite.outer, self + self / cfg.preySizeRatio + 2);
  assert.equal(all.bite.open, true);
  // A shove asks nothing about size, so its far edge is the largest body there
  // is and is attained.
  assert.equal(all.shove.inner, self + min);
  assert.equal(all.shove.outer, self + cfg.bodyRadiusMax);
  assert.equal(all.shove.open, false);
});

test("a creature too small to eat anything has no bite reach to draw", () => {
  // The empty case, which is the one a drawing must get right: below
  // `bodyRadiusMin * preySizeRatio` there is no body in this world small enough
  // to clear the size rule, so the honest mark is no mark. Checked against
  // `canEat` rather than against the arithmetic that produced it.
  const cfg = makeConfig();
  const floor = cfg.bodyRadiusMin * cfg.preySizeRatio;
  const rng = new RNG(7);
  const at = (r) => {
    const c = new Creature(Genome.random(rng), cfg, 0, 0, rng);
    c.radius = r;
    return c;
  };
  const smallest = at(cfg.bodyRadiusMin);
  for (const [radius, empty] of [
    [cfg.bodyRadiusMin, true],
    [floor - 1e-6, true],
    [floor + 1e-6, false],
    [cfg.bodyRadiusMax, false],
  ]) {
    const bite = reachesOf(radius).bite;
    assert.equal(bite.empty, empty, `a body of ${radius} px: empty should be ${empty}`);
    assert.equal(at(radius).canEat(smallest), !empty, "and the rule itself must agree");
  }
});

test("no body's reach is wider than the audit's worst case, and every band is inside it", () => {
  // The claim that ties the drawing to the index: the overlay cannot draw a
  // ring the audit has not already declared covered. Swept over the whole size
  // range rather than at the ends, because a band has two edges and only one of
  // them is monotone in an obvious direction.
  const cfg = makeConfig({ scavenging: true, disease: true, bodyCollision: true });
  const worst = Object.fromEntries(contactRules(cfg).map((r) => [r.name, r.reach]));
  const steps = 400;
  for (let i = 0; i <= steps; i++) {
    const radius = cfg.bodyRadiusMin + ((cfg.bodyRadiusMax - cfg.bodyRadiusMin) * i) / steps;
    for (const reach of creatureReaches(radius, cfg)) {
      if (reach.empty) continue;
      assert.ok(reach.inner <= reach.outer, `${reach.name}: the band is inside out at ${radius}`);
      assert.ok(
        reach.outer <= worst[reach.name] + 1e-12,
        `${reach.name} reaches ${reach.outer} at ${radius}, past the declared ${worst[reach.name]}`
      );
    }
  }
});

test("a switched-off rule has no reach at all", () => {
  // The gate every surface in this project puts on a mechanic that is off: a
  // pond with no scavenging has no corpse reach to draw, and a pond with no
  // hunting has no bite.
  const names = (over) => creatureReaches(6, makeConfig(over)).map((r) => r.name).sort();
  assert.deepEqual(names({}), ["bite", "eat"]);
  assert.deepEqual(names({ predation: false }), ["eat"]);
  assert.deepEqual(
    names({ scavenging: true, disease: true, bodyCollision: true }),
    ["bite", "eat", "infect", "scavenge", "shove"]
  );
});
