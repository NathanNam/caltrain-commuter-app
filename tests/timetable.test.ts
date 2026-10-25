import { describe, expect, it } from 'vitest';
import { pacificToUtc } from '@/lib/pacific-time';
import { currentServiceDate, describeServiceDay, serviceDayEndMs } from '@/lib/timetable';
import { localFeed } from './helpers';

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

describe('current service day', () => {
  it('after midnight it is still the previous service day, until 3 AM', () => {
    expect(currentServiceDate(pacificToUtc(2026, 10, 24, 0, 40))).toEqual({ year: 2026, month: 10, day: 23 });
    expect(currentServiceDate(pacificToUtc(2026, 10, 24, 3, 5))).toEqual({ year: 2026, month: 10, day: 24 });
    expect(serviceDayEndMs(pacificToUtc(2026, 10, 24, 1, 30))).toBe(pacificToUtc(2026, 10, 24, 3, 0).getTime());
  });
});
