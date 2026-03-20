/**
 * Unified Storage System
 * Combines Chrome storage API with IndexedDB for optimal performance and capacity
 */

class IndexedDBManager {
  constructor() {
    this.dbName = 'AIExtensionDB';
    this.version = 1;
    this.db = null;
    this.stores = new Map();
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('largeData')) {
          const store = db.createObjectStore('largeData', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('skill', 'skill', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('expiry', 'expiry', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('logs')) {
          const store = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('level', 'level', { unique: false });
          store.createIndex('skill', 'skill', { unique: false });
        }
      };
    });
  }

  async store(storeName, data) {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async get(storeName, key) {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAll(storeName, query = null, count = null) {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = query ? store.getAll(query, count) : store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async delete(storeName, key) {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async clear(storeName) {
    if (!this.db) await this.initialize();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}

class StorageManager {
  constructor() {
    this.chromeStorage = chrome.storage.local;
    this.syncStorage = chrome.storage.sync;
    this.indexedDB = new IndexedDBManager();
    this.compressionEnabled = true;
    this.encryptionEnabled = false;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async initialize() {
    await this.indexedDB.initialize();
    await this.setupStorageDefaults();
    await this.migrateOldData();
    await this.cleanupExpiredCache();
  }

  async setupStorageDefaults() {
    const defaults = {
      settings: {
        voiceEnabled: true,
        autoStartSkills: ['background-tasks', 'server-skills', 'ui-assistant'],
        theme: 'auto',
        language: 'en',
        notifications: true,
        privacyMode: false,
        compressionEnabled: true,
        encryptionEnabled: false
      },
      userProfile: {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        preferences: {}
      },
      version: chrome.runtime.getManifest().version
    };

    for (const [key, value] of Object.entries(defaults)) {
      const existing = await this.getData(key);
      if (!existing) {
        await this.storeData(key, value);
      }
    }
  }

  async migrateOldData() {
    // Migration logic for older versions
    const migrationInfo = await this.getData('migrationInfo');
    const currentVersion = chrome.runtime.getManifest().version;
    
    if (!migrationInfo || migrationInfo.fromVersion !== currentVersion) {
      console.log('Performing storage migration...');
      // Add migration logic here
      
      await this.storeData('migrationInfo', {
        fromVersion: migrationInfo?.toVersion || '0.0.0',
        toVersion: currentVersion,
        migratedAt: Date.now()
      });
    }
  }

  async storeData(key, data, options = {}) {
    const { 
      compress = true, 
      sync = false, 
      indexed = false,
      encrypt = false,
      cache = true,
      ttl = null
    } = options;
    
    try {
      let processedData = data;
      
      // Encrypt if requested
      if (encrypt && this.encryptionEnabled) {
        processedData = await this.encryptData(processedData);
      }
      
      // Compress large data
      if (compress && this.compressionEnabled && this.shouldCompress(processedData)) {
        processedData = await this.compressData(processedData);
      }
      
      // Add metadata
      const metadata = {
        data: processedData,
        timestamp: Date.now(),
        compressed: this.isCompressed(processedData),
        encrypted: encrypt && this.encryptionEnabled,
        size: this.getDataSize(processedData),
        ttl: ttl ? Date.now() + ttl : null
      };
      
      // Choose storage method
      let result;
      if (indexed) {
        result = await this.indexedDB.store('largeData', {
          id: key,
          ...metadata,
          skill: options.skill || 'unknown'
        });
      } else if (sync) {
        result = await this.syncStorage.set({ [key]: metadata });
      } else {
        result = await this.chromeStorage.set({ [key]: metadata });
      }
      
      // Cache result if requested
      if (cache) {
        this.cache.set(key, {
          data: metadata,
          timestamp: Date.now(),
          ttl: ttl ? Date.now() + ttl : null
        });
      }
      
      return result;
      
    } catch (error) {
      console.error(`Error storing data for key ${key}:`, error);
      throw error;
    }
  }

  async getData(key, options = {}) {
    const { 
      decompress = true, 
      sync = false, 
      indexed = false,
      decrypt = false,
      cache = true
    } = options;
    
    try {
      // Check cache first
      if (cache) {
        const cached = this.cache.get(key);
        if (cached && (!cached.ttl || cached.ttl > Date.now())) {
          return await this.processRetrievedData(cached.data, options);
        }
      }
      
      let data;
      
      // Retrieve from appropriate storage
      if (indexed) {
        const result = await this.indexedDB.get('largeData', key);
        data = result;
      } else if (sync) {
        const result = await this.syncStorage.get([key]);
        data = result[key];
      } else {
        const result = await this.chromeStorage.get([key]);
        data = result[key];
      }
      
      if (!data) {
        return null;
      }
      
      // Check TTL
      if (data.ttl && data.ttl < Date.now()) {
        await this.removeData(key, options);
        return null;
      }
      
      // Cache the data
      if (cache) {
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          ttl: data.ttl
        });
      }
      
      return await this.processRetrievedData(data, options);
      
    } catch (error) {
      console.error(`Error retrieving data for key ${key}:`, error);
      throw error;
    }
  }

  async processRetrievedData(data, options) {
    const { decompress = true, decrypt = false } = options;
    
    let processedData = data.data;
    
    // Decrypt if needed
    if (data.encrypted && decrypt && this.encryptionEnabled) {
      processedData = await this.decryptData(processedData);
    }
    
    // Decompress if needed
    if (data.compressed && decompress && this.compressionEnabled) {
      processedData = await this.decompressData(processedData);
    }
    
    return processedData;
  }

  async removeData(key, options = {}) {
    const { sync = false, indexed = false } = options;
    
    try {
      // Remove from cache
      this.cache.delete(key);
      
      // Remove from storage
      if (indexed) {
        return await this.indexedDB.delete('largeData', key);
      } else if (sync) {
        return await this.syncStorage.remove([key]);
      } else {
        return await this.chromeStorage.remove([key]);
      }
      
    } catch (error) {
      console.error(`Error removing data for key ${key}:`, error);
      throw error;
    }
  }

  async clearStorage(options = {}) {
    const { sync = false, indexed = false, cache = true } = options;
    
    try {
      // Clear cache
      if (cache) {
        this.cache.clear();
      }
      
      // Clear storage
      if (indexed) {
        await this.indexedDB.clear('largeData');
      }
      
      if (sync) {
        await this.syncStorage.clear();
      } else {
        await this.chromeStorage.clear();
      }
      
    } catch (error) {
      console.error('Error clearing storage:', error);
      throw error;
    }
  }

  shouldCompress(data) {
    const size = this.getDataSize(data);
    return size > 1024; // Compress data larger than 1KB
  }

  isCompressed(data) {
    return data && typeof data === 'object' && data.compressed === true;
  }

  getDataSize(data) {
    return new Blob([JSON.stringify(data)]).size;
  }

  async compressData(data) {
    try {
      const jsonString = JSON.stringify(data);
      const stream = new CompressionStream('gzip');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      
      writer.write(new TextEncoder().encode(jsonString));
      writer.close();
      
      const chunks = [];
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) chunks.push(value);
      }
      
      return {
        compressed: true,
        data: new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []))
      };
      
    } catch (error) {
      console.error('Compression error:', error);
      return data; // Return original data if compression fails
    }
  }

  async decompressData(compressedData) {
    try {
      const stream = new DecompressionStream('gzip');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      
      writer.write(compressedData.data);
      writer.close();
      
      const chunks = [];
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) chunks.push(value);
      }
      
      const jsonString = new TextDecoder().decode(
        new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []))
      );
      
      return JSON.parse(jsonString);
      
    } catch (error) {
      console.error('Decompression error:', error);
      return compressedData; // Return original data if decompression fails
    }
  }

  async encryptData(data) {
    // Placeholder for encryption implementation
    // In production, use proper encryption libraries
    return {
      encrypted: true,
      data: btoa(JSON.stringify(data)) // Simple base64 encoding for demo
    };
  }

  async decryptData(encryptedData) {
    // Placeholder for decryption implementation
    try {
      return JSON.parse(atob(encryptedData.data));
    } catch (error) {
      console.error('Decryption error:', error);
      return encryptedData;
    }
  }

  async cleanupExpiredCache() {
    const now = Date.now();
    
    for (const [key, cached] of this.cache) {
      if (cached.ttl && cached.ttl < now) {
        this.cache.delete(key);
      }
    }
    
    // Clean up expired data in IndexedDB
    const allData = await this.indexedDB.getAll('largeData');
    for (const item of allData) {
      if (item.ttl && item.ttl < now) {
        await this.indexedDB.delete('largeData', item.id);
      }
    }
  }

  async getStorageStats() {
    try {
      // Get Chrome storage usage
      const localUsage = await new Promise(resolve => {
        chrome.storage.local.getBytesInUse(null, resolve);
      });
      
      const syncUsage = await new Promise(resolve => {
        chrome.storage.sync.getBytesInUse(null, resolve);
      });
      
      // Get IndexedDB usage (approximate)
      const indexedData = await this.indexedDB.getAll('largeData');
      const indexedUsage = this.getDataSize(indexedData);
      
      return {
        chromeLocal: localUsage,
        chromeSync: syncUsage,
        indexedDB: indexedUsage,
        cache: this.cache.size,
        total: localUsage + syncUsage + indexedUsage
      };
      
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return null;
    }
  }

  async exportData() {
    const exportData = {
      timestamp: Date.now(),
      version: chrome.runtime.getManifest().version,
      data: {}
    };
    
    // Export Chrome storage
    const chromeData = await this.chromeStorage.get(null);
    exportData.data.chrome = chromeData;
    
    // Export IndexedDB data
    const indexedData = await this.indexedDB.getAll('largeData');
    exportData.data.indexedDB = indexedData;
    
    return exportData;
  }

  async importData(importData) {
    try {
      // Validate import data
      if (!importData || !importData.data) {
        throw new Error('Invalid import data format');
      }
      
      // Import Chrome storage data
      if (importData.data.chrome) {
        await this.chromeStorage.set(importData.data.chrome);
      }
      
      // Import IndexedDB data
      if (importData.data.indexedDB) {
        for (const item of importData.data.indexedDB) {
          await this.indexedDB.store('largeData', item);
        }
      }
      
      console.log('Data imported successfully');
      
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  }
}

// Backwards compatibility alias
const UnifiedStorageManager = StorageManager;

export { StorageManager, UnifiedStorageManager };
