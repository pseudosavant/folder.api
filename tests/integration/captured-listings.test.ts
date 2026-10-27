import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';
import { folderApiRequest as browserRequest } from '../../folder-api.cdn.js';

afterEach(() => vi.unstubAllGlobals());

describe.each([['TypeScript', folderApiRequest], ['browser bundle', browserRequest]] as const)('%s captured listings', (_name, request) => {
  it('ignores Apache sort controls and retains file metadata', async () => {
    const html = readFileSync(resolve('server/apache-fancy/index.html'), 'utf8');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } })));
    const result = await request('https://example.test/server/', { mode: 'fetch' });
    expect(result.files.map(file => file.name)).toEqual(['Red.png', 'long filename.jpg', 'test - 123.html', 'web.config']);
    expect(result.files.map(file => file.size)).toEqual([150, 931, 696, 168]);
    expect(result.files.every(file => file.date !== null)).toBe(true);
  });

  it('reads IIS date fields with irregular spaces', async () => {
    const html = readFileSync(resolve('server/iis/index.html'), 'utf8');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } })));
    const result = await request('https://example.test/server/', { mode: 'fetch' });
    expect(result.files).toHaveLength(4);
    expect(result.files.every(file => file.date !== null && file.size !== null)).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reads Deno size columns without confusing the mode column for metadata', async () => {
    const html = readFileSync(resolve('server/deno/index.html'), 'utf8');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } })));
    const result = await request('http://127.0.0.1:4000/', { mode: 'fetch' });
    expect(result.files.map(file => file.size)).toEqual([18, Math.floor(3.17 * 1024 ** 2), Math.floor(8.92 * 1024 ** 2), Math.floor(1.06 * 1024), Math.floor(3.98 * 1024)]);
    expect(result.files.every(file => file.date === null)).toBe(true);
  });
});
