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

const MOCK_NOTIFS: Notification[] = [
  {
    id: 'n1', source: 'calendar', priority: 'urgent',
    title: 'Standup in 10 minutes',
    body: 'Daily standup · Google Meet · Team Suya',
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(), read: false,
    actions: [{ label: 'Join', handler: 'join-meeting' }, { label: 'Dismiss', handler: 'dismiss' }],
    metadata: { meetUrl: 'https://meet.google.com/abc' },
  },
  {
    id: 'n2', source: 'gmail', priority: 'normal',
    title: 'Re: Proposal feedback — Amara Okafor',
    body: 'Looks great overall, a few small tweaks on the pricing section…',
    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(), read: false,
    actions: [{ label: 'Reply', handler: 'reply-email' }, { label: 'Archive', handler: 'archive-email' }],
  },
  {
    id: 'n3', source: 'task', priority: 'normal',
    title: 'Deadline today: Q2 Report',
    body: 'Due 5 PM · Marketing',
    timestamp: new Date(Date.now() - 1000 * 60 * 40).toISOString(), read: false,
    actions: [{ label: 'Open', handler: 'open-task' }, { label: 'Snooze', handler: 'snooze-task' }],
  },
  {
    id: 'n4', source: 'extension', priority: 'low',
    title: 'Form autofill available on current tab',
    body: 'Suya detected a job application form and can fill it for you.',
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(), read: true,
    actions: [{ label: 'Fill now', handler: 'fill-form' }],
  },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

const NotificationsSection: React.FC<NotificationsSectionProps> = ({ className = '' }) => {
  const [items, setItems] = useState<Notification[]>(MOCK_NOTIFS);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  const unreadCount = items.filter(n => !n.read).length;
  const visible = filter === 'unread' ? items.filter(n => !n.read) : items;

  const markRead  = (id: string) =>
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

  const dismiss = (id: string) =>
    setItems(prev => prev.filter(n => n.id !== id));

  const markAllRead = () =>
    setItems(prev => prev.map(n => ({ ...n, read: true })));

  const handleAction = (notif: Notification, handler: string) => {
    // Relay to background service worker
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'NOTIFICATION_ACTION',
        notificationId: notif.id,
        handler,
        metadata: notif.metadata,
      });
    }
    if (handler === 'dismiss' || handler === 'archive-email') dismiss(notif.id);
    else markRead(notif.id);
  };

  // Listen for real notifications from background
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    const listener = (msg: any) => {
      if (msg.type === 'NEW_NOTIFICATION') {
        setItems(prev => [msg.notification, ...prev]);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  return (
    <section className={`notif-section ${className}`}>
      <header className="section-header">
        <h2 className="section-title">
          <span className="title-icon">🔔</span> Notifications
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount}</span>
          )}
        </h2>
        <div className="notif-header-actions">
          {unreadCount > 0 && (
            <button className="text-btn" onClick={markAllRead}>Mark all read</button>
          )}
          <div className="filter-toggle">
            {(['unread', 'all'] as const).map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="notif-list" role="list">
        {visible.length === 0 ? (
          <div className="notif-empty">
            <span>✨</span>
            <p>All caught up!</p>
          </div>
        ) : visible.map(notif => (
          <div
            key={notif.id}
            role="listitem"
            className={`notif-item notif-item--${notif.priority} ${notif.read ? 'notif-item--read' : ''}`}
          >
            <div className="notif-indicator"
              style={{ background: PRIORITY_COLOR[notif.priority] }}/>

            <div className="notif-icon">{SOURCE_ICON[notif.source]}</div>

            <div className="notif-body" onClick={() => markRead(notif.id)}>
              <div className="notif-title">{notif.title}</div>
              {notif.body && <div className="notif-desc">{notif.body}</div>}
              <div className="notif-time">{timeAgo(notif.timestamp)}</div>
            </div>

            <button className="notif-dismiss" onClick={() => dismiss(notif.id)}
              aria-label="Dismiss">×</button>

            {notif.actions && notif.actions.length > 0 && (
              <div className="notif-actions">
                {notif.actions.map(action => (
                  <button
                    key={action.handler}
                    className={`notif-action-btn ${action.handler === 'join-meeting' || action.handler === 'fill-form' ? 'notif-action-btn--primary' : ''}`}
                    onClick={() => handleAction(notif, action.handler)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .notif-section { display: flex; flex-direction: column; gap: 14px; }
        .section-header {
          display: flex; align-items: center;
          justify-content: space-between; gap: 8px;
        }
        .section-title {
          font-family: 'Syne', sans-serif;
          font-size: 13px; font-weight: 700;
          letter-spacing: .08em; text-transform: uppercase;
          color: rgba(255,255,255,.5);
          display: flex; align-items: center; gap: 6px;
        }
        .title-icon { font-size: 15px; }
        .unread-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 18px; height: 18px;
          padding: 0 5px; border-radius: 9px;
          background: #FF4444; color: #fff;
          font-size: 10px; font-weight: 700;
          font-family: 'DM Sans', sans-serif;
        }
        .notif-header-actions { display: flex; align-items: center; gap: 10px; }
        .text-btn {
          background: none; border: none;
          font-size: 11px; font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,.3); cursor: pointer;
          transition: color .15s;
        }
        .text-btn:hover { color: rgba(255,255,255,.65); }
        .filter-toggle { display: flex; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,.1); }
        .filter-btn {
          background: none; border: none; padding: 3px 9px;
          font-size: 10px; font-family: 'DM Sans', sans-serif;
          font-weight: 500; letter-spacing: .04em; text-transform: capitalize;
          color: rgba(255,255,255,.3); cursor: pointer; transition: all .15s;
        }
        .filter-btn--active { background: rgba(255,255,255,.08); color: rgba(255,255,255,.8); }
        .notif-list { display: flex; flex-direction: column; gap: 4px; }
        .notif-empty {
          text-align: center; padding: 28px 0;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          color: rgba(255,255,255,.25);
        }
        .notif-empty span { font-size: 22px; }
        .notif-item {
          display: grid;
          grid-template-columns: 3px 28px 1fr auto;
          grid-template-rows: auto auto;
          column-gap: 10px;
          row-gap: 6px;
          padding: 10px 10px 10px 0;
          border-radius: 8px;
          background: rgba(255,255,255,.03);
          border: 1px solid transparent;
          transition: all .18s;
          position: relative;
        }
        .notif-item:hover { background: rgba(255,255,255,.055); }
        .notif-item--read { opacity: .55; }
        .notif-item--urgent { border-color: rgba(255,68,68,.18); }
        .notif-indicator {
          grid-column: 1; grid-row: 1 / 3;
          width: 3px; border-radius: 0 2px 2px 0;
          align-self: stretch;
        }
        .notif-icon {
          grid-column: 2; grid-row: 1;
          font-size: 16px; line-height: 1;
          padding-top: 2px;
        }
        .notif-body {
          grid-column: 3; grid-row: 1;
          cursor: pointer; min-width: 0;
        }
        .notif-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px; font-weight: 500;
          color: rgba(255,255,255,.88);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .notif-desc {
          font-family: 'DM Sans', sans-serif;
          font-size: 11px; color: rgba(255,255,255,.4);
          margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .notif-time {
          font-size: 10px; font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,.22); margin-top: 3px;
        }
        .notif-dismiss {
          grid-column: 4; grid-row: 1;
          background: none; border: none;
          font-size: 16px; color: rgba(255,255,255,.2);
          cursor: pointer; padding: 0 6px; line-height: 1;
          transition: color .15s; align-self: start;
        }
        .notif-dismiss:hover { color: rgba(255,255,255,.7); }
        .notif-actions {
          grid-column: 2 / 5; grid-row: 2;
          display: flex; gap: 6px;
        }
        .notif-action-btn {
          padding: 3px 10px; border-radius: 5px;
          border: 1px solid rgba(255,255,255,.12);
          background: none; cursor: pointer;
          font-size: 11px; font-family: 'DM Sans', sans-serif;
          font-weight: 500; color: rgba(255,255,255,.5);
          transition: all .15s;
        }
        .notif-action-btn:hover { border-color: rgba(255,255,255,.3); color: rgba(255,255,255,.85); }
        .notif-action-btn--primary {
          background: rgba(255,107,53,.15);
          border-color: rgba(255,107,53,.4);
          color: #FF9068;
        }
        .notif-action-btn--primary:hover {
          background: rgba(255,107,53,.28);
          border-color: rgba(255,107,53,.7);
          color: #FFBA98;
        }
      `}</style>
    </section>
  );
};

export default NotificationsSection;
