// ============================================================
// SuyaSurf AI Engine — Core Type Definitions
// Pure TypeScript, zero external dependencies
// ============================================================

// ── Matrix ────────────────────────────────────────────────
export interface MatrixShape {
  rows: number;
  cols: number;
}

export type MatrixData = number[][];

// ── Activation Functions ──────────────────────────────────
export type ActivationName = 'sigmoid' | 'relu' | 'tanh' | 'softmax' | 'linear';

export interface ActivationFn {
  forward(x: number): number;
  derivative(x: number): number;
}

// ── Layer ─────────────────────────────────────────────────
export interface LayerConfig {
  inputSize: number;
  outputSize: number;
  activation: ActivationName;
  learningRate?: number;
}

export interface LayerState {
  input: MatrixData;
  preActivation: MatrixData;  // z = Wx + b
  output: MatrixData;         // a = activation(z)
}

export interface LayerGradients {
  dW: MatrixData;
  db: MatrixData;
  dInput: MatrixData;
}

// ── Network ───────────────────────────────────────────────
export type LossName = 'mse' | 'crossEntropy' | 'binaryCrossEntropy';

export interface NetworkConfig {
  layers: LayerConfig[];
  loss: LossName;
  learningRate: number;
}

export interface ForwardResult {
  output: MatrixData;
  layerStates: LayerState[];
}

// ── Logic Gates ───────────────────────────────────────────
export type GateType = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'NOT';

export interface GateResult {
  gate: GateType;
  inputs: number[];
  output: number;
  confidence: number;
}

// ── Bayesian Engine ───────────────────────────────────────
export interface ProbabilityDistribution {
  [label: string]: number;
}

export interface BayesianState {
  prior: ProbabilityDistribution;
  likelihood: ProbabilityDistribution;
  posterior: ProbabilityDistribution;
  evidence: number;
}

export interface BayesianObservation {
  feature: string;
  value: number | string | boolean;
  weight?: number;
}

export interface BayesianDecision {
  label: string;
  probability: number;
  confidence: number;
  entropy: number;
  alternatives: ProbabilityDistribution;
}

// ── Training ──────────────────────────────────────────────
export interface TrainingSample {
  input: number[];
  target: number[];
  weight?: number;
}

export interface TrainingConfig {
  epochs: number;
  batchSize: number;
  learningRate: number;
  shuffle?: boolean;
  lossThreshold?: number;
  onEpochEnd?: (epoch: number, loss: number) => void;
  onBatchEnd?: (batch: number, loss: number) => void;
}

export interface TrainingResult {
  epochs: number;
  finalLoss: number;
  lossHistory: number[];
  converged: boolean;
  duration: number;
}

// ── Data Flow State Machine ────────────────────────────────
export type FlowState =
  | 'idle'
  | 'collecting'
  | 'preprocessing'
  | 'inferring'
  | 'postprocessing'
  | 'complete'
  | 'error';

export interface FlowEvent {
  type: string;
  payload?: unknown;
  timestamp: number;
}

export interface FlowTransition {
  from: FlowState;
  event: string;
  to: FlowState;
  action?: (payload?: unknown) => void | Promise<void>;
}

export type FlowListener = (event: FlowEvent, state: FlowState) => void;

// ── Short-Term Memory ─────────────────────────────────────
export type {
  MemoryEntry,
  MemoryRetrievalResult,
  STMConfig,
  STMState,
} from './memory/ShortTermMemory';

// ── RNN ───────────────────────────────────────────────────
export type {
  RNNCacheEntry,
  RNNGradients,
  RNNLayerConfig,
} from './core/RNNLayer';

// ── LSTM ──────────────────────────────────────────────────
export type {
  LSTMCacheEntry,
  LSTMState,
  LSTMGradients,
  LSTMLayerConfig,
} from './core/LSTMLayer';

/** A training sample for sequence models: sequence of inputs + single target. */
export interface SequenceSample {
  /** Each element is a flat feature vector (length = inputSize). */
  inputs: number[][];
  /** Target output vector (e.g. one-hot category). */
  target: number[];
}

export interface SequenceTrainingConfig {
  epochs: number;
  learningRate: number;
  bpttTruncate?: number;
  clipNorm?: number;
  lossThreshold?: number;
  onEpochEnd?: (epoch: number, loss: number) => void;
}

export interface SequenceTrainingResult {
  epochs: number;
  finalLoss: number;
  lossHistory: number[];
  converged: boolean;
  duration: number;
}

// ── SuyaSurf AI Tasks ─────────────────────────────────────
export interface BrowsingPattern {
  url: string;
  domain: string;
  visitCount: number;
  totalTime: number;     // ms
  lastVisit: number;     // epoch ms
  category?: string;
}

export interface ContentClassification {
  url: string;
  title?: string;
  text?: string;
  categories: ProbabilityDistribution;
  topCategory: string;
  confidence: number;
}

export interface UserIntent {
  action: string;
  confidence: number;
  context: string[];
  suggestedResponse: string;
}

export interface AIInsight {
  type: 'suggestion' | 'warning' | 'info' | 'pattern';
  title: string;
  body: string;
  confidence: number;
  sourceData?: unknown;
}
