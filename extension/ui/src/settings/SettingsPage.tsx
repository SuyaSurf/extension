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
  { id: 'uxc',        label: 'UX Collective',      category: 'design'   },
  { id: 'frc',        label: 'First Round Review', category: 'business' },
  { id: 'nature',     label: 'Nature',             category: 'science'  },
];

const DEFAULT_SETTINGS: Settings = {
  botMode: 'awake',
  expressionSensitivity: 50,
  shrinkOnDrag: true,
  dragRecoveryMinutes: 60,
  positionPreference: 'bottom-right',
  skills: {
    'form-filler': true,
    'page-analyzer': true,
    'voice': false,
    'mail': false,
    'meeting': false,
    'news': true,
    'skill-gap': false,
  },
  newsSources: ['hn', 'techcrunch', 'mit'],
  newsUpdateFrequencyMinutes: 30,
  notificationsEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  apiKeys: { openai: '', anthropic: '', deepseek: '', groq: '' },
  formProfiles: [],
};

const SettingsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<Section>('bot-behavior');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Load settings from storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const syncResult = await chrome.storage.sync.get(['settings', 'suyaSettings']);
        const localResult = await chrome.storage.local.get(['settings', 'suyaSettings']);
        const storedSettings = syncResult.settings
          || syncResult.suyaSettings
          || localResult.settings
          || localResult.suyaSettings;

        if (storedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  // Save settings to storage
  const saveSettings = useCallback(async (newSettings: Settings) => {
    setSaveStatus('saving');
    try {
      await chrome.storage.sync.set({ settings: newSettings, suyaSettings: newSettings });
      await chrome.storage.local.set({ settings: newSettings, suyaSettings: newSettings });
      setSettings(newSettings);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, []);

  // Update specific setting
  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
  }, [settings, saveSettings]);

  const renderSection = () => {
    switch (activeSection) {
      case 'bot-behavior':
        return <BotBehaviorSection settings={settings} updateSetting={updateSetting} />;
      case 'skills':
        return <SkillsSection settings={settings} updateSetting={updateSetting} />;
      case 'form-profiles':
        return <FormProfilesSection settings={settings} updateSetting={updateSetting} />;
      case 'news':
        return <NewsSection settings={settings} updateSetting={updateSetting} />;
      case 'notifications':
        return <NotificationsSection settings={settings} updateSetting={updateSetting} />;
      case 'api-keys':
        return <ApiKeysSection settings={settings} updateSetting={updateSetting} />;
      default:
        return null;
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1>⚙️ Suya Settings</h1>
        <div className="save-status">
          {saveStatus === 'saving' && <span className="saving">Saving...</span>}
          {saveStatus === 'saved' && <span className="saved">✓ Saved</span>}
          {saveStatus === 'error' && <span className="error">✗ Failed to save</span>}
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav">
          {[
            { id: 'bot-behavior', label: 'Bot Behavior', icon: '🤖' },
            { id: 'skills', label: 'Skills', icon: '⚡' },
            { id: 'form-profiles', label: 'Form Profiles', icon: '📝' },
            { id: 'news', label: 'News', icon: '📰' },
            { id: 'notifications', label: 'Notifications', icon: '🔔' },
            { id: 'api-keys', label: 'API Keys', icon: '🔑' },
          ].map(section => (
            <button
              key={section.id}
              className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id as Section)}
            >
              <span className="nav-icon">{section.icon}</span>
              <span className="nav-label">{section.label}</span>
            </button>
          ))}
        </nav>

        <main className="settings-main">
          {renderSection()}
        </main>
      </div>

      <style>{`
        .settings-page {
          min-height: 100vh;
          background: #f5f5f5;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .settings-header {
          background: white;
          padding: 24px 32px;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .settings-header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          color: #333;
        }
        .save-status span {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
        }
        .save-status .saving {
          background: #FFF3CD;
          color: #856404;
        }
        .save-status .saved {
          background: #D4EDDA;
          color: #155724;
        }
        .save-status .error {
          background: #F8D7DA;
          color: #721C24;
        }
        .settings-layout {
          display: flex;
          height: calc(100vh - 89px);
        }
        .settings-nav {
          width: 280px;
          background: white;
          border-right: 1px solid #e0e0e0;
          padding: 24px 0;
        }
        .nav-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 24px;
          border: none;
          background: transparent;
          color: #666;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        .nav-item:hover {
          background: #f5f5f5;
          color: #333;
        }
        .nav-item.active {
          background: #E3F2FD;
          color: #1976D2;
          border-right: 3px solid #1976D2;
        }
        .nav-icon {
          font-size: 20px;
        }
        .settings-main {
          flex: 1;
          padding: 32px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
};

/* ── Section Components ───────────────────────────────────────────── */

const BotBehaviorSection: React.FC<{ settings: Settings; updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void }> = ({ settings, updateSetting }) => (
  <section className="settings-section">
    <h2>Bot Behavior</h2>
    <p>Customize how Suya behaves and appears on your screen.</p>

    <div className="setting-group">
      <label>Default Mode</label>
      <select 
        value={settings.botMode} 
        onChange={e => updateSetting('botMode', e.target.value as Settings['botMode'])}
      >
        <option value="awake">Awake</option>
        <option value="idle">Idle</option>
        <option value="sleeping">Sleeping</option>
      </select>
    </div>

    <div className="setting-group">
      <label>Expression Sensitivity</label>
      <input 
        type="range" 
        min="0" 
        max="100" 
        value={settings.expressionSensitivity}
        onChange={e => updateSetting('expressionSensitivity', parseInt(e.target.value))}
      />
      <span>{settings.expressionSensitivity}%</span>
    </div>

    <div className="setting-group">
      <label className="checkbox-label">
        <input 
          type="checkbox" 
          checked={settings.shrinkOnDrag}
          onChange={e => updateSetting('shrinkOnDrag', e.target.checked)}
        />
        Shrink bot when dragged
      </label>
    </div>

    <div className="setting-group">
      <label>Drag Recovery Time (minutes)</label>
      <input 
        type="number" 
        min="1" 
        max="1440"
        value={settings.dragRecoveryMinutes}
        onChange={e => updateSetting('dragRecoveryMinutes', parseInt(e.target.value))}
      />
    </div>

    <div className="setting-group">
      <label>Default Position</label>
      <select 
        value={settings.positionPreference} 
        onChange={e => updateSetting('positionPreference', e.target.value as Settings['positionPreference'])}
      >
        <option value="bottom-right">Bottom Right</option>
        <option value="bottom-left">Bottom Left</option>
        <option value="top-right">Top Right</option>
        <option value="top-left">Top Left</option>
      </select>
    </div>
  </section>
);

const SkillsSection: React.FC<{ settings: Settings; updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void }> = ({ settings, updateSetting }) => (
  <section className="settings-section">
    <h2>Skills Management</h2>
    <p>Enable or disable Suya's specialized skills.</p>

    <div className="skills-grid">
      {SKILLS_REGISTRY.map(skill => {
        const isEnabled = settings.skills[skill.id] || false;
        const hasDeps = skill.deps.every(dep => {
          if (dep === 'api-keys') {
            return Object.values(settings.apiKeys).some(key => key.length > 0);
          }
          return settings.skills[dep] || false;
        });

        return (
          <div key={skill.id} className={`skill-card ${!hasDeps ? 'disabled' : ''}`}>
            <div className="skill-info">
              <h3>{skill.label}</h3>
              <p>{skill.desc}</p>
              {skill.deps.length > 0 && (
                <small>Requires: {skill.deps.join(', ')}</small>
              )}
            </div>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={isEnabled}
                disabled={!hasDeps}
                onChange={e => updateSetting('skills', { ...settings.skills, [skill.id]: e.target.checked })}
              />
              <span className="slider"></span>
            </label>
          </div>
        );
      })}
    </div>
  </section>
);

const FormProfilesSection: React.FC<{ settings: Settings; updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void }> = ({ settings, updateSetting }) => (
  <section className="settings-section">
    <h2>Form Profiles</h2>
    <p>Manage your personal and professional information for form filling.</p>

    <div className="profiles-list">
      {settings.formProfiles.length === 0 ? (
        <p>No profiles created yet.</p>
      ) : (
        settings.formProfiles.map(profile => (
          <div key={profile.id} className="profile-card">
            <div className="profile-info">
              <h3>{profile.name}</h3>
              <span className="profile-type">{profile.type}</span>
            </div>
            <div className="profile-actions">
              <button className="btn-secondary">Edit</button>
              <button className="btn-danger">Delete</button>
            </div>
          </div>
        ))
      )}
    </div>

    <button className="btn-primary">Add New Profile</button>
  </section>
);

const NewsSection: React.FC<{ settings: Settings; updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void }> = ({ settings, updateSetting }) => (
  <section className="settings-section">
    <h2>News Configuration</h2>
    <p>Customize your news sources and update frequency.</p>

    <div className="setting-group">
      <label>Update Frequency (minutes)</label>
      <input 
        type="number" 
        min="5" 
        max="1440"
        value={settings.newsUpdateFrequencyMinutes}
        onChange={e => updateSetting('newsUpdateFrequencyMinutes', parseInt(e.target.value))}
      />
    </div>

    <div className="setting-group">
      <label>News Sources</label>
      <div className="sources-grid">
        {NEWS_SOURCES_REGISTRY.map(source => (
          <label key={source.id} className="source-item">
            <input 
              type="checkbox" 
              checked={settings.newsSources.includes(source.id)}
              onChange={e => {
                const newSources = e.target.checked
                  ? [...settings.newsSources, source.id]
                  : settings.newsSources.filter(s => s !== source.id);
                updateSetting('newsSources', newSources);
              }}
            />
            <span>{source.label}</span>
            <small>{source.category}</small>
          </label>
        ))}
      </div>
    </div>
  </section>
);

const NotificationsSection: React.FC<{ settings: Settings; updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void }> = ({ settings, updateSetting }) => (
  <section className="settings-section">
    <h2>Notifications</h2>
    <p>Configure notification preferences and quiet hours.</p>

    <div className="setting-group">
      <label className="checkbox-label">
        <input 
          type="checkbox" 
          checked={settings.notificationsEnabled}
          onChange={e => updateSetting('notificationsEnabled', e.target.checked)}
        />
        Enable notifications
      </label>
    </div>

    <div className="setting-group">
      <label>Quiet Hours</label>
      <div className="time-range">
        <input 
          type="time" 
          value={settings.quietHoursStart}
          onChange={e => updateSetting('quietHoursStart', e.target.value)}
        />
        <span>to</span>
        <input 
          type="time" 
          value={settings.quietHoursEnd}
          onChange={e => updateSetting('quietHoursEnd', e.target.value)}
        />
      </div>
    </div>
  </section>
);

const ApiKeysSection: React.FC<{ settings: Settings; updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void }> = ({ settings, updateSetting }) => (
  <section className="settings-section">
    <h2>API Keys</h2>
    <p>Add your API keys for enhanced AI capabilities.</p>
    <p className="warning">Your keys are stored locally and never sent to our servers.</p>

    {Object.entries(settings.apiKeys).map(([provider, key]) => (
      <div key={provider} className="setting-group">
        <label>{provider.charAt(0).toUpperCase() + provider.slice(1)} API Key</label>
        <input 
          type="password" 
          value={key}
          onChange={e => updateSetting('apiKeys', { ...settings.apiKeys, [provider]: e.target.value })}
          placeholder={`Enter your ${provider} API key`}
        />
      </div>
    ))}
  </section>
);

export default SettingsPage;
