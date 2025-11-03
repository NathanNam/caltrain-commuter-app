import { NextResponse } from 'next/server';
import { ServiceAlert } from '@/lib/types';
import { fetchServiceAlerts } from '@/lib/gtfs-realtime';

// Circuit breaker pattern for 511.org API failures
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

// Fallback cache for last successful response
interface AlertsCache {
  alerts: ServiceAlert[];
  timestamp: number;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailureTime: 0,
  isOpen: false
};

const fallbackCache: AlertsCache = {
  alerts: [],
  timestamp: 0
};

const CIRCUIT_BREAKER_THRESHOLD = 3; // Open circuit after 3 failures
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute timeout
const FALLBACK_CACHE_DURATION = 3600000; // 1 hour

function isCircuitBreakerOpen(): boolean {
  if (!circuitBreaker.isOpen) return false;

  // Check if timeout has passed to reset circuit breaker
  const now = Date.now();
  if (now - circuitBreaker.lastFailureTime > CIRCUIT_BREAKER_TIMEOUT) {
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    console.log('Circuit breaker reset - attempting 511.org API again');
    return false;
  }

  return true;
}

function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();

  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    console.warn(`Circuit breaker opened after ${circuitBreaker.failures} failures - using fallback for ${CIRCUIT_BREAKER_TIMEOUT/1000}s`);
  }
}

function recordSuccess(): void {
  circuitBreaker.failures = 0;
  circuitBreaker.isOpen = false;
}

function updateFallbackCache(alerts: ServiceAlert[]): void {
  fallbackCache.alerts = alerts;
  fallbackCache.timestamp = Date.now();
}

function getFallbackAlerts(): ServiceAlert[] | null {
  const now = Date.now();
  if (now - fallbackCache.timestamp < FALLBACK_CACHE_DURATION) {
    console.log('Using fallback cached alerts');
    return fallbackCache.alerts;
  }
  return null;
}

export async function GET() {
  const startTime = performance.now();
  console.time('Alerts API');

  try {
    // Check if API key is configured
    const hasApiKey = !!process.env.TRANSIT_API_KEY;

    if (hasApiKey) {
      // Check circuit breaker before attempting API call
      if (isCircuitBreakerOpen()) {
        const fallbackAlerts = getFallbackAlerts();
        if (fallbackAlerts) {
          const endTime = performance.now();
          const duration = endTime - startTime;
          console.timeEnd('Alerts API');
          console.log(`Alerts API (fallback): ${duration.toFixed(2)}ms`);

          return NextResponse.json({
            alerts: fallbackAlerts,
            isMockData: false
          }, {
            headers: {
              'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' // Cache for 15 min
            }
          });
        }
      }

      try {
        // Fetch real-time service alerts from 511.org with timeout
        const gtfsAlerts = await Promise.race([
          fetchServiceAlerts(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('511.org API timeout')), 5000)
          )
        ]);

        // Convert to our ServiceAlert format
        const alerts: ServiceAlert[] = gtfsAlerts.map((alert) => ({
          id: alert.id,
          severity: alert.severity,
          title: alert.headerText,
          description: alert.descriptionText,
          timestamp: new Date().toISOString(),
        }));

        // Record success and update fallback cache
        recordSuccess();
        updateFallbackCache(alerts);

        const endTime = performance.now();
        const duration = endTime - startTime;
        console.timeEnd('Alerts API');
        if (duration > 100) {
          console.warn(`Slow Alerts API operation: took ${duration.toFixed(2)}ms`);
        }

        // Return real data (even if empty array - that means no alerts today)
        return NextResponse.json({
          alerts,
          isMockData: false
        }, {
          headers: {
            'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' // Cache for 15 min
          }
        });
      } catch (error) {
        console.error('511.org API error:', error);
        recordFailure();

        // Try fallback cache
        const fallbackAlerts = getFallbackAlerts();
        if (fallbackAlerts) {
          console.log('Using fallback alerts due to API failure');
          const endTime = performance.now();
          const duration = endTime - startTime;
          console.timeEnd('Alerts API');

          return NextResponse.json({
            alerts: fallbackAlerts,
            isMockData: false
          }, {
            headers: {
              'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' // Cache for 15 min
            }
          });
        }

        // Fall through to mock data if no fallback available
      }
    }

    // No API key configured - return mock alerts
    console.log('Using mock service alerts - configure TRANSIT_API_KEY for real alerts');
    const mockAlerts: ServiceAlert[] = [
      {
        id: 'mock-1',
        severity: 'info',
        title: 'Weekend Schedule in Effect',
        description: 'Caltrain is operating on a weekend schedule. Trains run less frequently on weekends.',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'mock-2',
        severity: 'warning',
        title: 'Demo Service Alert',
        description: 'This is sample alert data. Configure TRANSIT_API_KEY in .env.local for real service alerts.',
        timestamp: new Date().toISOString(),
      },
    ];

    const endTime = performance.now();
    const duration = endTime - startTime;
    console.timeEnd('Alerts API');
    if (duration > 100) {
      console.warn(`Slow Alerts API operation: took ${duration.toFixed(2)}ms`);
    }

    return NextResponse.json({
      alerts: mockAlerts,
      isMockData: true
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' // Cache for 15 min
      }
    });
  } catch (error) {
    console.error('Error fetching service alerts:', error);

    const endTime = performance.now();
    const duration = endTime - startTime;
    console.timeEnd('Alerts API');
    console.warn(`Alerts API error after ${duration.toFixed(2)}ms:`, error);

    return NextResponse.json(
      { alerts: [], isMockData: false },
      { status: 200 }
    );
  }
}
