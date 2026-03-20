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
  }

  async handleInstall(details) {
    console.log('Extension installed:', details.reason);
    
    if (details.reason === 'install') {
      // First-time installation
      await this.performFirstTimeSetup();
    } else if (details.reason === 'update') {
      // Extension update
      await this.performUpdateMigration(details.previousVersion);
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
}

// Initialize service worker
const serviceWorker = new ExtensionServiceWorker();

// Auto-initialize on service worker start
serviceWorker.initialize().catch(console.error);

// Export for testing
if (typeof globalThis !== 'undefined' && globalThis.testEnvironment) {
  globalThis.serviceWorker = serviceWorker;
}
