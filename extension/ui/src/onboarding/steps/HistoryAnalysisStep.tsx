import React, { useState } from 'react';
import { SuyaExpression, SuyaMode } from '@/components/SuyaBot';
import { UserProfile, InterestData, BrowsingPatterns, OnboardingState } from '../OnboardingFlow';

interface HistoryAnalysisStepProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  onboardingState: OnboardingState;
}

type Phase = 'idle' | 'requesting' | 'scanning' | 'complete' | 'manual';

const INTEREST_CATEGORIES: Record<string, string[]> = {
  technology: ['github','stackoverflow','developer','programming','coding','tech','software','javascript','python','react','node','api','framework'],
  business:   ['linkedin','bloomberg','forbes','business','startup','entrepreneur','marketing','sales','finance','investment','economy'],
  science:    ['nature','science','research','journal','academic','study','experiment','data','analysis','physics','biology','chemistry'],
  design:     ['dribbble','behance','figma','design','ui','ux','creative','art','visual','interface','prototype','color'],
  marketing:  ['marketing','advertising','seo','social media','content','campaign','brand','conversion','analytics','engagement'],
  education:  ['coursera','udemy','edx','learning','course','tutorial','education','study','skill','training','certification'],
  finance:    ['finance','investing','trading','stock','crypto','banking','money','budget','financial','wealth','portfolio'],
};

const CATEGORY_ICONS: Record<string, string> = {
  technology: '💻', business: '📊', science: '🔬',
  design: '🎨', marketing: '📣', education: '🎓', finance: '💰',
};

const SCAN_STEPS = ['Collecting history…', 'Categorising interests…', 'Analysing patterns…', 'Generating insights…'];

const HistoryAnalysisStep: React.FC<HistoryAnalysisStepProps> = ({
  guideStep, nextStep, completeStep, updateUserProfile,
}) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [scanStep, setScanStep] = useState(0);
  const [result, setResult] = useState<{
    interests: Record<string, InterestData[]>;
    patterns: BrowsingPatterns;
    summary: string;
  } | null>(null);
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set());

  const categoriseUrl = (url: string, title: string): string | null => {
    const text = `${url} ${title}`.toLowerCase();
    for (const [cat, kw] of Object.entries(INTEREST_CATEGORIES)) {
      if (kw.some(k => text.includes(k))) return cat;
    }
    return null;
  };

  const runAnalysis = async () => {
    for (let i = 0; i < SCAN_STEPS.length; i++) {
      await new Promise(r => setTimeout(r, 650));
      setScanStep(i);
    }

    try {
      const history = await chrome.history.search({ text: '', startTime: Date.now() - 30 * 24 * 60 * 60 * 1000, maxResults: 1000 });
      const interests: Record<string, InterestData[]> = {};
      const domainCounts: Record<string, number> = {};
      const hourCounts: Record<number, number> = {};

      history.forEach(item => {
        const cat = categoriseUrl(item.url ?? '', item.title ?? '');
        if (!cat) return;
        (interests[cat] ??= []).push({ url: item.url ?? '', title: item.title ?? '', visitCount: item.visitCount ?? 1, lastVisitTime: item.lastVisitTime ?? Date.now(), category: cat });
        try {
          const d = new URL(item.url ?? '').hostname;
          domainCounts[d] = (domainCounts[d] ?? 0) + (item.visitCount ?? 1);
        } catch {}
        const h = new Date(item.lastVisitTime ?? Date.now()).getHours();
        hourCounts[h] = (hourCounts[h] ?? 0) + 1;
      });

      Object.values(interests).forEach(arr => arr.sort((a, b) => b.visitCount - a.visitCount));

      const topDomains = Object.entries(domainCounts).sort(([,a],[,b]) => b-a).slice(0,10).map(([d]) => d);
      const peakHours  = Object.entries(hourCounts).sort(([,a],[,b]) => b-a).slice(0,3).map(([h]) => +h);
      const topCats    = Object.entries(interests).sort(([,a],[,b]) => b.length-a.length).slice(0,3).map(([c]) => c);

      const res = {
        interests,
        patterns: { mostVisitedDomains: topDomains, peakActivityHours: peakHours, contentPreferences: topCats, sessionDuration: 0 },
        summary: `Most active in ${topCats.join(', ')} — frequently visiting ${topDomains.slice(0,3).join(', ')}.`,
      };
      setResult(res);
      updateUserProfile({ interests: res.interests, patterns: res.patterns });
      setPhase('complete');
      guideStep('happy', res.summary);
    } catch {
      setPhase('manual');
      guideStep('shocked', "History analysis hit a snag — let's set this up manually.");
    }
  };

  const startAnalysis = async () => {
    try {
      const has = await chrome.permissions.contains({ permissions: ['history'] });
      if (!has) {
        setPhase('requesting');
        guideStep('thinking', 'I need permission to read your browsing history for personalisation.');
        const granted = await chrome.permissions.request({ permissions: ['history'] });
        if (!granted) { setPhase('manual'); guideStep('neutral', 'No problem — let\'s set up interests manually.'); return; }
        guideStep('happy', 'Thanks! Analysing now…');
      }
      setPhase('scanning');
      guideStep('eating', 'Scanning your browsing patterns to understand what drives you…');
      await runAnalysis();
    } catch {
      setPhase('manual');
      guideStep('shocked', "Permission request failed — using manual setup.");
    }
  };

  const toggleManual = (cat: string) =>
    setManualSelected(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  const finish = () => {
    completeStep('history-analysis');
    guideStep('happy', "Great! Now let's sharpen your growth goals.");
    nextStep();
  };

  /* ── Phases ── */
  if (phase === 'idle') return (
    <div className="ha-root ob-step-root">
      <header className="ob-col">
        <span className="ob-step-label">✦ Interest discovery</span>
        <h2 className="ob-step-title">Uncover your interests</h2>
        <p className="ob-step-sub">
          I can scan your last 30 days of browsing to map what topics you're naturally drawn to —
          then curate news that accelerates your growth in those areas.
        </p>
      </header>

      <div className="ha-benefits ob-stagger">
        {[
          { icon: '🎯', title: 'Pinpoint curation',   body: 'Content selected specifically for your professional growth' },
          { icon: '📈', title: 'Growth-oriented',     body: 'Articles that expand and deepen your knowledge' },
          { icon: '🔒', title: 'Privacy first',       body: 'Analysis stays local — you stay in control' },
        ].map(b => (
          <div key={b.title} className="ob-card ha-benefit">
            <span className="ha-benefit__icon">{b.icon}</span>
            <div>
              <p className="ha-benefit__title">{b.title}</p>
              <p className="ha-benefit__body">{b.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="ob-row">
        <button className="ob-btn ob-btn--primary" onClick={startAnalysis}>Analyse My Interests →</button>
        <button className="ob-btn ob-btn--secondary" onClick={() => { setPhase('manual'); guideStep('neutral', "Let's set things up manually."); }}>Set Up Manually</button>
      </div>
      <Styles/>
    </div>
  );

  if (phase === 'requesting') return (
    <div className="ha-root ob-step-root">
      <header className="ob-col">
        <span className="ob-step-label">✦ Permission needed</span>
        <h2 className="ob-step-title">One quick permission</h2>
        <p className="ob-step-sub">Chrome will ask you to allow browsing history access. Here's exactly what I look at:</p>
      </header>
      <div className="ha-permission-grid ob-stagger">
        <div className="ob-card ha-perm-block ha-perm-block--green">
          <p className="ha-perm-block__head">✓ What I'll analyse</p>
          {['Website domains you visit often','Content categories you engage with','Your peak activity hours'].map(t => <p key={t} className="ha-perm-block__item">{t}</p>)}
        </div>
        <div className="ob-card ha-perm-block ha-perm-block--red">
          <p className="ha-perm-block__head">✗ What I won't touch</p>
          {['Private / incognito data','Specific page content','Any personal information'].map(t => <p key={t} className="ha-perm-block__item">{t}</p>)}
        </div>
      </div>
      <div className="ha-waiting">
        <span className="ha-pulse"/>
        <span className="ha-waiting__text">Waiting for Chrome permission prompt…</span>
      </div>
      <Styles/>
    </div>
  );

  if (phase === 'scanning') return (
    <div className="ha-root ob-step-root">
      <header className="ob-col">
        <span className="ob-step-label">✦ Scanning</span>
        <h2 className="ob-step-title">Reading the patterns…</h2>
        <p className="ob-step-sub">I'm categorising your browsing activity to build your interest profile.</p>
      </header>
      <div className="ha-scan-steps ob-stagger">
        {SCAN_STEPS.map((step, i) => (
          <div key={step} className={`ha-scan-step ${i < scanStep ? 'ha-scan-step--done' : i === scanStep ? 'ha-scan-step--active' : ''}`}>
            <span className="ha-scan-step__dot"/>
            <span className="ha-scan-step__label">{step}</span>
            {i < scanStep && <span className="ha-scan-step__check">✓</span>}
          </div>
        ))}
      </div>
      <Styles/>
    </div>
  );

  if (phase === 'complete' && result) return (
    <div className="ha-root ob-step-root">
      <header className="ob-col">
        <span className="ob-step-label">✦ Analysis complete</span>
        <h2 className="ob-step-title">Your interest profile</h2>
        <p className="ob-step-sub">{result.summary}</p>
      </header>

      <div className="ha-results ob-stagger">
        {Object.entries(result.interests).sort(([,a],[,b]) => b.length-a.length).slice(0,5).map(([cat, items]) => (
          <div key={cat} className="ob-card ha-interest-card">
            <div className="ha-interest-card__head">
              <span className="ha-interest-card__icon">{CATEGORY_ICONS[cat] ?? '📌'}</span>
              <span className="ha-interest-card__name">{cat}</span>
              <span className="ob-tag ob-tag--orange">{items.length} visits</span>
            </div>
            <div className="ha-interest-card__sites">
              {items.slice(0,3).map(item => {
                try { return <span key={item.url} className="ha-site-chip">{new URL(item.url).hostname.replace('www.','')}</span>; }
                catch { return null; }
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="ob-card ha-patterns">
        <p className="ha-patterns__label">Browsing patterns</p>
        <div className="ha-patterns__row">
          <div>
            <p className="ha-patterns__sublabel">Most visited</p>
            <div className="ha-patterns__pills">
              {result.patterns.mostVisitedDomains.slice(0,5).map(d => <span key={d} className="ha-site-chip">{d}</span>)}
            </div>
          </div>
          <div>
            <p className="ha-patterns__sublabel">Peak activity</p>
            <div className="ha-patterns__pills">
              {result.patterns.peakActivityHours.map(h => <span key={h} className="ha-site-chip">{h}:00</span>)}
            </div>
          </div>
        </div>
      </div>

      <button className="ob-btn ob-btn--primary" onClick={finish}>Continue to Personalisation →</button>
      <Styles/>
    </div>
  );

  /* manual */
  return (
    <div className="ha-root ob-step-root">
      <header className="ob-col">
        <span className="ob-step-label">✦ Manual setup</span>
        <h2 className="ob-step-title">Pick your interests</h2>
        <p className="ob-step-sub">Select the topics you care about — I'll curate content across all of them.</p>
      </header>

      <div className="ha-manual-grid ob-stagger">
        {Object.keys(INTEREST_CATEGORIES).map(cat => (
          <button
            key={cat}
            className={`ha-manual-item ${manualSelected.has(cat) ? 'ha-manual-item--on' : ''}`}
            onClick={() => toggleManual(cat)}
          >
            <span className="ha-manual-item__icon">{CATEGORY_ICONS[cat] ?? '📌'}</span>
            <span className="ha-manual-item__name">{cat}</span>
            {manualSelected.has(cat) && <span className="ha-manual-item__check">✓</span>}
          </button>
        ))}
      </div>

      <button className="ob-btn ob-btn--primary" onClick={finish} disabled={manualSelected.size === 0}>
        Continue ({manualSelected.size} selected) →
      </button>
      <Styles/>
    </div>
  );
};

const Styles = () => (
  <style>{`
    .ha-root { max-width: 640px; }

    /* Benefits */
    .ha-benefits { display: flex; flex-direction: column; gap: 8px; }
    .ha-benefit  { display: flex; align-items: flex-start; gap: 14px; cursor: default; }
    .ha-benefit__icon  { font-size: 20px; flex-shrink: 0; margin-top: 2px; }
    .ha-benefit__title { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }
    .ha-benefit__body  { font-family: var(--font-body); font-size: 12px; color: var(--text-secondary); line-height: 1.5; }

    /* Permission blocks */
    .ha-permission-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .ha-perm-block { display: flex; flex-direction: column; gap: 8px; cursor: default; }
    .ha-perm-block__head {
      font-family: var(--font-display); font-size: 12px; font-weight: 700;
    }
    .ha-perm-block--green .ha-perm-block__head { color: var(--green); }
    .ha-perm-block--red   .ha-perm-block__head { color: var(--red);   }
    .ha-perm-block__item  { font-family: var(--font-body); font-size: 12px; color: var(--text-secondary); line-height: 1.5; }

    /* Waiting */
    .ha-waiting { display: flex; align-items: center; gap: 12px; }
    .ha-pulse {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--accent); flex-shrink: 0;
      animation: haPulse 1.4s ease-in-out infinite;
    }
    @keyframes haPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.4; transform:scale(.7); } }
    .ha-waiting__text { font-family: var(--font-body); font-size: 13px; color: var(--text-secondary); }

    /* Scan steps */
    .ha-scan-steps { display: flex; flex-direction: column; gap: 10px; }
    .ha-scan-step {
      display: flex; align-items: center; gap: 12px;
      padding: 13px 16px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: var(--bg-card);
      transition: all .25s;
    }
    .ha-scan-step--active { border-color: var(--border-accent); background: rgba(255,107,53,.05); }
    .ha-scan-step--done   { opacity: .55; }
    .ha-scan-step__dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: rgba(255,255,255,.15); flex-shrink: 0; transition: background .2s;
    }
    .ha-scan-step--active .ha-scan-step__dot {
      background: var(--accent); box-shadow: 0 0 8px var(--accent);
      animation: haPulse 1.2s ease-in-out infinite;
    }
    .ha-scan-step--done .ha-scan-step__dot { background: var(--green); }
    .ha-scan-step__label {
      flex: 1; font-family: var(--font-body); font-size: 13px; color: var(--text-secondary);
    }
    .ha-scan-step--active .ha-scan-step__label { color: var(--text-primary); }
    .ha-scan-step__check  { font-size: 12px; color: var(--green); font-weight: 700; }

    /* Results */
    .ha-results { display: flex; flex-direction: column; gap: 6px; }
    .ha-interest-card { cursor: default; }
    .ha-interest-card__head {
      display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
    }
    .ha-interest-card__icon { font-size: 18px; }
    .ha-interest-card__name {
      flex: 1; font-family: var(--font-display); font-size: 13px; font-weight: 700;
      color: var(--text-primary); text-transform: capitalize;
    }
    .ha-interest-card__sites { display: flex; flex-wrap: wrap; gap: 5px; }

    .ha-site-chip {
      padding: 3px 9px; border-radius: 20px;
      background: rgba(255,255,255,.06); border: 1px solid var(--border);
      font-family: var(--font-body); font-size: 11px; color: var(--text-secondary);
    }

    /* Patterns card */
    .ha-patterns { cursor: default; }
    .ha-patterns__label {
      font-family: var(--font-display); font-size: 11px; font-weight: 700;
      letter-spacing: .08em; text-transform: uppercase;
      color: var(--text-muted); margin-bottom: 14px;
    }
    .ha-patterns__row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .ha-patterns__sublabel {
      font-family: var(--font-body); font-size: 11px; color: var(--text-muted); margin-bottom: 6px;
    }
    .ha-patterns__pills { display: flex; flex-wrap: wrap; gap: 5px; }

    /* Manual grid */
    .ha-manual-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
    .ha-manual-item {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 16px 12px; position: relative;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius-md); cursor: pointer;
      transition: all .18s;
    }
    .ha-manual-item:hover { background: var(--bg-card-hover); border-color: var(--border-hover); }
    .ha-manual-item--on   { border-color: var(--border-accent) !important; background: rgba(255,107,53,.06) !important; }
    .ha-manual-item__icon { font-size: 24px; }
    .ha-manual-item__name {
      font-family: var(--font-display); font-size: 12px; font-weight: 700;
      text-transform: capitalize; color: var(--text-secondary);
    }
    .ha-manual-item--on .ha-manual-item__name { color: var(--accent-text); }
    .ha-manual-item__check {
      position: absolute; top: 8px; right: 9px;
      font-size: 10px; font-weight: 700; color: var(--accent-text);
    }
    @media (max-width: 500px) {
      .ha-permission-grid { grid-template-columns: 1fr; }
    }
  `}</style>
);

export { HistoryAnalysisStep };
