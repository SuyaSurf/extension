import React, { useState, useEffect } from 'react';
import { SuyaExpression, SuyaMode } from '@/components/SuyaBot';
import { UserProfile, NewsSource } from '../OnboardingFlow';

interface GrowthNewsDemoProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
  userProfile: Partial<UserProfile>;
}

interface DemoArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceId: string;
  category: string;
  publishedAt: string;
  readTime: number;
  growthInsight: GrowthInsight;
  url: string;
}

interface GrowthInsight {
  type: 'deepen' | 'expand' | 'explore';
  explanation: string;
  relevance: number;
  skills: string[];
  actionItems: string[];
}

const GrowthNewsDemo: React.FC<GrowthNewsDemoProps> = ({
  guideStep, 
  nextStep, 
  completeStep, 
  userProfile
}) => {
  const [demoArticles, setDemoArticles] = useState<DemoArticle[]>([]);
  const [growthInsights, setGrowthInsights] = useState<Record<string, GrowthInsight>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);

  // Demo articles based on user profile
  const generateDemoArticles = async (): Promise<DemoArticle[]> => {
    const { careerFocus, growthGoal, recommendedSources } = userProfile;
    
    const articleTemplates: Record<string, Partial<DemoArticle>[]> = {
      technology: [
        {
          title: "The Rise of AI-Powered Development Tools",
          summary: "How artificial intelligence is transforming the software development landscape with intelligent code completion, automated testing, and predictive debugging.",
          category: "technology",
          readTime: 5,
          url: "https://example.com/ai-dev-tools"
        },
        {
          title: "Microservices vs Monolith: A 2024 Perspective",
          summary: "A comprehensive analysis of when to choose microservices over monolithic architecture in modern software development.",
          category: "technology",
          readTime: 8,
          url: "https://example.com/microservices-monolith"
        },
        {
          title: "WebAssembly: The Future of Web Performance",
          summary: "Exploring how WebAssembly is enabling high-performance applications in the browser and its implications for developers.",
          category: "technology",
          readTime: 6,
          url: "https://example.com/webassembly-future"
        }
      ],
      business: [
        {
          title: "Strategic Leadership in the Digital Age",
          summary: "Essential strategies for business leaders navigating digital transformation and technological disruption.",
          category: "business",
          readTime: 7,
          url: "https://example.com/digital-leadership"
        },
        {
          title: "Data-Driven Decision Making Framework",
          summary: "How to build and implement effective data analytics strategies for better business outcomes.",
          category: "business",
          readTime: 6,
          url: "https://example.com/data-driven"
        }
      ],
      design: [
        {
          title: "UX Design Systems at Scale",
          summary: "Building and maintaining design systems that scale across multiple products and teams.",
          category: "design",
          readTime: 5,
          url: "https://example.com/design-systems"
        },
        {
          title: "The Psychology of User Interface Design",
          summary: "Understanding cognitive psychology principles that drive effective user interface design decisions.",
          category: "design",
          readTime: 7,
          url: "https://example.com/ui-psychology"
        }
      ],
      science: [
        {
          title: "Quantum Computing Breakthroughs in 2024",
          summary: "Recent advances in quantum computing and their potential applications in various industries.",
          category: "science",
          readTime: 8,
          url: "https://example.com/quantum-computing"
        },
        {
          title: "Climate Science: Latest Research Findings",
          summary: "Comprehensive overview of the latest climate change research and its implications for policy.",
          category: "science",
          readTime: 10,
          url: "https://example.com/climate-science"
        }
      ]
    };

    const baseArticles = articleTemplates[careerFocus as string] || articleTemplates.technology;
    const sources = recommendedSources as NewsSource[] || [];
    
    const articles: DemoArticle[] = baseArticles.map((template, index) => {
      const source = sources[index % sources.length] || sources[0];
      const insight = generateGrowthInsight(template, userProfile);
      
      return {
        id: `demo-${index}`,
        source: source?.name || 'Tech Source',
        sourceId: source?.id || 'default',
        publishedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        title: template.title || 'Untitled Article',
        summary: template.summary || 'Article summary not available.',
        category: template.category || 'general',
        readTime: template.readTime || 5,
        url: template.url || '#',
        growthInsight: insight
      };
    });

    return articles;
  };

  const generateGrowthInsight = (article: Partial<DemoArticle>, profile: Partial<UserProfile>): GrowthInsight => {
    const { growthGoal, careerFocus } = profile;
    
    const insights: Record<string, GrowthInsight> = {
      deepen: {
        type: 'deepen',
        explanation: `This article deepens your expertise in ${careerFocus} with advanced concepts and best practices.`,
        relevance: 85 + Math.floor(Math.random() * 15),
        skills: ['Advanced Techniques', 'Industry Standards', 'Best Practices'],
        actionItems: ['Apply these concepts to current projects', 'Share with team members', 'Create implementation plan']
      },
      expand: {
        type: 'expand',
        explanation: `This article expands your knowledge into adjacent areas that complement your ${careerFocus} expertise.`,
        relevance: 75 + Math.floor(Math.random() * 20),
        skills: ['Cross-Domain Knowledge', 'New Perspectives', 'Broader Understanding'],
        actionItems: ['Explore related topics', 'Connect to current work', 'Identify collaboration opportunities']
      },
      explore: {
        type: 'explore',
        explanation: `This article keeps you updated on emerging trends and innovations in ${careerFocus}.`,
        relevance: 80 + Math.floor(Math.random() * 20),
        skills: ['Trend Awareness', 'Future Planning', 'Innovation Insight'],
        actionItems: ['Monitor developments', 'Evaluate adoption potential', 'Consider strategic implications']
      }
    };

    return insights[growthGoal as keyof typeof insights] || insights.explore;
  };

  const runPersonalizedDemo = async () => {
    setIsGenerating(true);
    guideStep('eating', 'Finding articles that will help you grow...');

    // Simulate article generation
    await new Promise(resolve => setTimeout(resolve, 2000));

    const articles = await generateDemoArticles();
    const insights: Record<string, GrowthInsight> = {};
    
    articles.forEach(article => {
      insights[article.id] = article.growthInsight;
    });

    setDemoArticles(articles);
    setGrowthInsights(insights);
    setIsGenerating(false);
    
    guideStep('happy', `Found ${articles.length} articles with high growth potential!`);
  };

  const selectArticle = (articleId: string) => {
    setSelectedArticle(articleId);
    const article = demoArticles.find(a => a.id === articleId);
    if (article) {
      guideStep('thinking', `Great choice! This ${article.growthInsight.type} article has ${article.growthInsight.relevance}% relevance to your goals.`);
    }
  };

  const completeDemo = () => {
    completeStep('growth-demo');
    guideStep('happy', 'Excellent! You now have a personalized news system that will help you grow continuously.');
    nextStep();
  };

  useEffect(() => {
    runPersonalizedDemo();
  }, []);

  if (isGenerating) {
    return (
      <div className="growth-demo-loading">
        <h2>Generating Your Personalized News</h2>
        <p>I'm finding articles that match your growth goals and interests...</p>
        
        <div className="generation-process">
          <div className="process-step active">Analyzing your profile...</div>
          <div className="process-step">Curating relevant articles...</div>
          <div className="process-step">Calculating growth potential...</div>
          <div className="process-step">Personalizing insights...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="growth-news-demo">
      <div className="demo-content">
        <h2>Your Personalized Growth News</h2>
        <p>
          Here are articles specifically selected to help you {userProfile.growthGoal} in {userProfile.careerFocus}.
          Each article includes growth insights and action items.
        </p>

        {/* Articles Grid */}
        <div className="articles-grid">
          {demoArticles.map(article => (
            <div 
              key={article.id}
              className={`growth-article-card ${selectedArticle === article.id ? 'selected' : ''}`}
              onClick={() => selectArticle(article.id)}
            >
              <div className="article-header">
                <div className="article-source">
                  <span className="source-badge">{article.source}</span>
                  <span className="category-badge">{article.category}</span>
                </div>
                <div className="article-meta">
                  <span className="read-time">{article.readTime} min read</span>
                  <span className="publish-date">
                    {new Date(article.publishedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <h3 className="article-title">{article.title}</h3>
              <p className="article-summary">{article.summary}</p>

              {/* Growth Insight */}
              <div className="growth-insight">
                <div className="insight-header">
                  <div className="insight-type">
                    <span className={`type-badge ${article.growthInsight.type}`}>
                      {article.growthInsight.type}
                    </span>
                    <span className="relevance-score">
                      {article.growthInsight.relevance}% relevant
                    </span>
                  </div>
                </div>
                
                <p className="insight-explanation">{article.growthInsight.explanation}</p>
                
                <div className="insight-details">
                  <div className="skills-section">
                    <h4>Skills You'll Gain:</h4>
                    <div className="skills-list">
                      {article.growthInsight.skills.map((skill, idx) => (
                        <span key={idx} className="skill-tag">{skill}</span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="actions-section">
                    <h4>Action Items:</h4>
                    <ul className="actions-list">
                      {article.growthInsight.actionItems.map((action, idx) => (
                        <li key={idx}>{action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="article-actions">
                <button className="action-btn secondary">Read Later</button>
                <button className="action-btn primary">Read Now</button>
              </div>
            </div>
          ))}
        </div>

        {/* Demo Summary */}
        <div className="demo-summary">
          <h3>Your Personalized News Experience</h3>
          <div className="summary-stats">
            <div className="stat-item">
              <div className="stat-number">{demoArticles.length}</div>
              <div className="stat-label">Articles Curated</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">
                {Math.round(demoArticles.reduce((acc, article) => acc + article.growthInsight.relevance, 0) / demoArticles.length)}%
              </div>
              <div className="stat-label">Avg Relevance</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">{userProfile.growthGoal}</div>
              <div className="stat-label">Growth Strategy</div>
            </div>
          </div>
        </div>

        {/* Complete Demo */}
        <div className="demo-actions">
          <button 
            className="action-btn primary"
            onClick={completeDemo}
          >
            Continue to Quick Actions
          </button>
        </div>
      </div>
    </div>
  );
};

export { GrowthNewsDemo };
