/**
 * UserBrain — Extension-Side Inference Engine
 *
 * Lightweight client-side version that:
 *   1. Loads a trained model exported from the server
 *   2. Runs local inference (decisions) without network calls
 *   3. Collects behavioral signals for server-side retraining
 *   4. Falls back to SRM-only heuristics if NN hasn't been trained yet
 *
 * This runs inside the MV3 service worker — no DOM, no window.
 */

import { Matrix } from './matrix.js';
import { SRM } from './srm.js';
import { NeuralNetwork } from './network.js';

class UserBrain {
  constructor() {
    this.srm = null;
    this.decisionNN = null;
    this.embeddingDim = 16;

    // Entity registry (loaded from server model)
    this.entityIndex = new Map();
    this.entityNames = [];
    this.entityTypes = [];
    this.entityCount = 0;

    // Schema maps
    this.relationTypes = {};
    this.decisionCategories = {};

    // Pending signals to send to server on next sync
    this.pendingSignals = {
      behaviors: [],
      searchQueries: []
    };

    // Model metadata
    this.modelVersion = null;
    this.trainedAt = null;
    this.isReady = false;
  }

  /**
   * Load a model bundle exported from the server.
   * After this, local inference is available.
   */
  loadModel(bundle) {
    if (!bundle || bundle.version !== 1) {
      throw new Error('Invalid model bundle');
    }

    this.embeddingDim = bundle.embeddingDim;
    this.entityIndex = new Map(
      Object.entries(bundle.entityIndex).map(([k, v]) => [k, Number(v)])
    );
    this.entityNames = bundle.entityNames;
    this.entityTypes = bundle.entityTypes;
    this.entityCount = bundle.entityCount;
    this.relationTypes = bundle.relationTypes;
    this.decisionCategories = bundle.decisionCategories;
    this.trainedAt = bundle.trainedAt;
    this.modelVersion = bundle.version;

    // Deserialize SRM
    this.srm = SRM.deserialize(bundle.srm);

    // Deserialize decision NN (may be null if not enough labels yet)
    if (bundle.decisionNN) {
      this.decisionNN = NeuralNetwork.deserialize(bundle.decisionNN);
    }

    this.isReady = true;
    console.log(`[UserBrain] Model loaded: ${this.entityCount} entities, trained at ${new Date(this.trainedAt).toISOString()}`);
  }

  /**
   * Get the SRM embedding for an entity.
   * Returns null if entity unknown.
   */
  getEmbedding(entityName) {
    const idx = this.entityIndex.get(entityName);
    if (idx === undefined || !this.srm) return null;

    const vec = new Float64Array(this.embeddingDim);
    for (let i = 0; i < this.embeddingDim; i++) {
      vec[i] = this.srm.entityEmb.get(i, idx);
    }
    return vec;
  }

  /**
   * Run the decision NN on a given context entity.
   * Returns ranked decisions with confidence scores.
   *
   * @param {string} [contextEntity] - entity name, defaults to user
   * @param {number} [topK=5]
   * @returns {object[]} - [{ decision, confidence }]
   */
  decide(contextEntity, topK = 5) {
    if (!this.isReady) return this._defaultDecisions(topK);

    const entityIdx = contextEntity
      ? (this.entityIndex.get(contextEntity) ?? 0)
      : 0;

    // Build embedding column vector
    const embedding = Matrix.zeros(this.embeddingDim, 1);
    for (let i = 0; i < this.embeddingDim; i++) {
      embedding.set(i, 0, this.srm.entityEmb.get(i, entityIdx));
    }

    if (this.decisionNN) {
      // Full NN inference
      const output = this.decisionNN.forward(embedding);
      return this._rankDecisions(output, topK);
    }

    // Fallback: SRM-only heuristic — use relation scores as proxy
    return this._srmHeuristicDecisions(entityIdx, topK);
  }

  /**
   * Decide what to do for the current browsing context.
   * Accepts a URL and returns relevant decisions.
   */
  decideForUrl(url, topK = 5) {
    const domain = this._extractDomain(url);
    const domainEntity = `domain:${domain}`;
    return this.decide(domainEntity, topK);
  }

  /**
   * Predict what the user is interested in via SRM link prediction.
   *
   * @param {string} relation - e.g. 'INTERESTED_IN'
   * @param {number} [topK=10]
   */
  predictRelated(relation, topK = 10) {
    if (!this.srm) return [];

    const relIdx = this.relationTypes[relation];
    if (relIdx === undefined) return [];

    const predictions = this.srm.predictTail(0, relIdx, topK);
    return predictions.map(p => ({
      entity: this.entityNames[p.entity],
      entityType: this.entityTypes[p.entity],
      score: p.score
    }));
  }

  /**
   * Check if a given entity is known to the model.
   */
  knowsEntity(entityName) {
    return this.entityIndex.has(entityName);
  }

  /**
   * Score how relevant a content entity is to the user.
   * Higher score = more relevant. Uses SRM bilinear scoring.
   */
  relevanceScore(entityName) {
    if (!this.srm) return 0;
    const idx = this.entityIndex.get(entityName);
    if (idx === undefined) return 0;

    // Score across all positive relation types
    const positiveRelations = [
      this.relationTypes.INTERESTED_IN,
      this.relationTypes.VISITS_FREQUENTLY,
      this.relationTypes.BOOKMARKED,
      this.relationTypes.CONTENT_PREFERENCE,
      this.relationTypes.SPENDS_TIME_ON
    ].filter(r => r !== undefined);

    let totalScore = 0;
    for (const relIdx of positiveRelations) {
      totalScore += this.srm.score(0, relIdx, idx);
    }
    return totalScore / positiveRelations.length;
  }

  // ── Signal Collection (for server retraining) ────────────────────────

  /**
   * Record a user behavior event. These are batched and sent to the
   * server on the next sync cycle.
   */
  recordBehavior(action, target, metadata = {}) {
    this.pendingSignals.behaviors.push({
      action,
      target,
      timestamp: Date.now(),
      ...metadata
    });

    // Cap the buffer
    if (this.pendingSignals.behaviors.length > 500) {
      this.pendingSignals.behaviors = this.pendingSignals.behaviors.slice(-500);
    }
  }

  /**
   * Record a search query.
   */
  recordSearch(query) {
    this.pendingSignals.searchQueries.push({
      query,
      timestamp: Date.now()
    });
  }

  /**
   * Flush pending signals — returns the batch and clears the buffer.
   * Call this before sending signals to the server.
   */
  flushSignals() {
    const signals = {
      behaviors: this.pendingSignals.behaviors.map(b => ({
        action: b.action,
        target: b.target,
        timestamp: b.timestamp
      })),
      searchQueries: this.pendingSignals.searchQueries
    };

    this.pendingSignals.behaviors = [];
    this.pendingSignals.searchQueries = [];

    return signals;
  }

  // ── Internal Helpers ───────────────────────────────────────────────────

  _rankDecisions(output, topK) {
    const decisions = [];
    const decisionNames = Object.keys(this.decisionCategories);

    for (let i = 0; i < decisionNames.length; i++) {
      decisions.push({
        decision: decisionNames[i],
        confidence: output.get(i, 0)
      });
    }

    decisions.sort((a, b) => b.confidence - a.confidence);
    return decisions.slice(0, topK);
  }

  _srmHeuristicDecisions(entityIdx, topK) {
    // When no NN is available, use SRM relation scores to infer
    // which decision categories are relevant.
    const relationToDecision = {
      INTERESTED_IN: 'RECOMMEND_CONTENT',
      USES_SKILL: 'ACTIVATE_SKILL',
      CONTENT_PREFERENCE: 'SUGGEST_NEWS_SOURCE',
      VISITS_FREQUENTLY: 'PRIORITIZE_TAB',
      SEARCHES_FOR: 'SUGGEST_LEARNING',
      CLICKED_ACTION: 'RECOMMEND_CONTENT',
      DISMISSED_ACTION: 'SILENCE_NOTIFICATION',
      TIME_PREFERENCE: 'SCHEDULE_TASK',
      GROWTH_GOAL: 'SUGGEST_LEARNING',
    };

    const scores = {};
    for (const [relName, decisionName] of Object.entries(relationToDecision)) {
      const relIdx = this.relationTypes[relName];
      if (relIdx === undefined) continue;

      const score = this.srm.score(0, relIdx, entityIdx);
      scores[decisionName] = (scores[decisionName] || 0) + Math.max(0, score);
    }

    const decisions = Object.entries(scores)
      .map(([decision, confidence]) => ({ decision, confidence }))
      .sort((a, b) => b.confidence - a.confidence);

    return decisions.slice(0, topK);
  }

  _defaultDecisions(topK) {
    // Before any model is loaded, return uniform defaults
    const defaults = [
      { decision: 'RECOMMEND_CONTENT', confidence: 0.2 },
      { decision: 'SUGGEST_LEARNING', confidence: 0.2 },
      { decision: 'SUGGEST_NEWS_SOURCE', confidence: 0.15 },
      { decision: 'ACTIVATE_SKILL', confidence: 0.15 },
      { decision: 'SCHEDULE_TASK', confidence: 0.1 },
    ];
    return defaults.slice(0, topK);
  }

  _extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  /**
   * Serialize the current brain state for persistence in IndexedDB.
   */
  serialize() {
    return {
      modelVersion: this.modelVersion,
      trainedAt: this.trainedAt,
      embeddingDim: this.embeddingDim,
      entityIndex: Object.fromEntries(this.entityIndex),
      entityNames: this.entityNames,
      entityTypes: this.entityTypes,
      entityCount: this.entityCount,
      relationTypes: this.relationTypes,
      decisionCategories: this.decisionCategories,
      srm: this.srm ? this.srm.serialize() : null,
      decisionNN: this.decisionNN ? this.decisionNN.serialize() : null,
      pendingSignals: this.pendingSignals
    };
  }

  /**
   * Restore from serialized state (loaded from IndexedDB).
   */
  deserialize(data) {
    if (!data) return;

    this.modelVersion = data.modelVersion;
    this.trainedAt = data.trainedAt;
    this.embeddingDim = data.embeddingDim;
    this.entityIndex = new Map(Object.entries(data.entityIndex).map(([k, v]) => [k, Number(v)]));
    this.entityNames = data.entityNames;
    this.entityTypes = data.entityTypes;
    this.entityCount = data.entityCount;
    this.relationTypes = data.relationTypes;
    this.decisionCategories = data.decisionCategories;
    this.pendingSignals = data.pendingSignals || { behaviors: [], searchQueries: [] };

    if (data.srm) {
      this.srm = SRM.deserialize(data.srm);
    }
    if (data.decisionNN) {
      this.decisionNN = NeuralNetwork.deserialize(data.decisionNN);
    }

    this.isReady = !!this.srm;
  }
}

export { UserBrain };
