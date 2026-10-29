import { NextRequest, NextResponse } from 'next/server';
import { LiveTrain, Train } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import {
  findTripUpdate,
  findVehicle,
  getRealtimeSnapshot,
  getStopDelay,
  isAtFirstStop,
  isFreshPosition,
} from '@/lib/gtfs-realtime';
import { findTrips, getFeed, isFeedExpired, trainTypeFromRoute } from '@/lib/gtfs-static';

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

  // Attach live status (delay at the origin stop) and the train's own vehicle.
  const withLive: Train[] = candidates.map((trip) => {
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
      const schedule = { stopTimes: feed.stopTimesByTrip.get(trip.tripId) ?? [], dayStartMs: trip.dayStartMs };
      const live = update ? getStopDelay(update, trip.originStopId, trip.originSequence, schedule) : null;
      if (live) {
        train.delay = live.delay;
        train.status = live.status;
      }
      // Only a fresh position is shown; an old or undated one is not "live".
      const vehicle = findVehicle(realtime.vehicles, trip.tripId, trip.serviceDate);
      if (vehicle && isFreshPosition(vehicle, now.getTime())) {
        train.vehiclePosition = {
          latitude: vehicle.latitude,
          longitude: vehicle.longitude,
          bearing: vehicle.bearing,
          speed: vehicle.speed,
          currentStatus: vehicle.currentStatus,
          timestamp: vehicle.timestamp,
          notDeparted: isAtFirstStop(vehicle, schedule.stopTimes) || undefined,
        };
      }
    }
    return train;
  });

  // Expected departure = schedule + live delay; keep trains that have not left yet.
  const expectedDep = (t: Train) => new Date(t.departureTime).getTime() + Math.max(0, t.delay ?? 0) * 60000;
  const upcoming = withLive.filter((t) => expectedDep(t) >= now.getTime());
  const trains = upcoming.slice(0, MAX_TRAINS);


  // Every train reporting a position on the line, named by its GTFS-RT
  // trip_id -> trips.txt trip_short_name (never by position or order).
  const listed = new Set(trains.map((t) => t.tripId));
  const liveTrains: LiveTrain[] = [];
  for (const v of realtime.vehicles) {
    const trip = feed.tripsById.get(v.tripId);
    if (!trip || !isFreshPosition(v, now.getTime())) continue;
    liveTrains.push({
      trainNumber: trip.shortName,
      direction: trip.directionId === '0' ? 'Northbound' : 'Southbound',
      type: trainTypeFromRoute(trip.routeId, feed.routeNames),
      latitude: v.latitude,
      longitude: v.longitude,
      currentStatus: v.currentStatus,
      onRoute: listed.has(v.tripId),
    });
  }

  return NextResponse.json(
    {
      trains,
      liveTrains,
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
