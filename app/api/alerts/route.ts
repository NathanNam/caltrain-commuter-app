import { NextResponse } from 'next/server';
import { ServiceAlert } from '@/lib/types';
import { fetchServiceAlerts } from '@/lib/gtfs-realtime';
import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { logger, tracer, meter } from '@/otel-server';
import { resilientFetch, DEFAULT_RETRY_CONFIG } from '@/lib/api-resilience';

// Initialize metrics
const alertsRequestCounter = meter.createCounter('alerts_api_requests_total', {
  description: 'Total number of requests to the alerts API',
});

const alertsRequestDuration = meter.createHistogram('alerts_api_request_duration_ms', {
  description: 'Duration of alerts API requests in milliseconds',
});

export async function GET() {
  const startTime = Date.now();

  return tracer.startActiveSpan('alerts.api.get', async (span: Span) => {
    try {
      span.setAttributes({
        'http.method': 'GET',
        'http.route': '/api/alerts',
      });

      // Check if API key is configured
      const hasApiKey = !!process.env.TRANSIT_API_KEY;

      span.setAttributes({
        'alerts.has_api_key': hasApiKey,
      });

      if (hasApiKey) {
        // Fetch real-time service alerts from 511.org with resilience
        const gtfsAlerts = await fetchServiceAlertsWithResilience();

        // Convert to our ServiceAlert format
        const alerts: ServiceAlert[] = gtfsAlerts.map((alert) => ({
          id: alert.id,
          severity: alert.severity,
          title: alert.headerText,
          description: alert.descriptionText,
          timestamp: new Date().toISOString(),
        }));

        const duration = Date.now() - startTime;

        span.setAttributes({
          'alerts.count': alerts.length,
          'alerts.is_mock_data': false,
          'http.status_code': 200,
        });

        span.setStatus({ code: SpanStatusCode.OK });

        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: 'Alerts API request completed with real data',
          attributes: {
            alert_count: alerts.length,
            duration_ms: duration
          },
        });

        alertsRequestCounter.add(1, { status: 'success', data_type: 'real' });
        alertsRequestDuration.record(duration, { status: 'success', data_type: 'real' });

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
      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: 'INFO',
        body: 'Using mock service alerts - configure TRANSIT_API_KEY for real alerts',
      });

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

      const duration = Date.now() - startTime;

      span.setAttributes({
        'alerts.count': mockAlerts.length,
        'alerts.is_mock_data': true,
        'http.status_code': 200,
      });

      span.setStatus({ code: SpanStatusCode.OK });

      alertsRequestCounter.add(1, { status: 'success', data_type: 'mock' });
      alertsRequestDuration.record(duration, { status: 'success', data_type: 'mock' });

      return NextResponse.json({
        alerts: mockAlerts,
        isMockData: true
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);

      logger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: 'ERROR',
        body: 'Error fetching service alerts',
        attributes: {
          error: (error as Error).message,
          duration_ms: duration
        },
      });

      alertsRequestCounter.add(1, { status: 'error' });
      alertsRequestDuration.record(duration, { status: 'error' });

      return NextResponse.json(
        { alerts: [], isMockData: false },
        { status: 200 }
      );
    } finally {
      span.end();
    }
  });
}

// Resilient wrapper for service alerts
async function fetchServiceAlertsWithResilience() {
  const apiKey = process.env.TRANSIT_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    // Use resilient fetch for 511.org service alerts
    const cacheKey = `service_alerts_${Math.floor(Date.now() / 300000)}`; // 5-minute cache buckets

    return await resilientFetch('http://api.511.org/transit/servicealerts', {
      method: 'GET',
      cacheKey,
      cacheConfig: {
        ttlMs: 300000, // 5 minutes
        staleWhileRevalidateMs: 600000, // 10 minutes
      },
      retryConfig: {
        ...DEFAULT_RETRY_CONFIG,
        maxRetries: 2,
        retryableStatusCodes: [429, 502, 503, 504, 408],
      },
      circuitBreakerConfig: {
        failureThreshold: 3,
        resetTimeoutMs: 300000, // 5 minutes
        monitoringPeriodMs: 600000, // 10 minutes
      },
      context: 'service_alerts',
      parser: async (response) => {
        // Parse the service alerts response
        // For now, fall back to the original function for complex parsing
        throw new Error('Use original fetchServiceAlerts for complex parsing');
      }
    });
  } catch (error) {
    // Fall back to original function
    logger.emit({
      severityNumber: SeverityNumber.WARN,
      severityText: 'WARN',
      body: 'Resilient fetch failed, falling back to original fetchServiceAlerts',
      attributes: {
        error: (error as Error).message
      },
    });

    return await fetchServiceAlerts();
  }
}
