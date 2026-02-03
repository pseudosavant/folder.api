import { describe, it, expect } from 'vitest';
import { normalizeDirectoryUrl, parentDirectory, rootDirectory, isSameOrigin } from '../../src/utils/url.js';

describe('url utils', () => {
  it('normalizes trailing slash', () => {
    expect(normalizeDirectoryUrl('https://x.test/a')).toBe('https://x.test/a/');
  });
  it('parentDirectory root edge', () => {
    const u = new URL('https://x.test/a/b/');
    expect(parentDirectory(u)).toBe('https://x.test/a/');
  });
  it('rootDirectory', () => {
    const u = new URL('https://x.test/a/b/');
    expect(rootDirectory(u)).toBe('https://x.test/');
  });
  it('isSameOrigin', () => {
    expect(isSameOrigin(new URL('https://a.com/x/'), new URL('https://a.com/y/'))).toBe(true);
  });
});

