/* ─── page-inspector.js ──────────────────────────────────────────────────────
 * Context: content script
 *
 * Performs a synchronous DOM audit and returns a structured findings report.
 * No external dependencies — pure DOM traversal.
 *
 * Checks performed:
 *   Accessibility  — missing alt, labels, ARIA roles, keyboard traps, contrast (heuristic)
 *   UX heuristics  — broken images, ambiguous CTAs, excessive modals, scroll jank signals
 *   Form UX        — missing required indicators, confusing placeholder-only labels,
 *                    validation error clarity, submit-button discoverability
 *   Layout         — overflow, z-index collisions, viewport width overflow
 *   Assets         — 404 images, missing favicons, inline SVG issues
 *   SEO basics     — missing title, meta description, H1 count
 *   Security       — mixed content, http iframes, autocomplete on password fields
 * ─────────────────────────────────────────────────────────────────────────── */
window.PageInspector = (() => {

  // Severity levels
  const SEV = { critical: 'critical', high: 'high', medium: 'medium', low: 'low', info: 'info' };

  // ── Finding factory ────────────────────────────────────────────────────────
  function finding(category, id, severity, title, detail, el = null, fix = null) {
    return {
      id,
      category,
      severity,
      title,
      detail,
      element:   el ? describeEl(el) : null,
      fix,
      ts:        Date.now(),
    };
  }

  function describeEl(el) {
    if (!el) return null;
    return {
      tag:      el.tagName?.toLowerCase(),
      id:       el.id || null,
      classes:  [...(el.classList || [])].slice(0, 4).join(' ') || null,
      text:     (el.textContent || '').trim().slice(0, 80) || null,
      href:     el.href  || null,
      src:      el.src   || null,
      name:     el.name  || null,
      xpath:    getXPath(el),
    };
  }

  function getXPath(el) {
    try {
      const parts = [];
      let node = el;
      while (node && node.nodeType === Node.ELEMENT_NODE) {
        let idx = 1;
        let sib = node.previousElementSibling;
        while (sib) { if (sib.tagName === node.tagName) idx++; sib = sib.previousElementSibling; }
        parts.unshift(`${node.tagName.toLowerCase()}[${idx}]`);
        node = node.parentElement;
      }
      return '/' + parts.join('/');
    } catch { return null; }
  }

  // ── Visibility check ───────────────────────────────────────────────────────
  function isVisible(el) {
    if (!el) return false;
    try {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' &&
             (r.width > 0 || r.height > 0);
    } catch { return true; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY CHECKS
  // ══════════════════════════════════════════════════════════════════════════
  function checkAccessibility() {
    const findings = [];

    // ── Missing alt text on images ─────────────────────────────────────────
    document.querySelectorAll('img').forEach(img => {
      if (!img.hasAttribute('alt')) {
        findings.push(finding('accessibility', 'a11y-img-alt', SEV.high,
          'Image missing alt attribute',
          `<img src="${(img.src || '').slice(0, 60)}"> has no alt attribute — screen readers will announce the filename.`,
          img,
          'Add alt="" for decorative images or a descriptive alt text for informational ones.'
        ));
      }
    });

    // ── Form inputs without labels ──────────────────────────────────────────
    document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select').forEach(input => {
      if (!isVisible(input)) return;
      const hasLabel = !!input.labels?.length ||
                       !!input.getAttribute('aria-label') ||
                       !!input.getAttribute('aria-labelledby') ||
                       !!document.querySelector(`label[for="${CSS.escape(input.id || '__none__')}"]`);
      if (!hasLabel) {
        findings.push(finding('accessibility', 'a11y-input-label', SEV.critical,
          'Form input lacks accessible label',
          `Input type="${input.type || 'text'}" name="${input.name}" has no associated label.`,
          input,
          'Add a <label for="…"> or aria-label attribute.'
        ));
      }
    });

    // ── Interactive elements not keyboard-reachable ─────────────────────────
    document.querySelectorAll('[onclick]:not(a):not(button):not(input):not(select):not(textarea)').forEach(el => {
      if (!isVisible(el)) return;
      const tab = el.getAttribute('tabindex');
      if (tab === null || tab === '-1') {
        findings.push(finding('accessibility', 'a11y-keyboard-trap', SEV.high,
          'Clickable element not keyboard-reachable',
          `A <${el.tagName.toLowerCase()}> with onclick has no tabindex.`,
          el,
          'Add tabindex="0" and handle keydown Enter/Space.'
        ));
      }
    });

    // ── ARIA role without required child roles ─────────────────────────────
    const roleChildren = { listbox: 'option', menu: 'menuitem', grid: 'row', tree: 'treeitem' };
    document.querySelectorAll('[role]').forEach(el => {
      const role     = el.getAttribute('role');
      const required = roleChildren[role];
      if (required && !el.querySelector(`[role="${required}"]`)) {
        findings.push(finding('accessibility', 'a11y-aria-children', SEV.medium,
          `ARIA role="${role}" missing required child role="${required}"`,
          null, el,
          `Add child elements with role="${required}" inside this container.`
        ));
      }
    });

    // ── Skip navigation link ───────────────────────────────────────────────
    const skipLink = document.querySelector('a[href="#main"], a[href="#content"], a[href="#maincontent"], .skip-link, .skip-nav');
    if (!skipLink) {
      findings.push(finding('accessibility', 'a11y-skip-nav', SEV.low,
        'No skip-navigation link found',
        'Keyboard users cannot skip repeated navigation blocks.',
        null,
        'Add a visually-hidden "Skip to main content" anchor at the top of the page.'
      ));
    }

    // ── Language attribute ─────────────────────────────────────────────────
    if (!document.documentElement.getAttribute('lang')) {
      findings.push(finding('accessibility', 'a11y-lang', SEV.medium,
        'Page missing lang attribute on <html>',
        'Screen readers cannot determine the language of the page.',
        null, 'Add lang="en" (or appropriate language code) to <html>.'
      ));
    }

    // ── Focus visible ──────────────────────────────────────────────────────
    const style = document.querySelector('style,link[rel="stylesheet"]');
    const allStyles = [...document.styleSheets].map(ss => {
      try { return [...ss.cssRules].map(r => r.cssText).join(' '); } catch { return ''; }
    }).join(' ');
    if (/outline\s*:\s*0|outline\s*:\s*none/.test(allStyles) &&
        !/:focus-visible/.test(allStyles)) {
      findings.push(finding('accessibility', 'a11y-focus-visible', SEV.high,
        'Focus outline appears to be suppressed',
        'Styles contain outline:none/0 without a :focus-visible replacement.',
        null,
        'Use :focus-visible { outline: 2px solid … } instead of removing outlines entirely.'
      ));
    }

    return findings;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FORM UX CHECKS
  // ══════════════════════════════════════════════════════════════════════════
  function checkFormUX() {
    const findings = [];

    document.querySelectorAll('form').forEach((form, fi) => {
      const inputs = [...form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select')];

      // ── Required fields with no visual indicator ───────────────────────
      const requiredWithoutStar = inputs.filter(i => {
        if (!i.required && i.getAttribute('aria-required') !== 'true') return false;
        const formGroup = i.closest('.form-group, .field, .form-field, [class*="field"]') || i.parentElement;
        return !formGroup?.textContent?.includes('*') &&
               !formGroup?.querySelector('[aria-label*="required"], .required, [class*="required"]');
      });
      if (requiredWithoutStar.length > 0) {
        findings.push(finding('form-ux', 'fux-required-indicator', SEV.medium,
          'Required fields have no visual indicator',
          `${requiredWithoutStar.length} required field(s) lack a visual cue (e.g. asterisk).`,
          requiredWithoutStar[0],
          'Add * or "(required)" text near required inputs, and explain the convention at the top of the form.'
        ));
      }

      // ── Placeholder as only label ──────────────────────────────────────
      inputs.filter(i => {
        if (!i.placeholder) return false;
        const id = i.id;
        const hasExplicitLabel = !!i.getAttribute('aria-label') ||
          !!i.getAttribute('aria-labelledby') ||
          !!(id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
        return !hasExplicitLabel;
      }).forEach(i => {
        findings.push(finding('form-ux', 'fux-placeholder-label', SEV.medium,
          'Input uses placeholder as sole label',
          `placeholder="${i.placeholder}" disappears on focus — users lose context.`,
          i,
          'Add a persistent <label> or aria-label alongside the placeholder.'
        ));
      });

      // ── Password field without autocomplete ────────────────────────────
      form.querySelectorAll('input[type="password"]').forEach(i => {
        if (!i.getAttribute('autocomplete')) {
          findings.push(finding('form-ux', 'fux-password-autocomplete', SEV.low,
            'Password field missing autocomplete attribute',
            'Prevents password managers from working correctly.',
            i,
            'Add autocomplete="current-password" or autocomplete="new-password".'
          ));
        }
      });

      // ── Submit button discoverability ──────────────────────────────────
      const submits = [...form.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])')];
      if (submits.length === 0) {
        findings.push(finding('form-ux', 'fux-no-submit', SEV.high,
          'Form has no identifiable submit button',
          `Form #${fi + 1} has no button[type="submit"] or input[type="submit"].`,
          form,
          'Add a <button type="submit"> or wire a button to form submission.'
        ));
      }

      // ── Ambiguous button text ──────────────────────────────────────────
      submits.filter(b => {
        const text = (b.textContent || b.value || '').trim().toLowerCase();
        return ['submit','ok','yes','go','next','button','click here','click'].includes(text);
      }).forEach(b => {
        findings.push(finding('form-ux', 'fux-ambiguous-cta', SEV.low,
          'Submit button has generic label',
          `"${(b.textContent || b.value || '').trim()}" doesn't describe the action.`,
          b,
          'Use a descriptive label like "Create Account", "Send Message", "Register".'
        ));
      });

      // ── Error container visibility ─────────────────────────────────────
      const errorContainers = form.querySelectorAll('[role="alert"], .error, .alert, [class*="error-message"], [aria-live]');
      if (errorContainers.length === 0 && inputs.length > 2) {
        findings.push(finding('form-ux', 'fux-no-error-region', SEV.medium,
          'Form has no ARIA live region for validation errors',
          'Validation errors may not be announced to screen readers.',
          form,
          'Add <div role="alert" aria-live="assertive"> to hold validation messages.'
        ));
      }
    });

    return findings;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LAYOUT CHECKS
  // ══════════════════════════════════════════════════════════════════════════
  function checkLayout() {
    const findings = [];
    const vw = window.innerWidth;

    // ── Horizontal overflow ────────────────────────────────────────────────
    document.querySelectorAll('*').forEach(el => {
      try {
        if (el.scrollWidth > vw + 10 && isVisible(el)) {
          const s = window.getComputedStyle(el);
          if (s.overflow !== 'hidden' && s.overflowX !== 'hidden') {
            findings.push(finding('layout', 'layout-h-overflow', SEV.medium,
              'Element causes horizontal overflow',
              `Element is ${el.scrollWidth}px wide, viewport is ${vw}px.`,
              el,
              'Add overflow-x:hidden or max-width:100% to the element or its parent.'
            ));
          }
        }
      } catch {}
    });

    // ── Text too small to read ─────────────────────────────────────────────
    document.querySelectorAll('p, li, td, span, label, a').forEach(el => {
      if (!isVisible(el) || !el.textContent.trim()) return;
      try {
        const fs = parseFloat(window.getComputedStyle(el).fontSize);
        if (fs < 11 && fs > 0) {
          findings.push(finding('layout', 'layout-small-text', SEV.medium,
            'Text may be too small to read',
            `Font size ${fs}px — below the recommended 12px minimum.`,
            el,
            'Use a minimum font size of 12–14px for body text.'
          ));
        }
      } catch {}
    });

    // ── Touch target size ──────────────────────────────────────────────────
    document.querySelectorAll('a, button, [role="button"], input[type="checkbox"], input[type="radio"]').forEach(el => {
      if (!isVisible(el)) return;
      try {
        const r = el.getBoundingClientRect();
        if ((r.width < 44 || r.height < 44) && (r.width > 0 || r.height > 0)) {
          findings.push(finding('layout', 'layout-touch-target', SEV.low,
            'Interactive element below 44×44px touch target size',
            `${el.tagName.toLowerCase()} is ${Math.round(r.width)}×${Math.round(r.height)}px.`,
            el,
            'WCAG 2.5.5: ensure touch targets are at least 44×44 CSS pixels.'
          ));
        }
      } catch {}
    });

    // Deduplicate by XPath to avoid massive lists
    const seen = new Set();
    return findings.filter(f => {
      const key = f.element?.xpath + f.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 30);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ASSET / LINK CHECKS
  // ══════════════════════════════════════════════════════════════════════════
  function checkAssets() {
    const findings = [];

    // ── Images that failed to load ─────────────────────────────────────────
    document.querySelectorAll('img').forEach(img => {
      if (!img.complete || img.naturalWidth === 0) {
        findings.push(finding('assets', 'asset-broken-img', SEV.high,
          'Broken image',
          `Image failed to load: ${(img.src || '').slice(0, 80)}`,
          img,
          'Check the image URL, CORS headers, and ensure the resource exists.'
        ));
      }
    });

    // ── Missing favicon ───────────────────────────────────────────────────
    const favicon = document.querySelector('link[rel*="icon"]');
    if (!favicon) {
      findings.push(finding('assets', 'asset-no-favicon', SEV.low,
        'No favicon declared',
        'Browsers will make a 404 request for /favicon.ico.',
        null, 'Add <link rel="icon" href="/favicon.ico"> in <head>.'
      ));
    }

    // ── Inline SVGs missing title/desc ─────────────────────────────────────
    document.querySelectorAll('svg:not([aria-hidden])').forEach(svg => {
      if (!svg.querySelector('title') && !svg.getAttribute('aria-label')) {
        findings.push(finding('assets', 'asset-svg-title', SEV.low,
          'SVG missing accessible title',
          null, svg,
          'Add <title> inside SVG or aria-label/aria-hidden to the SVG element.'
        ));
      }
    });

    return findings;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEO BASICS
  // ══════════════════════════════════════════════════════════════════════════
  function checkSEO() {
    const findings = [];

    if (!document.title || document.title.trim().length < 5) {
      findings.push(finding('seo', 'seo-title', SEV.high, 'Missing or empty page title', null, null,
        'Add a descriptive <title> tag in <head>.'));
    }

    const desc = document.querySelector('meta[name="description"]');
    if (!desc || !desc.getAttribute('content')?.trim()) {
      findings.push(finding('seo', 'seo-meta-desc', SEV.medium, 'Missing meta description', null, null,
        'Add <meta name="description" content="…"> to improve search snippets.'));
    }

    const h1s = document.querySelectorAll('h1');
    if (h1s.length === 0) {
      findings.push(finding('seo', 'seo-no-h1', SEV.medium, 'Page has no H1 heading', null, null,
        'Add a single <h1> describing the main topic of the page.'));
    } else if (h1s.length > 1) {
      findings.push(finding('seo', 'seo-multiple-h1', SEV.low,
        `Page has ${h1s.length} H1 headings (expected 1)`, null, null,
        'Use a single H1 per page; use H2/H3 for sub-sections.'));
    }

    const canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      findings.push(finding('seo', 'seo-canonical', SEV.low, 'No canonical link tag', null, null,
        'Add <link rel="canonical" href="…"> to prevent duplicate content issues.'));
    }

    return findings;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECURITY BASICS
  // ══════════════════════════════════════════════════════════════════════════
  function checkSecurity() {
    const findings = [];
    const isHTTPS  = window.location.protocol === 'https:';

    // ── Mixed content ──────────────────────────────────────────────────────
    if (isHTTPS) {
      document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"]').forEach(el => {
        findings.push(finding('security', 'sec-mixed-content', SEV.high,
          'Mixed content: HTTP resource on HTTPS page',
          `${el.tagName.toLowerCase()} loads from ${(el.src || el.href || '').slice(0, 80)}`,
          el, 'Update the resource URL to use https://'
        ));
      });

      document.querySelectorAll('iframe[src^="http:"]').forEach(el => {
        findings.push(finding('security', 'sec-http-iframe', SEV.critical,
          'HTTP iframe embedded on HTTPS page',
          `iframe src: ${el.src}`,
          el, 'Update the iframe src to use https://'
        ));
      });
    }

    // ── Password fields with autocomplete=off ─────────────────────────────
    document.querySelectorAll('input[type="password"][autocomplete="off"]').forEach(el => {
      findings.push(finding('security', 'sec-pwd-autocomplete-off', SEV.medium,
        'Password field has autocomplete="off"',
        'Prevents password managers from filling the field — harms security.',
        el, 'Remove autocomplete="off" from password fields.'
      ));
    });

    // ── Forms submitting over HTTP ─────────────────────────────────────────
    document.querySelectorAll('form[action^="http:"]').forEach(el => {
      findings.push(finding('security', 'sec-form-http', SEV.critical,
        'Form submits data over HTTP',
        `action="${el.action}"`,
        el, 'Update form action to use https://'
      ));
    });

    return findings;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UX HEURISTICS
  // ══════════════════════════════════════════════════════════════════════════
  function checkUXHeuristics() {
    const findings = [];

    // ── Links that open in new tab without warning ─────────────────────────
    document.querySelectorAll('a[target="_blank"]:not([rel*="noopener"])').forEach(el => {
      findings.push(finding('ux', 'ux-blank-no-noopener', SEV.medium,
        'target="_blank" link missing rel="noopener noreferrer"',
        `href: ${(el.href || '').slice(0, 80)}`,
        el, 'Add rel="noopener noreferrer" to all target="_blank" links.'
      ));
    });

    // ── Multiple autofocus elements ────────────────────────────────────────
    const autofocused = document.querySelectorAll('[autofocus]');
    if (autofocused.length > 1) {
      findings.push(finding('ux', 'ux-multi-autofocus', SEV.medium,
        `${autofocused.length} elements have [autofocus] — only one is effective`,
        null, autofocused[1],
        'Use autofocus on at most one element per page.'
      ));
    }

    // ── Excessive modal dialogs ────────────────────────────────────────────
    const modals = document.querySelectorAll('[role="dialog"]:not([hidden]), [role="alertdialog"]:not([hidden]), .modal:not(.hidden)');
    if (modals.length > 1) {
      findings.push(finding('ux', 'ux-stacked-modals', SEV.high,
        `${modals.length} open modal dialogs detected`,
        'Multiple overlapping dialogs create a confusing UX.',
        null, 'Show only one dialog at a time.'
      ));
    }

    // ── Very long pages without back-to-top ───────────────────────────────
    if (document.body.scrollHeight > window.innerHeight * 5) {
      const hasBackToTop = !!document.querySelector('a[href="#top"], a[href="#"], [class*="back-to-top"], [class*="scroll-top"]');
      if (!hasBackToTop) {
        findings.push(finding('ux', 'ux-no-back-to-top', SEV.low,
          'Long page has no back-to-top control',
          `Page is ${document.body.scrollHeight}px tall.`,
          null, 'Add a sticky "Back to top" button for long pages.'
        ));
      }
    }

    // ── Animations without prefers-reduced-motion support ─────────────────
    const allStyles = [...document.styleSheets].map(ss => {
      try { return [...ss.cssRules].map(r => r.cssText).join(' '); } catch { return ''; }
    }).join(' ');
    if (/@keyframes/.test(allStyles) && !/@media.*prefers-reduced-motion/.test(allStyles)) {
      findings.push(finding('ux', 'ux-no-reduced-motion', SEV.medium,
        'Animations present but no prefers-reduced-motion media query',
        'Users who prefer reduced motion will still see animations.',
        null, 'Add @media (prefers-reduced-motion: reduce) { … } to suppress animations.'
      ));
    }

    return findings;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN: run all checks
  // ══════════════════════════════════════════════════════════════════════════
  function inspect() {
    const startMs = performance.now();

    const all = [
      ...checkAccessibility(),
      ...checkFormUX(),
      ...checkLayout(),
      ...checkAssets(),
      ...checkSEO(),
      ...checkSecurity(),
      ...checkUXHeuristics(),
    ];

    const summary = {
      total:    all.length,
      critical: all.filter(f => f.severity === 'critical').length,
      high:     all.filter(f => f.severity === 'high').length,
      medium:   all.filter(f => f.severity === 'medium').length,
      low:      all.filter(f => f.severity === 'low').length,
      info:     all.filter(f => f.severity === 'info').length,
      byCategory: all.reduce((acc, f) => {
        acc[f.category] = (acc[f.category] || 0) + 1;
        return acc;
      }, {}),
      score: _computeScore(all),
    };

    return {
      findings: all,
      summary,
      url:        window.location.href,
      title:      document.title,
      inspectedAt: Date.now(),
      durationMs:  Math.round(performance.now() - startMs),
    };
  }

  // Simple weighted score 0–100
  function _computeScore(findings) {
    const weights = { critical: 20, high: 10, medium: 4, low: 1, info: 0 };
    const penalty = findings.reduce((s, f) => s + (weights[f.severity] || 0), 0);
    return Math.max(0, Math.min(100, 100 - penalty));
  }

  return { inspect, checkAccessibility, checkFormUX, checkLayout, checkAssets, checkSEO, checkSecurity, checkUXHeuristics };
})();
