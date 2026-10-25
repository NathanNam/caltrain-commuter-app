// UI helpers for the 1830-style commuter board (client side only).
import { stations } from './stations';
import { Station, Train } from './types';

// South County Connector stations (8XX service) are not offered in the picker.
const SOUTH_COUNTY = ['tamien', 'capitol', 'blossom-hill', 'morgan-hill', 'san-martin', 'gilroy'];

/** Stations offered in the route picker and drawn on the line strip, north to south. */
export const lineStations: Station[] = stations.filter((s) => !SOUTH_COUNTY.includes(s.id));

export function isLineStation(id: string | null | undefined): id is string {
  return !!id && lineStations.some((s) => s.id === id);
}

/** Major stops drawn as "cities" (white circles); the rest are "towns" (dots). */
export const CITY_IDS = new Set(['sf', 'mb', 'sm', 'hillsdale', 'rw', 'pa', 'mv', 'sunnyvale', 'diridon']);

const SHORT: Record<string, string> = {
  sf: 'SF',
  '22nd': '22nd',
  ssf: 'S. SF',
  sb: 'San Bruno',
  'hayward-park': 'Hayward Pk',
  rw: 'Redwood City',
  'cal-ave': 'Cal Ave',
  'san-antonio': 'San Antonio',
  mv: 'Mtn View',
  'santa-clara': 'Santa Clara',
  'college-park': 'College Pk',
  diridon: 'SJ Diridon',
};

/** Short label for tight spots (horizontal strip, header). */
export function shortName(station: Station): string {
  return SHORT[station.id] ?? station.name.replace(/\s*\(.*\)$/, '');
}

/** Display name without the parenthetical, e.g. "San Francisco (4th & King)" -> "San Francisco". */
export function plainName(station: Station): string {
  return station.name.replace(/\s*\(.*\)$/, '');
}

/** Two-to-three letter seal for certificates. */
export function sealCode(station: Station): string {
  const words = plainName(station).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}

export type StatusKind = 'on' | 'early' | 'late' | 'verylate' | 'cancel' | 'sched';

export function statusOf(train: Train): { kind: StatusKind; text: string } {
  if (train.status === 'cancelled') return { kind: 'cancel', text: 'Cancelled' };
  const delay = train.delay ?? 0;
  if (delay >= 10) return { kind: 'verylate', text: `${delay} min late` };
  if (delay > 0) return { kind: 'late', text: `${delay} min late` };
  if (delay < 0) return { kind: 'early', text: `${Math.abs(delay)} min early` };
  if (train.status === 'on-time' || train.status === 'delayed') return { kind: 'on', text: 'On time' };
  return { kind: 'sched', text: 'Scheduled' };
}

/** Whole minutes from now until the scheduled departure (never negative). */
export function minutesUntil(iso: string, now: number): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 60000));
}

/** Countdown text: "8" / "1:05" for long waits, with its unit. */
export function countdown(mins: number): { value: string; unit: string; long: boolean } {
  if (mins >= 100) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return { value: `${h}:${m.toString().padStart(2, '0')}`, unit: 'HRS', long: true };
  }
  return { value: String(mins), unit: 'MIN', long: false };
}

/** Index in lineStations of the stop nearest to a lat/lng (for the live train token). */
export function nearestLineStation(lat: number, lng: number): number {
  let best = 0;
  let bestD = Infinity;
  const cos = Math.cos((lat * Math.PI) / 180);
  lineStations.forEach((s, i) => {
    const dx = (s.coordinates.lng - lng) * cos;
    const dy = s.coordinates.lat - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// ---------- remembered route ----------
const LAST_ROUTE_KEY = 'caltrain_last_route';

export function loadLastRoute(): { from: string; to: string } | null {
  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isLineStation(parsed?.from) && isLineStation(parsed?.to) && parsed.from !== parsed.to) {
      return { from: parsed.from, to: parsed.to };
    }
  } catch {
    // storage blocked or corrupt: fall through
  }
  return null;
}

export function saveLastRoute(from: string, to: string): void {
  try {
    localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ from, to }));
  } catch {
    // storage blocked: the URL still carries the route
  }
}
