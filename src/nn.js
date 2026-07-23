// nn.js — a tiny fixed-topology feed-forward neural network.
//
// Each creature's "brain" is one of these: it maps a vector of senses
// (food direction, neighbour direction, energy, an internal oscillator, ...)
// to a vector of motor commands (turn, thrust). The network's weights ARE the
// creature's genome — evolution searches weight-space, never touching the
// topology. This is deliberately the simplest thing that can produce
// interesting behaviour: no backpropagation, no learning within a lifetime.
// All adaptation happens across generations, through mutation and selection.
//
// Topology: inputs -> hidden (tanh) -> outputs (tanh). One hidden layer is
// enough to approximate the smooth sensor->action mappings good foraging needs,
// and keeping it fixed makes genomes trivially comparable and crossable.

/** tanh activation, squashing to (-1, 1). */
function tanh(x) {
  // Math.tanh exists in modern JS; kept explicit for clarity of intent.
  return Math.tanh(x);
}

export class NeuralNet {
  /**
   * @param {number} nIn - number of inputs
   * @param {number} nHidden - number of hidden neurons
   * @param {number} nOut - number of outputs
   * @param {Float32Array} [weights] - flat weight vector; random-ish if omitted
   */
  /**
   * @param {number} nIn
   * @param {number} nHidden
   * @param {number} nOut
   * @param {Float32Array} [weights] flat weight vector (see layout below)
   * @param {Float32Array} [plasticity] per-weight plasticity coefficients, same
   *   length/layout as weights. If provided together with `learn`, the network
   *   becomes *plastic*: its weights adapt each forward pass (within-lifetime
   *   learning). Omit for a static brain — the v1.0–v1.3 behaviour.
   * @param {{rate:number, decay:number, clamp:number}} [learn] learning params
   */
  constructor(nIn, nHidden, nOut, weights, plasticity = null, learn = null) {
    this.nIn = nIn;
    this.nHidden = nHidden;
    this.nOut = nOut;

    // Layout of the flat weight vector:
    //   [ hidden weights: nHidden * nIn ]
    //   [ hidden biases : nHidden       ]
    //   [ output weights: nOut * nHidden]
    //   [ output biases : nOut          ]
    this.wLen = nHidden * nIn + nHidden + nOut * nHidden + nOut;

    if (weights) {
      if (weights.length !== this.wLen) {
        throw new Error(
          `weight length ${weights.length} != expected ${this.wLen}`
        );
      }
      this.w = weights;
    } else {
      this.w = new Float32Array(this.wLen); // zeros; caller usually supplies genome
    }

    // Plasticity: when enabled, `w` is the *current* (learned) weight and drifts
    // over the creature's life; `wInit` is the inherited baseline it decays back
    // toward, and `plast` gates how much each connection learns.
    this.plastic = !!(plasticity && learn);
    if (this.plastic) {
      this.plast = plasticity;
      this.wInit = Float32Array.from(weights);
      this.learn = learn;
    }

    // Scratch buffers reused every tick to avoid per-frame allocation.
    this._hidden = new Float32Array(nHidden);
    this._out = new Float32Array(nOut);
  }

  /** Total number of trainable parameters for this topology. */
  static weightCount(nIn, nHidden, nOut) {
    return nHidden * nIn + nHidden + nOut * nHidden + nOut;
  }

  /**
   * Forward pass. `inputs` must have length nIn.
   * Returns the internal output buffer (length nOut) — do not retain it across
   * ticks, it is overwritten in place.
   * @param {ArrayLike<number>} inputs
   */
  forward(inputs) {
    const { w, nIn, nHidden, nOut, _hidden, _out } = this;
    let p = 0;

    // Hidden layer.
    for (let j = 0; j < nHidden; j++) {
      let sum = 0;
      for (let i = 0; i < nIn; i++) {
        sum += w[p++] * inputs[i];
      }
      _hidden[j] = sum; // biases added below after the weight block
    }
    for (let j = 0; j < nHidden; j++) {
      _hidden[j] = tanh(_hidden[j] + w[p++]);
    }

    // Output layer.
    for (let k = 0; k < nOut; k++) {
      let sum = 0;
      for (let j = 0; j < nHidden; j++) {
        sum += w[p++] * _hidden[j];
      }
      _out[k] = sum;
    }
    for (let k = 0; k < nOut; k++) {
      _out[k] = tanh(_out[k] + w[p++]);
    }

    if (this.plastic) this._learn(inputs);

    return _out;
  }

  /**
   * Within-lifetime learning. After a forward pass, nudge each plastic
   * connection by a Hebbian term (co-activation of the two neurons it joins,
   * gated by the connection's evolved plasticity coefficient) plus a decay term
   * pulling it back toward its inherited baseline. The decay keeps learning
   * bounded and reversible — a working memory, not runaway growth — and a hard
   * clamp is a final safety net. Biases are left static.
   */
  _learn(inputs) {
    const { w, wInit, plast, nIn, nHidden, nOut, _hidden, _out } = this;
    const { rate, decay, clamp } = this.learn;
    let p = 0;
    // Input → hidden connections.
    for (let j = 0; j < nHidden; j++) {
      const post = _hidden[j];
      for (let i = 0; i < nIn; i++) {
        let nw = w[p] + rate * plast[p] * inputs[i] * post + decay * (wInit[p] - w[p]);
        if (nw > clamp) nw = clamp;
        else if (nw < -clamp) nw = -clamp;
        w[p] = nw;
        p++;
      }
    }
    p += nHidden; // skip hidden biases (static)
    // Hidden → output connections.
    for (let k = 0; k < nOut; k++) {
      const post = _out[k];
      for (let j = 0; j < nHidden; j++) {
        let nw = w[p] + rate * plast[p] * _hidden[j] * post + decay * (wInit[p] - w[p]);
        if (nw > clamp) nw = clamp;
        else if (nw < -clamp) nw = -clamp;
        w[p] = nw;
        p++;
      }
    }
    // Output biases left untouched.
  }
}
