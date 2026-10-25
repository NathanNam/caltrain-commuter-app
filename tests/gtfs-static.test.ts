import { describe, expect, it } from 'vitest';
import { buildFeed, findTrips, gtfsTimeToSeconds, isFeedExpired, trainTypeFromRoute } from '@/lib/gtfs-static';
import { getStationById } from '@/lib/stations';
import { pacificToUtc } from '@/lib/pacific-time';

const routes = new Map([
  ['77119', 'Local Weekday'],
  ['77121', 'Limited'],
  ['77122', 'Express'],
  ['77123', 'South County South Santa Clara County Connector'],
]);

describe('route_id -> train type', () => {
  it('uses the route name from routes.txt', () => {
    expect(trainTypeFromRoute('77119', routes)).toBe('Local');
    expect(trainTypeFromRoute('77121', routes)).toBe('Limited');
    expect(trainTypeFromRoute('77122', routes)).toBe('Express');
    expect(trainTypeFromRoute('77123', routes)).toBe('South County');
  });

  it('accepts feeds whose trips.txt carries the route name as route_id', () => {
    expect(trainTypeFromRoute('Local Weekend')).toBe('Local');
    expect(trainTypeFromRoute('Express')).toBe('Express');
    expect(trainTypeFromRoute('South County')).toBe('South County');
  });
});

describe('GTFS times', () => {
  it('parses times past 24:00', () => {
    expect(gtfsTimeToSeconds('5:43:00')).toBe(5 * 3600 + 43 * 60);
    expect(gtfsTimeToSeconds('25:10:00')).toBe(25 * 3600 + 10 * 60);
  });

  it('flags a timetable whose feed_end_date has passed', () => {
    expect(isFeedExpired('20260831', new Date('2026-10-24T12:00:00Z'))).toBe(true);
    expect(isFeedExpired('20261231', new Date('2026-10-24T12:00:00Z'))).toBe(false);
    expect(isFeedExpired(null)).toBe(false);
  });
});

// A tiny feed: one late southbound train SF -> Palo Alto on Friday 2026-10-23's
// service, leaving at 24:30 (00:30 Saturday) and arriving 25:20.
const feed = buildFeed(
  {
    'trips.txt': 'route_id,service_id,trip_id,trip_short_name,direction_id\nLocal Weekday,WK,199,199,1\nLocal Weekend,WE,421,421,1\n',
    'stop_times.txt':
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' +
      '199,24:30:00,24:30:00,70012,1\n199,25:20:00,25:20:00,70172,15\n' +
      '421,08:00:00,08:00:00,70012,1\n421,08:50:00,08:50:00,70172,15\n',
    'calendar.txt':
      'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n' +
      'WK,1,1,1,1,1,0,0,20260101,20271231\nWE,0,0,0,0,0,1,1,20260101,20271231\n',
    'calendar_dates.txt': 'service_id,date,exception_type\n',
  },
  'local'
);
const sf = getStationById('sf')!;
const pa = getStationById('pa')!;

describe('after-midnight trips', () => {
  it("finds the previous service day's trip between midnight and the end of service", () => {
    const now = pacificToUtc(2026, 10, 24, 0, 10); // Saturday 00:10 PDT
    const trips = findTrips(feed, sf, pa, now, now.getTime());
    const late = trips.find((t) => t.trainNumber === '199');
    expect(late).toBeDefined();
    expect(late!.serviceDate).toBe('20261023');
    expect(late!.departureTime).toBe(pacificToUtc(2026, 10, 24, 0, 30).toISOString());
    expect(late!.duration).toBe(50);
    expect(late!.type).toBe('Local');
  });

  it('does not offer a trip in the wrong direction', () => {
    const now = pacificToUtc(2026, 10, 24, 0, 10);
    expect(findTrips(feed, pa, sf, now, now.getTime())).toHaveLength(0);
  });
});
