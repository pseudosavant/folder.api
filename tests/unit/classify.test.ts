import { describe, it, expect } from 'vitest';
import { classifyEntry } from '../../src/utils/classify.js';

describe('classifyEntry', () => {
  it('classifies folder by trailing slash', () => {
    expect(classifyEntry('https://x/y/z/', '')).toBe('folder');
  });
  it('classifies file by extension', () => {
    expect(classifyEntry('https://x/y/file.txt', '')).toBe('file');
  });
  it('heuristic folder by keyword', () => {
    expect(classifyEntry('https://x/y/thing', ' <dir> ')).toBe('folder');
  });
});

