// Pacific-time helpers (America/Los_Angeles), DST-safe, no hard-coded offsets.

export const PACIFIC_TZ = 'America/Los_Angeles';

export interface PacificParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

/** Wall-clock parts of an instant in Pacific time. */
export function pacificParts(date: Date): PacificParts {
  const parts = partsFormatter.formatToParts(date);
  const val = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(val('year')),
    month: Number(val('month')),
    day: Number(val('day')),
    hour: Number(val('hour')) % 24,
    minute: Number(val('minute')),
    second: Number(val('second')),
    weekday: WEEKDAYS.indexOf(val('weekday')),
  };
}

/** Offset of Pacific time from UTC at an instant, in minutes (e.g. -420 for PDT). */
export function pacificOffsetMinutes(date: Date): number {
  const p = pacificParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The instant at a Pacific wall-clock time. Hours may exceed 23 (rolls into later days). */
export function pacificToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  // Two passes settle the offset around DST changes.
  let guess = naive - pacificOffsetMinutes(new Date(naive)) * 60000;
  guess = naive - pacificOffsetMinutes(new Date(guess)) * 60000;
  return new Date(guess);
}

/** "+HH:MM"/"-HH:MM" Pacific offset at an instant, for ISO strings. */
export function pacificOffsetString(date: Date): string {
  const off = pacificOffsetMinutes(date);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Calendar date shifted by n days (pure date arithmetic, no time zone). */
export function addDays(year: number, month: number, day: number, n: number) {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() };
}

/** YYYYMMDD for GTFS service dates. */
export function yyyymmdd(year: number, month: number, day: number): string {
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

/** YYYY-MM-DD. */
export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Start (inclusive) and end (exclusive) instants of a Pacific calendar day. */
export function pacificDayWindow(year: number, month: number, day: number): { start: Date; end: Date } {
  const next = addDays(year, month, day, 1);
  return { start: pacificToUtc(year, month, day), end: pacificToUtc(next.year, next.month, next.day) };
}

/** Today's Pacific calendar date as YYYY-MM-DD. */
export function pacificToday(now: Date = new Date()): string {
  const p = pacificParts(now);
  return isoDate(p.year, p.month, p.day);
}
