import React, { useState, useEffect } from 'react';
import NewsSection from './sections/NewsSection';
import NotificationsSection from './sections/NotificationsSection';
import QuickActionsSection from './sections/QuickActionsSection';
import OnboardingFlow from '@/onboarding/OnboardingFlow';

const NewTabPage: React.FC = () => {
  // null = still checking storage
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          const { hasSeenOnboarding } = await chrome.storage.local.get(['hasSeenOnboarding']);
          setShowOnboarding(!hasSeenOnboarding);
        } else {
          const seen = localStorage.getItem('hasSeenOnboarding');
          setShowOnboarding(!seen);
        }
      } catch {
        setShowOnboarding(false);
      }
    };
    checkOnboarding();
  }, []);

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

  if (showOnboarding === null) return null; // loading storage check
  if (showOnboarding) return <OnboardingFlow onComplete={() => setShowOnboarding(false)} />;

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
