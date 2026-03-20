/**
 * Audio Manager for Chrome Extension (Manifest V3)
 * Handles sound playback using Web Audio API and offscreen documents
 */

class AudioManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      volume: 0.5,
      soundsEnabled: true,
      ...config
    };
    
    this.sounds = new Map();
    this.audioContext = null;
    this.isInitialized = false;
    this.offscreenDocument = null;
    
    // Built-in sound presets
    this.initializeBuiltInSounds();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Check if offscreen API is available
      if (typeof chrome !== 'undefined' && chrome.offscreen) {
        await this.setupOffscreenDocument();
      }
      
      // Initialize audio context in offscreen document
      if (this.offscreenDocument) {
        await this.initializeAudioContext();
      }
      
      this.isInitialized = true;
      console.log('Audio Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Audio Manager:', error);
      this.config.enabled = false;
    }
  }

  /**
   * Play a sound by name
   * @param {string} soundName - Name of the sound to play
   * @param {Object} options - Playback options
   * @returns {Promise<boolean>} Success status
   */
  async playSound(soundName, options = {}) {
    if (!this.config.enabled || !this.config.soundsEnabled) {
      return false;
    }

    const sound = this.sounds.get(soundName);
    if (!sound) {
      console.warn(`Sound not found: ${soundName}`);
      return false;
    }

    try {
      if (this.offscreenDocument) {
        // Play in offscreen document (Manifest V3 compliant)
        return await this.playSoundOffscreen(sound, options);
      } else {
        // Fallback: try to play directly (may not work in service worker)
        return await this.playSoundDirect(sound, options);
      }
    } catch (error) {
      console.error(`Failed to play sound ${soundName}:`, error);
      return false;
    }
  }

  /**
   * Stop currently playing sound
   * @returns {Promise<boolean>} Success status
   */
  async stopSound() {
    if (!this.isInitialized || !this.offscreenDocument) {
      return false;
    }

    try {
      // Send stop message to offscreen document
      const response = await chrome.runtime.sendMessage({
        type: 'audio_stop',
        target: 'offscreen'
      });
      
      return response?.success || false;
    } catch (error) {
      console.error('Failed to stop sound:', error);
      return false;
    }
  }

  /**
   * Set volume level
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  async setVolume(volume) {
    if (volume < 0 || volume > 1) {
      throw new Error('Volume must be between 0.0 and 1.0');
    }
    
    this.config.volume = volume;
    
    if (this.offscreenDocument) {
      try {
        await chrome.runtime.sendMessage({
          type: 'audio_set_volume',
          target: 'offscreen',
          volume
        });
      } catch (error) {
        console.error('Failed to set volume:', error);
      }
    }
  }

  /**
   * Get available sounds
   * @returns {Array} List of available sounds
   */
  getAvailableSounds() {
    return Array.from(this.sounds.keys()).map(name => {
      const sound = this.sounds.get(name);
      return {
        name,
        description: sound.description,
        category: sound.category,
        duration: sound.duration
      };
    });
  }

  /**
   * Add a custom sound
   * @param {string} name - Sound name
   * @param {Object} soundData - Sound configuration
   */
  addSound(name, soundData) {
    const sound = {
      type: 'custom',
      frequency: soundData.frequency || 440,
      duration: soundData.duration || 200,
      waveform: soundData.waveform || 'sine',
      envelope: soundData.envelope || {},
      description: soundData.description || 'Custom sound',
      category: soundData.category || 'custom',
      ...soundData
    };
    
    this.sounds.set(name, sound);
  }

  /**
   * Remove a sound
   * @param {string} name - Sound name to remove
   * @returns {boolean} Success status
   */
  removeSound(name) {
    return this.sounds.delete(name);
  }

  // Private methods
  initializeBuiltInSounds() {
    // Notification sounds
    this.sounds.set('notification', {
      type: 'synthesized',
      frequency: 800,
      duration: 300,
      waveform: 'sine',
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.1 },
      description: 'Standard notification sound',
      category: 'notification'
    });

    this.sounds.set('reminder', {
      type: 'synthesized',
      frequency: 600,
      duration: 400,
      waveform: 'triangle',
      envelope: { attack: 0.02, decay: 0.15, sustain: 0.4, release: 0.2 },
      description: 'Reminder alert sound',
      category: 'reminder'
    });

    this.sounds.set('success', {
      type: 'synthesized',
      frequency: 1000,
      duration: 200,
      waveform: 'sine',
      envelope: { attack: 0.01, decay: 0.05, sustain: 0.2, release: 0.1 },
      description: 'Success completion sound',
      category: 'feedback'
    });

    this.sounds.set('error', {
      type: 'synthesized',
      frequency: 300,
      duration: 500,
      waveform: 'sawtooth',
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3 },
      description: 'Error alert sound',
      category: 'feedback'
    });

    this.sounds.set('warning', {
      type: 'synthesized',
      frequency: 440,
      duration: 350,
      waveform: 'square',
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.2 },
      description: 'Warning alert sound',
      category: 'feedback'
    });

    // Task-related sounds
    this.sounds.set('task_complete', {
      type: 'synthesized',
      frequency: 880,
      duration: 250,
      waveform: 'sine',
      envelope: { attack: 0.01, decay: 0.08, sustain: 0.3, release: 0.15 },
      description: 'Task completed sound',
      category: 'task'
    });

    this.sounds.set('task_start', {
      type: 'synthesized',
      frequency: 440,
      duration: 150,
      waveform: 'sine',
      envelope: { attack: 0.01, decay: 0.05, sustain: 0.2, release: 0.1 },
      description: 'Task started sound',
      category: 'task'
    });
  }

  async setupOffscreenDocument() {
    try {
      // Check if offscreen document already exists
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL('offscreen/offscreen.html')]
      });

      if (existingContexts.length > 0) {
        this.offscreenDocument = existingContexts[0];
        return;
      }

      // Create new offscreen document
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen/offscreen.html'),
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Audio playback for extension notifications and feedback'
      });

      console.log('Offscreen document created for audio playback');
    } catch (error) {
      console.error('Failed to setup offscreen document:', error);
      throw error;
    }
  }

  async initializeAudioContext() {
    try {
      // Send initialization message to offscreen document
      const response = await chrome.runtime.sendMessage({
        type: 'audio_init',
        target: 'offscreen',
        config: {
          volume: this.config.volume
        }
      });
      
      if (response?.success) {
        console.log('Audio context initialized in offscreen document');
      }
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      throw error;
    }
  }

  async playSoundOffscreen(sound, options) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'audio_play',
        target: 'offscreen',
        sound: {
          ...sound,
          volume: options.volume || this.config.volume,
          loop: options.loop || false
        }
      });
      
      return response?.success || false;
    } catch (error) {
      console.error('Failed to play sound in offscreen document:', error);
      return false;
    }
  }

  async playSoundDirect(sound, options) {
    // This is a fallback method that may not work in service workers
    // In Manifest V3, Web Audio API should be used in offscreen documents
    console.warn('Direct audio playback attempted - may not work in service worker');
    return false;
  }

  /**
   * Generate a synthesized sound using Web Audio API parameters
   * @param {Object} params - Sound parameters
   * @returns {Object} Sound configuration
   */
  generateSynthesizedSound(params) {
    return {
      type: 'synthesized',
      frequency: params.frequency || 440,
      duration: params.duration || 200,
      waveform: params.waveform || 'sine',
      envelope: params.envelope || {},
      description: params.description || 'Synthesized sound',
      category: params.category || 'custom'
    };
  }

  /**
   * Create a sound sequence (multiple sounds played in sequence)
   * @param {Array} soundNames - Array of sound names
   * @param {number} interval - Interval between sounds (ms)
   * @returns {Promise<boolean>} Success status
   */
  async playSoundSequence(soundNames, interval = 100) {
    for (let i = 0; i < soundNames.length; i++) {
      const success = await this.playSound(soundNames[i]);
      if (!success) {
        return false;
      }
      
      // Wait for interval before next sound (except for last)
      if (i < soundNames.length - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    
    return true;
  }

  /**
   * Get audio manager status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      soundsEnabled: this.config.soundsEnabled,
      volume: this.config.volume,
      initialized: this.isInitialized,
      hasOffscreenDocument: !!this.offscreenDocument,
      availableSounds: this.sounds.size
    };
  }

  /**
   * Enable/disable sounds
   * @param {boolean} enabled - Whether to enable sounds
   */
  setSoundsEnabled(enabled) {
    this.config.soundsEnabled = enabled;
  }

  /**
   * Enable/disable entire audio manager
   * @param {boolean} enabled - Whether to enable audio manager
   */
  setEnabled(enabled) {
    this.config.enabled = enabled;
  }

  destroy() {
    this.sounds.clear();
    this.audioContext = null;
    this.offscreenDocument = null;
    this.isInitialized = false;
  }
}

export { AudioManager };
