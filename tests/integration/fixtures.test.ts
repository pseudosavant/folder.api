import { describe, it, expect } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';

async function runWithHtml(html: string, options: Parameters<typeof folderApiRequest>[1] = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  try {
    return await folderApiRequest('https://example.com/root/', { maxDepth: 0, ...options });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe('listing fixtures', () => {
  it('parses Apache-style table listings', async () => {
    const html = `<!doctype html><html><body>
    <table>
      <tr><th>Name</th><th>Last modified</th><th>Size</th></tr>
      <tr><td><a href="file1.txt">file1.txt</a></td><td>01-Mar-2024 12:00</td><td>123</td></tr>
      <tr><td><a href="sub/">sub/</a></td><td>01-Mar-2024 12:01</td><td>-</td></tr>
    </table>
    </body></html>`;
    const res = await runWithHtml(html);
    const file = res.root.files.find(f => f.name === 'file1.txt');
    expect(file?.size).toBe(123);
    expect(res.root.children.some(c => c.url.endsWith('/sub/'))).toBe(true);
  });

  it('parses Nginx-style pre listings', async () => {
    const html = `<!doctype html><html><body><pre>
    <a href="image.png">image.png</a> 2024-03-01 12:00 2K
    <a href="sub/">sub/</a> 2024-03-01 12:01 -
    </pre></body></html>`;
    const res = await runWithHtml(html);
    const file = res.root.files.find(f => f.name === 'image.png');
    expect(file?.size).toBe(2048);
    expect(res.root.children.some(c => c.url.endsWith('/sub/'))).toBe(true);
  });

  it('parses IIS-style pre listings with AM/PM and <dir>', async () => {
    const html = `<!doctype html><html><body><pre>
    <A HREF="../">[To Parent Directory]</A><br><br>
    03/01/2024 12:00 PM        &lt;dir&gt; <A HREF="sub/">sub</A><br>
    03/01/2024 12:01 PM          931 <A HREF="file.txt">file.txt</A><br>
    </pre></body></html>`;
    const res = await runWithHtml(html);
    const file = res.root.files.find(f => f.name === 'file.txt');
    expect(file?.size).toBe(931);
    expect(res.root.children.some(c => c.url.endsWith('/sub/'))).toBe(true);
  });

  it('parses Caddy-style table listings', async () => {
    const html = `<!doctype html><html><body>
    <table>
      <tr><th>Name</th><th>Size</th><th>Modified</th></tr>
      <tr><td><a href="doc.md">doc.md</a></td><td>4K</td><td>2024-03-01 12:00</td></tr>
      <tr><td><a href="sub/">sub/</a></td><td>-</td><td>2024-03-01 12:01</td></tr>
    </table>
    </body></html>`;
    const res = await runWithHtml(html);
    const file = res.root.files.find(f => f.name === 'doc.md');
    expect(file?.size).toBe(4096);
    expect(res.root.children.some(c => c.url.endsWith('/sub/'))).toBe(true);
  });

  it('filters cross-origin links by default', async () => {
    const html = `<!doctype html><html><body><pre>
    <a href="https://other.example.com/file.txt">file.txt</a> 2024-03-01 12:00 1K
    </pre></body></html>`;
    const res = await runWithHtml(html);
    expect(res.files.length).toBe(0);
  });

  it('allows cross-origin links when sameOriginOnly=false', async () => {
    const html = `<!doctype html><html><body><pre>
    <a href="https://other.example.com/file.txt">file.txt</a> 2024-03-01 12:00 1K
    </pre></body></html>`;
    const res = await runWithHtml(html, { sameOriginOnly: false });
    expect(res.files.length).toBe(1);
  });
});

