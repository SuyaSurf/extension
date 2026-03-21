/**
 * UX Review Skill — ux-review-skill.js v1.0.0
 *
 * A full-page automated UX/bug-finding skill that:
 *   1. Installs ConsoleMonitor + NetworkMonitor at document_start
 *   2. Runs PageInspector for DOM/accessibility/form-UX analysis
 *   3. Optionally exercises forms via ApplicationWritingSkill (form-fill + error capture)
 *   4. Takes viewport/full-page screenshots and optional screen recordings
 *   5. Compiles a ReviewReport (inspection findings + console dump + network dump + captures)
 *   6. Stores the report and optionally emails it
 *   7. Accepts scheduled runs (daily/weekly) via ReviewScheduler
 *
 * Registered in the skill registry exactly like ApplicationWritingSkill.
 * Communicates over the same event bus (window CustomEvent).
 * Can be controlled from the extension popup.
 */
import { ReviewReporter }        from './review-reporter.js';
import { ReviewSchedulerInstance } from './scheduler.js';

class UXReviewSkill {
  constructor(config = {}) {
    this.name    = 'ux-review';
    this.version = '1.0.0';
    this.isActive = false;

    this.config = {
      // Monitoring
      monitorConsole:  true,
      monitorNetwork:  true,
      // Capture
      captureViewport: true,
      captureFullPage: false,
      captureRecording:false,
      recordingMaxSeconds: 20,
      // Form filling integration
      exerciseForms:   true,    // use ApplicationWritingSkill to fill forms and capture errors
      fillDelay:       2000,    // ms to wait after fill before capturing
      // Review timing
      settleMs:        2500,    // wait after page load before starting review
      // Delivery
      emailTo:         null,
      serverEndpoint:  null,
      // Scheduling
      allowScheduling: true,
      useEventBus:     true,
      ...config,
    };

    this.reporter   = new ReviewReporter({
      serverEndpoint:      this.config.serverEndpoint,
      emailTo:             this.config.emailTo,
      includeScreenshots:  this.config.captureViewport || this.config.captureFullPage,
      includeNetworkBodies:false,
    });

    // Runtime references (populated on initialize)
    this._formSkill    = null;   // ApplicationWritingSkill instance (if available)
    this._recorder     = null;   // ScreenshotRecorder
    this._activeRun    = null;   // Promise of ongoing run (prevents parallel runs)
    this._sessionId    = 'ux_' + Date.now();

    // Last completed report
    this.lastReport    = null;

    // Load character messenger if available
    this._messenger = typeof window !== 'undefined' ? window.CharacterMessenger : null;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  async initialize(formSkill = null) {
    this._messenger?.reportSuccess('UX Review Skill', `Initializing v${this.version}`);

    this._formSkill = formSkill;

    // Install monitors early so they capture page-load events
    if (this.config.monitorConsole && typeof window !== 'undefined' && window.ConsoleMonitor) {
      window.ConsoleMonitor.install(this._sessionId);
    }
    if (this.config.monitorNetwork && typeof window !== 'undefined' && window.NetworkMonitor) {
      window.NetworkMonitor.install(this._sessionId);
    }

    // Screenshot recorder (content-script side)
    if (typeof ScreenshotRecorder !== 'undefined') {
      this._recorder = new ScreenshotRecorder();
    }

    // Wire scheduler (background service worker will call install separately)
    if (this.config.allowScheduling && typeof ReviewSchedulerInstance !== 'undefined') {
      // This is invoked from background — inject the run callback
      if (typeof chrome !== 'undefined' && chrome.alarms) {
        await ReviewSchedulerInstance.install((job) => this._runScheduledJob(job));
      }
    }

    this._messenger?.sendMessage('UX Review Skill ready', { mode: 'idle' });
  }

  async activate() {
    this.isActive = true;
    this._emit('skill:activated', { skill: this.name });
  }

  async deactivate() {
    this.isActive = false;
    // Restore patched globals with safe access
    if (typeof window !== 'undefined') {
      window.ConsoleMonitor?.restore?.();
      window.NetworkMonitor?.restore?.();
    }
    this._emit('skill:deactivated', { skill: this.name });
  }

  // ─── Action handler ─────────────────────────────────────────────────────────
  async handleAction(action, data, sender = null) {
    switch (action) {
      case 'getStatus':           return this.getStatus();
      case 'runReview':           return this.runReview(data);
      case 'getLastReport':       return { report: this.lastReport };
      case 'getReports':          return { reports: await this.reporter.getAll() };
      case 'getReport':           return { report: await this.reporter.getById(data?.id) };
      case 'deleteReport':        return this.reporter.delete(data?.id);
      case 'downloadReport':      return this.downloadReport(data?.id, data?.format || 'html');
      case 'deliverReport':       return this.deliverReport(data?.id, data?.email);
      case 'captureScreenshot':   return this.captureScreenshot(data?.label);
      case 'startRecording':      return this._recorder?.startRecording(data) || { error: 'Recorder unavailable' };
      case 'stopRecording':       return this._recorder?.stopRecording()     || { error: 'Recorder unavailable' };

      // ── Scheduler ──────────────────────────────────────────────────────────
      case 'createSchedule':      return ReviewSchedulerInstance.createJob(data);
      case 'updateSchedule':      return ReviewSchedulerInstance.createJob({ ...data, id: data.id });
      case 'deleteSchedule':      return ReviewSchedulerInstance.deleteJob(data?.id);
      case 'enableSchedule':      return ReviewSchedulerInstance.enableJob(data?.id, data?.enabled ?? true);
      case 'getSchedules':        return { jobs: await ReviewSchedulerInstance.getJobsWithNextRun() };
      case 'runScheduleNow':      return ReviewSchedulerInstance.runJobNow(data?.id, 'manual');

      default: throw new Error(`[UXReviewSkill] Unknown action: ${action}`);
    }
  }

  // ─── Main: run a full review ─────────────────────────────────────────────────
  /**
   * Orchestrates a complete audit run on the current page.
   *
   * @param {object} [opts]
   * @param {string}  [opts.trigger]         'manual' | 'scheduled'
   * @param {boolean} [opts.captureFullPage]  override config
   * @param {boolean} [opts.captureRecording] override config
   * @param {boolean} [opts.exerciseForms]    override config
   * @param {string}  [opts.emailTo]          override delivery target
   * @param {string}  [opts.projectHint]      hint for ApplicationHistory
   * @returns {Promise<ReviewReport>}
   */
  async runReview(opts = {}) {
    if (this._activeRun) {
      this._messenger?.sendMessage('UX Review already in progress', { isShocked: true });
      return this._activeRun;
    }

    this._activeRun = this._doRunReview(opts);
    try {
      const report = await this._activeRun;
      return report;
    } finally {
      this._activeRun = null;
    }
  }

  async _doRunReview(opts = {}) {
    const cfg = { ...this.config, ...opts };

    this._emit('review:started', { 
      url: typeof window !== 'undefined' ? window.location?.href : 'unknown', 
      trigger: cfg.trigger || 'manual' 
    });
    this._messenger?.reportProgress('UX Review', 0, 'Starting comprehensive analysis...');

    // Clear previous monitor state for a clean run
    if (typeof window !== 'undefined') {
      window.ConsoleMonitor?.clear?.();
      window.NetworkMonitor?.clear?.();
    }
    if (this._recorder) this._recorder.clearHistory();

    // Wait for page to settle (SPAs finish hydrating etc.)
    await _sleep(cfg.settleMs ?? 2500);

    // ── 1. Baseline screenshot ───────────────────────────────────────────────
    let baselineShot = null;
    if ((cfg.captureViewport ?? true) && this._recorder) {
      baselineShot = await this._recorder.captureViewport('baseline');
      this._emit('review:progress', { step: 'baseline-screenshot', ts: Date.now() });
    }

    // ── 2. Page inspection ───────────────────────────────────────────────────
    let pageInspection = null;
    if (typeof window !== 'undefined' && window.PageInspector) {
      try {
        pageInspection = window.PageInspector.inspect();
        this._emit('review:progress', {
          step:        'page-inspection',
          findingCount: pageInspection.summary.total,
          score:       pageInspection.summary.score,
        });
      } catch (error) {
        console.warn('Page inspection failed:', error);
      }
    }

    // ── 3. Form scan + optional fill ─────────────────────────────────────────
    let fillResults   = [];
    let formScanResult = null;
    let fillSequence  = [];

    if ((cfg.exerciseForms ?? true) && typeof window !== 'undefined' && window.FormScanner) {
      try {
        const scanResult = window.FormScanner.scanWithContext
          ? window.FormScanner.scanWithContext()
          : window.FormScanner.scan();
        formScanResult = scanResult;

        if (scanResult.fields.length > 0 && this._formSkill) {
          this._emit('review:progress', { step: 'form-fill', fieldCount: scanResult.fields.length });

          // Capture before/after fill sequence
          fillSequence = await this._captureFillSequence(cfg, opts);
          fillResults  = fillSequence.fillResults || [];

          // Check for new console errors that appeared during form interaction
          const postFillConsole = typeof window !== 'undefined' ? window.ConsoleMonitor?.snapshot?.() : {};
          this._emit('review:progress', {
            step:         'form-fill-done',
            filled:       fillResults.filter(r => r.filled).length,
            newErrors:    (postFillConsole.entries || []).filter(e => e.level === 'error').length,
          });
        }
      } catch (error) {
        console.warn('Form scanning failed:', error);
      }
    }

    // ── 4. After-fill screenshot ──────────────────────────────────────────────
    if (fillSequence.length === 0 && (cfg.captureViewport ?? true) && this._recorder) {
      await this._recorder.captureViewport('after-interaction');
    }

    // ── 5. Full-page screenshot ───────────────────────────────────────────────
    if ((cfg.captureFullPage ?? false) && this._recorder) {
      this._emit('review:progress', { step: 'full-page-screenshot' });
      await this._recorder.captureFullPage('full-page');
    }

    // ── 6. Drain monitors ─────────────────────────────────────────────────────
    const consoleDump = typeof window !== 'undefined' ? window.ConsoleMonitor?.snapshot?.() : {};
    const networkDump = typeof window !== 'undefined' ? window.NetworkMonitor?.snapshot?.()  : {};
    const consoleSummary = typeof window !== 'undefined' ? window.ConsoleMonitor?.getSummary?.() : {};
    const networkSummary = typeof window !== 'undefined' ? window.NetworkMonitor?.getSummary?.() : {};

    // ── 7. Compile report ─────────────────────────────────────────────────────
    const captures = this._recorder?.getCaptureHistory() || [];

    const report = this.reporter.compile({
      pageInspection,
      consoleSummary: { ...consoleSummary, entries: consoleDump.entries, perf: consoleDump.perf },
      networkSummary: { ...networkSummary, requests: networkDump.requests, errors: networkDump.errors },
      captures,
      fillResults,
      formScanResult,
      trigger:    cfg.trigger || 'manual',
    });

    // ── 8. Save ────────────────────────────────────────────────────────────────
    await this.reporter.save(report);
    this.lastReport = report;

    // ── 9. Deliver ────────────────────────────────────────────────────────────
    const emailTo = cfg.emailTo || this.config.emailTo;
    if (emailTo) {
      await this.reporter.deliver(report, emailTo);
    }

    this._emit('review:completed', {
      reportId: report.id,
      score:    report.scores.overall,
      findings: report.inspection.summary?.total || 0,
      emailSent: !!emailTo,
    });

    this._messenger?.reportSuccess('UX Review', `Complete! Score: ${report.scores.overall} | Findings: ${report.inspection.summary?.total || 0}`);
    return report;
  }

  // ── Form fill sequence with screenshot capture ────────────────────────────
  async _captureFillSequence(cfg, opts) {
    if (!this._formSkill || !this._recorder) {
      // Just do the fill without screenshots
      const result = await this._formSkill?.handleAction('fillForms', {
        highlight:    true,
        projectHint:  opts.projectHint,
        generateContent: true,
      });
      return { fillResults: result?.results || [] };
    }

    const sequence = [];
    let fillResults = [];

    // Before
    const before = await this._recorder.captureViewport('form-before-fill');
    sequence.push({ phase: 'before', ...before });

    // Fill
    try {
      const result = await this._formSkill.handleAction('fillForms', {
        highlight:    true,
        projectHint:  opts.projectHint,
        generateContent: true,
      });
      fillResults = result?.results || [];
    } catch (err) {
      sequence.push({ phase: 'fill-error', error: String(err), ts: Date.now() });
    }

    // Settle after fill
    await _sleep(cfg.fillDelay ?? 2000);

    // After
    const after = await this._recorder.captureViewport('form-after-fill');
    sequence.push({ phase: 'after', ...after });

    return { sequence, fillResults };
  }

  // ─── Screenshot helpers ──────────────────────────────────────────────────────
  async captureScreenshot(label = 'manual') {
    if (!this._recorder) return { error: 'ScreenshotRecorder not available' };
    return this._recorder.captureViewport(label);
  }

  // ─── Report download ──────────────────────────────────────────────────────────
  async downloadReport(id, format = 'html') {
    const report = id ? await this.reporter.getById(id) : this.lastReport;
    if (!report) return { success: false, error: 'Report not found' };

    if (format === 'json') {
      this.reporter.downloadJSON(report);
    } else {
      this.reporter.downloadHTML(report);
    }
    return { success: true, id: report.id };
  }

  // ─── Email delivery ───────────────────────────────────────────────────────────
  async deliverReport(id, emailTo) {
    const report = id ? await this.reporter.getById(id) : this.lastReport;
    if (!report) return { success: false, error: 'Report not found' };
    return this.reporter.deliver(report, emailTo || this.config.emailTo);
  }

  // ─── Scheduled job handler ────────────────────────────────────────────────────
  async _runScheduledJob(job) {
    return ReviewSchedulerInstance.runJobNow(job, 'scheduled');
  }

  // ─── Status ────────────────────────────────────────────────────────────────────
  async getStatus() {
    const reports = await this.reporter.getAll();
    return {
      active:        this.isActive,
      version:       this.version,
      sessionId:     this._sessionId,
      running:       !!this._activeRun,
      lastReport: this.lastReport ? {
        id:          this.lastReport.id,
        score:       this.lastReport.scores.overall,
        generatedAt: this.lastReport.generatedAt,
        url:         this.lastReport.url,
      } : null,
      totalReports:  reports.length,
      scheduledJobs: ReviewSchedulerInstance.getAllJobs().length,
      monitors: {
        console: typeof window !== 'undefined' ? !!window.ConsoleMonitor : false,
        network: typeof window !== 'undefined' ? !!window.NetworkMonitor : false,
        inspector: typeof window !== 'undefined' ? !!window.PageInspector : false,
        recorder:  !!this._recorder,
      },
      formSkillLinked: !!this._formSkill,
      config: {
        monitorConsole:   this.config.monitorConsole,
        monitorNetwork:   this.config.monitorNetwork,
        captureViewport:  this.config.captureViewport,
        exerciseForms:    this.config.exerciseForms,
        emailTo:          this.config.emailTo ? '***' : null,
        serverEndpoint:   !!this.config.serverEndpoint,
      },
    };
  }

  // ─── Event bus ──────────────────────────────────────────────────────────────────
  _emit(eventName, detail = {}) {
    if (!this.config.useEventBus) return;
    try {
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent(eventName, {
          detail: { skill: this.name, version: this.version, ...detail },
          bubbles: true,
        }));
      }
    } catch (error) {
      console.warn('Event dispatch failed:', error);
    }
  }

  getVersion()      { return this.version; }
  getName()         { return this.name; }
  isActiveStatus()  { return this.isActive; }
  getDependencies() { return ['application-writing']; }
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export { UXReviewSkill };
