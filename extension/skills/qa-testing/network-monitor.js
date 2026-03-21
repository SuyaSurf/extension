/* ─── network-monitor.js ──────────────────────────────────────────────────────
 * Context: CONTENT SCRIPT side (NetworkMonitor) + BACKGROUND side (NetworkDebugger)
 *
 * Content script side:
 *   Patches window.fetch and XMLHttpRequest to intercept every network call
 *   made by the page.  Records: method, URL, status, timing, truncated
 *   request/response bodies, and response headers.
 *
 * Background side (NetworkDebugger class, exported separately):
 *   Uses chrome.debugger + Network domain for richer data: full headers,
 *   WebSocket frames, service-worker-intercepted requests, etc.
 *   Background must call NetworkDebugger.attach(tabId) to activate.
 *
 * Both sides write into the same logical schema so the review reporter can
 * consume a unified list regardless of which layer captured the request.
 * ─────────────────────────────────────────────────────────────────────────── */

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT SCRIPT — XHR / Fetch interceptor
// ══════════════════════════════════════════════════════════════════════════════
window.NetworkMonitor = (() => {
  const _requests = [];    // NetworkEntry[]
  const _errors   = [];    // failed/slow/error NetworkEntry[]
  let   _installed = false;
  let   _sessionId = null;

  const MAX_BODY_BYTES = 8_192;   // truncate bodies larger than this
  const SLOW_MS        = 3_000;   // flag requests taking longer than this
  const MAX_ENTRIES    = 500;

  // ── Schema ─────────────────────────────────────────────────────────────────
  function makeEntry(partial = {}) {
    return {
      id:             'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      method:         'GET',
      url:            '',
      urlShort:       '',
      status:         null,
      statusText:     '',
      type:           'fetch',          // fetch | xhr | beacon | ws
      requestHeaders: {},
      requestBody:    null,
      responseHeaders:{},
      responseBody:   null,
      responseSize:   null,
      startTime:      Date.now(),
      endTime:        null,
      duration:       null,
      error:          null,
      flagged:        false,
      flagReasons:    [],
      initiator:      null,
      redirected:     false,
      cached:         false,
      sessionId:      _sessionId,
      ...partial,
    };
  }

  function shortUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname + u.pathname.slice(0, 60) + (u.search ? '?' + u.search.slice(1, 30) : '');
    } catch { return url.slice(0, 80); }
  }

  function truncate(str) {
    if (!str) return null;
    const s = typeof str === 'string' ? str : JSON.stringify(str);
    return s.length > MAX_BODY_BYTES ? s.slice(0, MAX_BODY_BYTES) + ' …[truncated]' : s;
  }

  function flag(entry) {
    const reasons = [];
    if (entry.status >= 500)                             reasons.push('5xx-error');
    if (entry.status >= 400 && entry.status < 500)      reasons.push('4xx-error');
    if (entry.duration > SLOW_MS)                       reasons.push('slow-response');
    if (entry.error)                                     reasons.push('network-error');
    if (/password|token|secret|api[_-]?key/i.test(entry.url)) reasons.push('sensitive-url');
    if (entry.status === 0 && !entry.error)             reasons.push('blocked-or-cors');
    entry.flagged    = reasons.length > 0;
    entry.flagReasons = reasons;
    return entry;
  }

  function store(entry) {
    flag(entry);
    if (_requests.length >= MAX_ENTRIES) _requests.shift();
    _requests.push(entry);
    if (entry.flagged) _errors.push(entry);
  }

  // ── Fetch patch ─────────────────────────────────────────────────────────────
  const _origFetch = window.fetch;

  function patchFetch() {
    window.fetch = async function(input, init = {}) {
      const url    = typeof input === 'string' ? input : (input?.url || String(input));
      const method = (init.method || (typeof input === 'object' ? input.method : null) || 'GET').toUpperCase();

      const entry = makeEntry({
        method,
        url,
        urlShort:    shortUrl(url),
        type:        'fetch',
        requestBody: truncate(init.body),
      });

      // Capture request headers
      try {
        const headers = init.headers
          ? (init.headers instanceof Headers
              ? Object.fromEntries(init.headers)
              : init.headers)
          : {};
        entry.requestHeaders = headers;
      } catch {}

      let response;
      try {
        response = await _origFetch.apply(this, [input, init]);
      } catch (err) {
        entry.error    = String(err);
        entry.endTime  = Date.now();
        entry.duration = entry.endTime - entry.startTime;
        store(entry);
        throw err;
      }

      entry.status     = response.status;
      entry.statusText = response.statusText;
      entry.redirected = response.redirected;
      entry.endTime    = Date.now();
      entry.duration   = entry.endTime - entry.startTime;

      try {
        entry.responseHeaders = Object.fromEntries(response.headers);
        const ct = response.headers.get('content-type') || '';
        // Only clone+read body for text/JSON responses (avoid consuming binary)
        if (/text|json|xml|form/.test(ct)) {
          const clone = response.clone();
          entry.responseBody = truncate(await clone.text());
        }
        const cl = response.headers.get('content-length');
        if (cl) entry.responseSize = parseInt(cl);
      } catch {}

      store(entry);
      return response;
    };
  }

  // ── XHR patch ───────────────────────────────────────────────────────────────
  const _OrigXHR    = window.XMLHttpRequest;
  const _origOpen   = _OrigXHR.prototype.open;
  const _origSend   = _OrigXHR.prototype.send;
  const _origSetHdr = _OrigXHR.prototype.setRequestHeader;

  function patchXHR() {
    _OrigXHR.prototype.open = function(method, url, ...rest) {
      this._nEntry = makeEntry({ method: method.toUpperCase(), url, urlShort: shortUrl(url), type: 'xhr' });
      return _origOpen.apply(this, [method, url, ...rest]);
    };

    _OrigXHR.prototype.setRequestHeader = function(name, value) {
      if (this._nEntry) {
        this._nEntry.requestHeaders = this._nEntry.requestHeaders || {};
        this._nEntry.requestHeaders[name] = value;
      }
      return _origSetHdr.apply(this, arguments);
    };

    _OrigXHR.prototype.send = function(body) {
      if (this._nEntry) {
        this._nEntry.requestBody = truncate(body);

        this.addEventListener('loadend', () => {
          if (!this._nEntry) return;
          const e         = this._nEntry;
          e.status        = this.status;
          e.statusText    = this.statusText;
          e.endTime       = Date.now();
          e.duration      = e.endTime - e.startTime;
          e.responseSize  = this.response?.length || null;
          e.cached        = this.status === 304;

          try {
            const hdrs = {};
            (this.getAllResponseHeaders() || '').split('\r\n').forEach(line => {
              const i = line.indexOf(':');
              if (i > 0) hdrs[line.slice(0, i).trim()] = line.slice(i + 1).trim();
            });
            e.responseHeaders = hdrs;

            const ct = (hdrs['content-type'] || '').toLowerCase();
            if (/text|json|xml|form/.test(ct)) {
              e.responseBody = truncate(this.responseText);
            }
          } catch {}

          store(e);
        });

        this.addEventListener('error', () => {
          if (!this._nEntry) return;
          this._nEntry.error    = 'Network error';
          this._nEntry.endTime  = Date.now();
          this._nEntry.duration = this._nEntry.endTime - this._nEntry.startTime;
          store(this._nEntry);
        });
      }
      return _origSend.apply(this, arguments);
    };
  }

  // ── Beacon patch ────────────────────────────────────────────────────────────
  const _origBeacon = navigator.sendBeacon?.bind(navigator);
  function patchBeacon() {
    if (!_origBeacon) return;
    navigator.sendBeacon = function(url, data) {
      store(makeEntry({
        method: 'POST', url, urlShort: shortUrl(url), type: 'beacon',
        requestBody: truncate(data), status: 204, duration: 0, endTime: Date.now(),
      }));
      return _origBeacon(url, data);
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  function install(sessionId) {
    if (_installed) return;
    _installed = true;
    _sessionId = sessionId || ('nm_' + Date.now());
    patchFetch();
    patchXHR();
    patchBeacon();
    
    // Use character messenger if available, otherwise fallback to console.debug
    if (typeof window !== 'undefined' && window.CharacterMessenger) {
      window.CharacterMessenger.sendMessage('Network monitoring started', { mode: 'idle' });
    } else {
      console.debug('[NetworkMonitor] Installed, session:', _sessionId);
    }
  }

  function drain() {
    const out = { requests: [..._requests], errors: [..._errors], sessionId: _sessionId };
    _requests.length = 0;
    _errors.length   = 0;
    return out;
  }

  function snapshot() {
    return { requests: [..._requests], errors: [..._errors], sessionId: _sessionId };
  }

  function clear() { _requests.length = 0; _errors.length = 0; }

  function getSummary() {
    const reqs    = _requests;
    const total   = reqs.length;
    const failed  = reqs.filter(r => r.status >= 400 || r.error).length;
    const slow    = reqs.filter(r => r.duration > SLOW_MS).length;
    const avgMs   = total > 0
      ? Math.round(reqs.filter(r => r.duration).reduce((s, r) => s + r.duration, 0) / total)
      : 0;

    const byDomain = reqs.reduce((acc, r) => {
      try {
        const h = new URL(r.url).hostname;
        acc[h] = (acc[h] || 0) + 1;
      } catch {}
      return acc;
    }, {});

    const flaggedEntries = reqs.filter(r => r.flagged);

    return {
      total, failed, slow, avgMs,
      successRate: total > 0 ? +(((total - failed) / total) * 100).toFixed(1) : 100,
      byDomain,
      flagged:      flaggedEntries,
      flaggedCount: flaggedEntries.length,
      byStatus: reqs.reduce((acc, r) => {
        const bucket = r.status ? String(r.status)[0] + 'xx' : 'err';
        acc[bucket]  = (acc[bucket] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  function restore() {
    try { window.fetch = _origFetch; } catch {}
    try { window.XMLHttpRequest.prototype.open   = _origOpen;   } catch {}
    try { window.XMLHttpRequest.prototype.send   = _origSend;   } catch {}
    try { window.XMLHttpRequest.prototype.setRequestHeader = _origSetHdr; } catch {}
    if (_origBeacon) try { navigator.sendBeacon = _origBeacon; } catch {}
    _installed = false;
  }

  return { install, drain, snapshot, clear, getSummary, restore };
})();


// ══════════════════════════════════════════════════════════════════════════════
// BACKGROUND SERVICE WORKER — chrome.debugger bridge
// Import / use this separately in the background script.
// ══════════════════════════════════════════════════════════════════════════════
class NetworkDebugger {
  constructor() {
    this._tabs   = new Map();   // tabId → { requests, responses, ws }
    this._bound  = false;
  }

  // Call from background.js once
  installListeners() {
    if (this._bound) return;
    this._bound = true;

    chrome.debugger.onEvent.addListener((source, method, params) => {
      const tabId = source.tabId;
      const store = this._tabs.get(tabId);
      if (!store) return;

      if (method === 'Network.requestWillBeSent') {
        store.requests.set(params.requestId, {
          id:             params.requestId,
          url:            params.request.url,
          method:         params.request.method,
          requestHeaders: params.request.headers,
          requestBody:    params.request.postData || null,
          startTime:      Date.now(),
          type:           params.type,
          initiator:      params.initiator?.type,
        });
      }

      if (method === 'Network.responseReceived') {
        const req = store.requests.get(params.requestId) || {};
        store.requests.set(params.requestId, {
          ...req,
          status:          params.response.status,
          statusText:      params.response.statusText,
          responseHeaders: params.response.headers,
          mimeType:        params.response.mimeType,
          endTime:         Date.now(),
          duration:        req.startTime ? Date.now() - req.startTime : null,
          fromCache:       params.response.fromDiskCache || params.response.fromServiceWorker,
        });
      }

      if (method === 'Network.loadingFailed') {
        const req = store.requests.get(params.requestId) || {};
        store.requests.set(params.requestId, {
          ...req,
          error:    params.errorText,
          blocked:  params.blocked,
          endTime:  Date.now(),
          flagged:  true,
          flagReasons: [params.blocked ? 'blocked' : 'network-error'],
        });
      }

      if (method === 'Network.webSocketCreated') {
        store.ws.push({ url: params.url, startTime: Date.now() });
      }
    });

    chrome.debugger.onDetach.addListener((source) => {
      // Keep data, just mark as detached
      const store = this._tabs.get(source.tabId);
      if (store) store.attached = false;
    });
  }

  async attach(tabId) {
    this.installListeners();
    if (this._tabs.has(tabId) && this._tabs.get(tabId).attached) return;

    this._tabs.set(tabId, { requests: new Map(), ws: [], attached: true });

    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {
        maxResourceBufferSize: 10_000_000,
        maxTotalBufferSize:    20_000_000,
      });
    } catch (e) {
      // Use character messenger if available, otherwise fallback to console.error
      if (typeof window !== 'undefined' && window.CharacterMessenger) {
        window.CharacterMessenger.reportError('Network Debugger', `Attach failed for tab ${tabId}: ${e.message}`);
      } else {
        console.error('[NetworkDebugger] Attach failed for tab', tabId, e);
      }
    }
  }

  async detach(tabId) {
    try { await chrome.debugger.detach({ tabId }); } catch {}
    this._tabs.delete(tabId);
  }

  snapshot(tabId) {
    const store = this._tabs.get(tabId);
    if (!store) return { requests: [], ws: [] };
    return {
      requests: [...store.requests.values()],
      ws:       [...store.ws],
    };
  }

  drain(tabId) {
    const data = this.snapshot(tabId);
    const store = this._tabs.get(tabId);
    if (store) { store.requests.clear(); store.ws.length = 0; }
    return data;
  }
}

// Singleton for background use
if (typeof chrome !== 'undefined' && chrome.debugger) {
  window._NetworkDebugger = window._NetworkDebugger || new NetworkDebugger();
}
