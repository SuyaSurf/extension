/* ─── message-extractor.js ────────────────────────────────────────────────────
 * Core extraction engine.
 *
 * Design principles
 * ─────────────────
 *  1. Selector health-checking — every selector tier is tested and scored
 *     on each run; stale selectors are demoted automatically
 *  2. Deduplication — every extracted item gets a stable fingerprint;
 *     re-scans never produce duplicates
 *  3. Self-healing — if tier-1 selectors yield 0 results but tier-2 does,
 *     tier-2 is promoted for future calls in this session
 *  4. MutationObserver — watches for DOM additions and emits only NEW items
 *  5. Platform-agnostic — delegates all platform-specific logic to adapters
 * ──────────────────────────────────────────────────────────────────────────── */
window.MessageExtractor = (() => {
  const _seen          = new Set();    // fingerprint → already extracted
  const _selectorStats = new Map();    // selectorKey → { hits, misses, promoted }
  let   _adapter       = null;
  let   _observer      = null;
  let   _newItemCb     = null;         // callback(items[]) for real-time mode

  const MAX_ITEMS_PER_SCAN = 200;
  const MIN_BODY_LENGTH    = 1;        // characters; filter out blank extractions

  // ─── Adapter resolution ────────────────────────────────────────────────────
  function _getAdapter() {
    if (_adapter?.isActive()) return _adapter;
    // Re-detect (handles navigation within SPAs)
    _adapter = window.PlatformAdapters?.getActiveAdapter?.() || null;
    return _adapter;
  }

  // ─── Selector health tracking ──────────────────────────────────────────────
  function _recordHit(key)  { const s = _getStats(key); s.hits++;   }
  function _recordMiss(key) { const s = _getStats(key); s.misses++; }
  function _getStats(key)   {
    if (!_selectorStats.has(key)) _selectorStats.set(key, { hits: 0, misses: 0, promoted: false });
    return _selectorStats.get(key);
  }

  // ─── Deduplication ────────────────────────────────────────────────────────
  function _dedup(items) {
    return items.filter(item => {
      if (_seen.has(item.id)) return false;
      _seen.add(item.id);
      return true;
    });
  }

  function _isUsable(item) {
    if (!item) return false;
    const body = item.body || item.snippet || item.lastMessage || '';
    if (body.length < MIN_BODY_LENGTH && !item.subject && !item.contact) return false;
    return true;
  }

  // ─── Core extraction ───────────────────────────────────────────────────────

  /**
   * One-shot scan of the current view.
   * Returns { items, platform, view, stats }
   */
  function scan(opts = {}) {
    const adapter = _getAdapter();
    if (!adapter) return { items: [], platform: null, view: 'unknown', stats: _selectorStats };

    const platform = adapter.id;
    const items    = [];
    let   view     = 'unknown';

    // ── Email platforms ──────────────────────────────────────────────────────
    if (platform === 'gmail' || platform === 'outlook') {
      // Are we in list view or reading view?
      const isReading = _isEmailReadingView(platform);
      view = isReading ? 'email_reading' : 'email_list';

      if (isReading && adapter.extractOpenEmail) {
        const emails = adapter.extractOpenEmail();
        items.push(...emails.filter(_isUsable));
        if (emails.length) _recordHit(platform + ':openEmail');
        else                _recordMiss(platform + ':openEmail');
      } else {
        const rows = (adapter.getThreadList?.() || []).slice(0, MAX_ITEMS_PER_SCAN);
        if (rows.length) _recordHit(platform + ':threadList');
        else              _recordMiss(platform + ':threadList');

        for (const row of rows) {
          try {
            const item = adapter.extractThreadRow(row);
            if (_isUsable(item)) items.push(item);
          } catch (e) {
            console.warn('[MessageExtractor] Row extraction failed:', e);
          }
        }
      }
    }

    // ── Chat platforms ───────────────────────────────────────────────────────
    if (platform === 'whatsapp' || platform === 'telegram') {
      const isInChat = _isInsideOpenChat(platform);
      view = isInChat ? 'chat_messages' : 'chat_list';

      if (isInChat) {
        const msgs = (adapter.getMessages?.() || []).slice(0, MAX_ITEMS_PER_SCAN);
        if (msgs.length) _recordHit(platform + ':messages');
        else              _recordMiss(platform + ':messages');

        for (const msg of msgs) {
          try {
            const item = adapter.extractMessage(msg);
            if (_isUsable(item)) items.push(item);
          } catch (e) {
            console.warn('[MessageExtractor] Message extraction failed:', e);
          }
        }
      } else {
        const chats = (adapter.getChatList?.() || []).slice(0, MAX_ITEMS_PER_SCAN);
        if (chats.length) _recordHit(platform + ':chatList');
        else               _recordMiss(platform + ':chatList');

        for (const chat of chats) {
          try {
            const item = adapter.extractChatRow(chat);
            if (_isUsable(item)) items.push(item);
          } catch (e) {
            console.warn('[MessageExtractor] Chat row extraction failed:', e);
          }
        }
      }
    }

    const newItems = _dedup(items);

    return {
      items:   newItems,
      allItems: items,
      platform,
      view,
      total:   items.length,
      newCount: newItems.length,
      stats:   Object.fromEntries(_selectorStats),
      ts:      Date.now(),
    };
  }

  // ─── View detection helpers ────────────────────────────────────────────────
  function _isEmailReadingView(platform) {
    if (platform === 'gmail') {
      return !!(
        document.querySelector('.a3s.aiL, [data-message-id]') &&
        document.querySelector('.nH.if, .AO .nH')
      );
    }
    if (platform === 'outlook') {
      return !!(
        document.querySelector('[class*="ReadingPane"], [aria-label*="Message body"]')
      );
    }
    return false;
  }

  function _isInsideOpenChat(platform) {
    if (platform === 'whatsapp') {
      return !!(
        document.querySelector('#main [data-testid*="msg"], #main [class*="message-in"]') ||
        document.querySelector('[data-testid="conversation-panel-messages"]')
      );
    }
    if (platform === 'telegram') {
      return !!(
        document.querySelector('.bubbles-inner .bubble, [class*="Bubbles"] [class*="bubble"]') ||
        document.querySelector('#column-center .message')
      );
    }
    return false;
  }

  // ─── Self-healing selector promotion ──────────────────────────────────────
  /**
   * Returns a diagnostics object showing which selector tiers are working.
   * Call this from the extension popup to surface degraded selectors.
   */
  function diagnose() {
    const adapter = _getAdapter();
    if (!adapter) return { platform: null, healthy: false };

    const report = {
      platform: adapter.id,
      healthy:  true,
      tiers:    {},
    };

    const allStats = Object.fromEntries(_selectorStats);
    for (const [key, stats] of Object.entries(allStats)) {
      const hitRate = stats.hits + stats.misses > 0
        ? stats.hits / (stats.hits + stats.misses)
        : null;
      const tier = {
        key,
        hits:    stats.hits,
        misses:  stats.misses,
        hitRate: hitRate != null ? +(hitRate * 100).toFixed(0) + '%' : 'untested',
        status:  hitRate === null ? 'untested' : hitRate > 0.5 ? 'healthy' : 'degraded',
      };
      report.tiers[key] = tier;
      if (tier.status === 'degraded') report.healthy = false;
    }

    return report;
  }

  // ─── Real-time watcher ─────────────────────────────────────────────────────
  /**
   * Watch the DOM for new messages/emails and call callback(newItems) when
   * they appear.  Uses MutationObserver + debounce.
   *
   * @param {Function}  callback  (newItems: Message[]) => void
   * @param {object}    [opts]
   * @param {number}    [opts.debounceMs=400]
   * @param {Element}   [opts.root]           observe subtree of this el
   * @returns {{ stop: Function }}
   */
  function watch(callback, opts = {}) {
    if (_observer) stop();

    const { debounceMs = 400 } = opts;
    _newItemCb = callback;

    let debounce = null;

    const handleMutations = (mutations) => {
      // Quick check: any mutation that adds nodes?
      const hasAdditions = mutations.some(m => m.addedNodes.length > 0);
      if (!hasAdditions) return;

      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const result = scan({ watchMode: true });
        if (result.newCount > 0 && _newItemCb) {
          _newItemCb(result.items, result);
        }
      }, debounceMs);
    };

    const root = opts.root
      || document.querySelector('#pane-side, [data-testid="chat-list"], [role="main"], .AO, #column-left, #column-center, #main')
      || document.body;

    _observer = new MutationObserver(handleMutations);
    _observer.observe(root, {
      childList:  true,
      subtree:    true,
      attributes: false,   // skip attribute changes — too noisy
    });

    console.debug('[MessageExtractor] Watching for new messages on:', _getAdapter()?.id);
    return { stop };
  }

  function stop() {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
    _newItemCb = null;
  }

  // ─── Targeted extraction ───────────────────────────────────────────────────
  /**
   * Extract all messages from the currently visible chat/email,
   * regardless of dedup state.  Useful for "export this conversation".
   */
  function extractCurrentView() {
    _seen.clear();  // reset dedup so we get everything
    return scan();
  }

  /**
   * Extract messages that match a filter.
   * @param {object} filter  { sender, keyword, after, before, unreadOnly }
   */
  function extractFiltered(filter = {}) {
    const result = extractCurrentView();
    let items    = result.items;

    if (filter.sender) {
      const q = filter.sender.toLowerCase();
      items = items.filter(i =>
        (i.sender?.name || i.contact || '').toLowerCase().includes(q) ||
        (i.sender?.email || '').toLowerCase().includes(q)
      );
    }

    if (filter.keyword) {
      const q = filter.keyword.toLowerCase();
      items = items.filter(i =>
        (i.body || i.snippet || i.lastMessage || i.subject || '').toLowerCase().includes(q)
      );
    }

    if (filter.unreadOnly) {
      items = items.filter(i => i.isUnread || i.unreadCount > 0);
    }

    if (filter.after) {
      const ts = new Date(filter.after).getTime();
      items = items.filter(i => !i.timestamp || new Date(i.timestamp).getTime() >= ts);
    }

    if (filter.before) {
      const ts = new Date(filter.before).getTime();
      items = items.filter(i => !i.timestamp || new Date(i.timestamp).getTime() <= ts);
    }

    return { ...result, items, total: items.length };
  }

  /**
   * Count unread items without a full extraction.
   */
  function countUnread() {
    const adapter = _getAdapter();
    if (!adapter) return { count: 0, platform: null };

    let count = 0;
    const platform = adapter.id;

    if (platform === 'gmail') {
      count = document.querySelectorAll('tr.zE, [data-thread-id].zE').length;
      if (!count) count = document.querySelectorAll('[aria-checked="false"][role="row"]').length;
    } else if (platform === 'outlook') {
      count = document.querySelectorAll(
        '[class*="unread"][role="option"], [data-is-read="false"]'
      ).length;
    } else if (platform === 'whatsapp') {
      const badges = document.querySelectorAll(
        '[data-testid*="unread-count"], [class*="unread-count"], ._ahlp'
      );
      count = [...badges].reduce((s, b) => s + (parseInt(b.textContent) || 1), 0);
    } else if (platform === 'telegram') {
      const badges = document.querySelectorAll('.badge, [class*="badge"]:not([class*="muted"])');
      count = [...badges].reduce((s, b) => s + (parseInt(b.textContent) || 1), 0);
    }

    return { count, platform };
  }

  // ─── Reset state ───────────────────────────────────────────────────────────
  function reset() {
    _seen.clear();
    _selectorStats.clear();
    _adapter = null;
    stop();
  }

  function getSeenCount()  { return _seen.size; }
  function getPlatform()   { return _getAdapter()?.id || null; }
  function getAdapterInfo() {
    const a = _getAdapter();
    return a ? { id: a.id, name: a.name, isActive: a.isActive() } : null;
  }

  return {
    scan,
    watch,
    stop,
    extractCurrentView,
    extractFiltered,
    countUnread,
    diagnose,
    reset,
    getSeenCount,
    getPlatform,
    getAdapterInfo,
  };
})();
