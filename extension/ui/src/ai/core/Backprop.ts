// ============================================================
// SuyaSurf AI Engine — Backpropagation Engine
// Implements loss functions + gradient computation for a
// stack of DenseLayers using raw matrix calculus.
// ============================================================

import { Matrix } from './Matrix';
import { DenseLayer } from './Layer';
import type { LossName, LayerGradients } from '../types';

// ── Loss Functions ───────────────────────────────────────

export interface LossResult {
  value: number;
  /** dL/dOutput — gradient of loss w.r.t. network output (col-vector). */
  gradient: Matrix;
}

const EPSILON = 1e-15; // prevent log(0)

/**
 * Mean Squared Error: L = (1/n) Σ (ŷ - y)²
 * Gradient: dL/dŷ = (2/n)(ŷ - y)
 */
function mseLoss(predicted: Matrix, target: Matrix): LossResult {
  const diff = predicted.sub(target);
  const n = predicted.rows * predicted.cols;
  const value = diff.hadamard(diff).sum() / n;
  const gradient = diff.scale(2 / n);
  return { value, gradient };
}

/**
 * Binary Cross-Entropy: L = -(y·log(ŷ) + (1-y)·log(1-ŷ))
 * Gradient: dL/dŷ = -(y/ŷ - (1-y)/(1-ŷ))
 */
function binaryCrossEntropyLoss(predicted: Matrix, target: Matrix): LossResult {
  const n = predicted.rows;
  let value = 0;
  const gradData: number[][] = [];

  for (let i = 0; i < predicted.rows; i++) {
    const yHat = Math.min(Math.max(predicted.data[i][0], EPSILON), 1 - EPSILON);
    const y = target.data[i][0];
    value += -(y * Math.log(yHat) + (1 - y) * Math.log(1 - yHat));
    gradData.push([-(y / yHat - (1 - y) / (1 - yHat)) / n]);
  }

  return { value: value / n, gradient: new Matrix(gradData) };
}

/**
 * Categorical Cross-Entropy: L = -Σ y·log(ŷ)
 * Assumes predicted is the softmax output.
 * Gradient: dL/dŷ = -y/ŷ  (before the softmax Jacobian)
 */
function crossEntropyLoss(predicted: Matrix, target: Matrix): LossResult {
  const n = predicted.rows;
  let value = 0;
  const gradData: number[][] = [];

  for (let i = 0; i < n; i++) {
    const yHat = Math.max(predicted.data[i][0], EPSILON);
    const y = target.data[i][0];
    value += -(y * Math.log(yHat));
    gradData.push([-y / (yHat * n)]);
  }

  return { value, gradient: new Matrix(gradData) };
}

// ── Loss Dispatcher ──────────────────────────────────────

export function computeLoss(
  loss: LossName,
  predicted: Matrix,
  target: Matrix
): LossResult {
  switch (loss) {
    case 'mse':
      return mseLoss(predicted, target);
    case 'binaryCrossEntropy':
      return binaryCrossEntropyLoss(predicted, target);
    case 'crossEntropy':
      return crossEntropyLoss(predicted, target);
    default:
      throw new Error(`Unknown loss: ${loss}`);
  }
}

// ── Backpropagation ──────────────────────────────────────

export interface BackpropResult {
  loss: number;
  gradients: LayerGradients[];  // one per layer (same order as layers array)
}

/**
 * Run a full forward + backward pass through all layers.
 *
 * @param layers  Stack of DenseLayers in forward order.
 * @param input   Column-vector (or mini-batch matrix) of inputs.
 * @param target  Column-vector (or mini-batch) of expected outputs.
 * @param loss    Name of the loss function to apply.
 */
export function backprop(
  layers: DenseLayer[],
  input: Matrix,
  target: Matrix,
  loss: LossName
): BackpropResult {
  // ── Forward pass ────────────────────────────────────────
  let activation = input;
  for (const layer of layers) {
    activation = layer.forward(activation);
  }
  const predicted = activation;

  // ── Loss ────────────────────────────────────────────────
  const { value: lossValue, gradient: dA } = computeLoss(loss, predicted, target);

  // ── Backward pass ───────────────────────────────────────
  const gradients: LayerGradients[] = [];
  let upstream = dA;

  for (let i = layers.length - 1; i >= 0; i--) {
    const grad = layers[i].backward(upstream);
    gradients.unshift(grad);                    // prepend to keep forward order
    upstream = new Matrix(grad.dInput);
  }

  return { loss: lossValue, gradients };
}

/**
 * Apply computed gradients to all layers (vanilla SGD / mini-batch GD).
 */
export function applyGradients(
  layers: DenseLayer[],
  gradients: LayerGradients[],
  learningRate: number
): void {
  for (let i = 0; i < layers.length; i++) {
    layers[i].applyGradients(gradients[i], learningRate);
  }
}
