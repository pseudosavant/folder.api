import { InternalDirectoryParse, LoadedDirectory, NormalizedOptions } from '../internal/types.js';
import type { EntryProvenance } from '../types.js';
import { classifyEntry, detectHidden } from '../utils/classify.js';
import { parseDateMetadata } from '../utils/date.js';
import { parseSizeMetadata } from '../utils/size.js';
import { safeDecodeURIComponent } from '../utils/decode.js';
import { describeCause, pushError, RequestFailure } from '../utils/errors.js';
import { throwIfAborted } from '../utils/abort.js';
import { htmlNamespace, validateListingDocument } from '../utils/document.js';
import { keyForFile, keyForVisited, normalizeDirectoryUrl } from '../utils/url.js';

interface MetadataFields {
  fields: string[];
  schemaKnown?: boolean;
  sizeIndex?: number;
  dateIndex?: number;
  typeIndex?: number;
}
interface CellPlacement { cell: Element; start: number; end: number; }
interface SpanningCell extends CellPlacement { remaining: number; }

const dateHeaderLabels = new Set([
  'date', 'modified', 'last modified', 'modified date', 'date modified', 'last modified date',
  'date last modified', 'modification date', 'timestamp', 'last write', 'last write time'
]);

export function parseDirectoryHtml(baseUrl: string, html: string, opts: NormalizedOptions,
  admitEntry?: (kind: 'file' | 'folder', url: URL) => 'accept' | 'skip' | 'limit',
  contentType: LoadedDirectory['contentType'] = 'text/html'): InternalDirectoryParse {
  throwIfAborted(opts.signal);
  const errors: string[] = [];
  const doc = new DOMParser().parseFromString(html, contentType);
  validateListingDocument(doc, contentType, baseUrl);
  const anchors = listingAnchors(doc, opts.listingSelector, baseUrl);
  const base = new URL(baseUrl);
  let linkBase = base;
  const baseHref = Array.from(doc.getElementsByTagNameNS(htmlNamespace, 'base'))
    .find(element => element.hasAttribute('href'))?.getAttribute('href');
  if (baseHref !== undefined && baseHref !== null) {
    try {
      const candidate = new URL(baseHref, base);
      if (!/^https?:$/.test(candidate.protocol)) throw new Error('unsupported base protocol');
      linkBase = candidate;
    } catch { pushError(errors, 'url', `invalid base '${baseHref}'`); }
  }
  const seen = new Set<string>();
  const tables = new WeakMap<Element, Map<Element, MetadataFields>>();
  const folders: InternalDirectoryParse['folders'] = [];
  const files: InternalDirectoryParse['files'] = [];

  for (const anchor of anchors) {
    throwIfAborted(opts.signal);
    const href = anchor.getAttribute('href')?.trim();
    const container = ancestor(anchor, ['th', 'tr', 'li']);
    if (!href || href.includes('#') || container?.localName === 'th') continue;
    let url: URL;
    try { url = new URL(href, linkBase); }
    catch { pushError(errors, 'url', `invalid link '${href}'`); continue; }
    if (!/^https?:$/.test(url.protocol) || (opts.sameOriginOnly && url.origin !== base.origin)) continue;
    if (url.origin === base.origin && url.pathname === base.pathname && url.search && url.search !== base.search) continue;

    const metadata = deriveMetadataFields(anchor, container, tables);
    const typeText = metadata.schemaKnown ? metadata.fields[metadata.typeIndex ?? -1] || '' : metadata.fields.join(' ');
    const kind = classifyEntry(url, typeText);
    if (kind === 'unknown') continue;
    if (kind === 'folder') url = new URL(normalizeDirectoryUrl(url.href));
    const key = kind + ':' + (kind === 'folder' ? keyForVisited(url) : keyForFile(url));
    if (seen.has(key)) continue;
    const admission = admitEntry ? admitEntry(kind, url)
      : folders.length + files.length >= opts.maxEntries ? 'limit' : 'accept';
    if (admission === 'skip') continue;
    if (admission === 'limit') { pushError(errors, 'limit', 'entry limit exceeded'); break; }
    seen.add(key);

    const rawName = url.pathname.split('/').filter(Boolean).pop() || '';
    const name = safeDecodeURIComponent(rawName, errors);
    const fieldsFor = (index: number | undefined) => index !== undefined ? [metadata.fields[index] || '']
      : metadata.schemaKnown ? [] : metadata.fields;
    let date: ReturnType<typeof parseDateMetadata> = null;
    for (const field of fieldsFor(metadata.dateIndex)) {
      if (!field.trim() || field.trim() === '-') continue;
      date = parseDateMetadata(field, errors);
      if (date) break;
    }
    let size: ReturnType<typeof parseSizeMetadata> = null;
    for (const field of fieldsFor(metadata.sizeIndex)) {
      if (!field.trim() || field.trim() === '-') continue;
      const candidate = parseSizeMetadata(field);
      if (!candidate) continue;
      if (size && size.value !== candidate.value) { size = null; break; }
      size = candidate;
    }
    const provenance: EntryProvenance = {};
    if (opts.includeProvenance) {
      if (date) provenance.date = { source: 'listing', raw: date.raw, timezone: date.timezone };
      if (kind === 'file' && size) provenance.size = { source: 'listing', raw: size.raw, precision: size.precision };
    }
    const entry = { url: url.href, rawName, name, hidden: detectHidden(name), date: date?.value ?? null,
      ...(Object.keys(provenance).length ? { provenance } : {}) };
    if (kind === 'folder') folders.push({ ...entry, kind: 'folder', size: null });
    else files.push({ ...entry, kind: 'file', size: size?.value ?? null });
  }
  return { folders, files, errors };
}

function listingAnchors(doc: Document, selector: string | undefined, url: string): Element[] {
  let containers: Set<Element> | undefined;
  if (selector !== undefined) {
    try { containers = new Set(doc.querySelectorAll(selector)); }
    catch (error) {
      throw new RequestFailure({ category: 'traversal', code: 'parse', phase: 'parse', url,
        message: `Invalid listingSelector '${selector}' for ${url}`, cause: describeCause(error) }, error);
    }
    if (containers.size === 0) throw new RequestFailure({ category: 'traversal', code: 'parse', phase: 'parse', url,
      message: `listingSelector '${selector}' did not match any elements in ${url}` });
  }
  const anchors = Array.from(doc.getElementsByTagNameNS(htmlNamespace, 'a')).filter(anchor => anchor.hasAttribute('href'));
  if (containers) {
    return anchors.filter(anchor => {
      for (let element: Element | null = anchor; element; element = element.parentElement) {
        if (containers.has(element)) return true;
      }
      return false;
    });
  }
  const preferred = anchors.filter(anchor => ancestor(anchor, ['pre', 'table', 'ul', 'ol']));
  return preferred.length ? preferred : anchors;
}

function ancestor(element: Element, names: string[]): Element | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent.namespaceURI === htmlNamespace && names.includes(parent.localName)) return parent;
  }
  return null;
}

function deriveMetadataFields(anchor: Element, container: Element | null, tables: WeakMap<Element, Map<Element, MetadataFields>>): MetadataFields {
  if (container?.localName === 'tr') {
    const table = ancestor(container, ['table']);
    if (table) {
      let rows = tables.get(table);
      if (!rows) { rows = tableMetadata(table); tables.set(table, rows); }
      return rows.get(container) || { fields: [] };
    }
  }
  if (container?.localName === 'li') return { fields: [readMetadataText(container)] };
  const adjacentText = (before: boolean): string => {
    const parts: string[] = [];
    for (let node: ChildNode | null = before ? anchor.previousSibling : anchor.nextSibling; node; node = before ? node.previousSibling : node.nextSibling) {
      if (node.nodeType === 1) {
        const element = node as Element;
        if (element.namespaceURI === htmlNamespace && ['a', 'br'].includes(element.localName)
          || element.getElementsByTagNameNS(htmlNamespace, 'a').length || element.getElementsByTagNameNS(htmlNamespace, 'br').length) break;
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

function tableMetadata(table: Element): Map<Element, MetadataFields> {
  const rows = Array.from(table.getElementsByTagNameNS(htmlNamespace, 'tr')).filter(row => ancestor(row, ['table']) === table);
  const layouts = new Map<Element, CellPlacement[]>();
  let active: SpanningCell[] = [];
  let group: Element | null = null;
  const headerRows: Element[] = [];
  for (const row of rows) {
    const rowGroup = ancestor(row, ['thead', 'tbody', 'tfoot', 'table']);
    if (rowGroup !== group) { active = []; group = rowGroup; }
    const cells = Array.from(row.children).filter(cell => cell.namespaceURI === htmlNamespace && ['td', 'th'].includes(cell.localName));
    if (cells.some(cell => cell.localName === 'th') && !cells.some(cell => cell.localName === 'td'
      && cell.getElementsByTagNameNS(htmlNamespace, 'a').length)) headerRows.push(row);
    const placed: CellPlacement[] = [...active];
    const next = active.filter(cell => cell.remaining > 1).map(cell => ({ ...cell, remaining: cell.remaining - 1 }));
    let column = 0;
    let activeIndex = 0;
    for (const cell of cells) {
      const width = span(cell, 'colspan', 1000);
      while (activeIndex < active.length) {
        const occupied = active[activeIndex];
        if (occupied.end <= column) activeIndex++;
        else if (occupied.start < column + width) { column = occupied.end; activeIndex++; }
        else break;
      }
      const position = { cell, start: column, end: column + width };
      placed.push(position);
      const height = cell.getAttribute('rowspan')?.trim() === '0' ? Infinity : span(cell, 'rowspan', 65534);
      if (height > 1) next.push({ ...position, remaining: height - 1 });
      column += width;
    }
    layouts.set(row, placed.sort((a, b) => a.start - b.start));
    active = next.sort((a, b) => a.start - b.start);
  }

  let sizeColumn: number | undefined;
  let dateColumn: number | undefined;
  let typeColumn: number | undefined;
  let schemaKnown = false;
  for (const row of headerRows) {
    for (const position of layouts.get(row) || []) {
      const label = position.cell.textContent?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
      if (/^(?:file\s+)?size$|^length$/.test(label)) { sizeColumn = position.start; schemaKnown = true; }
      const dateLabel = label.replace(/[-_\s]+/g, ' ').replace(/ \([^)]*\)$/, '');
      if (dateHeaderLabels.has(dateLabel)) {
        dateColumn = position.start; schemaKnown = true;
      }
      if (/^(?:type|kind)$/.test(label)) { typeColumn = position.start; schemaKnown = true; }
      if (/^(?:(?:file ?)?name|description|permissions?|mode)$/.test(label)) schemaKnown = true;
    }
  }
  const result = new Map<Element, MetadataFields>();
  const text = new WeakMap<Element, string>();
  for (const [row, positions] of layouts) {
    const index = (column: number | undefined) => column === undefined ? undefined
      : positions.findIndex(position => position.start <= column && column < position.end);
    result.set(row, { fields: positions.map(position => {
      let value = text.get(position.cell);
      if (value === undefined) { value = readMetadataText(position.cell); text.set(position.cell, value); }
      return value;
    }), schemaKnown, sizeIndex: index(sizeColumn), dateIndex: index(dateColumn), typeIndex: index(typeColumn) });
  }
  return result;
}

function span(cell: Element, attribute: string, maximum: number): number {
  const raw = cell.getAttribute(attribute)?.trim() || '';
  const value = /^\d+$/.test(raw) ? Number(raw) : 1;
  return Math.min(maximum, Math.max(1, value));
}

function readMetadataText(element: Element): string {
  const parts: string[] = [];
  const pending = Array.from(element.childNodes).reverse();
  while (pending.length) {
    const node = pending.pop()!;
    if (node.nodeType === 3 || node.nodeType === 4) parts.push(node.textContent || '');
    else if (node.nodeType === 1) {
      const child = node as Element;
      if (child.namespaceURI !== htmlNamespace || !['a', 'ul', 'ol', 'table'].includes(child.localName)) {
        for (let index = child.childNodes.length - 1; index >= 0; index--) pending.push(child.childNodes[index]);
      }
    }
  }
  return parts.join(' ').trim();
}
