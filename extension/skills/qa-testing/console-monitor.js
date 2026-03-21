/* ─── console-monitor.js ─────────────────────────────────────────────────────
 * Context: content script
 *
 * Installs itself early (injected before page scripts run) and intercepts:
 *  - console.log / info / warn / error / debug / group / groupEnd / table
 *  - window.onerror  (uncaught exceptions)
 *  - unhandledrejection  (uncaught promise rejections)
 *  - SecurityPolicyViolationEvent  (CSP violations)
 *  - PerformanceObserver  (LCP, FID, CLS, resource timing)
 *
 * All entries are accumulated internally.  Call .drain() to get-and-clear them,
 * or .snapshot() to get them without clearing.
 *
 * install() must be called as early as possible — ideally at document_start —
 * so it captures errors that fire before the page finishes loading.
 * ─────────────────────────────────────────────────────────────────────────── */
window.ConsoleMonitor = (() => {
  const _entries     = [];   // { level, args, message, stack?, url, line, col, ts }
  const _perf        = [];   // { type, value, ts, detail }
  let   _installed   = false;
  let   _sessionId   = null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function ts() { return Date.now(); }

  function safeStringify(v, depth = 0) {
    if (depth > 3) return '[…]';
    try {
      if (v === null)       return 'null';
      if (v === undefined)  return 'undefined';
      if (typeof v === 'function') return `[Function: ${v.name || 'anon'}]`;
      if (v instanceof Error)      return `${v.name}: ${v.message}`;
      if (typeof v === 'object')   return JSON.stringify(v, null, 2);
      return String(v);
    } catch { return '[unserializable]'; }
  }

  function argsToMessage(args) {
    return args.map(a => safeStringify(a)).join(' ');
  }

  function extractStack() {
    try { throw new Error(); } catch (e) {
      return (e.stack || '')
        .split('\n')
        .slice(3)   // remove ConsoleMonitor frames
        .join('\n');
    }
  }

  // ── Console method patching ────────────────────────────────────────────────
  const LEVELS = ['log','info','warn','error','debug','table','dir','group','groupEnd','groupCollapsed','assert','trace'];

  const _originals = {};

  function patchConsole() {
    for (const level of LEVELS) {
      _originals[level] = console[level];
      console[level] = function(...args) {
        // Always forward to original
        try { _originals[level].apply(console, args); } catch {}

        // Special handling for assert
        if (level === 'assert') {
          const [condition, ...rest] = args;
          if (condition) return;
          args = ['Assertion failed:', ...rest];
        }

        const entry = {
          level,
          message: argsToMessage(args),
          args:    args.map(a => safeStringify(a)),
          ts:      ts(),
          url:     window.location.href,
        };

        if (['error','warn','trace'].includes(level)) {
          entry.stack = extractStack();
        }

        _entries.push(entry);
      };
    }
  }

  // ── Global error handlers ──────────────────────────────────────────────────
  function patchGlobalErrors() {
    const origOnError = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
      _entries.push({
        level:   'error',
        message: String(message),
        source,
        line:    lineno,
        col:     colno,
        stack:   error?.stack || '',
        ts:      ts(),
        url:     window.location.href,
        type:    'uncaught',
      });
      return origOnError ? origOnError.apply(this, arguments) : false;
    };

    window.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason;
      _entries.push({
        level:   'error',
        message: reason instanceof Error ? `${reason.name}: ${reason.message}` : safeStringify(reason),
        stack:   reason instanceof Error ? reason.stack : '',
        ts:      ts(),
        url:     window.location.href,
        type:    'unhandledrejection',
      });
    }, { capture: true, passive: true });
  }

  // ── CSP violations ─────────────────────────────────────────────────────────
  function patchCSP() {
    document.addEventListener('securitypolicyviolation', (e) => {
      _entries.push({
        level:          'warn',
        type:           'csp-violation',
        message:        `CSP: blocked ${e.blockedURI} (directive: ${e.violatedDirective})`,
        blockedURI:     e.blockedURI,
        directive:      e.violatedDirective,
        originalPolicy: e.originalPolicy,
        ts:             ts(),
        url:            window.location.href,
      });
    }, { capture: true, passive: true });
  }

  // ── PerformanceObserver ────────────────────────────────────────────────────
  function observePerformance() {
    // Core Web Vitals
    const observe = (types, cb) => {
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) cb(entry);
        }).observe({ type: types, buffered: true });
      } catch {}
    };

    observe('largest-contentful-paint', (e) => {
      _perf.push({ type: 'LCP', value: Math.round(e.startTime), ts: ts(),
                   detail: { element: e.element?.tagName, url: e.url } });
    });

    observe('layout-shift', (e) => {
      if (!e.hadRecentInput) {
        _perf.push({ type: 'CLS', value: +e.value.toFixed(4), ts: ts(),
                     detail: { sources: (e.sources || []).length } });
      }
    });

    observe('first-input', (e) => {
      _perf.push({ type: 'FID', value: Math.round(e.processingStart - e.startTime), ts: ts(),
                   detail: { eventType: e.name } });
    });

    observe('longtask', (e) => {
      _perf.push({ type: 'LongTask', value: Math.round(e.duration), ts: ts(),
                   detail: { name: e.name, startTime: Math.round(e.startTime) } });
    });

    // Resource timing
    observe('resource', (e) => {
      const duration = Math.round(e.responseEnd - e.startTime);
      if (duration > 2000 || e.transferSize > 1_000_000) {
        _perf.push({
          type:   'SlowResource',
          value:  duration,
          ts:     ts(),
          detail: {
            url:          e.name,
            initiator:    e.initiatorType,
            transferSize: e.transferSize,
            cached:       e.transferSize === 0 && e.decodedBodySize > 0,
          },
        });
      }
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function install(sessionId) {
    if (_installed) return;
    _installed = true;
    _sessionId = sessionId || ('csm_' + Date.now());

    patchConsole();
    patchGlobalErrors();
    patchCSP();

    // Defer PerformanceObserver to after DOMContentLoaded (perf APIs need it)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observePerformance, { once: true });
    } else {
      observePerformance();
    }

    // Use character messenger if available, otherwise fallback to console.debug
    if (typeof window !== 'undefined' && window.CharacterMessenger) {
      window.CharacterMessenger.sendMessage('Console monitoring started', { mode: 'idle' });
    } else {
      console.debug('[ConsoleMonitor] Installed, session:', _sessionId);
    }
  }

  function drain() {
    const out = { entries: [..._entries], perf: [..._perf], sessionId: _sessionId };
    _entries.length = 0;
    _perf.length    = 0;
    return out;
  }

  function snapshot() {
    return { entries: [..._entries], perf: [..._perf], sessionId: _sessionId };
  }

  function clear() { _entries.length = 0; _perf.length = 0; }

  function getSummary() {
    const counts = _entries.reduce((acc, e) => {
      acc[e.level] = (acc[e.level] || 0) + 1;
      return acc;
    }, {});

    const errors   = _entries.filter(e => e.level === 'error');
    const warnings = _entries.filter(e => e.level === 'warn');

    // Aggregate CLS score
    const totalCLS = _perf.filter(p => p.type === 'CLS').reduce((s, p) => s + p.value, 0);
    const lcpEntry = _perf.filter(p => p.type === 'LCP').at(-1);
    const fidEntry = _perf.filter(p => p.type === 'FID')[0];

    return {
      totalEntries:  _entries.length,
      counts,
      errors:        errors.slice(0, 20),   // cap for reporting
      warnings:      warnings.slice(0, 20),
      uncaughtCount: _entries.filter(e => e.type === 'uncaught').length,
      rejectionCount:_entries.filter(e => e.type === 'unhandledrejection').length,
      cspCount:      _entries.filter(e => e.type === 'csp-violation').length,
      vitals: {
        LCP: lcpEntry ? { value: lcpEntry.value, rating: rateMetric('LCP', lcpEntry.value) } : null,
        FID: fidEntry ? { value: fidEntry.value, rating: rateMetric('FID', fidEntry.value) } : null,
        CLS: { value: +totalCLS.toFixed(4), rating: rateMetric('CLS', totalCLS) },
      },
      longTasks:      _perf.filter(p => p.type === 'LongTask').length,
      slowResources:  _perf.filter(p => p.type === 'SlowResource').length,
    };
  }

  // Core Web Vitals thresholds (Google 2023)
  function rateMetric(metric, value) {
    const thresholds = {
      LCP: [2500, 4000],
      FID: [100, 300],
      CLS: [0.1, 0.25],
    };
    const [good, poor] = thresholds[metric] || [Infinity, Infinity];
    if (value <= good) return 'good';
    if (value <= poor) return 'needs-improvement';
    return 'poor';
  }

  function restore() {
    for (const [level, orig] of Object.entries(_originals)) {
      try { console[level] = orig; } catch {}
    }
    _installed = false;
  }

  return { install, drain, snapshot, clear, getSummary, restore };
})();
