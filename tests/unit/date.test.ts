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
  it.each([
    ['2026-10-27T12:00:00+02:00', '2026-10-27T10:00:00.000Z'],
    ['2026-10-27T12:00:00-0230', '2026-10-27T14:30:00.000Z'],
    ['2026-10-27T12:00:00.123456Z', '2026-10-27T12:00:00.123Z'],
    ['2026-10-27', '2026-10-27T00:00:00.000Z'],
    ['2026-10-27 1234', '2026-10-27T00:00:00.000Z'],
    ['2026-10-27T12:00:00+02:00 1234', '2026-10-27T10:00:00.000Z'],
    ['0001-01-01 00:00', '0001-01-01T00:00:00.000Z'],
    ['2024-02-29 12:00', '2024-02-29T12:00:00.000Z'],
    ['1/1/1999  2:02 AM', '1999-01-01T02:02:00.000Z'],
    ['1/1/1999 12:00 AM', '1999-01-01T00:00:00.000Z'],
    ['1/1/1999 12:00 PM', '1999-01-01T12:00:00.000Z']
  ])('normalizes %s', (text, expected) => {
    const errors: string[] = [];
    expect(parseDateMeta(text, errors)).toBe(expected);
    expect(errors).toEqual([]);
  });
  it.each(['2026-02-31 12:00', '2026-13-01 12:00', '2026-01-01 24:00', '2026-01-01 12:60', '2026-01-01T12:00:00+24:00', '2026-01-01T12:00:00+2:00', '1/1/1999 13:00 PM', '01-Abc-2026 12:00'])('rejects invalid date %s', text => {
    const errors: string[] = [];
    expect(parseDateMeta(text, errors)).toBeNull();
    expect(errors).toContain('date: invalid date or time');
  });
  it.each(['2026-10-27 12:0', '2026-10-27T12:0', '2026-10-27 12:00:123',
    '2026-10-27T12:00:00+02:000', '2026-10-27T12:00:00+02:00:30',
    '2026-10-27T12:00:00+02', '2026-10-27T12:00:00.123abc', '27-Oct-2026 12:00:123'])('rejects malformed timestamp suffix %s', text => {
    const errors: string[] = [];
    expect(parseDateMeta(text, errors)).toBeNull();
    expect(errors).toContain('date: invalid date or time');
  });
});

