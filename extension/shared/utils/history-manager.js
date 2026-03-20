/**
 * History Management System
 * Provides comprehensive activity logging, search, and analytics
 */

class HistoryManager {
  constructor(config = {}) {
    this.config = {
      maxEntries: 10000,
      retentionDays: 90,
      enableCompression: true,
      enableEncryption: false,
      ...config
    };
    
    this.entries = [];
    this.indexes = {
      byType: new Map(),
      bySkill: new Map(),
      byDate: new Map(),
      byUser: new Map()
    };
    
    this.searchIndex = new Map();
    this.isInitialized = false;
    this.storageManager = null;
  }

  async initialize(storageManager = null) {
    if (this.isInitialized) return;
    
    this.storageManager = storageManager;
    
    try {
      // Load existing history from storage
      await this.loadHistoryFromStorage();
      
      // Set up cleanup interval
      this.setupCleanupInterval();
      
      this.isInitialized = true;
      console.log('History Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize History Manager:', error);
      throw error;
    }
  }

  /**
   * Add an entry to history
   * @param {Object} entry - History entry
   * @param {string} entry.type - Entry type (task, event, error, etc.)
   * @param {string} entry.skill - Skill that generated the entry
   * @param {string} entry.action - Action performed
   * @param {Object} entry.data - Entry data
   * @param {string} entry.userId - User ID (optional)
   * @param {number} entry.timestamp - Timestamp (default: now)
   * @returns {Object} Created entry
   */
  async addEntry(entry) {
    const historyEntry = {
      id: crypto.randomUUID(),
      timestamp: entry.timestamp || Date.now(),
      type: entry.type || 'unknown',
      skill: entry.skill || 'unknown',
      action: entry.action || 'unknown',
      data: entry.data || {},
      userId: entry.userId || 'default',
      severity: entry.severity || 'info',
      tags: entry.tags || [],
      metadata: entry.metadata || {}
    };

    // Add to main storage
    this.entries.unshift(historyEntry);
    
    // Maintain max entries limit
    if (this.entries.length > this.config.maxEntries) {
      const removed = this.entries.pop();
      this.removeFromIndexes(removed);
    }

    // Update indexes
    this.updateIndexes(historyEntry);
    
    // Update search index
    this.updateSearchIndex(historyEntry);
    
    // Save to storage
    await this.saveEntryToStorage(historyEntry);
    
    // Emit event if event bus is available
    if (this.eventBus) {
      this.eventBus.emit('history:entry-added', historyEntry);
    }
    
    return historyEntry;
  }

  /**
   * Search history entries
   * @param {Object} query - Search query
   * @param {string} query.text - Text to search for
   * @param {string} query.type - Filter by type
   * @param {string} query.skill - Filter by skill
   * @param {string} query.action - Filter by action
   * @param {number} query.fromDate - Start date filter
   * @param {number} query.toDate - End date filter
   * @param {Array} query.tags - Filter by tags
   * @param {string} query.severity - Filter by severity
   * @param {number} query.limit - Result limit
   * @param {number} query.offset - Result offset
   * @returns {Array} Matching entries
   */
  search(query = {}) {
    let results = this.entries;

    // Text search
    if (query.text) {
      const searchText = query.text.toLowerCase();
      results = results.filter(entry => {
        const searchableText = [
          entry.action,
          entry.skill,
          entry.type,
          JSON.stringify(entry.data),
          ...entry.tags
        ].join(' ').toLowerCase();
        
        return searchableText.includes(searchText);
      });
    }

    // Type filter
    if (query.type) {
      results = results.filter(entry => entry.type === query.type);
    }

    // Skill filter
    if (query.skill) {
      results = results.filter(entry => entry.skill === query.skill);
    }

    // Action filter
    if (query.action) {
      results = results.filter(entry => entry.action === query.action);
    }

    // Date range filter
    if (query.fromDate) {
      results = results.filter(entry => entry.timestamp >= query.fromDate);
    }
    if (query.toDate) {
      results = results.filter(entry => entry.timestamp <= query.toDate);
    }

    // Tags filter
    if (query.tags && query.tags.length > 0) {
      results = results.filter(entry => 
        query.tags.some(tag => entry.tags.includes(tag))
      );
    }

    // Severity filter
    if (query.severity) {
      results = results.filter(entry => entry.severity === query.severity);
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    const paginatedResults = results.slice(offset, offset + limit);

    return {
      entries: paginatedResults,
      total: results.length,
      offset,
      limit,
      hasMore: offset + limit < results.length
    };
  }

  /**
   * Get analytics and statistics
   * @param {Object} options - Analytics options
   * @param {number} options.days - Number of days to analyze
   * @param {string} options.groupBy - Group by field (type, skill, action, etc.)
   * @returns {Object} Analytics data
   */
  getAnalytics(options = {}) {
    const days = options.days || 30;
    const groupBy = options.groupBy || 'type';
    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const recentEntries = this.entries.filter(entry => entry.timestamp >= cutoffDate);
    
    const analytics = {
      period: {
        days,
        fromDate: cutoffDate,
        toDate: Date.now(),
        totalEntries: recentEntries.length
      },
      summary: this.getSummaryStats(recentEntries),
      timeline: this.getTimelineData(recentEntries, options),
      grouped: this.getGroupedData(recentEntries, groupBy),
      trends: this.getTrends(recentEntries, options),
      topItems: this.getTopItems(recentEntries)
    };

    return analytics;
  }

  /**
   * Export history data
   * @param {Object} options - Export options
   * @param {string} options.format - Export format (json, csv)
   * @param {Object} options.filter - Export filter
   * @returns {string} Exported data
   */
  exportData(options = {}) {
    const format = options.format || 'json';
    const filter = options.filter || {};
    
    const results = this.search(filter);
    const data = results.entries;

    switch (format.toLowerCase()) {
      case 'csv':
        return this.exportToCSV(data);
      case 'json':
      default:
        return JSON.stringify({
          exportedAt: Date.now(),
          totalEntries: data.length,
          entries: data
        }, null, 2);
    }
  }

  /**
   * Import history data
   * @param {string} data - Data to import
   * @param {string} format - Data format (json, csv)
   * @returns {Object} Import results
   */
  async importData(data, format = 'json') {
    let entries = [];

    try {
      switch (format.toLowerCase()) {
        case 'csv':
          entries = this.parseCSV(data);
          break;
        case 'json':
        default:
          const parsed = JSON.parse(data);
          entries = parsed.entries || [];
          break;
      }

      const results = {
        total: entries.length,
        imported: 0,
        skipped: 0,
        errors: []
      };

      for (const entry of entries) {
        try {
          // Validate entry structure
          if (!entry.type || !entry.skill || !entry.action) {
            results.skipped++;
            continue;
          }

          // Generate new ID to avoid conflicts
          entry.id = crypto.randomUUID();
          
          await this.addEntry(entry);
          results.imported++;
        } catch (error) {
          results.errors.push(error.message);
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to import data: ${error.message}`);
    }
  }

  /**
   * Clear history entries
   * @param {Object} filter - Filter for entries to clear
   * @returns {number} Number of cleared entries
   */
  async clearHistory(filter = {}) {
    const results = this.search(filter);
    const entriesToRemove = results.entries;
    
    // Remove from main storage
    for (const entry of entriesToRemove) {
      const index = this.entries.findIndex(e => e.id === entry.id);
      if (index !== -1) {
        this.entries.splice(index, 1);
        this.removeFromIndexes(entry);
      }
    }

    // Clear from persistent storage
    if (this.storageManager) {
      for (const entry of entriesToRemove) {
        try {
          await this.storageManager.removeData(`history-${entry.id}`);
        } catch (error) {
          console.error('Error removing history entry from storage:', error);
        }
      }
    }

    console.log(`Cleared ${entriesToRemove.length} history entries`);
    return entriesToRemove.length;
  }

  // Private helper methods
  updateIndexes(entry) {
    // Type index
    if (!this.indexes.byType.has(entry.type)) {
      this.indexes.byType.set(entry.type, []);
    }
    this.indexes.byType.get(entry.type).push(entry.id);

    // Skill index
    if (!this.indexes.bySkill.has(entry.skill)) {
      this.indexes.bySkill.set(entry.skill, []);
    }
    this.indexes.bySkill.get(entry.skill).push(entry.id);

    // Date index (by day)
    const dateKey = new Date(entry.timestamp).toDateString();
    if (!this.indexes.byDate.has(dateKey)) {
      this.indexes.byDate.set(dateKey, []);
    }
    this.indexes.byDate.get(dateKey).push(entry.id);

    // User index
    if (!this.indexes.byUser.has(entry.userId)) {
      this.indexes.byUser.set(entry.userId, []);
    }
    this.indexes.byUser.get(entry.userId).push(entry.id);
  }

  removeFromIndexes(entry) {
    // Remove from all indexes
    for (const [key, ids] of this.indexes.byType) {
      const index = ids.indexOf(entry.id);
      if (index !== -1) ids.splice(index, 1);
    }

    for (const [key, ids] of this.indexes.bySkill) {
      const index = ids.indexOf(entry.id);
      if (index !== -1) ids.splice(index, 1);
    }

    for (const [key, ids] of this.indexes.byDate) {
      const index = ids.indexOf(entry.id);
      if (index !== -1) ids.splice(index, 1);
    }

    for (const [key, ids] of this.indexes.byUser) {
      const index = ids.indexOf(entry.id);
      if (index !== -1) ids.splice(index, 1);
    }
  }

  updateSearchIndex(entry) {
    const searchableContent = [
      entry.action,
      entry.skill,
      entry.type,
      JSON.stringify(entry.data),
      ...entry.tags
    ].join(' ').toLowerCase();

    const words = searchableContent.split(/\s+/);
    for (const word of words) {
      if (word.length > 2) { // Only index words longer than 2 characters
        if (!this.searchIndex.has(word)) {
          this.searchIndex.set(word, new Set());
        }
        this.searchIndex.get(word).add(entry.id);
      }
    }
  }

  getSummaryStats(entries) {
    const stats = {
      byType: {},
      bySkill: {},
      bySeverity: { info: 0, warning: 0, error: 0, critical: 0 },
      byHour: new Array(24).fill(0),
      byDayOfWeek: new Array(7).fill(0)
    };

    for (const entry of entries) {
      // Type stats
      stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
      
      // Skill stats
      stats.bySkill[entry.skill] = (stats.bySkill[entry.skill] || 0) + 1;
      
      // Severity stats
      stats.bySeverity[entry.severity] = (stats.bySeverity[entry.severity] || 0) + 1;
      
      // Hour stats
      const hour = new Date(entry.timestamp).getHours();
      stats.byHour[hour]++;
      
      // Day of week stats
      const dayOfWeek = new Date(entry.timestamp).getDay();
      stats.byDayOfWeek[dayOfWeek]++;
    }

    return stats;
  }

  getTimelineData(entries, options) {
    const interval = options.interval || 'hour';
    const timeline = new Map();

    for (const entry of entries) {
      let key;
      const date = new Date(entry.timestamp);
      
      switch (interval) {
        case 'day':
          key = date.toDateString();
          break;
        case 'hour':
        default:
          key = `${date.toDateString()} ${date.getHours()}:00`;
          break;
      }

      if (!timeline.has(key)) {
        timeline.set(key, { timestamp: entry.timestamp, count: 0, types: {} });
      }
      
      const point = timeline.get(key);
      point.count++;
      point.types[entry.type] = (point.types[entry.type] || 0) + 1;
    }

    return Array.from(timeline.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  getGroupedData(entries, groupBy) {
    const grouped = {};

    for (const entry of entries) {
      const key = entry[groupBy] || 'unknown';
      if (!grouped[key]) {
        grouped[key] = { count: 0, types: {}, recent: [] };
      }
      
      grouped[key].count++;
      grouped[key].types[entry.type] = (grouped[key].types[entry.type] || 0) + 1;
      
      if (grouped[key].recent.length < 5) {
        grouped[key].recent.push(entry);
      }
    }

    return grouped;
  }

  getTrends(entries, options) {
    // Simple trend analysis - compare recent vs older periods
    const midPoint = Date.now() - (15 * 24 * 60 * 60 * 1000); // 15 days ago
    const recent = entries.filter(e => e.timestamp >= midPoint);
    const older = entries.filter(e => e.timestamp < midPoint);

    return {
      recentCount: recent.length,
      olderCount: older.length,
      trend: recent.length > older.length ? 'increasing' : 'decreasing',
      changePercent: older.length > 0 ? 
        ((recent.length - older.length) / older.length * 100).toFixed(2) : 0
    };
  }

  getTopItems(entries) {
    const topSkills = {};
    const topActions = {};
    const topTypes = {};

    for (const entry of entries) {
      topSkills[entry.skill] = (topSkills[entry.skill] || 0) + 1;
      topActions[entry.action] = (topActions[entry.action] || 0) + 1;
      topTypes[entry.type] = (topTypes[entry.type] || 0) + 1;
    }

    return {
      skills: this.sortObjectByValue(topSkills).slice(0, 10),
      actions: this.sortObjectByValue(topActions).slice(0, 10),
      types: this.sortObjectByValue(topTypes).slice(0, 10)
    };
  }

  sortObjectByValue(obj) {
    return Object.entries(obj)
      .sort(([,a], [,b]) => b - a)
      .map(([key, value]) => ({ key, value }));
  }

  exportToCSV(entries) {
    const headers = ['id', 'timestamp', 'type', 'skill', 'action', 'severity', 'userId', 'data', 'tags'];
    const csvRows = [headers.join(',')];

    for (const entry of entries) {
      const row = [
        entry.id,
        entry.timestamp,
        entry.type,
        entry.skill,
        entry.action,
        entry.severity,
        entry.userId,
        JSON.stringify(entry.data).replace(/"/g, '""'),
        entry.tags.join(';')
      ];
      csvRows.push(row.map(field => `"${field}"`).join(','));
    }

    return csvRows.join('\n');
  }

  parseCSV(csvData) {
    const lines = csvData.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
    const entries = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(v => v.replace(/"/g, ''));
      const entry = {};

      for (let j = 0; j < headers.length && j < values.length; j++) {
        const header = headers[j].trim();
        const value = values[j].trim();

        switch (header) {
          case 'timestamp':
            entry[header] = parseInt(value);
            break;
          case 'data':
            try {
              entry[header] = JSON.parse(value);
            } catch {
              entry[header] = {};
            }
            break;
          case 'tags':
            entry[header] = value ? value.split(';') : [];
            break;
          default:
            entry[header] = value;
        }
      }

      entries.push(entry);
    }

    return entries;
  }

  setupCleanupInterval() {
    // Clean up old entries every hour
    setInterval(() => {
      this.cleanupOldEntries();
    }, 3600000);
  }

  async cleanupOldEntries() {
    const cutoffDate = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    const oldEntries = this.entries.filter(entry => entry.timestamp < cutoffDate);

    if (oldEntries.length > 0) {
      await this.clearHistory({ 
        fromDate: 0, 
        toDate: cutoffDate 
      });
      console.log(`Cleaned up ${oldEntries.length} old history entries`);
    }
  }

  async saveEntryToStorage(entry) {
    if (this.storageManager) {
      try {
        await this.storageManager.storeData(`history-${entry.id}`, entry);
      } catch (error) {
        console.error('Error saving history entry to storage:', error);
      }
    }
  }

  async loadHistoryFromStorage() {
    if (this.storageManager) {
      try {
        // This would need to be implemented based on storage manager capabilities
        // For now, we'll start with empty history
        this.entries = [];
      } catch (error) {
        console.error('Error loading history from storage:', error);
        this.entries = [];
      }
    }
  }

  setEventBus(eventBus) {
    this.eventBus = eventBus;
  }

  destroy() {
    this.entries = [];
    this.indexes = {
      byType: new Map(),
      bySkill: new Map(),
      byDate: new Map(),
      byUser: new Map()
    };
    this.searchIndex.clear();
    this.isInitialized = false;
  }
}

export { HistoryManager };
