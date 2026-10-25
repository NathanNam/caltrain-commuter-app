import { describe, expect, it } from 'vitest';
import { LiveToken, TOKEN_STYLE, placeTokens, tokenPointer, tokenRim } from '@/lib/board';

describe('live train tokens', () => {
  it('styles the two directions differently, by colour and by pointer', () => {
    expect(TOKEN_STYLE.Southbound.fill).not.toBe(TOKEN_STYLE.Northbound.fill);
    expect(TOKEN_STYLE.Southbound.pointer).toBe(1);
    expect(TOKEN_STYLE.Northbound.pointer).toBe(-1);
  });

  it('points the token toward travel: south is down (vertical) and right (horizontal)', () => {
    const tipY = (pts: string) => Number(pts.split(' ')[0].split(',')[1]);
    const tipX = (pts: string) => Number(pts.split(' ')[0].split(',')[0]);
    expect(tipY(tokenPointer(100, 100, 'Southbound', false))).toBeGreaterThan(100);
    expect(tipY(tokenPointer(100, 100, 'Northbound', false))).toBeLessThan(100);
    expect(tipX(tokenPointer(100, 100, 'Southbound', true))).toBeGreaterThan(100);
    expect(tipX(tokenPointer(100, 100, 'Northbound', true))).toBeLessThan(100);
  });

  it('gives trains on your route a heavier rim', () => {
    expect(tokenRim(true)).toBeGreaterThan(tokenRim(false));
  });
});

describe('token placement in the lane', () => {
  const tok = (label: string, idx: number, direction: LiveToken['direction']): LiveToken => ({ label, idx, direction, mine: false });
  const y = (t: LiveToken) => t.idx * 19; // adjacent stations are 19 units apart on the phone strip

  it('keeps every token in the lane, never back over the track', () => {
    const placed = placeTokens([tok('668', 0, 'Southbound'), tok('663', 5, 'Northbound')], y, 250);
    for (const p of placed) expect(p.x).toBeGreaterThanOrEqual(250);
  });

  it('fans out trains at the same or neighbouring stations so none overlap', () => {
    const placed = placeTokens(
      [tok('668', 0, 'Southbound'), tok('664', 1, 'Southbound'), tok('661', 0, 'Northbound'), tok('662', 9, 'Southbound')],
      y,
      250
    );
    for (const a of placed)
      for (const b of placed)
        if (a !== b && a.x === b.x) expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(44);
    // south before north at the same station
    const atSF = placed.filter((p) => p.t.idx === 0).sort((a, b) => a.x - b.x);
    expect(atSF.map((p) => p.t.direction)).toEqual(['Southbound', 'Northbound']);
  });
});
