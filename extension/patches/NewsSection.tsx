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

const MOCK_NEWS: NewsItem[] = [
  {
    id: '1', title: 'AI models now reason across audio, video and text simultaneously',
    source: 'MIT Tech Review', category: 'ai', url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    summary: 'Multimodal reasoning reaches a new milestone as leading labs ship unified perception models.',
  },
  {
    id: '2', title: 'Design systems are eating the product org chart',
    source: 'UX Collective', category: 'design', url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 54).toISOString(),
    summary: 'How token-first design thinking is reshaping who owns visual decisions at scale.',
  },
  {
    id: '3', title: 'The hidden cost of context-switching in async teams',
    source: 'First Round Review', category: 'business', url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    summary: 'Deep research into how notification patterns silently degrade eng output.',
  },
  {
    id: '4', title: 'WebGPU lands in all major browsers — what it means for the web',
    source: 'Smashing Mag', category: 'tech', url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
  },
  {
    id: '5', title: 'Open-source LLMs close the capability gap on coding benchmarks',
    source: 'The Gradient', category: 'ai', url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 260).toISOString(),
  },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const NewsSection: React.FC<NewsSectionProps> = ({ className = '' }) => {
  const [items, setItems]         = useState<NewsItem[]>(MOCK_NEWS);
  const [activeCategory, setCat]  = useState<string>('all');
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  const categories = ['all', ...Array.from(new Set(items.map(i => i.category)))];

  const visible = activeCategory === 'all'
    ? items
    : items.filter(i => i.category === activeCategory);

  const markRead = (id: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, read: true } : i));

  const toggleSave = (id: string) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, saved: !i.saved } : i));

  // In production, fetch from background aggregator via chrome.runtime.sendMessage
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className={`news-section ${className}`}>
      <header className="section-header">
        <h2 className="section-title">
          <span className="title-icon">📰</span> Your Feed
        </h2>
        <button className="refresh-btn" onClick={() => {}} aria-label="Refresh feed">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M12.5 2.5A6 6 0 1 0 13 7" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round"/>
            <path d="M10 0.5L13 2.5L10 4.5" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </header>

      {/* Category pills */}
      <div className="category-pills" role="tablist">
        {categories.map(cat => (
          <button
            key={cat}
            role="tab"
            aria-selected={activeCategory === cat}
            className={`pill ${activeCategory === cat ? 'pill--active' : ''}`}
            style={activeCategory === cat
              ? { borderColor: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.default,
                  color: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.default }
              : {}}
            onClick={() => setCat(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="news-list" role="list">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="news-skeleton" style={{ animationDelay: `${i * 80}ms` }}/>
            ))
          : visible.map(item => (
              <article
                key={item.id}
                role="listitem"
                className={`news-item ${item.read ? 'news-item--read' : ''} ${expanded === item.id ? 'news-item--expanded' : ''}`}
              >
                <div className="news-item__row"
                  onClick={() => { setExpanded(expanded === item.id ? null : item.id); markRead(item.id); }}>
                  <span
                    className="news-cat-dot"
                    style={{ background: CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.default }}
                    title={item.category}
                  />
                  <span className="news-title">{item.title}</span>
                  <div className="news-meta">
                    <span className="news-source">{item.source}</span>
                    <span className="news-time">{timeAgo(item.publishedAt)}</span>
                  </div>
                </div>

                {expanded === item.id && item.summary && (
                  <div className="news-summary">{item.summary}</div>
                )}

                <div className="news-actions">
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="news-action-btn" onClick={() => markRead(item.id)}>
                    Read →
                  </a>
                  <button
                    className={`news-action-btn ${item.saved ? 'news-action-btn--saved' : ''}`}
                    onClick={() => toggleSave(item.id)}
                  >
                    {item.saved ? '★ Saved' : '☆ Save'}
                  </button>
                </div>
              </article>
            ))
        }
      </div>

      <style>{`
        .news-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .section-title {
          font-family: 'Syne', sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: rgba(255,255,255,.5);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .title-icon { font-size: 15px; }
        .refresh-btn {
          background: none;
          border: none;
          color: rgba(255,255,255,.3);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: color .2s;
        }
        .refresh-btn:hover { color: rgba(255,255,255,.7); }
        .category-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .pill {
          padding: 3px 10px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.12);
          background: none;
          color: rgba(255,255,255,.35);
          font-family: 'DM Sans', sans-serif;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: .04em;
          text-transform: capitalize;
          cursor: pointer;
          transition: border-color .2s, color .2s, background .2s;
        }
        .pill:hover { color: rgba(255,255,255,.7); border-color: rgba(255,255,255,.3); }
        .pill--active { background: rgba(255,107,53,.08); }
        .news-list { display: flex; flex-direction: column; gap: 2px; }
        .news-skeleton {
          height: 52px;
          border-radius: 8px;
          background: linear-gradient(90deg, rgba(255,255,255,.04) 0%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 100%);
          background-size: 200% 100%;
          animation: shimmer 1.4s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .news-item {
          border-radius: 8px;
          padding: 10px 12px;
          background: rgba(255,255,255,.03);
          border: 1px solid transparent;
          transition: background .18s, border-color .18s;
          cursor: pointer;
        }
        .news-item:hover { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.08); }
        .news-item--read { opacity: .6; }
        .news-item--expanded { border-color: rgba(255,107,53,.25); background: rgba(255,107,53,.04); }
        .news-item__row {
          display: grid;
          grid-template-columns: 8px 1fr auto;
          align-items: center;
          gap: 10px;
        }
        .news-cat-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .news-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 400;
          color: rgba(255,255,255,.85);
          line-height: 1.4;
        }
        .news-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          flex-shrink: 0;
        }
        .news-source {
          font-size: 10px;
          font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,.3);
        }
        .news-time {
          font-size: 10px;
          font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,.22);
        }
        .news-summary {
          margin-top: 8px;
          font-size: 12px;
          font-family: 'DM Sans', sans-serif;
          font-style: italic;
          color: rgba(255,255,255,.5);
          line-height: 1.55;
          padding-left: 18px;
        }
        .news-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          padding-left: 18px;
        }
        .news-action-btn {
          background: none;
          border: none;
          font-size: 11px;
          font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,.35);
          cursor: pointer;
          padding: 2px 0;
          transition: color .15s;
          text-decoration: none;
        }
        .news-action-btn:hover { color: rgba(255,255,255,.75); }
        .news-action-btn--saved { color: #FFB74D; }
      `}</style>
    </section>
  );
};

export default NewsSection;
