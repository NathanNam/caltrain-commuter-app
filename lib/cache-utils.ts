// Centralized cache utility module with TTL support and stale-while-revalidate pattern
// Provides in-memory caching with configurable TTL and background refresh capabilities

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  staleWhileRevalidate?: number; // Additional time to serve stale data while refreshing
  refreshPromise?: Promise<T>; // In-flight refresh promise
}

interface CacheOptions {
  ttl: number; // Time to live in milliseconds
  staleWhileRevalidate?: number; // Additional time to serve stale data while refreshing
  maxSize?: number; // Maximum number of entries (LRU eviction)
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private accessCounter = 0;
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Get cached data with stale-while-revalidate support
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<T> {
    const entry = this.cache.get(key);
    const now = Date.now();

    // Update access order for LRU
    this.accessOrder.set(key, ++this.accessCounter);

    if (!entry) {
      // Cache miss - fetch fresh data
      const data = await fetcher();
      this.set(key, data, options);
      return data;
    }

    const age = now - entry.timestamp;
    const isStale = age > entry.ttl;
    const isExpired = entry.staleWhileRevalidate 
      ? age > (entry.ttl + entry.staleWhileRevalidate)
      : isStale;

    if (!isStale) {
      // Fresh data - return immediately
      return entry.data;
    }

    if (isExpired) {
      // Data is too old - fetch fresh data synchronously
      const data = await fetcher();
      this.set(key, data, options);
      return data;
    }

    // Data is stale but within stale-while-revalidate window
    // Return stale data immediately and refresh in background
    if (!entry.refreshPromise) {
      entry.refreshPromise = fetcher()
        .then(data => {
          this.set(key, data, options);
          return data;
        })
        .catch(error => {
          console.error(`Background refresh failed for key ${key}:`, error);
          // Remove the failed refresh promise so we can try again
          if (entry.refreshPromise) {
            delete entry.refreshPromise;
          }
          throw error;
        });
    }

    return entry.data;
  }

  /**
   * Set cache entry
   */
  set<T>(key: string, data: T, options: CacheOptions): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: options.ttl,
      staleWhileRevalidate: options.staleWhileRevalidate
    };

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);
  }

  /**
   * Get cached data without refresh (returns undefined if expired)
   */
  getSync<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    const age = now - entry.timestamp;
    const isExpired = entry.staleWhileRevalidate 
      ? age > (entry.ttl + entry.staleWhileRevalidate)
      : age > entry.ttl;

    if (isExpired) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return undefined;
    }

    // Update access order for LRU
    this.accessOrder.set(key, ++this.accessCounter);
    return entry.data;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.getSync(key) !== undefined;
  }

  /**
   * Delete cache entry
   */
  delete(key: string): boolean {
    this.accessOrder.delete(key);
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      accessCounter: this.accessCounter
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }
}

// Global cache instance
const globalCache = new MemoryCache(1000);

// Predefined cache configurations for different data types
export const CacheConfigs = {
  // GTFS static data - cache for 24 hours
  GTFS_STATIC: {
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    staleWhileRevalidate: 2 * 60 * 60 * 1000 // 2 hours stale tolerance
  },
  
  // GTFS realtime data - cache for 30 seconds
  GTFS_REALTIME: {
    ttl: 30 * 1000, // 30 seconds
    staleWhileRevalidate: 60 * 1000 // 1 minute stale tolerance
  },
  
  // Events data - cache for 1 hour
  EVENTS: {
    ttl: 60 * 60 * 1000, // 1 hour
    staleWhileRevalidate: 30 * 60 * 1000 // 30 minutes stale tolerance
  },
  
  // Weather data - cache for 15 minutes
  WEATHER: {
    ttl: 15 * 60 * 1000, // 15 minutes
    staleWhileRevalidate: 15 * 60 * 1000 // 15 minutes stale tolerance
  },
  
  // Service alerts - cache for 5 minutes
  ALERTS: {
    ttl: 5 * 60 * 1000, // 5 minutes
    staleWhileRevalidate: 10 * 60 * 1000 // 10 minutes stale tolerance
  },
  
  // Sports API data - cache for 30 minutes
  SPORTS: {
    ttl: 30 * 60 * 1000, // 30 minutes
    staleWhileRevalidate: 60 * 60 * 1000 // 1 hour stale tolerance
  },
  
  // Ticketmaster API data - cache for 30 minutes
  TICKETMASTER: {
    ttl: 30 * 60 * 1000, // 30 minutes
    staleWhileRevalidate: 60 * 60 * 1000 // 1 hour stale tolerance
  }
};

/**
 * Cached fetch function with automatic cache key generation
 */
export async function cachedFetch<T>(
  url: string,
  options: CacheOptions,
  fetchOptions?: RequestInit
): Promise<T> {
  const cacheKey = `fetch:${url}:${JSON.stringify(fetchOptions || {})}`;
  
  return globalCache.get(cacheKey, async () => {
    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }, options);
}

/**
 * Cached function execution with custom cache key
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions
): Promise<T> {
  return globalCache.get(key, fetcher, options);
}

/**
 * Get cached data synchronously (no refresh)
 */
export function getCachedSync<T>(key: string): T | undefined {
  return globalCache.getSync(key);
}

/**
 * Warm cache with initial data
 */
export function warmCache<T>(key: string, data: T, options: CacheOptions): void {
  globalCache.set(key, data, options);
}

/**
 * Clear specific cache entry
 */
export function clearCache(key: string): boolean {
  return globalCache.delete(key);
}

/**
 * Clear all cache entries
 */
export function clearAllCache(): void {
  globalCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return globalCache.getStats();
}

export default globalCache;
