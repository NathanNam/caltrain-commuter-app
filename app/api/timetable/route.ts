import { NextRequest, NextResponse } from 'next/server';
import { Train } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { getFeed, tripsOnServiceDay } from '@/lib/gtfs-static';
import { describeServiceDay, parseIsoDate, ServiceDayInfo } from '@/lib/timetable';

interface TimetableResponse {
  info: ServiceDayInfo;
  trains: Train[];
}

// Static timetable only (no realtime, no 511 realtime calls); cached per route and date.
const cache = new Map<string, { at: number; body: TimetableResponse }>();
const CACHE_MS = 60 * 60 * 1000;

/** A route's full timetable for one service date: /api/timetable?origin=&destination=&date=YYYY-MM-DD (Pacific). */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const origin = getStationById(q.get('origin') ?? '');
  const destination = getStationById(q.get('destination') ?? '');
  const date = parseIsoDate(q.get('date'));
  if (!origin || !destination || origin.id === destination.id || !date) {
    return NextResponse.json({ error: 'origin, destination and date=YYYY-MM-DD are required' }, { status: 400 });
  }

  const key = `${q.get('date')}|${origin.id}|${destination.id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json(hit.body, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  }

  const feed = await getFeed();
  if (!feed) return NextResponse.json({ error: 'The timetable could not be loaded' }, { status: 503 });

  const trains: Train[] = tripsOnServiceDay(feed, origin, destination, date).map((t) => ({
    trainNumber: t.trainNumber,
    tripId: t.tripId,
    serviceDate: t.serviceDate,
    direction: t.direction,
    departureTime: t.departureTime,
    arrivalTime: t.arrivalTime,
    duration: t.duration,
    type: t.type,
  }));
  const body: TimetableResponse = { info: describeServiceDay(feed, date), trains };
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
}
