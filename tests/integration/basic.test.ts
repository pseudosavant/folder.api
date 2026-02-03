import { describe, it, expect } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';

// This is a lightweight integration using inline HTML via data URL to avoid external servers.

describe('folderApiRequest basic', () => {
  it('parses simple directory listing', async () => {
    const html = `<!doctype html><html><body><pre>
<a href="file1.txt">file1.txt</a> 2024-03-01 12:00 1K
<a href="sub/">sub/</a> 2024-03-01 12:01 -
</pre></body></html>`;
    const url = 'https://example.com/root/';
    // mock fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (resource: RequestInfo | URL) => {
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    };
    try {
      const res = await folderApiRequest(url, { maxDepth: 1 });
      expect(res.root.files.length).toBe(1);
      expect(res.root.children.length).toBe(1);
      expect(res.files[0].size).toBe(1024);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

