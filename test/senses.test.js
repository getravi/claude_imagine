// senses.test.js — the sixteen wires into a brain, priced.
//
// Four claims, and the last one is the one that found something.
//
//   1. **The arithmetic.** A sway is a finite difference across one channel's
//      declared range with every other sense held. The check is a
//      hand-computable net rather than a second implementation of the same
//      loop, which would agree with a bug (v1.0's `tanh(tanh(2))`, still the
//      habit).
//   2. **The domain.** A channel with no range to walk is not a sense and is
//      not in the ranking; the ranking's length is a fact about the *config*,
//      because the aux toggles add channels.
//   3. **Purity.** Pricing a brain must not move the pond, must not touch the
//      creature's own input buffer, and must not teach a plastic brain — the
//      same three the Underfoot row has answered since v1.33.
//   4. **Declared against occupied.** `INPUT_CHANNELS` states the range each
//      channel is *written* to occupy. v1.71's lesson is that a declared range
//      and the range a pond actually visits are different measurements, and two
//      of these sixteen cannot reach their ceilings for reasons that are pure
//      arithmetic on `config.js`: a creature splits before it can fill, and
//      terminal speed under full thrust is barely half of `maxSpeed`. Both are
//      pinned here, so raising a constant that wakes either one is a red build.

import { test } from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/world.js";
import { makeConfig, DEFAULT_CONFIG } from "../src/config.js";
import { NeuralNet } from "../src/nn.js";
import { BRAIN } from "../src/genome.js";
import { stateFingerprint } from "../src/fingerprint.js";
import {
  INPUT_CHANNELS,
  channelSway,
  senseSways,
  steeringText,
  occupiedRanges,
} from "../src/senses.js";

/** A creature-shaped thing: the three fields a sway reads and nothing else. */
function subject(brain, inputs = null) {
  const _in = new Float32Array(brain.nIn);
  _in[0] = 1;
  if (inputs) _in.set(inputs);
  return { _in, _aux: new Float32Array(3), brain, config: DEFAULT_CONFIG };
}

test("a sway is the finite difference it says it is", () => {
  // One hidden neuron, wired to exactly one input, feeding exactly the turn
  // command. Walking channel 2 from -1 to 1 gives turn = tanh(tanh(±1)) and
  // thrust = tanh(0) = 0 at both ends, so the mean of the two absolute changes
  // is |tanh(tanh(1))| — a number this test can state rather than recompute.
  const nIn = BRAIN.inputs;
  const w = new Float32Array(NeuralNet.weightCount(nIn, 1, 3));
  w[2] = 1; // input 2 -> the single hidden neuron
  w[nIn + 1] = 1; // hidden -> output 0 (turn); the hidden bias sits at nIn
  const c = subject(new NeuralNet(nIn, 1, 3, w));
  const expected = Math.tanh(Math.tanh(1));
  assert.ok(Math.abs(channelSway(c, INPUT_CHANNELS[2]) - expected) < 1e-6);
  // And a channel this brain is deaf to moves nothing at all.
  assert.equal(channelSway(c, INPUT_CHANNELS[3]), 0);
});

test("the swept channel is the only thing that moves, and it is put back", () => {
  const nIn = BRAIN.inputs;
  const w = new Float32Array(NeuralNet.weightCount(nIn, 4, 3)).fill(0.3);
  const c = subject(new NeuralNet(nIn, 4, 3, w), [1, 0.25, -0.5, 0.75]);
  const before = Float32Array.from(c._in);
  for (const ch of INPUT_CHANNELS) channelSway(c, ch);
  assert.deepEqual(Array.from(c._in), Array.from(before));
});

test("a channel with no range to walk is not a sense", () => {
  const bias = INPUT_CHANNELS[0];
  assert.equal(bias.name, "bias");
  assert.equal(bias.lo, bias.hi, "the bias is a constant, not a perception");

  const world = new World(makeConfig({ seed: 314 }));
  for (let i = 0; i < 200; i++) world.step();
  const c = world.creatures[0];
  const ranked = senseSways(c, world.config);
  assert.equal(ranked.length, BRAIN.inputs - 1, "fifteen of sixteen have a range");
  assert.ok(!ranked.some((s) => s.name === "bias"));
  // Sorted, and every name distinct — a ranking with a repeat is a table that
  // has drifted from the vector it describes.
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].sway >= ranked[i].sway);
  assert.equal(new Set(ranked.map((s) => s.name)).size, ranked.length);

  // The count at the end of the row is a fact about the config: each auxiliary
  // sense that is on is one more thing this creature steers by.
  const loud = { ...world.config, signalling: true, groundSense: true, wallSense: true };
  assert.equal(senseSways(c, loud).length, BRAIN.inputs - 1 + 3);
  assert.match(steeringText(c, loud), /— strongest 3 of 18$/);
  assert.match(steeringText(c, world.config), /^.+ \d\.\d\d · .+ \d\.\d\d · .+ \d\.\d\d — strongest 3 of 15$/);
});

test("a brain that answers to nothing gets a word, not three zeroes", () => {
  const nIn = BRAIN.inputs;
  const c = subject(new NeuralNet(nIn, 4, 3, new Float32Array(NeuralNet.weightCount(nIn, 4, 3))));
  assert.equal(steeringText(c, DEFAULT_CONFIG), "nothing moves its motors — all 15 senses sway under 0.01");
});

test("pricing the senses moves neither the pond nor a plastic brain", () => {
  const world = new World(makeConfig({ seed: 77, plasticity: true, signalling: true }));
  for (let i = 0; i < 300; i++) world.step();
  const before = stateFingerprint(world);
  const weights = world.creatures.map((c) => Float32Array.from(c.brain.w));
  for (const c of world.creatures) steeringText(c, world.config);
  assert.equal(stateFingerprint(world), before, "reading the panel moved the world");
  world.creatures.forEach((c, i) => {
    assert.deepEqual(Array.from(c.brain.w), Array.from(weights[i]), "a hypothetical taught the brain");
  });
});

test("every channel stays inside the range the table declares for it", () => {
  // Including the newborns: a creature that has not sensed yet still reads 1 at
  // the bias, because that slot is set when the body is made rather than on its
  // first tick. Fifteen creature-frames of 23,598 read 0 there before v1.110,
  // and the panel can be pointed at one of them by pausing on a birth.
  for (const seed of [314, 13]) {
    const world = new World(makeConfig({ seed }));
    for (let t = 0; t < 900; t++) {
      world.step();
      for (const r of occupiedRanges(world.creatures)) {
        const ch = INPUT_CHANNELS.find((k) => k.name === r.name);
        assert.ok(
          r.min >= ch.lo - 1e-6 && r.max <= ch.hi + 1e-6,
          `seed ${seed} t${t}: ${r.name} occupied [${r.min}, ${r.max}], declared [${ch.lo}, ${ch.hi}]`
        );
      }
    }
  }
});

test("two channels cannot reach their ceilings, and both reasons are arithmetic", () => {
  const cfg = DEFAULT_CONFIG;

  // Speed. `act()` accelerates by `thrustAccel` and keeps `drag` of the result,
  // so a creature at full thrust in a straight line converges on
  // thrustAccel*drag/(1-drag) — 1.351 px/tick, 51.98% of `maxSpeed`. Nothing
  // else in this project writes a velocity, so the clamp inside `act()` has
  // never fired in any world it can build, and the top half of the "own speed"
  // channel is unreachable by construction rather than by ecology.
  const terminal = (cfg.thrustAccel * cfg.drag) / (1 - cfg.drag);
  assert.ok(terminal < cfg.maxSpeed, "the speed clamp is live again — see v1.110");
  assert.ok(Math.abs(terminal / cfg.maxSpeed - 0.5198) < 5e-4);

  // Energy. A creature splits the moment it passes `reproduceThreshold`, which
  // is below `energyMax` — the config has said since v1.38 that the ceiling is
  // never reached, and this is what that costs the brain: "how fed" is
  // `(energy / energyMax) * 2 - 1`, so its top 27.3% is a state no living
  // creature can be sensed in.
  const fedCeiling = (cfg.reproduceThreshold / cfg.energyMax) * 2 - 1;
  assert.ok(cfg.reproduceThreshold < cfg.energyMax);
  assert.ok(Math.abs(fedCeiling - 0.4545) < 5e-4);

  const world = new World(makeConfig({ seed: 314 }));
  let speed = -Infinity;
  let fed = -Infinity;
  for (let t = 0; t < 900; t++) {
    world.step();
    for (const c of world.creatures) {
      if (c.age === 0) continue; // has not sensed; its buffer is all zeroes
      speed = Math.max(speed, c._in[11]);
      fed = Math.max(fed, c._in[1]);
    }
  }
  assert.ok(speed > 0.4, "nothing in this pond moved, which is not what is being tested");
  assert.ok(speed <= terminal / cfg.maxSpeed + 1e-6, `speed channel reached ${speed}`);
  assert.ok(fed <= fedCeiling + 1e-6, `fed channel reached ${fed}`);
});
