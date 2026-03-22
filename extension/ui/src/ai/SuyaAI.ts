// ============================================================
// SuyaSurf AI Engine — Main Facade (SuyaAI)
// Wires together the neural network, Bayesian engine,
// and data-flow machine for SuyaSurf-specific tasks:
//   • Browsing pattern analysis
//   • Web content classification
//   • User intent prediction
//   • Probabilistic decision-making
// ============================================================

import { NeuralNetwork } from './core/Network';
import { BayesianEngine } from './bayesian/BayesianEngine';
import { Trainer } from './training/Trainer';
import { DataFlowMachine } from './state/DataFlowMachine';
import { Matrix } from './core/Matrix';

import type {
  BrowsingPattern,
  ContentClassification,
  UserIntent,
  AIInsight,
  ProbabilityDistribution,
  BayesianObservation,
  TrainingSample,
  TrainingConfig,
  TrainingResult,
} from './types';

// ── Content category taxonomy ────────────────────────────

const CONTENT_CATEGORIES = [
  'technology',
  'news',
  'entertainment',
  'shopping',
  'social',
  'productivity',
  'reference',
  'other',
] as const;

type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

const CATEGORY_INDEX: Record<ContentCategory, number> = Object.fromEntries(
  CONTENT_CATEGORIES.map((c, i) => [c, i])
) as Record<ContentCategory, number>;

// ── User actions for intent classification ────────────────

const USER_ACTIONS = [
  'searching',
  'reading',
  'shopping',
  'working',
  'socialising',
  'watching',
  'navigating',
  'filling-form',
] as const;

type UserAction = (typeof USER_ACTIONS)[number];

// ── Feature extractors ────────────────────────────────────

function extractUrlFeatures(url: string): number[] {
  const lower = url.toLowerCase();
  return [
    lower.includes('github') || lower.includes('stackoverflow') || lower.includes('dev') ? 1 : 0,
    lower.includes('news') || lower.includes('bbc') || lower.includes('cnn') || lower.includes('reuters') ? 1 : 0,
    lower.includes('youtube') || lower.includes('netflix') || lower.includes('twitch') ? 1 : 0,
    lower.includes('amazon') || lower.includes('ebay') || lower.includes('shop') ? 1 : 0,
    lower.includes('twitter') || lower.includes('facebook') || lower.includes('instagram') || lower.includes('reddit') ? 1 : 0,
    lower.includes('docs') || lower.includes('notion') || lower.includes('figma') ? 1 : 0,
    lower.includes('wikipedia') || lower.includes('wiki') || lower.includes('docs') ? 1 : 0,
  ];
}

function extractTextFeatures(text: string): number[] {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = Math.min(words.length / 1000, 1); // normalise to [0,1]

  return [
    wordCount,
    lower.includes('buy') || lower.includes('price') || lower.includes('cart') ? 1 : 0,
    lower.includes('breaking') || lower.includes('latest') || lower.includes('update') ? 1 : 0,
    lower.includes('function') || lower.includes('class') || lower.includes('const') || lower.includes('import') ? 1 : 0,
    lower.includes('video') || lower.includes('watch') || lower.includes('episode') ? 1 : 0,
    lower.includes('follow') || lower.includes('like') || lower.includes('share') ? 1 : 0,
    (words.length > 500 ? 1 : 0),  // long-form content
  ];
}

function extractBrowsingFeatures(pattern: BrowsingPattern): number[] {
  const dayVisits = pattern.visitCount / 30;         // normalise visit rate
  const avgTime = Math.min(pattern.totalTime / (pattern.visitCount * 60000), 1); // avg time in minutes capped at 1
  const recency = Math.max(0, 1 - (Date.now() - pattern.lastVisit) / (7 * 24 * 3600000)); // recency in 7-day window

  return [
    Math.min(dayVisits, 1),
    avgTime,
    recency,
    ...extractUrlFeatures(pattern.url),
  ];
}

// ── SuyaAI ───────────────────────────────────────────────

export class SuyaAI {
  // Networks
  private contentClassifier: NeuralNetwork;
  private intentPredictor: NeuralNetwork;
  private contentTrainer: Trainer;
  private intentTrainer: Trainer;

  // Bayesian decision engine
  private bayesian: BayesianEngine;

  // Data-flow orchestrator
  readonly dataFlow: DataFlowMachine;

  // In-memory browsing history store
  private browsingHistory: BrowsingPattern[] = [];

  constructor() {
    // Content classifier: 14 features → 8 hidden → 8 categories
    this.contentClassifier = NeuralNetwork.build(
      [
        { units: 16, activation: 'relu' },
        { units: 8, activation: 'softmax' },
      ],
      14,  // 7 URL features + 7 text features
      'crossEntropy',
      0.01
    );

    // Intent predictor: 10 features → 16 hidden → 8 intents
    this.intentPredictor = NeuralNetwork.build(
      [
        { units: 16, activation: 'relu' },
        { units: 8, activation: 'softmax' },
      ],
      10,  // browsing context features
      'crossEntropy',
      0.01
    );

    this.contentTrainer = new Trainer(this.contentClassifier);
    this.intentTrainer = new Trainer(this.intentPredictor);
    this.dataFlow = new DataFlowMachine();

    // Bayesian engine for category prior probabilities
    const uniformPrior: ProbabilityDistribution = Object.fromEntries(
      CONTENT_CATEGORIES.map((c) => [c, 1 / CONTENT_CATEGORIES.length])
    );
    this.bayesian = new BayesianEngine(uniformPrior);

    this._registerBayesianLikelihoods();
  }

  // ── Browsing Pattern Analysis ─────────────────────────────

  /**
   * Record a browsing event. The history is kept in memory and used
   * to derive insights via analysePatterns().
   */
  recordVisit(pattern: BrowsingPattern): void {
    const existing = this.browsingHistory.find((p) => p.domain === pattern.domain);
    if (existing) {
      existing.visitCount += pattern.visitCount;
      existing.totalTime += pattern.totalTime;
      existing.lastVisit = Math.max(existing.lastVisit, pattern.lastVisit);
    } else {
      this.browsingHistory.push({ ...pattern });
    }
  }

  /**
   * Analyse stored browsing patterns to produce ranked insights.
   */
  analysePatterns(): AIInsight[] {
    if (this.browsingHistory.length === 0) return [];

    const sorted = [...this.browsingHistory].sort((a, b) => b.visitCount - a.visitCount);
    const insights: AIInsight[] = [];

    // Top domain suggestion
    const top = sorted[0];
    insights.push({
      type: 'suggestion',
      title: `Frequent: ${top.domain}`,
      body: `You visit ${top.domain} often. Pin it for quick access.`,
      confidence: Math.min(top.visitCount / 50, 1),
      sourceData: top,
    });

    // Time analysis
    const totalMs = this.browsingHistory.reduce((s, p) => s + p.totalTime, 0);
    const topByTime = [...this.browsingHistory].sort((a, b) => b.totalTime - a.totalTime)[0];
    if (topByTime) {
      const pct = Math.round((topByTime.totalTime / totalMs) * 100);
      insights.push({
        type: 'info',
        title: `Time focus: ${topByTime.domain}`,
        body: `${pct}% of your browsing time is spent on ${topByTime.domain}.`,
        confidence: 0.9,
      });
    }

    // Category distribution via neural network
    const categoryTotals: Record<string, number> = {};
    for (const pattern of this.browsingHistory) {
      const cat = this._classifyUrl(pattern.url);
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + pattern.visitCount;
    }
    const topCat = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    if (topCat) {
      insights.push({
        type: 'pattern',
        title: `Primary category: ${topCat[0]}`,
        body: `Most of your browsing is ${topCat[0]}-related content.`,
        confidence: topCat[1] / Object.values(categoryTotals).reduce((s, v) => s + v, 0),
      });
    }

    return insights;
  }

  // ── Content Classification ────────────────────────────────

  /**
   * Classify a web page using a combination of the neural network
   * and the Bayesian engine.
   */
  classifyContent(url: string, title = '', text = ''): ContentClassification {
    const urlFeatures = extractUrlFeatures(url);
    const textFeatures = extractTextFeatures(`${title} ${text}`);
    const combined = [...urlFeatures, ...textFeatures]; // 14-dim

    const nnOutput = this.contentClassifier.predict(combined);

    // Bayesian refinement using URL-level observations
    const obs: BayesianObservation[] = urlFeatures
      .map((v, i) => ({ feature: `urlFeature_${i}`, value: v > 0.5 }))
      .filter((o) => o.value === true);

    let topCategory: ContentCategory = CONTENT_CATEGORIES[0];
    let topProb = 0;
    const categories: ProbabilityDistribution = {};

    if (obs.length > 0) {
      const state = this.bayesian.observe(obs);
      this.bayesian.reset(); // don't contaminate next call
      for (const [cat, prob] of Object.entries(state.posterior)) {
        if (prob > topProb) { topProb = prob; topCategory = cat as ContentCategory; }
        categories[cat] = prob;
      }
    } else {
      // Fall back to pure NN output
      nnOutput.forEach((p, i) => {
        const cat = CONTENT_CATEGORIES[i];
        categories[cat] = p;
        if (p > topProb) { topProb = p; topCategory = cat; }
      });
    }

    return {
      url,
      title,
      text: text.slice(0, 200),
      categories,
      topCategory,
      confidence: topProb,
    };
  }

  // ── User Intent Prediction ────────────────────────────────

  /**
   * Predict what the user is trying to do from behavioural features.
   *
   * @param scrollDepth   0–1 fraction of page scrolled
   * @param timeOnPage    seconds spent on page
   * @param clickCount    number of clicks in this session
   * @param formVisible   whether a form is visible
   * @param searchQuery   last search query (or empty string)
   */
  predictIntent(context: {
    url: string;
    scrollDepth?: number;
    timeOnPage?: number;
    clickCount?: number;
    formVisible?: boolean;
    searchQuery?: string;
    visitCount?: number;
  }): UserIntent {
    const {
      url,
      scrollDepth = 0,
      timeOnPage = 0,
      clickCount = 0,
      formVisible = false,
      searchQuery = '',
      visitCount = 1,
    } = context;

    const urlFeats = extractUrlFeatures(url);
    const features = [
      Math.min(scrollDepth, 1),
      Math.min(timeOnPage / 300, 1),   // cap at 5 min
      Math.min(clickCount / 20, 1),
      formVisible ? 1 : 0,
      searchQuery.length > 0 ? 1 : 0,
      Math.min(visitCount / 10, 1),
      ...urlFeats.slice(0, 4),          // first 4 URL features (10 total)
    ];

    const output = this.intentPredictor.predict(features);
    const idx = output.indexOf(Math.max(...output));
    const action = USER_ACTIONS[idx] ?? 'navigating';
    const confidence = output[idx];

    const context_signals: string[] = [];
    if (scrollDepth > 0.8) context_signals.push('deep reader');
    if (timeOnPage > 120) context_signals.push('long session');
    if (clickCount > 10) context_signals.push('high interaction');
    if (formVisible) context_signals.push('form activity');
    if (searchQuery) context_signals.push(`searching: "${searchQuery}"`);

    const suggestions: Record<UserAction, string> = {
      searching:     'Show related search suggestions.',
      reading:       'Offer a reading mode or text summary.',
      shopping:      'Display price comparisons or coupons.',
      working:       'Minimise distractions and suggest focus tools.',
      socialising:   'Surface notification summaries.',
      watching:      'Offer picture-in-picture mode.',
      navigating:    'Show recent bookmarks and history.',
      'filling-form':'Offer saved profile auto-fill.',
    };

    return {
      action,
      confidence,
      context: context_signals,
      suggestedResponse: suggestions[action] ?? 'No suggestion available.',
    };
  }

  // ── Bayesian Decision ────────────────────────────────────

  /**
   * Make a probabilistic decision over the given categories
   * using the Bayesian engine.
   */
  bayesianDecide(
    categories: string[],
    observations: BayesianObservation[],
    priorOverride?: ProbabilityDistribution
  ) {
    const prior = priorOverride ?? Object.fromEntries(
      categories.map((c) => [c, 1 / categories.length])
    );
    const engine = new BayesianEngine(prior);
    engine.observe(observations);
    return engine.decide();
  }

  // ── Training ─────────────────────────────────────────────

  /**
   * Train the content classifier on labelled URL samples.
   * Each sample.target is a one-hot vector over CONTENT_CATEGORIES.
   */
  trainContentClassifier(
    labelledData: Array<{ url: string; text: string; category: ContentCategory }>,
    config?: Partial<TrainingConfig>
  ): TrainingResult {
    const samples: TrainingSample[] = labelledData.map(({ url, text, category }) => ({
      input: [...extractUrlFeatures(url), ...extractTextFeatures(text)],
      target: CONTENT_CATEGORIES.map((c) => (c === category ? 1 : 0)),
    }));

    return this.contentTrainer.train(samples, {
      epochs: 100,
      batchSize: 16,
      learningRate: 0.01,
      ...config,
    });
  }

  /**
   * Train the intent predictor on labelled interaction logs.
   */
  trainIntentPredictor(
    labelledData: Array<{
      url: string;
      scrollDepth: number;
      timeOnPage: number;
      clickCount: number;
      formVisible: boolean;
      searchQuery: string;
      visitCount: number;
      action: UserAction;
    }>,
    config?: Partial<TrainingConfig>
  ): TrainingResult {
    const samples: TrainingSample[] = labelledData.map((d) => ({
      input: [
        Math.min(d.scrollDepth, 1),
        Math.min(d.timeOnPage / 300, 1),
        Math.min(d.clickCount / 20, 1),
        d.formVisible ? 1 : 0,
        d.searchQuery.length > 0 ? 1 : 0,
        Math.min(d.visitCount / 10, 1),
        ...extractUrlFeatures(d.url).slice(0, 4),
      ],
      target: USER_ACTIONS.map((a) => (a === d.action ? 1 : 0)),
    }));

    return this.intentTrainer.train(samples, {
      epochs: 100,
      batchSize: 16,
      learningRate: 0.01,
      ...config,
    });
  }

  // ── Persistence ──────────────────────────────────────────

  serialize(): object {
    return {
      version: '1.0',
      contentClassifier: this.contentClassifier.serialize(),
      intentPredictor: this.intentPredictor.serialize(),
      browsingHistory: this.browsingHistory,
    };
  }

  static deserialize(data: ReturnType<SuyaAI['serialize']>): SuyaAI {
    const d = data as {
      version: string;
      contentClassifier: object;
      intentPredictor: object;
      browsingHistory: BrowsingPattern[];
    };
    const ai = new SuyaAI();
    ai.contentClassifier = NeuralNetwork.deserialize(d.contentClassifier);
    ai.intentPredictor = NeuralNetwork.deserialize(d.intentPredictor);
    ai.browsingHistory = d.browsingHistory ?? [];
    return ai;
  }

  // ── Private helpers ──────────────────────────────────────

  private _classifyUrl(url: string): ContentCategory {
    const features = [...extractUrlFeatures(url), ...new Array(7).fill(0)];
    const output = this.contentClassifier.predict(features);
    const idx = output.indexOf(Math.max(...output));
    return CONTENT_CATEGORIES[idx] ?? 'other';
  }

  private _registerBayesianLikelihoods(): void {
    // Pre-register domain knowledge as Bayesian likelihoods
    // P(urlFeature_i = true | category)
    const schema: Array<[ContentCategory, Record<string, number>]> = [
      ['technology',   { 'urlFeature_0=true': 0.9, 'urlFeature_1=false': 0.8 }],
      ['news',         { 'urlFeature_1=true': 0.9, 'urlFeature_0=false': 0.7 }],
      ['entertainment',{ 'urlFeature_2=true': 0.9 }],
      ['shopping',     { 'urlFeature_3=true': 0.9 }],
      ['social',       { 'urlFeature_4=true': 0.9 }],
      ['productivity', { 'urlFeature_5=true': 0.85 }],
      ['reference',    { 'urlFeature_6=true': 0.85 }],
      ['other',        {}],
    ];

    for (const [cat, likelihoods] of schema) {
      this.bayesian.setLikelihoods(cat, likelihoods);
    }
  }
}

// ── Singleton factory ────────────────────────────────────

let _instance: SuyaAI | null = null;

export function getSuyaAI(): SuyaAI {
  if (!_instance) _instance = new SuyaAI();
  return _instance;
}

export function resetSuyaAI(): void {
  _instance = null;
}
