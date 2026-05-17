import React from 'react';
import ReactDOM from 'react-dom/client';

const NewTabPage = React.lazy(() => import('./NewTabPage'));
const OnboardingFlow = React.lazy(() => import('../onboarding/OnboardingFlow'));

// Check if user has seen onboarding
const checkOnboardingStatus = async () => {
  const [syncResult, localResult] = await Promise.all([
    chrome.storage.sync.get(['hasSeenOnboarding']).catch((): Record<string, unknown> => ({})),
    chrome.storage.local.get(['hasSeenOnboarding']).catch((): Record<string, unknown> => ({}))
  ]);

  return Boolean(syncResult.hasSeenOnboarding || localResult.hasSeenOnboarding);
};

const App: React.FC = () => {
  const [hasSeenOnboarding, setHasSeenOnboarding] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    checkOnboardingStatus()
      .then(setHasSeenOnboarding)
      .catch(() => setHasSeenOnboarding(false));
  }, []);

  if (hasSeenOnboarding === null) {
    return <div className="loading">Loading Suya...</div>;
  }

  return (
    <React.Suspense fallback={<div className="loading">Loading Suya...</div>}>
      {hasSeenOnboarding ? (
        <NewTabPage />
      ) : (
        <OnboardingFlow onComplete={() => setHasSeenOnboarding(true)} />
      )}
    </React.Suspense>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
