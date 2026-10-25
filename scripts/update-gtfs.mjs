// Refreshes the committed Caltrain timetable in data/gtfs from 511.org.
//
//   node --env-file=.env scripts/update-gtfs.mjs
//
// Needs TRANSIT_API_KEY (free from https://511.org/open-data/token). The app
// already prefers the live 511 timetable when the key is set; data/gtfs is the
// fallback for running without a key, so refresh it whenever feed_info.txt's
// feed_end_date has passed (the board then shows a "Not live" note).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const AdmZip = require('adm-zip');

const key = process.env.TRANSIT_API_KEY;
if (!key) {
  console.error('TRANSIT_API_KEY is not set (run with node --env-file=.env).');
  process.exit(1);
}

const res = await fetch(`https://api.511.org/transit/datafeeds?api_key=${encodeURIComponent(key)}&operator_id=CT`);
if (!res.ok) {
  console.error(`511 datafeed request failed: HTTP ${res.status}`);
  process.exit(1);
}
const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
const dir = join(root, 'data', 'gtfs');
mkdirSync(dir, { recursive: true });
// Replace the whole feed so no file from an older publisher lingers.
for (const name of readdirSync(dir)) if (name.endsWith('.txt')) rmSync(join(dir, name));
let count = 0;
for (const entry of zip.getEntries()) {
  if (entry.isDirectory || !entry.entryName.endsWith('.txt')) continue;
  writeFileSync(join(dir, entry.entryName.split('/').pop()), entry.getData());
  count++;
}
const info = zip.getEntry('feed_info.txt')?.getData().toString('utf8').split(/\r?\n/) ?? [];
console.log(`Wrote ${count} files to data/gtfs.`);
if (info.length > 1) console.log(`feed_info: ${info[0]}\n           ${info[1]}`);
