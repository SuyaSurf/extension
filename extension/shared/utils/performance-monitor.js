/**
 * Performance monitoring for extension operations
 * Tracks metrics, memory usage, and performance thresholds
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.thresholds = {
      memoryUsage: 50 * 1024 * 1024, // 50MB
      responseTime: 2000, // 2 seconds
      cacheHitRate: 0.8, // 80%
      cpuUsage: 0.8 // 80%
    };
    this.isInitialized = false;
    this.alerts = [];
    this.maxAlerts = 100;
    this.cleanupInterval = null;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Start cleanup interval
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, 60000); // Every minute
      
      this.isInitialized = true;
      console.log('Performance Monitor initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Performance Monitor:', error);
      throw error;
    }
  }

  trackOperation(operation, duration, metadata = {}) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        measurements: [],
        totalDuration: 0,
        count: 0,
        errors: 0
      });
    }
    
    const metric = this.metrics.get(operation);
    const measurement = {
      duration,
      timestamp: Date.now(),
      metadata
    };
    
    metric.measurements.push(measurement);
    metric.totalDuration += duration;
    metric.count += 1;
    
    // Keep only last 100 measurements per operation
    if (metric.measurements.length > 100) {
      metric.measurements = metric.measurements.slice(-100);
    }
    
    // Check performance thresholds
    this.checkThresholds(operation, duration, metadata);
    
    return measurement;
  }

  trackError(operation, error, metadata = {}) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        measurements: [],
        totalDuration: 0,
        count: 0,
        errors: 0
      });
    }
    
    const metric = this.metrics.get(operation);
    metric.errors += 1;
    
    this.addAlert('error', {
      operation,
      error: error.message,
      metadata,
      timestamp: Date.now()
    });
  }

  checkThresholds(operation, duration, metadata) {
    // Response time threshold
    if (duration > this.thresholds.responseTime) {
      this.addAlert('slow_operation', {
        operation,
        duration,
        threshold: this.thresholds.responseTime,
        metadata,
        timestamp: Date.now()
      });
    }

    // Memory usage check
    if (performance.memory) {
      const memoryUsage = performance.memory.usedJSHeapSize;
      if (memoryUsage > this.thresholds.memoryUsage) {
        this.addAlert('high_memory', {
          operation,
          memoryUsage,
          threshold: this.thresholds.memoryUsage,
          metadata,
          timestamp: Date.now()
        });
        this.triggerCleanup();
      }
    }

    // CPU usage check (if available)
    if (performance.now && metadata.cpuUsage) {
      if (metadata.cpuUsage > this.thresholds.cpuUsage) {
        this.addAlert('high_cpu', {
          operation,
          cpuUsage: metadata.cpuUsage,
          threshold: this.thresholds.cpuUsage,
          metadata,
          timestamp: Date.now()
        });
      }
    }
  }

  triggerCleanup() {
    // Trigger garbage collection if available
    if (global.gc) {
      try {
        global.gc();
        console.log('Manual garbage collection triggered');
      } catch (error) {
        console.warn('Failed to trigger garbage collection:', error);
      }
    }
    
    // Emit cleanup event
    if (this.eventBus) {
      this.eventBus.emit('performance:cleanup', {
        timestamp: Date.now(),
        reason: 'high_memory'
      });
    }
  }

  addAlert(type, data) {
    const alert = {
      id: Date.now() + Math.random(),
      type,
      data,
      timestamp: Date.now()
    };
    
    this.alerts.push(alert);
    
    // Keep only recent alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }
    
    // Log warning
    console.warn(`Performance alert [${type}]:`, data);
    
    // Emit alert event
    if (this.eventBus) {
      this.eventBus.emit('performance:alert', alert);
    }
  }

  getPerformanceReport() {
    const report = {
      timestamp: Date.now(),
      operations: {},
      summary: {
        totalOperations: 0,
        averageResponseTime: 0,
        errorRate: 0,
        memoryUsage: 0
      },
      alerts: this.alerts.slice(-10), // Recent alerts
      thresholds: this.thresholds
    };
    
    let totalDuration = 0;
    let totalCount = 0;
    let totalErrors = 0;
    
    for (const [operation, metric] of this.metrics) {
      const durations = metric.measurements.map(m => m.duration);
      const recentDurations = durations.slice(-10); // Last 10 measurements
      
      report.operations[operation] = {
        count: metric.count,
        errors: metric.errors,
        errorRate: metric.count > 0 ? metric.errors / metric.count : 0,
        average: durations.length > 0 ? durations.reduce((a, b) => a + b) / durations.length : 0,
        min: durations.length > 0 ? Math.min(...durations) : 0,
        max: durations.length > 0 ? Math.max(...durations) : 0,
        recent: recentDurations,
        lastMeasurement: metric.measurements.length > 0 ? 
          metric.measurements[metric.measurements.length - 1].timestamp : null
      };
      
      totalDuration += metric.totalDuration;
      totalCount += metric.count;
      totalErrors += metric.errors;
    }
    
    // Update summary
    report.summary.totalOperations = totalCount;
    report.summary.averageResponseTime = totalCount > 0 ? totalDuration / totalCount : 0;
    report.summary.errorRate = totalCount > 0 ? totalErrors / totalCount : 0;
    
    // Memory info
    if (performance.memory) {
      report.summary.memoryUsage = {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    }
    
    return report;
  }

  getOperationMetrics(operation) {
    const metric = this.metrics.get(operation);
    if (!metric) {
      return null;
    }
    
    const durations = metric.measurements.map(m => m.duration);
    return {
      count: metric.count,
      errors: metric.errors,
      errorRate: metric.count > 0 ? metric.errors / metric.count : 0,
      average: durations.length > 0 ? durations.reduce((a, b) => a + b) / durations.length : 0,
      min: durations.length > 0 ? Math.min(...durations) : 0,
      max: durations.length > 0 ? Math.max(...durations) : 0,
      recent: durations.slice(-10),
      measurements: metric.measurements
    };
  }

  getAlerts(type = null, limit = 50) {
    let alerts = this.alerts;
    
    if (type) {
      alerts = alerts.filter(alert => alert.type === type);
    }
    
    return alerts.slice(-limit);
  }

  clearAlerts(type = null) {
    if (type) {
      this.alerts = this.alerts.filter(alert => alert.type !== type);
    } else {
      this.alerts = [];
    }
  }

  clearMetrics(operation = null) {
    if (operation) {
      this.metrics.delete(operation);
    } else {
      this.metrics.clear();
    }
  }

  cleanup() {
    // Clean old measurements (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    
    for (const [operation, metric] of this.metrics) {
      metric.measurements = metric.measurements.filter(
        measurement => measurement.timestamp > oneHourAgo
      );
    }
    
    // Clean old alerts (older than 1 hour)
    this.alerts = this.alerts.filter(alert => alert.timestamp > oneHourAgo);
  }

  setEventBus(eventBus) {
    this.eventBus = eventBus;
  }

  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('Performance thresholds updated:', this.thresholds);
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanup();
    this.isInitialized = false;
  }
}

export { PerformanceMonitor };
