import { describe, expect, it } from 'vitest';
import {
  StopRelationship,
  TripRelationship,
  TripUpdate,
  findTripUpdate,
  findVehicle,
  getStopDelay,
} from '@/lib/gtfs-realtime';

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
