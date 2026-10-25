import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFeed } from '@/lib/gtfs-static';

/** The committed timetable in data/gtfs, parsed like the app does. */
export function localFeed() {
  const dir = join(__dirname, '..', 'data', 'gtfs');
  const files: Record<string, string | undefined> = {};
  for (const name of ['trips.txt', 'stop_times.txt', 'routes.txt', 'calendar.txt', 'calendar_dates.txt', 'feed_info.txt']) {
    files[name] = readFileSync(join(dir, name), 'utf8');
  }
  return buildFeed(files, 'local');
}
