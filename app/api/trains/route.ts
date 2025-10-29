import { NextRequest, NextResponse } from 'next/server';
import { Train } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { fetchTripUpdates, getTripDelay } from '@/lib/gtfs-realtime';
import { getScheduledTrains } from '@/lib/gtfs-static';
import { parseAlertsFromText, extractTrainDelays, fetchCaltrainAlerts } from '@/lib/caltrain-alerts-scraper';
import { getAllTrainDelaysFromTwitter } from '@/lib/twitter-alerts-scraper';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const origin = searchParams.get('origin');
  const destination = searchParams.get('destination');

  if (!origin || !destination) {
    return NextResponse.json(
      { error: 'Origin and destination are required' },
      { status: 400 }
    );
  }

  // Validate stations exist
  const originStation = getStationById(origin);
  const destinationStation = getStationById(destination);

  if (!originStation || !destinationStation) {
    return NextResponse.json(
      { error: 'Invalid station ID' },
      { status: 400 }
    );
  }

  // Fetch real-time trip updates FIRST (before filtering trains by time)
  // This allows us to filter based on actual departure time (scheduled + delay)
  const tripUpdates = await fetchTripUpdates();
  const hasGTFSRealtime = tripUpdates.length > 0;

  if (hasGTFSRealtime) {
    console.log(`✓ Fetched ${tripUpdates.length} trip updates from GTFS-Realtime (511.org)`);
    console.log(`Trip IDs in GTFS-Realtime feed:`, tripUpdates.map(u => u.tripId).join(', '));
  } else {
    console.warn('✗ GTFS-Realtime unavailable from 511.org - will use backup delay sources');
  }

  // Fetch Twitter alerts as backup delay source (when GTFS-RT unavailable)
  let twitterDelays = new Map<string, number>();
  if (!hasGTFSRealtime) {
    try {
      console.log('Fetching backup delay data from @CaltrainAlerts Twitter...');
      twitterDelays = await getAllTrainDelaysFromTwitter();
      if (twitterDelays.size > 0) {
        console.log(`✓ Twitter backup: Found delays for ${twitterDelays.size} trains`);
      } else {
        console.warn('✗ Twitter backup: No delay information found');
      }
    } catch (error) {
      console.error('✗ Twitter backup failed:', error);
    }
  }

  // Parse Caltrain alerts for train-specific delays
  // Priority: 1) Query parameter (for testing), 2) Automated scraping from Caltrain.com
  let caltrainAlerts = new Map();

  // First, check for query parameter override (for testing/debugging)
  const alertsParam = searchParams.get('alerts');
  if (alertsParam) {
    try {
      const decodedAlerts = decodeURIComponent(alertsParam);
      const parsedAlerts = parseAlertsFromText(decodedAlerts);
      caltrainAlerts = extractTrainDelays(parsedAlerts);
      console.log(`Parsed ${caltrainAlerts.size} train delays from query parameter`);
    } catch (error) {
      console.error('Error parsing Caltrain alerts from query parameter:', error);
    }
  }

  // If no query parameter, fetch alerts from Caltrain.com automatically
  if (caltrainAlerts.size === 0) {
    try {
      const scrapedAlerts = await fetchCaltrainAlerts();
      caltrainAlerts = extractTrainDelays(scrapedAlerts);
      if (caltrainAlerts.size > 0) {
        console.log(`Auto-scraped ${caltrainAlerts.size} train delays from Caltrain.com`);
      }
    } catch (error) {
      console.error('Error auto-scraping Caltrain alerts:', error);
    }
  }

  // Get GTFS scheduled trains (uses local files if no API key)
  // Pass trip updates and delay sources so filtering can account for delays
  // Combine all delay sources: Twitter delays take priority when GTFS-RT unavailable
  const combinedDelays = new Map(caltrainAlerts);
  if (!hasGTFSRealtime && twitterDelays.size > 0) {
    // When GTFS-RT unavailable, merge Twitter delays with Caltrain alerts
    // Twitter takes priority (more real-time)
    for (const [trainNum, delay] of twitterDelays) {
      combinedDelays.set(trainNum, { delayMinutes: delay });
    }
  }

  let trains: Train[] = [];
  let usingMockSchedule = false;

  try {
    trains = await getScheduledTrains(origin, destination, new Date(), tripUpdates, combinedDelays);
    console.log(`API route received ${trains.length} trains from GTFS`);
    if (trains.length > 0) {
      console.log('First train:', trains[0]);
    }
  } catch (error) {
    console.error('Error fetching GTFS schedule:', error);
  }

  // Only use generateMockTrains as absolute fallback if GTFS fails
  if (trains.length === 0) {
    console.warn('GTFS schedule unavailable, using fallback mock data');
    trains = generateMockTrains(origin, destination);
    usingMockSchedule = true;
  } else {
    console.log(`Using ${trains.length} real GTFS trains`);
  }

  // Delay Priority System:
  // 1. GTFS-Realtime from 511.org (most accurate, trip-specific)
  // 2. Twitter @CaltrainAlerts (backup when 511.org unavailable)
  // 3. Caltrain.com alerts (additional context)

  const hasAnyDelaySource = hasGTFSRealtime || twitterDelays.size > 0 || caltrainAlerts.size > 0;

  if (hasAnyDelaySource) {
    let matchedCount = 0;
    let unmatchedCount = 0;
    let delaySource = '';

    for (const train of trains) {
      if (train.tripId || train.trainNumber) {
        const trainNum = train.trainNumber;

        if (hasGTFSRealtime) {
          // Priority 1: GTFS-Realtime (most accurate)
          const delayInfo = getTripDelay(tripUpdates, train.tripId!);
          const alertDelay = caltrainAlerts.get(trainNum);

          if (alertDelay && alertDelay.delayMinutes > 0) {
            // Caltrain alert has delay info - use it (overrides GTFS-RT)
            train.delay = alertDelay.delayMinutes;
            train.status = 'delayed';
            matchedCount++;
            delaySource = 'caltrain.com';
          } else if (delayInfo && delayInfo.delay !== 0) {
            // GTFS-RT has non-zero delay info - use it
            train.delay = delayInfo.delay;
            train.status = delayInfo.status;
            matchedCount++;
            delaySource = 'gtfs-rt';
          } else {
            // No delay from either source - assume on-time
            train.status = 'on-time';
            train.delay = 0;
            unmatchedCount++;
          }
        } else {
          // Priority 2: Twitter delays (when GTFS-RT unavailable)
          const twitterDelay = twitterDelays.get(trainNum);
          const alertDelay = caltrainAlerts.get(trainNum);

          if (twitterDelay !== undefined) {
            // Twitter has delay info - use it
            train.delay = twitterDelay;
            train.status = twitterDelay > 0 ? 'delayed' : 'on-time';
            matchedCount++;
            delaySource = 'twitter';
          } else if (alertDelay && alertDelay.delayMinutes > 0) {
            // Caltrain alert has delay info - use it
            train.delay = alertDelay.delayMinutes;
            train.status = 'delayed';
            matchedCount++;
            delaySource = 'caltrain.com';
          } else {
            // No delay info - assume on-time
            train.status = 'on-time';
            train.delay = 0;
            unmatchedCount++;
          }
        }
      } else {
        // Fallback for trains without trip_id or trainNumber (mock data)
        train.status = 'on-time';
        train.delay = 0;
      }
    }

    const source = hasGTFSRealtime ? 'GTFS-RT (511.org)' :
                   twitterDelays.size > 0 ? 'Twitter @CaltrainAlerts' :
                   'Caltrain.com alerts';
    console.log(`✓ Delay data source: ${source}`);
    console.log(`  Matched: ${matchedCount}, Unmatched: ${unmatchedCount} out of ${trains.length} trains`);
  } else {
    // Add mock delay data when no delay sources available
    console.log('⚠ Using mock delay data - no real delay sources available');
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

  return NextResponse.json({
    trains,
    isMockData: !hasAnyDelaySource, // Flag to indicate mock delay data
    isMockSchedule: usingMockSchedule, // Flag to indicate mock schedule data
    delaySource: hasGTFSRealtime ? 'gtfs-rt' :
                 twitterDelays.size > 0 ? 'twitter' :
                 caltrainAlerts.size > 0 ? 'caltrain-alerts' :
                 'none'
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
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
