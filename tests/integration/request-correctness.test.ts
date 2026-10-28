import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';
import { folderApiRequest as browserRequest } from '../../folder-api.cdn.js';
import type { FolderNode } from '../../src/types.js';

const base = 'https://example.test/root/';
const listing = (names: string[]) => '<ul>' + names.map(name => `<li><a href="${name}">${name}</a></li>`).join('') + '</ul>';
const response = (html: string, url = '') => {
  const result = new Response(html, { headers: { 'Content-Type': 'text/html' } });
  if (url) Object.defineProperty(result, 'url', { value: url });
  return result;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.querySelectorAll('iframe').forEach(frame => frame.remove());
});

describe.each([['TypeScript', folderApiRequest], ['browser bundle', browserRequest]] as const)('%s request correctness', (_name, request) => {
  it.each([false, true])('places a redirected sibling under its canonical ancestor, target already listed: %s', async alreadyListed => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async url => {
      fetched.push(String(url));
      if (url === base) return response(listing(['a/', ...(alreadyListed ? ['b/'] : [])]));
      if (url === base + 'a/') return response(listing(['alias/']));
      return response(listing(['clip.txt', 'deep/']), url === base + 'a/alias/' ? base + 'b/' : String(url));
    }));
    const result = await request(base, { mode: 'fetch', maxDepth: 2 });
    const a = result.root.children.find(node => node.name === 'a')!;
    const b = result.root.children.find(node => node.name === 'b')!;
    expect(a.children).toEqual([]);
    expect(b).toMatchObject({ url: base + 'b/', depth: 1 });
    expect(b.children[0]).toMatchObject({ url: base + 'b/deep/', depth: 2 });
    expect(result.files.map(file => file.url)).toEqual([base + 'b/clip.txt', base + 'b/deep/clip.txt']);
    expect(fetched).toEqual([base, base + 'a/', base + 'a/alias/', base + 'b/deep/']);
    const seen = new Set<FolderNode>();
    const inspect = (node: FolderNode) => {
      expect(seen.has(node)).toBe(false);
      seen.add(node);
      expect(result.folders).toContain(node);
      for (const child of node.children) {
        expect(child.url.startsWith(node.url)).toBe(true);
        expect(child.depth).toBeGreaterThan(node.depth);
        inspect(child);
      }
    };
    inspect(result.root);
    expect(seen.size).toBe(result.folders.filter(folder => folder.role === 'self' || folder.role === 'child').length);
  });

  it('uses the deepest known ancestor when a nested alias redirects to another branch', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (url === base) return response(listing(['a/', 'b/']));
      if (url === base + 'a/') return response(listing(['alias/']));
      if (url === base + 'a/alias/') return response(listing(['clip.txt']), base + 'b/moved/');
      return response(listing(['moved/']));
    }));
    const result = await request(base, { mode: 'fetch', maxDepth: 2 });
    expect(result.root.children[0].children).toEqual([]);
    expect(result.root.children[1].children[0]).toMatchObject({ url: base + 'b/moved/', depth: 2 });
    expect(result.files).toHaveLength(1);
    expect(result.stats.fetches).toBe(4);
  });

  it('maintains tree and budget invariants across shuffled redirect graphs', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      let randomState = seed;
      const random = () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState / 2 ** 32;
      };
      const shuffle = (links: string[]) => {
        for (let index = links.length - 1; index > 0; index--) {
          const other = Math.floor(random() * (index + 1));
          [links[index], links[other]] = [links[other], links[index]];
        }
        return links;
      };
      const documents = new Map([
        [base, listing(shuffle(['a/', 'b/', 'alias/', 'a/deep/']))],
        [base + 'a/', listing(shuffle(['alias/', 'deep/', '../', 'clip.txt']))],
        [base + 'b/', listing(shuffle(['deep/', '../', 'clip.txt']))],
        [base + 'a/deep/', listing(['clip.txt'])],
        [base + 'b/deep/', listing(['clip.txt'])]
      ]);
      const redirects = new Map([[base + 'alias/', base + (seed % 2 ? 'a/deep/' : 'b/')],
        [base + 'a/alias/', base + 'b/deep/']]);
      const fetched: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async input => {
        const url = String(input);
        fetched.push(url);
        const final = redirects.get(url) || url;
        return response(documents.get(final) || listing([]), final);
      }));
      const maxDepth = seed % 3;
      const maxEntries = 5 + seed;
      const result = await request(base, { mode: 'fetch', maxDepth, maxEntries });
      expect(result.entries.length).toBeLessThanOrEqual(maxEntries);
      expect(new Set(result.folders.map(folder => folder.url)).size).toBe(result.folders.length);
      expect(new Set(fetched).size).toBe(fetched.length);
      expect(result.stats.fetches).toBe(fetched.length);
      expect(result.stats.maxDepth).toBeLessThanOrEqual(maxDepth);
      expect(result.errorDetails.map(detail => detail.message)).toEqual(result.errors);
      const seen = new Set<FolderNode>();
      const inspect = (node: FolderNode) => {
        expect(seen.has(node)).toBe(false);
        seen.add(node);
        expect(result.folders).toContain(node);
        for (const child of node.children) {
          expect(child.url.startsWith(node.url)).toBe(true);
          expect(child.depth).toBeGreaterThan(node.depth);
          inspect(child);
        }
      };
      inspect(result.root);
      expect(seen.size).toBe(result.folders.filter(folder => folder.role === 'self' || folder.role === 'child').length);
      expect(() => JSON.stringify(result)).not.toThrow();
    }
  });

  it.each([403, 200])('cancels an unread rejected response body for status %s', async status => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      requestSignal = init.signal;
      return new Response(new ReadableStream({ cancel }), { status, headers: { 'Content-Type': 'application/json' } });
    }));
    await expect(request(base, { mode: 'fetch' })).rejects.toThrow(status === 403 ? '403' : 'content-type');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a rejected fetch body before starting iframe fallback', async () => {
    const cancel = vi.fn();
    const doc = new DOMParser().parseFromString(listing(['clip.txt']), 'text/html');
    Object.defineProperty(doc, 'URL', { value: base });
    vi.spyOn(HTMLIFrameElement.prototype, 'contentDocument', 'get').mockReturnValue(doc);
    const append = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
      expect(cancel).toHaveBeenCalledTimes(1);
      const result = append(node);
      queueMicrotask(() => node.dispatchEvent(new Event('load')));
      return result;
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 503 })));
    const result = await request(base);
    expect(result.stats).toMatchObject({ fetches: 1, iframes: 1 });
    expect(result.files[0].name).toBe('clip.txt');
  });

  it('counts failed GET attempts during best-effort traversal and preserves network context', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (url === base) return response(listing(['bad/', 'good/']));
      if (url === base + 'bad/') throw new TypeError('connection reset');
      return response(listing(['clip.txt']));
    }));
    const result = await request(base, { mode: 'fetch', maxDepth: 1, continueOnError: true });
    expect(result.stats.fetches).toBe(3);
    expect(result.errorDetails).toEqual([expect.objectContaining({
      category: 'traversal', phase: 'fetch', code: 'network', url: base + 'bad/',
      cause: { name: 'TypeError', message: 'connection reset' }
    })]);
    expect(result.errors[0]).toContain('connection reset');
  });

  it('retains the original cause and URL on a fatal directory network error', async () => {
    const cause = new TypeError('connection reset');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));
    const error = await request(base, { mode: 'fetch' }).catch(error => error);
    expect(error.cause).toBe(cause);
    expect(error.details).toMatchObject({ phase: 'fetch', code: 'network', url: base });
    expect(error.message).toContain(base);
  });

  it('distinguishes directory processing failures from network failures during best-effort traversal', async () => {
    const parse = DOMParser.prototype.parseFromString;
    vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(function (html, type) {
      if (html === 'broken parser') throw new RangeError('parser failed');
      return parse.call(this, html, type);
    });
    vi.stubGlobal('fetch', vi.fn(async url => response(url === base ? listing(['bad/', 'good/'])
      : url === base + 'bad/' ? 'broken parser' : listing(['clip.txt']))));
    const result = await request(base, { mode: 'fetch', maxDepth: 1, continueOnError: true });
    expect(result.files.map(file => file.name)).toEqual(['clip.txt']);
    expect(result.stats.fetches).toBe(3);
    expect(result.errorDetails).toEqual([expect.objectContaining({ code: 'parse', phase: 'traversal', url: base + 'bad/',
      cause: { name: 'RangeError', message: 'parser failed' }
    })]);
  });

  it('keeps parser and request warnings aligned in both result arrays', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => init?.method === 'HEAD' ? new Response(null, { status: 503 })
      : response('<base href="http://[">' + '<table><tr><td><a href="clip.txt">clip</a></td><td>2026-02-31 12:00</td></tr></table>')));
    const result = await request(base, { mode: 'fetch', includeMime: true });
    expect(result.errorDetails.map(detail => detail.message)).toEqual(result.errors);
    expect(result.errorDetails).toEqual([
      expect.objectContaining({ category: 'url', code: 'parse', phase: 'parse', url: base }),
      expect.objectContaining({ category: 'date', code: 'parse', phase: 'parse', url: base }),
      expect.objectContaining({ category: 'mime', code: 'http', phase: 'head', url: base + 'clip.txt', status: 503 })
    ]);
  });

  it('counts failed HEAD attempts and distinguishes HTTP, unsupported method, and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (init?.method !== 'HEAD') return response(listing(['http.txt', 'unsupported.txt', 'network.txt']));
      if (String(url).endsWith('http.txt')) return new Response(null, { status: 503 });
      if (String(url).endsWith('unsupported.txt')) return new Response(null, { status: 405 });
      throw new TypeError('connection reset');
    }));
    const result = await request(base, { mode: 'fetch', includeMime: true, headConcurrency: 1 });
    expect(result.stats.heads).toBe(3);
    expect(result.errorDetails).toEqual([
      expect.objectContaining({ category: 'mime', phase: 'head', code: 'http', status: 503, url: base + 'http.txt' }),
      expect.objectContaining({ category: 'mime', phase: 'head', code: 'unsupported-method', status: 405, url: base + 'unsupported.txt' }),
      expect.objectContaining({ category: 'mime', phase: 'head', code: 'network', url: base + 'network.txt', cause: { name: 'TypeError', message: 'connection reset' } })
    ]);
    expect(result.errorDetails.map(detail => detail.message)).toEqual(result.errors);
  });

  it('reports HEAD timeouts separately and counts timed-out requests', async () => {
    vi.useFakeTimers();
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method !== 'HEAD') return response(listing(['clip.txt']));
      started();
      return await new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
    }));
    const pending = request(base, { mode: 'fetch', includeMime: true, timeoutMs: 100 });
    await ready;
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(result.stats.heads).toBe(1);
    expect(result.errorDetails[0]).toMatchObject({ phase: 'head', code: 'timeout', url: base + 'clip.txt' });
    expect(result.errors[0]).toContain('100ms');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves both causes when fetch and iframe fallback fail', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection reset')));
    const pending = request(base, { timeoutMs: 100 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    const error = await pending;
    expect(error.details).toMatchObject({ phase: 'iframe', code: 'timeout', url: base,
      previous: { phase: 'fetch', code: 'network', cause: { name: 'TypeError', message: 'connection reset' } }
    });
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });
});
