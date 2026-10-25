'use client';

export type SampleSource = 'live' | 'timetable' | 'alerts' | 'weather' | 'events';

const TEXT: Record<SampleSource, string> = {
  live: 'Live delays and train positions are unavailable right now, so trains are shown as scheduled.',
  timetable: 'The timetable has passed its end date; times may be out of date.',
  alerts: 'Service alerts are examples (set TRANSIT_API_KEY).',
  weather: 'Weather is sample data (set WEATHER_API_KEY).',
  events: 'Events are sample data (set TICKETMASTER_API_KEY).',
};

const ORDER: SampleSource[] = ['live', 'timetable', 'alerts', 'weather', 'events'];

/** The one place that says which parts of the board are not live. */
export default function SampleDataNote({
  sources,
  timetableEnd,
}: {
  sources: Partial<Record<SampleSource, boolean>>;
  timetableEnd?: string | null;
}) {
  const active = ORDER.filter((k) => sources[k]);
  if (active.length === 0) return null;
  const sample = active.some((k) => k === 'alerts' || k === 'weather' || k === 'events');
  const label = sample ? 'Sample data' : 'Not live';
  const endText =
    timetableEnd && /^\d{8}$/.test(timetableEnd)
      ? ` (ended ${timetableEnd.slice(0, 4)}-${timetableEnd.slice(4, 6)}-${timetableEnd.slice(6)})`
      : '';
  return (
    <details className="sample">
      <summary aria-label={`${label}: ${active.length} ${active.length === 1 ? 'note' : 'notes'}. Show details`}>
        {label}
      </summary>
      <div className="pop" role="note">
        <p>
          <strong>Parts of this board are not live:</strong>
        </p>
        <ul>
          {active.map((k) => (
            <li key={k}>
              {TEXT[k]}
              {k === 'timetable' ? endText : ''}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
