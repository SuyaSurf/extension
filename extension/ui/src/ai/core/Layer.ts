// ============================================================
// SuyaSurf AI Engine — Dense (Fully-Connected) Layer
// Forward pass + backprop implemented from raw matrix calculus.
// ============================================================

import { Matrix } from './Matrix';
import { getActivation, type ActivationImpl } from './Activation';
import type { LayerConfig, LayerState, LayerGradients, ActivationName, MatrixData } from '../types';

export class DenseLayer {
  readonly inputSize: number;
  readonly outputSize: number;
  readonly activationName: ActivationName;

  /** Weight matrix W: (outputSize × inputSize) */
  private W: Matrix;
  /** Bias vector b: (outputSize × 1) */
  private b: Matrix;

  private activation: ActivationImpl;

  // Cached forward-pass values needed during backprop
  private _lastInput: Matrix | null = null;
  private _lastZ: Matrix | null = null;     // pre-activation
  private _lastA: Matrix | null = null;     // post-activation

  constructor(config: LayerConfig) {
    this.inputSize = config.inputSize;
    this.outputSize = config.outputSize;
    this.activationName = config.activation;
    this.activation = getActivation(config.activation);

    // Xavier/Glorot uniform initialisation
    this.W = Matrix.random(config.outputSize, config.inputSize);
    this.b = Matrix.zeros(config.outputSize, 1);
  }

  // ── Forward Pass ────────────────────────────────────────

  /**
   * Compute: z = W·x + b,  a = activation(z)
   * x can be a single column-vector (n×1) or a mini-batch (n×batchSize).
   */
  forward(input: Matrix): Matrix {
    // z = W · input + b (with broadcasting of bias across batch cols)
    const z = this.W.multiply(input).addBias(this.b);
    const a = this.activation.forward(z);

    this._lastInput = input;
    this._lastZ = z;
    this._lastA = a;

    return a;
  }

  /** Return cached layer state (for inspection / training feedback). */
  getState(): LayerState {
    if (!this._lastInput || !this._lastZ || !this._lastA) {
      throw new Error('DenseLayer: forward() must be called before getState()');
    }
    return {
      input: this._lastInput.data,
      preActivation: this._lastZ.data,
      output: this._lastA.data,
    };
  }

  // ── Backward Pass ───────────────────────────────────────

  /**
   * Given dL/dA (gradient of loss w.r.t. this layer's output),
   * compute:
   *   dL/dZ = dL/dA ⊙ activation'(Z)
   *   dL/dW = dL/dZ · inputᵀ      (averaged over batch)
   *   dL/db = sum_cols(dL/dZ)     (averaged over batch)
   *   dL/dInput = Wᵀ · dL/dZ     (to propagate upstream)
   *
   * Returns gradients for weight update and the upstream gradient.
   */
  backward(dA: Matrix): LayerGradients {
    if (!this._lastInput || !this._lastZ || !this._lastA) {
      throw new Error('DenseLayer: forward() must be called before backward()');
    }

    const batchSize = this._lastInput.cols;

    let dZ: Matrix;

    if (this.activationName === 'softmax') {
      // Softmax Jacobian: dZ[i] = J · dA[i] per sample in batch
      const jacobian = this.activation.jacobian!(this._lastA);
      const J = new Matrix(jacobian);
      dZ = J.multiply(dA);
    } else {
      // Element-wise: dZ = dA ⊙ activation'(Z)
      const actDeriv = this.activation.elementwiseDeriv(this._lastZ);
      dZ = dA.hadamard(actDeriv);
    }

    // dW = (1/m) · dZ · Xᵀ
    const dW = dZ.multiply(this._lastInput.transpose()).scale(1 / batchSize);

    // db = (1/m) · sum_cols(dZ)
    const db = dZ.sumCols().scale(1 / batchSize);

    // dInput = Wᵀ · dZ  (passes gradient to previous layer)
    const dInput = this.W.transpose().multiply(dZ);

    return {
      dW: dW.data,
      db: db.data,
      dInput: dInput.data,
    };
  }

  // ── Parameter Update ────────────────────────────────────

  /** Apply vanilla gradient descent update. */
  applyGradients(gradients: LayerGradients, learningRate: number): void {
    const dW = new Matrix(gradients.dW);
    const db = new Matrix(gradients.db);
    this.W = this.W.sub(dW.scale(learningRate));
    this.b = this.b.sub(db.scale(learningRate));
  }

  // ── Serialisation ────────────────────────────────────────

  getWeights(): { W: MatrixData; b: MatrixData } {
    return { W: this.W.data, b: this.b.data };
  }

  setWeights(W: MatrixData, b: MatrixData): void {
    this.W = new Matrix(W);
    this.b = new Matrix(b);
  }
}
