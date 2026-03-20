import React, { useState, useEffect } from 'react';
import { SuyaExpression, SuyaMode } from '@/components/SuyaBot';
import { UserProfile, NewsSource, GrowthArea } from '../OnboardingFlow';

interface PersonalizedNewsSetupProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  userProfile: Partial<UserProfile>;
}

const PersonalizedNewsSetup: React.FC<PersonalizedNewsSetupProps> = ({
  guideStep, 
  nextStep, 
  completeStep, 
  updateUserProfile,
  userProfile
}) => {
  const [recommendations, setRecommendations] = useState<NewsSource[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [growthAreas, setGrowthAreas] = useState<GrowthArea[]>([]);

  // Base news sources by domain
  const baseNewsSources: Record<string, Omit<NewsSource, 'growthReason' | 'priority'>[]> = {
    technology: [
      { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'technology', primaryDomain: 'technology', adjacentDomain: 'business', type: 'rss' as const },
      { id: 'arstechnica', name: 'Ars Technica', url: 'https://arstechnica.com/feed/', category: 'technology', primaryDomain: 'technology', adjacentDomain: 'science', type: 'rss' as const },
      { id: 'hackernews', name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'technology', primaryDomain: 'technology', adjacentDomain: 'business', type: 'rss' as const },
      { id: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'technology', primaryDomain: 'technology', adjacentDomain: 'design', type: 'rss' as const },
      { id: 'wired', name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'technology', primaryDomain: 'technology', adjacentDomain: 'science', type: 'rss' as const }
    ],
    business: [
      { id: 'bloomberg', name: 'Bloomberg', url: 'https://www.bloomberg.com/feed/', category: 'business', primaryDomain: 'business', adjacentDomain: 'finance', type: 'rss' as const },
      { id: 'wsj', name: 'Wall Street Journal', url: 'https://feeds.wsj.com/rss/wsj.com', category: 'business', primaryDomain: 'business', adjacentDomain: 'finance', type: 'rss' as const },
      { id: 'forbes', name: 'Forbes', url: 'https://www.forbes.com/feed/', category: 'business', primaryDomain: 'business', adjacentDomain: 'technology', type: 'rss' as const },
      { id: 'hbr', name: 'Harvard Business Review', url: 'https://hbr.org/feed', category: 'business', primaryDomain: 'business', adjacentDomain: 'education', type: 'rss' as const }
    ],
    science: [
      { id: 'nature', name: 'Nature', url: 'https://www.nature.com/nature.rss', category: 'science', primaryDomain: 'science', adjacentDomain: 'technology', type: 'rss' as const },
      { id: 'sciencedaily', name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', category: 'science', primaryDomain: 'science', adjacentDomain: 'education', type: 'rss' as const },
      { id: 'phys', name: 'Phys.org', url: 'https://phys.org/rss-feed/', category: 'science', primaryDomain: 'science', adjacentDomain: 'technology', type: 'rss' as const }
    ],
    design: [
      { id: 'smashing', name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', category: 'design', primaryDomain: 'design', adjacentDomain: 'marketing', type: 'rss' as const },
      { id: 'aiga', name: 'AIGA Eye on Design', url: 'https://eyeondesign.aiga.org/feed/', category: 'design', primaryDomain: 'design', adjacentDomain: 'marketing', type: 'rss' as const },
      { id: 'designmilk', name: 'Design Milk', url: 'https://design-milk.com/feed/', category: 'design', primaryDomain: 'design', adjacentDomain: 'technology', type: 'rss' as const }
    ],
    marketing: [
      { id: 'adage', name: 'Ad Age', url: 'https://adage.com/feed', category: 'marketing', primaryDomain: 'marketing', adjacentDomain: 'business', type: 'rss' as const },
      { id: 'contentmarketing', name: 'Content Marketing Institute', url: 'https://contentmarketinginstitute.com/feed/', category: 'marketing', primaryDomain: 'marketing', adjacentDomain: 'business', type: 'rss' as const }
    ],
    education: [
      { id: 'edutopia', name: 'Edutopia', url: 'https://www.edutopia.org/feed', category: 'education', primaryDomain: 'education', adjacentDomain: 'science', type: 'rss' as const },
      { id: 'coursera', name: 'Coursera Blog', url: 'https://blog.coursera.org/feed', category: 'education', primaryDomain: 'education', adjacentDomain: 'technology', type: 'rss' as const }
    ],
    finance: [
      { id: 'seekingalpha', name: 'Seeking Alpha', url: 'https://seekingalpha.com/feed.xml', category: 'finance', primaryDomain: 'finance', adjacentDomain: 'business', type: 'rss' as const },
      { id: 'marketwatch', name: 'MarketWatch', url: 'https://www.marketwatch.com/rss/topstories', category: 'finance', primaryDomain: 'finance', adjacentDomain: 'business', type: 'rss' as const }
    ]
  };

  const getGrowthReason = (source: NewsSource, profile: Partial<UserProfile>): string => {
    const { growthGoal, careerFocus } = profile;
    
    if (growthGoal === 'deepen' && source.primaryDomain === careerFocus) {
      return `Deepens your expertise in ${source.primaryDomain}`;
    }
    
    if (growthGoal === 'expand' && source.adjacentDomain) {
      return `Expands your knowledge into ${source.adjacentDomain}`;
    }
    
    if (growthGoal === 'explore') {
      return `Keeps you updated on trends in ${source.primaryDomain}`;
    }
    
    return `Aligns with your interest in ${source.primaryDomain}`;
  };

  const calculatePriority = (source: NewsSource, profile: Partial<UserProfile>): number => {
    let priority = 50; // Base priority
    
    // Boost for primary domain matches
    if (source.primaryDomain === profile.careerFocus) {
      priority += 30;
    }
    
    // Boost for adjacent domains when expanding
    if (profile.growthGoal === 'expand' && source.adjacentDomain === profile.careerFocus) {
      priority += 20;
    }
    
    // Boost for user interests
    if (profile.contentTypes?.includes(source.primaryDomain)) {
      priority += 15;
    }
    
    // Boost for trending sources
    if (['hackernews', 'techcrunch', 'bloomberg'].includes(source.id)) {
      priority += 10;
    }
    
    return Math.min(priority, 100);
  };

  const generatePersonalizedSources = async () => {
    setIsGenerating(true);
    guideStep('eating', 'Finding the perfect news sources for your growth journey...');
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const sources: NewsSource[] = [];
    const { careerFocus, growthGoal, interests } = userProfile;
    
    // Get base sources from career focus
    if (careerFocus && baseNewsSources[careerFocus]) {
      sources.push(...baseNewsSources[careerFocus].map((source: Omit<NewsSource, 'growthReason' | 'priority'>) => ({
        ...source,
        growthReason: getGrowthReason(source as NewsSource, userProfile),
        priority: calculatePriority(source as NewsSource, userProfile)
      })));
    }
    
    // Add growth-oriented sources
    if (growthGoal === 'expand' && careerFocus) {
      const adjacentDomains: Record<string, string[]> = {
        technology: ['business', 'science', 'design'],
        business: ['technology', 'finance', 'marketing'],
        science: ['technology', 'education'],
        design: ['technology', 'marketing'],
        marketing: ['business', 'design'],
        education: ['science', 'technology'],
        finance: ['business', 'technology']
      };
      
      const adjacent = adjacentDomains[careerFocus] || [];
      adjacent.forEach(domain => {
        if (baseNewsSources[domain]) {
          sources.push(...baseNewsSources[domain].slice(0, 2).map((source: Omit<NewsSource, 'growthReason' | 'priority'>) => ({
            ...source,
            growthReason: getGrowthReason(source as NewsSource, userProfile),
            priority: calculatePriority(source as NewsSource, userProfile) - 10
          })));
        }
      });
    }
    
    // Add sources from user interests
    if (interests) {
      Object.keys(interests).forEach(domain => {
        if (baseNewsSources[domain] && domain !== careerFocus) {
          sources.push(...baseNewsSources[domain].slice(0, 1).map((source: Omit<NewsSource, 'growthReason' | 'priority'>) => ({
            ...source,
            growthReason: getGrowthReason(source as NewsSource, userProfile),
            priority: calculatePriority(source as NewsSource, userProfile) - 20
          })));
        }
      });
    }
    
    // Sort by priority and take top recommendations
    const sortedSources = sources
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 12);
    
    setRecommendations(sortedSources);
    
    // Generate growth areas
    const areas: GrowthArea[] = sortedSources.reduce((acc: GrowthArea[], source) => {
      const existing = acc.find(area => area.domain === source.primaryDomain);
      if (existing) {
        existing.sources.push(source);
      } else {
        acc.push({
          domain: source.primaryDomain,
          type: userProfile.growthGoal || 'explore',
          sources: [source],
          currentLevel: 1,
          targetLevel: 3,
          estimatedTime: '2-4 weeks'
        });
      }
      return acc;
    }, []);
    
    setGrowthAreas(areas);
    
    setIsGenerating(false);
    guideStep('happy', `I found ${sortedSources.length} sources that will help you ${userProfile.growthGoal}!`);
  };

  const toggleSource = (sourceId: string) => {
    const newSelected = new Set(selectedSources);
    if (newSelected.has(sourceId)) {
      newSelected.delete(sourceId);
    } else {
      newSelected.add(sourceId);
    }
    setSelectedSources(newSelected);
    
    const count = newSelected.size;
    guideStep('thinking', count > 0 ? `Selected ${count} source${count !== 1 ? 's' : ''}` : 'No sources selected');
  };

  const selectAll = () => {
    const allIds = new Set(recommendations.map(source => source.id));
    setSelectedSources(allIds);
    guideStep('happy', `Selected all ${recommendations.length} sources!`);
  };

  const completeSetup = () => {
    if (selectedSources.size === 0) {
      guideStep('shocked', 'Please select at least one news source to continue.');
      return;
    }
    
    const selected = recommendations.filter(source => selectedSources.has(source.id));
    
    // Update user profile
    updateUserProfile({
      recommendedSources: selected,
      growthAreas
    });
    
    completeStep('news-setup');
    guideStep('happy', `Perfect! I've set up ${selected.length} personalized news sources for your growth.`);
    nextStep();
  };

  useEffect(() => {
    generatePersonalizedSources();
  }, []);

  if (isGenerating) {
    return (
      <div className="news-setup-loading">
        <h2>Personalizing Your News Sources</h2>
        <p>I'm analyzing your profile and finding the best sources for your growth...</p>
        
        <div className="generation-steps">
          <div className="step active">Analyzing your interests...</div>
          <div className="step">Finding relevant sources...</div>
          <div className="step">Calculating growth potential...</div>
          <div className="step">Personalizing recommendations...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="personalized-news-setup">
      <div className="setup-content">
        <h2>Your Personalized News Sources</h2>
        <p>
          Based on your profile, I've selected sources that will help you {userProfile.growthGoal} in {userProfile.careerFocus}.
        </p>

        {/* Growth Areas Overview */}
        {growthAreas.length > 0 && (
          <div className="growth-areas-overview">
            <h3>Your Growth Areas</h3>
            <div className="areas-grid">
              {growthAreas.map(area => (
                <div key={area.domain} className="growth-area-card">
                  <h4>{area.domain.charAt(0).toUpperCase() + area.domain.slice(1)}</h4>
                  <div className="area-type">{area.type}</div>
                  <div className="area-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${(area.currentLevel / area.targetLevel) * 100}%` }}
                      />
                    </div>
                    <span>{area.currentLevel}/{area.targetLevel}</span>
                  </div>
                  <div className="area-time">{area.estimatedTime}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source Recommendations */}
        <div className="source-recommendations">
          <div className="recommendations-header">
            <h3>Recommended Sources</h3>
            <div className="recommendations-actions">
              <button 
                className="action-btn secondary"
                onClick={selectAll}
              >
                Select All
              </button>
              <button 
                className="action-btn secondary"
                onClick={() => setSelectedSources(new Set())}
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="sources-grid">
            {recommendations.map(source => (
              <div 
                key={source.id}
                className={`source-card ${selectedSources.has(source.id) ? 'selected' : ''}`}
                onClick={() => toggleSource(source.id)}
              >
                <div className="source-header">
                  <h4>{source.name}</h4>
                  <div className="source-priority">
                    <div className="priority-bar">
                      <div 
                        className="priority-fill" 
                        style={{ width: `${source.priority}%` }}
                      />
                    </div>
                    <span>{source.priority}% match</span>
                  </div>
                </div>
                
                <div className="source-category">{source.category}</div>
                
                <div className="growth-reason">
                  <div className="reason-icon">🌱</div>
                  <p>{source.growthReason}</p>
                </div>
                
                <div className="source-type">
                  <span className="type-badge">{source.type}</span>
                  {source.adjacentDomain && (
                    <span className="adjacent-badge">+{source.adjacentDomain}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Setup Actions */}
        <div className="setup-actions">
          <button 
            className="action-btn primary"
            onClick={completeSetup}
            disabled={selectedSources.size === 0}
          >
            Continue with {selectedSources.size} Source{selectedSources.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export { PersonalizedNewsSetup };
