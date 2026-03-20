/* ─── form-filler.js ─── */
const FormFiller = (() => {
  const win = typeof window !== 'undefined' ? window : null;
  const doc = typeof document !== 'undefined' ? document : null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Native value setter hack for React controlled inputs ──────────────────
  function nativeSet(el, value) {
    try {
      const nativeInputValueSetter = win ? Object.getOwnPropertyDescriptor(
        win.HTMLInputElement.prototype, 'value'
      )?.set : null;
      const nativeTextareaValueSetter = win ? Object.getOwnPropertyDescriptor(
        win.HTMLTextAreaElement.prototype, 'value'
      )?.set : null;
      const setter = el.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter;
      if (setter) setter.call(el, value);
      else el.value = value;
    } catch (e) { el.value = value; }
  }

  // ── Dispatch a set of events (triggers React/Vue/Angular change detection) ─
  function dispatchEvents(el, events = ['input', 'change']) {
    for (const evName of events) {
      const ev = new Event(evName, { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
    }
    // Also try InputEvent for React 17+
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
    } catch (e) {}
  }

  // ── Simulate human-like typing (for autocomplete / typeahead triggers) ─────
  async function simulateTyping(el, value, delay = 30) {
    el.focus();
    await sleep(80);

    // Clear existing value
    nativeSet(el, '');
    dispatchEvents(el);

    for (const char of String(value)) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      const cur = el.value + char;
      nativeSet(el, cur);
      el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
      el.dispatchEvent(new InputEvent('input', { data: char, bubbles: true, cancelable: true, inputType: 'insertText' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      await sleep(delay);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Fill text / textarea / url / tel / email / number ────────────────────
  async function fillText(field, value) {
    const el = field.el;
    if (win && win.DomUtils) win.DomUtils.scrollIntoView(el);
    await sleep(60);
    el.focus();
    await sleep(40);

    const strVal = String(value);

    if (field.isAutocomplete) {
      await simulateTyping(el, strVal, 40);
      await sleep(400);
      // Try to select first suggestion
      const suggestions = document.querySelectorAll(
        '[role="option"], [role="listitem"], .autocomplete-item, .suggestion-item, ' +
        '[class*="suggest"], [class*="dropdown-item"]:not([style*="display: none"])'
      );
      if (suggestions.length > 0) {
        // Find best matching suggestion
        let bestSug = suggestions[0];
        let bestScore = 0;
        for (const sug of suggestions) {
          const text = sug.innerText || sug.textContent || '';
          const s = window.FuzzyMatch.score(strVal, text);
          if (s > bestScore) { bestScore = s; bestSug = sug; }
        }
        bestSug.click();
        await sleep(100);
      }
    } else {
      nativeSet(el, strVal);
      dispatchEvents(el, ['focus', 'input', 'change', 'blur']);
    }
  }

  // ── Fill rich text editor (Quill, TinyMCE, CKEditor, contenteditable) ─────
  async function fillRichText(field, value) {
    const el = field.el;
    if (win && win.DomUtils) win.DomUtils.scrollIntoView(el);
    el.focus();
    await sleep(60);

    // Try execCommand first (works in most editors)
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, String(value));

    // Fallback: set innerHTML / innerText
    if (!el.innerText || el.innerText.trim() !== String(value).trim()) {
      el.innerText = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // TinyMCE API
    try {
      if (win && win.tinymce) {
        const ed = win.tinymce.activeEditor || win.tinymce.get(el.id);
        if (ed) ed.setContent(String(value));
      }
    } catch (e) {}

    // Quill API
    try {
      const quill = el.__quill || el.closest('.ql-container')?.__quill;
      if (quill) quill.setText(String(value));
    } catch (e) {}
  }

  // ── Fill <select> element ─────────────────────────────────────────────────
  async function fillSelect(field, value) {
    const el = field.el;
    if (win && win.DomUtils) win.DomUtils.scrollIntoView(el);
    await sleep(40);

    const strVal = String(value).toLowerCase().trim();
    const options = win && win.DomUtils ? win.DomUtils.getSelectOptions(el) : null;

    // 1. Exact value match
    for (const opt of options) {
      if (opt.value.toLowerCase() === strVal || opt.text.toLowerCase() === strVal) {
        el.value = opt.value;
        dispatchEvents(el, ['change', 'input']);
        return { filled: true, matched: opt.text };
      }
    }

    // 2. Fuzzy text match
    if (win && win.FuzzyMatch && options) {
      const result = win.FuzzyMatch.best(strVal, options, 'text', 0.5);
      if (result) {
        el.value = result.match.value;
        dispatchEvents(el, ['change', 'input']);
        return { filled: true, matched: result.match.text, confidence: result.score };
      }
    }

    // 3. Fuzzy value match
    if (win && win.FuzzyMatch && options) {
      const resultV = win.FuzzyMatch.best(strVal, options, 'value', 0.5);
      if (resultV) {
        el.value = resultV.match.value;
        dispatchEvents(el, ['change', 'input']);
        return { filled: true, matched: resultV.match.value, confidence: resultV.score };
      }
    }

    return { filled: false, reason: 'No matching option found', options };
  }

  // ── Fill custom dropdown (Material UI, Ant Design, etc.) ──────────────────
  async function fillCustomDropdown(field, value) {
    const el = field.el;
    if (win && win.DomUtils) win.DomUtils.scrollIntoView(el);
    await sleep(60);

    // Click to open
    el.click();
    await sleep(400);

    const strVal = String(value).toLowerCase();

    // If there's a search input inside the dropdown
    const searchInput = document.querySelector(
      '.ant-select-search input, .mat-autocomplete-panel input, ' +
      '[class*="dropdown"] input, [class*="search-input"], [role="searchbox"]'
    );
    if (searchInput) {
      searchInput.focus();
      nativeSet(searchInput, strVal);
      dispatchEvents(searchInput, ['input', 'change']);
      await sleep(400);
    }

    // Find and click best matching option
    const optionSelectors = [
      '[role="option"]', '[role="listitem"]', '.ant-select-item',
      '.mat-option', '.v-list-item', '[class*="dropdown-item"]',
      '[class*="option-item"]', '[class*="list-option"]', 'li[class*="option"]'
    ];

    const allOptions = document.querySelectorAll(optionSelectors.join(','));
    let bestOption = null, bestScore = 0;

    for (const opt of allOptions) {
      if (win && win.DomUtils && !win.DomUtils.isVisible(opt)) continue;
      const text = (opt.innerText || opt.textContent || '').trim();
      const s = win && win.FuzzyMatch ? win.FuzzyMatch.score(strVal, text) : 0;
      if (s > bestScore) { bestScore = s; bestOption = opt; }
    }

    if (bestOption && bestScore > 0.4) {
      if (win && win.DomUtils) win.DomUtils.scrollIntoView(bestOption);
      bestOption.click();
      await sleep(200);
      return { filled: true, matched: bestOption.innerText, confidence: bestScore };
    }

    // Close dropdown if we couldn't find a match
    document.body.click();
    return { filled: false, reason: 'No matching custom option', query: value };
  }

  // ── Fill radio button group ───────────────────────────────────────────────
  async function fillRadio(field, value, radioFields) {
    const strVal = String(value).toLowerCase().trim();

    // Try to find best matching radio option
    let bestRadio = null, bestScore = 0;
    for (const rf of radioFields) {
      const labels = win && win.DomUtils ? win.DomUtils.getLabels(rf.el) : [];
      const text = [...labels, rf.el.value || ''].join(' ');
      const s = win && win.FuzzyMatch ? win.FuzzyMatch.score(strVal, text) : 0;
      if (s > bestScore) { bestScore = s; bestRadio = rf; }
    }

    // Also check by value attribute
    for (const rf of radioFields) {
      const s = win && win.FuzzyMatch ? win.FuzzyMatch.score(strVal, rf.el.value || '') : 0;
      if (s > bestScore) { bestScore = s; bestRadio = rf; }
    }

    if (bestRadio && bestScore > 0.3) {
      if (win && win.DomUtils) win.DomUtils.scrollIntoView(bestRadio.el);
      bestRadio.el.focus();
      bestRadio.el.checked = true;
      dispatchEvents(bestRadio.el, ['change', 'click', 'input']);
      bestRadio.el.click();
      return { filled: true, matched: bestRadio.el.value, confidence: bestScore };
    }

    return { filled: false, reason: 'No matching radio option', query: value };
  }

  // ── Fill checkbox (single or group) ──────────────────────────────────────
  async function fillCheckbox(field, value) {
    const el = field.el;
    const shouldCheck = value === true || String(value).toLowerCase() === 'true'
      || String(value).toLowerCase() === 'yes' || String(value) === '1';

    if (el.checked !== shouldCheck) {
      el.focus();
      el.checked = shouldCheck;
      dispatchEvents(el, ['change', 'click', 'input']);
      el.click();
    }
    return { filled: true, checked: shouldCheck };
  }

  // ── Fill date/time input ──────────────────────────────────────────────────
  async function fillDate(field, value) {
    const el = field.el;
    let formatted = String(value);

    // Try to reformat dates
    if (el.type === 'date') {
      // Convert common formats to yyyy-mm-dd
      const parsed = new Date(value);
      if (!isNaN(parsed)) {
        formatted = parsed.toISOString().split('T')[0];
      }
    } else if (el.type === 'datetime-local') {
      const parsed = new Date(value);
      if (!isNaN(parsed)) {
        formatted = parsed.toISOString().slice(0, 16);
      }
    } else if (el.type === 'month') {
      const parsed = new Date(value);
      if (!isNaN(parsed)) {
        formatted = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}`;
      }
    }

    nativeSet(el, formatted);
    dispatchEvents(el, ['input', 'change', 'blur']);
    return { filled: true, value: formatted };
  }

  async function fillFile(field, fileData) {
    const el = field.el;
    if (!fileData) return { filled: false, reason: 'No file data provided' };

    let file;
    if (fileData instanceof File) {
      file = fileData;
    } else if (fileData.base64 && fileData.name) {
      // Reconstruct from base64
      const byteStr = atob(fileData.base64.split(',').pop());
      const arr = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
      const blob = new Blob([arr], { type: fileData.type || 'application/octet-stream' });
      file = new File([blob], fileData.name, { type: fileData.type });
    } else {
      return { filled: false, reason: 'Invalid file data format' };
    }

    // Check accept attribute
    if (el.accept) {
      const accepted = el.accept.split(',').map(s => s.trim());
      const fileType = file.type;
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      const ok = accepted.some(a =>
        a === fileType || a === fileExt ||
        (a.endsWith('/*') && fileType.startsWith(a.slice(0,-2)))
      );
      if (!ok) return { filled: false, reason: `File type not accepted. Accept: ${el.accept}` };
    }

    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    dispatchEvents(el, ['change', 'input']);
    return { filled: true, fileName: file.name, size: file.size, mimeType: file.type };
  }

  // ── Main fill dispatcher ──────────────────────────────────────────────────
  async function fill(field, value, options = {}) {
    if (!field || !field.el) return { filled: false, reason: 'No element' };
    if (field.disabled) return { filled: false, reason: 'Field disabled' };
    if (field.readOnly) return { filled: false, reason: 'Field read-only' };

    // Scroll to field
    if (!options.noScroll && win && win.DomUtils) win.DomUtils.scrollIntoView(field.el);
    await sleep(options.delay || 30);

    let result;
    try {
      switch (field.inputClass) {
        case 'richText':
          result = await fillRichText(field, value);
          break;
        case 'select':
          result = await fillSelect(field, value);
          break;
        case 'radio':
          if (options.radioFields) {
            result = await fillRadio(field, value, options.radioFields);
          } else {
            result = await fillRadio(field, value, [field]);
          }
          break;
        case 'checkbox':
          result = await fillCheckbox(field, value);
          break;
        case 'file':
          result = await fillFile(field, value);
          break;
        case 'date':
          result = await fillDate(field, value);
          break;
        case 'range':
          result = await fillRange(field, value);
          break;
        case 'custom':
          if (field.isCustomDropdown) {
            result = await fillCustomDropdown(field, value);
          } else {
            result = await fillText(field, value);
          }
          break;
        default:
          result = await fillText(field, value);
      }
    } catch (e) {
      result = { filled: false, reason: e.message };
    }

    return { ...result, field: field.primaryLabel || field.name || field.id };
  }

  // ── Fill multiple matches (from FieldMatcher.matchAll) ────────────────────
  async function fillAll(matches, options = {}) {
    const results = [];
    const delayBetween = options.delayBetween || 120;

    for (const match of matches) {
      const { field, value, isRadioGroup, radioFields, isCheckboxGroup, checkboxFields } = match;

      let result;
      if (isRadioGroup) {
        result = await fill(field, value, { ...options, radioFields });
      } else if (isCheckboxGroup) {
        // Fill each checkbox in group that matches value
        const vals = Array.isArray(value) ? value : [value];
        for (const cf of checkboxFields) {
          const labels = win && win.DomUtils ? win.DomUtils.getLabels(cf.el) : [];
          const matchesVal = vals.some(v =>
            labels.some(l => win && win.FuzzyMatch ? win.FuzzyMatch.score(String(v), l) > 0.5 : false) ||
            (win && win.FuzzyMatch ? win.FuzzyMatch.score(String(cf.el.value || ''), vals.join(' ')) > 0.5 : false)
          );
          if (matchesVal) await fill(cf, true, options);
        }
        result = { filled: true, field: field.name };
      } else {
        result = await fill(field, value, options);
      }

      results.push({ key: match.key, value, ...result, score: match.score });
      await sleep(delayBetween);
    }

    return results;
  }

  // ── Highlight filled fields ───────────────────────────────────────────────
  function highlight(field, success = true) {
    const el = field.el;
    const originalOutline = el.style.outline;
    const originalBackground = el.style.backgroundColor;
    el.style.outline = success ? '2px solid #22c55e' : '2px solid #ef4444';
    el.style.backgroundColor = success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
    setTimeout(() => {
      el.style.outline = originalOutline;
      el.style.backgroundColor = originalBackground;
    }, 2000);
  }

  return { fill, fillAll, fillText, fillSelect, fillRadio, fillCheckbox,
           fillFile, fillDate, fillRange, fillRichText, fillCustomDropdown,
           highlight, simulateTyping };
})();

// Export for both environments
if (typeof window !== 'undefined') {
  window.FormFiller = FormFiller;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormFiller;
}
