import { describe, it, expect } from 'vitest';
import { detectHidden } from '../../src/utils/classify.js';

describe('hidden detection', () => {
  it('detects hidden starting dot', () => {
    expect(detectHidden('.env')).toBe(true);
  });
  it('ignores single dot', () => {
    expect(detectHidden('.')).toBe(false);
  });
});

