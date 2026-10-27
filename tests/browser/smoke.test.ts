// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import type { folderApiRequest } from '../../src/folderApiRequest.js';

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
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  const send = (type: string, body: string) => {
    response.setHeader('Content-Type', type);
    response.end(body);
  };
  if (url.pathname === '/') return send('text/html', '<!doctype html><body>Browser tests</body>');
  if (url.pathname === '/listing/') return send('text/html', listing);
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
  await browser?.close();
  const closed = new Promise<void>(resolve => server.close(() => resolve()));
  server.closeAllConnections();
  await closed;
});

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

  it.each(['fetch', 'iframe'])('resolves redirects and base elements in %s mode', async mode => {
    const result = await page.evaluate(async mode => {
      const folderApiRequest = window.folderApiTestRequest;
      const result = await folderApiRequest(location.origin + '/redirect/', { mode });
      return { url: result.url, file: result.files[0].url, frames: document.querySelectorAll('iframe').length };
    }, mode);
    expect(result).toEqual({ url: origin + '/actual/', file: origin + '/actual/assets/clip.mp4', frames: 0 });
  });

  it.each(['auto', 'iframe'])('cancels active %s loading without leaking a frame or starting fallback', async mode => {
    const sent = page.waitForResponse(response => response.url() === origin + '/stream/');
    const pending = page.evaluate(async mode => {
      const folderApiRequest = window.folderApiTestRequest;
      const controller = new AbortController();
      const reason = { message: 'browser cancellation' };
      window.cancelTest = () => controller.abort(reason);
      try {
        await folderApiRequest(location.origin + '/stream/', { mode, signal: controller.signal });
        return { cancelled: false, frames: document.querySelectorAll('iframe').length };
      } catch (error) {
        return { cancelled: error === reason, frames: document.querySelectorAll('iframe').length };
      } finally { delete window.cancelTest; }
    }, mode).catch(error => ({ error: String(error) }));
    try {
      await sent;
      await page.evaluate(() => window.cancelTest?.());
      expect(await pending).toEqual({ cancelled: true, frames: 0 });
    } finally {
      await page.evaluate(() => window.cancelTest?.());
    }
  });

  it('times out while reading a real streaming response body', async () => {
    const result = await page.evaluate(async () => {
      const folderApiRequest = window.folderApiTestRequest;
      try {
        await folderApiRequest(location.origin + '/stream/', { mode: 'fetch', timeoutMs: 100 });
        return 'unexpected success';
      } catch (error) { return (error as Error).name; }
    });
    expect(result).toBe('TimeoutError');
  });
});
