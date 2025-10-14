// GTFS-Realtime utilities for fetching Caltrain real-time data from 511.org
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const CALTRAIN_AGENCY = 'CT';
const API_BASE = 'http://api.511.org/transit';

export interface TripUpdate {
  tripId: string;
  routeId: string;
  startDate: string;
  startTime: string;
  stopTimeUpdates: StopTimeUpdate[];
}

export interface StopTimeUpdate {
  stopId: string;
  stopSequence: number;
  arrival?: {
    delay: number; // in seconds
    time: number; // unix timestamp
  };
  departure?: {
    delay: number; // in seconds
    time: number; // unix timestamp
  };
  scheduleRelationship?: string;
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
 * Fetch real-time trip updates from 511.org
 */
export async function fetchTripUpdates(): Promise<TripUpdate[]> {
  const apiKey = process.env.TRANSIT_API_KEY;
  if (!apiKey) {
    console.warn('TRANSIT_API_KEY not configured');
    return [];
  }

  try {
    const url = `${API_BASE}/tripupdates?api_key=${apiKey}&agency=${CALTRAIN_AGENCY}`;
    const response = await fetch(url, {
      next: { revalidate: 30 }, // Cache for 30 seconds
    });

    if (!response.ok) {
      throw new Error(`511.org API error: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    const updates: TripUpdate[] = [];

    for (const entity of feed.entity) {
      if (entity.tripUpdate && entity.tripUpdate.trip) {
        const trip = entity.tripUpdate.trip;
        const stopTimeUpdates: StopTimeUpdate[] = [];

        for (const stu of entity.tripUpdate.stopTimeUpdate || []) {
          stopTimeUpdates.push({
            stopId: stu.stopId || '',
            stopSequence: stu.stopSequence || 0,
            arrival: stu.arrival
              ? {
                  delay: stu.arrival.delay || 0,
                  time: typeof stu.arrival.time === 'number'
                    ? stu.arrival.time
                    : (stu.arrival.time?.toNumber() || 0),
                }
              : undefined,
            departure: stu.departure
              ? {
                  delay: stu.departure.delay || 0,
                  time: typeof stu.departure.time === 'number'
                    ? stu.departure.time
                    : (stu.departure.time?.toNumber() || 0),
                }
              : undefined,
            scheduleRelationship: stu.scheduleRelationship?.toString(),
          });
        }

        updates.push({
          tripId: trip.tripId || '',
          routeId: trip.routeId || '',
          startDate: trip.startDate || '',
          startTime: trip.startTime || '',
          stopTimeUpdates,
        });
      }
    }

    return updates;
  } catch (error) {
    console.error('Error fetching trip updates:', error);
    return [];
  }
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
    const url = `${API_BASE}/servicealerts?api_key=${apiKey}&agency=${CALTRAIN_AGENCY}&format=json`;
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

/**
 * Get delay for a specific stop on a specific trip
 */
export function getStopDelay(
  updates: TripUpdate[],
  stopId: string
): { delay: number; status: 'on-time' | 'delayed' | 'cancelled' } | null {
  for (const update of updates) {
    for (const stu of update.stopTimeUpdates) {
      if (stu.stopId === stopId) {
        const delay = stu.departure?.delay || stu.arrival?.delay || 0;
        const delayMinutes = Math.round(delay / 60);

        let status: 'on-time' | 'delayed' | 'cancelled' = 'on-time';
        if (stu.scheduleRelationship === 'SKIPPED' || stu.scheduleRelationship === 'CANCELED') {
          status = 'cancelled';
        } else if (Math.abs(delayMinutes) >= 3) {
          status = 'delayed';
        }

        return { delay: delayMinutes, status };
      }
    }
  }

  return null;
}
