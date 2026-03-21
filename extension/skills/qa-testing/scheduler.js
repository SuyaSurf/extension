/* ─── scheduler.js ───────────────────────────────────────────────────────────
 * Context: background service worker
 *
 * Manages scheduled UX review jobs using chrome.alarms.
 * Each ScheduledJob defines:
 *   - which URLs to review
 *   - when / how often to run
 *   - what to capture (inspection, forms, network, screenshots)
 *   - where to deliver results (email, webhook, store-only)
 *
 * The background script must call ReviewScheduler.install() once on startup.
 * Jobs survive extension restarts via chrome.storage.local.
 *
 * chrome.alarms minimum period is 1 minute; shortest useful interval here is 1h.
 * ─────────────────────────────────────────────────────────────────────────── */
class ReviewScheduler {
  constructor() {
    this._JOBS_KEY   = 'suya_sched_jobs';
    this._ALARM_PFX  = 'suya_sched_';
    this._installed  = false;
    this._jobs       = new Map();   // id → ScheduledJob
    this._runCb      = null;        // async fn(job) — injected by ux-review-skill
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────
  /**
   * Call once from background.js on startup.
   * @param {Function} runFn  async (job: ScheduledJob) => ReviewReport
   */
  async install(runFn) {
    if (this._installed) return;
    this._installed = true;
    this._runCb     = runFn;

    await this._loadJobs();
    this._rebuildAlarms();

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (!alarm.name.startsWith(this._ALARM_PFX)) return;
      const jobId = alarm.name.slice(this._ALARM_PFX.length);
      this._executeJob(jobId).catch(e =>
        console.error('[ReviewScheduler] Job execution failed:', jobId, e)
      );
    });

    // Use character messenger if available, otherwise fallback to console.log
    if (typeof window !== 'undefined' && window.CharacterMessenger) {
      window.CharacterMessenger.sendMessage(`Review scheduler installed with ${this._jobs.size} job(s)`, { mode: 'idle' });
    } else {
      console.log(`[ReviewScheduler] Installed with ${this._jobs.size} job(s)`);
    }
  }

  // ─── Job CRUD ───────────────────────────────────────────────────────────────
  /**
   * Create or update a job.
   *
   * @param {object} opts
   * @param {string}   opts.name          Human-readable label
   * @param {string[]} opts.urls          URLs to audit
   * @param {string}   opts.schedule      'daily' | 'hourly' | 'weekly' | 'once' | cron-like string
   * @param {number}   [opts.atHour]      For 'daily': hour of day (0–23, UTC). Default 9.
   * @param {number}   [opts.atMinute]    Minute (0–59). Default 0.
   * @param {object}   [opts.capture]     What to capture
   * @param {object}   [opts.deliver]     Delivery config
   * @param {boolean}  [opts.enabled]     Default true
   * @param {string}   [opts.id]          If provided, updates existing job
   * @returns {ScheduledJob}
   */
  async createJob(opts = {}) {
    const id = opts.id || 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const existing = this._jobs.get(id);

    const job = {
      id,
      name:     opts.name  || `Review – ${new Date().toLocaleDateString()}`,
      urls:     Array.isArray(opts.urls) ? opts.urls : [opts.urls].filter(Boolean),
      schedule: opts.schedule || 'daily',
      atHour:   opts.atHour   ?? 9,
      atMinute: opts.atMinute ?? 0,
      enabled:  opts.enabled  ?? true,

      capture: {
        pageInspection: true,
        consoleLogs:    true,
        networkRequests:true,
        screenshots:    true,
        fullPage:       false,
        fillForms:      false,   // set true to also exercise form-filling skill
        recording:      false,
        recordingMaxSeconds: 15,
        ...(existing?.capture || {}),
        ...(opts.capture || {}),
      },

      deliver: {
        email:          null,    // 'you@example.com'
        serverEndpoint: null,
        storeOnly:      false,
        ...(existing?.deliver || {}),
        ...(opts.deliver || {}),
      },

      meta: {
        createdAt:   existing?.meta?.createdAt || Date.now(),
        updatedAt:   Date.now(),
        lastRunAt:   existing?.meta?.lastRunAt  || null,
        lastStatus:  existing?.meta?.lastStatus || null,
        totalRuns:   existing?.meta?.totalRuns  || 0,
        consecutiveFailures: existing?.meta?.consecutiveFailures || 0,
      },
    };

    this._jobs.set(id, job);
    await this._save();
    this._scheduleAlarm(job);

    // Use character messenger if available, otherwise fallback to console.log
    if (typeof window !== 'undefined' && window.CharacterMessenger) {
      window.CharacterMessenger.sendMessage(`Job ${existing ? 'updated' : 'created'}: ${id} - ${job.name}`, { mode: 'idle' });
    } else {
      console.log(`[ReviewScheduler] Job ${existing ? 'updated' : 'created'}:`, id, job.name);
    }
    return job;
  }

  async deleteJob(id) {
    this._jobs.delete(id);
    await chrome.alarms.clear(this._ALARM_PFX + id);
    await this._save();
    return { success: true };
  }

  async enableJob(id, enabled = true) {
    const job = this._jobs.get(id);
    if (!job) return { success: false, error: 'Job not found' };
    job.enabled        = enabled;
    job.meta.updatedAt = Date.now();
    await this._save();

    if (enabled) {
      this._scheduleAlarm(job);
    } else {
      await chrome.alarms.clear(this._ALARM_PFX + id);
    }
    return { success: true, job };
  }

  getJob(id)    { return this._jobs.get(id) || null; }
  getAllJobs()  { return [...this._jobs.values()]; }

  // ── Run a job immediately (manual trigger or scheduled callback) ───────────
  async runJobNow(idOrJob, trigger = 'manual') {
    const job = typeof idOrJob === 'string' ? this._jobs.get(idOrJob) : idOrJob;
    if (!job) return { success: false, error: 'Job not found' };

    // Mark start
    job.meta.lastRunAt = Date.now();
    await this._save();

    const results = [];
    const errors  = [];

    for (const url of job.urls) {
      try {
        const result = await this._runOnUrl(job, url, trigger);
        results.push({ url, ...result });
        job.meta.consecutiveFailures = 0;
      } catch (err) {
        errors.push({ url, error: err.message });
        job.meta.consecutiveFailures = (job.meta.consecutiveFailures || 0) + 1;
        console.error(`[ReviewScheduler] URL failed: ${url}`, err);
      }
    }

    job.meta.totalRuns++;
    job.meta.lastStatus = errors.length === job.urls.length ? 'failed'
                        : errors.length > 0                 ? 'partial'
                        : 'success';
    await this._save();

    // Auto-disable after 5 consecutive failures to prevent spam
    if (job.meta.consecutiveFailures >= 5) {
      console.warn(`[ReviewScheduler] Auto-disabling job ${job.id} after 5 failures`);
      await this.enableJob(job.id, false);
    }

    return { success: true, results, errors, jobId: job.id };
  }

  // ── Open the target URL in a tab and execute the review ───────────────────
  async _runOnUrl(job, url, trigger) {
    return new Promise(async (resolve, reject) => {
      let tab;
      try {
        // Open URL in a new background tab
        tab = await chrome.tabs.create({ url, active: false });

        // Wait for tab to fully load
        await this._waitForTabLoad(tab.id, 30_000);

        // Execute review via content script injection
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func:   _runReviewInTab,
          args:   [job, trigger],
        });

        const report = results?.[0]?.result;
        if (!report) throw new Error('No result from tab');

        // Deliver report
        if (!job.deliver.storeOnly) {
          await this._deliverReport(report, job);
        }

        resolve({ report, delivered: !job.deliver.storeOnly });
      } catch (err) {
        reject(err);
      } finally {
        // Close the background tab
        if (tab?.id) {
          try { await chrome.tabs.remove(tab.id); } catch {}
        }
      }
    });
  }

  async _waitForTabLoad(tabId, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tab load timeout')), timeoutMs);

      const listener = (id, info) => {
        if (id !== tabId) return;
        if (info.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          // Extra settle time for SPAs
          setTimeout(resolve, 2000);
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
      // Also check if already loaded
      chrome.tabs.get(tabId, (tab) => {
        if (tab?.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 2000);
        }
      });
    });
  }

  async _deliverReport(report, job) {
    if (!job.deliver.email && !job.deliver.serverEndpoint) return;

    const endpoint = job.deliver.serverEndpoint || null;
    if (endpoint) {
      try {
        await fetch(`${endpoint}/api/review/deliver`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            to:      job.deliver.email,
            report,
            jobId:   job.id,
            jobName: job.name,
          }),
        });
      } catch (e) {
        console.warn('[ReviewScheduler] Delivery failed:', e.message);
      }
    }
  }

  async _executeJob(jobId) {
    const job = this._jobs.get(jobId);
    if (!job || !job.enabled) return;
    // Use character messenger if available, otherwise fallback to console.log
    if (typeof window !== 'undefined' && window.CharacterMessenger) {
      window.CharacterMessenger.sendMessage(`Executing job "${job.name}" (${jobId})`, { isThinkingHard: true });
    } else {
      console.log(`[ReviewScheduler] Executing job "${job.name}" (${jobId})`);
    }

    if (this._runCb) {
      // Use injected callback if skill is wired in
      await this._runCb(job);
    } else {
      await this.runJobNow(job, 'scheduled');
    }
  }

  // ─── Alarm management ───────────────────────────────────────────────────────
  _scheduleAlarm(job) {
    if (!job.enabled) return;
    const alarmName = this._ALARM_PFX + job.id;
    const timing    = this._computeAlarmTiming(job);
    chrome.alarms.create(alarmName, timing);
  }

  _computeAlarmTiming(job) {
    const now    = Date.now();
    const minute = 60_000;

    switch (job.schedule) {
      case 'hourly':
        return { delayInMinutes: 60, periodInMinutes: 60 };

      case 'daily': {
        const nextRun = this._nextDailyRun(job.atHour, job.atMinute);
        return {
          when:            nextRun,
          periodInMinutes: 24 * 60,
        };
      }

      case 'weekly': {
        const nextRun = this._nextDailyRun(job.atHour, job.atMinute);
        return {
          when:            nextRun,
          periodInMinutes: 7 * 24 * 60,
        };
      }

      case 'once': {
        const nextRun = this._nextDailyRun(job.atHour, job.atMinute);
        return { when: nextRun };
      }

      default:
        // Treat as minutes interval (e.g. '120' = every 2 hours)
        const mins = parseInt(job.schedule) || 60;
        return { delayInMinutes: mins, periodInMinutes: mins };
    }
  }

  _nextDailyRun(hour, minute) {
    const now  = new Date();
    const next = new Date();
    next.setUTCHours(hour, minute, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime();
  }

  _rebuildAlarms() {
    for (const job of this._jobs.values()) {
      if (job.enabled) this._scheduleAlarm(job);
    }
  }

  // ─── Persistence ────────────────────────────────────────────────────────────
  async _save() {
    await chrome.storage.local.set({
      [this._JOBS_KEY]: Object.fromEntries(this._jobs),
    });
  }

  async _loadJobs() {
    try {
      const data = await chrome.storage.local.get(this._JOBS_KEY);
      const raw  = data[this._JOBS_KEY] || {};
      for (const [id, job] of Object.entries(raw)) {
        this._jobs.set(id, job);
      }
    } catch (e) {
      console.error('[ReviewScheduler] Load failed:', e);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  getNextRunTime(jobId) {
    return new Promise((resolve) => {
      chrome.alarms.get(this._ALARM_PFX + jobId, (alarm) => {
        resolve(alarm?.scheduledTime || null);
      });
    });
  }

  async getJobsWithNextRun() {
    const jobs = this.getAllJobs();
    return Promise.all(jobs.map(async job => ({
      ...job,
      nextRun: await this.getNextRunTime(job.id),
    })));
  }
}

// ── Content-script function injected into target tabs ─────────────────────────
// This runs INSIDE the page — must be self-contained (no closures over outer scope)
async function _runReviewInTab(job, trigger) {
  // Wait for skill globals to be available (injected by the extension)
  const maxWait  = 15_000;
  const startTs  = Date.now();
  while (typeof window !== 'undefined' && (!window.PageInspector || !window.ConsoleMonitor || !window.NetworkMonitor)) {
    if (Date.now() - startTs > maxWait) break;
    await new Promise(r => setTimeout(r, 300));
  }

  const report = {
    jobId:     job.id,
    jobName:   job.name,
    url:       typeof window !== 'undefined' ? window.location?.href : 'unknown',
    trigger,
    startedAt: Date.now(),
  };

  try {
    // Give the page time to finish loading + SPA hydration
    await new Promise(r => setTimeout(r, 3000));

    // Page inspection
    if (job.capture.pageInspection && typeof window !== 'undefined' && window.PageInspector) {
      try {
        report.inspection = window.PageInspector.inspect();
      } catch (error) {
        console.warn('Page inspection failed in scheduled job:', error);
      }
    }

    // Console dump
    if (job.capture.consoleLogs && typeof window !== 'undefined' && window.ConsoleMonitor) {
      try {
        report.consoleDump = window.ConsoleMonitor.snapshot();
        report.consoleSummary = window.ConsoleMonitor.getSummary();
      } catch (error) {
        console.warn('Console monitoring failed in scheduled job:', error);
      }
    }

    // Network dump
    if (job.capture.networkRequests && typeof window !== 'undefined' && window.NetworkMonitor) {
      try {
        report.networkDump    = window.NetworkMonitor.snapshot();
        report.networkSummary = window.NetworkMonitor.getSummary();
      } catch (error) {
        console.warn('Network monitoring failed in scheduled job:', error);
      }
    }

    // Screenshots
    if (job.capture.screenshots) {
      // Request viewport screenshot via background (message passing)
      const shot = await new Promise(res =>
        chrome.runtime.sendMessage({ action: 'screenshot:capture', label: 'auto' }, res)
      );
      report.screenshots = shot ? [shot] : [];
    }

    // Form fill (delegates to ApplicationWritingSkill if available)
    if (job.capture.fillForms) {
      if (window.FormScanner) {
        const scan = window.FormScanner.scan();
        report.formScan = {
          fields:    scan.fields.length,
          hasForms:  scan.fields.length > 0,
          formType:  window.FormScanner.detectFormType?.(scan),
        };
        // Full fill would require the skill — check via event bus result
        window.dispatchEvent(new CustomEvent('skill:requestFill', {
          detail: { jobId: job.id, highlight: true },
          bubbles: true,
        }));
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    report.completedAt = Date.now();
    report.success     = true;
  } catch (err) {
    report.error       = err.message;
    report.completedAt = Date.now();
    report.success     = false;
  }

  return report;
}

// Singleton for use in background.js
const ReviewSchedulerInstance = new ReviewScheduler();
export { ReviewScheduler, ReviewSchedulerInstance };
