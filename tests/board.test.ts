import { describe, expect, it } from 'vitest';
import { buildSystemBoard } from '@/lib/timetable';
import { stations } from '@/lib/stations';
import { localFeed } from './helpers';

const feed = localFeed();
const at = (id: string) => stations.findIndex((s) => s.id === id);

describe('full system board', () => {
  const weekday = buildSystemBoard(feed, { year: 2026, month: 10, day: 28 }); // Wednesday

  it('has every weekday train, split by direction', () => {
    const weekdayTrips = feed.trips.filter((t) => t.serviceId === '72982');
    expect(weekday.northbound.length + weekday.southbound.length).toBe(weekdayTrips.length);
    expect(weekday.northbound.length).toBe(weekdayTrips.filter((t) => t.directionId === '0').length);
    expect(weekday.info.label).toBe('Weekday schedule');
  });

  it('shows a Limited train’s stop pattern: times, pass markers and blanks', () => {
    const t401 = weekday.northbound.find((t) => t.number === '401')!;
    expect(t401.type).toBe('Limited');
    expect(t401.cells[at('diridon')]).toBe(5 * 3600 + 43 * 60);
    expect(t401.cells[at('sf')]).toBe(6 * 3600 + 53 * 60);
    expect(t401.cells[at('college-park')]).toBe('pass'); // runs through without stopping
    expect(t401.cells[at('bayshore')]).toBe('pass');
    expect(t401.cells[at('gilroy')]).toBeNull(); // not on this run
  });

  it('orders trains by their first departure', () => {
    const firsts = weekday.southbound.map((t) => t.firstSecs);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
  });

  it('uses the weekend service on Saturdays (Broadway is served)', () => {
    const sat = buildSystemBoard(feed, { year: 2026, month: 10, day: 31 });
    expect(sat.info.label).toBe('Weekend schedule');
    const servesBroadway = [...sat.southbound, ...sat.northbound].some((t) => typeof t.cells[at('broadway')] === 'number');
    expect(servesBroadway).toBe(true);
    const weekdayBroadway = [...weekday.southbound, ...weekday.northbound].some((t) => typeof t.cells[at('broadway')] === 'number');
    expect(weekdayBroadway).toBe(false);
  });
});
