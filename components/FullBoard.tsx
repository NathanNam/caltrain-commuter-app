'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { stations } from '@/lib/stations';
import { TrainType } from '@/lib/types';
import { isLineStation, plainName } from '@/lib/board';
import { parseIsoDate } from '@/lib/service-day';
import ThemeToggle from './ThemeToggle';
import { CALTRAIN_TIMETABLE_URL, TYPE_TAG, dayLabel, upcomingServiceDates } from '@/lib/schedule-ui';

type Cell = number | 'pass' | null;
interface BoardTrain {
  number: string;
  type: TrainType;
  cells: Cell[];
  firstSecs: number;
}
interface BoardData {
  info: { date: string; weekdayName: string; label: string; exception: string | null; beyondFeed: boolean };
  dayStartMs: number;
  stationIds: string[];
  southbound: BoardTrain[];
  northbound: BoardTrain[];
}
type Dir = 'southbound' | 'northbound';

/** "5:43" with PM in bold, like printed timetables. */
function Time({ secs }: { secs: number }) {
  const h = Math.floor(secs / 3600) % 24;
  const m = Math.floor((secs % 3600) / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const text = `${h12}:${String(m).padStart(2, '0')}`;
  return h >= 12 ? (
    <b>
      {text}
      <span className="sr-only"> PM</span>
    </b>
  ) : (
    <>
      {text}
      <span className="sr-only"> AM</span>
    </>
  );
}

function readParams() {
  try {
    const p = new URLSearchParams(window.location.search);
    return { from: p.get('from'), to: p.get('to'), day: p.get('day'), dir: p.get('dir') };
  } catch {
    return { from: null, to: null, day: null, dir: null };
  }
}

/** The whole line's timetable for a day: stations down the side, trains across. */
export default function FullBoard() {
  const [now, setNow] = useState(() => Date.now());
  const dates = useMemo(() => upcomingServiceDates(now), [now]);
  const [day, setDay] = useState(0);
  const [dir, setDir] = useState<Dir>('southbound');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [boards, setBoards] = useState<Record<string, BoardData | 'error'>>({});
  const scroller = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // Route, day and direction from the link.
  useEffect(() => {
    const p = readParams();
    const f = isLineStation(p.from) ? p.from : null;
    const t = isLineStation(p.to) ? p.to : null;
    setFrom(f);
    setTo(t);
    const idx = p.day && parseIsoDate(p.day) ? dates.indexOf(p.day) : -1;
    if (idx >= 0) setDay(idx);
    if (p.dir === 'northbound' || p.dir === 'southbound') setDir(p.dir);
    else if (f && t) setDir(stations.findIndex((s) => s.id === f) > stations.findIndex((s) => s.id === t) ? 'northbound' : 'southbound');
    setReady(true);
    // dates only matters on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const date = dates[day];

  // Keep the view in the URL so it can be shared.
  useEffect(() => {
    if (!ready) return;
    try {
      const url = new URL(window.location.href);
      if (from) url.searchParams.set('from', from);
      if (to) url.searchParams.set('to', to);
      url.searchParams.set('day', date);
      url.searchParams.set('dir', dir);
      window.history.replaceState(null, '', url.toString());
    } catch {
      // ignore
    }
  }, [ready, from, to, date, dir]);

  useEffect(() => {
    if (boards[date]) return;
    let cancelled = false;
    fetch(`/api/board?date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b) => !cancelled && setBoards((o) => ({ ...o, [date]: b })))
      .catch(() => !cancelled && setBoards((o) => ({ ...o, [date]: 'error' })));
    return () => {
      cancelled = true;
    };
  }, [date, boards]);

  const board = boards[date];
  const data = board && board !== 'error' ? board : null;
  const isToday = day === 0;

  // Stations in travel order for the chosen direction.
  const order = useMemo(() => {
    const idx = stations.map((_, i) => i);
    return dir === 'southbound' ? idx : idx.reverse();
  }, [dir]);
  const trains = data ? data[dir] : [];
  const nowSecs = data ? (now - data.dayStartMs) / 1000 : 0;
  const fromIdx = stations.findIndex((s) => s.id === from);
  const toIdx = stations.findIndex((s) => s.id === to);

  const lastSecs = (t: BoardTrain) => Math.max(...t.cells.filter((c): c is number => typeof c === 'number'));
  const refSecs = (t: BoardTrain) => {
    const c = fromIdx >= 0 ? t.cells[fromIdx] : null;
    return typeof c === 'number' ? c : t.firstSecs;
  };
  const nextNumber = isToday ? trains.find((t) => refSecs(t) >= nowSecs)?.number : undefined;

  const jumpToNow = () => {
    const el = scroller.current?.querySelector<HTMLElement>('th.is-next');
    if (el && scroller.current) {
      // Align the next train's column with the edge of the sticky station column.
      const corner = scroller.current.querySelector<HTMLElement>('th.fb-corner');
      scroller.current.scrollTo({ left: el.offsetLeft - (corner?.offsetWidth ?? 0), behavior: 'smooth' });
    }
  };
  // Start Today scrolled to the next train.
  useEffect(() => {
    if (isToday && data) requestAnimationFrame(jumpToNow);
    else if (scroller.current) scroller.current.scrollLeft = 0;
  }, [isToday, data, dir]);

  const backHref = from && to ? `/?from=${from}&to=${to}` : '/';

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="ct-token" aria-hidden="true">
          CT
        </div>
        <div style={{ minWidth: 0 }}>
          <h1>Full board</h1>
          <div className="asof">Every train, every station &middot; times in Pacific</div>
        </div>
        <div className="masthead-tools">
          <a className="btn" href={backHref}>
            &larr; My trip
          </a>
          <ThemeToggle />
        </div>
      </header>

      <div className="fb-controls">
        <div className="seg" role="group" aria-label="Direction">
          <button type="button" className="seg-btn" aria-pressed={dir === 'southbound'} onClick={() => setDir('southbound')}>
            Southbound
          </button>
          <button type="button" className="seg-btn" aria-pressed={dir === 'northbound'} onClick={() => setDir('northbound')}>
            Northbound
          </button>
        </div>
        <div className="seg" role="group" aria-label="Choose a day">
          <button type="button" className="seg-btn" aria-pressed={day === 0} onClick={() => setDay(0)}>
            Today
          </button>
          <button type="button" className="seg-btn" aria-pressed={day === 1} onClick={() => setDay(1)}>
            Tomorrow
          </button>
          <label className={`seg-sel${day >= 2 ? ' on' : ''}`}>
            <span className="sr-only">Another day</span>
            <select value={day >= 2 ? String(day) : ''} onChange={(e) => e.target.value && setDay(Number(e.target.value))}>
              <option value="">{day >= 2 ? dayLabel(date) : 'Later…'}</option>
              {dates.slice(2).map((d, i) => (
                <option key={d} value={i + 2}>
                  {dayLabel(d)}
                </option>
              ))}
            </select>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </label>
        </div>
      </div>

      <p className="tt-sched fb-info">
        <strong>{isToday ? 'Today' : day === 1 ? 'Tomorrow' : 'On'}</strong>
        <span>{dayLabel(date)}</span>
        {data && <span>{data.info.label}</span>}
        {data?.info.exception && <span className="tt-exc">{data.info.exception}</span>}
        {data && <span>{trains.length} trains</span>}
        <a className="fb-official" href={CALTRAIN_TIMETABLE_URL} target="_blank" rel="noopener">
          Full Caltrain timetable <span aria-hidden="true">&#8599;</span>
          <span className="sr-only"> (caltrain.com, opens in a new tab)</span>
        </a>
        {isToday && nextNumber && (
          <button type="button" className="btn fb-now" onClick={jumpToNow}>
            Jump to now
          </button>
        )}
      </p>
      <p className="tt-legend fb-legend">
        <span>
          <b>PM</b> times in bold
        </span>
        <span>&darr; passes without stopping</span>
        {(Object.keys(TYPE_TAG) as TrainType[]).map((t) => (
          <span key={t}>
            <abbr className={`tt-tag ${TYPE_TAG[t].cls}`} title={t}>
              {TYPE_TAG[t].tag}
            </abbr>{' '}
            {t}
          </span>
        ))}
      </p>

      {!board ? (
        <div className="skeleton" style={{ height: 320 }} aria-label="Loading the board" />
      ) : board === 'error' ? (
        <p className="hint">The board for this day could not be loaded.</p>
      ) : data!.info.beyondFeed ? (
        <p className="hint">The timetable for {dayLabel(date)} isn’t published yet.</p>
      ) : trains.length === 0 ? (
        <p className="hint">No {dir} trains on {dayLabel(date)}.</p>
      ) : (
        <div className="fb-scroll" ref={scroller} tabIndex={0} aria-label={`${dir === 'southbound' ? 'Southbound' : 'Northbound'} timetable, scrolls sideways`}>
          <table className="fb" aria-label={`${dir === 'southbound' ? 'Southbound' : 'Northbound'} trains, ${dayLabel(date)}`}>
            <thead>
              <tr>
                <th scope="col" className="fb-corner">
                  Train
                </th>
                {trains.map((t) => (
                  <th
                    key={t.number}
                    scope="col"
                    className={`fb-train ${TYPE_TAG[t.type].cls}${t.number === nextNumber ? ' is-next' : ''}${
                      isToday && refSecs(t) < nowSecs ? ' is-past' : ''
                    }`}
                  >
                    <span className="fb-num">{t.number}</span>
                    <abbr className={`tt-tag ${TYPE_TAG[t.type].cls}`} title={t.type}>
                      {TYPE_TAG[t.type].tag}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.map((si) => {
                const st = stations[si];
                const mark = si === fromIdx ? 'from' : si === toIdx ? 'to' : null;
                return (
                  <tr key={st.id} className={mark ? `is-${mark}` : undefined}>
                    <th scope="row">
                      {mark && <span className="fb-mark">{mark === 'from' ? 'From' : 'To'}</span>}
                      {plainName(st)}
                    </th>
                    {trains.map((t) => {
                      const c = t.cells[si];
                      // Dim what has already happened: a stop time in the past, or a
                      // pass marker on a train that has finished its run.
                      const past =
                        isToday && (typeof c === 'number' ? c < nowSecs : c === 'pass' && lastSecs(t) < nowSecs);
                      const cls = `${t.number === nextNumber ? 'is-next' : ''}${past ? ' is-past' : ''}`;
                      return (
                        <td key={t.number} className={cls || undefined}>
                          {c === 'pass' ? (
                            <span className="fb-pass" aria-label="passes">
                              &darr;
                            </span>
                          ) : typeof c === 'number' ? (
                            <Time secs={c} />
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="foot">
        Built from Caltrain&rsquo;s GTFS timetable (via 511.org); static schedule, no live data.{' '}
        <a href={CALTRAIN_TIMETABLE_URL} target="_blank" rel="noopener">
          Official Caltrain timetables <span aria-hidden="true">&#8599;</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </footer>
    </div>
  );
}
