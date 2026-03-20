/**
 * Security Manager
 * Handles encryption, permissions, audit logging, and security monitoring
 */

class SecurityManager {
  constructor() {
    this.encryptionKey = null;
    this.permissions = new Map();
    this.auditLogger = new AuditLogger();
    this.securityPolicy = new SecurityPolicy();
    this.threatDetector = new ThreatDetector();
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('Initializing Security Manager...');
      
      // Initialize encryption
      await this.initializeEncryption();
      
      // Set up permission monitoring
      this.setupPermissionMonitoring();
      
      // Initialize audit logging
      await this.auditLogger.initialize();
      
      // Initialize threat detection
      await this.threatDetector.initialize();
      
      // Load security policy
      await this.securityPolicy.load();
      
      this.isInitialized = true;
      console.log('Security Manager initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize Security Manager:', error);
      throw error;
    }
  }

  async initializeEncryption() {
    try {
      // Generate or retrieve encryption key
      const storedKey = await chrome.storage.local.get(['encryptionKey']);
      
      if (storedKey.encryptionKey) {
        this.encryptionKey = new Uint8Array(storedKey.encryptionKey);
      } else {
        this.encryptionKey = await this.generateEncryptionKey();
        await chrome.storage.local.set({ 
          encryptionKey: Array.from(this.encryptionKey) 
        });
      }
      
      console.log('Encryption initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      throw error;
    }
  }

  async generateEncryptionKey() {
    // Generate a 256-bit key for AES-GCM
    return await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    ).then(key => crypto.subtle.exportKey('raw', key));
  }

  async encryptData(data) {
    if (!this.encryptionKey) {
      throw new Error('Encryption not initialized');
    }

    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(JSON.stringify(data));
      
      const key = await crypto.subtle.importKey(
        'raw',
        this.encryptionKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        dataBuffer
      );

      return {
        encrypted: true,
        data: Array.from(new Uint8Array(encryptedData)),
        iv: Array.from(iv)
      };
      
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  async decryptData(encryptedData) {
    if (!this.encryptionKey) {
      throw new Error('Encryption not initialized');
    }

    try {
      const key = await crypto.subtle.importKey(
        'raw',
        this.encryptionKey,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
        key,
        new Uint8Array(encryptedData.data)
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decryptedData));
      
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  setupPermissionMonitoring() {
    // Monitor permission usage
    chrome.permissions.onAdded.addListener((permissions) => {
      this.auditLogger.log('permission_added', permissions);
      this.checkPermissionSecurity(permissions.permissions);
    });

    chrome.permissions.onRemoved.addListener((permissions) => {
      this.auditLogger.log('permission_removed', permissions);
    });

    // Monitor API usage
    this.monitorAPIUsage();
  }

  monitorAPIUsage() {
    // Override sensitive APIs to monitor usage
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      const [url, options] = args;
      
      // Log API calls
      await this.auditLogger.log('api_call', {
        url: typeof url === 'string' ? url : url.toString(),
        method: options?.method || 'GET',
        timestamp: Date.now()
      });

      // Check for suspicious patterns
      if (this.threatDetector.isSuspiciousAPI(url, options)) {
        await this.auditLogger.log('suspicious_api', {
          url: typeof url === 'string' ? url : url.toString(),
          options,
          threat: 'suspicious_api_pattern'
        });
      }

      return originalFetch.apply(this, args);
    };
  }

  async checkPermissionSecurity(permissions) {
    for (const permission of permissions) {
      if (this.securityPolicy.isRestrictedPermission(permission)) {
        await this.auditLogger.log('security_violation', {
          type: 'restricted_permission',
          permission,
          timestamp: Date.now()
        });
      }
    }
  }

  async validateRequest(request, sender) {
    // Validate incoming requests for security
    const validation = {
      isValid: true,
      threats: [],
      warnings: []
    };

    // Check sender authenticity
    if (!this.validateSender(sender)) {
      validation.isValid = false;
      validation.threats.push('invalid_sender');
    }

    // Check request content
    const contentThreats = await this.threatDetector.analyzeRequest(request);
    validation.threats.push(...contentThreats);

    // Check rate limiting
    if (await this.threatDetector.isRateLimited(sender.id)) {
      validation.isValid = false;
      validation.threats.push('rate_limited');
    }

    // Log validation results
    await this.auditLogger.log('request_validation', {
      sender: sender.id,
      request: request.action,
      validation,
      timestamp: Date.now()
    });

    return validation;
  }

  validateSender(sender) {
    // Basic sender validation
    return sender && 
           sender.id && 
           (sender.url?.startsWith('chrome-extension://') || 
            sender.url?.startsWith('http://localhost') ||
            sender.tab);
  }

  async sanitizeData(data) {
    // Sanitize data to prevent injection attacks
    if (typeof data === 'string') {
      return this.sanitizeString(data);
    } else if (Array.isArray(data)) {
      return await Promise.all(data.map(item => this.sanitizeData(item)));
    } else if (typeof data === 'object' && data !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[this.sanitizeString(key)] = await this.sanitizeData(value);
      }
      return sanitized;
    }
    
    return data;
  }

  sanitizeString(str) {
    // Basic string sanitization
    return str
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  async checkDataPrivacy(data) {
    // Check for sensitive data exposure
    const privacyCheck = {
      isPrivate: false,
      sensitiveFields: [],
      recommendations: []
    };

    const sensitivePatterns = [
      { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, type: 'credit_card' },
      { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/, type: 'ssn' },
      { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, type: 'email' },
      { pattern: /\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/, type: 'phone' },
      { pattern: /password/i, type: 'password_field' }
    ];

    const dataStr = JSON.stringify(data);
    
    for (const { pattern, type } of sensitivePatterns) {
      if (pattern.test(dataStr)) {
        privacyCheck.isPrivate = true;
        privacyCheck.sensitiveFields.push(type);
      }
    }

    if (privacyCheck.isPrivate) {
      privacyCheck.recommendations.push('Consider encrypting sensitive data');
      privacyCheck.recommendations.push('Review data sharing policies');
      
      await this.auditLogger.log('sensitive_data_detected', {
        sensitiveFields: privacyCheck.sensitiveFields,
        timestamp: Date.now()
      });
    }

    return privacyCheck;
  }

  async generateSecurityReport() {
    const report = {
      timestamp: Date.now(),
      version: '1.0.0',
      encryption: {
        enabled: !!this.encryptionKey,
        algorithm: 'AES-GCM-256'
      },
      permissions: {
        current: await chrome.permissions.getAll(),
        restricted: this.securityPolicy.getRestrictedPermissions()
      },
      audit: {
        totalEvents: await this.auditLogger.getEventCount(),
        recentThreats: await this.auditLogger.getRecentThreats(24),
        securityViolations: await this.auditLogger.getSecurityViolations()
      },
      threats: {
        detected: await this.threatDetector.getThreatSummary(),
        blocked: await this.threatDetector.getBlockedRequests(),
        rateLimitActive: await this.threatDetector.isRateLimitActive()
      },
      recommendations: this.generateSecurityRecommendations()
    };

    return report;
  }

  generateSecurityRecommendations() {
    const recommendations = [];

    // Check encryption
    if (!this.encryptionKey) {
      recommendations.push('Enable encryption for sensitive data');
    }

    // Check permissions
    // This would need to be implemented based on current permissions

    // Check audit logs
    // This would check for unusual patterns

    return recommendations;
  }

  // Public API methods
  async isSecure() {
    if (!this.isInitialized) return false;
    
    const threats = await this.threatDetector.getActiveThreats();
    return threats.length === 0;
  }

  async getSecurityStatus() {
    return {
      initialized: this.isInitialized,
      encryptionEnabled: !!this.encryptionKey,
      threatLevel: await this.threatDetector.getThreatLevel(),
      lastAudit: await this.auditLogger.getLastAuditTime(),
      policyCompliant: await this.securityPolicy.isCompliant()
    };
  }
}

class AuditLogger {
  constructor() {
    this.events = [];
    this.maxEvents = 10000;
    this.threatThreshold = 10;
  }

  async initialize() {
    // Load existing events from storage
    try {
      const stored = await chrome.storage.local.get(['auditEvents']);
      if (stored.auditEvents) {
        this.events = stored.auditEvents;
      }
    } catch (error) {
      console.error('Failed to load audit events:', error);
    }
  }

  async log(type, data) {
    const event = {
      id: crypto.randomUUID(),
      type,
      data,
      timestamp: Date.now(),
      severity: this.getSeverity(type)
    };

    this.events.push(event);

    // Maintain event limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Save to storage periodically
    if (this.events.length % 100 === 0) {
      await this.saveEvents();
    }

    // Check for threat patterns
    await this.checkThreatPatterns(event);

    console.log('Audit event logged:', event);
  }

  getSeverity(type) {
    const severityMap = {
      'permission_added': 'medium',
      'permission_removed': 'low',
      'api_call': 'low',
      'suspicious_api': 'high',
      'security_violation': 'critical',
      'sensitive_data_detected': 'medium',
      'request_validation': 'low',
      'threat_detected': 'high',
      'rate_limit_exceeded': 'medium'
    };

    return severityMap[type] || 'low';
  }

  async checkThreatPatterns(event) {
    // Check for multiple suspicious events in short time
    const recentEvents = this.events.filter(e => 
      e.timestamp > Date.now() - 60000 && // Last minute
      e.severity === 'high'
    );

    if (recentEvents.length >= this.threatThreshold) {
      await this.log('threat_detected', {
        threatType: 'high_frequency_threats',
        count: recentEvents.length,
        timeframe: '1 minute'
      });
    }
  }

  async saveEvents() {
    try {
      await chrome.storage.local.set({ auditEvents: this.events });
    } catch (error) {
      console.error('Failed to save audit events:', error);
    }
  }

  async getEventCount() {
    return this.events.length;
  }

  async getRecentThreats(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.events.filter(e => 
      e.timestamp > cutoff && 
      e.severity === 'high'
    );
  }

  async getSecurityViolations() {
    return this.events.filter(e => e.type === 'security_violation');
  }

  async getLastAuditTime() {
    if (this.events.length === 0) return null;
    return Math.max(...this.events.map(e => e.timestamp));
  }
}

class SecurityPolicy {
  constructor() {
    this.restrictedPermissions = [
      'nativeMessaging',
      'debugger',
      'certificateProvider',
      'enterprise.platformKeys'
    ];

    this.allowedDomains = [
      'chrome-extension://',
      'http://localhost',
      'https://localhost'
    ];

    this.maxRequestSize = 10 * 1024 * 1024; // 10MB
    this.rateLimitPerMinute = 100;
  }

  async load() {
    // Load custom policy from storage
    try {
      const stored = await chrome.storage.local.get(['securityPolicy']);
      if (stored.securityPolicy) {
        Object.assign(this, stored.securityPolicy);
      }
    } catch (error) {
      console.error('Failed to load security policy:', error);
    }
  }

  isRestrictedPermission(permission) {
    return this.restrictedPermissions.includes(permission);
  }

  isAllowedDomain(url) {
    return this.allowedDomains.some(domain => url.startsWith(domain));
  }

  isRequestSizeValid(size) {
    return size <= this.maxRequestSize;
  }

  async isCompliant() {
    // Check if current configuration complies with policy
    const permissions = await chrome.permissions.getAll();
    
    for (const permission of permissions.permissions) {
      if (this.isRestrictedPermission(permission)) {
        return false;
      }
    }

    return true;
  }

  getRestrictedPermissions() {
    return [...this.restrictedPermissions];
  }
}

class ThreatDetector {
  constructor() {
    this.threatPatterns = new Map();
    this.rateLimits = new Map();
    this.blockedRequests = new Set();
    this.suspiciousDomains = new Set([
      'malware-site.com',
      'phishing-site.com'
    ]);
  }

  async initialize() {
    // Initialize threat patterns
    this.setupThreatPatterns();
    
    // Clean up old rate limits periodically
    setInterval(() => this.cleanupRateLimits(), 60000); // Every minute
  }

  setupThreatPatterns() {
    this.threatPatterns.set('sql_injection', {
      pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b)/i,
      severity: 'high'
    });

    this.threatPatterns.set('xss', {
      pattern: /<script[^>]*>.*?<\/script>/gi,
      severity: 'high'
    });

    this.threatPatterns.set('path_traversal', {
      pattern: /\.\.[\/\\]/,
      severity: 'medium'
    });

    this.threatPatterns.set('command_injection', {
      pattern: /[;&|`$()]/,
      severity: 'high'
    });
  }

  async analyzeRequest(request) {
    const threats = [];
    const requestStr = JSON.stringify(request);

    for (const [name, config] of this.threatPatterns) {
      if (config.pattern.test(requestStr)) {
        threats.push({
          type: name,
          severity: config.severity,
          pattern: config.pattern.toString()
        });
      }
    }

    return threats;
  }

  isSuspiciousAPI(url, options) {
    const urlStr = typeof url === 'string' ? url : url.toString();
    
    // Check for suspicious domains
    try {
      const domain = new URL(urlStr).hostname;
      if (this.suspiciousDomains.has(domain)) {
        return true;
      }
    } catch {
      // Invalid URL is suspicious
      return true;
    }

    // Check for suspicious patterns in URL
    const suspiciousPatterns = [
      /admin/i,
      /config/i,
      /debug/i,
      /test/i,
      /api\/key/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(urlStr));
  }

  async isRateLimited(senderId) {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    if (!this.rateLimits.has(senderId)) {
      this.rateLimits.set(senderId, []);
    }

    const requests = this.rateLimits.get(senderId);
    
    // Remove old requests
    const validRequests = requests.filter(time => time > windowStart);
    this.rateLimits.set(senderId, validRequests);

    // Check if rate limit exceeded
    if (validRequests.length >= 100) { // 100 requests per minute
      return true;
    }

    // Add current request
    validRequests.push(now);
    return false;
  }

  cleanupRateLimits() {
    const now = Date.now();
    const windowStart = now - 60000;

    for (const [senderId, requests] of this.rateLimits) {
      const validRequests = requests.filter(time => time > windowStart);
      if (validRequests.length === 0) {
        this.rateLimits.delete(senderId);
      } else {
        this.rateLimits.set(senderId, validRequests);
      }
    }
  }

  async getActiveThreats() {
    const threats = [];
    
    // Check rate limits
    for (const [senderId, requests] of this.rateLimits) {
      if (requests.length >= 50) { // High activity threshold
        threats.push({
          type: 'high_activity',
          senderId,
          requestCount: requests.length
        });
      }
    }

    return threats;
  }

  async getThreatLevel() {
    const threats = await this.getActiveThreats();
    
    if (threats.length === 0) return 'low';
    if (threats.length <= 5) return 'medium';
    return 'high';
  }

  async getThreatSummary() {
    return {
      activeThreats: await this.getActiveThreats(),
      blockedRequests: this.blockedRequests.size,
      rateLimitedSenders: this.rateLimits.size
    };
  }

  async getBlockedRequests() {
    return Array.from(this.blockedRequests);
  }

  async isRateLimitActive() {
    return this.rateLimits.size > 0;
  }
}

export { SecurityManager };
