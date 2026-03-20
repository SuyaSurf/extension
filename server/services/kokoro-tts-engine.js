import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';
import { cache } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class KokoroTTSEngine {
  constructor() {
    this.workerPool = [];
    this.maxWorkers = process.env.KOKORO_WORKERS ? parseInt(process.env.KOKORO_WORKERS) : 2;
    this.defaultVoice = 'onyx-best';
    this.cacheEnabled = true;
    this.modelPath = process.env.KOKORO_MODEL_PATH || './models/kokoro';
    
    this.initializeWorkerPool();
  }

  async initializeWorkerPool() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(path.join(__dirname, 'kokoro-tts-worker.js'), {
        workerData: {
          modelPath: this.modelPath,
          workerId: i
        }
      });
      
      worker.on('error', (error) => {
        logger.error('Kokoro TTS worker error:', error);
      });
      
      worker.on('exit', (code) => {
        if (code !== 0) {
          logger.error(`Kokoro TTS worker stopped with exit code ${code}`);
        }
      });
      
      this.workerPool.push({
        worker,
        busy: false,
        id: i
      });
    }
    
    logger.info(`Kokoro TTS initialized with ${this.maxWorkers} workers`);
  }

  async synthesize(synthesisData) {
    const {
      text,
      voiceId = this.defaultVoice,
      format = 'wav',
      speed = 1.0,
      pitch = 0.0,
      userId
    } = synthesisData;

    // Generate cache key
    const textHash = this.generateTextHash(text);
    const cacheKey = `kokoro-tts:${voiceId}:${textHash}:${format}:${speed}:${pitch}`;

    // Check cache first
    if (this.cacheEnabled) {
      const cached = await this.getCachedAudio(cacheKey);
      if (cached) {
        logger.debug('Kokoro TTS cache hit', { voiceId, textHash });
        return cached;
      }
    }

    // Generate audio using worker pool
    const audioBuffer = await this.synthesizeWithWorker(text, voiceId, format, speed, pitch);

    // Cache the result
    if (this.cacheEnabled && audioBuffer) {
      await this.cacheAudio(cacheKey, audioBuffer, {
        text,
        voiceId,
        format,
        userId
      });
    }

    return {
      audio: audioBuffer,
      provider: 'kokoro',
      voiceId,
      format,
      text,
      cached: false
    };
  }

  async synthesizeWithWorker(text, voiceId, format, speed, pitch) {
    return new Promise((resolve, reject) => {
      const worker = this.getAvailableWorker();
      if (!worker) {
        reject(new AppError('No available TTS workers'));
        return;
      }

      const jobId = Date.now().toString();
      
      worker.worker.postMessage({
        type: 'synthesize',
        jobId,
        text,
        voiceId,
        format,
        speed,
        pitch
      });

      const timeout = setTimeout(() => {
        worker.busy = false;
        reject(new AppError('TTS synthesis timeout'));
      }, 30000); // 30 seconds timeout

      worker.worker.once('message', (message) => {
        clearTimeout(timeout);
        worker.busy = false;
        
        if (message.jobId !== jobId) {
          return; // Ignore other messages
        }

        if (message.error) {
          reject(new AppError(`Kokoro TTS failed: ${message.error}`));
        } else {
          resolve(Buffer.from(message.audio, 'base64'));
        }
      });

      worker.busy = true;
    });
  }

  async streamSynthesize(synthesisData, response) {
    const { text, voiceId = this.defaultVoice, format = 'wav' } = synthesisData;

    try {
      // For streaming, we synthesize and then stream the result
      const result = await this.synthesize({
        text,
        voiceId,
        format,
        userId: synthesisData.userId
      });
      
      // Set appropriate headers for streaming
      response.header('Content-Type', `audio/${format}`);
      response.header('Transfer-Encoding', 'chunked');
      
      return response.send(result.audio);
    } catch (error) {
      logger.error('Kokoro TTS streaming failed', { voiceId, error: error.message });
      throw error;
    }
  }

  async getVoices() {
    // Available Kokoro voices with Onyx setup
    const voices = [
      {
        id: 'onyx-best',
        name: 'Onyx Best Quality',
        language: 'en',
        gender: 'female',
        description: 'Highest quality voice using Onyx model',
        quality: 'excellent'
      },
      {
        id: 'onyx-fast',
        name: 'Onyx Fast',
        language: 'en',
        gender: 'female',
        description: 'Fast inference with good quality',
        quality: 'good'
      },
      {
        id: 'onyx-male',
        name: 'Onyx Male',
        language: 'en',
        gender: 'male',
        description: 'Male voice variant',
        quality: 'excellent'
      },
      {
        id: 'kokoro-default',
        name: 'Kokoro Default',
        language: 'en',
        gender: 'female',
        description: 'Standard Kokoro voice',
        quality: 'good'
      }
    ];

    return {
      provider: 'kokoro',
      voices
    };
  }

  async batchSynthesize(texts, options = {}) {
    const { voiceId = this.defaultVoice, format = 'wav' } = options;
    const results = [];

    for (const text of texts) {
      try {
        const result = await this.synthesize({
          text,
          voiceId,
          format,
          userId: options.userId
        });
        
        results.push({
          text,
          success: true,
          audio: result.audio,
          cached: result.cached
        });
      } catch (error) {
        results.push({
          text,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  getAvailableWorker() {
    return this.workerPool.find(w => !w.busy);
  }

  async getCachedAudio(cacheKey) {
    try {
      const cached = await cache.get(cacheKey);
      if (cached && cached.audioPath) {
        const audioBuffer = await fs.readFile(cached.audioPath);
        return {
          audio: audioBuffer,
          cached: true,
          ...cached
        };
      }
      return null;
    } catch (error) {
      logger.warn('Failed to get cached TTS audio', { cacheKey, error: error.message });
      return null;
    }
  }

  async cacheAudio(cacheKey, audioBuffer, metadata) {
    try {
      // Generate unique filename
      const filename = `${cacheKey.replace(/[^a-zA-Z0-9]/g, '')}.wav`;
      const audioPath = path.join(process.cwd(), 'uploads', 'tts', filename);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(audioPath), { recursive: true });
      
      // Save audio file
      await fs.writeFile(audioPath, audioBuffer);
      
      // Cache metadata
      const cacheData = {
        audioPath,
        audioSize: audioBuffer.length,
        format: metadata.format,
        voiceId: metadata.voiceId,
        provider: 'kokoro',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      };
      
      await cache.set(cacheKey, cacheData, 7 * 24 * 60 * 60); // 7 days
      
      logger.debug('Kokoro TTS audio cached', { cacheKey, audioSize: audioBuffer.length });
    } catch (error) {
      logger.warn('Failed to cache TTS audio', { cacheKey, error: error.message });
    }
  }

  generateTextHash(text) {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
  }

  async getStats() {
    return {
      totalSyntheses: await this.getSynthesisCount(),
      cacheHitRate: await this.getCacheHitRate(),
      popularVoices: await this.getPopularVoices(),
      workerUtilization: this.getWorkerUtilization()
    };
  }

  async getSynthesisCount() {
    // This would track total syntheses
    return 0;
  }

  async getCacheHitRate() {
    // This would calculate cache hit rate
    return 0.85; // Placeholder
  }

  async getPopularVoices() {
    // This would track voice usage
    return [
      { voiceId: 'onyx-best', usage: 45 },
      { voiceId: 'onyx-fast', usage: 30 },
      { voiceId: 'kokoro-default', usage: 25 }
    ];
  }

  getWorkerUtilization() {
    const busyWorkers = this.workerPool.filter(w => w.busy).length;
    return {
      busy: busyWorkers,
      total: this.workerPool.length,
      utilization: (busyWorkers / this.workerPool.length) * 100
    };
  }

  async clearCache() {
    const cacheDir = path.join(process.cwd(), 'uploads', 'tts');
    
    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
      await fs.mkdir(cacheDir, { recursive: true });
      logger.info('Kokoro TTS cache cleared');
    } catch (error) {
      logger.warn('Failed to clear TTS cache', { error: error.message });
    }
  }

  async healthCheck() {
    try {
      // Test synthesis with a short text
      const testText = "Hello world";
      const result = await this.synthesize({
        text: testText,
        voiceId: this.defaultVoice,
        format: 'wav'
      });

      return {
        status: 'healthy',
        modelPath: this.modelPath,
        workers: this.workerPool.length,
        defaultVoice: this.defaultVoice,
        testSynthesis: {
          success: !!result.audio,
          audioSize: result.audio?.length || 0
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}
