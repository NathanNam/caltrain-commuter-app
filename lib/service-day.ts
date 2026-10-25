// Client-safe service-day helpers (no GTFS parsing here).
import { addDays, pacificParts, pacificToUtc } from './pacific-time';

export interface ServiceDate {
  year: number;
  month: number;
  day: number;
}

/** Caltrain's last trains run until about 1:30 AM; a new service day starts at 3 AM. */
export const SERVICE_DAY_ROLLOVER_HOUR = 3;

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The service day running at `now` (before 3 AM it is still yesterday's). */
export function currentServiceDate(now: Date): ServiceDate {
  const p = pacificParts(now);
  const d = p.hour < SERVICE_DAY_ROLLOVER_HOUR ? addDays(p.year, p.month, p.day, -1) : p;
  return { year: d.year, month: d.month, day: d.day };
}

/** End of the current service day: the next 3 AM Pacific after `now`. */
export function serviceDayEndMs(now: Date): number {
  const d = currentServiceDate(now);
  const next = addDays(d.year, d.month, d.day, 1);
  return pacificToUtc(next.year, next.month, next.day, SERVICE_DAY_ROLLOVER_HOUR).getTime();
}

export function parseIsoDate(s: string | null | undefined): ServiceDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const check = addDays(d.year, d.month, d.day, 0);
  return check.year === d.year && check.month === d.month && check.day === d.day ? d : null;
}

