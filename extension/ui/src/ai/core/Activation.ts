// ============================================================
// SuyaSurf AI Engine — Activation Functions
// All math implemented from first principles.
// Each function exposes forward() and derivative().
// ============================================================

import { Matrix } from './Matrix';
import type { ActivationName } from '../types';

// ── Scalar helpers ───────────────────────────────────────

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

const relu = (x: number): number => (x > 0 ? x : 0);

const tanhFn = (x: number): number => Math.tanh(x);

const linear = (x: number): number => x;

// ── Per-element derivative helpers ───────────────────────

const sigmoidDeriv = (x: number): number => {
  const s = sigmoid(x);
  return s * (1 - s);
};

const reluDeriv = (x: number): number => (x > 0 ? 1 : 0);

const tanhDeriv = (x: number): number => {
  const t = Math.tanh(x);
  return 1 - t * t;
};

const linearDeriv = (_x: number): number => 1;

// ── Softmax (vector operation) ───────────────────────────

/**
 * Numerically stable softmax over a column-vector Matrix (n×1).
 * Subtracts max before exponentiation to prevent overflow.
 */
function softmaxMatrix(z: Matrix): Matrix {
  const vals = z.toColumnVector();
  const max = Math.max(...vals);
  const exps = vals.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return Matrix.fromArray(exps.map((e) => e / sum));
}

/**
 * Softmax Jacobian: diag(s) - s·sᵀ  (n×n matrix).
 * In backprop we almost always contract this with the upstream
 * gradient, so we return the full Jacobian here.
 */
function softmaxJacobian(softmaxOutput: number[]): number[][] {
  const n = softmaxOutput.length;
  const J: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      J[i][j] = i === j
        ? softmaxOutput[i] * (1 - softmaxOutput[i])
        : -softmaxOutput[i] * softmaxOutput[j];
    }
  }
  return J;
}

// ── Activation Registry ──────────────────────────────────

export interface ActivationImpl {
  /** Apply activation to a column-vector Matrix, return same-shape Matrix. */
  forward(z: Matrix): Matrix;
  /**
   * Given the pre-activation z and the activation output a,
   * return element-wise derivative dL/dz = dL/da ⊙ da/dz.
   * For softmax the caller should handle the Jacobian separately.
   */
  elementwiseDeriv(z: Matrix): Matrix;
  /** Raw Jacobian — only meaningful for softmax; others return identity. */
  jacobian?(a: Matrix): number[][];
}

class ElementwiseActivation implements ActivationImpl {
  constructor(
    private readonly fn: (x: number) => number,
    private readonly dfn: (x: number) => number
  ) {}

  forward(z: Matrix): Matrix {
    return z.map((v) => this.fn(v));
  }

  elementwiseDeriv(z: Matrix): Matrix {
    return z.map((v) => this.dfn(v));
  }
}

class SoftmaxActivation implements ActivationImpl {
  forward(z: Matrix): Matrix {
    return softmaxMatrix(z);
  }

  /** For softmax, caller is expected to use the Jacobian. */
  elementwiseDeriv(z: Matrix): Matrix {
    // Returns ones so upstream gradient passes through unmodified.
    // The actual softmax derivative is applied via the Jacobian method.
    return Matrix.ones(z.rows, z.cols);
  }

  jacobian(a: Matrix): number[][] {
    return softmaxJacobian(a.toColumnVector());
  }
}

const ACTIVATIONS: Record<ActivationName, ActivationImpl> = {
  sigmoid: new ElementwiseActivation(sigmoid, sigmoidDeriv),
  relu: new ElementwiseActivation(relu, reluDeriv),
  tanh: new ElementwiseActivation(tanhFn, tanhDeriv),
  linear: new ElementwiseActivation(linear, linearDeriv),
  softmax: new SoftmaxActivation(),
};

export function getActivation(name: ActivationName): ActivationImpl {
  const act = ACTIVATIONS[name];
  if (!act) throw new Error(`Unknown activation: ${name}`);
  return act;
}

// ── Named exports for direct use ─────────────────────────

export const Sigmoid = ACTIVATIONS.sigmoid;
export const ReLU = ACTIVATIONS.relu;
export const Tanh = ACTIVATIONS.tanh;
export const Softmax = ACTIVATIONS.softmax;
export const Linear = ACTIVATIONS.linear;

// Expose scalar functions for use in Bayesian / utility code
export { sigmoid, relu, tanhFn as tanh, softmaxMatrix };
