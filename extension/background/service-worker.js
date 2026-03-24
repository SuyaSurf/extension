/**
 * Main Service Worker for AI Bot Extension
 * Implements event-driven architecture with skill registry and cross-skill communication
 */

import { SkillRegistry } from './skill-registry.js';
import { EventBus } from './event-bus.js';
import { StorageManager } from '../shared/storage/storage-manager.js';
import { VoiceInterface } from '../shared/voice-interface/voice-interface.js';
import { TaskScheduler } from '../shared/utils/task-scheduler.js';
import { PerformanceMonitor } from '../shared/utils/performance-monitor.js';
import { SecurityManager } from '../shared/security/security-manager.js';
import { ErrorHandler } from '../shared/utils/error-handler.js';
import { notificationAggregator } from './notification-aggregator.js';
import { ContextMenuHandler } from './context-menu.js';

class ExtensionServiceWorker {
  constructor() {
    this.skillRegistry = new SkillRegistry();
    this.eventBus = new EventBus();
    this.storageManager = new StorageManager();
    this.voiceInterface = new VoiceInterface();
    this.taskScheduler = new TaskScheduler();
    this.performanceMonitor = new PerformanceMonitor();
    this.securityManager = new SecurityManager();
    this.errorHandler = new ErrorHandler();
    this.contextMenuHandler = new ContextMenuHandler();
    
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('Initializing AI Bot Extension Service Worker...');
      
      // Initialize core components
      await this.storageManager.initialize();
      await this.securityManager.initialize();
      await this.voiceInterface.initialize();
      await this.taskScheduler.initialize();
      await this.performanceMonitor.initialize();
      await this.eventBus.initialize();
      
      // Set up error handler with audit logger
      this.errorHandler.setAuditLogger(this.securityManager);
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Register all skills
      await this.skillRegistry.registerAllSkills();
      
      // Initialize context menu
      await this.contextMenuHandler.initialize();
      
      // Initialize event bus with skill registry
      this.eventBus.setSkillRegistry(this.skillRegistry);
      
      this.isInitialized = true;
      console.log('AI Bot Extension initialized successfully');
      
      // Send initialization complete event
      this.eventBus.emit('extension-initialized', {
        timestamp: Date.now(),
        version: chrome.runtime.getManifest().version
      });
      
    } catch (error) {
      console.error('Failed to initialize extension:', error);
      this.handleInitializationError(error);
    }
  }

  setupEventListeners() {
    // Extension installation/update
    chrome.runtime.onInstalled.addListener(this.handleInstall.bind(this));
    
    // Extension startup
    chrome.runtime.onStartup.addListener(this.handleStartup.bind(this));
    
    // Message handling
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    
    // Alarm handling for scheduled tasks
    chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
    
    // Tab updates for content script coordination
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    
    // Tab creation for content script injection
    chrome.tabs.onCreated.addListener(this.handleTabCreated.bind(this));
    
    // Context menu clicks
    chrome.contextMenus.onClicked.addListener(this.handleContextMenu.bind(this));
    
    // Storage changes
    chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
    
    // Quick actions from new-tab
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      switch (msg.type) {
        case 'START_DAILY_BRIEFING':
          this.handleDailyBriefing(sender).then(sendResponse);
          return true;

        case 'FILL_CURRENT_FORM':
          this.injectFormFiller(sender).then(sendResponse);
          return true;

        case 'ANALYZE_CURRENT_PAGE':
          this.injectPageAnalyzer(sender).then(sendResponse);
          return true;

        case 'START_VOICE':
          this.toggleVoiceOnActiveTab().then(sendResponse);
          return true;

        case 'SKILL_GAP_ANALYSIS':
          this.openSkillGapTab().then(sendResponse);
          return true;

        case 'SHOW_TRENDING':
          this.fetchTrending().then(sendResponse);
          return true;

        case 'store-api-key':
          this.handleStoreApiKey(msg.payload).then(sendResponse);
          return true;

        case 'remove-api-key':
          this.handleRemoveApiKey(msg.payload).then(sendResponse);
          return true;

        case 'open-review-scheduler':
          chrome.tabs.create({ 
            url: chrome.runtime.getURL('ui/review-scheduler.html'),
            active: true 
          }).then(tab => {
            sendResponse({ success: true, tabId: tab.id });
          }).catch(error => {
            sendResponse({ success: false, error: error.message });
          });
          return true;

        case 'MEETING_MEETING_STARTED':
          chrome.action.setBadgeText({ text: '🔴' });
          chrome.action.setBadgeBackgroundColor({ color: '#FF4444' });
          sendResponse({ ok: true });
          break;

        case 'MEETING_MEETING_SUMMARY_READY':
          chrome.action.setBadgeText({ text: '' });
          chrome.storage.local.set({ lastMeetingSummary: msg.summary });
          sendResponse({ ok: true });
          break;

        case 'BRAIN_GET_DECISIONS':
          this.getBrainDecisions(msg.payload).then(sendResponse);
          return true;

        case 'BRAIN_GET_RECOMMENDATIONS':
          this.getBrainRecommendations().then(sendResponse);
          return true;
      }
    });
  }

  /**
   * Get contextual decisions from the UserBrain for the current URL/context.
   */
  async getBrainDecisions(payload) {
    try {
      const brainSkill = this.skillRegistry.getSkill('user-brain');
      if (!brainSkill) return { ok: false, error: 'UserBrain skill not loaded' };

      const result = payload?.url
        ? await brainSkill.handleAction('decide-for-url', { url: payload.url, topK: payload.topK || 5 })
        : await brainSkill.handleAction('decide', { context: payload?.context, topK: payload?.topK || 5 });

      return { ok: true, data: result };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  /**
   * Get user recommendations (interests, content, skills) from the UserBrain.
   */
  async getBrainRecommendations() {
    try {
      const brainSkill = this.skillRegistry.getSkill('user-brain');
      if (!brainSkill) return { ok: false, error: 'UserBrain skill not loaded' };

      const result = await brainSkill.handleAction('get-recommendations', { topK: 10 });
      return { ok: true, data: result };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async handleInstall(details) {
    console.log('Extension installed:', details.reason);
    
    if (details.reason === 'install') {
      // Clear any stale onboarding flag
      await chrome.storage.sync.remove('hasSeenOnboarding');

      // Open the new-tab page — React will show OnboardingFlow
      // because hasSeenOnboarding is not set yet
      chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });

      // Initialise aggregator (polls will be no-ops until keys/perms are set)
      await notificationAggregator.init();

      console.log('[Suya] Fresh install — onboarding opened.');
    } else if (details.reason === 'update') {
      // Re-init aggregator so new alarms are registered
      await notificationAggregator.init();

      // Optional: show a "what's new" badge on the extension icon
      chrome.action.setBadgeText({ text: '✨' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF6B35' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 8000);
    }
    
    // Create context menus
    await this.createContextMenus();
  }

  async handleStartup() {
    console.log('Extension startup');
    
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Restart any background tasks
    await this.taskScheduler.restoreScheduledTasks();
    
    // Re-init notification aggregator
    await notificationAggregator.init();
  }

  async handleMessage(request, sender, sendResponse) {
    const startTime = performance.now();
    
    try {
      // Validate message structure
      if (!request || typeof request !== 'object') {
        throw new Error('Invalid message format');
      }
      
      const { action, skill, data, messageId } = request;
      
      if (!action || !skill) {
        throw new Error('Missing required fields: action and skill');
      }
      
      // Log message for security audit
      await this.securityManager.auditLogger.log('message_received', {
        action,
        skill,
        sender: sender.id,
        timestamp: Date.now()
      });
      
      // Process request
      const result = await this.processRequest(request, sender);
      
      // Send response
      if (sendResponse && typeof sendResponse === 'function') {
        sendResponse({
          success: true,
          data: result,
          messageId: messageId || null
        });
      }
      
      // Track performance
      this.performanceMonitor.trackOperation(
        `message_${skill}_${action}`,
        performance.now() - startTime
      );
      
      return true; // Keep message channel open for async response
      
    } catch (error) {
      console.error('Error handling message:', error);
      
      if (sendResponse && typeof sendResponse === 'function') {
        sendResponse({
          success: false,
          error: error.message,
          messageId: request.messageId || null
        });
      }
      
      // Log error for security audit
      await this.securityManager.auditLogger.log('message_error', {
        error: error.message,
        request: request,
        timestamp: Date.now()
      });
      
      return false;
    }
  }

  async processRequest(request, sender) {
    const { action, skill, data } = request;
    
    // Route to appropriate skill
    const targetSkill = this.skillRegistry.getSkill(skill);
    if (!targetSkill) {
      throw new Error(`Skill '${skill}' not found`);
    }
    
    // Check if skill is active
    if (!targetSkill.isActive()) {
      // Try to activate skill
      await targetSkill.activate();
    }
    
    // Execute action
    const result = await targetSkill.handleAction(action, data, sender);
    
    // Emit event for cross-skill communication
    this.eventBus.emit('skill-action-completed', {
      skill,
      action,
      result,
      timestamp: Date.now()
    });
    
    return result;
  }

  async handleAlarm(alarm) {
    console.log('Alarm triggered:', alarm.name);

    try {
      // Route to task scheduler
      await this.taskScheduler.handleAlarm(alarm);

      // Route brain-specific alarms to the UserBrain skill
      if (alarm.name === 'user-brain-sync') {
        const brainSkill = this.skillRegistry.getSkill('user-brain');
        if (brainSkill && brainSkill.isActive()) {
          await brainSkill.handleAlarm(alarm);
        }
      }
    } catch (error) {
      console.error('Error handling alarm:', error);
    }
  }

  async handleTabUpdate(tabId, changeInfo, tab) {
    // Only handle complete page loads
    if (changeInfo.status === 'complete') {
      // Notify skills about tab update
      this.eventBus.emit('tab-updated', {
        tabId,
        changeInfo,
        tab,
        timestamp: Date.now()
      });
      
      // Inject content scripts if needed
      await this.injectContentScripts(tabId, tab.url);
    }
  }

  async handleTabCreated(tab) {
    // Notify skills about new tab
    this.eventBus.emit('tab-created', {
      tab,
      timestamp: Date.now()
    });
  }

  async handleContextMenu(info, tab) {
    try {
      // Route to appropriate skill based on context menu item
      const menuItemId = info.menuItemId;
      const skillName = menuItemId.toString().split('_')[0];
      
      const targetSkill = this.skillRegistry.getSkill(skillName);
      if (targetSkill) {
        await targetSkill.handleContextMenu(info, tab);
      } else {
        // Try to get skill from full menu item ID
        const fullSkillName = menuItemId.toString().replace('-', '_');
        const fullTargetSkill = this.skillRegistry.getSkill(fullSkillName);
        if (fullTargetSkill) {
          await fullTargetSkill.handleContextMenu(info, tab);
        }
      }
    } catch (error) {
      console.error('Error handling context menu:', error);
    }
  }

  async handleStorageChange(changes, areaName) {
    // Notify skills about storage changes
    this.eventBus.emit('storage-changed', {
      changes,
      areaName,
      timestamp: Date.now()
    });
  }

  async performFirstTimeSetup() {
    console.log('Performing first-time setup...');
    
    // Set default settings
    await this.storageManager.storeData('settings', {
      voiceEnabled: true,
      autoStartSkills: ['background-tasks', 'server-skills', 'ui-assistant'],
      theme: 'auto',
      language: 'en',
      notifications: true,
      privacyMode: false
    });
    
    // Initialize user profile
    await this.storageManager.storeData('userProfile', {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      preferences: {}
    });
    
    // Show welcome notification
    chrome.notifications.create('welcome', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon-48.png'),
      title: 'AI Bot Extension',
      message: 'Welcome! Your AI assistant is ready to help.'
    });
  }

  async performUpdateMigration(previousVersion) {
    console.log(`Updating from version ${previousVersion}...`);
    
    // Migration logic based on previous version
    const migrations = {
      '0.9.0': async () => {
        // Migrate from v0.9.0 to current
        await this.migrateFrom090();
      },
      '1.0.0': async () => {
        // Current version, no migration needed
      }
    };
    
    const migration = migrations[previousVersion];
    if (migration) {
      await migration();
    }
  }

  async migrateFrom090() {
    // Example migration logic
    console.log('Migrating from version 0.9.0...');
    
    // Migrate storage format
    const oldData = await chrome.storage.local.get(null);
    // Apply migration transformations...
    
    // Update version info
    await this.storageManager.storeData('migrationInfo', {
      fromVersion: '0.9.0',
      toVersion: '1.0.0',
      migratedAt: Date.now()
    });
  }

  async createContextMenus() {
    // Clear existing context menus
    chrome.contextMenus.removeAll();
    
    // Create main context menu
    chrome.contextMenus.create({
      id: 'ai-bot-main',
      title: 'AI Bot',
      contexts: ['selection', 'page', 'link', 'image', 'video']
    });
    
    // Add skill-specific context menus
    const activeSkills = this.skillRegistry.getActiveSkills();
    for (const skill of activeSkills) {
      if (skill.getContextMenuItems) {
        const items = skill.getContextMenuItems();
        for (const item of items) {
          chrome.contextMenus.create({
            ...item,
            parentId: 'ai-bot-main'
          });
        }
      }
    }
  }

  async injectContentScripts(tabId, url) {
    // Check if URL is allowed for content script injection
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return;
    }
    
    try {
      // Inject universal content script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/universal-handler.js']
      });
      
      // Inject skill-specific content scripts
      const activeSkills = this.skillRegistry.getActiveSkills();
      for (const skill of activeSkills) {
        if (skill.getContentScripts) {
          const scripts = skill.getContentScripts();
          for (const script of scripts) {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: [script]
            });
          }
        }
      }
    } catch (error) {
      console.error('Error injecting content scripts:', error);
    }
  }

  handleInitializationError(error) {
    console.error('Initialization failed:', error);
    
    // Send error notification
    chrome.notifications.create('init-error', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon-48.png'),
      title: 'AI Bot Extension - Initialization Error',
      message: 'Failed to initialize. Please reload the extension.'
    });
  }

  // Public API for external access
  getSkillRegistry() {
    return this.skillRegistry;
  }

  getEventBus() {
    return this.eventBus;
  }

  getStorageManager() {
    return this.storageManager;
  }

  getVoiceInterface() {
    return this.voiceInterface;
  }

  // Quick action handlers
  async handleDailyBriefing(sender) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return { ok: false };
    await chrome.tabs.sendMessage(tab.id, { type: 'SUYA_DAILY_BRIEFING' }).catch(() => {});
    return { ok: true };
  }

  async injectFormFiller(sender) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return { ok: false };
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['content-scripts/form-filler-trigger.js'],
    }).catch(() => {});
    return { ok: true };
  }

  async injectPageAnalyzer(sender) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return { ok: false };
    await chrome.tabs.sendMessage(tab.id, { type: 'SUYA_ANALYZE_PAGE' }).catch(() => {});
    return { ok: true };
  }

  async toggleVoiceOnActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return { ok: false };
    await chrome.tabs.sendMessage(tab.id, { type: 'SUYA_TOGGLE_VOICE' }).catch(() => {});
    return { ok: true };
  }

  async openSkillGapTab() {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html#skill-gap') });
    return { ok: true };
  }

  async fetchTrending() {
    // Delegate to news aggregator skill
    const [tab] = await chrome.tabs.query({ url: chrome.runtime.getURL('newtab/newtab.html') });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'SHOW_TRENDING_FEED' }).catch(() => {});
    }
    return { ok: true };
  }

  async handleStoreApiKey(payload) {
    try {
      const { providerId, key } = payload;
      const STORAGE_PREFIX = 'secureApiKey:';
      
      // Store in chrome storage with basic encoding (btoa is not encryption but prevents casual reading)
      await chrome.storage.local.set({ 
        [`${STORAGE_PREFIX}${providerId}`]: key ? btoa(key) : '' 
      });
      
      console.log(`API key stored for provider: ${providerId}`);
      return { ok: true };
    } catch (error) {
      console.error('Failed to store API key:', error);
      return { ok: false, error: error.message };
    }
  }

  async handleRemoveApiKey(payload) {
    try {
      const { providerId } = payload;
      const STORAGE_PREFIX = 'secureApiKey:';
      
      await chrome.storage.local.remove(`${STORAGE_PREFIX}${providerId}`);
      
      console.log(`API key removed for provider: ${providerId}`);
      return { ok: true };
    } catch (error) {
      console.error('Failed to remove API key:', error);
      return { ok: false, error: error.message };
    }
  }
}

// Initialize service worker
const serviceWorker = new ExtensionServiceWorker();

// Auto-initialize on service worker start
serviceWorker.initialize().catch(console.error);

// Export for testing
if (typeof globalThis !== 'undefined' && globalThis.testEnvironment) {
  globalThis.serviceWorker = serviceWorker;
}
