// ============================================================
// SuyaSurf AI Engine — Neural Network
// Orchestrates DenseLayers into a forward/backward pipeline.
// ============================================================

import { Matrix } from './Matrix';
import { DenseLayer } from './Layer';
import { backprop, applyGradients } from './Backprop';
import type { NetworkConfig, ForwardResult, LossName, LayerConfig } from '../types';

export class NeuralNetwork {
  readonly layers: DenseLayer[];
  readonly loss: LossName;
  readonly learningRate: number;

  constructor(config: NetworkConfig) {
    this.loss = config.loss;
    this.learningRate = config.learningRate;
    this.layers = config.layers.map((lc) => new DenseLayer(lc));
  }

  // ── Factory helpers ─────────────────────────────────────

  /**
   * Convenience builder that infers inputSize automatically from
   * the previous layer's outputSize.
   */
  static build(
    layerDefs: Array<{ units: number; activation: LayerConfig['activation'] }>,
    inputSize: number,
    loss: LossName = 'mse',
    learningRate = 0.01
  ): NeuralNetwork {
    const layerConfigs: LayerConfig[] = [];
    let lastSize = inputSize;
    for (const def of layerDefs) {
      layerConfigs.push({
        inputSize: lastSize,
        outputSize: def.units,
        activation: def.activation,
      });
      lastSize = def.units;
    }
    return new NeuralNetwork({ layers: layerConfigs, loss, learningRate });
  }

  // ── Inference ───────────────────────────────────────────

  /**
   * Run a single sample (number[]) through the network.
   * Returns the output as a number[].
   */
  predict(input: number[]): number[] {
    let m = Matrix.fromArray(input);
    for (const layer of this.layers) {
      m = layer.forward(m);
    }
    return m.toColumnVector();
  }

  /**
   * Full forward pass returning all intermediate layer states
   * (useful for debugging / visualisation).
   */
  forward(input: Matrix): ForwardResult {
    const layerStates = [];
    let current = input;
    for (const layer of this.layers) {
      current = layer.forward(current);
      layerStates.push(layer.getState());
    }
    return { output: current.data, layerStates };
  }

  // ── Training step ────────────────────────────────────────

  /**
   * One forward + backward pass for a single sample or mini-batch.
   * Returns the scalar loss value.
   */
  trainStep(input: Matrix, target: Matrix): number {
    const { loss: lossValue, gradients } = backprop(
      this.layers,
      input,
      target,
      this.loss
    );
    applyGradients(this.layers, gradients, this.learningRate);
    return lossValue;
  }

  // ── Serialisation ────────────────────────────────────────

  serialize(): object {
    return {
      loss: this.loss,
      learningRate: this.learningRate,
      layers: this.layers.map((l) => ({
        inputSize: l.inputSize,
        outputSize: l.outputSize,
        activation: l.activationName,
        weights: l.getWeights(),
      })),
    };
  }

  static deserialize(data: ReturnType<NeuralNetwork['serialize']>): NeuralNetwork {
    const d = data as {
      loss: LossName;
      learningRate: number;
      layers: Array<{
        inputSize: number;
        outputSize: number;
        activation: LayerConfig['activation'];
        weights: { W: number[][]; b: number[][] };
      }>;
    };
    const net = new NeuralNetwork({
      loss: d.loss,
      learningRate: d.learningRate,
      layers: d.layers.map((l) => ({
        inputSize: l.inputSize,
        outputSize: l.outputSize,
        activation: l.activation,
      })),
    });
    d.layers.forEach((l, i) => {
      net.layers[i].setWeights(l.weights.W, l.weights.b);
    });
    return net;
  }
}
