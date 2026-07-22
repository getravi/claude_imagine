import { test } from "node:test";
import assert from "node:assert/strict";
import { NeuralNet } from "../src/nn.js";

test("weightCount matches the documented layout", () => {
  // 3 inputs, 4 hidden, 2 outputs:
  //   hidden weights 4*3 = 12, hidden biases 4,
  //   output weights 2*4 = 8, output biases 2  => 26
  assert.equal(NeuralNet.weightCount(3, 4, 2), 26);
});

test("constructor rejects a wrong-length weight vector", () => {
  assert.throws(() => new NeuralNet(3, 4, 2, new Float32Array(10)));
});

test("forward produces outputs in (-1, 1) via tanh", () => {
  const len = NeuralNet.weightCount(5, 6, 3);
  const w = new Float32Array(len);
  for (let i = 0; i < len; i++) w[i] = (i % 7) - 3; // arbitrary but large
  const net = new NeuralNet(5, 6, 3, w);
  const out = net.forward([1, 2, 3, 4, 5]);
  assert.equal(out.length, 3);
  for (const o of out) {
    assert.ok(o > -1 && o < 1, `output ${o} not in (-1, 1)`);
  }
});

test("a zero-weight network outputs exactly zero", () => {
  const net = new NeuralNet(4, 3, 2, new Float32Array(NeuralNet.weightCount(4, 3, 2)));
  const out = net.forward([9, -9, 3, 1]);
  for (const o of out) assert.equal(o, 0);
});

test("forward is deterministic and pure w.r.t. inputs", () => {
  const len = NeuralNet.weightCount(3, 3, 1);
  const w = new Float32Array(len);
  for (let i = 0; i < len; i++) w[i] = Math.sin(i);
  const net = new NeuralNet(3, 3, 1, w);
  const a = Array.from(net.forward([0.5, -0.2, 0.9]));
  const b = Array.from(net.forward([0.5, -0.2, 0.9]));
  assert.deepEqual(a, b);
});

test("a hand-built network computes the expected value", () => {
  // 1 input, 1 hidden, 1 output. Layout: [wIH, bH, wHO, bO].
  // hidden = tanh(2*1 + 0) = tanh(2)
  // out    = tanh(1*hidden + 0) = tanh(tanh(2))
  const w = new Float32Array([2, 0, 1, 0]);
  const net = new NeuralNet(1, 1, 1, w);
  const out = net.forward([1]);
  assert.ok(Math.abs(out[0] - Math.tanh(Math.tanh(2))) < 1e-6);
});
