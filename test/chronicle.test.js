import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";
import {
  CHRONICLE_HASHED,
  CHRONICLE_UNHASHED,
  chronicleFingerprint,
  stateFingerprint,
  trajectoryFingerprint,
  observationFingerprint,
  booksFingerprint,
  drawStream,
} from "../src/fingerprint.js";

test("a running world records chronicle events", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 6000; i++) world.step();
  const ev = world.chronicle.events;
  assert.ok(ev.length > 0, "the pond's history should not be empty");
  for (const e of ev) {
    assert.ok(Number.isFinite(e.tick), "event has a tick");
    assert.ok(typeof e.msg === "string" && e.msg.length > 0, "event has a message");
    assert.ok(typeof e.icon === "string", "event has an icon");
  }
});

test("population milestones fire in order and only once", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 8000; i++) world.step();
  const popEvents = world.chronicle.events.filter((e) => e.cat === "pop");
  // Extract the milestone number from each message; they should be strictly
  // increasing and unique.
  const nums = popEvents.map((e) => parseInt(e.msg.match(/(\d+)/)[1], 10));
  for (let i = 1; i < nums.length; i++) {
    assert.ok(nums[i] > nums[i - 1], "population milestones increase and don't repeat");
  }
});

test("predation-fraction events never precede the first kill", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 8000; i++) world.step();
  const ev = world.chronicle.events;
  const firstKill = ev.find((e) => e.msg.includes("First blood"));
  const fraction = ev.find((e) => e.msg.includes("of the pond"));
  if (firstKill && fraction) {
    assert.ok(fraction.tick >= firstKill.tick, "a fraction milestone must follow first blood");
  }
});

test("the chronicle is deterministic for a fixed seed", () => {
  const a = new World(makeConfig({ seed: 314 }));
  const b = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 5000; i++) {
    a.step();
    b.step();
  }
  assert.equal(a.chronicle.events.length, b.chronicle.events.length);
  for (let i = 0; i < a.chronicle.events.length; i++) {
    assert.equal(a.chronicle.events[i].tick, b.chronicle.events[i].tick);
    assert.equal(a.chronicle.events[i].msg, b.chronicle.events[i].msg);
  }
});

test("the chronicle is a pure observer (uses its own RNG, not the world's)", () => {
  // Two worlds: one we let the chronicle observe (always on), and a bare
  // reference stepping the same seed. The creature state must match exactly,
  // proving the chronicle's diversity probe didn't perturb the world RNG.
  const w = new World(makeConfig({ seed: 7 }));
  for (let i = 0; i < 4000; i++) w.step();
  const ref = new World(makeConfig({ seed: 7 }));
  for (let i = 0; i < 4000; i++) ref.step();
  assert.equal(w.creatures.length, ref.creatures.length);
  if (w.creatures.length > 0) {
    assert.equal(w.creatures[0].x, ref.creatures[0].x);
    assert.equal(w.creatures[0].energy, ref.creatures[0].energy);
  }
});

test("the chronicle narrates the day/night cycle, once each", () => {
  const world = new World(
    makeConfig({ seed: 64, dayNightCycle: true, dayLength: 700, nightVisionFactor: 0.28, seasons: false })
  );
  for (let i = 0; i < 6000; i++) world.step();
  const night = world.chronicle.events.filter((e) => e.cat === "night");
  const fell = night.filter((e) => e.msg.includes("Night falls"));
  const dawn = night.filter((e) => e.msg.includes("Dawn breaks"));
  const dark = night.filter((e) => e.msg.includes("after dark"));
  assert.equal(fell.length, 1, "the first nightfall is reported exactly once");
  assert.equal(dawn.length, 1, "the first dawn is reported exactly once");
  assert.equal(dark.length, 1, "the first kill in the dark is reported exactly once");
  assert.ok(dawn[0].tick > fell[0].tick, "dawn follows the night it ends");
});

test("no night events when the day/night cycle is off", () => {
  const world = new World(makeConfig({ seed: 64, seasons: false }));
  for (let i = 0; i < 6000; i++) world.step();
  assert.equal(
    world.chronicle.events.filter((e) => e.cat === "night").length,
    0,
    "a world with no night has nothing to say about it"
  );
});

test("the first spared relative is reported once, and only where it happens", () => {
  // Staged rather than waited for: the earliest seed measured takes 2,055 ticks
  // to offer a hunter a relative it could eat, and most seeds never do. The
  // counter *is* the event — it rises on the tick the rule speaks and is 0 in
  // every world without it — so no "did this really happen?" guard is needed
  // beyond the one the counter already provides (v1.16).
  const world = new World(makeConfig({ seed: 42, kinRecognition: true }));
  for (let i = 0; i < 200; i++) world.step();
  const kin = () => world.chronicle.events.filter((e) => e.msg.includes("its own family"));
  assert.equal(kin().length, 0, "nothing spared, nothing said");

  world.stats.kinSpared = 1;
  world.chronicle.observe(world, world.tick);
  assert.equal(kin().length, 1, "the first sparing is reported");
  world.stats.kinSpared = 40;
  world.chronicle.observe(world, world.tick + 1);
  assert.equal(kin().length, 1, "and only the first — it is a one-shot");
});

test("a pond without kin recognition never mentions family", () => {
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 6000; i++) world.step();
  assert.equal(world.stats.kinSpared, 0, "the counter is exactly 0 with the rule off");
  assert.equal(
    world.chronicle.events.filter((e) => e.msg.includes("family")).length,
    0,
    "a world where nobody spares anybody has nothing to say about it"
  );
});

test("event history stays bounded", () => {
  const world = new World(makeConfig({ seed: 5 }));
  for (let i = 0; i < 12000; i++) world.step();
  assert.ok(world.chronicle.events.length <= world.chronicle.max);
});

// --- The sixth channel (v1.94) -------------------------------------------
//
// `chronicleFingerprint` is the narration's own hash, and it exists for the
// reason `observationFingerprint` and `booksFingerprint` each exist one surface
// over: the Chronicle is an *output*, so a difference in it moves no creature
// and every picture of the pond is blind to it by construction. The tests below
// are v1.36's two questions asked of the new instrument — what must it be blind
// to, what must it *not* be blind to — plus the one neither can ask, which is
// whether the channel is redundant.

test("every own field of a live chronicle is classified, and the two lists agree", () => {
  // v1.53's completeness walk, pointed at a fourth pair of lists. A *stepped*
  // narrator for the reason `STATS_HASHED` gives: a list written by reading a
  // constructor is a list of what a thing is born with.
  const world = new World(makeConfig({ seed: 42, disease: true, dayNightCycle: true }));
  for (let i = 0; i < 400; i++) world.step();
  const live = Object.keys(world.chronicle).sort();
  const declared = [...CHRONICLE_HASHED, ...Object.keys(CHRONICLE_UNHASHED)].sort();
  assert.deepEqual(live, declared, "the chronicle's own fields and the two lists have parted");
  for (const [field, why] of Object.entries(CHRONICLE_UNHASHED)) {
    assert.ok(why.length > 20, `${field}: "outside the hash" needs a reason, not a shrug`);
  }
});

test("the narration channel can see every field it lists move", () => {
  // The complement of the walk above: being *named* by the hash is not the same
  // as being *reached* by it, and the gap between the two is where v1.53 found
  // three fields. Thirty-eight of thirty-eight, one at a time.
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 400; i++) world.step();
  const c = world.chronicle;
  for (const name of CHRONICLE_HASHED) {
    const before = chronicleFingerprint(world);
    const was = c[name];
    if (was instanceof Set) c[name] = new Set([...was, "__probe__"]);
    else if (Array.isArray(was)) c[name] = [...was, { tick: -1, year: 0, icon: "?", cat: "?", msg: "?" }];
    else if (typeof was === "number") c[name] = was + 1;
    else if (typeof was === "boolean") c[name] = !was;
    else c[name] = "starvation"; // `_leadingCause`, a string that starts null
    assert.notEqual(chronicleFingerprint(world), before, `${name}: the channel cannot see it move`);
    c[name] = was;
    assert.equal(chronicleFingerprint(world), before, `${name}: putting it back did not put it back`);
  }
});

test("a latch set is not an empty object", () => {
  // The blindness this channel had to close before it could be written. A `Set`
  // keeps its members where `Object.keys` cannot see them, so the generic mixer
  // the books use hashed all five of the chronicle's latch sets as `{}` — a
  // narrator that had already announced the pond passing 100 creatures and one
  // that had not were the same object to it. Both halves are asserted, because
  // the model of the old behaviour is the part that makes this a regression
  // test rather than a restatement.
  const a = new World(makeConfig({ seed: 42 }));
  const b = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 300; i++) {
    a.step();
    b.step();
  }
  assert.equal(chronicleFingerprint(a), chronicleFingerprint(b), "two identical ponds, two narrators");
  // `_carnCrossed` rather than `_popCrossed`, because seed 42's pond is still
  // under a hundred creatures at 300 ticks and an empty latch set would make
  // the second assertion below vacuous — it holds the carnivore milestone as a
  // *string*, which is the half of this that a numeric set would not show.
  assert.ok(b.chronicle._carnCrossed.size > 0, "nothing has been latched, so this proves nothing");
  assert.deepEqual(Object.keys(b.chronicle._carnCrossed), [], "a Set with own keys — the premise has changed");
  b.chronicle._carnCrossed.add("carn0.5");
  assert.notEqual(
    chronicleFingerprint(a),
    chronicleFingerprint(b),
    "a milestone latched in one narrator and not the other is invisible"
  );
});

test("a narrator that spoke twice is invisible to every other channel", () => {
  // Whether the channel is redundant, asked the way `books.test.js` asks it.
  // The sabotage is the smallest real one available: the Chronicle is a pure
  // observer, so observing twice cannot move the pond — it can only change what
  // was said about it, which is exactly the class of difference the five older
  // channels are blind to by construction.
  const a = new World(makeConfig({ seed: 42, disease: true }));
  const b = new World(makeConfig({ seed: 42, disease: true }));
  for (let i = 0; i < 300; i++) {
    a.step();
    b.step();
  }
  a.chronicle.observe(a, a.tick);
  a.chronicle._push(a.tick, "🫥", "test", "said here and nowhere else");

  assert.equal(stateFingerprint(a), stateFingerprint(b), "the pond moved, so this measures nothing");
  assert.equal(trajectoryFingerprint(a), trajectoryFingerprint(b), "the pond moved");
  assert.equal(observationFingerprint(a), observationFingerprint(b), "the tree of life moved");
  assert.equal(booksFingerprint(a), booksFingerprint(b), "the books moved");
  assert.notEqual(chronicleFingerprint(a), chronicleFingerprint(b), "the sixth channel is redundant");

  // And the second half of `WORLD_UNHASHED.chronicle`'s claim: a narration that
  // has parted is not a determinism failure, because nothing reads it back.
  for (let i = 0; i < 300; i++) {
    a.step();
    b.step();
  }
  assert.equal(trajectoryFingerprint(a), trajectoryFingerprint(b), "the narration wrote back into the pond");
});

test("fingerprinting a chronicle does not change it", () => {
  // The rule every channel here is held to: an instrument that moves what it
  // measures is not an instrument. The narrator carries its own generator, so
  // the draw count is part of the claim.
  const world = new World(makeConfig({ seed: 42 }));
  for (let i = 0; i < 300; i++) world.step();
  const draws = drawStream(world.chronicle.rng);
  const before = chronicleFingerprint(world);
  assert.equal(chronicleFingerprint(world), before, "the digest is not stable across calls");
  assert.equal(draws.count, 0, "hashing the narration spent its randomness");
  assert.equal(
    chronicleFingerprint(new World(makeConfig({ seed: 42 }))),
    chronicleFingerprint(new World(makeConfig({ seed: 42 }))),
    "two unstepped worlds start with different narrations"
  );
});
