import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LineStrip, { visibleRange } from '@/components/LineStrip';
import { LiveToken, lineStations } from '@/lib/board';

const idx = (id: string) => lineStations.findIndex((s) => s.id === id);
const LAST = lineStations.length - 1;

interface El {
  tag: string;
  station: number;
  y: number;
  cls: string;
  end?: string;
  token?: string;
  text?: string;
}

/** Elements carrying data-station in one <svg>, with their y and classes. */
function parse(svg: string): El[] {
  const out: El[] = [];
  const re = /<(polygon|text|circle|rect|g)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const attrs = m[2];
    const st = /data-station="(\d+)"/.exec(attrs);
    if (!st) continue;
    const el: El = {
      tag: m[1],
      station: Number(st[1]),
      y: Number(/data-y="([\d.]+)"/.exec(attrs)![1]),
      cls: /class="([^"]*)"/.exec(attrs)?.[1] ?? '',
      end: /data-end="(\w+)"/.exec(attrs)?.[1],
      token: /data-token="(\w+)"/.exec(attrs)?.[1],
    };
    if (m[1] === 'text') {
      const close = svg.indexOf('</text>', m.index);
      el.text = svg.slice(m.index, close).replace(/<title>.*?<\/title>/, '').replace(/<[^>]+>/g, '');
    }
    out.push(el);
  }
  return out;
}

function render(from: string, to: string, whole: boolean, tokens: LiveToken[]) {
  const html = renderToStaticMarkup(
    <LineStrip originIdx={idx(from)} destIdx={idx(to)} tripMinutes={24} tokens={tokens} initialWhole={whole} />
  );
  const svgs = html.split('<svg').slice(1).filter((s) => s.includes('role="img"'));
  return { phone: parse(svgs[0]), desktop: parse(svgs[1]) };
}

const tokens: LiveToken[] = [
  { idx: 0, label: '668', direction: 'Southbound', mine: true },
  { idx: idx('bayshore'), label: '663', direction: 'Northbound', mine: false },
  { idx: idx('ssf'), label: '664', direction: 'Southbound', mine: false },
  { idx: idx('belmont'), label: '662', direction: 'Southbound', mine: false },
  { idx: idx('lawrence'), label: '660', direction: 'Southbound', mine: false },
  { idx: idx('college-park'), label: '665', direction: 'Northbound', mine: false },
  { idx: LAST, label: '899', direction: 'Northbound', mine: false },
];

const routes: [string, string][] = [
  ['sf', 'sm'],
  ['sm', 'sf'],
  ['22nd', 'sm'],
  ['gilroy', 'sf'],
  ['diridon', 'gilroy'],
  ['rw', 'mv'],
];

describe('line strip layout: every row lines up', () => {
  for (const [from, to] of routes) {
    for (const whole of [false, true]) {
      it(`${from} -> ${to}, ${whole ? 'whole line' : 'trip view'}`, () => {
        const o = idx(from);
        const d = idx(to);
        const lo = Math.min(o, d);
        const hi = Math.max(o, d);
        const { phone, desktop } = render(from, to, whole, tokens);

        for (const [view, els, range] of [
          ['phone', phone, visibleRange(o, d, whole)],
          ['desktop', desktop, { first: 0, last: LAST }],
        ] as const) {
          for (let i = range.first; i <= range.last; i++) {
            const row = els.filter((e) => e.station === i && !e.token);
            const label = row.find((e) => e.tag === 'text');
            const hex = row.find((e) => e.tag === 'polygon');
            const stop = row.find((e) => e.tag === 'circle');
            // a label, a hex and a stop for every shown station, all level
            expect(label?.text, `${view} label ${i}`).toBe(lineStations[i].name.replace(/\s*\(.*\)$/, ''));
            expect(hex?.y, `${view} hex ${i}`).toBe(label!.y);
            expect(stop?.y, `${view} stop ${i}`).toBe(label!.y);
            // trip colouring
            expect(hex!.cls, `${view} colour ${i}`).toBe(i >= lo && i <= hi ? 'hx-trip' : 'hx-rest');
            // cities vs stops: ends are always drawn as cities
            if (i === o || i === d) expect(stop!.cls).toBe('city');
          }
          // nothing drawn outside the shown range
          expect(els.filter((e) => !e.token && (e.station < range.first || e.station > range.last))).toHaveLength(0);
          // tokens level with their station's label
          for (const t of els.filter((e) => e.token)) {
            const label = els.find((e) => e.tag === 'text' && e.station === t.station)!;
            expect(t.y, `${view} token ${t.token}`).toBe(label.y);
          }
          const shownTokens = tokens.filter((t) => t.idx >= range.first && t.idx <= range.last);
          expect(els.filter((e) => e.token).map((e) => e.token).sort()).toEqual(shownTokens.map((t) => t.label).sort());
        }

        // phone FROM/TO markers sit on the origin and destination rows
        const ends = phone.filter((e) => e.end);
        expect(ends.find((e) => e.end === 'from')?.station).toBe(o);
        expect(ends.find((e) => e.end === 'to')?.station).toBe(d);
      });
    }
  }

  it('the trip view starts at the first station when the trip does', () => {
    expect(visibleRange(0, idx('sm'), false)).toEqual({ first: 0, last: idx('sm') + 2 });
    expect(visibleRange(LAST, 0, false)).toEqual({ first: 0, last: LAST });
    expect(visibleRange(idx('diridon'), LAST, false)).toEqual({ first: idx('diridon') - 2, last: LAST });
  });
});

describe('line strip: many trains at one station', () => {
  // Oct 28, 5:35 PM: 816, 822, 149, 523 and a 4xx all reported at San Jose Diridon.
  const crowd: LiveToken[] = ['816', '822', '149', '523', '421', '427'].map((label, k) => ({
    idx: idx('diridon'),
    label,
    direction: k < 2 ? 'Southbound' : 'Northbound',
    mine: label === '421',
  }));

  it('keeps every token and "+N" marker inside the drawing on phone and desktop', () => {
    const html = renderToStaticMarkup(
      <LineStrip originIdx={idx('sm')} destIdx={idx('22nd')} tripMinutes={24} tokens={crowd} initialWhole />
    );
    const svgs = html.split('<svg').slice(1).filter((s) => s.includes('role="img"'));
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      // The svg scales with its box (width 100%), so fitting the viewBox means no clipping at any screen width.
      const width = Number(/viewBox="0 0 ([\d.]+) /.exec(svg)![1]);
      const circles = [...svg.matchAll(/<circle cx="([\d.]+)"[^>]*class="train-(tok|more)"/g)];
      expect(circles.length).toBeGreaterThan(0);
      for (const c of circles) expect(Number(c[1]) + 12 + 2).toBeLessThanOrEqual(width);
      const tokens = [...svg.matchAll(/data-token="(\w+)"/g)].map((m) => m[1]);
      const more = Number(/data-more="(\d+)"/.exec(svg)?.[1] ?? 0);
      // every train is drawn or counted, and the rider's train is drawn
      expect(tokens.length + more).toBe(crowd.length);
      expect(tokens).toContain('421');
    }
    // the phone strip (360 wide) has room for four slots: three trains and "+3"
    expect(/data-more="(\d+)"/.exec(svgs[0])?.[1]).toBe('3');
  });
});
