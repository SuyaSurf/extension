import React, { useState } from 'react';
import { SuyaExpression, SuyaMode } from '@/components/SuyaBot';

interface WelcomeStepProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
}

const EXPRESSIONS: Array<{ name: SuyaExpression; icon: string; description: string; usage: string }> = [
  { name: 'happy',        icon: '😊', description: 'Joyful & engaged',      usage: 'Success, completion, wins'        },
  { name: 'thinking',     icon: '🤔', description: 'Light processing',       usage: 'Analysis, planning'               },
  { name: 'thinking_hard',icon: '🧠', description: 'Deep concentration',     usage: 'Complex problem-solving'          },
  { name: 'listening',    icon: '👂', description: 'Fully attentive',        usage: 'Voice input, requests'            },
  { name: 'eating',       icon: '🍢', description: 'Processing information', usage: 'Working, analysing, learning'     },
  { name: 'shocked',      icon: '😲', description: 'Surprised or concerned', usage: 'Errors, warnings, unexpected'     },
  { name: 'neutral',      icon: '😐', description: 'Default state',          usage: 'Waiting, ready to help'           },
];

const MODES: Array<{ name: SuyaMode; icon: string; description: string; usage: string }> = [
  { name: 'awake',    icon: '⚡', description: 'Active & ready',   usage: 'During interactions'     },
  { name: 'idle',     icon: '🌊', description: 'Resting, available', usage: 'Default state'         },
  { name: 'sleeping', icon: '🌙', description: 'Powered down',     usage: 'Rest mode'               },
  { name: 'offline',  icon: '📵', description: 'Disconnected',     usage: 'No connection'           },
  { name: 'bored',    icon: '😑', description: 'Waiting too long', usage: 'Extended idle'           },
];

const FEATURES = [
  { icon: '🧠', title: 'Smart Personalisation',  body: 'Learns from your interests to curate growth content' },
  { icon: '📰', title: 'Growth-Focused News',     body: 'Articles selected for your professional development' },
  { icon: '🤖', title: 'Intelligent Assistance',  body: 'Form filling, research, automation with personality' },
];

const WelcomeStep: React.FC<WelcomeStepProps> = ({ guideStep, nextStep, completeStep }) => {
  const [phase, setPhase]       = useState<'intro' | 'expressions'>('intro');
  const [activeExpr, setExpr]   = useState<SuyaExpression>('happy');

  const triggerExpression = (name: SuyaExpression) => {
    setExpr(name);
    guideStep(name, `This is my ${name} expression!`);
  };

  const startDemo = () => {
    setPhase('expressions');
    guideStep('happy', "Let me show you all my expressions and what they mean!");
  };

  const finish = () => {
    completeStep('welcome');
    guideStep('happy', "Great! Let's discover your interests to personalise your experience.");
    nextStep();
  };

  return (
    <div className="ws-root ob-step-root">
      {phase === 'intro' ? (
        <>
          <header className="ob-col">
            <span className="ob-step-label">✦ Getting started</span>
            <h1 className="ob-step-title">Welcome to<br/>Suya Bot!</h1>
            <p className="ob-step-sub">
              I'm your AI companion that helps you grow by curating personalised content
              and assisting with your daily tasks. Let me show you what I can do.
            </p>
          </header>

          <div className="ws-features ob-stagger">
            {FEATURES.map(f => (
              <div key={f.title} className="ws-feature ob-card">
                <div className="ws-feature__icon">{f.icon}</div>
                <div className="ws-feature__body">
                  <h3 className="ws-feature__title">{f.title}</h3>
                  <p className="ws-feature__desc">{f.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="ob-row">
            <button className="ob-btn ob-btn--primary" onClick={startDemo}>
              Meet Suya's Personality →
            </button>
          </div>
        </>
      ) : (
        <>
          <header className="ob-col">
            <span className="ob-step-label">✦ Expressions & modes</span>
            <h2 className="ob-step-title">How I communicate</h2>
            <p className="ob-step-sub">
              I use expressions and modes to tell you exactly what I'm doing.
              Click any card to see it in action.
            </p>
          </header>

          {/* Expressions */}
          <div className="ws-section">
            <p className="ws-section__label">Expressions</p>
            <div className="ws-expr-grid ob-stagger">
              {EXPRESSIONS.map(e => (
                <button
                  key={e.name}
                  className={`ws-expr-card ${activeExpr === e.name ? 'ws-expr-card--active' : ''}`}
                  onClick={() => triggerExpression(e.name)}
                >
                  <span className="ws-expr-card__icon">{e.icon}</span>
                  <div className="ws-expr-card__info">
                    <span className="ws-expr-card__name">{e.name}</span>
                    <span className="ws-expr-card__desc">{e.description}</span>
                    <span className="ws-expr-card__usage">{e.usage}</span>
                  </div>
                  {activeExpr === e.name && <span className="ws-active-dot"/>}
                </button>
              ))}
            </div>
          </div>

          {/* Modes */}
          <div className="ws-section">
            <p className="ws-section__label">Modes</p>
            <div className="ws-modes-row ob-stagger">
              {MODES.map(m => (
                <button
                  key={m.name}
                  className="ws-mode-chip"
                  onClick={() => guideStep('happy', `${m.name} mode: ${m.description}`)}
                >
                  <span className="ws-mode-chip__icon">{m.icon}</span>
                  <span className="ws-mode-chip__name">{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ob-row">
            <button className="ob-btn ob-btn--primary" onClick={finish}>
              Continue to Personalisation →
            </button>
            <button className="ob-btn ob-btn--ghost" onClick={() => setPhase('intro')}>
              ← Back
            </button>
          </div>
        </>
      )}

      <style>{`
        .ws-root { max-width: 640px; }

        /* Features */
        .ws-features { display: flex; flex-direction: column; gap: 8px; }
        .ws-feature {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 16px 18px; cursor: default;
        }
        .ws-feature__icon { font-size: 22px; flex-shrink: 0; margin-top: 1px; }
        .ws-feature__title {
          font-family: var(--font-display); font-size: 14px; font-weight: 700;
          color: var(--text-primary); margin-bottom: 3px;
        }
        .ws-feature__desc {
          font-family: var(--font-body); font-size: 12px;
          color: var(--text-secondary); line-height: 1.5;
        }

        /* Section label */
        .ws-section { display: flex; flex-direction: column; gap: 10px; }
        .ws-section__label {
          font-family: var(--font-display); font-size: 10px; font-weight: 700;
          letter-spacing: .1em; text-transform: uppercase;
          color: var(--text-muted);
        }

        /* Expression cards */
        .ws-expr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 6px;
        }
        .ws-expr-card {
          position: relative;
          display: flex; align-items: center; gap: 12px;
          padding: 11px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          cursor: pointer; text-align: left;
          transition: background .18s, border-color .18s, transform .15s;
        }
        .ws-expr-card:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-hover);
          transform: translateY(-1px);
        }
        .ws-expr-card--active {
          border-color: var(--border-accent) !important;
          background: rgba(255,107,53,.06) !important;
        }
        .ws-expr-card__icon { font-size: 20px; flex-shrink: 0; }
        .ws-expr-card__info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .ws-expr-card__name {
          font-family: var(--font-display); font-size: 12px; font-weight: 700;
          color: var(--text-primary); text-transform: capitalize;
        }
        .ws-expr-card__desc {
          font-family: var(--font-body); font-size: 11px; color: var(--text-secondary);
        }
        .ws-expr-card__usage {
          font-family: var(--font-body); font-size: 10px; color: var(--text-muted);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ws-active-dot {
          position: absolute; top: 9px; right: 10px;
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 6px var(--accent);
        }

        /* Mode chips */
        .ws-modes-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .ws-mode-chip {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 20px; cursor: pointer;
          transition: all .18s;
        }
        .ws-mode-chip:hover {
          border-color: var(--border-accent);
          background: rgba(255,107,53,.06);
        }
        .ws-mode-chip__icon { font-size: 15px; }
        .ws-mode-chip__name {
          font-family: var(--font-display); font-size: 12px; font-weight: 700;
          text-transform: capitalize; color: var(--text-secondary);
        }
        .ws-mode-chip:hover .ws-mode-chip__name { color: var(--accent-text); }
      `}</style>
    </div>
  );
};

export { WelcomeStep };
