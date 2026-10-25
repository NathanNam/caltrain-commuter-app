import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, initialRoute } from '@/lib/board';

describe('initial route', () => {
  it('a first-time visitor gets San Francisco -> San Mateo, flagged as the default', () => {
    expect(DEFAULT_ROUTE).toEqual({ from: 'sf', to: 'sm' });
    expect(initialRoute(null, null)).toEqual({ from: 'sf', to: 'sm', isDefault: true });
  });

  it('a saved route beats the default', () => {
    expect(initialRoute(null, { from: 'sf', to: 'pa' })).toEqual({ from: 'sf', to: 'pa', isDefault: false });
  });

  it('the link beats the saved route', () => {
    expect(initialRoute({ from: 'mv', to: 'sf' }, { from: 'sf', to: 'pa' })).toEqual({ from: 'mv', to: 'sf', isDefault: false });
  });
});
