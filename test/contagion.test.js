import { test } from "node:test";
import assert from "node:assert/strict";
import {
  independentAny,
  infectionRisk,
  hazardShare,
  hazardSources,
  hazardGrid,
  HAZARD_CELL,
} from "../src/contagion.js";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import { torusDist2 } from "../src/vec.js";

const cfg = (over = {}) => makeConfig({ seed: 5, ...over });

// ---- the arithmetic ----

test("no sources is no chance, and one source is exactly the chance", () => {
  assert.equal(independentAny(0.3, 0), 0);
  assert.equal(independentAny(0.3, -1), 0);
  assert.ok(Math.abs(independentAny(0.3, 1) - 0.3) < 1e-12);
  // A certainty stays a certainty however many times it is offered, and an
  // impossibility stays impossible.
  assert.equal(independentAny(1, 7), 1);
  assert.equal(independentAny(0, 7), 0);
});

test("risk compounds the way overlapping layers of paint do", () => {
  // The identity the field's opacity rides on: this is the same function the
  // canvas applies when it stacks n translucent discs, which is why the drawn
  // opacity is a monotone remap of the real risk and not a decorative ramp.
  for (const p of [0.045, 0.1, 0.5]) {
    for (const n of [1, 2, 5, 20]) {
      assert.ok(Math.abs(independentAny(p, n) - (1 - Math.pow(1 - p, n))) < 1e-12);
    }
  }
  let prev = -1;
  for (const n of [0, 1, 2, 3, 10, 100]) {
    const r = independentAny(0.045, n);
    assert.ok(r > prev, `risk must rise with the number of sources (${n})`);
    assert.ok(r <= 1);
    prev = r;
  }
});

test("infectionRisk reads the pathogen's own per-neighbour chance", () => {
  const c = cfg({ infectionChance: 0.2 });
  assert.equal(infectionRisk(0, c), 0);
  assert.ok(Math.abs(infectionRisk(1, c) - 0.2) < 1e-12);
  assert.ok(Math.abs(infectionRisk(3, c) - (1 - 0.8 ** 3)) < 1e-12);
});

// ---- the zone ----

/** A stand-in for a creature, which is all `contagion.js` ever reads. */
const sick = (x, y) => ({ x, y, infected: true });
const well = (x, y) => ({ x, y, infected: false });

test("an empty pond, and a healthy one, have no contagious water at all", () => {
  const c = cfg();
  assert.equal(hazardShare([], c), 0);
  assert.equal(hazardShare([well(100, 100), well(200, 300)], c), 0);
  // Exactly zero rather than nearly zero: this is the guard that keeps the
  // readout honest in every world with the pathogen switched off.
  assert.equal(hazardShare([{ x: 10, y: 10, immune: true, infected: false }], c), 0);
});

test("one case covers its own disc, to within a cell", () => {
  const c = cfg();
  const disc = (Math.PI * c.infectionRadius ** 2) / (c.width * c.height);
  // Every placement, not one lucky one: the error lives on the disc's perimeter
  // and therefore depends on where the centre falls inside its cell. 10% is the
  // bar HAZARD_CELL was chosen against; a fifteen-pixel cell missed by 40%.
  for (let t = 0; t < 40; t++) {
    const share = hazardShare([sick((t * 97.3) % c.width, (t * 53.7) % c.height)], c);
    assert.ok(
      Math.abs(share - disc) / disc < 0.1,
      `share ${share.toFixed(5)} vs disc ${disc.toFixed(5)}`
    );
  }
});

test("the grid tiles the pond exactly, whatever the world's size", () => {
  for (const size of [{ width: 900, height: 600 }, { width: 640, height: 480 }, { width: 40, height: 30 }]) {
    const c = cfg(size);
    const g = hazardGrid(c);
    assert.ok(Math.abs(g.cols * g.cw - c.width) < 1e-9);
    assert.ok(Math.abs(g.rows * g.ch - c.height) < 1e-9);
    assert.ok(g.cw <= HAZARD_CELL * 1.5 && g.ch <= HAZARD_CELL * 1.5);
  }
});

test("the zone wraps: a case on the seam is worth exactly one in the middle", () => {
  // Shifted by a whole number of cells so the quantisation lands identically —
  // the claim is about the torus, not about rounding.
  const c = cfg();
  const g = hazardGrid(c);
  const mid = hazardShare([sick(g.cw * 20 + g.cw / 2, g.ch * 10 + g.ch / 2)], c);
  const corner = hazardShare([sick(g.cw / 2, g.ch / 2)], c);
  const seam = hazardShare([sick(c.width - g.cw / 2, c.height - g.ch / 2)], c);
  assert.equal(corner, mid);
  assert.equal(seam, mid);
});

test("clumped cases cover less water than scattered ones — the statistic the science uses", () => {
  const c = cfg();
  const apart = hazardShare([sick(150, 150), sick(600, 450)], c);
  const together = hazardShare([sick(150, 150), sick(158, 150)], c);
  const alone = hazardShare([sick(150, 150)], c);
  assert.ok(apart > together, "two discs that overlap cover less than two that do not");
  assert.ok(together > alone, "but they still cover more than one of them");
  assert.ok(Math.abs(apart - 2 * alone) / apart < 0.05, "disjoint discs simply add up");
});

test("adding a case never shrinks the zone, and the whole pond is the ceiling", () => {
  const c = cfg();
  const cases = [];
  let prev = -1;
  for (let i = 0; i < 40; i++) {
    cases.push(sick((i * 137) % c.width, (i * 211) % c.height));
    const share = hazardShare(cases, c);
    assert.ok(share >= prev, "coverage is monotone in the number of cases");
    assert.ok(share <= 1, "coverage cannot exceed the pond");
    prev = share;
  }
  // A radius that swallows the world covers all of it, and no radius covers none.
  assert.equal(hazardShare([sick(1, 1)], cfg({ infectionRadius: 10_000 })), 1);
  assert.equal(hazardShare([sick(1, 1)], cfg({ infectionRadius: 0 })), 0);
});

test("the fast walk covers the same cells the exhaustive one would", () => {
  // An accelerator is a claim of equivalence, and v1.32 is what happens when
  // nothing checks one: `hazardShare` visits only the cells a disc can reach,
  // so here is the O(cells x cases) version it has to agree with.
  const c = cfg();
  const g = hazardGrid(c);
  const brute = (cases) => {
    let covered = 0;
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.cols; i++) {
        const x = (i + 0.5) * g.cw;
        const y = (j + 0.5) * g.ch;
        const hit = cases.some(
          (s) => torusDist2(x, y, s.x, s.y, c.width, c.height) <= c.infectionRadius ** 2
        );
        if (hit) covered++;
      }
    }
    return covered / (g.cols * g.rows);
  };
  const sets = [
    [sick(0, 0)],
    [sick(899.5, 599.5)],
    [sick(450, 300), sick(455, 305)],
    [sick(12, 588), sick(888, 7), sick(450, 0)],
  ];
  for (const set of sets) assert.equal(hazardShare(set, c), brute(set), JSON.stringify(set));
});

test("the sources the views draw are exactly the sick", () => {
  const c = [sick(1, 2), well(3, 4), sick(5, 6)];
  assert.deepEqual(hazardSources(c), [{ x: 1, y: 2 }, { x: 5, y: 6 }]);
  assert.deepEqual(hazardSources([well(1, 1)]), []);
  assert.deepEqual(hazardSources([]), []);
});

// ---- wired into a running world ----

test("a world with no pathogen reports no contagious water, ever", () => {
  const world = new World(cfg({ seed: 21 }));
  for (let i = 0; i < 600; i++) {
    world.step();
    assert.equal(world.stats.hazardShare, 0);
  }
});

test("an epidemic has a measurable reach, and curing the pond clears it in the same frame", () => {
  const world = new World(
    makeConfig({
      seed: 11,
      disease: true,
      infectionChance: 0.5,
      infectionRadius: 40,
      diseaseDuration: 400,
      diseaseReintroduce: 100,
    })
  );
  while (world.tick < 3000 && world.stats.infectedCount < 3) world.step();
  assert.ok(world.stats.infectedCount >= 3, "the test world should produce a wave");
  assert.ok(world.stats.hazardShare > 0, "sick creatures make some of the water contagious");
  assert.ok(world.stats.hazardShare < 1, "and not all of it");

  // The v1.23 lesson: throttle the scan, not the statistic. Cure everyone and
  // step once — on a tick the scan would have skipped — and the readout must not
  // be left holding the last epidemic's number.
  for (const c of world.creatures) c.infected = false;
  world.config.diseaseReintroduce = 1e9; // no fresh case on this step
  if (world.tick % 4 === 0) world.step(); // land on a throttled tick
  world.step();
  assert.equal(world.stats.hazardShare, 0);
});
