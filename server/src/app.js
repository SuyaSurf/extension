import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { getUws, serverFactory, WebSocketStream } from '@geut/fastify-uws';
import fastifyUwsPlugin from '@geut/fastify-uws/plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import cluster from 'cluster';
import os from 'os';

import { connectDB } from './config/database.js';
import { connectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

// Import routes
import downloadRoutes from './routes/download.js';
import transcriptionRoutes from './routes/transcription.js';
import ttsRoutes from './routes/tts.js';
import notesRoutes from './routes/notes.js';
import applicationAIRoutes from '../routes/application-ai.js';
import learningRoutes from '../routes/learning.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cluster mode for performance
if (cluster.isPrimary && process.env.NODE_ENV === 'production') {
  const numCPUs = os.cpus().length;
  logger.info(`Master ${process.pid} is running, spawning ${numCPUs} workers`);
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  async function build() {
    const app = Fastify({
      logger: false, // Using custom logger
      trustProxy: true,
      serverFactory // Use uWebSockets.js server factory
    });

    // Register plugins
    await app.register(cors, {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    });

    await app.register(helmet, {
      contentSecurityPolicy: false
    });

    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
      skipOnError: true
    });

    // Register uWebSockets.js plugin for high-performance WebSockets
    await app.register(fastifyUwsPlugin);
    
    // Keep Fastify websocket as fallback for non-critical routes
    await app.register(websocket);
    await app.register(multipart, {
      limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
      }
    });

    await app.register(staticPlugin, {
      root: path.join(__dirname, '../uploads'),
      prefix: '/uploads/'
    });

    // Database connections
    try {
      await connectDB();
      await connectRedis();
      logger.info('Database connections established');
    } catch (error) {
      logger.error('Database connection failed:', error);
      process.exit(1);
    }

    // Middleware
    fastify.addHook('preHandler', authMiddleware);
    fastify.setErrorHandler(errorHandler);

    // Health check
    fastify.get('/health', async (request, reply) => {
      return { 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        worker: process.pid
      };
    });

    // Register routes
    await fastify.register(downloadRoutes, { prefix: '/api/download' });
    await fastify.register(transcriptionRoutes, { prefix: '/api/transcribe' });
    await fastify.register(ttsRoutes, { prefix: '/api/tts' });
    await fastify.register(notesRoutes, { prefix: '/api/notes' });
    await fastify.register(applicationAIRoutes, { prefix: '/api' });
    await fastify.register(learningRoutes, { prefix: '/api/learning' });

    return fastify;
  }

  async function start() {
    try {
      const app = await build();
      const port = process.env.PORT || 3000;
      const host = process.env.HOST || '0.0.0.0';

      await app.listen({ port, host });
      logger.info(`Server listening on ${host}:${port} (Worker: ${process.pid})`);
    } catch (err) {
      logger.error('Server startup failed:', err);
      process.exit(1);
    }
  }

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });

  start();
}
