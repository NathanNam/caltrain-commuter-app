import { describe, expect, it } from 'vitest';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import {
  StopRelationship,
  TripRelationship,
  TripUpdate,
  findTripUpdate,
  findVehicle,
  getStopDelay,
  isAtFirstStop,
  isFreshPosition,
  parseTripUpdates,
  parseVehicles,
} from '@/lib/gtfs-realtime';
import { serviceDayStartMs, tripsOnServiceDay } from '@/lib/gtfs-static';
import { getStationById } from '@/lib/stations';
import { statusOf } from '@/lib/board';
import { localFeed } from './helpers';

const base: TripUpdate = {
  tripId: '660',
  routeId: 'Local Weekday',
  startDate: '20261024',
  scheduleRelationship: TripRelationship.SCHEDULED,
  stopTimeUpdates: [
    { stopId: '70012', stopSequence: 1, departureDelay: 120, scheduleRelationship: StopRelationship.SCHEDULED },
    { stopId: '70092', stopSequence: 8, departureDelay: 360, scheduleRelationship: StopRelationship.SCHEDULED },
    { stopId: '70172', stopSequence: 15, arrivalDelay: 300, scheduleRelationship: StopRelationship.SCHEDULED },
  ],
};

describe('GTFS-RT schedule relationships (enum values)', () => {
  it('treats a trip-level CANCELED as cancelled', () => {
    const u = { ...base, scheduleRelationship: TripRelationship.CANCELED };
    expect(getStopDelay(u, '70012', 1)).toEqual({ delay: 0, status: 'cancelled' });
  });

  it('treats a SKIPPED origin stop as cancelled for this rider', () => {
    const u: TripUpdate = {
      ...base,
      stopTimeUpdates: [{ stopId: '70092', stopSequence: 8, scheduleRelationship: StopRelationship.SKIPPED }],
    };
    expect(getStopDelay(u, '70092', 8)?.status).toBe('cancelled');
  });

  it('ignores NO_DATA and returns null without a prediction', () => {
    const u: TripUpdate = {
      ...base,
      stopTimeUpdates: [{ stopId: '70092', stopSequence: 8, scheduleRelationship: StopRelationship.NO_DATA }],
    };
    expect(getStopDelay(u, '70092', 8)).toBeNull();
  });
});

describe('delay at the origin stop', () => {
  it("uses the origin stop's own delay, not the trip's maximum", () => {
    expect(getStopDelay(base, '70012', 1)).toEqual({ delay: 2, status: 'delayed' });
    expect(getStopDelay(base, '70092', 8)).toEqual({ delay: 6, status: 'delayed' });
  });

  it('propagates the nearest earlier stop delay when the origin has no update', () => {
    // Hillsdale (seq 10) is not listed; San Mateo (seq 8) is the nearest earlier update
    expect(getStopDelay(base, '70112', 10)).toEqual({ delay: 6, status: 'delayed' });
  });

  it('reports on time below one minute', () => {
    const u: TripUpdate = {
      ...base,
      stopTimeUpdates: [{ stopId: '70012', stopSequence: 1, departureDelay: 20, scheduleRelationship: 0 }],
    };
    expect(getStopDelay(u, '70012', 1)).toEqual({ delay: 0, status: 'on-time' });
  });
});

describe('matching by trip_id and service date', () => {
  it("checks the trip's startDate", () => {
    expect(findTripUpdate([base], '660', '20261024')).toBe(base);
    expect(findTripUpdate([base], '660', '20261023')).toBeNull();
    expect(findTripUpdate([{ ...base, startDate: '' }], '660', '20261023')).not.toBeNull();
  });

  it('matches vehicles by trip_id only, never by position', () => {
    const v = (tripId: string) => ({ vehicleId: tripId, tripId, startDate: '', latitude: 37.7759, longitude: -122.3957, timestamp: 0 });
    const vehicles = [v('662'), v('660')];
    expect(findVehicle(vehicles, '660', '20261024')?.vehicleId).toBe('660');
    expect(findVehicle(vehicles, '664', '20261024')).toBeNull();
  });
});

describe("511's Caltrain feed: predicted times, no delay field", () => {
  const rt = GtfsRealtimeBindings.transit_realtime;
  const feed = localFeed();
  const oct28 = { year: 2026, month: 10, day: 28 }; // Wednesday
  const schedule421 = { stopTimes: feed.stopTimesByTrip.get('421')!, dayStartMs: serviceDayStartMs(oct28) };
  const pt = (h: number, m: number, s = 0) => schedule421.dayStartMs / 1000 + h * 3600 + m * 60 + s;

  /** Encode then decode, like a real 511 response: stop_id + absolute times only. */
  const wire = (tripId: string, stops: Array<[stopId: string, arrival: number, departure: number]>) =>
    parseTripUpdates(
      rt.FeedMessage.decode(
        rt.FeedMessage.encode(
          rt.FeedMessage.create({
            header: { gtfsRealtimeVersion: '2.0' },
            entity: [
              {
                id: tripId,
                tripUpdate: {
                  trip: { tripId, routeId: 'Limited' },
                  stopTimeUpdate: stops.map(([stopId, arrival, departure]) => ({
                    stopId,
                    arrival: { time: arrival },
                    departure: { time: departure },
                  })),
                },
              },
            ],
          })
        ).finish()
      )
    )[0];

  it('reads absent delay and stop_sequence as missing, not as protobuf defaults of 0', () => {
    const u = wire('421', [['70091', pt(17, 52), pt(17, 53)]]);
    expect(u.stopTimeUpdates[0]).toMatchObject({ stopId: '70091', arrivalTime: pt(17, 52), departureTime: pt(17, 53) });
    expect(u.stopTimeUpdates[0].departureDelay).toBeUndefined();
    expect(u.stopTimeUpdates[0].arrivalDelay).toBeUndefined();
    expect(u.stopTimeUpdates[0].stopSequence).toBeUndefined();
  });

  it('Oct 28: train 421 predicted 25 min late at San Mateo is not "On time"', () => {
    const train = tripsOnServiceDay(feed, getStationById('sm')!, getStationById('22nd')!, oct28).find(
      (t) => t.trainNumber === '421'
    )!;
    expect(train.originStopId).toBe('70091'); // San Mateo, scheduled 17:28
    expect(train.dayStartMs).toBe(schedule421.dayStartMs);

    const u = wire('421', [
      ['70111', pt(17, 49), pt(17, 50)], // Hillsdale, scheduled 17:25
      ['70091', pt(17, 52), pt(17, 53)], // San Mateo, scheduled 17:28
    ]);
    const live = getStopDelay(u, train.originStopId, train.originSequence, schedule421);
    expect(live).toEqual({ delay: 25, status: 'delayed' });
    expect(statusOf({ ...train, ...live! }).text).toBe('25 min late');
    // Without the schedule a time-only prediction is unknown, never 0 / "On time".
    expect(getStopDelay(u, train.originStopId, train.originSequence)).toBeNull();
  });

  it('propagates a time-only delay from an earlier stop, ordering stops by the schedule', () => {
    const u = wire('421', [
      ['70141', pt(17, 40), pt(17, 41)], // Redwood City (seq 10), scheduled 17:18 -> 23 late
      ['70111', pt(17, 49), pt(17, 50)], // Hillsdale (seq 11), scheduled 17:25 -> 25 late
    ]);
    expect(getStopDelay(u, '70091', 12, schedule421)).toEqual({ delay: 25, status: 'delayed' });
  });

  it('uses the captured 511 update for 421 at 17:31 PT on Oct 28 (San Mateo departure 17:45:39)', () => {
    const u = wire('421', [
      ['70141', 1793234097, 1793234157],
      ['70111', 1793234469, 1793234529],
      ['70091', 1793234679, 1793234739],
      ['70061', 1793234979, 1793235039],
    ]);
    expect(getStopDelay(u, '70091', 12, schedule421)).toEqual({ delay: 18, status: 'delayed' });
  });

  it('still reports on time when the predicted time matches the schedule', () => {
    const u = wire('421', [['70091', pt(17, 27, 40), pt(17, 28, 20)]]);
    expect(getStopDelay(u, '70091', 12, schedule421)).toEqual({ delay: 0, status: 'on-time' });
  });
});

describe('live positions: only fresh ones, and never lateness from the first stop', () => {
  const rt = GtfsRealtimeBindings.transit_realtime;
  const feed = localFeed();
  const now = 1793233900 * 1000; // Oct 28, 17:31:40 PT
  // Captured from 511 at 17:31 PT: 421 reported at San Jose Diridon, Sunnyvale at 17:39.
  const at = (tripId: string, latitude: number, longitude: number, timestamp = 1793233891) => ({
    vehicleId: tripId,
    tripId,
    startDate: '',
    latitude,
    longitude,
    timestamp,
  });

  it('reads an absent timestamp as 0 (unknown) and an absent status as undefined, not as protobuf defaults', () => {
    const msg = rt.FeedMessage.decode(
      rt.FeedMessage.encode(
        rt.FeedMessage.create({
          header: { gtfsRealtimeVersion: '2.0' },
          entity: [{ id: '421', vehicle: { trip: { tripId: '421' }, position: { latitude: 37.3299, longitude: -121.9032 } } }],
        })
      ).finish()
    );
    const [v] = parseVehicles(msg);
    expect(v.timestamp).toBe(0);
    expect(v.currentStatus).toBeUndefined();
    expect(isFreshPosition(v, now)).toBe(false);
  });

  it('ignores positions older than five minutes', () => {
    expect(isFreshPosition(at('421', 37.3299, -121.9032), now)).toBe(true);
    expect(isFreshPosition(at('421', 37.3299, -121.9032, 1793233900 - 20 * 60), now)).toBe(false);
  });

  it('a train at its first stop is "not yet departed", wherever else it is reported', () => {
    expect(isAtFirstStop(at('421', 37.3299, -121.9032), feed.stopTimesByTrip.get('421')!)).toBe(true); // SJ Diridon, 421's first stop
    expect(isAtFirstStop(at('421', 37.379, -122.0317), feed.stopTimesByTrip.get('421')!)).toBe(false); // Sunnyvale
    expect(isAtFirstStop(at('149', 37.3332, -121.9035), feed.stopTimesByTrip.get('149')!)).toBe(false); // 149 starts at Tamien
  });
});
