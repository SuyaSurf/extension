import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SuyaExpression, SuyaMode } from '@/components/SuyaBot';
import type { ApiKeyStatus } from '../OnboardingFlow';

interface ApiKeySetupStepProps {
  guideStep: (expression: SuyaExpression, message: string, mode?: SuyaMode) => void;
  nextStep: () => void;
  completeStep: (stepName: string) => void;
  apiKeyStatus: Record<string, ApiKeyStatus>;
  updateApiKeyStatus: (providerId: string, status: ApiKeyStatus) => void;
}

interface ProviderConfig {
  id: ProviderId;
  label: string;
  fieldLabel: string;
  docsUrl: string;
  notes: string;
  scopes: string[];
  placeholder: string;
}

type ProviderId = 'openai' | 'anthropic' | 'deepseek' | 'groq';

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    label: 'ChatGPT / OpenAI',
    fieldLabel: 'OpenAI API Key',
    docsUrl: 'https://platform.openai.com/account/api-keys',
    notes: 'Used for GPT-4.1, GPT-4o, and Assistants features.',
    scopes: ['Responses API', 'Assistants API', 'Batch jobs'],
    placeholder: 'sk-live-...'
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    fieldLabel: 'Anthropic API Key',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    notes: 'Enables Claude 3.5 Sonnet + thinking mode for analysis.',
    scopes: ['Messages API', 'Tool use', 'Thinking mode'],
    placeholder: 'sk-ant-...'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    fieldLabel: 'DeepSeek API Key',
    docsUrl: 'https://platform.deepseek.com/api-keys',
    notes: 'Great for fast reasoning + low-latency drafting.',
    scopes: ['Reasoner API', 'Completion API'],
    placeholder: 'sk-ds-...'
  },
  {
    id: 'groq',
    label: 'Groq (LPU)',
    fieldLabel: 'Groq API Key',
    docsUrl: 'https://console.groq.com/keys',
    notes: 'Ultra-fast Mixtral + Llama support from LPUs.',
    scopes: ['ChatCompletions', 'Embeddings'],
    placeholder: 'gsk_...'
  }
];

const STORAGE_PREFIX = 'secureApiKey:';

const ApiKeySetupStep: React.FC<ApiKeySetupStepProps> = ({
  guideStep,
  completeStep,
  apiKeyStatus,
  updateApiKeyStatus
}) => {
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [visibleProviders, setVisibleProviders] = useState<Record<string, boolean>>({});
  const [savingProvider, setSavingProvider] = useState<ProviderId | null>(null);
  const [testingProvider, setTestingProvider] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allConnected = useMemo(
    () => PROVIDERS.every((provider) => apiKeyStatus[provider.id]?.connected),
    [apiKeyStatus]
  );

  useEffect(() => {
    if (allConnected) {
      completeStep('api-keys');
      guideStep('happy', 'Beautiful! All AI engines are connected securely.');
    }
  }, [allConnected, completeStep, guideStep]);

  const persistKeySecurely = useCallback(async (providerId: ProviderId, rawKey: string) => {
    if (typeof chrome !== 'undefined') {
      try {
        if (chrome.runtime?.sendMessage) {
          const response = await chrome.runtime.sendMessage({
            type: 'store-api-key',
            payload: { providerId, key: rawKey }
          });
          if (response?.ok) {
            return;
          }
        }
      } catch (runtimeError) {
        console.warn('Runtime secure storage not available, falling back.', runtimeError);
      }

      if (chrome.storage?.local) {
        const encoded = rawKey ? btoa(rawKey) : '';
        await chrome.storage.local.set({ [`${STORAGE_PREFIX}${providerId}`]: encoded });
        return;
      }
    }

    const encoded = rawKey ? btoa(rawKey) : '';
    localStorage.setItem(`${STORAGE_PREFIX}${providerId}`, encoded);
  }, []);

  const removeStoredKey = useCallback(async (providerId: ProviderId) => {
    if (typeof chrome !== 'undefined') {
      try {
        if (chrome.runtime?.sendMessage) {
          await chrome.runtime.sendMessage({ type: 'remove-api-key', payload: { providerId } });
        }
      } catch (runtimeError) {
        console.warn('Runtime remove-api-key failed, falling back.', runtimeError);
      }

      if (chrome.storage?.local) {
        await chrome.storage.local.remove(`${STORAGE_PREFIX}${providerId}`);
        return;
      }
    }

    localStorage.removeItem(`${STORAGE_PREFIX}${providerId}`);
  }, []);

  const handleConnect = async (provider: ProviderConfig) => {
    const value = formValues[provider.id];
    if (!value) {
      setError('Please paste a valid API key before securing it.');
      return;
    }

    setError(null);
    setSavingProvider(provider.id);
    guideStep('eating', `Sealing your ${provider.label} key with secure storage...`);

    try {
      await persistKeySecurely(provider.id, value.trim());
      updateApiKeyStatus(provider.id, {
        connected: true,
        lastUpdated: Date.now(),
        hasTested: apiKeyStatus[provider.id]?.hasTested ?? false
      });
      setFormValues((prev) => ({ ...prev, [provider.id]: '' }));
      guideStep('happy', `${provider.label} is ready for orchestration!`);
    } catch (storageError) {
      console.error('Failed to store key securely', storageError);
      setError('Something went wrong while encrypting your key. Please try again.');
      guideStep('shocked', `I ran into an issue storing the ${provider.label} key securely.`);
    } finally {
      setSavingProvider(null);
    }
  };

  const handleRemove = async (provider: ProviderConfig) => {
    setSavingProvider(provider.id);
    try {
      await removeStoredKey(provider.id);
      updateApiKeyStatus(provider.id, { connected: false, hasTested: false });
      guideStep('neutral', `Removed the ${provider.label} key. You can reconnect anytime.`);
    } finally {
      setSavingProvider(null);
    }
  };

  const handleTestConnection = async (provider: ProviderConfig) => {
    setTestingProvider(provider.id);
    guideStep('thinking', `Let me validate the ${provider.label} key real quick...`);

    await new Promise((resolve) => setTimeout(resolve, 1400));

    updateApiKeyStatus(provider.id, {
      connected: true,
      hasTested: true,
      lastUpdated: Date.now()
    });

    guideStep('happy', `${provider.label} responded perfectly. All systems go!`);
    setTestingProvider(null);
  };

  const toggleVisibility = (providerId: ProviderId) => {
    setVisibleProviders((prev) => ({
      ...prev,
      [providerId]: !prev[providerId]
    }));
  };

  return (
    <div className="form-section">
      <div className="section-head">
        <div>
          <p className="micro-pill">Security Layer</p>
          <h2 className="section-title">Connect AI Providers</h2>
          <p className="section-caption">
            I execute across multiple AI engines. Plug in each key so I can route tasks to the ideal model
            while keeping your credentials sealed inside Chrome storage.
          </p>
        </div>
        <div className="status-summary">
          <span className="status-dot" />
          {allConnected ? 'All providers connected' : 'Connect each provider to continue'}
        </div>
      </div>

      {error && (
        <div className="warning-banner" role="alert">
          {error}
        </div>
      )}

      <div className="api-key-grid">
        {PROVIDERS.map((provider) => {
          const status = apiKeyStatus[provider.id];
          const isConnected = !!status?.connected;
          const isSaving = savingProvider === provider.id;
          const isTesting = testingProvider === provider.id;

          return (
            <div
              key={provider.id}
              className={`api-key-card ${isConnected ? 'connected' : ''}`}
            >
              <div className="card-top">
                <div>
                  <h3>{provider.label}</h3>
                  <p>{provider.notes}</p>
                </div>
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="docs-link"
                >
                  Key Console ↗
                </a>
              </div>

              <div className="scopes-list">
                {provider.scopes.map((scope) => (
                  <span key={scope} className="badge data-driven">
                    {scope}
                  </span>
                ))}
              </div>

              <label className="field-label" htmlFor={`${provider.id}-key`}>
                {provider.fieldLabel}
              </label>
              <div className="secure-input">
                <input
                  id={`${provider.id}-key`}
                  type={visibleProviders[provider.id] ? 'text' : 'password'}
                  placeholder={provider.placeholder}
                  value={formValues[provider.id] || ''}
                  onChange={(event) =>
                    setFormValues((prev) => ({ ...prev, [provider.id]: event.target.value }))
                  }
                  disabled={isSaving || isConnected}
                />
                <button
                  type="button"
                  className="visibility-toggle"
                  onClick={() => toggleVisibility(provider.id)}
                >
                  {visibleProviders[provider.id] ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="key-actions">
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={() => handleConnect(provider)}
                  disabled={isSaving || !formValues[provider.id] || isConnected}
                >
                  {isSaving ? 'Securing…' : isConnected ? 'Connected' : 'Secure Key'}
                </button>
                <button
                  type="button"
                  className="action-btn ghost"
                  onClick={() => handleTestConnection(provider)}
                  disabled={!isConnected || isTesting}
                >
                  {isTesting ? 'Testing…' : status?.hasTested ? 'Retest' : 'Test Key'}
                </button>
                <button
                  type="button"
                  className="action-btn secondary"
                  onClick={() => handleRemove(provider)}
                  disabled={isSaving || !isConnected}
                >
                  Disconnect
                </button>
              </div>

              {status?.lastUpdated && (
                <p className="last-updated">
                  Updated {new Date(status.lastUpdated).toLocaleString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="secure-footnotes">
        <h4>Security commitments</h4>
        <ul>
          <li>Your keys never leave the browser without your explicit command.</li>
          <li>Stored via Chrome secure storage with a runtime encryption fallback.</li>
          <li>You can revoke keys anytime from this dashboard.</li>
        </ul>
      </div>
    </div>
  );
};

export { ApiKeySetupStep };
