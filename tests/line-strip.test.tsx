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
