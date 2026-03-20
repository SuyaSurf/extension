/**
 * Reminder Management System
 * Provides smart reminders with notifications, snooze, and context awareness
 */

class ReminderManager {
  constructor(config = {}) {
    this.config = {
      maxReminders: 1000,
      defaultSnoozeMinutes: 5,
      maxSnoozeMinutes: 60,
      enableNotifications: true,
      enableSounds: true,
      ...config
    };
    
    this.reminders = new Map();
    this.activeNotifications = new Map();
    this.snoozedReminders = new Map();
    this.categories = new Map();
    this.isInitialized = false;
    this.storageManager = null;
    this.eventBus = null;
    this.audioManager = null;
    
    // Default categories
    this.initializeDefaultCategories();
  }

  async initialize(storageManager = null, eventBus = null, audioManager = null) {
    if (this.isInitialized) return;
    
    this.storageManager = storageManager;
    this.eventBus = eventBus;
    this.audioManager = audioManager;
    
    try {
      // Load existing reminders from storage
      await this.loadRemindersFromStorage();
      
      // Set up notification permission check
      await this.checkNotificationPermissions();
      
      // Set up alarm handler for reminders
      this.setupAlarmHandler();
      
      // Start reminder processing
      this.startReminderProcessor();
      
      this.isInitialized = true;
      console.log('Reminder Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Reminder Manager:', error);
      throw error;
    }
  }

  /**
   * Create a new reminder
   * @param {Object} reminderData - Reminder data
   * @param {string} reminderData.title - Reminder title
   * @param {string} reminderData.description - Reminder description
   * @param {number} reminderData.triggerTime - When to trigger (timestamp)
   * @param {string} reminderData.category - Reminder category
   * @param {number} reminderData.priority - Priority (1-5, 5 highest)
   * @param {boolean} reminderData.recurring - Whether it's recurring
   * @param {string} reminderData.recurringPattern - Recurring pattern (cron expression)
   * @param {Object} reminderData.context - Context data
   * @param {Array} reminderData.tags - Tags
   * @returns {Object} Created reminder
   */
  async createReminder(reminderData) {
    const reminder = {
      id: crypto.randomUUID(),
      title: reminderData.title || 'Reminder',
      description: reminderData.description || '',
      triggerTime: reminderData.triggerTime || Date.now(),
      category: reminderData.category || 'general',
      priority: reminderData.priority || 3,
      recurring: reminderData.recurring || false,
      recurringPattern: reminderData.recurringPattern || null,
      context: reminderData.context || {},
      tags: reminderData.tags || [],
      status: 'pending',
      createdAt: Date.now(),
      triggeredAt: null,
      snoozedUntil: null,
      snoozeCount: 0,
      dismissedAt: null,
      notificationId: null
    };

    // Validate reminder data
    this.validateReminder(reminder);

    // Store reminder
    this.reminders.set(reminder.id, reminder);
    await this.saveReminderToStorage(reminder);

    // Schedule the reminder
    await this.scheduleReminder(reminder);

    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('reminder:created', reminder);
    }

    console.log(`Reminder created: ${reminder.id} - ${reminder.title}`);
    return reminder;
  }

  /**
   * Update an existing reminder
   * @param {string} reminderId - Reminder ID
   * @param {Object} updates - Updates to apply
   * @returns {Object} Updated reminder
   */
  async updateReminder(reminderId, updates) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) {
      throw new Error(`Reminder not found: ${reminderId}`);
    }

    // Don't allow updating certain fields for active reminders
    const restrictedFields = ['id', 'createdAt', 'triggeredAt', 'dismissedAt'];
    for (const field of restrictedFields) {
      if (updates[field] !== undefined) {
        delete updates[field];
      }
    }

    // Apply updates
    Object.assign(reminder, updates);

    // Re-validate
    this.validateReminder(reminder);

    // Reschedule if trigger time changed
    if (updates.triggerTime) {
      await this.rescheduleReminder(reminder);
    }

    // Save to storage
    await this.saveReminderToStorage(reminder);

    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('reminder:updated', reminder);
    }

    return reminder;
  }

  /**
   * Delete a reminder
   * @param {string} reminderId - Reminder ID
   * @returns {boolean} Success status
   */
  async deleteReminder(reminderId) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) {
      return false;
    }

    // Cancel any active notification
    if (reminder.notificationId) {
      await this.cancelNotification(reminder.notificationId);
    }

    // Cancel Chrome alarm
    await this.cancelReminderAlarm(reminderId);

    // Remove from storage
    await this.removeReminderFromStorage(reminderId);

    // Remove from memory
    this.reminders.delete(reminderId);
    this.snoozedReminders.delete(reminderId);

    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('reminder:deleted', { reminderId, reminder });
    }

    console.log(`Reminder deleted: ${reminderId}`);
    return true;
  }

  /**
   * Trigger a reminder (show notification)
   * @param {string} reminderId - Reminder ID
   * @returns {Object} Trigger result
   */
  async triggerReminder(reminderId) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) {
      throw new Error(`Reminder not found: ${reminderId}`);
    }

    if (reminder.status !== 'pending') {
      return { success: false, reason: 'Reminder not pending' };
    }

    // Update reminder status
    reminder.status = 'triggered';
    reminder.triggeredAt = Date.now();
    await this.saveReminderToStorage(reminder);

    // Show notification
    const notificationId = await this.showReminderNotification(reminder);
    reminder.notificationId = notificationId;

    // Play sound if enabled
    if (this.config.enableSounds && this.audioManager) {
      await this.audioManager.playSound('reminder');
    }

    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('reminder:triggered', reminder);
    }

    console.log(`Reminder triggered: ${reminderId} - ${reminder.title}`);
    return { success: true, reminder, notificationId };
  }

  /**
   * Snooze a reminder
   * @param {string} reminderId - Reminder ID
   * @param {number} minutes - Minutes to snooze (default: config.defaultSnoozeMinutes)
   * @returns {Object} Snooze result
   */
  async snoozeReminder(reminderId, minutes = null) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) {
      throw new Error(`Reminder not found: ${reminderId}`);
    }

    const snoozeMinutes = minutes || this.config.defaultSnoozeMinutes;
    const snoozeUntil = Date.now() + (snoozeMinutes * 60000);

    // Validate snooze time
    if (snoozeMinutes > this.config.maxSnoozeMinutes) {
      throw new Error(`Snooze time exceeds maximum: ${this.config.maxSnoozeMinutes} minutes`);
    }

    // Cancel current notification
    if (reminder.notificationId) {
      await this.cancelNotification(reminder.notificationId);
      reminder.notificationId = null;
    }

    // Update reminder
    reminder.status = 'snoozed';
    reminder.snoozedUntil = snoozeUntil;
    reminder.snoozeCount++;
    await this.saveReminderToStorage(reminder);

    // Schedule snoozed reminder
    await this.scheduleSnoozedReminder(reminder, snoozeUntil);

    // Store snooze info
    this.snoozedReminders.set(reminderId, {
      snoozedUntil,
      snoozeCount: reminder.snoozeCount
    });

    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('reminder:snoozed', { reminder, snoozeMinutes });
    }

    console.log(`Reminder snoozed: ${reminderId} for ${snoozeMinutes} minutes`);
    return { success: true, reminder, snoozeMinutes };
  }

  /**
   * Dismiss a reminder
   * @param {string} reminderId - Reminder ID
   * @returns {Object} Dismiss result
   */
  async dismissReminder(reminderId) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) {
      throw new Error(`Reminder not found: ${reminderId}`);
    }

    // Cancel notification
    if (reminder.notificationId) {
      await this.cancelNotification(reminder.notificationId);
    }

    // Update reminder
    reminder.status = 'dismissed';
    reminder.dismissedAt = Date.now();
    await this.saveReminderToStorage(reminder);

    // Handle recurring reminders
    if (reminder.recurring && reminder.recurringPattern) {
      await this.scheduleNextRecurringReminder(reminder);
    }

    // Remove from snoozed reminders
    this.snoozedReminders.delete(reminderId);

    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('reminder:dismissed', reminder);
    }

    console.log(`Reminder dismissed: ${reminderId}`);
    return { success: true, reminder };
  }

  /**
   * Get reminders with optional filtering
   * @param {Object} filter - Filter options
   * @returns {Array} Filtered reminders
   */
  getReminders(filter = {}) {
    let reminders = Array.from(this.reminders.values());

    // Apply filters
    if (filter.status) {
      reminders = reminders.filter(r => r.status === filter.status);
    }
    if (filter.category) {
      reminders = reminders.filter(r => r.category === filter.category);
    }
    if (filter.priority) {
      reminders = reminders.filter(r => r.priority === filter.priority);
    }
    if (filter.tags && filter.tags.length > 0) {
      reminders = reminders.filter(r => 
        filter.tags.some(tag => r.tags.includes(tag))
      );
    }
    if (filter.fromDate) {
      reminders = reminders.filter(r => r.triggerTime >= filter.fromDate);
    }
    if (filter.toDate) {
      reminders = reminders.filter(r => r.triggerTime <= filter.toDate);
    }

    // Sort by trigger time (ascending for pending, descending for completed)
    const sortOrder = filter.sortOrder || (filter.status === 'pending' ? 'asc' : 'desc');
    reminders.sort((a, b) => {
      return sortOrder === 'asc' ? 
        a.triggerTime - b.triggerTime : 
        b.triggerTime - a.triggerTime;
    });

    // Apply limit
    if (filter.limit) {
      reminders = reminders.slice(0, filter.limit);
    }

    return reminders;
  }

  /**
   * Get reminder statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    const stats = {
      total: this.reminders.size,
      byStatus: { pending: 0, triggered: 0, snoozed: 0, dismissed: 0 },
      byCategory: {},
      byPriority: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      snoozedCount: this.snoozedReminders.size,
      upcomingCount: 0,
      overdueCount: 0
    };

    const now = Date.now();

    for (const reminder of this.reminders.values()) {
      // Status stats
      stats.byStatus[reminder.status] = (stats.byStatus[reminder.status] || 0) + 1;
      
      // Category stats
      stats.byCategory[reminder.category] = (stats.byCategory[reminder.category] || 0) + 1;
      
      // Priority stats
      stats.byPriority[reminder.priority] = (stats.byPriority[reminder.priority] || 0) + 1;
      
      // Upcoming/overdue
      if (reminder.status === 'pending') {
        if (reminder.triggerTime > now) {
          stats.upcomingCount++;
        } else {
          stats.overdueCount++;
        }
      }
    }

    return stats;
  }

  /**
   * Create reminder category
   * @param {Object} category - Category data
   * @returns {Object} Created category
   */
  createCategory(category) {
    const categoryData = {
      id: category.id || category.name.toLowerCase().replace(/\s+/g, '-'),
      name: category.name,
      description: category.description || '',
      color: category.color || '#007acc',
      icon: category.icon || 'bell',
      defaultPriority: category.defaultPriority || 3,
      ...category
    };

    this.categories.set(categoryData.id, categoryData);
    return categoryData;
  }

  /**
   * Get reminder categories
   * @returns {Array} Categories
   */
  getCategories() {
    return Array.from(this.categories.values());
  }

  // Private helper methods
  validateReminder(reminder) {
    if (!reminder.title || reminder.title.trim().length === 0) {
      throw new Error('Reminder title is required');
    }
    
    if (!reminder.triggerTime || reminder.triggerTime <= Date.now()) {
      throw new Error('Reminder trigger time must be in the future');
    }
    
    if (reminder.priority < 1 || reminder.priority > 5) {
      throw new Error('Reminder priority must be between 1 and 5');
    }
    
    if (reminder.recurring && !reminder.recurringPattern) {
      throw new Error('Recurring reminders must have a pattern');
    }
  }

  async scheduleReminder(reminder) {
    const delayMinutes = Math.max(1, Math.floor((reminder.triggerTime - Date.now()) / 60000));
    
    try {
      await chrome.alarms.create(`reminder-${reminder.id}`, {
        delayInMinutes: delayMinutes
      });
    } catch (error) {
      console.error('Failed to schedule reminder alarm:', error);
    }
  }

  async rescheduleReminder(reminder) {
    await this.cancelReminderAlarm(reminder.id);
    await this.scheduleReminder(reminder);
  }

  async scheduleSnoozedReminder(reminder, snoozeUntil) {
    const delayMinutes = Math.max(1, Math.floor((snoozeUntil - Date.now()) / 60000));
    
    try {
      await chrome.alarms.create(`reminder-${reminder.id}`, {
        delayInMinutes: delayMinutes
      });
    } catch (error) {
      console.error('Failed to schedule snoozed reminder alarm:', error);
    }
  }

  async scheduleNextRecurringReminder(reminder) {
    if (!reminder.recurringPattern) return;

    try {
      // This would need a cron parser to calculate next occurrence
      // For now, we'll create a simple next occurrence (24 hours later)
      const nextTriggerTime = reminder.triggerTime + (24 * 60 * 60 * 1000);
      
      const nextReminder = {
        ...reminder,
        id: crypto.randomUUID(),
        triggerTime: nextTriggerTime,
        status: 'pending',
        triggeredAt: null,
        snoozedUntil: null,
        snoozeCount: 0,
        dismissedAt: null,
        notificationId: null,
        createdAt: Date.now()
      };

      this.reminders.set(nextReminder.id, nextReminder);
      await this.saveReminderToStorage(nextReminder);
      await this.scheduleReminder(nextReminder);

      if (this.eventBus) {
        this.eventBus.emit('reminder:recurring-created', nextReminder);
      }
    } catch (error) {
      console.error('Failed to schedule next recurring reminder:', error);
    }
  }

  async cancelReminderAlarm(reminderId) {
    try {
      const result = await chrome.alarms.clear(`reminder-${reminderId}`);
      if (!result) {
        console.warn(`No alarm found for reminder ${reminderId}`);
      }
    } catch (error) {
      console.warn('Failed to cancel reminder alarm:', error);
    }
  }

  async showReminderNotification(reminder) {
    if (!this.config.enableNotifications) {
      return null;
    }

    const notificationOptions = {
      type: 'basic',
      iconUrl: this.getCategoryIcon(reminder.category),
      title: reminder.title,
      message: reminder.description || 'Reminder',
      priority: this.getNotificationPriority(reminder.priority),
      requireInteraction: true,
      buttons: [
        { title: 'Snooze' },
        { title: 'Dismiss' }
      ]
    };

    try {
      const notificationId = `reminder-${reminder.id}`;
      await chrome.notifications.create(notificationId, notificationOptions);
      
      this.activeNotifications.set(notificationId, reminder.id);
      return notificationId;
    } catch (error) {
      console.error('Failed to show reminder notification:', error);
      return null;
    }
  }

  async cancelNotification(notificationId) {
    try {
      const result = await chrome.notifications.clear(notificationId);
      if (result) {
        this.activeNotifications.delete(notificationId);
      }
    } catch (error) {
      console.warn('Failed to cancel notification:', error);
    }
  }

  getCategoryIcon(category) {
    const categoryData = this.categories.get(category);
    return categoryData?.icon || 'bell';
  }

  getNotificationPriority(priority) {
    const priorityMap = {
      1: 'low',
      2: 'low',
      3: 'normal',
      4: 'high',
      5: 'high'
    };
    return priorityMap[priority] || 'normal';
  }

  async checkNotificationPermissions() {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      try {
        const permissionLevel = await chrome.notifications.getPermissionLevel();
        if (permissionLevel !== 'granted') {
          console.warn('Notification permission not granted');
          this.config.enableNotifications = false;
        }
      } catch (error) {
        console.warn('Failed to check notification permissions:', error);
        this.config.enableNotifications = false;
      }
    }
  }

  setupAlarmHandler() {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name && alarm.name.startsWith('reminder-')) {
          const reminderId = alarm.name.replace('reminder-', '');
          this.triggerReminder(reminderId);
        }
      });
    }

    // Set up notification click handler
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.onClicked.addListener((notificationId) => {
        const reminderId = this.activeNotifications.get(notificationId);
        if (reminderId) {
          this.handleNotificationClick(reminderId, notificationId);
        }
      });

      chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
        const reminderId = this.activeNotifications.get(notificationId);
        if (reminderId) {
          this.handleNotificationButton(reminderId, notificationId, buttonIndex);
        }
      });
    }
  }

  async handleNotificationClick(reminderId, notificationId) {
    // Handle notification click (e.g., open relevant page)
    console.log(`Reminder notification clicked: ${reminderId}`);
  }

  async handleNotificationButton(reminderId, notificationId, buttonIndex) {
    if (buttonIndex === 0) {
      // Snooze button
      await this.snoozeReminder(reminderId);
    } else if (buttonIndex === 1) {
      // Dismiss button
      await this.dismissReminder(reminderId);
    }
  }

  startReminderProcessor() {
    // Check for overdue reminders every minute
    setInterval(() => {
      this.processOverdueReminders();
    }, 60000);
  }

  async processOverdueReminders() {
    const now = Date.now();
    const overdueReminders = this.getReminders({
      status: 'pending',
      toDate: now
    });

    for (const reminder of overdueReminders) {
      await this.triggerReminder(reminder.id);
    }
  }

  initializeDefaultCategories() {
    const defaultCategories = [
      { id: 'general', name: 'General', color: '#007acc', icon: 'bell' },
      { id: 'work', name: 'Work', color: '#28a745', icon: 'briefcase' },
      { id: 'personal', name: 'Personal', color: '#ffc107', icon: 'user' },
      { id: 'health', name: 'Health', color: '#dc3545', icon: 'heart' },
      { id: 'meeting', name: 'Meeting', color: '#6f42c1', icon: 'calendar' },
      { id: 'deadline', name: 'Deadline', color: '#fd7e14', icon: 'clock' }
    ];

    for (const category of defaultCategories) {
      this.categories.set(category.id, category);
    }
  }

  async saveReminderToStorage(reminder) {
    if (this.storageManager) {
      try {
        await this.storageManager.storeData(`reminder-${reminder.id}`, reminder);
      } catch (error) {
        console.error('Error saving reminder to storage:', error);
      }
    }
  }

  async removeReminderFromStorage(reminderId) {
    if (this.storageManager) {
      try {
        await this.storageManager.removeData(`reminder-${reminderId}`);
      } catch (error) {
        console.error('Error removing reminder from storage:', error);
      }
    }
  }

  async loadRemindersFromStorage() {
    if (this.storageManager) {
      try {
        // This would need to be implemented based on storage manager capabilities
        // For now, we'll start with empty reminders
        console.log('Loading reminders from storage...');
      } catch (error) {
        console.error('Error loading reminders from storage:', error);
      }
    }
  }

  destroy() {
    this.reminders.clear();
    this.activeNotifications.clear();
    this.snoozedReminders.clear();
    this.categories.clear();
    this.isInitialized = false;
  }
}

export { ReminderManager };
