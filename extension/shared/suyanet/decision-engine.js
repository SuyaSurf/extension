/**
 * DecisionEngine — Translates UserBrain decisions into concrete actions
 *
 * The UserBrain outputs abstract decision categories (RECOMMEND_CONTENT,
 * ACTIVATE_SKILL, etc.) with confidence scores. The DecisionEngine maps
 * these into real actions that the extension can execute.
 *
 * Usage:
 *   const engine = new DecisionEngine(brainSkill, skillRegistry, eventBus);
 *   const actions = await engine.processDecisions(url);
 *   // actions = [{ type: 'recommend', payload: {...} }, ...]
 */

class DecisionEngine {
  /**
   * @param {UserBrainSkill} brainSkill  - the user-brain skill instance
   * @param {SkillRegistry}  skillRegistry - access to other skills
   * @param {EventBus}       eventBus     - for emitting action events
   */
  constructor(brainSkill, skillRegistry, eventBus) {
    this.brainSkill = brainSkill;
    this.skillRegistry = skillRegistry;
    this.eventBus = eventBus;

    // Confidence thresholds — decisions below these are not acted on
    this.thresholds = {
      RECOMMEND_CONTENT:    0.15,
      ACTIVATE_SKILL:       0.20,
      SUGGEST_NEWS_SOURCE:  0.15,
      AUTO_FILL_FORM:       0.30,  // Higher threshold for auto-actions
      SCHEDULE_TASK:        0.25,
      SEND_NOTIFICATION:    0.20,
      SUGGEST_LEARNING:     0.15,
      DRAFT_EMAIL:          0.35,  // Higher threshold — drafting is invasive
      PRIORITIZE_TAB:       0.10,
      SILENCE_NOTIFICATION: 0.20,
    };

    // Action executors — map decision categories to handler functions
    this.executors = {
      RECOMMEND_CONTENT:    (d, ctx) => this._recommendContent(d, ctx),
      ACTIVATE_SKILL:       (d, ctx) => this._activateSkill(d, ctx),
      SUGGEST_NEWS_SOURCE:  (d, ctx) => this._suggestNewsSource(d, ctx),
      AUTO_FILL_FORM:       (d, ctx) => this._autoFillForm(d, ctx),
      SCHEDULE_TASK:        (d, ctx) => this._scheduleTask(d, ctx),
      SEND_NOTIFICATION:    (d, ctx) => this._sendNotification(d, ctx),
      SUGGEST_LEARNING:     (d, ctx) => this._suggestLearning(d, ctx),
      DRAFT_EMAIL:          (d, ctx) => this._draftEmail(d, ctx),
      PRIORITIZE_TAB:       (d, ctx) => this._prioritizeTab(d, ctx),
      SILENCE_NOTIFICATION: (d, ctx) => this._silenceNotification(d, ctx),
    };
  }

  /**
   * Process brain decisions for a given context and return executable actions.
   *
   * @param {object} context - { url?, tabId?, trigger? }
   * @param {number} [topK=3] - max actions to return
   * @returns {object[]} - [{ type, decision, confidence, payload, executable }]
   */
  async processDecisions(context = {}, topK = 3) {
    if (!this.brainSkill?.brain?.isReady) {
      return [];
    }

    // Get decisions from the brain
    let decisions;
    if (context.url) {
      decisions = this.brainSkill.brain.decideForUrl(context.url, topK + 2);
    } else {
      decisions = this.brainSkill.brain.decideForUser(topK + 2);
    }

    // Filter by confidence threshold and execute
    const actions = [];
    for (const decision of decisions) {
      const threshold = this.thresholds[decision.decision] || 0.20;
      if (decision.confidence < threshold) continue;

      const executor = this.executors[decision.decision];
      if (!executor) continue;

      try {
        const action = await executor(decision, context);
        if (action) {
          actions.push({
            type: action.type,
            decision: decision.decision,
            confidence: decision.confidence,
            payload: action.payload,
            executable: true
          });
        }
      } catch (error) {
        console.warn(`[DecisionEngine] Failed to process ${decision.decision}:`, error.message);
      }

      if (actions.length >= topK) break;
    }

    // Emit event so other skills can react
    if (actions.length > 0 && this.eventBus) {
      this.eventBus.emit('brain-decisions-processed', {
        context,
        actions,
        timestamp: Date.now()
      });
    }

    return actions;
  }

  // ── Action Executors ──────────────────────────────────────────────────

  async _recommendContent(decision, context) {
    const interests = this.brainSkill.brain.predictRelated('INTERESTED_IN', 5);
    if (interests.length === 0) return null;

    return {
      type: 'recommend',
      payload: {
        message: 'Based on your interests, you might enjoy exploring:',
        topics: interests.map(i => i.entity?.replace('interest:', '').replace('topic:', '')),
        source: 'suyanet-srm'
      }
    };
  }

  async _activateSkill(decision, context) {
    const skillPredictions = this.brainSkill.brain.predictRelated('USES_SKILL', 3);
    if (skillPredictions.length === 0) return null;

    // Find which predicted skills are actually available but not active
    const suggestedSkills = [];
    for (const pred of skillPredictions) {
      const skillName = pred.entity?.replace('skill:', '');
      if (!skillName) continue;

      const skill = this.skillRegistry?.getSkill(skillName);
      if (skill && !skill.isActive()) {
        suggestedSkills.push(skillName);
      }
    }

    if (suggestedSkills.length === 0) return null;

    return {
      type: 'activate-skill',
      payload: {
        skills: suggestedSkills,
        message: `Based on your usage patterns, enabling: ${suggestedSkills.join(', ')}`
      }
    };
  }

  async _suggestNewsSource(decision, context) {
    const prefs = this.brainSkill.brain.predictRelated('CONTENT_PREFERENCE', 5);
    if (prefs.length === 0) return null;

    return {
      type: 'suggest-news',
      payload: {
        sources: prefs
          .filter(p => p.entity?.startsWith('source:'))
          .map(p => p.entity.replace('source:', '')),
        topics: prefs
          .filter(p => p.entity?.startsWith('content:'))
          .map(p => p.entity.replace('content:', ''))
      }
    };
  }

  async _autoFillForm(decision, context) {
    // Only trigger if we're on a page with forms
    if (!context.url) return null;

    return {
      type: 'auto-fill',
      payload: {
        url: context.url,
        message: 'I can help fill out this form based on your profile.'
      }
    };
  }

  async _scheduleTask(decision, context) {
    const timePrefs = this.brainSkill.brain.predictRelated('TIME_PREFERENCE', 3);

    return {
      type: 'schedule-task',
      payload: {
        suggestedTimes: timePrefs.map(t => t.entity?.replace('time:hour_', '')),
        message: 'Based on your activity patterns, this might be a good time for focused work.'
      }
    };
  }

  async _sendNotification(decision, context) {
    return {
      type: 'notification',
      payload: {
        trigger: context.trigger || 'brain-recommendation',
        message: 'You have new content that matches your interests.'
      }
    };
  }

  async _suggestLearning(decision, context) {
    const goals = this.brainSkill.brain.predictRelated('GROWTH_GOAL', 3);
    const interests = this.brainSkill.brain.predictRelated('INTERESTED_IN', 5);

    return {
      type: 'suggest-learning',
      payload: {
        goals: goals.map(g => g.entity?.replace('goal:', '')),
        relatedTopics: interests.map(i => i.entity?.replace('interest:', '').replace('topic:', '')),
        message: 'Here are some areas aligned with your growth goals.'
      }
    };
  }

  async _draftEmail(decision, context) {
    // Only suggest email drafting if confidence is very high
    if (decision.confidence < 0.4) return null;

    return {
      type: 'draft-email',
      payload: {
        message: 'I can draft an email related to your current context.',
        context: context.url || 'general'
      }
    };
  }

  async _prioritizeTab(decision, context) {
    if (!context.url) return null;

    const relevance = this.brainSkill.brain.relevanceScore(
      `domain:${this._extractDomain(context.url)}`
    );

    return {
      type: 'prioritize-tab',
      payload: {
        url: context.url,
        relevanceScore: relevance,
        isHighRelevance: relevance > 0.5
      }
    };
  }

  async _silenceNotification(decision, context) {
    return {
      type: 'silence',
      payload: {
        message: 'Based on your preferences, I\'m keeping things quiet right now.'
      }
    };
  }

  _extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }
}

export { DecisionEngine };
