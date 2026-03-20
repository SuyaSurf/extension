/**
 * Voice Interface Foundation
 * Provides speech recognition, synthesis, and voice command processing
 */

class SpeechRecognitionEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.continuous = true;
    this.interimResults = true;
    this.lang = 'en-US';
    this.maxAlternatives = 1;
    
    this.onResult = null;
    this.onError = null;
    this.onStart = null;
    this.onEnd = null;
  }

  async initialize() {
    if (typeof window === 'undefined') {
      throw new Error('Speech recognition requires a window context');
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      throw new Error('Speech recognition not supported in this browser');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    this.setupRecognition();
  }

  setupRecognition() {
    this.recognition.continuous = this.continuous;
    this.recognition.interimResults = this.interimResults;
    this.recognition.lang = this.lang;
    this.recognition.maxAlternatives = this.maxAlternatives;
    
    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStart) this.onStart();
    };
    
    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onEnd) this.onEnd();
    };
    
    this.recognition.onresult = (event) => {
      const results = [];
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        results.push({
          transcript: result[0].transcript,
          confidence: result[0].confidence,
          isFinal: result.isFinal
        });
      }
      
      if (this.onResult) {
        this.onResult(results);
      }
    };
    
    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (this.onError) {
        this.onError(event.error);
      }
    };
  }

  start() {
    if (!this.recognition) {
      throw new Error('Speech recognition not initialized');
    }
    
    if (this.isListening) {
      return;
    }
    
    this.recognition.start();
  }

  stop() {
    if (!this.recognition || !this.isListening) {
      return;
    }
    
    this.recognition.stop();
  }

  abort() {
    if (!this.recognition || !this.isListening) {
      return;
    }
    
    this.recognition.abort();
  }

  updateSettings(settings) {
    if (settings.continuous !== undefined) this.continuous = settings.continuous;
    if (settings.interimResults !== undefined) this.interimResults = settings.interimResults;
    if (settings.lang !== undefined) this.lang = settings.lang;
    if (settings.maxAlternatives !== undefined) this.maxAlternatives = settings.maxAlternatives;
    
    if (this.recognition) {
      this.setupRecognition();
    }
  }
}

class SpeechSynthesisEngine {
  constructor() {
    this.synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voices = [];
    this.currentUtterance = null;
    this.isSpeaking = false;
    
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
    this.onPause = null;
    this.onResume = null;
    
    if (this.synthesis) {
      this.loadVoices();
    }
  }

  loadVoices() {
    if (!this.synthesis) return;
    this.voices = this.synthesis.getVoices();
    
    // Listen for voice changes
    this.synthesis.onvoiceschanged = () => {
      this.voices = this.synthesis.getVoices();
    };
  }

  getVoices() {
    return this.voices;
  }

  getVoiceByLanguage(lang) {
    return this.voices.find(voice => voice.lang.startsWith(lang)) || this.voices[0];
  }

  speak(text, options = {}) {
    const {
      voice = null,
      lang = 'en-US',
      pitch = 1,
      rate = 1,
      volume = 1,
      queue = true
    } = options;
    
    if (!this.synthesis) {
      throw new Error('Speech synthesis not supported');
    }
    
    // Stop current speech if not queuing
    if (!queue && this.isSpeaking) {
      this.stop();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set voice
    if (voice) {
      utterance.voice = voice;
    } else {
      utterance.voice = this.getVoiceByLanguage(lang);
    }
    
    // Set properties
    utterance.lang = lang;
    utterance.pitch = pitch;
    utterance.rate = rate;
    utterance.volume = volume;
    
    // Set event handlers
    utterance.onstart = () => {
      this.isSpeaking = true;
      this.currentUtterance = utterance;
      if (this.onStart) this.onStart();
    };
    
    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      if (this.onEnd) this.onEnd();
    };
    
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      this.isSpeaking = false;
      this.currentUtterance = null;
      if (this.onError) this.onError(event.error);
    };
    
    utterance.onpause = () => {
      if (this.onPause) this.onPause();
    };
    
    utterance.onResume = () => {
      if (this.onResume) this.onResume();
    };
    
    this.synthesis.speak(utterance);
    return utterance;
  }

  pause() {
    if (this.synthesis && this.isSpeaking) {
      this.synthesis.pause();
    }
  }

  resume() {
    if (this.synthesis) {
      this.synthesis.resume();
    }
  }

  stop() {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.isSpeaking = false;
      this.currentUtterance = null;
    }
  }

  isCurrentlySpeaking() {
    return this.isSpeaking;
  }
}

class NLPProcessor {
  constructor() {
    this.intents = new Map();
    this.entities = new Map();
    this.patterns = new Map();
  }

  registerIntent(intent, patterns, action) {
    this.intents.set(intent, {
      patterns: patterns.map(pattern => new RegExp(pattern, 'i')),
      action
    });
    
    for (const pattern of patterns) {
      this.patterns.set(pattern, intent);
    }
  }

  registerEntity(entity, patterns) {
    this.entities.set(entity, patterns.map(pattern => new RegExp(pattern, 'i')));
  }

  async processIntent(text) {
    const normalizedText = text.toLowerCase().trim();
    
    // Check for intent matches
    for (const [intent, config] of this.intents) {
      for (const pattern of config.patterns) {
        const match = normalizedText.match(pattern);
        if (match) {
          return {
            intent,
            confidence: 1.0,
            entities: this.extractEntities(normalizedText),
            parameters: this.extractParameters(match, intent),
            originalText: text
          };
        }
      }
    }
    
    // Fallback to basic keyword matching
    return {
      intent: 'unknown',
      confidence: 0.1,
      entities: this.extractEntities(normalizedText),
      parameters: {},
      originalText: text
    };
  }

  extractEntities(text) {
    const entities = {};
    
    for (const [entityName, patterns] of this.entities) {
      for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
          entities[entityName] = matches.map(match => match.trim());
        }
      }
    }
    
    return entities;
  }

  extractParameters(match, intent) {
    const parameters = {};
    
    // Extract named groups and positional parameters
    if (match.groups) {
      Object.assign(parameters, match.groups);
    } else {
      for (let i = 1; i < match.length; i++) {
        parameters[`param${i}`] = match[i];
      }
    }
    
    return parameters;
  }

  addPattern(intent, pattern) {
    if (!this.intents.has(intent)) {
      throw new Error(`Intent ${intent} not registered`);
    }
    
    const regex = new RegExp(pattern, 'i');
    this.intents.get(intent).patterns.push(regex);
    this.patterns.set(pattern, intent);
  }

  removePattern(intent, pattern) {
    if (!this.intents.has(intent)) {
      return;
    }
    
    const patterns = this.intents.get(intent).patterns;
    const index = patterns.findIndex(p => p.source === pattern);
    if (index !== -1) {
      patterns.splice(index, 1);
    }
    
    this.patterns.delete(pattern);
  }
}

class AudioFeedbackSystem {
  constructor() {
    this.synthesisEngine = new SpeechSynthesisEngine();
    this.audioContext = null;
    this.soundEnabled = true;
    this.ttsEnabled = true;
    
    this.initializeAudioContext();
  }

  initializeAudioContext() {
    try {
      if (typeof window === 'undefined') {
        return;
      }

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  async provideFeedback(result) {
    if (!result.success && result.error) {
      await this.handleError(result.error);
      return;
    }
    
    if (result.message && this.ttsEnabled) {
      await this.speak(result.message);
    }
    
    if (result.sound && this.soundEnabled) {
      await this.playSound(result.sound);
    }
  }

  async speak(text, options = {}) {
    try {
      return await this.synthesisEngine.speak(text, options);
    } catch (error) {
      console.error('Error speaking text:', error);
    }
  }

  async playSound(soundType) {
    if (!this.audioContext) return;
    
    // Create simple beep sounds for different feedback types
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    switch (soundType) {
      case 'success':
        oscillator.frequency.value = 800;
        gainNode.gain.value = 0.1;
        break;
      case 'error':
        oscillator.frequency.value = 300;
        gainNode.gain.value = 0.1;
        break;
      case 'notification':
        oscillator.frequency.value = 600;
        gainNode.gain.value = 0.05;
        break;
      default:
        oscillator.frequency.value = 440;
        gainNode.gain.value = 0.05;
    }
    
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.1);
  }

  async handleError(error) {
    const errorMessage = `Error: ${error}`;
    await this.speak(errorMessage);
    await this.playSound('error');
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
  }

  setTTSEnabled(enabled) {
    this.ttsEnabled = enabled;
  }

  isCurrentlySpeaking() {
    return this.synthesisEngine.isCurrentlySpeaking();
  }

  stopSpeaking() {
    this.synthesisEngine.stop();
  }
}

class VoiceInterface {
  constructor() {
    this.recognitionEngine = new SpeechRecognitionEngine();
    this.nlpProcessor = new NLPProcessor();
    this.feedbackSystem = new AudioFeedbackSystem();
    this.commandRouter = null;
    
    this.isInitialized = false;
    this.isListening = false;
    this.autoRestart = true;
    
    this.setupRecognitionHandlers();
    this.setupDefaultCommands();
  }

  async initialize() {
    try {
      if (typeof window === 'undefined') {
        this.isInitialized = false;
        console.log('Voice interface unavailable (no window context)');
        return;
      }

      await this.recognitionEngine.initialize();
      this.isInitialized = true;
      console.log('Voice interface initialized successfully');
    } catch (error) {
      console.error('Failed to initialize voice interface:', error);
      this.isInitialized = false;
    }
  }

  setupRecognitionHandlers() {
    this.recognitionEngine.onResult = async (results) => {
      for (const result of results) {
        if (result.isFinal) {
          await this.processVoiceCommand(result.transcript);
        }
      }
    };
    
    this.recognitionEngine.onError = async (error) => {
      console.error('Voice recognition error:', error);
      await this.feedbackSystem.handleError(error);
      
      // Auto-restart on certain errors
      if (this.autoRestart && ['no-speech', 'network'].includes(error)) {
        setTimeout(() => this.startListening(), 1000);
      }
    };
    
    this.recognitionEngine.onEnd = () => {
      this.isListening = false;
      
      // Auto-restart if continuous mode
      if (this.autoRestart && this.isListening) {
        setTimeout(() => this.startListening(), 100);
      }
    };
  }

  setupDefaultCommands() {
    // Basic voice commands
    this.nlpProcessor.registerIntent('start_listening', [
      'start listening',
      'wake up',
      'hey assistant',
      'hello'
    ], 'startListening');
    
    this.nlpProcessor.registerIntent('stop_listening', [
      'stop listening',
      'go to sleep',
      'bye assistant',
      'goodbye'
    ], 'stopListening');
    
    this.nlpProcessor.registerIntent('help', [
      'help',
      'what can you do',
      'commands',
      'instructions'
    ], 'showHelp');
    
    this.nlpProcessor.registerIntent('status', [
      'status',
      'how are you',
      'what\'s your status'
    ], 'getStatus');
    
    // Entity recognition
    this.nlpProcessor.registerEntity('email', [
      '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b'
    ]);
    
    this.nlpProcessor.registerEntity('phone', [
      '\\b\\d{3}-\\d{3}-\\d{4}\\b',
      '\\b\\d{10}\\b',
      '\\b\\+\\d{11,}\\b'
    ]);
    
    this.nlpProcessor.registerEntity('time', [
      '\\b\\d{1,2}:\\d{2}\\s*(?:AM|PM|am|pm)?\\b'
    ]);
  }

  async processVoiceCommand(audioData) {
    try {
      // Convert speech to text (already done by recognition engine)
      const transcript = audioData;
      
      // Process with NLP
      const intent = await this.nlpProcessor.processIntent(transcript);
      
      // Route to appropriate handler
      const result = await this.executeCommand(intent);
      
      // Provide audio feedback
      await this.feedbackSystem.provideFeedback(result);
      
      return result;
      
    } catch (error) {
      console.error('Error processing voice command:', error);
      await this.feedbackSystem.handleError(error);
      throw error;
    }
  }

  async executeCommand(intent) {
    const { intent: intentName, parameters, entities } = intent;
    
    switch (intentName) {
      case 'start_listening':
        return this.startListening();
        
      case 'stop_listening':
        return this.stopListening();
        
      case 'help':
        return this.showHelp();
        
      case 'status':
        return this.getStatus();
        
      default:
        // Route to command router if available
        if (this.commandRouter) {
          return await this.commandRouter.execute(intent);
        }
        
        return {
          success: false,
          error: `Unknown command: ${intentName}`,
          message: "I didn't understand that command. Say 'help' for available commands."
        };
    }
  }

  startListening() {
    if (!this.isInitialized) {
      throw new Error('Voice interface not initialized');
    }
    
    if (this.isListening) {
      return { success: true, message: 'Already listening' };
    }
    
    this.recognitionEngine.start();
    this.isListening = true;
    
    return { 
      success: true, 
      message: 'Voice recognition started',
      sound: 'notification'
    };
  }

  stopListening() {
    if (!this.isListening) {
      return { success: true, message: 'Not currently listening' };
    }
    
    this.recognitionEngine.stop();
    this.autoRestart = false;
    
    return { 
      success: true, 
      message: 'Voice recognition stopped',
      sound: 'notification'
    };
  }

  showHelp() {
    const helpMessage = `
      Available voice commands:
      - "Start listening" or "Wake up" to activate voice recognition
      - "Stop listening" or "Go to sleep" to deactivate voice recognition
      - "Help" to show this help message
      - "Status" to check current status
    `;
    
    return {
      success: true,
      message: helpMessage
    };
  }

  getStatus() {
    const status = {
      initialized: this.isInitialized,
      listening: this.isListening,
      speaking: this.feedbackSystem.isCurrentlySpeaking(),
      soundEnabled: this.feedbackSystem.soundEnabled,
      ttsEnabled: this.feedbackSystem.ttsEnabled
    };
    
    const message = `Voice interface status: ${status.listening ? 'Listening' : 'Not listening'}, ${status.speaking ? 'Speaking' : 'Not speaking'}`;
    
    return {
      success: true,
      message,
      data: status
    };
  }

  setCommandRouter(router) {
    this.commandRouter = router;
  }

  addVoiceCommand(intent, patterns, action) {
    this.nlpProcessor.registerIntent(intent, patterns, action);
  }

  updateSettings(settings) {
    if (settings.language) {
      this.recognitionEngine.updateSettings({ lang: settings.language });
    }
    
    if (settings.soundEnabled !== undefined) {
      this.feedbackSystem.setSoundEnabled(settings.soundEnabled);
    }
    
    if (settings.ttsEnabled !== undefined) {
      this.feedbackSystem.setTTSEnabled(settings.ttsEnabled);
    }
    
    if (settings.autoRestart !== undefined) {
      this.autoRestart = settings.autoRestart;
    }
  }

  async speak(text, options = {}) {
    return await this.feedbackSystem.speak(text, options);
  }

  stopSpeaking() {
    this.feedbackSystem.stopSpeaking();
  }

  isCurrentlyListening() {
    return this.isListening;
  }

  isCurrentlySpeaking() {
    return this.feedbackSystem.isCurrentlySpeaking();
  }
}

export { VoiceInterface };
