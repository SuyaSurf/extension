import React, { useState, useEffect } from 'react';

export type NotifSource = 'gmail' | 'calendar' | 'extension' | 'task' | 'system';
export type NotifPriority = 'urgent' | 'normal' | 'low';

export interface Notification {
  id: string;
  source: NotifSource;
  priority: NotifPriority;
  title: string;
  body?: string;
  timestamp: string;
  read: boolean;
  actions?: Array<{ label: string; handler: string }>;
  metadata?: Record<string, string>;
}

interface NotificationsSectionProps {
  className?: string;
}

interface StoredSettings {
  notificationsEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

interface AggregatedNotification {
  id: string;
  type?: string;
  title: string;
  message?: string;
  timestamp: number;
  priority?: string;
  actionUrl?: string;
  read?: boolean;
}

const SOURCE_ICON: Record<NotifSource, string> = {
  gmail:     '✉️',
  calendar:  '📅',
  extension: '🍢',
  task:      '✅',
  system:    '⚙️',
};

const PRIORITY_COLOR: Record<NotifPriority, string> = {
  urgent: '#FF4444',
  normal: '#4FC3F7',
  low:    '#78909C',
};

const FALLBACK_NOTIFS: Notification[] = [
  {
    id: 'suya-setup',
    source: 'extension',
    priority: 'normal',
    title: 'Finish notification setup',
    body: 'Connect Gmail or Calendar permissions to unlock live notifications here.',
    timestamp: new Date().toISOString(),
    read: false,
    actions: [{ label: 'Open settings', handler: 'open-settings' }],
  }
];

const mapNotification = (item: AggregatedNotification): Notification => {
  const sourceMap: Record<string, NotifSource> = {
    gmail: 'gmail',
    calendar: 'calendar',
    extension: 'extension',
    task: 'task',
    system: 'system',
    high: 'extension'
  };

  const priorityMap: Record<string, NotifPriority> = {
    high: 'urgent',
    urgent: 'urgent',
    normal: 'normal',
    low: 'low'
  };

  const source = sourceMap[item.type || 'extension'] || 'extension';
  const priority = priorityMap[item.priority || 'normal'] || 'normal';
  const actions = item.actionUrl
    ? [{ label: 'Open', handler: 'open-url' }]
    : undefined;

  return {
    id: item.id,
    source,
    priority,
    title: item.title,
    body: item.message,
    timestamp: new Date(item.timestamp).toISOString(),
    read: Boolean(item.read),
    actions,
    metadata: item.actionUrl ? { actionUrl: item.actionUrl } : undefined,
  };
};

const loadNotifications = async (): Promise<{ enabled: boolean; items: Notification[] }> => {
  if (typeof chrome === 'undefined') {
    return { enabled: true, items: FALLBACK_NOTIFS };
  }

  const syncResult = await chrome.storage.sync.get(['settings', 'suyaSettings']);
  const localResult = await chrome.storage.local.get(['notifications']);
  const settings = (syncResult.settings || syncResult.suyaSettings || {}) as StoredSettings;
  const enabled = settings.notificationsEnabled !== false;

  if (!enabled) {
    return { enabled: false, items: [] };
  }

  const stored = (localResult.notifications || []) as AggregatedNotification[];
  if (stored.length === 0) {
    return { enabled: true, items: FALLBACK_NOTIFS };
  }

  return {
    enabled: true,
    items: stored
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)
      .map(mapNotification)
  };
};

const NotificationsSection: React.FC<NotificationsSectionProps> = ({ className }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    const fetchNotifications = async () => {
      setLoading(true);
      const result = await loadNotifications();
      setNotificationsEnabled(result.enabled);
      setNotifications(result.items);
      setLoading(false);
    };

    fetchNotifications();

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      const handleChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName === 'local' || areaName === 'sync') {
          fetchNotifications();
        }
      };

      chrome.storage.onChanged.addListener(handleChange);
      return () => chrome.storage.onChanged.removeListener(handleChange);
    }
  }, []);

  const filteredNotifs = filter === 'all' 
    ? notifications 
    : notifications.filter(n => !n.read);

  const markAsRead = (id: string) => {
    setNotifications(prev => {
      const next = prev.map(n => 
        n.id === id ? { ...n, read: true } : n
      );

      if (typeof chrome !== 'undefined') {
        chrome.storage.local.get(['notifications']).then(result => {
          const stored = (result.notifications || []) as AggregatedNotification[];
          const updated = stored.map(item => item.id === id ? { ...item, read: true } : item);
          chrome.storage.local.set({ notifications: updated });
        });
      }

      return next;
    });
  };

  const markAllAsRead = () => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));

      if (typeof chrome !== 'undefined') {
        chrome.storage.local.get(['notifications']).then(result => {
          const stored = (result.notifications || []) as AggregatedNotification[];
          const updated = stored.map(item => ({ ...item, read: true }));
          chrome.storage.local.set({ notifications: updated });
        });
      }

      return next;
    });
  };

  const handleAction = (notif: Notification, action: { label: string; handler: string }) => {
    switch (action.handler) {
      case 'join-meeting':
        if (notif.metadata?.meetUrl) {
          chrome.tabs.create({ url: notif.metadata.meetUrl });
        }
        markAsRead(notif.id);
        break;
      case 'reply-email':
        chrome.tabs.create({ url: 'https://mail.google.com' });
        markAsRead(notif.id);
        break;
      case 'archive-email':
        markAsRead(notif.id);
        break;
      case 'review-pr':
        chrome.tabs.create({ url: 'https://github.com/pulls' });
        markAsRead(notif.id);
        break;
      case 'update-extension':
        chrome.runtime.reload();
        break;
      case 'open-settings':
        chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
        markAsRead(notif.id);
        break;
      case 'open-url':
        if (notif.metadata?.actionUrl) {
          chrome.tabs.create({ url: notif.metadata.actionUrl });
        }
        markAsRead(notif.id);
        break;
      default:
        markAsRead(notif.id);
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <section className={`notifications-section ${className || ''}`}>
      <div className="section-header">
        <h2>🔔 Notifications</h2>
        {unreadCount > 0 && (
          <span className="unread-badge">{unreadCount}</span>
        )}
      </div>

      <div className="filter-controls">
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({notifications.length})
        </button>
        <button 
          className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </button>
        {unreadCount > 0 && (
          <button className="mark-all-read" onClick={markAllAsRead}>
            Mark all read
          </button>
        )}
      </div>

      <div className="notifications-list">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Fetching notifications...</p>
          </div>
        ) : !notificationsEnabled ? (
          <div className="empty-state">
            <p>Notifications are disabled in your settings.</p>
          </div>
        ) : filteredNotifs.length === 0 ? (
          <div className="empty-state">
            <p>{filter === 'unread' ? 'No unread notifications' : 'No notifications'}</p>
          </div>
        ) : (
          filteredNotifs.map(notif => (
            <article 
              key={notif.id}
              className={`notification-item ${notif.read ? 'read' : ''} priority-${notif.priority}`}
            >
              <div className="notification-header">
                <div className="source-info">
                  <span className="source-icon">{SOURCE_ICON[notif.source]}</span>
                  <div className="priority-indicator" 
                    style={{ backgroundColor: PRIORITY_COLOR[notif.priority] }}
                  />
                </div>
                <div className="timestamp">{formatTimeAgo(notif.timestamp)}</div>
              </div>

              <div className="notification-content">
                <h3 className="notification-title">{notif.title}</h3>
                {notif.body && (
                  <p className="notification-body">{notif.body}</p>
                )}
              </div>

              {notif.actions && notif.actions.length > 0 && (
                <div className="notification-actions">
                  {notif.actions.map(action => (
                    <button
                      key={action.handler}
                      className="action-btn"
                      onClick={() => handleAction(notif, action)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <style>{`
        .notifications-section {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .section-header h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
        }
        .unread-badge {
          background: #FF4444;
          color: white;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }
        .filter-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .filter-btn {
          padding: 6px 12px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 20px;
          background: transparent;
          color: white;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .filter-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .filter-btn.active {
          background: rgba(255, 255, 255, 0.2);
          border-color: white;
        }
        .mark-all-read {
          margin-left: auto;
          padding: 6px 12px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 20px;
          background: transparent;
          color: white;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .mark-all-read:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .notifications-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .loading-state, .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px;
          gap: 16px;
          opacity: 0.7;
        }
        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .notification-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          transition: all 0.2s;
          border-left: 3px solid transparent;
        }
        .notification-item.priority-urgent {
          border-left-color: #FF4444;
        }
        .notification-item.priority-normal {
          border-left-color: #4FC3F7;
        }
        .notification-item.priority-low {
          border-left-color: #78909C;
        }
        .notification-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .notification-item.read {
          opacity: 0.6;
        }
        .notification-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .source-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .source-icon {
          font-size: 16px;
        }
        .priority-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .timestamp {
          font-size: 12px;
          opacity: 0.7;
        }
        .notification-content {
          margin-bottom: 12px;
        }
        .notification-title {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 600;
        }
        .notification-body {
          margin: 0;
          font-size: 14px;
          opacity: 0.9;
          line-height: 1.4;
        }
        .notification-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .action-btn {
          padding: 6px 12px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .action-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </section>
  );
};

export default NotificationsSection;
