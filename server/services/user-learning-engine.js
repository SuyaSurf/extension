/**
 * User Learning Engine — Server-Side
 *
 * Uses SuyaNet's SRM (knowledge graph) + NeuralNetwork to build a persistent
 * model of each user. Ingests signals from the extension (onboarding answers,
 * browsing history, bookmarks, behavior events), builds a knowledge graph,
 * trains decision-making networks, and exports serialized models for
 * client-side inference.
 *
 * Architecture:
 *   1. Signal ingestion  → entity/relation registry grows
 *   2. SRM training      → learns entity embeddings via margin ranking
 *   3. NN training       → maps embeddings to decision outputs
 *   4. Model export      → serialized bundle sent to extension
 */

import { Matrix } from './suyanet/matrix.js';
import { SRM } from './suyanet/srm.js';
import { NeuralNetwork } from './suyanet/network.js';
import { Adam } from './suyanet/optimizer.js';

// ── Entity & Relation Type Registries ──────────────────────────────────────

/** Fixed relation types the knowledge graph understands */
const RELATION_TYPES = {
  INTERESTED_IN:      0,
  WORKS_IN:           1,
  PREFERS_STYLE:      2,
  VISITS_FREQUENTLY:  3,
  BOOKMARKED:         4,
  USES_SKILL:         5,
  CLICKED_ACTION:     6,
  DISMISSED_ACTION:   7,
  GROWTH_GOAL:        8,
  TIME_PREFERENCE:    9,
  CONTENT_PREFERENCE: 10,
  SEARCHES_FOR:       11,
  INSTALLED_EXT:      12,
  SPENDS_TIME_ON:     13,
};

const NUM_RELATIONS = Object.keys(RELATION_TYPES).length;

/** Decision categories the NN can output */
const DECISION_CATEGORIES = {
  RECOMMEND_CONTENT:    0,
  ACTIVATE_SKILL:       1,
  SUGGEST_NEWS_SOURCE:  2,
  AUTO_FILL_FORM:       3,
  SCHEDULE_TASK:        4,
  SEND_NOTIFICATION:    5,
  SUGGEST_LEARNING:     6,
  DRAFT_EMAIL:          7,
  PRIORITIZE_TAB:       8,
  SILENCE_NOTIFICATION: 9,
};

const NUM_DECISIONS = Object.keys(DECISION_CATEGORIES).length;

// ── User Learning Engine ───────────────────────────────────────────────────

class UserLearningEngine {
  /**
   * @param {object} options
   * @param {number} [options.embeddingDim=16]  - SRM embedding dimension
   * @param {number} [options.maxEntities=512]  - maximum entities in graph
   * @param {number} [options.srmEpochs=200]    - SRM training epochs
   * @param {number} [options.nnEpochs=300]     - NN training epochs
   * @param {number} [options.srmLr=0.01]       - SRM learning rate
   * @param {number} [options.nnLr=0.005]       - NN learning rate
   */
  constructor(options = {}) {
    this.embeddingDim = options.embeddingDim || 16;
    this.maxEntities = options.maxEntities || 512;
    this.srmEpochs = options.srmEpochs || 200;
    this.nnEpochs = options.nnEpochs || 300;
    this.srmLr = options.srmLr || 0.01;
    this.nnLr = options.nnLr || 0.005;

    // Entity registry: name → index
    this.entityIndex = new Map();
    this.entityNames = [];       // index → name
    this.entityTypes = [];       // index → type string
    this.nextEntityId = 0;

    // Knowledge graph triples: [headIdx, relationIdx, tailIdx]
    this.triples = [];

    // Decision training data: { entityIdx, decisionIdx, label (0 or 1) }
    this.decisionLabels = [];

    // Trained models (null until trained)
    this.srm = null;
    this.decisionNN = null;

    // Training metadata
    this.lastTrainedAt = null;
    this.trainingStats = { srmLoss: null, nnLoss: null, nnAccuracy: null };

    // Always register the user entity as index 0
    this._registerEntity('__user__', 'user');
  }

  // ── Entity Management ──────────────────────────────────────────────────

  _registerEntity(name, type = 'concept') {
    if (this.entityIndex.has(name)) return this.entityIndex.get(name);
    if (this.nextEntityId >= this.maxEntities) {
      console.warn(`[UserLearningEngine] Max entities (${this.maxEntities}) reached, skipping: ${name}`);
      return null;
    }
    const idx = this.nextEntityId++;
    this.entityIndex.set(name, idx);
    this.entityNames[idx] = name;
    this.entityTypes[idx] = type;
    return idx;
  }

  _getOrCreateEntity(name, type = 'concept') {
    return this.entityIndex.has(name)
      ? this.entityIndex.get(name)
      : this._registerEntity(name, type);
  }

  // ── Signal Ingestion ───────────────────────────────────────────────────

  /**
   * Ingest a batch of user signals and build knowledge graph triples.
   *
   * @param {object} signals
   * @param {object} [signals.onboarding]       - onboarding answers
   * @param {object[]} [signals.browsingHistory] - { url, title, visitCount, category }
   * @param {object[]} [signals.bookmarks]       - { url, title, category }
   * @param {object[]} [signals.extensions]      - { name, category }
   * @param {object[]} [signals.behaviors]       - { action, target, timestamp }
   * @param {object} [signals.patterns]          - { peakHours, sessionDuration, contentPrefs }
   */
  ingestSignals(signals) {
    const userId = 0; // __user__ is always index 0

    // ── Onboarding data ──
    if (signals.onboarding) {
      const ob = signals.onboarding;

      if (ob.careerFocus) {
        const careerEnt = this._getOrCreateEntity(`career:${ob.careerFocus}`, 'career');
        this.triples.push([userId, RELATION_TYPES.WORKS_IN, careerEnt]);
      }

      if (ob.growthGoal) {
        const goalEnt = this._getOrCreateEntity(`goal:${ob.growthGoal}`, 'goal');
        this.triples.push([userId, RELATION_TYPES.GROWTH_GOAL, goalEnt]);
      }

      if (ob.learningStyle) {
        const styleEnt = this._getOrCreateEntity(`style:${ob.learningStyle}`, 'style');
        this.triples.push([userId, RELATION_TYPES.PREFERS_STYLE, styleEnt]);
      }

      if (ob.interests) {
        for (const [category, items] of Object.entries(ob.interests)) {
          const catEnt = this._getOrCreateEntity(`interest:${category}`, 'interest');
          this.triples.push([userId, RELATION_TYPES.INTERESTED_IN, catEnt]);

          // Weight by visit count — add duplicate triples for stronger signal
          if (Array.isArray(items)) {
            for (const item of items.slice(0, 10)) {
              const itemEnt = this._getOrCreateEntity(`topic:${item.category || item.title || category}`, 'topic');
              this.triples.push([userId, RELATION_TYPES.INTERESTED_IN, itemEnt]);
            }
          }
        }
      }

      if (ob.contentTypes && Array.isArray(ob.contentTypes)) {
        for (const ct of ob.contentTypes) {
          const ctEnt = this._getOrCreateEntity(`content:${ct}`, 'content_type');
          this.triples.push([userId, RELATION_TYPES.CONTENT_PREFERENCE, ctEnt]);
        }
      }

      if (ob.recommendedSources && Array.isArray(ob.recommendedSources)) {
        for (const src of ob.recommendedSources) {
          const srcEnt = this._getOrCreateEntity(`source:${src.id || src.name}`, 'news_source');
          this.triples.push([userId, RELATION_TYPES.CONTENT_PREFERENCE, srcEnt]);
        }
      }
    }

    // ── Browsing History ──
    if (signals.browsingHistory && Array.isArray(signals.browsingHistory)) {
      for (const page of signals.browsingHistory.slice(0, 100)) {
        const domain = this._extractDomain(page.url);
        const domainEnt = this._getOrCreateEntity(`domain:${domain}`, 'domain');
        this.triples.push([userId, RELATION_TYPES.VISITS_FREQUENTLY, domainEnt]);

        if (page.category) {
          const catEnt = this._getOrCreateEntity(`interest:${page.category}`, 'interest');
          this.triples.push([domainEnt, RELATION_TYPES.INTERESTED_IN, catEnt]);
        }

        // High visit counts → stronger signal
        if (page.visitCount > 10) {
          this.triples.push([userId, RELATION_TYPES.SPENDS_TIME_ON, domainEnt]);
        }
      }
    }

    // ── Bookmarks ──
    if (signals.bookmarks && Array.isArray(signals.bookmarks)) {
      for (const bm of signals.bookmarks.slice(0, 100)) {
        const domain = this._extractDomain(bm.url);
        const domainEnt = this._getOrCreateEntity(`domain:${domain}`, 'domain');
        this.triples.push([userId, RELATION_TYPES.BOOKMARKED, domainEnt]);

        if (bm.category) {
          const catEnt = this._getOrCreateEntity(`interest:${bm.category}`, 'interest');
          this.triples.push([domainEnt, RELATION_TYPES.INTERESTED_IN, catEnt]);
        }
      }
    }

    // ── Installed Extensions ──
    if (signals.extensions && Array.isArray(signals.extensions)) {
      for (const ext of signals.extensions) {
        const extEnt = this._getOrCreateEntity(`ext:${ext.name}`, 'extension');
        this.triples.push([userId, RELATION_TYPES.INSTALLED_EXT, extEnt]);

        if (ext.category) {
          const catEnt = this._getOrCreateEntity(`interest:${ext.category}`, 'interest');
          this.triples.push([extEnt, RELATION_TYPES.INTERESTED_IN, catEnt]);
        }
      }
    }

    // ── Behavior events (clicks, dismissals, skill usage) ──
    if (signals.behaviors && Array.isArray(signals.behaviors)) {
      for (const evt of signals.behaviors.slice(0, 200)) {
        const targetEnt = this._getOrCreateEntity(`action:${evt.target}`, 'action');

        if (evt.action === 'click' || evt.action === 'use') {
          this.triples.push([userId, RELATION_TYPES.CLICKED_ACTION, targetEnt]);
        } else if (evt.action === 'dismiss') {
          this.triples.push([userId, RELATION_TYPES.DISMISSED_ACTION, targetEnt]);
        } else if (evt.action === 'search') {
          const searchEnt = this._getOrCreateEntity(`search:${evt.target}`, 'search_query');
          this.triples.push([userId, RELATION_TYPES.SEARCHES_FOR, searchEnt]);
        } else if (evt.action === 'skill_use') {
          const skillEnt = this._getOrCreateEntity(`skill:${evt.target}`, 'skill');
          this.triples.push([userId, RELATION_TYPES.USES_SKILL, skillEnt]);
        }
      }
    }

    // ── Browsing patterns ──
    if (signals.patterns) {
      if (signals.patterns.peakHours && Array.isArray(signals.patterns.peakHours)) {
        for (const hour of signals.patterns.peakHours) {
          const hourEnt = this._getOrCreateEntity(`time:hour_${hour}`, 'time_slot');
          this.triples.push([userId, RELATION_TYPES.TIME_PREFERENCE, hourEnt]);
        }
      }

      if (signals.patterns.contentPrefs && Array.isArray(signals.patterns.contentPrefs)) {
        for (const pref of signals.patterns.contentPrefs) {
          const prefEnt = this._getOrCreateEntity(`content:${pref}`, 'content_type');
          this.triples.push([userId, RELATION_TYPES.CONTENT_PREFERENCE, prefEnt]);
        }
      }
    }

    // Deduplicate triples
    this._deduplicateTriples();

    return {
      entityCount: this.nextEntityId,
      tripleCount: this.triples.length,
      relationTypes: NUM_RELATIONS
    };
  }

  /**
   * Add decision-label pairs for supervised NN training.
   * These come from observed user decisions during onboarding or continued use.
   *
   * @param {object[]} labels - { context (entity name), decision (string), positive (boolean) }
   */
  ingestDecisionLabels(labels) {
    for (const label of labels) {
      const entityIdx = this.entityIndex.get(label.context);
      const decisionIdx = DECISION_CATEGORIES[label.decision];

      if (entityIdx !== undefined && decisionIdx !== undefined) {
        this.decisionLabels.push({
          entityIdx,
          decisionIdx,
          label: label.positive ? 1 : 0
        });
      }
    }
  }

  // ── Training ───────────────────────────────────────────────────────────

  /**
   * Train the full pipeline: SRM first, then decision NN on embeddings.
   * Returns training statistics.
   */
  train() {
    if (this.triples.length < 3) {
      throw new Error('Not enough triples to train (need at least 3)');
    }

    const stats = {};

    // ── Phase 1: Train SRM on knowledge graph ──
    console.log(`[UserLearningEngine] Training SRM: ${this.nextEntityId} entities, ${this.triples.length} triples, dim=${this.embeddingDim}`);

    this.srm = new SRM(this.nextEntityId, NUM_RELATIONS, this.embeddingDim, {
      margin: 1.0,
      lr: this.srmLr,
      regWeight: 0.001
    });

    let srmLoss = 0;
    for (let epoch = 0; epoch < this.srmEpochs; epoch++) {
      // Shuffle triples each epoch
      const shuffled = [...this.triples].sort(() => Math.random() - 0.5);
      srmLoss = this.srm.trainBatch(shuffled);

      if (epoch % 50 === 0) {
        console.log(`  SRM epoch ${epoch}: loss = ${srmLoss.toFixed(4)}`);
      }
    }
    stats.srmFinalLoss = srmLoss;
    stats.srmEntities = this.nextEntityId;
    stats.srmTriples = this.triples.length;

    // ── Phase 2: Train decision NN on SRM embeddings ──
    stats.nnTrained = false;

    if (this.decisionLabels.length >= 2) {
      console.log(`[UserLearningEngine] Training decision NN: ${this.decisionLabels.length} labels`);

      const { X, Y } = this._buildDecisionTrainingData();

      // Architecture: embeddingDim → 32 (relu) → 16 (relu) → NUM_DECISIONS (softmax)
      this.decisionNN = new NeuralNetwork([
        { size: this.embeddingDim },
        { size: 32, activation: 'relu' },
        { size: 16, activation: 'relu' },
        { size: NUM_DECISIONS, activation: 'softmax' }
      ]);

      const optimizer = new Adam(this.decisionNN.layers, { lr: this.nnLr });
      let lastLoss = 0;

      for (let epoch = 0; epoch < this.nnEpochs; epoch++) {
        const Yhat = this.decisionNN.forward(X);
        lastLoss = this.decisionNN.computeLoss(Yhat, Y, 'categoricalCrossEntropy');
        const dA = this.decisionNN.computeLossGradient(Yhat, Y, 'categoricalCrossEntropy');
        this.decisionNN.backward(dA);
        optimizer.step();

        if (epoch % 100 === 0) {
          const acc = this.decisionNN.accuracy(Yhat, Y);
          console.log(`  NN epoch ${epoch}: loss = ${lastLoss.toFixed(4)}, accuracy = ${(acc * 100).toFixed(1)}%`);
        }
      }

      const finalYhat = this.decisionNN.forward(X);
      stats.nnFinalLoss = lastLoss;
      stats.nnAccuracy = this.decisionNN.accuracy(finalYhat, Y);
      stats.nnTrained = true;
    } else {
      console.log('[UserLearningEngine] Skipping NN training — not enough decision labels yet. Will use SRM-only inference.');
      this._buildDefaultDecisionNN();
    }

    this.lastTrainedAt = Date.now();
    this.trainingStats = stats;

    console.log('[UserLearningEngine] Training complete:', JSON.stringify(stats));
    return stats;
  }

  /**
   * Build a default decision NN with random weights (for first-time use
   * before the user has made enough decisions to train on).
   */
  _buildDefaultDecisionNN() {
    this.decisionNN = new NeuralNetwork([
      { size: this.embeddingDim },
      { size: 32, activation: 'relu' },
      { size: 16, activation: 'relu' },
      { size: NUM_DECISIONS, activation: 'softmax' }
    ]);
  }

  /**
   * Build X (features) and Y (labels) matrices for NN training
   * from decision labels + SRM embeddings.
   */
  _buildDecisionTrainingData() {
    const m = this.decisionLabels.length;
    const X = Matrix.zeros(this.embeddingDim, m);
    const Y = Matrix.zeros(NUM_DECISIONS, m);

    for (let j = 0; j < m; j++) {
      const { entityIdx, decisionIdx, label } = this.decisionLabels[j];

      // Get SRM embedding for this entity
      for (let i = 0; i < this.embeddingDim; i++) {
        X.set(i, j, this.srm.entityEmb.get(i, entityIdx));
      }

      // One-hot encode the decision (only set positive labels)
      if (label === 1) {
        Y.set(decisionIdx, j, 1);
      }
    }

    return { X, Y };
  }

  // ── Inference ──────────────────────────────────────────────────────────

  /**
   * Make a decision for a given context entity.
   * Returns ranked decisions with confidence scores.
   *
   * @param {string} contextEntity - entity name (e.g. 'domain:github.com')
   * @param {number} [topK=5]
   * @returns {object[]} - [{ decision, confidence, category }]
   */
  decide(contextEntity, topK = 5) {
    if (!this.srm || !this.decisionNN) {
      throw new Error('Model not trained yet — call train() first');
    }

    const entityIdx = this.entityIndex.get(contextEntity);
    if (entityIdx === undefined) {
      // Unknown entity — use user entity (index 0) as fallback
      return this._decideForEntity(0, topK);
    }

    return this._decideForEntity(entityIdx, topK);
  }

  /**
   * Get decisions for the user entity itself (global recommendations).
   */
  decideForUser(topK = 5) {
    return this._decideForEntity(0, topK);
  }

  _decideForEntity(entityIdx, topK) {
    // Get SRM embedding
    const embedding = Matrix.zeros(this.embeddingDim, 1);
    for (let i = 0; i < this.embeddingDim; i++) {
      embedding.set(i, 0, this.srm.entityEmb.get(i, entityIdx));
    }

    // Run through decision NN
    const output = this.decisionNN.forward(embedding);

    // Extract probabilities and rank
    const decisions = [];
    const decisionNames = Object.keys(DECISION_CATEGORIES);
    for (let i = 0; i < NUM_DECISIONS; i++) {
      decisions.push({
        decision: decisionNames[i],
        confidence: output.get(i, 0),
        categoryIdx: i
      });
    }

    decisions.sort((a, b) => b.confidence - a.confidence);
    return decisions.slice(0, topK);
  }

  /**
   * Predict related entities for a given relation type.
   * Uses SRM link prediction.
   *
   * @param {string} relationName - e.g. 'INTERESTED_IN'
   * @param {number} [topK=10]
   * @returns {object[]} - [{ entity, entityType, score }]
   */
  predictRelated(relationName, topK = 10) {
    if (!this.srm) throw new Error('SRM not trained');
    const relIdx = RELATION_TYPES[relationName];
    if (relIdx === undefined) throw new Error(`Unknown relation: ${relationName}`);

    const predictions = this.srm.predictTail(0, relIdx, topK);

    return predictions.map(p => ({
      entity: this.entityNames[p.entity],
      entityType: this.entityTypes[p.entity],
      score: p.score
    }));
  }

  // ── Serialization (for export to extension) ────────────────────────────

  /**
   * Export the trained model as a JSON-serializable bundle.
   * This is sent to the extension for client-side inference.
   */
  exportModel() {
    if (!this.srm) throw new Error('Model not trained');

    return {
      version: 1,
      trainedAt: this.lastTrainedAt,
      stats: this.trainingStats,
      embeddingDim: this.embeddingDim,

      // Entity registry
      entityIndex: Object.fromEntries(this.entityIndex),
      entityNames: this.entityNames,
      entityTypes: this.entityTypes,
      entityCount: this.nextEntityId,

      // Serialized SRM
      srm: this.srm.serialize(),

      // Serialized decision NN
      decisionNN: this.decisionNN ? this.decisionNN.serialize() : null,

      // Relation & decision type maps (so extension knows the schema)
      relationTypes: RELATION_TYPES,
      decisionCategories: DECISION_CATEGORIES,
    };
  }

  /**
   * Import a previously exported model (to resume training or serve).
   */
  importModel(bundle) {
    if (!bundle || bundle.version !== 1) throw new Error('Invalid model bundle');

    this.embeddingDim = bundle.embeddingDim;
    this.entityIndex = new Map(Object.entries(bundle.entityIndex).map(([k, v]) => [k, Number(v)]));
    this.entityNames = bundle.entityNames;
    this.entityTypes = bundle.entityTypes;
    this.nextEntityId = bundle.entityCount;
    this.lastTrainedAt = bundle.trainedAt;
    this.trainingStats = bundle.stats;

    this.srm = SRM.deserialize(bundle.srm);

    if (bundle.decisionNN) {
      this.decisionNN = NeuralNetwork.deserialize(bundle.decisionNN);
    } else {
      this._buildDefaultDecisionNN();
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  _extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  _deduplicateTriples() {
    const seen = new Set();
    this.triples = this.triples.filter(([h, r, t]) => {
      const key = `${h}:${r}:${t}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Get a summary of the current knowledge graph state.
   */
  getGraphSummary() {
    const typeCounts = {};
    for (const t of this.entityTypes) {
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    const relationCounts = {};
    const relationNames = Object.keys(RELATION_TYPES);
    for (const [, r] of this.triples) {
      const name = relationNames[r] || `unknown_${r}`;
      relationCounts[name] = (relationCounts[name] || 0) + 1;
    }

    return {
      entities: this.nextEntityId,
      triples: this.triples.length,
      entityTypes: typeCounts,
      relationDistribution: relationCounts,
      trained: !!this.srm,
      lastTrainedAt: this.lastTrainedAt,
      stats: this.trainingStats
    };
  }
}

export {
  UserLearningEngine,
  RELATION_TYPES,
  DECISION_CATEGORIES,
  NUM_RELATIONS,
  NUM_DECISIONS
};
