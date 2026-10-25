'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LiveTrain, Train } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { formatTime } from '@/lib/utils';
import {
  TOKEN_STYLE,
  isLineStation,
  lineStations,
  initialRoute,
  loadLastRoute,
  nearestLineStation,
  plainName,
  saveLastRoute,
  tokenRim,
} from '@/lib/board';
import RoutePicker from './RoutePicker';
import ServiceAlerts from './ServiceAlerts';
import WeatherWidget from './WeatherWidget';
import VenueEvents from './VenueEvents';
import LineStrip, { LiveToken, TokenGlyph } from './LineStrip';
import ThemeToggle from './ThemeToggle';
import SampleDataNote, { SampleSource } from './SampleDataNote';
import { DepartureList, NextTrainHero } from './Departures';
import { upcomingServiceDates } from '@/lib/schedule-ui';

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
  const [liveTrains, setLiveTrains] = useState<LiveTrain[]>([]);

  const [isDefaultRoute, setIsDefaultRoute] = useState(false);

  // Route from the link first, then the remembered route, then the default
  // (the default is not written anywhere until the visitor picks a route).
  useEffect(() => {
    const route = initialRoute(readRouteFromUrl(), loadLastRoute());
    setOriginId(route.from);
    setDestinationId(route.to);
    setIsDefaultRoute(route.isDefault);
    if (!route.isDefault) writeRouteToUrl(route.from, route.to);
    setReady(true);
  }, []);

  const changeRoute = useCallback((from: string, to: string) => {
    setIsDefaultRoute(false);
    setOriginId(from);
    setDestinationId(to);
    saveLastRoute(from, to);
    writeRouteToUrl(from, to);
  }, []);

  const hasRoute = isLineStation(originId) && isLineStation(destinationId) && originId !== destinationId;

  // One train fetch feeds the countdown, departures and the hex strip.
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
        setLiveTrains(data.liveTrains || []);
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
  // Every train reporting a position on the line, named by the API from its
  // GTFS-RT trip_id (the same response that drives the cards).
  const tokens: LiveToken[] = liveTrains
    .map((t) => ({
      idx: nearestLineStation(t.latitude, t.longitude),
      label: t.trainNumber,
      direction: t.direction,
      mine: t.onRoute,
    }))
    .sort((a, b) => a.idx - b.idx || Number(b.mine) - Number(a.mine));

  const boardHref = (day?: string) => {
    const q = new URLSearchParams();
    if (hasRoute && !isDefaultRoute) {
      q.set('from', originId);
      q.set('to', destinationId);
    }
    if (day) q.set('day', day);
    const qs = q.toString();
    return `/board${qs ? `?${qs}` : ''}`;
  };

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
          <a className="icon-btn" href={boardHref()} aria-label="Full board: every train, every station" title="Full board">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </a>
          <ThemeToggle />
        </div>
      </header>

      {ready && (
        <RoutePicker
          originId={hasRoute ? originId : ''}
          destinationId={hasRoute ? destinationId : ''}
          onChange={changeRoute}
          forceOpen={!hasRoute}
          isDefault={isDefaultRoute}
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

            <a className="panel schedule-link" href={boardHref(upcomingServiceDates(now)[0])}>
              <span>
                <span className="label">Full schedule</span>
                <span className="schedule-link-t">Every train, every station</span>
              </span>
              <span className="schedule-link-sub">Today, tomorrow and the next 7 days &rarr;</span>
            </a>

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
                {(['Southbound', 'Northbound'] as const).map((dir) => (
                  <span key={dir}>
                    <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">
                      <TokenGlyph cx={dir === 'Southbound' ? 11 : 23} cy={11} r={8} direction={dir} horizontal mine={false} />
                    </svg>
                    {TOKEN_STYLE[dir].name}
                  </span>
                ))}
                <span>
                  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth={tokenRim(true)} />
                  </svg>
                  Heavy rim: on your route
                </span>
              </div>
              <p className="live-list">
                {tokens.length > 0
                  ? `Live now: ${tokens
                      .map(
                        (t) =>
                          `${t.label} ${t.direction === 'Southbound' ? 'south' : 'north'}bound near ${plainName(
                            lineStations[t.idx]
                          )}${t.mine ? ' (your route)' : ''}`
                      )
                      .join(' · ')}`
                  : liveFeed
                    ? 'No trains are reporting a position right now.'
                    : 'Live train positions are not available right now.'}
              </p>
            </section>

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
