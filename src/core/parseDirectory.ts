import { InternalDirectoryParse, NormalizedOptions } from '../types.js';
import { classifyEntry, detectHidden } from '../utils/classify.js';
import { parseDateMeta } from '../utils/date.js';
import { parseSizeMeta } from '../utils/size.js';
import { safeDecodeURIComponent } from '../utils/decode.js';
import { pushError } from '../utils/errors.js';

export function parseDirectoryHtml(baseUrl: string, html: string, opts: NormalizedOptions): InternalDirectoryParse {
  const errors: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const anchorSets: HTMLAnchorElement[] = [];
  // Candidate anchor selection heuristics
  const selectors = ['pre a[href]', 'table a[href]', 'ul a[href]', 'ol a[href]'];
  for (const sel of selectors) {
    const found = Array.from(doc.querySelectorAll(sel)) as HTMLAnchorElement[];
    for (const a of found) anchorSets.push(a);
  }
  if (anchorSets.length === 0) {
    const all = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    for (const a of all) anchorSets.push(a);
  }
  const unique = dedupeAnchors(anchorSets);
  const folders: any[] = [];
  const files: any[] = [];
  for (const a of unique) {
    const resolved = new URL(a.getAttribute('href')!, baseUrl).toString();
    if (!acceptHref(resolved, baseUrl, opts)) continue;
    const metadataContext = deriveMetadataText(a).trim();
    const kind = classifyEntry(resolved, metadataContext);
    const segRaw = lastPathSegmentRaw(resolved);
    const nameDecoded = safeDecodeURIComponent(segRaw, errors);
    const hidden = detectHidden(nameDecoded);
    const date = parseDateMeta(metadataContext, errors);
    const size = parseSizeMeta(metadataContext);
    if (kind === 'folder') {
      folders.push({
        kind: 'folder',
        url: normalizeFolderUrl(resolved),
        rawName: segRaw,
        name: nameDecoded,
        hidden,
        size: null,
        date,
      });
    } else if (kind === 'file') {
      files.push({
        kind: 'file',
        url: resolved,
        rawName: segRaw,
        name: nameDecoded,
        hidden,
        size: size ?? null,
        date,
      });
    }
  }
  return { folders, files, errors };
}

function acceptHref(resolved: string, base: string, opts: NormalizedOptions): boolean {
  if (/^javascript:/i.test(resolved)) return false;
  if (/^mailto:/i.test(resolved)) return false;
  if (/#[^#]*$/.test(resolved)) return false;
  if (opts.sameOriginOnly) {
    const a = new URL(resolved);
    const b = new URL(base);
    if (a.origin !== b.origin) return false;
  }
  return true;
}

function dedupeAnchors(as: HTMLAnchorElement[]): HTMLAnchorElement[] {
  const seen = new Set<string>();
  const out: HTMLAnchorElement[] = [];
  for (const a of as) {
    const h = a.getAttribute('href');
    if (!h) continue;
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(a);
  }
  return out;
}

function deriveMetadataText(a: HTMLAnchorElement): string {
  const tr = a.closest('tr');
  if (tr) {
    const cells = Array.from(tr.querySelectorAll('th,td'));
    if (cells.length > 0) return cells.map(c => c.textContent || '').join(' ');
    return tr.textContent || '';
  }
  const li = a.closest('li');
  if (li) return li.textContent || '';
  const pre = a.closest('pre');
  if (pre) {
    // approximate: find line containing anchor text
    const lines = pre.textContent?.split(/\n/) || [];
    const at = a.textContent?.trim();
    const line = lines.find(l => at && l.includes(at));
    return line || a.textContent || '';
  }
  return a.parentElement?.textContent || a.textContent || '';
}

function lastPathSegmentRaw(u: string): string {
  const url = new URL(u);
  const parts = url.pathname.split('/').filter(Boolean);
  if (u.endsWith('/') ) return parts[parts.length -1] || '';
  return parts[parts.length -1] || '';
}

function normalizeFolderUrl(u: string): string {
  return u.endsWith('/') ? u : (u + '/');
}
