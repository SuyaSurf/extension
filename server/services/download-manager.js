import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DownloadModel } from '../models/download.js';
import { cache } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

export class DownloadManager {
  constructor() {
    this.activeDownloads = new Map();
    this.downloadQueue = [];
    this.maxConcurrent = 3;
    this.chunkSize = 1024 * 1024; // 1MB chunks
  }

  async startDownload(downloadData) {
    const { url, cookies = {}, headers = {}, userId, priority = 'normal' } = downloadData;
    
    // Create download record
    const filename = this.generateFilename(url);
    const download = await DownloadModel.create({
      url,
      filename,
      cookies,
      userId,
      priority
    });

    // Add to queue
    this.downloadQueue.push({
      id: download.id,
      url,
      cookies,
      headers,
      priority,
      addedAt: Date.now()
    });

    // Sort queue by priority
    this.downloadQueue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Process queue
    this.processQueue();

    return download;
  }

  async processQueue() {
    while (this.downloadQueue.length > 0 && this.activeDownloads.size < this.maxConcurrent) {
      const job = this.downloadQueue.shift();
      this.processDownload(job);
    }
  }

  async processDownload(job) {
    const { id, url, cookies, headers } = job;
    
    try {
      // Update status to downloading
      await DownloadModel.updateStatus(id, 'downloading');
      
      // Create cookie jar
      const cookieJar = new CookieJar();
      
      // Add cookies to jar
      if (cookies && Object.keys(cookies).length > 0) {
        for (const [name, value] of Object.entries(cookies)) {
          const cookie = `${name}=${value}`;
          await cookieJar.setCookie(cookie, new URL(url).origin);
        }
      }

      // Create axios instance with cookie support
      const client = wrapper(axios.create({
        jar: cookieJar,
        timeout: 30000,
        headers: {
          'User-Agent': 'Suya-Surf-Downloader/1.0',
          ...headers
        }
      }));

      // Get file info
      const headResponse = await client.head(url);
      const contentLength = parseInt(headResponse.headers['content-length'] || '0');
      const acceptRanges = headResponse.headers['accept-ranges'] === 'bytes';

      // Determine download path
      const downloadPath = path.join(process.cwd(), 'uploads', 'downloads', `${id}.tmp`);
      await fs.mkdir(path.dirname(downloadPath), { recursive: true });

      let downloadedBytes = 0;
      const fileHandle = await fs.open(downloadPath, 'w');

      try {
        if (acceptRanges && contentLength > 0) {
          // Download with range requests for resumability
          downloadedBytes = await this.downloadWithRanges(
            client, url, fileHandle, contentLength, id
          );
        } else {
          // Simple streaming download
          downloadedBytes = await this.downloadStream(
            client, url, fileHandle, id
          );
        }

        // Move to final location
        const finalPath = path.join(process.cwd(), 'uploads', 'downloads', `${id}`);
        await fs.rename(downloadPath, finalPath);

        // Update database
        await DownloadModel.updateStatus(id, 'completed', 100);
        await DownloadModel.update(id, {
          file_path: finalPath,
          file_size: downloadedBytes
        });

        logger.info('Download completed', { id, url, size: downloadedBytes });

      } finally {
        await fileHandle.close();
      }

    } catch (error) {
      logger.error('Download failed', { id, url, error: error.message });
      await DownloadModel.updateStatus(id, 'failed', null, error.message);
      
      // Clean up temp file
      const tempPath = path.join(process.cwd(), 'uploads', 'downloads', `${id}.tmp`);
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup temp file', { path: tempPath });
      }
    } finally {
      // Remove from active downloads
      this.activeDownloads.delete(id);
      
      // Process next in queue
      this.processQueue();
    }
  }

  async downloadWithRanges(client, url, fileHandle, contentLength, downloadId) {
    const chunkSize = this.chunkSize;
    let downloadedBytes = 0;
    const chunks = Math.ceil(contentLength / chunkSize);

    for (let chunk = 0; chunk < chunks; chunk++) {
      const start = chunk * chunkSize;
      const end = Math.min(start + chunkSize - 1, contentLength - 1);

      const response = await client.get(url, {
        headers: { Range: `bytes=${start}-${end}` },
        responseType: 'arraybuffer'
      });

      await fileHandle.write(response.data);
      downloadedBytes += response.data.length;

      // Update progress
      const progress = Math.round((downloadedBytes / contentLength) * 100);
      await DownloadModel.updateProgress(downloadId, progress);

      // Cache progress for real-time updates
      await cache.set(`download:${downloadId}:progress`, {
        downloadedBytes,
        contentLength,
        progress
      }, 60);
    }

    return downloadedBytes;
  }

  async downloadStream(client, url, fileHandle, downloadId) {
    const response = await client.get(url, { responseType: 'stream' });
    const contentLength = parseInt(response.headers['content-length'] || '0');
    
    let downloadedBytes = 0;
    let lastProgressUpdate = 0;

    return new Promise((resolve, reject) => {
      response.data.on('data', async (chunk) => {
        try {
          await fileHandle.write(chunk);
          downloadedBytes += chunk.length;

          // Update progress every 5%
          if (contentLength > 0) {
            const progress = Math.round((downloadedBytes / contentLength) * 100);
            if (progress - lastProgressUpdate >= 5) {
              await DownloadModel.updateProgress(downloadId, progress);
              lastProgressUpdate = progress;

              await cache.set(`download:${downloadId}:progress`, {
                downloadedBytes,
                contentLength,
                progress
              }, 60);
            }
          }
        } catch (error) {
          reject(error);
        }
      });

      response.data.on('end', () => {
        if (contentLength > 0) {
          DownloadModel.updateProgress(downloadId, 100);
        }
        resolve(downloadedBytes);
      });

      response.data.on('error', reject);
    });
  }

  async getProgress(downloadId) {
    // Try cache first for real-time progress
    const cached = await cache.get(`download:${downloadId}:progress`);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const download = await DownloadModel.findById(downloadId);
    if (!download) {
      throw new AppError('Download not found', 404);
    }

    return {
      progress: download.progress,
      status: download.status,
      downloadedBytes: download.file_size || 0,
      contentLength: download.file_size || 0
    };
  }

  async cancelDownload(downloadId) {
    const download = await DownloadModel.findById(downloadId);
    if (!download) {
      throw new AppError('Download not found', 404);
    }

    if (download.status === 'completed') {
      throw new AppError('Cannot cancel completed download', 400);
    }

    // Update status
    await DownloadModel.updateStatus(downloadId, 'cancelled');

    // Remove from queue if pending
    this.downloadQueue = this.downloadQueue.filter(job => job.id !== downloadId);

    // Remove from active downloads
    this.activeDownloads.delete(downloadId);

    // Clean up files
    const paths = [
      path.join(process.cwd(), 'uploads', 'downloads', `${downloadId}.tmp`),
      path.join(process.cwd(), 'uploads', 'downloads', `${downloadId}`)
    ];

    for (const filePath of paths) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File might not exist, ignore
      }
    }

    logger.info('Download cancelled', { downloadId });
  }

  generateFilename(url) {
    const urlObj = new URL(url);
    let filename = path.basename(urlObj.pathname);
    
    if (!filename || filename === '/') {
      filename = 'download';
    }

    // Add timestamp to avoid conflicts
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    
    return `${name}_${timestamp}${ext}`;
  }

  async getDownloadStream(downloadId) {
    const download = await DownloadModel.findById(downloadId);
    if (!download) {
      throw new AppError('Download not found', 404);
    }

    if (download.status !== 'completed') {
      throw new AppError('Download not completed', 400);
    }

    const filePath = download.file_path;
    try {
      await fs.access(filePath);
      return fs.createReadStream(filePath);
    } catch (error) {
      throw new AppError('File not found', 404);
    }
  }
}
