import { describe, it, expect } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';

describe('mime enrichment', () => {
  it('adds mime and size via HEAD', async () => {
    const rootHtml = `<!doctype html><pre><a href="file.bin">file.bin</a> 2024-03-01 12:00 -</pre>`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (resource: any, init?: any) => {
      const url = resource.toString();
      if (init?.method === 'HEAD') {
        return new Response('', { status: 200, headers: { 'content-type': 'application/octet-stream', 'content-length': '4096' } });
      }
      if (url.endsWith('/root/')) return new Response(rootHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response('', { status: 404 });
    };
    try {
      const res = await folderApiRequest('https://example.com/root/', { includeMime: true });
      expect(res.files[0].mime).toBe('application/octet-stream');
      expect(res.files[0].size).toBe(4096);
      expect(res.stats.heads).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

