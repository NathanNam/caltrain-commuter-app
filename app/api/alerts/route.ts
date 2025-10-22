import { NextResponse } from 'next/server';
import { ServiceAlert } from '@/lib/types';
import { fetchServiceAlerts } from '@/lib/gtfs-realtime';
import { handleAPIError, createCacheKey } from '@/lib/api-utils';
import { cached, CacheConfigs, getCachedSync } from '@/lib/cache-utils';

export async function GET() {
  try {
    // Check if API key is configured
    const hasApiKey = !!process.env.TRANSIT_API_KEY;

    if (hasApiKey) {
      try {
        // Fetch real-time service alerts from 511.org with caching
        const cacheKey = createCacheKey('alerts', 'service-alerts');

        const gtfsAlerts = await cached(cacheKey, async () => {
          return await fetchServiceAlerts();
        }, CacheConfigs.ALERTS);

        // Convert to our ServiceAlert format
        const alerts: ServiceAlert[] = gtfsAlerts.map((alert) => ({
          id: alert.id,
          severity: alert.severity,
          title: alert.headerText,
          description: alert.descriptionText,
          timestamp: new Date().toISOString(),
        }));

        // Return real data (even if empty array - that means no alerts today)
        return NextResponse.json({
          alerts,
          isMockData: false
        }, {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
          }
        });
      } catch (error) {
        console.error('Service alerts API error:', error);

        // Try to get cached data as fallback
        const cacheKey = createCacheKey('alerts', 'service-alerts');
        const cachedAlerts = getCachedSync<any[]>(cacheKey);

        if (cachedAlerts) {
          console.log('Using cached alerts data as fallback');
          const alerts: ServiceAlert[] = cachedAlerts.map((alert) => ({
            id: alert.id,
            severity: alert.severity,
            title: alert.headerText,
            description: alert.descriptionText,
            timestamp: new Date().toISOString(),
          }));

          return NextResponse.json({
            alerts,
            isMockData: false,
            isStaleData: true
          }, {
            headers: {
              'Cache-Control': 'public, s-maxage=300'
            }
          });
        }

        // Fall through to mock data if no cached data available
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

    return NextResponse.json({
      alerts: mockAlerts,
      isMockData: true
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (error) {
    console.error('Error fetching service alerts:', error);

    // Return empty alerts array as final fallback
    return NextResponse.json(
      { alerts: [], isMockData: false, error: 'Failed to fetch alerts' },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=60' // Short cache for error responses
        }
      }
    );
  }
}
