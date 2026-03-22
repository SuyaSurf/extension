// ============================================================
// SuyaSurf AI Engine — Binary Logic Gates as Neural Networks
// Each gate is a pre-trained two-layer network.
// XOR requires a hidden layer; AND/OR/NAND/NOR/NOT are single-
// layer perceptrons. Weights are analytically derived.
// ============================================================

import { NeuralNetwork } from './Network';
import { Matrix } from './Matrix';
import { DenseLayer } from './Layer';
import { applyGradients, backprop } from './Backprop';
import type { GateType, GateResult } from '../types';

// ── Hard-coded analytic weights ──────────────────────────
// These give exact behaviour for the classic 0/1 truth table.
// Threshold value τ = 0.5 for sigmoid output.

function buildSingleLayerGate(w1: number, w2: number, bias: number): NeuralNetwork {
  const net = NeuralNetwork.build(
    [{ units: 1, activation: 'sigmoid' }],
    2,
    'binaryCrossEntropy',
    0.01
  );
  // W: (1×2), b: (1×1) — large magnitude to saturate sigmoid cleanly
  net.layers[0].setWeights([[w1, w2]], [[bias]]);
  return net;
}

const GATE_NETWORKS: Record<GateType, NeuralNetwork> = {
  // AND: fires only when both inputs = 1
  AND: buildSingleLayerGate(20, 20, -30),

  // OR: fires when at least one input = 1
  OR: buildSingleLayerGate(20, 20, -10),

  // NAND: complement of AND
  NAND: buildSingleLayerGate(-20, -20, 30),

  // NOR: complement of OR
  NOR: buildSingleLayerGate(-20, -20, 10),

  // NOT: single-input gate — second weight is 0
  NOT: buildSingleLayerGate(-20, 0, 10),

  // XOR requires a hidden layer — built below and patched in after
  XOR: buildXORNetwork(),
};

function buildXORNetwork(): NeuralNetwork {
  // Architecture: 2 → [NAND, OR] hidden → AND output
  // Network: 2 inputs → 2 hidden (sigmoid) → 1 output (sigmoid)
  const net = NeuralNetwork.build(
    [
      { units: 2, activation: 'sigmoid' },
      { units: 1, activation: 'sigmoid' },
    ],
    2,
    'binaryCrossEntropy',
    0.01
  );

  // Hidden layer: neuron-0 = NAND(x1,x2), neuron-1 = OR(x1,x2)
  // W shape: (2×2), b shape: (2×1)
  net.layers[0].setWeights(
    [
      [-20, -20],   // NAND row
      [20, 20],     // OR row
    ],
    [[30], [-10]]   // biases: NAND=30, OR=-10
  );

  // Output layer: AND of the two hidden neurons
  // W: (1×2), b: (1×1)
  net.layers[1].setWeights([[20, 20]], [[-30]]);

  return net;
}

// ── Gate Evaluator ───────────────────────────────────────

/**
 * Evaluate a logic gate with a pair of binary inputs.
 * Returns the raw sigmoid output (continuous) and a thresholded result.
 */
export function evaluateGate(gate: GateType, a: number, b: number): GateResult {
  const inputs = gate === 'NOT' ? [a, 0] : [a, b];
  const network = GATE_NETWORKS[gate];
  const output = network.predict(inputs);
  const raw = output[0];

  return {
    gate,
    inputs: gate === 'NOT' ? [a] : [a, b],
    output: raw >= 0.5 ? 1 : 0,
    confidence: Math.abs(raw - 0.5) * 2, // 0 = uncertain, 1 = certain
  };
}

// ── Truth-table runner ───────────────────────────────────

/** Run a gate against its complete truth table and return all results. */
export function runTruthTable(gate: GateType): GateResult[] {
  const inputs: [number, number][] =
    gate === 'NOT' ? [[0, 0], [1, 0]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
  return inputs.map(([a, b]) => evaluateGate(gate, a, b));
}

// ── Learnable gate (for demonstration / training) ────────

/**
 * A freshly initialised gate network that can be trained from scratch.
 * Good for demonstrating that backprop converges on the truth table.
 */
export function createTrainableGate(gate: GateType): NeuralNetwork {
  if (gate === 'XOR') {
    return NeuralNetwork.build(
      [
        { units: 2, activation: 'sigmoid' },
        { units: 1, activation: 'sigmoid' },
      ],
      2,
      'binaryCrossEntropy',
      1.0 // higher LR to train XOR quickly
    );
  }
  return NeuralNetwork.build(
    [{ units: 1, activation: 'sigmoid' }],
    2,
    'binaryCrossEntropy',
    1.0
  );
}

/** Truth-table targets for each gate (indexed by [a, b] input). */
export const GATE_TRUTH_TABLES: Record<GateType, Array<{ input: number[]; target: number[] }>> = {
  AND:  [{ input: [0, 0], target: [0] }, { input: [0, 1], target: [0] }, { input: [1, 0], target: [0] }, { input: [1, 1], target: [1] }],
  OR:   [{ input: [0, 0], target: [0] }, { input: [0, 1], target: [1] }, { input: [1, 0], target: [1] }, { input: [1, 1], target: [1] }],
  NAND: [{ input: [0, 0], target: [1] }, { input: [0, 1], target: [1] }, { input: [1, 0], target: [1] }, { input: [1, 1], target: [0] }],
  NOR:  [{ input: [0, 0], target: [1] }, { input: [0, 1], target: [0] }, { input: [1, 0], target: [0] }, { input: [1, 1], target: [0] }],
  NOT:  [{ input: [0, 0], target: [1] }, { input: [1, 0], target: [0] }, { input: [0, 0], target: [1] }, { input: [1, 0], target: [0] }],
  XOR:  [{ input: [0, 0], target: [0] }, { input: [0, 1], target: [1] }, { input: [1, 0], target: [1] }, { input: [1, 1], target: [0] }],
};
