/**
 * SuyaNet — Loss Functions
 * Each loss has a forward (compute loss scalar) and backward (gradient w.r.t. predictions).
 * Y and Yhat are Matrix objects where each column is one sample.
 */

import { Matrix } from './matrix.js';

export const Loss = {

  // ── Mean Squared Error ──
  // L = (1/2m) * Σ(ŷ - y)²
  mse: {
    forward(Yhat, Y) {
      const diff = Matrix.subtract(Yhat, Y);
      let sum = 0;
      for (let i = 0; i < diff.data.length; i++) {
        sum += diff.data[i] * diff.data[i];
      }
      return sum / (2 * Y.cols);
    },
    backward(Yhat, Y) {
      // dL/dŷ = (ŷ - y) / m
      const diff = Matrix.subtract(Yhat, Y);
      return Matrix.scale(diff, 1 / Y.cols);
    }
  },

  // ── Binary Cross-Entropy ──
  // L = -(1/m) * Σ[ y·log(ŷ) + (1-y)·log(1-ŷ) ]
  binaryCrossEntropy: {
    forward(Yhat, Y) {
      const m = Y.cols;
      let sum = 0;
      const eps = 1e-15;
      for (let i = 0; i < Yhat.data.length; i++) {
        const yh = Math.max(eps, Math.min(1 - eps, Yhat.data[i]));
        const y = Y.data[i];
        sum += y * Math.log(yh) + (1 - y) * Math.log(1 - yh);
      }
      return -sum / m;
    },
    backward(Yhat, Y) {
      // dL/dŷ = -(y/ŷ - (1-y)/(1-ŷ)) / m
      const m = Y.cols;
      const eps = 1e-15;
      const result = new Matrix(Yhat.rows, Yhat.cols);
      for (let i = 0; i < Yhat.data.length; i++) {
        const yh = Math.max(eps, Math.min(1 - eps, Yhat.data[i]));
        const y = Y.data[i];
        result.data[i] = (-(y / yh) + (1 - y) / (1 - yh)) / m;
      }
      return result;
    }
  },

  // ── Categorical Cross-Entropy (with Softmax) ──
  // L = -(1/m) * Σ y·log(ŷ)
  // Combined with softmax, gradient simplifies to (ŷ - y)/m
  categoricalCrossEntropy: {
    forward(Yhat, Y) {
      const m = Y.cols;
      const eps = 1e-15;
      let sum = 0;
      for (let i = 0; i < Yhat.data.length; i++) {
        if (Y.data[i] > 0) {
          sum += Y.data[i] * Math.log(Math.max(eps, Yhat.data[i]));
        }
      }
      return -sum / m;
    },
    backward(Yhat, Y) {
      // Combined softmax + cross-entropy gradient: (ŷ - y) / m
      const diff = Matrix.subtract(Yhat, Y);
      return Matrix.scale(diff, 1 / Y.cols);
    }
  },

  // ── Margin Ranking Loss (for SRM) ──
  // L = max(0, margin + score_neg - score_pos)
  marginRanking: {
    forward(scorePos, scoreNeg, margin = 1.0) {
      let sum = 0;
      const m = scorePos.data.length;
      for (let i = 0; i < m; i++) {
        sum += Math.max(0, margin + scoreNeg.data[i] - scorePos.data[i]);
      }
      return sum / m;
    },
    backward(scorePos, scoreNeg, margin = 1.0) {
      // Returns {dPos, dNeg} gradient signals
      const m = scorePos.data.length;
      const dPos = new Matrix(scorePos.rows, scorePos.cols);
      const dNeg = new Matrix(scoreNeg.rows, scoreNeg.cols);
      for (let i = 0; i < m; i++) {
        const violation = margin + scoreNeg.data[i] - scorePos.data[i];
        if (violation > 0) {
          dPos.data[i] = -1 / m;  // push positive score up
          dNeg.data[i] = 1 / m;   // push negative score down
        }
      }
      return { dPos, dNeg };
    }
  }
};
