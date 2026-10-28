import { describe, it, expect } from 'vitest';
import { normalizeDirectoryUrl, parentDirectory, rootDirectory, keyForFile, keyForVisited } from '../../src/utils/url.js';

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
  it('deduplicates unreserved encoding aliases without decoding encoded path separators', () => {
    expect(keyForVisited(new URL('https://x.test/f%6Flder/'))).toBe(keyForVisited(new URL('https://x.test/folder/')));
    expect(keyForVisited(new URL('https://x.test/a%2fb/'))).not.toBe(keyForVisited(new URL('https://x.test/a/b/')));
    expect(keyForFile(new URL('https://x.test/a.mp4?token=one'))).not.toBe(keyForFile(new URL('https://x.test/a.mp4?token=two')));
    expect(normalizeDirectoryUrl('https://x.test/folder?token=one#anchor')).toBe('https://x.test/folder/?token=one');
  });
});

