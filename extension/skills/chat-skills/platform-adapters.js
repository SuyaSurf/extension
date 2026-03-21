/* ─── platform-adapters.js ────────────────────────────────────────────────────
 * Platform detection and selector strategies.
 *
 * Selector cascade — ordered from most-stable to least-stable:
 *
 *   Tier 0 — Learned profiles (user-taught via guided click mode; highest authority)
 *             Stored in chrome.storage, keyed to origin + platform.
 *             Injected by SelectorLearner.getLearnedProfile().
 *
 *   Tier 1 — data-* / aria attributes  (most stable, rarely change)
 *
 *   Tier 2 — Structural role selectors  (stable across redesigns)
 *
 *   Tier 3 — Semantic tag + position    (moderately stable)
 *
 *   Tier 4 — Text pattern matching      (CSS-agnostic; scans element text
 *             for patterns like timestamps, name shapes, subject lengths.
 *             Implemented in SelectorLearner.matchByPattern().)
 *
 * Every adapter's tryField() helper runs tiers in order and stops at first hit.
 * Adapters also define how to extract structured fields from a matched node
 * (sender, body, timestamp, subject, id, direction, thread).
 * ──────────────────────────────────────────────────────────────────────────── */

// ─── Platform detection ────────────────────────────────────────────────────────
const PLATFORM = (() => {
  function detect() {
    const host = window.location?.hostname || '';
    const path = window.location?.pathname || '';

    if (host.includes('mail.google.com'))         return 'gmail';
    if (host.includes('outlook.live.com') ||
        host.includes('outlook.office.com') ||
        host.includes('outlook.office365.com'))   return 'outlook';
    if (host.includes('web.whatsapp.com'))         return 'whatsapp';
    if (host.includes('web.telegram.org'))         return 'telegram';
    if (host.includes('messages.google.com'))      return 'googlemessages';
    return null;
  }

  return { detect };
})();


// ─── Shared utilities ──────────────────────────────────────────────────────────
function closestText(el, maxDepth = 4) {
  let node = el, depth = 0;
  while (node && depth < maxDepth) {
    const text = (node.innerText || node.textContent || '').trim();
    if (text) return text;
    node = node.parentElement;
    depth++;
  }
  return '';
}

// tryField — runs all tiers in order for a single field lookup.
// Parameters:
//   container: Element - The row / bubble / item element to search within
//   fieldType: string - Field type like 'sender'|'subject'|'timestamp'|'body'|'snippet'
//   tier1: string[] - Tier-1 selectors (data-*/aria)
//   tier2: string[] - Tier-2 selectors (role-based structural)
//   tier3: string[] - Tier-3 selectors (tag+position)
//   platform: string - Used by text-pattern scorer
// Returns: Element|null
function tryField(container, fieldType, tier1, tier2, tier3, platform) {
  // ── Tier 0: learned profile selector ──────────────────────────────────────
  const learner = window.SelectorLearner;
  if (learner?.hasLearnedProfile(platform)) {
    const profile = learner.getLearnedProfile(platform);
    const learnedSel = profile?.fieldSelectors?.[fieldType];
    if (learnedSel) {
      try {
        const found = container.querySelector(learnedSel);
        if (found) return found;
      } catch {}
    }
  }

  // ── Tier 1 ──────────────────────────────────────────────────────────────────
  for (const sel of (tier1 || [])) {
    try { const f = container.querySelector(sel); if (f) return f; } catch {}
  }

  // ── Tier 2 ──────────────────────────────────────────────────────────────────
  for (const sel of (tier2 || [])) {
    try { const f = container.querySelector(sel); if (f) return f; } catch {}
  }

  // ── Tier 3 ──────────────────────────────────────────────────────────────────
  for (const sel of (tier3 || [])) {
    try { const f = container.querySelector(sel); if (f) return f; } catch {}
  }

  // ── Tier 4: text pattern matching (CSS-class-agnostic) ────────────────────
  return learner?.matchByPattern(container, fieldType, platform) || null;
}

/**
 * tryFieldAll — same cascade but returns ALL matching elements.
 * Useful for collecting multiple matching nodes (e.g. all labels).
 */
function tryFieldAll(container, fieldType, tier1, tier2, tier3, platform) {
  const learner = window.SelectorLearner;

  // Tier 0
  if (learner?.hasLearnedProfile(platform)) {
    const profile = learner.getLearnedProfile(platform);
    const learnedSel = profile?.fieldSelectors?.[fieldType];
    if (learnedSel) {
      try {
        const found = [...container.querySelectorAll(learnedSel)];
        if (found.length) return found;
      } catch {}
    }
  }

  const seen = new WeakSet();
  const results = [];

  const addAll = (selectors) => {
    for (const sel of (selectors || [])) {
      try {
        for (const node of container.querySelectorAll(sel)) {
          if (!seen.has(node)) { seen.add(node); results.push(node); }
        }
      } catch {}
    }
  };

  addAll(tier1); addAll(tier2); addAll(tier3);

  if (!results.length && learner) {
    const patternResults = learner.matchAllByPattern(container, fieldType, platform);
    for (const n of patternResults) {
      if (!seen.has(n)) { seen.add(n); results.push(n); }
    }
  }

  return results;
}

/**
 * getListItems — tier-cascaded container-level lookup for the repeating
 * row/bubble elements (not individual fields).
 * Used by getThreadList(), getChatList(), getMessages().
 *
 * @param {string[]} tier1   Tier-1 selectors (applied to document)
 * @param {string[]} tier2
 * @param {string[]} tier3
 * @param {string}   platform
 * @param {Function} [fallback]  () => Element[]  Last-resort function
 */
function getListItems(tier1, tier2, tier3, platform, fallback) {
  // Tier 0: learned row selector
  const learner = window.SelectorLearner;
  if (learner?.hasLearnedProfile(platform)) {
    const profile = learner.getLearnedProfile(platform);
    if (profile?.rowSelector) {
      try {
        const found = [...document.querySelectorAll(profile.rowSelector)];
        if (found.length >= 2) return found;
      } catch {}
    }
  }

  for (const sel of (tier1 || [])) {
    try { const r = [...document.querySelectorAll(sel)]; if (r.length) return r; } catch {}
  }
  for (const sel of (tier2 || [])) {
    try { const r = [...document.querySelectorAll(sel)]; if (r.length) return r; } catch {}
  }
  for (const sel of (tier3 || [])) {
    try { const r = [...document.querySelectorAll(sel)]; if (r.length) return r; } catch {}
  }

  return fallback ? fallback() : [];
}

function parseRelativeTime(str) {
  if (!str) return null;
  str = str.trim().toLowerCase();
  const now = Date.now();

  // Absolute: "2:34 PM", "14:32", "10:05 AM"
  if (/^\d{1,2}:\d{2}(\s?[ap]m)?$/i.test(str)) {
    const today = new Date();
    const [time, meridiem] = str.split(/\s/);
    const [h, m] = time.split(':').map(Number);
    let hours = h;
    if (meridiem === 'pm' && h < 12) hours += 12;
    if (meridiem === 'am' && h === 12) hours = 0;
    today.setHours(hours, m, 0, 0);
    return today.toISOString();
  }

  // Relative: "2 minutes ago", "just now", "yesterday"
  if (/just now|moments? ago/.test(str)) return new Date(now).toISOString();
  if (/yesterday/.test(str)) return new Date(now - 86400000).toISOString();
  const mins  = str.match(/(\d+)\s*min/);  if (mins)  return new Date(now - mins[1] * 60000).toISOString();
  const hours = str.match(/(\d+)\s*h/);    if (hours) return new Date(now - hours[1] * 3600000).toISOString();
  const days  = str.match(/(\d+)\s*d/);    if (days)  return new Date(now - days[1] * 86400000).toISOString();

  // Try native parse for anything else ("Jan 12", "12/03/2024" etc.)
  try {
    const d = new Date(str);
    if (!isNaN(d)) return d.toISOString();
  } catch {}
  return null;
}

// Extract visible text stripped of whitespace noise
function cleanText(el) {
  if (!el) return '';
  return (el.innerText || el.textContent || '')
    .replace(/\u200B/g, '')   // zero-width space
    .replace(/\u00A0/g, ' ')  // non-breaking space
    .replace(/\s{3,}/g, '\n') // collapse excessive whitespace
    .trim();
}

// Deep-search within el for the first node matching any selector in the cascade
function trySelectors(el, selectors) {
  for (const sel of selectors) {
    try {
      const found = el.querySelector(sel);
      if (found) return found;
    } catch {}
  }
  return null;
}

// Collect ALL matching nodes across a cascade (deduped)
function trySelectorsAll(el, selectors) {
  const seen = new WeakSet();
  const results = [];
  for (const sel of selectors) {
    try {
      for (const node of el.querySelectorAll(sel)) {
        if (!seen.has(node)) { seen.add(node); results.push(node); }
      }
    } catch {}
  }
  return results;
}


// ══════════════════════════════════════════════════════════════════════════════
// GMAIL ADAPTER
// ══════════════════════════════════════════════════════════════════════════════
const GmailAdapter = {
  id:   'gmail',
  name: 'Gmail',

  // ── Detect if we're on a usable Gmail view ─────────────────────────────────
  isActive() {
    return !!document.querySelector('[data-thread-id], [gh="tl"], .AO, [role="main"]');
  },

  // ── Root containers for the email list ────────────────────────────────────
  getThreadList() {
    return getListItems(
      // Tier 1
      ['[data-thread-id]'],
      // Tier 2
      ['[role="main"] [role="row"]'],
      // Tier 3
      ['tr.zA', 'tr.zE'],
      'gmail',
      // Tier 4 text-pattern fallback: any <tr> whose first column text looks
      // like a sender name (handled by getListItems returning empty → extractor
      // falls through to MessageExtractor's text-pattern scan)
      () => [...document.querySelectorAll('tr')].filter(tr =>
        tr.querySelector('[email], [data-hovercard-id*="@"]')
      )
    );
  },

  // ── Extract structured data from one thread row ─────────────────────────
  extractThreadRow(el) {
    const threadId = el.getAttribute('data-thread-id') ||
                     el.getAttribute('data-legacy-thread-id') || null;

    const senderEl = tryField(el, 'sender',
      ['[email]', '[data-hovercard-id*="@"]'],
      ['span[name]', '[role="gridcell"]:nth-child(2) span'],
      ['.yP', '.zF'],
      'gmail'
    );
    const sender = senderEl ? {
      name:  senderEl.getAttribute('name') || senderEl.getAttribute('data-name') || cleanText(senderEl),
      email: senderEl.getAttribute('email') || senderEl.getAttribute('data-hovercard-id') || null,
    } : { name: '', email: null };

    const subjectEl = tryField(el, 'subject',
      ['[data-thread-snippet]'],
      ['[role="gridcell"]:nth-child(4) span:first-child'],
      ['span.bog', 'span.bqe', 'td:nth-child(5) span'],
      'gmail'
    );

    const snippetEl = tryField(el, 'snippet',
      ['span[data-thread-snippet]'],
      ['[role="gridcell"] span:nth-child(2)'],
      ['span.y2', '.adn span'],
      'gmail'
    );

    const timeEl = tryField(el, 'timestamp',
      ['[data-tooltip*=":"]', '[title*=":"]'],
      ['[role="gridcell"]:last-child span'],
      ['span.xW', '.xW > span', 'td.xW'],
      'gmail'
    );
    const rawTime = timeEl
      ? (timeEl.getAttribute('data-tooltip') || timeEl.getAttribute('title') || cleanText(timeEl))
      : null;

    const labelEls = tryFieldAll(el, 'labels',
      ['[data-tooltip][style*="background"]'],
      ['[role="gridcell"] span[style*="color"]'],
      ['.at', '.aKS'],
      'gmail'
    );
    const labels = labelEls.map(l => cleanText(l)).filter(Boolean);

    const isUnread = el.classList.contains('zE') || !!el.querySelector('.zE') ||
                     el.getAttribute('aria-checked') !== null;

    const hasAttachment = !!tryField(el, 'attachment',
      ['[data-tooltip*="attachment"]', '[aria-label*="attachment"]'],
      ['img[alt="Attachment"]'],
      ['.aZo'],
      'gmail'
    );

    return {
      id: threadId || _fingerprint(el),
      threadId, type: 'email', platform: 'gmail',
      sender, subject: cleanText(subjectEl), snippet: cleanText(snippetEl),
      rawTime, timestamp: parseRelativeTime(rawTime),
      labels, isUnread, hasAttachment, extractedAt: Date.now(),
    };
  },

  // ── Extract full email body (open email view) ─────────────────────────────
  extractOpenEmail() {
    const emails = [];

    const msgContainers = trySelectorsAll(document, [
      '[data-message-id]',
      '.a3s',
      '.gs',
      '[role="main"] .ii.gt',
    ]);

    for (const container of msgContainers) {
      const msgId = container.getAttribute('data-message-id') ||
                    container.closest('[data-message-id]')?.getAttribute('data-message-id') ||
                    null;

      // Body
      const bodyEl = trySelectors(container, [
        '.a3s.aiL',
        '.a3s',
        '[data-message-id] .ii',
        '.nH .ii',
      ]) || container;

      const body = cleanText(bodyEl);

      // From header
      const fromEl = trySelectors(container, [
        '[email][data-hovercard-id]',
        'h3.iw span[email]',
        '.gD',   // sender span
        'span[data-hovercard-id*="@"]',
      ]);

      // Date from header
      const dateEl = trySelectors(container, [
        '.g3 span',
        '[title*="20"]',
        'span[data-tooltip*=":"]',
        '.adg',
      ]);

      // Subject from page heading
      const subjectEl = document.querySelector('h2.hP, .nH h2, [data-legacy-thread-id] h2');

      if (body.length > 0) {
        emails.push({
          id:        msgId || _fingerprint(container),
          type:      'email_body',
          platform:  'gmail',
          sender: {
            name:  fromEl?.getAttribute('name') || fromEl?.getAttribute('data-name') || cleanText(fromEl),
            email: fromEl?.getAttribute('email') || fromEl?.getAttribute('data-hovercard-id'),
          },
          subject:     cleanText(subjectEl),
          body,
          rawTime:     cleanText(dateEl),
          timestamp:   parseRelativeTime(cleanText(dateEl)),
          extractedAt: Date.now(),
        });
      }
    }

    return emails;
  },
};


// ══════════════════════════════════════════════════════════════════════════════
// OUTLOOK ADAPTER
// ══════════════════════════════════════════════════════════════════════════════
const OutlookAdapter = {
  id:   'outlook',
  name: 'Outlook',

  isActive() {
    return !!(
      document.querySelector('[role="list"][aria-label], [data-convid], [class*="ms-List"]') ||
      document.querySelector('[aria-label*="Message list"], [aria-label*="mail list"]')
    );
  },

  getThreadList() {
    return getListItems(
      ['[data-convid]'],
      ['[role="list"][aria-label] [role="listitem"]', '[role="list"][aria-label] [role="option"]'],
      ['[class*="ms-List-cell"]', '[class*="FocusZone"] [class*="item"]'],
      'outlook',
      () => [...document.querySelectorAll('[role="group"] > div, [role="list"] > div')].filter(el =>
        !!el.querySelector('time, [datetime], [aria-label*=":"]') && el.textContent.trim().length > 20
      )
    );
  },

  extractThreadRow(el) {
    const convId = el.getAttribute('data-convid') ||
                   el.closest('[data-convid]')?.getAttribute('data-convid') || null;

    const senderEl = tryField(el, 'sender',
      ['[aria-label*="From:"]'],
      ['[class*="ms-Persona-primaryText"]', 'button[title*="@"]'],
      ['[class*="senderName"]', '[class*="sender"] [class*="text"]'],
      'outlook'
    );
    const sender = { name: cleanText(senderEl), email: senderEl?.getAttribute('title') || null };

    const subjectEl = tryField(el, 'subject',
      ['[aria-label*="Subject:"]'],
      ['div[role="heading"]'],
      ['[class*="subject"]', '[class*="Subject"]'],
      'outlook'
    );

    const snippetEl = tryField(el, 'snippet',
      [],
      [],
      ['[class*="preview"]', '[class*="Preview"]', '[class*="snippet"]'],
      'outlook'
    );

    const timeEl = tryField(el, 'timestamp',
      ['time[datetime]', '[datetime]'],
      ['[aria-label*="Received"]'],
      ['[class*="date"]', '[class*="time"]', '[class*="Date"]'],
      'outlook'
    );
    const rawTime = timeEl
      ? (timeEl.getAttribute('datetime') || timeEl.getAttribute('aria-label') || cleanText(timeEl))
      : null;

    const isUnread = el.getAttribute('aria-checked') === 'true' ||
                     !!el.querySelector('[class*="unread"], [class*="Unread"]') ||
                     el.getAttribute('data-is-read') === 'false';

    const hasAttachment = !!tryField(el, 'attachment',
      ['[aria-label*="attachment"]', '[data-icon-name="Attach"]'],
      [],
      ['[class*="attachment"]'],
      'outlook'
    );

    return {
      id: convId || _fingerprint(el), convId, type: 'email', platform: 'outlook',
      sender, subject: cleanText(subjectEl), snippet: cleanText(snippetEl),
      rawTime, timestamp: parseRelativeTime(rawTime),
      isUnread, hasAttachment, extractedAt: Date.now(),
    };
  },

  extractOpenEmail() {
    const msgs = [];

    // Reading pane
    const pane = document.querySelector(
      '[class*="ReadingPane"], [role="main"] [class*="reading"], ' +
      '[aria-label*="Message body"], [class*="messageBody"]'
    );
    if (!pane) return msgs;

    const bodyEl = trySelectors(pane, [
      '[class*="allowTextSelection"]',
      'div[dir="ltr"]',
      '[class*="body"] [class*="content"]',
      '[role="document"]',
    ]) || pane;

    const fromEl = trySelectors(pane, [
      '[class*="senderName"]',
      '[aria-label*="From:"]',
      'button[title*="@"]',
    ]);

    const subjectEl = document.querySelector(
      'h1[class*="subject"], h2[class*="subject"], [class*="Subject"]'
    );

    const dateEl = trySelectors(pane, [
      'time',
      '[datetime]',
      '[class*="date"]',
      '[aria-label*="Sent"]',
    ]);

    const body = cleanText(bodyEl);
    if (body.length > 10) {
      msgs.push({
        id:        convId || _fingerprint(pane),
        type:      'email_body',
        platform:  'outlook',
        sender: {
          name:  fromEl?.getAttribute('title') || cleanText(fromEl),
          email: fromEl?.getAttribute('title') || null,
        },
        subject:     cleanText(subjectEl),
        body,
        rawTime:     cleanText(dateEl) || dateEl?.getAttribute('datetime'),
        timestamp:   parseRelativeTime(cleanText(dateEl)),
        extractedAt: Date.now(),
      });
    }
    return msgs;
  },
};


// ══════════════════════════════════════════════════════════════════════════════
// WHATSAPP WEB ADAPTER
// ══════════════════════════════════════════════════════════════════════════════
const WhatsAppAdapter = {
  id:   'whatsapp',
  name: 'WhatsApp Web',

  isActive() {
    return !!(
      document.querySelector('[data-testid="chat-list"], [data-testid="conversation-panel-messages"]') ||
      document.querySelector('#pane-side, #main')
    );
  },

  // ── Chat list (sidebar) ──────────────────────────────────────────────────
  getChatList() {
    return getListItems(
      ['[data-testid*="cell-frame"]', '[data-testid*="chat-list-item"]'],
      ['#pane-side [role="listitem"]', '[data-testid="chat-list"] [role="listitem"]'],
      ['#pane-side [tabindex="0"]'],
      'whatsapp',
      () => [...document.querySelectorAll('[class*="chat-"]')].filter(el =>
        el.clientHeight > 40 && el.clientHeight < 100
      )
    );
  },

  extractChatRow(el) {
    const contactEl = tryField(el, 'contactName',
      ['[data-testid*="contact-name"]'],
      ['[title]:not([class*="time"])'],
      ['span[dir="auto"]:first-of-type', '._ao3e'],
      'whatsapp'
    );

    const lastMsgEl = tryField(el, 'body',
      ['[data-testid*="last-msg"]'],
      ['span[dir="ltr"]:last-of-type'],
      ['[class*="message-preview"]', '._ao3e:last-of-type'],
      'whatsapp'
    );

    const timeEl = tryField(el, 'timestamp',
      ['[data-testid*="time"]'],
      [],
      ['[class*="time"]', 'span._ahxt', '._ao2z'],
      'whatsapp'
    );

    const unreadEl = tryField(el, 'unreadBadge',
      ['[data-testid*="icon-unread"]', '[aria-label*="unread"]'],
      [],
      ['span[class*="unread-count"]', '._ahlp'],
      'whatsapp'
    );

    return {
      id:          el.getAttribute('data-id') || _fingerprint(el),
      type:        'chat_thread', platform: 'whatsapp',
      contact:     contactEl?.getAttribute('title') || cleanText(contactEl),
      lastMessage: cleanText(lastMsgEl),
      rawTime:     cleanText(timeEl),
      timestamp:   parseRelativeTime(cleanText(timeEl)),
      unreadCount: parseInt(cleanText(unreadEl)) || 0,
      isGroup:     !!el.querySelector('[data-testid*="group"], [aria-label*="group"]'),
      extractedAt: Date.now(),
    };
  },

  // ── Message bubbles in open chat ──────────────────────────────────────────
  getMessages() {
    return getListItems(
      ['[data-testid="msg-container"]', '[data-testid*="message-"]'],
      ['#main [role="row"]'],
      ['div[class*="message-in"]', 'div[class*="message-out"]'],
      'whatsapp',
      () => [...document.querySelectorAll('[class*="selectable-text"], [class*="copyable-text"]')]
        .map(el => el.closest('div[class*="message"], div[class*="focusable"]') || el)
        .filter((v, i, arr) => arr.indexOf(v) === i)
    );
  },

  extractMessage(el) {
    const isIncoming = el.classList.contains('message-in') ||
                       !!el.querySelector('[data-testid*="incoming"]') ||
                       !el.querySelector('[data-testid*="outgoing"], [data-pre-plain-text*="You"]');

    const textEl = tryField(el, 'body',
      ['span.selectable-text'],
      ['[class*="copyable-area"] span'],
      ['span[dir="ltr"]', 'span[dir="rtl"]'],
      'whatsapp'
    );

    const quoteEl = tryField(el, 'quotedBody',
      ['[data-testid*="quoted-message"]'],
      [],
      ['[class*="quoted"]', '[class*="reply-container"]'],
      'whatsapp'
    );

    const senderEl = tryField(el, 'sender',
      ['[data-testid*="author"]'],
      ['[aria-label*="from"]'],
      ['span[class*="author"]', 'span._ahxt'],
      'whatsapp'
    );

    const timeEl = tryField(el, 'timestamp',
      ['[data-pre-plain-text]', '[aria-label*=":"]'],
      [],
      ['[class*="time"] span', 'span._ahxt'],
      'whatsapp'
    );
    const preText = el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
    const rawTime = preText.match(/\d{1,2}:\d{2}/)?.[0] || cleanText(timeEl);

    const mediaEl = tryField(el, 'media',
      ['[data-testid*="media-viewer"]', '[data-testid*="audio"]', '[data-testid*="document"]'],
      [],
      ['img[src*="blob:"]', 'video'],
      'whatsapp'
    );

    const msgType = mediaEl
      ? (mediaEl.tagName === 'IMG' ? 'image' : mediaEl.tagName === 'VIDEO' ? 'video' : 'media')
      : textEl ? 'text' : 'unknown';

    return {
      id: _fingerprint(el), type: 'chat_message', platform: 'whatsapp',
      direction:   isIncoming ? 'incoming' : 'outgoing',
      sender:      { name: cleanText(senderEl) || (isIncoming ? 'Contact' : 'Me') },
      body:        cleanText(textEl),
      quotedBody:  cleanText(quoteEl),
      msgType, mediaPresent: !!mediaEl,
      rawTime, timestamp: parseRelativeTime(rawTime) || parseRelativeTime(preText),
      extractedAt: Date.now(),
    };
  },

  // ── Message Sending via DOM ──────────────────────────────────────────
  sendMessage(message, chatId = null) {
    try {
      // Find message input field - multiple selector strategies
      const inputField = document.querySelector('[contenteditable="true"][data-tab="10"]') ||
                        document.querySelector('[contenteditable="true"][data-lexical-editor="true"]') ||
                        document.querySelector('div[title="Type a message"]') ||
                        document.querySelector('[contenteditable="true"]') ||
                        document.querySelector('div[contenteditable="true"]');
      
      if (!inputField) {
        throw new Error('WhatsApp message input field not found');
      }
      
      // Focus and clear existing content
      inputField.focus();
      
      // Clear any existing content
      if (inputField.textContent) {
        inputField.textContent = '';
      }
      
      // Type the message using DOM events for better compatibility
      inputField.textContent = message;
      
      // Trigger input events to ensure WhatsApp recognizes the input
      inputField.dispatchEvent(new Event('input', { bubbles: true }));
      inputField.dispatchEvent(new Event('change', { bubbles: true }));
      inputField.dispatchEvent(new Event('keyup', { bubbles: true }));
      
      // Small delay to ensure the message is registered
      setTimeout(() => {
        // Find send button - multiple selector strategies
        const sendButton = document.querySelector('[data-testid="send"]') ||
                          document.querySelector('button[aria-label*="Send"]') ||
                          document.querySelector('span[data-icon="send"]') ||
                          document.querySelector('button[type="submit"]') ||
                          document.querySelector('div[data-testid="send"]');
        
        if (!sendButton) {
          throw new Error('WhatsApp send button not found');
        }
        
        // Click send button
        sendButton.click();
      }, 100);
      
      return { 
        success: true, 
        message: 'Message sent via WhatsApp DOM',
        platform: 'whatsapp'
      };
      
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        platform: 'whatsapp'
      };
    }
  }
};


// ══════════════════════════════════════════════════════════════════════════════
// TELEGRAM WEB ADAPTER
// ══════════════════════════════════════════════════════════════════════════════
const TelegramAdapter = {
  id:   'telegram',
  name: 'Telegram Web',

  isActive() {
    return !!(
      document.querySelector('.chat-list, .chatlist-chat, [class*="chat-list"]') ||
      document.querySelector('.bubbles, .bubble, [class*="bubble"]')
    );
  },

  // Telegram Web A (legacy) vs Web K (React) — detect which
  _isWebK() {
    return !!document.querySelector('#column-left, [class*="Transition__slide"]');
  },

  getChatList() {
    return getListItems(
      ['[data-peer-id]', '[data-chat-id]'],
      ['#column-left [tabindex="0"]', '#page-chats [tabindex]'],
      ['.chat-list li', '.chatlist-chat'],
      'telegram',
      () => {
        const sidebar = document.querySelector('#column-left, [class*="columnLeft"], #page-chats');
        if (!sidebar) return [];
        return [...sidebar.children].filter(el =>
          el.clientHeight > 40 && el.clientHeight < 100 &&
          el.querySelector('img, canvas, [class*="avatar"]')
        );
      }
    );
  },

  extractChatRow(el) {
    const peerId = el.getAttribute('data-peer-id') || el.getAttribute('data-chat-id') ||
                   el.querySelector('[data-peer-id]')?.getAttribute('data-peer-id') || null;

    const nameEl = tryField(el, 'contactName',
      [],
      ['h3', '.user-title', '.peer-title'],
      ['[class*="title"]:not([class*="subtitle"])', 'div > span:first-of-type'],
      'telegram'
    );

    const lastMsgEl = tryField(el, 'body',
      [],
      ['p', '.message'],
      ['[class*="subtitle"]', '[class*="message"]', 'div > span:nth-of-type(2)'],
      'telegram'
    );

    const timeEl = tryField(el, 'timestamp',
      ['time[datetime]', '[datetime]'],
      ['.time', 'span.time'],
      ['[class*="time"]'],
      'telegram'
    );

    const unreadEl = tryField(el, 'unreadBadge',
      [],
      ['.badge', 'i.badge'],
      ['[class*="unread"]', '[class*="badge"]'],
      'telegram'
    );

    return {
      id: peerId || _fingerprint(el), peerId, type: 'chat_thread', platform: 'telegram',
      contact:     cleanText(nameEl),
      lastMessage: cleanText(lastMsgEl),
      rawTime:     cleanText(timeEl),
      timestamp:   parseRelativeTime(cleanText(timeEl)),
      unreadCount: parseInt(cleanText(unreadEl)) || 0,
      isMuted:     !!el.querySelector('[class*="muted"], i[class*="mute"]'),
      extractedAt: Date.now(),
    };
  },

  getMessages() {
    return getListItems(
      ['[data-mid]', '[data-message-id]'],
      ['.bubble:not(.bubble-service)', '#column-center .message'],
      ['[class*="bubble"]:not([class*="service"])'],
      'telegram',
      () => {
        const col = document.querySelector('#column-center, .bubbles-inner, [class*="columnCenter"]');
        if (!col) return [];
        return [...col.querySelectorAll('div[class]')].filter(el => {
          const h = el.getBoundingClientRect().height;
          return h > 28 && h < 300 && el.textContent.trim().length > 0 &&
                 !el.querySelector('[class*="bubble"]');
        });
      }
    );
  },

  extractMessage(el) {
    const isOutgoing = el.classList.contains('is-out') ||
                       el.getAttribute('data-is-out') === 'true' ||
                       !!el.querySelector('[class*="is-out"]');

    const textEl = tryField(el, 'body',
      [],
      ['.text-content', '.message-text', 'p.message', 'div.message'],
      ['[class*="text-content"]', '[class*="messageText"]', '[class*="content"] p'],
      'telegram'
    );

    const senderEl = tryField(el, 'sender',
      [],
      ['.peer-title', 'a.sender-title'],
      ['[class*="peer-title"]', '[class*="name"]', '[class*="authorName"]'],
      'telegram'
    );

    const timeEl = tryField(el, 'timestamp',
      ['time[datetime]', '[datetime]'],
      ['.time', 'span.time-inner'],
      ['[class*="time"]'],
      'telegram'
    );

    const fwdEl = tryField(el, 'forwardedFrom',
      [],
      ['.forwarded-from .peer-title'],
      ['[class*="forward"] [class*="title"]', '[class*="forwarded"] .name'],
      'telegram'
    );

    const replyEl = tryField(el, 'quotedBody',
      [],
      ['.reply'],
      ['[class*="reply"] .message', '[class*="ReplyQuote"]'],
      'telegram'
    );

    const mediaEl = tryField(el, 'media',
      [],
      ['img.media-photo', 'video.media-video'],
      ['[class*="media"] img', '[class*="Document"]'],
      'telegram'
    );

    const rawTime = timeEl?.getAttribute('datetime') || cleanText(timeEl);
    return {
      id: el.getAttribute('data-mid') || el.getAttribute('data-message-id') || _fingerprint(el),
      mid: el.getAttribute('data-mid'),
      type: 'chat_message', platform: 'telegram',
      direction:     isOutgoing ? 'outgoing' : 'incoming',
      sender:        { name: cleanText(senderEl) || (isOutgoing ? 'Me' : 'Contact') },
      body:          cleanText(textEl),
      quotedBody:    cleanText(replyEl),
      forwardedFrom: cleanText(fwdEl),
      msgType:       mediaEl ? 'media' : textEl ? 'text' : 'unknown',
      mediaPresent:  !!mediaEl,
      rawTime, timestamp: parseRelativeTime(rawTime),
      extractedAt: Date.now(),
    };
  },

  // ── Message Sending via DOM ──────────────────────────────────────────
  sendMessage(message, chatId = null) {
    try {
      // Find message input field - multiple selector strategies for Telegram Web
      const inputField = document.querySelector('.input-message') ||
                        document.querySelector('[contenteditable="true"]') ||
                        document.querySelector('div[contenteditable="true"]') ||
                        document.querySelector('.composer') ||
                        document.querySelector('div[role="textbox"]') ||
                        document.querySelector('textarea');
      
      if (!inputField) {
        throw new Error('Telegram input field not found');
      }
      
      // Focus and clear existing content
      inputField.focus();
      
      // Clear any existing content
      if (inputField.textContent) {
        inputField.textContent = '';
      }
      if (inputField.value) {
        inputField.value = '';
      }
      
      // Type the message using DOM events
      if (inputField.contentEditable === 'true') {
        inputField.textContent = message;
      } else {
        inputField.value = message;
      }
      
      // Trigger input events to ensure Telegram recognizes the input
      inputField.dispatchEvent(new Event('input', { bubbles: true }));
      inputField.dispatchEvent(new Event('change', { bubbles: true }));
      inputField.dispatchEvent(new Event('keyup', { bubbles: true }));
      
      // Small delay to ensure the message is registered
      setTimeout(() => {
        // Find send button - multiple selector strategies
        const sendButton = document.querySelector('.btn-send') ||
                          document.querySelector('button.btn-icon') ||
                          document.querySelector('[class*="send"]') ||
                          document.querySelector('button[aria-label*="Send"]') ||
                          document.querySelector('div[data-testid="send"]');
        
        if (sendButton) {
          sendButton.click();
        } else {
          // Fallback: send via Enter key
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          inputField.dispatchEvent(enterEvent);
        }
      }, 100);
      
      return { 
        success: true, 
        message: 'Message sent via Telegram DOM',
        platform: 'telegram'
      };
      
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        platform: 'telegram'
      };
    }
  }
};


// ─── Registry ──────────────────────────────────────────────────────────────────
const ADAPTERS = {
  gmail:    GmailAdapter,
  outlook:  OutlookAdapter,
  whatsapp: WhatsAppAdapter,
  telegram: TelegramAdapter,
};

function getActiveAdapter() {
  const platform = PLATFORM.detect();
  return platform ? ADAPTERS[platform] || null : null;
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function _fingerprint(el) {
  const sig = [
    el.tagName,
    el.getAttribute('data-id') || el.getAttribute('data-mid') || '',
    (el.textContent || '').trim().slice(0, 40),
    Math.round(el.getBoundingClientRect().top),
  ].join('|');
  let hash = 0;
  for (const ch of sig) hash = (Math.imul(31, hash) + ch.charCodeAt(0)) | 0;
  return 'fp_' + Math.abs(hash).toString(36);
}

window.PlatformAdapters = {
  ADAPTERS,
  PLATFORM,
  getActiveAdapter,
  parseRelativeTime,
  cleanText,
  trySelectors,
  trySelectorsAll,
};
