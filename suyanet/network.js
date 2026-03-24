/**
 * SuyaNet — Neural Network Engine
 * Full feedforward network with backpropagation, built on raw Matrix ops.
 * No frameworks. No autograd. Every gradient is hand-derived.
 */

const { Matrix } = require('./matrix');
const { Activations } = require('./activations');
const { Loss } = require('./loss');

class DenseLayer {
  /**
   * @param {number} inputSize - number of input neurons
   * @param {number} outputSize - number of output neurons
   * @param {string} activation - 'relu' | 'sigmoid' | 'tanh' | 'softmax' | 'linear'
   */
  constructor(inputSize, outputSize, activation = 'relu') {
    this.inputSize = inputSize;
    this.outputSize = outputSize;
    this.activationName = activation;
    this.activation = Activations[activation];

    // Initialize weights
    if (activation === 'relu' || activation === 'leakyRelu') {
      this.W = Matrix.randomHe(outputSize, inputSize, inputSize);
    } else {
      this.W = Matrix.randomXavier(outputSize, inputSize, inputSize);
    }
    this.b = Matrix.zeros(outputSize, 1);

    // Cache for backprop
    this.Z = null;  // pre-activation
    this.A = null;  // post-activation
    this.Aprev = null; // input to this layer

    // Gradients
    this.dW = null;
    this.db = null;
  }

  /**
   * Forward pass: Z = W·A_prev + b, A = g(Z)
   * @param {Matrix} Aprev - input matrix (inputSize × m)
   * @returns {Matrix} A - output matrix (outputSize × m)
   */
  forward(Aprev) {
    this.Aprev = Aprev;
    // Z = W · Aprev + b (b is broadcast across columns)
    this.Z = Matrix.add(Matrix.multiply(this.W, Aprev), this.b);
    this.A = this.activation.forward(this.Z);
    return this.A;
  }

  /**
   * Backward pass: compute gradients and return dA_prev
   * @param {Matrix} dA - gradient of loss w.r.t. this layer's output (outputSize × m)
   * @returns {Matrix} dAprev - gradient to pass to previous layer (inputSize × m)
   */
  backward(dA) {
    const m = this.Aprev.cols;

    let dZ;
    if (this.activationName === 'softmax') {
      // For softmax + cross-entropy, dA already IS dZ (the combined gradient)
      dZ = dA;
    } else {
      // dZ = dA ⊙ g'(Z)
      const gPrime = this.activation.backward(this.Z);
      dZ = Matrix.hadamard(dA, gPrime);
    }

    // dW = (1/m) · dZ · Aprev^T
    this.dW = Matrix.scale(
      Matrix.multiply(dZ, Matrix.transpose(this.Aprev)),
      1  // scaling already done in loss gradient
    );

    // db = (1/m) · sum(dZ, axis=1)
    this.db = dZ.sumAxis(1);

    // dA_prev = W^T · dZ
    const dAprev = Matrix.multiply(Matrix.transpose(this.W), dZ);

    return dAprev;
  }
}


class NeuralNetwork {
  /**
   * @param {Array<{size: number, activation: string}>} architecture
   *   First element is input size (no activation needed).
   *   Example: [{size: 4}, {size: 16, activation: 'relu'}, {size: 3, activation: 'softmax'}]
   */
  constructor(architecture) {
    this.layers = [];
    this.architecture = architecture;

    for (let i = 1; i < architecture.length; i++) {
      const layer = new DenseLayer(
        architecture[i - 1].size,
        architecture[i].size,
        architecture[i].activation || 'relu'
      );
      this.layers.push(layer);
    }
  }

  /**
   * Forward pass through all layers
   * @param {Matrix} X - input (features × samples)
   * @returns {Matrix} output predictions
   */
  forward(X) {
    let A = X;
    for (const layer of this.layers) {
      A = layer.forward(A);
    }
    return A;
  }

  /**
   * Backward pass through all layers
   * @param {Matrix} dA - gradient from loss function
   */
  backward(dA) {
    let grad = dA;
    for (let i = this.layers.length - 1; i >= 0; i--) {
      grad = this.layers[i].backward(grad);
    }
  }

  /**
   * Compute loss
   * @param {Matrix} Yhat - predictions
   * @param {Matrix} Y - true labels
   * @param {string} lossType - 'mse' | 'binaryCrossEntropy' | 'categoricalCrossEntropy'
   * @returns {number}
   */
  computeLoss(Yhat, Y, lossType = 'categoricalCrossEntropy') {
    return Loss[lossType].forward(Yhat, Y);
  }

  /**
   * Compute loss gradient
   */
  computeLossGradient(Yhat, Y, lossType = 'categoricalCrossEntropy') {
    return Loss[lossType].backward(Yhat, Y);
  }

  /**
   * Get accuracy for classification (argmax comparison)
   */
  accuracy(Yhat, Y) {
    const predIdx = Yhat.argmaxCol();
    const trueIdx = Y.argmaxCol();
    let correct = 0;
    for (let i = 0; i < predIdx.length; i++) {
      if (predIdx[i] === trueIdx[i]) correct++;
    }
    return correct / predIdx.length;
  }

  /** Count total parameters */
  paramCount() {
    let count = 0;
    for (const layer of this.layers) {
      count += layer.W.data.length + layer.b.data.length;
    }
    return count;
  }

  /** Serialize to plain object (for saving) */
  serialize() {
    return {
      architecture: this.architecture,
      weights: this.layers.map(l => ({
        W: Array.from(l.W.data),
        b: Array.from(l.b.data),
        Wshape: [l.W.rows, l.W.cols],
        bshape: [l.b.rows, l.b.cols]
      }))
    };
  }

  /** Load from serialized object */
  static deserialize(obj) {
    const net = new NeuralNetwork(obj.architecture);
    for (let i = 0; i < net.layers.length; i++) {
      const w = obj.weights[i];
      net.layers[i].W = new Matrix(w.Wshape[0], w.Wshape[1], new Float64Array(w.W));
      net.layers[i].b = new Matrix(w.bshape[0], w.bshape[1], new Float64Array(w.b));
    }
    return net;
  }
}

module.exports = { DenseLayer, NeuralNetwork };
