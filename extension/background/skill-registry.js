/**
 * Skill Registry System
 * Manages registration, activation, and coordination of all skill modules
 */

import { BackgroundTasksSkill } from '../skills/background-tasks/skill.js';
import { ServerSkillsSkill } from '../skills/server-skills/skill.js';
import { MailSkillsSkill } from '../skills/mail-skills/skill.js';
import { VideoGenerationSkill } from '../skills/video-generation/skill.js';
import { AudioGenerationSkill } from '../skills/audio-generation/skill.js';
import { ChatSkillsSkill } from '../skills/chat-skills/skill.js';
import { ApplicationWritingSkill } from '../skills/application-writing/skill.js';
import { DocumentSkillsSkill } from '../skills/document-skills/skill.js';
import { QATestingSkill } from '../skills/qa-testing/skill.js';
import { UIAssistantSkill } from '../skills/ui-assistant/skill.js';

class SkillRegistry {
  constructor() {
    this.skills = new Map();
    this.activeSkills = new Set();
    this.skillConfigs = new Map();
    this.dependencies = new Map();
    this.loadOrder = [];
  }

  async registerSkill(skillClass, config = {}) {
    try {
      const skillName = skillClass.name.replace('Skill', '').toLowerCase();
      
      // Check if skill is already registered
      if (this.skills.has(skillName)) {
        console.warn(`Skill ${skillName} is already registered`);
        return;
      }
      
      // Create skill instance
      const skill = new skillClass({
        name: skillName,
        ...config
      });
      
      // Initialize skill
      await skill.initialize();
      
      // Register skill
      this.skills.set(skillName, skill);
      this.skillConfigs.set(skillName, config);
      
      // Set up dependencies
      if (skill.getDependencies) {
        this.dependencies.set(skillName, skill.getDependencies());
      }
      
      // Auto-activate if specified
      if (config.autoActivate) {
        await this.activateSkill(skillName);
      }
      
      console.log(`Skill ${skillName} registered successfully`);
      
    } catch (error) {
      console.error(`Failed to register skill:`, error);
      throw error;
    }
  }

  async registerAllSkills() {
    console.log('Registering all skills...');
    
    const skillConfigs = [
      { 
        class: BackgroundTasksSkill, 
        autoActivate: true,
        priority: 1,
        config: {
          maxConcurrentTasks: 5,
          retryAttempts: 3,
          taskTimeout: 300000 // 5 minutes
        }
      },
      { 
        class: ServerSkillsSkill, 
        autoActivate: true,
        priority: 2,
        config: {
          apiEndpoints: {
            download: 'https://api.suya.example.com/download',
            whisper: 'https://api.suya.example.com/whisper',
            tts: 'https://api.suya.example.com/tts',
            notes: 'https://api.suya.example.com/notes'
          }
        }
      },
      { 
        class: MailSkillsSkill, 
        autoActivate: false,
        priority: 3,
        config: {
          providers: ['gmail', 'outlook', 'venmail'],
          autoReplyEnabled: false,
          smartComposeEnabled: true
        }
      },
      { 
        class: VideoGenerationSkill, 
        autoActivate: false,
        priority: 4,
        config: {
          maxVideoLength: 600, // 10 minutes
          quality: '1080p',
          format: 'mp4'
        }
      },
      { 
        class: AudioGenerationSkill, 
        autoActivate: false,
        priority: 5,
        config: {
          sampleRate: 44100,
          bitRate: 320,
          format: 'mp3'
        }
      },
      { 
        class: ChatSkillsSkill, 
        autoActivate: false,
        priority: 6,
        config: {
          platforms: ['telegram', 'whatsapp'],
          messageHistorySize: 1000
        }
      },
      { 
        class: ApplicationWritingSkill, 
        autoActivate: false,
        priority: 7,
        config: {
          autoDetectForms: true,
          smartFillEnabled: true,
          templateLibrary: true
        }
      },
      { 
        class: DocumentSkillsSkill, 
        autoActivate: false,
        priority: 8,
        config: {
          googleDocsEnabled: true,
          slidesEnabled: true,
          youtubeEnabled: true
        }
      },
      { 
        class: QATestingSkill, 
        autoActivate: false,
        priority: 9,
        config: {
          autoTestEnabled: false,
          visualRegressionEnabled: true,
          performanceMonitoringEnabled: true
        }
      },
      { 
        class: UIAssistantSkill, 
        autoActivate: true,
        priority: 10,
        config: {
          contextualHelp: true,
          voiceCommands: true,
          personalizedSuggestions: true
        }
      }
    ];

    // Sort by priority
    skillConfigs.sort((a, b) => a.priority - b.priority);
    
    // Register skills in priority order
    for (const config of skillConfigs) {
      try {
        await this.registerSkill(config.class, config);
        this.loadOrder.push(config.class.name.replace('Skill', '').toLowerCase());
      } catch (error) {
        console.error(`Failed to register ${config.class.name}:`, error);
      }
    }
    
    console.log(`Registered ${this.skills.size} skills`);
  }

  async activateSkill(skillName) {
    try {
      const skill = this.skills.get(skillName);
      if (!skill) {
        throw new Error(`Skill ${skillName} not found`);
      }
      
      // Check dependencies
      await this.checkDependencies(skillName);
      
      // Activate skill
      await skill.activate();
      this.activeSkills.add(skillName);
      
      console.log(`Skill ${skillName} activated`);
      
    } catch (error) {
      console.error(`Failed to activate skill ${skillName}:`, error);
      throw error;
    }
  }

  async deactivateSkill(skillName) {
    try {
      const skill = this.skills.get(skillName);
      if (!skill) {
        throw new Error(`Skill ${skillName} not found`);
      }
      
      // Check if other skills depend on this one
      const dependents = this.getDependents(skillName);
      if (dependents.length > 0) {
        throw new Error(`Cannot deactivate ${skillName}: required by ${dependents.join(', ')}`);
      }
      
      // Deactivate skill
      await skill.deactivate();
      this.activeSkills.delete(skillName);
      
      console.log(`Skill ${skillName} deactivated`);
      
    } catch (error) {
      console.error(`Failed to deactivate skill ${skillName}:`, error);
      throw error;
    }
  }

  async checkDependencies(skillName) {
    const deps = this.dependencies.get(skillName) || [];
    
    for (const dep of deps) {
      if (!this.activeSkills.has(dep)) {
        await this.activateSkill(dep);
      }
    }
  }

  getDependents(skillName) {
    const dependents = [];
    
    for (const [name, deps] of this.dependencies) {
      if (deps.includes(skillName) && this.activeSkills.has(name)) {
        dependents.push(name);
      }
    }
    
    return dependents;
  }

  getSkill(skillName) {
    return this.skills.get(skillName);
  }

  getActiveSkills() {
    return Array.from(this.activeSkills).map(name => this.skills.get(name));
  }

  getAllSkills() {
    return Array.from(this.skills.values());
  }

  getSkillConfig(skillName) {
    return this.skillConfigs.get(skillName);
  }

  updateSkillConfig(skillName, config) {
    const existingConfig = this.skillConfigs.get(skillName) || {};
    const updatedConfig = { ...existingConfig, ...config };
    this.skillConfigs.set(skillName, updatedConfig);
    
    // Update skill with new config
    const skill = this.skills.get(skillName);
    if (skill && skill.updateConfig) {
      skill.updateConfig(updatedConfig);
    }
  }

  async reloadSkill(skillName) {
    try {
      const skill = this.skills.get(skillName);
      if (!skill) {
        throw new Error(`Skill ${skillName} not found`);
      }
      
      const wasActive = this.activeSkills.has(skillName);
      const config = this.skillConfigs.get(skillName);
      
      // Deactivate if active
      if (wasActive) {
        await this.deactivateSkill(skillName);
      }
      
      // Reinitialize skill
      await skill.initialize();
      
      // Reactivate if it was active
      if (wasActive) {
        await this.activateSkill(skillName);
      }
      
      console.log(`Skill ${skillName} reloaded successfully`);
      
    } catch (error) {
      console.error(`Failed to reload skill ${skillName}:`, error);
      throw error;
    }
  }

  async unloadSkill(skillName) {
    try {
      const wasActive = this.activeSkills.has(skillName);
      
      // Deactivate if active
      if (wasActive) {
        await this.deactivateSkill(skillName);
      }
      
      // Cleanup skill
      const skill = this.skills.get(skillName);
      if (skill && skill.cleanup) {
        await skill.cleanup();
      }
      
      // Remove from registry
      this.skills.delete(skillName);
      this.skillConfigs.delete(skillName);
      this.dependencies.delete(skillName);
      
      console.log(`Skill ${skillName} unloaded successfully`);
      
    } catch (error) {
      console.error(`Failed to unload skill ${skillName}:`, error);
      throw error;
    }
  }

  getSkillStatus() {
    const status = {};
    
    for (const [name, skill] of this.skills) {
      status[name] = {
        name,
        active: this.activeSkills.has(name),
        version: skill.getVersion ? skill.getVersion() : '1.0.0',
        dependencies: this.dependencies.get(name) || [],
        dependents: this.getDependents(name),
        config: this.skillConfigs.get(name) || {},
        health: skill.getHealth ? skill.getHealth() : 'unknown'
      };
    }
    
    return status;
  }

  async performHealthCheck() {
    const results = {};
    
    for (const [name, skill] of this.skills) {
      try {
        const health = skill.getHealth ? await skill.getHealth() : 'unknown';
        results[name] = {
          status: 'healthy',
          health,
          timestamp: Date.now()
        };
      } catch (error) {
        results[name] = {
          status: 'error',
          error: error.message,
          timestamp: Date.now()
        };
      }
    }
    
    return results;
  }

  getLoadOrder() {
    return [...this.loadOrder];
  }

  getDependencyGraph() {
    const graph = {};
    
    for (const [name, deps] of this.dependencies) {
      graph[name] = deps || [];
    }
    
    return graph;
  }
}

export { SkillRegistry };
