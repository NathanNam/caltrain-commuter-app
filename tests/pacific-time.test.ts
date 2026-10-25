import { describe, expect, it } from 'vitest';
import { pacificDayWindow, pacificOffsetString, pacificParts, pacificToUtc } from '@/lib/pacific-time';
import { ticketmasterWindow } from '@/lib/event-window';

describe('Pacific time', () => {
  it('uses the real offset on both sides of DST', () => {
    expect(pacificToUtc(2026, 7, 1, 12).toISOString()).toBe('2026-07-01T19:00:00.000Z'); // PDT
    expect(pacificToUtc(2026, 12, 1, 12).toISOString()).toBe('2026-12-01T20:00:00.000Z'); // PST
    expect(pacificOffsetString(new Date('2026-07-01T19:00:00Z'))).toBe('-07:00');
    expect(pacificOffsetString(new Date('2026-12-01T20:00:00Z'))).toBe('-08:00');
  });

  it('gives a 23-hour day when clocks spring forward', () => {
    const { start, end } = pacificDayWindow(2026, 3, 8);
    expect((end.getTime() - start.getTime()) / 3600000).toBe(23);
  });

  it('reads Pacific wall-clock parts', () => {
    const p = pacificParts(new Date('2026-10-25T06:30:00Z'));
    expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2026, 10, 24, 23, 30]);
    expect(p.weekday).toBe(6); // Saturday
  });
});

describe('event day windows', () => {
  it('asks Ticketmaster for the Pacific day, not the UTC day', () => {
    expect(ticketmasterWindow('2026-10-24')).toEqual({
      start: '2026-10-24T07:00:00Z',
      end: '2026-10-25T06:59:59Z',
    });
    expect(ticketmasterWindow('2026-12-05')).toEqual({
      start: '2026-12-05T08:00:00Z',
      end: '2026-12-06T07:59:59Z',
    });
  });
});
