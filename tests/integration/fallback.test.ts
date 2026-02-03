import { describe, it, expect, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';

vi.mock('../../src/core/fetchDirectory.ts', () => ({
  fetchDirectoryHtml: async () => { throw new Error('network'); }
}));

vi.mock('../../src/core/iframeDirectory.ts', () => ({
  iframeDirectoryHtml: async (_url: string, _opts: any, stats: any) => {
    if (stats) stats.iframes++;
    return '<html><body><pre><a href="file.txt">file.txt</a> 2024-03-01 12:00 1K</pre></body></html>';
  }
}));

describe('iframe fallback', () => {
  it('falls back in auto mode', async () => {
    const res = await folderApiRequest('https://example.com/root/', { mode: 'auto' });
    expect(res.files.length).toBe(1);
    expect(res.stats.iframes).toBe(1);
  });
});

