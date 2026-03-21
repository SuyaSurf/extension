/* ─── utils/dom-utils.js ─── */
(function(global) {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  
  if (!isBrowser) {
    // Export empty object for Node.js testing
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { 
        getAllInputs: () => [], 
        isVisible: () => true,
        getLabels: () => [],
        scrollIntoView: () => {},
        formFingerprint: () => 'test'
      };
    }
    return;
  }

  const DomUtils = (() => {

  // ─── Get all visible, interactable input-like elements ────────────────────
  // Includes shadow DOM traversal and Google Forms / Angular-specific selectors
  function getAllInputs(root = document) {
    const inputs = [];
    const selectors = [
      'input:not([type="hidden"])',
      'textarea',
      'select',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[role="listbox"]',
      '[role="spinbutton"]',
      '[role="slider"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      // Google Forms / Angular Material specific
      'mat-select',
      'mat-radio-button',
      'mat-checkbox',
      'mat-slider',
      '[_ngcontent] input',
      // Typeform-style
      '[data-qa="field"]',
      // Generic SPA form widgets
      '[class*="input-field"] input',
      '[class*="form-field"] input',
      '[class*="text-field"] input',
    ].join(',');

    const seen = new WeakSet();

    function walk(node) {
      try {
        const found = node.querySelectorAll(selectors);
        for (const el of found) {
          if (!seen.has(el)) { seen.add(el); inputs.push(el); }
        }
        // Shadow DOM traversal
        const all = node.querySelectorAll('*');
        for (const el of all) {
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      } catch (e) { /* cross-origin shadow — skip */ }
    }

    walk(root);
    return inputs;
  }

  // ─── Detect modern form containers ───────────────────────────────────────
  function detectModernForms() {
    const formContainers = [];
    const seen = new WeakSet();

    const formSelectors = [
      'form',
      '[class*="form"]',
      '[class*="registration"]',
      '[class*="application"]',
      '[class*="signup"]',
      '[class*="contact"]',
      '[id*="form"]',
      '[id*="registration"]',
      '[id*="application"]',
      '[data-form]',
      '[data-form-id]',
      '.rsvp-form',
      '.registration-form',
      '.application-form',
      // Angular Material form containers
      'mat-card',
      '[class*="mat-form"]',
      // Google for Startups / Google Events patterns
      '[class*="google-form"]',
      '[class*="goog-form"]',
      '[class*="rsvp"]',
      'cdk-virtual-scroll-viewport',
    ];

    for (const selector of formSelectors) {
      try {
        for (const el of document.querySelectorAll(selector)) {
          if (!seen.has(el) && isVisible(el) && hasInteractiveElements(el)) {
            seen.add(el);
            formContainers.push(el);
          }
        }
      } catch (e) {}
    }

    return formContainers;
  }

  function hasInteractiveElements(container) {
    const selectors = [
      'input:not([type="hidden"])',
      'textarea',
      'select',
      'button[type="submit"]',
      '[role="button"]',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[role="combobox"]',
      'mat-select',
      'mat-radio-button',
    ];
    return selectors.some(s => { try { return !!container.querySelector(s); } catch(e) { return false; } });
  }

  // ─── Detect event / RSVP registration forms ───────────────────────────────
  // Enhanced to handle Google for Startups and similar Angular-based event pages
  function detectEventForms() {
    const url   = window.location.href.toLowerCase();
    const path  = window.location.pathname.toLowerCase();
    const title = document.title.toLowerCase();
    const bodyText = (document.body?.textContent || '').slice(0, 4000).toLowerCase();

    const eventPatterns = [
      /rsvp|registration|register|signup|sign.*up/,
      /event|conference|meetup|workshop|webinar|accelerator/,
      /google.*events|withgoogle\.com/,
      /forms\.google\.com|forms\.gle/,
      /luma\.events|lu\.ma/,
      /eventbrite/,
      /program|cohort|application/,
    ];

    const urlMatch   = eventPatterns.some(p => p.test(url) || p.test(path));
    const titleMatch = eventPatterns.some(p => p.test(title));
    const bodyMatch  = /register|attend|join|rsvp|apply.*program|startup.*program/.test(bodyText);

    if (!urlMatch && !titleMatch && !bodyMatch) return [];

    const containers = detectModernForms();

    // If no containers found but signals are strong, return body as fallback context
    if (containers.length === 0 && (urlMatch || titleMatch)) {
      // Return a synthetic container hint pointing at probable future form area
      const mainEl = document.querySelector('main, [role="main"], #main, #content, .content');
      if (mainEl) return [mainEl];
    }

    return containers.filter(container => {
      const text = (container.textContent || '').toLowerCase();
      return /register|signup|attend|join|rsvp|apply|submit/.test(text) ||
             hasInteractiveElements(container);
    });
  }

  // ─── Visibility helpers ───────────────────────────────────────────────────
  function isVisible(el) {
    if (!el) return false;
    try {
      const rect  = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        (rect.width > 0 || rect.height > 0 || el.tagName === 'INPUT')
      );
    } catch (e) { return true; }
  }

  function isInViewportish(el) {
    try {
      const rect = el.getBoundingClientRect();
      const vp = { w: window.innerWidth, h: window.innerHeight };
      return rect.bottom >= -500 && rect.top <= vp.h + 500;
    } catch (e) { return true; }
  }

  // ─── Label extraction ─────────────────────────────────────────────────────
  function getLabels(el) {
    const labels = [];

    // <label for="id">
    if (el.id) {
      document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`)
        .forEach(l => labels.push(l.innerText || l.textContent));
    }

    // Wrapping <label>
    const parent = el.closest('label');
    if (parent) labels.push(parent.innerText || parent.textContent);

    // aria-label
    if (el.getAttribute('aria-label')) labels.push(el.getAttribute('aria-label'));

    // aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach(id => {
        const ref = document.getElementById(id);
        if (ref) labels.push(ref.innerText || ref.textContent);
      });
    }

    // aria-describedby
    const describedBy = el.getAttribute('aria-describedby');
    if (describedBy) {
      describedBy.split(/\s+/).forEach(id => {
        const ref = document.getElementById(id);
        if (ref) labels.push(ref.innerText || ref.textContent);
      });
    }

    // placeholder
    if (el.placeholder) labels.push(el.placeholder);

    // name / id fallback
    if (el.name) labels.push(el.name.replace(/[_\-]/g, ' '));
    if (el.id)   labels.push(el.id.replace(/[_\-]/g, ' '));

    // Nearby sibling/parent text
    const nearbyText = getNearbyText(el);
    if (nearbyText) labels.push(nearbyText);

    // Angular Material: mat-label inside mat-form-field
    const matLabel = el.closest('mat-form-field')?.querySelector('mat-label, label');
    if (matLabel) labels.push(matLabel.innerText || matLabel.textContent);

    return labels.map(l => (l || '').trim()).filter(Boolean);
  }

  function getNearbyText(el) {
    const texts = [];

    // Previous sibling
    let prev = el.previousElementSibling;
    let tries = 0;
    while (prev && tries < 3) {
      const t = (prev.innerText || prev.textContent || '').trim();
      if (t && t.length < 100) { texts.push(t); break; }
      prev = prev.previousElementSibling;
      tries++;
    }

    // Parent's direct text nodes
    if (el.parentElement) {
      const parentText = [...el.parentElement.childNodes]
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim())
        .filter(Boolean)
        .join(' ');
      if (parentText) texts.push(parentText);

      const labelEl = el.parentElement.querySelector(
        'label, .label, [class*="label"], legend, .field-label, .form-label'
      );
      if (labelEl && labelEl !== el) {
        const t = (labelEl.innerText || labelEl.textContent || '').trim();
        if (t) texts.push(t);
      }
    }

    // Grandparent label-like
    if (el.parentElement?.parentElement) {
      const gp = el.parentElement.parentElement;
      const labelEl = gp.querySelector('label, .label, [class*="label"], legend');
      if (labelEl && !labelEl.contains(el)) {
        const t = (labelEl.innerText || labelEl.textContent || '').trim();
        if (t && t.length < 80) texts.push(t);
      }
    }

    // 3-level ancestor label search (handles deeply nested Angular components)
    let ancestor = el.parentElement?.parentElement?.parentElement;
    if (ancestor) {
      const deepLabel = ancestor.querySelector('label, [class*="label"], .question-label, .field-title');
      if (deepLabel && !deepLabel.contains(el)) {
        const t = (deepLabel.innerText || deepLabel.textContent || '').trim();
        if (t && t.length < 120) texts.push(t);
      }
    }

    return texts[0] || '';
  }

  // ─── Select options ───────────────────────────────────────────────────────
  function getSelectOptions(selectEl) {
    return [...selectEl.options].map(o => ({
      value: o.value,
      text: (o.text || '').trim(),
      disabled: o.disabled
    })).filter(o => o.text && o.value !== '');
  }

  // ─── Scroll helper ────────────────────────────────────────────────────────
  function scrollIntoView(el) {
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
  }

  // ─── Wait for element ────────────────────────────────────────────────────
  function waitForElement(selector, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error('timeout')); }, timeout);
    });
  }

  // ─── MutationObserver — wait for any input to appear ─────────────────────
  // Cleaner API than watchForForms (lower level — just waits for DOM inputs).
  // callback(el) is called with the first matched input element.
  // Returns a stop() function.
  function observeForInputs(callback, options = {}) {
    const {
      timeout    = 12000,
      selector   = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select',
      debounceMs = 250,
    } = options;

    let debounce = null;
    let stopped  = false;
    let fired    = false;

    function tryMatch() {
      if (stopped || fired) return;
      const found = document.querySelector(selector);
      if (found && isVisible(found)) {
        fired = true;
        stop();
        callback(found);
      }
    }

    const observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(tryMatch, debounceMs);
    });

    observer.observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['style','hidden','aria-hidden']
    });

    const timer = setTimeout(() => { if (!fired) { stop(); callback(null); } }, timeout);

    function stop() {
      if (stopped) return;
      stopped = true;
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(debounce);
    }

    // Check immediately
    tryMatch();
    return { stop };
  }

  // ─── Sleep ────────────────────────────────────────────────────────────────
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── Form fingerprint ─────────────────────────────────────────────────────
  function formFingerprint(formEl) {
    const inputs = getAllInputs(formEl || document);
    const sig = inputs.slice(0, 10).map(el =>
      `${el.tagName}:${el.type || ''}:${el.name || ''}:${el.id || ''}`
    ).join('|');
    return btoa(sig).slice(0, 32);
  }

  // ─── Normalise URL ────────────────────────────────────────────────────────
  function normaliseUrl(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      ['utm_source','utm_medium','utm_campaign','ref','fbclid','gclid']
        .forEach(p => u.searchParams.delete(p));
      return u.toString();
    } catch (e) { return url; }
  }

  return {
    getAllInputs,
    isVisible,
    isInViewportish,
    getLabels,
    getNearbyText,
    getSelectOptions,
    scrollIntoView,
    waitForElement,
    observeForInputs,
    sleep,
    formFingerprint,
    normaliseUrl,
    detectModernForms,
    hasInteractiveElements,
    detectEventForms,
  };
})();

// Export for both environments
if (isBrowser) {
  window.DomUtils = DomUtils;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = DomUtils;
}

})(typeof window !== 'undefined' ? window : global);
