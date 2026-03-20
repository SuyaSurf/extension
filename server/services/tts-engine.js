import { KokoroTTSEngine } from './kokoro-tts-engine.js';
import { cache } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

export class TTSEngine {
  constructor() {
    this.kokoroEngine = new KokoroTTSEngine();
    this.cacheEnabled = true;
    this.defaultProvider = 'kokoro';
  }

  async synthesize(synthesisData) {
    const {
      text,
      voiceId,
      provider = this.defaultProvider,
      format = 'wav',
      speed = 1.0,
      pitch = 0.0,
      userId
    } = synthesisData;

    // Generate cache key
    const textHash = this.generateTextHash(text);
    const cacheKey = `tts:${provider}:${voiceId}:${textHash}:${format}:${speed}:${pitch}`;

    // Check cache first
    if (this.cacheEnabled) {
      const cached = await this.getCachedAudio(cacheKey);
      if (cached) {
        logger.debug('TTS cache hit', { provider, voiceId, textHash });
        return cached;
      }
    }

    // Generate audio using Kokoro TTS
    let audioBuffer;
    try {
      switch (provider) {
        case 'kokoro':
          audioBuffer = await this.synthesizeWithKokoro(text, voiceId, format, speed, pitch);
          break;
        default:
          throw new AppError(`Unsupported TTS provider: ${provider}`);
      }

      // Cache the result
      if (this.cacheEnabled && audioBuffer) {
        await this.cacheAudio(cacheKey, audioBuffer, {
          text,
          voiceId,
          provider,
          format,
          userId
        });
      }

      return {
        audio: audioBuffer,
        provider,
        voiceId,
        format,
        text,
        cached: false
      };

    } catch (error) {
      logger.error('TTS synthesis failed', { provider, voiceId, error: error.message });
      throw error;
    }
  }

  async synthesizeWithKokoro(text, voiceId, format, speed, pitch) {
    try {
      const result = await this.kokoroEngine.synthesize({
        text,
        voiceId,
        format,
        speed,
        pitch
      });
      
      return result.audio;
    } catch (error) {
      throw new AppError(`Kokoro TTS failed: ${error.message}`);
    }
  }

  async streamSynthesize(synthesisData, response) {
    const { text, voiceId, provider = this.defaultProvider, format = 'wav' } = synthesisData;

    try {
      if (provider === 'kokoro') {
        return await this.kokoroEngine.streamSynthesize({
          text,
          voiceId,
          format,
          userId: synthesisData.userId
        }, response);
      } else {
        // For other providers, fall back to regular synthesis
        const result = await this.synthesize(synthesisData);
        
        // Set appropriate headers for streaming
        response.header('Content-Type', `audio/${format}`);
        response.header('Transfer-Encoding', 'chunked');
        
        return response.send(result.audio);
      }
    } catch (error) {
      logger.error('TTS streaming failed', { provider, voiceId, error: error.message });
      throw error;
    }
  }

  async streamWithOpenAI(text, voiceId, format, response) {
    try {
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: this.mapVoiceToOpenAI(voiceId),
        input: text,
        response_format: format === 'opus' ? 'opus' : 'mp3'
      });

      response.header('Content-Type', `audio/${format}`);
      response.header('Transfer-Encoding', 'chunked');

      // Stream the audio
      const buffer = Buffer.from(await mp3.arrayBuffer());
      return response.send(buffer);
    } catch (error) {
      throw new AppError(`OpenAI TTS streaming failed: ${error.message}`);
    }
  }

  async getVoices(provider = null) {
    if (provider && provider !== 'kokoro') {
      return { provider, voices: [] };
    }

    const voices = await this.kokoroEngine.getVoices();
    return voices;
  }

  async batchSynthesize(texts, options = {}) {
    const { voiceId, provider = this.defaultProvider, format = 'wav' } = options;
    const results = [];

    if (provider === 'kokoro') {
      return await this.kokoroEngine.batchSynthesize(texts, options);
    }

    for (const text of texts) {
      try {
        const result = await this.synthesize({
          text,
          voiceId,
          provider,
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

  async getCachedAudio(cacheKey) {
    try {
      const cached = await cache.get(cacheKey);
      if (cached && cached.audioPath) {
        const fs = require('fs/promises');
        const audioBuffer = await fs.readFile(cached.audioPath);
        return {
          audio: audioBuffer,
          cached: true,
          ...cached
        };
      }
      return null;
    } catch (error) {
      logger.warn('Failed to get cached audio', { cacheKey, error: error.message });
      return null;
    }
  }

  async cacheAudio(cacheKey, audioBuffer, metadata) {
    try {
      const fs = require('fs/promises');
      const path = require('path');
      const crypto = require('crypto');
      
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
        provider: metadata.provider,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      };
      
      await cache.set(cacheKey, cacheData, 7 * 24 * 60 * 60); // 7 days
      
      logger.debug('TTS audio cached', { cacheKey, audioSize: audioBuffer.length });
    } catch (error) {
      logger.warn('Failed to cache audio', { cacheKey, error: error.message });
    }
  }

  generateTextHash(text) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
  }

  mapVoiceToOpenAI(voiceId) {
    const voiceMap = {
      'alloy': 'alloy',
      'echo': 'echo',
      'fable': 'fable',
      'onyx': 'onyx',
      'nova': 'nova',
      'shimmer': 'shimmer',
      'male': 'onyx',
      'female': 'nova',
      'neutral': 'alloy'
    };
    
    return voiceMap[voiceId] || voiceId || 'alloy';
  }

  mapVoiceToGoogle(voiceId) {
    // If it's already a Google voice ID, use it directly
    if (voiceId.startsWith('en-US-')) {
      const [languageCode, name] = voiceId.split('-');
      return {
        languageCode: `${languageCode}-${name.split('-')[0]}`,
        name: voiceId
      };
    }
    
    // Map common voice names to Google voices
    const voiceMap = {
      'male': { languageCode: 'en-US', name: 'en-US-Neural2-D' },
      'female': { languageCode: 'en-US', name: 'en-US-Neural2-C' },
      'neutral': { languageCode: 'en-US', name: 'en-US-Neural2-J' }
    };
    
    return voiceMap[voiceId] || voiceMap['neutral'];
  }

  mapFormatToGoogle(format) {
    const formatMap = {
      'mp3': 'MP3',
      'wav': 'WAV',
      'ogg': 'OGG_OPUS',
      'opus': 'OGG_OPUS'
    };
    
    return formatMap[format] || 'MP3';
  }

  async getStats() {
    return await this.kokoroEngine.getStats();
  }

  async clearCache() {
    return await this.kokoroEngine.clearCache();
  }
}
