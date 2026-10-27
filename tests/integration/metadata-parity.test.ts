import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';
import { folderApiRequest as browserRequest } from '../../folder-api.cdn.js';

const date = '2026-10-23T12:34:00.000Z';
const fixtures = [
  {
    name: 'Python lists without metadata',
    html: '<ul><li><a href="Track%2003.mp3">Track 03.mp3</a></li><li><a href="2026-10-23%2012%3A34.mp4">2026-10-23 12:34.mp4</a></li></ul>',
    expected: [{ size: null, date: null }, { size: null, date: null }]
  },
  {
    name: 'Apache tables',
    html: '<table><tr><td><a href="clip99.mp4">clip99.mp4</a></td><td>23-Oct-2026 12:34</td><td>1.5M</td></tr><tr><td><a href="unknown3.mp3">unknown3.mp3</a></td><td>23-Oct-2026 12:34</td><td>-</td></tr></table>',
    expected: [{ size: 1572864, date }, { size: null, date }]
  },
  {
    name: 'nginx preformatted lines',
    html: '<pre><a href="clip12.webm">clip12.webm</a> 2026-10-23 12:34 1048576\n<a href="missing3.mp3">missing3.mp3</a> 2026-10-23 12:34 -\n<a href="empty.mp4">empty.mp4</a> 2026-10-23 12:34 0\n</pre>',
    expected: [{ size: 1048576, date }, { size: null, date }, { size: 0, date }]
  },
  {
    name: 'IIS metadata before links and br separators',
    html: '<pre><br>10/23/2026 12:34 PM 1,234 <a href="one.mp3">one.mp3</a><br>10/23/2026 12:34 PM 2 KB <a href="two.webm">two.webm</a><br></pre>',
    expected: [{ size: 1234, date }, { size: 2048, date }]
  },
  {
    name: 'Caddy tables with sizes before dates',
    html: '<table><tr><td><a href="doc.md">doc.md</a></td><td>4K</td><td>2026-10-23 12:34</td></tr></table>',
    expected: [{ size: 4096, date }]
  },
  {
    name: 'duplicate truncated display names',
    html: '<pre><a href="first.mp4">Episode...</a> 2026-10-23 12:34 1K\n<a href="second.mp4">Episode...</a> 2026-10-23 12:34 2K\n</pre>',
    expected: [{ size: 1024, date }, { size: 2048, date }]
  }
];

afterEach(() => vi.unstubAllGlobals());

describe.each([
  ['TypeScript API', folderApiRequest],
  ['standalone browser bundle', browserRequest]
])('%s metadata and request policy', (_name, request) => {
  it.each(fixtures)('parses $name without filename-derived metadata', async ({ html, expected }) => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request('https://example.com/root/', { mode: 'fetch' });
    expect(result.files.map(({ size, date }: { size: number | null; date: string | null }) => ({ size, date }))).toEqual(expected);
    expect(result.stats.fetches).toBe(1);
    expect(result.stats.heads).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['default', 'no-store', 'no-cache', 'reload', 'force-cache', 'only-if-cached'])('forwards cache policy %s to directory fetches', async cache => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('<ul></ul>', { headers: { 'Content-Type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    await request('https://example.com/root/', { mode: 'fetch', cache: cache as RequestCache });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache });
    if (cache === 'only-if-cached') expect(fetchMock.mock.calls[0]?.[1]?.mode).toBe('same-origin');
  });
  it('uses the default policy for invalid cache input', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('<ul></ul>', { headers: { 'Content-Type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    await request('https://example.com/root/', { mode: 'fetch', cache: 'invalid' as RequestCache });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'default' });
  });
});
