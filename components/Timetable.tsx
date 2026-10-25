'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Train, TrainType } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import { statusOf } from '@/lib/board';
import { addDays, isoDate, pacificParts } from '@/lib/pacific-time';
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
// Caltrain's own schedules page (linked from caltrain.com's navigation).
const CALTRAIN_TIMETABLE_URL = 'https://www.caltrain.com/schedules/pdfs';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const TYPE_TAG: Record<TrainType, { tag: string; cls: string }> = {
  Local: { tag: 'L', cls: 'local' },
  Limited: { tag: 'LTD', cls: 'limited' },
  Express: { tag: 'EXP', cls: 'express' },
  'South County': { tag: 'SC', cls: 'south-county' },
};

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

function hourLabel(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Trains grouped by the Pacific clock hour they leave in, in order. */
function byHour(trains: Train[]): { hour: number; trains: Train[] }[] {
  const groups: { hour: number; trains: Train[] }[] = [];
  for (const t of trains) {
    const hour = pacificParts(new Date(t.departureTime)).hour;
    const last = groups[groups.length - 1];
    if (last && last.hour === hour) last.trains.push(t);
    else groups.push({ hour, trains: [t] });
  }
  return groups;
}

function minutesOf(iso: string): string {
  return `:${String(pacificParts(new Date(iso)).minute).padStart(2, '0')}`;
}

function TypeTag({ type }: { type: TrainType }) {
  const t = TYPE_TAG[type];
  return (
    <abbr className={`tt-tag ${t.cls}`} title={type}>
      {t.tag}
    </abbr>
  );
}

interface GridProps {
  trains: Train[];
  live: boolean;
  nextKey?: string;
  showType: boolean;
  showRide: boolean;
}

/** A printed-style timetable: one block per hour, departure minutes large. */
function HourGrid({ trains, live, nextKey, showType, showRide }: GridProps) {
  return (
    <ol className="tth">
      {byHour(trains).map((g) => (
        <li key={`${g.hour}-${g.trains[0].departureTime}`} className="tth-hour">
          <span className="tth-h">{hourLabel(g.hour)}</span>
          <ul className="tth-trains">
            {g.trains.map((t) => {
              const key = `${t.serviceDate}-${t.trainNumber}`;
              const isNext = key === nextKey;
              const st = live ? statusOf(t) : null;
              const notable = st && st.kind !== 'on' && st.kind !== 'sched';
              return (
                <li
                  key={key}
                  className={`tte${isNext ? ' is-next' : ''}${t.status === 'cancelled' ? ' is-cancelled' : ''}`}
                  aria-label={`${formatTime(t.departureTime)} to ${formatTime(t.arrivalTime)}, train ${t.trainNumber}, ${t.type}${
                    showRide ? `, ${t.duration} minute ride` : ''
                  }${notable ? `, ${st!.text}` : ''}${isNext ? ', next train' : ''}`}
                >
                  <span className="tte-dep" aria-hidden="true">
                    {minutesOf(t.departureTime)}
                  </span>
                  <span className="tte-arr" aria-hidden="true">
                    &rarr; {formatTime(t.arrivalTime).replace(' ', ' ')}
                  </span>
                  <span className="tte-meta" aria-hidden="true">
                    {showType && <TypeTag type={t.type} />}
                    <span className="tte-num">{t.trainNumber}</span>
                      {isNext && <span className="tte-next">Next</span>}
                    {showRide && <span className="tte-ride">{t.duration}m</span>}
                    {notable && (
                      <span className={`tte-st ${st!.kind}`}>
                        {st!.kind === 'late' || st!.kind === 'verylate' ? `+${t.delay}` : st!.text}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function Summary({ trains, live }: { trains: Train[]; live: boolean }) {
  const types = new Set(trains.map((t) => t.type));
  const rides = new Set(trains.map((t) => t.duration));
  const parts: string[] = [];
  if (types.size === 1) parts.push(`All trains: ${[...types][0]}`);
  if (rides.size === 1) parts.push(`${[...rides][0]}-minute ride`);
  if (!live) parts.push('Timetable · no live data');
  return (
    <>
      {parts.length > 0 && <p className="tt-sum">{parts.join(' · ')}</p>}
      {types.size > 1 && (
        <p className="tt-legend">
          {(Object.keys(TYPE_TAG) as TrainType[])
            .filter((t) => types.has(t))
            .map((t) => (
              <span key={t}>
                <TypeTag type={t} /> {t}
              </span>
            ))}
        </p>
      )}
    </>
  );
}

function Block({ trains, live, nextKey }: { trains: Train[]; live: boolean; nextKey?: string }) {
  const showType = new Set(trains.map((t) => t.type)).size > 1;
  const showRide = new Set(trains.map((t) => t.duration)).size > 1;
  return (
    <>
      <Summary trains={trains} live={live} />
      <HourGrid trains={trains} live={live} nextKey={nextKey} showType={showType} showRide={showRide} />
    </>
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
  const expanded = open;
  const bodyId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const data = isToday ? today : other[date];
  const info = isToday ? today?.info : data && data !== 'error' ? data.info : undefined;

  const remaining = today?.remaining ?? [];
  const nextTrain = remaining.find(
    (t) => t.status !== 'cancelled' && new Date(t.departureTime).getTime() >= now - 60000,
  );
  const nextKey = nextTrain ? `${nextTrain.serviceDate}-${nextTrain.trainNumber}` : undefined;

  const setOpenSaved = (v: boolean) => {
    writeOpen(v);
    setOpen(v);
  };
  const pickDay = (i: number) => {
    setDay(i);
    if (i > 0) setOpenSaved(true); // another day: show its timetable
  };
  const collapseFromBottom = () => {
    setOpenSaved(false);
    requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  const count = isToday ? remaining.length : data && data !== 'error' && 'trains' in data ? data.trains.length : null;
  const showLabel =
    count == null
      ? 'Show timetable'
      : isToday
        ? count > 0
          ? `Show all ${count} remaining ${count === 1 ? 'train' : 'trains'}`
          : 'Show timetable'
        : `Show all ${count} ${count === 1 ? 'train' : 'trains'}`;
  const chevron = (up: boolean) => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d={up ? 'M2 8l4-4 4 4' : 'M2 4l4 4 4-4'} stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );

  return (
    <section className="panel ttbox" aria-labelledby="timetable-h" ref={sectionRef}>
      <div className="tt-head">
        <h2 className="rule-h" id="timetable-h" style={{ margin: 0 }}>
          Timetable
        </h2>
        <button
          type="button"
          className="btn tt-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpenSaved(!open)}
        >
          {open ? 'Hide timetable' : showLabel} {chevron(open)}
        </button>
      </div>

      <div className="seg" role="group" aria-label="Choose a day">
        <button type="button" className="seg-btn" aria-pressed={day === 0} onClick={() => pickDay(0)}>
          Today
        </button>
        <button type="button" className="seg-btn" aria-pressed={day === 1} onClick={() => pickDay(1)}>
          Tomorrow
        </button>
        <label className={`seg-sel${day >= 2 ? ' on' : ''}`}>
          <span className="sr-only">Another day</span>
          <select
            value={day >= 2 ? String(day) : ''}
            onChange={(e) => e.target.value && pickDay(Number(e.target.value))}
          >
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

      <p className="tt-sched">
        <strong>{day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : 'On'}</strong>
        {info ? <span>{dayLabel(info.date)}</span> : null}
        {info ? <span>{info.label}</span> : null}
        {info?.exception ? <span className="tt-exc">{info.exception}</span> : null}
      </p>

      <div id={bodyId} hidden={!expanded}>
        {expanded &&
          (data === undefined || data === null ? (
            <div className="skeleton" style={{ height: 120 }} aria-label="Loading timetable" />
          ) : data === 'error' ? (
            <p className="hint">The timetable for this day could not be loaded.</p>
          ) : info?.beyondFeed ? (
            <p className="hint">The timetable for {dayLabel(date)} isn’t published yet.</p>
          ) : isToday ? (
            remaining.length > 0 ? (
              <Block trains={remaining} live nextKey={nextKey} />
            ) : (
              <div>
                <p className="tt-none">No more trains today.</p>
                {today && today.nextDay.trains.length > 0 && (
                  <>
                    <p className="tt-sched">
                      <strong>{today.nextDay.info.weekdayName}’s first trains</strong>
                    </p>
                    <Block trains={today.nextDay.trains} live={false} />
                  </>
                )}
              </div>
            )
          ) : 'trains' in data && data.trains.length > 0 ? (
            <Block trains={data.trains} live={false} />
          ) : (
            <p className="hint">No trains run between these stations on {dayLabel(date)}.</p>
          ))}
        {expanded && (
          <button
            type="button"
            className="btn tt-hide-bottom"
            aria-controls={bodyId}
            aria-expanded
            onClick={collapseFromBottom}
          >
            Hide timetable {chevron(true)}
          </button>
        )}
      </div>

      <p className="tt-links">
        {boardHref && <a href={boardHref(date)}>Full board: every train, every station &rarr;</a>}
        <a href={CALTRAIN_TIMETABLE_URL} target="_blank" rel="noopener">
          Full Caltrain timetable <span aria-hidden="true">&#8599;</span>
          <span className="sr-only"> (caltrain.com, opens in a new tab)</span>
        </a>
      </p>
    </section>
  );
}
