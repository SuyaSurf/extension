import React, { useState } from 'react';

interface Action {
  id: string;
  icon: string;
  label: string;
  description: string;
  handler: string;
  color: string;
  badge?: string;
}

const ACTIONS: Action[] = [
  {
    id: 'briefing',   icon: '☀️',  label: 'Daily Briefing',
    description: 'Get a summary of your day ahead',
    handler: 'START_DAILY_BRIEFING', color: '#FFB74D',
  },
  {
    id: 'fill-form',  icon: '📝',  label: 'Fill Form',
    description: 'Autofill form on active tab',
    handler: 'FILL_CURRENT_FORM', color: '#81C784',
  },
  {
    id: 'analyze',    icon: '🔍',  label: 'Analyze Page',
    description: 'Summarize & extract key info',
    handler: 'ANALYZE_CURRENT_PAGE', color: '#4FC3F7',
  },
  {
    id: 'voice',      icon: '🎙️',  label: 'Voice Command',
    description: 'Speak to Suya',
    handler: 'START_VOICE', color: '#CE93D8',
  },
  {
    id: 'skill-gap',  icon: '📈',  label: 'Skill Gaps',
    description: 'Analyse your growth areas',
    handler: 'SKILL_GAP_ANALYSIS', color: '#F48FB1', badge: 'new',
  },
  {
    id: 'trending',   icon: '🔥',  label: 'Trending',
    description: 'What\'s trending in your field',
    handler: 'SHOW_TRENDING', color: '#FF7043',
  },
];

interface QuickActionsSectionProps {
  className?: string;
}

const QuickActionsSection: React.FC<QuickActionsSectionProps> = ({ className = '' }) => {
  const [activating, setActivating] = useState<string | null>(null);
  const [lastUsed, setLastUsed] = useState<Set<string>>(new Set());

  const handleAction = async (action: Action) => {
    setActivating(action.id);

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: action.handler });
    }

    setLastUsed(prev => new Set([...prev, action.id]));
    await new Promise(r => setTimeout(r, 500));
    setActivating(null);
  };

  return (
    <section className={`qa-section ${className}`}>
      <header className="qa-header">
        <h2 className="section-title">
          <span className="title-icon">⚡</span> Quick Actions
        </h2>
      </header>

      <div className="qa-grid">
        {ACTIONS.map(action => (
          <button
            key={action.id}
            className={`qa-card ${activating === action.id ? 'qa-card--activating' : ''} ${lastUsed.has(action.id) ? 'qa-card--used' : ''}`}
            style={{ '--action-color': action.color } as React.CSSProperties}
            onClick={() => handleAction(action)}
            aria-label={action.label}
          >
            {action.badge && (
              <span className="qa-badge">{action.badge}</span>
            )}
            <span className="qa-icon">{action.icon}</span>
            <span className="qa-label">{action.label}</span>
            <span className="qa-desc">{action.description}</span>
            <span className="qa-arrow">→</span>
            {activating === action.id && (
              <span className="qa-spinner" aria-hidden/>
            )}
          </button>
        ))}
      </div>

      <style>{`
        .qa-section { display: flex; flex-direction: column; gap: 14px; }
        .qa-header { display: flex; align-items: center; }
        .section-title {
          font-family: 'Syne', sans-serif;
          font-size: 13px; font-weight: 700;
          letter-spacing: .08em; text-transform: uppercase;
          color: rgba(255,255,255,.5);
          display: flex; align-items: center; gap: 6px;
        }
        .title-icon { font-size: 15px; }
        .qa-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .qa-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          padding: 12px 12px 10px;
          border-radius: 10px;
          background: rgba(255,255,255,.04);
          border: 1px solid rgba(255,255,255,.07);
          cursor: pointer;
          text-align: left;
          transition: background .18s, border-color .18s, transform .15s;
          overflow: hidden;
        }
        .qa-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at top left, var(--action-color), transparent 70%);
          opacity: 0;
          transition: opacity .25s;
        }
        .qa-card:hover { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.14); }
        .qa-card:hover::before { opacity: .06; }
        .qa-card:active { transform: scale(.97); }
        .qa-card--activating { border-color: var(--action-color) !important; }
        .qa-card--activating::before { opacity: .1 !important; }
        .qa-badge {
          position: absolute; top: 8px; right: 8px;
          padding: 1px 6px; border-radius: 4px;
          background: rgba(244,143,177,.25); color: #F48FB1;
          font-size: 9px; font-weight: 700; letter-spacing: .06em;
          text-transform: uppercase; font-family: 'DM Sans', sans-serif;
        }
        .qa-icon { font-size: 20px; line-height: 1; margin-bottom: 2px; }
        .qa-label {
          font-family: 'Syne', sans-serif;
          font-size: 12px; font-weight: 600;
          color: rgba(255,255,255,.85);
        }
        .qa-desc {
          font-family: 'DM Sans', sans-serif;
          font-size: 10px; color: rgba(255,255,255,.3);
          line-height: 1.35; font-weight: 300;
        }
        .qa-arrow {
          margin-top: 4px;
          font-size: 12px; color: var(--action-color);
          opacity: 0; transform: translateX(-4px);
          transition: opacity .18s, transform .18s;
        }
        .qa-card:hover .qa-arrow { opacity: .8; transform: translateX(0); }
        .qa-spinner {
          position: absolute; top: 8px; right: 8px;
          width: 12px; height: 12px;
          border: 1.5px solid rgba(255,255,255,.15);
          border-top-color: var(--action-color);
          border-radius: 50%;
          animation: spin .6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
};

export default QuickActionsSection;
