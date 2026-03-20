/**
 * Standardized Error Handling Utility
 * Provides consistent error handling patterns across the extension
 */
class ErrorHandler {
  constructor(config = {}) {
    this.config = {
      enableLogging: true,
      enableAudit: true,
      maxErrorHistory: 1000,
      ...config
    };
    this.errorHistory = [];
    this.auditLogger = null;
  }

  setAuditLogger(auditLogger) {
    this.auditLogger = auditLogger;
  }

  async handleError(error, context, operation) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      context,
      operation,
      timestamp: Date.now(),
      id: crypto.randomUUID()
    };
    
    // Log error
    if (this.config.enableLogging) {
      console.error(`Operation failed: ${operation}`, errorInfo);
    }
    
    // Send to audit log if available
    if (this.config.enableAudit && this.auditLogger) {
      try {
        await this.auditLogger.log('operation_error', errorInfo);
      } catch (auditError) {
        console.error('Failed to log error to audit:', auditError);
      }
    }
    
    // Add to error history
    this.addToHistory(errorInfo);
    
    // Return consistent error format
    return this.formatError(error, operation);
  }

  formatError(error, operation) {
    return {
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      operation,
      timestamp: Date.now(),
      id: crypto.randomUUID()
    };
  }

  addToHistory(errorInfo) {
    this.errorHistory.push(errorInfo);
    
    // Limit history size
    if (this.errorHistory.length > this.config.maxErrorHistory) {
      this.errorHistory.shift();
    }
  }

  getErrorHistory(filter = null, limit = 100) {
    let history = this.errorHistory;
    
    if (filter) {
      history = history.filter(error => {
        if (filter.operation && error.operation !== filter.operation) return false;
        if (filter.context && error.context !== filter.context) return false;
        if (filter.since && error.timestamp < filter.since) return false;
        return true;
      });
    }
    
    return history.slice(-limit);
  }

  getErrorStats() {
    const stats = {
      totalErrors: this.errorHistory.length,
      errorsByOperation: {},
      errorsByContext: {},
      recentErrors: this.errorHistory.slice(-10),
      errorRate: 0
    };
    
    for (const error of this.errorHistory) {
      // Count by operation
      stats.errorsByOperation[error.operation] = 
        (stats.errorsByOperation[error.operation] || 0) + 1;
      
      // Count by context
      stats.errorsByContext[error.context] = 
        (stats.errorsByContext[error.context] || 0) + 1;
    }
    
    // Calculate error rate (errors per hour in last 24h)
    const oneDayAgo = Date.now() - 86400000;
    const recentErrors = this.errorHistory.filter(error => error.timestamp > oneDayAgo);
    stats.errorRate = recentErrors.length / 24; // errors per hour
    
    return stats;
  }

  clearHistory() {
    this.errorHistory = [];
  }

  // Create standardized error types
  static createError(message, code = 'UNKNOWN_ERROR', context = null) {
    const error = new Error(message);
    error.code = code;
    error.context = context;
    return error;
  }

  static createValidationError(message, field = null) {
    return this.createError(message, 'VALIDATION_ERROR', { field });
  }

  static createNetworkError(message, status = null) {
    return this.createError(message, 'NETWORK_ERROR', { status });
  }

  static createPermissionError(message, permission = null) {
    return this.createError(message, 'PERMISSION_ERROR', { permission });
  }

  static createTimeoutError(message, timeout = null) {
    return this.createError(message, 'TIMEOUT_ERROR', { timeout });
  }

  static createNotFoundError(message, resource = null) {
    return this.createError(message, 'NOT_FOUND_ERROR', { resource });
  }

  static createSkillError(message, skill = null, action = null) {
    return this.createError(message, 'SKILL_ERROR', { skill, action });
  }

  // Async error wrapper
  static async safeExecute(fn, errorHandler, context = 'unknown', operation = 'unknown') {
    try {
      const result = await fn();
      return { success: true, result };
    } catch (error) {
      if (errorHandler) {
        return await errorHandler.handleError(error, context, operation);
      }
      return {
        success: false,
        error: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        operation,
        timestamp: Date.now()
      };
    }
  }

  // Retry mechanism with error handling
  static async retry(fn, maxRetries = 3, delay = 1000, errorHandler = null) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          // Final attempt failed
          if (errorHandler) {
            return await errorHandler.handleError(
              error, 
              'retry_mechanism', 
              `operation_failed_after_${maxRetries}_attempts`
            );
          }
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
}

export { ErrorHandler };
