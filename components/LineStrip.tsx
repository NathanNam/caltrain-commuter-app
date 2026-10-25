'use client';

import { useId, useState } from 'react';
import { CITY_IDS, Direction, TOKEN_STYLE, lineStations, placeTokens, plainName, tokenPointer, tokenRim } from '@/lib/board';

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

export type { LiveToken } from '@/lib/board';
import type { LiveToken } from '@/lib/board';

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
 * Vertical everywhere: the full line on wide screens; on phones your trip plus
 * a few stations each side, with a toggle for the whole line.
 */
export default function LineStrip({ originIdx, destIdx, tripMinutes, tokens }: LineStripProps) {
  const lo = Math.min(originIdx, destIdx);
  const hi = Math.max(originIdx, destIdx);
  const [whole, setWhole] = useState(false);
  const panelId = useId();

  const origin = lineStations[originIdx];
  const dest = lineStations[destIdx];
  const stops = hi - lo;
  const tokenText = tokens
    .map((t) => ` Train ${t.label}, ${t.direction.toLowerCase()}, is near ${plainName(lineStations[t.idx])}.`)
    .join('');
  const aria = `Line map: your trip from ${plainName(origin)} to ${plainName(dest)}, ${stops} stops down the line${
    tripMinutes ? `, ${tripMinutes} minutes on the next train` : ''
  }.${tokenText}`;

  // Phones: your trip plus a few stations each side, unless the whole line is open.
  const first = whole ? 0 : Math.max(0, lo - PHONE_CONTEXT);
  const last = whole ? lineStations.length - 1 : Math.min(lineStations.length - 1, hi + PHONE_CONTEXT);
  const hidden = tokens.filter((t) => t.idx < first || t.idx > last).length;

  return (
    <div>
      <div className="strip-phone">
        <PhoneStrip
          first={first}
          last={last}
          lo={lo}
          hi={hi}
          originIdx={originIdx}
          destIdx={destIdx}
          tripMinutes={tripMinutes}
          tokens={tokens}
          aria={aria}
          id={panelId}
        />
        <div className="strip-phone-ctl">
          {hidden > 0 && (
            <button type="button" className="link-btn" aria-controls={panelId} aria-expanded={whole} onClick={() => setWhole(true)}>
              +{hidden} more {hidden === 1 ? 'train' : 'trains'} on the line
            </button>
          )}
          <button type="button" className="btn strip-toggle" aria-controls={panelId} aria-expanded={whole} onClick={() => setWhole(!whole)}>
            {whole ? 'Show my trip' : 'Show whole line'}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d={whole ? 'M2 8l4-4 4 4' : 'M2 4l4 4 4-4'} stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </button>
        </div>
      </div>
      <div className="strip-v">
        <Strip lo={lo} hi={hi} originIdx={originIdx} destIdx={destIdx} tripMinutes={tripMinutes} tokens={tokens} aria={aria} />
      </div>
    </div>
  );
}

/** Stations shown on each side of the trip on phones before "Show whole line". */
const PHONE_CONTEXT = 2;

interface PhoneStripProps extends LineStripProps {
  first: number;
  last: number;
  lo: number;
  hi: number;
  aria: string;
  id: string;
}

/**
 * Phone layout: vertical, names right-aligned on the left of the hexes, live
 * trains in a lane to the right of the track (southbound first, then
 * northbound, fanned out), so tokens never cover a station circle.
 */
function PhoneStrip({ first, last, lo, hi, originIdx, destIdx, tripMinutes, tokens, aria, id }: PhoneStripProps) {
  const R = 22;
  const STEP = (S3 * R) / 2;
  const COL = 168; // centre of the left hex column
  const LABEL_END = COL - R - 8;
  const LANE = COL + 1.5 * R + R + 18; // first token centre, right of the hexes
  const TOP = 14;
  const rows = last - first + 1;
  const pts = new Map<number, Pt>();
  for (let i = first; i <= last; i++) pts.set(i, { x: COL + (i % 2) * 1.5 * R, y: TOP + (i - first) * STEP + R });
  const W = 360;
  const H = Math.round(TOP + (rows - 1) * STEP + 2 * R + 14);

  const circleMinutes = (i: number): string | null => {
    if (i === originIdx) return '0';
    if (i === destIdx && tripMinutes != null) return String(tripMinutes);
    return null;
  };
  const shown = placeTokens(
    tokens.filter((t) => t.idx >= first && t.idx <= last),
    (t) => pts.get(t.idx)!.y,
    LANE
  );

  return (
    <svg id={id} role="img" aria-label={aria} viewBox={`0 0 ${W} ${H}`} className="strip-phone-svg">
      {[...pts].map(([i, p]) => (
        <polygon key={`h${i}`} points={hexPoints(p, R, false)} className={i >= lo && i <= hi ? 'hx-trip' : 'hx-rest'} />
      ))}
      {[...pts].map(([i, p]) =>
        [i - 1, i + 1].map((j) => {
          const q = pts.get(j) ?? (j >= 0 && j < lineStations.length ? { x: COL + (j % 2) * 1.5 * R, y: p.y + (j - i) * STEP } : null);
          if (!q) return null;
          const off = !pts.has(j);
          return (
            <line
              key={`t${i}-${j}`}
              x1={p.x}
              y1={p.y}
              x2={(p.x + q.x) / 2}
              y2={(p.y + q.y) / 2}
              className={off ? 'trk trk-more' : 'trk'}
            />
          );
        })
      )}
      {[...pts].map(([i, p]) => {
        const st = lineStations[i];
        const isEnd = i === originIdx || i === destIdx;
        const city = CITY_IDS.has(st.id) || isEnd;
        const mins = circleMinutes(i);
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
            <text x={LABEL_END} y={p.y + 4.5} textAnchor="end" className={`stn stn-p${isEnd ? ' end' : ''}`}>
              <title>{st.name}</title>
              {plainName(st)}
            </text>
            {isEnd && (
              <g aria-hidden="true">
                <rect x={2} y={p.y - 7} width={34} height={14} rx={2} className="end-tag" />
                <text x={19} y={p.y + 3} textAnchor="middle" className="end-tag-t">
                  {i === originIdx ? 'FROM' : 'TO'}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {shown.map(({ t, x, y }) => {
        return (
          <TokenGlyph
            key={`tok-${t.label}`}
            cx={x}
            cy={y}
            direction={t.direction}
            horizontal={false}
            mine={t.mine}
            label={t.label}
          />
        );
      })}
    </svg>
  );
}

interface StripProps extends LineStripProps {
  lo: number;
  hi: number;
  aria: string;
}

function Strip({ lo, hi, originIdx, destIdx, tripMinutes, tokens, aria }: StripProps) {
  const horizontal = false;
  const R = 25;
  const LANE = 190 + 1.5 * R + R + 18; // first token column, right of the hexes
  const RIGHT_LABEL = LANE + 2 * 30 + 4; // right-hand names start past two token columns
  const pts: Pt[] = lineStations.map((_, i) => ({ x: 190 + (i % 2) * 1.5 * R, y: 30 + i * ((S3 * R) / 2) + R }));
  const last = pts[pts.length - 1];
  const W = 600;
  const H = Math.round(last.y + 50);

  const faint: Pt[] = [];
  pts.forEach((p, i) => {
    const off = [[-3 * R, 0], [3 * R, 0], [4.5 * R, (i % 2 ? -1 : 1) * ((S3 * R) / 2)]];
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
        const name = plainName(st);
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
            <text
              x={left ? p.x - R - 10 : RIGHT_LABEL}
              y={p.y + 4}
              textAnchor={left ? 'end' : 'start'}
              className={`stn${isEnd ? ' end' : ''}`}
            >
              {name}
            </text>
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
        // Under the station name, on the label's side, clear of tokens.
        const left = i % 2 === 0;
        const x = left ? p.x - R - 10 - 34 : RIGHT_LABEL;
        const y = p.y + 8;
        return (
          <g key={l} aria-hidden="true">
            <rect x={x} y={y} width={34} height={14} rx={2} className="end-tag" />
            <text x={x + 17} y={y + 10} textAnchor="middle" className="end-tag-t">
              {l}
            </text>
          </g>
        );
      })}
      {placeTokens(
        tokens.filter((t) => pts[t.idx]),
        (t) => pts[t.idx].y,
        LANE
      ).map(({ t, x, y }) => (
        <TokenGlyph
          key={`tok-${t.label}`}
          cx={x}
          cy={y}
          direction={t.direction}
          horizontal={horizontal}
          mine={t.mine}
          label={t.label}
        />
      ))}
    </svg>
  );
}

/** One live train token: direction colour, pointer toward travel, rim weight for "your route". Used by the legend too. */
export function TokenGlyph({
  cx,
  cy,
  direction,
  horizontal,
  mine,
  label,
  r = 12,
}: {
  cx: number;
  cy: number;
  direction: Direction;
  horizontal: boolean;
  mine: boolean;
  label?: string;
  r?: number;
}) {
  const style = TOKEN_STYLE[direction];
  return (
    <g aria-hidden="true" data-direction={direction}>
      <polygon points={tokenPointer(cx, cy, direction, horizontal, r)} className="train-tip" />
      <circle cx={cx} cy={cy} r={r} fill={style.fill} stroke="#1b1a17" strokeWidth={tokenRim(mine)} className="train-tok" />
      {label && (
        <text x={cx} y={cy + 3.5} textAnchor="middle" className="train-tok-t">
          {label.slice(0, 4)}
        </text>
      )}
    </g>
  );
}
