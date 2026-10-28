import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';
import { folderApiRequest as browserRequest } from '../../folder-api.cdn.js';

const base = 'https://example.test/root/';
const response = (html = '') => new Response(html, { headers: { 'Content-Type': 'text/html' } });
const waitForAbort = (signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.querySelectorAll('iframe').forEach(frame => frame.remove());
});

describe.each([['TypeScript', folderApiRequest], ['browser bundle', browserRequest]] as const)('%s request lifecycle', (_name, request) => {
  it.each([
    ['cancel', 'auto', 'default'], ['cancel', 'auto', 'no-store'],
    ['timeout', 'fetch', 'default'], ['timeout', 'auto', 'no-store']
  ] as const)('handles %s in %s mode with cache %s while reading a directory response body', async (action, mode, cache) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = new Error('stop body reading');
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    let bodyStarted!: () => void;
    const ready = new Promise<void>(resolve => { bodyStarted = resolve; });
    const fetchMock = vi.fn(async (_url, init) => {
      const res = new Response(new ReadableStream({
        start(stream) {
          init.signal.addEventListener('abort', () => stream.error(init.signal.reason), { once: true });
        }
      }), { headers: { 'Content-Type': 'text/html' } });
      const getReader = res.body!.getReader.bind(res.body);
      vi.spyOn(res.body!, 'getReader').mockImplementation(() => {
        bodyStarted();
        return getReader();
      });
      return res;
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = request(base, { mode, cache, timeoutMs: 100, signal: controller.signal }).catch(error => error);
    await ready;
    if (action === 'cancel') controller.abort(reason);
    else await vi.advanceTimersByTimeAsync(100);
    const error = await pending;
    if (action === 'cancel') expect(error).toBe(reason);
    else expect(error).toMatchObject({ name: 'TimeoutError', details: { code: 'timeout', phase: 'fetch' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    expect(remove.mock.calls).toEqual(add.mock.calls.map(([type, callback]) => [type, callback]));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['cancel', 'timeout'] as const)('cleans up an iframe after %s', async action => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = { message: 'custom iframe cancellation' };
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = request(base, { mode: 'iframe', timeoutMs: 100, signal: controller.signal }).catch(error => error);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    if (action === 'cancel') controller.abort(reason);
    else await vi.advanceTimersByTimeAsync(100);
    const error = await pending;
    if (action === 'cancel') expect(error).toBe(reason);
    else expect(error).toMatchObject({ name: 'TimeoutError', details: { phase: 'iframe', code: 'timeout', url: base } });
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    expect(remove.mock.calls).toEqual(add.mock.calls.map(([type, callback]) => [type, callback]));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up a timed-out HEAD and continues with queued enrichment', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    let headStarted!: () => void;
    const ready = new Promise<void>(resolve => { headStarted = resolve; });
    let heads = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method !== 'HEAD') return response('<ul><li><a href="one.mp4">one</a></li><li><a href="two.mp4">two</a></li></ul>');
      if (++heads === 1) {
        headStarted();
        return await waitForAbort(init.signal);
      }
      return new Response(null, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '123' } });
    }));
    const pending = request(base, { mode: 'fetch', includeMime: true, headConcurrency: 1, timeoutMs: 100, signal: controller.signal });
    await ready;
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(heads).toBe(2);
    expect(result.stats.heads).toBe(2);
    expect(result.files.map(file => file.size)).toEqual([null, 123]);
    expect(result.errors).toEqual(['mime: HEAD ' + base + 'one.mp4 timed out after 100ms']);
    expect(remove.mock.calls).toEqual(add.mock.calls.map(([type, callback]) => [type, callback]));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves a custom HEAD cancellation reason and does not start queued requests', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = new Error('stop enrichment');
    let headStarted!: () => void;
    const ready = new Promise<void>(resolve => { headStarted = resolve; });
    let heads = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method !== 'HEAD') return response('<ul><li><a href="one.mp4">one</a></li><li><a href="two.mp4">two</a></li></ul>');
      heads++;
      headStarted();
      return await waitForAbort(init.signal);
    }));
    const pending = request(base, { mode: 'fetch', includeMime: true, headConcurrency: 1, signal: controller.signal, continueOnError: true }).catch(error => error);
    await ready;
    controller.abort(reason);
    expect(await pending).toBe(reason);
    expect(heads).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
