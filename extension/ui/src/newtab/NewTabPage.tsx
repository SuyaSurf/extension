import React, { useState, useEffect, useCallback } from 'react';
import NewsSection from './sections/NewsSection';
import NotificationsSection from './sections/NotificationsSection';
import QuickActionsSection from './sections/QuickActionsSection';

/* ── Onboarding steps ─────────────────────────────────────────────── */
type OnboardingStep = 'welcome' | 'news-sources' | 'api-keys' | 'complete';

const NEWS_SOURCES = [
  { id: 'techcrunch', label: 'TechCrunch',    category: 'tech'     },
  { id: 'hn',         label: 'Hacker News',   category: 'tech'     },
  { id: 'mit',        label: 'MIT Tech Rev',  category: 'ai'       },
  { id: 'uх',         label: 'UX Collective', category: 'design'   },
  { id: 'frc',        label: 'First Round',   category: 'business' },
  { id: 'nature',     label: 'Nature',        category: 'science'  },
  { id: 'verge',      label: 'The Verge',     category: 'tech'     },
  { id: 'guardian',   label: 'The Guardian',  category: 'world'    },
];

interface OnboardingFlowProps {
  onComplete: () => void;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [step, setStep]               = useState<OnboardingStep>('welcome');
  const [selectedSources, setSources] = useState<Set<string>>(new Set());
  const [apiKeys, setApiKeys]         = useState({ openai: '', anthropic: '', groq: '' });
  const [saving, setSaving]           = useState(false);

  const toggleSource = (id: string) =>
    setSources(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const saveAndFinish = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({
        hasSeenOnboarding: true,
        newsSources: [...selectedSources],
        apiKeys,
      });
    }
    setSaving(false);
    onComplete();
  };

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <div className="onboarding-step">
            <h2>Welcome to Suya! 🤖</h2>
            <p>Your AI assistant is ready to help you grow and stay productive.</p>
            <p>Let's set up your personalized experience.</p>
            <button onClick={() => setStep('news-sources')}>Get Started</button>
          </div>
        );

      case 'news-sources':
        return (
          <div className="onboarding-step">
            <h2>Choose Your News Sources</h2>
            <p>Select the sources you'd like to see in your daily briefing.</p>
            <div className="sources-grid">
              {NEWS_SOURCES.map(src => (
                <label key={src.id} className="source-item">
                  <input
                    type="checkbox"
                    checked={selectedSources.has(src.id)}
                    onChange={() => toggleSource(src.id)}
                  />
                  <span>{src.label}</span>
                  <small>{src.category}</small>
                </label>
              ))}
            </div>
            <div className="step-actions">
              <button onClick={() => setStep('welcome')}>Back</button>
              <button onClick={() => setStep('api-keys')}>Next</button>
            </div>
          </div>
        );

      case 'api-keys':
        return (
          <div className="onboarding-step">
            <h2>API Keys (Optional)</h2>
            <p>Add your API keys for enhanced AI capabilities.</p>
            <div className="api-keys-form">
              <div className="field">
                <label>OpenAI API Key</label>
                <input
                  type="password"
                  value={apiKeys.openai}
                  onChange={e => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                  placeholder="sk-..."
                />
              </div>
              <div className="field">
                <label>Anthropic API Key</label>
                <input
                  type="password"
                  value={apiKeys.anthropic}
                  onChange={e => setApiKeys(prev => ({ ...prev, anthropic: e.target.value }))}
                  placeholder="sk-ant-..."
                />
              </div>
              <div className="field">
                <label>Groq API Key</label>
                <input
                  type="password"
                  value={apiKeys.groq}
                  onChange={e => setApiKeys(prev => ({ ...prev, groq: e.target.value }))}
                  placeholder="gsk_..."
                />
              </div>
            </div>
            <div className="step-actions">
              <button onClick={() => setStep('news-sources')}>Back</button>
              <button onClick={saveAndFinish} disabled={saving}>
                {saving ? 'Saving...' : 'Complete Setup'}
              </button>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="onboarding-step">
            <h2>🎉 All Set!</h2>
            <p>Your Suya assistant is ready to help you grow.</p>
            <p>Open a new tab to see your personalized dashboard.</p>
            <button onClick={onComplete}>Start Using Suya</button>
          </div>
        );
    }
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-content">
        <div className="onboarding-header">
          <h1>Suya</h1>
          <div className="progress-dots">
            {(['welcome', 'news-sources', 'api-keys', 'complete'] as OnboardingStep[]).map((s, i) => (
              <div
                key={s}
                className={`dot ${step === s ? 'active' : step === 'complete' ? 'done' : ''}`}
              />
            ))}
          </div>
        </div>
        {renderStep()}
      </div>
      <style>{`
        .onboarding-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .onboarding-content {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 40px;
          max-width: 500px;
          width: 90%;
        }
        .onboarding-header {
          text-align: center;
          margin-bottom: 30px;
        }
        .onboarding-header h1 {
          font-size: 48px;
          margin: 0;
          background: linear-gradient(45deg, #FFD700, #FFA500);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .progress-dots {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-top: 20px;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
        }
        .dot.active {
          background: white;
        }
        .dot.done {
          background: #4CAF50;
        }
        .onboarding-step {
          text-align: center;
        }
        .onboarding-step h2 {
          margin: 0 0 20px;
          font-size: 28px;
        }
        .onboarding-step p {
          margin: 0 0 30px;
          opacity: 0.9;
          line-height: 1.6;
        }
        .sources-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin: 30px 0;
        }
        .source-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 15px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .source-item:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .source-item span {
          flex: 1;
          font-weight: 500;
        }
        .source-item small {
          opacity: 0.7;
          font-size: 12px;
        }
        .api-keys-form {
          text-align: left;
          margin: 30px 0;
        }
        .field {
          margin-bottom: 20px;
        }
        .field label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
        }
        .field input {
          width: 100%;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 14px;
        }
        .field input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }
        .step-actions {
          display: flex;
          justify-content: space-between;
          margin-top: 30px;
        }
        button {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        button:not(:disabled) {
          background: linear-gradient(45deg, #FFD700, #FFA500);
          color: #333;
        }
        button:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

const NewTabPage: React.FC = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="newtab-container">
      <header className="newtab-header">
        <div className="greeting">
          <h1>
            {formatTime(currentTime)}
            <span className="date">{formatDate(currentTime)}</span>
          </h1>
          <p>Welcome back! Here's what's happening today.</p>
        </div>
        <button 
          className="settings-btn"
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') })}
        >
          ⚙️ Settings
        </button>
      </header>

      <main className="newtab-main">
        <div className="dashboard-grid">
          <NewsSection />
          <NotificationsSection />
          <QuickActionsSection />
        </div>
      </main>

      <style>{`
        .newtab-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .newtab-header {
          padding: 40px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .greeting h1 {
          margin: 0;
          font-size: 48px;
          font-weight: 700;
          line-height: 1.1;
        }
        .date {
          display: block;
          font-size: 18px;
          opacity: 0.8;
          font-weight: 400;
        }
        .greeting p {
          margin: 10px 0 0;
          font-size: 18px;
          opacity: 0.9;
        }
        .settings-btn {
          padding: 10px 20px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }
        .settings-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .newtab-main {
          padding: 0 40px 40px;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 30px;
          max-width: 1200px;
          margin: 0 auto;
        }
        @media (min-width: 1024px) {
          .dashboard-grid {
            grid-template-columns: 2fr 1fr;
          }
          .dashboard-grid > :last-child {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </div>
  );
};

export default NewTabPage;
