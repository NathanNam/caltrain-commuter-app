import { NextRequest, NextResponse } from 'next/server';
import { Train } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { fetchTripUpdates, getTripDelay } from '@/lib/gtfs-realtime';
import { getScheduledTrains } from '@/lib/gtfs-static';
import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { logger, tracer, meter } from '@/otel-server';

// Initialize metrics
const requestCounter = meter.createCounter('trains_api_requests_total', {
  description: 'Total number of requests to the trains API',
});

const requestDuration = meter.createHistogram('trains_api_request_duration_ms', {
  description: 'Duration of trains API requests in milliseconds',
});

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  return tracer.startActiveSpan('trains.api.get', async (span: Span) => {
    try {
      const searchParams = request.nextUrl.searchParams;
      const origin = searchParams.get('origin');
      const destination = searchParams.get('destination');

      span.setAttributes({
        'http.method': 'GET',
        'http.route': '/api/trains',
        'trains.origin': origin || '',
        'trains.destination': destination || '',
      });

      if (!origin || !destination) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing required parameters' });
        span.recordException(new Error('Origin and destination are required'));

        logger.emit({
          severityNumber: SeverityNumber.WARN,
          severityText: 'WARN',
          body: 'Trains API request missing required parameters',
          attributes: { origin, destination },
        });

        requestCounter.add(1, { status: 'error', error_type: 'missing_params' });

        return NextResponse.json(
          { error: 'Origin and destination are required' },
          { status: 400 }
        );
      }

      // Validate stations exist
      const originStation = getStationById(origin);
      const destinationStation = getStationById(destination);

      if (!originStation || !destinationStation) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid station ID' });
        span.recordException(new Error('Invalid station ID'));

        logger.emit({
          severityNumber: SeverityNumber.WARN,
          severityText: 'WARN',
          body: 'Trains API request with invalid station ID',
          attributes: { origin, destination },
        });

        requestCounter.add(1, { status: 'error', error_type: 'invalid_station' });

        return NextResponse.json(
          { error: 'Invalid station ID' },
          { status: 400 }
        );
      }

      span.setAttributes({
        'trains.origin_station': originStation.name,
        'trains.destination_station': destinationStation.name,
      });

      // Get GTFS scheduled trains (uses local files if no API key)
      let trains: Train[] = [];
      let usingMockSchedule = false;

      try {
        trains = await getScheduledTrains(origin, destination);

        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: `API route received ${trains.length} trains from GTFS`,
          attributes: {
            origin,
            destination,
            train_count: trains.length,
            first_train: trains.length > 0 ? JSON.stringify(trains[0]) : null
          },
        });

        span.setAttributes({
          'trains.gtfs_count': trains.length,
          'trains.using_gtfs': true,
        });
      } catch (error) {
        span.recordException(error as Error);

        logger.emit({
          severityNumber: SeverityNumber.ERROR,
          severityText: 'ERROR',
          body: 'Error fetching GTFS schedule',
          attributes: {
            origin,
            destination,
            error: (error as Error).message
          },
        });
      }

      // Only use generateMockTrains as absolute fallback if GTFS fails
      if (trains.length === 0) {
        logger.emit({
          severityNumber: SeverityNumber.WARN,
          severityText: 'WARN',
          body: 'GTFS schedule unavailable, using fallback mock data',
          attributes: { origin, destination },
        });

        trains = generateMockTrains(origin, destination);
        usingMockSchedule = true;

        span.setAttributes({
          'trains.using_mock_schedule': true,
          'trains.mock_count': trains.length,
        });
      } else {
        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: `Using ${trains.length} real GTFS trains`,
          attributes: { origin, destination, train_count: trains.length },
        });

        span.setAttributes({
          'trains.using_mock_schedule': false,
        });
      }

      // Fetch real-time trip updates and enhance trains with delay information
      const tripUpdates = await fetchTripUpdates();
      const hasRealDelays = tripUpdates.length > 0;

      span.setAttributes({
        'trains.trip_updates_count': tripUpdates.length,
        'trains.has_real_delays': hasRealDelays,
      });

      if (hasRealDelays) {
        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: `Fetched ${tripUpdates.length} trip updates from GTFS-Realtime`,
          attributes: { origin, destination, trip_updates_count: tripUpdates.length },
        });

    // Use real delay data from 511.org
    // Match delays by trip_id for train-specific accuracy
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const train of trains) {
      if (train.tripId) {
        const delayInfo = getTripDelay(tripUpdates, train.tripId);
        if (delayInfo) {
          train.delay = delayInfo.delay;
          train.status = delayInfo.status;
          matchedCount++;
          console.log(`Train ${train.trainNumber} (trip_id: ${train.tripId}): ${delayInfo.status}, delay: ${delayInfo.delay} min`);
        } else {
          // No delay info found for this trip - assume on-time
          train.status = 'on-time';
          train.delay = 0;
          unmatchedCount++;
          console.log(`Train ${train.trainNumber} (trip_id: ${train.tripId}): NO MATCH in GTFS-Realtime data - assuming on-time`);
        }
      } else {
        // Fallback for trains without trip_id (mock data)
        train.status = 'on-time';
        train.delay = 0;
      }
    }

        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: `Delay matching summary: ${matchedCount} matched, ${unmatchedCount} unmatched out of ${trains.length} trains`,
          attributes: {
            origin,
            destination,
            matched_count: matchedCount,
            unmatched_count: unmatchedCount,
            total_trains: trains.length
          },
        });

        span.setAttributes({
          'trains.delay_matched_count': matchedCount,
          'trains.delay_unmatched_count': unmatchedCount,
        });
      } else {
        // Add mock delay data when no API key
        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: 'Using mock delay data - configure TRANSIT_API_KEY for real delays',
          attributes: { origin, destination },
        });
    for (let i = 0; i < trains.length; i++) {
      const train = trains[i];
      // Simulate realistic delays: most on-time, some delayed
      const random = Math.random();
      if (random < 0.7) {
        // 70% on-time
        train.status = 'on-time';
        train.delay = 0;
      } else if (random < 0.95) {
        // 25% delayed
        train.status = 'delayed';
        train.delay = Math.floor(Math.random() * 15) + 3; // 3-17 minutes
      } else {
        // 5% cancelled
        train.status = 'cancelled';
      }
    }
  }

      const duration = Date.now() - startTime;

      span.setAttributes({
        'trains.response_train_count': trains.length,
        'trains.is_mock_data': !hasRealDelays,
        'trains.is_mock_schedule': usingMockSchedule,
        'http.status_code': 200,
      });

      span.setStatus({ code: SpanStatusCode.OK });

      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: 'INFO',
        body: 'Trains API request completed successfully',
        attributes: {
          origin,
          destination,
          train_count: trains.length,
          duration_ms: duration,
          is_mock_data: !hasRealDelays,
          is_mock_schedule: usingMockSchedule
        },
      });

      requestCounter.add(1, { status: 'success' });
      requestDuration.record(duration, { status: 'success' });

      return NextResponse.json({
        trains,
        isMockData: !hasRealDelays, // Flag to indicate mock delay data
        isMockSchedule: usingMockSchedule // Flag to indicate mock schedule data
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
        }
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);

      logger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: 'ERROR',
        body: 'Trains API request failed',
        attributes: {
          error: (error as Error).message,
          duration_ms: duration
        },
      });

      requestCounter.add(1, { status: 'error', error_type: 'internal_error' });
      requestDuration.record(duration, { status: 'error' });

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      span.end();
    }
  });
}

// Mock train data generator with weekday/weekend/holiday awareness
function generateMockTrains(origin: string, destination: string): Train[] {
  const now = new Date();
  const trains: Train[] = [];

  // Determine direction based on station order
  const isNorthbound = origin > destination;
  const direction = isNorthbound ? 'Northbound' : 'Southbound';

  // Determine schedule type (weekday, weekend, or holiday)
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Check if it's a holiday (simplified - would need a holiday calendar for accuracy)
  const isHoliday = isUSHoliday(now);

  // Adjust frequency and timing based on schedule
  let baseInterval: number;
  let numTrains: number;

  if (isHoliday) {
    // Holiday schedule (reduced service, similar to Sunday)
    baseInterval = 60; // Every ~60 minutes
    numTrains = 3;
  } else if (isWeekend) {
    // Weekend schedule (less frequent)
    baseInterval = 45; // Every ~45 minutes
    numTrains = 4;
  } else {
    // Weekday schedule (more frequent during commute hours)
    const hour = now.getHours();
    const isPeakHours = (hour >= 6 && hour <= 9) || (hour >= 16 && hour <= 19);
    baseInterval = isPeakHours ? 20 : 30; // More frequent during peak
    numTrains = 5;
  }

  // Generate trains based on schedule
  for (let i = 0; i < numTrains; i++) {
    const intervalVariation = Math.floor(Math.random() * 10) - 5; // ±5 min variation
    const departureTime = new Date(now.getTime() + (15 + i * baseInterval + intervalVariation) * 60000);
    const duration = 30 + Math.floor(Math.random() * 30); // 30-60 min duration
    const arrivalTime = new Date(departureTime.getTime() + duration * 60000);

    // Train types vary by schedule
    let type: 'Local' | 'Limited' | 'Express';
    if (isWeekend || isHoliday) {
      // Weekends/holidays have more Local trains, fewer Express
      type = i < 2 ? 'Local' : 'Limited';
    } else {
      // Weekdays have all types
      const trainTypes: ('Local' | 'Limited' | 'Express')[] = ['Local', 'Limited', 'Express'];
      type = trainTypes[i % 3];
    }

    trains.push({
      trainNumber: `${100 + i * 2}`,
      direction,
      departureTime: departureTime.toISOString(),
      arrivalTime: arrivalTime.toISOString(),
      duration,
      type
    });
  }

  return trains;
}

// Helper function to check for US holidays
function isUSHoliday(date: Date): boolean {
  const month = date.getMonth(); // 0-11
  const day = date.getDate();
  const dayOfWeek = date.getDay();

  // Major US holidays when Caltrain runs holiday schedule
  // New Year's Day
  if (month === 0 && day === 1) return true;

  // Memorial Day (last Monday in May)
  if (month === 4 && dayOfWeek === 1 && day >= 25) return true;

  // Independence Day
  if (month === 6 && day === 4) return true;

  // Labor Day (first Monday in September)
  if (month === 8 && dayOfWeek === 1 && day <= 7) return true;

  // Thanksgiving (4th Thursday in November)
  if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;

  // Christmas Day
  if (month === 11 && day === 25) return true;

  return false;
}

/*
  TO INTEGRATE WITH REAL API:

  1. 511.org Transit API:
     - Get API key from https://511.org/open-data/token
     - Add to .env.local as TRANSIT_API_KEY
     - Use endpoint: https://api.511.org/transit/StopMonitoring?api_key=${key}&agency=CT

  2. Example API call:
     const response = await fetch(
       `https://api.511.org/transit/StopMonitoring?api_key=${process.env.TRANSIT_API_KEY}&agency=CT&stopCode=${originStation.code}`,
       { next: { revalidate: 60 } }
     );

  3. Parse response and filter by destination
*/
