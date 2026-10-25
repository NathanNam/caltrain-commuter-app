import { NextRequest, NextResponse } from 'next/server';
import { getFeed } from '@/lib/gtfs-static';
import { buildSystemBoard, parseIsoDate, SystemBoard } from '@/lib/timetable';

// Static timetable only; one cached board per date.
const cache = new Map<string, { at: number; body: SystemBoard }>();
const CACHE_MS = 60 * 60 * 1000;

/** The whole line's timetable for one service date: /api/board?date=YYYY-MM-DD (Pacific). */
export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get('date');
  const date = parseIsoDate(dateParam);
  if (!date) return NextResponse.json({ error: 'date=YYYY-MM-DD is required' }, { status: 400 });

  const hit = cache.get(dateParam!);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json(hit.body, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  }
  const feed = await getFeed();
  if (!feed) return NextResponse.json({ error: 'The timetable could not be loaded' }, { status: 503 });

  const body = buildSystemBoard(feed, date);
  if (cache.size > 60) cache.clear();
  cache.set(dateParam!, { at: Date.now(), body });
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
}
