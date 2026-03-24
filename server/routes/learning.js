/**
 * Learning API Routes
 *
 * Endpoints for the extension to:
 *   1. Ingest user signals (POST /api/learning/ingest)
 *   2. Trigger model training (POST /api/learning/train)
 *   3. Export trained model (GET /api/learning/model)
 *   4. Request a decision (POST /api/learning/decide)
 *   5. Ingest decision labels (POST /api/learning/labels)
 *   6. Get graph summary (GET /api/learning/summary)
 */

import { UserLearningEngine } from '../services/user-learning-engine.js';

// One engine instance per user — in production this would be keyed by userId
// from the auth middleware. For now we use an in-memory map.
const engines = new Map();

function getEngine(userId) {
  if (!engines.has(userId)) {
    engines.set(userId, new UserLearningEngine({
      embeddingDim: 16,
      maxEntities: 512,
      srmEpochs: 200,
      nnEpochs: 300,
      srmLr: 0.01,
      nnLr: 0.005
    }));
  }
  return engines.get(userId);
}

export default async function learningRoutes(fastify) {

  // ── POST /ingest — receive user signals ──
  fastify.post('/ingest', {
    schema: {
      body: {
        type: 'object',
        properties: {
          onboarding:      { type: 'object' },
          browsingHistory: { type: 'array' },
          bookmarks:       { type: 'array' },
          extensions:      { type: 'array' },
          behaviors:       { type: 'array' },
          patterns:        { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user?.id || 'default';
      const engine = getEngine(userId);
      const result = engine.ingestSignals(request.body);

      return {
        success: true,
        data: result,
        message: `Ingested signals: ${result.entityCount} entities, ${result.tripleCount} triples`
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // ── POST /labels — add decision training labels ──
  fastify.post('/labels', {
    schema: {
      body: {
        type: 'object',
        required: ['labels'],
        properties: {
          labels: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                context:  { type: 'string' },
                decision: { type: 'string' },
                positive: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user?.id || 'default';
      const engine = getEngine(userId);
      engine.ingestDecisionLabels(request.body.labels);

      return {
        success: true,
        message: `Ingested ${request.body.labels.length} decision labels`
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // ── POST /train — trigger model training ──
  fastify.post('/train', async (request, reply) => {
    try {
      const userId = request.user?.id || 'default';
      const engine = getEngine(userId);
      const stats = engine.train();

      return {
        success: true,
        data: stats,
        message: 'Training complete'
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // ── GET /model — export trained model for extension ──
  fastify.get('/model', async (request, reply) => {
    try {
      const userId = request.user?.id || 'default';
      const engine = getEngine(userId);
      const model = engine.exportModel();

      return {
        success: true,
        data: model
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // ── POST /model — import a model (resume from saved state) ──
  fastify.post('/model', {
    schema: {
      body: {
        type: 'object',
        required: ['model'],
        properties: {
          model: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user?.id || 'default';
      const engine = getEngine(userId);
      engine.importModel(request.body.model);

      return {
        success: true,
        message: 'Model imported successfully'
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // ── POST /decide — get a decision for a given context ──
  fastify.post('/decide', {
    schema: {
      body: {
        type: 'object',
        properties: {
          context: { type: 'string' },
          topK:    { type: 'number', default: 5 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user?.id || 'default';
      const engine = getEngine(userId);
      const { context, topK } = request.body;

      const decisions = context
        ? engine.decide(context, topK || 5)
        : engine.decideForUser(topK || 5);

      return {
        success: true,
        data: { decisions }
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // ── POST /predict — predict related entities via SRM link prediction ──
  fastify.post('/predict', {
    schema: {
      body: {
        type: 'object',
        required: ['relation'],
        properties: {
          relation: { type: 'string' },
          topK:     { type: 'number', default: 10 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user?.id || 'default';
      const engine = getEngine(userId);
      const { relation, topK } = request.body;
      const predictions = engine.predictRelated(relation, topK || 10);

      return {
        success: true,
        data: { predictions }
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // ── GET /summary — get knowledge graph summary ──
  fastify.get('/summary', async (request, reply) => {
    try {
      const userId = request.user?.id || 'default';
      const engine = getEngine(userId);
      const summary = engine.getGraphSummary();

      return {
        success: true,
        data: summary
      };
    } catch (error) {
      reply.code(500);
      return { success: false, error: error.message };
    }
  });
}
