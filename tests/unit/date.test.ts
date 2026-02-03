import { describe, it, expect } from 'vitest';
import { parseDateMeta } from '../../src/utils/date.js';

describe('parseDateMeta', () => {
  it('parses ISO-ish', () => {
    const errors: string[] = [];
    const iso = parseDateMeta('2024-03-01 12:05', errors)!;
    expect(iso.startsWith('2024-03-01T12:05:00')).toBe(true);
    expect(errors.length).toBe(0);
  });
  it('parses Apache style', () => {
    const errors: string[] = [];
    const iso = parseDateMeta('08-Oct-2023 05:44', errors)!;
    expect(iso.startsWith('2023-10-08T05:44:00')).toBe(true);
  });
  it('parses US style with AM/PM', () => {
    const errors: string[] = [];
    const iso = parseDateMeta('1/2/2022 3:04 PM', errors)!;
    expect(iso.startsWith('2022-01-02T15:04:00')).toBe(true);
  });
});

