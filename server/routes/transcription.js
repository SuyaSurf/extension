import Joi from 'joi';
import { WhisperEngine } from '../services/whisper-engine.js';
import { TranscriptionModel } from '../models/transcription.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const whisperEngine = new WhisperEngine();

// Validation schemas
const uploadTranscriptionSchema = Joi.object({
  language: Joi.string().optional(),
  model: Joi.string().valid('tiny', 'base', 'small', 'medium', 'large', 'whisper-1').default('base'),
  timestamps: Joi.boolean().default(false),
  diarization: Joi.boolean().default(false),
  useCloud: Joi.boolean().default(false)
});

const urlTranscriptionSchema = Joi.object({
  audioUrl: Joi.string().uri().required(),
  language: Joi.string().optional(),
  model: Joi.string().valid('tiny', 'base', 'small', 'medium', 'large', 'whisper-1').default('base'),
  timestamps: Joi.boolean().default(false),
  diarization: Joi.boolean().default(false),
  useCloud: Joi.boolean().default(false)
});

const batchTranscriptionSchema = Joi.object({
  files: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    path: Joi.string().required()
  })).min(1).max(10).required(),
  language: Joi.string().optional(),
  model: Joi.string().valid('tiny', 'base', 'small', 'medium', 'large', 'whisper-1').default('base'),
  useCloud: Joi.boolean().default(false)
});

const statusQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'processing', 'completed', 'failed').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0)
});

// Routes
async function transcriptionRoutes(fastify, options) {
  // Upload audio file for transcription
  fastify.post('/upload', {
    schema: {
      body: uploadTranscriptionSchema
    }
  }, async (request, reply) => {
    const { language, model, timestamps, diarization, useCloud } = request.body;
    const userId = request.user.id;

    try {
      // Handle file upload
      const data = await request.file();
      if (!data) {
        throw new ValidationError('No audio file uploaded');
      }

      // Validate file type
      const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav', 'audio/ogg'];
      if (!allowedTypes.includes(data.mimetype)) {
        throw new ValidationError('Invalid audio file type');
      }

      // Save uploaded file
      const buffer = await data.toBuffer();
      const filename = `${Date.now()}-${data.filename}`;
      const audioPath = `uploads/audio/${filename}`;
      
      await fs.writeFile(audioPath, buffer);

      // Start transcription
      const transcription = await whisperEngine.transcribe({
        audioPath,
        language,
        model,
        options: {
          userId,
          timestamps,
          diarization,
          useCloud
        }
      });

      logger.info('Audio transcription started', { transcriptionId: transcription.id, userId });

      return reply.status(201).send({
        success: true,
        transcription: {
          id: transcription.id,
          language: transcription.language,
          model: transcription.model,
          status: transcription.status,
          createdAt: transcription.created_at
        }
      });
    } catch (error) {
      logger.error('Failed to start audio transcription', { userId, error: error.message });
      throw error;
    }
  });

  // Transcribe from URL
  fastify.post('/url', {
    schema: {
      body: urlTranscriptionSchema
    }
  }, async (request, reply) => {
    const { audioUrl, language, model, timestamps, diarization, useCloud } = request.body;
    const userId = request.user.id;

    try {
      const transcription = await whisperEngine.transcribe({
        audioUrl,
        language,
        model,
        options: {
          userId,
          timestamps,
          diarization,
          useCloud
        }
      });

      logger.info('URL transcription started', { transcriptionId: transcription.id, audioUrl, userId });

      return reply.status(201).send({
        success: true,
        transcription: {
          id: transcription.id,
          audioUrl,
          language: transcription.language,
          model: transcription.model,
          status: transcription.status,
          createdAt: transcription.created_at
        }
      });
    } catch (error) {
      logger.error('Failed to start URL transcription', { audioUrl, userId, error: error.message });
      throw error;
    }
  });

  // Get transcription status/result
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    try {
      const transcription = await TranscriptionModel.findById(id);
      
      if (!transcription) {
        throw new NotFoundError('Transcription not found');
      }

      if (transcription.user_id !== userId) {
        throw new NotFoundError('Transcription not found');
      }

      // Get detailed result if completed
      let detailedResult = null;
      if (transcription.status === 'completed') {
        detailedResult = await whisperEngine.getTranscriptionResult(id);
      }

      return {
        success: true,
        transcription: {
          id: transcription.id,
          audioPath: transcription.audio_path,
          audioUrl: transcription.audio_url,
          language: transcription.language,
          model: transcription.model,
          status: transcription.status,
          result: transcription.result,
          error: transcription.error,
          options: transcription.options,
          createdAt: transcription.created_at,
          updatedAt: transcription.updated_at,
          completedAt: transcription.completed_at,
          detailedResult
        }
      };
    } catch (error) {
      logger.error('Failed to get transcription', { transcriptionId: id, userId, error: error.message });
      throw error;
    }
  });

  // Batch transcription
  fastify.post('/batch', {
    schema: {
      body: batchTranscriptionSchema
    }
  }, async (request, reply) => {
    const { files, language, model, useCloud } = request.body;
    const userId = request.user.id;

    try {
      const results = await whisperEngine.batchTranscribe(files, {
        language,
        model,
        userId,
        useCloud
      });

      logger.info('Batch transcription started', { fileCount: files.length, userId });

      return reply.status(201).send({
        success: true,
        batch: results
      });
    } catch (error) {
      logger.error('Failed to start batch transcription', { userId, error: error.message });
      throw error;
    }
  });

  // List transcriptions
  fastify.get('/', {
    schema: {
      querystring: statusQuerySchema
    }
  }, async (request, reply) => {
    const { status, limit, offset } = request.query;
    const userId = request.user.id;

    try {
      const transcriptions = await TranscriptionModel.findByUserId(userId, {
        status,
        limit,
        offset
      });

      const stats = await TranscriptionModel.getStats(userId);

      return {
        success: true,
        transcriptions: transcriptions.map(transcription => ({
          id: transcription.id,
          audioPath: transcription.audio_path,
          audioUrl: transcription.audio_url,
          language: transcription.language,
          model: transcription.model,
          status: transcription.status,
          audioDuration: transcription.audio_duration,
          options: transcription.options,
          createdAt: transcription.created_at,
          updatedAt: transcription.updated_at,
          completedAt: transcription.completed_at
        })),
        stats,
        pagination: {
          limit,
          offset,
          total: transcriptions.length
        }
      };
    } catch (error) {
      logger.error('Failed to list transcriptions', { userId, error: error.message });
      throw error;
    }
  });

  // Delete transcription
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    try {
      const transcription = await TranscriptionModel.findById(id);
      
      if (!transcription) {
        throw new NotFoundError('Transcription not found');
      }

      if (transcription.user_id !== userId) {
        throw new NotFoundError('Transcription not found');
      }

      await TranscriptionModel.delete(id);

      logger.info('Transcription deleted', { transcriptionId: id, userId });

      return {
        success: true,
        message: 'Transcription deleted successfully'
      };
    } catch (error) {
      logger.error('Failed to delete transcription', { transcriptionId: id, userId, error: error.message });
      throw error;
    }
  });

  // Get supported languages
  fastify.get('/languages', async (request, reply) => {
    try {
      const languages = await whisperEngine.getSupportedLanguages();
      
      return {
        success: true,
        languages
      };
    } catch (error) {
      logger.error('Failed to get supported languages', { error: error.message });
      throw error;
    }
  });

  // Get available models
  fastify.get('/models', async (request, reply) => {
    try {
      const models = await whisperEngine.getModels();
      
      return {
        success: true,
        models
      };
    } catch (error) {
      logger.error('Failed to get available models', { error: error.message });
      throw error;
    }
  });

  // Get transcription statistics
  fastify.get('/stats', async (request, reply) => {
    const userId = request.user.id;

    try {
      const stats = await TranscriptionModel.getStats(userId);
      
      return {
        success: true,
        stats
      };
    } catch (error) {
      logger.error('Failed to get transcription stats', { userId, error: error.message });
      throw error;
    }
  });
}

export default transcriptionRoutes;
