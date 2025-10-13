'use client';

import { useEffect, useState } from 'react';
import { VenueEvent } from '@/lib/types';
import { getStationById } from '@/lib/stations';

export default function VenueEvents() {
  const [events, setEvents] = useState<VenueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/events');

        if (!response.ok) {
          throw new Error('Failed to fetch events');
        }

        const data = await response.json();
        setEvents(data.events || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();

    // Refresh every 30 minutes
    const interval = setInterval(fetchEvents, 1800000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Event Crowding Alerts</h2>
        <div className="animate-pulse space-y-3">
          <div className="bg-gray-200 h-20 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return null; // Fail silently for non-critical feature
  }

  if (events.length === 0) {
    return null; // Don't show anything if no events
  }

  const getCrowdLevelColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-red-50 border-red-400 text-red-800';
      case 'moderate':
        return 'bg-yellow-50 border-yellow-400 text-yellow-800';
      case 'low':
        return 'bg-green-50 border-green-400 text-green-800';
      default:
        return 'bg-gray-50 border-gray-400 text-gray-800';
    }
  };

  const getCrowdIcon = (level: string) => {
    switch (level) {
      case 'high':
        return '🚨';
      case 'moderate':
        return '⚠️';
      case 'low':
        return '✓';
      default:
        return 'ℹ️';
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'baseball':
        return '⚾';
      case 'basketball':
        return '🏀';
      case 'concert':
        return '🎵';
      default:
        return '🎫';
    }
  };

  const formatEventTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold text-gray-800">Event Crowding Alerts</h2>
        <span className="text-2xl">🏟️</span>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Major events happening today that may affect train crowding:
      </p>

      <div className="space-y-3">
        {events.map((event) => {
          const crowdColor = getCrowdLevelColor(event.crowdLevel);

          return (
            <div
              key={event.id}
              className={`border-l-4 rounded-lg p-4 ${crowdColor}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  {/* Event Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{getEventIcon(event.eventType)}</span>
                    <div>
                      <h3 className="font-bold text-sm">{event.eventName}</h3>
                      <p className="text-xs opacity-75">{event.venueName}</p>
                    </div>
                  </div>

                  {/* Event Time */}
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      {formatEventTime(event.startTime)}
                      {event.endTime && ` - ${formatEventTime(event.endTime)}`}
                    </span>
                  </div>

                  {/* Affected Stations */}
                  <div className="flex flex-wrap gap-1 text-xs">
                    <span className="font-semibold">Expect crowds at:</span>
                    {event.affectedStations.map((stationId) => {
                      const station = getStationById(stationId);
                      return station ? (
                        <span
                          key={stationId}
                          className="px-2 py-1 bg-white bg-opacity-50 rounded"
                        >
                          {station.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>

                {/* Crowd Level Badge */}
                <div className="flex flex-col items-center">
                  <span className="text-2xl mb-1">{getCrowdIcon(event.crowdLevel)}</span>
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {event.crowdLevel}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          💡 <strong>Tip:</strong> Consider taking earlier or later trains to avoid event crowds.
        </p>
      </div>
    </div>
  );
}
