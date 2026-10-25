import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stations } from '@/lib/stations';
import { parseCsv } from '@/lib/gtfs-static';

const stops = parseCsv(readFileSync(join(__dirname, '..', 'data', 'gtfs', 'stops.txt'), 'utf8'));
const stopIds = new Set(stops.map((s) => s.stop_id));

describe('station -> GTFS stop mapping', () => {
  it('maps every station to two platform stop_ids that exist in stops.txt', () => {
    for (const s of stations) {
      expect(s.gtfsStopIds, s.id).toHaveLength(2);
      for (const id of s.gtfsStopIds) expect(stopIds.has(id), `${s.id} ${id}`).toBe(true);
    }
  });

  it('includes the stations that used to fall through the old code mapping', () => {
    const byId = Object.fromEntries(stations.map((s) => [s.id, s]));
    expect(byId['san-antonio'].gtfsStopIds).toEqual(['70201', '70202']);
    expect(byId['blossom-hill'].gtfsStopIds).toEqual(['70291', '70292']);
    expect(byId['morgan-hill'].gtfsStopIds).toEqual(['70301', '70302']);
    expect(byId['san-martin'].gtfsStopIds).toEqual(['70311', '70312']);
    expect(byId['broadway'].gtfsStopIds).toEqual(['70071', '70072']);
  });

  it('keeps stations in line order, north to south', () => {
    const lat = stations.map((s) => s.coordinates.lat);
    // Latitude falls (almost) monotonically down the Peninsula until San Jose
    expect(lat[0]).toBeGreaterThan(lat[lat.length - 1]);
    expect(stations[0].id).toBe('sf');
    expect(stations[stations.length - 1].id).toBe('gilroy');
  });
});
