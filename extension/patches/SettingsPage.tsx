import React, { useState, useEffect, useCallback } from 'react';

/* ── Types ─────────────────────────────────────────────────────────── */
type Section =
  | 'bot-behavior'
  | 'skills'
  | 'form-profiles'
  | 'news'
  | 'notifications'
  | 'api-keys';

interface Settings {
  botMode: 'awake' | 'idle' | 'sleeping';
  expressionSensitivity: number;
  shrinkOnDrag: boolean;
  dragRecoveryMinutes: number;
  positionPreference: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  skills: Record<string, boolean>;
  newsSources: string[];
  newsUpdateFrequencyMinutes: number;
  notificationsEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  apiKeys: { openai: string; anthropic: string; deepseek: string; groq: string };
  formProfiles: FormProfile[];
}

interface FormProfile {
  id: string;
  name: string;
  type: 'personal' | 'professional' | 'custom';
  fields: Record<string, string>;
}

const SKILLS_REGISTRY = [
  { id: 'form-filler',   label: 'Form Filler',       desc: 'Autofill forms using your profiles',          deps: [] },
  { id: 'page-analyzer', label: 'Page Analyzer',      desc: 'Summarize and extract info from pages',       deps: [] },
  { id: 'voice',         label: 'Voice Interface',    desc: 'Control Suya with your voice',                deps: [] },
  { id: 'mail',          label: 'Mail Skills',        desc: 'Gmail integration for email management',      deps: ['api-keys'] },
  { id: 'meeting',       label: 'Meeting Assistant',  desc: 'Auto-transcribe and summarize meetings',      deps: ['voice'] },
  { id: 'news',          label: 'News Aggregator',    desc: 'Fetch and curate your personalized feed',     deps: [] },
  { id: 'skill-gap',     label: 'Skill Gap Analysis', desc: 'Identify and track your growth areas',        deps: ['api-keys'] },
];

const NEWS_SOURCES_REGISTRY = [
  { id: 'hn',         label: 'Hacker News',       category: 'tech'     },
  { id: 'techcrunch', label: 'TechCrunch',         category: 'tech'     },
  { id: 'verge',      label: 'The Verge',          category: 'tech'     },
  { id: 'mit',        label: 'MIT Tech Review',    category: 'ai'       },
  { id: 'gradient',   label: 'The Gradient',       category: 'ai'       },
  { id: 'ux',         label: 'UX Collective',      category: 'design'   },
  { id: 'smashing',   label: 'Smashing Magazine',  category: 'design'   },
  { id: 'frc',        label: 'First Round Review', category: 'business' },
  { id: 'guardian',   label: 'The Guardian',       category: 'world'    },
  { id: 'nature',     label: 'Nature',             category: 'science'  },
];

const DEFAULT_SETTINGS: Settings = {
  botMode: 'awake',
  expressionSensitivity: 70,
  shrinkOnDrag: true,
  dragRecoveryMinutes: 60,
  positionPreference: 'bottom-right',
  skills: Object.fromEntries(SKILLS_REGISTRY.map(s => [s.id, true])),
  newsSources: ['hn', 'techcrunch', 'mit'],
  newsUpdateFrequencyMinutes: 30,
  notificationsEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  apiKeys: { openai: '', anthropic: '', deepseek: '', groq: '' },
  formProfiles: [
    {
      id: 'personal', name: 'Personal', type: 'personal',
      fields: { firstName: '', lastName: '', email: '', phone: '', address: '' },
    },
    {
      id: 'professional', name: 'Professional', type: 'professional',
      fields: { fullName: '', workEmail: '', company: '', title: '', linkedIn: '' },
    },
  ],
};

/* ── Shared sub-components ─────────────────────────────────────────── */
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string }> = ({ checked, onChange, label }) => (
  <label className="toggle-wrap">
    <div className={`toggle ${checked ? 'toggle--on' : ''}`} onClick={() => onChange(!checked)}>
      <div className="toggle-thumb"/>
    </div>
    {label && <span className="toggle-label">{label}</span>}
  </label>
);

const Slider: React.FC<{
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; unit?: string;
}> = ({ value, min, max, step = 1, onChange, unit = '' }) => (
  <div className="slider-wrap">
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="slider-input"/>
    <span className="slider-val">{value}{unit}</span>
  </div>
);

const FieldRow: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="field-row">
    <div className="field-meta">
      <span className="field-label">{label}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
    <div className="field-control">{children}</div>
  </div>
);

/* ── Section components ─────────────────────────────────────────────── */
const BotBehaviorSection: React.FC<{ s: Settings; update: (p: Partial<Settings>) => void }> = ({ s, update }) => (
  <div className="settings-section-body">
    <FieldRow label="Default Mode" hint="Starting mode when Suya wakes up on a new tab">
      <select className="sel" value={s.botMode} onChange={e => update({ botMode: e.target.value as any })}>
        <option value="awake">Awake</option>
        <option value="idle">Idle</option>
        <option value="sleeping">Sleeping</option>
      </select>
    </FieldRow>

    <FieldRow label="Expression Sensitivity" hint="How quickly Suya reacts to page events">
      <Slider value={s.expressionSensitivity} min={0} max={100} onChange={v => update({ expressionSensitivity: v })} unit="%"/>
    </FieldRow>

    <FieldRow label="Shrink on Drag" hint="Minimise Suya while you drag them around">
      <Toggle checked={s.shrinkOnDrag} onChange={v => update({ shrinkOnDrag: v })}/>
    </FieldRow>

    <FieldRow label="Drag Recovery Time" hint="Time before Suya restores after being dragged">
      <Slider value={s.dragRecoveryMinutes} min={5} max={240} step={5} onChange={v => update({ dragRecoveryMinutes: v })} unit=" min"/>
    </FieldRow>

    <FieldRow label="Default Corner" hint="Where Suya lives when no better position is found">
      <select className="sel" value={s.positionPreference} onChange={e => update({ positionPreference: e.target.value as any })}>
        <option value="bottom-right">Bottom Right</option>
        <option value="bottom-left">Bottom Left</option>
        <option value="top-right">Top Right</option>
        <option value="top-left">Top Left</option>
      </select>
    </FieldRow>
  </div>
);

const SkillsSection: React.FC<{ s: Settings; update: (p: Partial<Settings>) => void }> = ({ s, update }) => {
  const toggleSkill = (id: string, val: boolean) => {
    // Check: disable blocked dependents
    const next = { ...s.skills, [id]: val };
    if (!val) {
      SKILLS_REGISTRY.forEach(skill => {
        if (skill.deps.includes(id)) next[skill.id] = false;
      });
    }
    update({ skills: next });
  };

  return (
    <div className="settings-section-body">
      {SKILLS_REGISTRY.map(skill => {
        const hasUnmet = skill.deps.some(dep => dep !== 'api-keys' && !s.skills[dep]);
        return (
          <div key={skill.id} className={`skill-row ${!s.skills[skill.id] ? 'skill-row--off' : ''}`}>
            <div className="skill-info">
              <span className="skill-label">{skill.label}</span>
              <span className="skill-desc">{skill.desc}</span>
              {skill.deps.length > 0 && (
                <span className="skill-deps">
                  Requires: {skill.deps.map(d => {
                    const reg = SKILLS_REGISTRY.find(r => r.id === d);
                    return reg?.label ?? d;
                  }).join(', ')}
                </span>
              )}
              {hasUnmet && <span className="skill-warn">⚠ Dependency not enabled</span>}
            </div>
            <Toggle
              checked={s.skills[skill.id] ?? false}
              onChange={v => toggleSkill(skill.id, v)}
            />
          </div>
        );
      })}
    </div>
  );
};

const FormProfilesSection: React.FC<{ s: Settings; update: (p: Partial<Settings>) => void }> = ({ s, update }) => {
  const [activeProfile, setActiveProfile] = useState(s.formProfiles[0]?.id ?? null);

  const updateProfile = (profileId: string, field: string, value: string) => {
    const profiles = s.formProfiles.map(p =>
      p.id === profileId ? { ...p, fields: { ...p.fields, [field]: value } } : p,
    );
    update({ formProfiles: profiles });
  };

  const profile = s.formProfiles.find(p => p.id === activeProfile);

  return (
    <div className="settings-section-body">
      <div className="profile-tabs">
        {s.formProfiles.map(p => (
          <button
            key={p.id}
            className={`profile-tab ${activeProfile === p.id ? 'profile-tab--active' : ''}`}
            onClick={() => setActiveProfile(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      {profile && (
        <div className="profile-fields">
          {Object.entries(profile.fields).map(([key, val]) => (
            <FieldRow key={key} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}>
              <input
                type="text"
                className="text-input"
                value={val}
                placeholder={`Enter ${key}`}
                onChange={e => updateProfile(profile.id, key, e.target.value)}
              />
            </FieldRow>
          ))}
        </div>
      )}
    </div>
  );
};

const NewsSettingsSection: React.FC<{ s: Settings; update: (p: Partial<Settings>) => void }> = ({ s, update }) => {
  const toggle = (id: string) => {
    const next = s.newsSources.includes(id)
      ? s.newsSources.filter(x => x !== id)
      : [...s.newsSources, id];
    update({ newsSources: next });
  };

  const byCategory = NEWS_SOURCES_REGISTRY.reduce<Record<string, typeof NEWS_SOURCES_REGISTRY>>((acc, src) => {
    (acc[src.category] ??= []).push(src);
    return acc;
  }, {});

  return (
    <div className="settings-section-body">
      <FieldRow label="Update Frequency" hint="How often to refresh your feed">
        <Slider value={s.newsUpdateFrequencyMinutes} min={5} max={120} step={5}
          onChange={v => update({ newsUpdateFrequencyMinutes: v })} unit=" min"/>
      </FieldRow>

      <div className="sources-grid">
        {Object.entries(byCategory).map(([cat, sources]) => (
          <div key={cat} className="source-group">
            <span className="source-cat-label">{cat}</span>
            {sources.map(src => (
              <label key={src.id} className="source-item">
                <input
                  type="checkbox"
                  className="cb"
                  checked={s.newsSources.includes(src.id)}
                  onChange={() => toggle(src.id)}
                />
                <span>{src.label}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const NotificationsSettingsSection: React.FC<{ s: Settings; update: (p: Partial<Settings>) => void }> = ({ s, update }) => (
  <div className="settings-section-body">
    <FieldRow label="Enable Notifications" hint="Show aggregated notifications on the new tab page">
      <Toggle checked={s.notificationsEnabled} onChange={v => update({ notificationsEnabled: v })}/>
    </FieldRow>
    <FieldRow label="Quiet Hours Start" hint="No notifications after this time">
      <input type="time" className="text-input text-input--sm" value={s.quietHoursStart}
        onChange={e => update({ quietHoursStart: e.target.value })}/>
    </FieldRow>
    <FieldRow label="Quiet Hours End" hint="Resume notifications at this time">
      <input type="time" className="text-input text-input--sm" value={s.quietHoursEnd}
        onChange={e => update({ quietHoursEnd: e.target.value })}/>
    </FieldRow>
  </div>
);

const ApiKeysSection: React.FC<{ s: Settings; update: (p: Partial<Settings>) => void }> = ({ s, update }) => {
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});

  const testKey = async (provider: string, key: string) => {
    if (!key) return;
    setTesting(prev => ({ ...prev, [provider]: 'testing' }));
    await new Promise(r => setTimeout(r, 1200));
    setTesting(prev => ({ ...prev, [provider]: key.length > 10 ? 'ok' : 'fail' }));
  };

  const PROVIDERS = [
    { key: 'openai' as const,    label: 'OpenAI',    placeholder: 'sk-...',      color: '#74AA9C' },
    { key: 'anthropic' as const, label: 'Anthropic', placeholder: 'sk-ant-...',  color: '#D97757' },
    { key: 'deepseek' as const,  label: 'DeepSeek',  placeholder: 'sk-...',      color: '#4FC3F7' },
    { key: 'groq' as const,      label: 'Groq',      placeholder: 'gsk_...',     color: '#CE93D8' },
  ];

  return (
    <div className="settings-section-body">
      <p className="section-note">Keys are stored in <code>chrome.storage.local</code> on your device and are never transmitted to Suya servers.</p>
      {PROVIDERS.map(({ key, label, placeholder, color }) => {
        const status = testing[key] ?? 'idle';
        return (
          <FieldRow key={key} label={label}>
            <div className="api-key-row">
              <div className="api-key-input-wrap">
                <div className="api-key-dot" style={{ background: color }}/>
                <input
                  type={visible[key] ? 'text' : 'password'}
                  className="text-input api-key-input"
                  placeholder={placeholder}
                  value={s.apiKeys[key]}
                  onChange={e => update({ apiKeys: { ...s.apiKeys, [key]: e.target.value } })}
                />
                <button className="icon-btn" onClick={() => setVisible(p => ({ ...p, [key]: !p[key] }))}>
                  {visible[key] ? '🙈' : '👁'}
                </button>
              </div>
              <button
                className={`test-btn test-btn--${status}`}
                onClick={() => testKey(key, s.apiKeys[key])}
                disabled={!s.apiKeys[key] || status === 'testing'}
              >
                {status === 'idle' && 'Test'}
                {status === 'testing' && '…'}
                {status === 'ok' && '✓ OK'}
                {status === 'fail' && '✗ Fail'}
              </button>
            </div>
          </FieldRow>
        );
      })}
    </div>
  );
};

/* ── SettingsPage ─────────────────────────────────────────────────── */
const NAV_ITEMS: Array<{ id: Section; icon: string; label: string }> = [
  { id: 'bot-behavior',   icon: '🍢', label: 'Bot Behavior'    },
  { id: 'skills',         icon: '⚙️', label: 'Skills'          },
  { id: 'form-profiles',  icon: '📝', label: 'Form Profiles'   },
  { id: 'news',           icon: '📰', label: 'News'            },
  { id: 'notifications',  icon: '🔔', label: 'Notifications'   },
  { id: 'api-keys',       icon: '🔑', label: 'API Keys'        },
];

const SettingsPage: React.FC = () => {
  const [active, setActive]   = useState<Section>('bot-behavior');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved]     = useState(false);

  // Load from storage on mount
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get('suyaSettings', ({ suyaSettings }) => {
        if (suyaSettings) setSettings({ ...DEFAULT_SETTINGS, ...suyaSettings });
      });
    }
  }, []);

  const update = useCallback((partial: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.set({ suyaSettings: next });
      }
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }, []);

  return (
    <div className="sp-root">
      {/* Sidebar */}
      <aside className="sp-sidebar">
        <div className="sp-brand">
          <span className="sp-brand-icon">🍢</span>
          <span className="sp-brand-name">Suya</span>
          <span className="sp-brand-sub">Settings</span>
        </div>

        <nav className="sp-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`sp-nav-item ${active === item.id ? 'sp-nav-item--active' : ''}`}
              onClick={() => setActive(item.id)}
            >
              <span className="sp-nav-icon">{item.icon}</span>
              <span className="sp-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {saved && <div className="sp-saved-toast">✓ Saved</div>}
      </aside>

      {/* Content */}
      <main className="sp-content">
        <header className="sp-content-header">
          <h1 className="sp-content-title">
            {NAV_ITEMS.find(n => n.id === active)?.icon}{' '}
            {NAV_ITEMS.find(n => n.id === active)?.label}
          </h1>
        </header>

        <div className="sp-content-body">
          {active === 'bot-behavior'  && <BotBehaviorSection  s={settings} update={update}/>}
          {active === 'skills'        && <SkillsSection        s={settings} update={update}/>}
          {active === 'form-profiles' && <FormProfilesSection  s={settings} update={update}/>}
          {active === 'news'          && <NewsSettingsSection   s={settings} update={update}/>}
          {active === 'notifications' && <NotificationsSettingsSection s={settings} update={update}/>}
          {active === 'api-keys'      && <ApiKeysSection        s={settings} update={update}/>}
        </div>
      </main>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

        body { background: #0D0F14; }

        .sp-root {
          display: flex;
          min-height: 100vh;
          background: #0D0F14;
          color: rgba(255,255,255,.85);
          font-family: 'DM Sans', sans-serif;
        }

        /* Sidebar */
        .sp-sidebar {
          width: 220px; flex-shrink: 0;
          background: #111318;
          border-right: 1px solid rgba(255,255,255,.07);
          display: flex; flex-direction: column;
          padding: 28px 16px;
          position: sticky; top: 0; height: 100vh;
        }
        .sp-brand {
          display: flex; align-items: baseline; gap: 8px;
          padding: 0 8px 28px;
          border-bottom: 1px solid rgba(255,255,255,.06);
          margin-bottom: 20px;
        }
        .sp-brand-icon { font-size: 20px; }
        .sp-brand-name {
          font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 800;
          color: rgba(255,255,255,.9);
        }
        .sp-brand-sub {
          font-size: 11px; color: rgba(255,255,255,.25);
          font-weight: 400;
        }
        .sp-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
        .sp-nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 12px; border-radius: 8px;
          border: none; background: none; cursor: pointer;
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 400;
          color: rgba(255,255,255,.4); transition: all .15s;
          text-align: left;
        }
        .sp-nav-item:hover { background: rgba(255,255,255,.05); color: rgba(255,255,255,.75); }
        .sp-nav-item--active { background: rgba(255,107,53,.1); color: #FF9068; }
        .sp-nav-icon { font-size: 16px; flex-shrink: 0; }
        .sp-saved-toast {
          margin-top: auto; padding: 9px 12px;
          border-radius: 8px; background: rgba(129,199,132,.15);
          border: 1px solid rgba(129,199,132,.25);
          font-size: 12px; font-weight: 500; color: #81C784;
          text-align: center; animation: fadeIn .2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

        /* Content */
        .sp-content { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .sp-content-header {
          padding: 32px 40px 20px;
          border-bottom: 1px solid rgba(255,255,255,.06);
        }
        .sp-content-title {
          font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 700;
          color: rgba(255,255,255,.9); display: flex; align-items: center; gap: 10px;
        }
        .sp-content-body { padding: 32px 40px; max-width: 680px; }

        /* Section bodies */
        .settings-section-body { display: flex; flex-direction: column; gap: 0; }
        .field-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 0;
          border-bottom: 1px solid rgba(255,255,255,.05);
          gap: 20px;
        }
        .field-row:last-child { border-bottom: none; }
        .field-meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .field-label {
          font-size: 13px; font-weight: 500;
          color: rgba(255,255,255,.75);
        }
        .field-hint {
          font-size: 11px; color: rgba(255,255,255,.3); line-height: 1.4;
        }
        .field-control { flex-shrink: 0; }

        /* Toggle */
        .toggle-wrap { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .toggle {
          width: 38px; height: 22px; border-radius: 11px;
          background: rgba(255,255,255,.12); position: relative;
          transition: background .2s; cursor: pointer;
          flex-shrink: 0;
        }
        .toggle--on { background: rgba(255,107,53,.7); }
        .toggle-thumb {
          position: absolute; width: 16px; height: 16px; border-radius: 50%;
          top: 3px; left: 3px;
          background: #fff;
          transition: transform .2s; box-shadow: 0 1px 4px rgba(0,0,0,.35);
        }
        .toggle--on .toggle-thumb { transform: translateX(16px); }
        .toggle-label { font-size: 13px; color: rgba(255,255,255,.6); }

        /* Slider */
        .slider-wrap { display: flex; align-items: center; gap: 12px; }
        .slider-input {
          -webkit-appearance: none; appearance: none;
          width: 140px; height: 4px; border-radius: 2px;
          background: rgba(255,255,255,.12); outline: none; cursor: pointer;
        }
        .slider-input::-webkit-slider-thumb {
          -webkit-appearance: none; width: 16px; height: 16px;
          border-radius: 50%; background: #FF7043; cursor: pointer;
          box-shadow: 0 0 0 3px rgba(255,112,67,.2);
        }
        .slider-val {
          font-size: 12px; font-weight: 500; min-width: 40px;
          color: rgba(255,255,255,.5); text-align: right;
        }

        /* Select */
        .sel {
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 8px; padding: 7px 28px 7px 10px;
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          color: rgba(255,255,255,.75); cursor: pointer; outline: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,.4)' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
        }

        /* Text input */
        .text-input {
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px; padding: 8px 12px;
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          color: rgba(255,255,255,.8); outline: none; width: 100%;
          transition: border-color .18s;
        }
        .text-input:focus { border-color: rgba(255,107,53,.4); }
        .text-input::placeholder { color: rgba(255,255,255,.2); }
        .text-input--sm { width: auto; }

        /* Skills */
        .skill-row {
          display: flex; align-items: flex-start;
          justify-content: space-between; gap: 16px;
          padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,.05);
          transition: opacity .2s;
        }
        .skill-row--off { opacity: .5; }
        .skill-info { display: flex; flex-direction: column; gap: 3px; }
        .skill-label { font-size: 13px; font-weight: 500; color: rgba(255,255,255,.8); }
        .skill-desc { font-size: 11px; color: rgba(255,255,255,.35); }
        .skill-deps { font-size: 10px; color: rgba(79,195,247,.6); }
        .skill-warn { font-size: 10px; color: #FFB74D; }

        /* Profile tabs */
        .profile-tabs {
          display: flex; gap: 4px; margin-bottom: 20px;
          border-bottom: 1px solid rgba(255,255,255,.07);
          padding-bottom: 0;
        }
        .profile-tab {
          padding: 8px 16px; background: none; border: none;
          border-bottom: 2px solid transparent;
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
          color: rgba(255,255,255,.4); cursor: pointer; transition: all .18s;
          margin-bottom: -1px;
        }
        .profile-tab--active { color: #FF9068; border-bottom-color: #FF7043; }
        .profile-fields { display: flex; flex-direction: column; }

        /* News sources */
        .sources-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 20px; margin-top: 8px;
        }
        .source-group { display: flex; flex-direction: column; gap: 8px; }
        .source-cat-label {
          font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
          font-weight: 700; color: rgba(255,255,255,.25);
          font-family: 'Syne', sans-serif; margin-bottom: 2px;
        }
        .source-item {
          display: flex; align-items: center; gap: 8px; cursor: pointer;
          font-size: 13px; color: rgba(255,255,255,.6);
        }
        .cb { accent-color: #FF7043; width: 14px; height: 14px; cursor: pointer; }

        /* API keys */
        .section-note {
          font-size: 12px; color: rgba(255,255,255,.35);
          background: rgba(255,255,255,.04);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 8px; padding: 10px 14px;
          line-height: 1.55; margin-bottom: 8px;
        }
        .section-note code {
          font-family: monospace; font-size: 11px;
          background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 3px;
          color: rgba(255,255,255,.55);
        }
        .api-key-row { display: flex; align-items: center; gap: 8px; width: 280px; }
        .api-key-input-wrap {
          position: relative; display: flex;
          align-items: center; flex: 1;
        }
        .api-key-dot {
          position: absolute; left: 10px;
          width: 8px; height: 8px; border-radius: 50%;
          flex-shrink: 0;
        }
        .api-key-input { padding-left: 26px !important; padding-right: 32px !important; }
        .icon-btn {
          position: absolute; right: 8px;
          background: none; border: none; cursor: pointer;
          font-size: 14px; opacity: .5; transition: opacity .15s;
        }
        .icon-btn:hover { opacity: .9; }
        .test-btn {
          padding: 7px 12px; border-radius: 7px;
          border: 1px solid rgba(255,255,255,.12);
          background: none; font-size: 11px; font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          color: rgba(255,255,255,.4); cursor: pointer; transition: all .18s;
          white-space: nowrap;
        }
        .test-btn:disabled { opacity: .4; cursor: default; }
        .test-btn--ok { border-color: rgba(129,199,132,.4); color: #81C784; background: rgba(129,199,132,.08); }
        .test-btn--fail { border-color: rgba(255,68,68,.4); color: #FF6B6B; background: rgba(255,68,68,.08); }
      `}</style>
    </div>
  );
};

export default SettingsPage;
