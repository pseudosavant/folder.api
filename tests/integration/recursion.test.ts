import { describe, it, expect } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';

describe('recursion', () => {
  it('respects maxDepth 0 (no child traversal)', async () => {
    const rootHtml = `<!doctype html><pre><a href="sub/">sub/</a> 2024-03-01 12:00 -</pre>`;
    const subHtml = `<!doctype html><pre><a href="file.txt">file.txt</a> 2024-03-01 12:00 1K</pre>`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (resource: any, init?: any) => {
      const url = resource.toString();
      if (init?.method === 'HEAD') return new Response('', { status: 200 });
      if (url.endsWith('/root/')) return new Response(rootHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      if (url.endsWith('/root/sub/')) return new Response(subHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response('', { status: 404 });
    };
    try {
      const res = await folderApiRequest('https://example.com/root/', { maxDepth: 0 });
      expect(res.root.children.length).toBe(1); // child listed
      // but child not traversed => has no files
      expect(res.root.children[0].files.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it('traverses child at depth 1', async () => {
    const rootHtml = `<!doctype html><pre><a href="sub/">sub/</a> 2024-03-01 12:00 -</pre>`;
    const subHtml = `<!doctype html><pre><a href="file.txt">file.txt</a> 2024-03-01 12:00 1K</pre>`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (resource: any, init?: any) => {
      const url = resource.toString();
      if (init?.method === 'HEAD') return new Response('', { status: 200 });
      if (url.endsWith('/root/')) return new Response(rootHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      if (url.endsWith('/root/sub/')) return new Response(subHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response('', { status: 404 });
    };
    try {
      const res = await folderApiRequest('https://example.com/root/', { maxDepth: 1 });
      expect(res.root.children[0].files.length).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

