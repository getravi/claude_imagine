import { test } from "node:test";
import assert from "node:assert/strict";
import { SpatialGrid } from "../src/grid.js";
import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { assertUnaffected } from "./support/paired.js";
import { torusDist2 } from "../src/vec.js";

/** Every item within `radius` of (x, y), found the slow honest way. */
function bruteForce(items, x, y, radius, width, height) {
  const r2 = radius * radius;
  return items.filter((i) => torusDist2(x, y, i.x, i.y, width, height) <= r2);
}

/** A deterministic scatter of points, so a failure is reproducible. */
function scatter(n, width, height, seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const items = [];
  for (let i = 0; i < n; i++) items.push({ x: next() * width, y: next() * height, i });
  return items;
}

// ---------------------------------------------------------------------------
// The grid: what a query of a given radius is allowed to miss (nothing).
// ---------------------------------------------------------------------------

test("forEachWithin finds everything inside the radius it was given", () => {
  // Deliberately awkward geometries: cell sizes that don't divide the world, a
  // world barely wider than one cell, a single-column grid.
  const cases = [
    [900, 620, 126],
    [900, 620, 168],
    [500, 500, 90],
    [300, 200, 70],
    [120, 120, 100],
    [90, 400, 126],
  ];
  for (const [w, h, cell] of cases) {
    const grid = new SpatialGrid(w, h, cell);
    const items = scatter(400, w, h, w + h + cell);
    for (const it of items) grid.insert(it);
    for (const p of scatter(60, w, h, 7)) {
      for (const radius of [5, cell * 0.4, cell, cell * 1.34, cell * 2.5]) {
        const want = new Set(bruteForce(items, p.x, p.y, radius, w, h).map((i) => i.i));
        const seen = new Map();
        grid.forEachWithin(p.x, p.y, radius, (it) => {
          seen.set(it.i, (seen.get(it.i) ?? 0) + 1);
        });
        for (const id of want) {
          assert.ok(seen.has(id), `${w}x${h}/${cell} r=${radius}: missed item ${id}`);
        }
        for (const [id, times] of seen) {
          assert.equal(times, 1, `${w}x${h}/${cell}: item ${id} was offered ${times} times`);
        }
      }
    }
  }
});

test("forEachWithin narrows the candidate set rather than scanning everything", () => {
  const grid = new SpatialGrid(900, 620, 126);
  const items = scatter(2000, 900, 620, 99);
  for (const it of items) grid.insert(it);
  let visited = 0;
  grid.forEachWithin(450, 310, 168, () => {
    visited++;
  });
  const inside = bruteForce(items, 450, 310, 168, 900, 620).length;
  assert.ok(visited >= inside, "it must at least offer everything in range");
  // The disc is 88,591 px^2 of a 558,000 px^2 world; a scan that stayed under
  // twice that share is doing the job an index exists to do.
  assert.ok(visited < items.length * 0.32, `scanned ${visited} of ${items.length}`);
});

test("forEachWithin stops early when the callback says so", () => {
  const grid = new SpatialGrid(900, 620, 126);
  for (const it of scatter(300, 900, 620, 4)) grid.insert(it);
  let seen = 0;
  grid.forEachWithin(450, 310, 300, () => {
    seen++;
    return true;
  });
  assert.equal(seen, 1);
});

test("the 3x3 block reaches exactly one cell out — stub cells included", () => {
  const grid = new SpatialGrid(900, 620, 126); // 8 columns: seven of 126, one of 18
  const mid = grid.nearBounds(450, 310);
  assert.equal(mid.right - mid.left, 3 * 126, "away from the seam, three full columns");
  // Beside the seam the last column is an 18px stub, so the block is 108px
  // narrower than it looks — the reason a creature's reach depends on where it
  // stands, over and above where it stands *within* a cell.
  const edge = grid.nearBounds(890, 310);
  assert.equal(edge.right - edge.left, 126 + 18 + 126);
  // Whatever the geometry, the block always contains the point it is centred on.
  for (const p of scatter(200, 900, 620, 12)) {
    const b = grid.nearBounds(p.x, p.y);
    assert.ok(b.left <= 0 && b.right >= 0 && b.top <= 0 && b.bottom >= 0);
  }
});

test("the block is the region forEachNear actually searches", () => {
  const grid = new SpatialGrid(900, 620, 126);
  const items = scatter(1500, 900, 620, 31);
  for (const it of items) grid.insert(it);
  for (const p of scatter(40, 900, 620, 5)) {
    const b = grid.nearBounds(p.x, p.y);
    const offered = new Set();
    grid.forEachNear(p.x, p.y, (it) => offered.add(it.i));
    for (const it of items) {
      // Offset of this item from the point, through whichever seam is nearer.
      const dx = wrapOffset(it.x - p.x, 900);
      const dy = wrapOffset(it.y - p.y, 620);
      const inBlock = dx >= b.left && dx < b.right && dy >= b.top && dy < b.bottom;
      assert.equal(offered.has(it.i), inBlock, `item ${it.i} at (${dx}, ${dy})`);
    }
  }
});

function wrapOffset(d, extent) {
  if (d > extent / 2) return d - extent;
  if (d < -extent / 2) return d + extent;
  return d;
}

// ---------------------------------------------------------------------------
// The artefact this fixes, pinned so it can be recognised if it comes back.
// ---------------------------------------------------------------------------

test("the old query is blind to part of the vision radius, and the new one isn't", () => {
  const cfg = makeConfig({});
  const cell = Math.max(40, cfg.visionRadius * 0.75);
  const grid = new SpatialGrid(cfg.width, cfg.height, cell);
  // A creature at the left edge of its cell, and a pellet 150px to its left:
  // well inside a vision radius of 168, and one cell and a bit away.
  const cx = 4 * cell;
  const target = { x: cx - 150, y: 310 };
  grid.insert(target);
  let found = 0;
  grid.forEachNear(cx + 1, 310, () => {
    found++;
  });
  assert.equal(found, 0, "the 3x3 block cannot see 150px away from this spot");
  grid.forEachWithin(cx + 1, 310, cfg.visionRadius, () => {
    found++;
  });
  assert.equal(found, 1, "a query for the real radius finds it");

  // ...and a creature two pixels to the left — across a cell boundary it cannot
  // perceive, one pixel *further* from the pellet — sees it perfectly well.
  // That is the whole complaint: sight depended on grid alignment.
  found = 0;
  grid.forEachNear(cx - 1, 310, () => {
    found++;
  });
  assert.equal(found, 1, "two pixels away, the same pellet is in plain sight");
});

test("exact vision is off by default and leaves worlds bit-for-bit unchanged", () => {
  assert.equal(DEFAULT_CONFIG.exactVision, false);
  assertUnaffected(
    new World(makeConfig({ seed: 21, exactVision: false })),
    new World(makeConfig({ seed: 21 })),
    1500,
    "exactVision"
  );
});

test("with exact vision on, a creature really sees everything within its radius", () => {
  const cfg = makeConfig({ seed: 8, exactVision: true });
  const world = new World(cfg);
  for (let i = 0; i < 900; i++) world.step();
  // Re-index at rest, the way step() does at the top of each tick, then ask the
  // same question two ways: through the grid, and by looking at every pellet.
  world.foodGrid.clear();
  for (const f of world.food.items) world.foodGrid.insert(f);
  let checked = 0;
  for (const c of world.creatures) {
    let gridBest = null;
    let gridD2 = cfg.visionRadius * cfg.visionRadius;
    world.foodGrid.forEachWithin(c.x, c.y, cfg.visionRadius, (f) => {
      if (f.eaten) return;
      const d2 = torusDist2(c.x, c.y, f.x, f.y, cfg.width, cfg.height);
      if (d2 < gridD2) {
        gridD2 = d2;
        gridBest = f;
      }
    });
    let bruteBest = null;
    let bruteD2 = cfg.visionRadius * cfg.visionRadius;
    for (const f of world.food.items) {
      if (f.eaten) continue;
      const d2 = torusDist2(c.x, c.y, f.x, f.y, cfg.width, cfg.height);
      if (d2 < bruteD2) {
        bruteD2 = d2;
        bruteBest = f;
      }
    }
    assert.equal(gridD2, bruteD2, "the nearest pellet in sight must be the nearest pellet");
    assert.equal(gridBest === null, bruteBest === null);
    checked++;
  }
  assert.ok(checked > 20, "the pond has to be alive for this to mean anything");
});

test("an exact-vision world is still a reproducible world", () => {
  const a = new World(makeConfig({ seed: 77, exactVision: true }));
  const b = new World(makeConfig({ seed: 77, exactVision: true }));
  for (let i = 0; i < 800; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.creatures.length, b.creatures.length);
  assert.ok(a.creatures.length > 0, "and a living one");
  for (let i = 0; i < a.creatures.length; i++) {
    assert.equal(a.creatures[i].x, b.creatures[i].x);
    assert.equal(a.creatures[i].energy, b.creatures[i].energy);
  }
  // Same seed, different sight: the trajectories must genuinely differ, or the
  // feature isn't doing anything and the tests above are measuring nothing.
  const off = new World(makeConfig({ seed: 77, exactVision: false }));
  for (let i = 0; i < 800; i++) off.step();
  const same = off.creatures.length === a.creatures.length &&
    off.creatures.every((c, i) => a.creatures[i] && c.x === a.creatures[i].x);
  assert.ok(!same, "exact vision must change what a pond does");
});

test("hearing stays covered on the darkest tick, where sight is shortest", () => {
  // Earshot doesn't shrink at night while sight does, so at 35% vision the ear
  // is by far the longest reach in the world. It is the query radius that has
  // to account for that — the old 3x3 block only covered it by the accident of
  // signalRadius being under one cell.
  const cfg = makeConfig({
    seed: 3,
    exactVision: true,
    signalling: true,
    dayNightCycle: true,
    foodStart: 0,
    foodSpawnRate: 0,
    populationStart: 0,
  });
  const world = new World(cfg);
  const grid = world.creatureGrid;
  grid.clear();
  const speaker = { x: 300, y: 300 };
  grid.insert(speaker);
  const listener = { x: 300 + cfg.signalRadius - 1, y: 300 };
  let heard = 0;
  const nightSight = cfg.visionRadius * 0.35;
  const reach = Math.max(nightSight, cfg.signalRadius);
  grid.forEachWithin(listener.x, listener.y, reach, (o) => {
    if (o === speaker) heard++;
  });
  assert.equal(heard, 1, "a voice inside signalRadius must reach the ear");
  assert.ok(nightSight < cfg.signalRadius, "the premise: night makes the ear the longer sense");
});
