import { describe, it, expect } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';

describe('decode errors', () => {
  it('captures decode error for malformed percent-encoding', async () => {
    const html = `<!doctype html><pre><a href="bad%E0%A4%file.txt">bad%E0%A4%file.txt</a> 2024-03-01 12:00 1K</pre>`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    try {
      const res = await folderApiRequest('https://example.com/root/');
      expect(res.errors.some(e => e.startsWith('decode:'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

