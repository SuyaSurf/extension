/**
 * Offscreen Document for Audio Playback
 * Handles Web Audio API operations for Chrome Extension Manifest V3
 */

class OffscreenAudioHandler {
  constructor() {
    this.audioContext = null;
    this.currentSource = null;
    this.gainNode = null;
    this.volume = 0.5;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.volume;

      // Set up message listener
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

      this.isInitialized = true;
      console.log('Offscreen audio handler initialized');
    } catch (error) {
      console.error('Failed to initialize offscreen audio handler:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    if (message.target !== 'offscreen') return;

    try {
      switch (message.type) {
        case 'audio_init':
          await this.handleInit(message.config);
          sendResponse({ success: true });
          break;

        case 'audio_play':
          const playResult = await this.handlePlay(message.sound);
          sendResponse({ success: playResult });
          break;

        case 'audio_stop':
          const stopResult = await this.handleStop();
          sendResponse({ success: stopResult });
          break;

        case 'audio_set_volume':
          this.handleSetVolume(message.volume);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling audio message:', error);
      sendResponse({ success: false, error: error.message });
    }

    return true; // Keep message channel open for async response
  }

  handleInit(config) {
    if (config.volume !== undefined) {
      this.volume = config.volume;
      if (this.gainNode) {
        this.gainNode.gain.value = this.volume;
      }
    }
  }

  async handlePlay(soundConfig) {
    if (!this.audioContext || !this.gainNode) {
      throw new Error('Audio context not initialized');
    }

    try {
      // Stop any currently playing sound
      await this.handleStop();

      if (soundConfig.type === 'synthesized') {
        return await this.playSynthesizedSound(soundConfig);
      } else if (soundConfig.type === 'oscillator') {
        return await this.playOscillatorSound(soundConfig);
      } else {
        throw new Error(`Unsupported sound type: ${soundConfig.type}`);
      }
    } catch (error) {
      console.error('Failed to play sound:', error);
      return false;
    }
  }

  async playSynthesizedSound(soundConfig) {
    const {
      frequency = 440,
      duration = 200,
      waveform = 'sine',
      envelope = {},
      volume = this.volume,
      loop = false
    } = soundConfig;

    // Create oscillator
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

    // Create envelope gain node
    const envelopeGain = this.audioContext.createGain();
    
    // Apply envelope
    const now = this.audioContext.currentTime;
    const attack = envelope.attack || 0.01;
    const decay = envelope.decay || 0.1;
    const sustain = envelope.sustain || 0.3;
    const release = envelope.release || 0.1;

    // Attack
    envelopeGain.gain.setValueAtTime(0, now);
    envelopeGain.gain.linearRampToValueAtTime(volume, now + attack);

    // Decay
    envelopeGain.gain.linearRampToValueAtTime(
      volume * sustain,
      now + attack + decay
    );

    // Release (if not looping)
    if (!loop) {
      envelopeGain.gain.linearRampToValueAtTime(
        0,
        now + attack + decay + (duration / 1000) + release
      );
    }

    // Connect nodes
    oscillator.connect(envelopeGain);
    envelopeGain.connect(this.gainNode);

    // Start oscillator
    oscillator.start(now);
    
    // Schedule stop (if not looping)
    if (!loop) {
      oscillator.stop(now + attack + decay + (duration / 1000) + release);
    }

    // Store reference for stopping
    this.currentSource = oscillator;
    this.currentOscillator = oscillator;
    this.currentEnvelopeGain = envelopeGain;

    return true;
  }

  async playOscillatorSound(soundConfig) {
    const {
      frequency = 440,
      duration = 200,
      waveform = 'sine',
      volume = this.volume,
      loop = false
    } = soundConfig;

    // Create oscillator
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

    // Create gain node for this sound
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = volume;

    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(this.gainNode);

    // Start oscillator
    oscillator.start(this.audioContext.currentTime);
    
    // Schedule stop (if not looping)
    if (!loop) {
      oscillator.stop(this.audioContext.currentTime + (duration / 1000));
    }

    // Store reference for stopping
    this.currentSource = oscillator;
    this.currentGainNode = gainNode;

    return true;
  }

  async handleStop() {
    try {
      if (this.currentSource) {
        if (this.currentSource.stop) {
          this.currentSource.stop();
        }
        if (this.currentSource.disconnect) {
          this.currentSource.disconnect();
        }
      }

      if (this.currentGainNode && this.currentGainNode.disconnect) {
        this.currentGainNode.disconnect();
      }

      if (this.currentEnvelopeGain && this.currentEnvelopeGain.disconnect) {
        this.currentEnvelopeGain.disconnect();
      }

      this.currentSource = null;
      this.currentGainNode = null;
      this.currentEnvelopeGain = null;
      this.currentOscillator = null;

      return true;
    } catch (error) {
      console.error('Failed to stop sound:', error);
      return false;
    }
  }

  handleSetVolume(newVolume) {
    this.volume = Math.max(0, Math.min(1, newVolume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  destroy() {
    this.handleStop();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isInitialized = false;
  }
}

// Initialize the audio handler when the page loads
const audioHandler = new OffscreenAudioHandler();

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    audioHandler.initialize();
  });
} else {
  audioHandler.initialize();
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  audioHandler.destroy();
});

// Export for debugging
window.audioHandler = audioHandler;
