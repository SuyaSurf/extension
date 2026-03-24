/**
 * SuyaNet — Activation Functions
 * Each activation has a forward and backward (derivative) function.
 * All operate element-wise on Matrix objects.
 */

const { Matrix } = require('./matrix');

const Activations = {

  // ── ReLU ──
  relu: {
    forward(Z) {
      return Matrix.map(Z, z => Math.max(0, z));
    },
    backward(Z) {
      // derivative: 1 if z > 0, else 0
      return Matrix.map(Z, z => z > 0 ? 1 : 0);
    }
  },

  // ── Leaky ReLU ──
  leakyRelu: {
    alpha: 0.01,
    forward(Z) {
      const a = this.alpha;
      return Matrix.map(Z, z => z > 0 ? z : a * z);
    },
    backward(Z) {
      const a = this.alpha;
      return Matrix.map(Z, z => z > 0 ? 1 : a);
    }
  },

  // ── Sigmoid ──
  sigmoid: {
    forward(Z) {
      return Matrix.map(Z, z => {
        // Numerically stable sigmoid
        if (z >= 0) {
          return 1 / (1 + Math.exp(-z));
        } else {
          const ez = Math.exp(z);
          return ez / (1 + ez);
        }
      });
    },
    backward(Z) {
      // σ'(z) = σ(z) * (1 - σ(z))
      return Matrix.map(Z, z => {
        let s;
        if (z >= 0) {
          s = 1 / (1 + Math.exp(-z));
        } else {
          const ez = Math.exp(z);
          s = ez / (1 + ez);
        }
        return s * (1 - s);
      });
    }
  },

  // ── Tanh ──
  tanh: {
    forward(Z) {
      return Matrix.map(Z, z => Math.tanh(z));
    },
    backward(Z) {
      // tanh'(z) = 1 - tanh²(z)
      return Matrix.map(Z, z => {
        const t = Math.tanh(z);
        return 1 - t * t;
      });
    }
  },

  // ── Softmax (column-wise) ──
  // Each column is a separate sample
  softmax: {
    forward(Z) {
      const result = new Matrix(Z.rows, Z.cols);
      for (let j = 0; j < Z.cols; j++) {
        // Find max for numerical stability
        let maxVal = -Infinity;
        for (let i = 0; i < Z.rows; i++) {
          const v = Z.get(i, j);
          if (v > maxVal) maxVal = v;
        }
        // Compute exp(z - max) and sum
        let sum = 0;
        for (let i = 0; i < Z.rows; i++) {
          const e = Math.exp(Z.get(i, j) - maxVal);
          result.set(i, j, e);
          sum += e;
        }
        // Normalize
        for (let i = 0; i < Z.rows; i++) {
          result.set(i, j, result.get(i, j) / sum);
        }
      }
      return result;
    },
    // For softmax + cross-entropy, the derivative simplifies to (ŷ - y)
    // so we handle it directly in the loss function. This is a placeholder.
    backward(Z) {
      // Not used directly — combined with cross-entropy loss
      return Matrix.ones(Z.rows, Z.cols);
    }
  },

  // ── Linear (identity) ──
  linear: {
    forward(Z) {
      return Z.clone();
    },
    backward(Z) {
      return Matrix.ones(Z.rows, Z.cols);
    }
  }
};

module.exports = { Activations };
