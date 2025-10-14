import { NextResponse } from 'next/server';
import { ServiceAlert } from '@/lib/types';
import { fetchServiceAlerts } from '@/lib/gtfs-realtime';

export async function GET() {
  try {
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

    return NextResponse.json({ alerts }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (error) {
    console.error('Error fetching service alerts:', error);
    return NextResponse.json(
      { alerts: [] },
      { status: 200 } // Return empty array instead of error
    );
  }
}
