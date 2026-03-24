/**
 * UserBrain Skill — The Neural Learning Skill
 *
 * A skill that plugs into the extension's skill registry and:
 *   1. Collects signals during onboarding and ongoing use
 *   2. Sends signals to the server for SRM/NN training
 *   3. Loads trained models for local inference
 *   4. Makes decisions: content recommendations, skill activation, auto-actions
 *   5. Continuously learns from user behavior
 *
 * Message Actions:
 *   - 'ingest-onboarding'  → collect all signals + onboarding data, send to server
 *   - 'sync-model'         → fetch latest trained model from server
 *   - 'decide'             → get decisions for a given context
 *   - 'decide-for-url'     → get decisions for a URL context
 *   - 'record-behavior'    → record a user behavior event
 *   - 'get-recommendations'→ get content/skill recommendations
 *   - 'get-interests'      → get predicted user interests
 *   - 'flush-and-retrain'  → flush pending signals to server and retrain
 *   - 'get-status'         → get brain status and stats
 */

import { UserBrain } from '../../shared/suyanet/user-brain.js';
import { SignalCollector } from '../../shared/suyanet/signal-collector.js';

class UserBrainSkill {
  constructor(config = {}) {
    this.name = config.name || 'user-brain';
    this.version = '1.0.0';
    this._isActive = false;
    this.config = {
      serverEndpoint: 'https://api.suya.example.com',
      syncIntervalMinutes: 60,   // How often to sync signals to server
      autoRetrain: true,         // Auto-retrain after sync
      minSignalsForRetrain: 20,  // Minimum new signals before retraining
      ...config.config
    };

    this.brain = new UserBrain();
    this.signalCollector = new SignalCollector();
    this.storageManager = null;
    this.eventBus = null;
    this.syncAlarmName = 'user-brain-sync';
    this.lastSyncTime = null;
    this.signalsSinceLastTrain = 0;
  }

  // ── Skill Lifecycle ───────────────────────────────────────────────────

  async initialize() {
    console.log('[UserBrainSkill] Initializing...');

    // Try to restore brain state from IndexedDB
    await this._restoreBrainState();
  }

  async activate() {
    this._isActive = true;

    // Set up periodic sync alarm
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.create(this.syncAlarmName, {
        periodInMinutes: this.config.syncIntervalMinutes
      });
    }

    // Listen for relevant events
    if (this.eventBus) {
      this.eventBus.on('tab-updated', (data) => this._onTabUpdated(data));
      this.eventBus.on('skill-action-completed', (data) => this._onSkillAction(data));
      this.eventBus.on('storage-changed', (data) => this._onStorageChanged(data));
    }

    console.log('[UserBrainSkill] Activated');
  }

  async deactivate() {
    this._isActive = false;

    // Persist brain state before deactivating
    await this._persistBrainState();

    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.clear(this.syncAlarmName);
    }

    console.log('[UserBrainSkill] Deactivated');
  }

  isActive() {
    return this._isActive;
  }

  getVersion() {
    return this.version;
  }

  getHealth() {
    return {
      status: this.brain.isReady ? 'healthy' : 'initializing',
      modelReady: this.brain.isReady,
      entityCount: this.brain.entityCount,
      lastSync: this.lastSyncTime,
      pendingSignals: this.brain.pendingSignals.behaviors.length
    };
  }

  getDependencies() {
    return []; // No hard dependencies
  }

  getContextMenuItems() {
    return [];
  }

  // ── Message Handler (Skill Registry Integration) ──────────────────────

  async handleAction(action, data, sender) {
    switch (action) {
      case 'ingest-onboarding':
        return await this._handleIngestOnboarding(data);

      case 'sync-model':
        return await this._handleSyncModel();

      case 'decide':
        return this._handleDecide(data);

      case 'decide-for-url':
        return this._handleDecideForUrl(data);

      case 'record-behavior':
        return this._handleRecordBehavior(data);

      case 'get-recommendations':
        return this._handleGetRecommendations(data);

      case 'get-interests':
        return this._handleGetInterests(data);

      case 'flush-and-retrain':
        return await this._handleFlushAndRetrain();

      case 'get-status':
        return this._handleGetStatus();

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  // ── Action Handlers ───────────────────────────────────────────────────

  /**
   * Collect all signals (history, bookmarks, extensions) + onboarding data,
   * send to server, trigger training, and load the trained model.
   * This is the main onboarding integration point.
   */
  async _handleIngestOnboarding(data) {
    console.log('[UserBrainSkill] Ingesting onboarding data...');

    // 1. Collect all browser signals
    const signals = await this.signalCollector.collectAll(data.userProfile);

    // 2. Send to server for ingestion
    const ingestResult = await this._serverRequest('POST', '/ingest', signals);

    // 3. Generate initial decision labels from onboarding choices
    const labels = this._generateOnboardingLabels(data.userProfile);
    if (labels.length > 0) {
      await this._serverRequest('POST', '/labels', { labels });
    }

    // 4. Trigger training
    const trainResult = await this._serverRequest('POST', '/train');

    // 5. Fetch and load the trained model
    const modelResponse = await this._serverRequest('GET', '/model');
    if (modelResponse.success && modelResponse.data) {
      this.brain.loadModel(modelResponse.data);
      await this._persistBrainState();
    }

    this.lastSyncTime = Date.now();

    return {
      ingested: ingestResult.data,
      trained: trainResult.data,
      modelLoaded: this.brain.isReady
    };
  }

  async _handleSyncModel() {
    const modelResponse = await this._serverRequest('GET', '/model');
    if (modelResponse.success && modelResponse.data) {
      this.brain.loadModel(modelResponse.data);
      await this._persistBrainState();
    }
    return { modelLoaded: this.brain.isReady, trainedAt: this.brain.trainedAt };
  }

  _handleDecide(data) {
    const decisions = this.brain.decide(data?.context, data?.topK || 5);
    return { decisions };
  }

  _handleDecideForUrl(data) {
    if (!data?.url) throw new Error('URL required');
    const decisions = this.brain.decideForUrl(data.url, data.topK || 5);
    return { url: data.url, decisions };
  }

  _handleRecordBehavior(data) {
    if (!data?.action || !data?.target) throw new Error('action and target required');
    this.brain.recordBehavior(data.action, data.target, data.metadata);
    this.signalsSinceLastTrain++;
    return { recorded: true, pending: this.brain.pendingSignals.behaviors.length };
  }

  _handleGetRecommendations(data) {
    const topK = data?.topK || 10;

    // Content recommendations via SRM link prediction
    const interests = this.brain.predictRelated('INTERESTED_IN', topK);
    const contentPrefs = this.brain.predictRelated('CONTENT_PREFERENCE', topK);

    // Decision recommendations
    const decisions = this.brain.decideForUser(5);

    // Skill recommendations
    const skills = this.brain.predictRelated('USES_SKILL', 5);

    return {
      interests,
      contentPreferences: contentPrefs,
      suggestedDecisions: decisions,
      suggestedSkills: skills
    };
  }

  _handleGetInterests(data) {
    const topK = data?.topK || 15;
    return {
      interests: this.brain.predictRelated('INTERESTED_IN', topK),
      frequentDomains: this.brain.predictRelated('VISITS_FREQUENTLY', topK),
      bookmarked: this.brain.predictRelated('BOOKMARKED', topK),
      growthGoals: this.brain.predictRelated('GROWTH_GOAL', 5)
    };
  }

  async _handleFlushAndRetrain() {
    // Flush behavioral signals
    const signals = this.brain.flushSignals();

    if (signals.behaviors.length === 0 && signals.searchQueries.length === 0) {
      return { message: 'No pending signals to flush' };
    }

    // Send behaviors to server
    const behaviorPayload = {
      behaviors: signals.behaviors.map(b => ({
        action: b.action,
        target: b.target
      }))
    };

    await this._serverRequest('POST', '/ingest', behaviorPayload);

    // Retrain if enough new signals
    let trainResult = null;
    if (this.signalsSinceLastTrain >= this.config.minSignalsForRetrain) {
      trainResult = await this._serverRequest('POST', '/train');
      this.signalsSinceLastTrain = 0;

      // Reload model
      const modelResponse = await this._serverRequest('GET', '/model');
      if (modelResponse.success && modelResponse.data) {
        this.brain.loadModel(modelResponse.data);
        await this._persistBrainState();
      }
    }

    this.lastSyncTime = Date.now();

    return {
      flushedBehaviors: signals.behaviors.length,
      retrained: !!trainResult,
      trainStats: trainResult?.data || null
    };
  }

  _handleGetStatus() {
    return {
      isReady: this.brain.isReady,
      entityCount: this.brain.entityCount,
      modelVersion: this.brain.modelVersion,
      trainedAt: this.brain.trainedAt,
      lastSync: this.lastSyncTime,
      pendingBehaviors: this.brain.pendingSignals.behaviors.length,
      signalsSinceLastTrain: this.signalsSinceLastTrain,
      health: this.getHealth()
    };
  }

  // ── Event Listeners (Passive Learning) ────────────────────────────────

  _onTabUpdated(data) {
    if (!this._isActive || !data.tab?.url) return;

    // Record tab visits as behavior signals
    const url = data.tab.url;
    if (!url.startsWith('chrome://') && !url.startsWith('chrome-extension://')) {
      this.brain.recordBehavior('visit', url);
      this.signalsSinceLastTrain++;
    }
  }

  _onSkillAction(data) {
    if (!this._isActive) return;

    // Record skill usage
    this.brain.recordBehavior('skill_use', data.skill);
    this.signalsSinceLastTrain++;
  }

  _onStorageChanged(data) {
    // Track preference changes as signals
    if (!this._isActive) return;

    if (data.changes?.userProfile) {
      this.brain.recordBehavior('profile_update', 'userProfile');
    }
  }

  // ── Onboarding Label Generation ───────────────────────────────────────

  /**
   * Convert onboarding answers into decision training labels.
   * These bootstrap the NN with initial signal about what the user wants.
   */
  _generateOnboardingLabels(userProfile) {
    const labels = [];

    if (!userProfile) return labels;

    // Career focus → recommend related content
    if (userProfile.careerFocus) {
      labels.push({
        context: `career:${userProfile.careerFocus}`,
        decision: 'RECOMMEND_CONTENT',
        positive: true
      });
      labels.push({
        context: `career:${userProfile.careerFocus}`,
        decision: 'SUGGEST_LEARNING',
        positive: true
      });
    }

    // Growth goal → learning suggestions
    if (userProfile.growthGoal) {
      labels.push({
        context: `goal:${userProfile.growthGoal}`,
        decision: 'SUGGEST_LEARNING',
        positive: true
      });
      labels.push({
        context: `goal:${userProfile.growthGoal}`,
        decision: 'RECOMMEND_CONTENT',
        positive: true
      });
    }

    // Recommended sources → news source suggestions
    if (userProfile.recommendedSources) {
      for (const src of userProfile.recommendedSources.slice(0, 5)) {
        labels.push({
          context: `source:${src.id || src.name}`,
          decision: 'SUGGEST_NEWS_SOURCE',
          positive: true
        });
      }
    }

    // Content types → content preferences
    if (userProfile.contentTypes) {
      for (const ct of userProfile.contentTypes) {
        labels.push({
          context: `content:${ct}`,
          decision: 'RECOMMEND_CONTENT',
          positive: true
        });
      }
    }

    // If user set up notifications → notification preference
    labels.push({
      context: '__user__',
      decision: 'SEND_NOTIFICATION',
      positive: true
    });

    // Interests from history
    if (userProfile.interests) {
      for (const category of Object.keys(userProfile.interests).slice(0, 5)) {
        labels.push({
          context: `interest:${category}`,
          decision: 'RECOMMEND_CONTENT',
          positive: true
        });
      }
    }

    return labels;
  }

  // ── Server Communication ──────────────────────────────────────────────

  async _serverRequest(method, path, body = null) {
    const url = `${this.config.serverEndpoint}/api/learning${path}`;

    try {
      // Get auth token from storage
      let authToken = null;
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.local.get('authToken');
        authToken = result.authToken;
      }

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      };

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        console.error(`[UserBrainSkill] Server error ${response.status}:`, data);
        throw new Error(data.error || `Server returned ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`[UserBrainSkill] Server request failed (${method} ${path}):`, error);

      // If server is unreachable, don't crash — degrade gracefully
      return { success: false, error: error.message };
    }
  }

  // ── Persistence (IndexedDB via StorageManager) ────────────────────────

  async _persistBrainState() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) return;

      const state = this.brain.serialize();
      await chrome.storage.local.set({
        'userBrain:state': state,
        'userBrain:lastSync': this.lastSyncTime,
        'userBrain:signalsSinceLastTrain': this.signalsSinceLastTrain
      });

      console.log('[UserBrainSkill] Brain state persisted');
    } catch (error) {
      console.error('[UserBrainSkill] Failed to persist brain state:', error);
    }
  }

  async _restoreBrainState() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) return;

      const result = await chrome.storage.local.get([
        'userBrain:state',
        'userBrain:lastSync',
        'userBrain:signalsSinceLastTrain'
      ]);

      if (result['userBrain:state']) {
        this.brain.deserialize(result['userBrain:state']);
        this.lastSyncTime = result['userBrain:lastSync'] || null;
        this.signalsSinceLastTrain = result['userBrain:signalsSinceLastTrain'] || 0;
        console.log(`[UserBrainSkill] Brain state restored (${this.brain.entityCount} entities)`);
      } else {
        console.log('[UserBrainSkill] No previous brain state found — starting fresh');
      }
    } catch (error) {
      console.error('[UserBrainSkill] Failed to restore brain state:', error);
    }
  }

  // ── Alarm Handler (for periodic sync) ────────────────────────────────

  async handleAlarm(alarm) {
    if (alarm.name !== this.syncAlarmName) return;

    console.log('[UserBrainSkill] Periodic sync triggered');

    if (this.config.autoRetrain && this.signalsSinceLastTrain >= this.config.minSignalsForRetrain) {
      await this._handleFlushAndRetrain();
    } else if (this.brain.pendingSignals.behaviors.length > 0) {
      // Just flush signals without retraining
      const signals = this.brain.flushSignals();
      await this._serverRequest('POST', '/ingest', {
        behaviors: signals.behaviors.map(b => ({ action: b.action, target: b.target }))
      });
      this.lastSyncTime = Date.now();
    }

    await this._persistBrainState();
  }
}

export { UserBrainSkill };
