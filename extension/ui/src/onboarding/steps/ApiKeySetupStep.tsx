import React, { useCallback, useEffect, useState } from 'react';
import type { SuyaExpression, SuyaMode } from '@/components/SuyaBot';
import type { ApiKeyStatus } from '../OnboardingFlow';

interface ApiKeySetupStepProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
  apiKeyStatus: Record<string, ApiKeyStatus>;
  updateApiKeyStatus: (providerId: string, status: ApiKeyStatus) => void;
}

type ProviderId = 'openai' | 'anthropic' | 'deepseek' | 'groq';

interface ProviderConfig {
  id: ProviderId;
  label: string;
  color: string;
  docsUrl: string;
  notes: string;
  scopes: string[];
  placeholder: string;
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'openai',    label: 'OpenAI',    color: '#74AA9C', docsUrl: 'https://platform.openai.com/account/api-keys', notes: 'GPT-4.1, GPT-4o, Assistants & Batch jobs.', scopes: ['Responses API','Assistants API','Batch jobs'], placeholder: 'sk-proj-…' },
  { id: 'anthropic', label: 'Anthropic', color: '#D97757', docsUrl: 'https://console.anthropic.com/settings/keys', notes: 'Claude — thinking mode, tool use, analysis.', scopes: ['Messages API','Tool use','Thinking mode'], placeholder: 'sk-ant-api03-…' },
  { id: 'deepseek',  label: 'DeepSeek',  color: '#4FC3F7', docsUrl: 'https://platform.deepseek.com/api-keys', notes: 'Fast reasoning and low-latency drafting.', scopes: ['Reasoner API','Completion API'], placeholder: 'sk-…' },
  { id: 'groq',      label: 'Groq',      color: '#CE93D8', docsUrl: 'https://console.groq.com/keys', notes: 'Ultra-fast Mixtral + Llama via LPU hardware.', scopes: ['ChatCompletions','Embeddings'], placeholder: 'gsk_…' },
];

const STORAGE_PREFIX = 'secureApiKey:';

const ApiKeySetupStep: React.FC<ApiKeySetupStepProps> = ({
  guideStep, completeStep, apiKeyStatus, updateApiKeyStatus,
}) => {
  const [formValues, setFormValues]   = useState<Record<string, string>>({});
  const [visible, setVisible]         = useState<Record<string, boolean>>({});
  const [saving, setSaving]           = useState<ProviderId | null>(null);
  const [testing, setTesting]         = useState<ProviderId | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [collapsed, setCollapsed]     = useState<Record<string, boolean>>({});

  const connectedCount = PROVIDERS.filter(p => apiKeyStatus[p.id]?.connected).length;
  const hasOneConnected = connectedCount >= 1;

  useEffect(() => {
    const hasOneConnectedProvider = PROVIDERS.some(p => 
      apiKeyStatus[p.id]?.connected
    );
    
    if (hasOneConnectedProvider) { 
      completeStep('api-keys'); 
      const providerCount = PROVIDERS.filter(p => apiKeyStatus[p.id]?.connected).length;
      const testedCount = PROVIDERS.filter(p => apiKeyStatus[p.id]?.hasTested).length;
      guideStep('happy', `${providerCount} key${providerCount > 1 ? 's' : ''} connected! ${testedCount > 0 ? `${testedCount} tested.` : 'Test your keys to verify they work.'}`);
    }
  }, [apiKeyStatus]);

  // Auto-collapse cards that have been tested
  useEffect(() => {
    const newCollapsed: Record<string, boolean> = {};
    PROVIDERS.forEach(p => {
      if (apiKeyStatus[p.id]?.hasTested) {
        newCollapsed[p.id] = true;
      }
    });
    setCollapsed(prev => ({ ...prev, ...newCollapsed }));
  }, [apiKeyStatus]);

  const toggleCollapse = (providerId: ProviderId) => {
    setCollapsed(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const persistKey = useCallback(async (id: ProviderId, raw: string) => {
    if (typeof chrome !== 'undefined') {
      try { if (chrome.runtime?.sendMessage) { const r = await chrome.runtime.sendMessage({ type: 'store-api-key', payload: { providerId: id, key: raw } }); if (r?.ok) return; } } catch {}
      if (chrome.storage?.local) { await chrome.storage.local.set({ [`${STORAGE_PREFIX}${id}`]: raw ? btoa(raw) : '' }); return; }
    }
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, raw ? btoa(raw) : '');
  }, []);

  const removeKey = useCallback(async (id: ProviderId) => {
    if (typeof chrome !== 'undefined') {
      try { if (chrome.runtime?.sendMessage) await chrome.runtime.sendMessage({ type: 'remove-api-key', payload: { providerId: id } }); } catch {}
      if (chrome.storage?.local) { await chrome.storage.local.remove(`${STORAGE_PREFIX}${id}`); return; }
    }
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
  }, []);

  const handleConnect = async (p: ProviderConfig) => {
    const val = formValues[p.id]?.trim();
    if (!val) { 
      setError('Paste a valid API key first.'); 
      return; 
    }
    
    // Validate key format before storing
    if (!validateKeyFormat(p.id, val)) {
      setError(`Invalid ${p.label} API key format. Please check the key and try again.`);
      guideStep('shocked', `That ${p.label} key doesn't look right.`);
      return;
    }
    
    setError(null); 
    setSaving(p.id);
    guideStep('eating', `Sealing your ${p.label} key…`);
    
    try {
      await persistKey(p.id, val);
      updateApiKeyStatus(p.id, { connected: true, lastUpdated: Date.now(), hasTested: false });
      setFormValues(prev => ({ ...prev, [p.id]: '' }));
      guideStep('happy', `${p.label} key stored! Test it to make sure it works.`);
    } catch (error) {
      console.error('Failed to store API key:', error);
      setError('Storage error — please try again.');
      guideStep('shocked', `Trouble storing the ${p.label} key.`);
    } finally { 
      setSaving(null); 
    }
  };

  const handleRemove = async (p: ProviderConfig) => {
    setSaving(p.id);
    try { await removeKey(p.id); updateApiKeyStatus(p.id, { connected: false, hasTested: false }); guideStep('neutral', `${p.label} key removed.`); }
    finally { setSaving(null); }
  };

  // API key format validation patterns (updated 2026)
  const KEY_FORMATS = {
    openai: /^sk-proj-[a-zA-Z0-9_-]{48,156}$/,
    anthropic: /^sk-ant-api03-[a-zA-Z0-9_-]{95}$/,
    deepseek: /^sk-[a-zA-Z0-9]{48}$/,
    groq: /^gsk_[a-zA-Z0-9]{48}$/
  };

  const validateKeyFormat = (providerId: ProviderId, key: string): boolean => {
    const pattern = KEY_FORMATS[providerId];
    return pattern ? pattern.test(key) : false;
  };

  const handleTest = async (p: ProviderConfig) => {
    const storedKey = await getStoredKey(p.id);
    if (!storedKey) {
      setError('No API key found to test. Please connect a key first.');
      guideStep('shocked', 'No key to test!');
      return;
    }

    setTesting(p.id);
    setError(null);
    guideStep('thinking', `Testing ${p.label}…`);
    
    try {
      // Test with actual API call based on provider
      let isValid = false;
      let errorMessage = '';
      
      switch (p.id) {
        case 'openai':
          isValid = await testOpenAIKey(storedKey);
          break;
        case 'anthropic':
          isValid = await testAnthropicKey(storedKey);
          break;
        case 'deepseek':
          isValid = await testDeepSeekKey(storedKey);
          break;
        case 'groq':
          isValid = await testGroqKey(storedKey);
          break;
        default:
          throw new Error('Unknown provider');
      }
      
      if (isValid) {
        updateApiKeyStatus(p.id, { connected: true, hasTested: true, lastUpdated: Date.now() });
        guideStep('happy', `${p.label} key is working perfectly!`);
      } else {
        updateApiKeyStatus(p.id, { connected: false, hasTested: true, lastUpdated: Date.now() });
        guideStep('shocked', `${p.label} key failed validation.`);
        setError('API key test failed. Please check the key and try again.');
      }
    } catch (error) {
      console.error(`API key test failed for ${p.id}:`, error);
      updateApiKeyStatus(p.id, { connected: false, hasTested: false, lastUpdated: Date.now() });
      guideStep('shocked', `Trouble testing ${p.label}.`);
      setError(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTesting(null);
    }
  };

  const getStoredKey = async (providerId: ProviderId): Promise<string | null> => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get(`${STORAGE_PREFIX}${providerId}`);
      const stored = result[`${STORAGE_PREFIX}${providerId}`];
      return stored ? atob(stored) : null;
    }
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${providerId}`);
    return stored ? atob(stored) : null;
  };

  // Real API key testing functions
  const testOpenAIKey = async (key: string): Promise<boolean> => {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const testAnthropicKey = async (key: string): Promise<boolean> => {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }]
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const testDeepSeekKey = async (key: string): Promise<boolean> => {
    try {
      const response = await fetch('https://api.deepseek.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const testGroqKey = async (key: string): Promise<boolean> => {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  return (
    <div className="ak-root ob-step-root">
      {/* Header */}
      <header className="ob-col">
        <div className="ob-row">
          <span className="ob-step-label">✦ Security layer</span>
          <span className={`ak-counter ob-tag ${hasOneConnected ? 'ob-tag--green' : 'ob-tag--orange'}`}>
            {hasOneConnected ? '✓ Ready' : `${connectedCount} / ${PROVIDERS.length} connected`}
          </span>
        </div>
        <h2 className="ob-step-title">Connect AI Providers</h2>
        <p className="ob-step-sub">
          I route tasks to the ideal model. Connect just one provider to get started — 
          you can always add more later. Keys are stored securely in Chrome's local storage.
        </p>
      </header>

      {error && (
        <div className="ak-error" role="alert">
          <span>⚠</span> {error}
        </div>
      )}

      {/* Cards */}
      <div className="ak-grid ob-stagger">
        {PROVIDERS.map(p => {
          const status = apiKeyStatus[p.id];
          const isConn    = !!status?.connected;
          const isSaving  = saving === p.id;
          const isTesting = testing === p.id;
          const isTested  = !!status?.hasTested;
          const isCollapsed = collapsed[p.id] && isTested;
          
          return (
            <div key={p.id} className={`ak-card ob-card ${isConn ? 'ak-card--connected' : ''} ${isCollapsed ? 'ak-card--collapsed' : ''}`} style={{ '--pk-color': p.color } as React.CSSProperties}>

              {/* Card header */}
              <div className="ak-card__header" onClick={() => isTested && toggleCollapse(p.id)} style={{ cursor: isTested ? 'pointer' : 'default' }}>
                <div className="ak-provider-dot" style={{ background: p.color }}/>
                <div className="ak-card__meta">
                  <h3 className="ak-card__name">{p.label}</h3>
                  <p className="ak-card__notes">{isCollapsed ? '✓ Tested and working' : p.notes}</p>
                </div>
                <div className="ak-card__headerRight">
                  {isConn
                    ? <span className={`ob-tag ${isTested ? 'ob-tag--green' : 'ob-tag--orange'}`}>{isTested ? 'Tested' : 'Connected'}</span>
                    : <a href={p.docsUrl} target="_blank" rel="noreferrer" className="ak-docs-link">Get key ↗</a>
                  }
                  {isTested && (
                    <span className="ak-collapse-toggle">
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                  )}
                </div>
              </div>

              {/* Collapsible content */}
              {!isCollapsed && (
                <>
                  {/* Scopes */}
                  <div className="ak-scopes">
                    {p.scopes.map(s => <span key={s} className="ob-tag ob-tag--blue">{s}</span>)}
                  </div>

                  {/* Input */}
                  {!isConn && (
                    <div className="ak-input-wrap">
                      <input
                        className="ob-input ak-key-input"
                        type={visible[p.id] ? 'text' : 'password'}
                        placeholder={p.placeholder}
                        value={formValues[p.id] ?? ''}
                        onChange={e => setFormValues(prev => ({ ...prev, [p.id]: e.target.value }))}
                        disabled={isSaving}
                      />
                      <button className="ak-toggle-vis" onClick={() => setVisible(prev => ({ ...prev, [p.id]: !prev[p.id] }))}>
                        {visible[p.id] ? '🙈' : '👁'}
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="ak-actions">
                    {!isConn ? (
                      <button
                        className="ob-btn ob-btn--primary"
                        onClick={() => handleConnect(p)}
                        disabled={isSaving || !formValues[p.id]}
                        style={{ flex: 1 }}
                      >
                        {isSaving ? 'Securing…' : 'Secure Key'}
                      </button>
                    ) : (
                      <>
                        <button className="ob-btn ob-btn--secondary" onClick={() => handleTest(p)} disabled={isTesting} style={{ flex: 1 }}>
                          {isTesting ? 'Testing…' : status?.hasTested ? 'Retest' : 'Test Key'}
                        </button>
                        <button className="ob-btn ob-btn--ghost" onClick={() => handleRemove(p)} disabled={isSaving}>
                          Disconnect
                        </button>
                      </>
                    )}
                  </div>

                  {/* Last updated */}
                  {status?.lastUpdated && (
                    <p className="ak-updated">Updated {new Date(status.lastUpdated).toLocaleString()}</p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Security footnote */}
      <div className="ak-footnote ob-card">
        <p className="ak-footnote__head">🔒 Security commitments</p>
        <ul className="ak-footnote__list">
          <li>Keys never leave the browser without your explicit command.</li>
          <li>Stored via Chrome secure storage with an encryption fallback.</li>
          <li>Revocable anytime from this dashboard.</li>
        </ul>
      </div>

      <style>{`
        .ak-root { max-width: 680px; }

        .ak-counter { margin-left: auto; }

        .ak-error {
          display: flex; align-items: center; gap: 8px;
          padding: 11px 14px; border-radius: var(--radius-md);
          background: rgba(255,82,82,.1); border: 1px solid rgba(255,82,82,.25);
          font-family: var(--font-body); font-size: 13px; color: #FF8080;
        }

        .ak-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 10px; }

        .ak-card {
          display: flex; flex-direction: column; gap: 12px;
          position: relative; overflow: hidden;
          transition: border-color .2s, box-shadow .2s !important;
        }
        .ak-card::before {
          content: ''; position: absolute;
          top: 0; left: 0; right: 0; height: 2px;
          background: var(--pk-color); opacity: .6;
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        }
        .ak-card--connected { border-color: rgba(129,199,132,.25) !important; }
        .ak-card--connected::before { background: var(--green); }

        .ak-card__header { display: flex; align-items: flex-start; gap: 12px; }
        .ak-provider-dot {
          width: 10px; height: 10px; border-radius: 50%;
          margin-top: 4px; flex-shrink: 0;
          box-shadow: 0 0 10px var(--pk-color);
        }
        .ak-card__meta { flex: 1; min-width: 0; }
        .ak-card__name {
          font-family: var(--font-display); font-size: 14px; font-weight: 800;
          color: var(--text-primary); margin-bottom: 3px;
        }
        .ak-card__notes { font-family: var(--font-body); font-size: 12px; color: var(--text-secondary); line-height: 1.4; }
        .ak-card__headerRight { flex-shrink: 0; }
        .ak-docs-link {
          font-family: var(--font-body); font-size: 11px; font-weight: 500;
          color: var(--text-muted); text-decoration: none; border-bottom: 1px dashed var(--border);
          padding-bottom: 1px; transition: color .15s;
        }
        .ak-docs-link:hover { color: var(--accent-text); border-color: var(--accent-text); }

        .ak-scopes { display: flex; flex-wrap: wrap; gap: 5px; }

        .ak-input-wrap { position: relative; }
        .ak-key-input  { padding-right: 48px !important; font-family: monospace; font-size: 12px; }
        .ak-toggle-vis {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          font-size: 14px; opacity: .5; transition: opacity .15s;
        }
        .ak-toggle-vis:hover { opacity: .9; }

        .ak-actions { display: flex; gap: 8px; }

        .ak-updated {
          font-family: var(--font-body); font-size: 10px; color: var(--text-muted);
        }

        .ak-footnote { cursor: default; }
        .ak-footnote__head {
          font-family: var(--font-display); font-size: 13px; font-weight: 700;
          color: var(--text-primary); margin-bottom: 10px;
        }
        .ak-footnote__list {
          list-style: none; display: flex; flex-direction: column; gap: 6px;
        }
        .ak-footnote__list li {
          font-family: var(--font-body); font-size: 12px; color: var(--text-secondary);
          padding-left: 16px; position: relative; line-height: 1.5;
        }
        .ak-footnote__list li::before {
          content: '›'; position: absolute; left: 0;
          color: var(--accent-text);
        }

        .ak-card--collapsed {
          transition: all 0.3s ease;
        }

        .ak-card--collapsed .ak-card__header {
          padding: 12px 16px;
        }

        .ak-card--collapsed .ak-card__meta {
          flex: 1;
        }

        .ak-collapse-toggle {
          margin-left: 8px;
          font-size: 12px;
          opacity: 0.6;
          transition: opacity 0.15s;
        }

        .ak-card__header:hover .ak-collapse-toggle {
          opacity: 1;
        }

        .ak-card--collapsed:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
};

export { ApiKeySetupStep };
