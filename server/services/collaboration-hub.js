import { WebSocket } from 'ws';
import { NoteModel } from '../models/note.js';
import { cache } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { AppError, ForbiddenError } from '../middleware/errorHandler.js';

export class CollaborationHub {
  constructor() {
    this.connections = new Map(); // noteId -> Set of connections
    this.userSessions = new Map(); // userId -> { noteId, socket }
    this.editQueue = new Map(); // noteId -> Array of pending edits
    this.documentStates = new Map(); // noteId -> current document state
  }

  handleConnection(socket, request, noteId, userId) {
    // Fastify WebSocket connection handling
    this._setupConnection(socket, noteId, userId, 'fastify');
  }

  handleUwsConnection(connection, request, noteId, userId) {
    // uWebSockets.js connection handling
    this._setupConnection(connection, noteId, userId, 'uws');
  }

  _setupConnection(socket, noteId, userId, type) {
    // Join note room
    if (!this.connections.has(noteId)) {
      this.connections.set(noteId, new Set());
    }
    
    const noteConnections = this.connections.get(noteId);
    noteConnections.add(socket);

    // Track user session
    this.userSessions.set(userId, { noteId, socket, type });

    // Send current document state
    this.sendDocumentState(socket, noteId, type);

    // Notify other users
    this.broadcastToNote(noteId, {
      type: 'user_joined',
      userId,
      timestamp: Date.now()
    }, socket);

    // Setup event handlers based on connection type
    if (type === 'uws') {
      this._setupUwsHandlers(socket, noteId, userId);
    } else {
      this._setupFastifyHandlers(socket, noteId, userId);
    }

    logger.info('User connected to collaboration', { noteId, userId, type });
  }

  _setupUwsHandlers(socket, noteId, userId) {
    // uWebSockets.js event handlers
    socket.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(noteId, userId, message, socket);
      } catch (error) {
        logger.error('uWS message error', { noteId, userId, error: error.message });
        socket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    socket.on('close', () => {
      this.handleDisconnection(socket, noteId, userId);
    });

    socket.on('error', (error) => {
      logger.error('uWS error', { noteId, userId, error: error.message });
    });
  }

  _setupFastifyHandlers(socket, noteId, userId) {
    // Fastify WebSocket event handlers
    socket.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(noteId, userId, message, socket);
      } catch (error) {
        logger.error('Fastify WS message error', { noteId, userId, error: error.message });
        socket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    socket.on('close', () => {
      this.handleDisconnection(socket, noteId, userId);
    });

    socket.on('error', (error) => {
      logger.error('Fastify WS error', { noteId, userId, error: error.message });
    });
  }

  async handleMessage(noteId, userId, message, socket) {
    const { type, data } = message;

    switch (type) {
      case 'edit':
        await this.handleEdit(noteId, userId, data, socket);
        break;
      
      case 'cursor':
        await this.handleCursor(noteId, userId, data, socket);
        break;
      
      case 'selection':
        await this.handleSelection(noteId, userId, data, socket);
        break;
      
      case 'request_sync':
        await this.sendDocumentState(socket, noteId);
        break;
      
      default:
        logger.warn('Unknown message type', { type, noteId, userId });
    }
  }

  async handleEdit(noteId, userId, editData, socket) {
    try {
      const { operation, version, timestamp } = editData;

      // Verify user has write permission
      const hasPermission = await this.verifyWritePermission(noteId, userId);
      if (!hasPermission) {
        socket.send(JSON.stringify({
          type: 'error',
          message: 'No write permission'
        }));
        return;
      }

      // Get current document state
      const currentState = await this.getDocumentState(noteId);
      
      // Apply operational transform
      const transformedEdit = await this.transformEdit(operation, currentState, version);
      
      // Update document state
      await this.applyEdit(noteId, transformedEdit, userId);
      
      // Broadcast to other users
      this.broadcastToNote(noteId, {
        type: 'edit_applied',
        edit: {
          operation: transformedEdit,
          userId,
          timestamp: Date.now(),
          version: currentState.version + 1
        }
      }, socket);

      // Save to database
      await this.saveEditToDatabase(noteId, transformedEdit, userId);

      logger.debug('Edit applied', { noteId, userId, editType: operation.type });

    } catch (error) {
      logger.error('Edit handling failed', { noteId, userId, error: error.message });
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Failed to apply edit'
      }));
    }
  }

  async handleCursor(noteId, userId, cursorData, socket) {
    const { position, selection } = cursorData;

    // Broadcast cursor position to other users
    this.broadcastToNote(noteId, {
      type: 'cursor_update',
      userId,
      position,
      selection,
      timestamp: Date.now()
    }, socket);
  }

  async handleSelection(noteId, userId, selectionData, socket) {
    const { range, text } = selectionData;

    // Broadcast selection to other users
    this.broadcastToNote(noteId, {
      type: 'selection_update',
      userId,
      range,
      text,
      timestamp: Date.now()
    }, socket);
  }

  async transformEdit(operation, currentState, version) {
    // Simple operational transform implementation
    // In a real implementation, this would use a proper OT library
    
    if (currentState.version !== version) {
      // Version mismatch - we need to transform
      const pendingEdits = this.getPendingEdits(currentState.version, version);
      
      for (const pendingEdit of pendingEdits) {
        operation = this.transformAgainst(operation, pendingEdit);
      }
    }

    return operation;
  }

  transformAgainst(operation, againstOperation) {
    // Simplified transformation logic
    // Real implementation would handle all operation types properly
    
    if (operation.type === 'insert' && againstOperation.type === 'insert') {
      if (operation.position <= againstOperation.position) {
        return operation;
      } else {
        return {
          ...operation,
          position: operation.position + againstOperation.text.length
        };
      }
    }
    
    if (operation.type === 'delete' && againstOperation.type === 'insert') {
      if (operation.position <= againstOperation.position) {
        return operation;
      } else {
        return {
          ...operation,
          position: operation.position + againstOperation.text.length
        };
      }
    }
    
    if (operation.type === 'insert' && againstOperation.type === 'delete') {
      if (operation.position <= againstOperation.position) {
        return operation;
      } else {
        return {
          ...operation,
          position: Math.max(operation.position - againstOperation.length, againstOperation.position)
        };
      }
    }
    
    if (operation.type === 'delete' && againstOperation.type === 'delete') {
      if (operation.position + operation.length <= againstOperation.position) {
        return operation;
      } else if (operation.position >= againstOperation.position + againstOperation.length) {
        return {
          ...operation,
          position: operation.position - againstOperation.length
        };
      } else {
        // Overlapping deletes - merge them
        const start = Math.min(operation.position, againstOperation.position);
        const end = Math.max(operation.position + operation.length, againstOperation.position + againstOperation.length);
        return {
          type: 'delete',
          position: start,
          length: end - start
        };
      }
    }
    
    return operation;
  }

  async getDocumentState(noteId) {
    // Try cache first
    const cached = await cache.get(`note_state:${noteId}`);
    if (cached) {
      return cached;
    }

    // Load from database
    const note = await NoteModel.findById(noteId);
    if (!note) {
      throw new AppError('Note not found', 404);
    }

    const state = {
      content: note.content,
      version: note.version || 1,
      lastEdited: note.updated_at,
      lastEditedBy: note.last_edited_by
    };

    // Cache the state
    await cache.set(`note_state:${noteId}`, state, 3600);

    return state;
  }

  async applyEdit(noteId, edit, userId) {
    const currentState = await this.getDocumentState(noteId);
    let newContent = currentState.content;

    // Apply the edit operation
    switch (edit.type) {
      case 'insert':
        newContent = this.insertText(newContent, edit.position, edit.text);
        break;
      
      case 'delete':
        newContent = this.deleteText(newContent, edit.position, edit.length);
        break;
      
      case 'replace':
        newContent = this.replaceText(newContent, edit.position, edit.length, edit.text);
        break;
      
      default:
        throw new AppError(`Unknown edit type: ${edit.type}`);
    }

    // Update document state
    const newState = {
      content: newContent,
      version: currentState.version + 1,
      lastEdited: new Date().toISOString(),
      lastEditedBy: userId
    };

    // Update cache
    await cache.set(`note_state:${noteId}`, newState, 3600);

    return newState;
  }

  insertText(content, position, text) {
    if (typeof content === 'string') {
      return content.slice(0, position) + text + content.slice(position);
    }
    
    // Handle rich text content
    return this.insertRichText(content, position, text);
  }

  deleteText(content, position, length) {
    if (typeof content === 'string') {
      return content.slice(0, position) + content.slice(position + length);
    }
    
    // Handle rich text content
    return this.deleteRichText(content, position, length);
  }

  replaceText(content, position, length, text) {
    const deleted = this.deleteText(content, position, length);
    return this.insertText(deleted, position, text);
  }

  // Rich text operations would be more complex
  insertRichText(content, position, text) {
    // Simplified rich text insertion
    // Real implementation would handle proper rich text structure
    return this.insertText(content.toString(), position, text);
  }

  deleteRichText(content, position, length) {
    // Simplified rich text deletion
    return this.deleteText(content.toString(), position, length);
  }

  async sendDocumentState(socket, noteId, type = 'fastify') {
    try {
      const state = await this.getDocumentState(noteId);
      
      const message = JSON.stringify({
        type: 'document_state',
        state: {
          content: state.content,
          version: state.version,
          lastEdited: state.lastEdited,
          lastEditedBy: state.lastEditedBy
        }
      });

      if (type === 'uws') {
        socket.send(message);
      } else {
        socket.send(message);
      }
    } catch (error) {
      logger.error('Failed to send document state', { noteId, error: error.message });
    }
  }

  broadcastToNote(noteId, message, excludeSocket = null) {
    const connections = this.connections.get(noteId);
    if (!connections) return;

    const messageStr = JSON.stringify(message);
    
    connections.forEach(socket => {
      if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
        socket.send(messageStr);
      }
    });
  }

  async verifyWritePermission(noteId, userId) {
    try {
      const note = await NoteModel.findById(noteId);
      if (!note) return false;

      // Owner has full permissions
      if (note.user_id === userId) return true;

      // Check collaboration permissions
      const sharedNotes = await NoteModel.getSharedNotes(userId);
      const sharedNote = sharedNotes.find(n => n.id === noteId);
      
      return sharedNote && ['write', 'admin'].includes(sharedNote.permissions);
    } catch (error) {
      logger.error('Permission check failed', { noteId, userId, error: error.message });
      return false;
    }
  }

  async saveEditToDatabase(noteId, edit, userId) {
    try {
      // Get current note
      const note = await NoteModel.findById(noteId);
      if (!note) return;

      // Apply edit to note content
      const newContent = await this.applyEdit(noteId, edit, userId);

      // Update note in database
      await NoteModel.update(noteId, {
        content: newContent.content,
        version: newContent.version
      });

      // Record edit history
      await this.recordEdit(noteId, edit, userId);

    } catch (error) {
      logger.error('Failed to save edit to database', { noteId, userId, error: error.message });
    }
  }

  async recordEdit(noteId, edit, userId) {
    // This would record the edit in the note_edits table
    // For now, we'll just log it
    logger.debug('Edit recorded', { noteId, userId, editType: edit.type });
  }

  handleDisconnection(socket, noteId, userId) {
    // Remove from connections
    const connections = this.connections.get(noteId);
    if (connections) {
      connections.delete(socket);
      
      if (connections.size === 0) {
        this.connections.delete(noteId);
      }
    }

    // Remove from user sessions
    this.userSessions.delete(userId);

    // Notify other users
    this.broadcastToNote(noteId, {
      type: 'user_left',
      userId,
      timestamp: Date.now()
    });

    logger.info('User disconnected from collaboration', { noteId, userId });
  }

  getConnectedUsers(noteId) {
    const connections = this.connections.get(noteId);
    if (!connections) return [];

    const users = [];
    this.userSessions.forEach((session, userId) => {
      if (session.noteId === noteId) {
        users.push(userId);
      }
    });

    return users;
  }

  async getNoteStats(noteId) {
    const connectedUsers = this.getConnectedUsers(noteId);
    const state = await this.getDocumentState(noteId);

    return {
      connectedUsers: connectedUsers.length,
      version: state.version,
      lastEdited: state.lastEdited,
      lastEditedBy: state.lastEditedBy
    };
  }

  getPendingEdits(fromVersion, toVersion) {
    // This would return edits that happened between versions
    // For now, return empty array
    return [];
  }
}
