// API timeout and request utilities
// Provides timeout handling, request deduplication, and error handling for external API calls

import { cached, CacheConfigs } from './cache-utils';

// In-flight request tracking for deduplication
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Fetch with timeout using AbortController
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 5000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms: ${url}`);
    }
    
    throw error;
  }
}

/**
 * Fetch JSON with timeout and error handling
 */
export async function fetchJSON<T>(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  const response = await fetchWithTimeout(url, options);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
  }
  
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Invalid JSON response from ${url}: ${error}`);
  }
}

/**
 * Fetch with request deduplication
 * Prevents multiple concurrent requests to the same URL
 */
export async function fetchWithDeduplication<T>(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  const requestKey = `${url}:${JSON.stringify(options)}`;
  
  // Check if request is already in flight
  if (inFlightRequests.has(requestKey)) {
    return inFlightRequests.get(requestKey);
  }
  
  // Create new request
  const requestPromise = fetchJSON<T>(url, options)
    .finally(() => {
      // Remove from in-flight tracking when complete
      inFlightRequests.delete(requestKey);
    });
  
  // Track the request
  inFlightRequests.set(requestKey, requestPromise);
  
  return requestPromise;
}

/**
 * Cached fetch with timeout and deduplication
 */
export async function cachedFetchWithTimeout<T>(
  url: string,
  cacheKey: string,
  cacheConfig: typeof CacheConfigs[keyof typeof CacheConfigs],
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  return cached(cacheKey, () => fetchWithDeduplication<T>(url, options), cacheConfig);
}

/**
 * Fetch 511.org GTFS data with proper timeout and error handling
 */
export async function fetch511API(
  endpoint: string,
  apiKey: string,
  options: { timeout?: number; agency?: string } = {}
): Promise<Response> {
  const { timeout = 5000, agency = 'CT' } = options;
  
  const url = `http://api.511.org/transit/${endpoint}?api_key=${apiKey}&agency=${agency}`;
  
  return fetchWithTimeout(url, {
    timeout,
    next: { revalidate: endpoint.includes('tripupdates') ? 30 : 300 }
  });
}

/**
 * Fetch OpenWeatherMap API with timeout
 */
export async function fetchWeatherAPI(
  lat: number,
  lng: number,
  apiKey: string,
  options: { timeout?: number } = {}
): Promise<any> {
  const { timeout = 5000 } = options;
  
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;
  
  return fetchJSON(url, {
    timeout,
    next: { revalidate: 600 } // Cache for 10 minutes
  });
}

/**
 * Fetch Ticketmaster API with timeout
 */
export async function fetchTicketmasterAPI(
  venueId: string,
  date: string,
  apiKey: string,
  options: { timeout?: number } = {}
): Promise<any> {
  const { timeout = 10000 } = options;
  
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&venueId=${venueId}&startDateTime=${date}T00:00:00Z&endDateTime=${date}T23:59:59Z&size=20`;
  
  return fetchJSON(url, {
    timeout,
    next: { revalidate: 1800 } // Cache for 30 minutes
  });
}

/**
 * Fetch ESPN Sports API with timeout
 */
export async function fetchESPNAPI(
  sport: 'basketball/nba' | 'basketball/wnba' | 'football/nfl',
  team: string,
  options: { timeout?: number } = {}
): Promise<any> {
  const { timeout = 10000 } = options;
  
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/teams/${team}/schedule`;
  
  return fetchJSON(url, {
    timeout,
    next: { revalidate: 1800 } // Cache for 30 minutes
  });
}

/**
 * Fetch MLB Stats API with timeout
 */
export async function fetchMLBAPI(
  teamId: number,
  startDate: string,
  endDate: string,
  options: { timeout?: number } = {}
): Promise<any> {
  const { timeout = 10000 } = options;
  
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`;
  
  return fetchJSON(url, {
    timeout,
    next: { revalidate: 1800 } // Cache for 30 minutes
  });
}

/**
 * Fetch NHL API with timeout
 */
export async function fetchNHLAPI(
  teamCode: string,
  season: string,
  options: { timeout?: number } = {}
): Promise<any> {
  const { timeout = 10000 } = options;
  
  const url = `https://api-web.nhle.com/v1/club-schedule-season/${teamCode}/${season}`;
  
  return fetchJSON(url, {
    timeout,
    next: { revalidate: 1800 } // Cache for 30 minutes
  });
}

/**
 * Parallel fetch with Promise.allSettled for graceful error handling
 */
export async function fetchAllSettled<T>(
  requests: Array<() => Promise<T>>
): Promise<Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: any }>> {
  const promises = requests.map(request => request());
  return Promise.allSettled(promises);
}

/**
 * Parallel fetch with timeout for multiple URLs
 */
export async function fetchMultipleWithTimeout<T>(
  urls: string[],
  options: RequestInit & { timeout?: number } = {}
): Promise<Array<T | null>> {
  const requests = urls.map(url => () => fetchJSON<T>(url, options));
  const results = await fetchAllSettled(requests);
  
  return results.map(result => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error('Fetch failed:', result.reason);
      return null;
    }
  });
}

/**
 * Retry fetch with exponential backoff
 */
export async function fetchWithRetry<T>(
  fetcher: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetcher();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Create a cache key for API requests
 */
export function createCacheKey(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}:${parts.join(':')}`;
}

/**
 * Error handler for API failures with fallback data
 */
export function handleAPIError<T>(
  error: Error,
  fallbackData: T | null = null,
  context = 'API'
): T {
  console.error(`${context} error:`, error.message);
  
  if (fallbackData !== null) {
    console.log(`Using fallback data for ${context}`);
    return fallbackData;
  }
  
  throw error;
}

/**
 * Check if error is a timeout error
 */
export function isTimeoutError(error: Error): boolean {
  return error.message.includes('timeout') || error.name === 'AbortError';
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: Error): boolean {
  return error.message.includes('fetch') || 
         error.message.includes('network') ||
         error.message.includes('ENOTFOUND') ||
         error.message.includes('ECONNREFUSED');
}
