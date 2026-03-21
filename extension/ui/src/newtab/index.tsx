import React from 'react';
import ReactDOM from 'react-dom/client';
import NewTabPage from './NewTabPage';
import OnboardingFlow from '../onboarding/OnboardingFlow';

// Check if user has seen onboarding
const checkOnboardingStatus = async () => {
  const result = await chrome.storage.sync.get(['hasSeenOnboarding']);
  return result.hasSeenOnboarding || false;
};

// Main render logic
const renderApp = async () => {
  const hasSeenOnboarding = await checkOnboardingStatus();
  
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  
  if (!hasSeenOnboarding) {
    // Render onboarding flow
    root.render(<OnboardingFlow />);
  } else {
    // Render the new tab page
    root.render(<NewTabPage />);
  }
};

renderApp().catch(console.error);
