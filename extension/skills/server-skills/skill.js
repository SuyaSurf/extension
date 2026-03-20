/**
 * Server Skills Skill
 * Handles remote download, Whisper transcription, TTS, and note-taking
 */

class ServerSkillsSkill {
  constructor(config = {}) {
    this.name = 'server-skills';
    this.version = '1.0.0';
    this.isActive = false;
    this.config = {
      apiEndpoints: {
        download: 'https://api.suya.example.com/download',
        whisper: 'https://api.suya.example.com/whisper',
        tts: 'https://api.suya.example.com/tts',
        notes: 'https://api.suya.example.com/notes'
      },
      timeout: 30000,
      maxRetries: 3,
      ...config
    };
    
    this.eventBus = null;
    this.storageManager = null;
    this.downloadQueue = [];
    this.transcriptionQueue = [];
    this.ttsQueue = [];
    this.activeDownloads = new Map();
    this.activeTranscriptions = new Map();
    this.activeTTS = new Map();
    
    this.stats = {
      downloads: { total: 0, completed: 0, failed: 0 },
      transcriptions: { total: 0, completed: 0, failed: 0 },
      tts: { total: 0, completed: 0, failed: 0 },
      notes: { total: 0, created: 0, updated: 0, deleted: 0 }
    };
  }

  async initialize() {
    console.log('Initializing Server Skills Skill...');
    
    // Load existing data from storage
    await this.loadStoredData();
    
    // Resume pending operations
    await this.resumePendingOperations();
    
    console.log('Server Skills Skill initialized');
  }

  async activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    console.log('Server Skills Skill activated');
    
    // Start processing queues
    this.startQueueProcessing();
  }

  async deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    console.log('Server Skills Skill deactivated');
    
    // Stop processing queues
    this.stopQueueProcessing();
  }

  startQueueProcessing() {
    // Process download queue
    this.downloadInterval = setInterval(() => {
      if (this.isActive && this.downloadQueue.length > 0) {
        this.processDownloadQueue();
      }
    }, 1000);
    
    // Process transcription queue
    this.transcriptionInterval = setInterval(() => {
      if (this.isActive && this.transcriptionQueue.length > 0) {
        this.processTranscriptionQueue();
      }
    }, 2000);
    
    // Process TTS queue
    this.ttsInterval = setInterval(() => {
      if (this.isActive && this.ttsQueue.length > 0) {
        this.processTTSQueue();
      }
    }, 1500);
  }

  stopQueueProcessing() {
    if (this.downloadInterval) clearInterval(this.downloadInterval);
    if (this.transcriptionInterval) clearInterval(this.transcriptionInterval);
    if (this.ttsInterval) clearInterval(this.ttsInterval);
  }

  async handleAction(action, data, sender = null) {
    switch (action) {
      case 'download':
        return await this.downloadFile(data);
        
      case 'transcribe':
        return await this.transcribeAudio(data);
        
      case 'synthesize':
        return await this.synthesizeSpeech(data);
        
      case 'createNote':
        return await this.createNote(data);
        
      case 'getNote':
        return await this.getNote(data.noteId);
        
      case 'updateNote':
        return await this.updateNote(data.noteId, data.updates);
        
      case 'deleteNote':
        return await this.deleteNote(data.noteId);
        
      case 'listNotes':
        return await this.listNotes(data.filters || {});
        
      case 'searchNotes':
        return await this.searchNotes(data.query, data.options || {});
        
      case 'getStats':
        return this.getStats();
        
      case 'cancelOperation':
        return await this.cancelOperation(data.operationId, data.type);
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async handleSkillMessage(fromSkill, message, context) {
    switch (message.type) {
      case 'download-request':
        return await this.downloadFile(message.data);
        
      case 'transcription-request':
        return await this.transcribeAudio(message.data);
        
      case 'tts-request':
        return await this.synthesizeSpeech(message.data);
        
      case 'note-request':
        return await this.createNote(message.data);
        
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  async downloadFile(downloadData) {
    const operation = {
      id: crypto.randomUUID(),
      type: 'download',
      url: downloadData.url,
      filename: downloadData.filename || this.extractFilename(downloadData.url),
      saveTo: downloadData.saveTo || 'downloads',
      headers: downloadData.headers || {},
      cookies: downloadData.cookies || true,
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      progress: 0,
      bytesReceived: 0,
      totalBytes: 0,
      error: null,
      retryCount: 0
    };
    
    this.downloadQueue.push(operation);
    this.stats.downloads.total++;
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('download-queued', { operation });
    }
    
    console.log(`Download queued: ${operation.url}`);
    return operation;
  }

  async transcribeAudio(transcriptionData) {
    const operation = {
      id: crypto.randomUUID(),
      type: 'transcription',
      audioUrl: transcriptionData.audioUrl,
      audioBlob: transcriptionData.audioBlob,
      language: transcriptionData.language || 'auto',
      model: transcriptionData.model || 'whisper-1',
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      progress: 0,
      result: null,
      error: null,
      retryCount: 0
    };
    
    this.transcriptionQueue.push(operation);
    this.stats.transcriptions.total++;
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('transcription-queued', { operation });
    }
    
    console.log(`Transcription queued: ${operation.audioUrl || 'blob'}`);
    return operation;
  }

  async synthesizeSpeech(ttsData) {
    const operation = {
      id: crypto.randomUUID(),
      type: 'tts',
      text: ttsData.text,
      voice: ttsData.voice || 'alloy',
      language: ttsData.language || 'en',
      speed: ttsData.speed || 1.0,
      format: ttsData.format || 'mp3',
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      progress: 0,
      result: null,
      error: null,
      retryCount: 0
    };
    
    this.ttsQueue.push(operation);
    this.stats.tts.total++;
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('tts-queued', { operation });
    }
    
    console.log(`TTS queued: ${ttsData.text.substring(0, 50)}...`);
    return operation;
  }

  async createNote(noteData) {
    const note = {
      id: crypto.randomUUID(),
      title: noteData.title || 'Untitled Note',
      content: noteData.content || '',
      tags: noteData.tags || [],
      category: noteData.category || 'general',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: noteData.metadata || {}
    };
    
    // Save to storage
    await this.saveNoteToStorage(note);
    this.stats.notes.created++;
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('note-created', { note });
    }
    
    console.log(`Note created: ${note.id}`);
    return note;
  }

  async getNote(noteId) {
    const note = await this.getNoteFromStorage(noteId);
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }
    return note;
  }

  async updateNote(noteId, updates) {
    const note = await this.getNoteFromStorage(noteId);
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }
    
    Object.assign(note, updates);
    note.updatedAt = Date.now();
    
    await this.saveNoteToStorage(note);
    this.stats.notes.updated++;
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('note-updated', { note, updates });
    }
    
    console.log(`Note updated: ${noteId}`);
    return note;
  }

  async deleteNote(noteId) {
    const note = await this.getNoteFromStorage(noteId);
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }
    
    await this.removeNoteFromStorage(noteId);
    this.stats.notes.deleted++;
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('note-deleted', { note });
    }
    
    console.log(`Note deleted: ${noteId}`);
    return note;
  }

  async listNotes(filters = {}) {
    const notes = await this.getAllNotesFromStorage();
    
    let filteredNotes = notes;
    
    // Apply filters
    if (filters.category) {
      filteredNotes = filteredNotes.filter(note => note.category === filters.category);
    }
    
    if (filters.tags && filters.tags.length > 0) {
      filteredNotes = filteredNotes.filter(note => 
        filters.tags.some(tag => note.tags.includes(tag))
      );
    }
    
    if (filters.search) {
      const query = filters.search.toLowerCase();
      filteredNotes = filteredNotes.filter(note => 
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query)
      );
    }
    
    if (filters.createdAfter) {
      filteredNotes = filteredNotes.filter(note => note.createdAt > filters.createdAfter);
    }
    
    if (filters.createdBefore) {
      filteredNotes = filteredNotes.filter(note => note.createdAt < filters.createdBefore);
    }
    
    // Sort by creation time (newest first)
    filteredNotes.sort((a, b) => b.createdAt - a.createdAt);
    
    // Apply limit
    if (filters.limit) {
      filteredNotes = filteredNotes.slice(0, filters.limit);
    }
    
    return filteredNotes;
  }

  async searchNotes(query, options = {}) {
    const notes = await this.getAllNotesFromStorage();
    const queryLower = query.toLowerCase();
    
    const results = notes.map(note => {
      let score = 0;
      const matches = [];
      
      // Title match (highest weight)
      if (note.title.toLowerCase().includes(queryLower)) {
        score += 10;
        matches.push({ type: 'title', text: note.title });
      }
      
      // Content match
      if (note.content.toLowerCase().includes(queryLower)) {
        score += 5;
        matches.push({ type: 'content', text: note.content });
      }
      
      // Tag match
      const tagMatches = note.tags.filter(tag => 
        tag.toLowerCase().includes(queryLower)
      );
      if (tagMatches.length > 0) {
        score += 3;
        matches.push({ type: 'tags', text: tagMatches.join(', ') });
      }
      
      return { note, score, matches };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score);
    
    // Apply limit
    if (options.limit) {
      results.splice(options.limit);
    }
    
    return results;
  }

  async processDownloadQueue() {
    if (this.activeDownloads.size >= 3) return; // Max concurrent downloads
    
    const operation = this.downloadQueue.shift();
    if (!operation) return;
    
    this.activeDownloads.set(operation.id, operation);
    await this.executeDownload(operation);
  }

  async processTranscriptionQueue() {
    if (this.activeTranscriptions.size >= 2) return; // Max concurrent transcriptions
    
    const operation = this.transcriptionQueue.shift();
    if (!operation) return;
    
    this.activeTranscriptions.set(operation.id, operation);
    await this.executeTranscription(operation);
  }

  async processTTSQueue() {
    if (this.activeTTS.size >= 2) return; // Max concurrent TTS
    
    const operation = this.ttsQueue.shift();
    if (!operation) return;
    
    this.activeTTS.set(operation.id, operation);
    await this.executeTTS(operation);
  }

  async executeDownload(operation) {
    operation.status = 'downloading';
    operation.startedAt = Date.now();
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('download-started', { operation });
    }
    
    try {
      // Use Chrome downloads API for better integration
      const downloadId = await this.startChromeDownload(operation);
      
      // Monitor download progress
      this.monitorDownloadProgress(downloadId, operation);
      
    } catch (error) {
      operation.status = 'failed';
      operation.error = error.message;
      operation.completedAt = Date.now();
      
      this.stats.downloads.failed++;
      
      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('download-failed', { operation, error });
      }
      
    } finally {
      this.activeDownloads.delete(operation.id);
    }
  }

  async startChromeDownload(operation) {
    return new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: operation.url,
        filename: operation.filename,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(downloadId);
        }
      });
    });
  }

  monitorDownloadProgress(downloadId, operation) {
    const checkProgress = () => {
      chrome.downloads.search({ id: downloadId }, (results) => {
        const download = results[0];
        if (!download) return;
        
        operation.progress = download.totalBytes > 0 
          ? (download.bytesReceived / download.totalBytes) * 100 
          : 0;
        operation.bytesReceived = download.bytesReceived;
        operation.totalBytes = download.totalBytes;
        
        // Emit progress event
        if (this.eventBus) {
          this.eventBus.emit('download-progress', { operation, progress: operation.progress });
        }
        
        if (download.state === 'complete') {
          operation.status = 'completed';
          operation.completedAt = Date.now();
          this.stats.downloads.completed++;
          
          // Emit completion event
          if (this.eventBus) {
            this.eventBus.emit('download-completed', { operation });
          }
          
        } else if (download.state === 'interrupted') {
          operation.status = 'failed';
          operation.error = download.error || 'Download interrupted';
          operation.completedAt = Date.now();
          this.stats.downloads.failed++;
          
          // Emit failure event
          if (this.eventBus) {
            this.eventBus.emit('download-failed', { operation, error: operation.error });
          }
        } else {
          // Still downloading, check again
          setTimeout(checkProgress, 1000);
        }
      });
    };
    
    checkProgress();
  }

  async executeTranscription(operation) {
    operation.status = 'transcribing';
    operation.startedAt = Date.now();
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('transcription-started', { operation });
    }
    
    try {
      let audioData;
      
      if (operation.audioBlob) {
        audioData = operation.audioBlob;
      } else if (operation.audioUrl) {
        audioData = await this.fetchAudioFromUrl(operation.audioUrl);
      } else {
        throw new Error('No audio source provided');
      }
      
      // Send to Whisper API
      const result = await this.sendToWhisperAPI(audioData, operation);
      
      operation.status = 'completed';
      operation.completedAt = Date.now();
      operation.result = result;
      this.stats.transcriptions.completed++;
      
      // Create note from transcription if requested
      if (operation.createNote !== false) {
        await this.createNoteFromTranscription(operation);
      }
      
      // Emit completion event
      if (this.eventBus) {
        this.eventBus.emit('transcription-completed', { operation, result });
      }
      
    } catch (error) {
      operation.status = 'failed';
      operation.error = error.message;
      operation.completedAt = Date.now();
      this.stats.transcriptions.failed++;
      
      // Emit failure event
      if (this.eventBus) {
        this.eventBus.emit('transcription-failed', { operation, error });
      }
      
    } finally {
      this.activeTranscriptions.delete(operation.id);
    }
  }

  async executeTTS(operation) {
    operation.status = 'synthesizing';
    operation.startedAt = Date.now();
    
    // Emit event
    if (this.eventBus) {
      this.eventBus.emit('tts-started', { operation });
    }
    
    try {
      // Send to TTS API
      const result = await this.sendToTTSAPI(operation);
      
      operation.status = 'completed';
      operation.completedAt = Date.now();
      operation.result = result;
      this.stats.tts.completed++;
      
      // Emit completion event
      if (this.eventBus) {
        this.eventBus.emit('tts-completed', { operation, result });
      }
      
    } catch (error) {
      operation.status = 'failed';
      operation.error = error.message;
      operation.completedAt = Date.now();
      this.stats.tts.failed++;
      
      // Emit failure event
      if (this.eventBus) {
        this.eventBus.emit('tts-failed', { operation, error });
      }
      
    } finally {
      this.activeTTS.delete(operation.id);
    }
  }

  async fetchAudioFromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }
    return await response.blob();
  }

  async sendToWhisperAPI(audioData, operation) {
    const formData = new FormData();
    formData.append('file', audioData);
    formData.append('model', operation.model);
    formData.append('language', operation.language);
    
    const response = await fetch(this.config.apiEndpoints.whisper, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${await this.getAPIToken()}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Whisper API error: ${response.statusText}`);
    }
    
    return await response.json();
  }

  async sendToTTSAPI(operation) {
    const response = await fetch(this.config.apiEndpoints.tts, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAPIToken()}`
      },
      body: JSON.stringify({
        input: operation.text,
        model: 'tts-1',
        voice: operation.voice,
        speed: operation.speed,
        response_format: operation.format
      })
    });
    
    if (!response.ok) {
      throw new Error(`TTS API error: ${response.statusText}`);
    }
    
    return await response.blob();
  }

  async createNoteFromTranscription(operation) {
    const note = await this.createNote({
      title: `Transcription - ${new Date().toLocaleString()}`,
      content: operation.result.text || '',
      tags: ['transcription', 'audio'],
      category: 'transcriptions',
      metadata: {
        operationId: operation.id,
        audioUrl: operation.audioUrl,
        language: operation.language,
        model: operation.model
      }
    });
    
    return note;
  }

  async cancelOperation(operationId, type) {
    switch (type) {
      case 'download':
        return await this.cancelDownload(operationId);
      case 'transcription':
        return await this.cancelTranscription(operationId);
      case 'tts':
        return await this.cancelTTS(operationId);
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }

  async cancelDownload(operationId) {
    const operation = this.activeDownloads.get(operationId);
    if (operation) {
      // Cancel Chrome download if possible
      operation.status = 'cancelled';
      operation.completedAt = Date.now();
      this.activeDownloads.delete(operationId);
      
      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('download-cancelled', { operation });
      }
      
      return operation;
    }
    
    // Remove from queue if still queued
    const queueIndex = this.downloadQueue.findIndex(op => op.id === operationId);
    if (queueIndex !== -1) {
      const operation = this.downloadQueue.splice(queueIndex, 1)[0];
      operation.status = 'cancelled';
      operation.completedAt = Date.now();
      
      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('download-cancelled', { operation });
      }
      
      return operation;
    }
    
    throw new Error(`Download operation not found: ${operationId}`);
  }

  async cancelTranscription(operationId) {
    const operation = this.activeTranscriptions.get(operationId);
    if (operation) {
      operation.status = 'cancelled';
      operation.completedAt = Date.now();
      this.activeTranscriptions.delete(operationId);
      
      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('transcription-cancelled', { operation });
      }
      
      return operation;
    }
    
    // Remove from queue if still queued
    const queueIndex = this.transcriptionQueue.findIndex(op => op.id === operationId);
    if (queueIndex !== -1) {
      const operation = this.transcriptionQueue.splice(queueIndex, 1)[0];
      operation.status = 'cancelled';
      operation.completedAt = Date.now();
      
      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('transcription-cancelled', { operation });
      }
      
      return operation;
    }
    
    throw new Error(`Transcription operation not found: ${operationId}`);
  }

  async cancelTTS(operationId) {
    const operation = this.activeTTS.get(operationId);
    if (operation) {
      operation.status = 'cancelled';
      operation.completedAt = Date.now();
      this.activeTTS.delete(operationId);
      
      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('tts-cancelled', { operation });
      }
      
      return operation;
    }
    
    // Remove from queue if still queued
    const queueIndex = this.ttsQueue.findIndex(op => op.id === operationId);
    if (queueIndex !== -1) {
      const operation = this.ttsQueue.splice(queueIndex, 1)[0];
      operation.status = 'cancelled';
      operation.completedAt = Date.now();
      
      // Emit event
      if (this.eventBus) {
        this.eventBus.emit('tts-cancelled', { operation });
      }
      
      return operation;
    }
    
    throw new Error(`TTS operation not found: ${operationId}`);
  }

  extractFilename(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      return filename || 'download';
    } catch {
      return 'download';
    }
  }

  async getAPIToken() {
    // Get API token from secure storage
    if (this.storageManager) {
      const token = await this.storageManager.getData('apiToken');
      return token || '';
    }
    return '';
  }

  async loadStoredData() {
    // Load notes and other stored data
    if (this.storageManager) {
      try {
        // Load stats
        const stats = await this.storageManager.getData('server-skills-stats');
        if (stats) {
          this.stats = { ...this.stats, ...stats };
        }
      } catch (error) {
        console.error('Error loading stored data:', error);
      }
    }
  }

  async resumePendingOperations() {
    // Resume any pending operations from previous session
    // This would involve checking storage for incomplete operations
  }

  async saveNoteToStorage(note) {
    if (this.storageManager) {
      await this.storageManager.storeData(`note-${note.id}`, note, { indexed: true });
    }
  }

  async getNoteFromStorage(noteId) {
    if (this.storageManager) {
      return await this.storageManager.getData(`note-${noteId}`, { indexed: true });
    }
    return null;
  }

  async removeNoteFromStorage(noteId) {
    if (this.storageManager) {
      await this.storageManager.removeData(`note-${noteId}`, { indexed: true });
    }
  }

  async getAllNotesFromStorage() {
    if (this.storageManager) {
      const allData = await this.storageManager.indexedDB.getAll('largeData');
      return allData
        .filter(item => item.id.startsWith('note-'))
        .map(item => item.data);
    }
    return [];
  }

  getStats() {
    return {
      ...this.stats,
      queues: {
        downloads: this.downloadQueue.length,
        transcriptions: this.transcriptionQueue.length,
        tts: this.ttsQueue.length
      },
      active: {
        downloads: this.activeDownloads.size,
        transcriptions: this.activeTranscriptions.size,
        tts: this.activeTTS.size
      }
    };
  }

  getVersion() {
    return this.version;
  }

  getName() {
    return this.name;
  }

  isActive() {
    return this.isActive;
  }

  getDependencies() {
    return [];
  }

  getContextMenuItems() {
    return [
      {
        id: 'server-skills_download',
        title: 'Download with AI Assistant',
        contexts: ['link']
      },
      {
        id: 'server-skills_transcribe',
        title: 'Transcribe Audio',
        contexts: ['video', 'audio']
      },
      {
        id: 'server-skills_create_note',
        title: 'Create Note from Selection',
        contexts: ['selection']
      }
    ];
  }

  getContentScripts() {
    return [];
  }

  async handleContextMenu(info, tab) {
    switch (info.menuItemId) {
      case 'server-skills_download':
        await this.downloadFromContext(info, tab);
        break;
        
      case 'server-skills_transcribe':
        await this.transcribeFromContext(info, tab);
        break;
        
      case 'server-skills_create_note':
        await this.createNoteFromContext(info, tab);
        break;
    }
  }

  async downloadFromContext(info, tab) {
    if (info.linkUrl) {
      await this.downloadFile({
        url: info.linkUrl,
        saveTo: 'downloads'
      });
    }
  }

  async transcribeFromContext(info, tab) {
    // Get audio/video element from page
    chrome.tabs.sendMessage(tab.id, {
      action: 'get-media-element',
      skill: 'server-skills'
    }, async (response) => {
      if (response && response.mediaUrl) {
        await this.transcribeAudio({
          audioUrl: response.mediaUrl
        });
      }
    });
  }

  async createNoteFromContext(info, tab) {
    if (info.selectionText) {
      await this.createNote({
        title: `Note from ${tab.title}`,
        content: info.selectionText,
        tags: ['selection', 'web'],
        metadata: {
          sourceUrl: tab.url,
          sourceTitle: tab.title
        }
      });
    }
  }

  async getHealth() {
    const stats = this.getStats();
    const healthScore = this.calculateHealthScore(stats);
    
    return {
      status: healthScore > 0.8 ? 'healthy' : healthScore > 0.5 ? 'warning' : 'error',
      score: healthScore,
      stats,
      timestamp: Date.now()
    };
  }

  calculateHealthScore(stats) {
    let score = 1.0;
    
    // Check failure rates
    if (stats.downloads.total > 0) {
      const failureRate = stats.downloads.failed / stats.downloads.total;
      score -= failureRate * 0.3;
    }
    
    if (stats.transcriptions.total > 0) {
      const failureRate = stats.transcriptions.failed / stats.transcriptions.total;
      score -= failureRate * 0.3;
    }
    
    if (stats.tts.total > 0) {
      const failureRate = stats.tts.failed / stats.tts.total;
      score -= failureRate * 0.3;
    }
    
    // Check queue sizes
    if (stats.queues.downloads > 20) score -= 0.2;
    if (stats.queues.transcriptions > 10) score -= 0.2;
    if (stats.queues.tts > 10) score -= 0.2;
    
    return Math.max(0, score);
  }
}

export { ServerSkillsSkill };
