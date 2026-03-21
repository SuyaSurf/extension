/**
 * Enhanced Application Writing Skill — skill.js v2.2.0
 *
 * New in this version:
 *  - ApplicationHistory integration: every fill is stored and grouped by project
 *  - History-aware fill: historical field values (especially user corrections)
 *    are blended with the active profile before matching
 *  - "Continue from project" flow: detectForms() surfaces similar past applications
 *  - Correction tracking: user edits after autofill are recorded and propagate
 *    to future fills via auto-pinning
 *  - New actions: getHistory, getSimilarApplications, setProject,
 *    markCorrected, pinField, unpinField, mergeProjects, renameProject
 */
import { AIContentProcessor }  from './ai-processor.js';
import { ProfileManager }      from './profile-manager.js';
import { ApplicationHistory }  from './application-history.js';
import { TemplateManager }     from './template-manager.js';
import { ExportManager }       from './export-manager.js';

class ApplicationWritingSkill {
  constructor(config = {}) {
    this.name    = 'application-writing';
    this.version = '2.2.0';
    this.isActive = false;
    
    // Configuration constants
    this.CONFIG_CONSTANTS = {
      RETRY_DELAYS: [500, 1500, 3000, 6000, 10000],
      MAX_RETRIES: 5,
      WATCH_TIMEOUT: 20000,
      CORRECTION_DEBOUNCE: 800,
      FORM_INTENT_THRESHOLD: 0.15,
      SIMILARITY_THRESHOLD: 0.50,
      CACHE_SIZE: 50,
      SERVER_CHECK_TTL: 30000,
      REQUEST_TIMEOUT: 8000,
    };
    
    this.config  = {
      autoDetect:        true,
      smartFill:         true,
      aiAssistance:      true,
      templates:         true,
      useHistory:        true,   // blend historical values into fills
      trackCorrections:  true,   // monitor DOM for post-fill edits
      watchTimeout:      this.CONFIG_CONSTANTS.WATCH_TIMEOUT,
      useEventBus:       true,
      ...config
    };

    this.aiProcessor    = new AIContentProcessor();
    this.profileManager = new ProfileManager();
    this.history        = new ApplicationHistory();
    this.templateManager = new TemplateManager();
    this.exportManager = new ExportManager(this.profileManager, this.history, this.templateManager);

    // Scan / fill state
    this.lastScanResult      = null;
    this.lastScanTime        = 0;
    this.lastFillResults     = null;
    this.lastFillRecord      = null;
    this.activeProjectId     = null;
    this.intentScore         = null;

    // Watcher / retry
    this._watcher        = null;
    this._retryTimer     = null;
    this._retryAttempts  = 0;
    this._MAX_RETRIES    = this.CONFIG_CONSTANTS.MAX_RETRIES;
    this._RETRY_DELAYS   = this.CONFIG_CONSTANTS.RETRY_DELAYS;

    // Correction tracking
    this._correctionListeners = null;
    this._correctionObserver = null; // MutationObserver for DOM changes
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  async initialize() {
    console.log('[ApplicationWritingSkill] Initializing v' + this.version);

    await this.aiProcessor.initialize(this.config);
    await this.profileManager.initialize();
    await this.history.initialize();
    await this.templateManager.initialize();

    if (typeof window !== 'undefined' && window.document) {
      await this._verifyDependencies();
    }

    if (this.config.autoDetect) await this._startAutoDetect();

    console.log('[ApplicationWritingSkill] Ready');
  }

  async activate() {
    this.isActive = true;
    this._emit('skill:activated', { skill: this.name });
  }

  async deactivate() {
    this.isActive = false;
    this._stopWatcher();
    this._stopCorrectionTracking();
    this._emit('skill:deactivated', { skill: this.name });
  }

  // ─── Action handler ────────────────────────────────────────────────────────
  async handleAction(action, data, sender = null) {
    switch (action) {
      // ── Core ──────────────────────────────────────────────────────────────
      case 'getStatus':              return this.getStatus();
      case 'detectForms':            return this.detectForms();
      case 'fillForms':              return this.fillForms(data);
      case 'scanForms':              return this.scanForms();
      case 'previewFill':            return this.previewFill(data);
      case 'generateContent':        return this.generateContent(data);
      case 'getFormData':            return this.getFormData(data?.formId);
      case 'watchForForms':          return this._watchForLateFormRender();
      case 'stopWatcher':            this._stopWatcher(); return { stopped: true };
      case 'getIntent':              return this._getPageIntent();

      // ── Profile ────────────────────────────────────────────────────────────
      case 'saveProfile':            return this.saveCurrentProfile(data);
      case 'getProfiles':            return this.getProfiles();
      case 'setActiveProfile':       return this.setActiveProfile(data.profileId);
      case 'createProfileFromForm':  return this.createProfileFromForm(data.profileName);

      // ── History ────────────────────────────────────────────────────────────
      case 'getHistory':             return this.getHistory(data);
      case 'getSimilarApplications': return this.getSimilarApplications(data);
      case 'setProject':             return this.setProject(data.projectId);
      case 'renameProject':          return this.history.renameProject(data.projectId, data.name);
      case 'mergeProjects':          return this.history.mergeProjects(data.sourceId, data.targetId);
      case 'deleteProject':          return this.history.deleteProject(data.projectId);
      case 'deleteRecord':           return this.history.deleteRecord(data.recordId);
      case 'pinField':               return this.history.pinFieldValue(data.projectId, data.semanticType, data.value);
      case 'unpinField':             return this.history.unpinField(data.projectId, data.semanticType);
      case 'markCorrected':          return this.markFieldCorrected(data);
      case 'getProjectRecords':      return { records: this.history.getProjectRecords(data.projectId) };

      // ── Templates ─────────────────────────────────────────────────────────
      case 'saveTemplate':           return await this.saveTemplate(data);
      case 'applyTemplate':          return await this.applyTemplate(data?.templateId, data?.formData);
      case 'getTemplates':           return await this.getTemplates(data);
      case 'getTemplate':            return await this.getTemplate(data?.templateId);
      case 'deleteTemplate':         return await this.deleteTemplate(data?.templateId);
      case 'updateTemplate':         return await this.updateTemplate(data?.templateId, data);
      case 'exportTemplates':        return await this.exportTemplates(data?.templateIds);
      case 'importTemplates':        return await this.importTemplates(data?.importData, data?.overwrite);
      case 'getTemplateStats':        return this.getTemplateStats();

      // ── Export ────────────────────────────────────────────────────────────
      case 'exportProfiles':         return await this.exportProfiles(data);
      case 'exportHistory':          return await this.exportHistory(data);
      case 'exportTemplates':        return await this.exportTemplatesFromSkill(data);
      case 'exportFillData':         return await this.exportFillData(data);
      case 'exportAll':              return await this.exportAll(data);
      case 'downloadExport':         return await this.downloadExport(data);
      case 'downloadCSV':            return await this.downloadCSV(data);
      case 'getExportSummary':       return this.getExportSummary();

      // ── Context Menu ───────────────────────────────────────────────────────────
      case 'handleContextMenu':     return await this.handleContextMenu(data);

      default: throw new Error(`[ApplicationWritingSkill] Unknown action: ${action}`);
    }
  }

  // ─── Core: form detection ──────────────────────────────────────────────────
  async detectForms() {
    if (!window.FormScanner) {
      return { forms: [], hasForms: false };
    }

    try {
      const scanResult = window.FormScanner.scanWithContext
        ? window.FormScanner.scanWithContext()
        : window.FormScanner.scan();

      this.lastScanResult = scanResult;
      this.lastScanTime   = Date.now();
      const hasForms      = scanResult.fields.length > 0;

      let similarApplications = [];
      if (hasForms && this.config.useHistory) {
        similarApplications = this.history.getSimilarApplications(scanResult, 5);
      }

      if (hasForms) {
        this._emit('skill:formDetected', {
          fieldCount:          scanResult.fields.length,
          formType:            window.FormScanner.detectFormType?.(scanResult),
          intent:              scanResult.intent,
          similarApplications: similarApplications.map(s => ({
            projectId:   s.project.id,
            projectName: s.project.name,
            similarity:  s.similarity,
            lastFilled:  s.bestRecord?.filledAt,
          })),
        });
      }

      return {
        forms:               scanResult.fields,
        hasForms,
        scanResult,
        intent:              scanResult.intent || null,
        message:             scanResult.message || (hasForms ? `Found ${scanResult.fields.length} field(s)` : 'No forms found'),
        timestamp:           scanResult.timestamp,
        similarApplications,
      };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Form detection failed:', error);
      return { forms: [], hasForms: false, error: error.message };
    }
  }

  async scanForms() {
    const detectResult = await this.detectForms();
    if (!detectResult.hasForms) {
      return { ...detectResult, analysis: null, matches: [], profileAvailable: !!this.profileManager.getCurrentProfile() };
    }

    try {
      const analysis       = await this._analyzeFormRequirements(detectResult.scanResult);
      const currentProfile = this.profileManager.getCurrentProfile();
      let matches = [];
      if (currentProfile && window.FieldMatcher) {
        const mergedProfile = await this._mergeProfileWithHistory(currentProfile, detectResult.scanResult);
        matches = window.FieldMatcher.matchAll(mergedProfile, detectResult.scanResult);
      }

      return {
        ...detectResult,
        analysis,
        matches,
        profileAvailable: !!currentProfile,
        profileName:      currentProfile?.name || null,
        historyUsed:      this.config.useHistory,
      };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Form scan failed:', error);
      return { ...detectResult, error: error.message };
    }
  }

  // ─── Core: fill ────────────────────────────────────────────────────────────
  async fillForms(data = {}) {
    if (!window.FormFiller || !window.FieldMatcher) {
      throw new Error('[ApplicationWritingSkill] FormFiller or FieldMatcher not available');
    }

    try {
      const scanResult = this.lastScanResult || window.FormScanner.scan();
      if (scanResult.fields.length === 0) {
        return { success: false, message: 'No forms detected on this page' };
      }

      const baseProfile = data.profile || this.profileManager.getCurrentProfile();
      if (!baseProfile) {
        return { success: false, message: 'No active profile set' };
      }

      const mergedProfile = this.config.useHistory
        ? await this._mergeProfileWithHistory(baseProfile, scanResult)
        : baseProfile;

      const matches = window.FieldMatcher.matchAll(mergedProfile, scanResult);
      if (matches.length === 0) {
        return { success: false, message: 'No matching fields found for current profile' };
      }

      // AI content generation with historical context
      let generatedContent = null;
      if (this.config.aiAssistance && data.generateContent !== false) {
        const historicalContext = this.config.useHistory
          ? this.history.getBestHistoricalValues(scanResult, { projectId: this.activeProjectId })
          : {};

        generatedContent = await this.generateContent({
          formRequirements:   scanResult,
          userProfile:        mergedProfile,
          applicationType:    this._classifyFormType(scanResult.fields),
          historicalContext,
        });

        if (generatedContent?.content) {
          this._blendAIContent(mergedProfile, generatedContent.content, historicalContext);
        }
      }

      const fillResults = await window.FormFiller.fillAll(matches, {
        delayBetween: data.delayBetween || 150,
        highlight:    data.highlight !== false,
      });

      this.lastFillResults = fillResults;

      // Save to history
      if (this.config.useHistory) {
        const { record, project } = await this.history.recordFill({
          scanResult,
          fillResults,
          generatedContent,
          profile:     baseProfile,
          projectHint: data.projectHint || this.activeProjectId,
        });
        this.lastFillRecord  = record;
        this.activeProjectId = project.id;

        if (this.config.trackCorrections) {
          this._startCorrectionTracking(record.id, fillResults);
        }

        this._emit('skill:fillSaved', {
          recordId:    record.id,
          projectId:   project.id,
          projectName: project.name,
        });
      }

      const successful = fillResults.filter(r => r.filled).length;
      const failed     = fillResults.filter(r => !r.filled).length;

      return {
        success:     successful > 0,
        total:       fillResults.length,
        filled:      successful,
        failed,
        results:     fillResults,
        message:     `Filled ${successful} of ${fillResults.length} fields successfully`,
        recordId:    this.lastFillRecord?.id   || null,
        projectId:   this.activeProjectId      || null,
        projectName: this.history.getProject(this.activeProjectId)?.name || null,
      };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Form filling failed:', error);
      return { success: false, error: error.message };
    }
  }

  // ─── History-aware profile merge ───────────────────────────────────────────
  async _mergeProfileWithHistory(baseProfile, scanResult) {
    if (!this.config.useHistory) return baseProfile;

    const historical = this.history.getBestHistoricalValues(scanResult, {
      projectId: this.activeProjectId,
    });

    if (!Object.keys(historical).length) return baseProfile;

    const merged = { ...baseProfile };

    for (const [semanticType, hist] of Object.entries(historical)) {
      const profileHasValue = this._getNestedValue(baseProfile, semanticType);
      const shouldOverride  =
        !profileHasValue ||
        hist.source === 'pinned' ||
        (hist.corrected && hist.confidence > 0.7);

      if (shouldOverride) {
        merged[semanticType] = hist.value;
      }
    }

    return merged;
  }

  _blendAIContent(profile, aiContent, historicalContext) {
    for (const [key, value] of Object.entries(aiContent)) {
      const hist = historicalContext[key];
      if (hist?.corrected || hist?.source === 'pinned') continue;
      if (!profile[key]) profile[key] = value;
    }
  }

  _getNestedValue(obj, key) {
    if (obj[key] !== undefined && obj[key] !== '') return obj[key];
    for (const sub of Object.values(obj)) {
      if (sub && typeof sub === 'object' && sub[key] !== undefined && sub[key] !== '') return sub[key];
    }
    return null;
  }

  // ─── Correction tracking ───────────────────────────────────────────────────
  _startCorrectionTracking(recordId, fillResults) {
    this._stopCorrectionTracking();

    const filledEls = fillResults
      .filter(r => r.filled)
      .map(r => ({ 
        selector: this._getElementSelector(r.field?.el), 
        semanticType: r.field?.semanticType || r.key 
      }))
      .filter(r => r.selector);

    if (!filledEls.length) return;

    const debounceMap = new Map();

    const makeHandler = (selector, semanticType) => () => {
      clearTimeout(debounceMap.get(selector));
      debounceMap.set(selector, setTimeout(async () => {
        const el = this._getElementBySelector(selector);
        if (el) {
          const newValue = el.value || el.innerText || '';
          await this.history.markCorrected(recordId, semanticType, newValue);
          this._emit('history:correctionRecorded', { recordId, semanticType });
        }
      }, this.CONFIG_CONSTANTS.CORRECTION_DEBOUNCE));
    };

    // Store selectors instead of direct element references
    this._correctionListeners = filledEls.map(({ selector, semanticType }) => {
      const fn = makeHandler(selector, semanticType);
      const el = this._getElementBySelector(selector);
      if (el) {
        el.addEventListener('input', fn);
        el.addEventListener('change', fn);
      }
      return { selector, fn };
    });

    // Set up MutationObserver to detect if elements are removed/replaced
    this._correctionObserver = new MutationObserver(() => {
      this._refreshCorrectionListeners();
    });
    this._correctionObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id']
    });
  }

  _getElementSelector(el) {
    if (!el) return null;
    try {
      // Generate a stable selector for the element
      if (el.id) return `#${CSS.escape(el.id)}`;
      if (el.name) return `[name="${CSS.escape(el.name)}"]`;
      if (el.className) {
        const classes = el.className.split(' ').filter(c => c.length > 0);
        if (classes.length > 0) return `.${classes.map(c => CSS.escape(c)).join('.')}`;
      }
      // Fallback: use tag name + position
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(sibling => sibling.tagName === el.tagName);
        const index = siblings.indexOf(el);
        return `${el.tagName.toLowerCase()}:nth-child(${index + 1})`;
      }
      return el.tagName.toLowerCase();
    } catch (e) {
      return null;
    }
  }

  _getElementBySelector(selector) {
    if (!selector) return null;
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  _refreshCorrectionListeners() {
    if (!this._correctionListeners) return;

    // Refresh listeners for elements that might have been replaced
    this._correctionListeners.forEach(({ selector, fn }) => {
      const el = this._getElementBySelector(selector);
      if (el && !el.hasAttribute('data-suya-listening')) {
        el.setAttribute('data-suya-listening', 'true');
        el.addEventListener('input', fn);
        el.addEventListener('change', fn);
      }
    });
  }

  _stopCorrectionTracking() {
    // Remove event listeners
    (this._correctionListeners || []).forEach(({ selector, fn }) => {
      const el = this._getElementBySelector(selector);
      if (el) {
        try {
          el.removeEventListener('input', fn);
          el.removeEventListener('change', fn);
          el.removeAttribute('data-suya-listening');
        } catch (e) {
          // Element might be detached, ignore
        }
      }
    });
    
    // Disconnect MutationObserver
    if (this._correctionObserver) {
      this._correctionObserver.disconnect();
      this._correctionObserver = null;
    }
    
    this._correctionListeners = null;
  }

  async markFieldCorrected({ recordId, semanticType, value }) {
    if (!recordId) recordId = this.lastFillRecord?.id;
    if (!recordId) return { success: false, error: 'No active record' };
    await this.history.markCorrected(recordId, semanticType, value);
    return { success: true };
  }

  // ─── History actions ───────────────────────────────────────────────────────
  async getHistory(data = {}) {
    const { projectId, limit = 20, offset = 0 } = data;

    if (projectId) {
      const records = this.history.getProjectRecords(projectId).slice(offset, offset + limit);
      return {
        project: this.history.getProject(projectId),
        records,
        total:   this.history.getProject(projectId)?.recordIds.length || 0,
      };
    }

    return {
      projects:        this.history.getAllProjects(),
      stats:           this.history.getStats(),
      activeProjectId: this.activeProjectId,
    };
  }

  async getSimilarApplications(data = {}) {
    const scanResult = this.lastScanResult || null;
    const similar    = this.history.getSimilarApplications(scanResult, data.limit || 5);
    return {
      similar: similar.map(s => ({
        projectId:    s.project.id,
        projectName:  s.project.name,
        projectType:  s.project.type,
        similarity:   Math.round(s.similarity * 100),
        recordCount:  s.project.recordIds.length,
        lastFilled:   s.bestRecord?.filledAt,
        pinnedFields: s.project.pinnedFields,
        sample:       this._summariseRecord(s.bestRecord),
      })),
    };
  }

  async setProject(projectId) {
    const proj = this.history.getProject(projectId);
    if (!proj && projectId !== null) return { success: false, error: 'Project not found' };
    this.activeProjectId = projectId;
    this._emit('skill:projectChanged', { projectId, projectName: proj?.name });
    return { success: true, project: proj };
  }

  _summariseRecord(record) {
    if (!record) return null;
    const textFields = (record.fields || [])
      .filter(f => ['message','bio','whyAttend','whyWorkHere'].includes(f.semanticType) && f.value)
      .map(f => ({ semanticType: f.semanticType, preview: String(f.value).slice(0, 120) }));
    return {
      formType:   record.formType,
      filledAt:   record.filledAt,
      fieldCount: record.fields?.length || 0,
      textFields,
    };
  }

  // ─── Preview ───────────────────────────────────────────────────────────────
  async previewFill(data = {}) {
    const scanResult  = this.lastScanResult || window.FormScanner.scan();
    const baseProfile = data.profile || this.profileManager.getCurrentProfile();
    if (!baseProfile) return { success: false, message: 'No active profile set' };

    const mergedProfile = this.config.useHistory
      ? await this._mergeProfileWithHistory(baseProfile, scanResult)
      : baseProfile;

    const matches     = window.FieldMatcher.matchAll(mergedProfile, scanResult);
    const historical  = this.config.useHistory
      ? this.history.getBestHistoricalValues(scanResult, { projectId: this.activeProjectId })
      : {};

    return {
      success: true,
      preview: true,
      matches: matches.map(m => {
        const hist = historical[m.field?.semanticType];
        return {
          field:                m.field.primaryLabel || m.field.name,
          semanticType:         m.field?.semanticType,
          value:                m.value,
          confidence:           m.score,
          type:                 m.field.inputClass,
          source:               hist ? hist.source : 'profile',
          historicalConfidence: hist?.confidence,
        };
      }),
      total:          matches.length,
      historyEntries: Object.keys(historical).length,
      activeProject:  this.history.getProject(this.activeProjectId)?.name || null,
    };
  }

  // ─── Profile actions ───────────────────────────────────────────────────────
  async saveCurrentProfile(data = {}) {
    const profile = data.profile || this.profileManager.getCurrentProfile();
    if (!profile) return { success: false, message: 'No profile to save' };
    return this.profileManager.saveProfile(profile);
  }

  async createProfileFromForm(profileName) { return this.profileManager.createProfileFromForm(profileName); }
  async generateContent(data)              { return this.aiProcessor.generateContent(data); }
  async getProfiles()                      { return { profiles: this.profileManager.getAllProfiles(), activeProfile: this.profileManager.getCurrentProfile() }; }
  async setActiveProfile(profileId)        { return this.profileManager.setActiveProfile(profileId); }
  async getFormData(formId)                { const scan = this.lastScanResult || window.FormScanner?.scan(); return { success: !!scan, scan: scan || null }; }

  // ─── Template methods ─────────────────────────────────────────────────────
  async saveTemplate(data) {
    try {
      const template = await this.templateManager.saveTemplate(data);
      this._emit('template:saved', { template });
      return { success: true, template, message: `Template "${template.name}" saved successfully` };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Save template error:', error);
      return { success: false, error: error.message };
    }
  }

  async applyTemplate(templateId, formData = {}) {
    try {
      const result = await this.templateManager.applyTemplate(templateId, formData);
      this._emit('template:applied', { templateId, result });
      return { success: true, ...result, message: `Template "${result.template.name}" applied successfully` };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Apply template error:', error);
      return { success: false, error: error.message };
    }
  }

  async getTemplates(data) {
    try {
      const { category, search } = data || {};
      let templates;

      if (category) {
        templates = this.templateManager.getTemplatesByCategory(category);
      } else if (search) {
        templates = this.templateManager.searchTemplates(search);
      } else {
        templates = this.templateManager.getAllTemplates();
      }

      return { success: true, templates, categories: this.templateManager.getTemplateCategories() };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Get templates error:', error);
      return { success: false, error: error.message };
    }
  }

  async getTemplate(templateId) {
    try {
      const template = this.templateManager.getTemplate(templateId);
      if (!template) {
        return { success: false, error: 'Template not found' };
      }
      return { success: true, template };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Get template error:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteTemplate(templateId) {
    try {
      const template = await this.templateManager.deleteTemplate(templateId);
      this._emit('template:deleted', { templateId, template });
      return { success: true, template, message: `Template "${template.name}" deleted successfully` };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Delete template error:', error);
      return { success: false, error: error.message };
    }
  }

  async updateTemplate(templateId, updates) {
    try {
      const template = await this.templateManager.updateTemplate(templateId, updates);
      this._emit('template:updated', { templateId, template });
      return { success: true, template, message: `Template "${template.name}" updated successfully` };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Update template error:', error);
      return { success: false, error: error.message };
    }
  }

  async exportTemplates(templateIds) {
    try {
      const exportData = await this.templateManager.exportTemplates(templateIds);
      return { success: true, exportData, message: `Exported ${exportData.count} templates` };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Export templates error:', error);
      return { success: false, error: error.message };
    }
  }

  async importTemplates(importData, overwrite = false) {
    try {
      const results = await this.templateManager.importTemplates(importData, overwrite);
      this._emit('templates:imported', { results });
      return { 
        success: true, 
        results, 
        message: `Imported ${results.imported} templates, skipped ${results.skipped}, ${results.errors.length} errors` 
      };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Import templates error:', error);
      return { success: false, error: error.message };
    }
  }

  getTemplateStats() {
    try {
      const stats = this.templateManager.getTemplateStats();
      return { success: true, stats };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Get template stats error:', error);
      return { success: false, error: error.message };
    }
  }

  // ─── Export methods ─────────────────────────────────────────────────────
  async exportProfiles(data) {
    try {
      const exportData = await this.exportManager.exportProfiles(data?.profileIds);
      return { success: true, exportData, message: `Exported ${exportData.count} profiles` };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Export profiles error:', error);
      return { success: false, error: error.message };
    }
  }

  async exportHistory(data) {
    try {
      const exportData = await this.exportManager.exportHistory(data);
      return { success: true, exportData, message: `Exported ${exportData.count} history records` };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Export history error:', error);
      return { success: false, error: error.message };
    }
  }

  async exportTemplatesFromSkill(data) {
    try {
      const exportData = await this.exportManager.exportTemplates(data?.templateIds);
      return { success: true, exportData, message: `Exported ${exportData.count} templates` };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Export templates error:', error);
      return { success: false, error: error.message };
    }
  }

  async exportFillData(data) {
    try {
      const exportData = await this.exportManager.exportFillData(data?.sessionId);
      return { success: true, exportData, message: `Exported ${exportData.count} fill records` };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Export fill data error:', error);
      return { success: false, error: error.message };
    }
  }

  async exportAll(data) {
    try {
      const exportData = await this.exportManager.exportAll(data);
      const totalItems = Object.values(exportData.data).reduce((sum, item) => sum + (item.count || 0), 0);
      return { success: true, exportData, message: `Exported ${totalItems} total items` };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Export all error:', error);
      return { success: false, error: error.message };
    }
  }

  async downloadExport(data) {
    try {
      const { exportData, filename } = data;
      const result = await this.exportManager.downloadFile(exportData, filename);
      return { success: true, ...result };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Download export error:', error);
      return { success: false, error: error.message };
    }
  }

  async downloadCSV(data) {
    try {
      const { exportData, type } = data;
      const result = await this.exportManager.generateCSVExport(exportData, type);
      return { success: true, ...result };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Download CSV error:', error);
      return { success: false, error: error.message };
    }
  }

  getExportSummary() {
    try {
      const summary = this.exportManager.getExportSummary();
      return { success: true, summary };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Get export summary error:', error);
      return { success: false, error: error.message };
    }
  }

  // ─── Context Menu methods ─────────────────────────────────────────────────────
  async handleContextMenu(data) {
    try {
      const { menuItemId, tab } = data;
      
      switch (menuItemId) {
        case 'application-writing-fill-form':
          return await this.fillFormsFromContextMenu(tab);
        case 'application-writing-scan-form':
          return await this.scanFormsFromContextMenu(tab);
        case 'application-writing-save-profile':
          return await this.saveProfileFromContextMenu(tab);
        case 'application-writing-preview-fill':
          return await this.previewFillFromContextMenu(tab);
        default:
          return { success: false, error: 'Unknown context menu action' };
      }
    } catch (error) {
      console.error('[ApplicationWritingSkill] Context menu error:', error);
      return { success: false, error: error.message };
    }
  }

  async fillFormsFromContextMenu(tab) {
    try {
      // Send message to content script to fill forms
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'suya-popup-command',
        command: 'fill-forms'
      });
      
      return { success: true, message: 'Form filling initiated from context menu' };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Fill forms from context menu error:', error);
      return { success: false, error: error.message };
    }
  }

  async scanFormsFromContextMenu(tab) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'suya-popup-command',
        command: 'scan-forms'
      });
      
      return { success: true, message: 'Form scanning initiated from context menu' };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Scan forms from context menu error:', error);
      return { success: false, error: error.message };
    }
  }

  async saveProfileFromContextMenu(tab) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'suya-popup-command',
        command: 'save-profile'
      });
      
      return { success: true, message: 'Profile saving initiated from context menu' };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Save profile from context menu error:', error);
      return { success: false, error: error.message };
    }
  }

  async previewFillFromContextMenu(tab) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'suya-popup-command',
        command: 'preview-fill'
      });
      
      return { success: true, message: 'Fill preview initiated from context menu' };
    } catch (error) {
      console.error('[ApplicationWritingSkill] Preview fill from context menu error:', error);
      return { success: false, error: error.message };
    }
  }

  // ─── Status ────────────────────────────────────────────────────────────────
  async getStatus() {
    return {
      active:              this.isActive,
      version:             this.version,
      detectedForms:       this.lastScanResult?.fields?.length || 0,
      hasForms:            (this.lastScanResult?.fields?.length || 0) > 0,
      lastScanAge:         this.lastScanTime ? Date.now() - this.lastScanTime : null,
      watching:            !!this._watcher,
      retryAttempts:       this._retryAttempts,
      trackingCorrections: !!this._correctionListeners,
      intent:              this.intentScore || this._getPageIntent(),
      activeProjectId:     this.activeProjectId,
      activeProject:       this.history.getProject(this.activeProjectId)?.name || null,
      lastRecord:          this.lastFillRecord?.id || null,
      features:            this.config,
      profileStats:        this.profileManager.getProfileStats(),
      histStats:           this.history.getStats(),
      components: {
        formScanner:  !!window.FormScanner,
        fieldMatcher: !!window.FieldMatcher,
        formFiller:   !!window.FormFiller,
        domUtils:     !!window.DomUtils,
        fuzzyMatch:   !!window.FuzzyMatch,
      },
    };
  }

  // ─── Auto-detect ───────────────────────────────────────────────────────────
  async _startAutoDetect() {
    const intent = this._getPageIntent();
    this.intentScore = intent;
    if (intent.score < this.CONFIG_CONSTANTS.FORM_INTENT_THRESHOLD) {
      this._emit('skill:noForm', { reason: 'low-intent', score: intent.score });
      return;
    }
    this._scheduleRetry(0);
    this._watchForLateFormRender();
  }

  _scheduleRetry(attempt) {
    if (attempt >= this._MAX_RETRIES) return;
    
    // Clear existing timer to prevent race conditions
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    
    this._retryTimer = setTimeout(async () => {
      this._retryAttempts = attempt + 1;
      try {
        const result = await this.detectForms();
        if (result.hasForms) {
          this._stopWatcher();
          this._emit('skill:formReady', { fieldCount: result.forms.length, attempt: attempt + 1, via: 'retry' });
        } else {
          this._scheduleRetry(attempt + 1);
        }
      } catch (error) {
        console.error('[ApplicationWritingSkill] Retry attempt failed:', error);
        this._scheduleRetry(attempt + 1);
      }
    }, this._RETRY_DELAYS[attempt] || 10000);
  }

  _watchForLateFormRender() {
    if (!window.FormScanner?.watchForForms) {
      if (window.DomUtils?.observeForInputs) {
        this._watcher = window.DomUtils.observeForInputs((el) => {
          if (el) {
            clearTimeout(this._retryTimer);
            this.detectForms().then(r => {
              this._emit('skill:formReady', { fieldCount: r.forms.length, via: 'observer' });
            }).catch(error => {
              console.error('[ApplicationWritingSkill] Observer form detection failed:', error);
            });
          }
        }, { timeout: this.config.watchTimeout });
      }
      return;
    }
    this._stopWatcher();
    this._watcher = window.FormScanner.watchForForms(
      (scanResult) => {
        if (scanResult.fields.length > 0) {
          clearTimeout(this._retryTimer);
          this.lastScanResult = scanResult;
          this.lastScanTime   = Date.now();
          this._emit('skill:formReady', { fieldCount: scanResult.fields.length, via: 'observer' });
        }
      },
      { timeout: this.config.watchTimeout, debounceMs: 350, minFields: 1, invokeNow: true }
    );
  }

  _stopWatcher() {
    this._watcher?.stop?.();
    this._watcher = null;
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  async _verifyDependencies() {
    const required = ['FormScanner','FieldMatcher','FormFiller','DomUtils','FuzzyMatch'];
    const missing  = required.filter(n => !window[n]);
    if (missing.length) console.warn('[ApplicationWritingSkill] Missing dependencies:', missing);
    return !missing.length;
  }

  async _analyzeFormRequirements(scanResult) {
    const analysis = {
      formType: this._classifyFormType(scanResult.fields),
      complexity: this._calculateComplexity(scanResult.fields),
      requirements: [], estimatedTime: 500 + scanResult.fields.length * 150,
      hasMessageField: false, hasFileUpload: false, hasRichText: false,
    };
    for (const f of scanResult.fields) {
      if (f.required) analysis.requirements.push(f.primaryLabel);
      if (['message','bio'].includes(f.semanticType)) analysis.hasMessageField = true;
      if (f.semanticType === 'file')   analysis.hasFileUpload = true;
      if (f.inputClass  === 'richText') analysis.hasRichText  = true;
    }
    return analysis;
  }

  _classifyFormType(fields) {
    if (!fields?.length) return 'unknown';
    const text = fields.map(f => (f.labels?.join(' ') || '') + ' ' + (f.name || '') + ' ' + (f.id || '')).join(' ').toLowerCase();
    if (/job|employment|position|resume|cv/.test(text))            return 'job_application';
    if (/grant|funding|proposal/.test(text))                       return 'grant_application';
    if (/rsvp|attend|register|event|cohort|accelerator/.test(text)) return 'event_registration';
    if (/application|apply/.test(text))                            return 'application';
    return 'general_form';
  }

  _calculateComplexity(fields) {
    const n = fields.reduce((acc, f) =>
      acc + 1 + (f.required ? 2 : 0) + (f.inputClass === 'richText' ? 3 : 0) +
      (f.inputClass === 'select' ? 1 : 0) + (f.inputClass === 'file' ? 2 : 0) +
      (f.isCustomDropdown ? 2 : 0), 0);
    return n < 5 ? 'simple' : n < 15 ? 'moderate' : 'complex';
  }

  _getPageIntent() {
    if (window.FormScanner?.getPageFormIntent) return window.FormScanner.getPageFormIntent();
    const score = /\/forms?\/|\/rsvp|\/register|\/apply|typeform\.com|forms\.gle/.test(window.location.href.toLowerCase()) ? 0.6 : 0.1;
    return { score, isLikelyFormPage: score >= 0.4, signals: [], isSPA: false };
  }

  _emit(eventName, detail = {}) {
    if (!this.config.useEventBus) return;
    try { window.dispatchEvent(new CustomEvent(eventName, { detail: { skill: this.name, ...detail }, bubbles: true })); } catch {}
  }

  getVersion()      { return this.version; }
  getName()         { return this.name; }
  isActiveStatus()  { return this.isActive; }
  getDependencies() { return ['server-skills']; }
}

export { ApplicationWritingSkill };
