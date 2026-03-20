/**
 * universal-handler.additions.js
 *
 * Drop-in additions to extension/content-scripts/universal-handler.js.
 * Implements robust DOM-change handling with stale-element protection.
 */

/* ═══════════════════════════════════════════════════════════════════
   DOM Change Handler
   Prevents skill code from operating on stale / detached DOM elements.
   ═══════════════════════════════════════════════════════════════════ */

class DOMChangeHandler {
  constructor({ debounceMs = 300 } = {}) {
    /** @type {WeakMap<Element, {lastSeen: number, rect: DOMRect}>} */
    this._cache        = new WeakMap();
    this._debounceMs   = debounceMs;
    this._debounceTimer = null;
    this._callbacks    = new Set();

    this._observer = new MutationObserver(this._onMutations.bind(this));
  }

  /* ── Lifecycle ── */

  start() {
    this._observer.observe(document.body, {
      childList:     true,
      subtree:       true,
      attributes:    true,
      attributeFilter: ['style', 'class', 'disabled', 'readonly', 'type', 'name'],
    });
  }

  stop() {
    this._observer.disconnect();
    clearTimeout(this._debounceTimer);
  }

  /** @param {(affectedRegions: Element[]) => void} cb */
  onRefresh(cb) {
    this._callbacks.add(cb);
    return () => this._callbacks.delete(cb);
  }

  /* ── Element validation ── */

  /**
   * Returns a fresh, live reference to the element — or null if it's
   * stale (detached from the DOM, hidden, or its identity changed).
   *
   * @param {Element|null} el
   * @param {{ allowHidden?: boolean }} [opts]
   * @returns {Element|null}
   */
  validateElement(el, { allowHidden = false } = {}) {
    if (!el) return null;

    // 1. Still in document?
    if (!document.contains(el)) return null;

    // 2. Not hidden (unless caller explicitly allows it)
    if (!allowHidden) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return null;
      }
    }

    // 3. Still has a non-zero layout box
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;

    // 4. Update cache
    this._cache.set(el, { lastSeen: Date.now(), rect });
    return el;
  }

  /**
   * Like validateElement but attempts to re-query a fresh equivalent
   * using the element's name/id/placeholder before giving up.
   *
   * @param {Element|null} el
   * @returns {Element|null}
   */
  validateOrRefind(el) {
    const valid = this.validateElement(el);
    if (valid) return valid;
    if (!el) return null;

    // Try to re-locate by stable attributes
    const strategies = [
      () => el.id   ? document.getElementById(el.id)                         : null,
      () => el.name ? document.querySelector(`[name="${CSS.escape(el.name)}"]`) : null,
      () => {
        const ph = el.getAttribute?.('placeholder');
        return ph ? document.querySelector(`[placeholder="${CSS.escape(ph)}"]`) : null;
      },
      () => {
        const label = el.getAttribute?.('aria-label');
        return label ? document.querySelector(`[aria-label="${CSS.escape(label)}"]`) : null;
      },
    ];

    for (const strategy of strategies) {
      try {
        const found = strategy();
        if (found && this.validateElement(found)) return found;
      } catch (_) {}
    }

    return null;
  }

  /* ── Batch-validate a list ── */

  /**
   * @param {Element[]} elements
   * @returns {{ live: Element[], stale: Element[] }}
   */
  partitionElements(elements) {
    const live = [], stale = [];
    elements.forEach(el => {
      this.validateElement(el) ? live.push(el) : stale.push(el);
    });
    return { live, stale };
  }

  /* ── Internal mutation handling ── */

  _onMutations(mutations) {
    const affected = new Set();

    mutations.forEach(m => {
      // Collect the highest-level changed containers
      const target = m.target instanceof Element ? m.target : m.target.parentElement;
      if (target) affected.add(this._closestSection(target));

      m.removedNodes.forEach(node => {
        if (node instanceof Element) {
          // Immediately invalidate any cached entry for removed nodes
          this._cache.delete(node);
          node.querySelectorAll('*').forEach(child => this._cache.delete(child));
        }
      });
    });

    // Debounce the broadcast so skills don't thrash on burst mutations
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      const regions = [...affected].filter(Boolean);
      this._callbacks.forEach(cb => {
        try { cb(regions); } catch (e) { console.warn('[Suya DOMHandler] callback error:', e); }
      });
    }, this._debounceMs);
  }

  /** Walk up to find a meaningful container (form, section, article, main, body) */
  _closestSection(el) {
    return el.closest('form, [role="main"], section, article, main') ?? document.body;
  }
}

/* ── Singleton ── */
export const domHandler = new DOMChangeHandler({ debounceMs: 250 });

/* ═══════════════════════════════════════════════════════════════════
   Integration: wire into existing universal-handler bootstrap
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Call this from your existing universal-handler init function,
 * AFTER the DOM is ready:
 *
 *   import { domHandler, wireSkillsToDOM } from './universal-handler.additions.js';
 *
 *   domHandler.start();
 *   wireSkillsToDOM(formFillerSkill, pageAnalyzerSkill);
 */
export function wireSkillsToDOM(...skills) {
  domHandler.onRefresh(affectedRegions => {
    skills.forEach(skill => {
      if (typeof skill.onDOMRefresh === 'function') {
        try {
          skill.onDOMRefresh(affectedRegions, domHandler);
        } catch (e) {
          console.warn('[Suya] Skill DOM refresh error:', e);
        }
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   Helper: safe element interaction (wraps DOM ops with validation)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Safely fill a form field, handling stale-reference recovery.
 *
 * @param {Element|null} el
 * @param {string} value
 * @returns {boolean} — true if fill succeeded
 */
export function safeFill(el, value) {
  const live = domHandler.validateOrRefind(el);
  if (!live || !(live instanceof HTMLInputElement || live instanceof HTMLTextAreaElement || live instanceof HTMLSelectElement)) {
    return false;
  }

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    live instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(live, value);
  } else {
    live.value = value;
  }

  // Trigger React/Vue synthetic events
  live.dispatchEvent(new Event('input',  { bubbles: true }));
  live.dispatchEvent(new Event('change', { bubbles: true }));

  return true;
}

/**
 * Safe click — validates element is still interactable before clicking.
 * @param {Element|null} el
 * @returns {boolean}
 */
export function safeClick(el) {
  const live = domHandler.validateOrRefind(el);
  if (!live) return false;
  try { live.click(); return true; } catch (_) { return false; }
}
