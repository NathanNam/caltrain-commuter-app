'use client';

import { useEffect, useState } from 'react';
import { VenueEvent } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { plainName } from '@/lib/board';
import { formatTime } from '@/lib/utils';

interface VenueEventsProps {
  /** Station ids on the chosen trip, to flag events that crowd your stops. */
  tripStationIds: Set<string>;
  onSampleChange?: (isSample: boolean) => void;
}

const CROWD_TEXT = { high: 'High crowds', moderate: 'Moderate crowds', low: 'Light crowds' } as const;

/** Nearby events as a "crowd charter" certificate. */
export default function VenueEvents({ tripStationIds, onSampleChange }: VenueEventsProps) {
  const [events, setEvents] = useState<VenueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await fetch('/api/events');
        if (!response.ok) {
          throw new Error('Failed to fetch events');
        }
        const data = await response.json();
        setEvents(data.events || []);
        setFailed(false);
        onSampleChange?.(Boolean(data.isMockData));
      } catch {
        setFailed(true);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();

    // Refresh every 30 minutes
    const interval = setInterval(fetchEvents, 1800000);
    return () => clearInterval(interval);
  }, [onSampleChange]);

  const onLine = events.filter((e) => e.affectedStations.some((id) => tripStationIds.has(id)));

  return (
    <section className="cert wide" aria-label="Events today">
      <div className="seal" aria-hidden="true">
        EV
      </div>
      <div className="co">Crowd charter &middot; events today</div>
      {loading ? (
        <div className="skeleton" style={{ height: 40, marginTop: 8 }} />
      ) : failed ? (
        <p className="small" style={{ marginTop: 8 }}>
          Event listings are unavailable right now.
        </p>
      ) : events.length === 0 ? (
        <>
          <div className="big mid">No big events today</div>
          <div className="small">Nothing scheduled at the venues near the line.</div>
        </>
      ) : (
        <>
          <div className="big mid">
            {onLine.length > 0
              ? `${onLine.length} ${onLine.length === 1 ? 'event' : 'events'} near your stops`
              : `${events.length} ${events.length === 1 ? 'event' : 'events'} on the line, none at your stops`}
          </div>
          <ul className="events">
            {events.map((event) => (
              <li key={event.id}>
                <div className="name">
                  {event.eventName}
                  <span className={`crowd ${event.crowdLevel}`}>{CROWD_TEXT[event.crowdLevel]}</span>
                </div>
                <div className="small">
                  {event.venueName} &middot; {formatTime(event.startTime)}
                  {event.endTime && ` to ${formatTime(event.endTime)}`}
                </div>
                {event.affectedStations.length > 0 && (
                  <div className="small">
                    Expect crowds at{' '}
                    {event.affectedStations
                      .map((id) => getStationById(id))
                      .filter((s) => !!s)
                      .map((s, i, arr) => (
                        <span key={s!.id}>
                          <span className={tripStationIds.has(s!.id) ? 'on-trip' : undefined}>
                            {plainName(s!)}
                            {tripStationIds.has(s!.id) ? ' (your trip)' : ''}
                          </span>
                          {i < arr.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="small" style={{ marginTop: 10 }}>
            Tip: an earlier or later train usually avoids the crowd.
          </p>
        </>
      )}
    </section>
  );
}
