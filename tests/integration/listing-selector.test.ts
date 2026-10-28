import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';
import { folderApiRequest as browserRequest } from '../../folder-api.cdn.js';

const base = 'https://example.test/root/';
const response = (html: string, type = 'text/html') => new Response(html, { headers: { 'Content-Type': type } });

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each([['TypeScript', folderApiRequest], ['browser bundle', browserRequest]] as const)('%s listing selectors', (_name, request) => {
  it('preserves automatic discovery by default and uses every link inside an explicit container', async () => {
    const html = '<nav><ul><li><a href="help.txt">help</a></li></ul></nav>' +
      '<main id="listing"><a href="actual.txt">actual</a><ul><li><a href="second.txt">second</a></li></ul></main>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const automatic = await request(base, { mode: 'fetch' });
    expect(automatic.files.map(file => file.name)).toEqual(['help.txt', 'second.txt']);
    const scoped = await request(base, { mode: 'fetch', listingSelector: '#listing' });
    expect(scoped.files.map(file => file.name)).toEqual(['actual.txt', 'second.txt']);
  });

  it('unions overlapping containers without duplicates and preserves document order', async () => {
    const html = '<section id="first" class="part"><a href="one.txt">one</a>' +
      '<div class="part"><a href="two.txt">two</a></div></section>' +
      '<div id="second" class="part"><a href="three.txt">three</a></div><a href="outside.txt">outside</a>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch', listingSelector: '#second, #first, .part' });
    expect(result.files.map(file => file.name)).toEqual(['one.txt', 'two.txt', 'three.txt']);
    expect(result.errors).toEqual([]);
  });

  it('includes matching anchor elements as well as links inside matching containers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('<a class="chosen" href="one.txt">one</a><a href="outside.txt">outside</a>')));
    const result = await request(base, { mode: 'fetch', listingSelector: 'a.chosen' });
    expect(result.files.map(file => file.name)).toEqual(['one.txt']);
  });

  it('retains table headers and base URLs outside the selected container', async () => {
    const html = '<base href="assets/"><table><thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead>' +
      '<tbody id="listing"><tr><td><a href="clip.txt">clip</a></td><td>123</td><td>2026-10-27 12:00</td></tr></tbody>' +
      '<tbody><tr><td><a href="outside.txt">outside</a></td><td>999</td><td>-</td></tr></tbody></table>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch', listingSelector: '#listing', includeProvenance: true });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({ url: base + 'assets/clip.txt', size: 123, date: '2026-10-27T12:00:00.000Z',
      provenance: { size: { source: 'listing', raw: '123', precision: 'exact' } } });
  });

  it('does not fall back to other links when a matching container is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('<main id="listing"></main><ul><li><a href="outside.txt">outside</a></li></ul>')));
    const result = await request(base, { mode: 'fetch', listingSelector: '#listing' });
    expect(result.files).toEqual([]);
    expect(result.root.children).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it.each(['#missing', '['])('rejects an unmatched or invalid selector %s with directory context', async listingSelector => {
    const fetchMock = vi.fn(async () => response('<ul><li><a href="outside.txt">outside</a></li></ul>'));
    vi.stubGlobal('fetch', fetchMock);
    const error = await request(base, { listingSelector }).catch(error => error);
    expect(error.details).toMatchObject({ code: 'parse', phase: 'parse', url: base });
    expect(error.message).toContain('listingSelector');
    expect(error.message).toContain(listingSelector);
    if (listingSelector === '[') expect(error.details.cause?.name).toBe('SyntaxError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('applies the selector to every directory before entry budgets, traversal, and HEAD work', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'Content-Type': 'text/plain' } });
      return response(url === base
        ? '<ul><li><a href="bad/">bad</a></li><li><a href="noise.txt">noise</a></li></ul>' +
          '<div id="listing"><a href="good/">good</a><a href="https://other.test/remote.txt">remote</a></div>'
        : '<a href="outside.txt">outside</a><div id="listing"><a href="clip.txt">clip</a></div>');
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await request(base, { mode: 'fetch', listingSelector: '#listing', maxDepth: 1, maxEntries: 4, includeMime: true });
    expect(result.root.children.map(folder => folder.name)).toEqual(['good']);
    expect(result.files.map(file => file.url)).toEqual([base + 'good/clip.txt']);
    expect(result.entries).toHaveLength(4);
    expect(result.stats).toMatchObject({ fetches: 2, heads: 1 });
    expect(result.errors).toEqual([]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([base, base + 'good/', base + 'good/clip.txt']);
  });

  it('can retain other children when a child does not contain the configured listing', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => response(url === base
      ? '<main id="listing"><a href="bad/">bad</a><a href="good/">good</a></main>'
      : url === base + 'bad/' ? '<a href="noise.txt">noise</a>'
        : '<main id="listing"><a href="clip.txt">clip</a></main>')));
    const result = await request(base, { mode: 'fetch', listingSelector: '#listing', maxDepth: 1, continueOnError: true });
    expect(result.files.map(file => file.name)).toEqual(['clip.txt']);
    expect(result.errorDetails).toEqual([expect.objectContaining({ category: 'traversal', code: 'parse', phase: 'parse', url: base + 'bad/' })]);
    expect(result.errors[0]).toContain('#listing');
  });

  it('scopes links in prefixed XHTML documents', async () => {
    const html = '<x:html xmlns:x="http://www.w3.org/1999/xhtml"><x:body>' +
      '<x:ul><x:li><x:a href="outside.txt">outside</x:a></x:li></x:ul>' +
      '<x:div id="listing"><x:a href="clip.txt">clip</x:a></x:div></x:body></x:html>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html, 'application/xhtml+xml')));
    const result = await request(base, { mode: 'fetch', listingSelector: '#listing' });
    expect(result.files.map(file => file.name)).toEqual(['clip.txt']);
  });
});
