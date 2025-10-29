import { NextResponse } from 'next/server';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { ServiceAlert } from '@/lib/types';
import { fetchServiceAlerts } from '@/lib/gtfs-realtime';
import { logger } from '@/otel-server';

export async function GET() {
  const tracer = trace.getTracer('caltrain-commuter-app');
  const span = tracer.startSpan('alerts.get');

  try {
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/api/alerts',
    });

    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: "Service alerts request received",
    });

    // Check if API key is configured
    const hasApiKey = !!process.env.TRANSIT_API_KEY;
    span.setAttributes({
      'alerts.api_key_configured': hasApiKey,
    });

    if (hasApiKey) {
      // Fetch real-time service alerts from 511.org
      const alertsSpan = tracer.startSpan('alerts.fetch_gtfs');
      const gtfsAlerts = await fetchServiceAlerts();
      alertsSpan.setAttributes({
        'alerts.gtfs.count': gtfsAlerts.length,
      });
      alertsSpan.setStatus({ code: SpanStatusCode.OK });
      alertsSpan.end();

      // Convert to our ServiceAlert format
      const alerts: ServiceAlert[] = gtfsAlerts.map((alert) => ({
        id: alert.id,
        severity: alert.severity,
        title: alert.headerText,
        description: alert.descriptionText,
        timestamp: new Date().toISOString(),
      }));

      span.setAttributes({
        'alerts.count': alerts.length,
        'alerts.data_source': 'gtfs_realtime',
        'alerts.mock_data': false,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: "INFO",
        body: "Service alerts fetched successfully",
        attributes: {
          alertsCount: alerts.length,
          source: 'gtfs_realtime'
        },
      });

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

    span.setAttributes({
      'alerts.count': mockAlerts.length,
      'alerts.data_source': 'mock',
      'alerts.mock_data': true,
    });

    span.setStatus({ code: SpanStatusCode.OK });
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: "Using mock service alerts - API key not configured",
      attributes: {
        alertsCount: mockAlerts.length,
        source: 'mock'
      },
    });

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
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: "Error fetching service alerts",
      attributes: {
        error: (error as Error).message,
        stack: (error as Error).stack
      },
    });

    return NextResponse.json(
      { alerts: [], isMockData: false },
      { status: 200 }
    );
  } finally {
    span.end();
  }
}
