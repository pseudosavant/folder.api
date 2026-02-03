import { describe, it, expect } from 'vitest';
import { normalizeOptions } from '../../src/options.js';

describe('normalizeOptions', () => {
  it('applies defaults', () => {
    const o = normalizeOptions(undefined);
    expect(o.maxDepth).toBe(0);
    expect(o.mode).toBe('auto');
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
});

