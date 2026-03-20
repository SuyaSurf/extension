/**
 * Enhanced Application Writing Skill
 * Advanced form detection, intelligent field matching, and AI-powered content generation
 */
import { AIContentProcessor } from './ai-processor.js';
import { ProfileManager } from './profile-manager.js';

class ApplicationWritingSkill {
  constructor(config = {}) {
    this.name = 'application-writing';
    this.version = '2.0.0';
    this.isActive = false;
    this.config = {
      autoDetect: true,
      smartFill: true,
      aiAssistance: true,
      templates: true,
      ...config
    };
    
    // Core components
    this.aiProcessor = new AIContentProcessor();
    this.profileManager = new ProfileManager();
    
    // Form scanning state
    this.lastScanResult = null;
    this.lastScanTime = 0;
    this.scanCache = new Map();
  }

  async initialize() {
    console.log('Initializing Enhanced Application Writing Skill...');
    
    // Initialize components
    await this.aiProcessor.initialize(this.config);
    await this.profileManager.initialize();
    
    // Load formfiller dependencies if in content script context
    if (typeof window !== 'undefined' && window.document) {
      await this.loadFormFillerDependencies();
    }
    
    // Auto-scan if enabled
    if (this.config.autoDetect) {
      setTimeout(() => this.detectForms(), 1000);
    }
    
    console.log('Enhanced Application Writing Skill initialized');
  }

  async activate() {
    this.isActive = true;
    console.log('Application Writing Skill activated');
  }

  async deactivate() {
    this.isActive = false;
    console.log('Application Writing Skill deactivated');
  }

  async handleAction(action, data, sender = null) {
    switch (action) {
      case 'getStatus':
        return await this.getStatus();
      case 'detectForms':
        return await this.detectForms();
      case 'fillForms':
        return await this.fillForms(data);
      case 'scanForms':
        return await this.scanForms();
      case 'saveProfile':
        return await this.saveCurrentProfile(data);
      case 'previewFill':
        return await this.previewFill(data);
      case 'getProfiles':
        return await this.getProfiles();
      case 'setActiveProfile':
        return await this.setActiveProfile(data.profileId);
      case 'createProfileFromForm':
        return await this.createProfileFromForm(data.profileName);
      case 'generateContent':
        return await this.generateContent(data);
      case 'getFormData':
        return await this.getFormData(data.formId);
      case 'saveTemplate':
        return await this.saveTemplate(data);
      case 'applyTemplate':
        return await this.applyTemplate(data.templateId);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async detectForms() {
    if (!window.FormScanner) {
      console.warn('FormScanner not available');
      return { forms: [], hasForms: false };
    }

    try {
      const scanResult = window.FormScanner.scan();
      this.lastScanResult = scanResult;
      this.lastScanTime = Date.now();
      
      return {
        forms: scanResult.fields,
        hasForms: scanResult.fields.length > 0,
        scanResult,
        timestamp: scanResult.timestamp
      };
    } catch (error) {
      console.error('Form detection failed:', error);
      return { forms: [], hasForms: false, error: error.message };
    }
  }

  async scanForms() {
    // Deep scan with AI analysis
    const detectResult = await this.detectForms();
    
    if (!detectResult.hasForms) {
      return detectResult;
    }

    try {
      // Analyze form types and requirements
      const analysis = await this.analyzeFormRequirements(detectResult.scanResult);
      
      // Get current profile for matching
      const currentProfile = this.profileManager.getCurrentProfile();
      
      // Perform intelligent field matching
      let matches = [];
      if (currentProfile) {
        matches = window.FieldMatcher.matchAll(currentProfile, detectResult.scanResult);
      }
      
      return {
        ...detectResult,
        analysis,
        matches,
        profileAvailable: !!currentProfile,
        profileName: currentProfile?.name || null
      };
    } catch (error) {
      console.error('Form scan failed:', error);
      return { ...detectResult, error: error.message };
    }
  }

  async fillForms(data = {}) {
    if (!window.FormFiller || !window.FieldMatcher) {
      throw new Error('Form filling components not available');
    }

    try {
      // Get current scan or perform new scan
      const scanResult = this.lastScanResult || window.FormScanner.scan();
      
      if (scanResult.fields.length === 0) {
        return { success: false, message: 'No forms detected on this page' };
      }

      // Get profile to use
      const profile = data.profile || this.profileManager.getCurrentProfile();
      if (!profile) {
        return { success: false, message: 'No active profile set' };
      }

      // Find matches between profile and form fields
      const matches = window.FieldMatcher.matchAll(profile, scanResult);
      
      if (matches.length === 0) {
        return { success: false, message: 'No matching fields found for current profile' };
      }

      // Generate AI content if enabled
      if (this.config.aiAssistance && data.generateContent) {
        const aiContent = await this.generateContent({
          formRequirements: scanResult,
          userProfile: profile,
          applicationType: this.classifyFormType(scanResult.fields)
        });
        
        // Merge AI-generated content with profile
        if (aiContent.content) {
          Object.assign(profile, aiContent.content);
        }
      }

      // Fill the form
      const fillResults = await window.FormFiller.fillAll(matches, {
        delayBetween: data.delayBetween || 150,
        highlight: data.highlight !== false
      });

      const successful = fillResults.filter(r => r.filled).length;
      const failed = fillResults.filter(r => !r.filled).length;

      return {
        success: successful > 0,
        total: fillResults.length,
        filled: successful,
        failed,
        results: fillResults,
        message: `Filled ${successful} of ${fillResults.length} fields successfully`
      };
    } catch (error) {
      console.error('Form filling failed:', error);
      return { success: false, error: error.message };
    }
  }

  async previewFill(data = {}) {
    // Similar to fillForms but only shows what would be filled
    const scanResult = this.lastScanResult || window.FormScanner.scan();
    const profile = data.profile || this.profileManager.getCurrentProfile();
    
    if (!profile) {
      return { success: false, message: 'No active profile set' };
    }

    const matches = window.FieldMatcher.matchAll(profile, scanResult);
    
    return {
      success: true,
      preview: true,
      matches: matches.map(m => ({
        field: m.field.primaryLabel || m.field.name,
        value: m.value,
        confidence: m.score,
        type: m.field.inputClass
      })),
      total: matches.length
    };
  }

  async saveCurrentProfile(data = {}) {
    const profile = data.profile || this.profileManager.getCurrentProfile();
    if (!profile) {
      return { success: false, message: 'No profile to save' };
    }

    return await this.profileManager.saveProfile(profile);
  }

  async createProfileFromForm(profileName) {
    return await this.profileManager.createProfileFromForm(profileName);
  }

  async generateContent(data) {
    return await this.aiProcessor.generateContent(data);
  }

  async getProfiles() {
    return {
      profiles: this.profileManager.getAllProfiles(),
      activeProfile: this.profileManager.getCurrentProfile()
    };
  }

  async setActiveProfile(profileId) {
    return await this.profileManager.setActiveProfile(profileId);
  }

  async saveTemplate(data) {
    console.log('Saving template:', data);
    const templateId = Date.now().toString();
    
    return { success: true, templateId, message: 'Template saved' };
  }

  async applyTemplate(templateId) {
    console.log('Applying template:', templateId);
    return { success: true, templateId, message: 'Template applied' };
  }

  async getStatus() {
    const profileStats = this.profileManager.getProfileStats();
    const scanAge = this.lastScanTime ? Date.now() - this.lastScanTime : null;
    
    return {
      active: this.isActive,
      version: this.version,
      detectedForms: this.lastScanResult?.fields?.length || 0,
      hasForms: (this.lastScanResult?.fields?.length || 0) > 0,
      lastScanAge: scanAge,
      features: this.config,
      profileStats,
      components: {
        formScanner: !!window.FormScanner,
        fieldMatcher: !!window.FieldMatcher,
        formFiller: !!window.FormFiller,
        domUtils: !!window.DomUtils,
        fuzzyMatch: !!window.FuzzyMatch
      }
    };
  }

  // Helper methods
  async loadFormFillerDependencies() {
    // Dependencies should be loaded by the content script
    // This is just a verification method
    const required = ['FormScanner', 'FieldMatcher', 'FormFiller', 'DomUtils', 'FuzzyMatch'];
    const missing = required.filter(name => !window[name]);
    
    if (missing.length > 0) {
      console.warn('Missing formfiller dependencies:', missing);
      return false;
    }
    
    return true;
  }

  async analyzeFormRequirements(scanResult) {
    const analysis = {
      formType: this.classifyFormType(scanResult.fields),
      complexity: this.calculateComplexity(scanResult.fields),
      requirements: [],
      estimatedTime: this.estimateFillTime(scanResult.fields)
    };

    // Identify specific requirements
    scanResult.fields.forEach(field => {
      if (field.required) analysis.requirements.push(field.primaryLabel);
      if (field.semanticType === 'message') analysis.hasMessageField = true;
      if (field.semanticType === 'file') analysis.hasFileUpload = true;
      if (field.inputClass === 'richText') analysis.hasRichText = true;
    });

    return analysis;
  }

  classifyFormType(fields) {
    const fieldText = fields.map(f => f.labels?.join(' ') + ' ' + f.name + ' ' + f.id).join(' ').toLowerCase();
    
    if (fieldText.includes('job') || fieldText.includes('employment') || fieldText.includes('position')) {
      return 'job_application';
    }
    if (fieldText.includes('grant') || fieldText.includes('funding') || fieldText.includes('proposal')) {
      return 'grant_application';
    }
    if (fieldText.includes('application') || fieldText.includes('apply')) {
      return 'application';
    }
    
    return 'general_form';
  }

  calculateComplexity(fields) {
    let complexity = 0;
    
    fields.forEach(field => {
      if (field.required) complexity += 2;
      if (field.inputClass === 'richText') complexity += 3;
      if (field.inputClass === 'select') complexity += 1;
      if (field.inputClass === 'file') complexity += 2;
      if (field.isCustomDropdown) complexity += 2;
      complexity += 1;
    });
    
    if (complexity < 5) return 'simple';
    if (complexity < 15) return 'moderate';
    return 'complex';
  }

  estimateFillTime(fields) {
    const baseTime = 500; // Base time in ms
    const perFieldTime = 150;
    return baseTime + (fields.length * perFieldTime);
  }

  getVersion() { return this.version; }
  getName() { return this.name; }
  isActiveStatus() { return this.isActive; }
  getDependencies() { return ['server-skills']; }
}

export { ApplicationWritingSkill };
