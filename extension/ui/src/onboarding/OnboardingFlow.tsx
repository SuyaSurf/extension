export interface ApiKeyStatus {
  connected: boolean;
  lastUpdated?: number;
  hasTested?: boolean;
}

import React, { useState, useEffect } from 'react';
import './OnboardingFlow.css';
import './steps/onboarding.css';
import SuyaBot, { SuyaMode, SuyaExpression } from '@/components/SuyaBot';
import { WelcomeStep } from './steps/WelcomeStep';
import { HistoryAnalysisStep } from './steps/HistoryAnalysisStep';
import { SmartQuestioningStep } from './steps/SmartQuestioningStep';
import { PersonalizedNewsSetup } from './steps/PersonalizedNewsSetup';
import { GrowthNewsDemo } from './steps/GrowthNewsDemo';
import { GrowthQuickActions } from './steps/GrowthQuickActions';
import { ApiKeySetupStep } from './steps/ApiKeySetupStep';

// Error Boundary Component
class OnboardingErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Onboarding Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="onboarding-error">
          <h3>Something went wrong</h3>
          <p>Please refresh the page and try again.</p>
          <button onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export interface UserProfile {
  // From history analysis
  interests: Record<string, InterestData[]>;
  patterns: BrowsingPatterns;
  
  // From questioning
  careerFocus: string;
  growthGoal: 'deepen' | 'expand' | 'explore';
  learningStyle: string;
  
  // Generated recommendations
  recommendedSources: NewsSource[];
  growthAreas: GrowthArea[];
  
  // Preferences
  contentTypes: string[];
  updateFrequency: string;
}

export interface InterestData {
  url: string;
  title: string;
  visitCount: number;
  lastVisitTime: number;
  category: string;
}

export interface BrowsingPatterns {
  mostVisitedDomains: string[];
  peakActivityHours: number[];
  contentPreferences: string[];
  sessionDuration: number;
}

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  category: string;
  primaryDomain: string;
  adjacentDomain?: string;
  growthReason: string;
  priority: number;
  type: 'rss' | 'api' | 'web';
}

export interface GrowthArea {
  domain: string;
  type: 'deepen' | 'expand' | 'explore';
  sources: NewsSource[];
  currentLevel: number;
  targetLevel: number;
  estimatedTime: string;
}

export interface OnboardingState {
  currentStep: number;
  completedSteps: string[];
  userProfile: Partial<UserProfile>;
  apiKeys: Record<string, ApiKeyStatus>;
  setupConfig: {
    notifications: NotificationConfig[];
    news: NewsConfig[];
    forms: FormProfile;
  };
  preferences: {
    showQuickActions: boolean;
    enableDemos: boolean;
    historyAnalysisEnabled: boolean;
  };
}

export interface NotificationConfig {
  name: string;
  enabled: boolean;
  icon: string;
  connected: boolean;
}

export interface NewsConfig {
  category: string;
  sources: string[];
  enabled: boolean;
}

export interface FormProfile {
  personal: Record<string, any>;
  professional: Record<string, any>;
  preferences: Record<string, any>;
}

interface PersistedSettings {
  newsSources: string[];
  newsUpdateFrequencyMinutes: number;
  notificationsEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  apiKeys: { openai: string; anthropic: string; deepseek: string; groq: string };
}

const OnboardingFlow: React.FC = () => {
  const [botState, setBotState] = useState({
    expression: 'happy' as SuyaExpression,
    mode: 'awake' as SuyaMode,
    message: 'Welcome! Let me help you set up your personalized growth experience.'
  });
  const [isCompleting, setIsCompleting] = useState(false);
  
  const [onboardingState, setOnboardingState] = useState<OnboardingState>({
    currentStep: 0,
    completedSteps: [],
    userProfile: {},
    apiKeys: {},
    setupConfig: {
      notifications: [],
      news: [],
      forms: { personal: {}, professional: {}, preferences: {} }
    },
    preferences: {
      showQuickActions: true,
      enableDemos: true,
      historyAnalysisEnabled: false
    }
  });

  const guideStep = async (expression: SuyaExpression, message: string, mode: SuyaMode = 'awake') => {
    setBotState({ expression, mode, message });
  };

  const completeStep = (stepName: string) => {
    if (!stepName) {
      return;
    }

    setOnboardingState(prev => {
      if (prev.completedSteps.includes(stepName)) {
        return prev;
      }

      return {
        ...prev,
        completedSteps: [...prev.completedSteps, stepName]
      };
    });
  };

  const nextStep = () => {
    setOnboardingState(prev => {
      const activeStepId = steps[prev.currentStep]?.id;
      const completedSteps = activeStepId && !prev.completedSteps.includes(activeStepId)
        ? [...prev.completedSteps, activeStepId]
        : prev.completedSteps;

      const nextIndex = Math.min(prev.currentStep + 1, steps.length - 1);

      if (nextIndex === prev.currentStep) {
        return { ...prev, completedSteps };
      }

      return {
        ...prev,
        completedSteps,
        currentStep: nextIndex
      };
    });
  };

  const previousStep = () => {
    setOnboardingState(prev => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 0)
    }));
  };

  const updateUserProfile = (updates: Partial<UserProfile>) => {
    setOnboardingState(prev => ({
      ...prev,
      userProfile: { ...prev.userProfile, ...updates }
    }));
  };

  const updateApiKeyStatus = (providerId: string, status: ApiKeyStatus) => {
    setOnboardingState(prev => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [providerId]: {
          ...prev.apiKeys[providerId],
          ...status
        }
      }
    }));
  };

  const buildPersistedSettings = (): PersistedSettings => {
    const recommendedSources = onboardingState.userProfile.recommendedSources ?? [];
    const selectedSourceIds = recommendedSources
      .map(source => source.id)
      .filter(Boolean);

    return {
      newsSources: selectedSourceIds,
      newsUpdateFrequencyMinutes: onboardingState.userProfile.updateFrequency === 'daily' ? 1440 : 30,
      notificationsEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      apiKeys: {
        openai: onboardingState.apiKeys.openai?.connected ? 'configured' : '',
        anthropic: onboardingState.apiKeys.anthropic?.connected ? 'configured' : '',
        deepseek: onboardingState.apiKeys.deepseek?.connected ? 'configured' : '',
        groq: onboardingState.apiKeys.groq?.connected ? 'configured' : '',
      }
    };
  };

  const completeSetup = () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 
          hasSeenOnboarding: true,
          onboardingCompleted: Date.now(),
          userProfile: onboardingState.userProfile
        });
      } else {
        // Fallback for development/testing
        localStorage.setItem('hasSeenOnboarding', 'true');
        localStorage.setItem('onboardingCompleted', Date.now().toString());
        localStorage.setItem('userProfile', JSON.stringify(onboardingState.userProfile));
      }
    } catch (error) {
      console.error('Failed to save onboarding data:', error);
    }
  };

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to Suya Bot',
      subtitle: 'Let me introduce my moods and how to read my expressions before we start.',
      component: WelcomeStep,
      props: { guideStep, nextStep, completeStep, updateUserProfile: () => {}, onboardingState, userProfile: {} }
    },
    {
      id: 'history-analysis',
      title: 'Discover Your Interests',
      subtitle: 'I can scan your recent browsing to learn what fuels your growth—totally optional.',
      component: HistoryAnalysisStep,
      props: { 
        guideStep, 
        nextStep, 
        completeStep, 
        updateUserProfile,
        onboardingState 
      }
    },
    {
      id: 'smart-questioning',
      title: 'Personalize Your Growth',
      subtitle: 'Answer a few soulful prompts so I can tailor every insight to your goals.',
      component: SmartQuestioningStep,
      props: { 
        guideStep, 
        nextStep, 
        completeStep, 
        updateUserProfile,
        userProfile: onboardingState.userProfile 
      }
    },
    {
      id: 'api-keys',
      title: 'Secure AI API Keys',
      subtitle: 'Connect your ChatGPT, Anthropic, DeepSeek, and Groq keys so I can orchestrate them safely.',
      component: ApiKeySetupStep,
      props: {
        guideStep,
        nextStep,
        completeStep,
        apiKeyStatus: onboardingState.apiKeys,
        updateApiKeyStatus
      }
    },
    {
      id: 'news-setup',
      title: 'Set Up Your News Sources',
      subtitle: 'Here are the sources I curated—pick the ones that feel most nourishing.',
      component: PersonalizedNewsSetup,
    },
    {
      id: 'growth-demo',
      title: 'See Your Personalized News',
      subtitle: 'Let me show you how your growth briefing looks when I assemble it.',
      component: GrowthNewsDemo
    },
    {
      id: 'quick-actions',
      title: 'Your Growth Dashboard',
      subtitle: 'Choose the rituals and automations you want me to keep running for you.',
      component: GrowthQuickActions
    }
  ];

  const currentStepData = steps[onboardingState.currentStep];
  if (!currentStepData) {
    return null;
  }

  const totalSteps = steps.length;
  const isCurrentStepComplete = onboardingState.completedSteps.includes(currentStepData.id);
  const completionProgress = (onboardingState.completedSteps.length / totalSteps) * 100;
  const positionProgress = ((onboardingState.currentStep + (isCurrentStepComplete ? 1 : 0)) / totalSteps) * 100;
  const progress = Math.min(Math.max(completionProgress, positionProgress), 100);
  const displayedStep = Math.min(onboardingState.currentStep + 1, totalSteps);
  const anchorY = typeof window !== 'undefined' ? window.innerHeight / 2 - 80 : 240;

  const persistOnboarding = async (payload: Record<string, unknown>) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set(payload);
      if (chrome.storage?.sync) {
        await chrome.storage.sync.set(payload);
      }
    } else {
      localStorage.setItem('onboardingFlowState', JSON.stringify(payload));
      Object.entries(payload).forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value));
      });
    }
  };

  const handleCompleteSetup = async () => {
    if (isCompleting) {
      return;
    }

    setIsCompleting(true);
    try {
      const settings = buildPersistedSettings();

      await persistOnboarding({
        hasSeenOnboarding: true,
        onboardingCompleted: Date.now(),
        userProfile: onboardingState.userProfile,
        settings,
        suyaSettings: settings
      });

      guideStep('happy', 'All set! I will keep curating growth fuel for you.');
    } catch (error) {
      console.error('Failed to persist onboarding status', error);
      guideStep('shocked', 'I had trouble saving your setup. Want to retry?');
    } finally {
      setIsCompleting(false);
    }
  };

  useEffect(() => {
    if (currentStepData) {
      guideStep('happy', currentStepData.subtitle);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStepData?.id]);

  return (
    <div className="onboarding-flow">
      {/* Progress Bar */}
      <div className="onboarding-progress">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="progress-text">
          Step {displayedStep} of {totalSteps}
        </div>
      </div>

      <div className="onboarding-stage">
        <div className="bot-column">
          <div className="bot-anchor">
            <SuyaBot
              mode={botState.mode}
              isActive={botState.mode === 'awake'}
              message={botState.message}
              onInteraction={() => {
                guideStep('happy', currentStepData.subtitle);
              }}
              fixedPosition={{ x: 48, y: anchorY, corner: 'top-left' }}
            />
          </div>
          <div className="bot-speech-panel" key={`speech-${currentStepData.id}`}>
            <div className="speech-label">
              Step {onboardingState.currentStep + 1} · {currentStepData.title}
            </div>
            <p>{currentStepData.subtitle}</p>
          </div>
        </div>

        <div className="form-column">
          <div className="form-bubble" key={`bubble-${currentStepData.id}`}>
            {currentStepData.id === 'welcome' && (
              <WelcomeStep guideStep={guideStep} nextStep={nextStep} completeStep={completeStep} />
            )}
            {currentStepData.id === 'history-analysis' && (
              <HistoryAnalysisStep 
                guideStep={guideStep} 
                nextStep={nextStep} 
                completeStep={completeStep} 
                updateUserProfile={updateUserProfile}
                onboardingState={onboardingState}
              />
            )}
            {currentStepData.id === 'smart-questioning' && (
              <SmartQuestioningStep 
                guideStep={guideStep} 
                nextStep={nextStep} 
                completeStep={completeStep} 
                updateUserProfile={updateUserProfile}
                userProfile={onboardingState.userProfile}
              />
            )}
            {currentStepData.id === 'api-keys' && (
              <ApiKeySetupStep
                guideStep={guideStep}
                nextStep={nextStep}
                completeStep={completeStep}
                apiKeyStatus={onboardingState.apiKeys}
                updateApiKeyStatus={updateApiKeyStatus}
              />
            )}
            {currentStepData.id === 'news-setup' && (
              <PersonalizedNewsSetup 
                guideStep={guideStep} 
                nextStep={nextStep} 
                completeStep={completeStep} 
                updateUserProfile={updateUserProfile}
                userProfile={onboardingState.userProfile}
              />
            )}
            {currentStepData.id === 'growth-demo' && (
              <GrowthNewsDemo 
                guideStep={guideStep} 
                nextStep={nextStep} 
                completeStep={completeStep} 
                userProfile={onboardingState.userProfile}
              />
            )}
            {currentStepData.id === 'quick-actions' && (
              <GrowthQuickActions 
                guideStep={guideStep} 
                nextStep={nextStep} 
                completeStep={completeStep} 
                userProfile={onboardingState.userProfile}
              />
            )}
          </div>

          {/* Step Navigation */}
          <div className="step-navigation">
            {onboardingState.currentStep > 0 && (
              <button 
                className="nav-btn secondary"
                onClick={previousStep}
              >
                Previous
              </button>
            )}
            
            {onboardingState.currentStep < steps.length - 1 && (
              <button 
                className="nav-btn primary"
                onClick={nextStep}
                disabled={!isCurrentStepComplete}
              >
                Next Step
              </button>
            )}
            
            {onboardingState.currentStep === steps.length - 1 && (
              <button 
                className="nav-btn primary"
                onClick={handleCompleteSetup}
                disabled={isCompleting}
              >
                {isCompleting ? 'Saving…' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;
