import { NextRequest, NextResponse } from 'next/server';
import { Train } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { fetchTripUpdates, getStopDelay } from '@/lib/gtfs-realtime';
import { getScheduledTrains } from '@/lib/gtfs-static';

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

  // Get GTFS scheduled trains (uses local files if no API key)
  let trains: Train[] = [];
  let usingMockSchedule = false;

  try {
    trains = await getScheduledTrains(origin, destination);
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

  // Fetch real-time trip updates and enhance trains with delay information
  const tripUpdates = await fetchTripUpdates();
  const hasRealDelays = tripUpdates.length > 0;

  if (hasRealDelays) {
    // Use real delay data from 511.org
    for (const train of trains) {
      const delayInfo = getStopDelay(tripUpdates, originStation.code);
      if (delayInfo) {
        train.delay = delayInfo.delay;
        train.status = delayInfo.status;
      } else {
        train.status = 'on-time';
      }
    }
  } else {
    // Add mock delay data when no API key
    console.log('Using mock delay data - configure TRANSIT_API_KEY for real delays');
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
    isMockData: !hasRealDelays, // Flag to indicate mock delay data
    isMockSchedule: usingMockSchedule // Flag to indicate mock schedule data
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
