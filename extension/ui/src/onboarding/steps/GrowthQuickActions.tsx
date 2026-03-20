import React from 'react';
import { SuyaExpression, SuyaMode } from '@/components/SuyaBot';
import { UserProfile } from '../OnboardingFlow';

interface GrowthQuickActionsProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
  userProfile: Partial<UserProfile>;
}

interface GrowthAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  action: string;
  botMessage: string;
  personalized: boolean;
  dataDriven?: boolean;
  realTime?: boolean;
  adaptive?: boolean;
  category: 'daily' | 'analysis' | 'learning' | 'automation';
  estimatedTime: string;
  frequency: string;
}

const GrowthQuickActions: React.FC<GrowthQuickActionsProps> = ({
  guideStep, 
  nextStep, 
  completeStep, 
  userProfile
}) => {
  const { careerFocus, growthGoal, learningStyle, updateFrequency } = userProfile;

  // Generate personalized actions based on user profile
  const generateActions = (): GrowthAction[] => {
    const baseActions: GrowthAction[] = [
      {
        id: 'growth-briefing',
        title: `Today's Growth Briefing`,
        description: `Curated news to help you ${growthGoal} in ${careerFocus}`,
        icon: '📈',
        action: 'growthBriefing',
        botMessage: 'Let me find today\'s most valuable articles for your growth!',
        personalized: true,
        category: 'daily',
        estimatedTime: '5 min',
        frequency: 'Daily'
      },
      {
        id: 'skill-gap-analysis',
        title: 'Skill Gap Analysis',
        description: 'Identify knowledge gaps in your domain',
        icon: '🎯',
        action: 'skillGapAnalysis',
        botMessage: 'I\'ll analyze what you should learn next!',
        personalized: false,
        dataDriven: true,
        category: 'analysis',
        estimatedTime: '10 min',
        frequency: 'Weekly'
      },
      {
        id: 'trending-analysis',
        title: 'Trending in Your Field',
        description: 'Stay ahead of industry trends',
        icon: '🔥',
        action: 'trendingAnalysis',
        botMessage: 'Let me show you what\'s trending in your domain!',
        personalized: false,
        realTime: true,
        category: 'analysis',
        estimatedTime: '7 min',
        frequency: 'Weekly'
      },
      {
        id: 'growth-path',
        title: 'Growth Path Recommendations',
        description: 'Personalized learning path suggestions',
        icon: '🛤️',
        action: 'growthPath',
        botMessage: 'I\'ll create a growth roadmap just for you!',
        personalized: true,
        adaptive: true,
        category: 'learning',
        estimatedTime: '15 min',
        frequency: 'Monthly'
      },
      {
        id: 'form-wizard',
        title: 'Smart Form Assistant',
        description: 'AI-powered form filling and analysis',
        icon: '📝',
        action: 'formWizard',
        botMessage: 'I can help you fill forms intelligently!',
        personalized: true,
        category: 'automation',
        estimatedTime: '2 min',
        frequency: 'As needed'
      },
      {
        id: 'content-summarizer',
        title: 'Content Summarizer',
        description: 'Quick summaries of long articles and documents',
        icon: '📄',
        action: 'summarizeContent',
        botMessage: 'I\'ll summarize any content for quick understanding!',
        personalized: true,
        category: 'daily',
        estimatedTime: '3 min',
        frequency: 'As needed'
      }
    ];

    // Add career-specific actions
    const careerSpecificActions: Record<string, GrowthAction[]> = {
      technology: [
        {
          id: 'code-review',
          title: 'Code Review Assistant',
          description: 'AI-powered code analysis and suggestions',
          icon: '💻',
          action: 'codeReview',
          botMessage: 'I can help review your code for improvements!',
          personalized: true,
          category: 'automation',
          estimatedTime: '10 min',
          frequency: 'As needed'
        },
        {
          id: 'tech-trends',
          title: 'Tech Trend Radar',
          description: 'Emerging technologies and frameworks',
          icon: '🚀',
          action: 'techTrends',
          botMessage: 'Let me show you the latest tech trends!',
          personalized: false,
          realTime: true,
          category: 'analysis',
          estimatedTime: '8 min',
          frequency: 'Weekly'
        }
      ],
      business: [
        {
          id: 'market-insights',
          title: 'Market Insights',
          description: 'Business intelligence and market analysis',
          icon: '📊',
          action: 'marketInsights',
          botMessage: 'I\'ll gather key market insights for you!',
          personalized: false,
          dataDriven: true,
          category: 'analysis',
          estimatedTime: '12 min',
          frequency: 'Weekly'
        },
        {
          id: 'strategy-advisor',
          title: 'Strategy Advisor',
          description: 'Strategic planning and decision support',
          icon: '♟️',
          action: 'strategyAdvisor',
          botMessage: 'I can help with strategic planning and decisions!',
          personalized: true,
          adaptive: true,
          category: 'learning',
          estimatedTime: '20 min',
          frequency: 'Monthly'
        }
      ],
      design: [
        {
          id: 'design-inspiration',
          title: 'Design Inspiration',
          description: 'Curated design examples and trends',
          icon: '🎨',
          action: 'designInspiration',
          botMessage: 'Let me find inspiring design examples!',
          personalized: true,
          category: 'daily',
          estimatedTime: '5 min',
          frequency: 'Daily'
        },
        {
          id: 'ux-auditor',
          title: 'UX Auditor',
          description: 'User experience analysis and recommendations',
          icon: '🔍',
          action: 'uxAudit',
          botMessage: 'I can audit user experience and suggest improvements!',
          personalized: false,
          dataDriven: true,
          category: 'analysis',
          estimatedTime: '15 min',
          frequency: 'As needed'
        }
      ]
    };

    // Combine base and career-specific actions
    const specificActions = careerSpecificActions[careerFocus as string] || [];
    return [...baseActions, ...specificActions];
  };

  const executeAction = (action: GrowthAction) => {
    guideStep('eating', action.botMessage);
    
    // Simulate action execution
    setTimeout(() => {
      guideStep('happy', `Great! I've started ${action.title.toLowerCase()} for you.`);
    }, 1500);
  };

  const completeOnboarding = () => {
    completeStep('quick-actions');
    guideStep('happy', 'Congratulations! Your personalized growth system is ready. Let\'s start your journey!');
    
    // Save completion to storage
    chrome.storage.local.set({ 
      hasSeenOnboarding: true,
      onboardingCompleted: Date.now(),
      userProfile: userProfile,
      quickActionsConfig: {
        enabledActions: generateActions().map(a => a.id),
        lastUsed: Date.now()
      }
    });
    
    nextStep();
  };

  const actions = generateActions();

  // Group actions by category
  const actionsByCategory = actions.reduce((acc, action) => {
    if (!acc[action.category]) {
      acc[action.category] = [];
    }
    acc[action.category].push(action);
    return acc;
  }, {} as Record<string, GrowthAction[]>);

  const categoryIcons = {
    daily: '📅',
    analysis: '📊',
    learning: '🎓',
    automation: '⚡'
  };

  const categoryDescriptions = {
    daily: 'Daily routines for continuous growth',
    analysis: 'Deep insights and trend analysis',
    learning: 'Skill development and education',
    automation: 'Smart assistance and productivity'
  };

  return (
    <div className="growth-quick-actions">
      <div className="quick-actions-content">
        <h2>Your Growth Dashboard</h2>
        <p>
          Based on your profile, I've prepared personalized quick actions to help you {growthGoal} in {careerFocus}.
          These are your go-to tools for daily growth and development.
        </p>

        {/* User Profile Summary */}
        <div className="profile-summary">
          <h3>Your Growth Profile</h3>
          <div className="profile-grid">
            <div className="profile-item">
              <div className="profile-icon">🎯</div>
              <div className="profile-info">
                <strong>Focus:</strong> {careerFocus}
              </div>
            </div>
            <div className="profile-item">
              <div className="profile-icon">🌱</div>
              <div className="profile-info">
                <strong>Goal:</strong> {growthGoal}
              </div>
            </div>
            <div className="profile-item">
              <div className="profile-icon">📚</div>
              <div className="profile-info">
                <strong>Style:</strong> {learningStyle}
              </div>
            </div>
            <div className="profile-item">
              <div className="profile-icon">⏰</div>
              <div className="profile-info">
                <strong>Frequency:</strong> {updateFrequency}
              </div>
            </div>
          </div>
        </div>

        {/* Actions by Category */}
        <div className="actions-categories">
          {Object.entries(actionsByCategory).map(([category, categoryActions]) => (
            <div key={category} className="category-section">
              <div className="category-header">
                <div className="category-title">
                  <span className="category-icon">{categoryIcons[category as keyof typeof categoryIcons]}</span>
                  <h3>{category.charAt(0).toUpperCase() + category.slice(1)}</h3>
                </div>
                <p className="category-description">
                  {categoryDescriptions[category as keyof typeof categoryDescriptions]}
                </p>
              </div>

              <div className="actions-grid">
                {categoryActions.map(action => (
                  <div 
                    key={action.id}
                    className="action-card"
                    onClick={() => executeAction(action)}
                  >
                    <div className="action-header">
                      <div className="action-icon">{action.icon}</div>
                      <div className="action-badges">
                        {action.personalized && <span className="badge personalized">Personalized</span>}
                        {action.dataDriven && <span className="badge data-driven">Data-Driven</span>}
                        {action.realTime && <span className="badge real-time">Real-Time</span>}
                        {action.adaptive && <span className="badge adaptive">Adaptive</span>}
                      </div>
                    </div>

                    <h4 className="action-title">{action.title}</h4>
                    <p className="action-description">{action.description}</p>

                    <div className="action-meta">
                      <div className="meta-item">
                        <span className="meta-icon">⏱️</span>
                        <span>{action.estimatedTime}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-icon">🔄</span>
                        <span>{action.frequency}</span>
                      </div>
                    </div>

                    <button className="action-btn">
                      Start Action
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Getting Started Guide */}
        <div className="getting-started">
          <h3>Getting Started</h3>
          <div className="steps-guide">
            <div className="step-item">
              <div className="step-number">1</div>
              <div className="step-content">
                <h4>Daily Briefing</h4>
                <p>Start your day with personalized news and insights</p>
              </div>
            </div>
            <div className="step-item">
              <div className="step-number">2</div>
              <div className="step-content">
                <h4>Weekly Analysis</h4>
                <p>Review trends and identify growth opportunities</p>
              </div>
            </div>
            <div className="step-item">
              <div className="step-number">3</div>
              <div className="step-content">
                <h4>Monthly Planning</h4>
                <p>Update your growth path and learning goals</p>
              </div>
            </div>
          </div>
        </div>

        {/* Complete Onboarding */}
        <div className="onboarding-complete">
          <div className="complete-header">
            <h3>🎉 Ready to Grow!</h3>
            <p>Your personalized growth system is set up and ready to use.</p>
          </div>

          <div className="complete-actions">
            <button 
              className="complete-btn primary"
              onClick={completeOnboarding}
            >
              Start Your Growth Journey
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export { GrowthQuickActions };
