import { describe, expect, it } from 'vitest';
import { TOKEN_STYLE, tokenPointer, tokenRim } from '@/lib/board';

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
