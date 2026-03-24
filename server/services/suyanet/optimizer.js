/**
 * SuyaNet — Optimizers
 * SGD with Momentum and Adam, implemented from scratch.
 * Operates directly on DenseLayer weight/bias matrices.
 */

import { Matrix } from './matrix.js';

class SGD {
  /**
   * @param {DenseLayer[]} layers
   * @param {object} [options]
   * @param {number} [options.lr=0.01] - learning rate
   * @param {number} [options.momentum=0.9] - momentum coefficient
   * @param {number} [options.weightDecay=0] - L2 regularization
   */
  constructor(layers, options = {}) {
    this.layers = layers;
    this.lr = options.lr || 0.01;
    this.momentum = options.momentum || 0.9;
    this.weightDecay = options.weightDecay || 0;

    // Velocity buffers
    this.vW = layers.map(l => Matrix.zeros(l.W.rows, l.W.cols));
    this.vb = layers.map(l => Matrix.zeros(l.b.rows, l.b.cols));
  }

  step() {
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];

      // V = β·V + (1-β)·dW
      // (adding weight decay: dW += λ·W)
      for (let k = 0; k < layer.W.data.length; k++) {
        const grad = layer.dW.data[k] + this.weightDecay * layer.W.data[k];
        this.vW[i].data[k] = this.momentum * this.vW[i].data[k] + (1 - this.momentum) * grad;
        layer.W.data[k] -= this.lr * this.vW[i].data[k];
      }

      for (let k = 0; k < layer.b.data.length; k++) {
        this.vb[i].data[k] = this.momentum * this.vb[i].data[k] + (1 - this.momentum) * layer.db.data[k];
        layer.b.data[k] -= this.lr * this.vb[i].data[k];
      }
    }
  }
}


class Adam {
  /**
   * @param {DenseLayer[]} layers
   * @param {object} [options]
   * @param {number} [options.lr=0.001] - learning rate
   * @param {number} [options.beta1=0.9] - first moment decay
   * @param {number} [options.beta2=0.999] - second moment decay
   * @param {number} [options.epsilon=1e-8] - numerical stability
   * @param {number} [options.weightDecay=0] - L2 regularization
   */
  constructor(layers, options = {}) {
    this.layers = layers;
    this.lr = options.lr || 0.001;
    this.beta1 = options.beta1 || 0.9;
    this.beta2 = options.beta2 || 0.999;
    this.eps = options.epsilon || 1e-8;
    this.weightDecay = options.weightDecay || 0;
    this.t = 0;

    // First moment (mean of gradients)
    this.mW = layers.map(l => Matrix.zeros(l.W.rows, l.W.cols));
    this.mb = layers.map(l => Matrix.zeros(l.b.rows, l.b.cols));

    // Second moment (mean of squared gradients)
    this.vW = layers.map(l => Matrix.zeros(l.W.rows, l.W.cols));
    this.vb = layers.map(l => Matrix.zeros(l.b.rows, l.b.cols));
  }

  step() {
    this.t++;
    const { beta1, beta2, eps, lr } = this;
    const bc1 = 1 - Math.pow(beta1, this.t); // bias correction 1
    const bc2 = 1 - Math.pow(beta2, this.t); // bias correction 2

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];

      // ── Update weights ──
      for (let k = 0; k < layer.W.data.length; k++) {
        const g = layer.dW.data[k] + this.weightDecay * layer.W.data[k];

        // m = β₁·m + (1-β₁)·g
        this.mW[i].data[k] = beta1 * this.mW[i].data[k] + (1 - beta1) * g;
        // v = β₂·v + (1-β₂)·g²
        this.vW[i].data[k] = beta2 * this.vW[i].data[k] + (1 - beta2) * g * g;

        // Bias-corrected estimates
        const mHat = this.mW[i].data[k] / bc1;
        const vHat = this.vW[i].data[k] / bc2;

        // W = W - lr · m̂ / (√v̂ + ε)
        layer.W.data[k] -= lr * mHat / (Math.sqrt(vHat) + eps);
      }

      // ── Update biases ──
      for (let k = 0; k < layer.b.data.length; k++) {
        const g = layer.db.data[k];

        this.mb[i].data[k] = beta1 * this.mb[i].data[k] + (1 - beta1) * g;
        this.vb[i].data[k] = beta2 * this.vb[i].data[k] + (1 - beta2) * g * g;

        const mHat = this.mb[i].data[k] / bc1;
        const vHat = this.vb[i].data[k] / bc2;

        layer.b.data[k] -= lr * mHat / (Math.sqrt(vHat) + eps);
      }
    }
  }
}


/**
 * Learning rate scheduler — step decay
 */
class LRScheduler {
  constructor(optimizer, options = {}) {
    this.optimizer = optimizer;
    this.initialLr = optimizer.lr;
    this.decayRate = options.decayRate || 0.5;
    this.decayEvery = options.decayEvery || 100; // epochs
  }

  step(epoch) {
    const factor = Math.pow(this.decayRate, Math.floor(epoch / this.decayEvery));
    this.optimizer.lr = this.initialLr * factor;
  }
}

export { SGD, Adam, LRScheduler };
