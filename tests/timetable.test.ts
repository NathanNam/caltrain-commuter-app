import { describe, expect, it } from 'vitest';
import { pacificToUtc } from '@/lib/pacific-time';
import { currentServiceDate, describeServiceDay, restOfServiceDay, serviceDayEndMs } from '@/lib/timetable';
import { localFeed } from './helpers';

const t = (num: string, y: number, m: number, d: number, h: number, mi: number) => ({
  trainNumber: num,
  departureTime: pacificToUtc(y, m, d, h, mi).toISOString(),
});

// Friday 23 Oct 2026 service: an evening train, two after midnight, then Saturday's first trains.
const trips = [
  t('190', 2026, 10, 23, 21, 0),
  t('196', 2026, 10, 23, 23, 30),
  t('198', 2026, 10, 24, 0, 30), // GTFS 24:30 on Friday's service
  t('199', 2026, 10, 24, 1, 15), // GTFS 25:15
  t('421', 2026, 10, 24, 7, 0), // Saturday
  t('423', 2026, 10, 24, 8, 0),
  t('425', 2026, 10, 24, 9, 0),
  t('427', 2026, 10, 24, 10, 0),
];

describe('remaining trips today', () => {
  it('lists everything left until the end of service, including after-midnight trips', () => {
    const now = pacificToUtc(2026, 10, 23, 22, 0);
    const { remaining, nextDay } = restOfServiceDay(trips, now);
    expect(remaining.map((x) => x.trainNumber)).toEqual(['196', '198', '199']);
    expect(nextDay.map((x) => x.trainNumber)).toEqual(['421', '423', '425']);
  });

  it('after midnight it is still the previous service day', () => {
    const now = pacificToUtc(2026, 10, 24, 0, 40);
    expect(currentServiceDate(now)).toEqual({ year: 2026, month: 10, day: 23 });
    expect(restOfServiceDay(trips, now).remaining.map((x) => x.trainNumber)).toEqual(['199']);
  });

  it('after the last train: nothing remaining, the next day’s first three', () => {
    const now = pacificToUtc(2026, 10, 24, 1, 30);
    const { remaining, nextDay } = restOfServiceDay(trips, now);
    expect(remaining).toHaveLength(0);
    expect(nextDay.map((x) => x.trainNumber)).toEqual(['421', '423', '425']);
    expect(serviceDayEndMs(now)).toBe(pacificToUtc(2026, 10, 24, 3, 0).getTime());
  });

  it('keeps a late train that is still to come (expected time after now)', () => {
    const now = pacificToUtc(2026, 10, 23, 23, 35);
    const late = (x: { trainNumber: string; departureTime: string }) =>
      new Date(x.departureTime).getTime() + (x.trainNumber === '196' ? 10 * 60000 : 0);
    expect(restOfServiceDay(trips, now, late).remaining[0].trainNumber).toBe('196');
  });
});

describe('which schedule runs on a date', () => {
  const feed = localFeed();

  it('weekday', () => {
    const info = describeServiceDay(feed, { year: 2026, month: 10, day: 28 });
    expect(info.label).toBe('Weekday schedule');
    expect(info.exception).toBeNull();
    expect(info.weekdayName).toBe('Wednesday');
  });

  it('weekend', () => {
    expect(describeServiceDay(feed, { year: 2026, month: 10, day: 31 }).label).toBe('Weekend schedule');
  });

  it('a calendar_dates exception (Thanksgiving runs the weekend service)', () => {
    const info = describeServiceDay(feed, { year: 2026, month: 11, day: 26 });
    expect(info.label).toBe('Weekend schedule');
    expect(info.exception).toBe('Holiday schedule');
  });

  it('beyond the published timetable', () => {
    expect(describeServiceDay(feed, { year: 2027, month: 3, day: 1 }).beyondFeed).toBe(true);
    expect(describeServiceDay(feed, { year: 2026, month: 12, day: 1 }).beyondFeed).toBe(false);
  });
});
