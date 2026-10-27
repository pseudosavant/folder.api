import { InternalDirectoryParse, NormalizedOptions } from '../types.js';
import { classifyEntry, detectHidden } from '../utils/classify.js';
import { parseDateMeta } from '../utils/date.js';
import { parseSizeMeta } from '../utils/size.js';
import { safeDecodeURIComponent } from '../utils/decode.js';
import { pushError } from '../utils/errors.js';
import { throwIfAborted } from '../utils/abort.js';
import { keyForFile, keyForVisited, normalizeDirectoryUrl } from '../utils/url.js';

interface MetadataFields {
  fields: string[];
  sizeIndex?: number;
  dateIndex?: number;
}

export function parseDirectoryHtml(baseUrl: string, html: string, opts: NormalizedOptions,
  admitEntry?: (kind: 'file' | 'folder', url: URL) => 'accept' | 'skip' | 'limit'): InternalDirectoryParse {
  throwIfAborted(opts.signal);
  const errors: string[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let anchors = doc.querySelectorAll<HTMLAnchorElement>('pre a[href], table a[href], ul a[href], ol a[href]');
  if (anchors.length === 0) anchors = doc.querySelectorAll<HTMLAnchorElement>('a[href]');
  const base = new URL(baseUrl);
  let linkBase = base;
  const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
  if (baseHref !== undefined && baseHref !== null) {
    try {
      const candidate = new URL(baseHref, base);
      if (!/^https?:$/.test(candidate.protocol)) throw new Error('unsupported base protocol');
      linkBase = candidate;
    } catch {
      pushError(errors, 'url', `invalid base '${baseHref}'`);
    }
  }
  const seen = new Set<string>();
  const rows = new WeakMap<HTMLTableRowElement, MetadataFields>();
  const columns = new WeakMap<HTMLTableElement, Omit<MetadataFields, 'fields'>>();
  const folders: InternalDirectoryParse['folders'] = [];
  const files: InternalDirectoryParse['files'] = [];

  for (const anchor of anchors) {
    throwIfAborted(opts.signal);
    const href = anchor.getAttribute('href')?.trim();
    const container = anchor.closest('th,tr,li');
    if (!href || href.includes('#') || container?.tagName === 'TH') continue;
    let url: URL;
    try {
      url = new URL(href, linkBase);
    } catch {
      pushError(errors, 'url', `invalid link '${href}'`);
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || (opts.sameOriginOnly && url.origin !== base.origin)) continue;
    if (url.origin === base.origin && url.pathname === base.pathname && url.search && url.search !== base.search) continue;

    const metadata = deriveMetadataFields(anchor, container, rows, columns);
    const kind = classifyEntry(url, metadata.fields.join(' '));
    if (kind === 'unknown') continue;
    if (kind === 'folder') url = new URL(normalizeDirectoryUrl(url.href));
    const key = kind + ':' + (kind === 'folder' ? keyForVisited(url) : keyForFile(url));
    if (seen.has(key)) continue;
    const admission = admitEntry ? admitEntry(kind, url)
      : folders.length + files.length >= opts.maxEntries ? 'limit' : 'accept';
    if (admission === 'skip') continue;
    if (admission === 'limit') {
      pushError(errors, 'limit', 'entry limit exceeded');
      break;
    }
    seen.add(key);

    const rawName = url.pathname.split('/').filter(Boolean).pop() || '';
    const name = safeDecodeURIComponent(rawName, errors);
    const dateFields = metadata.dateIndex === undefined ? metadata.fields : [metadata.fields[metadata.dateIndex] || ''];
    let date: string | null = null;
    for (const field of dateFields) {
      if (!field.trim() || field.trim() === '-') continue;
      date = parseDateMeta(field, errors);
      if (date !== null) break;
    }
    const sizeFields = metadata.sizeIndex === undefined ? metadata.fields : [metadata.fields[metadata.sizeIndex] || ''];
    let size: number | null = null;
    for (const field of sizeFields) {
      if (!field.trim() || field.trim() === '-') continue;
      const candidate = parseSizeMeta(field);
      if (candidate === null) continue;
      if (size !== null && size !== candidate) {
        size = null;
        break;
      }
      size = candidate;
    }
    const entry = { url: url.href, rawName, name, hidden: detectHidden(name), date };
    if (kind === 'folder') folders.push({ ...entry, kind: 'folder', size: null });
    else files.push({ ...entry, kind: 'file', size });
  }
  return { folders, files, errors };
}

function deriveMetadataFields(anchor: HTMLAnchorElement, container: Element | null, rows: WeakMap<HTMLTableRowElement, MetadataFields>, columns: WeakMap<HTMLTableElement, Omit<MetadataFields, 'fields'>>): MetadataFields {
  const row = container?.tagName === 'TR' ? container as HTMLTableRowElement : null;
  if (row) {
    const cached = rows.get(row);
    if (cached) return cached;
    const table = row.closest('table');
    let schema = table ? columns.get(table) : undefined;
    if (table && !schema) {
      const header = Array.from(table.rows).find(candidate => Array.from(candidate.cells).some(cell => cell.tagName === 'TH'));
      const labels = header ? Array.from(header.cells).flatMap(cell =>
        Array<string>(cell.colSpan).fill(cell.textContent?.trim().toLowerCase() || '')) : [];
      const sizeIndex = labels.findIndex(label => /^(?:file\s+)?size$|^length$/.test(label));
      const dateIndex = labels.findIndex(label => /modified|date|timestamp|last\s+write/.test(label));
      schema = { sizeIndex: sizeIndex < 0 ? undefined : sizeIndex, dateIndex: dateIndex < 0 ? undefined : dateIndex };
      columns.set(table, schema);
    }
    const cellIndex = (column: number | undefined): number | undefined => {
      if (column === undefined) return undefined;
      let offset = 0;
      return Array.from(row.cells).findIndex(cell => {
        offset += cell.colSpan;
        return column < offset;
      });
    };
    const metadata = { fields: Array.from(row.cells, readMetadataText),
      sizeIndex: cellIndex(schema?.sizeIndex), dateIndex: cellIndex(schema?.dateIndex) };
    rows.set(row, metadata);
    return metadata;
  }
  const item = container?.tagName === 'LI' ? container : null;
  if (item) return { fields: [readMetadataText(item)] };

  // IIS puts metadata before a link, while nginx puts it after the link.
  const adjacentText = (before: boolean): string => {
    const parts: string[] = [];
    for (let node: ChildNode | null = before ? anchor.previousSibling : anchor.nextSibling; node; node = before ? node.previousSibling : node.nextSibling) {
      if (node.nodeType === 1) {
        const element = node as Element;
        if (element.matches('a,br') || element.querySelector('a,br')) break;
      }
      const lines = (node.textContent || '').split(/\r?\n/);
      if (before) parts.unshift(lines[lines.length - 1]);
      else parts.push(lines[0]);
      if (lines.length > 1) break;
    }
    return parts.join('');
  };
  return { fields: [(adjacentText(true) + ' ' + adjacentText(false)).trim()] };
}

function readMetadataText(element: Element): string {
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3) parts.push(node.textContent || '');
    else if (node.nodeType === 1 && !(node as Element).matches('a,ul,ol,table')) {
      for (const child of node.childNodes) visit(child);
    }
  };
  for (const child of element.childNodes) visit(child);
  return parts.join(' ').trim();
}
