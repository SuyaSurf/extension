/**
 * PersonalMemorySkill
 *
 * Local-first memory over browser history, saved form fills, and dream
 * iterations. Raw browser/form evidence stays in extension storage unless a
 * later explicit sync flow is added.
 */
import { SignalCollector, extractDomain } from '../../shared/suyanet/signal-collector.js';
import { ApplicationHistory } from '../application-writing/application-history.js';

const MEMORY_ENTRIES_KEY = 'suya_personal_memory_entries';
const MEMORY_DREAMS_KEY = 'suya_personal_memory_dreams';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has',
  'have', 'i', 'in', 'is', 'it', 'like', 'me', 'more', 'my', 'of', 'on',
  'or', 'that', 'the', 'this', 'to', 'was', 'what', 'with', 'you'
]);

const SENSITIVE_FIELD_RE = /password|passcode|pin|otp|ssn|social security|credit card|card number|cardholder|cvc|cvv|token|secret|api[_ -]?key|private key/i;

function hashString(value) {
  const input = String(value || '');
  let hash = 0;
  for (const char of input) {
    hash = (Math.imul(31, hash) + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, ' ')
    .split(/\s+/)
    .map(token => token.replace(/^[-_.\/]+|[-_.\/]+$/g, ''))
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function safeTimestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}

function stringifyValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return normalizeText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return normalizeText(JSON.stringify(value));
  } catch {
    return '';
  }
}

function isSensitiveField(field = {}) {
  const text = [
    field.semanticType,
    field.label,
    field.name,
    field.id,
    field.key
  ].join(' ');
  return SENSITIVE_FIELD_RE.test(text);
}

function dateLabel(timestamp) {
  try {
    return new Date(timestamp).toISOString().slice(0, 10);
  } catch {
    return 'unknown date';
  }
}

class PersonalMemorySkill {
  constructor(config = {}) {
    this.name = config.name || 'personal-memory';
    this.version = '0.1.0';
    this._isActive = false;
    this.config = {
      historyDays: 30,
      historyMaxResults: 500,
      maxEntries: 5000,
      ...config.config
    };

    this.entries = new Map();
    this.dreams = new Map();
    this.signalCollector = new SignalCollector();
  }

  async initialize() {
    await this._load();
  }

  async activate() {
    this._isActive = true;
  }

  async deactivate() {
    this._isActive = false;
    await this._save();
  }

  isActive() {
    return this._isActive;
  }

  getVersion() {
    return this.version;
  }

  getDependencies() {
    return [];
  }

  getHealth() {
    return {
      status: 'healthy',
      entries: this.entries.size,
      dreams: this.dreams.size
    };
  }

  async handleAction(action, data = {}) {
    switch (action) {
      case 'get-status':
      case 'getStatus':
        return this.getStatus();
      case 'index-history':
      case 'indexHistory':
        return this.indexHistory(data);
      case 'index-form-history':
      case 'indexFormHistory':
        return this.indexFormHistory(data);
      case 'index-all':
      case 'indexAll':
        return this.indexAll(data);
      case 'search-memory':
      case 'searchMemory':
        return this.searchMemory(data);
      case 'answer-memory-question':
      case 'answerMemoryQuestion':
        return this.answerMemoryQuestion(data);
      case 'find-more-like-this':
      case 'findMoreLikeThis':
        return this.findMoreLikeThis(data);
      case 'extract-dreams':
      case 'extractDreams':
        return this.extractDreams(data);
      case 'create-dream':
      case 'createDream':
        return this.createDream(data);
      case 'create-dream-iteration':
      case 'createDreamIteration':
        return this.createDreamIteration(data);
      case 'delete-memory':
      case 'deleteMemory':
        return this.deleteMemory(data);
      case 'delete-dream':
      case 'deleteDream':
        return this.deleteDream(data);
      case 'clear-memory':
      case 'clearMemory':
        return this.clearMemory(data);
      case 'export-memory':
      case 'exportMemory':
        return this.exportMemory();
      default:
        throw new Error(`[PersonalMemorySkill] Unknown action: ${action}`);
    }
  }

  getStatus() {
    const sourceCounts = {};
    for (const entry of this.entries.values()) {
      sourceCounts[entry.sourceType] = (sourceCounts[entry.sourceType] || 0) + 1;
    }

    return {
      success: true,
      entries: this.entries.size,
      dreams: this.dreams.size,
      sourceCounts,
      historyPermissionAvailable: this._canUseHistoryApi(),
      localOnly: true
    };
  }

  async indexAll(data = {}) {
    const includeForms = data.includeForms !== false;
    const includeHistory = data.includeHistory !== false;
    const results = {
      success: true,
      formHistory: null,
      browserHistory: null
    };

    if (includeForms) {
      results.formHistory = await this.indexFormHistory(data);
    }

    if (includeHistory) {
      results.browserHistory = await this.indexHistory(data);
    }

    results.entries = this.entries.size;
    return results;
  }

  async indexHistory(data = {}) {
    if (!this._canUseHistoryApi()) {
      return {
        success: false,
        permissionRequired: true,
        indexed: 0,
        message: 'Browser history permission is not available yet.'
      };
    }

    const hasPermission = await this._hasHistoryPermission();
    if (!hasPermission) {
      return {
        success: false,
        permissionRequired: true,
        indexed: 0,
        message: 'Grant browser history permission to index research memory.'
      };
    }

    const days = clampNumber(data.days, 1, 365, this.config.historyDays);
    const maxResults = clampNumber(data.maxResults, 1, 5000, this.config.historyMaxResults);
    const historyItems = await this.signalCollector.collectBrowsingHistory(days, maxResults);
    const entries = historyItems.map(item => this._entryFromHistory(item));
    const writeResult = await this._upsertEntries(entries);

    return {
      success: true,
      indexed: entries.length,
      ...writeResult
    };
  }

  async indexFormHistory() {
    const applicationHistory = new ApplicationHistory();
    await applicationHistory.initialize();

    const projects = new Map(applicationHistory.getAllProjects().map(project => [project.id, project]));
    const records = applicationHistory.getAllRecords();
    const entries = records.map(record => this._entryFromFormRecord(record, projects.get(record.projectId)));
    const writeResult = await this._upsertEntries(entries);

    return {
      success: true,
      indexed: entries.length,
      ...writeResult
    };
  }

  searchMemory(data = {}) {
    const query = normalizeText(data.query || data.text || '');
    const limit = clampNumber(data.limit, 1, 100, 10);
    const sourceType = data.sourceType || data.filters?.sourceType || null;
    const tokens = tokenize(query);

    const scored = [...this.entries.values()]
      .filter(entry => !sourceType || entry.sourceType === sourceType)
      .map(entry => ({
        entry,
        score: this._scoreEntry(entry, tokens, query)
      }))
      .filter(item => item.score > 0 || (!query && item.entry.timestamp))
      .sort((a, b) => b.score - a.score || b.entry.timestamp - a.entry.timestamp);

    const results = scored.slice(0, limit).map(({ entry, score }) => this._resultFromEntry(entry, score, tokens));

    return {
      success: true,
      query,
      total: scored.length,
      results
    };
  }

  answerMemoryQuestion(data = {}) {
    const query = normalizeText(data.query || data.question || '');
    if (!query) {
      return {
        success: false,
        error: 'A question is required.'
      };
    }

    const search = this.searchMemory({ query, limit: data.limit || 8, filters: data.filters });
    const sources = search.results.slice(0, 5);

    if (sources.length === 0) {
      return {
        success: true,
        query,
        answer: 'I do not have enough local memory for that yet. Try indexing browser history or filling/saving a form first.',
        sources: [],
        results: []
      };
    }

    return {
      success: true,
      query,
      answer: this._composeAnswer(query, sources, search.total),
      sources,
      results: search.results
    };
  }

  findMoreLikeThis(data = {}) {
    const target = this._resolveTargetEntry(data);
    if (!target) {
      return {
        success: false,
        error: 'Provide memoryId, url, or text to find related memories.'
      };
    }

    const limit = clampNumber(data.limit, 1, 50, 10);
    const scored = [...this.entries.values()]
      .filter(entry => entry.id !== target.id)
      .map(entry => ({
        entry,
        score: this._relatedScore(target, entry)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.timestamp - a.entry.timestamp);

    const targetTokens = new Set(tokenize(target.searchText || target.summary || target.title));
    const results = scored.slice(0, limit).map(({ entry, score }) => (
      this._resultFromEntry(entry, score, [...targetTokens])
    ));

    return {
      success: true,
      target: this._resultFromEntry(target, 1, []),
      results,
      suggestions: this._researchSuggestions(target, results)
    };
  }

  extractDreams(data = {}) {
    const search = this.searchMemory({
      query: data.query || data.text || '',
      limit: data.limit || 30
    });

    const groups = new Map();
    for (const result of search.results) {
      const entry = this.entries.get(result.id);
      if (!entry) continue;
      const groupKey = entry.tags.find(tag => !tag.includes('.')) || entry.domain || entry.sourceType;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(entry);
    }

    const dreams = [...groups.entries()]
      .map(([key, entries]) => ({
        title: this._titleFromGroup(key, entries),
        description: this._descriptionFromEntries(entries),
        tags: unique(entries.flatMap(entry => entry.tags)).slice(0, 8),
        sourceMemoryIds: entries.slice(0, 8).map(entry => entry.id),
        confidence: Math.min(1, entries.length / 5)
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, clampNumber(data.maxDreams, 1, 10, 5));

    return {
      success: true,
      dreams,
      sourceResultCount: search.results.length
    };
  }

  async createDream(data = {}) {
    let sourceMemoryIds = Array.isArray(data.sourceMemoryIds) ? data.sourceMemoryIds : [];
    if (!sourceMemoryIds.length && data.query) {
      sourceMemoryIds = this.searchMemory({ query: data.query, limit: 8 }).results.map(result => result.id);
    }

    const sources = sourceMemoryIds.map(id => this.entries.get(id)).filter(Boolean);
    const title = normalizeText(data.title) || this._titleFromGroup(data.query || sources[0]?.domain || 'Dream', sources);
    const dream = {
      id: 'dream_' + Date.now() + '_' + hashString(title).slice(0, 6),
      title,
      description: normalizeText(data.description) || this._descriptionFromEntries(sources),
      sourceMemoryIds: sources.map(source => source.id),
      tags: unique([...(data.tags || []), ...sources.flatMap(source => source.tags)]).slice(0, 12),
      iterations: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.dreams.set(dream.id, dream);
    await this._save();

    return {
      success: true,
      dream
    };
  }

  async createDreamIteration(data = {}) {
    const dream = this.dreams.get(data.dreamId);
    if (!dream) {
      return {
        success: false,
        error: 'Dream not found.'
      };
    }

    const sources = dream.sourceMemoryIds.map(id => this.entries.get(id)).filter(Boolean);
    const variantType = normalizeText(data.variantType || 'research direction');
    const prompt = normalizeText(data.prompt || '');
    const iteration = {
      id: 'iter_' + Date.now() + '_' + hashString(`${dream.id}:${variantType}:${prompt}`).slice(0, 6),
      variantType,
      prompt,
      body: this._buildIterationBody(dream, sources, variantType, prompt),
      sourceMemoryIds: sources.map(source => source.id),
      createdAt: Date.now()
    };

    dream.iterations.unshift(iteration);
    dream.updatedAt = Date.now();
    await this._save();

    return {
      success: true,
      dream,
      iteration
    };
  }

  async deleteMemory(data = {}) {
    const ids = Array.isArray(data.ids) ? data.ids : [data.id].filter(Boolean);
    let deleted = 0;
    for (const id of ids) {
      if (this.entries.delete(id)) deleted++;
    }

    for (const dream of this.dreams.values()) {
      dream.sourceMemoryIds = dream.sourceMemoryIds.filter(id => this.entries.has(id));
      dream.iterations = (dream.iterations || []).map(iteration => ({
        ...iteration,
        sourceMemoryIds: (iteration.sourceMemoryIds || []).filter(id => this.entries.has(id))
      }));
    }

    await this._save();
    return { success: true, deleted };
  }

  async deleteDream(data = {}) {
    const deleted = this.dreams.delete(data.dreamId || data.id);
    await this._save();
    return { success: true, deleted };
  }

  async clearMemory(data = {}) {
    const sourceType = data.sourceType || null;
    if (!sourceType) {
      this.entries.clear();
      this.dreams.clear();
      await this._save();
      return { success: true, cleared: 'all' };
    }

    let deleted = 0;
    for (const entry of [...this.entries.values()]) {
      if (entry.sourceType === sourceType) {
        this.entries.delete(entry.id);
        deleted++;
      }
    }
    await this._save();
    return { success: true, cleared: sourceType, deleted };
  }

  exportMemory() {
    return {
      success: true,
      exportedAt: Date.now(),
      entries: [...this.entries.values()],
      dreams: [...this.dreams.values()]
    };
  }

  _entryFromHistory(item) {
    const url = item.url || '';
    const domain = extractDomain(url);
    const category = item.category || 'general';
    const title = normalizeText(item.title) || domain || url;
    const summary = normalizeText(`${title}. Visited ${item.visitCount || 1} time(s). Category: ${category}.`);

    return this._buildEntry({
      id: `history:${hashString(url)}`,
      sourceType: 'browser_history',
      sourceId: url,
      url,
      domain,
      title,
      summary,
      timestamp: safeTimestamp(item.lastVisitTime),
      tags: unique([category, domain, 'browser-history']),
      metadata: {
        visitCount: item.visitCount || 1,
        category
      },
      privacy: {
        localOnly: true,
        userPermission: 'history'
      }
    });
  }

  _entryFromFormRecord(record, project) {
    const metadata = record.metadata || {};
    const url = record.url || metadata.url || '';
    const domain = extractDomain(url);
    const fields = (record.fields || [])
      .filter(field => !isSensitiveField(field))
      .map(field => ({
        semanticType: field.semanticType || null,
        label: normalizeText(field.label || field.semanticType || ''),
        value: stringifyValue(field.value),
        source: field.source || 'unknown',
        corrected: Boolean(field.corrected)
      }))
      .filter(field => field.value)
      .slice(0, 30);

    const title = normalizeText(project?.name || metadata.eventName || metadata.title || domain || 'Saved form fill');
    const fieldSummary = fields
      .slice(0, 12)
      .map(field => `${field.label || field.semanticType}: ${field.value}`)
      .join('; ');
    const summary = normalizeText([
      `Filled ${record.formType || project?.type || 'form'} for ${title}.`,
      fieldSummary
    ].join(' '));

    return this._buildEntry({
      id: `form:${record.id}`,
      sourceType: 'form_fill',
      sourceId: record.id,
      url,
      domain,
      title,
      summary,
      timestamp: safeTimestamp(record.filledAt),
      tags: unique([record.formType, project?.type, project?.domainGroup, domain, 'form-fill']),
      metadata: {
        projectId: project?.id || record.projectId || null,
        projectName: project?.name || null,
        formType: record.formType || project?.type || null,
        fields,
        sensitiveFieldsOmitted: (record.fields || []).some(field => isSensitiveField(field))
      },
      privacy: {
        localOnly: true,
        rawSensitiveFieldsOmitted: true
      }
    });
  }

  _buildEntry(input) {
    const tags = unique(input.tags || []).map(tag => String(tag).toLowerCase());
    const searchText = normalizeText([
      input.title,
      input.summary,
      input.domain,
      input.url,
      ...tags
    ].join(' '));

    return {
      id: input.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId || input.id,
      url: input.url || null,
      domain: input.domain || null,
      title: normalizeText(input.title),
      summary: normalizeText(input.summary),
      timestamp: safeTimestamp(input.timestamp),
      tags,
      metadata: input.metadata || {},
      privacy: {
        localOnly: true,
        ...(input.privacy || {})
      },
      searchText,
      indexedAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  async _upsertEntries(entries) {
    let created = 0;
    let updated = 0;

    for (const entry of entries) {
      if (!entry?.id) continue;
      const existing = this.entries.get(entry.id);
      if (existing) {
        this.entries.set(entry.id, {
          ...existing,
          ...entry,
          indexedAt: existing.indexedAt || entry.indexedAt,
          updatedAt: Date.now()
        });
        updated++;
      } else {
        this.entries.set(entry.id, entry);
        created++;
      }
    }

    this._enforceRetention();
    await this._save();
    return { created, updated, totalEntries: this.entries.size };
  }

  _scoreEntry(entry, queryTokens, queryText) {
    if (!queryText && queryTokens.length === 0) {
      return this._recencyScore(entry.timestamp);
    }

    const searchText = (entry.searchText || '').toLowerCase();
    const titleText = (entry.title || '').toLowerCase();
    const tagText = (entry.tags || []).join(' ').toLowerCase();
    const domainText = (entry.domain || '').toLowerCase();
    let score = 0;

    if (queryText && searchText.includes(queryText.toLowerCase())) score += 10;

    for (const token of queryTokens) {
      if (titleText.includes(token)) score += 5;
      if (tagText.includes(token)) score += 3;
      if (domainText.includes(token)) score += 2;
      if (searchText.includes(token)) score += 1;
    }

    if (entry.sourceType === 'form_fill') score += 0.5;
    return score + this._recencyScore(entry.timestamp);
  }

  _relatedScore(target, entry) {
    const targetTags = new Set(target.tags || []);
    const entryTags = new Set(entry.tags || []);
    const tagOverlap = [...targetTags].filter(tag => entryTags.has(tag)).length;

    const targetTokens = new Set(tokenize(target.searchText || target.summary || target.title));
    const entryTokens = new Set(tokenize(entry.searchText || entry.summary || entry.title));
    const tokenOverlap = [...targetTokens].filter(token => entryTokens.has(token)).length;
    const tokenUnion = new Set([...targetTokens, ...entryTokens]).size || 1;

    let score = tagOverlap * 4 + (tokenOverlap / tokenUnion) * 8;
    if (target.domain && entry.domain && target.domain === entry.domain) score += 4;
    if (target.sourceType === entry.sourceType) score += 1;
    return score;
  }

  _recencyScore(timestamp) {
    const ageDays = Math.max(0, (Date.now() - safeTimestamp(timestamp)) / 86_400_000);
    return Math.max(0, 1 - ageDays / 90);
  }

  _resultFromEntry(entry, score, queryTokens) {
    return {
      id: entry.id,
      sourceType: entry.sourceType,
      title: entry.title,
      url: entry.url,
      domain: entry.domain,
      timestamp: entry.timestamp,
      date: dateLabel(entry.timestamp),
      tags: entry.tags,
      snippet: this._snippet(entry, queryTokens),
      score: Number(score.toFixed(3)),
      privacy: entry.privacy
    };
  }

  _snippet(entry, queryTokens) {
    const summary = entry.summary || entry.title || '';
    if (!summary) return '';

    const lower = summary.toLowerCase();
    const firstHit = (queryTokens || [])
      .map(token => lower.indexOf(token))
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0];

    if (firstHit === undefined) return summary.slice(0, 220);
    const start = Math.max(0, firstHit - 80);
    return `${start > 0 ? '...' : ''}${summary.slice(start, start + 220)}`;
  }

  _composeAnswer(query, sources, total) {
    const top = sources[0];
    const typeCounts = sources.reduce((acc, source) => {
      acc[source.sourceType] = (acc[source.sourceType] || 0) + 1;
      return acc;
    }, {});
    const sourceSummary = Object.entries(typeCounts)
      .map(([type, count]) => `${count} ${type.replace('_', ' ')}`)
      .join(', ');

    const supporting = sources
      .slice(1, 4)
      .map(source => `${source.title} (${source.domain || source.sourceType})`)
      .join('; ');

    return normalizeText([
      `I found ${total} relevant local memories for "${query}".`,
      `The strongest match is ${top.title} from ${top.domain || top.sourceType} on ${top.date}: ${top.snippet}`,
      supporting ? `Other supporting signals: ${supporting}.` : '',
      `Source mix: ${sourceSummary}.`
    ].join(' '));
  }

  _resolveTargetEntry(data) {
    if (data.memoryId && this.entries.has(data.memoryId)) return this.entries.get(data.memoryId);
    if (data.id && this.entries.has(data.id)) return this.entries.get(data.id);

    if (data.url) {
      const normalizedUrl = String(data.url);
      const exact = [...this.entries.values()].find(entry => entry.url === normalizedUrl);
      if (exact) return exact;
      return this._buildEntry({
        id: `target:${hashString(normalizedUrl)}`,
        sourceType: 'ad_hoc',
        sourceId: normalizedUrl,
        url: normalizedUrl,
        domain: extractDomain(normalizedUrl),
        title: extractDomain(normalizedUrl) || normalizedUrl,
        summary: normalizedUrl,
        timestamp: Date.now(),
        tags: unique([extractDomain(normalizedUrl)])
      });
    }

    if (data.text || data.query) {
      const text = normalizeText(data.text || data.query);
      return this._buildEntry({
        id: `target:${hashString(text)}`,
        sourceType: 'ad_hoc',
        sourceId: text,
        title: text.slice(0, 80),
        summary: text,
        timestamp: Date.now(),
        tags: tokenize(text).slice(0, 8)
      });
    }

    return null;
  }

  _researchSuggestions(target, results) {
    const topTags = unique([
      ...(target.tags || []),
      ...results.flatMap(result => result.tags || [])
    ]).slice(0, 6);

    const domains = unique(results.map(result => result.domain)).slice(0, 5);
    return {
      topics: topTags,
      domains,
      queries: topTags.slice(0, 3).map(tag => `find more about ${tag}`)
    };
  }

  _titleFromGroup(key, entries) {
    const clean = normalizeText(String(key || 'Dream')).replace(/[-_]/g, ' ');
    const title = clean.replace(/\b\w/g, char => char.toUpperCase());
    if (entries.length > 1) return `${title} Direction`;
    return title || 'Dream Direction';
  }

  _descriptionFromEntries(entries) {
    if (!entries.length) return 'A saved direction built from local SuyaSurf memory.';
    const top = entries.slice(0, 3).map(entry => entry.title).join('; ');
    return `Built from ${entries.length} local memory source(s): ${top}.`;
  }

  _buildIterationBody(dream, sources, variantType, prompt) {
    const evidence = sources.slice(0, 5)
      .map(source => `- ${source.title} (${source.domain || source.sourceType}, ${dateLabel(source.timestamp)}): ${source.summary.slice(0, 180)}`)
      .join('\n');
    const focus = prompt || `Create a ${variantType} from this dream.`;

    return [
      `Dream: ${dream.title}`,
      '',
      `Focus: ${focus}`,
      '',
      'Source evidence:',
      evidence || '- No source evidence attached yet.',
      '',
      'Iteration:',
      `Use the evidence above to explore ${dream.title} as a ${variantType}. Keep the next version grounded in the remembered sources, preserve what made the original direction interesting, and create one sharper path for follow-up research or execution.`
    ].join('\n');
  }

  _enforceRetention() {
    if (this.entries.size <= this.config.maxEntries) return;
    const keep = [...this.entries.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.config.maxEntries);
    this.entries = new Map(keep.map(entry => [entry.id, entry]));
  }

  _canUseHistoryApi() {
    return typeof chrome !== 'undefined' && Boolean(chrome.history);
  }

  async _hasHistoryPermission() {
    if (!this._canUseHistoryApi()) return false;
    if (!chrome.permissions?.contains) return true;
    try {
      return await chrome.permissions.contains({ permissions: ['history'] });
    } catch {
      return false;
    }
  }

  async _load() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const data = await chrome.storage.local.get([MEMORY_ENTRIES_KEY, MEMORY_DREAMS_KEY]);
    this.entries = new Map(Object.entries(data[MEMORY_ENTRIES_KEY] || {}));
    this.dreams = new Map(Object.entries(data[MEMORY_DREAMS_KEY] || {}));
  }

  async _save() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({
      [MEMORY_ENTRIES_KEY]: Object.fromEntries(this.entries),
      [MEMORY_DREAMS_KEY]: Object.fromEntries(this.dreams)
    });
  }
}

export { PersonalMemorySkill };
