import { NextRequest, NextResponse } from 'next/server';
import { Train } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { findTripUpdate, findVehicle, getRealtimeSnapshot, getStopDelay } from '@/lib/gtfs-realtime';
import { findTrips, getFeed, isFeedExpired } from '@/lib/gtfs-static';

const MAX_TRAINS = 5;
// Look back far enough to keep a late train that is still due to leave.
const LOOKBACK_MS = 2 * 60 * 60 * 1000;

/**
 * Next trains between two stations.
 *
 * Times come from the GTFS timetable. Live status (delay at the rider's origin
 * stop, cancellations) and vehicle positions come from 511's GTFS-RT, matched
 * by trip_id and service date. Without live data trains are returned as
 * scheduled (no status), and `realtime.available` is false; nothing is invented.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const origin = getStationById(searchParams.get('origin') ?? '');
  const destination = getStationById(searchParams.get('destination') ?? '');

  if (!origin || !destination || origin.id === destination.id) {
    return NextResponse.json({ error: 'Valid, different origin and destination are required' }, { status: 400 });
  }

  const now = new Date();
  const [feed, realtime] = await Promise.all([getFeed(), getRealtimeSnapshot()]);

  if (!feed) {
    return NextResponse.json({ error: 'The timetable could not be loaded' }, { status: 503 });
  }

  const candidates = findTrips(feed, origin, destination, now, now.getTime() - LOOKBACK_MS);
  const trains: Train[] = [];

  for (const trip of candidates) {
    const train: Train = {
      trainNumber: trip.trainNumber,
      tripId: trip.tripId,
      serviceDate: trip.serviceDate,
      direction: trip.direction,
      departureTime: trip.departureTime,
      arrivalTime: trip.arrivalTime,
      duration: trip.duration,
      type: trip.type,
    };

    if (realtime.available) {
      const update = findTripUpdate(realtime.tripUpdates, trip.tripId, trip.serviceDate);
      const live = update ? getStopDelay(update, trip.originStopId, trip.originSequence) : null;
      if (live) {
        train.delay = live.delay;
        train.status = live.status;
      }
      const vehicle = findVehicle(realtime.vehicles, trip.tripId, trip.serviceDate);
      if (vehicle) {
        train.vehiclePosition = {
          latitude: vehicle.latitude,
          longitude: vehicle.longitude,
          bearing: vehicle.bearing,
          speed: vehicle.speed,
          currentStatus: vehicle.currentStatus,
          timestamp: vehicle.timestamp,
        };
      }
    }

    // Keep trains that have not left the origin yet (expected time = schedule + live delay).
    const expectedDep = new Date(trip.departureTime).getTime() + Math.max(0, train.delay ?? 0) * 60000;
    if (expectedDep < now.getTime()) continue;

    trains.push(train);
    if (trains.length >= MAX_TRAINS) break;
  }

  return NextResponse.json(
    {
      trains,
      realtime: {
        available: realtime.available,
        fetchedAt: new Date(realtime.fetchedAt).toISOString(),
        vehicles: realtime.vehicles.length,
      },
      timetable: {
        source: feed.source,
        feedEndDate: feed.feedEndDate,
        expired: isFeedExpired(feed.feedEndDate, now),
      },
    },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' } }
  );
}
