import { describe, it, expect } from 'vitest';
import { parseSizeMeta } from '../../src/utils/size.js';

describe('parseSizeMeta', () => {
  it('parses bytes', () => {
    expect(parseSizeMeta('123')).toBe(123);
  });
  it('parses kilobytes', () => {
    expect(parseSizeMeta('2K')).toBe(2048);
  });
  it('parses megabytes with decimals', () => {
    expect(parseSizeMeta('1.5M')).toBe(1572864);
  });
  it.each([
    ['0', 0],
    ['1,234', 1234],
    ['2 KB', 2048],
    ['1.5 MiB', 1572864],
    ['2026-10-23 12:34 1048576', 1048576],
    ['23-Oct-2026 12:34 1.5M', 1572864],
    ['10/23/2026 12:34 PM 1,234', 1234],
    ['2026-10-23 12:34 -', null],
    ['23-Oct-2026 12:34', null],
    ['10/23/2026 12:34 PM', null],
    ['Track 03.mp3', null],
    ['2026-10-23 12:34.mp4', null],
    ['3 items', null],
    ['-', null]
  ])('parses the metadata field %s without guessing', (text, expected) => {
    expect(parseSizeMeta(text as string)).toBe(expected);
  });
});

