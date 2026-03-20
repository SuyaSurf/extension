import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

export class NoteModel {
  static async create(noteData) {
    const {
      title,
      content,
      userId,
      encrypted = false,
      tags = []
    } = noteData;

    const id = uuidv4();
    const sql = `
      INSERT INTO notes (id, title, content, user_id, encrypted, tags)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    try {
      const result = await query(sql, [
        id, 
        title, 
        JSON.stringify(content), 
        userId, 
        encrypted, 
        JSON.stringify(tags)
      ]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to create note: ${error.message}`);
    }
  }

  static async findById(id, userId = null) {
    let sql = 'SELECT * FROM notes WHERE id = $1';
    const params = [id];
    
    if (userId) {
      sql += ' AND user_id = $2';
      params.push(userId);
    }

    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to find note: ${error.message}`);
    }
  }

  static async findByUserId(userId, options = {}) {
    const { 
      limit = 50, 
      offset = 0, 
      search, 
      tags,
      encrypted 
    } = options;
    
    let sql = 'SELECT * FROM notes WHERE user_id = $1';
    const params = [userId];
    
    if (search) {
      sql += ' AND (title ILIKE $2 OR content::text ILIKE $2)';
      params.push(`%${search}%`);
    }
    
    if (tags && tags.length > 0) {
      const tagIndex = params.length + 1;
      sql += ` AND tags ?| $${tagIndex}`;
      params.push(tags);
    }
    
    if (encrypted !== undefined) {
      sql += ` AND encrypted = $${params.length + 1}`;
      params.push(encrypted);
    }
    
    sql += ' ORDER BY updated_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to find notes: ${error.message}`);
    }
  }

  static async update(id, updateData, userId = null) {
    const { title, content, tags, encrypted } = updateData;
    
    let sql = 'UPDATE notes SET ';
    const updates = [];
    const params = [];
    
    if (title !== undefined) {
      updates.push('title = $' + (params.length + 1));
      params.push(title);
    }
    
    if (content !== undefined) {
      updates.push('content = $' + (params.length + 1));
      params.push(JSON.stringify(content));
    }
    
    if (tags !== undefined) {
      updates.push('tags = $' + (params.length + 1));
      params.push(JSON.stringify(tags));
    }
    
    if (encrypted !== undefined) {
      updates.push('encrypted = $' + (params.length + 1));
      params.push(encrypted);
    }
    
    updates.push('updated_at = NOW()');
    
    sql += updates.join(', ') + ' WHERE id = $' + (params.length + 1);
    params.push(id);
    
    if (userId) {
      sql += ' AND user_id = $' + (params.length + 1);
      params.push(userId);
    }
    
    sql += ' RETURNING *';

    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update note: ${error.message}`);
    }
  }

  static async delete(id, userId = null) {
    let sql = 'DELETE FROM notes WHERE id = $1';
    const params = [id];
    
    if (userId) {
      sql += ' AND user_id = $2';
      params.push(userId);
    }
    
    sql += ' RETURNING *';

    try {
      const result = await query(sql, params);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to delete note: ${error.message}`);
    }
  }

  static async share(id, userId, permissions = 'read') {
    const shareId = uuidv4();
    const sql = `
      INSERT INTO collaborations (id, note_id, user_id, permissions)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    try {
      const result = await query(sql, [shareId, id, userId, permissions]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to share note: ${error.message}`);
    }
  }

  static async getSharedNotes(userId) {
    const sql = `
      SELECT n.*, c.permissions, c.joined_at
      FROM notes n
      JOIN collaborations c ON n.id = c.note_id
      WHERE c.user_id = $1
      ORDER BY c.joined_at DESC
    `;

    try {
      const result = await query(sql, [userId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get shared notes: ${error.message}`);
    }
  }

  static async search(userId, query, options = {}) {
    const { limit = 20, offset = 0 } = options;
    
    const sql = `
      SELECT * FROM notes 
      WHERE user_id = $1 
      AND (title ILIKE $2 OR content::text ILIKE $2)
      ORDER BY updated_at DESC
      LIMIT $3 OFFSET $4
    `;

    try {
      const result = await query(sql, [userId, `%${query}%`, limit, offset]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to search notes: ${error.message}`);
    }
  }
}
