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

/* ── Source registry ─────────────────────────────────────────────── */
const BASE_SOURCES: Record<string, Omit<NewsSource, 'growthReason' | 'priority'>[]> = {
  technology: [
    { id: 'techcrunch',  name: 'TechCrunch',   url: 'https://techcrunch.com/feed/', category: 'technology', primaryDomain: 'technology', adjacentDomain: 'business', type: 'rss' },
    { id: 'arstechnica', name: 'Ars Technica',  url: 'https://arstechnica.com/feed/', category: 'technology', primaryDomain: 'technology', adjacentDomain: 'science',  type: 'rss' },
    { id: 'hackernews',  name: 'Hacker News',   url: 'https://hnrss.org/frontpage', category: 'technology', primaryDomain: 'technology', adjacentDomain: 'business', type: 'rss' },
    { id: 'verge',       name: 'The Verge',     url: 'https://www.theverge.com/rss/index.xml', category: 'technology', primaryDomain: 'technology', adjacentDomain: 'design',   type: 'rss' },
    { id: 'wired',       name: 'Wired',         url: 'https://www.wired.com/feed/rss', category: 'technology', primaryDomain: 'technology', adjacentDomain: 'science',  type: 'rss' },
  ],
  business: [
    { id: 'bloomberg', name: 'Bloomberg',  url: 'https://www.bloomberg.com/feed/', category: 'business', primaryDomain: 'business', adjacentDomain: 'finance',    type: 'rss' },
    { id: 'wsj',       name: 'WSJ',        url: 'https://feeds.wsj.com/rss/wsj.com', category: 'business', primaryDomain: 'business', adjacentDomain: 'finance',  type: 'rss' },
    { id: 'forbes',    name: 'Forbes',     url: 'https://www.forbes.com/feed/', category: 'business', primaryDomain: 'business', adjacentDomain: 'technology',   type: 'rss' },
    { id: 'hbr',       name: 'HBR',        url: 'https://hbr.org/feed', category: 'business', primaryDomain: 'business', adjacentDomain: 'education',              type: 'rss' },
  ],
  science: [
    { id: 'nature',      name: 'Nature',       url: 'https://www.nature.com/nature.rss', category: 'science', primaryDomain: 'science', adjacentDomain: 'technology', type: 'rss' },
    { id: 'sciencedaily',name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', category: 'science', primaryDomain: 'science', adjacentDomain: 'education', type: 'rss' },
    { id: 'phys',        name: 'Phys.org',     url: 'https://phys.org/rss-feed/', category: 'science', primaryDomain: 'science', adjacentDomain: 'technology',        type: 'rss' },
  ],
  design: [
    { id: 'smashing',    name: 'Smashing Mag', url: 'https://www.smashingmagazine.com/feed/', category: 'design', primaryDomain: 'design', adjacentDomain: 'marketing',  type: 'rss' },
    { id: 'aiga',        name: 'AIGA Eye',     url: 'https://eyeondesign.aiga.org/feed/', category: 'design', primaryDomain: 'design', adjacentDomain: 'marketing',      type: 'rss' },
    { id: 'designmilk',  name: 'Design Milk',  url: 'https://design-milk.com/feed/', category: 'design', primaryDomain: 'design', adjacentDomain: 'technology',          type: 'rss' },
  ],
  marketing: [
    { id: 'adage',          name: 'Ad Age',   url: 'https://adage.com/feed', category: 'marketing', primaryDomain: 'marketing', adjacentDomain: 'business', type: 'rss' },
    { id: 'contentmkt',     name: 'CMI',      url: 'https://contentmarketinginstitute.com/feed/', category: 'marketing', primaryDomain: 'marketing', adjacentDomain: 'business', type: 'rss' },
  ],
  education: [
    { id: 'edutopia',  name: 'Edutopia',       url: 'https://www.edutopia.org/feed', category: 'education', primaryDomain: 'education', adjacentDomain: 'science',    type: 'rss' },
    { id: 'coursera',  name: 'Coursera Blog',  url: 'https://blog.coursera.org/feed', category: 'education', primaryDomain: 'education', adjacentDomain: 'technology', type: 'rss' },
  ],
  finance: [
    { id: 'seekingalpha', name: 'Seeking Alpha', url: 'https://seekingalpha.com/feed.xml', category: 'finance', primaryDomain: 'finance', adjacentDomain: 'business',   type: 'rss' },
    { id: 'marketwatch',  name: 'MarketWatch',   url: 'https://www.marketwatch.com/rss/topstories', category: 'finance', primaryDomain: 'finance', adjacentDomain: 'business', type: 'rss' },
  ],
};

const ADJACENT: Record<string, string[]> = {
  technology: ['business','science','design'],
  business:   ['technology','finance','marketing'],
  science:    ['technology','education'],
  design:     ['technology','marketing'],
  marketing:  ['business','design'],
  education:  ['science','technology'],
  finance:    ['business','technology'],
};

const CAT_COLORS: Record<string, string> = {
  technology:'ob-tag--blue', business:'ob-tag--orange', science:'ob-tag--green',
  design:'ob-tag--purple', marketing:'ob-tag--amber', education:'ob-tag--green', finance:'ob-tag--amber',
};

const SCAN_MSGS = ['Analysing your interests…','Finding relevant sources…','Calculating growth potential…','Personalising recommendations…'];

const PersonalizedNewsSetup: React.FC<PersonalizedNewsSetupProps> = ({
  guideStep, nextStep, completeStep, updateUserProfile, userProfile,
}) => {
  const [recommendations, setRecs]    = useState<NewsSource[]>([]);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [growthAreas, setGrowthAreas] = useState<GrowthArea[]>([]);
  const [loading, setLoading]         = useState(true);
  const [scanStep, setScanStep]       = useState(0);
  const [filter, setFilter]           = useState<string>('all');

  const growthReason = (src: NewsSource): string => {
    const { growthGoal, careerFocus } = userProfile;
    if (growthGoal === 'deepen' && src.primaryDomain === careerFocus) return `Deepens your expertise in ${src.primaryDomain}`;
    if (growthGoal === 'expand' && src.adjacentDomain) return `Expands you into ${src.adjacentDomain}`;
    return `Keeps you current on ${src.primaryDomain}`;
  };

  const calcPriority = (src: Omit<NewsSource,'growthReason'|'priority'>): number => {
    let p = 50;
    if (src.primaryDomain === userProfile.careerFocus) p += 30;
    if (userProfile.growthGoal === 'expand' && src.adjacentDomain === userProfile.careerFocus) p += 20;
    if (userProfile.contentTypes?.includes(src.primaryDomain)) p += 15;
    if (['hackernews','techcrunch','bloomberg'].includes(src.id)) p += 10;
    return Math.min(p, 100);
  };

  const buildSources = (): NewsSource[] => {
    const { careerFocus, growthGoal, interests } = userProfile;
    const pool: NewsSource[] = [];

    const addFrom = (domain: string, priorityOffset = 0) => {
      (BASE_SOURCES[domain] ?? []).forEach(s => {
        const full: NewsSource = { ...s, growthReason: growthReason(s as NewsSource), priority: calcPriority(s) + priorityOffset };
        pool.push(full);
      });
    };

    if (careerFocus) addFrom(careerFocus);
    if (growthGoal === 'expand' && careerFocus) {
      (ADJACENT[careerFocus] ?? []).forEach(d => addFrom(d, -10));
    }
    if (interests) {
      Object.keys(interests).filter(d => d !== careerFocus).forEach(d => addFrom(d, -20));
    }

    return pool
      .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i) // dedup
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 12);
  };

  useEffect(() => {
    const run = async () => {
      guideStep('eating', 'Finding the perfect news sources for your growth journey…');
      for (let i = 0; i < SCAN_MSGS.length; i++) {
        await new Promise(r => setTimeout(r, 520));
        setScanStep(i);
      }
      const built = buildSources();
      const areas = built.reduce<GrowthArea[]>((acc, src) => {
        const ex = acc.find(a => a.domain === src.primaryDomain);
        if (ex) ex.sources.push(src);
        else acc.push({ domain: src.primaryDomain, type: userProfile.growthGoal ?? 'explore', sources: [src], currentLevel: 1, targetLevel: 3, estimatedTime: '2–4 weeks' });
        return acc;
      }, []);
      setRecs(built);
      setGrowthAreas(areas);
      // pre-select top 6
      setSelected(new Set(built.slice(0, 6).map(s => s.id)));
      setLoading(false);
      guideStep('happy', `Found ${built.length} sources to help you ${userProfile.growthGoal}!`);
    };
    run();
  }, []);

  const toggleSource = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      guideStep('thinking', n.size > 0 ? `${n.size} source${n.size !== 1 ? 's' : ''} selected` : 'No sources selected yet');
      return n;
    });
  };

  const finish = () => {
    if (selected.size === 0) { guideStep('shocked', 'Pick at least one source to continue.'); return; }
    const chosen = recommendations.filter(s => selected.has(s.id));
    updateUserProfile({ recommendedSources: chosen, growthAreas });
    completeStep('news-setup');
    guideStep('happy', `${chosen.length} personalised sources are live!`);
    nextStep();
  };

  const allCategories = ['all', ...Array.from(new Set(recommendations.map(r => r.category)))];
  const visible = filter === 'all' ? recommendations : recommendations.filter(r => r.category === filter);

  if (loading) return (
    <div className="ns-root ob-step-root">
      <header className="ob-col">
        <span className="ob-step-label">✦ Building your feed</span>
        <h2 className="ob-step-title">Curating your<br/>news sources</h2>
      </header>
      <div className="ns-scan ob-stagger">
        {SCAN_MSGS.map((msg, i) => (
          <div key={msg} className={`ns-scan-row ${i < scanStep ? 'ns-scan-row--done' : i === scanStep ? 'ns-scan-row--active' : ''}`}>
            <span className="ns-scan-dot"/>
            <span className="ns-scan-text">{msg}</span>
            {i < scanStep && <span className="ns-scan-check">✓</span>}
          </div>
        ))}
      </div>
      <Styles/>
    </div>
  );

  return (
    <div className="ns-root ob-step-root">
      <header className="ob-col">
        <div className="ob-row">
          <span className="ob-step-label">✦ News sources</span>
          <span className="ob-tag ob-tag--orange" style={{ marginLeft: 'auto' }}>
            {selected.size} / {recommendations.length} selected
          </span>
        </div>
        <h2 className="ob-step-title">Your personalised<br/>source list</h2>
        <p className="ob-step-sub">
          Sources ranked by how much they'll help you <strong>{userProfile.growthGoal}</strong> in <strong>{userProfile.careerFocus}</strong>.
          Toggle any source on or off.
        </p>
      </header>

      {/* Growth areas */}
      {growthAreas.length > 0 && (
        <div className="ns-areas ob-stagger">
          {growthAreas.map(area => (
            <div key={area.domain} className="ns-area ob-card">
              <div className="ns-area__row">
                <span className="ns-area__name">{area.domain}</span>
                <span className={`ob-tag ${CAT_COLORS[area.domain] ?? 'ob-tag--blue'}`}>{area.type}</span>
              </div>
              <div className="ob-progress-track" style={{ marginTop: 8 }}>
                <div className="ob-progress-fill" style={{ width: `${(area.currentLevel / area.targetLevel) * 100}%` }}/>
              </div>
              <div className="ns-area__meta">
                <span>Level {area.currentLevel} / {area.targetLevel}</span>
                <span>{area.estimatedTime}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category filter + bulk actions */}
      <div className="ns-controls">
        <div className="ns-filters">
          {allCategories.map(cat => (
            <button
              key={cat}
              className={`ns-filter-pill ${filter === cat ? 'ns-filter-pill--active' : ''}`}
              onClick={() => setFilter(cat)}
            >{cat}</button>
          ))}
        </div>
        <div className="ob-row">
          <button className="ob-btn ob-btn--ghost" onClick={() => setSelected(new Set(recommendations.map(s => s.id)))}>All</button>
          <button className="ob-btn ob-btn--ghost" onClick={() => setSelected(new Set())}>None</button>
        </div>
      </div>

      {/* Source cards */}
      <div className="ns-grid ob-stagger">
        {visible.map(src => {
          const on = selected.has(src.id);
          return (
            <button
              key={src.id}
              className={`ns-source ob-card ${on ? 'ns-source--on' : ''}`}
              onClick={() => toggleSource(src.id)}
            >
              <div className="ns-source__head">
                <div className="ob-col" style={{ flex: 1, gap: 3 }}>
                  <span className="ns-source__name">{src.name}</span>
                  <span className={`ob-tag ${CAT_COLORS[src.category] ?? 'ob-tag--blue'}`} style={{ alignSelf: 'flex-start' }}>{src.category}</span>
                </div>
                <div className="ns-source__toggle">
                  <div className={`ob-toggle__track ${on ? 'ob-toggle__track--on' : ''}`}>
                    <div className="ob-toggle__thumb"/>
                  </div>
                </div>
              </div>

              {/* Match bar */}
              <div className="ns-match">
                <div className="ob-progress-track ns-match__bar">
                  <div className="ob-progress-fill" style={{ width: `${src.priority}%` }}/>
                </div>
                <span className="ns-match__label">{src.priority}% match</span>
              </div>

              {/* Growth reason */}
              <div className="ns-reason">
                <span className="ns-reason__icon">🌱</span>
                <span className="ns-reason__text">{src.growthReason}</span>
              </div>

              {/* Adjacent domain chip */}
              {src.adjacentDomain && (
                <div className="ns-source__adjacent">
                  <span className="ns-adj-label">+ covers</span>
                  <span className={`ob-tag ${CAT_COLORS[src.adjacentDomain] ?? 'ob-tag--blue'}`}>{src.adjacentDomain}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button
        className="ob-btn ob-btn--primary"
        style={{ alignSelf: 'flex-start' }}
        onClick={finish}
        disabled={selected.size === 0}
      >
        Continue with {selected.size} source{selected.size !== 1 ? 's' : ''} →
      </button>

      <Styles/>
    </div>
  );
};

const Styles = () => (
  <style>{`
    .ns-root { max-width: 700px; }

    /* Scan */
    .ns-scan { display: flex; flex-direction: column; gap: 8px; }
    .ns-scan-row {
      display: flex; align-items: center; gap: 12px;
      padding: 13px 16px; border-radius: var(--radius-md);
      border: 1px solid var(--border); background: var(--bg-card); transition: all .25s;
    }
    .ns-scan-row--active { border-color: var(--border-accent); background: rgba(255,107,53,.05); }
    .ns-scan-row--done   { opacity: .5; }
    .ns-scan-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: rgba(255,255,255,.15); flex-shrink: 0; transition: background .2s;
    }
    .ns-scan-row--active .ns-scan-dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: nsPulse 1.2s ease-in-out infinite; }
    .ns-scan-row--done   .ns-scan-dot { background: var(--green); }
    @keyframes nsPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
    .ns-scan-text { flex: 1; font-family: var(--font-body); font-size: 13px; color: var(--text-secondary); }
    .ns-scan-row--active .ns-scan-text { color: var(--text-primary); }
    .ns-scan-check { font-size: 12px; font-weight: 700; color: var(--green); }

    /* Growth areas */
    .ns-areas { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .ns-area   { display: flex; flex-direction: column; gap: 6px; cursor: default; }
    .ns-area__row { display: flex; align-items: center; justify-content: space-between; }
    .ns-area__name { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: var(--text-primary); text-transform: capitalize; }
    .ns-area__meta { display: flex; justify-content: space-between; font-family: var(--font-body); font-size: 10px; color: var(--text-muted); }

    /* Controls */
    .ns-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .ns-filters  { display: flex; flex-wrap: wrap; gap: 5px; }
    .ns-filter-pill {
      padding: 4px 12px; border-radius: 20px;
      background: none; border: 1px solid var(--border);
      font-family: var(--font-body); font-size: 11px; font-weight: 500;
      letter-spacing: .04em; text-transform: capitalize;
      color: var(--text-muted); cursor: pointer; transition: all .16s;
    }
    .ns-filter-pill:hover { border-color: var(--border-hover); color: var(--text-secondary); }
    .ns-filter-pill--active {
      background: rgba(255,107,53,.1);
      border-color: var(--border-accent);
      color: var(--accent-text);
    }

    /* Source grid */
    .ns-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
    .ns-source {
      display: flex; flex-direction: column; gap: 10px;
      text-align: left; cursor: pointer;
      transition: border-color .2s, background .2s, transform .15s !important;
    }
    .ns-source:hover   { transform: translateY(-1px); border-color: var(--border-hover) !important; }
    .ns-source--on     { border-color: var(--border-accent) !important; background: rgba(255,107,53,.04) !important; }

    .ns-source__head   { display: flex; align-items: flex-start; gap: 10px; }
    .ns-source__name   { font-family: var(--font-display); font-size: 14px; font-weight: 800; color: var(--text-primary); }
    .ns-source__toggle { flex-shrink: 0; margin-top: 2px; pointer-events: none; }

    .ns-match { display: flex; align-items: center; gap: 8px; }
    .ns-match__bar     { flex: 1; }
    .ns-match__label   { font-family: var(--font-display); font-size: 11px; font-weight: 700; color: var(--accent-text); white-space: nowrap; }

    .ns-reason { display: flex; align-items: flex-start; gap: 7px; }
    .ns-reason__icon   { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
    .ns-reason__text   { font-family: var(--font-body); font-size: 11px; color: var(--text-secondary); line-height: 1.5; }

    .ns-source__adjacent { display: flex; align-items: center; gap: 6px; }
    .ns-adj-label { font-family: var(--font-body); font-size: 10px; color: var(--text-muted); }

    @media (max-width: 480px) {
      .ns-grid  { grid-template-columns: 1fr; }
      .ns-areas { grid-template-columns: 1fr 1fr; }
    }
  `}</style>
);

export { PersonalizedNewsSetup };
