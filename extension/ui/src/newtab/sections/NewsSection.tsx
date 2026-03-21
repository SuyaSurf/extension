import React, { useState, useEffect } from 'react';

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: string;
  url: string;
  publishedAt: string;
  summary?: string;
  read?: boolean;
  saved?: boolean;
}

interface NewsSectionProps {
  className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  tech:        '#FF6B35',
  business:    '#4FC3F7',
  science:     '#81C784',
  world:       '#CE93D8',
  design:      '#FFB74D',
  ai:          '#F48FB1',
  default:     '#90A4AE',
};

interface StoredSettings {
  newsSources?: string[];
}

interface StoredUserProfile {
  careerFocus?: string;
  growthGoal?: 'deepen' | 'expand' | 'explore';
  recommendedSources?: Array<{ id: string; name: string; primaryDomain?: string; category?: string }>;
}

interface NewsState {
  readIds: string[];
  savedIds: string[];
}

const SOURCE_LABELS: Record<string, { source: string; category: string }> = {
  hn: { source: 'Hacker News', category: 'tech' },
  hackernews: { source: 'Hacker News', category: 'tech' },
  techcrunch: { source: 'TechCrunch', category: 'tech' },
  verge: { source: 'The Verge', category: 'tech' },
  mit: { source: 'MIT Tech Review', category: 'ai' },
  wired: { source: 'Wired', category: 'tech' },
  uxc: { source: 'UX Collective', category: 'design' },
  smashing: { source: 'Smashing Magazine', category: 'design' },
  frc: { source: 'First Round Review', category: 'business' },
  bloomberg: { source: 'Bloomberg', category: 'business' },
  hbr: { source: 'Harvard Business Review', category: 'business' },
  nature: { source: 'Nature', category: 'science' },
  sciencedaily: { source: 'ScienceDaily', category: 'science' },
  guardian: { source: 'The Guardian', category: 'world' },
};

const ARTICLE_LIBRARY: Array<Omit<NewsItem, 'id' | 'read' | 'saved'> & { sourceId: string; focus?: string[] }> = [
  {
    sourceId: 'techcrunch',
    source: 'TechCrunch',
    category: 'tech',
    title: 'AI copilots are shifting from autocomplete to autonomous workflows',
    url: 'https://techcrunch.com/',
    publishedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    summary: 'A new generation of developer agents is handling QA, refactors, and release chores with less human prompting.',
    focus: ['technology', 'tech_dev']
  },
  {
    sourceId: 'hn',
    source: 'Hacker News',
    category: 'tech',
    title: 'Why teams are moving internal tooling back toward boring architecture',
    url: 'https://news.ycombinator.com/',
    publishedAt: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
    summary: 'Senior engineers are favoring reliability, simple ops, and predictable delivery over framework churn.',
    focus: ['technology', 'tech_dev']
  },
  {
    sourceId: 'mit',
    source: 'MIT Tech Review',
    category: 'ai',
    title: 'Multimodal AI is turning daily knowledge work into a design problem',
    url: 'https://www.technologyreview.com/',
    publishedAt: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
    summary: 'The frontier is no longer raw capability alone. Product teams now compete on trust, UX, and orchestration.',
    focus: ['technology', 'tech_dev', 'business_lead']
  },
  {
    sourceId: 'uxc',
    source: 'UX Collective',
    category: 'design',
    title: 'Compact onboarding wins when it reduces commitment before value',
    url: 'https://uxdesign.cc/',
    publishedAt: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
    summary: 'The best flows shrink vertical sprawl, front-load confidence, and let users configure details later.',
    focus: ['design', 'creative_work']
  },
  {
    sourceId: 'frc',
    source: 'First Round Review',
    category: 'business',
    title: 'Operators are rebuilding weekly rituals around fewer, better signals',
    url: 'https://review.firstround.com/',
    publishedAt: new Date(Date.now() - 1000 * 60 * 145).toISOString(),
    summary: 'Leaders are cutting noisy dashboards and replacing them with curated summaries tied to concrete decisions.',
    focus: ['business', 'business_lead']
  },
  {
    sourceId: 'nature',
    source: 'Nature',
    category: 'science',
    title: 'Materials research is accelerating battery breakthroughs faster than expected',
    url: 'https://www.nature.com/',
    publishedAt: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
    summary: 'A wave of applied discoveries could shorten the distance between lab results and mainstream energy storage.',
    focus: ['science']
  },
  {
    sourceId: 'guardian',
    source: 'The Guardian',
    category: 'world',
    title: 'Policy shifts around AI and competition are reshaping product strategy',
    url: 'https://www.theguardian.com/',
    publishedAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    summary: 'Executives are increasingly forced to align launch plans with a rapidly changing global policy environment.',
    focus: ['business_lead', 'technology']
  },
];

const loadFeed = async (): Promise<NewsItem[]> => {
  const syncResult = typeof chrome !== 'undefined'
    ? await chrome.storage.sync.get(['settings', 'suyaSettings', 'userProfile'])
    : {};
  const localResult = typeof chrome !== 'undefined'
    ? await chrome.storage.local.get(['newsState', 'userProfile'])
    : {};

  const settings = (syncResult.settings || syncResult.suyaSettings || {}) as StoredSettings;
  const userProfile = (localResult.userProfile || syncResult.userProfile || {}) as StoredUserProfile;
  const newsState = (localResult.newsState || { readIds: [], savedIds: [] }) as NewsState;

  const configuredSourceIds = new Set<string>([
    ...(settings.newsSources || []),
    ...((userProfile.recommendedSources || []).map(source => source.id))
  ]);

  const fallbackFocus = userProfile.careerFocus || 'technology';
  const chosenArticles = ARTICLE_LIBRARY.filter(article => {
    if (configuredSourceIds.size > 0) {
      return configuredSourceIds.has(article.sourceId);
    }

    return article.focus?.includes(fallbackFocus) || article.category === 'tech';
  });

  const feed = (chosenArticles.length > 0 ? chosenArticles : ARTICLE_LIBRARY)
    .slice(0, 8)
    .map((article, index) => ({
      id: `${article.sourceId}-${index}`,
      title: article.title,
      source: article.source,
      category: article.category,
      url: article.url,
      publishedAt: article.publishedAt,
      summary: article.summary,
      read: newsState.readIds.includes(`${article.sourceId}-${index}`),
      saved: newsState.savedIds.includes(`${article.sourceId}-${index}`),
    }));

  return feed;
};

const NewsSection: React.FC<NewsSectionProps> = ({ className }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchNews = async () => {
      setLoading(true);
      const feed = await loadFeed();
      setNews(feed);
      setLoading(false);
    };

    fetchNews();
  }, []);

  const categories = Array.from(new Set(news.map(item => item.category)));
  const filteredNews = filter === 'all' 
    ? news 
    : news.filter(item => item.category === filter);

  const formatTimeAgo = (timestamp: string) => {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diff = now - time;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const markAsRead = (id: string) => {
    setNews(prev => {
      const next = prev.map(item => 
        item.id === id ? { ...item, read: true } : item
      );

      if (typeof chrome !== 'undefined') {
        const readIds = next.filter(item => item.read).map(item => item.id);
        const savedIds = next.filter(item => item.saved).map(item => item.id);
        chrome.storage.local.set({ newsState: { readIds, savedIds } });
      }

      return next;
    });
  };

  const toggleSaved = (id: string) => {
    setNews(prev => {
      const next = prev.map(item => 
        item.id === id ? { ...item, saved: !item.saved } : item
      );

      if (typeof chrome !== 'undefined') {
        const readIds = next.filter(item => item.read).map(item => item.id);
        const savedIds = next.filter(item => item.saved).map(item => item.id);
        chrome.storage.local.set({ newsState: { readIds, savedIds } });
      }

      return next;
    });
  };

  return (
    <section className={`news-section ${className || ''}`}>
      <div className="section-header">
        <h2>📰 Daily Briefing</h2>
        <div className="filter-tabs">
          <button 
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`filter-tab ${filter === cat ? 'active' : ''}`}
              onClick={() => setFilter(cat)}
              style={{ 
                '--category-color': CATEGORY_COLORS[cat] || CATEGORY_COLORS.default 
              } as React.CSSProperties}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="news-list">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Freshening up your news...</p>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="loading-state">
            <p>No curated sources yet. Finish onboarding or select sources in Settings.</p>
          </div>
        ) : (
          filteredNews.map(item => (
            <article 
              key={item.id} 
              className={`news-item ${item.read ? 'read' : ''}`}
            >
              <div className="news-header">
                <div className="source-info">
                  <span className="source">{item.source}</span>
                  <span className="category" style={{ 
                    backgroundColor: CATEGORY_COLORS[item.category] || CATEGORY_COLORS.default 
                  }}>
                    {item.category}
                  </span>
                </div>
                <div className="actions">
                  <button 
                    className="action-btn"
                    onClick={() => toggleSaved(item.id)}
                    aria-label={item.saved ? 'Unsave' : 'Save'}
                  >
                    {item.saved ? '🔖' : '📌'}
                  </button>
                  <button 
                    className="action-btn"
                    onClick={() => markAsRead(item.id)}
                    aria-label="Mark as read"
                  >
                    {item.read ? '✓' : '○'}
                  </button>
                </div>
              </div>
              
              <h3 className="news-title">
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
              </h3>
              
              {item.summary && (
                <p className="news-summary">{item.summary}</p>
              )}
              
              <div className="news-meta">
                <span className="time">{formatTimeAgo(item.publishedAt)}</span>
              </div>
            </article>
          ))
        )}
      </div>

      <style>{`
        .news-section {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .section-header h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
        }
        .filter-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .filter-tab {
          padding: 6px 12px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 20px;
          background: transparent;
          color: white;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .filter-tab:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .filter-tab.active {
          background: var(--category-color, #90A4AE);
          border-color: var(--category-color, #90A4AE);
        }
        .news-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px;
          gap: 16px;
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .news-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          transition: all 0.2s;
          border: 1px solid transparent;
        }
        .news-item:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .news-item.read {
          opacity: 0.7;
        }
        .news-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .source-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .source {
          font-size: 14px;
          opacity: 0.8;
        }
        .category {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          color: white;
        }
        .actions {
          display: flex;
          gap: 8px;
        }
        .action-btn {
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          color: white;
          cursor: pointer;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        .action-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .news-title {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 600;
          line-height: 1.4;
        }
        .news-title a {
          color: white;
          text-decoration: none;
        }
        .news-title a:hover {
          text-decoration: underline;
        }
        .news-summary {
          margin: 0 0 12px;
          font-size: 14px;
          opacity: 0.9;
          line-height: 1.5;
        }
        .news-meta {
          font-size: 12px;
          opacity: 0.7;
        }
      `}</style>
    </section>
  );
};

export default NewsSection;
