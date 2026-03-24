/**
 * SuyaNet — Main Entry Point
 * Raw Matrix AI: Neural Network + Statistical Relational Model
 * Zero dependencies. Every algorithm hand-written.
 */

const { Matrix } = require('./matrix');
const { Activations } = require('./activations');
const { Loss } = require('./loss');
const { DenseLayer, NeuralNetwork } = require('./network');
const { SGD, Adam, LRScheduler } = require('./optimizer');
const { SRM } = require('./srm');

module.exports = {
  Matrix,
  Activations,
  Loss,
  DenseLayer,
  NeuralNetwork,
  SGD,
  Adam,
  LRScheduler,
  SRM
};
