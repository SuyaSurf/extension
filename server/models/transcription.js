import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

export class TranscriptionModel {
  static async create(transcriptionData) {
    const {
      audioPath,
      language,
      userId,
      options = {}
    } = transcriptionData;

    const id = uuidv4();
    const sql = `
      INSERT INTO transcriptions (id, audio_path, language, user_id, options)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    try {
      const result = await query(sql, [id, audioPath, language, userId, JSON.stringify(options)]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to create transcription: ${error.message}`);
    }
  }

  static async findById(id) {
    const sql = 'SELECT * FROM transcriptions WHERE id = $1';
    
    try {
      const result = await query(sql, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to find transcription: ${error.message}`);
    }
  }

  static async findByUserId(userId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    
    let sql = 'SELECT * FROM transcriptions WHERE user_id = $1';
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
      throw new Error(`Failed to find transcriptions: ${error.message}`);
    }
  }

  static async updateStatus(id, status, result = null, error = null) {
    const sql = `
      UPDATE transcriptions 
      SET status = $1, result = $2, error = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;

    try {
      const resultData = result ? JSON.stringify(result) : null;
      const dbResult = await query(sql, [status, resultData, error, id]);
      return dbResult.rows[0];
    } catch (error) {
      throw new Error(`Failed to update transcription status: ${error.message}`);
    }
  }

  static async delete(id) {
    const sql = 'DELETE FROM transcriptions WHERE id = $1 RETURNING *';

    try {
      const result = await query(sql, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to delete transcription: ${error.message}`);
    }
  }

  static async getStats(userId) {
    const sql = `
      SELECT 
        status,
        COUNT(*) as count,
        COALESCE(SUM(audio_duration), 0) as total_duration
      FROM transcriptions 
      WHERE user_id = $1
      GROUP BY status
    `;

    try {
      const result = await query(sql, [userId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get transcription stats: ${error.message}`);
    }
  }
}
