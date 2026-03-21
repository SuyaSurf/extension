/* ─── message-store.js ────────────────────────────────────────────────────────
 * Normalises raw extracted items into a unified MessageRecord schema,
 * persists them via chrome.storage.local, and provides:
 *   - Deduplication across sessions
 *   - Full-text search index
 *   - Platform-agnostic query API
 *   - Export to JSON, CSV, plain text
 *
 * Unified MessageRecord schema
 * ────────────────────────────
 * {
 *   id           string      stable fingerprint
 *   platform     string      gmail | outlook | whatsapp | telegram
 *   kind         string      email | chat
 *   direction    string      incoming | outgoing | unknown
 *   sender       { name, email }
 *   recipients   [{ name, email }]
 *   subject      string      (emails only)
 *   body         string
 *   snippet      string      short preview
 *   timestamp    ISO string  parsed best-effort
 *   rawTime      string      original time string from DOM
 *   threadId     string
 *   labels       string[]    (Gmail labels)
 *   isUnread     boolean
 *   hasAttachment boolean
 *   mediaPresent boolean     (chat)
 *   msgType      string      text | image | video | media | unknown
 *   quotedBody   string
 *   extractedAt  number      unix ms
 *   source       string      list | reading | chat
 *   raw          object      original extracted object (kept for debugging)
 * }
 * ──────────────────────────────────────────────────────────────────────────── */
class MessageStore {
  constructor(config = {}) {
    this._STORAGE_KEY  = 'suya_msg_store';
    this._INDEX_KEY    = 'suya_msg_index';
    this._MAX_RECORDS  = config.maxRecords || 5000;
    this._BATCH_SIZE   = config.batchSize  || 100;

    // In-memory
    this._records = new Map();  // id → MessageRecord
    this._index   = new Map();  // word → Set<id>  (simple inverted index)
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  async initialize() {
    await this._load();
    console.log(`[MessageStore] Loaded ${this._records.size} records`);
  }

  // ─── Normalise raw extracted item → MessageRecord ──────────────────────────
  normalise(raw) {
    const platform = raw.platform || 'unknown';
    const kind     = ['gmail','outlook'].includes(platform) ? 'email' : 'chat';

    // Body: prefer most-specific field
    const body    = raw.body    || raw.snippet     || raw.lastMessage || '';
    const snippet = raw.snippet || (body.slice(0, 120) + (body.length > 120 ? '…' : ''));

    const record = {
      id:           raw.id,
      platform,
      kind,
      direction:    raw.direction || (kind === 'email' ? 'incoming' : 'unknown'),
      sender: {
        name:  raw.sender?.name  || raw.contact || '',
        email: raw.sender?.email || null,
      },
      recipients:  raw.recipients || [],
      subject:     raw.subject     || '',
      body,
      snippet,
      timestamp:   raw.timestamp  || null,
      rawTime:     raw.rawTime    || '',
      threadId:    raw.threadId   || raw.convId || raw.peerId || null,
      labels:      raw.labels     || [],
      isUnread:    raw.isUnread   ?? (raw.unreadCount > 0) ?? false,
      hasAttachment: raw.hasAttachment ?? false,
      mediaPresent:  raw.mediaPresent  ?? false,
      msgType:       raw.msgType      || (kind === 'email' ? 'email' : 'text'),
      quotedBody:    raw.quotedBody   || '',
      forwardedFrom: raw.forwardedFrom || '',
      extractedAt:   raw.extractedAt  || Date.now(),
      source:        raw.type         || 'unknown',
      raw,  // keep for debugging; omit on export if desired
    };

    return record;
  }

  // ─── Write ─────────────────────────────────────────────────────────────────
  /**
   * Upsert a batch of raw extracted items.
   * Returns { added, updated, skipped }
   */
  async upsertMany(rawItems) {
    let added = 0, updated = 0, skipped = 0;

    for (const raw of rawItems) {
      if (!raw?.id) { skipped++; continue; }

      const existing = this._records.get(raw.id);
      const record   = this.normalise(raw);

      if (!existing) {
        this._records.set(record.id, record);
        this._indexRecord(record);
        added++;
      } else if (record.extractedAt > existing.extractedAt) {
        // Update if fresher (e.g. message now read, new snippet)
        this._unindexRecord(existing);
        this._records.set(record.id, { ...existing, ...record });
        this._indexRecord(record);
        updated++;
      } else {
        skipped++;
      }
    }

    // Trim if over limit
    if (this._records.size > this._MAX_RECORDS) {
      this._trim();
    }

    if (added + updated > 0) {
      await this._saveBatch();
    }

    return { added, updated, skipped, total: this._records.size };
  }

  async upsertOne(raw) {
    return this.upsertMany([raw]);
  }

  // ─── Read ──────────────────────────────────────────────────────────────────
  getById(id)    { return this._records.get(id) || null; }
  getAll()       { return [...this._records.values()]; }
  count()        { return this._records.size; }

  /**
   * Query with flexible filter + sort + pagination.
   * @param {object} opts
   * @param {string}   [opts.platform]     filter by platform
   * @param {string}   [opts.kind]         email | chat
   * @param {string}   [opts.direction]    incoming | outgoing
   * @param {string}   [opts.sender]       fuzzy match on sender name/email
   * @param {string}   [opts.keyword]      full-text search across body+subject
   * @param {boolean}  [opts.unreadOnly]
   * @param {string}   [opts.after]        ISO date string
   * @param {string}   [opts.before]       ISO date string
   * @param {string}   [opts.threadId]
   * @param {string}   [opts.sortBy]       timestamp | extractedAt (default: extractedAt)
   * @param {string}   [opts.order]        asc | desc (default: desc)
   * @param {number}   [opts.limit]
   * @param {number}   [opts.offset]
   */
  query(opts = {}) {
    const {
      platform, kind, direction, sender, keyword,
      unreadOnly, after, before, threadId,
      sortBy = 'extractedAt', order = 'desc',
      limit, offset = 0,
    } = opts;

    let items = [...this._records.values()];

    // ── Filters ────────────────────────────────────────────────────────────
    if (platform)   items = items.filter(r => r.platform === platform);
    if (kind)       items = items.filter(r => r.kind     === kind);
    if (direction)  items = items.filter(r => r.direction === direction);
    if (unreadOnly) items = items.filter(r => r.isUnread);
    if (threadId)   items = items.filter(r => r.threadId === threadId);

    if (sender) {
      const q = sender.toLowerCase();
      items = items.filter(r =>
        r.sender.name?.toLowerCase().includes(q) ||
        r.sender.email?.toLowerCase().includes(q)
      );
    }

    if (after) {
      const ts = new Date(after).getTime();
      items = items.filter(r => !r.timestamp || new Date(r.timestamp).getTime() >= ts);
    }

    if (before) {
      const ts = new Date(before).getTime();
      items = items.filter(r => !r.timestamp || new Date(r.timestamp).getTime() <= ts);
    }

    // ── Full-text keyword search (index-assisted) ─────────────────────────
    if (keyword) {
      const words  = _tokenize(keyword);
      let   idSets = null;

      for (const w of words) {
        const matches = this._lookupIndex(w);
        if (matches === null) { idSets = null; break; }   // word not in index — fall through
        idSets = idSets === null ? new Set(matches) : new Set([...idSets].filter(id => matches.has(id)));
      }

      if (idSets !== null) {
        // Index gave us a candidate set — filter from it
        items = items.filter(r => idSets.has(r.id));
      } else {
        // Fallback: brute-force scan
        const q = keyword.toLowerCase();
        items = items.filter(r =>
          (r.body + ' ' + r.subject + ' ' + r.sender.name).toLowerCase().includes(q)
        );
      }
    }

    // ── Sort ───────────────────────────────────────────────────────────────
    items.sort((a, b) => {
      const va = sortBy === 'timestamp'
        ? (a.timestamp ? new Date(a.timestamp).getTime() : a.extractedAt)
        : a.extractedAt;
      const vb = sortBy === 'timestamp'
        ? (b.timestamp ? new Date(b.timestamp).getTime() : b.extractedAt)
        : b.extractedAt;
      return order === 'asc' ? va - vb : vb - va;
    });

    const total = items.length;
    if (offset) items = items.slice(offset);
    if (limit)  items = items.slice(0, limit);

    return { items, total, returned: items.length };
  }

  /**
   * Return a grouped summary:
   *   { platform, kind, sender } → count
   */
  getSummary() {
    const all = this.getAll();

    const byPlatform = _countBy(all, 'platform');
    const byKind     = _countBy(all, 'kind');
    const unread     = all.filter(r => r.isUnread).length;
    const withMedia  = all.filter(r => r.mediaPresent || r.hasAttachment).length;

    // Top senders
    const senderCounts = {};
    for (const r of all) {
      const key = r.sender.email || r.sender.name;
      if (key) senderCounts[key] = (senderCounts[key] || 0) + 1;
    }
    const topSenders = Object.entries(senderCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([sender, count]) => ({ sender, count }));

    const earliest = all.reduce((min, r) => {
      const t = r.timestamp ? new Date(r.timestamp).getTime() : 0;
      return t && t < min ? t : min;
    }, Infinity);
    const latest = all.reduce((max, r) => {
      const t = r.timestamp ? new Date(r.timestamp).getTime() : 0;
      return t > max ? t : max;
    }, 0);

    return {
      total: all.length,
      unread,
      withMedia,
      byPlatform,
      byKind,
      topSenders,
      dateRange: {
        earliest: earliest !== Infinity ? new Date(earliest).toISOString() : null,
        latest:   latest   !== 0        ? new Date(latest).toISOString()   : null,
      },
    };
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  exportJSON(opts = {}) {
    const { items } = this.query(opts);
    // Strip the raw field for export
    const clean = items.map(({ raw, ...rest }) => rest);
    return JSON.stringify(clean, null, 2);
  }

  exportCSV(opts = {}) {
    const { items } = this.query(opts);
    const cols = ['id','platform','kind','direction','sender.name','sender.email',
                   'subject','snippet','timestamp','isUnread','hasAttachment','threadId'];

    const escape = (v) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };

    const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj) ?? '';

    const rows = [
      cols.join(','),
      ...items.map(r => cols.map(c => escape(get(r, c))).join(','))
    ];
    return rows.join('\n');
  }

  exportPlainText(opts = {}) {
    const { items } = this.query(opts);
    return items.map(r => {
      const lines = [
        `[${r.platform.toUpperCase()}] ${r.timestamp ? new Date(r.timestamp).toLocaleString() : r.rawTime || 'unknown time'}`,
        `From: ${r.sender.name}${r.sender.email ? ` <${r.sender.email}>` : ''}`,
      ];
      if (r.subject)  lines.push(`Subject: ${r.subject}`);
      if (r.body)     lines.push('', r.body);
      return lines.join('\n') + '\n' + '─'.repeat(60);
    }).join('\n\n');
  }

  // ─── Delete ────────────────────────────────────────────────────────────────
  async deleteById(id) {
    const rec = this._records.get(id);
    if (rec) { this._unindexRecord(rec); this._records.delete(id); }
    await this._saveBatch();
    return { success: !!rec };
  }

  async deleteByPlatform(platform) {
    const ids = [...this._records.values()]
      .filter(r => r.platform === platform)
      .map(r => r.id);
    for (const id of ids) {
      const rec = this._records.get(id);
      if (rec) { this._unindexRecord(rec); this._records.delete(id); }
    }
    await this._saveBatch();
    return { success: true, deleted: ids.length };
  }

  async clear() {
    this._records.clear();
    this._index.clear();
    await chrome.storage.local.remove([this._STORAGE_KEY, this._INDEX_KEY]);
    return { success: true };
  }

  // ─── Full-text index ───────────────────────────────────────────────────────
  _indexRecord(record) {
    const words = _tokenize(
      [record.body, record.subject, record.sender.name, record.sender.email].filter(Boolean).join(' ')
    );
    for (const w of words) {
      if (!this._index.has(w)) this._index.set(w, new Set());
      this._index.get(w).add(record.id);
    }
  }

  _unindexRecord(record) {
    const words = _tokenize(
      [record.body, record.subject, record.sender.name].filter(Boolean).join(' ')
    );
    for (const w of words) {
      this._index.get(w)?.delete(record.id);
    }
  }

  _lookupIndex(word) {
    // Prefix match in index
    const set = this._index.get(word);
    if (set) return set;

    // Partial prefix scan (expensive but only a fallback)
    const result = new Set();
    let found = false;
    for (const [key, ids] of this._index) {
      if (key.startsWith(word)) { for (const id of ids) result.add(id); found = true; }
    }
    return found ? result : null;
  }

  // ─── Trim oldest records ───────────────────────────────────────────────────
  _trim() {
    const sorted = [...this._records.values()]
      .sort((a, b) => a.extractedAt - b.extractedAt);
    const toRemove = sorted.slice(0, this._records.size - this._MAX_RECORDS);
    for (const rec of toRemove) {
      this._unindexRecord(rec);
      this._records.delete(rec.id);
    }
  }

  // ─── Persistence ───────────────────────────────────────────────────────────
  async _saveBatch() {
    try {
      const recordsObj = Object.fromEntries(
        [...this._records.entries()].map(([id, r]) => [id, { ...r, raw: undefined }])
      );
      // Convert index to serialisable form
      const indexObj = Object.fromEntries(
        [...this._index.entries()].map(([w, ids]) => [w, [...ids]])
      );
      await chrome.storage.local.set({
        [this._STORAGE_KEY]: recordsObj,
        [this._INDEX_KEY]:   indexObj,
      });
    } catch (e) {
      console.error('[MessageStore] Save failed:', e);
    }
  }

  async _load() {
    try {
      const data = await chrome.storage.local.get([this._STORAGE_KEY, this._INDEX_KEY]);
      const recs = data[this._STORAGE_KEY] || {};
      const idx  = data[this._INDEX_KEY]   || {};

      for (const [id, rec] of Object.entries(recs)) {
        this._records.set(id, rec);
      }
      for (const [word, ids] of Object.entries(idx)) {
        this._index.set(word, new Set(ids));
      }
    } catch (e) {
      console.error('[MessageStore] Load failed:', e);
    }
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────────
function _tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !_STOP_WORDS.has(w));
}

function _countBy(arr, key) {
  return arr.reduce((acc, item) => {
    const v = item[key];
    acc[v]  = (acc[v] || 0) + 1;
    return acc;
  }, {});
}

const _STOP_WORDS = new Set([
  'the','and','for','are','but','not','you','all','this','with','that',
  'have','from','they','will','one','been','has','its','were','more',
]);

export { MessageStore };
