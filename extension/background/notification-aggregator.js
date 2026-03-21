/**
 * Notification Aggregator
 * Polls Gmail and Calendar for notifications, aggregates them,
 * and provides a unified API for the UI.
 */

class NotificationAggregator {
  constructor() {
    this.isInitialized = false;
    this.gmailPollInterval = null;
    this.calendarPollInterval = null;
    this.lastGmailCheck = null;
    this.lastCalendarCheck = null;
    this.notifications = [];
    this.maxNotifications = 50;
  }

  async init() {
    if (this.isInitialized) return;
    
    console.log('[Suya] Initializing notification aggregator...');
    
    // Set up polling alarms
    await this.setupAlarms();
    
    // Load cached notifications
    await this.loadCachedNotifications();
    
    // Start with immediate check
    await this.checkGmail();
    await this.checkCalendar();
    
    this.isInitialized = true;
    console.log('[Suya] Notification aggregator initialized');
  }

  async setupAlarms() {
    // Gmail polling every 5 minutes
    await chrome.alarms.clear('gmail-poll');
    await chrome.alarms.create('gmail-poll', {
      periodInMinutes: 5
    });

    // Calendar polling every 15 minutes
    await chrome.alarms.clear('calendar-poll');
    await chrome.alarms.create('calendar-poll', {
      periodInMinutes: 15
    });

    // Listen for alarm events
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'gmail-poll') {
        this.checkGmail();
      } else if (alarm.name === 'calendar-poll') {
        this.checkCalendar();
      }
    });
  }

  async checkGmail() {
    try {
      // Check if we have Gmail access token
      const token = await this.getGmailToken();
      if (!token) {
        console.log('[Suya] No Gmail token, skipping check');
        return;
      }

      // Fetch unread messages
      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread',
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.status}`);
      }

      const data = await response.json();
      const messages = data.messages || [];

      // Process each message
      for (const message of messages.slice(0, 10)) { // Limit to 10 recent
        await this.processGmailMessage(message.id, token);
      }

      this.lastGmailCheck = Date.now();
      await this.saveToStorage();

    } catch (error) {
      console.error('[Suya] Gmail check failed:', error);
    }
  }

  async processGmailMessage(messageId, token) {
    try {
      // Fetch message details
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) return;

      const message = await response.json();
      
      // Extract headers
      const headers = message.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      // Check if we already have this notification
      const existingId = `gmail-${messageId}`;
      if (this.notifications.find(n => n.id === existingId)) {
        return;
      }

      // Create notification
      const notification = {
        id: existingId,
        type: 'gmail',
        title: 'New Email',
        message: `${from}: ${subject}`,
        timestamp: new Date(date).getTime() || Date.now(),
        priority: this.getGmailPriority(from, subject),
        actionUrl: `https://mail.google.com/#inbox/${messageId}`,
        read: false
      };

      this.addNotification(notification);

    } catch (error) {
      console.error('[Suya] Error processing Gmail message:', error);
    }
  }

  getGmailPriority(from, subject) {
    // Simple priority logic
    const fromLower = from.toLowerCase();
    const subjectLower = subject.toLowerCase();

    if (fromLower.includes('noreply') || fromLower.includes('no-reply')) {
      return 'low';
    }
    if (subjectLower.includes('urgent') || subjectLower.includes('important')) {
      return 'high';
    }
    return 'normal';
  }

  async checkCalendar() {
    try {
      const token = await this.getCalendarToken();
      if (!token) {
        console.log('[Suya] No Calendar token, skipping check');
        return;
      }

      // Get events for next 24 hours
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${tomorrow.toISOString()}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Calendar API error: ${response.status}`);
      }

      const data = await response.json();
      const events = data.items || [];

      // Process upcoming events
      for (const event of events) {
        await this.processCalendarEvent(event);
      }

      this.lastCalendarCheck = Date.now();
      await this.saveToStorage();

    } catch (error) {
      console.error('[Suya] Calendar check failed:', error);
    }
  }

  async processCalendarEvent(event) {
    try {
      const existingId = `calendar-${event.id}`;
      if (this.notifications.find(n => n.id === existingId)) {
        return;
      }

      const startTime = event.start?.dateTime || event.start?.date;
      const title = event.summary || 'Untitled Event';
      
      const notification = {
        id: existingId,
        type: 'calendar',
        title: 'Upcoming Event',
        message: title,
        timestamp: new Date(startTime).getTime(),
        priority: this.getCalendarPriority(startTime),
        actionUrl: event.htmlLink,
        read: false
      };

      this.addNotification(notification);

    } catch (error) {
      console.error('[Suya] Error processing calendar event:', error);
    }
  }

  getCalendarPriority(startTime) {
    const now = Date.now();
    const eventTime = new Date(startTime).getTime();
    const hoursUntil = (eventTime - now) / (1000 * 60 * 60);

    if (hoursUntil < 1) return 'high';
    if (hoursUntil < 4) return 'normal';
    return 'low';
  }

  async getGmailToken() {
    try {
      const token = await chrome.identity.getAuthToken({
        interactive: false,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly']
      });
      return token;
    } catch (error) {
      return null;
    }
  }

  async getCalendarToken() {
    try {
      const token = await chrome.identity.getAuthToken({
        interactive: false,
        scopes: ['https://www.googleapis.com/auth/calendar.events.readonly']
      });
      return token;
    } catch (error) {
      return null;
    }
  }

  addNotification(notification) {
    // Remove oldest if we exceed max
    if (this.notifications.length >= this.maxNotifications) {
      this.notifications = this.notifications
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, this.maxNotifications - 1);
    }

    this.notifications.unshift(notification);
    
    // Show browser notification for high priority
    if (notification.priority === 'high') {
      chrome.notifications.create(notification.id, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/icon-48.png'),
        title: notification.title,
        message: notification.message
      });
    }
  }

  async markAsRead(notificationId) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      await this.saveToStorage();
    }
  }

  async markAllAsRead() {
    this.notifications.forEach(n => n.read = true);
    await this.saveToStorage();
  }

  getNotifications(options = {}) {
    const { type, priority, unreadOnly = false, limit = 20 } = options;
    
    let filtered = this.notifications;

    if (type) {
      filtered = filtered.filter(n => n.type === type);
    }
    if (priority) {
      filtered = filtered.filter(n => n.priority === priority);
    }
    if (unreadOnly) {
      filtered = filtered.filter(n => !n.read);
    }

    return filtered.slice(0, limit);
  }

  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  async saveToStorage() {
    await chrome.storage.local.set({
      notifications: this.notifications,
      lastGmailCheck: this.lastGmailCheck,
      lastCalendarCheck: this.lastCalendarCheck
    });
  }

  async loadCachedNotifications() {
    const data = await chrome.storage.local.get([
      'notifications',
      'lastGmailCheck',
      'lastCalendarCheck'
    ]);

    this.notifications = data.notifications || [];
    this.lastGmailCheck = data.lastGmailCheck;
    this.lastCalendarCheck = data.lastCalendarCheck;
  }

  async clear() {
    this.notifications = [];
    await this.saveToStorage();
  }
}

// Export singleton
export const notificationAggregator = new NotificationAggregator();
