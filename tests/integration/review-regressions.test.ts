import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';
import { folderApiRequest as browserRequest } from '../../folder-api.cdn.js';
import type { FolderNode } from '../../src/types.js';

const base = 'https://example.test/root/start/';
const listing = (names: string[]) => '<ul>' + names.map(name => `<li><a href="${name}">${name}</a></li>`).join('') + '</ul>';
const response = (html: string, url = '') => {
  const res = new Response(html, { headers: { 'Content-Type': 'text/html' } });
  if (url) Object.defineProperty(res, 'url', { value: url });
  return res;
};

afterEach(() => vi.unstubAllGlobals());

describe.each([['TypeScript', folderApiRequest], ['browser bundle', browserRequest]] as const)('%s review regressions', (_name, request) => {
  it('does not let discarded folders consume the entry budget', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(listing(['/noise1/', '/noise2/', '/noise3/', '/noise4/', '/noise5/', 'valid.mp4']))));
    const result = await request(base, { mode: 'fetch', maxEntries: 5 });
    expect(result.files.map(file => file.name)).toEqual(['valid.mp4']);
    expect(result.entries).toHaveLength(4);
    expect(result.errors).toEqual([]);
  });

  it('does not let globally duplicated files consume a child listing budget', async () => {
    const known = Array.from({ length: 6 }, (_, i) => base + i + '.mp4');
    vi.stubGlobal('fetch', vi.fn(async url => response(listing(url === base
      ? ['sub/', ...known] : [...known, 'new.mp4']))));
    const result = await request(base, { mode: 'fetch', maxDepth: 1, maxEntries: 11 });
    expect(result.files).toHaveLength(7);
    expect(result.root.children[0].files.map(file => file.name)).toEqual(['new.mp4']);
    expect(result.entries).toHaveLength(11);
    expect(result.errors).toEqual([]);
  });

  it.each([false, true])('does not parse a deep redirect target already listed: %s', async alreadyListed => {
    const fetchMock = vi.fn(async url => response(listing(url === base
      ? ['alias/', ...(alreadyListed ? ['deep/nested/'] : [])] : ['clip.mp4', 'more/']),
    url === base ? base : base + 'deep/nested/'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', maxDepth: 1, includeMime: true });
    expect(result.files).toEqual([]);
    expect(result.root.children.map(child => child.depth)).toEqual([2]);
    expect(result.root.children[0].children).toEqual([]);
    expect(result.stats.maxDepth).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves links against the first base relative to the final document URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('<base href="assets/"><base href="/wrong/">' + listing(['clip.mp4', 'sub/']), base + 'final/')));
    const result = await request(base, { mode: 'fetch' });
    expect(result.url).toBe(base + 'final/');
    expect(result.files[0].url).toBe(base + 'final/assets/clip.mp4');
    expect(result.root.children[0].url).toBe(base + 'final/assets/sub/');
    expect(result.root.children[0].depth).toBe(2);
  });

  it('does not let a cross-origin base bypass sameOriginOnly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('<base href="https://other.test/assets/">' + listing(['clip.mp4', base + 'local.mp4']))));
    const restricted = await request(base, { mode: 'fetch' });
    expect(restricted.files.map(file => file.url)).toEqual([base + 'local.mp4']);
    const unrestricted = await request(base, { mode: 'fetch', sameOriginOnly: false });
    expect(unrestricted.files.map(file => file.url)).toEqual(['https://other.test/assets/clip.mp4', base + 'local.mp4']);
  });

  it('does not traverse a same-origin base outside the starting subtree', async () => {
    const fetchMock = vi.fn(async () => response('<base href="/elsewhere/">' + listing(['clip.mp4', 'sub/'])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', maxDepth: 3 });
    expect(result.files[0].url).toBe('https://example.test/elsewhere/clip.mp4');
    expect(result.root.children).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['http://[', 'javascript:alert(1)'])('ignores an invalid or unsupported base %s', async href => {
    vi.stubGlobal('fetch', vi.fn(async () => response(`<base href="${href}"><base href="/wrong/">` + listing(['clip.mp4']))));
    const result = await request(base, { mode: 'fetch' });
    expect(result.files[0].url).toBe(base + 'clip.mp4');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^url: invalid base/);
  });

  it('maps header and data column spans without shifting size or date fields', async () => {
    const html = '<table><tr><th colspan="2">Name</th><th>Size</th><th>Modified</th><th>Description</th></tr>' +
      '<tr><td>video</td><td><a href="one.mp4">one.mp4</a></td><td>123</td><td>2026-10-27 12:00</td><td>999</td></tr>' +
      '<tr><td colspan="2"><a href="two.mp4">two.mp4</a></td><td>456</td><td>2026-10-28 13:00</td><td>999</td></tr>' +
      '<tr><td colspan="2"><a href="unknown.mp4">unknown.mp4</a></td></tr></table>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch' });
    expect(result.files.map(file => file.size)).toEqual([123, 456, null]);
    expect(result.files.map(file => file.date)).toEqual(['2026-10-27T12:00:00.000Z', '2026-10-28T13:00:00.000Z', null]);
  });

  it.each(['2026-10-27 12:0', '2026-10-27T12:0', '2026-10-27 12:00:123',
    '2026-10-27T12:00:00+02:000', '2026-10-27T12:00:00+02:00:30', '27-Oct-2026 12:00:123'])('keeps malformed timestamp %s unknown', async timestamp => {
    vi.stubGlobal('fetch', vi.fn(async () => response(`<table><tr><td><a href="clip.mp4">clip.mp4</a></td><td>${timestamp}</td><td>123</td></tr></table>`)));
    const result = await request(base, { mode: 'fetch' });
    expect(result.files[0].date).toBeNull();
    expect(result.files[0].size).toBe(123);
    expect(result.errors).toContain('date: invalid date or time');
  });

  it('maintains traversal invariants across deterministic randomized listings', async () => {
    for (let seed = 1; seed <= 24; seed++) {
      let randomState = seed;
      const random = () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState / 2 ** 32;
      };
      const paths = ['', 'a/', 'a/deep/', 'b/', 'b/deep/'];
      const documents = new Map(paths.map(path => {
        const links = ['../', './', base + 'shared.mp4', '/noise/', path ? 'clip.mp4' : 'root.mp4'];
        for (const other of paths.slice(1)) if (random() < 0.7) links.push(base + other, base + other.replace('a', '%61'));
        for (let index = links.length - 1; index > 0; index--) {
          const other = Math.floor(random() * (index + 1));
          [links[index], links[other]] = [links[other], links[index]];
        }
        return [base + path, listing(links)];
      }));
      const fetched: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async url => {
        fetched.push(String(url));
        return response(documents.get(String(url)) || listing([]));
      }));
      const maxDepth = seed % 3;
      const maxEntries = 4 + seed % 12;
      const result = await request(base, { mode: 'fetch', maxDepth, maxEntries });
      expect(result.entries.length).toBeLessThanOrEqual(maxEntries);
      expect(new Set(result.entries.map(entry => entry.url)).size).toBe(result.entries.length);
      expect(new Set(fetched).size).toBe(fetched.length);
      expect(result.stats.maxDepth).toBeLessThanOrEqual(maxDepth);
      expect(result.errors.filter(error => error.startsWith('limit:')).length).toBeLessThanOrEqual(1);
      const visited = new Set<FolderNode>();
      const inspect = (node: FolderNode) => {
        expect(visited.has(node)).toBe(false);
        visited.add(node);
        expect(result.folders).toContain(node);
        expect(node.depth).toBe(new URL(node.url).pathname.split('/').filter(Boolean).length - 2);
        for (const file of node.files) expect(result.files).toContain(file);
        for (const child of node.children) {
          expect(child.depth).toBeGreaterThan(node.depth);
          inspect(child);
        }
      };
      inspect(result.root);
      expect(() => JSON.stringify(result)).not.toThrow();
      for (const url of fetched) expect(url.startsWith(base)).toBe(true);
    }
  });
});
