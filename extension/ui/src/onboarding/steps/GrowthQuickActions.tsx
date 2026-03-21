import React, { useState } from 'react';
import { SuyaExpression, SuyaMode } from '@/components/SuyaBot';
import { UserProfile } from '../OnboardingFlow';

interface GrowthQuickActionsProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
  userProfile: Partial<UserProfile>;
}

interface Action {
  id: string;
  icon: string;
  title: string;
  description: string;
  handler: string;
  botMessage: string;
  color: string;
  badges: string[];
  category: 'daily' | 'analysis' | 'learning' | 'automation';
  estimatedTime: string;
  frequency: string;
}

const BASE_ACTIONS: Action[] = [
  { id: 'briefing',   icon: '📈', title: 'Growth Briefing',      description: 'Curated news matched to your growth goals',    handler: 'growthBriefing',   botMessage: "Finding today's most valuable articles for you!",  color: '#FF9068', badges: ['personalised'],         category: 'daily',      estimatedTime: '5 min',  frequency: 'Daily' },
  { id: 'skill-gap',  icon: '🎯', title: 'Skill Gap Analysis',   description: 'Identify knowledge gaps in your domain',       handler: 'skillGapAnalysis', botMessage: "I'll analyse what you should learn next!",        color: '#4FC3F7', badges: ['data-driven'],          category: 'analysis',   estimatedTime: '10 min', frequency: 'Weekly' },
  { id: 'trending',   icon: '🔥', title: 'Trending in Your Field',description: 'Stay ahead of industry movements',            handler: 'trendingAnalysis', botMessage: "Let me show you what's moving in your domain!",   color: '#FFB74D', badges: ['real-time'],            category: 'analysis',   estimatedTime: '7 min',  frequency: 'Weekly' },
  { id: 'path',       icon: '🛤️', title: 'Growth Path',          description: 'Personalised learning roadmap',               handler: 'growthPath',       botMessage: "I'll build your growth roadmap!",                 color: '#CE93D8', badges: ['personalised','adaptive'],category: 'learning',   estimatedTime: '15 min', frequency: 'Monthly' },
  { id: 'form',       icon: '📝', title: 'Smart Form Assistant',  description: 'AI-powered form filling on any page',         handler: 'formWizard',       botMessage: "I'll help you fill forms intelligently!",          color: '#81C784', badges: ['personalised'],         category: 'automation', estimatedTime: '2 min',  frequency: 'As needed' },
  { id: 'summarise',  icon: '📄', title: 'Content Summariser',    description: 'Quick summaries of articles & documents',     handler: 'summariseContent', botMessage: "I'll summarise any content instantly!",            color: '#4FC3F7', badges: ['personalised'],         category: 'daily',      estimatedTime: '3 min',  frequency: 'As needed' },
];

const CAREER_EXTRAS: Record<string, Action[]> = {
  tech_dev: [
    { id: 'code-review', icon: '💻', title: 'Code Review',        description: 'AI analysis and improvement suggestions',    handler: 'codeReview',    botMessage: "Let me review your code!",                  color: '#81C784', badges: ['personalised'],  category: 'automation', estimatedTime: '10 min', frequency: 'As needed' },
    { id: 'tech-trends', icon: '🚀', title: 'Tech Radar',          description: 'Emerging frameworks and technologies',      handler: 'techTrends',    botMessage: "Here's what's emerging in tech!",           color: '#FF9068', badges: ['real-time'],     category: 'analysis',   estimatedTime: '8 min',  frequency: 'Weekly' },
  ],
  business_lead: [
    { id: 'market',      icon: '📊', title: 'Market Intelligence', description: 'Business intelligence and market analysis', handler: 'marketInsights',botMessage: "Gathering key market insights for you!",     color: '#4FC3F7', badges: ['data-driven'],   category: 'analysis',   estimatedTime: '12 min', frequency: 'Weekly' },
    { id: 'strategy',    icon: '♟️', title: 'Strategy Advisor',    description: 'Strategic planning and decision support',   handler: 'strategyAdvisor',botMessage: "Let's work on strategic planning!",       color: '#CE93D8', badges: ['adaptive'],      category: 'learning',   estimatedTime: '20 min', frequency: 'Monthly' },
  ],
  creative_work: [
    { id: 'inspiration', icon: '🎨', title: 'Design Inspiration',  description: 'Curated design examples and trends',       handler: 'designInspire', botMessage: "Finding inspiring design examples!",        color: '#FFB74D', badges: ['personalised'],  category: 'daily',      estimatedTime: '5 min',  frequency: 'Daily' },
    { id: 'ux-audit',    icon: '🔍', title: 'UX Auditor',          description: 'User experience analysis & recommendations',handler: 'uxAudit',       botMessage: "I'll audit UX and suggest improvements!",   color: '#FF9068', badges: ['data-driven'],   category: 'analysis',   estimatedTime: '15 min', frequency: 'As needed' },
  ],
};

const CATEGORY_META: Record<string, { icon: string; label: string; desc: string }> = {
  daily:      { icon: '☀️', label: 'Daily',      desc: 'Routines for continuous growth' },
  analysis:   { icon: '📊', label: 'Analysis',   desc: 'Deep insights and trend tracking' },
  learning:   { icon: '🎓', label: 'Learning',   desc: 'Skill development and education' },
  automation: { icon: '⚡', label: 'Automation', desc: 'Smart assistance and productivity' },
};

const BADGE_CLASS: Record<string, string> = {
  personalised: 'ob-tag--orange',
  'data-driven':'ob-tag--blue',
  'real-time':  'ob-tag--green',
  adaptive:     'ob-tag--purple',
};

const STEPS_GUIDE = [
  { n: 1, title: 'Daily Briefing',  body: 'Start with personalised news and insights every morning' },
  { n: 2, title: 'Weekly Analysis', body: 'Review trends and spot growth opportunities each week' },
  { n: 3, title: 'Monthly Planning',body: 'Update your growth path and sharpen your learning goals' },
];

const GrowthQuickActions: React.FC<GrowthQuickActionsProps> = ({
  guideStep, nextStep, completeStep, userProfile,
}) => {
  const { careerFocus, growthGoal, learningStyle, updateFrequency } = userProfile;
  const [activating, setActivating] = useState<string | null>(null);

  const extras = CAREER_EXTRAS[careerFocus as string] ?? [];
  const allActions = [...BASE_ACTIONS, ...extras];
  const byCategory = allActions.reduce<Record<string, Action[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a); return acc;
  }, {});

  const run = async (action: Action) => {
    setActivating(action.id);
    guideStep('eating', action.botMessage);
    await new Promise(r => setTimeout(r, 1200));
    guideStep('happy', `Started ${action.title.toLowerCase()} for you.`);
    setActivating(null);
  };

  const finish = () => {
    completeStep('quick-actions');
    guideStep('happy', "Your personalised growth system is live. Let's go! 🚀");
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({
        hasSeenOnboarding:   true,
        onboardingCompleted: Date.now(),
        userProfile,
        quickActionsConfig:  { enabledActions: allActions.map(a => a.id), lastUsed: Date.now() },
      });
    }
    nextStep();
  };

  return (
    <div className="qa-root ob-step-root">
      {/* Header */}
      <header className="ob-col">
        <span className="ob-step-label">✦ Your dashboard</span>
        <h2 className="ob-step-title">Growth toolkit, ready</h2>
        <p className="ob-step-sub">
          Based on your profile I've prepared actions to help you <strong>{growthGoal}</strong> in <strong>{careerFocus}</strong>.
          These are your go-to tools for daily development.
        </p>
      </header>

      {/* Profile pill row */}
      <div className="qa-profile ob-stagger">
        {[
          { icon: '🎯', label: 'Focus',     value: careerFocus   },
          { icon: '🌱', label: 'Goal',      value: growthGoal    },
          { icon: '📚', label: 'Style',     value: learningStyle },
          { icon: '⏰', label: 'Frequency', value: updateFrequency },
        ].map(p => p.value && (
          <div key={p.label} className="qa-profile-pill">
            <span>{p.icon}</span>
            <span className="qa-profile-pill__label">{p.label}:</span>
            <span className="qa-profile-pill__value">{p.value}</span>
          </div>
        ))}
      </div>

      {/* Categories */}
      {Object.entries(byCategory).map(([cat, actions]) => {
        const meta = CATEGORY_META[cat];
        return (
          <div key={cat} className="qa-category">
            <div className="qa-category__header">
              <span className="qa-category__icon">{meta.icon}</span>
              <div>
                <h3 className="qa-category__name">{meta.label}</h3>
                <p className="qa-category__desc">{meta.desc}</p>
              </div>
            </div>

            <div className="qa-grid ob-stagger">
              {actions.map(a => (
                <button
                  key={a.id}
                  className={`qa-card ob-card ${activating === a.id ? 'qa-card--active' : ''}`}
                  style={{ '--ac': a.color } as React.CSSProperties}
                  onClick={() => run(a)}
                >
                  <div className="qa-card__top">
                    <span className="qa-card__icon">{a.icon}</span>
                    <div className="qa-card__badges">
                      {a.badges.map(b => <span key={b} className={`ob-tag ${BADGE_CLASS[b] ?? 'ob-tag--orange'}`}>{b}</span>)}
                    </div>
                  </div>
                  <h4 className="qa-card__title">{a.title}</h4>
                  <p className="qa-card__desc">{a.description}</p>
                  <div className="qa-card__meta">
                    <span>⏱ {a.estimatedTime}</span>
                    <span>🔄 {a.frequency}</span>
                  </div>
                  <span className="qa-card__cta">
                    {activating === a.id ? 'Starting…' : 'Launch →'}
                  </span>
                  {activating === a.id && <span className="qa-card__spinner"/>}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* Getting started */}
      <div className="qa-guide ob-card">
        <p className="qa-guide__head">Suggested rhythm</p>
        <div className="qa-guide__steps">
          {STEPS_GUIDE.map(s => (
            <div key={s.n} className="qa-guide__step">
              <span className="qa-guide__num">{s.n}</span>
              <div>
                <p className="qa-guide__step-title">{s.title}</p>
                <p className="qa-guide__step-body">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Complete */}
      <div className="qa-complete ob-card ob-card--accent">
        <p className="qa-complete__head">🎉 You're set up!</p>
        <p className="qa-complete__sub">Your personalised growth system is ready to use.</p>
        <button className="ob-btn ob-btn--primary" onClick={finish}>
          Start Your Growth Journey →
        </button>
      </div>

      <style>{`
        .qa-root { max-width: 680px; }

        /* Profile pills */
        .qa-profile { display: flex; flex-wrap: wrap; gap: 6px; }
        .qa-profile-pill {
          display: flex; align-items: center; gap: 6px;
          padding: 5px 12px; border-radius: 20px;
          background: var(--bg-card); border: 1px solid var(--border);
          font-family: var(--font-body); font-size: 12px;
        }
        .qa-profile-pill__label { color: var(--text-muted); }
        .qa-profile-pill__value { color: var(--text-primary); font-weight: 500; text-transform: capitalize; }

        /* Category */
        .qa-category { display: flex; flex-direction: column; gap: 10px; }
        .qa-category__header { display: flex; align-items: flex-start; gap: 12px; }
        .qa-category__icon { font-size: 20px; margin-top: 1px; flex-shrink: 0; }
        .qa-category__name {
          font-family: var(--font-display); font-size: 15px; font-weight: 800;
          color: var(--text-primary); margin-bottom: 2px;
        }
        .qa-category__desc { font-family: var(--font-body); font-size: 12px; color: var(--text-muted); }

        /* Action cards */
        .qa-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
        .qa-card {
          position: relative;
          display: flex; flex-direction: column; gap: 8px;
          align-items: flex-start;
          cursor: pointer; text-align: left; overflow: hidden;
          transition: border-color .2s, transform .18s, box-shadow .2s !important;
        }
        .qa-card::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(circle at top left, var(--ac), transparent 70%);
          opacity: 0; transition: opacity .25s;
        }
        .qa-card:hover { transform: translateY(-2px); border-color: var(--border-hover) !important; }
        .qa-card:hover::before { opacity: .07; }
        .qa-card--active { border-color: var(--border-accent) !important; }
        .qa-card--active::before { opacity: .1 !important; }

        .qa-card__top { display: flex; align-items: flex-start; justify-content: space-between; width: 100%; gap: 6px; }
        .qa-card__icon { font-size: 22px; }
        .qa-card__badges { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
        .qa-card__title {
          font-family: var(--font-display); font-size: 13px; font-weight: 800;
          color: var(--text-primary);
        }
        .qa-card__desc { font-family: var(--font-body); font-size: 11px; color: var(--text-secondary); line-height: 1.45; flex: 1; }
        .qa-card__meta { display: flex; gap: 12px; font-family: var(--font-body); font-size: 10px; color: var(--text-muted); }
        .qa-card__cta {
          font-family: var(--font-display); font-size: 11px; font-weight: 700;
          color: var(--ac, var(--accent-text)); opacity: 0;
          transform: translateX(-4px);
          transition: opacity .18s, transform .18s;
        }
        .qa-card:hover .qa-card__cta { opacity: 1; transform: none; }
        .qa-card--active .qa-card__cta { opacity: 1; transform: none; }
        .qa-card__spinner {
          position: absolute; top: 10px; right: 10px;
          width: 12px; height: 12px; border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,.15);
          border-top-color: var(--ac, var(--accent));
          animation: qaSpin .6s linear infinite;
        }
        @keyframes qaSpin { to { transform: rotate(360deg); } }

        /* Getting started */
        .qa-guide { cursor: default; }
        .qa-guide__head {
          font-family: var(--font-display); font-size: 13px; font-weight: 700;
          color: var(--text-primary); margin-bottom: 14px;
        }
        .qa-guide__steps { display: flex; flex-direction: column; gap: 12px; }
        .qa-guide__step  { display: flex; align-items: flex-start; gap: 14px; }
        .qa-guide__num {
          width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
          background: rgba(255,107,53,.15); border: 1px solid var(--border-accent);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display); font-size: 13px; font-weight: 800;
          color: var(--accent-text);
        }
        .qa-guide__step-title { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }
        .qa-guide__step-body  { font-family: var(--font-body); font-size: 12px; color: var(--text-secondary); line-height: 1.5; }

        /* Complete */
        .qa-complete { display: flex; flex-direction: column; gap: 8px; cursor: default; }
        .qa-complete__head { font-family: var(--font-display); font-size: 16px; font-weight: 800; color: var(--text-primary); }
        .qa-complete__sub  { font-family: var(--font-body); font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
      `}</style>
    </div>
  );
};

export { GrowthQuickActions };
