import { describe, expect, it } from 'vitest';
import { expectedDepartureMs, minutesUntilTrain } from '@/lib/board';
import { Train } from '@/lib/types';

const base: Train = {
  trainNumber: '421',
  direction: 'Northbound',
  departureTime: '2026-10-29T00:28:00.000Z',
  arrivalTime: '2026-10-29T00:47:00.000Z',
  duration: 19,
  type: 'Limited',
};
const now = Date.parse('2026-10-29T00:24:00Z');

describe('expected departure', () => {
  it('adds a known delay to the scheduled time', () => {
    expect(expectedDepartureMs({ ...base, delay: 25, status: 'delayed' })).toBe(Date.parse('2026-10-29T00:53:00Z'));
  });
  it('ignores early running and unknown delays', () => {
    expect(expectedDepartureMs({ ...base, delay: -3, status: 'on-time' })).toBe(Date.parse(base.departureTime));
    expect(expectedDepartureMs(base)).toBe(Date.parse(base.departureTime));
  });
  it('keeps a cancelled train at its scheduled time', () => {
    expect(expectedDepartureMs({ ...base, delay: 25, status: 'cancelled' })).toBe(Date.parse(base.departureTime));
  });
  it('counts minutes to the expected departure, never negative', () => {
    expect(minutesUntilTrain({ ...base, delay: 25, status: 'delayed' }, now)).toBe(29);
    expect(minutesUntilTrain(base, now)).toBe(4);
    expect(minutesUntilTrain(base, Date.parse('2026-10-29T01:00:00Z'))).toBe(0);
  });
  it('a late train still counts after its scheduled time has passed', () => {
    // 17:35, 7 min after the scheduled 17:28, a train 25 min late is 18 min away.
    expect(minutesUntilTrain({ ...base, delay: 25, status: 'delayed' }, Date.parse('2026-10-29T00:35:00Z'))).toBe(18);
  });
});
