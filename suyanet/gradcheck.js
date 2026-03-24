/**
 * SuyaNet — Numerical Gradient Checking
 * Verifies that analytical backprop gradients match numerical approximations.
 * Uses the centered difference formula: f'(x) ≈ [f(x+h) - f(x-h)] / 2h
 */

const { Matrix } = require('./matrix');
const { NeuralNetwork } = require('./network');

function gradientCheck(net, X, Y, lossType = 'categoricalCrossEntropy', epsilon = 1e-5) {
  // 1. Run forward + backward to get analytical gradients
  const Yhat = net.forward(X);
  const dA = net.computeLossGradient(Yhat, Y, lossType);
  net.backward(dA);

  let maxRelError = 0;
  let totalChecks = 0;

  for (let l = 0; l < net.layers.length; l++) {
    const layer = net.layers[l];

    // Check weight gradients (sample a subset for speed)
    const numCheck = Math.min(layer.W.data.length, 20);
    const indices = [];
    for (let i = 0; i < numCheck; i++) {
      indices.push(Math.floor(Math.random() * layer.W.data.length));
    }

    for (const idx of indices) {
      const original = layer.W.data[idx];

      // f(x + h)
      layer.W.data[idx] = original + epsilon;
      const Yp = net.forward(X);
      const lossPlus = net.computeLoss(Yp, Y, lossType);

      // f(x - h)
      layer.W.data[idx] = original - epsilon;
      const Ym = net.forward(X);
      const lossMinus = net.computeLoss(Ym, Y, lossType);

      // Restore
      layer.W.data[idx] = original;

      // Numerical gradient
      const numGrad = (lossPlus - lossMinus) / (2 * epsilon);
      const anaGrad = layer.dW.data[idx];

      // Relative error
      const denom = Math.max(Math.abs(numGrad) + Math.abs(anaGrad), 1e-8);
      const relError = Math.abs(numGrad - anaGrad) / denom;

      if (relError > maxRelError) maxRelError = relError;
      totalChecks++;
    }
  }

  return { maxRelError, totalChecks, pass: maxRelError < 1e-4 };
}

// Run gradient check
console.log('\n═══ Gradient Check ═══\n');

// Test with MSE + sigmoid
const net1 = new NeuralNetwork([
  { size: 3 },
  { size: 5, activation: 'tanh' },
  { size: 4, activation: 'sigmoid' },
  { size: 2, activation: 'sigmoid' }
]);

const X1 = Matrix.randomUniform(3, 4, -1, 1);
const Y1 = Matrix.randomUniform(2, 4, 0, 1);

const r1 = gradientCheck(net1, X1, Y1, 'mse');
console.log(`MSE + Sigmoid: maxRelError=${r1.maxRelError.toExponential(4)} (${r1.totalChecks} checks) ${r1.pass ? '✓ PASS' : '✗ FAIL'}`);

// Test with cross-entropy + softmax
const net2 = new NeuralNetwork([
  { size: 4 },
  { size: 8, activation: 'relu' },
  { size: 3, activation: 'softmax' }
]);

const X2 = Matrix.randomUniform(4, 6, -1, 1);
// One-hot labels
const Y2 = Matrix.zeros(3, 6);
for (let j = 0; j < 6; j++) {
  Y2.set(Math.floor(Math.random() * 3), j, 1);
}

const r2 = gradientCheck(net2, X2, Y2, 'categoricalCrossEntropy');
console.log(`CrossEntropy + Softmax: maxRelError=${r2.maxRelError.toExponential(4)} (${r2.totalChecks} checks) ${r2.pass ? '✓ PASS' : '✗ FAIL'}`);

// Test with binary cross-entropy
const net3 = new NeuralNetwork([
  { size: 2 },
  { size: 6, activation: 'relu' },
  { size: 1, activation: 'sigmoid' }
]);

const X3 = Matrix.randomUniform(2, 8, -1, 1);
const Y3 = Matrix.fromArray([Array.from({ length: 8 }, () => Math.round(Math.random()))]);

const r3 = gradientCheck(net3, X3, Y3, 'binaryCrossEntropy');
console.log(`BinaryCE + Sigmoid: maxRelError=${r3.maxRelError.toExponential(4)} (${r3.totalChecks} checks) ${r3.pass ? '✓ PASS' : '✗ FAIL'}`);

const allPass = r1.pass && r2.pass && r3.pass;
console.log(`\nOverall: ${allPass ? '✓ ALL GRADIENTS VERIFIED' : '✗ GRADIENT ERRORS DETECTED'}`);
