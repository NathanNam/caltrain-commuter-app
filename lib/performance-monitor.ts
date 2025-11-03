/**
 * Performance Monitoring Utility
 * 
 * Provides centralized performance monitoring for critical operations
 * with configurable thresholds and detailed logging.
 */

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface PerformanceThresholds {
  warning: number; // ms
  error: number; // ms
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private activeTimers: Map<string, number> = new Map();
  private thresholds: Map<string, PerformanceThresholds> = new Map();

  constructor() {
    // Set default thresholds for common operations
    this.setThreshold('api-request', { warning: 100, error: 1000 });
    this.setThreshold('database-query', { warning: 50, error: 500 });
    this.setThreshold('external-api', { warning: 300, error: 2000 });
    this.setThreshold('gtfs-processing', { warning: 100, error: 1000 });
    this.setThreshold('cache-operation', { warning: 10, error: 100 });
  }

  /**
   * Set performance thresholds for an operation type
   */
  setThreshold(operation: string, thresholds: PerformanceThresholds): void {
    this.thresholds.set(operation, thresholds);
  }

  /**
   * Start timing an operation
   */
  start(operationId: string): void {
    this.activeTimers.set(operationId, performance.now());
    console.time(operationId);
  }

  /**
   * End timing an operation and log performance metrics
   */
  end(operationId: string, metadata?: Record<string, any>): number {
    const startTime = this.activeTimers.get(operationId);
    if (!startTime) {
      console.warn(`Performance monitor: No start time found for operation ${operationId}`);
      return 0;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.timeEnd(operationId);
    this.activeTimers.delete(operationId);

    // Record metric
    const metric: PerformanceMetric = {
      operation: operationId,
      duration,
      timestamp: new Date(),
      metadata
    };
    this.metrics.push(metric);

    // Keep only last 100 metrics to prevent memory leaks
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }

    // Check thresholds and log warnings/errors
    this.checkThresholds(operationId, duration, metadata);

    return duration;
  }

  /**
   * Check performance thresholds and log appropriately
   */
  private checkThresholds(operation: string, duration: number, metadata?: Record<string, any>): void {
    // Try to find specific threshold, fall back to generic patterns
    let threshold = this.thresholds.get(operation);
    
    if (!threshold) {
      // Try pattern matching for operation types
      if (operation.includes('api')) {
        threshold = this.thresholds.get('api-request');
      } else if (operation.includes('gtfs')) {
        threshold = this.thresholds.get('gtfs-processing');
      } else if (operation.includes('cache')) {
        threshold = this.thresholds.get('cache-operation');
      }
    }

    if (!threshold) {
      // Default threshold if no specific one found
      threshold = { warning: 100, error: 1000 };
    }

    const metadataStr = metadata ? ` (${JSON.stringify(metadata)})` : '';

    if (duration >= threshold.error) {
      console.error(`🚨 SLOW OPERATION: ${operation} took ${duration.toFixed(2)}ms${metadataStr}`);
    } else if (duration >= threshold.warning) {
      console.warn(`⚠️  Slow operation: ${operation} took ${duration.toFixed(2)}ms${metadataStr}`);
    } else {
      console.log(`✅ ${operation}: ${duration.toFixed(2)}ms${metadataStr}`);
    }
  }

  /**
   * Get performance statistics for an operation type
   */
  getStats(operation?: string): {
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    p95Duration: number;
  } {
    const relevantMetrics = operation 
      ? this.metrics.filter(m => m.operation === operation)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return { count: 0, avgDuration: 0, minDuration: 0, maxDuration: 0, p95Duration: 0 };
    }

    const durations = relevantMetrics.map(m => m.duration).sort((a, b) => a - b);
    const count = durations.length;
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / count;
    const minDuration = durations[0];
    const maxDuration = durations[count - 1];
    const p95Index = Math.floor(count * 0.95);
    const p95Duration = durations[p95Index] || maxDuration;

    return { count, avgDuration, minDuration, maxDuration, p95Duration };
  }

  /**
   * Log performance summary
   */
  logSummary(): void {
    const operations = [...new Set(this.metrics.map(m => m.operation))];
    
    console.log('\n📊 Performance Summary:');
    console.log('========================');
    
    for (const operation of operations) {
      const stats = this.getStats(operation);
      console.log(`${operation}:`);
      console.log(`  Count: ${stats.count}`);
      console.log(`  Avg: ${stats.avgDuration.toFixed(2)}ms`);
      console.log(`  P95: ${stats.p95Duration.toFixed(2)}ms`);
      console.log(`  Range: ${stats.minDuration.toFixed(2)}ms - ${stats.maxDuration.toFixed(2)}ms`);
    }
    console.log('========================\n');
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Convenience functions for common use cases
export const startTimer = (operationId: string) => performanceMonitor.start(operationId);
export const endTimer = (operationId: string, metadata?: Record<string, any>) => 
  performanceMonitor.end(operationId, metadata);

// Decorator for timing async functions
export function timed(operationName: string) {
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;
    
    descriptor.value = async function (...args: any[]) {
      const timerId = `${operationName}-${Date.now()}`;
      performanceMonitor.start(timerId);
      
      try {
        const result = await originalMethod.apply(this, args);
        performanceMonitor.end(timerId, { success: true });
        return result;
      } catch (error) {
        performanceMonitor.end(timerId, { success: false, error: error.message });
        throw error;
      }
    } as T;
    
    return descriptor;
  };
}
