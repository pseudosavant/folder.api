import { describe, it, expect } from 'vitest';
import { parseDateMeta } from '../../src/utils/date.js';

describe('ambiguous date detection', () => {
  it('flags ambiguous numeric date', () => {
    const errors: string[] = [];
    const iso = parseDateMeta('12/13/2024 12:00', errors);
    expect(iso).toBeNull();
    expect(errors.some(e => e.startsWith('date:'))).toBe(true);
  });
});

