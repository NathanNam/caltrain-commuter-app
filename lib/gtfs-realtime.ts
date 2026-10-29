// GTFS-Realtime for Caltrain from 511.org (https only).
//
// Trip updates and vehicle positions are fetched together through one shared
// snapshot that is cached for 60 seconds and reused by every request, so any
// number of open tabs stays far below 511's rate limit (60 requests/hour per
// key by default).
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import type { StopTime } from './gtfs-static';
import { stations } from './stations';

const CALTRAIN_AGENCY = 'CT';
const API_BASE = 'https://api.511.org/transit';
const SNAPSHOT_TTL_MS = 60 * 1000;

const rt = GtfsRealtimeBindings.transit_realtime;
export const TripRelationship = rt.TripDescriptor.ScheduleRelationship;
export const StopRelationship = rt.TripUpdate.StopTimeUpdate.ScheduleRelationship;

export interface StopTimeUpdate {
  stopId: string;
  stopSequence?: number;
  arrivalDelay?: number; // seconds
  departureDelay?: number; // seconds
  /** Predicted absolute times (Unix seconds); 511's Caltrain feed sends these instead of delays. */
  arrivalTime?: number;
  departureTime?: number;
  /** TripUpdate.StopTimeUpdate.ScheduleRelationship enum value. */
  scheduleRelationship: number;
}

export interface TripUpdate {
  tripId: string;
  routeId: string;
  startDate: string; // YYYYMMDD, may be empty
  /** TripDescriptor.ScheduleRelationship enum value. */
  scheduleRelationship: number;
  stopTimeUpdates: StopTimeUpdate[];
}

export interface VehiclePosition {
  vehicleId: string;
  tripId: string;
  startDate: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
  currentStatus?: 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';
  /** Unix seconds the position was measured; 0 when the feed did not say. */
  timestamp: number;
}

export interface RealtimeSnapshot {
  available: boolean;
  tripUpdates: TripUpdate[];
  vehicles: VehiclePosition[];
  fetchedAt: number;
  reason?: string;
}

function toNumber(v: number | { toNumber(): number } | null | undefined): number | undefined {
  if (v == null) return undefined;
  return typeof v === 'number' ? v : v.toNumber();
}

/**
 * Whether a decoded protobuf message actually carried a field. protobufjs puts
 * defaults (0, '') on the prototype, so an absent `delay` reads as 0, not
 * undefined, and `?? undefined` cannot tell the two apart.
 */
function has(message: object | null | undefined, field: string): boolean {
  return message != null && Object.prototype.hasOwnProperty.call(message, field);
}

async function fetchFeed(kind: 'tripupdates' | 'vehiclepositions', apiKey: string) {
  const url = `${API_BASE}/${kind}?api_key=${encodeURIComponent(apiKey)}&agency=${CALTRAIN_AGENCY}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`511 ${kind} HTTP ${response.status}`);
  return rt.FeedMessage.decode(new Uint8Array(await response.arrayBuffer()));
}

export function parseTripUpdates(feed: InstanceType<typeof rt.FeedMessage>): TripUpdate[] {
  const updates: TripUpdate[] = [];
  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    if (!tu?.trip) continue;
    updates.push({
      tripId: tu.trip.tripId || '',
      routeId: tu.trip.routeId || '',
      startDate: tu.trip.startDate || '',
      scheduleRelationship: tu.trip.scheduleRelationship ?? TripRelationship.SCHEDULED,
      stopTimeUpdates: (tu.stopTimeUpdate || []).map((stu) => ({
        stopId: stu.stopId || '',
        stopSequence: has(stu, 'stopSequence') ? stu.stopSequence! : undefined,
        arrivalDelay: has(stu.arrival, 'delay') ? stu.arrival!.delay! : undefined,
        departureDelay: has(stu.departure, 'delay') ? stu.departure!.delay! : undefined,
        arrivalTime: has(stu.arrival, 'time') ? toNumber(stu.arrival!.time) : undefined,
        departureTime: has(stu.departure, 'time') ? toNumber(stu.departure!.time) : undefined,
        scheduleRelationship: stu.scheduleRelationship ?? StopRelationship.SCHEDULED,
      })),
    });
  }
  return updates;
}

const VEHICLE_STATUS = ['INCOMING_AT', 'STOPPED_AT', 'IN_TRANSIT_TO'] as const;

export function parseVehicles(feed: InstanceType<typeof rt.FeedMessage>): VehiclePosition[] {
  const out: VehiclePosition[] = [];
  for (const entity of feed.entity) {
    const v = entity.vehicle;
    const pos = v?.position;
    if (!v || !pos || pos.latitude == null || pos.longitude == null) continue;
    out.push({
      vehicleId: v.vehicle?.id || entity.id || '',
      tripId: v.trip?.tripId || '',
      startDate: v.trip?.startDate || '',
      latitude: pos.latitude,
      longitude: pos.longitude,
      bearing: pos.bearing ?? undefined,
      speed: pos.speed ?? undefined,
      currentStatus: has(v, 'currentStatus') ? VEHICLE_STATUS[v.currentStatus!] : undefined,
      timestamp: has(v, 'timestamp') ? toNumber(v.timestamp) ?? 0 : 0,
    });
  }
  return out;
}

let snapshot: RealtimeSnapshot | null = null;
let inflight: Promise<RealtimeSnapshot> | null = null;

/** Trip updates + vehicle positions, shared and cached for 60 s across requests. */
export async function getRealtimeSnapshot(): Promise<RealtimeSnapshot> {
  if (snapshot && Date.now() - snapshot.fetchedAt < SNAPSHOT_TTL_MS) return snapshot;
  if (inflight) return inflight;

  const apiKey = process.env.TRANSIT_API_KEY;
  if (!apiKey) {
    return { available: false, tripUpdates: [], vehicles: [], fetchedAt: Date.now(), reason: 'no-key' };
  }

  inflight = (async () => {
    const [tu, vp] = await Promise.allSettled([fetchFeed('tripupdates', apiKey), fetchFeed('vehiclepositions', apiKey)]);
    const tripUpdates = tu.status === 'fulfilled' ? parseTripUpdates(tu.value) : [];
    const vehicles = vp.status === 'fulfilled' ? parseVehicles(vp.value) : [];
    const available = tu.status === 'fulfilled';
    const reason = available ? undefined : (tu as PromiseRejectedResult).reason?.message ?? 'fetch-failed';
    if (!available) console.error('511 GTFS-RT unavailable:', reason);
    snapshot = { available, tripUpdates, vehicles, fetchedAt: Date.now(), reason };
    return snapshot;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The trip update for a scheduled trip on its service date (startDate checked when present). */
export function findTripUpdate(updates: TripUpdate[], tripId: string, serviceDate?: string): TripUpdate | null {
  return (
    updates.find((u) => u.tripId === tripId && (!u.startDate || !serviceDate || u.startDate === serviceDate)) ?? null
  );
}

/** The vehicle running a scheduled trip on its service date (by trip_id, never by position). */
export function findVehicle(vehicles: VehiclePosition[], tripId: string, serviceDate?: string): VehiclePosition | null {
  return (
    vehicles.find((v) => v.tripId === tripId && (!v.startDate || !serviceDate || v.startDate === serviceDate)) ?? null
  );
}

/** Positions older than this, or without a timestamp, are not shown as live. */
export const MAX_POSITION_AGE_MS = 5 * 60 * 1000;

/** A position measured within MAX_POSITION_AGE_MS of now (and not from the future). */
export function isFreshPosition(vehicle: VehiclePosition, nowMs: number): boolean {
  if (!vehicle.timestamp) return false;
  const age = nowMs - vehicle.timestamp * 1000;
  return age <= MAX_POSITION_AGE_MS && age >= -60 * 1000;
}

/** How close (metres) a vehicle must be to its trip's first station to count as waiting there. */
const AT_STATION_M = 500;

/**
 * True when the vehicle is sitting at its trip's first stop: either before the
 * trip starts or held there. Such a position says nothing about running
 * delay, so it is shown as "not yet departed", never turned into lateness.
 */
export function isAtFirstStop(vehicle: VehiclePosition, stopTimes: StopTime[]): boolean {
  const first = stopTimes[0];
  const station = first && stations.find((s) => s.gtfsStopIds.includes(first.stopId));
  if (!station) return false;
  const cos = Math.cos((vehicle.latitude * Math.PI) / 180);
  const dx = (station.coordinates.lng - vehicle.longitude) * cos * 111320;
  const dy = (station.coordinates.lat - vehicle.latitude) * 110540;
  return Math.hypot(dx, dy) <= AT_STATION_M;
}

export interface LiveStatus {
  delay: number; // minutes
  status: 'on-time' | 'delayed' | 'cancelled';
}

/** The trip's static stop times and its service day start, to turn predicted times into delays. */
export interface TripSchedule {
  stopTimes: StopTime[];
  dayStartMs: number;
}

/** Delay in seconds of one stop's update: its own delay, else predicted time minus scheduled time. */
function updateDelaySeconds(s: StopTimeUpdate, schedule?: TripSchedule): number | undefined {
  const delay = s.departureDelay ?? s.arrivalDelay;
  if (delay != null) return delay;
  const st = schedule?.stopTimes.find((t) => t.stopId === s.stopId);
  if (!st || !schedule) return undefined;
  const dayStart = schedule.dayStartMs / 1000;
  if (s.departureTime != null) return s.departureTime - (dayStart + st.departureSecs);
  if (s.arrivalTime != null) return s.arrivalTime - (dayStart + st.arrivalSecs);
  return undefined;
}

/**
 * Live status of a trip at the rider's origin stop.
 * - Trip-level CANCELED -> cancelled.
 * - The origin stop SKIPPED -> cancelled (the train will not stop there).
 * - Otherwise the delay of the origin stop's update, or, per GTFS-RT
 *   propagation, of the nearest earlier stop on the trip that has one.
 *   A stop's delay is its `delay` field or, when the feed only sends predicted
 *   times (511's Caltrain feed does), the predicted time minus the scheduled
 *   time from `schedule`. Stops without a stop_sequence in the feed take it
 *   from the schedule.
 * Returns null when the feed has no prediction for the origin.
 */
export function getStopDelay(
  update: TripUpdate,
  originStopId: string,
  originSequence?: number,
  schedule?: TripSchedule
): LiveStatus | null {
  if (update.scheduleRelationship === TripRelationship.CANCELED) return { delay: 0, status: 'cancelled' };

  const atOrigin = update.stopTimeUpdates.find((s) => s.stopId === originStopId);
  if (atOrigin?.scheduleRelationship === StopRelationship.SKIPPED) return { delay: 0, status: 'cancelled' };

  const sequenceOf = (s: StopTimeUpdate) =>
    s.stopSequence ?? schedule?.stopTimes.find((t) => t.stopId === s.stopId)?.sequence;
  const usable = (s: StopTimeUpdate | undefined) =>
    s && s.scheduleRelationship !== StopRelationship.NO_DATA && updateDelaySeconds(s, schedule) != null ? s : undefined;

  let source: StopTimeUpdate | undefined = usable(atOrigin);
  if (!source && originSequence != null) {
    source = update.stopTimeUpdates
      .filter((s) => {
        const seq = sequenceOf(s);
        return seq != null && seq <= originSequence && s.scheduleRelationship === StopRelationship.SCHEDULED && usable(s);
      })
      .sort((a, b) => (sequenceOf(b) ?? 0) - (sequenceOf(a) ?? 0))[0];
  }
  if (!source) return null;

  const seconds = updateDelaySeconds(source, schedule);
  if (seconds == null) return null;
  const minutes = Math.round(seconds / 60) || 0; // never -0
  return { delay: minutes, status: minutes >= 1 ? 'delayed' : 'on-time' };
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  headerText: string;
  descriptionText: string;
  url?: string;
  activePeriods: Array<{
    start: number;
    end: number;
  }>;
  informedEntities: Array<{
    agencyId?: string;
    routeId?: string;
    routeType?: number;
    stopId?: string;
  }>;
}


/**
 * Fetch service alerts from 511.org
 */
export async function fetchServiceAlerts(): Promise<Alert[]> {
  const apiKey = process.env.TRANSIT_API_KEY;
  if (!apiKey) {
    console.warn('TRANSIT_API_KEY not configured');
    return [];
  }

  try {
    const url = `${API_BASE}/servicealerts?api_key=${encodeURIComponent(apiKey)}&agency=${CALTRAIN_AGENCY}&format=json`;
    const response = await fetch(url, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      throw new Error(`511.org API error: ${response.status}`);
    }

    const data = await response.json();
    const alerts: Alert[] = [];

    // Parse JSON format service alerts
    if (data.ServiceDelivery?.SituationExchangeDelivery?.Situations?.PtSituationElement) {
      const situations = Array.isArray(data.ServiceDelivery.SituationExchangeDelivery.Situations.PtSituationElement)
        ? data.ServiceDelivery.SituationExchangeDelivery.Situations.PtSituationElement
        : [data.ServiceDelivery.SituationExchangeDelivery.Situations.PtSituationElement];

      for (const situation of situations) {
        const severity = mapSeverity(situation.Severity);

        alerts.push({
          id: situation.SituationNumber || Math.random().toString(),
          severity,
          headerText: situation.Summary?.[0]?._ || 'Service Alert',
          descriptionText: situation.Description?.[0]?._ || '',
          url: situation.InfoLinks?.InfoLink?.[0]?.Uri || undefined,
          activePeriods: [],
          informedEntities: [],
        });
      }
    }

    return alerts;
  } catch (error) {
    console.error('Error fetching service alerts:', error);
    return [];
  }
}


/**
 * Map 511.org severity to our app's severity levels
 */
function mapSeverity(severity: string | undefined): 'info' | 'warning' | 'critical' {
  if (!severity) return 'info';

  const sev = severity.toLowerCase();
  if (sev.includes('severe') || sev.includes('critical')) return 'critical';
  if (sev.includes('warning') || sev.includes('moderate')) return 'warning';
  return 'info';
}

