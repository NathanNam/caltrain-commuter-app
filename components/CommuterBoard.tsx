'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Train } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { formatTime } from '@/lib/utils';
import { isLineStation, lineStations, loadLastRoute, nearestLineStation, saveLastRoute } from '@/lib/board';
import RoutePicker from './RoutePicker';
import ServiceAlerts from './ServiceAlerts';
import WeatherWidget from './WeatherWidget';
import VenueEvents from './VenueEvents';
import LineStrip, { LiveToken } from './LineStrip';
import MapSection from './MapSection';
import ThemeToggle from './ThemeToggle';
import SampleDataNote, { SampleSource } from './SampleDataNote';
import { DepartureList, NextTrainHero } from './Departures';

type Flags = Partial<Record<SampleSource | 'weatherA' | 'weatherB', boolean>>;

function readRouteFromUrl(): { from: string; to: string } | null {
  try {
    const p = new URLSearchParams(window.location.search);
    const from = p.get('from');
    const to = p.get('to');
    if (isLineStation(from) && isLineStation(to) && from !== to) return { from, to };
  } catch {
    // ignore malformed URLs
  }
  return null;
}

function writeRouteToUrl(from: string, to: string) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);
    window.history.replaceState(null, '', url.toString());
  } catch {
    // history API unavailable: nothing to do
  }
}

export default function CommuterBoard() {
  const [ready, setReady] = useState(false);
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [trains, setTrains] = useState<Train[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [flags, setFlags] = useState<Flags>({});
  const [liveFeed, setLiveFeed] = useState(false);
  const [timetableEnd, setTimetableEnd] = useState<string | null>(null);

  // Route from the link first, then the remembered route.
  useEffect(() => {
    const route = readRouteFromUrl() ?? loadLastRoute();
    if (route) {
      setOriginId(route.from);
      setDestinationId(route.to);
      writeRouteToUrl(route.from, route.to);
    }
    setReady(true);
  }, []);

  const changeRoute = useCallback((from: string, to: string) => {
    setOriginId(from);
    setDestinationId(to);
    saveLastRoute(from, to);
    writeRouteToUrl(from, to);
  }, []);

  const hasRoute = isLineStation(originId) && isLineStation(destinationId) && originId !== destinationId;

  // One train fetch feeds the countdown, departures, hex strip and street map.
  useEffect(() => {
    if (!hasRoute) {
      setTrains([]);
      return;
    }
    let cancelled = false;
    setTrains([]);
    const fetchTrains = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/trains?origin=${originId}&destination=${destinationId}`);
        if (!response.ok) throw new Error('Train times are unavailable right now.');
        const data = await response.json();
        if (cancelled) return;
        setTrains(data.trains || []);
        setLiveFeed(Boolean(data.realtime?.available));
        setError(null);
        setUpdatedAt(new Date());
        setFlags((f) => ({ ...f, live: !data.realtime?.available, timetable: Boolean(data.timetable?.expired) }));
        setTimetableEnd(data.timetable?.feedEndDate ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchTrains();
    const interval = setInterval(fetchTrains, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasRoute, originId, destinationId]);

  // Tick the countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const onAlertsSample = useCallback((v: boolean) => setFlags((f) => ({ ...f, alerts: v })), []);
  const onEventsSample = useCallback((v: boolean) => setFlags((f) => ({ ...f, events: v })), []);
  const onWeatherA = useCallback((v: boolean) => setFlags((f) => ({ ...f, weatherA: v })), []);
  const onWeatherB = useCallback((v: boolean) => setFlags((f) => ({ ...f, weatherB: v })), []);

  const sampleSources = {
    live: hasRoute && flags.live,
    timetable: hasRoute && flags.timetable,
    alerts: flags.alerts,
    weather: hasRoute && (flags.weatherA || flags.weatherB),
    events: flags.events,
  };

  const origin = getStationById(originId);
  const destination = getStationById(destinationId);
  const originIdx = lineStations.findIndex((s) => s.id === originId);
  const destIdx = lineStations.findIndex((s) => s.id === destinationId);

  const upcoming = trains.filter((t) => new Date(t.departureTime).getTime() > now - 60000);
  const next = upcoming.find((t) => t.status !== 'cancelled') ?? null;
  const later = upcoming.filter((t) => t !== next);
  // Live tokens come only from each listed train's own vehicle, which the API
  // matched by GTFS-RT trip_id; the street map uses the same list.
  const tokens: LiveToken[] = upcoming
    .filter((t) => t.vehiclePosition)
    .map((t) => ({
      idx: nearestLineStation(t.vehiclePosition!.latitude, t.vehiclePosition!.longitude),
      label: t.trainNumber,
    }));

  const tripStationIds = useMemo(() => {
    const lo = Math.min(originIdx, destIdx);
    const hi = Math.max(originIdx, destIdx);
    return new Set(lo < 0 ? [] : lineStations.slice(lo, hi + 1).map((s) => s.id));
  }, [originIdx, destIdx]);

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="ct-token" aria-hidden="true">
          CT
        </div>
        <div style={{ minWidth: 0 }}>
          <h1>Caltrain Commuter</h1>
          <div className="asof">
            {updatedAt ? `Updated ${formatTime(updatedAt)} PT` : 'Times in Pacific time'}
          </div>
        </div>
        <div className="masthead-tools">
          <SampleDataNote sources={sampleSources} timetableEnd={timetableEnd} />
          <ThemeToggle />
        </div>
      </header>

      {ready && (
        <RoutePicker
          originId={hasRoute ? originId : ''}
          destinationId={hasRoute ? destinationId : ''}
          onChange={changeRoute}
          forceOpen={!hasRoute}
        />
      )}

      <ServiceAlerts onSampleChange={onAlertsSample} />

      {!ready ? (
        <div className="skeleton" style={{ height: 220 }} aria-hidden="true" />
      ) : hasRoute && origin && destination ? (
        <main className="board-grid">
          <div className="stack">
            {next ? (
              <NextTrainHero train={next} origin={origin} destination={destination} now={now} liveFeed={liveFeed} />
            ) : loading && trains.length === 0 ? (
              <div className="skeleton" style={{ height: 200 }} aria-label="Loading trains" />
            ) : (
              <div className="panel empty" role="status">
                <strong>{error ?? 'No trains are scheduled for this route right now.'}</strong>
                <p>The board refreshes every 30 seconds.</p>
              </div>
            )}

            {(next || later.length > 0) && (
              <section aria-labelledby="departures-h" className="stack" style={{ gap: 10 }}>
                <h2 className="rule-h" id="departures-h">
                  Departures
                </h2>
                <DepartureList trains={later} now={now} />
                {error && <p className="hint">{error} Showing the last times received.</p>}
              </section>
            )}

            <div className="certs">
              <WeatherWidget stationId={originId} which="Origin" onSampleChange={onWeatherA} />
              <WeatherWidget stationId={destinationId} which="Destination" onSampleChange={onWeatherB} />
              <VenueEvents tripStationIds={tripStationIds} onSampleChange={onEventsSample} />
            </div>
          </div>

          <div className="stack">
            <section className="panel linebox" aria-labelledby="line-h">
              <h2 className="label head" id="line-h">
                The line
                {next ? ` · ${next.duration} min on train ${next.trainNumber}` : ''}
              </h2>
              <LineStrip originIdx={originIdx} destIdx={destIdx} tripMinutes={next?.duration} tokens={tokens} />
              <div className="legend">
                <span>
                  <i className="sw" style={{ background: 'var(--tile-green)' }} aria-hidden="true" />
                  Your trip
                </span>
                <span>
                  <i className="sw" style={{ background: 'var(--tile-yellow)' }} aria-hidden="true" />
                  Rest of the line
                </span>
                <span>
                  <svg width="16" height="16" aria-hidden="true">
                    <circle cx="8" cy="8" r="6" fill="#fff" stroke="#1b1a17" strokeWidth="2" />
                  </svg>
                  Major stop
                </span>
                <span>
                  <svg width="16" height="16" aria-hidden="true">
                    <circle cx="8" cy="8" r="3.5" fill="currentColor" />
                  </svg>
                  Stop
                </span>
                <span>
                  <svg width="16" height="16" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" fill="var(--co-red)" stroke="#1b1a17" strokeWidth="1.5" />
                  </svg>
                  {tokens.length > 0
                    ? `${tokens.length === 1 ? 'Train' : 'Trains'} ${tokens.map((t) => t.label).join(', ')} (live)`
                    : 'Live train (none reporting)'}
                </span>
              </div>
            </section>

            <MapSection originId={originId} destinationId={destinationId} trains={upcoming} />
          </div>
        </main>
      ) : (
        <main className="panel empty">
          <strong>Pick where you board and where you get off.</strong>
          <p>
            Your route is remembered on this device and kept in the page address, so you can bookmark it or share
            the link.
          </p>
        </main>
      )}

      <footer className="foot">
        All times Pacific. Schedule from Caltrain&rsquo;s GTFS timetable; live delays and positions from 511.org when
        available. Hex line drawing is original artwork in the spirit of the 1830 board game.
      </footer>
    </div>
  );
}
