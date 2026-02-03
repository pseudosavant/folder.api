import { describe, it, expect, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';

vi.mock('../../src/core/iframeDirectory.ts', () => ({
  iframeDirectoryHtml: async (_url: string, _opts: any, stats: any) => {
    if (stats) stats.iframes++;
    return '<html><body><pre><a href="file.txt">file.txt</a> 2024-03-01 12:00 1K</pre></body></html>';
  }
}));

// Ensure fetch path is never called in iframe mode.
vi.mock('../../src/core/fetchDirectory.ts', () => ({
  fetchDirectoryHtml: async () => { throw new Error('should not fetch in iframe mode'); }
}));

describe('iframe mode only', () => {
  it('loads listing via iframe when mode=iframe', async () => {
    const res = await folderApiRequest('https://example.com/root/', { mode: 'iframe' });
    expect(res.files.length).toBe(1);
    expect(res.stats.iframes).toBe(1);
    expect(res.stats.fetches).toBe(0);
  });
});

