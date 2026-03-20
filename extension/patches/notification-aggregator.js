/**
 * Notification Aggregator — Background Service
 * Polls configured sources (Gmail, Calendar, tasks, system alerts),
 * deduplicates, prioritises and pushes to active new-tab pages.
 */

/* ── Types / constants ───────────────────────────────────────────── */
const SOURCE_POLL_INTERVALS = {
  gmail:    2 * 60 * 1000,   // 2 min
  calendar: 5 * 60 * 1000,   // 5 min
  task:     5 * 60 * 1000,
  system:   0,               // push-only
};

/** @typedef {'gmail'|'calendar'|'extension'|'task'|'system'} Source */
/** @typedef {'urgent'|'normal'|'low'} Priority */

/**
 * @typedef {Object} Notification
 * @property {string}   id
 * @property {Source}   source
 * @property {Priority} priority
 * @property {string}   title
 * @property {string}   [body]
 * @property {string}   timestamp
 * @property {boolean}  read
 * @property {Array}    [actions]
 * @property {Object}   [metadata]
 */

/* ── In-memory store (persisted to chrome.storage.local) ─────────── */
/** @type {Map<string, Notification>} */
const notifStore = new Map();
const lastPolled = {};

/* ── Aggregator ─────────────────────────────────────────────────── */
class NotificationAggregator {
  constructor() {
    this._alarmName = 'suya-notif-poll';
    this._handlers  = {
      gmail:    this._pollGmail.bind(this),
      calendar: this._pollCalendar.bind(this),
      task:     this._pollTasks.bind(this),
    };
  }

  /* ── Bootstrap ── */

  async init() {
    await this._loadPersistedNotifs();
    this._registerAlarms();
    this._bindMessages();
    // Initial poll
    await this._pollAll();
  }

  _registerAlarms() {
    // Deduplicate alarm registration
    chrome.alarms.get(this._alarmName, (alarm) => {
      if (!alarm) {
        chrome.alarms.create(this._alarmName, { periodInMinutes: 2 });
      }
    });

    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === this._alarmName) await this._pollAll();
    });
  }

  _bindMessages() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      switch (msg.type) {

        case 'GET_NOTIFICATIONS': {
          const settings = msg.settings ?? {};
          const items = this._getFiltered(settings);
          sendResponse({ notifications: items });
          return true;
        }

        case 'NOTIFICATION_ACTION': {
          this._handleAction(msg.notificationId, msg.handler, msg.metadata);
          sendResponse({ ok: true });
          return true;
        }

        case 'MARK_NOTIFICATION_READ': {
          const n = notifStore.get(msg.id);
          if (n) { n.read = true; this._persist(); }
          sendResponse({ ok: true });
          return true;
        }

        case 'DISMISS_NOTIFICATION': {
          notifStore.delete(msg.id);
          this._persist();
          this._broadcast({ type: 'NOTIFICATION_DISMISSED', id: msg.id });
          sendResponse({ ok: true });
          return true;
        }

        case 'PUSH_NOTIFICATION': {
          // System/extension-internal push
          this._ingest([msg.notification]);
          sendResponse({ ok: true });
          return true;
        }
      }
    });
  }

  /* ── Poll orchestration ── */

  async _pollAll() {
    const settings = await this._getSettings();
    if (!settings.notificationsEnabled) return;

    const now = Date.now();
    const promises = Object.entries(this._handlers).map(async ([source, fn]) => {
      const interval = SOURCE_POLL_INTERVALS[source] ?? 5 * 60 * 1000;
      if (interval && (now - (lastPolled[source] ?? 0)) < interval) return;
      lastPolled[source] = now;
      try {
        const items = await fn(settings);
        if (items?.length) this._ingest(items);
      } catch (e) {
        console.warn(`[Suya Aggregator] ${source} poll failed:`, e);
      }
    });

    await Promise.allSettled(promises);
  }

  /* ── Gmail poller ── */

  async _pollGmail(_settings) {
    // Requires OAuth token — request silently, fall back if denied
    const token = await this._getAuthToken({ interactive: false }).catch(() => null);
    if (!token) return [];

    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&q=is:unread&maxResults=10',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const messageIds = data.messages?.slice(0, 5) ?? [];

    const messages = await Promise.all(
      messageIds.map(({ id }) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).then(r => r.json()).catch(() => null)
      )
    );

    return messages.filter(Boolean).map(msg => {
      const headers = msg.payload?.headers ?? [];
      const subject = headers.find(h => h.name === 'Subject')?.value ?? '(no subject)';
      const from    = headers.find(h => h.name === 'From')?.value ?? '';
      const sender  = from.replace(/<.*>/, '').trim() || from;

      return this._makeNotif({
        id:       `gmail-${msg.id}`,
        source:   'gmail',
        priority: subject.toLowerCase().includes('urgent') || subject.toLowerCase().includes('asap')
                    ? 'urgent' : 'normal',
        title:    subject,
        body:     sender,
        timestamp: new Date(Number(msg.internalDate)).toISOString(),
        actions: [
          { label: 'Reply',   handler: 'reply-email'   },
          { label: 'Archive', handler: 'archive-email' },
        ],
        metadata: { messageId: msg.id },
      });
    });
  }

  /* ── Calendar poller ── */

  async _pollCalendar(_settings) {
    const token = await this._getAuthToken({ interactive: false }).catch(() => null);
    if (!token) return [];

    const now     = new Date();
    const in2h    = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const params  = new URLSearchParams({
      timeMin:      now.toISOString(),
      timeMax:      in2h.toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '5',
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];

    const data = await res.json();
    return (data.items ?? []).map(evt => {
      const start       = evt.start?.dateTime ?? evt.start?.date;
      const startDate   = new Date(start);
      const minsAway    = Math.round((startDate.getTime() - now.getTime()) / 60000);
      const meetUrl     = evt.hangoutLink ?? evt.location ?? null;

      return this._makeNotif({
        id:       `cal-${evt.id}`,
        source:   'calendar',
        priority: minsAway <= 15 ? 'urgent' : minsAway <= 60 ? 'normal' : 'low',
        title:    `${evt.summary ?? 'Event'}${minsAway <= 60 ? ` in ${minsAway}m` : ''}`,
        body:     evt.description?.slice(0, 80) ?? '',
        timestamp: startDate.toISOString(),
        actions:  meetUrl
          ? [{ label: 'Join', handler: 'join-meeting' }, { label: 'Dismiss', handler: 'dismiss' }]
          : [{ label: 'View', handler: 'view-event' }],
        metadata: { eventId: evt.id, meetUrl: meetUrl ?? undefined, calendarId: 'primary' },
      });
    });
  }

  /* ── Task poller ── */

  async _pollTasks(_settings) {
    const now       = new Date();
    const todayEnd  = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Fetch from chrome.storage (tasks created by Suya's task skill)
    const stored = await new Promise(resolve =>
      chrome.storage.local.get('suyaTasks', ({ suyaTasks }) => resolve(suyaTasks ?? []))
    );

    return stored
      .filter(task => {
        if (task.completed) return false;
        const due = task.dueDate ? new Date(task.dueDate) : null;
        return due && due <= todayEnd;
      })
      .map(task => this._makeNotif({
        id:       `task-${task.id}`,
        source:   'task',
        priority: new Date(task.dueDate) < now ? 'urgent' : 'normal',
        title:    `${new Date(task.dueDate) < now ? 'Overdue' : 'Due today'}: ${task.title}`,
        body:     task.description?.slice(0, 80),
        timestamp: task.dueDate,
        actions:  [
          { label: 'Open',  handler: 'open-task'  },
          { label: 'Snooze', handler: 'snooze-task' },
        ],
        metadata: { taskId: task.id },
      }));
  }

  /* ── Ingest pipeline ── */

  _ingest(items) {
    const newItems = [];

    items.forEach(item => {
      const existing = notifStore.get(item.id);
      if (!existing) {
        notifStore.set(item.id, item);
        newItems.push(item);
      } else if (!existing.read && item.priority === 'urgent') {
        // Escalate priority on existing
        existing.priority = 'urgent';
      }
    });

    if (newItems.length === 0) return;

    // Enforce 100-item cap — remove oldest read items first
    if (notifStore.size > 100) {
      const sorted = [...notifStore.values()]
        .filter(n => n.read)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      sorted.slice(0, notifStore.size - 100).forEach(n => notifStore.delete(n.id));
    }

    this._persist();

    // Push new items to active new-tab pages
    newItems.forEach(n => this._broadcast({ type: 'NEW_NOTIFICATION', notification: n }));
  }

  /* ── Helpers ── */

  _makeNotif(data) {
    return {
      read: false,
      ...data,
      timestamp: data.timestamp ?? new Date().toISOString(),
    };
  }

  _getFiltered(settings) {
    const now = new Date();

    // Quiet hours check
    if (this._inQuietHours(settings.quietHoursStart, settings.quietHoursEnd, now)) {
      return [...notifStore.values()].filter(n => n.priority === 'urgent');
    }

    return [...notifStore.values()]
      .sort((a, b) => {
        const P = { urgent: 0, normal: 1, low: 2 };
        if (P[a.priority] !== P[b.priority]) return P[a.priority] - P[b.priority];
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
  }

  _inQuietHours(start, end, now) {
    if (!start || !end) return false;
    const toMins = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const current = now.getHours() * 60 + now.getMinutes();
    const s = toMins(start), e = toMins(end);
    return s > e
      ? current >= s || current < e   // overnight span
      : current >= s && current < e;
  }

  async _handleAction(id, handler, metadata) {
    switch (handler) {
      case 'join-meeting':
        if (metadata?.meetUrl) chrome.tabs.create({ url: metadata.meetUrl });
        break;
      case 'reply-email':
        chrome.tabs.create({ url: `https://mail.google.com/mail/u/0/#inbox/${metadata?.messageId ?? ''}` });
        break;
      case 'archive-email':
        await this._archiveGmailMessage(metadata?.messageId);
        notifStore.delete(id);
        this._persist();
        break;
      case 'view-event':
        chrome.tabs.create({ url: `https://calendar.google.com` });
        break;
      case 'dismiss':
        notifStore.delete(id);
        this._persist();
        break;
    }
  }

  async _archiveGmailMessage(messageId) {
    if (!messageId) return;
    const token = await this._getAuthToken({ interactive: false }).catch(() => null);
    if (!token) return;
    await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
    }).catch(() => {});
  }

  _getAuthToken(options) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken(options, (token) => {
        if (chrome.runtime.lastError || !token) return reject(chrome.runtime.lastError);
        resolve(token);
      });
    });
  }

  async _getSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get('suyaSettings', ({ suyaSettings }) =>
        resolve(suyaSettings ?? { notificationsEnabled: true })
      );
    });
  }

  async _loadPersistedNotifs() {
    return new Promise(resolve => {
      chrome.storage.local.get('suyaNotifications', ({ suyaNotifications }) => {
        (suyaNotifications ?? []).forEach(n => notifStore.set(n.id, n));
        resolve();
      });
    });
  }

  _persist() {
    const items = [...notifStore.values()];
    chrome.storage.local.set({ suyaNotifications: items });
  }

  _broadcast(message) {
    chrome.tabs.query({ url: chrome.runtime.getURL('newtab/newtab.html') }, tabs => {
      tabs.forEach(tab => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      });
    });
  }
}

/* ── Singleton export ─────────────────────────────────────────────── */
export const notificationAggregator = new NotificationAggregator();
export default notificationAggregator;
