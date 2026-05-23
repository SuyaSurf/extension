// ============================================================
// SuyaSurf AI Engine — LSTM Layer (Long Short-Term Memory)
//
// MOTIVATION
// ───────────
// A simple RNN computes h_t = tanh(W_hh·h_{t-1} + W_xh·x_t).
// Gradients flowing backward k steps are multiplied by W_hh k times.
// When ρ(W_hh) < 1, they vanish → the network can't learn long-range deps.
//
// LSTM's solution: the CONSTANT ERROR CAROUSEL (CEC).
// A dedicated "cell state" c_t flows forward largely unchanged:
//   c_t = f_t ⊙ c_{t-1}  +  i_t ⊙ g_t
//
// Gradient: ∂c_t / ∂c_{t-1} = f_t
// When the forget gate f_t ≈ 1, the cell gradient passes through
// unmodified regardless of sequence length. This is how LSTMs learn
// dependencies spanning 100+ steps.
//
// ARCHITECTURE — per timestep
// ────────────────────────────
//   concat = [h_{t-1} ; x_t]          (H+I)×1
//
//   f_t = σ(W_f · concat + b_f)       Forget gate  — what % of c to erase
//   i_t = σ(W_i · concat + b_i)       Input gate   — what positions to write
//   g_t = tanh(W_g · concat + b_g)    Candidate    — proposed cell content
//   o_t = σ(W_o · concat + b_o)       Output gate  — what to expose as h
//
//   c_t = f_t ⊙ c_{t-1} + i_t ⊙ g_t  Cell state   — the memory
//   h_t = o_t ⊙ tanh(c_t)             Hidden state — the output
//
// Weight shapes (each gate):
//   W_* : H × (H+I)   combined weight for both h_{t-1} and x_t
//   b_* : H × 1
//
// BPTT (Backpropagation Through Time) — per step, backwards
// ──────────────────────────────────────────────────────────
//   dh_total = dh_external_t + dh_from_next_step
//   dc_total = dc_from_next  + dh_total ⊙ o_t ⊙ (1 − tanh²(c_t))
//
//   do_gate = dh_total ⊙ tanh(c_t) ⊙ σ'(pre_o)    where σ'(z) = σ(z)(1−σ(z))
//   df_gate = dc_total ⊙ c_{t-1}   ⊙ σ'(pre_f)
//   di_gate = dc_total ⊙ g_t        ⊙ σ'(pre_i)
//   dg_gate = dc_total ⊙ i_t        ⊙ (1 − g_t²)   (tanh derivative)
//
//   d_concat = W_f^T·df + W_i^T·di + W_g^T·dg + W_o^T·do
//   dh_{t-1} = d_concat[0 : H]
//   dx_t     = d_concat[H : H+I]
//   dc_{t-1} = dc_total ⊙ f_t          (cell gradient highway)
//
//   dW_* += d_gate · concat^T
//   db_* += d_gate
// ============================================================

import { Matrix } from './Matrix';

// ── Scalar helpers ───────────────────────────────────────

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const sigmoidDeriv = (s: number): number => s * (1 - s);  // s = σ(z) already applied

// ── Cache & gradients ────────────────────────────────────

export interface LSTMCacheEntry {
  x:      Matrix;  // (I×1)
  hPrev:  Matrix;  // (H×1)
  cPrev:  Matrix;  // (H×1)
  concat: Matrix;  // (H+I)×1
  preF:   Matrix;  // (H×1) pre-activation forget gate
  preI:   Matrix;  // (H×1) pre-activation input gate
  preG:   Matrix;  // (H×1) pre-activation candidate
  preO:   Matrix;  // (H×1) pre-activation output gate
  f: Matrix;       // (H×1) σ(preF)
  i: Matrix;       // (H×1) σ(preI)
  g: Matrix;       // (H×1) tanh(preG)
  o: Matrix;       // (H×1) σ(preO)
  c: Matrix;       // (H×1) cell state
  h: Matrix;       // (H×1) hidden state
}

export interface LSTMState {
  h: Matrix;  // hidden state
  c: Matrix;  // cell state
}

export interface LSTMGradients {
  dWf: Matrix;  dWi: Matrix;  dWg: Matrix;  dWo: Matrix;
  dbf: Matrix;  dbi: Matrix;  dbg: Matrix;  dbo: Matrix;
  /** Gradient w.r.t. initial hidden state. */
  dh0: Matrix;
  /** Gradient w.r.t. initial cell state. */
  dc0: Matrix;
}

export interface LSTMLayerConfig {
  inputSize: number;
  hiddenSize: number;
  /** BPTT truncation — max steps to unroll. Default: 35. */
  bpttTruncate?: number;
}

export class LSTMLayer {
  readonly inputSize: number;
  readonly hiddenSize: number;
  readonly bpttTruncate: number;

  // ── Learnable parameters (one weight matrix per gate) ──
  // Each W_* : H × (H+I)  — covers both h_prev and x in a single matmul
  Wf: Matrix;  Wi: Matrix;  Wg: Matrix;  Wo: Matrix;
  bf: Matrix;  bi: Matrix;  bg: Matrix;  bo: Matrix;

  // Cache from last forward pass
  private cache: LSTMCacheEntry[] = [];
  private initState: LSTMState;

  constructor(cfg: LSTMLayerConfig) {
    this.inputSize    = cfg.inputSize;
    this.hiddenSize   = cfg.hiddenSize;
    this.bpttTruncate = cfg.bpttTruncate ?? 35;

    const H = this.hiddenSize;
    const C = H + cfg.inputSize; // concat size

    // Xavier uniform for sigmoid gates (fan-in = C, fan-out = H)
    // Orthogonal-style tighter init for recurrent weights is baked in via sqrt(6/(H+C))
    this.Wf = Matrix.random(H, C);
    this.Wi = Matrix.random(H, C);
    this.Wg = Matrix.random(H, C);
    this.Wo = Matrix.random(H, C);

    // Forget gate bias initialised to 1.0 — a known trick to encourage
    // the forget gate to start open (f≈σ(1)≈0.73), giving better gradient
    // flow in the first few training steps.
    this.bf = Matrix.ones(H, 1);
    this.bi = Matrix.zeros(H, 1);
    this.bg = Matrix.zeros(H, 1);
    this.bo = Matrix.zeros(H, 1);

    this.initState = {
      h: Matrix.zeros(H, 1),
      c: Matrix.zeros(H, 1),
    };
  }

  // ── Forward Pass ──────────────────────────────────────

  /**
   * Process a variable-length sequence.
   *
   * @param xSeq    T column-vectors, each (I×1)
   * @param state0  Initial {h, c}. Defaults to zero vectors.
   * @returns       { hiddenStates: [h_0…h_{T-1}], finalState: {h,c} }
   *
   * Per-step computation:
   *   concat = [h_{t-1}; x_t]
   *   preF = Wf·concat + bf  →  f = σ(preF)
   *   preI = Wi·concat + bi  →  i = σ(preI)
   *   preG = Wg·concat + bg  →  g = tanh(preG)
   *   preO = Wo·concat + bo  →  o = σ(preO)
   *   c = f⊙c_prev + i⊙g
   *   h = o⊙tanh(c)
   */
  forward(
    xSeq: Matrix[],
    state0?: Partial<LSTMState>
  ): { hiddenStates: Matrix[]; finalState: LSTMState } {
    const H = this.hiddenSize;
    let hPrev = state0?.h ?? Matrix.zeros(H, 1);
    let cPrev = state0?.c ?? Matrix.zeros(H, 1);

    this.initState = { h: hPrev, c: cPrev };
    this.cache = [];
    const hiddenStates: Matrix[] = [];

    for (const x of xSeq) {
      // [h_{t-1}; x_t] — vertical concatenation into a (H+I)×1 column vector
      const concat = new Matrix([
        ...hPrev.data,
        ...x.data,
      ]);

      // Gate pre-activations
      const preF = this.Wf.multiply(concat).add(this.bf);
      const preI = this.Wi.multiply(concat).add(this.bi);
      const preG = this.Wg.multiply(concat).add(this.bg);
      const preO = this.Wo.multiply(concat).add(this.bo);

      // Gate activations
      const f = preF.map(sigmoid);
      const i = preI.map(sigmoid);
      const g = preG.map(Math.tanh);
      const o = preO.map(sigmoid);

      // Cell state: forget old + write new
      const c = f.hadamard(cPrev).add(i.hadamard(g));

      // Hidden state: gated cell readout
      const h = o.hadamard(c.map(Math.tanh));

      this.cache.push({ x, hPrev, cPrev, concat, preF, preI, preG, preO, f, i, g, o, c, h });
      hiddenStates.push(h);
      hPrev = h;
      cPrev = c;
    }

    return { hiddenStates, finalState: { h: hPrev, c: cPrev } };
  }

  // ── Backward Pass (BPTT) ──────────────────────────────

  /**
   * Backpropagation Through Time through the LSTM sequence.
   *
   * @param dhSeq  ∂L/∂h_t for each timestep, array of T (H×1) vectors.
   *               For sequence-to-one tasks (e.g. final-step loss only),
   *               pass zeros for all timesteps except the last.
   * @returns Accumulated gradients for all gate parameters.
   *
   * The key insight: gradients flow back along two highways:
   *   1. dh path: through the output gate and tanh(c)
   *   2. dc path: through the cell state (the CEC) — controlled by f_t
   *
   * dc gradient: multiplied by f_t at each step. When f≈1, it passes
   * through undiminished — this is why LSTMs handle long sequences.
   */
  backward(dhSeq: Matrix[]): LSTMGradients {
    const T = this.cache.length;
    if (T === 0) throw new Error('LSTMLayer.backward: call forward() first');
    if (dhSeq.length !== T) {
      throw new Error(`LSTMLayer.backward: dhSeq.length (${dhSeq.length}) ≠ T (${T})`);
    }

    const H  = this.hiddenSize;
    const I  = this.inputSize;
    const C  = H + I;

    // Accumulated parameter gradients (initialise to zero)
    let dWf = Matrix.zeros(H, C); let dbf = Matrix.zeros(H, 1);
    let dWi = Matrix.zeros(H, C); let dbi = Matrix.zeros(H, 1);
    let dWg = Matrix.zeros(H, C); let dbg = Matrix.zeros(H, 1);
    let dWo = Matrix.zeros(H, C); let dbo = Matrix.zeros(H, 1);

    // Gradients flowing from t+1 back to t (initialise to zero at T)
    let dhNext = Matrix.zeros(H, 1);
    let dcNext = Matrix.zeros(H, 1);

    const tStart = Math.max(0, T - this.bpttTruncate);

    for (let t = T - 1; t >= tStart; t--) {
      const { hPrev, cPrev, concat, f, i, g, o, c } = this.cache[t];

      // Total hidden gradient: external (from loss) + recurrent (from t+1)
      const dh = dhSeq[t].add(dhNext);

      // Cell gradient from hidden output path + gradient flowing from t+1
      //   ∂L/∂c_t via h_t: dh ⊙ o_t ⊙ (1 − tanh²(c_t))
      const tanhC = c.map(Math.tanh);
      const dcFromH = dh.hadamard(o).hadamard(tanhC.map((v) => 1 - v * v));
      const dc = dcFromH.add(dcNext);

      // Gate gradients (pre-activation, via chain rule through activation)
      //   d_gate = dc_or_dh ⊙ upstream ⊙ activation_derivative

      // Output gate: ∂L/∂o = dh ⊙ tanh(c)  →  ∂preO = ∂o ⊙ σ'(preO)
      const doGate = dh.hadamard(tanhC).hadamard(o.map(sigmoidDeriv));

      // Forget gate: ∂L/∂f = dc ⊙ c_{t-1}  →  ∂preF = ∂f ⊙ σ'(preF)
      const dfGate = dc.hadamard(cPrev).hadamard(f.map(sigmoidDeriv));

      // Input gate: ∂L/∂i = dc ⊙ g  →  ∂preI = ∂i ⊙ σ'(preI)
      const diGate = dc.hadamard(g).hadamard(i.map(sigmoidDeriv));

      // Candidate: ∂L/∂g = dc ⊙ i  →  ∂preG = ∂g ⊙ (1 − g²)
      const dgGate = dc.hadamard(i).hadamard(g.map((v) => 1 - v * v));

      // Accumulate weight gradients: dW = d_gate · concat^T
      dWf = dWf.add(dfGate.multiply(concat.transpose()));
      dWi = dWi.add(diGate.multiply(concat.transpose()));
      dWg = dWg.add(dgGate.multiply(concat.transpose()));
      dWo = dWo.add(doGate.multiply(concat.transpose()));

      // Accumulate bias gradients
      dbf = dbf.add(dfGate);
      dbi = dbi.add(diGate);
      dbg = dbg.add(dgGate);
      dbo = dbo.add(doGate);

      // Gradient w.r.t. concat = sum of W^T · d_gate for all four gates
      const dConcat = this.Wf.transpose().multiply(dfGate)
        .add(this.Wi.transpose().multiply(diGate))
        .add(this.Wg.transpose().multiply(dgGate))
        .add(this.Wo.transpose().multiply(doGate));

      // Split concat gradient into h_{t-1} and x_t parts
      // dConcat is (H+I)×1; first H rows → dh_{t-1}, last I rows → dx_t
      dhNext = new Matrix(dConcat.data.slice(0, H));
      // dx_t = dConcat.data.slice(H) — not stored, inputs are fixed

      // Cell gradient highway: dc_{t-1} = dc ⊙ f_t
      dcNext = dc.hadamard(f);

      // Suppress unused variable warning for hPrev in gradient context
      void hPrev;
    }

    return {
      dWf, dWi, dWg, dWo,
      dbf, dbi, dbg, dbo,
      dh0: dhNext,
      dc0: dcNext,
    };
  }

  // ── Weight Update ─────────────────────────────────────

  /**
   * SGD update with global gradient clipping.
   *
   * Gradient clipping (by global norm):
   *   global_norm = √(Σ ‖dW‖²)
   *   If global_norm > clipNorm:  scale = clipNorm / global_norm
   *   All gradients are multiplied by scale before applying.
   *
   * This prevents the exploding-gradient problem that can occur in RNNs
   * even with LSTMs (especially early in training on long sequences).
   */
  applyGradients(grads: LSTMGradients, learningRate: number, clipNorm = 5.0): void {
    const globalNorm = Math.sqrt(
      grads.dWf.norm() ** 2 + grads.dWi.norm() ** 2 +
      grads.dWg.norm() ** 2 + grads.dWo.norm() ** 2 +
      grads.dbf.norm() ** 2 + grads.dbi.norm() ** 2 +
      grads.dbg.norm() ** 2 + grads.dbo.norm() ** 2
    );
    const clip = globalNorm > clipNorm ? clipNorm / globalNorm : 1.0;
    const lr = learningRate * clip;

    this.Wf = this.Wf.sub(grads.dWf.scale(lr));
    this.Wi = this.Wi.sub(grads.dWi.scale(lr));
    this.Wg = this.Wg.sub(grads.dWg.scale(lr));
    this.Wo = this.Wo.sub(grads.dWo.scale(lr));
    this.bf = this.bf.sub(grads.dbf.scale(lr));
    this.bi = this.bi.sub(grads.dbi.scale(lr));
    this.bg = this.bg.sub(grads.dbg.scale(lr));
    this.bo = this.bo.sub(grads.dbo.scale(lr));
  }

  // ── Inference Helpers ────────────────────────────────

  /** Process one timestep at inference time (no caching). */
  step(x: Matrix, state: LSTMState): LSTMState {
    const H = this.hiddenSize;
    const { h: hPrev, c: cPrev } = state;

    const concat = new Matrix([...hPrev.data, ...x.data]);

    const f = this.Wf.multiply(concat).add(this.bf).map(sigmoid);
    const i = this.Wi.multiply(concat).add(this.bi).map(sigmoid);
    const g = this.Wg.multiply(concat).add(this.bg).map(Math.tanh);
    const o = this.Wo.multiply(concat).add(this.bo).map(sigmoid);

    const c = f.hadamard(cPrev).add(i.hadamard(g));
    const h = o.hadamard(c.map(Math.tanh));

    void H;
    return { h, c };
  }

  /** Return a fresh zero LSTM state (both h and c zeroed). */
  zeroState(): LSTMState {
    return {
      h: Matrix.zeros(this.hiddenSize, 1),
      c: Matrix.zeros(this.hiddenSize, 1),
    };
  }

  // ── Serialisation ─────────────────────────────────────

  getWeights() {
    return {
      Wf: this.Wf.data, Wi: this.Wi.data, Wg: this.Wg.data, Wo: this.Wo.data,
      bf: this.bf.data, bi: this.bi.data, bg: this.bg.data, bo: this.bo.data,
    };
  }

  setWeights(w: ReturnType<LSTMLayer['getWeights']>): void {
    this.Wf = new Matrix(w.Wf); this.Wi = new Matrix(w.Wi);
    this.Wg = new Matrix(w.Wg); this.Wo = new Matrix(w.Wo);
    this.bf = new Matrix(w.bf); this.bi = new Matrix(w.bi);
    this.bg = new Matrix(w.bg); this.bo = new Matrix(w.bo);
  }

  /** Parameter count (for reporting). */
  get paramCount(): number {
    const C = this.hiddenSize + this.inputSize;
    return 4 * (this.hiddenSize * C + this.hiddenSize); // 4 gates × (W + b)
  }
}
