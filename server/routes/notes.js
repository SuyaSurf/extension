import Joi from 'joi';
import { NoteModel } from '../models/note.js';
import { CollaborationHub } from '../services/collaboration-hub.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { WebSocket } from 'ws';

const collaborationHub = new CollaborationHub();

// Validation schemas
const createNoteSchema = Joi.object({
  title: Joi.string().max(255).optional(),
  content: Joi.object().required(),
  tags: Joi.array().items(Joi.string()).max(10).optional(),
  encrypted: Joi.boolean().default(false)
});

const updateNoteSchema = Joi.object({
  title: Joi.string().max(255).optional(),
  content: Joi.object().optional(),
  tags: Joi.array().items(Joi.string()).max(10).optional(),
  encrypted: Joi.boolean().optional()
});

const shareNoteSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  permissions: Joi.string().valid('read', 'write', 'admin').default('read')
});

const searchNotesSchema = Joi.object({
  query: Joi.string().min(1).max(100).required(),
  limit: Joi.number().integer().min(1).max(50).default(20),
  offset: Joi.number().integer().min(0).default(0),
  tags: Joi.array().items(Joi.string()).optional(),
  encrypted: Joi.boolean().optional()
});

const listNotesSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  search: Joi.string().max(100).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  encrypted: Joi.boolean().optional()
});

// Routes
async function notesRoutes(fastify, options) {
  // High-performance WebSocket route for real-time collaboration using uWebSockets.js
  fastify.get('/:id/collaborate', { 
    uws: true, // Use uWebSockets.js for this route
    websocket: false // Disable Fastify websocket for this route
  }, async (connection, request) => {
    const { id: noteId } = request.params;
    const userId = request.user.id;

    try {
      // Verify note exists and user has access
      const note = await NoteModel.findById(noteId, userId);
      if (!note) {
        connection.close(1008, 'Note not found');
        return;
      }

      // Handle uWebSockets.js connection
      collaborationHub.handleUwsConnection(connection, request, noteId, userId);

    } catch (error) {
      logger.error('Collaboration connection failed', { noteId, userId, error: error.message });
      connection.close(1011, 'Internal server error');
    }
  });

  // Fallback WebSocket route using Fastify (for development/testing)
  fastify.get('/:id/collaborate/fallback', { websocket: true }, async (connection, request) => {
    const { id: noteId } = request.params;
    const userId = request.user.id;

    try {
      // Verify note exists and user has access
      const note = await NoteModel.findById(noteId, userId);
      if (!note) {
        connection.socket.close(1008, 'Note not found');
        return;
      }

      // Handle Fastify WebSocket connection
      collaborationHub.handleConnection(connection.socket, request, noteId, userId);

    } catch (error) {
      logger.error('Fallback collaboration connection failed', { noteId, userId, error: error.message });
      connection.socket.close(1011, 'Internal server error');
    }
  });

  // Create new note
  fastify.post('/', {
    schema: {
      body: createNoteSchema
    }
  }, async (request, reply) => {
    const { title, content, tags, encrypted } = request.body;
    const userId = request.user.id;

    try {
      const note = await NoteModel.create({
        title,
        content,
        tags,
        encrypted,
        userId
      });

      logger.info('Note created', { noteId: note.id, userId });

      return reply.status(201).send({
        success: true,
        note: {
          id: note.id,
          title: note.title,
          content: note.content,
          tags: note.tags,
          encrypted: note.encrypted,
          createdAt: note.created_at,
          updatedAt: note.updated_at
        }
      });
    } catch (error) {
      logger.error('Failed to create note', { userId, error: error.message });
      throw error;
    }
  });

  // Get specific note
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    try {
      const note = await NoteModel.findById(id, userId);
      
      if (!note) {
        throw new NotFoundError('Note not found');
      }

      // Get collaboration info
      const collaborationStats = await collaborationHub.getNoteStats(id);

      return {
        success: true,
        note: {
          id: note.id,
          title: note.title,
          content: note.content,
          tags: note.tags,
          encrypted: note.encrypted,
          version: note.version,
          createdAt: note.created_at,
          updatedAt: note.updated_at,
          lastEditedBy: note.last_edited_by
        },
        collaboration: collaborationStats
      };
    } catch (error) {
      logger.error('Failed to get note', { noteId: id, userId, error: error.message });
      throw error;
    }
  });

  // Update note
  fastify.put('/:id', {
    schema: {
      body: updateNoteSchema
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { title, content, tags, encrypted } = request.body;
    const userId = request.user.id;

    try {
      // Verify note exists and user has access
      const existingNote = await NoteModel.findById(id, userId);
      if (!existingNote) {
        throw new NotFoundError('Note not found');
      }

      const updatedNote = await NoteModel.update(id, {
        title,
        content,
        tags,
        encrypted
      }, userId);

      logger.info('Note updated', { noteId: id, userId });

      return {
        success: true,
        note: {
          id: updatedNote.id,
          title: updatedNote.title,
          content: updatedNote.content,
          tags: updatedNote.tags,
          encrypted: updatedNote.encrypted,
          version: updatedNote.version,
          createdAt: updatedNote.created_at,
          updatedAt: updatedNote.updated_at,
          lastEditedBy: updatedNote.last_edited_by
        }
      };
    } catch (error) {
      logger.error('Failed to update note', { noteId: id, userId, error: error.message });
      throw error;
    }
  });

  // Delete note
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    try {
      const deletedNote = await NoteModel.delete(id, userId);
      
      if (!deletedNote) {
        throw new NotFoundError('Note not found');
      }

      logger.info('Note deleted', { noteId: id, userId });

      return {
        success: true,
        message: 'Note deleted successfully'
      };
    } catch (error) {
      logger.error('Failed to delete note', { noteId: id, userId, error: error.message });
      throw error;
    }
  });

  // List notes
  fastify.get('/', {
    schema: {
      querystring: listNotesSchema
    }
  }, async (request, reply) => {
    const { limit, offset, search, tags, encrypted } = request.query;
    const userId = request.user.id;

    try {
      const notes = await NoteModel.findByUserId(userId, {
        limit,
        offset,
        search,
        tags,
        encrypted
      });

      return {
        success: true,
        notes: notes.map(note => ({
          id: note.id,
          title: note.title,
          tags: note.tags,
          encrypted: note.encrypted,
          version: note.version,
          createdAt: note.created_at,
          updatedAt: note.updated_at,
          lastEditedBy: note.last_edited_by
        })),
        pagination: {
          limit,
          offset,
          total: notes.length
        }
      };
    } catch (error) {
      logger.error('Failed to list notes', { userId, error: error.message });
      throw error;
    }
  });

  // Share note with another user
  fastify.post('/:id/share', {
    schema: {
      body: shareNoteSchema
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { userId: targetUserId, permissions } = request.body;
    const userId = request.user.id;

    try {
      // Verify note exists and user owns it
      const note = await NoteModel.findById(id, userId);
      if (!note) {
        throw new NotFoundError('Note not found');
      }

      if (note.user_id !== userId) {
        throw new ForbiddenError('Only note owner can share');
      }

      const collaboration = await NoteModel.share(id, targetUserId, permissions);

      logger.info('Note shared', { noteId: id, ownerId: userId, targetUserId, permissions });

      return reply.status(201).send({
        success: true,
        collaboration: {
          id: collaboration.id,
          noteId: collaboration.note_id,
          userId: collaboration.user_id,
          permissions: collaboration.permissions,
          joinedAt: collaboration.joined_at
        }
      });
    } catch (error) {
      logger.error('Failed to share note', { noteId: id, userId, error: error.message });
      throw error;
    }
  });

  // Get shared notes
  fastify.get('/shared', async (request, reply) => {
    const userId = request.user.id;

    try {
      const sharedNotes = await NoteModel.getSharedNotes(userId);

      return {
        success: true,
        sharedNotes: sharedNotes.map(note => ({
          id: note.id,
          title: note.title,
          tags: note.tags,
          encrypted: note.encrypted,
          permissions: note.permissions,
          joinedAt: note.joined_at,
          createdAt: note.created_at,
          updatedAt: note.updated_at
        }))
      };
    } catch (error) {
      logger.error('Failed to get shared notes', { userId, error: error.message });
      throw error;
    }
  });

  // Search notes
  fastify.post('/search', {
    schema: {
      body: searchNotesSchema
    }
  }, async (request, reply) => {
    const { query, limit, offset, tags, encrypted } = request.body;
    const userId = request.user.id;

    try {
      const notes = await NoteModel.search(userId, query, {
        limit,
        offset,
        tags,
        encrypted
      });

      return {
        success: true,
        query,
        results: notes.map(note => ({
          id: note.id,
          title: note.title,
          content: note.content,
          tags: note.tags,
          encrypted: note.encrypted,
          createdAt: note.created_at,
          updatedAt: note.updated_at
        })),
        pagination: {
          limit,
          offset,
          total: notes.length
        }
      };
    } catch (error) {
      logger.error('Failed to search notes', { userId, query, error: error.message });
      throw error;
    }
  });

  // Get note collaboration stats
  fastify.get('/:id/collaboration', async (request, reply) => {
    const { id } = request.params;
    const userId = request.user.id;

    try {
      // Verify note exists and user has access
      const note = await NoteModel.findById(id, userId);
      if (!note) {
        throw new NotFoundError('Note not found');
      }

      const stats = await collaborationHub.getNoteStats(id);

      return {
        success: true,
        collaboration: stats
      };
    } catch (error) {
      logger.error('Failed to get collaboration stats', { noteId: id, userId, error: error.message });
      throw error;
    }
  });

  // Get note version history
  fastify.get('/:id/history', async (request, reply) => {
    const { id } = request.params;
    const { limit = 20, offset = 0 } = request.query;
    const userId = request.user.id;

    try {
      // Verify note exists and user has access
      const note = await NoteModel.findById(id, userId);
      if (!note) {
        throw new NotFoundError('Note not found');
      }

      // This would fetch from note_edits table
      // For now, return current info
      const history = [{
        version: note.version,
        timestamp: note.updated_at,
        editedBy: note.last_edited_by,
        changes: 'Current version'
      }];

      return {
        success: true,
        history,
        pagination: {
          limit,
          offset,
          total: history.length
        }
      };
    } catch (error) {
      logger.error('Failed to get note history', { noteId: id, userId, error: error.message });
      throw error;
    }
  });

  // Export note
  fastify.get('/:id/export', async (request, reply) => {
    const { id } = request.params;
    const { format = 'json' } = request.query;
    const userId = request.user.id;

    try {
      const note = await NoteModel.findById(id, userId);
      if (!note) {
        throw new NotFoundError('Note not found');
      }

      let exportData;
      let contentType;
      let filename;

      switch (format.toLowerCase()) {
        case 'json':
          exportData = JSON.stringify(note, null, 2);
          contentType = 'application/json';
          filename = `${note.title || note.id}.json`;
          break;
        
        case 'markdown':
          exportData = convertToMarkdown(note);
          contentType = 'text/markdown';
          filename = `${note.title || note.id}.md`;
          break;
        
        case 'txt':
          exportData = convertToText(note);
          contentType = 'text/plain';
          filename = `${note.title || note.id}.txt`;
          break;
        
        default:
          throw new ValidationError('Unsupported export format');
      }

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      return reply.send(exportData);
    } catch (error) {
      logger.error('Failed to export note', { noteId: id, userId, format, error: error.message });
      throw error;
    }
  });

  // Helper methods for export (placed outside the route function)
  function convertToMarkdown(note) {
    let markdown = `# ${note.title || 'Untitled'}\n\n`;
    
    if (note.tags && note.tags.length > 0) {
      markdown += `Tags: ${note.tags.join(', ')}\n\n`;
    }
    
    if (typeof note.content === 'string') {
      markdown += note.content;
    } else {
      markdown += JSON.stringify(note.content, null, 2);
    }
    
    return markdown;
  }

  function convertToText(note) {
    let text = `${note.title || 'Untitled'}\n`;
    text += '='.repeat(note.title?.length || 'Untitled'.length) + '\n\n';
    
    if (note.tags && note.tags.length > 0) {
      text += `Tags: ${note.tags.join(', ')}\n\n`;
    }
    
    if (typeof note.content === 'string') {
      text += note.content;
    } else {
      text += JSON.stringify(note.content, null, 2);
    }
    
    return text;
  }
}

export default notesRoutes;
