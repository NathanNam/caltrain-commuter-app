import { NextResponse } from 'next/server';
import { ServiceAlert } from '@/lib/types';
import { fetchServiceAlerts } from '@/lib/gtfs-realtime';

export async function GET() {
  try {
    // Check if API key is configured
    const hasApiKey = !!process.env.TRANSIT_API_KEY;

    if (hasApiKey) {
      // Fetch real-time service alerts from 511.org
      const gtfsAlerts = await fetchServiceAlerts();

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
    return NextResponse.json(
      { alerts: [], isMockData: false },
      { status: 200 }
    );
  }
}
