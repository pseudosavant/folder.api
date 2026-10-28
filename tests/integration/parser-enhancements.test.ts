import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';
import { folderApiRequest as browserRequest } from '../../folder-api.cdn.js';

const base = 'https://example.test/root/';
const response = (html: string, contentType = 'text/html') => new Response(html, { headers: { 'Content-Type': contentType } });
const xhtml = (body: string) => `<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each([['TypeScript', folderApiRequest], ['browser bundle', browserRequest]] as const)('%s parser enhancements', (_name, request) => {
  it('does not derive types, sizes, or dates from recognized description columns', async () => {
    const html = '<table><tr><th>Name</th><th>Description</th></tr>' +
      '<tr><td><a href="README">README</a></td><td>Directory documentation</td></tr>' +
      '<tr><td><a href="count.txt">count</a></td><td>4096</td></tr>' +
      '<tr><td><a href="date.txt">date</a></td><td>2026-10-27 12:00</td></tr></table>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch', includeProvenance: true });
    expect(result.files.map(file => file.name)).toEqual(['README', 'count.txt', 'date.txt']);
    expect(result.files.every(file => file.size === null && file.date === null && !file.provenance)).toBe(true);
    expect(result.root.children).toEqual([]);
  });

  it.each([
    'Date', 'Modified', 'Last modified', 'Modified Date', 'Date Modified', 'Last Modified Date',
    'Date Last Modified', 'Modification Date', 'Timestamp', 'Last Write', 'Last Write Time',
    'Last-Modified', 'Date_Modified', 'LAST  MODIFIED', '\tDate \n Modified\t',
    'Last-Modified (UTC)', 'Last_Write_Time (UTC)'
  ])('reads dates from the %j header without using description metadata', async header => {
    const raw = '27-Oct-2026 12:00+02:00';
    const html = '<table><tr><th>Name</th><th>Description</th><th><a href="?sort=mtime">' + header + '</a></th><th>Size</th></tr>' +
      '<tr><td><a href="clip.txt">clip</a></td><td>2000-01-01 00:00</td><td>' + raw + '</td><td>123</td></tr></table>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch', includeProvenance: true });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({ name: 'clip.txt', size: 123, date: '2026-10-27T10:00:00.000Z',
      provenance: { date: { source: 'listing', raw, timezone: 'explicit' } } });
    expect(result.errors).toEqual([]);
  });

  it.each([
    'Description', 'Modified description', 'Date description', 'Last modified notes', 'Timestamp description', 'Date Created'
  ])('does not treat the %j header as a modification date column', async header => {
    const html = '<table><tr><th>Name</th><th>' + header + '</th><th>Size</th></tr>' +
      '<tr><td><a href="clip.txt">clip</a></td><td>2026-10-27 12:00</td><td>123</td></tr></table>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch', includeProvenance: true });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({ size: 123, date: null });
    expect(result.files[0].provenance).not.toHaveProperty('date');
    expect(result.errors).toEqual([]);
  });

  it('uses explicit type columns without letting free text classify files as folders', async () => {
    const html = '<table><tr><th>Name</th><th>Type</th><th>Description</th></tr>' +
      '<tr><td><a href="archive.v1">archive</a></td><td>Directory</td><td>4096</td></tr>' +
      '<tr><td><a href="README">README</a></td><td>File</td><td>&lt;dir&gt;</td></tr></table>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch' });
    expect(result.root.children.map(folder => folder.name)).toEqual(['archive.v1']);
    expect(result.files.map(file => file.name)).toEqual(['README']);
  });

  it('retains metadata heuristics for tables without recognizable headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('<table><tr><td><a href="clip.txt">clip</a></td>' +
      '<td>27-Oct-2026 12:00+02:00</td><td>123</td></tr></table>')));
    const result = await request(base, { mode: 'fetch' });
    expect(result.files[0]).toMatchObject({ size: 123, date: '2026-10-27T10:00:00.000Z' });
  });

  it('maps row spans and column spans through multirow headers', async () => {
    const html = '<table><thead><tr><th rowspan="2">Name</th><th colspan="2">Metadata</th></tr>' +
      '<tr><th>Size</th><th>Modified</th></tr></thead><tbody>' +
      '<tr><td><a href="a.txt">a</a></td><td rowspan="2">123</td><td>2026-10-27 12:00</td></tr>' +
      '<tr><td><a href="b.txt">b</a></td><td>2026-10-28 12:00</td></tr></tbody></table>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch' });
    expect(result.files.map(file => [file.size, file.date])).toEqual([
      [123, '2026-10-27T12:00:00.000Z'], [123, '2026-10-28T12:00:00.000Z']
    ]);
  });

  it('keeps rowspan zero inside its row group and leaves missing columns unknown', async () => {
    const html = '<table><thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead>' +
      '<tbody><tr><td><a href="a.txt">a</a></td><td rowspan="0">123</td><td rowspan="2">2026-10-27 12:00</td></tr>' +
      '<tr><td><a href="b.txt">b</a></td></tr></tbody>' +
      '<tbody><tr><td><a href="c.txt">c</a></td><td>456</td><td>2026-10-28 12:00</td></tr>' +
      '<tr><td><a href="d.txt">d</a></td></tr></tbody></table>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html)));
    const result = await request(base, { mode: 'fetch' });
    expect(result.files.map(file => [file.size, file.date])).toEqual([
      [123, '2026-10-27T12:00:00.000Z'], [123, '2026-10-27T12:00:00.000Z'],
      [456, '2026-10-28T12:00:00.000Z'], [null, null]
    ]);
  });

  it.each(['text/html', 'TEXT/HTML; charset=UTF-8', 'application/xhtml+xml; charset=utf-8'])('accepts listing content type %s', async contentType => {
    vi.stubGlobal('fetch', vi.fn(async () => response(xhtml('<ul><li><a href="clip.txt">clip</a></li></ul>'), contentType)));
    const result = await request(base, { mode: 'fetch' });
    expect(result.files.map(file => file.name)).toEqual(['clip.txt']);
  });

  it.each(['application/json', 'application/xml', 'text/html-extra', 'application/x-text/html', ''])('rejects unsupported content type %s', async contentType => {
    vi.stubGlobal('fetch', vi.fn(async () => response('<ul/>', contentType)));
    const error = await request(base, { mode: 'fetch' }).catch(error => error);
    expect(error.details).toMatchObject({ code: 'content-type', phase: 'fetch', url: base });
  });

  it('parses prefixed XHTML with namespace-aware headers, links, and base URLs', async () => {
    const html = '<x:html xmlns:x="http://www.w3.org/1999/xhtml"><x:head><x:base href="assets/"/></x:head><x:body>' +
      '<x:table><x:tr><x:th>Name</x:th><x:th>Size</x:th><x:th>Date-Modified</x:th></x:tr>' +
      '<x:tr><x:td><x:a href="clip.txt">clip</x:a></x:td><x:td>123</x:td><x:td>2026-10-27 12:00</x:td></x:tr>' +
      '</x:table></x:body></x:html>';
    vi.stubGlobal('fetch', vi.fn(async () => response(html, 'application/xhtml+xml')));
    const result = await request(base, { mode: 'fetch' });
    expect(result.files[0]).toMatchObject({ url: base + 'assets/clip.txt', size: 123, date: '2026-10-27T12:00:00.000Z' });
  });

  it('rejects malformed XHTML instead of returning an empty successful listing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(xhtml('<ul><li>broken</ul>'), 'application/xhtml+xml')));
    const error = await request(base, { mode: 'fetch' }).catch(error => error);
    expect(error.details).toMatchObject({ code: 'parse', phase: 'parse', url: base });
  });

  it('exposes opt-in provenance without changing existing sizes during HEAD enrichment', async () => {
    const html = '<table><tr><th>Name</th><th>Size</th><th>Modified</th></tr>' +
      '<tr><td><a href="known.txt">known</a></td><td>1.5M</td><td>27-Oct-2026 12:00+02:00</td></tr>' +
      '<tr><td><a href="unknown.txt">unknown</a></td><td>-</td><td>2026-10-27 12:00</td></tr></table>';
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => init?.method === 'HEAD'
      ? new Response(null, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': '999' } }) : response(html)));
    const result = await request(base, { mode: 'fetch', includeMime: true, includeProvenance: true });
    expect(result.files[0]).toMatchObject({ size: 1572864, provenance: {
      size: { source: 'listing', raw: '1.5M', precision: 'estimated' },
      date: { source: 'listing', raw: '27-Oct-2026 12:00+02:00', timezone: 'explicit' },
      mime: { source: 'head', raw: 'text/plain; charset=utf-8' }
    } });
    expect(result.files[1]).toMatchObject({ size: 999, provenance: {
      size: { source: 'head', raw: '999', precision: 'exact' },
      date: { source: 'listing', raw: '2026-10-27 12:00', timezone: 'assumed-utc' }
    } });
    expect(result.root.files[0]).toBe(result.files[0]);
    const plain = await request(base, { mode: 'fetch', includeMime: true });
    expect(plain.files.every(file => !Object.hasOwn(file, 'provenance'))).toBe(true);
  });

  it('records exact byte metadata, complete timestamp tokens, and folder dates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('<pre>' +
      '<a href="clip.txt">clip</a> 2026-10-27 1:00 PM 1,234\n' +
      '<a href="sub/">sub</a> 27-Oct-2026 12:00Z -\n</pre>')));
    const result = await request(base, { mode: 'fetch', includeProvenance: true });
    expect(result.files[0]).toMatchObject({ size: 1234, date: '2026-10-27T13:00:00.000Z', provenance: {
      size: { source: 'listing', raw: '1,234', precision: 'exact' },
      date: { source: 'listing', raw: '2026-10-27 1:00 PM', timezone: 'assumed-utc' }
    } });
    expect(result.root.children[0].provenance?.date).toEqual({ source: 'listing', raw: '27-Oct-2026 12:00Z', timezone: 'explicit' });
  });
});
