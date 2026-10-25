// Service-day helpers for the route timetable and the full system board.
import { GtfsFeed, ServiceDate, servicesOn, serviceDayStartMs, trainTypeFromRoute } from './gtfs-static';
import { isoDate, yyyymmdd } from './pacific-time';
import { WEEKDAY_NAMES } from './service-day';

export { currentServiceDate, parseIsoDate, serviceDayEndMs } from './service-day';
import { stations } from './stations';
import { TrainType } from './types';

export interface ServiceDayInfo {
  date: string; // YYYY-MM-DD
  weekdayName: string;
  /** "Weekday schedule", "Weekend schedule" or "No service". */
  label: string;
  /** e.g. "Holiday schedule" when calendar_dates changes this date. */
  exception: string | null;
  /** The date is past the published timetable. */
  beyondFeed: boolean;
}

/** Which schedule applies on a service date, from calendar.txt and calendar_dates.txt. */
export function describeServiceDay(feed: Pick<GtfsFeed, 'calendar' | 'calendarDates' | 'feedEndDate'>, date: ServiceDate): ServiceDayInfo {
  const dateStr = yyyymmdd(date.year, date.month, date.day);
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  const active = servicesOn(feed, dateStr, weekday);
  const calById = new Map(feed.calendar.map((c) => [c.service_id, c]));
  const lastCalendarDay = Math.max(0, ...feed.calendar.map((c) => Number(c.end_date) || 0));
  const beyondFeed =
    (feed.feedEndDate ? Number(dateStr) > Number(feed.feedEndDate) : false) ||
    (lastCalendarDay > 0 && Number(dateStr) > lastCalendarDay);

  const exceptions = feed.calendarDates.filter((cd) => cd.date === dateStr);
  const removed = exceptions.some((cd) => cd.exception_type === '2');
  const added = exceptions.some((cd) => cd.exception_type === '1');

  let weekend = false;
  let regular = false;
  for (const id of active) {
    const cal = calById.get(id);
    if (!cal) continue;
    regular = true;
    if (cal.saturday === '1' || cal.sunday === '1') weekend = true;
  }
  const label =
    active.size === 0 ? 'No service' : regular ? (weekend ? 'Weekend schedule' : 'Weekday schedule') : 'Special schedule';
  const exception = removed ? 'Holiday schedule' : added ? 'Extra service added' : null;

  return {
    date: isoDate(date.year, date.month, date.day),
    weekdayName: WEEKDAY_NAMES[weekday],
    label,
    exception,
    beyondFeed,
  };
}

// ---------- full system board ----------

/** A stop cell: seconds after the service day start, "pass" (runs through without stopping), or null (not on this run). */
export type BoardCell = number | 'pass' | null;

export interface BoardTrain {
  number: string;
  type: TrainType;
  /** One cell per station in `stations` order (north to south). */
  cells: BoardCell[];
  /** Seconds of the train's first stop, for ordering and "now". */
  firstSecs: number;
}

export interface SystemBoard {
  info: ServiceDayInfo;
  dayStartMs: number;
  stationIds: string[];
  southbound: BoardTrain[];
  northbound: BoardTrain[];
}

/** Every train on a service date, with its time at each station, per direction. */
export function buildSystemBoard(feed: GtfsFeed, date: ServiceDate): SystemBoard {
  const stopToStation = new Map<string, number>();
  stations.forEach((s, i) => s.gtfsStopIds.forEach((id) => stopToStation.set(id, i)));

  const dateStr = yyyymmdd(date.year, date.month, date.day);
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  const services = servicesOn(feed, dateStr, weekday);
  const southbound: BoardTrain[] = [];
  const northbound: BoardTrain[] = [];

  for (const trip of feed.trips) {
    if (!services.has(trip.serviceId)) continue;
    const stops = feed.stopTimesByTrip.get(trip.tripId);
    if (!stops?.length) continue;
    const cells: BoardCell[] = stations.map(() => null);
    let lo = Infinity;
    let hi = -Infinity;
    for (const st of stops) {
      const idx = stopToStation.get(st.stopId);
      if (idx == null) continue;
      cells[idx] = st.departureSecs;
      lo = Math.min(lo, idx);
      hi = Math.max(hi, idx);
    }
    if (lo === Infinity) continue;
    for (let i = lo + 1; i < hi; i++) if (cells[i] == null) cells[i] = 'pass';
    const train: BoardTrain = {
      number: trip.shortName,
      type: trainTypeFromRoute(trip.routeId, feed.routeNames),
      cells,
      firstSecs: stops[0].departureSecs,
    };
    (trip.directionId === '0' ? northbound : southbound).push(train);
  }
  southbound.sort((a, b) => a.firstSecs - b.firstSecs);
  northbound.sort((a, b) => a.firstSecs - b.firstSecs);

  return {
    info: describeServiceDay(feed, date),
    dayStartMs: serviceDayStartMs(date),
    stationIds: stations.map((s) => s.id),
    southbound,
    northbound,
  };
}
