// barriers.test.js — the rock, and the two promises it makes.
//
// The first promise is the ordinary one every opt-in feature here makes: a
// world without barriers is bit-for-bit the world every earlier version ran.
//
// The second is particular to this feature and is the one worth staging rather
// than waiting for: **the pond is never cut into pieces, and nothing is ever
// trapped in rock**. Both are properties of geometry, not of trajectories, so
// they are tested by walking the geometry — a grid flood-fill for the first, a
// point placed by hand inside a wall for the second — instead of by running a
// pond and hoping the bad case turns up. v1.45's lesson: stage the bug.

import test from "node:test";
import assert from "node:assert/strict";

import { BarrierField, blockedAt } from "../src/barriers.js";
import { makeConfig } from "../src/config.js";
import { World } from "../src/world.js";
import { Creature } from "../src/creature.js";
import { Genome } from "../src/genome.js";
import { RNG } from "../src/rng.js";

const walled = (over = {}) => makeConfig({ seed: 314, barriers: true, ...over });

test("a world without barriers is untouched, down to the last pellet", () => {
  const a = new World(makeConfig({ seed: 77 }));
  const b = new World(makeConfig({ seed: 77, barriers: false }));
  for (let i = 0; i < 500; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.barriers, null, "no field is built");
  assert.equal(a.creatures.length, b.creatures.length);
  for (let i = 0; i < a.creatures.length; i++) {
    assert.equal(a.creatures[i].x, b.creatures[i].x);
    assert.equal(a.creatures[i].y, b.creatures[i].y);
    assert.equal(a.creatures[i].energy, b.creatures[i].energy);
  }
  // The food array too: v1.18's lesson, that a feature touching a collection no
  // test has ever compared needs that collection compared element by element.
  assert.equal(a.food.items.length, b.food.items.length);
  for (let i = 0; i < a.food.items.length; i++) {
    assert.equal(a.food.items[i].x, b.food.items[i].x);
    assert.equal(a.food.items[i].y, b.food.items[i].y);
  }
  assert.equal(a.stats.walled, 0, "the counter reads exactly zero with no rock");
});

test("the layout costs the world RNG nothing to build", () => {
  // The field takes a config and no RNG at all — the layout comes from an
  // integer hash of the seed — so a world's stream cannot depend on whether one
  // was constructed. Pinned by building fields between draws and checking the
  // sequence is the one the RNG would have given on its own.
  const config = walled();
  const plain = new RNG(config.seed);
  const expected = [plain.float(), plain.float(), plain.float()];

  const interleaved = new RNG(config.seed);
  const got = [];
  for (let i = 0; i < 3; i++) {
    new BarrierField(config);
    got.push(interleaved.float());
  }
  assert.deepEqual(got, expected);
});

test("the same seed gives the same rock, and different seeds do not", () => {
  const a = new BarrierField(walled());
  const b = new BarrierField(walled());
  const c = new BarrierField(walled({ seed: 315 }));
  const sample = (f) => f.walls.map((w) => `${w.vertical}:${w.pos.toFixed(6)}:${w.gaps.join(",")}`).join("|");
  assert.equal(sample(a), sample(b));
  assert.notEqual(sample(a), sample(c));
});

test("what is drawn is exactly what is solid", () => {
  // An aggregate is not a test of a tiling (v1.24, and again in v1.42): "the
  // rectangles add up to the blocked area" is satisfied by a gap on one side
  // paying for an overlap on the other. Walk a grid instead and check the two
  // answers agree cell by cell.
  const config = walled();
  const field = new BarrierField(config);
  const rects = field.rects();
  for (const r of rects) {
    assert.ok(r.x >= 0 && r.y >= 0, "a rectangle starts outside the world");
    assert.ok(r.x + r.w <= config.width + 1e-9, "a rectangle runs past the right edge");
    assert.ok(r.y + r.h <= config.height + 1e-9, "a rectangle runs past the bottom edge");
    assert.ok(r.w > 0 && r.h > 0, "an empty rectangle");
  }
  const inAnyRect = (x, y) =>
    rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  let checked = 0;
  for (let y = 0.5; y < config.height; y += 1.5) {
    for (let x = 0.5; x < config.width; x += 1.5) {
      assert.equal(
        inAnyRect(x, y),
        field.blocked(x, y),
        `the picture and the rule disagree at (${x}, ${y})`
      );
      checked++;
    }
  }
  assert.ok(checked > 100000, `only walked ${checked} points`);
});

test("a wall wraps, because this world still has no edges", () => {
  // A slab pushed onto the seam is one slab seen from two sides, not two walls.
  const config = walled({ barrierCount: 1, barrierThickness: 20, barrierGaps: 0 });
  const field = new BarrierField(config);
  field.walls[0].pos = 0; // straddling x = 0 by half its thickness either way
  assert.ok(field.blocked(1, 100), "blocked just inside the right of the seam");
  assert.ok(field.blocked(config.width - 1, 100), "blocked just inside the left of it");
  assert.ok(!field.blocked(config.width / 2, 100), "and open on the far side of the world");
  const rects = field.rects();
  assert.equal(rects.length, 2, "a straddling slab draws as the two pieces a rectangle can");
  for (const r of rects) assert.ok(r.x >= 0 && r.x + r.w <= config.width + 1e-9);
});

test("the pond is one pond: no room is ever sealed off", () => {
  // The invariant that makes this a *landscape* rather than a set of aquaria. A
  // flood fill over the open water on a 4px grid must reach all of it from any
  // one cell; a wall whose gate was placed underneath another wall would show
  // up here as a second component, and nothing else in the suite would notice.
  for (const seed of [1, 13, 77, 314, 512, 1234]) {
    for (const gaps of [1, 2]) {
      const config = walled({ seed, barrierGaps: gaps });
      const field = new BarrierField(config);
      const step = 4;
      const cols = Math.floor(config.width / step);
      const rows = Math.floor(config.height / step);
      const open = new Uint8Array(cols * rows);
      let total = 0;
      let start = -1;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const free = !field.blocked((i + 0.5) * step, (j + 0.5) * step);
          if (free) {
            open[j * cols + i] = 1;
            total++;
            if (start < 0) start = j * cols + i;
          }
        }
      }
      const seen = new Uint8Array(cols * rows);
      const queue = [start];
      seen[start] = 1;
      let reached = 0;
      while (queue.length) {
        const k = queue.pop();
        reached++;
        const i = k % cols;
        const j = (k - i) / cols;
        const neighbours = [
          [(i + 1) % cols, j],
          [(i - 1 + cols) % cols, j],
          [i, (j + 1) % rows],
          [i, (j - 1 + rows) % rows],
        ];
        for (const [ni, nj] of neighbours) {
          const nk = nj * cols + ni;
          if (open[nk] && !seen[nk]) {
            seen[nk] = 1;
            queue.push(nk);
          }
        }
      }
      assert.equal(
        reached,
        total,
        `seed ${seed}, ${gaps} gate(s): the open water is in more than one piece ` +
          `(${reached} of ${total} cells reachable)`
      );
    }
  }
});

test("rock refuses one component and keeps the other — which is what sliding is", () => {
  // Staged rather than waited for: one wall, one point, three moves.
  const config = walled({ barrierCount: 1, barrierThickness: 20, barrierGaps: 0 });
  const field = new BarrierField(config);
  const w = field.walls[0];
  w.pos = 400; // a north-south slab from x=390 to x=410
  const y = 100;

  // Straight at it: refused, and the creature stays exactly where it was. Only
  // the x component is reported stopped, because only the x component moved —
  // the y half of the step was zero and was granted.
  const head = field.resolve(380, y, 395, y);
  assert.deepEqual({ x: head.x, y: head.y }, { x: 380, y });
  assert.ok(head.stoppedX, "the component into the rock is refused");

  // Diagonally at it: the x half is refused and the y half is kept. This is the
  // whole of "finding a gate" — nothing perceives the wall, it just runs along.
  const slide = field.resolve(380, y, 395, y + 6);
  assert.equal(slide.x, 380, "the component into the rock is dropped");
  assert.equal(slide.y, y + 6, "the component along it survives");
  assert.ok(slide.stoppedX && !slide.stoppedY);

  // Parallel to it, in open water: untouched.
  const free = field.resolve(380, y, 380, y + 6);
  assert.deepEqual({ x: free.x, y: free.y }, { x: 380, y: y + 6 });
  assert.ok(!free.stoppedX && !free.stoppedY);
});

test("nothing is ever trapped: a body inside rock can always walk out", () => {
  const config = walled({ barrierCount: 1, barrierThickness: 20, barrierGaps: 0 });
  const field = new BarrierField(config);
  field.walls[0].pos = 400;
  // Standing in the middle of the slab — reachable by switching barriers on
  // under a running pond, or by a future rule that moves something.
  const out = field.resolve(400, 100, 402, 100);
  assert.deepEqual({ x: out.x, y: out.y }, { x: 402, y: 100 });
  assert.ok(!out.stoppedX && !out.stoppedY, "a stranded creature is refused nothing");
});

test("eject moves a point out of rock and leaves every other point alone", () => {
  const config = walled();
  const field = new BarrierField(config);
  let moved = 0;
  for (let y = 3; y < config.height; y += 7) {
    for (let x = 3; x < config.width; x += 7) {
      const p = field.eject(x, y);
      assert.ok(!field.blocked(p.x, p.y), `ejected (${x}, ${y}) is still in rock`);
      assert.ok(p.x >= 0 && p.x < config.width && p.y >= 0 && p.y < config.height);
      if (field.blocked(x, y)) moved++;
      else assert.deepEqual(p, { x, y }, "open water is returned untouched");
    }
  }
  assert.ok(moved > 100, `the sweep never landed in rock (${moved} ejections)`);
});

test("a walled pond keeps nothing in its walls — no creature, no pellet, ever", () => {
  // The reachability contract. A pellet inside rock could never be eaten, so it
  // would sit in `foodMax` forever and the standing crop would quietly shrink by
  // the share of the world that is walled.
  const world = new World(walled({ seed: 13 }));
  for (let i = 0; i < 2500; i++) {
    world.step();
    if (i % 100 !== 0) continue;
    for (const c of world.creatures) {
      assert.ok(!world.barriers.blocked(c.x, c.y), `a creature is inside rock at tick ${i}`);
    }
    for (const f of world.food.items) {
      assert.ok(!world.barriers.blocked(f.x, f.y), `a pellet is inside rock at tick ${i}`);
    }
  }
  assert.ok(world.stats.walled > 0, "rock that never refuses anything is not rock");
});

test("switching the rock on under a living pond clears the ground it lands on", () => {
  const config = makeConfig({ seed: 42 });
  const world = new World(config);
  for (let i = 0; i < 600; i++) world.step();
  config.barriers = true;
  world.syncBarriers();
  for (const c of world.creatures) assert.ok(!world.barriers.blocked(c.x, c.y));
  for (const f of world.food.items) assert.ok(!world.barriers.blocked(f.x, f.y));
  // And switching it off drops the field outright, so no renderer can keep
  // drawing a layout the simulation has stopped obeying.
  config.barriers = false;
  world.syncBarriers();
  assert.equal(world.barriers, null);
  assert.equal(world.food.barriers, null);
});

test("the crop is moved by the walls, not shrunk by them", () => {
  // Terrain's v1.23 contract, restated for rock: every pellet the world sows
  // becomes a pellet somewhere a creature can reach. Asserted on the field
  // directly rather than on two ponds, because the walled pond eats less (it
  // has fewer creatures in reach of any given pellet) and therefore *sows* less
  // once its crop is at the cap — a difference in the crop's fate, not in the
  // contract.
  const config = walled({ seed: 1234 });
  const field = new BarrierField(config);
  const world = new World(config);
  const before = world.food.items.length;
  for (let i = 0; i < 200; i++) world.food.spawnAnywhere();
  assert.equal(world.food.items.length, before + 200, "every sowing produced a pellet");
  for (const f of world.food.items) {
    assert.ok(!field.blocked(f.x, f.y), "a pellet was sown inside rock");
  }
});

test("blockedAt is an exact false without a field", () => {
  assert.equal(blockedAt(null, 10, 10), false);
  assert.equal(blockedAt(undefined, 10, 10), false);
  const field = new BarrierField(walled());
  assert.equal(blockedAt(field, 10, 10), field.blocked(10, 10));
});

test("act() without a field is the integration every earlier version ran", () => {
  // The creature-level half of the determinism promise: same brain, same
  // outputs, same physics, barriers argument omitted.
  const config = makeConfig({ seed: 5 });
  const rng = new RNG(5);
  const make = () => new Creature(Genome.random(new RNG(9)), config, 100, 100, new RNG(11), 0);
  const a = make();
  const b = make();
  for (let i = 0; i < 50; i++) {
    a.act([0.2, 0.8, 0]);
    b.act([0.2, 0.8, 0], null);
  }
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.equal(a.walled, false);
  assert.ok(rng.float() >= 0); // the helper RNGs above are the only ones in play
});

test("the walls really do un-mix the pond", () => {
  // The claim the feature exists to make, and the reason it is not terrain with
  // a bigger number. v1.23 measured a movement *cost* at a ground bias of -0.003
  // and diagnosed the failure as a timescale: a creature crosses this world many
  // times over in a lifetime, so anything local averages away before selection
  // can act on it. Rock attacks the timescale directly.
  //
  // Measured as the rate at which creatures change room — the thing a wall is
  // for — rather than as net displacement, which turned out to move in *both*
  // directions across seeds and would have pinned noise. The same imaginary room
  // lines are used in both arms, so the statistic is asking one question of two
  // worlds. Rock cuts the crossing rate by 3-6x on the seeds below; this asserts
  // a halving, which is well inside the margin and cannot flake.
  const roomsOf = (field) => {
    const vs = field.walls.filter((w) => w.vertical).map((w) => w.pos).sort((a, b) => a - b);
    const hs = field.walls.filter((w) => !w.vertical).map((w) => w.pos).sort((a, b) => a - b);
    const band = (v, lines) => {
      if (lines.length < 2) return 0;
      let k = 0;
      for (const p of lines) if (v >= p) k++;
      return k % lines.length;
    };
    return (x, y) => band(x, vs) * 10 + band(y, hs);
  };

  const crossingRate = (on, seed) => {
    const config = makeConfig({ seed, barriers: on });
    const world = new World(config);
    const room = roomsOf(world.barriers ?? new BarrierField(walled({ seed })));
    const prev = new Map();
    let moves = 0;
    let turns = 0;
    for (let i = 1; i <= 2000; i++) {
      world.step();
      if (i < 500) continue; // let the founders spread out first
      for (const c of world.creatures) {
        const r = room(c.x, c.y);
        const p = prev.get(c.id);
        if (p !== undefined) {
          turns++;
          if (p !== r) moves++;
        }
        prev.set(c.id, r);
      }
    }
    return turns ? (moves / turns) * 1e4 : 0;
  };

  for (const seed of [314, 77]) {
    const open = crossingRate(false, seed);
    const rock = crossingRate(true, seed);
    assert.ok(open > 0 && rock >= 0, `seed ${seed}: nothing moved at all`);
    assert.ok(
      rock < open / 2,
      `seed ${seed}: rock should more than halve the room-crossing rate ` +
        `(open ${open.toFixed(1)}, walled ${rock.toFixed(1)} per 10k creature-turns)`
    );
  }
});

// --- Opaque rock (v1.50) ------------------------------------------------------
//
// The rule is one predicate — `occluded` — and everything below is an attempt to
// break it in a way a running pond would not. The geometry is exact rather than
// sampled, so the first test is the one that matters: it is checked against the
// dumbest possible implementation, a walk along the segment asking `blocked()`
// several thousand times. Two rules that were written independently and agree on
// forty thousand segments is a stronger claim than either of them alone.

/** A deterministic stream, so the segments below are the same on every run and engine. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The middle of a wall's widest solid run — a place it is definitely rock. */
function deepRock(wall) {
  let best = { at: 0, len: -1 };
  for (let i = 0; i < wall.runs.length; i += 2) {
    const len = wall.runs[i + 1] - wall.runs[i];
    if (len > best.len) best = { at: (wall.runs[i] + wall.runs[i + 1]) / 2, len };
  }
  return best.at;
}

test("the occlusion rule agrees with walking the segment and asking", () => {
  // No trigonometry anywhere in the sample: `Math.cos` is implementation-defined
  // (v1.36), and a test that generates its own cases must not depend on the one
  // thing this project has already had to name as a precondition.
  for (const seed of [314, 77]) {
    const cfg = walled({ seed });
    const f = new BarrierField(cfg);
    const STEPS = 8000; // ~0.05 px, fine enough to catch a corner clipped in passing
    const march = (ax, ay, dx, dy) => {
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS;
        if (f.blocked(ax + t * dx, ay + t * dy)) return true;
      }
      return false;
    };
    const rnd = lcg(seed * 7919 + 1);
    let tested = 0;
    let hidden = 0;
    for (let i = 0; i < 500; i++) {
      const ax = rnd() * cfg.width;
      const ay = rnd() * cfg.height;
      const dx = (rnd() - 0.5) * 400;
      const dy = (rnd() - 0.5) * 400;
      if (f.blocked(ax, ay)) continue;
      tested++;
      const exact = f.occluded(ax, ay, ax + dx, ay + dy);
      if (exact) hidden++;
      assert.equal(exact, march(ax, ay, dx, dy), `seed ${seed}, segment ${i}`);
    }
    // ...and the sample has to contain both answers, or the agreement above is
    // an agreement about nothing.
    assert.ok(tested > 300, `only ${tested} usable segments on seed ${seed}`);
    assert.ok(hidden > 50 && hidden < tested - 50, `${hidden}/${tested} hidden on seed ${seed}`);
  }
});

test("rock hides nothing from someone standing in it", () => {
  // The same decision `resolve()` makes for movement: barriers can be switched
  // on under a living pond, and a creature the walls closed around should walk
  // out rather than go blind. It makes the relation asymmetric, and only for as
  // long as it takes the stranded one to leave.
  const cfg = walled();
  const f = new BarrierField(cfg);
  const w = f.walls[0];
  const inside = { x: w.pos, y: deepRock(w) };
  assert.ok(f.blocked(inside.x, inside.y), "the staged point is inside rock");
  const outside = { x: w.pos + w.half + 60, y: inside.y };
  assert.ok(!f.blocked(outside.x, outside.y), "the other point is not");
  assert.equal(f.occluded(inside.x, inside.y, outside.x, outside.y), false);
  assert.equal(f.occluded(outside.x, outside.y, inside.x, inside.y), true);
});

test("the overlay is the rule plotted, not a drawing about it", () => {
  // v1.32's lesson in its general form: a picture that "should" agree with the
  // rule eventually does not. `visibleRadii` is `firstHit` and nothing else, so
  // this asserts the two cannot part — just inside each drawn distance is
  // visible, just past it is not.
  const cfg = walled();
  const f = new BarrierField(cfg);
  const R = cfg.visionRadius;
  const rays = 64;
  let shadowed = 0;
  for (const [x, y] of [
    [f.walls[0].pos + f.walls[0].half + 20, f.walls[0].gaps[0] + 90],
    [cfg.width * 0.5, cfg.height * 0.25],
    [cfg.width * 0.8, cfg.height * 0.6],
  ]) {
    if (f.blocked(x, y)) continue;
    const radii = f.visibleRadii(x, y, R, rays);
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const d = radii[i];
      assert.ok(d >= 0 && d <= R, `ray ${i} reaches ${d}`);
      assert.equal(f.occluded(x, y, x + ux * (d - 1), y + uy * (d - 1)), false, `inside ray ${i}`);
      if (d < R - 1) {
        shadowed++;
        assert.equal(f.occluded(x, y, x + ux * (d + 1), y + uy * (d + 1)), true, `past ray ${i}`);
      }
    }
  }
  assert.ok(shadowed > 10, `only ${shadowed} rays met rock — nothing was tested`);
});

test("opaque rock without any rock is exactly the world without it", () => {
  // The flag composes with the one it depends on, and the dependency is the
  // whole of it: no walls, no shadows, no difference of any kind.
  const a = new World(makeConfig({ seed: 21 }));
  const b = new World(makeConfig({ seed: 21, barrierOcclusion: true }));
  for (let i = 0; i < 300; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.creatures.length, b.creatures.length);
  for (let i = 0; i < a.creatures.length; i++) {
    assert.equal(a.creatures[i].x, b.creatures[i].x);
    assert.equal(a.creatures[i].y, b.creatures[i].y);
  }
});

test("a wall between a creature and a pellet is a pellet it cannot see", () => {
  // Staged, not waited for. One creature, one pellet, one wall, one tick, in
  // both arms — which names the exact state that produces the behaviour instead
  // of describing how often a real pond happens to reach it.
  const stage = (occlusion) => {
    const w = new World(walled({ barrierOcclusion: occlusion }));
    const wall = w.barriers.walls.find((v) => v.vertical);
    // Either side of the rock, deep in a solid run rather than beside a gate.
    const y = deepRock(wall);
    const x = wall.pos - wall.half - 25;
    const fx = wall.pos + wall.half + 25;
    assert.ok(!w.barriers.blocked(x, y) && !w.barriers.blocked(fx, y), "staged in open water");
    assert.ok(w.barriers.occluded(x, y, fx, y), "staged with rock between them");
    const c = new Creature(Genome.random(new RNG(9)), w.config, x, y, new RNG(1), 0);
    c.heading = 0;
    w.creatures = [c];
    w.food.items = [{ x: fx, y, eaten: false, radius: 3 }];
    w.step();
    return c._in[4]; // food proximity, 0 when there is no pellet in sight
  };
  const seen = stage(false);
  assert.ok(seen > 0, `the transparent arm should see the pellet, read ${seen}`);
  assert.equal(stage(true), 0, "opaque rock left a pellet visible through a wall");
});

test("a wall between two creatures is a wall the pathogen does not cross", () => {
  // Contagion is the one sense that spends a random number on the answer, so the
  // occlusion test has to come *before* the roll — otherwise the walls would
  // move an epidemic in every world they merely stand in. Staged at
  // infectionChance 1, where the only thing that can prevent a case is the rock.
  const stage = (occlusion) => {
    const w = new World(
      walled({ disease: true, infectionChance: 1, barrierOcclusion: occlusion })
    );
    const wall = w.barriers.walls.find((v) => v.vertical);
    const y = deepRock(wall);
    const gap = wall.half + 3; // inside infectionRadius (22), either side of 14px of rock
    const a = new Creature(Genome.random(new RNG(9)), w.config, wall.pos - gap, y, new RNG(1), 0);
    const b = new Creature(Genome.random(new RNG(3)), w.config, wall.pos + gap, y, new RNG(2), 0);
    assert.ok(!w.barriers.blocked(a.x, a.y) && !w.barriers.blocked(b.x, b.y));
    a.infected = true;
    a.infectedAtAge = 0;
    w.creatures = [a, b];
    w.step();
    return b.infected;
  };
  assert.equal(stage(false), true, "the transparent arm should infect through rock");
  assert.equal(stage(true), false, "opaque rock let the pathogen through a wall");
});
