import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';
import { folderApiRequest as browserRequest } from '../../folder-api.cdn.js';

const base = 'https://example.test/root/';
const headers = { 'Content-Type': 'text/html' };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each([['TypeScript', folderApiRequest], ['browser bundle', browserRequest]] as const)('%s directory response limits', (_name, request) => {
  it('defaults to 4 MiB and allows an explicitly larger response budget', async () => {
    const html = '<ul><li><a href="clip.txt">clip</a></li></ul>' + ' '.repeat(4 * 1024 * 1024);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { headers })));
    const error = await request(base, { mode: 'fetch' }).catch(error => error);
    expect(error.details).toMatchObject({ category: 'limit', code: 'response-limit', phase: 'fetch', url: base });
    expect(error.message).toContain('4194304');
    const result = await request(base, { mode: 'fetch', maxResponseBytes: 5 * 1024 * 1024 });
    expect(result.files[0].name).toBe('clip.txt');
  });

  it('accepts the exact limit and counts UTF-8 bytes across split characters', async () => {
    const html = '<ul><li><a href="%C3%A9.txt">é</a></li></ul>';
    const bytes = new TextEncoder().encode(html);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      }
    }), { headers })));
    const result = await request(base, { mode: 'fetch', maxResponseBytes: bytes.length });
    expect(result.files[0].name).toBe('é.txt');
    await expect(request(base, { mode: 'fetch', maxResponseBytes: bytes.length - 1 })).rejects.toMatchObject({ details: { code: 'response-limit' } });
  });

  it('stops reading an oversized stream, cancels it, and never starts iframe fallback', async () => {
    const cancel = vi.fn();
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      pull(controller) { reads++; controller.enqueue(new Uint8Array(100)); }, cancel
    }), { headers: { ...headers, 'Content-Length': '1' } })));
    const create = vi.spyOn(document, 'createElement');
    await expect(request(base, { maxResponseBytes: 150 })).rejects.toMatchObject({ details: { code: 'response-limit' } });
    expect(reads).toBeLessThanOrEqual(3);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('measures the body rather than trusting an oversized Content-Length header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<ul/>', { headers: { ...headers, 'Content-Length': '9999999' } })));
    const result = await request(base, { mode: 'fetch', maxResponseBytes: 5 });
    expect(result.files).toEqual([]);
  });

  it('applies the budget separately to each directory and retains readable children in best-effort mode', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => new Response(url === base
      ? '<ul><li><a href="bad/">bad</a></li><li><a href="good/">good</a></li></ul>'
      : url === base + 'bad/' ? ' '.repeat(101) : '<ul><li><a href="clip.txt">clip</a></li></ul>', { headers })));
    const result = await request(base, { mode: 'fetch', maxDepth: 1, maxResponseBytes: 100, continueOnError: true });
    expect(result.files[0].name).toBe('clip.txt');
    expect(result.stats.fetches).toBe(3);
    expect(result.errorDetails[0]).toMatchObject({ category: 'traversal', code: 'response-limit', url: base + 'bad/' });
  });
});
