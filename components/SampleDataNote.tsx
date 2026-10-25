'use client';

export type SampleSource = 'schedule' | 'delays' | 'alerts' | 'weather' | 'events';

const TEXT: Record<SampleSource, string> = {
  schedule: 'Train times are simulated (the timetable could not be loaded).',
  delays: 'On-time / late status is simulated (no live delay feed; set TRANSIT_API_KEY).',
  alerts: 'Service alerts are examples (set TRANSIT_API_KEY).',
  weather: 'Weather is sample data (set WEATHER_API_KEY).',
  events: 'Events are sample data (set TICKETMASTER_API_KEY).',
};

const ORDER: SampleSource[] = ['schedule', 'delays', 'alerts', 'weather', 'events'];

/** The one place that says some of the board is sample data. */
export default function SampleDataNote({ sources }: { sources: Partial<Record<SampleSource, boolean>> }) {
  const active = ORDER.filter((k) => sources[k]);
  if (active.length === 0) return null;
  return (
    <details className="sample">
      <summary aria-label={`Sample data: ${active.length} ${active.length === 1 ? 'source' : 'sources'}. Show details`}>
        Sample data
      </summary>
      <div className="pop" role="note">
        <p>
          <strong>Parts of this board are not live:</strong>
        </p>
        <ul>
          {active.map((k) => (
            <li key={k}>{TEXT[k]}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
