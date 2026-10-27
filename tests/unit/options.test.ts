import { describe, it, expect } from 'vitest';
import { normalizeOptions } from '../../src/options.js';

describe('normalizeOptions', () => {
  it('applies defaults', () => {
    const o = normalizeOptions(undefined);
    expect(o.maxDepth).toBe(0);
    expect(o.mode).toBe('auto');
    expect(o.cache).toBe('default');
    expect(o.includeMime).toBe(false);
  expect(o.headConcurrency).toBe(4);
    expect(o.timeoutMs).toBe(15000);
    expect(o.sameOriginOnly).toBe(true);
  });
  it('clamps values', () => {
    const o = normalizeOptions({ maxDepth: -5, headConcurrency: 0, timeoutMs: 50 });
    expect(o.maxDepth).toBe(0);
    expect(o.headConcurrency).toBe(1);
    expect(o.timeoutMs).toBeGreaterThanOrEqual(100);
  });
  it('preserves a valid fetch cache policy', () => {
    expect(normalizeOptions({ cache: 'no-store' }).cache).toBe('no-store');
  });
  it('falls back to the default for an invalid cache policy', () => {
    expect(normalizeOptions({ cache: 'invalid' as RequestCache }).cache).toBe('default');
  });
  it('normalizes finite integers and rejects non-finite inputs', () => {
    expect(normalizeOptions({ maxDepth: 2.9, headConcurrency: 1.9, timeoutMs: 100.9 }))
      .toMatchObject({ maxDepth: 2, headConcurrency: 1, timeoutMs: 100 });
    expect(normalizeOptions({ maxDepth: NaN, headConcurrency: Infinity, timeoutMs: NaN }))
      .toMatchObject({ maxDepth: 0, headConcurrency: 4, timeoutMs: 15000 });
    expect(normalizeOptions({ maxEntries: Infinity }).maxEntries).toBe(50000);
    expect(normalizeOptions({ maxEntries: 999999 }).maxEntries).toBe(50000);
    expect(normalizeOptions({ maxEntries: 0 }).maxEntries).toBe(1);
    expect(normalizeOptions({ timeoutMs: Number.MAX_SAFE_INTEGER }).timeoutMs).toBe(2147483647);
  });
  it('keeps best-effort traversal opt-in and validates modes', () => {
    expect(normalizeOptions(undefined).continueOnError).toBe(false);
    expect(normalizeOptions({ continueOnError: true }).continueOnError).toBe(true);
    expect(normalizeOptions({ mode: 'invalid' as 'auto' }).mode).toBe('auto');
  });
});

