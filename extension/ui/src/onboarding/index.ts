import React from 'react';
import ReactDOM from 'react-dom/client';
import OnboardingFlow from './OnboardingFlow';

// Check if this is the first time the extension is installed
const checkFirstInstall = async () => {
  try {
    const { hasSeenOnboarding } = await chrome.storage.local.get(['hasSeenOnboarding']);
    
    if (!hasSeenOnboarding) {
      // Show onboarding
      const container = document.createElement('div');
      container.id = 'suya-onboarding-root';
      container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999999;
        background: rgba(0, 0, 0, 0.5);
      `;
      
      document.body.appendChild(container);
      
      const root = ReactDOM.createRoot(container);
      root.render(React.createElement(OnboardingFlow));
    }
  } catch (error) {
    console.error('Failed to check onboarding status:', error);
  }
};

// Initialize onboarding if needed
checkFirstInstall();
