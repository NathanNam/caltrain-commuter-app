// UI helpers for the 1830-style commuter board (client side only).
import { stations } from './stations';
import { Station, Train } from './types';

/** Stations offered in the route picker and drawn on the line strip, north to south (all of them). */
export const lineStations: Station[] = stations;

export function isLineStation(id: string | null | undefined): id is string {
  return !!id && lineStations.some((s) => s.id === id);
}

/** Major stops drawn as "cities" (white circles); the rest are "towns" (dots). */
export const CITY_IDS = new Set(['sf', 'mb', 'sm', 'hillsdale', 'rw', 'pa', 'mv', 'sunnyvale', 'diridon', 'gilroy']);

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
  'blossom-hill': 'Blossom Hill',
  'morgan-hill': 'Morgan Hill',
  'san-martin': 'San Martin',
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

/**
 * When the train is expected to leave the rider's station: the scheduled departure plus any known
 * lateness. Early running is ignored (Caltrain holds trains to the timetable), and cancelled trains
 * keep their scheduled time.
 */
export function expectedDepartureMs(train: Train): number {
  const scheduled = new Date(train.departureTime).getTime();
  if (train.status === 'cancelled') return scheduled;
  return scheduled + Math.max(0, train.delay ?? 0) * 60000;
}

/** Whole minutes from now until the expected departure (scheduled + known delay; never negative). */
export function minutesUntilTrain(train: Train, now: number): number {
  return Math.max(0, Math.round((expectedDepartureMs(train) - now) / 60000));
}

/** Whole minutes from now until the scheduled departure (never negative). */
export function minutesUntil(iso: string, now: number): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 60000));
}

/** Countdown text: "8" / "1:05" for long waits, with its unit. */
export function countdown(mins: number): { value: string; unit: string; long: boolean } {
  if (mins >= 100) {
    // Hours and minutes, never a clock-like "9:57": "9h" over "57 MIN".
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return { value: `${h}h`, unit: `${m.toString().padStart(2, '0')} MIN`, long: false };
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

/**
 * Shown to visitors who have no route in the link and none saved. It is
 * never written to the URL or localStorage until they choose a route, so a
 * later change of default reaches everyone who never picked one.
 */
export const DEFAULT_ROUTE = { from: 'sf', to: 'sm' } as const;

/** Route precedence: the link, then the remembered route, then the default. */
export function initialRoute(
  fromUrl: { from: string; to: string } | null,
  saved: { from: string; to: string } | null
): { from: string; to: string; isDefault: boolean } {
  const r = fromUrl ?? saved;
  return r ? { ...r, isDefault: false } : { ...DEFAULT_ROUTE, isDefault: true };
}
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

// ---------- live train tokens (shared by the hex strip and its legend) ----------
export type Direction = 'Northbound' | 'Southbound';

export interface TokenStyle {
  fill: string;
  /** +1 points south (down / right on the strip), -1 points north. */
  pointer: 1 | -1;
  name: string;
}

export const TOKEN_STYLE: Record<Direction, TokenStyle> = {
  Southbound: { fill: 'var(--co-red)', pointer: 1, name: 'Southbound train' },
  Northbound: { fill: 'var(--co-blue)', pointer: -1, name: 'Northbound train' },
};

/** Rim width: trains on the rider's route get a heavier rim. */
export function tokenRim(mine: boolean): number {
  return mine ? 3.5 : 2;
}

/** Pointer triangle for a token at (cx, cy), radius r, in its direction of travel. */
export function tokenPointer(cx: number, cy: number, direction: Direction, horizontal: boolean, r = 12): string {
  const d = TOKEN_STYLE[direction].pointer;
  const tip = r + 9;
  const base = r - 3;
  const half = 8;
  return horizontal
    ? `${cx + d * tip},${cy} ${cx + d * base},${cy - half} ${cx + d * base},${cy + half}`
    : `${cx},${cy + d * tip} ${cx - half},${cy + d * base} ${cx + half},${cy + d * base}`;
}

export interface LiveToken {
  idx: number;
  label: string;
  direction: Direction;
  /** One of the listed departures for the chosen route. */
  mine: boolean;
}

/**
 * Place live tokens in a lane beside the track: each token takes the first
 * slot (left to right) where no token already placed is within `minDy`
 * vertically, so tokens and their pointers never overlap each other, and the
 * lane itself keeps them off the station circles. South before north at a
 * station, so directions keep a consistent order.
 *
 * At most `maxSlots` slots are used, so a crowded station never runs past the
 * edge of the drawing: when a row needs more, its last slot becomes a "+N"
 * marker whose `more` lists the trains it stands for (trains on the rider's
 * route are kept as tokens where possible).
 */
export function placeTokens<T extends LiveToken>(
  tokens: T[],
  yOf: (t: T) => number,
  laneX: number,
  step = 30,
  minDy = 44,
  maxSlots = Infinity
): { t: T; x: number; y: number; more?: T[] }[] {
  const sorted = [...tokens].sort(
    (a, b) => yOf(a) - yOf(b) || (a.direction === b.direction ? 0 : a.direction === 'Southbound' ? -1 : 1)
  );
  const placed: { t: T; x: number; y: number; slot: number; more?: T[] }[] = [];
  for (const t of sorted) {
    const y = yOf(t);
    let slot = 0;
    while (placed.some((p) => p.slot === slot && Math.abs(p.y - y) < minDy)) slot++;
    placed.push({ t, x: laneX + slot * step, y, slot });
  }
  if (!placed.some((p) => p.slot >= maxSlots)) return placed;

  // Fold every token past the last slot into the nearest token in the last slot.
  const lastSlot = Math.max(0, maxSlots - 1);
  const keep = placed.filter((p) => p.slot < maxSlots);
  for (const p of placed.filter((q) => q.slot >= maxSlots)) {
    const host = keep
      .filter((q) => q.slot === lastSlot)
      .sort((a, b) => Math.abs(a.y - p.y) - Math.abs(b.y - p.y))[0];
    host.more = [...(host.more ?? [host.t]), p.t];
  }
  // A train on the rider's route swaps out of a "+N" for a visible train nearby.
  for (const host of keep.filter((p) => p.more)) {
    for (const mine of host.more!.filter((t) => t.mine)) {
      const swap = keep.find((q) => !q.more && !q.t.mine && Math.abs(q.y - host.y) < minDy);
      if (!swap) continue;
      host.more = host.more!.map((t) => (t === mine ? swap.t : t));
      swap.t = mine;
    }
  }
  return keep;
}
