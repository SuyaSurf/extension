import Joi from 'joi';
import { TTSEngine } from '../services/tts-engine.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const ttsEngine = new TTSEngine();

// Validation schemas
const synthesizeSchema = Joi.object({
  text: Joi.string().min(1).max(4096).required(),
  voiceId: Joi.string().default('onyx-best'),
  provider: Joi.string().valid('kokoro').default('kokoro'),
  format: Joi.string().valid('wav', 'mp3', 'opus', 'ogg').default('wav'),
  speed: Joi.number().min(0.25).max(4.0).default(1.0),
  pitch: Joi.number().min(-20.0).max(20.0).default(0.0)
});

const streamSchema = Joi.object({
  text: Joi.string().min(1).max(4096).required(),
  voiceId: Joi.string().default('onyx-best'),
  provider: Joi.string().valid('kokoro').default('kokoro'),
  format: Joi.string().valid('wav', 'mp3', 'opus', 'ogg').default('wav')
});

const batchSchema = Joi.object({
  texts: Joi.array().items(Joi.string().min(1).max(4096)).min(1).max(50).required(),
  voiceId: Joi.string().default('onyx-best'),
  provider: Joi.string().valid('kokoro').default('kokoro'),
  format: Joi.string().valid('wav', 'mp3', 'opus', 'ogg').default('wav')
});

// Routes
async function ttsRoutes(fastify, options) {
  // Synthesize speech
  fastify.post('/synthesize', {
    schema: {
      body: synthesizeSchema
    }
  }, async (request, reply) => {
    const { text, voiceId, provider, format, speed, pitch } = request.body;
    const userId = request.user.id;

    try {
      const result = await ttsEngine.synthesize({
        text,
        voiceId,
        provider,
        format,
        speed,
        pitch,
        userId
      });

      logger.info('Speech synthesized', { provider, voiceId, textLength: text.length, userId, cached: result.cached });

      // Return audio as base64 for API responses
      reply.header('Content-Type', 'application/json');
      return {
        success: true,
        audio: result.audio.toString('base64'),
        format: result.format,
        provider: result.provider,
        voiceId: result.voiceId,
        cached: result.cached,
        textLength: text.length
      };
    } catch (error) {
      logger.error('Speech synthesis failed', { provider, voiceId, userId, error: error.message });
      throw error;
    }
  });

  // Stream speech
  fastify.post('/stream', {
    schema: {
      body: streamSchema
    }
  }, async (request, reply) => {
    const { text, voiceId, provider, format } = request.body;
    const userId = request.user.id;

    try {
      logger.info('Speech streaming started', { provider, voiceId, textLength: text.length, userId });

      return await ttsEngine.streamSynthesize({
        text,
        voiceId,
        provider,
        format,
        userId
      }, reply);
    } catch (error) {
      logger.error('Speech streaming failed', { provider, voiceId, userId, error: error.message });
      throw error;
    }
  });

  // Get available voices
  fastify.get('/voices', async (request, reply) => {
    const { provider } = request.query;

    try {
      const voices = await ttsEngine.getVoices(provider);
      
      return {
        success: true,
        voices: Array.isArray(voices) ? voices : [voices]
      };
    } catch (error) {
      logger.error('Failed to get voices', { provider, error: error.message });
      throw error;
    }
  });

  // Batch synthesis
  fastify.post('/batch', {
    schema: {
      body: batchSchema
    }
  }, async (request, reply) => {
    const { texts, voiceId, provider, format } = request.body;
    const userId = request.user.id;

    try {
      const results = await ttsEngine.batchSynthesize(texts, {
        voiceId,
        provider,
        format,
        userId
      });

      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      logger.info('Batch synthesis completed', { 
        total: texts.length, 
        successful, 
        failed, 
        provider, 
        voiceId, 
        userId 
      });

      return {
        success: true,
        results: results.map(result => ({
          text: result.text,
          success: result.success,
          audio: result.success ? result.audio.toString('base64') : null,
          cached: result.cached,
          error: result.error
        })),
        stats: {
          total: texts.length,
          successful,
          failed
        }
      };
    } catch (error) {
      logger.error('Batch synthesis failed', { provider, voiceId, userId, error: error.message });
      throw error;
    }
  });

  // Get TTS statistics
  fastify.get('/stats', async (request, reply) => {
    try {
      const stats = await ttsEngine.getStats();
      
      return {
        success: true,
        stats
      };
    } catch (error) {
      logger.error('Failed to get TTS stats', { error: error.message });
      throw error;
    }
  });

  // Clear TTS cache
  fastify.delete('/cache', async (request, reply) => {
    const userId = request.user.id;

    try {
      await ttsEngine.clearCache();
      
      logger.info('TTS cache cleared', { userId });

      return {
        success: true,
        message: 'TTS cache cleared successfully'
      };
    } catch (error) {
      logger.error('Failed to clear TTS cache', { userId, error: error.message });
      throw error;
    }
  });

  // Health check for TTS service
  fastify.get('/health', async (request, reply) => {
    try {
      const health = await ttsEngine.kokoroEngine.healthCheck();
      
      return {
        success: true,
        health,
        availableProviders: ['kokoro'],
        defaultProvider: 'kokoro'
      };
    } catch (error) {
      logger.error('TTS health check failed', { error: error.message });
      throw error;
    }
  });

  // Get supported formats
  fastify.get('/formats', async (request, reply) => {
    try {
      const formats = [
        { format: 'mp3', description: 'MPEG Audio Layer III', quality: 'good' },
        { format: 'wav', description: 'Waveform Audio File Format', quality: 'excellent' },
        { format: 'opus', description: 'Opus Audio Codec', quality: 'excellent' },
        { format: 'ogg', description: 'Ogg Vorbis', quality: 'good' }
      ];

      return {
        success: true,
        formats
      };
    } catch (error) {
      logger.error('Failed to get supported formats', { error: error.message });
      throw error;
    }
  });

  // Validate text for TTS
  fastify.post('/validate', {
    schema: {
      body: Joi.object({
        text: Joi.string().required(),
        provider: Joi.string().valid('openai', 'google', 'local').default('openai')
      })
    }
  }, async (request, reply) => {
    const { text, provider } = request.body;

    try {
      const validation = {
        valid: true,
        warnings: [],
        errors: []
      };

      // Check text length
      if (text.length > 4096) {
        validation.valid = false;
        validation.errors.push('Text too long (max 4096 characters)');
      }

      if (text.length < 1) {
        validation.valid = false;
        validation.errors.push('Text cannot be empty');
      }

      // Check for potentially problematic characters
      const problematicChars = /[^\x00-\x7F]/g;
      if (problematicChars.test(text)) {
        validation.warnings.push('Text contains non-ASCII characters which may not be supported by all providers');
      }

      // Provider-specific validation
      if (provider === 'openai' && text.length > 4000) {
        validation.warnings.push('OpenAI TTS works best with text under 4000 characters');
      }

      return {
        success: true,
        validation
      };
    } catch (error) {
      logger.error('Text validation failed', { provider, error: error.message });
      throw error;
    }
  });
}

export default ttsRoutes;
