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

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { SpatialGrid, indexCellSize } from "../src/grid.js";
import { RNG } from "../src/rng.js";
import {
  blockReach,
  cellSpans,
  contactAudit,
  contactRules,
  reachAt,
  strandedShare,
} from "../src/reach.js";
import { trajectoryFingerprint } from "../src/fingerprint.js";

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
  assert.equal(by.bite.reach, 18);
  assert.equal(by.infect.reach, 22);

  assert.ok(by.eat.covered && by.scavenge.covered && by.bite.covered);
  assert.equal(by.infect.covered, false);

  assert.ok(Math.abs(by.eat.margin - 6.8) < 1e-12);
  assert.equal(by.scavenge.margin, 1);
  assert.equal(by.bite.margin, 0, "a bite clears the block by exactly nothing");
  assert.equal(by.infect.margin, -4);

  assert.deepEqual(
    audit.uncovered.map((r) => r.name),
    ["infect"],
    "one rule in the pond asks the index for more than it can answer"
  );
});

test("the bite's margin of zero is a lever, not a comfort", () => {
  // `bodyRadiusMax * 2 + 2` = 18.0 against a stub of 18. Nothing chose that;
  // the two numbers have never been in the same sentence before v1.76. A tenth
  // of a pixel on the biggest body this world grows, and predation's contact
  // test becomes a rule the index cannot answer.
  const wider = contactAudit(makeConfig({ bodyRadiusMax: 8.1 }));
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
