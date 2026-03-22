// ============================================================
// SuyaSurf AI Engine — Bayesian Inference Engine
// Implements prior/likelihood/posterior calculations from
// first principles using raw probability math.
// ============================================================

import type {
  ProbabilityDistribution,
  BayesianState,
  BayesianObservation,
  BayesianDecision,
} from '../types';

const EPSILON = 1e-300;

// ── Utility math ─────────────────────────────────────────

/** Normalise a distribution so all values sum to 1. */
function normalise(dist: ProbabilityDistribution): ProbabilityDistribution {
  const total = Object.values(dist).reduce((s, v) => s + v, 0);
  if (total === 0) throw new Error('BayesianEngine: cannot normalise a zero distribution');
  const result: ProbabilityDistribution = {};
  for (const [k, v] of Object.entries(dist)) {
    result[k] = v / total;
  }
  return result;
}

/** Shannon entropy of a distribution: H = -Σ p·log₂(p) */
function entropy(dist: ProbabilityDistribution): number {
  return Object.values(dist).reduce((h, p) => {
    if (p <= 0) return h;
    return h - p * Math.log2(p);
  }, 0);
}

/** Kullback-Leibler divergence: KL(P || Q) = Σ P(x)·log(P(x)/Q(x)) */
function klDivergence(
  p: ProbabilityDistribution,
  q: ProbabilityDistribution
): number {
  return Object.keys(p).reduce((kl, k) => {
    const pk = p[k] ?? 0;
    const qk = q[k] ?? EPSILON;
    if (pk === 0) return kl;
    return kl + pk * Math.log(pk / qk);
  }, 0);
}

// ── Bayesian Engine ──────────────────────────────────────

export class BayesianEngine {
  private state: BayesianState;

  /** likelihoods[label][feature] = P(feature | label) */
  private likelihoods: Map<string, Map<string, number>> = new Map();

  constructor(prior: ProbabilityDistribution) {
    const normPrior = normalise(prior);
    this.state = {
      prior: normPrior,
      likelihood: {},
      posterior: { ...normPrior },
      evidence: 1,
    };
  }

  // ── Prior Management ─────────────────────────────────────

  getPrior(): ProbabilityDistribution {
    return { ...this.state.prior };
  }

  /** Override the prior and recompute the posterior. */
  setPrior(prior: ProbabilityDistribution): void {
    this.state.prior = normalise(prior);
    this.recomputePosterior();
  }

  /** Update prior toward posterior (Bayesian learning step). */
  updatePrior(): void {
    this.state.prior = { ...this.state.posterior };
  }

  // ── Likelihood Registration ───────────────────────────────

  /**
   * Register a conditional probability: P(feature | label) = probability.
   * Feature is a string key (e.g. "hasCookies", "techSite", etc.)
   */
  setLikelihood(label: string, feature: string, probability: number): void {
    if (probability < 0 || probability > 1) {
      throw new Error(`setLikelihood: probability must be in [0,1], got ${probability}`);
    }
    if (!this.likelihoods.has(label)) {
      this.likelihoods.set(label, new Map());
    }
    this.likelihoods.get(label)!.set(feature, probability);
  }

  /**
   * Batch-register likelihoods for a label.
   * Pass an object: { feature: P(feature | label), ... }
   */
  setLikelihoods(label: string, features: Record<string, number>): void {
    for (const [feature, prob] of Object.entries(features)) {
      this.setLikelihood(label, feature, prob);
    }
  }

  getLikelihood(label: string, feature: string): number {
    return this.likelihoods.get(label)?.get(feature) ?? 0.5; // uninformative default
  }

  // ── Bayesian Update ──────────────────────────────────────

  /**
   * Bayes' theorem (discrete):
   *   P(label | obs) = P(obs | label) · P(label) / P(obs)
   *
   * Multiple observations are assumed independent (Naïve Bayes).
   * After this call the posterior is updated and the prior is preserved.
   */
  observe(observations: BayesianObservation[]): BayesianState {
    const labels = Object.keys(this.state.prior);
    const unnormalised: ProbabilityDistribution = {};

    for (const label of labels) {
      let score = this.state.prior[label];

      for (const obs of observations) {
        const feature = this.featureKey(obs);
        const p = this.getLikelihood(label, feature);
        const weighted = obs.weight !== undefined ? Math.pow(p, obs.weight) : p;
        score *= weighted + EPSILON;
      }

      unnormalised[label] = score;
    }

    const evidence = Object.values(unnormalised).reduce((s, v) => s + v, 0);
    const posterior = normalise(unnormalised);

    // Aggregate likelihood (marginalised over the current observations)
    const likelihood: ProbabilityDistribution = {};
    for (const label of labels) {
      likelihood[label] = unnormalised[label] / (this.state.prior[label] + EPSILON);
    }

    this.state = {
      prior: this.state.prior,
      likelihood: normalise(likelihood),
      posterior,
      evidence,
    };

    return { ...this.state };
  }

  // ── Decision ─────────────────────────────────────────────

  /**
   * Pick the MAP (maximum a posteriori) label from the posterior
   * and compute confidence + entropy metrics.
   */
  decide(): BayesianDecision {
    const posterior = this.state.posterior;
    const labels = Object.keys(posterior);
    const best = labels.reduce((a, b) => (posterior[a] > posterior[b] ? a : b));
    const H = entropy(posterior);
    const maxEntropy = Math.log2(labels.length);

    return {
      label: best,
      probability: posterior[best],
      confidence: 1 - H / (maxEntropy || 1),
      entropy: H,
      alternatives: { ...posterior },
    };
  }

  // ── Posterior queries ────────────────────────────────────

  getPosterior(): ProbabilityDistribution {
    return { ...this.state.posterior };
  }

  getState(): BayesianState {
    return { ...this.state };
  }

  /** KL divergence from current posterior to prior (information gain). */
  informationGain(): number {
    return klDivergence(this.state.posterior, this.state.prior);
  }

  // ── Reset ────────────────────────────────────────────────

  reset(): void {
    this.state.posterior = { ...this.state.prior };
    this.state.likelihood = {};
    this.state.evidence = 1;
  }

  // ── Helpers ──────────────────────────────────────────────

  private featureKey(obs: BayesianObservation): string {
    return `${obs.feature}=${obs.value}`;
  }

  private recomputePosterior(): void {
    this.state.posterior = { ...this.state.prior };
    this.state.evidence = 1;
  }

  // ── Gaussian Naïve Bayes (continuous features) ────────────

  /**
   * For continuous features: P(x | label) = Gaussian(μ, σ²)
   * Stored as { mean, variance } per (label, feature) pair.
   */
  private gaussianParams: Map<string, Map<string, { mean: number; variance: number }>> = new Map();

  setGaussianParam(
    label: string,
    feature: string,
    mean: number,
    variance: number
  ): void {
    if (!this.gaussianParams.has(label)) {
      this.gaussianParams.set(label, new Map());
    }
    this.gaussianParams.get(label)!.set(feature, { mean, variance });
  }

  /**
   * Evaluate P(x | label) using the stored Gaussian parameters.
   * Returns 0.5 (uninformative) if no params are registered.
   */
  gaussianLikelihood(label: string, feature: string, x: number): number {
    const params = this.gaussianParams.get(label)?.get(feature);
    if (!params) return 0.5;
    const { mean, variance } = params;
    const sigma2 = Math.max(variance, EPSILON);
    const exponent = -((x - mean) ** 2) / (2 * sigma2);
    return (1 / Math.sqrt(2 * Math.PI * sigma2)) * Math.exp(exponent);
  }

  /**
   * Bayesian update using continuous Gaussian likelihoods.
   * obs.value must be a number.
   */
  observeContinuous(
    observations: Array<{ feature: string; value: number; weight?: number }>
  ): BayesianState {
    const binaryObs = observations.map((obs) => ({
      feature: obs.feature,
      value: obs.value,
      weight: obs.weight,
    }));

    // Override getLikelihood temporarily with Gaussian version
    const labels = Object.keys(this.state.prior);
    const unnormalised: ProbabilityDistribution = {};

    for (const label of labels) {
      let score = this.state.prior[label];
      for (const obs of binaryObs) {
        const p = this.gaussianLikelihood(label, obs.feature, obs.value as number);
        const weighted = obs.weight !== undefined ? Math.pow(p, obs.weight) : p;
        score *= weighted + EPSILON;
      }
      unnormalised[label] = score;
    }

    const evidence = Object.values(unnormalised).reduce((s, v) => s + v, 0);
    const posterior = normalise(unnormalised);

    const likelihood: ProbabilityDistribution = {};
    for (const label of labels) {
      likelihood[label] = unnormalised[label] / (this.state.prior[label] + EPSILON);
    }

    this.state = {
      prior: this.state.prior,
      likelihood: normalise(likelihood),
      posterior,
      evidence,
    };

    return { ...this.state };
  }
}
