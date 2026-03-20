/**
 * Meeting Assistant Skill
 * Detects meeting platforms (Meet, Zoom, Teams, Whereby),
 * transcribes via Web Speech API, extracts action items, and
 * generates post-meeting summaries.
 */

const MEETING_PLATFORMS = [
  {
    id:      'google-meet',
    name:    'Google Meet',
    pattern: /meet\.google\.com/,
    selectors: {
      participantList: '[data-participant-id]',
      caption:         '.a4cQT',
      title:           'c-wiz[data-conference-id] [data-meeting-title]',
    },
  },
  {
    id:      'zoom',
    name:    'Zoom',
    pattern: /zoom\.us\/wc\//,
    selectors: {
      participantList: '.participants-item__display-name',
      caption:         null,
      title:           '.meeting-info__meeting-topic',
    },
  },
  {
    id:      'teams',
    name:    'Microsoft Teams',
    pattern: /teams\.microsoft\.com\/.*meeting/,
    selectors: {
      participantList: '[data-tid="calling-roster-section"] .name',
      caption:         null,
      title:           '[data-tid="call-title"]',
    },
  },
  {
    id:      'whereby',
    name:    'Whereby',
    pattern: /whereby\.com\//,
    selectors: { participantList: null, caption: null, title: null },
  },
];

/* ── Action-item detection patterns ──────────────────────────────── */
const ACTION_PATTERNS = [
  /\b(i will|i'll|i'm going to|i need to|i have to)\s+([^.!?]+)/gi,
  /\b(action item|todo|to-do|follow[- ]up|next step)[:\s]+([^.!?]+)/gi,
  /\b(by\s+(monday|tuesday|wednesday|thursday|friday|eod|end of week|next week))[,\s]+([^.!?]+)/gi,
  /\b([a-z]+)\s+(will|is going to|needs to|should)\s+([^.!?]+)/gi,
];

/* ── Main skill object ────────────────────────────────────────────── */
class MeetingAssistantSkill {
  constructor() {
    this.isActive       = false;
    this.platform       = null;
    this.transcript     = [];
    this.actionItems    = [];
    this.startTime      = null;
    this.recognition    = null;
    this.observers      = [];
    this.summaryTimeout = null;
  }

  /* ── Lifecycle ── */

  init() {
    this._detectPlatform();
    if (!this.platform) return;

    this._injectUI();
    this._startTranscription();
    this._observeParticipants();
    this.isActive  = true;
    this.startTime = Date.now();

    this._notify('meeting-started', {
      platform: this.platform.name,
      title:    this._getMeetingTitle(),
    });
  }

  destroy() {
    this.isActive = false;
    this._stopTranscription();
    this.observers.forEach(obs => obs.disconnect());
    this.observers = [];
    clearTimeout(this.summaryTimeout);
    document.getElementById('suya-meeting-hud')?.remove();
  }

  /* ── Platform detection ── */

  _detectPlatform() {
    this.platform = MEETING_PLATFORMS.find(p => p.pattern.test(location.href)) ?? null;
  }

  _getMeetingTitle() {
    if (!this.platform?.selectors?.title) return 'Meeting';
    const el = document.querySelector(this.platform.selectors.title);
    return el?.textContent?.trim() || 'Meeting';
  }

  /* ── Transcription via Web Speech API ── */

  _startTranscription() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[Suya Meeting] SpeechRecognition not available — captions only mode');
      this._startCaptionFallback();
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous    = true;
    this.recognition.interimResults = true;
    this.recognition.lang           = 'en-US';
    this.recognition.maxAlternatives = 1;

    let interimBuffer = '';

    this.recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          const text = res[0].transcript.trim();
          interimBuffer = '';
          if (text.length < 3) continue;
          this._addSegment(text);
          this._extractActionItems(text);
          this._updateHUD();
        } else {
          interimBuffer = res[0].transcript;
        }
      }
    };

    this.recognition.onerror = (e) => {
      if (e.error === 'not-allowed') {
        this._showPermissionPrompt();
        return;
      }
      // Restart on recoverable errors with backoff
      const BACKOFF = [1000, 2000, 4000, 8000];
      let attempt = 0;
      const retry = () => {
        if (!this.isActive) return;
        setTimeout(() => {
          try {
            this.recognition.start();
          } catch (_) {
            if (attempt < BACKOFF.length) {
              attempt++;
              retry();
            }
          }
        }, BACKOFF[Math.min(attempt, BACKOFF.length - 1)]);
        attempt++;
      };
      retry();
    };

    this.recognition.onend = () => {
      if (this.isActive) this.recognition.start();
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.warn('[Suya Meeting] Could not start recognition:', e);
    }
  }

  _stopTranscription() {
    if (this.recognition) {
      this.recognition.onend = null; // prevent auto-restart
      try { this.recognition.stop(); } catch (_) {}
      this.recognition = null;
    }
  }

  /* Caption fallback: scrape platform captions if available */
  _startCaptionFallback() {
    const sel = this.platform?.selectors?.caption;
    if (!sel) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          const el = /** @type {Element} */ (node);
          if (el.matches?.(sel) || el.querySelector?.(sel)) {
            const text = el.textContent?.trim();
            if (text && text.length > 3) {
              this._addSegment(text);
              this._extractActionItems(text);
              this._updateHUD();
            }
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    this.observers.push(observer);
  }

  /* ── Segment / action-item handling ── */

  _addSegment(text) {
    this.transcript.push({
      text,
      ts: Date.now() - (this.startTime ?? Date.now()),
    });
    // Limit to last 400 segments to keep memory sane
    if (this.transcript.length > 400) this.transcript.shift();
  }

  _extractActionItems(text) {
    ACTION_PATTERNS.forEach(pattern => {
      pattern.lastIndex = 0; // reset stateful regex
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const item = match[match.length - 1]?.trim();
        if (item && item.length > 8 && !this.actionItems.some(a => a.text === item)) {
          this.actionItems.push({ text: item, ts: Date.now(), confirmed: false });
        }
      }
    });
  }

  /* ── Participant observer ── */

  _observeParticipants() {
    const sel = this.platform?.selectors?.participantList;
    if (!sel) return;

    const observer = new MutationObserver(() => {
      const names = [...document.querySelectorAll(sel)]
        .map(el => el.textContent?.trim())
        .filter(Boolean);
      this._updateHUDParticipants(names);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    this.observers.push(observer);
  }

  /* ── Summary generation ── */

  async generateSummary() {
    const fullTranscript = this.transcript.map(s => s.text).join(' ');
    const duration = Math.round((Date.now() - (this.startTime ?? Date.now())) / 60000);

    const summary = {
      title:       this._getMeetingTitle(),
      platform:    this.platform?.name ?? 'Unknown',
      duration,
      date:        new Date().toISOString(),
      transcript:  fullTranscript,
      actionItems: this.actionItems,
      wordCount:   fullTranscript.split(/\s+/).length,
    };

    // If an API key is available, request an LLM summary
    const keys = await this._getStoredApiKeys();
    if (keys.anthropic || keys.openai) {
      summary.aiSummary = await this._requestAiSummary(fullTranscript, keys);
    }

    // Store in extension storage
    const existing = await this._getStoredMeetings();
    existing.unshift(summary);
    if (existing.length > 50) existing.pop();
    chrome.storage.local.set({ suyaMeetings: existing });

    this._notify('meeting-summary-ready', { summary });
    return summary;
  }

  async _requestAiSummary(transcript, keys) {
    const provider = keys.anthropic ? 'anthropic' : 'openai';
    const apiKey   = keys.anthropic ?? keys.openai;

    const prompt = `Summarize this meeting transcript in 3-4 concise sentences. Focus on decisions made, key topics, and outcomes. Avoid filler. Transcript:\n\n${transcript.slice(0, 6000)}`;

    try {
      if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await res.json();
        return data?.content?.[0]?.text ?? null;
      }

      // OpenAI fallback
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
        }),
      });
      const data = await res.json();
      return data?.choices?.[0]?.message?.content ?? null;

    } catch (e) {
      console.warn('[Suya Meeting] AI summary failed:', e);
      return null;
    }
  }

  /* ── HUD UI ── */

  _injectUI() {
    if (document.getElementById('suya-meeting-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'suya-meeting-hud';
    hud.innerHTML = `
      <div id="smh-header">
        <span id="smh-icon">🍢</span>
        <span id="smh-title">Meeting Assistant</span>
        <button id="smh-toggle">−</button>
      </div>
      <div id="smh-body">
        <div id="smh-status">
          <span id="smh-dot"></span>
          <span id="smh-status-text">Listening…</span>
        </div>
        <div id="smh-actions-wrap">
          <div id="smh-actions-header">Action Items <span id="smh-action-count">0</span></div>
          <ul id="smh-actions-list"></ul>
        </div>
        <div id="smh-footer">
          <button id="smh-end-btn">End & Summarise</button>
        </div>
      </div>
    `;

    Object.assign(hud.style, {
      position:    'fixed',
      bottom:      '90px',
      right:       '20px',
      zIndex:      '2147483647',
      background:  '#161920',
      border:      '1px solid rgba(255,255,255,.12)',
      borderRadius:'14px',
      boxShadow:   '0 20px 60px rgba(0,0,0,.6)',
      color:       '#fff',
      fontFamily:  "'DM Sans', system-ui, sans-serif",
      fontSize:    '13px',
      minWidth:    '240px',
      maxWidth:    '320px',
      overflow:    'hidden',
    });

    this._injectHudStyles();
    document.body.appendChild(hud);

    hud.querySelector('#smh-toggle').addEventListener('click', () => {
      const body = hud.querySelector('#smh-body');
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      hud.querySelector('#smh-toggle').textContent = isHidden ? '−' : '+';
    });

    hud.querySelector('#smh-end-btn').addEventListener('click', async () => {
      hud.querySelector('#smh-status-text').textContent = 'Generating summary…';
      const summary = await this.generateSummary();
      this.destroy();
      this._notify('show-summary', { summary });
    });
  }

  _injectHudStyles() {
    if (document.getElementById('suya-hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'suya-hud-styles';
    style.textContent = `
      #smh-header {
        display: flex; align-items: center; gap: 8px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,.08);
        cursor: move; user-select: none;
      }
      #smh-icon { font-size: 16px; }
      #smh-title { flex: 1; font-weight: 600; font-size: 13px; color: rgba(255,255,255,.85); }
      #smh-toggle {
        background: none; border: none; color: rgba(255,255,255,.4);
        font-size: 18px; cursor: pointer; padding: 0 2px; line-height: 1;
      }
      #smh-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
      #smh-status { display: flex; align-items: center; gap: 8px; }
      #smh-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #FF4444;
        animation: pulse-dot 1.4s ease-in-out infinite;
      }
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: .5; transform: scale(.75); }
      }
      #smh-status-text { font-size: 12px; color: rgba(255,255,255,.5); }
      #smh-actions-header {
        font-size: 11px; font-weight: 600; letter-spacing: .06em;
        text-transform: uppercase; color: rgba(255,255,255,.3);
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 6px;
      }
      #smh-action-count {
        background: rgba(255,107,53,.2); color: #FF9068;
        border-radius: 10px; padding: 1px 6px; font-size: 10px;
      }
      #smh-actions-list {
        list-style: none; display: flex; flex-direction: column; gap: 5px;
        max-height: 140px; overflow-y: auto;
      }
      #smh-actions-list li {
        font-size: 12px; color: rgba(255,255,255,.7); line-height: 1.4;
        padding: 5px 8px; border-radius: 6px;
        background: rgba(255,255,255,.04);
        border-left: 2px solid rgba(255,107,53,.4);
      }
      #smh-end-btn {
        width: 100%; padding: 8px;
        background: linear-gradient(135deg, #FF6B35, #FF3D00);
        border: none; border-radius: 8px;
        color: #fff; font-size: 12px; font-weight: 700;
        font-family: inherit; cursor: pointer;
        transition: opacity .18s;
      }
      #smh-end-btn:hover { opacity: .85; }
    `;
    document.head.appendChild(style);
  }

  _updateHUD() {
    const list  = document.getElementById('smh-actions-list');
    const count = document.getElementById('smh-action-count');
    if (!list || !count) return;

    count.textContent = String(this.actionItems.length);
    list.innerHTML = this.actionItems.slice(-6).map(a =>
      `<li>${this._escapeHtml(a.text)}</li>`
    ).join('');
  }

  _updateHUDParticipants(_names) {
    // Future: show participant count in HUD
  }

  _showPermissionPrompt() {
    const status = document.getElementById('smh-status-text');
    if (status) status.textContent = 'Mic permission needed — click to grant';
  }

  /* ── Helpers ── */

  _escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  async _getStoredApiKeys() {
    return new Promise(resolve => {
      if (typeof chrome === 'undefined' || !chrome.storage) return resolve({});
      chrome.storage.sync.get('suyaSettings', ({ suyaSettings }) =>
        resolve(suyaSettings?.apiKeys ?? {})
      );
    });
  }

  async _getStoredMeetings() {
    return new Promise(resolve => {
      if (typeof chrome === 'undefined' || !chrome.storage) return resolve([]);
      chrome.storage.local.get('suyaMeetings', ({ suyaMeetings }) =>
        resolve(suyaMeetings ?? [])
      );
    });
  }

  _notify(type, payload) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: `MEETING_${type.toUpperCase().replace(/-/g,'_')}`, ...payload })
        .catch(() => {}); // ignore if no listener
    }
  }
}

/* ── Export / bootstrap ─────────────────────────────────────────── */
let _skill = null;

export function initMeetingAssistant() {
  if (_skill) return;
  _skill = new MeetingAssistantSkill();
  _skill.init();
}

export function destroyMeetingAssistant() {
  _skill?.destroy();
  _skill = null;
}

export function getMeetingSkill() { return _skill; }

export default MeetingAssistantSkill;
