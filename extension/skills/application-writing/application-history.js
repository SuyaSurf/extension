/* ─── application-history.js ─── */

/**
 * ApplicationHistory
 *
 * Stores every form fill as an ApplicationRecord and groups records into
 * Projects.  Projects are detected/merged automatically but can be renamed
 * and manually reorganised by the user.
 *
 * Data model
 * ──────────
 * Project {
 *   id            string           "proj_…"
 *   name          string           "Google Accelerator 2025"
 *   type          string           job_application | event_registration | grant_application | general_form
 *   urlPatterns   string[]         normalised URL prefixes seen for this project
 *   domainGroup   string           primary domain for display/grouping
 *   tags          string[]
 *   recordIds     string[]         ordered newest-first
 *   pinnedFields  object           { semanticType → value }  manually pinned answers
 *   createdAt     number
 *   updatedAt     number
 * }
 *
 * ApplicationRecord {
 *   id              string
 *   projectId       string
 *   url             string         full URL at fill time
 *   urlKey          string         normalised URL (no tracking params)
 *   formType        string
 *   formFingerprint string         hash of field structure (from DomUtils)
 *   profileId       string         which profile was active
 *   fields          FieldRecord[]
 *   generatedContent object        raw AI output
 *   metadata        object         { title, company, position, eventName }
 *   filledAt        number
 *   editedFields    string[]       semanticTypes the user manually corrected
 * }
 *
 * FieldRecord {
 *   semanticType  string
 *   label         string           primary label from the form
 *   value         any              final submitted value
 *   source        "profile" | "ai" | "history" | "user"
 *   confidence    number           matcher score at fill time
 *   corrected     boolean          user changed value after autofill
 * }
 */
class ApplicationHistory {
  constructor() {
    this._PROJECTS_KEY = 'suya_ah_projects';
    this._RECORDS_KEY  = 'suya_ah_records';
    this._IDX_KEY      = 'suya_ah_url_index';   // urlKey → recordId[]

    this.projects = new Map();   // id → Project
    this.records  = new Map();   // id → ApplicationRecord
    this._urlIndex = new Map();  // urlKey → recordId[]
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  async initialize() {
    await this._load();
    console.log(`[ApplicationHistory] Loaded ${this.projects.size} projects, ${this.records.size} records`);
  }

  // ─── Save a completed fill ─────────────────────────────────────────────────
  /**
   * @param {object} opts
   * @param {object}   opts.scanResult        from FormScanner.scan()
   * @param {object[]} opts.fillResults        from FormFiller.fillAll()  [{ key, value, field, score, filled }]
   * @param {object}   opts.generatedContent   from AIContentProcessor
   * @param {object}   opts.profile            active profile
   * @param {string}   [opts.projectHint]      user-supplied project name or id
   * @returns {Promise<{ record: ApplicationRecord, project: Project }>}
   */
  async recordFill({ scanResult, fillResults, generatedContent, profile, projectHint } = {}) {
    const urlKey  = this._normaliseUrl(window.location.href);
    const meta    = this._extractPageMetadata(scanResult);
    const fields  = this._buildFieldRecords(fillResults, generatedContent);
    const fprint  = window.DomUtils?.formFingerprint?.() || this._hashFields(fields);
    const formType = window.FormScanner?.detectFormType?.(scanResult) || 'general_form';

    // Detect or create project
    const project = await this._resolveProject({
      urlKey, meta, formType, projectHint, fields,
      profileId: profile?.id,
    });

    const record = {
      id:              'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      projectId:       project.id,
      url:             window.location.href,
      urlKey,
      formType,
      formFingerprint: fprint,
      profileId:       profile?.id || null,
      fields,
      generatedContent: generatedContent || {},
      metadata:        meta,
      filledAt:        Date.now(),
      editedFields:    [],
    };

    // Persist
    this.records.set(record.id, record);
    project.recordIds.unshift(record.id);
    project.updatedAt = Date.now();
    if (!project.urlPatterns.includes(urlKey)) {
      project.urlPatterns.push(urlKey);
    }

    this._indexUrl(urlKey, record.id);
    await this._save();

    this._emit('history:recordSaved', { recordId: record.id, projectId: project.id });
    return { record, project };
  }

  // ─── Mark fields as user-corrected ────────────────────────────────────────
  /**
   * Call this when the user edits a value after autofill.
   * Corrections are weighted higher in future reuse scoring.
   */
  async markCorrected(recordId, semanticType, newValue) {
    const record = this.records.get(recordId);
    if (!record) return;

    const field = record.fields.find(f => f.semanticType === semanticType);
    if (field) {
      field.value     = newValue;
      field.corrected = true;
      field.source    = 'user';
    }

    if (!record.editedFields.includes(semanticType)) {
      record.editedFields.push(semanticType);
    }

    // Propagate correction to project pinnedFields if 2+ records have the same correction
    await this._considerPinning(record.projectId, semanticType, newValue);
    await this._save();
  }

  // ─── Query: best historical values for a current form ─────────────────────
  /**
   * Given the current scan result, returns a ranked map of
   * { [semanticType]: { value, source, confidence, fromRecord, fromProject } }
   * ready to be merged with the active profile before filling.
   *
   * @param {object} scanResult   current FormScanner result
   * @param {object} [opts]
   * @param {string} [opts.projectId]   restrict to a specific project
   * @param {number} [opts.maxAge]      ignore records older than N ms (default 1 year)
   * @param {number} [opts.topN]        how many records to consider (default 10)
   * @returns {object} fieldSuggestions
   */
  getBestHistoricalValues(scanResult, opts = {}) {
    const {
      projectId = null,
      maxAge    = 365 * 24 * 3600 * 1000,
      topN      = 10,
    } = opts;

    const now            = Date.now();
    const currentTypes   = new Set(
      (scanResult?.fields || []).map(f => f.semanticType).filter(Boolean)
    );
    const urlKey         = this._normaliseUrl(window.location.href);

    // Gather candidate records
    let candidates = [...this.records.values()].filter(r =>
      (now - r.filledAt) < maxAge &&
      (!projectId || r.projectId === projectId)
    );

    // Score each record for relevance to the current page
    const scored = candidates.map(r => ({
      record: r,
      relevance: this._recordRelevance(r, urlKey, currentTypes),
    })).filter(c => c.relevance > 0);

    scored.sort((a, b) => b.relevance - a.relevance);
    const top = scored.slice(0, topN);

    // Build best-value map: most relevant record wins per semanticType,
    // but user-corrected values always beat AI/profile values.
    const suggestions = {};

    for (const { record, relevance } of top) {
      for (const field of record.fields) {
        if (!field.semanticType || !currentTypes.has(field.semanticType)) continue;
        if (!field.value && field.value !== 0) continue;

        const existing  = suggestions[field.semanticType];
        const thisScore = this._fieldScore(field, relevance);

        if (!existing || thisScore > existing._score) {
          suggestions[field.semanticType] = {
            value:       field.value,
            source:      field.source,
            corrected:   field.corrected || false,
            confidence:  field.confidence || relevance,
            fromRecord:  record.id,
            fromProject: record.projectId,
            filledAt:    record.filledAt,
            _score:      thisScore,
          };
        }
      }
    }

    // Override with project-pinned fields (highest authority)
    if (!projectId) {
      const bestProject = this._bestProjectForUrl(urlKey);
      if (bestProject?.pinnedFields) {
        for (const [type, value] of Object.entries(bestProject.pinnedFields)) {
          if (currentTypes.has(type)) {
            suggestions[type] = {
              value,
              source:      'pinned',
              corrected:   true,
              confidence:  1.0,
              fromProject: bestProject.id,
              _score:      2.0,   // always wins
            };
          }
        }
      }
    }

    // Strip internal _score before returning
    for (const k of Object.keys(suggestions)) delete suggestions[k]._score;

    return suggestions;
  }

  // ─── Query: similar past applications ─────────────────────────────────────
  /**
   * Returns projects + their best record, ranked by similarity to the
   * current page.  Used by the UI to show "Continue from…" suggestions.
   *
   * @param {object} [scanResult]
   * @param {number} [limit=5]
   * @returns {{ project, bestRecord, similarity }[]}
   */
  getSimilarApplications(scanResult = null, limit = 5) {
    const urlKey       = this._normaliseUrl(window.location.href);
    const currentTypes = new Set(
      (scanResult?.fields || []).map(f => f.semanticType).filter(Boolean)
    );

    const results = [];

    for (const project of this.projects.values()) {
      const sim = this._projectSimilarity(project, urlKey, currentTypes);
      if (sim <= 0) continue;

      const bestRecordId = project.recordIds[0]; // newest
      const bestRecord   = this.records.get(bestRecordId);
      if (!bestRecord) continue;

      results.push({ project, bestRecord, similarity: sim });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  // ─── Project CRUD ──────────────────────────────────────────────────────────
  getProject(id)       { return this.projects.get(id) || null; }
  getAllProjects()      { return [...this.projects.values()].sort((a, b) => b.updatedAt - a.updatedAt); }
  getProjectRecords(id) {
    const proj = this.projects.get(id);
    if (!proj) return [];
    return proj.recordIds.map(rid => this.records.get(rid)).filter(Boolean);
  }

  getAllRecords() {
    return [...this.records.values()];
  }

  async renameProject(id, name) {
    const proj = this.projects.get(id);
    if (!proj) return { success: false, error: 'Project not found' };
    proj.name      = name;
    proj.updatedAt = Date.now();
    await this._save();
    return { success: true, project: proj };
  }

  async mergeProjects(sourceId, targetId) {
    const source = this.projects.get(sourceId);
    const target = this.projects.get(targetId);
    if (!source || !target) return { success: false, error: 'Project not found' };

    // Move all records
    for (const rid of source.recordIds) {
      const rec = this.records.get(rid);
      if (rec) rec.projectId = targetId;
      target.recordIds.push(rid);
    }

    // Merge urlPatterns
    for (const p of source.urlPatterns) {
      if (!target.urlPatterns.includes(p)) target.urlPatterns.push(p);
    }

    // Merge pinned fields (target wins on conflict)
    target.pinnedFields = { ...source.pinnedFields, ...target.pinnedFields };
    target.updatedAt    = Date.now();

    this.projects.delete(sourceId);
    await this._save();
    return { success: true, project: target };
  }

  async pinFieldValue(projectId, semanticType, value) {
    const proj = this.projects.get(projectId);
    if (!proj) return { success: false, error: 'Project not found' };
    proj.pinnedFields            = proj.pinnedFields || {};
    proj.pinnedFields[semanticType] = value;
    proj.updatedAt               = Date.now();
    await this._save();
    return { success: true };
  }

  async unpinField(projectId, semanticType) {
    const proj = this.projects.get(projectId);
    if (!proj) return { success: false, error: 'Project not found' };
    delete (proj.pinnedFields || {})[semanticType];
    proj.updatedAt = Date.now();
    await this._save();
    return { success: true };
  }

  async deleteRecord(recordId) {
    const record = this.records.get(recordId);
    if (!record) return { success: false, error: 'Record not found' };

    const proj = this.projects.get(record.projectId);
    if (proj) {
      proj.recordIds = proj.recordIds.filter(id => id !== recordId);
    }

    this.records.delete(recordId);
    await this._save();
    return { success: true };
  }

  async deleteProject(projectId) {
    const proj = this.projects.get(projectId);
    if (!proj) return { success: false, error: 'Project not found' };

    for (const rid of proj.recordIds) this.records.delete(rid);
    this.projects.delete(projectId);
    await this._save();
    return { success: true };
  }

  getStats() {
    const records   = [...this.records.values()];
    const now       = Date.now();
    const recentCutoff = now - 30 * 24 * 3600 * 1000;

    return {
      totalProjects:       this.projects.size,
      totalRecords:        records.length,
      recentRecords:       records.filter(r => r.filledAt > recentCutoff).length,
      formTypes:           this._countBy(records, 'formType'),
      correctionRate:      records.length
        ? records.filter(r => r.editedFields.length > 0).length / records.length
        : 0,
    };
  }

  // ─── Internal: project resolution ─────────────────────────────────────────
  async _resolveProject({ urlKey, meta, formType, projectHint, fields, profileId }) {
    // 1. User specified an existing project by id or name
    if (projectHint) {
      const byId   = this.projects.get(projectHint);
      if (byId)    return byId;
      const byName = [...this.projects.values()].find(
        p => p.name.toLowerCase() === projectHint.toLowerCase()
      );
      if (byName)  return byName;
    }

    // 2. Exact URL match
    const urlMatched = this._bestProjectForUrl(urlKey);
    if (urlMatched) return urlMatched;

    // 3. Structural similarity across all projects
    const currentTypes = new Set(fields.map(f => f.semanticType).filter(Boolean));
    let bestProj = null, bestSim = 0;

    for (const proj of this.projects.values()) {
      const sim = this._projectSimilarity(proj, urlKey, currentTypes);
      if (sim > bestSim) { bestSim = sim; bestProj = proj; }
    }

    // Threshold: if >50% semantic field overlap AND same domain group → same project
    const currentDomain = this._domainGroup(urlKey);
    if (bestSim > 0.50 && bestProj && this._domainGroup(bestProj.urlPatterns[0] || '') === currentDomain) {
      return bestProj;
    }

    // 4. Create a new project
    return this._createProject({ urlKey, meta, formType, projectHint });
  }

  _createProject({ urlKey, meta, formType, projectHint }) {
    const id = 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const name = projectHint ||
                 meta.eventName ||
                 meta.company   ||
                 this._nameFromUrl(urlKey) ||
                 `${this._formTypeLabel(formType)} – ${new Date().toLocaleDateString()}`;

    const proj = {
      id,
      name,
      type:        formType,
      urlPatterns: [urlKey],
      domainGroup: this._domainGroup(urlKey),
      tags:        [],
      recordIds:   [],
      pinnedFields: {},
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    };

    this.projects.set(id, proj);
    return proj;
  }

  // ─── Similarity scoring ────────────────────────────────────────────────────
  /**
   * Score how relevant a past record is to the current page.
   * Returns 0–1.
   */
  _recordRelevance(record, currentUrlKey, currentTypes) {
    let score = 0;

    // URL similarity (high weight)
    const urlSim = this._urlSimilarity(record.urlKey, currentUrlKey);
    score += urlSim * 0.40;

    // Semantic field overlap
    const recTypes  = new Set(record.fields.map(f => f.semanticType).filter(Boolean));
    const overlap   = [...recTypes].filter(t => currentTypes.has(t)).length;
    const union     = new Set([...recTypes, ...currentTypes]).size;
    const jaccardST = union > 0 ? overlap / union : 0;
    score += jaccardST * 0.35;

    // Form type match
    if (record.formType === window.FormScanner?.detectFormType?.() ||
        (currentTypes.has('attendanceType') && record.formType === 'event_registration')) {
      score += 0.15;
    }

    // Recency bonus (decays over 6 months)
    const ageDays = (Date.now() - record.filledAt) / 86_400_000;
    score += Math.max(0, 0.10 * (1 - ageDays / 180));

    return Math.min(score, 1);
  }

  /**
   * Project-level similarity: best record's relevance, adjusted for
   * the spread of URL patterns in the project.
   */
  _projectSimilarity(project, urlKey, currentTypes) {
    // Fast path: URL pattern in this project
    const urlMatch = project.urlPatterns.some(p => this._urlSimilarity(p, urlKey) > 0.7);
    if (urlMatch) return 0.90;

    // Domain match
    if (this._domainGroup(project.domainGroup) === this._domainGroup(urlKey)) {
      return 0.55;
    }

    // Field overlap via most recent record
    const latestRid = project.recordIds[0];
    const latest    = this.records.get(latestRid);
    if (!latest) return 0;

    return this._recordRelevance(latest, urlKey, currentTypes) * 0.80;
  }

  _urlSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b)  return 1;
    try {
      const ua = new URL(a.includes('://') ? a : 'https://' + a);
      const ub = new URL(b.includes('://') ? b : 'https://' + b);
      if (ua.hostname !== ub.hostname) return 0;
      // Compare path segments
      const pa = ua.pathname.split('/').filter(Boolean);
      const pb = ub.pathname.split('/').filter(Boolean);
      const minLen = Math.min(pa.length, pb.length);
      if (minLen === 0) return 0.5;
      let matching = 0;
      for (let i = 0; i < minLen; i++) {
        if (pa[i] === pb[i]) matching++;
        else break; // stop at first divergence
      }
      return matching / Math.max(pa.length, pb.length);
    } catch { return 0; }
  }

  /**
   * Score a single field record for value selection:
   * - user corrections score highest
   * - pinned fields score 2×
   * - recency and matcher confidence also factor in
   */
  _fieldScore(fieldRecord, recordRelevance) {
    let s = recordRelevance;
    if (fieldRecord.corrected)          s *= 1.8;
    if (fieldRecord.source === 'user')  s *= 1.5;
    if (fieldRecord.source === 'ai')    s *= 0.9;  // prefer profile/history over AI
    s *= (fieldRecord.confidence || 0.5);
    return s;
  }

  // ─── Pinning logic ─────────────────────────────────────────────────────────
  async _considerPinning(projectId, semanticType, value) {
    const proj = this.projects.get(projectId);
    if (!proj) return;

    // Count how many records in this project have a correction for this field
    const corrections = proj.recordIds
      .map(rid => this.records.get(rid))
      .filter(r => r && r.editedFields.includes(semanticType))
      .map(r => r.fields.find(f => f.semanticType === semanticType)?.value)
      .filter(v => v === value);

    // Auto-pin if the same correction appears 2+ times
    if (corrections.length >= 2) {
      proj.pinnedFields = proj.pinnedFields || {};
      if (proj.pinnedFields[semanticType] !== value) {
        proj.pinnedFields[semanticType] = value;
        this._emit('history:fieldAutoPinned', { projectId, semanticType, value });
        console.log(`[ApplicationHistory] Auto-pinned "${semanticType}" for project "${proj.name}"`);
      }
    }
  }

  // ─── Metadata extraction ───────────────────────────────────────────────────
  _extractPageMetadata(scanResult) {
    const title   = document.title || '';
    const h1      = document.querySelector('h1')?.textContent?.trim() || '';
    const h2      = document.querySelector('h2')?.textContent?.trim() || '';
    const heading = h1 || h2 || title;

    // Try to extract company / event name from page heading
    const companyField = scanResult?.fields?.find(f => f.semanticType === 'company');
    const company      = companyField?.value || '';

    return {
      title,
      heading,
      company,
      eventName: heading || title,
      url:       window.location.href,
    };
  }

  _buildFieldRecords(fillResults, generatedContent) {
    return (fillResults || [])
      .filter(r => r.filled)
      .map(r => {
        const isGenerated = generatedContent?.content &&
          Object.values(generatedContent.content).includes(r.value);
        return {
          semanticType: r.field?.semanticType || r.key || null,
          label:        r.field?.primaryLabel  || r.field || '',
          value:        r.value,
          source:       isGenerated ? 'ai' : 'profile',
          confidence:   r.score || 0.5,
          corrected:    false,
        };
      });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  _normaliseUrl(url) {
    if (window.DomUtils?.normaliseUrl) return window.DomUtils.normaliseUrl(url);
    try {
      const u = new URL(url);
      u.hash = '';
      ['utm_source','utm_medium','utm_campaign','ref','fbclid','gclid']
        .forEach(p => u.searchParams.delete(p));
      return u.toString();
    } catch { return url; }
  }

  _domainGroup(url) {
    try { return new URL(url.includes('://') ? url : 'https://' + url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  }

  _nameFromUrl(urlKey) {
    try {
      const u    = new URL(urlKey.includes('://') ? urlKey : 'https://' + urlKey);
      const segs = u.pathname.split('/').filter(Boolean);
      // Use the most descriptive path segment (skip generic words)
      const skip = new Set(['forms','form','registration','register','apply','application','rsvp','events','event','www']);
      const best  = segs.reverse().find(s => !skip.has(s.toLowerCase()));
      if (best) return best.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return u.hostname.replace(/^www\./, '').split('.')[0];
    } catch { return null; }
  }

  _formTypeLabel(type) {
    const map = {
      job_application:   'Job Application',
      grant_application: 'Grant Application',
      event_registration:'Event Registration',
      general_form:      'Form',
    };
    return map[type] || 'Application';
  }

  _bestProjectForUrl(urlKey) {
    for (const proj of this.projects.values()) {
      if (proj.urlPatterns.some(p => p === urlKey || this._urlSimilarity(p, urlKey) >= 0.85)) {
        return proj;
      }
    }
    return null;
  }

  _indexUrl(urlKey, recordId) {
    const list = this._urlIndex.get(urlKey) || [];
    if (!list.includes(recordId)) list.unshift(recordId);
    this._urlIndex.set(urlKey, list);
  }

  _hashFields(fields) {
    const sig = (fields || []).map(f => f.semanticType || f.label).join('|');
    let hash = 0;
    for (const ch of sig) hash = (Math.imul(31, hash) + ch.charCodeAt(0)) | 0;
    return Math.abs(hash).toString(36);
  }

  _countBy(arr, key) {
    return arr.reduce((acc, item) => {
      acc[item[key]] = (acc[item[key]] || 0) + 1;
      return acc;
    }, {});
  }

  // ─── Persistence ───────────────────────────────────────────────────────────
  async _save() {
    try {
      // Check if Chrome storage API is available
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({
          [this._PROJECTS_KEY]: Object.fromEntries(this.projects),
          [this._RECORDS_KEY]:  Object.fromEntries(this.records),
          [this._IDX_KEY]:      Object.fromEntries(this._urlIndex),
        });
      } else {
        // Fallback to localStorage for testing/non-extension contexts
        const data = {
          [this._PROJECTS_KEY]: Object.fromEntries(this.projects),
          [this._RECORDS_KEY]:  Object.fromEntries(this.records),
          [this._IDX_KEY]:      Object.fromEntries(this._urlIndex),
        };
        localStorage.setItem('suya_application_history_backup', JSON.stringify(data));
        console.warn('[ApplicationHistory] Chrome storage not available, using localStorage fallback');
      }
    } catch (e) {
      console.error('[ApplicationHistory] Save failed:', e);
      // Try localStorage as emergency fallback
      try {
        const data = {
          [this._PROJECTS_KEY]: Object.fromEntries(this.projects),
          [this._RECORDS_KEY]:  Object.fromEntries(this.records),
          [this._IDX_KEY]:      Object.fromEntries(this._urlIndex),
        };
        localStorage.setItem('suya_application_history_emergency', JSON.stringify(data));
      } catch (fallbackError) {
        console.error('[ApplicationHistory] Emergency fallback also failed:', fallbackError);
      }
    }
  }

  async _load() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const data = await chrome.storage.local.get([
          this._PROJECTS_KEY, this._RECORDS_KEY, this._IDX_KEY,
        ]);
        this.projects  = new Map(Object.entries(data[this._PROJECTS_KEY] || {}));
        this.records   = new Map(Object.entries(data[this._RECORDS_KEY]  || {}));
        this._urlIndex = new Map(Object.entries(data[this._IDX_KEY]      || {}));
      } else {
        // Fallback to localStorage
        const backup = localStorage.getItem('suya_application_history_backup');
        const emergency = localStorage.getItem('suya_application_history_emergency');
        const dataStr = backup || emergency;
        
        if (dataStr) {
          const data = JSON.parse(dataStr);
          this.projects  = new Map(Object.entries(data[this._PROJECTS_KEY] || {}));
          this.records   = new Map(Object.entries(data[this._RECORDS_KEY]  || {}));
          this._urlIndex = new Map(Object.entries(data[this._IDX_KEY]      || {}));
          console.warn('[ApplicationHistory] Chrome storage not available, loaded from localStorage');
        } else {
          this.projects = new Map();
          this.records = new Map();
          this._urlIndex = new Map();
        }
      }
    } catch (e) {
      console.error('[ApplicationHistory] Load failed:', e);
      // Initialize empty maps as fallback
      this.projects = new Map();
      this.records = new Map();
      this._urlIndex = new Map();
    }
  }

  _emit(eventName, detail = {}) {
    try {
      window.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: true }));
    } catch (e) {}
  }
}

export { ApplicationHistory };
