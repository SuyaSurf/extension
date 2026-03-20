/**
 * voice-interface.additions.js
 *
 * Augmentations to extension/shared/voice-interface/voice-interface.js.
 * Adds: exponential-backoff retry, text-input fallback, visual status feedback,
 * permission request flow, and offscreen-document audio workaround.
 */

/* ═══════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════ */

const BACKOFF_SEQUENCE = [500, 1000, 2000, 4000, 8000]; // ms
const MAX_RETRIES      = 5;
const RESTART_DELAY    = 300; // ms between stop and restart

/* ═══════════════════════════════════════════════════════════════════
   VoiceInterfaceEnhanced
   Wraps / replaces your existing VoiceInterface class.
   ═══════════════════════════════════════════════════════════════════ */

export class VoiceInterfaceEnhanced {
  constructor({
    onResult,         // (transcript: string, isFinal: boolean) => void
    onStatusChange,   // (status: VoiceStatus) => void
    onFallback,       // () => void — called when mic unavailable
    lang = 'en-US',
  } = {}) {
    this._onResult       = onResult       ?? (() => {});
    this._onStatusChange = onStatusChange ?? (() => {});
    this._onFallback     = onFallback     ?? (() => {});
    this._lang           = lang;

    this._recognition    = null;
    this._retryCount     = 0;
    this._retryTimer     = null;
    this._isActive       = false;
    this._permissionState = 'unknown'; // 'granted'|'denied'|'prompt'|'unknown'

    /** @type {'idle'|'requesting'|'listening'|'processing'|'error'|'fallback'} */
    this.status = 'idle';
  }

  /* ── Public API ── */

  async start() {
    if (this._isActive) return;

    // Check / request permission first
    const granted = await this._ensurePermission();
    if (!granted) {
      this._switchToFallback('Permission denied');
      return;
    }

    this._isActive  = true;
    this._retryCount = 0;
    this._startRecognition();
  }

  stop() {
    this._isActive   = false;
    this._retryCount = 0;
    clearTimeout(this._retryTimer);
    this._stopRecognition();
    this._setStatus('idle');
  }

  /* ── Permission handling ── */

  async _ensurePermission() {
    // Already know it's granted
    if (this._permissionState === 'granted') return true;

    // Check via Permissions API if available
    if (navigator.permissions) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        this._permissionState = result.state;

        result.onchange = () => {
          this._permissionState = result.state;
          if (result.state === 'denied' && this._isActive) {
            this._switchToFallback('Permission revoked');
          }
        };

        if (result.state === 'denied') return false;
        if (result.state === 'granted') return true;
      } catch (_) {
        // Permissions API not available — fall through to getUserMedia probe
      }
    }

    // Probe with getUserMedia to trigger browser prompt
    this._setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately release the stream — we only needed the permission grant
      stream.getTracks().forEach(t => t.stop());
      this._permissionState = 'granted';
      return true;
    } catch (err) {
      this._permissionState = 'denied';
      console.warn('[Suya Voice] Mic permission error:', err.name);
      return false;
    }
  }

  /* ── Recognition lifecycle ── */

  _startRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this._switchToFallback('SpeechRecognition API not available');
      return;
    }

    this._recognition = new SpeechRecognition();
    this._recognition.continuous     = true;
    this._recognition.interimResults = true;
    this._recognition.lang           = this._lang;
    this._recognition.maxAlternatives = 1;

    this._recognition.onstart = () => {
      this._retryCount = 0; // successful start resets retry counter
      this._setStatus('listening');
    };

    this._recognition.onresult = (event) => {
      this._setStatus('processing');
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        this._onResult(res[0].transcript, res.isFinal);
      }
      // Return to listening after processing
      if (this._isActive) this._setStatus('listening');
    };

    this._recognition.onerror = (event) => {
      console.warn('[Suya Voice] Recognition error:', event.error);
      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          this._permissionState = 'denied';
          this._switchToFallback('Mic not allowed');
          return;

        case 'no-speech':
          // Not an error — user is just quiet. Restart quietly.
          this._scheduleRestart(0);
          return;

        case 'aborted':
          // We called stop() ourselves — ignore
          return;

        case 'network':
          this._setStatus('error');
          this._scheduleRestart(this._backoffDelay());
          return;

        default:
          this._setStatus('error');
          this._scheduleRestart(this._backoffDelay());
      }
    };

    this._recognition.onend = () => {
      if (!this._isActive) return;
      // Ended unexpectedly (not by us) — restart
      this._scheduleRestart(RESTART_DELAY);
    };

    try {
      this._recognition.start();
    } catch (err) {
      console.warn('[Suya Voice] Could not start:', err);
      this._scheduleRestart(this._backoffDelay());
    }
  }

  _stopRecognition() {
    if (!this._recognition) return;
    this._recognition.onend = null; // prevent auto-restart handler
    try { this._recognition.abort(); } catch (_) {}
    this._recognition = null;
  }

  _scheduleRestart(delayMs) {
    if (!this._isActive) return;
    if (this._retryCount >= MAX_RETRIES) {
      this._switchToFallback(`Max retries (${MAX_RETRIES}) exceeded`);
      return;
    }
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => {
      if (!this._isActive) return;
      this._retryCount++;
      this._stopRecognition();
      this._startRecognition();
    }, delayMs);
  }

  _backoffDelay() {
    return BACKOFF_SEQUENCE[Math.min(this._retryCount, BACKOFF_SEQUENCE.length - 1)];
  }

  /* ── Text-input fallback ── */

  _switchToFallback(reason) {
    console.info(`[Suya Voice] Switching to text fallback. Reason: ${reason}`);
    this._isActive = false;
    this._stopRecognition();
    this._setStatus('fallback');
    this._onFallback();
    this._injectTextFallback();
  }

  _injectTextFallback() {
    if (document.getElementById('suya-voice-fallback')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'suya-voice-fallback';
    wrapper.innerHTML = `
      <div class="svf-inner">
        <span class="svf-icon">🎙️</span>
        <input class="svf-input" type="text" placeholder="Type your command…" autocomplete="off"/>
        <button class="svf-send">→</button>
      </div>
    `;

    Object.assign(wrapper.style, {
      position: 'fixed', bottom: '100px', left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483646',
      animation: 'svfSlideIn .25s ease',
    });

    const style = document.createElement('style');
    style.textContent = `
      @keyframes svfSlideIn {
        from { opacity: 0; transform: translateX(-50%) translateY(10px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      #suya-voice-fallback .svf-inner {
        display: flex; align-items: center; gap: 8px;
        background: #161920; border: 1px solid rgba(255,255,255,.15);
        border-radius: 50px; padding: 8px 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,.5);
      }
      .svf-icon { font-size: 18px; }
      .svf-input {
        background: none; border: none; outline: none; width: 260px;
        font-family: 'DM Sans', system-ui, sans-serif; font-size: 14px;
        color: rgba(255,255,255,.85);
      }
      .svf-input::placeholder { color: rgba(255,255,255,.3); }
      .svf-send {
        background: linear-gradient(135deg, #FF6B35, #FF3D00);
        border: none; border-radius: 50%; width: 28px; height: 28px;
        color: #fff; font-size: 14px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; transition: opacity .15s;
      }
      .svf-send:hover { opacity: .8; }
    `;
    document.head.appendChild(style);

    const input = wrapper.querySelector('.svf-input');
    const send  = wrapper.querySelector('.svf-send');

    const submit = () => {
      const val = input.value.trim();
      if (!val) return;
      this._onResult(val, true);
      input.value = '';
    };

    send.addEventListener('click', submit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') wrapper.remove();
    });

    // Auto-focus
    requestAnimationFrame(() => input.focus());
    document.body.appendChild(wrapper);

    // Self-destruct after 30 s of inactivity
    let idleTimer = setTimeout(() => wrapper.remove(), 30000);
    input.addEventListener('input', () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => wrapper.remove(), 30000);
    });
  }

  /* ── Status helper ── */

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    try { this._onStatusChange(status); } catch (_) {}
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Visual status indicator helper
   Call this from your SuyaBot component to update bot expression
   based on voice status.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * @param {string} status
 * @returns {{ isListening: boolean, isShocked: boolean, message: string|undefined }}
 */
export function voiceStatusToProps(status) {
  switch (status) {
    case 'requesting':
      return { isListening: false, isShocked: true,  message: 'Requesting microphone access…' };
    case 'listening':
      return { isListening: true,  isShocked: false, message: undefined };
    case 'processing':
      return { isListening: true,  isShocked: false, message: undefined };
    case 'error':
      return { isListening: false, isShocked: true,  message: 'Having trouble hearing you, retrying…' };
    case 'fallback':
      return { isListening: false, isShocked: false, message: 'Type your command below ↓' };
    default:
      return { isListening: false, isShocked: false, message: undefined };
  }
}
