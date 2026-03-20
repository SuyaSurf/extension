import React, { useState, useEffect } from 'react';
import { SuyaExpression, SuyaMode } from '@/components/SuyaBot';
import { UserProfile, InterestData, BrowsingPatterns, OnboardingState } from '../OnboardingFlow';

interface HistoryAnalysisStepProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  onboardingState: OnboardingState;
}

const HistoryAnalysisStep: React.FC<HistoryAnalysisStepProps> = ({
  guideStep, 
  nextStep, 
  completeStep, 
  updateUserProfile,
  onboardingState
}) => {
  const [analysisState, setAnalysisState] = useState<'idle' | 'requesting' | 'scanning' | 'complete' | 'permission_needed' | 'manual_setup'>('idle');
  const [analysisResult, setAnalysisResult] = useState<{
    interests: Record<string, InterestData[]>;
    patterns: BrowsingPatterns;
    summary: string;
  } | null>(null);

  // Interest categories with keywords
  const interestCategories = {
    technology: [
      'github', 'stackoverflow', 'developer', 'programming', 'coding', 'tech',
      'software', 'javascript', 'python', 'react', 'node', 'api', 'framework'
    ],
    business: [
      'linkedin', 'bloomberg', 'forbes', 'business', 'startup', 'entrepreneur',
      'marketing', 'sales', 'finance', 'investment', 'economy'
    ],
    science: [
      'nature', 'science', 'research', 'journal', 'academic', 'study',
      'experiment', 'data', 'analysis', 'physics', 'biology', 'chemistry'
    ],
    design: [
      'dribbble', 'behance', 'figma', 'design', 'ui', 'ux', 'creative',
      'art', 'visual', 'interface', 'prototype', 'color'
    ],
    marketing: [
      'marketing', 'advertising', 'seo', 'social media', 'content',
      'campaign', 'brand', 'conversion', 'analytics', 'engagement'
    ],
    education: [
      'coursera', 'udemy', 'edx', 'learning', 'course', 'tutorial',
      'education', 'study', 'skill', 'training', 'certification'
    ],
    finance: [
      'finance', 'investing', 'trading', 'stock', 'crypto', 'banking',
      'money', 'budget', 'financial', 'wealth', 'portfolio'
    ]
  };

  const categorizeUrl = (url: string, title: string): string | null => {
    const text = (url + ' ' + title).toLowerCase();
    
    for (const [category, keywords] of Object.entries(interestCategories)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category;
      }
    }
    
    return null;
  };

  const analyzeBrowserHistory = async (): Promise<{
    interests: Record<string, InterestData[]>;
    patterns: BrowsingPatterns;
    summary: string;
  }> => {
    try {
      const history = await chrome.history.search({
        text: '',
        startTime: Date.now() - (30 * 24 * 60 * 60 * 1000), // Last 30 days
        maxResults: 1000
      });

      const interests: Record<string, InterestData[]> = {};
      const domainCounts: Record<string, number> = {};
      const hourCounts: Record<number, number> = {};

      history.forEach(item => {
        const category = categorizeUrl(item.url || '', item.title || '');
        if (category) {
          if (!interests[category]) {
            interests[category] = [];
          }
          
          interests[category].push({
            url: item.url || '',
            title: item.title || '',
            visitCount: item.visitCount || 1,
            lastVisitTime: item.lastVisitTime || Date.now(),
            category
          });

          // Count domains for patterns
          try {
            const url = item.url || '';
            const domain = new URL(url).hostname;
            domainCounts[domain] = (domainCounts[domain] || 0) + (item.visitCount || 1);
          } catch (e) {
            // Invalid URL, skip
          }

          // Count visit hours
          const visitTime = item.lastVisitTime || Date.now();
          const visitHour = new Date(visitTime).getHours();
          hourCounts[visitHour] = (hourCounts[visitHour] || 0) + 1;
        }
      });

      // Sort interests by visit count
      Object.keys(interests).forEach(category => {
        interests[category].sort((a, b) => b.visitCount - a.visitCount);
      });

      // Generate patterns
      const mostVisitedDomains = Object.entries(domainCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([domain]) => domain);

      const peakActivityHours = Object.entries(hourCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([hour]) => parseInt(hour));

      // Generate summary
      const topCategories = Object.entries(interests)
        .sort(([,a], [,b]) => b.length - a.length)
        .slice(0, 3)
        .map(([category]) => category);

      const summary = `Based on your browsing history, I can see you're most interested in ${topCategories.join(', ')}. ` +
        `You frequently visit ${mostVisitedDomains.slice(0, 3).join(', ')} and are most active around ${peakActivityHours[0]}:00.`;

      return {
        interests,
        patterns: {
          mostVisitedDomains,
          peakActivityHours,
          contentPreferences: topCategories,
          sessionDuration: 0 // Would need more complex analysis
        },
        summary
      };
    } catch (error) {
      console.error('History analysis failed:', error);
      throw error;
    }
  };

  const requestHistoryPermission = async (): Promise<boolean> => {
    try {
      const hasPermission = await chrome.permissions.contains({
        permissions: ['history']
      });
      
      if (!hasPermission) {
        setAnalysisState('requesting');
        guideStep('thinking', 'I need permission to analyze your browsing history to personalize your growth journey.');
        
        const granted = await chrome.permissions.request({
          permissions: ['history']
        });
        
        if (granted) {
          guideStep('happy', 'Thank you! Now I can help you grow more effectively.');
          return true;
        } else {
          guideStep('neutral', 'No problem! We can still set up great news sources manually.');
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      guideStep('shocked', 'I had trouble accessing history permissions.');
      return false;
    }
  };

  const startAnalysis = async () => {
    const hasPermission = await requestHistoryPermission();
    
    if (!hasPermission) {
      setAnalysisState('manual_setup');
      return;
    }

    setAnalysisState('scanning');
    guideStep('eating', 'Analyzing your browsing patterns to understand your interests...');

    try {
      const result = await analyzeBrowserHistory();
      setAnalysisResult(result);
      setAnalysisState('complete');
      
      // Update user profile
      updateUserProfile({
        interests: result.interests,
        patterns: result.patterns
      });

      guideStep('happy', result.summary);
    } catch (error) {
      console.error('Analysis failed:', error);
      setAnalysisState('permission_needed');
      guideStep('shocked', 'I had trouble analyzing your history. Let\'s set this up manually.');
    }
  };

  const skipAnalysis = () => {
    setAnalysisState('manual_setup');
    guideStep('neutral', 'No problem! Let\'s set up your interests manually.');
  };

  const completeHistoryStep = () => {
    completeStep('history-analysis');
    guideStep('happy', 'Great! Now let\'s personalize your growth goals.');
    nextStep();
  };

  const renderAnalysisState = () => {
    switch (analysisState) {
      case 'idle':
        return (
          <div className="analysis-intro">
            <h2>Discover Your Interests</h2>
            <p>
              I can analyze your browsing history from the last 30 days to understand your interests 
              and curate personalized news that helps you grow in your domain.
            </p>
            
            <div className="analysis-benefits">
              <div className="benefit-item">
                <div className="benefit-icon">🎯</div>
                <h3>Personalized Curation</h3>
                <p>News selected specifically for your professional growth</p>
              </div>
              
              <div className="benefit-item">
                <div className="benefit-icon">📈</div>
                <h3>Growth-Oriented</h3>
                <p>Content that helps you expand and deepen your knowledge</p>
              </div>
              
              <div className="benefit-item">
                <div className="benefit-icon">🔒</div>
                <h3>Privacy First</h3>
                <p>Analysis happens locally, you're always in control</p>
              </div>
            </div>

            <div className="analysis-actions">
              <button 
                className="action-btn primary"
                onClick={startAnalysis}
              >
                Analyze My Interests
              </button>
              <button 
                className="action-btn secondary"
                onClick={skipAnalysis}
              >
                Set Up Manually
              </button>
            </div>
          </div>
        );

      case 'requesting':
        return (
          <div className="permission-request">
            <h2>Permission Needed</h2>
            <p>
              To provide personalized recommendations, I need permission to analyze your browsing history. 
              This helps me understand your interests and growth areas.
            </p>
            
            <div className="permission-details">
              <h3>What I'll analyze:</h3>
              <ul>
                <li>Website domains you visit frequently</li>
                <li>Content categories you're interested in</li>
                <li>Your peak activity times</li>
              </ul>
              
              <h3>What I won't access:</h3>
              <ul>
                <li>Private browsing data</li>
                <li>Specific page content</li>
                <li>Personal information</li>
              </ul>
            </div>
          </div>
        );

      case 'scanning':
        return (
          <div className="scanning-animation">
            <h2>Analyzing Your Interests</h2>
            <p>I'm looking through your browsing patterns to understand what you're passionate about...</p>
            
            <div className="scan-progress">
              <div className="progress-bar">
                <div className="progress-fill scanning"/>
              </div>
              <div className="scan-steps">
                <div className="step active">Collecting history...</div>
                <div className="step">Categorizing interests...</div>
                <div className="step">Analyzing patterns...</div>
                <div className="step">Generating insights...</div>
              </div>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="analysis-results">
            <h2>Your Interest Profile</h2>
            
            {analysisResult && (
              <>
                <div className="interest-summary">
                  <p>{analysisResult.summary}</p>
                </div>

                <div className="interests-grid">
                  <h3>Your Top Interests</h3>
                  {Object.entries(analysisResult.interests)
                    .sort(([,a], [,b]) => b.length - a.length)
                    .slice(0, 5)
                    .map(([category, items]) => (
                      <div key={category} className="interest-card">
                        <h4>{category.charAt(0).toUpperCase() + category.slice(1)}</h4>
                        <div className="interest-count">{items.length} visits</div>
                        <div className="interest-examples">
                          {items.slice(0, 3).map((item, idx) => (
                            <div key={idx} className="interest-example">
                              {new URL(item.url).hostname.replace('www.', '')}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>

                <div className="patterns-section">
                  <h3>Your Browsing Patterns</h3>
                  <div className="patterns-grid">
                    <div className="pattern-card">
                      <h4>Most Visited</h4>
                      {analysisResult.patterns.mostVisitedDomains.slice(0, 5).map(domain => (
                        <div key={domain} className="pattern-item">{domain}</div>
                      ))}
                    </div>
                    
                    <div className="pattern-card">
                      <h4>Peak Activity</h4>
                      {analysisResult.patterns.peakActivityHours.map(hour => (
                        <div key={hour} className="pattern-item">{hour}:00</div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            <button 
              className="action-btn primary"
              onClick={completeHistoryStep}
            >
              Continue to Personalization
            </button>
          </div>
        );

      case 'manual_setup':
        return (
          <div className="manual-setup">
            <h2>Set Up Your Interests Manually</h2>
            <p>
              No problem! Let's manually select the areas you're interested in so I can curate content for your growth.
            </p>
            
            <div className="manual-interests">
              <h3>Select Your Interests</h3>
              <div className="interest-options">
                {Object.keys(interestCategories).map(category => (
                  <label key={category} className="interest-option">
                    <input type="checkbox" name={category} />
                    <span>{category.charAt(0).toUpperCase() + category.slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>

            <button 
              className="action-btn primary"
              onClick={completeHistoryStep}
            >
              Continue with Manual Setup
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="history-analysis-step">
      <div className="step-content">
        {renderAnalysisState()}
      </div>
    </div>
  );
};

export { HistoryAnalysisStep };
