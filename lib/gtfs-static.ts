// GTFS static timetable for Caltrain.
//
// Source: 511.org's Caltrain datafeed (https, needs TRANSIT_API_KEY), falling
// back to the files committed in data/gtfs. Parsed with csv-parse and indexed
// once per load (stop_times grouped by trip), then cached for 24 hours.

import { parse } from 'csv-parse/sync';
import { Station, Train, TrainType } from './types';
import { stations } from './stations';
import { addDays, pacificParts, pacificToUtc, yyyymmdd } from './pacific-time';

type Row = Record<string, string>;

export interface StopTime {
  stopId: string;
  sequence: number;
  arrivalSecs: number;
  departureSecs: number;
}

export interface GtfsTrip {
  tripId: string;
  routeId: string;
  serviceId: string;
  shortName: string;
}

export interface GtfsFeed {
  source: '511' | 'local';
  trips: GtfsTrip[];
  stopTimesByTrip: Map<string, StopTime[]>;
  routeNames: Map<string, string>; // route_id -> route_short_name / long name
  calendar: Row[];
  calendarDates: Row[];
  feedEndDate: string | null; // YYYYMMDD from feed_info.txt
  loadedAt: number;
}

const CACHE_MS = 24 * 60 * 60 * 1000;
let cache: GtfsFeed | null = null;
let loading: Promise<GtfsFeed | null> | null = null;

export function parseCsv(text: string): Row[] {
  if (!text.trim()) return [];
  return parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true }) as Row[];
}

/** "25:10:00" -> seconds after the service day's start (hours may exceed 24). */
export function gtfsTimeToSeconds(t: string): number {
  const [h, m, s] = t.split(':').map((x) => Number(x));
  return h * 3600 + m * 60 + (s || 0);
}

/** Classify a trip's service type from its route (route_id, or the route's name in routes.txt). */
export function trainTypeFromRoute(routeId: string, routeNames: Map<string, string> = new Map()): TrainType {
  const label = `${routeNames.get(routeId) ?? ''} ${routeId}`.toLowerCase();
  if (label.includes('south county')) return 'South County';
  if (label.includes('express') || label.includes('bullet')) return 'Express';
  if (label.includes('limited')) return 'Limited';
  return 'Local';
}

/** Build the indexed feed from the raw text of the GTFS files. */
export function buildFeed(files: Record<string, string | undefined>, source: GtfsFeed['source']): GtfsFeed {
  const trips: GtfsTrip[] = parseCsv(files['trips.txt'] ?? '').map((r) => ({
    tripId: r.trip_id,
    routeId: r.route_id,
    serviceId: r.service_id,
    shortName: r.trip_short_name || r.trip_id,
  }));

  const stopTimesByTrip = new Map<string, StopTime[]>();
  for (const r of parseCsv(files['stop_times.txt'] ?? '')) {
    if (!r.trip_id || !r.stop_id) continue;
    const arr = r.arrival_time || r.departure_time;
    const dep = r.departure_time || r.arrival_time;
    if (!arr || !dep) continue;
    let list = stopTimesByTrip.get(r.trip_id);
    if (!list) {
      list = [];
      stopTimesByTrip.set(r.trip_id, list);
    }
    list.push({
      stopId: r.stop_id,
      sequence: Number(r.stop_sequence),
      arrivalSecs: gtfsTimeToSeconds(arr),
      departureSecs: gtfsTimeToSeconds(dep),
    });
  }
  for (const list of stopTimesByTrip.values()) list.sort((a, b) => a.sequence - b.sequence);

  const routeNames = new Map<string, string>();
  for (const r of parseCsv(files['routes.txt'] ?? '')) {
    routeNames.set(r.route_id, `${r.route_short_name ?? ''} ${r.route_long_name ?? ''}`.trim());
  }

  const feedInfo = parseCsv(files['feed_info.txt'] ?? '')[0];

  return {
    source,
    trips,
    stopTimesByTrip,
    routeNames,
    calendar: parseCsv(files['calendar.txt'] ?? ''),
    calendarDates: parseCsv(files['calendar_dates.txt'] ?? ''),
    feedEndDate: feedInfo?.feed_end_date || null,
    loadedAt: Date.now(),
  };
}

const NEEDED = ['trips.txt', 'stop_times.txt', 'routes.txt', 'calendar.txt', 'calendar_dates.txt', 'feed_info.txt'];

async function loadRemote(apiKey: string): Promise<GtfsFeed> {
  const url = `https://api.511.org/transit/datafeeds?api_key=${encodeURIComponent(apiKey)}&operator_id=CT`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`511 datafeed HTTP ${response.status}`);
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
  const files: Record<string, string | undefined> = {};
  for (const name of NEEDED) files[name] = zip.getEntry(name)?.getData().toString('utf8');
  if (!files['trips.txt'] || !files['stop_times.txt']) throw new Error('511 datafeed is missing trips or stop_times');
  return buildFeed(files, '511');
}

async function loadLocal(): Promise<GtfsFeed> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const dir = path.join(process.cwd(), 'data', 'gtfs');
  const files: Record<string, string | undefined> = {};
  for (const name of NEEDED) {
    files[name] = await fs.readFile(path.join(dir, name), 'utf8').catch(() => undefined);
  }
  return buildFeed(files, 'local');
}

/** The timetable, cached for 24 h; 511 first when a key is set, else the committed files. */
export async function getFeed(): Promise<GtfsFeed | null> {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache;
  if (loading) return loading;
  loading = (async () => {
    const apiKey = process.env.TRANSIT_API_KEY;
    if (apiKey) {
      try {
        const feed = await loadRemote(apiKey);
        if (activeServiceIds(feed, new Date()).length > 0) {
          cache = feed;
          return feed;
        }
        console.warn('511 timetable has no service today; using data/gtfs');
      } catch (error) {
        console.error('511 timetable unavailable, using data/gtfs:', error instanceof Error ? error.message : error);
      }
    }
    try {
      cache = await loadLocal();
      return cache;
    } catch (error) {
      console.error('Local timetable could not be read:', error);
      return null;
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Service ids running on a service date (YYYYMMDD, weekday 0 = Sunday). */
export function servicesOn(feed: Pick<GtfsFeed, 'calendar' | 'calendarDates'>, dateStr: string, weekday: number): Set<string> {
  const active = new Set<string>();
  const n = Number(dateStr);
  for (const cal of feed.calendar) {
    if (n < Number(cal.start_date) || n > Number(cal.end_date)) continue;
    if (cal[DAY_NAMES[weekday]] === '1') active.add(cal.service_id);
  }
  for (const cd of feed.calendarDates) {
    if (cd.date !== dateStr) continue;
    if (cd.exception_type === '1') active.add(cd.service_id);
    if (cd.exception_type === '2') active.delete(cd.service_id);
  }
  return active;
}

function activeServiceIds(feed: GtfsFeed, now: Date): string[] {
  const p = pacificParts(now);
  return [...servicesOn(feed, yyyymmdd(p.year, p.month, p.day), p.weekday)];
}

/** True when feed_info says the timetable's validity has ended. */
export function isFeedExpired(feedEndDate: string | null, now: Date = new Date()): boolean {
  if (!feedEndDate) return false;
  const p = pacificParts(now);
  return Number(yyyymmdd(p.year, p.month, p.day)) > Number(feedEndDate);
}

export interface ScheduledTrain extends Train {
  tripId: string;
  serviceDate: string;
  /** GTFS stop_id and sequence of the boarding stop, for live predictions. */
  originStopId: string;
  originSequence: number;
}

/**
 * Trips between two stations from the given service days, as absolute times.
 * Includes yesterday's service day so trips running past midnight (GTFS times
 * of 24:00 and later) are found between midnight and the end of service.
 */
export function findTrips(
  feed: GtfsFeed,
  origin: Station,
  destination: Station,
  now: Date,
  windowStartMs: number
): ScheduledTrain[] {
  const originStops = new Set(origin.gtfsStopIds);
  const destStops = new Set(destination.gtfsStopIds);
  const southbound =
    stations.findIndex((s) => s.id === origin.id) < stations.findIndex((s) => s.id === destination.id);

  const today = pacificParts(now);
  const result: ScheduledTrain[] = [];

  for (const offset of [-1, 0, 1]) {
    const d = addDays(today.year, today.month, today.day, offset);
    const dateStr = yyyymmdd(d.year, d.month, d.day);
    const services = servicesOn(feed, dateStr, d.weekday);
    if (services.size === 0) continue;
    // GTFS times count from "noon minus 12 h" of the service day (midnight, except on DST days).
    const dayStartMs = pacificToUtc(d.year, d.month, d.day, 12).getTime() - 12 * 3600 * 1000;

    for (const trip of feed.trips) {
      if (!services.has(trip.serviceId)) continue;
      const stops = feed.stopTimesByTrip.get(trip.tripId);
      if (!stops) continue;
      const from = stops.find((st) => originStops.has(st.stopId));
      const to = stops.find((st) => destStops.has(st.stopId));
      if (!from || !to || from.sequence >= to.sequence) continue;

      const depMs = dayStartMs + from.departureSecs * 1000;
      const arrMs = dayStartMs + to.arrivalSecs * 1000;
      if (depMs < windowStartMs) continue;

      result.push({
        trainNumber: trip.shortName,
        tripId: trip.tripId,
        serviceDate: dateStr,
        originStopId: from.stopId,
        originSequence: from.sequence,
        direction: southbound ? 'Southbound' : 'Northbound',
        departureTime: new Date(depMs).toISOString(),
        arrivalTime: new Date(arrMs).toISOString(),
        duration: Math.round((arrMs - depMs) / 60000),
        type: trainTypeFromRoute(trip.routeId, feed.routeNames),
      });
    }
  }

  return result.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
}
