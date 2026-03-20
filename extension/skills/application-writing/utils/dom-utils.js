/* ─── utils/dom-utils.js ─── */
window.DomUtils = (() => {

  // Get all visible, interactable input-like elements from the page
  // including shadow DOM traversal
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
    ].join(',');

    function walk(node) {
      try {
        const found = node.querySelectorAll(selectors);
        for (const el of found) inputs.push(el);
        // Shadow DOM
        const all = node.querySelectorAll('*');
        for (const el of all) {
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      } catch (e) { /* cross-origin shadow */ }
    }

    walk(root);
    return inputs;
  }

  // Check if element is visible to user
  function isVisible(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        (rect.width > 0 || rect.height > 0 || el.tagName === 'INPUT')
      );
    } catch (e) { return true; }
  }

  // Check if element is in viewport or close to it
  function isInViewportish(el) {
    try {
      const rect = el.getBoundingClientRect();
      const vp = { w: window.innerWidth, h: window.innerHeight };
      return rect.bottom >= -500 && rect.top <= vp.h + 500;
    } catch (e) { return true; }
  }

  // Get all text labels associated with an element
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

    // aria-describedby (secondary signal)
    const describedBy = el.getAttribute('aria-describedby');
    if (describedBy) {
      describedBy.split(/\s+/).forEach(id => {
        const ref = document.getElementById(id);
        if (ref) labels.push(ref.innerText || ref.textContent);
      });
    }

    // placeholder
    if (el.placeholder) labels.push(el.placeholder);

    // name / id as fallback signals
    if (el.name) labels.push(el.name.replace(/[_\-]/g, ' '));
    if (el.id) labels.push(el.id.replace(/[_\-]/g, ' '));

    // Nearby sibling/parent text
    const nearbyText = getNearbyText(el);
    if (nearbyText) labels.push(nearbyText);

    return labels.map(l => (l || '').trim()).filter(Boolean);
  }

  // Get text content near an element (parent, siblings, preceding elements)
  function getNearbyText(el) {
    const texts = [];

    // Previous sibling text
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

      // Parent's label-like children
      const labelEl = el.parentElement.querySelector('label, .label, [class*="label"], legend, .field-label, .form-label');
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

    return texts[0] || '';
  }

  // Get select options as array of {value, text}
  function getSelectOptions(selectEl) {
    return [...selectEl.options].map(o => ({
      value: o.value,
      text: (o.text || '').trim(),
      disabled: o.disabled
    })).filter(o => o.text && o.value !== '');
  }

  // Scroll element into view smoothly
  function scrollIntoView(el) {
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}
  }

  // Wait for element to appear
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

  // Sleep helper
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Generate stable fingerprint for a form
  function formFingerprint(formEl) {
    const inputs = getAllInputs(formEl || document);
    const sig = inputs.slice(0, 10).map(el =>
      `${el.tagName}:${el.type || ''}:${el.name || ''}:${el.id || ''}`
    ).join('|');
    return btoa(sig).slice(0, 32);
  }

  // Normalise URL for storage key (remove fragments, some params)
  function normaliseUrl(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      // Remove common tracking params
      ['utm_source','utm_medium','utm_campaign','ref','fbclid','gclid']
        .forEach(p => u.searchParams.delete(p));
      return u.toString();
    } catch (e) { return url; }
  }

  return {
    getAllInputs, isVisible, isInViewportish, getLabels,
    getNearbyText, getSelectOptions, scrollIntoView,
    waitForElement, sleep, formFingerprint, normaliseUrl
  };
})();
