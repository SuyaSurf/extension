import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { Worker } from 'worker_threads';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { TranscriptionModel } from '../models/transcription.js';
import { cache } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

export class WhisperEngine {
  constructor() {
    this.openai = process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    }) : null;
    
    this.activeJobs = new Map();
    this.workerPool = [];
    this.maxWorkers = process.env.WHISPER_WORKERS ? parseInt(process.env.WHISPER_WORKERS) : 2;
    
    // Initialize worker pool for local processing
    this.initializeWorkerPool();
  }

  async initializeWorkerPool() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(path.join(import.meta.dirname, 'whisper-worker.js'));
      
      worker.on('error', (error) => {
        logger.error('Whisper worker error:', error);
      });
      
      worker.on('exit', (code) => {
        if (code !== 0) {
          logger.error(`Whisper worker stopped with exit code ${code}`);
        }
      });
      
      this.workerPool.push(worker);
    }
  }

  async transcribe(transcriptionData) {
    const {
      audioPath,
      audioUrl,
      language,
      model = 'base',
      options = {}
    } = transcriptionData;

    const userId = options.userId;
    
    // Create transcription record
    const transcription = await TranscriptionModel.create({
      audioPath,
      language,
      userId,
      options: { model, ...options }
    });

    // Start transcription in background
    this.processTranscription(transcription.id, audioPath, audioUrl, language, model, options);

    return transcription;
  }

  async processTranscription(id, audioPath, audioUrl, language, model, options) {
    try {
      await TranscriptionModel.updateStatus(id, 'processing');
      
      let processedAudioPath;
      
      if (audioUrl) {
        // Download audio from URL
        processedAudioPath = await this.downloadAndProcessAudio(audioUrl, id);
      } else {
        // Process uploaded audio file
        processedAudioPath = await this.processAudioFile(audioPath, id);
      }

      // Choose processing method
      let result;
      if (this.openai && (model === 'whisper-1' || options.useCloud)) {
        result = await this.transcribeWithOpenAI(processedAudioPath, language, options);
      } else {
        result = await this.transcribeLocally(processedAudioPath, language, model, options);
      }

      // Update transcription with result
      await TranscriptionModel.updateStatus(id, 'completed', result);
      
      // Cache result
      await cache.set(`transcription:${id}`, result, 86400); // 24 hours
      
      logger.info('Transcription completed', { id, language, model });

    } catch (error) {
      logger.error('Transcription failed', { id, error: error.message });
      await TranscriptionModel.updateStatus(id, 'failed', null, error.message);
    } finally {
      // Cleanup temporary files
      await this.cleanupTempFiles(id);
    }
  }

  async downloadAndProcessAudio(audioUrl, transcriptionId) {
    try {
      // Download audio file
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText}`);
      }

      const tempDir = path.join(process.cwd(), 'uploads', 'temp', transcriptionId);
      await fs.mkdir(tempDir, { recursive: true });
      
      const downloadPath = path.join(tempDir, 'download');
      const buffer = await response.arrayBuffer();
      await fs.writeFile(downloadPath, Buffer.from(buffer));

      // Process audio file
      return await this.processAudioFile(downloadPath, transcriptionId);
      
    } catch (error) {
      throw new AppError(`Failed to download audio: ${error.message}`);
    }
  }

  async processAudioFile(audioPath, transcriptionId) {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp', transcriptionId);
    await fs.mkdir(tempDir, { recursive: true });
    
    const outputPath = path.join(tempDir, 'processed.wav');

    return new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .outputOptions([
          '-acodec pcm_s16le',
          '-ar 16000',
          '-ac 1'
        ])
        .format('wav')
        .on('end', () => {
          logger.debug('Audio processing completed', { input: audioPath, output: outputPath });
          resolve(outputPath);
        })
        .on('error', (error) => {
          logger.error('Audio processing failed', { input: audioPath, error: error.message });
          reject(new AppError(`Audio processing failed: ${error.message}`));
        })
        .save(outputPath);
    });
  }

  async transcribeWithOpenAI(audioPath, language, options) {
    if (!this.openai) {
      throw new AppError('OpenAI API not configured');
    }

    try {
      const audioBuffer = await fs.readFile(audioPath);
      
      const transcriptionOptions = {
        file: audioBuffer,
        model: 'whisper-1',
        response_format: 'verbose_json'
      };

      if (language) {
        transcriptionOptions.language = language;
      }

      if (options.timestamps) {
        transcriptionOptions.timestamp_granularities = ['word', 'segment'];
      }

      const response = await this.openai.audio.transcriptions.create(transcriptionOptions);

      return {
        text: response.text,
        language: response.language || language,
        duration: response.duration,
        words: response.words || [],
        segments: response.segments || []
      };

    } catch (error) {
      throw new AppError(`OpenAI transcription failed: ${error.message}`);
    }
  }

  async transcribeLocally(audioPath, language, model, options) {
    return new Promise((resolve, reject) => {
      // Get available worker
      const worker = this.getAvailableWorker();
      if (!worker) {
        reject(new AppError('No available transcription workers'));
        return;
      }

      const jobId = Date.now().toString();
      
      worker.postMessage({
        type: 'transcribe',
        jobId,
        audioPath,
        language,
        model,
        options
      });

      const timeout = setTimeout(() => {
        worker.removeAllListeners('message');
        reject(new AppError('Transcription timeout'));
      }, 300000); // 5 minutes timeout

      worker.once('message', (message) => {
        clearTimeout(timeout);
        
        if (message.jobId !== jobId) {
          return; // Ignore other messages
        }

        if (message.error) {
          reject(new AppError(`Local transcription failed: ${message.error}`));
        } else {
          resolve(message.result);
        }
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        reject(new AppError(`Worker error: ${error.message}`));
      });
    });
  }

  getAvailableWorker() {
    // Simple round-robin worker selection
    return this.workerPool.find(worker => !worker.busy);
  }

  async getTranscriptionResult(id) {
    // Try cache first
    const cached = await cache.get(`transcription:${id}`);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const transcription = await TranscriptionModel.findById(id);
    if (!transcription) {
      throw new AppError('Transcription not found', 404);
    }

    return {
      id: transcription.id,
      status: transcription.status,
      result: transcription.result,
      error: transcription.error,
      language: transcription.language,
      model: transcription.model,
      createdAt: transcription.created_at,
      updatedAt: transcription.updated_at,
      completedAt: transcription.completed_at
    };
  }

  async cleanupTempFiles(transcriptionId) {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp', transcriptionId);
    
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      logger.debug('Cleaned up temp files', { transcriptionId });
    } catch (error) {
      logger.warn('Failed to cleanup temp files', { transcriptionId, error: error.message });
    }
  }

  async batchTranscribe(audioFiles, options = {}) {
    const { language, model = 'base', userId } = options;
    const results = [];

    for (const audioFile of audioFiles) {
      try {
        const transcription = await this.transcribe({
          audioPath: audioFile.path,
          language,
          model,
          options: { userId }
        });
        
        results.push({
          originalFile: audioFile.name,
          transcriptionId: transcription.id,
          status: 'pending'
        });
      } catch (error) {
        results.push({
          originalFile: audioFile.name,
          error: error.message,
          status: 'failed'
        });
      }
    }

    return results;
  }

  async getSupportedLanguages() {
    return [
      'af', 'ar', 'hy', 'az', 'be', 'bs', 'bg', 'ca', 'zh', 'hr', 'cs', 'da', 'nl',
      'en', 'et', 'fi', 'fr', 'gl', 'de', 'el', 'he', 'hi', 'hu', 'is', 'id', 'it',
      'ja', 'kn', 'kk', 'ko', 'lv', 'lt', 'mk', 'ms', 'mr', 'mi', 'ne', 'no', 'fa',
      'pl', 'pt', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sw', 'sv', 'tl', 'ta', 'th',
      'tr', 'uk', 'ur', 'vi', 'cy'
    ];
  }

  async getModels() {
    const models = ['tiny', 'base', 'small', 'medium', 'large'];
    
    if (this.openai) {
      models.push('whisper-1');
    }
    
    return models;
  }
}
