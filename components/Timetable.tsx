'use client';

import { useEffect, useMemo, useState } from 'react';
import { Train, TrainType } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import { statusOf } from '@/lib/board';
import { addDays, isoDate } from '@/lib/pacific-time';
import { currentServiceDate, WEEKDAY_NAMES } from '@/lib/service-day';

export interface ServiceDayInfo {
  date: string;
  weekdayName: string;
  label: string;
  exception: string | null;
  beyondFeed: boolean;
}

export interface TodayData {
  info: ServiceDayInfo;
  remaining: Train[];
  nextDay: { info: ServiceDayInfo; trains: Train[] };
}

interface TimetableProps {
  originId: string;
  destinationId: string;
  today: TodayData | null;
  now: number;
  /** Builds the link to the full board for a date. */
  boardHref?: (date: string) => string;
}

const OPEN_KEY = 'caltrain_timetable_open';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_TYPE: Record<TrainType, string> = { Local: 'Local', Limited: 'Ltd', Express: 'Exp', 'South County': 'S. Cty' };

/** "Sat 31 Oct" for a YYYY-MM-DD date. */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAY_NAMES[wd].slice(0, 3)} ${d} ${MONTHS[m - 1]}`;
}

/** Service dates from today: [today, tomorrow, +2 … +7]. */
export function upcomingServiceDates(now: number): string[] {
  const t = currentServiceDate(new Date(now));
  return Array.from({ length: 8 }, (_, i) => {
    const d = addDays(t.year, t.month, t.day, i);
    return isoDate(d.year, d.month, d.day);
  });
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // storage blocked: the choice lasts for this visit
  }
}

function TypeCell({ type }: { type: TrainType }) {
  return (
    <span className={`charter tt-type ${type.toLowerCase().replace(' ', '-')}`} title={type}>
      <i aria-hidden="true" />
      <span aria-hidden="true">{SHORT_TYPE[type]}</span>
      <span className="sr-only">{type}</span>
    </span>
  );
}

function StatusCell({ train }: { train: Train }) {
  const { kind, text } = statusOf(train);
  const short = kind === 'late' || kind === 'verylate' ? text.replace(' min late', ' late') : text;
  return <span className={`tt-status ${kind}`}>{short}</span>;
}

function Rows({ trains, nextKey }: { trains: Train[]; nextKey?: string }) {
  return (
    <table className="tt">
      <thead>
        <tr>
          <th scope="col">Departs</th>
          <th scope="col">Arrives</th>
          <th scope="col">Train</th>
          <th scope="col">Type</th>
          <th scope="col">Ride</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {trains.map((t) => {
          const key = `${t.serviceDate}-${t.trainNumber}`;
          const isNext = key === nextKey;
          return (
            <tr key={key} className={`${isNext ? 'is-next' : ''}${t.status === 'cancelled' ? ' is-cancelled' : ''}`}>
              <td>
                {formatTime(t.departureTime)}
                {isNext && <span className="sr-only"> (next train)</span>}
              </td>
              <td>{formatTime(t.arrivalTime)}</td>
              <td>{t.trainNumber}</td>
              <td>
                <TypeCell type={t.type} />
              </td>
              <td>{t.duration}m</td>
              <td>
                <StatusCell train={t} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** "Rest of today" plus any of the next 7 days, as a printed-style timetable. */
export default function Timetable({ originId, destinationId, today, now, boardHref }: TimetableProps) {
  const dates = useMemo(() => upcomingServiceDates(now), [now]);
  const [day, setDay] = useState(0); // index into dates
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState<Record<string, { info: ServiceDayInfo; trains: Train[] } | 'error'>>({});

  useEffect(() => setOpen(readOpen()), []);

  // Clear cached days when the route changes.
  useEffect(() => setOther({}), [originId, destinationId]);

  const date = dates[day];
  useEffect(() => {
    if (day === 0 || other[date]) return;
    let cancelled = false;
    fetch(`/api/timetable?origin=${originId}&destination=${destinationId}&date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body) => !cancelled && setOther((o) => ({ ...o, [date]: body })))
      .catch(() => !cancelled && setOther((o) => ({ ...o, [date]: 'error' })));
    return () => {
      cancelled = true;
    };
  }, [day, date, originId, destinationId, other]);

  const isToday = day === 0;
  const expanded = isToday ? open : true;
  const data = isToday ? today : other[date];
  const info = isToday ? today?.info : data && data !== 'error' ? data.info : undefined;

  const remaining = today?.remaining ?? [];
  const nextTrain = remaining.find((t) => t.status !== 'cancelled' && new Date(t.departureTime).getTime() >= now - 60000);
  const nextKey = nextTrain ? `${nextTrain.serviceDate}-${nextTrain.trainNumber}` : undefined;

  const toggle = () => {
    writeOpen(!open);
    setOpen(!open);
  };

  return (
    <section className="panel ttbox" aria-labelledby="timetable-h">
      <div className="tt-head">
        <h2 className="rule-h" id="timetable-h" style={{ margin: 0, flex: 1 }}>
          Timetable
        </h2>
      </div>

      <div className="tt-days" role="group" aria-label="Choose a day">
        <button type="button" className={`tt-day${day === 0 ? ' on' : ''}`} aria-pressed={day === 0} onClick={() => setDay(0)}>
          Today
        </button>
        <button type="button" className={`tt-day${day === 1 ? ' on' : ''}`} aria-pressed={day === 1} onClick={() => setDay(1)}>
          Tomorrow
        </button>
        <label className="tt-more">
          <span className="sr-only">Another day</span>
          <select value={day >= 2 ? String(day) : ''} onChange={(e) => e.target.value && setDay(Number(e.target.value))}>
            <option value="">Later…</option>
            {dates.slice(2).map((d, i) => (
              <option key={d} value={i + 2}>
                {dayLabel(d)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="tt-sched">
        <strong>{isToday ? 'Today' : day === 1 ? 'Tomorrow' : dayLabel(date)}</strong>
        {info ? `${day < 2 ? ` · ${dayLabel(info.date)}` : ''} · ${info.label}` : ''}
        {info?.exception ? <span className="tt-exc">{info.exception}</span> : null}
      </p>

      {isToday && (
        <button type="button" className="btn tt-toggle" aria-expanded={open} onClick={toggle}>
          {open
            ? 'Hide the timetable'
            : remaining.length > 0
              ? `Show all ${remaining.length} remaining ${remaining.length === 1 ? 'train' : 'trains'} today`
              : 'Show today’s timetable'}
        </button>
      )}

      {expanded &&
        (data === undefined || data === null ? (
          <div className="skeleton" style={{ height: 120 }} aria-label="Loading timetable" />
        ) : data === 'error' ? (
          <p className="hint">The timetable for this day could not be loaded.</p>
        ) : info?.beyondFeed ? (
          <p className="hint">The timetable for {dayLabel(date)} isn’t published yet.</p>
        ) : isToday ? (
          remaining.length > 0 ? (
            <Rows trains={remaining} nextKey={nextKey} />
          ) : (
            <div>
              <p className="tt-none">No more trains today.</p>
              {today && today.nextDay.trains.length > 0 && (
                <>
                  <p className="tt-sched">{today.nextDay.info.weekdayName}’s first trains</p>
                  <Rows trains={today.nextDay.trains} />
                </>
              )}
            </div>
          )
        ) : 'trains' in data && data.trains.length > 0 ? (
          <Rows trains={data.trains} />
        ) : (
          <p className="hint">No trains run between these stations on {dayLabel(date)}.</p>
        ))}

      {boardHref && (
        <p className="tt-links">
          <a href={boardHref(date)}>Full board: every train, every station &rarr;</a>
        </p>
      )}
    </section>
  );
}
