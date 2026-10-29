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

describe('a crowded station never runs off the edge', () => {
  const tok = (label: string, direction: LiveToken['direction'], mine = false): LiveToken => ({ label, idx: 24, direction, mine });
  // Oct 28, 5:35 PM: five trains reported at San Jose Diridon at once.
  const diridon = [tok('816', 'Southbound'), tok('822', 'Southbound'), tok('149', 'Northbound'), tok('523', 'Northbound'), tok('421', 'Northbound')];

  it('uses at most maxSlots slots and folds the rest into a "+N" marker', () => {
    const placed = placeTokens(diridon, () => 100, 250, 30, 44, 4);
    expect(placed).toHaveLength(4);
    expect(Math.max(...placed.map((p) => p.x))).toBe(250 + 3 * 30);
    const more = placed.filter((p) => p.more);
    expect(more).toHaveLength(1);
    expect(more[0].more!.map((t) => t.label).sort()).toEqual(['421', '523']);
    // every train is either a token or counted in the marker
    const shown = placed.filter((p) => !p.more).map((p) => p.t.label);
    expect([...shown, ...more[0].more!.map((t) => t.label)].sort()).toEqual(diridon.map((t) => t.label).sort());
  });

  it("keeps the rider's own train as a token, not inside the marker", () => {
    const mine = diridon.map((t) => (t.label === '421' ? { ...t, mine: true } : t));
    const placed = placeTokens(mine, () => 100, 250, 30, 44, 4);
    expect(placed.some((p) => !p.more && p.t.label === '421')).toBe(true);
    expect(placed.find((p) => p.more)!.more!.some((t) => t.label === '421')).toBe(false);
  });

  it('changes nothing when every token fits', () => {
    const two = diridon.slice(0, 2);
    expect(placeTokens(two, () => 100, 250, 30, 44, 4)).toEqual(placeTokens(two, () => 100, 250));
  });
});
