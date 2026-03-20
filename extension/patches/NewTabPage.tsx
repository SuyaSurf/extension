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

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">

        {step === 'welcome' && (
          <div className="ob-step">
            <div className="ob-mascot">🍢</div>
            <h1 className="ob-title">Hey, I'm Suya</h1>
            <p className="ob-body">
              Your browser assistant — I help you fill forms, read pages, manage tasks,
              and stay on top of what matters. Let's get you set up in 2 minutes.
            </p>
            <button className="ob-btn ob-btn--primary" onClick={() => setStep('news-sources')}>
              Let's go →
            </button>
          </div>
        )}

        {step === 'news-sources' && (
          <div className="ob-step">
            <h2 className="ob-title ob-title--small">What do you want to follow?</h2>
            <p className="ob-body">Pick sources for your new tab feed. You can change these later.</p>
            <div className="ob-sources">
              {NEWS_SOURCES.map(s => (
                <button
                  key={s.id}
                  className={`ob-source-pill ${selectedSources.has(s.id) ? 'ob-source-pill--selected' : ''}`}
                  onClick={() => toggleSource(s.id)}
                >
                  {s.label}
                  <span className="ob-source-cat">{s.category}</span>
                </button>
              ))}
            </div>
            <div className="ob-nav">
              <button className="ob-btn ob-btn--ghost" onClick={() => setStep('welcome')}>← Back</button>
              <button className="ob-btn ob-btn--primary" onClick={() => setStep('api-keys')}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {step === 'api-keys' && (
          <div className="ob-step">
            <h2 className="ob-title ob-title--small">Add your AI keys <span className="ob-optional">(optional)</span></h2>
            <p className="ob-body">Unlock richer summaries and smart autofill. Keys are stored locally and never sent to our servers.</p>
            <div className="ob-key-fields">
              {[
                { key: 'openai' as const,    label: 'OpenAI',    placeholder: 'sk-...' },
                { key: 'anthropic' as const, label: 'Anthropic', placeholder: 'sk-ant-...' },
                { key: 'groq' as const,      label: 'Groq',      placeholder: 'gsk_...' },
              ].map(f => (
                <div key={f.key} className="ob-field">
                  <label className="ob-label">{f.label}</label>
                  <input
                    type="password"
                    className="ob-input"
                    placeholder={f.placeholder}
                    value={apiKeys[f.key]}
                    onChange={e => setApiKeys(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="ob-nav">
              <button className="ob-btn ob-btn--ghost" onClick={() => setStep('news-sources')}>← Back</button>
              <button className="ob-btn ob-btn--primary" onClick={saveAndFinish} disabled={saving}>
                {saving ? 'Saving…' : 'Finish setup ✓'}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .onboarding-overlay {
          position: fixed; inset: 0;
          background: rgba(13,15,20,.92);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999;
          backdrop-filter: blur(12px);
        }
        .onboarding-card {
          background: #161920;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 20px;
          padding: 40px;
          width: 480px;
          max-width: calc(100vw - 40px);
          box-shadow: 0 40px 80px rgba(0,0,0,.5);
        }
        .ob-step { display: flex; flex-direction: column; gap: 20px; }
        .ob-mascot { font-size: 52px; text-align: center; }
        .ob-title {
          font-family: 'Syne', sans-serif;
          font-size: 28px; font-weight: 800;
          color: #fff; text-align: center;
          line-height: 1.1;
        }
        .ob-title--small { font-size: 20px; text-align: left; }
        .ob-optional {
          font-size: 13px; font-weight: 400;
          color: rgba(255,255,255,.3); font-family: 'DM Sans', sans-serif;
        }
        .ob-body {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px; color: rgba(255,255,255,.5);
          line-height: 1.65; text-align: center;
        }
        .ob-step:has(.ob-title--small) .ob-body { text-align: left; }
        .ob-sources { display: flex; flex-wrap: wrap; gap: 8px; }
        .ob-source-pill {
          display: flex; flex-direction: column; align-items: flex-start;
          gap: 2px; padding: 8px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.04);
          cursor: pointer; transition: all .18s;
          font-family: 'DM Sans', sans-serif;
        }
        .ob-source-pill span:first-of-type {
          font-size: 13px; font-weight: 500;
          color: rgba(255,255,255,.75);
        }
        .ob-source-cat {
          font-size: 9px; letter-spacing: .06em;
          text-transform: uppercase; color: rgba(255,255,255,.25);
        }
        .ob-source-pill:hover { border-color: rgba(255,255,255,.25); background: rgba(255,255,255,.08); }
        .ob-source-pill--selected {
          border-color: rgba(255,107,53,.5) !important;
          background: rgba(255,107,53,.12) !important;
        }
        .ob-source-pill--selected span:first-of-type { color: #FF9068; }
        .ob-key-fields { display: flex; flex-direction: column; gap: 12px; }
        .ob-field { display: flex; flex-direction: column; gap: 5px; }
        .ob-label {
          font-family: 'DM Sans', sans-serif;
          font-size: 12px; font-weight: 500;
          color: rgba(255,255,255,.4); letter-spacing: .04em;
        }
        .ob-input {
          background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px; padding: 9px 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px; color: rgba(255,255,255,.8);
          outline: none; transition: border-color .18s;
          width: 100%;
        }
        .ob-input::placeholder { color: rgba(255,255,255,.2); }
        .ob-input:focus { border-color: rgba(255,107,53,.4); }
        .ob-nav { display: flex; justify-content: space-between; align-items: center; }
        .ob-btn {
          padding: 10px 22px; border-radius: 10px;
          font-family: 'Syne', sans-serif;
          font-size: 13px; font-weight: 700;
          cursor: pointer; transition: all .18s;
          border: none;
        }
        .ob-btn--primary {
          background: linear-gradient(135deg, #FF6B35, #FF3D00);
          color: #fff;
          box-shadow: 0 4px 16px rgba(255,107,53,.35);
        }
        .ob-btn--primary:hover { box-shadow: 0 6px 22px rgba(255,107,53,.55); transform: translateY(-1px); }
        .ob-btn--primary:disabled { opacity: .6; cursor: default; transform: none; }
        .ob-btn--ghost {
          background: none; color: rgba(255,255,255,.4);
          border: 1px solid rgba(255,255,255,.1);
        }
        .ob-btn--ghost:hover { color: rgba(255,255,255,.75); border-color: rgba(255,255,255,.25); }
      `}</style>
    </div>
  );
};

/* ── Greeting helper ──────────────────────────────────────────────── */
function getGreeting(name?: string): { greeting: string; sub: string } {
  const h = new Date().getHours();
  const suffix = name ? `, ${name}` : '';
  if (h < 5)  return { greeting: `Still up${suffix}?`,       sub: 'Burning the midnight oil.' };
  if (h < 12) return { greeting: `Good morning${suffix}`,    sub: 'Here\'s what\'s happening.' };
  if (h < 17) return { greeting: `Good afternoon${suffix}`,  sub: 'Pick up where you left off.' };
  if (h < 21) return { greeting: `Good evening${suffix}`,    sub: 'Winding down?' };
  return         { greeting: `Good night${suffix}`,          sub: 'Almost done for the day.' };
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

/* ── NewTabPage ───────────────────────────────────────────────────── */
const NewTabPage: React.FC = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userName, setUserName]             = useState<string | undefined>();
  const [loaded, setLoaded]                 = useState(false);
  const [time, setTime]                     = useState(new Date());

  // Tick clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load settings / check onboarding
  useEffect(() => {
    const loadSettings = async () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.get(
          ['hasSeenOnboarding', 'userName'],
          ({ hasSeenOnboarding, userName }) => {
            setShowOnboarding(!hasSeenOnboarding);
            setUserName(userName);
            setLoaded(true);
          },
        );
      } else {
        // Dev environment
        setLoaded(true);
      }
    };
    loadSettings();
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const { greeting, sub } = getGreeting(userName);
  const clockStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (!loaded) return null;

  return (
    <div className="nt-root">
      {showOnboarding && <OnboardingFlow onComplete={handleOnboardingComplete}/>}

      {/* Background atmosphere */}
      <div className="nt-bg" aria-hidden>
        <div className="nt-glow nt-glow--1"/>
        <div className="nt-glow nt-glow--2"/>
        <div className="nt-grid"/>
      </div>

      {/* Top bar */}
      <header className="nt-topbar">
        <div className="nt-logo">
          <span className="nt-logo-icon">🍢</span>
          <span className="nt-logo-text">Suya</span>
        </div>
        <div className="nt-clock">{clockStr}</div>
        <nav className="nt-nav">
          <button className="nt-nav-btn" onClick={() => chrome?.tabs?.create?.({ url: 'settings/settings.html' })}>
            Settings
          </button>
        </nav>
      </header>

      {/* Hero greeting */}
      <section className="nt-hero">
        <p className="nt-date">{formatDate()}</p>
        <h1 className="nt-greeting">{greeting}</h1>
        <p className="nt-sub">{sub}</p>
      </section>

      {/* Main content */}
      <main className="nt-main">
        {/* Left column */}
        <div className="nt-col nt-col--left">
          <QuickActionsSection/>
          <NotificationsSection/>
        </div>

        {/* Right column */}
        <div className="nt-col nt-col--right">
          <NewsSection/>
        </div>
      </main>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

        .nt-root {
          position: relative;
          min-height: 100vh; width: 100%;
          background: #0D0F14;
          color: rgba(255,255,255,.9);
          overflow-x: hidden;
          font-family: 'DM Sans', sans-serif;
        }

        /* Background */
        .nt-bg {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
        }
        .nt-glow {
          position: absolute; border-radius: 50%;
          filter: blur(120px); pointer-events: none;
        }
        .nt-glow--1 {
          width: 600px; height: 400px;
          top: -120px; left: -80px;
          background: radial-gradient(ellipse, rgba(255,107,53,.08) 0%, transparent 70%);
        }
        .nt-glow--2 {
          width: 500px; height: 500px;
          bottom: -100px; right: -60px;
          background: radial-gradient(ellipse, rgba(79,195,247,.06) 0%, transparent 70%);
        }
        .nt-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 100%);
        }

        /* Topbar */
        .nt-topbar {
          position: relative; z-index: 10;
          display: flex; align-items: center;
          padding: 20px 40px;
          border-bottom: 1px solid rgba(255,255,255,.05);
        }
        .nt-logo {
          display: flex; align-items: center; gap: 8px;
          font-family: 'Syne', sans-serif; font-weight: 800;
          font-size: 17px; color: rgba(255,255,255,.9);
        }
        .nt-logo-icon { font-size: 20px; }
        .nt-clock {
          margin: 0 auto;
          font-family: 'Syne', sans-serif;
          font-size: 15px; font-weight: 600;
          color: rgba(255,255,255,.25);
          letter-spacing: .06em;
        }
        .nt-nav { display: flex; gap: 8px; }
        .nt-nav-btn {
          background: none; border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px; padding: 6px 14px;
          font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 500;
          color: rgba(255,255,255,.45); cursor: pointer; transition: all .18s;
        }
        .nt-nav-btn:hover { border-color: rgba(255,255,255,.25); color: rgba(255,255,255,.8); }

        /* Hero */
        .nt-hero {
          position: relative; z-index: 10;
          padding: 52px 40px 36px;
          max-width: 680px;
        }
        .nt-date {
          font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
          color: rgba(255,255,255,.22); margin-bottom: 10px;
          font-weight: 500;
        }
        .nt-greeting {
          font-family: 'Syne', sans-serif;
          font-size: clamp(32px, 4vw, 52px);
          font-weight: 800; line-height: 1.05;
          color: #fff;
          background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,.65) 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .nt-sub {
          margin-top: 10px; font-size: 16px;
          color: rgba(255,255,255,.35); font-weight: 300;
        }

        /* Main layout */
        .nt-main {
          position: relative; z-index: 10;
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 24px;
          padding: 0 40px 60px;
          max-width: 1320px;
        }
        .nt-col { display: flex; flex-direction: column; gap: 32px; }

        @media (max-width: 900px) {
          .nt-main { grid-template-columns: 1fr; }
          .nt-topbar, .nt-hero, .nt-main { padding-left: 20px; padding-right: 20px; }
        }
      `}</style>
    </div>
  );
};

export default NewTabPage;
