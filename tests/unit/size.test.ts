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
});

