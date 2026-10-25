'use client';

import { useEffect, useRef } from 'react';
import { CITY_IDS, lineStations, plainName, shortName } from '@/lib/board';

interface LineStripProps {
  originIdx: number;
  destIdx: number;
  /** Ride minutes for the next train, shown in the destination circle. */
  tripMinutes?: number;
  /**
   * Live train tokens: every train reporting a position on the line (index in
   * lineStations of the nearest stop, its real train number and direction).
   */
  tokens: LiveToken[];
}

export interface LiveToken {
  idx: number;
  label: string;
  direction: 'Northbound' | 'Southbound';
  /** One of the listed departures for the chosen route. */
  mine: boolean;
}

const S3 = Math.sqrt(3);

type Pt = { x: number; y: number };

function hexPoints(c: Pt, r: number, pointy: boolean): string {
  const pts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k + (pointy ? 30 : 0));
    pts.push(`${(c.x + r * Math.cos(a)).toFixed(1)},${(c.y + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/**
 * The line drawn as a strip of hex tiles in the spirit of an 1830 map
 * (original drawing): green tiles for your trip, yellow for the rest of the
 * line, cities as white circles, towns as dots, live trains as tokens
 * (red southbound, blue northbound, each with a pointer in its direction).
 * Vertical on wide screens, horizontal (scrollable) on phones.
 */
export default function LineStrip({ originIdx, destIdx, tripMinutes, tokens }: LineStripProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const lo = Math.min(originIdx, destIdx);
  const hi = Math.max(originIdx, destIdx);

  // On phones, scroll the strip so the start of the trip is in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const R = 40;
    const x = 30 + lo * ((S3 * R) / 2);
    el.scrollLeft = Math.max(0, x - 40);
  }, [lo]);

  const origin = lineStations[originIdx];
  const dest = lineStations[destIdx];
  const stops = hi - lo;
  const tokenText = tokens
    .map((t) => ` Train ${t.label}, ${t.direction.toLowerCase()}, is near ${plainName(lineStations[t.idx])}.`)
    .join('');
  const aria = `Line map: your trip from ${plainName(origin)} to ${plainName(dest)}, ${stops} stops down the line${
    tripMinutes ? `, ${tripMinutes} minutes on the next train` : ''
  }.${tokenText}`;

  return (
    <div>
      <div className="strip-h" ref={scroller}>
        <Strip horizontal lo={lo} hi={hi} originIdx={originIdx} destIdx={destIdx} tripMinutes={tripMinutes} tokens={tokens} aria={aria} />
      </div>
      <div className="strip-v">
        <Strip horizontal={false} lo={lo} hi={hi} originIdx={originIdx} destIdx={destIdx} tripMinutes={tripMinutes} tokens={tokens} aria={aria} />
      </div>
    </div>
  );
}

interface StripProps extends LineStripProps {
  horizontal: boolean;
  lo: number;
  hi: number;
  aria: string;
}

function Strip({ horizontal, lo, hi, originIdx, destIdx, tripMinutes, tokens, aria }: StripProps) {
  const R = horizontal ? 40 : 25;
  const pts: Pt[] = lineStations.map((_, i) => {
    const zig = i % 2;
    return horizontal
      ? { x: 30 + i * ((S3 * R) / 2) + (S3 * R) / 2, y: 34 + zig * 1.5 * R + R }
      : { x: 190 + zig * 1.5 * R, y: 30 + i * ((S3 * R) / 2) + R };
  });
  const last = pts[pts.length - 1];
  const W = horizontal ? Math.round(last.x + 60) : 600;
  const H = horizontal ? 200 : Math.round(last.y + 50);

  const faint: Pt[] = [];
  pts.forEach((p, i) => {
    const off = horizontal
      ? [[0, -3 * R], [0, 3 * R]]
      : [[-3 * R, 0], [3 * R, 0], [4.5 * R, (i % 2 ? -1 : 1) * ((S3 * R) / 2)]];
    off.forEach(([dx, dy]) => faint.push({ x: p.x + dx, y: p.y + dy }));
  });

  const circleMinutes = (i: number): string | null => {
    if (i === originIdx) return '0';
    if (i === destIdx && tripMinutes != null) return String(tripMinutes);
    return null;
  };

  return (
    <svg
      role="img"
      aria-label={aria}
      viewBox={`0 0 ${W} ${H}`}
      width={horizontal ? W : undefined}
      height={horizontal ? H : undefined}
    >
      {faint.map((c, k) => (
        <polygon key={`f${k}`} points={hexPoints(c, R, horizontal)} className="hx-faint" />
      ))}
      {pts.map((p, i) => (
        <polygon
          key={`h${i}`}
          points={hexPoints(p, R, horizontal)}
          className={i >= lo && i <= hi ? 'hx-trip' : 'hx-rest'}
        />
      ))}
      {pts.map((p, i) =>
        [i - 1, i + 1]
          .filter((j) => j >= 0 && j < pts.length)
          .map((j) => {
            const q = pts[j];
            return (
              <line key={`t${i}-${j}`} x1={p.x} y1={p.y} x2={(p.x + q.x) / 2} y2={(p.y + q.y) / 2} className="trk" />
            );
          })
      )}
      {pts.map((p, i) => {
        const st = lineStations[i];
        const isEnd = i === originIdx || i === destIdx;
        const city = CITY_IDS.has(st.id) || isEnd;
        const mins = circleMinutes(i);
        const name = horizontal ? shortName(st) : plainName(st);
        const above = i % 2 === 0;
        const left = i % 2 === 0;
        return (
          <g key={`s${i}`}>
            {city ? (
              <>
                <circle cx={p.x} cy={p.y} r={11} className="city" />
                {mins && (
                  <text x={p.x} y={p.y + 3.5} textAnchor="middle" className="city-n">
                    {mins}
                  </text>
                )}
              </>
            ) : (
              <circle cx={p.x} cy={p.y} r={5} className="town" />
            )}
            {horizontal ? (
              <text
                x={p.x}
                y={above ? p.y - R - 8 : p.y + R + 16}
                textAnchor="middle"
                className={`stn stn-h${isEnd ? ' end' : ''}`}
              >
                {name}
              </text>
            ) : (
              <text
                x={left ? p.x - R - 10 : p.x + R + 10}
                y={p.y + 4}
                textAnchor={left ? 'end' : 'start'}
                className={`stn${isEnd ? ' end' : ''}`}
              >
                {name}
              </text>
            )}
          </g>
        );
      })}
      {(
        [
          [originIdx, 'FROM'],
          [destIdx, 'TO'],
        ] as const
      ).map(([i, l]) => {
        const p = pts[i];
        const y = horizontal ? p.y + (i % 2 ? -R - 24 : R + 22) : p.y + 15;
        return (
          <g key={l} aria-hidden="true">
            <rect x={p.x - 17} y={y} width={34} height={14} rx={2} className="end-tag" />
            <text x={p.x} y={y + 10} textAnchor="middle" className="end-tag-t">
              {l}
            </text>
          </g>
        );
      })}
      {tokens.map((t, k) => {
        const p = pts[t.idx];
        if (!p) return null;
        // Several trains near one stop: fan their tokens out, away from the
        // station label, so every train number stays readable.
        const rank = tokens.slice(0, k).filter((o) => o.idx === t.idx).length;
        const side = t.idx % 2 === 0 ? 1 : -1;
        const cx = horizontal ? p.x + rank * 30 * side : p.x + side * (24 + rank * 30);
        const cy = horizontal ? p.y + side * 26 : p.y;
        const south = t.direction === 'Southbound';
        // Pointer in the direction of travel: down the page (vertical strip)
        // or to the right (horizontal strip) is southbound.
        const d = south ? 1 : -1;
        const tip = horizontal
          ? `${cx + d * 21},${cy} ${cx + d * 9},${cy - 8} ${cx + d * 9},${cy + 8}`
          : `${cx},${cy + d * 21} ${cx - 8},${cy + d * 9} ${cx + 8},${cy + d * 9}`;
        return (
          <g key={`tok-${t.label}`} aria-hidden="true">
            <polygon points={tip} className={`train-tip ${south ? 'sb' : 'nb'}`} />
            <circle cx={cx} cy={cy} r={12} className={`train-tok ${south ? 'sb' : 'nb'}${t.mine ? ' mine' : ''}`} />
            <text x={cx} y={cy + 3.5} textAnchor="middle" className="train-tok-t">
              {t.label.slice(0, 4)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
