// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import type { folderApiRequest } from '../../src/folderApiRequest.js';
import type { FolderApiOptions } from '../../src/types.js';

declare global {
  interface Window {
    folderApiTestRequest: typeof folderApiRequest;
    cancelTest?: () => void;
  }
}

vi.setConfig({ testTimeout: 15000 });

const root = new URL('../../', import.meta.url);
const listing = '<ul><li><a href="clip.mp4">clip.mp4</a></li></ul>';
const fallbackLoads = new Map<string, number>();
const rejectedStreams = new Map<string, { closed: boolean }>();
const cacheListings = new Map<string, { file: string; requests: Array<{ url: string; destination: string }> }>();
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  const send = (type: string, body: string) => {
    response.setHeader('Content-Type', type);
    response.end(body);
  };
  if (url.pathname === '/') return send('text/html', '<!doctype html><body>Browser tests</body>');
  if (url.pathname === '/listing/') return send('text/html', listing);
  const cachedListing = cacheListings.get(url.pathname);
  if (cachedListing) {
    cachedListing.requests.push({ url: request.url || '', destination: String(request.headers['sec-fetch-dest'] || '') });
    response.setHeader('Cache-Control', 'public, max-age=3600');
    return send('text/html', '<ul><li><a href="' + cachedListing.file + '">' + cachedListing.file + '</a></li></ul>');
  }
  if (url.pathname === '/selector/html/') return send('text/html',
    '<nav><ul><li><a href="noise.txt">noise</a></li></ul></nav><main id="listing">' +
    '<a href="actual.txt">actual</a><ul><li><a href="second.txt">second</a></li></ul></main>');
  if (url.pathname === '/selector/escaped/') return send('text/html',
    '<main id="listing "><a href="actual.txt">actual</a></main><main id="listing"><a href="outside.txt">outside</a></main>');
  if (url.pathname === '/selector/xhtml/') return send('application/xhtml+xml',
    '<x:html xmlns:x="http://www.w3.org/1999/xhtml"><x:body>' +
    '<x:nav><x:ul><x:li><x:a href="noise.txt">noise</x:a></x:li></x:ul></x:nav>' +
    '<x:main id="listing"><x:a href="actual.txt">actual</x:a><x:ul><x:li><x:a href="second.txt">second</x:a>' +
    '</x:li></x:ul></x:main></x:body></x:html>');
  if (url.pathname === '/listing/clip.mp4') {
    response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': '123' });
    return response.end(request.method === 'HEAD' ? undefined : Buffer.alloc(123));
  }
  if (url.pathname === '/xhtml/') return send('application/xhtml+xml',
    '<x:html xmlns:x="http://www.w3.org/1999/xhtml"><x:body><x:table>' +
    '<x:tr><x:th>Name</x:th><x:th>Size</x:th></x:tr>' +
    '<x:tr><x:td><x:a href="clip.txt">clip</x:a></x:td><x:td>123</x:td></x:tr>' +
    '</x:table></x:body></x:html>');
  if (url.pathname === '/malformed-xhtml/') return send('application/xhtml+xml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><ul></body></html>');
  if (url.pathname === '/json/') return send('application/json', '{"file":"clip.txt"}');
  if (url.pathname === '/compressed/') {
    const body = gzipSync(listing + ' '.repeat(10000));
    response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip', 'Content-Length': body.length });
    return response.end(body);
  }
  if (url.pathname.startsWith('/fallback/')) {
    const count = (fallbackLoads.get(url.pathname) || 0) + 1;
    fallbackLoads.set(url.pathname, count);
    response.statusCode = count === 1 ? 503 : 200;
    response.setHeader('Cache-Control', 'no-store');
    return send('text/html', listing);
  }
  if (url.pathname === '/actual/') return send('text/html', '<base href="assets/">' + listing);
  if (url.pathname === '/redirect/') {
    response.writeHead(302, { location: '/actual/' });
    return response.end();
  }
  if (url.pathname === '/stream/') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.flushHeaders();
    response.write('<ul>');
    return;
  }
  if (url.pathname.startsWith('/rejected-stream/')) {
    if (url.searchParams.has('fallback') && rejectedStreams.has(url.pathname)) return send('text/html', listing);
    const state = { closed: false };
    rejectedStreams.set(url.pathname, state);
    response.on('close', () => { state.closed = true; });
    response.writeHead(url.searchParams.has('http') ? 403 : 200, {
      'Content-Type': url.searchParams.has('http') ? 'text/html' : 'application/json',
      'Cache-Control': 'no-store'
    });
    response.flushHeaders();
    response.write('streaming rejected response');
    return;
  }
  if (url.pathname.startsWith('/dist/') && url.pathname.endsWith('.js') || url.pathname === '/folder-api.cdn.js') {
    try { return send('text/javascript', readFileSync(fileURLToPath(new URL(url.pathname.slice(1), root)), 'utf8')); }
    catch { /* Missing modules are reported as HTTP failures below. */ }
  }
  response.writeHead(404);
  response.end();
});
let browser: Browser;
let origin: string;
let page: Page;

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing browser test server address');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.FOLDER_API_BROWSER_CHANNEL || undefined });
  page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(origin);
}, 30000);

afterAll(async () => {
  const closed = new Promise<void>(resolve => server.close(() => resolve()));
  server.closeAllConnections();
  try { await browser?.close(); }
  finally { await closed; }
}, 30000);

describe.each(['/dist/index.js', '/folder-api.cdn.js'])('%s real browser', modulePath => {
  beforeEach(async () => {
    await page.evaluate(() => { delete (window as Partial<Window>).folderApiTestRequest; });
    await page.addScriptTag({ type: 'module', content: `import { folderApiRequest } from ${JSON.stringify(modulePath)}; window.folderApiTestRequest = folderApiRequest;` });
    await page.waitForFunction(() => typeof window.folderApiTestRequest === 'function');
  });

  it('loads a real sandboxed iframe and removes it after success', async () => {
    const result = await page.evaluate(async () => {
      const folderApiRequest = window.folderApiTestRequest;
      const result = await folderApiRequest(location.origin + '/listing/', { mode: 'iframe' });
      return { files: result.files.map((file: { name: string }) => file.name), stats: result.stats, frames: document.querySelectorAll('iframe').length };
    });
    expect(result.files).toEqual(['clip.mp4']);
    expect(result.stats).toMatchObject({ fetches: 0, iframes: 1 });
    expect(result.frames).toBe(0);
  });

  it('falls back to a real iframe after a failed fetch', async () => {
    const result = await page.evaluate(async path => {
      const result = await window.folderApiTestRequest(location.origin + path, { mode: 'auto' });
      return { files: result.files.map(file => file.name), stats: result.stats, frames: document.querySelectorAll('iframe').length };
    }, '/fallback/' + encodeURIComponent(modulePath) + '/');
    expect(result.files).toEqual(['clip.mp4']);
    expect(result.stats).toMatchObject({ fetches: 1, iframes: 1 });
    expect(result.frames).toBe(0);
  });

  it('preserves a real HTTP failure with a non-default cache policy without navigating', async () => {
    const path = '/fallback/cache-policy/' + encodeURIComponent(modulePath) + '/';
    const result = await page.evaluate(async path => {
      try {
        await window.folderApiTestRequest(location.origin + path, { mode: 'auto', cache: 'reload' });
        return { code: 'unexpected success' };
      } catch (error) {
        const failure = error as Error & { details: { code: string; phase: string; status?: number; previous?: unknown } };
        return { ...failure.details, frames: document.querySelectorAll('iframe').length };
      }
    }, path);
    expect(result).toMatchObject({ code: 'http', phase: 'fetch', status: 503, frames: 0 });
    expect(result).not.toHaveProperty('previous');
    expect(fallbackLoads.get(path)).toBe(1);
  });

  it('preserves no-store through a fetch failure with an old navigation cache entry and recovers', async () => {
    const pathname = '/cache-policy/' + encodeURIComponent(modulePath) + '/';
    const path = pathname + '?view=files';
    const state = { file: 'old.txt', requests: [] as Array<{ url: string; destination: string }> };
    cacheListings.set(pathname, state);
    let attachedFrames = 0;
    const onFrame = () => { attachedFrames++; };
    page.on('frameattached', onFrame);
    const load = (options: FolderApiOptions) => page.evaluate(async ({ path, options }) => {
      const result = await window.folderApiTestRequest(location.origin + path, options);
      return { files: result.files.map(file => file.name), stats: result.stats, frames: document.querySelectorAll('iframe').length };
    }, { path, options });
    // Override fetch without routing so Chromium's HTTP cache stays enabled.
    const failFetch = (cache: RequestCache) => page.evaluate(async ({ path, cache }) => {
      const originalFetch = window.fetch;
      const cause = new TypeError('forced cache-policy fetch failure');
      window.fetch = async () => { throw cause; };
      try {
        const result = await window.folderApiTestRequest(location.origin + path, { mode: 'auto', cache });
        return { ok: true, files: result.files.map(file => file.name), stats: result.stats, frames: document.querySelectorAll('iframe').length };
      } catch (error) {
        const failure = error as Error & { cause?: unknown; details?: { code: string; phase: string; url: string; previous?: unknown } };
        return { ok: false, sameCause: failure.cause === cause, details: failure.details, frames: document.querySelectorAll('iframe').length };
      } finally { window.fetch = originalFetch; }
    }, { path, cache });
    try {
      expect(await load({ mode: 'iframe' })).toMatchObject({ files: ['old.txt'], stats: { fetches: 0, iframes: 1 }, frames: 0 });
      expect(state.requests).toEqual([{ url: path, destination: 'iframe' }]);
      expect(attachedFrames).toBe(1);

      state.file = 'new.txt';
      expect(await load({ mode: 'auto', cache: 'no-store' })).toMatchObject({ files: ['new.txt'], stats: { fetches: 1, iframes: 0 }, frames: 0 });
      expect(state.requests).toEqual([{ url: path, destination: 'iframe' }, { url: path, destination: 'empty' }]);
      expect(attachedFrames).toBe(1);

      expect(await load({ mode: 'iframe' })).toMatchObject({ files: ['old.txt'], stats: { fetches: 0, iframes: 1 }, frames: 0 });
      expect(state.requests).toHaveLength(2);
      expect(attachedFrames).toBe(2);

      const failed = await failFetch('no-store');
      expect(failed).toMatchObject({ ok: false, sameCause: true, details: { code: 'network', phase: 'fetch', url: origin + path }, frames: 0 });
      expect(failed).not.toHaveProperty('details.previous');
      expect(state.requests).toHaveLength(2);
      expect(attachedFrames).toBe(2);

      state.file = 'recovered.txt';
      expect(await load({ mode: 'auto', cache: 'no-store' })).toMatchObject({ files: ['recovered.txt'], stats: { fetches: 1, iframes: 0 }, frames: 0 });
      expect(state.requests).toEqual([
        { url: path, destination: 'iframe' }, { url: path, destination: 'empty' }, { url: path, destination: 'empty' }
      ]);
      expect(attachedFrames).toBe(2);

      expect(await failFetch('default')).toMatchObject({ ok: true, files: ['old.txt'], stats: { fetches: 1, iframes: 1 }, frames: 0 });
      expect(state.requests).toHaveLength(3);
      expect(attachedFrames).toBe(3);
    } finally {
      page.off('frameattached', onFrame);
      cacheListings.delete(pathname);
    }
  });

  it.each(['no-store', 'no-cache', 'reload', 'force-cache', 'only-if-cached'] as const)('rejects iframe mode with non-default cache policy %s before navigation', async cache => {
    const path = '/cache-policy/validation/' + encodeURIComponent(modulePath) + '/' + cache + '/';
    const state = { file: 'clip.txt', requests: [] as Array<{ url: string; destination: string }> };
    cacheListings.set(path, state);
    try {
      const result = await page.evaluate(async ({ path, cache }) => {
        try {
          await window.folderApiTestRequest(location.origin + path, { mode: 'iframe', cache });
          return { name: 'unexpected success', message: '', frames: document.querySelectorAll('iframe').length };
        } catch (error) {
          return { name: (error as Error).name, message: (error as Error).message, frames: document.querySelectorAll('iframe').length };
        }
      }, { path, cache });
      expect(result).toMatchObject({ name: 'TypeError', frames: 0 });
      expect(result.message).toContain("mode: 'iframe'");
      expect(result.message).toContain("cache: '" + cache + "'");
      expect(result.message).toContain("cache: 'default'");
      expect(state.requests).toEqual([]);
    } finally { cacheListings.delete(path); }
  });

  it.each(['fetch', 'iframe'])('resolves redirects and base elements in %s mode', async mode => {
    const result = await page.evaluate(async mode => {
      const folderApiRequest = window.folderApiTestRequest;
      const result = await folderApiRequest(location.origin + '/redirect/', { mode });
      return { url: result.url, file: result.files[0].url, frames: document.querySelectorAll('iframe').length };
    }, mode);
    expect(result).toEqual({ url: origin + '/actual/', file: origin + '/actual/assets/clip.mp4', frames: 0 });
  });

  it.each([['auto', 'default'], ['auto', 'no-store'], ['iframe', 'default']] as const)('cancels active %s loading with cache %s without leaking a frame or starting fallback', async (mode, cache) => {
    const sent = page.waitForResponse(response => response.url() === origin + '/stream/');
    const pending = page.evaluate(async ({ mode, cache }) => {
      const folderApiRequest = window.folderApiTestRequest;
      const controller = new AbortController();
      const reason = { message: 'browser cancellation' };
      window.cancelTest = () => controller.abort(reason);
      try {
        await folderApiRequest(location.origin + '/stream/', { mode, cache, signal: controller.signal });
        return { cancelled: false, frames: document.querySelectorAll('iframe').length };
      } catch (error) {
        return { cancelled: error === reason, frames: document.querySelectorAll('iframe').length };
      } finally { delete window.cancelTest; }
    }, { mode, cache }).catch(error => ({ error: String(error) }));
    try {
      await sent;
      await page.evaluate(() => window.cancelTest?.());
      expect(await pending).toEqual({ cancelled: true, frames: 0 });
    } finally {
      await page.evaluate(() => window.cancelTest?.());
    }
  });

  it.each([['fetch', 'default'], ['auto', 'no-store']] as const)('times out while reading a real streaming response body in %s mode with cache %s', async (mode, cache) => {
    const result = await page.evaluate(async ({ mode, cache }) => {
      const folderApiRequest = window.folderApiTestRequest;
      try {
        await folderApiRequest(location.origin + '/stream/', { mode, cache, timeoutMs: 100 });
        return { name: 'unexpected success' };
      } catch (error) {
        const failure = error as Error & { details: { phase: string; previous?: unknown } };
        return { name: failure.name, phase: failure.details.phase, previous: failure.details.previous, frames: document.querySelectorAll('iframe').length };
      }
    }, { mode, cache });
    expect(result).toEqual({ name: 'TimeoutError', phase: 'fetch', previous: undefined, frames: 0 });
  });

  it.each(['http', 'content-type'])('closes a real rejected %s response before its body finishes', async kind => {
    const path = '/rejected-stream/' + encodeURIComponent(modulePath) + '/' + kind + '/';
    const result = await page.evaluate(async ({ path, kind }) => {
      try {
        await window.folderApiTestRequest(location.origin + path + (kind === 'http' ? '?http' : ''), { mode: 'fetch' });
        return 'unexpected success';
      } catch (error) {
        return (error as Error & { details: { code: string } }).details.code;
      }
    }, { path, kind });
    expect(result).toBe(kind === 'http' ? 'http' : 'content-type');
    await vi.waitFor(() => expect(rejectedStreams.get(path)?.closed).toBe(true), { timeout: 2000 });
  });

  it('closes a rejected fetch stream while real iframe fallback succeeds', async () => {
    const path = '/rejected-stream/' + encodeURIComponent(modulePath) + '/fallback/';
    const result = await page.evaluate(async path => {
      const result = await window.folderApiTestRequest(location.origin + path + '?http&fallback');
      return { files: result.files.map(file => file.name), stats: result.stats, frames: document.querySelectorAll('iframe').length };
    }, path);
    expect(result.files).toEqual(['clip.mp4']);
    expect(result.stats).toMatchObject({ fetches: 1, iframes: 1 });
    expect(result.frames).toBe(0);
    await vi.waitFor(() => expect(rejectedStreams.get(path)?.closed).toBe(true), { timeout: 2000 });
  });

  it.each(['fetch', 'iframe'] as const)('parses real prefixed XHTML in %s mode', async mode => {
    const result = await page.evaluate(async mode => {
      const result = await window.folderApiTestRequest(location.origin + '/xhtml/', { mode, includeProvenance: true });
      return result.files[0];
    }, mode);
    expect(result).toMatchObject({ url: origin + '/xhtml/clip.txt', size: 123,
      provenance: { size: { source: 'listing', raw: '123', precision: 'exact' } } });
  });

  it.each(['fetch', 'iframe'] as const)('rejects malformed real XHTML in %s mode', async mode => {
    const code = await page.evaluate(async mode => {
      try { await window.folderApiTestRequest(location.origin + '/malformed-xhtml/', { mode }); return 'unexpected success'; }
      catch (error) { return (error as Error & { details: { code: string } }).details.code; }
    }, mode);
    expect(code).toBe('parse');
  });

  it('rejects unsupported iframe document content types and cleans up the frame', async () => {
    const result = await page.evaluate(async () => {
      try { await window.folderApiTestRequest(location.origin + '/json/', { mode: 'iframe' }); return { code: 'unexpected success' }; }
      catch (error) { return { code: (error as Error & { details: { code: string } }).details.code, frames: document.querySelectorAll('iframe').length }; }
    });
    expect(result).toEqual({ code: 'content-type', frames: 0 });
  });

  it('limits decompressed response bytes without starting iframe fallback', async () => {
    const result = await page.evaluate(async () => {
      let frames = 0;
      const observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLIFrameElement) frames++;
      });
      observer.observe(document.body, { childList: true });
      try { await window.folderApiTestRequest(location.origin + '/compressed/', { maxResponseBytes: 512 }); return { code: 'unexpected success' }; }
      catch (error) { return { code: (error as Error & { details: { code: string } }).details.code, frames }; }
      finally { observer.disconnect(); }
    });
    expect(result).toEqual({ code: 'response-limit', frames: 0 });
  });

  it('checks serialized iframe bytes before parsing and removes oversized frames', async () => {
    const result = await page.evaluate(async () => {
      try { await window.folderApiTestRequest(location.origin + '/listing/', { mode: 'iframe', maxResponseBytes: 16 }); return { code: 'unexpected success' }; }
      catch (error) { return { code: (error as Error & { details: { code: string } }).details.code, frames: document.querySelectorAll('iframe').length }; }
    });
    expect(result).toEqual({ code: 'response-limit', frames: 0 });
  });

  it('adds real HEAD provenance to the shared file entries', async () => {
    const result = await page.evaluate(async () => {
      const result = await window.folderApiTestRequest(location.origin + '/listing/', { mode: 'fetch', includeMime: true, includeProvenance: true });
      return { file: result.files[0], same: result.root.files[0] === result.files[0], heads: result.stats.heads };
    });
    expect(result).toMatchObject({ heads: 1, same: true, file: { size: 123, mime: 'video/mp4', provenance: {
      size: { source: 'head', raw: '123', precision: 'exact' }, mime: { source: 'head', raw: 'video/mp4' }
    } } });
  });

  it.each([
    ['fetch', 'html'], ['iframe', 'html'], ['fetch', 'xhtml'], ['iframe', 'xhtml']
  ] as const)('scopes links in real %s %s listings', async (mode, type) => {
    const result = await page.evaluate(async ({ mode, type }) => {
      const result = await window.folderApiTestRequest(location.origin + '/selector/' + type + '/', { mode, listingSelector: '#listing' });
      return { files: result.files.map(file => file.name), frames: document.querySelectorAll('iframe').length };
    }, { mode, type });
    expect(result).toEqual({ files: ['actual.txt', 'second.txt'], frames: 0 });
  });

  it.each(['#missing', '['])('rejects the real selector %s without expanding the discovery scope', async listingSelector => {
    const result = await page.evaluate(async listingSelector => {
      try {
        await window.folderApiTestRequest(location.origin + '/selector/html/', { listingSelector });
        return { code: 'unexpected success' };
      } catch (error) {
        const failure = error as Error & { details: { code: string; phase: string } };
        return { code: failure.details.code, phase: failure.details.phase, frames: document.querySelectorAll('iframe').length };
      }
    }, listingSelector);
    expect(result).toEqual({ code: 'parse', phase: 'parse', frames: 0 });
  });

  it('preserves escaped whitespace in CSS identifiers', async () => {
    const files = await page.evaluate(async () => {
      const result = await window.folderApiTestRequest(location.origin + '/selector/escaped/', {
        mode: 'fetch', listingSelector: '#' + CSS.escape('listing ')
      });
      return result.files.map(file => file.name);
    });
    expect(files).toEqual(['actual.txt']);
  });
});
