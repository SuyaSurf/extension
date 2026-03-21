/**
 * Messaging Skill — messaging-skill.js v1.0.0
 *
 * Orchestrates extraction of emails (Gmail, Outlook) and chat messages
 * (WhatsApp Web, Telegram Web) using a resilient multi-strategy DOM approach.
 *
 * Core capabilities:
 *  - Auto-detects the current platform on initialize
 *  - One-shot scan or continuous real-time watch via MutationObserver
 *  - SPA navigation awareness: re-fires on URL changes within Gmail / WA / Telegram
 *  - Exposes a normalised MessageStore (search, filter, export)
 *  - Integrates with the shared event bus (CustomEvent on window)
 *  - Gracefully degrades: reports selector health so the popup can warn users
 *    when a platform UI update has broken extraction
 *
 * Actions available via handleAction():
 *   scan          — one-shot extract of current view
 *   watch         — start real-time watcher
 *   stopWatch     — stop watcher
 *   extractView   — export full current conversation/thread
 *   search        — query the local store
 *   getUnread     — count unread items
 *   exportData    — JSON | CSV | text export
 *   clearStore    — wipe stored messages
 *   diagnose      — selector health report
 *   getStatus     — skill status
 */
import { MessageStore } from './message-store.js';

class MessagingSkill {
  constructor(config = {}) {
    this.name    = 'messaging';
    this.version = '1.0.0';
    this.isActive = false;

    this.config = {
      autoWatch:      false,  // start real-time watcher on initialize
      watchDebounce:  400,    // ms between MutationObserver callbacks
      maxItems:       5000,   // MessageStore cap
      autoSave:       true,   // persist extracted items automatically
      batchSaveDelay: 2000,   // debounce for batch saves
      useEventBus:    true,
      ...config,
    };

    this.store = new MessageStore({ maxRecords: this.config.maxItems });

    // State
    this._watcher          = null;   // { stop } from MessageExtractor.watch()
    this._navObserver      = null;   // watches URL changes (SPA navigation)
    this._lastUrl          = null;
    this._lastPlatform     = null;
    this._totalExtracted   = 0;
    this._saveDebounce     = null;
    this._scanCount        = 0;
    this._newThisSession   = 0;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  async initialize() {
    console.log('[MessagingSkill] Initializing v' + this.version);

    if (typeof window === 'undefined') return;

    // Require platform globals
    if (!window.MessageExtractor || !window.PlatformAdapters) {
      console.warn('[MessagingSkill] Missing MessageExtractor or PlatformAdapters globals');
    }

    await this.store.initialize();

    const platform = window.MessageExtractor?.getPlatform();
    this._lastPlatform = platform;
    this._lastUrl      = window.location.href;

    if (platform) {
      console.log('[MessagingSkill] Detected platform:', platform);
      this._emit('messaging:platformDetected', { platform });
    }

    // Watch for SPA navigation (Gmail changes URL hash; WA/TG change path)
    this._startNavObserver();

    if (this.config.autoWatch) {
      this._startWatcher();
    }

    console.log('[MessagingSkill] Ready. Store has', this.store.count(), 'messages');
  }

  async activate() {
    this.isActive = true;
    this._emit('skill:activated', { skill: this.name });
  }

  async deactivate() {
    this.isActive = false;
    this._stopWatcher();
    this._stopNavObserver();
    this._emit('skill:deactivated', { skill: this.name });
  }

  // ─── Action handler ─────────────────────────────────────────────────────────
  async handleAction(action, data, sender = null) {
    switch (action) {
      case 'getStatus':    return this.getStatus();
      case 'scan':         return this.scan(data);
      case 'watch':        return this.startWatch(data);
      case 'stopWatch':    return this.stopWatch();
      case 'extractView':  return this.extractCurrentView(data);
      case 'search':       return this.search(data);
      case 'getUnread':    return this.getUnread();
      case 'exportData':   return this.exportData(data);
      case 'clearStore':   return this.clearStore(data);
      case 'diagnose':     return this.diagnose();
      case 'getStore':     return this.getStoreSummary();
      case 'getMessages':  return this.getMessages(data);

      // ── Guided selector learning ─────────────────────────────────────────
      case 'startGuidedMode':   return this.startGuidedMode(data);
      case 'stopGuidedMode':    return this.stopGuidedMode();
      case 'getLearnedProfile': return this.getLearnedProfile(data?.platform);
      case 'deleteLearnedProfile': return this.deleteLearnedProfile(data?.platform);
      case 'getAllLearnedProfiles': return this.getAllLearnedProfiles();

      default: throw new Error(`[MessagingSkill] Unknown action: ${action}`);
    }
  }

  // ─── One-shot scan ──────────────────────────────────────────────────────────
  async scan(opts = {}) {
    if (!window.MessageExtractor) return { error: 'MessageExtractor not available' };

    const result = window.MessageExtractor.scan();
    this._scanCount++;

    if (result.items.length > 0 && this.config.autoSave) {
      await this._debouncedSave(result.items);
    }

    this._totalExtracted += result.newCount;
    this._newThisSession += result.newCount;

    this._emit('messaging:scanComplete', {
      platform:  result.platform,
      view:      result.view,
      newCount:  result.newCount,
      total:     result.total,
    });

    return {
      success:   true,
      items:     result.items,
      platform:  result.platform,
      view:      result.view,
      newCount:  result.newCount,
      total:     result.total,
      scanCount: this._scanCount,
    };
  }

  // ─── Real-time watcher ──────────────────────────────────────────────────────
  async startWatch(opts = {}) {
    if (this._watcher) this.stopWatch();

    if (!window.MessageExtractor) return { error: 'MessageExtractor not available' };

    this._watcher = window.MessageExtractor.watch(
      async (newItems, result) => {
        this._newThisSession += newItems.length;
        this._totalExtracted += newItems.length;

        if (this.config.autoSave && newItems.length > 0) {
          await this._debouncedSave(newItems);
        }

        this._emit('messaging:newMessages', {
          count:    newItems.length,
          platform: result.platform,
          view:     result.view,
          // Include a lightweight preview (first 3 items, body truncated)
          preview:  newItems.slice(0, 3).map(i => ({
            id:      i.id,
            sender:  i.sender,
            snippet: (i.body || i.snippet || '').slice(0, 80),
            ts:      i.timestamp,
          })),
        });
      },
      { debounceMs: opts.debounceMs || this.config.watchDebounce }
    );

    this._emit('messaging:watchStarted', { platform: this._lastPlatform });
    return { success: true, watching: true, platform: this._lastPlatform };
  }

  stopWatch() {
    this._stopWatcher();
    this._emit('messaging:watchStopped', { platform: this._lastPlatform });
    return { success: true, watching: false };
  }

  // ─── Extract current view completely (clears dedup for this call) ──────────
  async extractCurrentView(opts = {}) {
    if (!window.MessageExtractor) return { error: 'MessageExtractor not available' };

    const result = window.MessageExtractor.extractCurrentView();

    if (this.config.autoSave && result.items.length > 0) {
      await this.store.upsertMany(result.items);
    }

    this._emit('messaging:viewExtracted', {
      platform: result.platform,
      count:    result.items.length,
      view:     result.view,
    });

    return {
      success:  true,
      items:    result.items,
      count:    result.items.length,
      platform: result.platform,
      view:     result.view,
    };
  }

  // ─── Filtered extraction (without touching store) ──────────────────────────
  async search(opts = {}) {
    // If there's a keyword, check the extractor for fresh DOM results too
    if (opts.liveSearch && window.MessageExtractor) {
      const filter  = { keyword: opts.keyword, sender: opts.sender, unreadOnly: opts.unreadOnly };
      const fresh   = window.MessageExtractor.extractFiltered(filter);
      if (fresh.items.length && this.config.autoSave) {
        await this.store.upsertMany(fresh.items);
      }
    }

    // Query the persisted store
    const result = this.store.query(opts);

    return {
      success:  true,
      items:    result.items,
      total:    result.total,
      returned: result.returned,
    };
  }

  // ─── Get messages from store ────────────────────────────────────────────────
  async getMessages(opts = {}) {
    const {
      platform, kind, direction, sender, keyword,
      unreadOnly, after, before, threadId,
      sortBy, order, limit = 50, offset = 0,
    } = opts || {};

    return this.store.query({
      platform, kind, direction, sender, keyword,
      unreadOnly, after, before, threadId,
      sortBy, order, limit, offset,
    });
  }

  // ─── Unread count ───────────────────────────────────────────────────────────
  async getUnread() {
    const liveCount  = window.MessageExtractor?.countUnread() || { count: 0, platform: null };
    const storedUnread = this.store.query({ unreadOnly: true }).total;

    return {
      live:    liveCount.count,
      stored:  storedUnread,
      platform: liveCount.platform || this._lastPlatform,
    };
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  async exportData(opts = {}) {
    const { format = 'json', ...queryOpts } = opts || {};

    let data, mimeType, ext;

    switch (format) {
      case 'csv':
        data     = this.store.exportCSV(queryOpts);
        mimeType = 'text/csv';
        ext      = 'csv';
        break;
      case 'text':
        data     = this.store.exportPlainText(queryOpts);
        mimeType = 'text/plain';
        ext      = 'txt';
        break;
      default:
        data     = this.store.exportJSON(queryOpts);
        mimeType = 'application/json';
        ext      = 'json';
    }

    // Trigger download if in content script context
    if (typeof document !== 'undefined') {
      const blob = new Blob([data], { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `messages-export-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }

    return {
      success: true,
      format,
      size:    data.length,
      records: this.store.count(),
    };
  }

  // ─── Store management ───────────────────────────────────────────────────────
  async clearStore(opts = {}) {
    if (opts.platform) {
      return this.store.deleteByPlatform(opts.platform);
    }
    return this.store.clear();
  }

  async getStoreSummary() {
    return this.store.getSummary();
  }

  // ─── Diagnostics ────────────────────────────────────────────────────────────
  async diagnose() {
    const extractorDiag = window.MessageExtractor?.diagnose() || null;
    const adapterInfo   = window.MessageExtractor?.getAdapterInfo() || null;
    const storeSummary  = this.store.getSummary();

    return {
      platform:    this._lastPlatform,
      adapterInfo,
      extractor:   extractorDiag,
      store:       storeSummary,
      session: {
        newThisSession:  this._newThisSession,
        totalExtracted:  this._totalExtracted,
        scanCount:       this._scanCount,
        watching:        !!this._watcher,
      },
    };
  }

  // ─── Guided selector learning ──────────────────────────────────────────────
  /**
   * Start the 3-click guided mode overlay.
   * The user clicks a sender, a message/subject, and a timestamp.
   * Returns a promise that resolves with the learned profile once the
   * user completes all 3 clicks and analysis finishes.
   */
  async startGuidedMode(opts = {}) {
    const learner = window.SelectorLearner;
    if (!learner) return { error: 'SelectorLearner not available' };

    if (learner.isGuidedModeActive()) {
      return { error: 'Guided mode already active' };
    }

    const platform = opts.platform || window.MessageExtractor?.getPlatform() || this._lastPlatform;
    if (!platform) return { error: 'No platform detected — visit a supported page first' };

    const { stop, promise } = learner.startGuidedMode({
      platform,
      useAI:   opts.useAI ?? true,
      onStep:  (stepIdx, total, prompt) => {
        this._emit('messaging:guidedStep', { stepIdx, total, fieldType: prompt.fieldType, label: prompt.label });
      },
      onComplete: (profile) => {
        // Re-warm cache so new profile is used immediately
        this._emit('messaging:guidedComplete', {
          platform:    profile.platform,
          confidence:  profile.confidence,
          fieldCount:  Object.keys(profile.fieldSelectors).length,
          source:      profile.source,
        });
        // Run a fresh scan now that we have a learned profile
        setTimeout(() => this.scan().catch(() => {}), 500);
      },
      onError: (err) => {
        this._emit('messaging:guidedError', { error: err.message });
      },
    });

    // Return immediately — the overlay drives the rest asynchronously
    return { success: true, platform, message: 'Guided mode started — follow the on-screen prompts' };
  }

  stopGuidedMode() {
    window.SelectorLearner?.stopGuidedMode?.();
    return { success: true };
  }

  async getLearnedProfile(platform) {
    const p = platform || this._lastPlatform;
    const profile = window.SelectorLearner?.getLearnedProfile(p) || null;
    return { platform: p, profile };
  }

  async deleteLearnedProfile(platform) {
    const p = platform || this._lastPlatform;
    await window.SelectorLearner?.deleteLearnedProfile(p);
    this._emit('messaging:profileDeleted', { platform: p });
    return { success: true, platform: p };
  }

  async getAllLearnedProfiles() {
    const all = await (window.SelectorLearner?.getAllLearnedProfiles?.() || Promise.resolve({}));
    return { profiles: all };
  }

  // ─── Status ─────────────────────────────────────────────────────────────────
  async getStatus() {
    const platform = window.MessageExtractor?.getPlatform() || this._lastPlatform;
    const learner  = window.SelectorLearner;
    return {
      active:          this.isActive,
      version:         this.version,
      platform,
      platformName:    window.PlatformAdapters?.ADAPTERS[platform]?.name || null,
      watching:        !!this._watcher,
      newThisSession:  this._newThisSession,
      totalExtracted:  this._totalExtracted,
      storedMessages:  this.store.count(),
      scanCount:       this._scanCount,
      guidedModeActive: learner?.isGuidedModeActive() || false,
      learnedProfile:  learner?.hasLearnedProfile(platform) || false,
      config: {
        autoWatch:   this.config.autoWatch,
        autoSave:    this.config.autoSave,
        maxItems:    this.config.maxItems,
      },
      components: {
        extractor:       !!window.MessageExtractor,
        adapters:        !!window.PlatformAdapters,
        selectorLearner: !!window.SelectorLearner,
      },
    };
  }

  // ─── SPA navigation observer ────────────────────────────────────────────────
  // Gmail, Outlook, WhatsApp, Telegram all navigate within the same origin.
  // When the URL/hash changes, we re-detect the platform and restart watchers.
  _startNavObserver() {
    if (this._navObserver) return;

    // Method 1: popstate + hashchange
    const onNav = () => this._onNavigate();
    window.addEventListener('popstate',   onNav, { passive: true });
    window.addEventListener('hashchange', onNav, { passive: true });

    // Method 2: Intercept history.pushState / replaceState (SPA router)
    const origPush    = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);

    history.pushState = (...args) => {
      origPush(...args);
      setTimeout(onNav, 100);  // slight delay for React to render
    };
    history.replaceState = (...args) => {
      origReplace(...args);
      setTimeout(onNav, 100);
    };

    // Method 3: MutationObserver on <title> (cheapest signal for page change)
    const titleEl = document.querySelector('title');
    if (titleEl) {
      this._navObserver = new MutationObserver(() => {
        if (window.location.href !== this._lastUrl) onNav();
      });
      this._navObserver.observe(titleEl, { childList: true });
    }

    this._onNav = onNav;   // keep reference for cleanup
  }

  _onNavigate() {
    const newUrl = window.location.href;
    if (newUrl === this._lastUrl) return;

    this._lastUrl = newUrl;
    const newPlatform = window.MessageExtractor?.getPlatform();

    if (newPlatform !== this._lastPlatform) {
      this._lastPlatform = newPlatform;
      window.MessageExtractor?.reset?.();   // clear dedup + cached adapter

      if (newPlatform) {
        this._emit('messaging:platformChanged', { platform: newPlatform, url: newUrl });
        console.log('[MessagingSkill] Platform changed:', newPlatform);
      }
    }

    // Re-scan after navigation (with a delay for SPA renders)
    if (newPlatform) {
      setTimeout(() => {
        this.scan().catch(() => {});
        if (this.config.autoWatch && !this._watcher) {
          this._startWatcher();
        }
      }, 1500);
    }
  }

  _stopNavObserver() {
    if (this._navObserver) { this._navObserver.disconnect(); this._navObserver = null; }
    if (this._onNav) {
      window.removeEventListener('popstate',   this._onNav);
      window.removeEventListener('hashchange', this._onNav);
      this._onNav = null;
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────
  _startWatcher() {
    this.startWatch().catch(e =>
      console.warn('[MessagingSkill] Watcher start failed:', e)
    );
  }

  _stopWatcher() {
    if (this._watcher) {
      this._watcher.stop();
      this._watcher = null;
    }
  }

  async _debouncedSave(items) {
    clearTimeout(this._saveDebounce);
    this._saveDebounce = setTimeout(async () => {
      const result = await this.store.upsertMany(items);
      if (result.added > 0) {
        this._emit('messaging:storeSaved', { added: result.added, total: result.total });
      }
    }, this.config.batchSaveDelay);
  }

  // ─── Event bus ────────────────────────────────────────────────────────────────
  _emit(eventName, detail = {}) {
    if (!this.config.useEventBus) return;
    try {
      window.dispatchEvent(new CustomEvent(eventName, {
        detail: { skill: this.name, version: this.version, ...detail },
        bubbles: true,
      }));
    } catch {}
  }

  // ─── Metadata ─────────────────────────────────────────────────────────────────
  getVersion()      { return this.version; }
  getName()         { return this.name; }
  isActiveStatus()  { return this.isActive; }
  getDependencies() { return []; }
}

export { MessagingSkill };
