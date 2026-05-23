// ============================================================
// SuyaSurf AI Engine — Public API
// Import from '@/ai' or 'src/ai/index' to access all exports.
// ============================================================

// Main facade
export { SuyaAI, getSuyaAI, resetSuyaAI } from './SuyaAI';

// Core primitives
export { Matrix } from './core/Matrix';
export { DenseLayer } from './core/Layer';
export { NeuralNetwork } from './core/Network';
export { backprop, applyGradients, computeLoss } from './core/Backprop';
export {
  getActivation,
  Sigmoid,
  ReLU,
  Tanh,
  Softmax,
  Linear,
  sigmoid,
  relu,
  tanh,
  softmaxMatrix,
} from './core/Activation';
export {
  evaluateGate,
  runTruthTable,
  createTrainableGate,
  GATE_TRUTH_TABLES,
} from './core/LogicGates';

// Memory
export { ShortTermMemory } from './memory/ShortTermMemory';
export type { MemoryEntry, MemoryRetrievalResult, STMConfig, STMState } from './memory/ShortTermMemory';

// Recurrent layers
export { RNNLayer } from './core/RNNLayer';
export type { RNNCacheEntry, RNNGradients, RNNLayerConfig } from './core/RNNLayer';
export { LSTMLayer } from './core/LSTMLayer';
export type { LSTMCacheEntry, LSTMState, LSTMGradients, LSTMLayerConfig } from './core/LSTMLayer';

// Bayesian engine
export { BayesianEngine } from './bayesian/BayesianEngine';

// Training
export {
  Trainer,
  computeNormStats,
  normalise as normaliseInputs,
} from './training/Trainer';

// State machine
export { DataFlowMachine } from './state/DataFlowMachine';

// All types
export type {
  // Matrix
  MatrixShape,
  MatrixData,
  // Activations
  ActivationName,
  ActivationFn,
  // Layers
  LayerConfig,
  LayerState,
  LayerGradients,
  // Network
  NetworkConfig,
  ForwardResult,
  LossName,
  // Logic gates
  GateType,
  GateResult,
  // Bayesian
  ProbabilityDistribution,
  BayesianState,
  BayesianObservation,
  BayesianDecision,
  // Training
  TrainingSample,
  TrainingConfig,
  TrainingResult,
  // State machine
  FlowState,
  FlowEvent,
  FlowTransition,
  FlowListener,
  // Sequence training
  SequenceSample,
  SequenceTrainingConfig,
  SequenceTrainingResult,
  // SuyaSurf AI tasks
  BrowsingPattern,
  ContentClassification,
  UserIntent,
  AIInsight,
} from './types';
