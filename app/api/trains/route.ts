import { NextRequest, NextResponse } from 'next/server';
import { Train } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { fetchTripUpdates, getStopDelay } from '@/lib/gtfs-realtime';

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

  // Fetch real-time trip updates
  const tripUpdates = await fetchTripUpdates();

  // Generate base train data (mock for now, should be replaced with GTFS schedule data)
  const trains = generateMockTrains(origin, destination);

  // Enhance trains with real-time delay information
  if (tripUpdates.length > 0) {
    for (const train of trains) {
      const delayInfo = getStopDelay(tripUpdates, originStation.code);
      if (delayInfo) {
        train.delay = delayInfo.delay;
        train.status = delayInfo.status;
      } else {
        train.status = 'on-time';
      }
    }
  }

  return NextResponse.json({ trains }, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
    }
  });
}

// Mock train data generator
function generateMockTrains(origin: string, destination: string): Train[] {
  const now = new Date();
  const trains: Train[] = [];

  // Determine direction based on station order
  const isNorthbound = origin > destination;
  const direction = isNorthbound ? 'Northbound' : 'Southbound';

  // Generate 5 upcoming trains at ~20-30 minute intervals
  for (let i = 0; i < 5; i++) {
    const departureTime = new Date(now.getTime() + (15 + i * 25) * 60000);
    const duration = 30 + Math.floor(Math.random() * 30); // 30-60 min duration
    const arrivalTime = new Date(departureTime.getTime() + duration * 60000);

    const trainTypes: ('Local' | 'Limited' | 'Express')[] = ['Local', 'Limited', 'Express'];
    const type = trainTypes[i % 3];

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
