/* ─── screenshot-recorder.js ─────────────────────────────────────────────────
 * Dual-context module:
 *
 *   ScreenshotRecorder  (content script / popup)
 *     - Requests captures from the background via chrome.runtime.sendMessage
 *     - Manages a timed recording session using getDisplayMedia / tabCapture
 *     - Returns base64 PNGs + webm blobs
 *
 *   ScreenshotService  (background service worker)
 *     - Listens for capture requests from content scripts
 *     - Calls chrome.tabs.captureVisibleTab for viewport screenshots
 *     - Stores captures with metadata in chrome.storage.local
 *
 * Usage (content script):
 *   const rec = new ScreenshotRecorder();
 *   const shot  = await rec.captureViewport('label');
 *   const full  = await rec.captureFullPage('label');    // scrolls + stitches
 *   await rec.startRecording({ maxSeconds: 10 });
 *   // … do things …
 *   const { blob, url } = await rec.stopRecording();
 * ─────────────────────────────────────────────────────────────────────────── */

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT SCRIPT SIDE
// ══════════════════════════════════════════════════════════════════════════════
class ScreenshotRecorder {
  constructor() {
    this._captures      = [];   // { label, dataUrl, ts, width, height, type }
    this._recorder      = null;
    this._chunks        = [];
    this._recordingStart = null;
    this._stream        = null;
  }

  // ── Viewport screenshot (asks background via message) ─────────────────────
  async captureViewport(label = '') {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'screenshot:capture', label },
        (response) => {
          if (chrome.runtime.lastError || !response?.dataUrl) {
            resolve({ error: chrome.runtime.lastError?.message || 'Capture failed', label });
            return;
          }
          const capture = {
            label,
            dataUrl: response.dataUrl,
            ts:      Date.now(),
            width:   response.width  || null,
            height:  response.height || null,
            type:    'viewport',
          };
          this._captures.push(capture);
          resolve(capture);
        }
      );
    });
  }

  // ── Full-page screenshot (scroll + stitch multiple viewport captures) ──────
  async captureFullPage(label = '', opts = {}) {
    const {
      scrollDelay    = 300,   // ms between scroll positions
      maxScrolls     = 20,    // safety limit
    } = opts;

    const originalScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const pageHeight = typeof window !== 'undefined' ? Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ) : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const totalScrolls = pageHeight > 0 ? Math.min(Math.ceil(pageHeight / viewportHeight), maxScrolls) : 1;

    const frames = [];
    for (let i = 0; i < totalScrolls; i++) {
      if (typeof window !== 'undefined') {
        window.scrollTo(0, i * viewportHeight);
      }
      await _sleep(scrollDelay);
      const shot = await this.captureViewport(`${label}__frame_${i}`);
      if (shot.dataUrl) frames.push(shot);
    }

    // Restore scroll position
    if (typeof window !== 'undefined') {
      window.scrollTo(0, originalScrollY);
    }

    const stitched = await this._stitchFrames(frames, viewportHeight);
    const capture = {
      label,
      dataUrl: stitched,
      ts:      Date.now(),
      frames:  frames.length,
      type:    'full-page',
    };

    this._captures.push(capture);
    return capture;
  }

  // ── Stitch frames using an off-screen canvas ──────────────────────────────
  async _stitchFrames(frames, frameHeight) {
    if (frames.length === 0) return null;
    if (frames.length === 1) return frames[0].dataUrl;

    return new Promise((resolve) => {
      // Load all images first
      let loaded = 0;
      const imgs = frames.map(() => new Image());

      const onLoad = () => {
        loaded++;
        if (loaded < frames.length) return;

        const w      = imgs[0].naturalWidth;
        const totalH = imgs.reduce((s, img) => s + img.naturalHeight, 0);

        const canvas  = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = totalH;
        const ctx     = canvas.getContext('2d');

        let y = 0;
        for (const img of imgs) {
          ctx.drawImage(img, 0, y);
          y += img.naturalHeight;
        }

        resolve(canvas.toDataURL('image/png'));
      };

      imgs.forEach((img, i) => {
        img.onload = onLoad;
        img.src    = frames[i].dataUrl;
      });
    });
  }

  // ── Screen recording ───────────────────────────────────────────────────────
  async startRecording(opts = {}) {
    const {
      maxSeconds   = 30,
      videoBitsPerSecond = 2_500_000,
      mimeType     = this._getSupportedMimeType(),
    } = opts;

    if (this._recorder) await this.stopRecording();

    // Use tab capture if available (background grants it), else display media
    this._stream = await this._acquireStream();
    if (!this._stream) return { error: 'Could not acquire media stream' };

    this._chunks        = [];
    this._recordingStart = Date.now();

    const options = { videoBitsPerSecond };
    if (mimeType) options.mimeType = mimeType;

    this._recorder = new MediaRecorder(this._stream, options);
    this._recorder.ondataavailable = (e) => {
      if (e.data?.size > 0) this._chunks.push(e.data);
    };

    this._recorder.start(500);  // 500ms timeslice for streaming

    // Auto-stop after maxSeconds
    this._autoStopTimer = setTimeout(() => this.stopRecording(), maxSeconds * 1000);

    return { recording: true, maxSeconds, mimeType };
  }

  async stopRecording() {
    clearTimeout(this._autoStopTimer);
    if (!this._recorder || this._recorder.state === 'inactive') {
      return { error: 'No active recording' };
    }

    return new Promise((resolve) => {
      this._recorder.onstop = async () => {
        const mimeType = this._recorder.mimeType || 'video/webm';
        const blob     = new Blob(this._chunks, { type: mimeType });
        const url      = URL.createObjectURL(blob);
        const duration = Date.now() - this._recordingStart;

        // Convert to base64 for storage
        const base64 = await _blobToBase64(blob);

        this._stream?.getTracks().forEach(t => t.stop());
        this._stream   = null;
        this._recorder = null;
        this._chunks   = [];

        const recording = {
          blob,
          url,
          base64,
          mimeType,
          duration,
          size:  blob.size,
          ts:    this._recordingStart,
          type:  'recording',
        };

        this._captures.push({ ...recording, blob: null }); // don't keep blob in array
        resolve(recording);
      };
      this._recorder.stop();
    });
  }

  _getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  async _acquireStream() {
    // First try: ask background for tabCapture stream ID
    const streamId = await new Promise(res => {
      chrome.runtime.sendMessage({ action: 'screenshot:getStreamId' }, r => res(r?.streamId || null));
    });

    if (streamId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource:   'tab',
              chromeMediaSourceId: streamId,
            },
          },
        });
      } catch {}
    }

    // Fallback: getDisplayMedia (requires user gesture in some browsers)
    try {
      return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {}

    return null;
  }

  // ── Convenience: snapshot sequence around a form fill ─────────────────────
  async captureFormFillSequence(label, fillFn) {
    const sequence = [];

    const before = await this.captureViewport(`${label}__before`);
    sequence.push({ phase: 'before', ...before });

    try {
      await fillFn();
    } catch (err) {
      sequence.push({ phase: 'error', error: String(err), ts: Date.now() });
    }

    await _sleep(500);  // let animations settle
    const after = await this.captureViewport(`${label}__after`);
    sequence.push({ phase: 'after', ...after });

    return sequence;
  }

  getCaptureHistory()  { return [...this._captures]; }
  clearHistory()       { this._captures.length = 0; }

  // Download a capture as a file (popup/devtools use)
  download(capture, filename) {
    if (!capture?.dataUrl) return;
    const a    = document.createElement('a');
    a.href     = capture.dataUrl;
    a.download = filename || `capture_${Date.now()}.png`;
    a.click();
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// BACKGROUND SERVICE WORKER SIDE  — install once in background.js
// ══════════════════════════════════════════════════════════════════════════════
class ScreenshotService {
  constructor() {
    this._installed = false;
  }

  install() {
    if (this._installed) return;
    this._installed = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'screenshot:capture') {
        this._handleCapture(sender.tab?.id, message.label, sendResponse);
        return true;  // keep message channel open for async response
      }

      if (message.action === 'screenshot:getStreamId') {
        this._handleGetStreamId(sender.tab?.id, sendResponse);
        return true;
      }
    });
  }

  async _handleCapture(tabId, label, sendResponse) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(
        null,
        { format: 'png', quality: 90 }
      );

      // Store with metadata
      const id  = 'cap_' + Date.now();
      const rec = { id, label, dataUrl, ts: Date.now(), tabId };
      await chrome.storage.local.set({ [id]: rec });

      sendResponse({ dataUrl, id });
    } catch (e) {
      sendResponse({ error: e.message });
    }
  }

  _handleGetStreamId(tabId, sendResponse) {
    if (!tabId) { sendResponse({ error: 'No tabId' }); return; }
    try {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
        sendResponse({ streamId: streamId || null });
      });
    } catch {
      sendResponse({ streamId: null });
    }
  }

  // List all stored captures for a tab
  async getCaptures(tabId) {
    const all = await chrome.storage.local.get(null);
    return Object.values(all)
      .filter(v => v?.ts && v?.dataUrl && (!tabId || v.tabId === tabId))
      .sort((a, b) => b.ts - a.ts);
  }

  async deleteCapture(id) {
    await chrome.storage.local.remove(id);
  }

  async clearCaptures() {
    const all  = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter(k => all[k]?.dataUrl);
    if (keys.length) await chrome.storage.local.remove(keys);
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader  = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Export for background
if (typeof self !== 'undefined' && typeof importScripts !== 'undefined') {
  // Service worker context
  self.ScreenshotService = ScreenshotService;
} else if (typeof window !== 'undefined') {
  window.ScreenshotRecorder = ScreenshotRecorder;
  window.ScreenshotService  = ScreenshotService;
}
