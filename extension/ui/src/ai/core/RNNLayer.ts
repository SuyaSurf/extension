// ============================================================
// SuyaSurf AI Engine — Elman RNN Layer
//
// ARCHITECTURE
// ─────────────
// An Elman (simple) Recurrent Neural Network processes sequences by
// maintaining a hidden state h_t that is fed back as input at each step.
//
// Forward pass (per timestep t):
//   z_t = W_xh · x_t  +  W_hh · h_{t-1}  +  b_h
//   h_t = tanh(z_t)
//
// Where:
//   x_t ∈ ℝ^I   — input vector at time t
//   h_t ∈ ℝ^H   — hidden state vector
//   W_xh ∈ ℝ^{H×I} — input-to-hidden weights
//   W_hh ∈ ℝ^{H×H} — hidden-to-hidden (recurrent) weights
//   b_h  ∈ ℝ^H      — bias
//
// BACKPROPAGATION THROUGH TIME (BPTT)
// ─────────────────────────────────────
// BPTT "unrolls" the RNN for T timesteps and treats it as a T-layer
// deep network, then applies the chain rule from t=T-1 back to t=0.
//
// At each step (backwards from t=T-1 to 0):
//   dh_t    = dh_from_output_t  +  W_hh^T · dz_{t+1}  (gradient from future)
//   dz_t    = dh_t ⊙ (1 - h_t²)                       (tanh derivative)
//   dW_xh  += dz_t · x_t^T
//   dW_hh  += dz_t · h_{t-1}^T
//   db_h   += dz_t
//
// VANISHING GRADIENT NOTE
// ────────────────────────
// The gradient flowing back k steps is proportional to W_hh^k.
// If the spectral radius ρ(W_hh) < 1 → gradients vanish exponentially.
// If ρ(W_hh) > 1 → gradients explode.
// In practice, simple RNNs struggle with dependencies longer than ~15 steps.
// Use LSTMLayer for longer-range dependencies.
//
// TRUNCATED BPTT
// ───────────────
// To control cost, gradients are clipped to the last `bpttTruncate` steps.
// This is equivalent to treating older steps as having zero gradient.
// ============================================================

import { Matrix } from './Matrix';

export interface RNNCacheEntry {
  x: Matrix;       // (I×1) input at this step
  hPrev: Matrix;   // (H×1) hidden state coming in
  z: Matrix;       // (H×1) pre-activation
  h: Matrix;       // (H×1) post-activation (tanh)
}

export interface RNNGradients {
  dWxh: Matrix;  // (H×I)
  dWhh: Matrix;  // (H×H)
  dbh:  Matrix;  // (H×1)
  /** Gradient w.r.t. the initial hidden state h0. */
  dh0:  Matrix;
}

export interface RNNLayerConfig {
  inputSize: number;
  hiddenSize: number;
  /** Number of BPTT steps. Older steps get zero gradient. Default: 20. */
  bpttTruncate?: number;
}

export class RNNLayer {
  readonly inputSize: number;
  readonly hiddenSize: number;
  readonly bpttTruncate: number;

  // Learnable parameters
  Wxh: Matrix;   // input → hidden  (H×I)
  Whh: Matrix;   // hidden → hidden (H×H)
  bh:  Matrix;   // bias            (H×1)

  // Cache from most recent forward pass (needed for backward)
  private cache: RNNCacheEntry[] = [];
  private h0Cache: Matrix;

  constructor(cfg: RNNLayerConfig) {
    this.inputSize  = cfg.inputSize;
    this.hiddenSize = cfg.hiddenSize;
    this.bpttTruncate = cfg.bpttTruncate ?? 20;

    // Xavier uniform initialisation
    this.Wxh = Matrix.random(this.hiddenSize, this.inputSize);
    this.Whh = Matrix.random(this.hiddenSize, this.hiddenSize,
      // Orthogonal-style: tighter init for recurrent weights
      1 / Math.sqrt(this.hiddenSize)
    );
    this.bh  = Matrix.zeros(this.hiddenSize, 1);
    this.h0Cache = Matrix.zeros(this.hiddenSize, 1);
  }

  // ── Forward Pass ──────────────────────────────────────

  /**
   * Process a sequence of input vectors.
   *
   * @param xSeq  Array of T column-vectors, each (inputSize × 1)
   * @param h0    Initial hidden state (hiddenSize × 1). Defaults to zeros.
   * @returns     Array of T hidden states [h_0, …, h_{T-1}], each (H×1)
   *
   * Algorithm per timestep:
   *   z_t = Wxh · x_t + Whh · h_{t-1} + bh
   *   h_t = tanh(z_t)
   *
   * All intermediate values are cached for use in backward().
   */
  forward(xSeq: Matrix[], h0?: Matrix): Matrix[] {
    const T = xSeq.length;
    const h0_ = h0 ?? Matrix.zeros(this.hiddenSize, 1);
    this.h0Cache = h0_;
    this.cache = [];

    const hiddenStates: Matrix[] = [];
    let hPrev = h0_;

    for (let t = 0; t < T; t++) {
      const x = xSeq[t];

      // z = Wxh·x + Whh·h_prev + bh
      const z = this.Wxh.multiply(x)
        .add(this.Whh.multiply(hPrev))
        .add(this.bh);

      // h = tanh(z)
      const h = z.map((v) => Math.tanh(v));

      this.cache.push({ x, hPrev, z, h });
      hiddenStates.push(h);
      hPrev = h;
    }

    return hiddenStates;
  }

  // ── Backward Pass (BPTT) ──────────────────────────────

  /**
   * Backpropagation Through Time.
   *
   * @param dhSeq  Array of T loss-gradient column-vectors ∂L/∂h_t, each (H×1).
   *               If only the final output contributes to loss, pass an array
   *               of zeros except the last element.
   * @returns Accumulated gradients for all learnable parameters.
   *
   * Algorithm (t = T-1 down to max(0, T-bpttTruncate)):
   *   dh_t   = dhSeq[t] + W_hh^T · dz_{t+1}   (total gradient at h_t)
   *   dz_t   = dh_t ⊙ (1 − h_t²)               (tanh backward)
   *   dWxh  += dz_t · x_t^T
   *   dWhh  += dz_t · h_{t-1}^T
   *   dbh   += dz_t
   *   (pass W_hh^T · dz_t to the previous step as "from-future" gradient)
   */
  backward(dhSeq: Matrix[]): RNNGradients {
    const T = this.cache.length;
    if (T === 0) throw new Error('RNNLayer.backward: call forward() first');
    if (dhSeq.length !== T) {
      throw new Error(`RNNLayer.backward: dhSeq.length (${dhSeq.length}) ≠ sequence length (${T})`);
    }

    const H = this.hiddenSize;
    const I = this.inputSize;

    let dWxh = Matrix.zeros(H, I);
    let dWhh = Matrix.zeros(H, H);
    let dbh  = Matrix.zeros(H, 1);

    // Gradient flowing from t+1 into t via W_hh (starts as zero at t=T)
    let dzNext = Matrix.zeros(H, 1);

    const tStart = Math.max(0, T - this.bpttTruncate);

    for (let t = T - 1; t >= tStart; t--) {
      const { x, hPrev, h } = this.cache[t];

      // dh_t = (external gradient from loss) + (gradient flowing from t+1)
      const dh = dhSeq[t].add(this.Whh.transpose().multiply(dzNext));

      // Tanh derivative: d/dz tanh(z) = 1 - tanh²(z) = 1 - h²
      const dz = dh.hadamard(h.map((v) => 1 - v * v));

      // Accumulate weight gradients
      dWxh = dWxh.add(dz.multiply(x.transpose()));
      dWhh = dWhh.add(dz.multiply(hPrev.transpose()));
      dbh  = dbh.add(dz);

      dzNext = dz;  // pass dz to the previous step
    }

    // Gradient w.r.t. initial hidden state h0
    const dh0 = this.Whh.transpose().multiply(dzNext);

    return { dWxh, dWhh, dbh, dh0 };
  }

  // ── Weight Update ─────────────────────────────────────

  /**
   * Apply SGD update: param -= learningRate × gradient.
   * Includes gradient clipping by global norm to stabilise training.
   *
   * @param grads        Gradients from backward()
   * @param learningRate Step size
   * @param clipNorm     Global gradient clipping threshold (default 5.0)
   */
  applyGradients(grads: RNNGradients, learningRate: number, clipNorm = 5.0): void {
    // Global norm: √(‖dWxh‖² + ‖dWhh‖² + ‖dbh‖²)
    const globalNorm = Math.sqrt(
      grads.dWxh.norm() ** 2 +
      grads.dWhh.norm() ** 2 +
      grads.dbh.norm()  ** 2
    );

    const clip = globalNorm > clipNorm ? clipNorm / globalNorm : 1.0;

    this.Wxh = this.Wxh.sub(grads.dWxh.scale(learningRate * clip));
    this.Whh = this.Whh.sub(grads.dWhh.scale(learningRate * clip));
    this.bh  = this.bh.sub(grads.dbh.scale(learningRate * clip));
  }

  // ── Utility ───────────────────────────────────────────

  /** Run one step given current hidden state. Useful at inference time. */
  step(x: Matrix, hPrev: Matrix): Matrix {
    const z = this.Wxh.multiply(x)
      .add(this.Whh.multiply(hPrev))
      .add(this.bh);
    return z.map((v) => Math.tanh(v));
  }

  /** Return a fresh zero hidden state (H×1). */
  zeroState(): Matrix {
    return Matrix.zeros(this.hiddenSize, 1);
  }

  getWeights() {
    return {
      Wxh: this.Wxh.data,
      Whh: this.Whh.data,
      bh: this.bh.data,
    };
  }

  setWeights(w: { Wxh: number[][], Whh: number[][], bh: number[][] }): void {
    this.Wxh = new Matrix(w.Wxh);
    this.Whh = new Matrix(w.Whh);
    this.bh  = new Matrix(w.bh);
  }
}
