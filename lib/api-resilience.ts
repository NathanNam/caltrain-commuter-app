// API Resilience utilities for handling rate limiting, retries, and circuit breaker patterns
import { logger, tracer, meter } from '@/otel-server';
import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';

// Metrics for monitoring API resilience
const retryCounter = meter.createCounter('api_retries_total', {
  description: 'Total number of API retries',
});

const circuitBreakerCounter = meter.createCounter('circuit_breaker_events_total', {
  description: 'Total number of circuit breaker events',
});

const cacheHitCounter = meter.createCounter('cache_hits_total', {
  description: 'Total number of cache hits',
});

// Configuration interfaces
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  retryableErrors: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitoringPeriodMs: number;
}

export interface CacheConfig {
  ttlMs: number;
  maxSize: number;
  staleWhileRevalidateMs?: number;
}

// Default configurations
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'],
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  monitoringPeriodMs: 300000, // 5 minutes
};

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttlMs: 300000, // 5 minutes
  maxSize: 1000,
  staleWhileRevalidateMs: 600000, // 10 minutes
};

// Circuit breaker states
enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

// Circuit breaker implementation
class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeoutMs) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
        
        circuitBreakerCounter.add(1, { 
          circuit: this.name, 
          event: 'half_open' 
        });
        
        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: `Circuit breaker ${this.name} transitioning to half-open`,
        });
      } else {
        circuitBreakerCounter.add(1, { 
          circuit: this.name, 
          event: 'rejected' 
        });
        
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) { // Require 3 successes to close
        this.state = CircuitBreakerState.CLOSED;
        
        circuitBreakerCounter.add(1, { 
          circuit: this.name, 
          event: 'closed' 
        });
        
        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: `Circuit breaker ${this.name} closed after successful recovery`,
        });
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      
      circuitBreakerCounter.add(1, { 
        circuit: this.name, 
        event: 'opened' 
      });
      
      logger.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: 'WARN',
        body: `Circuit breaker ${this.name} opened after ${this.failures} failures`,
      });
    }
  }

  getState(): string {
    return this.state;
  }
}

// Global circuit breakers
const circuitBreakers = new Map<string, CircuitBreaker>();

function getCircuitBreaker(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name, config || DEFAULT_CIRCUIT_BREAKER_CONFIG));
  }
  return circuitBreakers.get(name)!;
}

// Enhanced cache implementation with stale-while-revalidate
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  isStale: boolean;
}

class EnhancedCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private revalidationPromises = new Map<string, Promise<T>>();

  constructor(private config: CacheConfig) {}

  async get(
    key: string, 
    fetcher: () => Promise<T>,
    span?: Span
  ): Promise<T> {
    const entry = this.cache.get(key);
    const now = Date.now();

    // Cache hit - return immediately if not stale
    if (entry && (now - entry.timestamp) < this.config.ttlMs) {
      cacheHitCounter.add(1, { type: 'fresh' });
      span?.setAttributes({ 'cache.hit': true, 'cache.fresh': true });
      return entry.data;
    }

    // Stale-while-revalidate: return stale data while fetching fresh
    if (entry && this.config.staleWhileRevalidateMs && 
        (now - entry.timestamp) < this.config.staleWhileRevalidateMs) {
      
      cacheHitCounter.add(1, { type: 'stale' });
      span?.setAttributes({ 'cache.hit': true, 'cache.fresh': false });

      // Start background revalidation if not already in progress
      if (!this.revalidationPromises.has(key)) {
        const revalidationPromise = this.revalidateInBackground(key, fetcher);
        this.revalidationPromises.set(key, revalidationPromise);
      }

      return entry.data;
    }

    // Cache miss or expired - fetch fresh data
    span?.setAttributes({ 'cache.hit': false });
    return this.fetchAndCache(key, fetcher);
  }

  private async revalidateInBackground(key: string, fetcher: () => Promise<T>): Promise<T> {
    try {
      const freshData = await fetcher();
      this.set(key, freshData);
      return freshData;
    } catch (error) {
      logger.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: 'WARN',
        body: 'Background cache revalidation failed',
        attributes: { cache_key: key, error: (error as Error).message },
      });
      throw error;
    } finally {
      this.revalidationPromises.delete(key);
    }
  }

  private async fetchAndCache(key: string, fetcher: () => Promise<T>): Promise<T> {
    const data = await fetcher();
    this.set(key, data);
    return data;
  }

  private set(key: string, data: T): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.config.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      isStale: false,
    });
  }

  clear(): void {
    this.cache.clear();
    this.revalidationPromises.clear();
  }
}

// Global caches for different API types
const apiCaches = new Map<string, EnhancedCache<any>>();

function getCache<T>(name: string, config?: CacheConfig): EnhancedCache<T> {
  if (!apiCaches.has(name)) {
    apiCaches.set(name, new EnhancedCache<T>(config || DEFAULT_CACHE_CONFIG));
  }
  return apiCaches.get(name)!;
}

// Exponential backoff retry with jitter
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context: string = 'unknown'
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on the last attempt
      if (attempt === config.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error as Error, config)) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
      const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
      const delay = Math.min(baseDelay + jitter, config.maxDelayMs);

      retryCounter.add(1, { 
        context, 
        attempt: attempt + 1,
        error_type: getErrorType(error as Error)
      });

      logger.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: 'WARN',
        body: `Retrying ${context} after error (attempt ${attempt + 1}/${config.maxRetries})`,
        attributes: {
          context,
          attempt: attempt + 1,
          delay_ms: delay,
          error: (error as Error).message,
        },
      });

      await sleep(delay);
    }
  }

  throw lastError!;
}

// Check if an error is retryable
function isRetryableError(error: Error, config: RetryConfig): boolean {
  // Check for HTTP status codes
  if ('status' in error && typeof error.status === 'number') {
    return config.retryableStatusCodes.includes(error.status);
  }

  // Check for network errors
  const errorMessage = error.message.toLowerCase();
  return config.retryableErrors.some(retryableError => 
    errorMessage.includes(retryableError.toLowerCase())
  );
}

// Get error type for metrics
function getErrorType(error: Error): string {
  if ('status' in error && typeof error.status === 'number') {
    return `http_${error.status}`;
  }
  
  const message = error.message.toLowerCase();
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('network')) return 'network';
  if (message.includes('connection')) return 'connection';
  
  return 'unknown';
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main resilient fetch function that combines all patterns
export async function resilientFetch<T>(
  url: string,
  options: RequestInit & {
    retryConfig?: Partial<RetryConfig>;
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
    cacheConfig?: Partial<CacheConfig>;
    cacheKey?: string;
    parser?: (response: Response) => Promise<T>;
    context?: string;
  } = {}
): Promise<T> {
  const {
    retryConfig = {},
    circuitBreakerConfig = {},
    cacheConfig = {},
    cacheKey,
    parser = (response: Response) => response.json() as Promise<T>,
    context = url,
    ...fetchOptions
  } = options;

  const finalRetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  const finalCircuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...circuitBreakerConfig };
  const finalCacheConfig = { ...DEFAULT_CACHE_CONFIG, ...cacheConfig };

  return tracer.startActiveSpan(`resilient_fetch.${context}`, async (span: Span) => {
    try {
      span.setAttributes({
        'http.url': url,
        'http.method': fetchOptions.method || 'GET',
        'resilience.cache_enabled': !!cacheKey,
        'resilience.circuit_breaker_enabled': true,
        'resilience.retry_enabled': true,
      });

      // Use cache if cache key is provided
      if (cacheKey) {
        const cache = getCache<T>(context, finalCacheConfig);
        return await cache.get(cacheKey, async () => {
          return await executeWithCircuitBreaker(url, fetchOptions, parser, context, finalRetryConfig, finalCircuitBreakerConfig);
        }, span);
      }

      // Execute without cache
      return await executeWithCircuitBreaker(url, fetchOptions, parser, context, finalRetryConfig, finalCircuitBreakerConfig);
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

// Execute fetch with circuit breaker and retry logic
async function executeWithCircuitBreaker<T>(
  url: string,
  fetchOptions: RequestInit,
  parser: (response: Response) => Promise<T>,
  context: string,
  retryConfig: RetryConfig,
  circuitBreakerConfig: CircuitBreakerConfig
): Promise<T> {
  const circuitBreaker = getCircuitBreaker(context, circuitBreakerConfig);

  return await circuitBreaker.execute(async () => {
    return await retryWithBackoff(async () => {
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & { status: number };
        error.status = response.status;
        throw error;
      }

      return await parser(response);
    }, retryConfig, context);
  });
}

// Export utility functions
export {
  getCircuitBreaker,
  getCache,
  CircuitBreakerState,
};
