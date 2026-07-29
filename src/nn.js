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
   * @param {Float32Array} [auxW] one extra weight per hidden neuron per extra
   *   scalar sense supplied at call time (see `forward`), the senses laid out
   *   one after another. Omit for the plain topology — when it is null the
   *   forward pass performs exactly the arithmetic it always has, in the same
   *   order.
   */
  constructor(nIn, nHidden, nOut, weights, plasticity = null, learn = null, auxW = null) {
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

    // Optional extra senses with their own weights, kept outside `w` so the main
    // weight vector — and therefore the genome, and therefore every seed — keeps
    // the length and layout it has had since v1.0. Null means "no such sense",
    // and costs one untaken branch per forward pass.
    this.auxW = auxW;
    this.nAux = auxW ? auxW.length / nHidden : 0;
    if (auxW && !Number.isInteger(this.nAux)) {
      throw new Error(`aux weight length ${auxW.length} is not a multiple of ${nHidden}`);
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
   * @param {number|ArrayLike<number>} [aux] value(s) of the extra scalar senses,
   *   in the same order as the blocks of `auxW`. A bare number is accepted for
   *   the single-sense case. Ignored unless the net was built with `auxW`, so
   *   callers can always pass it.
   * @param {boolean} [learning] set false to run the pass without letting a
   *   plastic brain learn from it. The simulation never passes it; it exists so
   *   an *observer* can ask a brain a hypothetical question — "what would you do
   *   on rough ground?" — without that question becoming part of the creature's
   *   experience. A view that alters what it is looking at is not a view.
   */
  forward(inputs, aux = 0, learning = true) {
    const { w, nIn, nHidden, nOut, auxW, _hidden, _out } = this;
    let p = 0;

    // Hidden layer.
    for (let j = 0; j < nHidden; j++) {
      let sum = 0;
      for (let i = 0; i < nIn; i++) {
        sum += w[p++] * inputs[i];
      }
      _hidden[j] = sum; // biases added below after the weight block
    }
    // The extra senses, if this net has any, join the hidden layer here — after
    // the weight block so `p` still walks the classic layout untouched. The
    // single-sense case keeps its own loop so that a net built before there was
    // more than one performs bit-for-bit the arithmetic it did then.
    if (auxW) {
      if (this.nAux === 1) {
        const a = typeof aux === "number" ? aux : aux[0];
        for (let j = 0; j < nHidden; j++) _hidden[j] += auxW[j] * a;
      } else {
        for (let s = 0; s < this.nAux; s++) {
          const a = aux[s];
          const off = s * nHidden;
          for (let j = 0; j < nHidden; j++) _hidden[j] += auxW[off + j] * a;
        }
      }
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

    if (this.plastic && learning) this._learn(inputs);

    return _out;
  }

  /**
   * Within-lifetime learning. After a forward pass, nudge each plastic
   * connection by a Hebbian term (co-activation of the two neurons it joins,
   * gated by the connection's evolved plasticity coefficient) plus a decay term
   * pulling it back toward its inherited baseline. The decay keeps learning
   * bounded and reversible — a working memory, not runaway growth — and a hard
   * clamp is a final safety net. Biases are left static, and so is `auxW`: the
   * extra sense's wiring is innate, evolved across generations rather than
   * tuned within one life.
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
