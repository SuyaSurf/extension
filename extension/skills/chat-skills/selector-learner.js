/* ─── selector-learner.js ─────────────────────────────────────────────────────
 * Two complementary mechanisms for selector-less field discovery:
 *
 *  Tier 4 — Text Pattern Matching
 *    Scans element text content for patterns characteristic of each field
 *    type (timestamps, email addresses, subject-length strings, etc.).
 *    Completely CSS-class-agnostic — works even after a full redesign.
 *
 *  Guided Click Mode (Tier 0 — user-taught, highest authority)
 *    User is prompted to click 3 example elements in the live UI.
 *    The engine analyzes structural relationships, derives minimal stable
 *    CSS selectors, validates them against the DOM, and optionally asks
 *    the AI to generate/improve selectors when confidence is low.
 *    Results are saved as a LearnedProfile keyed to the origin + platform
 *    and injected back as Tier 0 (highest priority) in future scans.
 *
 * Exports:
 *   window.SelectorLearner  — content-script global
 *     .matchByPattern(container, fieldType, platform)  → Element | null
 *     .matchAllByPattern(container, fieldType, platform) → Element[]
 *     .startGuidedMode(opts)  → { stop, promise }
 *     .getLearnedProfile(platform) → LearnedProfile | null
 *     .hasLearnedProfile(platform) → boolean
 * ─────────────────────────────────────────────────────────────────────────── */
window.SelectorLearner = (() => {

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 1 — TEXT PATTERN MATCHING
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Field-type text signatures ───────────────────────────────────────────
  // Each entry is a scoring function: (text, el, platform) → 0..1
  // A score ≥ PATTERN_THRESHOLD is accepted as a match.
  const PATTERN_THRESHOLD = 0.55;

  const FIELD_PATTERNS = {

    timestamp: [
      // Strong: unambiguous time strings
      { re: /^\d{1,2}:\d{2}(\s?[ap]m)?$/i,          score: 0.95, label: 'HH:MM' },
      { re: /^(just now|moments? ago|now)$/i,         score: 0.95, label: 'just-now' },
      { re: /^yesterday$/i,                           score: 0.95, label: 'yesterday' },
      { re: /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/,        score: 0.90, label: 'date-slash' },
      { re: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(,?\s+\d{4})?$/i, score: 0.90, label: 'month-day' },
      // Medium: relative durations
      { re: /\d+\s*(min|hour|hr|day|week|month|yr|year)s?\s*(ago)?/i,                       score: 0.85, label: 'relative' },
      { re: /^(mon|tue|wed|thu|fri|sat|sun)$/i,       score: 0.80, label: 'weekday' },
      // Weak but plausible
      { re: /^\d{4}-\d{2}-\d{2}/,                    score: 0.80, label: 'ISO-date' },
      // Disqualifiers — short purely numeric strings that are probably something else
      { re: /^\d{1,3}$/,                              score: -0.5, label: 'bare-number' },
    ],

    sender: [
      // Strong: contains an @-email address
      { re: /\S+@\S+\.\S+/,                          score: 0.90, label: 'email-addr' },
      // Strong: looks like a human name (2-4 words, title-cased or all caps)
      { re: /^[A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜ][a-záéíóú]+ [A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜ][a-záéíóú]+(\s[A-Z][a-z]+)?$/, score: 0.80, label: 'full-name' },
      // Medium: short non-sentence string (likely a name or handle)
      { fn: (text) => text.length >= 2 && text.length <= 40 && !/[.!?]$/.test(text) && !/\d{4}/.test(text) ? 0.55 : 0, label: 'short-name' },
    ],

    subject: [
      // Disqualify timestamps and very short strings
      { fn: (text, el, platform) => {
          const isEmailPlatform = platform === 'gmail' || platform === 'outlook';
          if (!isEmailPlatform) return 0;
          const len = text.length;
          if (len < 3 || len > 120) return 0;
          // Not a timestamp
          if (FIELD_PATTERNS.timestamp.some(p => p.re?.test(text))) return 0;
          // Not purely numeric
          if (/^\d+$/.test(text)) return 0;
          // Title-case or mixed case is good
          const words = text.split(/\s+/);
          const mixedCase = words.some(w => /[A-Z]/.test(w[0]));
          return mixedCase ? 0.70 : 0.55;
        }, label: 'email-subject' },
    ],

    body: [
      // Chat/email body: substantial text, multiple words
      { fn: (text) => {
          const words = text.split(/\s+/).filter(Boolean);
          if (words.length < 3) return 0;
          if (text.length > 15 && text.length < 2000) return 0.65;
          if (text.length >= 2000) return 0.50;  // too long — maybe an outer container
          return 0;
        }, label: 'message-body' },
    ],

    snippet: [
      // Short preview: 10–100 chars, ends with ellipsis or is truncated
      { fn: (text) => {
          const len = text.length;
          if (len < 10 || len > 200) return 0;
          const hasEllipsis = text.endsWith('…') || text.endsWith('...');
          return hasEllipsis ? 0.85 : 0.55;
        }, label: 'snippet' },
    ],

    unreadBadge: [
      // Pure digit 1-999 in a small element
      { re: /^\d{1,3}$/,                             score: 0.75, label: 'count-badge' },
    ],

    contactName: [
      // Same as sender but used for chat list — no @email needed
      { re: /^[A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜ][a-záéíóú]+ [A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜ][a-záéíóú]+(\s[A-Z][a-z]+)?$/, score: 0.85, label: 'full-name' },
      { fn: (text) => text.length >= 2 && text.length <= 35 && !/[.!?,;:]/.test(text) && !/\d{2,}/.test(text) ? 0.60 : 0, label: 'short-name' },
    ],
  };

  /**
   * Score a single element's text against a field type.
   * Returns 0–1.
   */
  function scoreElement(el, fieldType, platform = null) {
    const text = (el.innerText || el.textContent || '').trim();
    if (!text) return 0;

    const patterns = FIELD_PATTERNS[fieldType];
    if (!patterns) return 0;

    let total = 0;
    for (const p of patterns) {
      if (p.re)  total += p.re.test(text) ? p.score : 0;
      if (p.fn)  total += (p.fn(text, el, platform) || 0);
    }

    // Clamp 0–1
    return Math.max(0, Math.min(1, total));
  }

  /**
   * Find the best-matching child element within `container` for a field type.
   * Walks the subtree (breadth-first, up to 6 levels deep), scores every
   * leaf-ish element, and returns the highest-scoring one above THRESHOLD.
   *
   * @param {Element}  container
   * @param {string}   fieldType   e.g. 'timestamp', 'sender', 'subject', 'body'
   * @param {string}   [platform]  optional — used for platform-specific tweaks
   * @returns {Element|null}
   */
  function matchByPattern(container, fieldType, platform = null) {
    if (!container) return null;

    let best = null, bestScore = 0;
    const queue = [[container, 0]];

    while (queue.length) {
      const [node, depth] = queue.shift();
      if (depth > 6) continue;

      // Only score "leaf-ish" nodes (few or no children with substantial text)
      const children = [...node.children];
      const isLeafIsh = children.length <= 3 || children.every(c => !c.children.length);

      if (isLeafIsh && node !== container) {
        const s = scoreElement(node, fieldType, platform);
        if (s > bestScore) { bestScore = s; best = node; }
      }

      for (const child of children) queue.push([child, depth + 1]);
    }

    return bestScore >= PATTERN_THRESHOLD ? best : null;
  }

  /**
   * Collect ALL elements within `container` that score above threshold
   * for a field type — useful for collecting all message bubbles, all
   * timestamps etc.
   */
  function matchAllByPattern(container, fieldType, platform = null) {
    if (!container) return [];
    const results = [];
    const seen    = new WeakSet();
    const queue   = [[container, 0]];

    while (queue.length) {
      const [node, depth] = queue.shift();
      if (depth > 6 || seen.has(node)) continue;
      seen.add(node);

      if (node !== container) {
        const s = scoreElement(node, fieldType, platform);
        if (s >= PATTERN_THRESHOLD) { results.push({ el: node, score: s }); continue; }
      }
      for (const child of node.children) queue.push([child, depth + 1]);
    }

    results.sort((a, b) => b.score - a.score);
    return results.map(r => r.el);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PART 2 — GUIDED CLICK MODE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Learned profile storage key ───────────────────────────────────────────
  const PROFILE_KEY = 'suya_learned_selectors';

  // ── Guided click session state ────────────────────────────────────────────
  let _guidedSession = null;

  // ── Prompt definitions ────────────────────────────────────────────────────
  const CLICK_PROMPTS = {
    email: [
      { fieldType: 'sender',    label: 'a sender name',         example: 'e.g. "John Smith" or "Google"' },
      { fieldType: 'subject',   label: 'an email subject line', example: 'e.g. "Re: Your invoice"' },
      { fieldType: 'timestamp', label: 'a timestamp',           example: 'e.g. "2:34 PM" or "Yesterday"' },
    ],
    chat: [
      { fieldType: 'contactName', label: 'a contact or chat name', example: 'e.g. "Jane", "Family Group"' },
      { fieldType: 'body',        label: 'a message preview',      example: 'the last message in a row' },
      { fieldType: 'timestamp',   label: 'a timestamp',            example: 'e.g. "10:45" or "Mon"' },
    ],
  };

  /**
   * Start guided selector discovery.
   *
   * @param {object} opts
   * @param {string}   opts.platform       'gmail'|'outlook'|'whatsapp'|'telegram'
   * @param {string}   [opts.mode]         'email' | 'chat'  (default: inferred from platform)
   * @param {Function} [opts.onStep]       (stepIndex, total, prompt) => void
   * @param {Function} [opts.onComplete]   (learnedProfile) => void
   * @param {Function} [opts.onError]      (error) => void
   * @param {boolean}  [opts.useAI]        use Claude API fallback (default: true)
   * @param {string}   [opts.aiEndpoint]   POST endpoint for AI (default: Anthropic API)
   * @returns {{ stop: Function, promise: Promise<LearnedProfile> }}
   */
  function startGuidedMode(opts = {}) {
    if (_guidedSession) _guidedSession.abort();

    const mode = opts.mode || _inferMode(opts.platform);
    const prompts = CLICK_PROMPTS[mode] || CLICK_PROMPTS.email;

    let resolveSession, rejectSession;
    const promise = new Promise((res, rej) => { resolveSession = res; rejectSession = rej; });

    const overlay = _buildOverlay();
    const session = {
      platform:   opts.platform,
      mode,
      prompts,
      clicks:     [],   // [{ fieldType, el, text, rect }]
      overlay,
      aborted:    false,
      abort() {
        this.aborted = true;
        overlay.remove();
        _guidedSession = null;
        rejectSession(new Error('Guided mode aborted'));
      },
    };

    _guidedSession = session;

    // Begin step 0
    _runStep(session, 0, opts, resolveSession, rejectSession);

    return { stop: () => session.abort(), promise };
  }

  function _inferMode(platform) {
    return (platform === 'gmail' || platform === 'outlook') ? 'email' : 'chat';
  }

  // ── Overlay UI ────────────────────────────────────────────────────────────
  function _buildOverlay() {
    // Remove any existing overlay
    document.getElementById('suya-guided-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id    = 'suya-guided-overlay';
    Object.assign(overlay.style, {
      position:        'fixed',
      top:             '0',
      left:            '0',
      width:           '100%',
      height:          '100%',
      zIndex:          '2147483646',
      pointerEvents:   'none',   // let clicks pass through to the page
      fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    });

    // Instruction panel (top-left, non-blocking)
    const panel = document.createElement('div');
    panel.id    = 'suya-guided-panel';
    Object.assign(panel.style, {
      position:        'absolute',
      top:             '16px',
      left:            '50%',
      transform:       'translateX(-50%)',
      background:      '#1a1a2e',
      color:           '#fff',
      borderRadius:    '10px',
      padding:         '14px 20px',
      minWidth:        '320px',
      maxWidth:        '480px',
      boxShadow:       '0 8px 32px rgba(0,0,0,.45)',
      pointerEvents:   'all',
      userSelect:      'none',
      border:          '1px solid rgba(255,255,255,0.1)',
    });
    overlay.appendChild(panel);

    // Highlight ring (follows hovered element)
    const ring = document.createElement('div');
    ring.id     = 'suya-guided-ring';
    Object.assign(ring.style, {
      position:        'absolute',
      border:          '2px solid #6366f1',
      borderRadius:    '4px',
      boxShadow:       '0 0 0 2px rgba(99,102,241,0.3)',
      pointerEvents:   'none',
      transition:      'all 0.1s ease',
      display:         'none',
    });
    overlay.appendChild(ring);

    // Confirmed click dots
    const dotsContainer = document.createElement('div');
    dotsContainer.id    = 'suya-guided-dots';
    Object.assign(dotsContainer.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    overlay.appendChild(dotsContainer);

    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function _updatePanel(stepIndex, total, prompt, confirmations) {
    const panel = document.getElementById('suya-guided-panel');
    if (!panel) return;

    const dots = Array.from({ length: total }, (_, i) => {
      const done = i < confirmations;
      const cur  = i === stepIndex;
      return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 3px;background:${done ? '#22c55e' : cur ? '#6366f1' : '#444'};border:${cur ? '2px solid #818cf8' : 'none'}"></span>`;
    }).join('');

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <div style="background:#6366f1;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">${stepIndex + 1}</div>
        <div>
          <div style="font-size:13px;opacity:.65;margin-bottom:2px">Step ${stepIndex + 1} of ${total}</div>
          <div style="font-weight:600;font-size:15px">Click ${prompt.label}</div>
        </div>
      </div>
      <div style="font-size:12px;opacity:.5;margin-bottom:10px">${prompt.example}</div>
      <div style="text-align:center">${dots}</div>
      <div style="margin-top:10px;text-align:right">
        <button id="suya-guided-cancel" style="background:transparent;border:1px solid rgba(255,255,255,0.2);color:#aaa;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px">Cancel</button>
      </div>`;

    document.getElementById('suya-guided-cancel')?.addEventListener('click', () => {
      _guidedSession?.abort();
    });
  }

  function _showConfirmDot(rect, index) {
    const dots = document.getElementById('suya-guided-dots');
    if (!dots) return;
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'absolute',
      left:     (rect.left + rect.width / 2 - 12) + 'px',
      top:      (rect.top  + rect.height / 2 - 12) + 'px',
      width:    '24px', height: '24px',
      borderRadius:   '50%',
      background:     '#22c55e',
      border:         '2px solid #fff',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      color:          '#fff',
      fontSize:       '12px',
      fontWeight:     '700',
      boxShadow:      '0 2px 8px rgba(0,0,0,.3)',
    });
    dot.textContent = String(index + 1);
    dots.appendChild(dot);
  }

  // ── Step runner ───────────────────────────────────────────────────────────
  function _runStep(session, stepIndex, opts, resolve, reject) {
    if (session.aborted) return;
    if (stepIndex >= session.prompts.length) {
      // All clicks collected — analyse
      _analyzeClicks(session, opts, resolve, reject);
      return;
    }

    const prompt = session.prompts[stepIndex];
    _updatePanel(stepIndex, session.prompts.length, prompt, stepIndex);

    const ring = document.getElementById('suya-guided-ring');

    // Hover highlight
    let _lastHovered = null;
    const onMouseOver = (e) => {
      const target = e.target;
      if (target === _lastHovered || target.closest('#suya-guided-overlay')) return;
      _lastHovered = target;
      if (!ring) return;
      const r = target.getBoundingClientRect();
      Object.assign(ring.style, {
        display: 'block',
        left:    r.left   - 2 + 'px',
        top:     r.top    - 2 + 'px',
        width:   r.width  + 4 + 'px',
        height:  r.height + 4 + 'px',
      });
    };

    // Click capture — we use capture=true so it fires before page handlers
    const onClick = (e) => {
      if (e.target.closest('#suya-guided-overlay')) return;
      e.preventDefault();
      e.stopPropagation();

      const el   = e.target;
      const rect = el.getBoundingClientRect();
      const text = (el.innerText || el.textContent || '').trim();

      session.clicks.push({ fieldType: prompt.fieldType, el, text, rect });
      _showConfirmDot(rect, stepIndex);
      opts.onStep?.(stepIndex, session.prompts.length, prompt);

      // Cleanup and next step
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('click',     onClick,     true);
      if (ring) ring.style.display = 'none';

      // Brief flash to confirm
      el.style.outline = '2px solid #22c55e';
      setTimeout(() => {
        el.style.outline = '';
        _runStep(session, stepIndex + 1, opts, resolve, reject);
      }, 300);
    };

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click',     onClick,     true);
  }

  // ── Structural analysis ───────────────────────────────────────────────────
  function _analyzeClicks(session, opts, resolve, reject) {
    const { platform, clicks, overlay } = session;

    _updatePanelAnalyzing();

    try {
      const result = _deriveSelectors(clicks, platform);
      if (result.confidence >= 0.65) {
        _finalize(result, session, opts, resolve, reject);
      } else if (opts.useAI !== false) {
        _invokeAI(result, clicks, platform, opts, resolve, reject, session);
      } else {
        _finalize(result, session, opts, resolve, reject);
      }
    } catch (err) {
      overlay.remove();
      _guidedSession = null;
      reject(err);
    }
  }

  function _updatePanelAnalyzing() {
    const panel = document.getElementById('suya-guided-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div style="text-align:center;padding:8px">
        <div style="font-size:14px;font-weight:600;margin-bottom:6px">Analyzing clicks…</div>
        <div style="font-size:12px;opacity:.55">Deriving selectors from DOM structure</div>
      </div>`;
  }

  /**
   * Core heuristic: given 3 clicked elements, find the most specific
   * stable CSS selector for each.
   *
   * Strategy:
   *  1. Find the lowest common ancestor (LCA) of all clicked elements.
   *     This is the "row" or "item" container.
   *  2. For each clicked element, compute its structural path from LCA.
   *  3. Prefer paths using data-* / aria attributes over tag+nth-child.
   *  4. Test: does the generated row selector × field selector reproduce
   *     N instances that match expected text patterns?
   *  5. Compute a confidence score.
   */
  function _deriveSelectors(clicks, platform) {
    const elements = clicks.map(c => c.el);

    // ── Step 1: lowest common ancestor ──────────────────────────────────────
    const lca = _lowestCommonAncestor(elements);

    // ── Step 2: row container (one level above LCA — the repeating unit) ────
    // Walk up from LCA until we find a parent that appears ≥3 times as a sibling
    const rowContainer = _findRepeatingAncestor(lca) || lca;
    const rowSelector  = _buildSelector(rowContainer);

    // ── Step 3: per-field selectors (relative to rowContainer) ──────────────
    const fieldSelectors = {};
    for (const { fieldType, el } of clicks) {
      const path = _pathFromAncestor(rowContainer, el);
      fieldSelectors[fieldType] = path;
    }

    // ── Step 4: validation ───────────────────────────────────────────────────
    const rowCount = rowSelector ? document.querySelectorAll(rowSelector).length : 0;
    const expectedMin = 2;  // must find at least 2 rows to be useful

    let confidence = 0;
    if (rowCount >= expectedMin) confidence += 0.40;
    if (rowCount >= 5)           confidence += 0.15;

    // Check each field selector returns consistent results across rows
    let fieldHits = 0;
    for (const [fieldType, sel] of Object.entries(fieldSelectors)) {
      if (!sel) continue;
      const hits = document.querySelectorAll(`${rowSelector} ${sel}`).length;
      if (hits >= expectedMin) fieldHits++;
    }
    confidence += (fieldHits / Object.keys(fieldSelectors).length) * 0.45;

    return {
      platform,
      rowSelector,
      fieldSelectors,
      rowCount,
      fieldHits,
      confidence,
      lca,
      rowContainer,
      clicks,
    };
  }

  // ── Lowest Common Ancestor ────────────────────────────────────────────────
  function _lowestCommonAncestor(elements) {
    if (!elements.length) return document.body;
    if (elements.length === 1) return elements[0].parentElement;

    // Get ancestor chain for each element
    const chains = elements.map(el => {
      const chain = [];
      let node = el;
      while (node && node !== document.body) { chain.unshift(node); node = node.parentElement; }
      return chain;
    });

    // Walk chains from root, find last common node
    let lca = document.body;
    const minLen = Math.min(...chains.map(c => c.length));

    for (let i = 0; i < minLen; i++) {
      const node = chains[0][i];
      if (chains.every(c => c[i] === node)) lca = node;
      else break;
    }

    return lca;
  }

  // ── Find repeating ancestor ───────────────────────────────────────────────
  // Walk up from `el` until we find an element that has ≥3 same-tag siblings
  function _findRepeatingAncestor(el, maxDepth = 6) {
    let node = el;
    let depth = 0;
    while (node && node.parentElement && depth < maxDepth) {
      const parent   = node.parentElement;
      const sameSibs = [...parent.children].filter(c => c.tagName === node.tagName);
      if (sameSibs.length >= 3) return node;
      node = parent;
      depth++;
    }
    return null;
  }

  // ── Build the most stable selector for a single element ──────────────────
  function _buildSelector(el) {
    if (!el) return null;

    // Prefer data attributes
    for (const attr of ['data-testid','data-id','data-convid','data-peer-id','data-mid','data-thread-id']) {
      if (el.hasAttribute(attr)) return `[${attr}]`;
    }
    // ARIA role
    const role = el.getAttribute('role');
    if (role && ['listitem','row','option','gridcell'].includes(role)) {
      return `[role="${role}"]`;
    }
    // Tag + structural position relative to parent
    const tag    = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (!parent) return tag;

    const sameTag = [...parent.children].filter(c => c.tagName === el.tagName);
    if (sameTag.length === 1) return `${parent.tagName.toLowerCase()} > ${tag}`;

    // nth-child as last resort
    const idx = [...parent.children].indexOf(el) + 1;
    return `${parent.tagName.toLowerCase()} > ${tag}:nth-child(${idx})`;
  }

  /**
   * Build a relative CSS selector path from `ancestor` to `descendant`.
   * Prefers data-* attributes at each step, falls back to structural paths.
   */
  function _pathFromAncestor(ancestor, descendant) {
    if (!ancestor || !descendant) return null;
    if (ancestor === descendant)  return null;

    // Walk up from descendant, collecting path segments
    const segments = [];
    let node = descendant;

    while (node && node !== ancestor) {
      const seg = _singleSegment(node, node.parentElement);
      segments.unshift(seg);
      node = node.parentElement;
      if (!node) return null;   // descendant is not inside ancestor
    }

    return segments.join(' > ') || null;
  }

  function _singleSegment(el, parent) {
    // Prefer data attributes on the element itself
    for (const attr of ['data-testid','data-id','aria-label','name','id']) {
      const v = el.getAttribute(attr);
      if (v) return `[${attr}="${CSS.escape(v)}"]`;
    }

    const tag      = el.tagName.toLowerCase();
    const role     = el.getAttribute('role');
    if (role)      return `[role="${role}"]`;

    // Tag + index among same-tag siblings
    if (!parent) return tag;
    const sameTag  = [...parent.children].filter(c => c.tagName === el.tagName);
    if (sameTag.length === 1) return tag;

    const idx = sameTag.indexOf(el) + 1;
    return `${tag}:nth-of-type(${idx})`;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PART 3 — AI FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════

  async function _invokeAI(heuristicResult, clicks, platform, opts, resolve, reject, session) {
    _updatePanelAI();

    try {
      // Build a minimal DOM snapshot around the clicked elements
      const domContext = _buildDOMContext(heuristicResult.rowContainer, clicks);

      const prompt = _buildAIPrompt(platform, clicks, domContext, heuristicResult);

      const aiEndpoint = opts.aiEndpoint || 'https://api.anthropic.com/v1/messages';

      const response = await fetch(aiEndpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) throw new Error(`AI request failed: ${response.status}`);

      const data = await response.json();
      const text = data.content?.find(b => b.type === 'text')?.text || '';
      const parsed = _parseAIResponse(text, heuristicResult);

      // Merge AI selectors with heuristic results; AI wins on conflicts
      const merged = {
        ...heuristicResult,
        rowSelector:     parsed.rowSelector     || heuristicResult.rowSelector,
        fieldSelectors:  { ...heuristicResult.fieldSelectors, ...parsed.fieldSelectors },
        confidence:      Math.max(heuristicResult.confidence, parsed.confidence || 0.75),
        source:          'ai',
        aiRaw:           text,
      };

      _finalize(merged, session, opts, resolve, reject);
    } catch (err) {
      console.warn('[SelectorLearner] AI fallback failed:', err);
      // Proceed with heuristic result anyway
      _finalize({ ...heuristicResult, aiError: err.message }, session, opts, resolve, reject);
    }
  }

  function _updatePanelAI() {
    const panel = document.getElementById('suya-guided-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div style="text-align:center;padding:8px">
        <div style="font-size:14px;font-weight:600;margin-bottom:6px">Asking AI for help…</div>
        <div style="font-size:12px;opacity:.55">Low-confidence result — using Claude to improve selectors</div>
      </div>`;
  }

  /**
   * Build a minimal, sanitised DOM representation of the row container
   * (attributes only — no text content, no deeply nested children).
   */
  function _buildDOMContext(rowContainer, clicks) {
    if (!rowContainer) return '';

    function nodeToStr(el, depth = 0, maxDepth = 4) {
      if (depth > maxDepth) return '';
      const tag   = el.tagName.toLowerCase();
      const attrs = [...el.attributes]
        .filter(a => ['id','class','role','data-testid','data-id','aria-label',
                      'aria-checked','data-mid','data-peer-id','data-convid','name',
                      'data-thread-id','tabindex','href'].includes(a.name))
        .map(a => `${a.name}="${a.value.slice(0, 50)}"`)
        .join(' ');

      const isClicked = clicks.some(c => c.el === el);
      const marker    = isClicked ? ` <!--CLICKED:${clicks.find(c => c.el === el)?.fieldType}-->` : '';
      const childStrs = [...el.children].slice(0, 8).map(c => nodeToStr(c, depth + 1, maxDepth)).filter(Boolean);
      const indent    = '  '.repeat(depth);

      if (!childStrs.length) return `${indent}<${tag}${attrs ? ' ' + attrs : ''}>${marker}</${tag}>`;
      return `${indent}<${tag}${attrs ? ' ' + attrs : ''}>${marker}\n${childStrs.join('\n')}\n${indent}</${tag}>`;
    }

    return nodeToStr(rowContainer, 0, 4);
  }

  function _buildAIPrompt(platform, clicks, domContext, heuristicResult) {
    const fieldDescriptions = clicks.map(c =>
      `- ${c.fieldType}: the user clicked on an element containing "${c.text.slice(0, 60)}"`
    ).join('\n');

    return `You are a CSS selector expert analyzing a ${platform} web interface.

The user clicked 3 elements to teach me how to extract messages. Here are the fields they identified:
${fieldDescriptions}

Here is the DOM structure of the repeating row/item container (some elements are marked <!--CLICKED:fieldType-->):
\`\`\`html
${domContext}
\`\`\`

The heuristic analysis found:
- Row selector: ${heuristicResult.rowSelector || 'not found'}
- Field selectors (low confidence): ${JSON.stringify(heuristicResult.fieldSelectors)}
- Confidence: ${(heuristicResult.confidence * 100).toFixed(0)}%

Please provide improved CSS selectors that:
1. Are as stable as possible (prefer data-* attributes over class names)
2. Are relative to the row container (not absolute from document root)
3. Will survive minor UI updates

Respond ONLY with a JSON object, no explanation:
{
  "rowSelector": "...",
  "fieldSelectors": {
    "fieldType": "relative-selector",
    ...
  },
  "confidence": 0.0-1.0,
  "notes": "brief explanation"
}`;
  }

  function _parseAIResponse(text, heuristicResult) {
    try {
      const json = JSON.parse(text.replace(/```json|```/g, '').trim());
      return {
        rowSelector:    json.rowSelector    || null,
        fieldSelectors: json.fieldSelectors || {},
        confidence:     typeof json.confidence === 'number' ? json.confidence : 0.75,
        notes:          json.notes          || '',
      };
    } catch {
      // Try to extract JSON from freeform text
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch {}
      }
    }
    return { rowSelector: null, fieldSelectors: {}, confidence: 0 };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PART 4 — LEARNED PROFILE STORAGE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * A LearnedProfile is saved per (origin + platform).
   * It's injected as Tier 0 in platform-adapters on future page loads.
   */
  function _finalize(result, session, opts, resolve, reject) {
    const { overlay, platform } = session;

    const profile = {
      platform,
      origin:          window.location.origin,
      rowSelector:     result.rowSelector,
      fieldSelectors:  result.fieldSelectors,
      confidence:      result.confidence,
      source:          result.source || 'heuristic',
      aiNotes:         result.aiRaw ? result.aiNotes : undefined,
      learnedAt:       Date.now(),
      version:         1,
    };

    // Show success/result panel
    _updatePanelResult(profile);

    // Persist to storage
    _saveLearnedProfile(platform, profile).catch(console.warn);

    opts.onComplete?.(profile);

    setTimeout(() => {
      overlay.remove();
      _guidedSession = null;
      resolve(profile);
    }, 2500);
  }

  function _updatePanelResult(profile) {
    const panel = document.getElementById('suya-guided-panel');
    if (!panel) return;
    const confPct = Math.round(profile.confidence * 100);
    const confColor = confPct >= 75 ? '#22c55e' : confPct >= 50 ? '#f59e0b' : '#ef4444';

    panel.innerHTML = `
      <div style="text-align:center;padding:4px">
        <div style="font-size:22px;margin-bottom:6px">${confPct >= 65 ? '✅' : '⚠️'}</div>
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">Selectors learned!</div>
        <div style="font-size:12px;opacity:.6;margin-bottom:8px">
          ${Object.keys(profile.fieldSelectors).length} field types · 
          <span style="color:${confColor};font-weight:600">${confPct}% confidence</span>
        </div>
        <div style="font-size:11px;background:rgba(255,255,255,0.07);border-radius:6px;padding:8px;text-align:left;max-height:100px;overflow:auto">
          ${Object.entries(profile.fieldSelectors).map(([k, v]) => `<div><b>${k}</b>: <code>${v}</code></div>`).join('')}
        </div>
        <div style="font-size:11px;opacity:.4;margin-top:8px">Saved · will be used automatically on ${profile.origin}</div>
      </div>`;
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  async function _saveLearnedProfile(platform, profile) {
    try {
      const all = await _loadAllProfiles();
      const key = `${window.location.origin}::${platform}`;
      all[key]  = profile;
      await chrome.storage.local.set({ [PROFILE_KEY]: all });
    } catch (e) {
      // Fallback: sessionStorage (no persistence across page loads, but better than nothing)
      try {
        const all = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || '{}');
        all[`${window.location.origin}::${platform}`] = profile;
        sessionStorage.setItem(PROFILE_KEY, JSON.stringify(all));
      } catch {}
    }
  }

  async function _loadAllProfiles() {
    try {
      const data = await chrome.storage.local.get(PROFILE_KEY);
      return data[PROFILE_KEY] || {};
    } catch {
      try { return JSON.parse(sessionStorage.getItem(PROFILE_KEY) || '{}'); }
      catch { return {}; }
    }
  }

  function getLearnedProfile(platform) {
    // Synchronous read from session cache (populated on initialize)
    return _profileCache[`${window.location.origin}::${platform}`] || null;
  }

  function hasLearnedProfile(platform) {
    return !!getLearnedProfile(platform);
  }

  // Warm profile cache on load
  let _profileCache = {};
  async function _warmCache() {
    _profileCache = await _loadAllProfiles();
  }
  if (typeof chrome !== 'undefined') {
    _warmCache().catch(() => {});
  } else {
    try { _profileCache = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || '{}'); } catch {}
  }

  async function deleteLearnedProfile(platform) {
    try {
      const all = await _loadAllProfiles();
      delete all[`${window.location.origin}::${platform}`];
      await chrome.storage.local.set({ [PROFILE_KEY]: all });
      delete _profileCache[`${window.location.origin}::${platform}`];
    } catch {}
  }

  async function getAllLearnedProfiles() {
    return _loadAllProfiles();
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    // Text pattern matching (Tier 4)
    matchByPattern,
    matchAllByPattern,
    scoreElement,
    PATTERN_THRESHOLD,
    FIELD_PATTERNS,

    // Guided click mode (Tier 0)
    startGuidedMode,
    stopGuidedMode: () => _guidedSession?.abort(),
    isGuidedModeActive: () => !!_guidedSession,

    // Profile management
    getLearnedProfile,
    hasLearnedProfile,
    deleteLearnedProfile,
    getAllLearnedProfiles,
  };
})();
