/* ─── review-reporter.js ─────────────────────────────────────────────────────
 * Context: content script + background service worker
 *
 * ReviewReporter compiles a full ReviewDump (page inspection + console logs +
 * network requests + screenshots + form-fill results) into a structured
 * ReviewReport, stores it in chrome.storage, and optionally emails it.
 *
 * Email delivery options (in priority order):
 *   1. Configured server endpoint  POST /api/review/deliver
 *   2. mailto: link (opens native mail client — user must hit send)
 *
 * The report is also saved as a self-contained HTML blob that can be
 * downloaded directly from the extension popup.
 * ─────────────────────────────────────────────────────────────────────────── */
class ReviewReporter {
  constructor(config = {}) {
    this.config = {
      serverEndpoint:  null,           // 'https://your-server.com'
      emailTo:         null,           // 'you@example.com'
      emailFrom:       'ux-review@suya-extension',
      maxReports:      50,             // purge oldest when exceeded
      reportStorageKey:'suya_ux_reports',
      includeScreenshots: true,
      includeNetworkBodies: false,     // can make reports very large
      ...config,
    };
  }

  // ── Compile a ReviewReport from all collected data ─────────────────────────
  /**
   * @param {object} opts
   * @param {object}   opts.pageInspection      from PageInspector.inspect()
   * @param {object}   opts.consoleSummary       from ConsoleMonitor.snapshot()
   * @param {object}   opts.networkSummary       from NetworkMonitor.snapshot()
   * @param {object[]} opts.captures             from ScreenshotRecorder.getCaptureHistory()
   * @param {object[]} opts.fillResults          from ApplicationWritingSkill.fillForms()
   * @param {object}   opts.formScanResult       from FormScanner.scan()
   * @param {string}   [opts.trigger]            'manual' | 'scheduled' | 'url-change'
   * @param {string}   [opts.scheduledJobId]
   * @returns {ReviewReport}
   */
  compile(opts = {}) {
    const {
      pageInspection   = {},
      consoleSummary   = {},
      networkSummary   = {},
      captures         = [],
      fillResults      = [],
      formScanResult   = null,
      trigger          = 'manual',
      scheduledJobId   = null,
    } = opts;

    const netStats  = networkSummary.requests
      ? this._computeNetworkStats(networkSummary)
      : (networkSummary.stats || {});

    const consoleStats = consoleSummary.entries
      ? this._computeConsoleStats(consoleSummary)
      : (consoleSummary.summary || {});

    const report = {
      id:             'rpt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      url:            window.location.href,
      title:          document.title,
      trigger,
      scheduledJobId,
      generatedAt:    Date.now(),

      // ── Scores ────────────────────────────────────────────────────────────
      scores: {
        ux:        pageInspection.summary?.score       ?? null,
        console:   this._consoleScore(consoleStats),
        network:   this._networkScore(netStats),
        overall:   null,   // computed below
      },

      // ── Page inspection ───────────────────────────────────────────────────
      inspection: {
        summary:  pageInspection.summary  || {},
        findings: pageInspection.findings || [],
        durationMs: pageInspection.durationMs || null,
      },

      // ── Console dump ───────────────────────────────────────────────────────
      console: {
        summary: consoleStats,
        entries: (consoleSummary.entries || []).slice(0, 200),
        perf:    consoleSummary.perf || [],
        vitals:  consoleStats.vitals || null,
      },

      // ── Network dump ───────────────────────────────────────────────────────
      network: {
        summary:  netStats,
        requests: this._filterNetworkForReport(networkSummary.requests || []),
        errors:   networkSummary.errors || [],
      },

      // ── Screenshots / recordings ───────────────────────────────────────────
      captures: this.config.includeScreenshots
        ? captures.map(c => ({
            label:   c.label,
            ts:      c.ts,
            type:    c.type,
            dataUrl: c.dataUrl,    // may be omitted for recordings to save space
            size:    c.dataUrl?.length || c.size || null,
          }))
        : captures.map(c => ({ label: c.label, ts: c.ts, type: c.type })),

      // ── Form fill results ──────────────────────────────────────────────────
      formFill: {
        attempted: fillResults.length > 0,
        results:   fillResults,
        fieldCount: formScanResult?.fields?.length || null,
        formType:  formScanResult ? window.FormScanner?.detectFormType?.(formScanResult) : null,
      },

      // ── Raw request list for the "review dump" ────────────────────────────
      reviewDump: {
        networkRequests:  this._buildReviewDumpNetwork(networkSummary),
        consoleLogs:      consoleSummary.entries || [],
        performanceMetrics: consoleSummary.perf  || [],
      },
    };

    // Overall score: weighted average
    const sc = report.scores;
    const valid = [sc.ux, sc.console, sc.network].filter(v => v !== null);
    sc.overall = valid.length > 0
      ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
      : null;

    return report;
  }

  // ── Scoring helpers ────────────────────────────────────────────────────────
  _consoleScore(stats) {
    if (!stats) return 100;
    let score = 100;
    score -= (stats.counts?.error   || 0) * 10;
    score -= (stats.counts?.warn    || 0) * 3;
    score -= (stats.uncaughtCount   || 0) * 15;
    score -= (stats.rejectionCount  || 0) * 10;
    score -= (stats.cspCount        || 0) * 8;
    return Math.max(0, score);
  }

  _networkScore(stats) {
    if (!stats) return 100;
    let score = 100;
    score -= (stats.failed          || 0) * 10;
    score -= (stats.slow            || 0) * 5;
    score -= (stats.flaggedCount    || 0) * 8;
    return Math.max(0, score);
  }

  _computeNetworkStats(networkData) {
    const reqs   = networkData.requests || [];
    const total  = reqs.length;
    const failed = reqs.filter(r => r.status >= 400 || r.error).length;
    const slow   = reqs.filter(r => r.duration > 3000).length;
    const avgMs  = total > 0
      ? Math.round(reqs.filter(r => r.duration).reduce((s, r) => s + r.duration, 0) / total)
      : 0;
    const flagged = reqs.filter(r => r.flagged);
    return { total, failed, slow, avgMs,
             successRate: total > 0 ? +(((total - failed) / total) * 100).toFixed(1) : 100,
             flagged, flaggedCount: flagged.length };
  }

  _computeConsoleStats(consoleData) {
    const entries = consoleData.entries || [];
    const counts  = entries.reduce((acc, e) => {
      acc[e.level] = (acc[e.level] || 0) + 1; return acc;
    }, {});
    return {
      totalEntries:   entries.length,
      counts,
      uncaughtCount:  entries.filter(e => e.type === 'uncaught').length,
      rejectionCount: entries.filter(e => e.type === 'unhandledrejection').length,
      cspCount:       entries.filter(e => e.type === 'csp-violation').length,
      vitals:         null,
    };
  }

  _filterNetworkForReport(requests) {
    return requests.map(r => {
      const out = { ...r };
      if (!this.config.includeNetworkBodies) {
        delete out.requestBody;
        delete out.responseBody;
      }
      return out;
    });
  }

  _buildReviewDumpNetwork(networkData) {
    return (networkData.requests || []).map(r => ({
      method:   r.method,
      url:      r.url,
      status:   r.status,
      duration: r.duration,
      error:    r.error || null,
      flagged:  r.flagged,
      flagReasons: r.flagReasons,
      ts:       r.startTime,
    }));
  }

  // ── Storage ────────────────────────────────────────────────────────────────
  async save(report) {
    try {
      const all = await this._loadAll();
      all.unshift(report);
      // Purge oldest beyond limit
      const trimmed = all.slice(0, this.config.maxReports);
      await chrome.storage.local.set({ [this.config.reportStorageKey]: trimmed });
      return { success: true, id: report.id };
    } catch (e) {
      // Use character messenger if available, otherwise fallback to console.error
      if (typeof window !== 'undefined' && window.CharacterMessenger) {
        window.CharacterMessenger.reportError('Report Save', e.message);
      } else {
        console.error('[ReviewReporter] Save failed:', e);
      }
      return { success: false, error: e.message };
    }
  }

  async getAll() { return this._loadAll(); }

  async getById(id) {
    const all = await this._loadAll();
    return all.find(r => r.id === id) || null;
  }

  async delete(id) {
    const all     = await this._loadAll();
    const trimmed = all.filter(r => r.id !== id);
    await chrome.storage.local.set({ [this.config.reportStorageKey]: trimmed });
    return { success: true };
  }

  async _loadAll() {
    try {
      const result = await chrome.storage.local.get(this.config.reportStorageKey);
      return result[this.config.reportStorageKey] || [];
    } catch { return []; }
  }

  // ── Email delivery ─────────────────────────────────────────────────────────
  async deliver(report, emailTo = null) {
    const to       = emailTo || this.config.emailTo;
    const subject  = this._emailSubject(report);
    const htmlBody = this._buildEmailHTML(report);

    let result;

    // Try server endpoint first
    if (this.config.serverEndpoint) {
      result = await this._deliverViaServer(report, to, subject, htmlBody);
      if (result.success) return result;
    }

    // Fallback: mailto link
    return this._deliverViaMail(to, subject, htmlBody);
  }

  async _deliverViaServer(report, to, subject, htmlBody) {
    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), 15_000);

      const res = await fetch(`${this.config.serverEndpoint}/api/review/deliver`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to, subject, html: htmlBody, reportId: report.id }),
        signal:  controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`Server ${res.status}`);
      return { success: true, method: 'server' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  _deliverViaMail(to, subject, htmlBody) {
    // Convert HTML to plain text for mailto body (keep it short)
    const plain = this._htmlToPlainText(htmlBody).slice(0, 2000);
    const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plain)}`;

    // In content script we can create a link; in background this is a no-op
    if (typeof document !== 'undefined') {
      const a  = document.createElement('a');
      a.href   = mailto;
      a.target = '_blank';
      a.click();
    }
    return { success: true, method: 'mailto', note: 'Opened mail client — user must send manually.' };
  }

  // ── HTML report generation ─────────────────────────────────────────────────
  _emailSubject(report) {
    const grade = report.scores.overall != null
      ? ` (Score: ${report.scores.overall}/100)`
      : '';
    const date = new Date(report.generatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return `UX Review: ${report.title || report.url}${grade} — ${date}`;
  }

  buildHTML(report) { return this._buildEmailHTML(report); }

  _buildEmailHTML(report) {
    const d    = new Date(report.generatedAt);
    const insp = report.inspection?.summary || {};
    const net  = report.network?.summary    || {};
    const cons = report.console?.summary    || {};
    const sc   = report.scores             || {};
    const vitals = report.console?.vitals  || {};

    const scoreColor = (s) => s == null ? '#888' : s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626';
    const sevColor   = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#2563eb', info: '#6b7280' };

    const findingRows = (report.inspection?.findings || []).map(f => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0">
          <span style="background:${sevColor[f.severity]||'#888'};color:#fff;border-radius:3px;padding:2px 6px;font-size:11px;font-weight:600;text-transform:uppercase">${f.severity}</span>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-weight:500">${this._esc(f.title)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#555;font-size:12px">${this._esc(f.category)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#555;font-size:12px">${this._esc(f.fix || '')}</td>
      </tr>`).join('');

    const networkRows = (report.network?.errors || []).slice(0, 20).map(r => `
      <tr>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:12px">${r.method}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:11px;word-break:break-all;max-width:300px">${this._esc((r.url||'').slice(0,100))}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;color:${r.status>=400||r.error?'#dc2626':'#16a34a'}">${r.status || r.error || '—'}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:12px">${r.duration ? r.duration + 'ms' : '—'}</td>
      </tr>`).join('');

    const consoleRows = (report.console?.entries || []).filter(e => ['error','warn'].includes(e.level)).slice(0, 20).map(e => `
      <tr>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:11px;color:${e.level==='error'?'#dc2626':'#d97706'};font-weight:600">${e.level.toUpperCase()}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:11px;word-break:break-all;max-width:400px">${this._esc((e.message||'').slice(0,200))}</td>
      </tr>`).join('');

    const screenshotImgs = this.config.includeScreenshots
      ? (report.captures || []).filter(c => c.dataUrl).slice(0, 6).map(c => `
        <div style="margin-bottom:16px">
          <p style="margin:0 0 4px;font-size:12px;color:#555">${this._esc(c.label || c.type)} — ${new Date(c.ts).toLocaleTimeString()}</p>
          <img src="${c.dataUrl}" style="max-width:100%;border:1px solid #e5e5e5;border-radius:4px">
        </div>`).join('')
      : '<p style="color:#888;font-size:12px">Screenshots not included in this report.</p>';

    const vitalBadge = (name, v) => {
      if (!v) return '';
      const color = v.rating === 'good' ? '#16a34a' : v.rating === 'needs-improvement' ? '#d97706' : '#dc2626';
      return `<span style="display:inline-block;margin:0 8px 8px 0;padding:4px 10px;border-radius:4px;background:${color};color:#fff;font-size:12px;font-weight:600">${name}: ${v.value}${name==='CLS'?'':' ms'} (${v.rating})</span>`;
    };

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${this._esc(report.title || 'UX Review')}</title></head>
<body style="margin:0;padding:0;background:#f8f8f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a">

<div style="max-width:900px;margin:0 auto;padding:24px">

  <!-- Header -->
  <div style="background:#1a1a2e;border-radius:8px;padding:24px 28px;margin-bottom:20px;color:#fff">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
      <div>
        <h1 style="margin:0 0 4px;font-size:20px;font-weight:700">UX &amp; Bug Review</h1>
        <p style="margin:0;font-size:13px;opacity:.75">${this._esc(report.url)}</p>
        <p style="margin:4px 0 0;font-size:12px;opacity:.6">${d.toLocaleString()} · Triggered by: ${report.trigger}</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:42px;font-weight:800;color:${scoreColor(sc.overall)};line-height:1">${sc.overall ?? '—'}</div>
        <div style="font-size:11px;opacity:.7;margin-top:2px">Overall Score / 100</div>
      </div>
    </div>
  </div>

  <!-- Score cards -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
    ${[
      ['UX / Accessibility', sc.ux],
      ['Console Health',     sc.console],
      ['Network Health',     sc.network],
    ].map(([label, val]) => `
    <div style="background:#fff;border-radius:6px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${label}</div>
      <div style="font-size:32px;font-weight:700;color:${scoreColor(val)}">${val ?? '—'}</div>
    </div>`).join('')}
  </div>

  <!-- Core Web Vitals -->
  ${vitals && Object.values(vitals).some(Boolean) ? `
  <div style="background:#fff;border-radius:6px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px">
    <h2 style="margin:0 0 10px;font-size:14px;font-weight:600">Core Web Vitals</h2>
    ${vitalBadge('LCP', vitals.LCP)}${vitalBadge('FID', vitals.FID)}${vitalBadge('CLS', vitals.CLS)}
  </div>` : ''}

  <!-- Inspection Findings -->
  <div style="background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px;overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
      <h2 style="margin:0;font-size:14px;font-weight:600">UX / Accessibility Findings (${insp.total || 0})</h2>
      <span style="font-size:12px;color:#888">${insp.critical||0} critical · ${insp.high||0} high · ${insp.medium||0} medium</span>
    </div>
    ${findingRows ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f9fafb;font-size:11px;color:#888;text-transform:uppercase">
        <th style="padding:8px 10px;text-align:left">Severity</th>
        <th style="padding:8px 10px;text-align:left">Issue</th>
        <th style="padding:8px 10px;text-align:left">Category</th>
        <th style="padding:8px 10px;text-align:left">Fix</th>
      </tr></thead>
      <tbody>${findingRows}</tbody>
    </table>` : '<p style="padding:16px 20px;color:#888;margin:0">No findings.</p>'}
  </div>

  <!-- Network Errors -->
  <div style="background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px;overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
      <h2 style="margin:0;font-size:14px;font-weight:600">Network Requests (${net.total||0} total)</h2>
      <span style="font-size:12px;color:#888">${net.failed||0} failed · ${net.slow||0} slow · avg ${net.avgMs||0}ms</span>
    </div>
    ${networkRows ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f9fafb;font-size:11px;color:#888;text-transform:uppercase">
        <th style="padding:8px;text-align:left">Method</th><th style="padding:8px;text-align:left">URL</th>
        <th style="padding:8px;text-align:left">Status</th><th style="padding:8px;text-align:left">Duration</th>
      </tr></thead>
      <tbody>${networkRows}</tbody>
    </table>` : '<p style="padding:16px 20px;color:#888;margin:0">No flagged network requests.</p>'}
  </div>

  <!-- Console Errors/Warnings -->
  <div style="background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px;overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
      <h2 style="margin:0;font-size:14px;font-weight:600">Console Output</h2>
      <span style="font-size:12px;color:#888">${cons.counts?.error||0} errors · ${cons.counts?.warn||0} warnings</span>
    </div>
    ${consoleRows ? `
    <table style="width:100%;border-collapse:collapse">
      <tbody>${consoleRows}</tbody>
    </table>` : '<p style="padding:16px 20px;color:#888;margin:0">No console errors or warnings.</p>'}
  </div>

  <!-- Screenshots -->
  <div style="background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:20px;padding:16px 20px">
    <h2 style="margin:0 0 14px;font-size:14px;font-weight:600">Screenshots (${(report.captures||[]).length})</h2>
    ${screenshotImgs}
  </div>

  <!-- Footer -->
  <p style="text-align:center;font-size:11px;color:#aaa;margin-top:8px">
    Generated by Suya Extension · Report ID: ${report.id}
  </p>

</div>
</body></html>`;
  }

  _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  _htmlToPlainText(html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── Download report as HTML file ──────────────────────────────────────────
  downloadHTML(report) {
    const html = this._buildEmailHTML(report);
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ux-review-${report.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Download review dump as JSON ──────────────────────────────────────────
  downloadJSON(report) {
    const str  = JSON.stringify(report, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ux-review-dump-${report.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export { ReviewReporter };
