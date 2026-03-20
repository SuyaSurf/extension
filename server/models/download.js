import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

export class DownloadModel {
  static async create(downloadData) {
    const {
      url,
      filename,
      cookies = null,
      userId,
      priority = 'normal'
    } = downloadData;

    const id = uuidv4();
    const sql = `
      INSERT INTO downloads (id, url, filename, status, cookies, user_id, priority)
      VALUES ($1, $2, $3, 'pending', $4, $5, $6)
      RETURNING *
    `;

    try {
      const result = await query(sql, [id, url, filename, JSON.stringify(cookies), userId, priority]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to create download: ${error.message}`);
    }
  }

  static async findById(id) {
    const sql = 'SELECT * FROM downloads WHERE id = $1';
    
    try {
      const result = await query(sql, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to find download: ${error.message}`);
    }
  }

  static async findByUserId(userId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    
    let sql = 'SELECT * FROM downloads WHERE user_id = $1';
    const params = [userId];
    
    if (status) {
      sql += ' AND status = $2';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to find downloads: ${error.message}`);
    }
  }

  static async updateStatus(id, status, progress = null, error = null) {
    const sql = `
      UPDATE downloads 
      SET status = $1, progress = $2, error = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;

    try {
      const result = await query(sql, [status, progress, error, id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update download status: ${error.message}`);
    }
  }

  static async updateProgress(id, progress) {
    const sql = `
      UPDATE downloads 
      SET progress = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    try {
      const result = await query(sql, [progress, id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update download progress: ${error.message}`);
    }
  }

  static async delete(id) {
    const sql = 'DELETE FROM downloads WHERE id = $1 RETURNING *';

    try {
      const result = await query(sql, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to delete download: ${error.message}`);
    }
  }

  static async getStats(userId) {
    const sql = `
      SELECT 
        status,
        COUNT(*) as count,
        COALESCE(SUM(CASE WHEN file_size > 0 THEN file_size ELSE 0 END), 0) as total_size
      FROM downloads 
      WHERE user_id = $1
      GROUP BY status
    `;

    try {
      const result = await query(sql, [userId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get download stats: ${error.message}`);
    }
  }
}
