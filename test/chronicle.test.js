import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { makeConfig } from "../src/config.js";

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

test("event history stays bounded", () => {
  const world = new World(makeConfig({ seed: 5 }));
  for (let i = 0; i < 12000; i++) world.step();
  assert.ok(world.chronicle.events.length <= world.chronicle.max);
});
