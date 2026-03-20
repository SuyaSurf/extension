import Joi from 'joi';
import { DownloadManager } from '../services/download-manager.js';
import { DownloadModel } from '../models/download.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const downloadManager = new DownloadManager();

// Validation schemas
const startDownloadSchema = Joi.object({
  url: Joi.string().uri().required(),
  cookies: Joi.object().optional(),
  headers: Joi.object().optional(),
  priority: Joi.string().valid('low', 'normal', 'high').default('normal')
});

const statusQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'downloading', 'completed', 'failed', 'cancelled').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0)
});

// Routes
async function downloadRoutes(fastify, options) {
  // Start new download
  fastify.post('/start', {
    schema: {
      body: startDownloadSchema
    }
  }, async (request, reply) => {
    const { url, cookies, headers, priority } = request.body;
    const userId = request.user.id;

    try {
      const download = await downloadManager.startDownload({
        url,
        cookies,
        headers,
        userId,
        priority
      });

      logger.info('Download started', { downloadId: download.id, url, userId });

      return reply.status(201).send({
        success: true,
        download: {
          id: download.id,
          url: download.url,
          filename: download.filename,
          status: download.status,
          priority: download.priority,
          createdAt: download.created_at
        }
      });
    } catch (error) {
      logger.error('Failed to start download', { url, userId, error: error.message });
      throw error;
    }
  });

  // Get download status
  fastify.get('/status/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    try {
      const download = await DownloadModel.findById(id);
      
      if (!download) {
        throw new NotFoundError('Download not found');
      }

      if (download.user_id !== userId) {
        throw new NotFoundError('Download not found');
      }

      // Get real-time progress if downloading
      let progress = null;
      if (download.status === 'downloading') {
        progress = await downloadManager.getProgress(id);
      }

      return {
        success: true,
        download: {
          id: download.id,
          url: download.url,
          filename: download.filename,
          status: download.status,
          progress: download.progress,
          fileSize: download.file_size,
          error: download.error,
          priority: download.priority,
          createdAt: download.created_at,
          updatedAt: download.updated_at,
          completedAt: download.completed_at,
          realTimeProgress: progress
        }
      };
    } catch (error) {
      logger.error('Failed to get download status', { downloadId: id, userId, error: error.message });
      throw error;
    }
  });

  // Stream/download file
  fastify.get('/stream/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    try {
      const download = await DownloadModel.findById(id);
      
      if (!download) {
        throw new NotFoundError('Download not found');
      }

      if (download.user_id !== userId) {
        throw new NotFoundError('Download not found');
      }

      if (download.status !== 'completed') {
        throw new ValidationError('Download not completed');
      }

      const stream = await downloadManager.getDownloadStream(id);
      
      // Set appropriate headers
      reply.header('Content-Disposition', `attachment; filename="${download.filename}"`);
      reply.header('Content-Type', 'application/octet-stream');
      
      if (download.file_size) {
        reply.header('Content-Length', download.file_size);
      }

      return reply.send(stream);
    } catch (error) {
      logger.error('Failed to stream download', { downloadId: id, userId, error: error.message });
      throw error;
    }
  });

  // Cancel download
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    try {
      const download = await DownloadModel.findById(id);
      
      if (!download) {
        throw new NotFoundError('Download not found');
      }

      if (download.user_id !== userId) {
        throw new NotFoundError('Download not found');
      }

      await downloadManager.cancelDownload(id);

      logger.info('Download cancelled', { downloadId: id, userId });

      return {
        success: true,
        message: 'Download cancelled successfully'
      };
    } catch (error) {
      logger.error('Failed to cancel download', { downloadId: id, userId, error: error.message });
      throw error;
    }
  });

  // List all downloads
  fastify.get('/', {
    schema: {
      querystring: statusQuerySchema
    }
  }, async (request, reply) => {
    const { status, limit, offset } = request.query;
    const userId = request.user.id;

    try {
      const downloads = await DownloadModel.findByUserId(userId, {
        status,
        limit,
        offset
      });

      const stats = await DownloadModel.getStats(userId);

      return {
        success: true,
        downloads: downloads.map(download => ({
          id: download.id,
          url: download.url,
          filename: download.filename,
          status: download.status,
          progress: download.progress,
          fileSize: download.file_size,
          priority: download.priority,
          error: download.error,
          createdAt: download.created_at,
          updatedAt: download.updated_at,
          completedAt: download.completed_at
        })),
        stats,
        pagination: {
          limit,
          offset,
          total: downloads.length
        }
      };
    } catch (error) {
      logger.error('Failed to list downloads', { userId, error: error.message });
      throw error;
    }
  });

  // Get download statistics
  fastify.get('/stats', async (request, reply) => {
    const userId = request.user.id;

    try {
      const stats = await DownloadModel.getStats(userId);
      
      return {
        success: true,
        stats
      };
    } catch (error) {
      logger.error('Failed to get download stats', { userId, error: error.message });
      throw error;
    }
  });

  // Retry failed download
  fastify.post('/:id/retry', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    try {
      const download = await DownloadModel.findById(id);
      
      if (!download) {
        throw new NotFoundError('Download not found');
      }

      if (download.user_id !== userId) {
        throw new NotFoundError('Download not found');
      }

      if (download.status !== 'failed') {
        throw new ValidationError('Only failed downloads can be retried');
      }

      // Reset download and restart
      await DownloadModel.updateStatus(id, 'pending');
      
      const newDownload = await downloadManager.startDownload({
        url: download.url,
        cookies: download.cookies,
        userId,
        priority: download.priority
      });

      logger.info('Download retried', { downloadId: id, userId });

      return {
        success: true,
        message: 'Download retry initiated',
        newDownloadId: newDownload.id
      };
    } catch (error) {
      logger.error('Failed to retry download', { downloadId: id, userId, error: error.message });
      throw error;
    }
  });
}

export default downloadRoutes;
