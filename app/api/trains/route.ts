import { NextRequest, NextResponse } from 'next/server';
import { Train } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { fetchTripUpdates, getTripDelay } from '@/lib/gtfs-realtime';
import { getScheduledTrains } from '@/lib/gtfs-static';
import { parseAlertsFromText, extractTrainDelays, fetchCaltrainAlerts, getSystemWideDelays } from '@/lib/caltrain-alerts-scraper';
import { getSystemWideDelayFromSimplify } from '@/lib/simplifytransit-scraper';

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

  // Fetch GTFS-Realtime as PRIMARY delay source (most reliable and accurate)
  const tripUpdates = await fetchTripUpdates();
  const hasGTFSRealtime = tripUpdates.length > 0;

  if (hasGTFSRealtime) {
    console.log(`✓ GTFS-Realtime (PRIMARY): Fetched ${tripUpdates.length} trip updates from 511.org`);
    console.log(`Trip IDs in GTFS-Realtime feed:`, tripUpdates.map(u => u.tripId).join(', '));

    // DEBUG: Log detailed info for train 174
    const train174Update = tripUpdates.find(u => u.tripId === '174' || u.tripId.endsWith('-174'));
    if (train174Update) {
      console.log(`\n=== DEBUG: Train 174 GTFS-RT Data ===`);
      console.log(`  Trip ID: ${train174Update.tripId}`);
      console.log(`  Route ID: ${train174Update.routeId}`);
      console.log(`  Start Date: ${train174Update.startDate}`);
      console.log(`  Stop Time Updates: ${train174Update.stopTimeUpdates.length}`);
      for (const stu of train174Update.stopTimeUpdates.slice(0, 5)) {
        console.log(`    Stop ${stu.stopId}:`);
        if (stu.departure) {
          console.log(`      Departure delay: ${stu.departure.delay} seconds (${Math.round(stu.departure.delay / 60)} minutes)`);
        }
        if (stu.arrival) {
          console.log(`      Arrival delay: ${stu.arrival.delay} seconds (${Math.round(stu.arrival.delay / 60)} minutes)`);
        }
      }
      console.log(`=== END DEBUG ===\n`);
    }
  } else {
    console.warn('✗ GTFS-Realtime (PRIMARY) unavailable from 511.org');
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
  let systemWideDelays: any[] = [];
  if (caltrainAlerts.size === 0) {
    try {
      const scrapedAlerts = await fetchCaltrainAlerts();

      // DEBUG: Log ALL scraped alert texts to understand format
      console.log(`\n=== DEBUG: Scraped ${scrapedAlerts.length} alerts from Caltrain.com ===`);
      for (let i = 0; i < Math.min(scrapedAlerts.length, 5); i++) {
        const alert = scrapedAlerts[i];
        console.log(`Alert ${i + 1}:`);
        console.log(`  Text: "${alert.alertText}"`);
        console.log(`  Type: ${alert.type}`);
        console.log(`  isSystemWide: ${alert.isSystemWide}`);
        console.log(`  delayMinutes: ${alert.delayMinutes}`);
        console.log(`  direction: ${alert.affectedDirection}`);
      }
      console.log(`=== END DEBUG ===\n`);

      caltrainAlerts = extractTrainDelays(scrapedAlerts);
      systemWideDelays = getSystemWideDelays(scrapedAlerts);

      if (caltrainAlerts.size > 0) {
        console.log(`Auto-scraped ${caltrainAlerts.size} train-specific delays from Caltrain.com:`);
        for (const [trainNum, delay] of caltrainAlerts) {
          console.log(`  Train ${trainNum}: ${delay.delayMinutes} min delay`);
        }
      } else {
        console.log('No train-specific delays found in Caltrain.com alerts');
      }

      if (systemWideDelays.length > 0) {
        console.log(`Found ${systemWideDelays.length} system-wide delay alerts:`);
        for (const alert of systemWideDelays) {
          console.log(`  ${alert.alertText.substring(0, 80)}...`);
          console.log(`    Delay: ${alert.delayMinutes} min, Direction: ${alert.affectedDirection || 'both'}, Location: ${alert.affectedLocation || 'system-wide'}`);
        }
      } else {
        console.log('No system-wide delays found in Caltrain.com alerts');
      }
    } catch (error) {
      console.error('Error auto-scraping Caltrain alerts:', error);
    }
  }

  // Fetch SimplifyTransit system-wide delays as additional backup
  let simplifyDelay: number | null = null;
  try {
    console.log('Fetching system-wide delay from SimplifyTransit...');
    simplifyDelay = await getSystemWideDelayFromSimplify();
    if (simplifyDelay) {
      console.log(`✓ SimplifyTransit: System-wide delay of ${simplifyDelay} minutes`);
    } else {
      console.log('SimplifyTransit: No system-wide delay found');
    }
  } catch (error) {
    console.error('✗ SimplifyTransit scraping failed:', error);
  }

  // Get GTFS scheduled trains (uses local files if no API key)
  // Pass trip updates and Caltrain alerts so filtering can account for delays
  const combinedDelays = new Map(caltrainAlerts);

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
  // 1. GTFS-Realtime from 511.org (PRIMARY - most reliable, automated, trip-specific)
  // 2. Caltrain.com alerts (SECONDARY - train-specific and system-wide delays)
  // 3. SimplifyTransit (TERTIARY - system-wide delays as final backup)

  const hasAnyDelaySource = hasGTFSRealtime || caltrainAlerts.size > 0 || simplifyDelay !== null;

  if (hasAnyDelaySource) {
    let matchedCount = 0;
    let unmatchedCount = 0;
    let delaySource = '';

    // Debug: Log first few trains to understand trip_id format
    if (trains.length > 0 && hasGTFSRealtime) {
      console.log('Sample train data for GTFS-RT matching:');
      console.log(`  Train 1: trainNumber=${trains[0].trainNumber}, tripId=${trains[0].tripId}`);
      if (trains.length > 1) {
        console.log(`  Train 2: trainNumber=${trains[1].trainNumber}, tripId=${trains[1].tripId}`);
      }
      console.log(`  GTFS-RT feed has ${tripUpdates.length} trip updates`);
      if (tripUpdates.length > 0) {
        console.log(`  Sample GTFS-RT tripId: ${tripUpdates[0].tripId}`);
      }
    }

    for (const train of trains) {
      if (train.tripId || train.trainNumber) {
        const trainNum = train.trainNumber;

        // PRIORITY ORDER:
        // 1. GTFS-Realtime (PRIMARY - most reliable, trip-specific)
        // 2. Train-specific Caltrain.com alerts (SECONDARY)
        // 3. System-wide Caltrain.com alerts (TERTIARY)
        // 4. SimplifyTransit system-wide alerts (FALLBACK)

        const alertDelay = caltrainAlerts.get(trainNum);
        const gtfsDelay = hasGTFSRealtime ? getTripDelay(tripUpdates, train.tripId!, trainNum) : null;

        // Check if train matches any system-wide delay alerts from Caltrain.com
        let systemWideDelay: number | null = null;
        for (const sysAlert of systemWideDelays) {
          // Check direction match
          const trainDirection = train.direction.toLowerCase();
          const isDirectionMatch =
            sysAlert.affectedDirection === 'both' ||
            (sysAlert.affectedDirection === 'northbound' && trainDirection.includes('north')) ||
            (sysAlert.affectedDirection === 'southbound' && trainDirection.includes('south'));

          if (isDirectionMatch) {
            // For now, apply system-wide delays to all matching trains
            // TODO: Add location-based filtering (e.g., only apply if train passes through San Jose Diridon)
            systemWideDelay = sysAlert.delayMinutes;
            break; // Use first matching system-wide alert
          }
        }

        if (gtfsDelay) {
          // Priority 1: GTFS-RT has delay info (including 0 delay = on-time)
          train.delay = gtfsDelay.delay;
          train.status = gtfsDelay.status;
          matchedCount++;
          delaySource = 'gtfs-rt';
        } else if (alertDelay && alertDelay.delayMinutes > 0) {
          // Priority 2: Train-specific Caltrain alert has delay info
          train.delay = alertDelay.delayMinutes;
          train.status = 'delayed';
          matchedCount++;
          delaySource = 'caltrain.com';
        } else if (systemWideDelay && systemWideDelay > 0) {
          // Priority 3: Caltrain.com system-wide delay applies to this train
          train.delay = systemWideDelay;
          train.status = 'delayed';
          matchedCount++;
          delaySource = 'caltrain.com-systemwide';
        } else if (simplifyDelay && simplifyDelay > 0) {
          // Priority 4: SimplifyTransit system-wide delay as final fallback
          train.delay = simplifyDelay;
          train.status = 'delayed';
          matchedCount++;
          delaySource = 'simplifytransit';
        } else {
          // No delay data from any source - assume on-time
          train.status = 'on-time';
          train.delay = 0;
          unmatchedCount++;
        }
      } else {
        // Fallback for trains without trip_id or trainNumber (mock data)
        train.status = 'on-time';
        train.delay = 0;
      }
    }

    const source = hasGTFSRealtime ? 'GTFS-RT 511.org (PRIMARY)' :
                   'Caltrain.com alerts (SECONDARY)';
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
