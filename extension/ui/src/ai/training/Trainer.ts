// ============================================================
// SuyaSurf AI Engine — Training Pipeline
// Mini-batch gradient descent with configurable epochs,
// batch size, shuffle, and convergence detection.
// ============================================================

import { Matrix } from '../core/Matrix';
import { NeuralNetwork } from '../core/Network';
import { backprop, applyGradients } from '../core/Backprop';
import type { TrainingSample, TrainingConfig, TrainingResult } from '../types';

// ── Data utilities ───────────────────────────────────────

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function buildBatchMatrix(
  samples: TrainingSample[],
  field: 'input' | 'target'
): Matrix {
  // Each sample column: (inputSize × 1) stacked horizontally → (inputSize × batchSize)
  const cols = samples.map((s) => s[field]);
  const rows = cols[0].length;
  const data: number[][] = Array.from({ length: rows }, (_, r) =>
    cols.map((col) => col[r])
  );
  return new Matrix(data);
}

function averageLoss(losses: number[]): number {
  return losses.reduce((a, b) => a + b, 0) / losses.length;
}

// ── Normalisation helpers ─────────────────────────────────

export interface NormalisationStats {
  mean: number[];
  std: number[];
}

/**
 * Compute per-feature mean and standard deviation from a dataset.
 */
export function computeNormStats(samples: TrainingSample[]): NormalisationStats {
  if (samples.length === 0) throw new Error('computeNormStats: empty dataset');
  const dim = samples[0].input.length;
  const mean = new Array<number>(dim).fill(0);
  const std = new Array<number>(dim).fill(0);

  for (const s of samples) {
    for (let i = 0; i < dim; i++) mean[i] += s.input[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= samples.length;

  for (const s of samples) {
    for (let i = 0; i < dim; i++) std[i] += (s.input[i] - mean[i]) ** 2;
  }
  for (let i = 0; i < dim; i++) std[i] = Math.sqrt(std[i] / samples.length) || 1;

  return { mean, std };
}

/**
 * Z-score normalise a feature vector using precomputed stats.
 */
export function normalise(input: number[], stats: NormalisationStats): number[] {
  return input.map((v, i) => (v - stats.mean[i]) / stats.std[i]);
}

// ── Trainer ──────────────────────────────────────────────

export class Trainer {
  private readonly network: NeuralNetwork;
  private normStats: NormalisationStats | null = null;

  constructor(network: NeuralNetwork) {
    this.network = network;
  }

  // ── Training ─────────────────────────────────────────────

  /**
   * Train the network on a dataset using mini-batch gradient descent.
   *
   * The dataset is split into batches each epoch; optionally shuffled.
   * Training stops early if the average loss drops below lossThreshold.
   */
  train(dataset: TrainingSample[], config: TrainingConfig): TrainingResult {
    const {
      epochs,
      batchSize,
      learningRate,
      shuffle = true,
      lossThreshold = 0,
      onEpochEnd,
      onBatchEnd,
    } = config;

    // Override the network's learning rate for this run
    const net = this.network;
    const loss = net.loss;

    const lossHistory: number[] = [];
    const startTime = Date.now();
    let converged = false;

    const data = [...dataset];

    for (let epoch = 0; epoch < epochs; epoch++) {
      if (shuffle) shuffleInPlace(data);

      const epochLosses: number[] = [];
      let batchIndex = 0;

      for (let start = 0; start < data.length; start += batchSize) {
        const batch = data.slice(start, start + batchSize);

        const inputMatrix = buildBatchMatrix(batch, 'input');
        const targetMatrix = buildBatchMatrix(batch, 'target');

        const { loss: batchLoss, gradients } = backprop(
          net.layers,
          inputMatrix,
          targetMatrix,
          loss
        );

        applyGradients(net.layers, gradients, learningRate);

        epochLosses.push(batchLoss);
        onBatchEnd?.(batchIndex++, batchLoss);
      }

      const epochAvgLoss = averageLoss(epochLosses);
      lossHistory.push(epochAvgLoss);
      onEpochEnd?.(epoch, epochAvgLoss);

      if (lossThreshold > 0 && epochAvgLoss <= lossThreshold) {
        converged = true;
        break;
      }
    }

    return {
      epochs: lossHistory.length,
      finalLoss: lossHistory[lossHistory.length - 1] ?? Infinity,
      lossHistory,
      converged,
      duration: Date.now() - startTime,
    };
  }

  // ── Auto-normalise ────────────────────────────────────────

  /**
   * Compute normalisation stats from dataset and normalise all inputs.
   * Call before train() for numerical stability with large feature values.
   */
  fitNormalise(dataset: TrainingSample[]): TrainingSample[] {
    this.normStats = computeNormStats(dataset);
    return dataset.map((s) => ({
      ...s,
      input: normalise(s.input, this.normStats!),
    }));
  }

  getNormStats(): NormalisationStats | null {
    return this.normStats;
  }

  /** Normalise a single input for inference. */
  normaliseInput(input: number[]): number[] {
    if (!this.normStats) return input;
    return normalise(input, this.normStats);
  }

  // ── Evaluation ───────────────────────────────────────────

  /**
   * Evaluate the network's average loss on a test set without
   * updating weights.
   */
  evaluate(testSet: TrainingSample[]): number {
    if (testSet.length === 0) return 0;
    const net = this.network;
    let total = 0;

    for (const sample of testSet) {
      const input = Matrix.fromArray(
        this.normStats ? normalise(sample.input, this.normStats) : sample.input
      );
      const target = Matrix.fromArray(sample.target);

      // Forward-only pass
      let current = input;
      for (const layer of net.layers) {
        current = layer.forward(current);
      }

      // Compute loss scalar
      const diff = current.sub(target);
      total += diff.hadamard(diff).sum() / diff.rows;
    }

    return total / testSet.length;
  }

  /**
   * Classify a single input; returns predicted class index (argmax).
   */
  classify(input: number[]): number {
    const normalised = this.normStats ? normalise(input, this.normStats) : input;
    const output = this.network.predict(normalised);
    return output.indexOf(Math.max(...output));
  }
}
