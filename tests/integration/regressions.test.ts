import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';
import { folderApiRequest as browserRequest } from '../../folder-api.cdn.js';

const base = 'https://example.test/root/start/';
const implementations = [['TypeScript', folderApiRequest], ['browser bundle', browserRequest]] as const;
const listing = (names: string[]) => '<ul>' + names.map(name => `<li><a href="${name}">${name}</a></li>`).join('') + '</ul>';
const response = (html: string, url = '') => {
  const res = new Response(html, { headers: { 'Content-Type': 'text/html' } });
  if (url) Object.defineProperty(res, 'url', { value: url });
  return res;
};
const mockFrames = (html: string, url = base) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  Object.defineProperty(doc, 'URL', { value: url });
  vi.spyOn(HTMLIFrameElement.prototype, 'contentDocument', 'get').mockReturnValue(doc);
  const append = document.body.appendChild.bind(document.body);
  return vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
    const result = append(node);
    queueMicrotask(() => node.dispatchEvent(new Event('load')));
    return result;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.querySelectorAll('iframe').forEach(frame => frame.remove());
});

describe.each(implementations)('%s request and parsing regressions', (_name, request) => {
  it('uses iframe-only mode without fetching and removes the frame', async () => {
    const frames = mockFrames(listing(['clip.mp4']));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'iframe' });
    expect(result.files.map(file => file.name)).toEqual(['clip.mp4']);
    expect(result.stats.iframes).toBe(1);
    expect(frames).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('falls back once after a network failure', async () => {
    mockFrames(listing(['clip.mp4']));
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'auto' });
    expect(result.files).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.stats.iframes).toBe(1);
  });

  it.each(['fetch', 'iframe', 'auto'] as const)('does not start %s work with an aborted signal', async mode => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    const create = vi.spyOn(document, 'createElement');
    vi.stubGlobal('fetch', fetchMock);
    await expect(request(base, { mode, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not turn a cancelled fetch into an iframe load', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const pending = request(base, { signal: controller.signal, mode: 'auto' });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('cancels iframe loading promptly and cleans up listeners and timers', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = request(base, { mode: 'iframe', signal: controller.signal });
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the final redirected directory as the base for files and children', async () => {
    const final = 'https://example.test/actual/';
    vi.stubGlobal('fetch', vi.fn(async url => response(url === base ? listing(['clip.mp4', 'sub/']) : listing(['child.mp4']), url === base ? final : String(url))));
    const result = await request(base, { mode: 'fetch', maxDepth: 1 });
    expect(result.url).toBe(final);
    expect(result.root.url).toBe(final);
    expect(result.files.map(file => file.url)).toEqual([final + 'clip.mp4', final + 'sub/child.mp4']);
  });

  it('uses the final iframe document URL', async () => {
    const final = 'https://example.test/actual/';
    mockFrames(listing(['clip.mp4']), final);
    const result = await request(base, { mode: 'iframe' });
    expect(result.url).toBe(final);
    expect(result.files[0].url).toBe(final + 'clip.mp4');
  });

  it('keeps query-only redirects without expanding children beyond the depth cap', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => response(url === base ? listing(['alias/']) : listing(['clip.mp4']),
      url === base ? base + '?order=new' : base + 'sub/deep/')));
    const result = await request(base, { mode: 'fetch', maxDepth: 1 });
    expect(result.url).toBe(base + '?order=new');
    expect(result.root.children[0].depth).toBe(2);
    expect(result.files).toHaveLength(0);
    expect(result.root.children[0].files).toHaveLength(0);
    expect(result.stats.maxDepth).toBe(0);
  });

  it('skips malformed, non-HTTP, fragment, and sort links and deduplicates resolved URLs', async () => {
    const html = '<table><tr><th><a href="?C=N;O=D">Name</a></th></tr></table>' +
      listing(['clip.mp4', './clip.mp4', base + 'clip.mp4', 'http://[', '#anchor', '?sort=name', 'javascript:alert(1)', 'mailto:a@example.test', 'data:text/plain,abc', 'blob:https://example.test/abc', 'ftp://example.test/file', 'https://other.test/remote.mp4']);
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch', sameOriginOnly: false });
    expect(result.files.map(file => file.url)).toEqual([base + 'clip.mp4', 'https://other.test/remote.mp4']);
    expect(result.errors.some(error => error.startsWith('url:'))).toBe(true);
  });

  it('recognizes folders with query strings and preserves file query parameters', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(listing(['sub/?order=name', 'clip.mp4?token=abc']))));
    const result = await request(base, { mode: 'fetch' });
    expect(result.folders.some(folder => folder.url === base + 'sub/?order=name')).toBe(true);
    expect(result.files.map(file => file.url)).toEqual([base + 'clip.mp4?token=abc']);
  });

  it('keeps metadata columns separate from descriptions and permission fields', async () => {
    const html = '<table><tr><th>Name</th><th>Modified</th><th>Size</th><th>Description</th></tr>' +
      '<tr><td><a href="one.mp4">one.mp4</a></td><td>27-Oct-2026 12:00</td><td>1K</td><td>99</td></tr>' +
      '<tr><td><a href="two.mp4">two.mp4</a></td><td>27-Oct-2026 12:00</td><td>-</td><td>4096</td></tr></table>' +
      '<table><tr><th>Mode</th><th>Size</th><th>Name</th></tr><tr><td>(unknown mode)</td><td>3.17M</td><td><a href="three.mp4">three.mp4</a></td></tr></table>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch' });
    expect(result.files.map(file => file.size)).toEqual([1024, null, Math.floor(3.17 * 1024 ** 2)]);
    expect(result.files.slice(0, 2).map(file => file.date)).toEqual(['2026-10-27T12:00:00.000Z', '2026-10-27T12:00:00.000Z']);
  });

  it('normalizes explicit date offsets, rejects invalid dates, and accepts IIS whitespace', async () => {
    const html = '<table><tr><td><a href="offset.mp4">offset.mp4</a></td><td>2026-10-27T12:00:00+02:00</td></tr>' +
      '<tr><td><a href="invalid.mp4">invalid.mp4</a></td><td>2026-02-31 12:00</td></tr>' +
      '<tr><td><a href="iis.mp4">iis.mp4</a></td><td>1/1/1999  2:02 AM</td><td>931</td></tr></table>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch' });
    expect(result.files.map(file => file.date)).toEqual(['2026-10-27T10:00:00.000Z', null, '1999-01-01T02:02:00.000Z']);
    expect(result.errors.some(error => error.startsWith('date:'))).toBe(true);
  });

  it('enforces an entry budget within a directory and avoids extra traversal or HEAD work', async () => {
    const fetchMock = vi.fn(async () => response(listing(Array.from({ length: 20 }, (_, i) => 'sub' + i + '/'))));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', maxDepth: 3, maxEntries: 5 });
    expect(result.entries.length).toBeLessThanOrEqual(5);
    expect(result.errors.filter(error => error.startsWith('limit:'))).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps flat folders unique and uses root-relative depths without ancestor children', async () => {
    const fetchMock = vi.fn(async url => response(url === base ? listing(['../', 'sub/', './sub/']) : url === base + 'sub/' ? listing(['../', 'deep/']) : listing(['../'])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', maxDepth: 2 });
    expect(new Set(result.folders.map(folder => folder.url)).size).toBe(result.folders.length);
    expect(result.root.children).toHaveLength(1);
    expect(result.root.children[0].children[0].depth).toBe(2);
    expect(result.root.children[0].children[0].children).toHaveLength(0);
    expect(result.folders.find(folder => folder.url === base + 'sub/')).toBe(result.root.children[0]);
    expect(result.folders.find(folder => folder.url === 'https://example.test/root/')?.role).toBe('parent');
    expect(result.folders.find(folder => folder.url === 'https://example.test/')?.role).toBe('root');
    expect(result.stats.maxDepth).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deduplicates files across directory listings and HEAD enrichment', async () => {
    const fetchMock = vi.fn(async (url, init) => init?.method === 'HEAD' ? new Response(null) : response(url === base ? listing(['clip.mp4', 'sub/']) : listing([base + 'clip.mp4'])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', maxDepth: 1, includeMime: true });
    expect(result.files).toHaveLength(1);
    expect(result.root.children[0].files).toHaveLength(0);
    expect(result.stats.heads).toBe(1);
  });

  it('keeps cross-origin loops out of the result tree', async () => {
    const second = 'https://other.test/remote/';
    const third = 'https://third.test/';
    const fetchMock = vi.fn(async url => response(listing([url === base ? second : url === second ? third : second])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', maxDepth: 5, sameOriginOnly: false });
    expect(result.root.children[0].children[0].children).toHaveLength(0);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deduplicates encoded folder aliases and honors root-relative traversal depth', async () => {
    const fetchMock = vi.fn(async url => response(url === base
      ? listing(['sub/', 's%75b/', 'deep/nested/'])
      : listing(['clip.mp4'])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', maxDepth: 1 });
    expect(result.root.children.map(folder => folder.depth)).toEqual([1, 2]);
    expect(result.files.map(file => file.url)).toEqual([base + 'sub/clip.mp4']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('merges redirected aliases without reloading the canonical directory', async () => {
    const fetchMock = vi.fn(async url => url === base
      ? response(listing(['alias/', 'real/']))
      : response(listing(['clip.mp4']), base + 'real/'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', maxDepth: 1 });
    expect(result.root.children.map(folder => folder.url)).toEqual([base + 'real/']);
    expect(result.files.map(file => file.url)).toEqual([base + 'real/clip.mp4']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not crawl unrelated folders or ancestors as children', async () => {
    const fetchMock = vi.fn(async () => response(listing(['../', '/', '/unrelated/', 'https://other.test/remote/'])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', maxDepth: 3 });
    expect(result.root.children).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not traverse a child alias that redirects to a navigation ancestor', async () => {
    const fetchMock = vi.fn(async url => url === base ? response(listing(['alias/']))
      : response(listing(['unrelated/']), 'https://example.test/root/'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', maxDepth: 3 });
    expect(result.root.children).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let a child redirect escape the default traversal scope', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => url === base ? response(listing(['clip.mp4', 'alias/']))
      : response(listing(['outside.mp4']), 'https://example.test/unrelated/')));
    await expect(request(base, { mode: 'fetch', maxDepth: 1 })).rejects.toThrow('outside the starting directory');
    const result = await request(base, { mode: 'fetch', maxDepth: 1, continueOnError: true });
    expect(result.files.map(file => file.name)).toEqual(['clip.mp4']);
    expect(result.errors.some(error => error.startsWith('traversal:'))).toBe(true);
  });

  it('caps files inside a large listing, not only between directories', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(listing(Array.from({ length: 1000 }, (_, i) => i + '.mp4')))));
    const result = await request(base, { mode: 'fetch', maxEntries: 31 });
    expect(result.entries).toHaveLength(31);
    expect(result.files).toHaveLength(30);
    expect(result.errors.filter(error => error.startsWith('limit:'))).toHaveLength(1);
  });

  it('can retain readable results when a child fails, while remaining fail-fast by default', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => url === base ? response(listing(['clip.mp4', 'bad/', 'good/'])) : String(url).endsWith('bad/') ? new Response(null, { status: 403 }) : response(listing(['child.mp4']))));
    await expect(request(base, { mode: 'fetch', maxDepth: 1 })).rejects.toThrow('403');
    const result = await request(base, { mode: 'fetch', maxDepth: 1, continueOnError: true });
    expect(result.files.map(file => file.name)).toEqual(['clip.mp4', 'child.mp4']);
    expect(result.errors.some(error => error.startsWith('traversal:') && error.includes('/bad/'))).toBe(true);
  });

  it('always rejects a failed starting directory even in best-effort mode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));
    await expect(request(base, { mode: 'fetch', continueOnError: true })).rejects.toThrow('403');
  });

  it('normalizes invalid numeric options instead of hanging or requesting unbounded work', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => init?.method === 'HEAD' ? new Response(null) : response(listing(['clip.mp4']))));
    const result = await request(base, { mode: 'fetch', includeMime: true, headConcurrency: NaN, timeoutMs: Infinity, maxDepth: NaN });
    expect(result.files).toHaveLength(1);
    expect(result.stats.heads).toBe(1);
  });

  it('bounds HEAD concurrency and uses the same default in both builds', async () => {
    let active = 0;
    let peak = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method !== 'HEAD') return response(listing(Array.from({ length: 20 }, (_, i) => i + '.mp4')));
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return new Response(null);
    }));
    const result = await request(base, { mode: 'fetch', includeMime: true });
    expect(result.stats.heads).toBe(20);
    expect(peak).toBe(4);
  });

  it('aborts active HEAD requests without starting queued requests', async () => {
    const controller = new AbortController();
    let heads = 0;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method !== 'HEAD') return response(listing(Array.from({ length: 10 }, (_, i) => i + '.mp4')));
      heads++;
      if (heads === 2) started();
      return await new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    }));
    const pending = request(base, { mode: 'fetch', includeMime: true, headConcurrency: 2, signal: controller.signal, continueOnError: true });
    await ready;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(heads).toBe(2);
  });

  it('cleans up caller abort listeners and failed HEAD timers', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method === 'HEAD') throw new TypeError('network');
      return response(listing(['clip.mp4']));
    }));
    const result = await request(base, { mode: 'fetch', includeMime: true, signal: controller.signal });
    expect(result.errors.some(error => error.startsWith('mime:'))).toBe(true);
    expect(remove.mock.calls).toEqual(add.mock.calls.map(([type, callback]) => [type, callback]));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves zero sizes and rejects invalid Content-Length values', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => init?.method === 'HEAD'
      ? new Response(null, { headers: { 'Content-Length': String(url).includes('empty') ? '99' : '-1' } })
      : response('<table><tr><td><a href="empty.mp4">empty.mp4</a></td><td>0</td></tr><tr><td><a href="unknown.mp4">unknown.mp4</a></td><td>-</td></tr></table>')));
    const result = await request(base, { mode: 'fetch', includeMime: true });
    expect(result.files.map(file => file.size)).toEqual([0, null]);
  });

  it('reports nonfatal HEAD HTTP failures with their file URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => init?.method === 'HEAD' ? new Response(null, { status: 503 }) : response(listing(['clip.mp4']))));
    const result = await request(base, { mode: 'fetch', includeMime: true });
    expect(result.files).toHaveLength(1);
    expect(result.errors).toContain('mime: HEAD 503 for ' + base + 'clip.mp4');
  });
});
