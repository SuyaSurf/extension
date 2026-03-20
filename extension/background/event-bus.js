/**
 * Cross-Skill Event Bus
 * Enables communication and coordination between different skill modules
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.skillRegistry = null;
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    this.eventStats = new Map();
    this.cleanupInterval = null;
    this.isInitialized = false;
  }

  setSkillRegistry(skillRegistry) {
    this.skillRegistry = skillRegistry;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // Set up cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
    
    this.isInitialized = true;
    console.log('EventBus initialized with automatic cleanup');
  }

  cleanup() {
    // Clean event history
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
    
    // Clean old stats (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    for (const [event, stats] of this.eventStats) {
      if (stats.lastEmitted < oneHourAgo) {
        this.eventStats.delete(event);
      }
    }
    
    // Clean up empty listener arrays
    for (const [event, listeners] of this.listeners) {
      if (listeners.length === 0) {
        this.listeners.delete(event);
      }
    }
    
    console.log('EventBus cleanup completed');
  }

  on(event, callback, options = {}) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    const listener = {
      callback,
      once: options.once || false,
      priority: options.priority || 0,
      skill: options.skill || null,
      id: crypto.randomUUID()
    };
    
    this.listeners.get(event).push(listener);
    
    // Sort by priority (higher priority first)
    this.listeners.get(event).sort((a, b) => b.priority - a.priority);
    
    // Return unsubscribe function
    return () => this.off(event, listener.id);
  }

  off(event, listenerId) {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;
    
    const index = eventListeners.findIndex(l => l.id === listenerId);
    if (index !== -1) {
      eventListeners.splice(index, 1);
    }
  }

  async emit(event, data, options = {}) {
    const startTime = performance.now();
    
    try {
      // Record event in history
      this.recordEvent(event, data);
      
      // Get listeners for this event
      const callbacks = this.listeners.get(event) || [];
      
      // Create event context
      const context = {
        event,
        data,
        timestamp: Date.now(),
        source: options.source || 'unknown',
        skill: options.skill || null
      };
      
      // Execute callbacks
      const results = [];
      const errors = [];
      
      for (const listener of callbacks) {
        try {
          const result = await listener.callback(context);
          results.push({
            listenerId: listener.id,
            skill: listener.skill,
            result
          });
          
          // Remove once listeners
          if (listener.once) {
            this.off(event, listener.id);
          }
          
        } catch (error) {
          errors.push({
            listenerId: listener.id,
            skill: listener.skill,
            error: error.message
          });
          
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
      
      // Update event statistics
      this.updateEventStats(event, performance.now() - startTime);
      
      // Return results
      return {
        event,
        results,
        errors,
        duration: performance.now() - startTime,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error(`Error emitting event ${event}:`, error);
      throw error;
    }
  }

  async sendSkillMessage(fromSkill, toSkill, message, options = {}) {
    if (!this.skillRegistry) {
      throw new Error('Skill registry not set');
    }
    
    const targetSkill = this.skillRegistry.getSkill(toSkill);
    if (!targetSkill) {
      throw new Error(`Skill ${toSkill} not found`);
    }
    
    // Create skill message context
    const context = {
      from: fromSkill,
      to: toSkill,
      message,
      timestamp: Date.now(),
      id: crypto.randomUUID(),
      ...options
    };
    
    try {
      // Log message for audit
      console.log(`Skill message: ${fromSkill} -> ${toSkill}`, context);
      
      // Send message to target skill
      const result = await targetSkill.handleSkillMessage(fromSkill, message, context);
      
      // Emit skill message event
      await this.emit('skill-message', {
        from: fromSkill,
        to: toSkill,
        message,
        result,
        context
      });
      
      return result;
      
    } catch (error) {
      console.error(`Error sending skill message from ${fromSkill} to ${toSkill}:`, error);
      
      // Emit error event
      await this.emit('skill-message-error', {
        from: fromSkill,
        to: toSkill,
        message,
        error: error.message,
        context
      });
      
      throw error;
    }
  }

  async broadcastSkillMessage(fromSkill, message, options = {}) {
    if (!this.skillRegistry) {
      throw new Error('Skill registry not set');
    }
    
    const activeSkills = this.skillRegistry.getActiveSkills();
    const excludeSkills = options.exclude || [fromSkill];
    
    const results = {};
    const errors = {};
    
    for (const skill of activeSkills) {
      const skillName = skill.getName ? skill.getName() : 'unknown';
      
      if (excludeSkills.includes(skillName)) {
        continue;
      }
      
      try {
        const result = await this.sendSkillMessage(fromSkill, skillName, message, options);
        results[skillName] = result;
      } catch (error) {
        errors[skillName] = error.message;
      }
    }
    
    return { results, errors };
  }

  async requestSkillData(fromSkill, toSkill, dataType, parameters = {}) {
    const message = {
      type: 'data-request',
      dataType,
      parameters
    };
    
    return await this.sendSkillMessage(fromSkill, toSkill, message);
  }

  async shareSkillData(fromSkill, toSkill, dataType, data) {
    const message = {
      type: 'data-share',
      dataType,
      data
    };
    
    return await this.sendSkillMessage(fromSkill, toSkill, message);
  }

  recordEvent(event, data) {
    const record = {
      event,
      data: this.sanitizeData(data),
      timestamp: Date.now()
    };
    
    this.eventHistory.push(record);
    
    // Limit history size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  sanitizeData(data) {
    // Remove sensitive information from event data
    if (typeof data !== 'object' || data === null) {
      return data;
    }
    
    const sanitized = { ...data };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'key'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  updateEventStats(event, duration) {
    if (!this.eventStats.has(event)) {
      this.eventStats.set(event, {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        lastEmitted: 0
      });
    }
    
    const stats = this.eventStats.get(event);
    stats.count++;
    stats.totalDuration += duration;
    stats.averageDuration = stats.totalDuration / stats.count;
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.maxDuration = Math.max(stats.maxDuration, duration);
    stats.lastEmitted = Date.now();
  }

  getEventHistory(event = null, limit = 100) {
    let history = this.eventHistory;
    
    if (event) {
      history = history.filter(record => record.event === event);
    }
    
    return history.slice(-limit);
  }

  getEventStats(event = null) {
    if (event) {
      return this.eventStats.get(event) || null;
    }
    
    return Object.fromEntries(this.eventStats);
  }

  getListenerStats() {
    const stats = {};
    
    for (const [event, listeners] of this.listeners) {
      stats[event] = {
        count: listeners.length,
        skills: [...new Set(listeners.map(l => l.skill).filter(Boolean))],
        priorityRange: {
          min: Math.min(...listeners.map(l => l.priority)),
          max: Math.max(...listeners.map(l => l.priority))
        }
      };
    }
    
    return stats;
  }

  clearHistory() {
    this.eventHistory = [];
  }

  clearStats() {
    this.eventStats.clear();
  }

  async createEventStream(event, filter = null) {
    const events = [];
    
    const listener = this.on(event, (context) => {
      if (!filter || filter(context)) {
        events.push(context);
      }
    });
    
    return {
      events,
      unsubscribe: listener,
      async *generator() {
        let index = 0;
        while (true) {
          if (index < events.length) {
            yield events[index++];
          } else {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }
    };
  }

  async waitForEvent(event, timeout = 5000, filter = null) {
    return new Promise((resolve, reject) => {
      let timeoutId;
      
      const listener = this.on(event, (context) => {
        if (!filter || filter(context)) {
          clearTimeout(timeoutId);
          listener();
          resolve(context);
        }
      });
      
      timeoutId = setTimeout(() => {
        listener();
        reject(new Error(`Event ${event} not received within ${timeout}ms`));
      }, timeout);
    });
  }

  getDebugInfo() {
    return {
      totalEvents: this.eventHistory.length,
      totalListeners: Array.from(this.listeners.values()).reduce((sum, listeners) => sum + listeners.length, 0),
      eventTypes: this.listeners.size,
      stats: this.getEventStats(),
      listenerStats: this.getListenerStats(),
      recentEvents: this.getEventHistory(null, 10)
    };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanup();
    this.listeners.clear();
    this.eventHistory = [];
    this.eventStats.clear();
    this.isInitialized = false;
    console.log('EventBus destroyed');
  }
}

export { EventBus };
