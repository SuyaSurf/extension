import React, { useState, useEffect } from 'react';
import { SuyaExpression, SuyaMode } from '@/components/SuyaBot';
import { UserProfile, NewsSource } from '../OnboardingFlow';

interface GrowthNewsDemoProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
  userProfile: Partial<UserProfile>;
}

interface GrowthInsight {
  type: 'deepen' | 'expand' | 'explore';
  explanation: string;
  relevance: number;
  skills: string[];
  actionItems: string[];
}

interface DemoArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: string;
  publishedAt: string;
  readTime: number;
  growthInsight: GrowthInsight;
  url: string;
}

const ARTICLE_POOL: Record<string, Array<Omit<DemoArticle, 'id' | 'source' | 'publishedAt' | 'growthInsight'>>> = {
  technology: [
    { title: 'The Rise of AI-Powered Dev Tools',          summary: 'How AI is transforming development with intelligent code completion, automated testing, and predictive debugging.',         category: 'technology', readTime: 5, url: '#' },
    { title: 'Microservices vs Monolith: 2024 Perspective',summary: 'A comprehensive analysis of when to choose microservices over monolithic architecture in modern software development.',  category: 'technology', readTime: 8, url: '#' },
    { title: 'WebAssembly: The Future of Web Performance', summary: 'Exploring how WebAssembly is enabling high-performance browser applications and its implications for developers.',           category: 'technology', readTime: 6, url: '#' },
  ],
  business: [
    { title: 'Strategic Leadership in the Digital Age',    summary: 'Essential strategies for leaders navigating digital transformation and technological disruption.',                          category: 'business',  readTime: 7, url: '#' },
    { title: 'Data-Driven Decision Making Framework',      summary: 'How to build and implement effective data analytics strategies for measurably better business outcomes.',                   category: 'business',  readTime: 6, url: '#' },
  ],
  design: [
    { title: 'UX Design Systems at Scale',                summary: 'Building and maintaining design systems that scale across multiple products and distributed teams.',                         category: 'design',    readTime: 5, url: '#' },
    { title: 'The Psychology of Interface Design',         summary: 'Cognitive psychology principles that drive effective user interface design decisions and reduce friction.',                  category: 'design',    readTime: 7, url: '#' },
  ],
  science: [
    { title: 'Quantum Computing Breakthroughs in 2024',   summary: 'Recent advances in quantum computing and their potential applications across industries from logistics to cryptography.',    category: 'science',   readTime: 8, url: '#' },
    { title: 'Climate Science: Latest Research Findings', summary: 'Comprehensive overview of latest climate change research and its implications for global policy and industry.',              category: 'science',   readTime: 10, url: '#' },
  ],
};

const INSIGHT_TEMPLATES: Record<string, GrowthInsight> = {
  deepen:  { type: 'deepen',  explanation: 'Advances your existing knowledge with advanced concepts.', relevance: 0, skills: ['Advanced Techniques','Industry Standards','Best Practices'], actionItems: ['Apply to current projects','Share with teammates','Build implementation plan'] },
  expand:  { type: 'expand',  explanation: 'Grows you into adjacent areas that complement your domain.', relevance: 0, skills: ['Cross-Domain Knowledge','New Perspectives','Broader Context'], actionItems: ['Explore related topics','Connect to current work','Spot collaboration opportunities'] },
  explore: { type: 'explore', explanation: 'Keeps you ahead of emerging trends and innovations.', relevance: 0, skills: ['Trend Awareness','Future Planning','Innovation Insight'], actionItems: ['Monitor developments','Evaluate adoption potential','Consider strategic impact'] },
};

const INSIGHT_TYPE_COLORS: Record<string, string> = {
  deepen:  'ob-tag--orange',
  expand:  'ob-tag--blue',
  explore: 'ob-tag--purple',
};

const SCAN_MSGS = ['Analysing your profile…', 'Curating relevant articles…', 'Calculating growth potential…', 'Personalising insights…'];

const GrowthNewsDemo: React.FC<GrowthNewsDemoProps> = ({ guideStep, nextStep, completeStep, userProfile }) => {
  const [articles, setArticles]    = useState<DemoArticle[]>([]);
  const [loading, setLoading]      = useState(true);
  const [scanStep, setScanStep]    = useState(0);
  const [expanded, setExpanded]    = useState<string | null>(null);

  const buildArticles = (): DemoArticle[] => {
    const { careerFocus, growthGoal, recommendedSources } = userProfile;
    const pool = ARTICLE_POOL[careerFocus as string] ?? ARTICLE_POOL.technology;
    const sources = (recommendedSources as NewsSource[] | undefined) ?? [];

    return pool.map((tpl, i) => {
      const goalKey = growthGoal as string ?? 'explore';
      const insight: GrowthInsight = {
        ...INSIGHT_TEMPLATES[goalKey] ?? INSIGHT_TEMPLATES.explore,
        explanation: (INSIGHT_TEMPLATES[goalKey] ?? INSIGHT_TEMPLATES.explore).explanation.replace('your domain', careerFocus as string ?? 'your domain'),
        relevance: 78 + Math.floor(Math.random() * 20),
      };
      return {
        id:          `a${i}`,
        source:      sources[i % Math.max(sources.length, 1)]?.name ?? 'Curated Source',
        publishedAt: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
        growthInsight: insight,
        ...tpl,
      };
    });
  };

  useEffect(() => {
    const run = async () => {
      guideStep('eating', 'Finding articles that will help you grow…');
      
      const built = buildArticles();
      setArticles(built);
      setLoading(false);
      guideStep('happy', `Found ${built.length} articles with high growth potential!`);
    };
    run();
  }, []);

  const finish = () => { completeStep('growth-demo'); guideStep('happy', 'Your personalised news system is live!'); nextStep(); };

  const avgRelevance = articles.length
    ? Math.round(articles.reduce((s, a) => s + a.growthInsight.relevance, 0) / articles.length)
    : 0;

  if (loading) return (
    <div className="gn-root ob-step-root">
      <header className="ob-col">
        <span className="ob-step-label">✦ Generating your feed</span>
        <h2 className="ob-step-title">Building your<br/>personalised news</h2>
      </header>
      <div className="gn-scan ob-stagger">
        {SCAN_MSGS.map((msg, i) => (
          <div key={msg} className={`gn-scan-row ${i < scanStep ? 'gn-scan-row--done' : i === scanStep ? 'gn-scan-row--active' : ''}`}>
            <span className="gn-scan-row__dot"/>
            <span className="gn-scan-row__text">{msg}</span>
            {i < scanStep && <span className="gn-scan-row__check">✓</span>}
          </div>
        ))}
      </div>
      <Styles/>
    </div>
  );

  return (
    <div className="gn-root ob-step-root">
      <header className="ob-col">
        <span className="ob-step-label">✦ Your personalised feed</span>
        <h2 className="ob-step-title">Growth news, curated<br/>for you</h2>
        <p className="ob-step-sub">
          Every article is scored for how much it helps you <strong>{userProfile.growthGoal}</strong> in <strong>{userProfile.careerFocus}</strong>.
        </p>
      </header>

      {/* Stats bar */}
      <div className="gn-stats ob-stagger">
        {[
          { label: 'Articles curated', value: articles.length },
          { label: 'Avg relevance',    value: `${avgRelevance}%` },
          { label: 'Strategy',         value: userProfile.growthGoal ?? '—' },
        ].map(s => (
          <div key={s.label} className="gn-stat ob-card">
            <span className="gn-stat__value">{s.value}</span>
            <span className="gn-stat__label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Articles */}
      <div className="gn-articles ob-stagger">
        {articles.map(a => {
          const isOpen = expanded === a.id;
          const ins    = a.growthInsight;
          return (
            <div key={a.id} className={`gn-article ob-card ${isOpen ? 'gn-article--open' : ''}`}>
              <div className="gn-article__top" onClick={() => setExpanded(isOpen ? null : a.id)}>
                <div className="gn-article__badges">
                  <span className="ob-tag ob-tag--orange">{a.source}</span>
                  <span className="ob-tag ob-tag--blue">{a.category}</span>
                  <span className={`ob-tag ${INSIGHT_TYPE_COLORS[ins.type]}`}>{ins.type}</span>
                </div>
                <div className="gn-article__relevance">
                  <div className="gn-relevance-bar">
                    <div className="gn-relevance-fill" style={{ width: `${ins.relevance}%` }}/>
                  </div>
                  <span className="gn-relevance-num">{ins.relevance}%</span>
                </div>
              </div>

              <h3 className="gn-article__title" onClick={() => setExpanded(isOpen ? null : a.id)}>
                {a.title}
              </h3>
              <p className="gn-article__summary">{a.summary}</p>

              <div className="gn-article__meta">
                <span className="gn-article__time">{a.readTime} min read</span>
                <span className="gn-article__date">{new Date(a.publishedAt).toLocaleDateString()}</span>
              </div>

              {isOpen && (
                <div className="gn-insight">
                  <p className="gn-insight__expl">{ins.explanation}</p>
                  <div className="gn-insight__cols">
                    <div>
                      <p className="gn-insight__sublabel">Skills gained</p>
                      <div className="gn-insight__tags">
                        {ins.skills.map(s => <span key={s} className="ob-tag ob-tag--amber">{s}</span>)}
                      </div>
                    </div>
                    <div>
                      <p className="gn-insight__sublabel">Action items</p>
                      <ul className="gn-insight__actions">
                        {ins.actionItems.map(a => <li key={a}>{a}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="gn-article__btns">
                <button className="ob-btn ob-btn--secondary" style={{ flex: 1 }}>Save for later</button>
                <button className="ob-btn ob-btn--primary"   style={{ flex: 1 }}>Read now →</button>
              </div>
            </div>
          );
        })}
      </div>

      <button className="ob-btn ob-btn--primary" style={{ alignSelf: 'flex-start' }} onClick={finish}>
        Continue to Quick Actions →
      </button>

      <Styles/>
    </div>
  );
};

const Styles = () => (
  <style>{`
    .gn-root { max-width: 680px; }

    /* Scan */
    .gn-scan { display: flex; flex-direction: column; gap: 8px; }
    .gn-scan-row {
      display: flex; align-items: center; gap: 12px;
      padding: 13px 16px; border-radius: var(--radius-md);
      border: 1px solid var(--border); background: var(--bg-card);
      transition: all .25s;
    }
    .gn-scan-row--active { border-color: var(--border-accent); background: rgba(255,107,53,.05); }
    .gn-scan-row--done   { opacity: .5; }
    .gn-scan-row__dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: rgba(255,255,255,.15); flex-shrink: 0; transition: background .2s;
    }
    .gn-scan-row--active .gn-scan-row__dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: gnPulse 1.2s ease-in-out infinite; }
    .gn-scan-row--done   .gn-scan-row__dot { background: var(--green); }
    @keyframes gnPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
    .gn-scan-row__text { flex: 1; font-family: var(--font-body); font-size: 13px; color: var(--text-secondary); }
    .gn-scan-row--active .gn-scan-row__text { color: var(--text-primary); }
    .gn-scan-row__check { font-size: 12px; font-weight: 700; color: var(--green); }

    /* Stats */
    .gn-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .gn-stat   { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px; cursor: default; }
    .gn-stat__value {
      font-family: var(--font-display); font-size: 22px; font-weight: 800;
      color: var(--accent-text); text-transform: capitalize;
    }
    .gn-stat__label { font-family: var(--font-body); font-size: 11px; color: var(--text-muted); text-align: center; }

    /* Articles */
    .gn-articles { display: flex; flex-direction: column; gap: 8px; }
    .gn-article {
      display: flex; flex-direction: column; gap: 10px;
      transition: border-color .2s !important;
    }
    .gn-article--open { border-color: var(--border-accent) !important; background: rgba(255,107,53,.03) !important; }
    .gn-article__top {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      cursor: pointer;
    }
    .gn-article__badges { display: flex; flex-wrap: wrap; gap: 5px; }

    .gn-relevance-bar {
      width: 80px; height: 4px; border-radius: 2px;
      background: rgba(255,255,255,.1); overflow: hidden;
    }
    .gn-relevance-fill {
      height: 100%; border-radius: 2px;
      background: linear-gradient(90deg, var(--accent), var(--accent-text));
      transition: width .6s var(--ease-out);
    }
    .gn-article__relevance { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
    .gn-relevance-num { font-family: var(--font-display); font-size: 12px; font-weight: 700; color: var(--accent-text); }

    .gn-article__title {
      font-family: var(--font-display); font-size: 15px; font-weight: 700;
      color: var(--text-primary); line-height: 1.35; cursor: pointer;
      transition: color .15s;
    }
    .gn-article__title:hover { color: var(--accent-text); }
    .gn-article__summary { font-family: var(--font-body); font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
    .gn-article__meta { display: flex; gap: 14px; }
    .gn-article__time,
    .gn-article__date { font-family: var(--font-body); font-size: 11px; color: var(--text-muted); }

    .gn-insight {
      border-top: 1px solid var(--border);
      padding-top: 12px;
      display: flex; flex-direction: column; gap: 12px;
      animation: obFadeUp .25s var(--ease-out) both;
    }
    .gn-insight__expl { font-family: var(--font-body); font-size: 13px; font-style: italic; color: var(--text-secondary); line-height: 1.55; }
    .gn-insight__cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .gn-insight__sublabel { font-family: var(--font-display); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
    .gn-insight__tags { display: flex; flex-wrap: wrap; gap: 5px; }
    .gn-insight__actions { list-style: none; display: flex; flex-direction: column; gap: 4px; }
    .gn-insight__actions li { font-family: var(--font-body); font-size: 12px; color: var(--text-secondary); padding-left: 14px; position: relative; line-height: 1.45; }
    .gn-insight__actions li::before { content: '›'; position: absolute; left: 0; color: var(--accent-text); }

    .gn-article__btns { display: flex; gap: 8px; }
  `}</style>
);

export { GrowthNewsDemo };
