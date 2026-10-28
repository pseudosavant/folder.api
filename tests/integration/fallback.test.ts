import { describe, it, expect, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';

const { fetchFailure } = vi.hoisted(() => ({ fetchFailure: new Error('network') }));

vi.mock('../../src/core/fetchDirectory.ts', () => ({
  fetchDirectoryHtml: async () => { throw fetchFailure; }
}));

vi.mock('../../src/core/iframeDirectory.ts', () => ({
  iframeDirectoryHtml: async (_url: string, _opts: any, stats: any) => {
    if (stats) stats.iframes++;
    return { html: '<html><body><pre><a href="file.txt">file.txt</a> 2024-03-01 12:00 1K</pre></body></html>', url: _url };
  }
}));

describe('iframe fallback', () => {
  it.each(['no-store', 'no-cache', 'reload', 'force-cache', 'only-if-cached'] as const)('preserves the fetch failure for non-default cache policy %s', async cache => {
    await expect(folderApiRequest('https://example.com/root/', { mode: 'auto', cache })).rejects.toBe(fetchFailure);
  });

  it('falls back in auto mode', async () => {
    const res = await folderApiRequest('https://example.com/root/', { mode: 'auto' });
    expect(res.files.length).toBe(1);
    expect(res.stats.iframes).toBe(1);
  });
});

