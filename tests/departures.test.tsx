import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextTrainHero } from '@/components/Departures';
import { getStationById } from '@/lib/stations';
import { Train } from '@/lib/types';

// Oct 28: 421 leaves San Mateo at 17:28 PT (00:28 UTC on the 29th).
const train421: Train = {
  trainNumber: '421',
  direction: 'Northbound',
  departureTime: '2026-10-29T00:28:00.000Z',
  arrivalTime: '2026-10-29T00:47:00.000Z',
  duration: 19,
  type: 'Limited',
  serviceDate: '20261028',
  delay: 25,
  status: 'delayed',
};
const hero = (train: Train) =>
  renderToStaticMarkup(
    <NextTrainHero train={train} origin={getStationById('sm')!} destination={getStationById('22nd')!} now={Date.parse('2026-10-29T00:24:00Z')} liveFeed />
  );

describe('next train card, Oct 28 17:24 PT', () => {
  it('shows the live delay, not "On time"', () => {
    const html = hero(train421);
    expect(html).toContain('25 min late');
    expect(html).not.toContain('On time');
  });

  it('says a train at its first stop has not departed yet', () => {
    const html = hero({
      ...train421,
      vehiclePosition: { latitude: 37.3299, longitude: -121.9032, timestamp: 1793233440, notDeparted: true },
    });
    expect(html).toContain('Train 421 is at San Jose Diridon, not yet departed (live position)');
  });
});

describe('countdown counts to the expected departure', () => {
  it('a train 25 min late at 17:24 shows 29 minutes, not 4', () => {
    // Scheduled 17:28 + 25 min late = 17:53; from 17:24 that is 29 minutes.
    const html = hero(train421);
    expect(html).toContain('departs in 29 minutes');
    expect(html).not.toContain('departs in 4 minutes');
  });

  it('an on-time train counts to its scheduled time', () => {
    const html = hero({ ...train421, delay: 0, status: 'on-time' });
    expect(html).toContain('departs in 4 minutes');
  });
});
