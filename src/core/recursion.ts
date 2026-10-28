import { FolderNode, FolderEntry, FileEntry } from '../types.js';
import { NormalizedOptions, LoadedDirectory } from '../internal/types.js';
import { fetchDirectoryHtml } from './fetchDirectory.js';
import { iframeDirectoryHtml } from './iframeDirectory.js';
import { parseDirectoryHtml } from './parseDirectory.js';
import { normalizeDirectoryUrl, keyForVisited, keyForFile, parentDirectory, rootDirectory } from '../utils/url.js';
import { safeDecodeURIComponent } from '../utils/decode.js';
import { throwIfAborted } from '../utils/abort.js';
import { describeCause, ErrorSink, recordError, recordParseErrors, RequestFailure, requestFailure } from '../utils/errors.js';

interface RecursionState extends ErrorSink {
  visited: Set<string>;
  allFolders: FolderEntry[];
  allFiles: FileEntry[];
  stats: { fetches: number; iframes: number; heads: number };
  maxDepthEncountered: number;
}

export async function traverse(startUrl: string, opts: NormalizedOptions, state: RecursionState): Promise<FolderNode> {
  const root = createNode(normalizeDirectoryUrl(startUrl), 'self', 0, state);
  const folders = new Map<string, FolderNode>([[keyForVisited(new URL(root.url)), root]]);
  const parents = new WeakMap<FolderNode, FolderNode>();
  const files = new Map<string, FileEntry>();
  let limitReported = false;
  const entryCount = () => folders.size + files.size;
  const reportLimit = () => {
    if (!limitReported) recordError(state, { category: 'limit', code: 'limit', phase: 'traversal', url: root.url,
      message: 'limit: entry limit exceeded' });
    limitReported = true;
  };
  const canAdd = () => {
    if (entryCount() < opts.maxEntries) return true;
    reportLimit();
    return false;
  };

  const detach = (node: FolderNode) => {
    const parent = parents.get(node);
    if (parent) parent.children = parent.children.filter(child => child !== node);
    parents.delete(node);
  };
  const attach = (node: FolderNode, parent: FolderNode) => {
    if (parents.get(node) === parent) return;
    detach(node);
    parents.set(node, parent);
    parent.children.push(node);
  };
  const redirectedParent = (node: FolderNode): FolderNode => {
    const start = new URL(root.url);
    if (!isChild(start, new URL(node.url))) return parents.get(node) || root;
    const startKey = keyForVisited(start);
    let url = parentDirectory(new URL(node.url));
    while (url) {
      const candidate = new URL(url);
      const key = keyForVisited(candidate);
      if (key !== startKey && !isChild(start, candidate)) break;
      const ancestor = folders.get(key);
      if (ancestor && ancestor !== node && (ancestor === root || ancestor.role === 'child')) return ancestor;
      url = parentDirectory(candidate);
    }
    return root;
  };

  const loadDocument = async (url: string): Promise<LoadedDirectory> => {
    throwIfAborted(opts.signal);
    if (opts.mode === 'iframe') return await iframeDirectoryHtml(url, opts, state.stats);
    if (opts.mode === 'fetch' || opts.cache !== 'default') return await fetchDirectoryHtml(url, opts, state.stats);
    try {
      return await fetchDirectoryHtml(url, opts, state.stats);
    } catch (fetchError) {
      throwIfAborted(opts.signal);
      if (fetchError instanceof RequestFailure && fetchError.details.code === 'response-limit') throw fetchError;
      try {
        return await iframeDirectoryHtml(url, opts, state.stats);
      } catch (iframeError) {
        throwIfAborted(opts.signal);
        const failure = requestFailure(iframeError, 'iframe', url, opts.timeoutMs);
        failure.details.previous = requestFailure(fetchError, 'fetch', url, opts.timeoutMs).details;
        throw failure;
      }
    }
  };

  const loadDirectory = async (node: FolderNode): Promise<FolderNode | null> => {
    const requestedKey = keyForVisited(new URL(node.url));
    const loaded = await loadDocument(node.url);
    throwIfAborted(opts.signal);
    const url = normalizeDirectoryUrl(loaded.url);
    const final = new URL(url);
    if (node !== root && opts.sameOriginOnly && final.origin !== new URL(root.url).origin) {
      throw new RequestFailure({ category: 'traversal', code: 'scope', phase: 'traversal', url,
        message: `Child directory redirected to another origin: ${node.url} -> ${url}` });
    }
    const finalKey = keyForVisited(final);
    if (node !== root && opts.sameOriginOnly && !isChild(new URL(root.url), final) && !folders.has(finalKey)) {
      throw new RequestFailure({ category: 'traversal', code: 'scope', phase: 'traversal', url,
        message: `Child directory redirected outside the starting directory: ${node.url} -> ${url}` });
    }
    if (finalKey !== requestedKey) {
      const existing = folders.get(finalKey);
      folders.delete(requestedKey);
      if (existing && existing !== node) {
        detach(node);
        if (existing.role !== 'child' || state.visited.has(finalKey)) return null;
        node = existing;
      } else {
        const updated = createNode(url, node.role, node.depth, state);
        delete node.provenance;
        Object.assign(node, updated);
        folders.set(finalKey, node);
      }
    }
    node.url = url;
    if (node !== root && isChild(new URL(root.url), final)) node.depth = relativeDepth(new URL(root.url), final);
    if (node !== root && finalKey !== requestedKey) attach(node, redirectedParent(node));
    state.visited.add(finalKey);
    if (node.depth > opts.maxDepth) return null;
    state.maxDepthEncountered = Math.max(state.maxDepthEncountered, node.depth);

    const start = new URL(root.url);
    const startKey = keyForVisited(start);
    const rootKey = keyForVisited(new URL(rootDirectory(start)));
    const parentUrl = parentDirectory(start);
    const parentKey = parentUrl ? keyForVisited(new URL(parentUrl)) : null;
    const folderRole = (candidate: URL): FolderEntry['role'] | undefined => {
      const key = keyForVisited(candidate);
      if (key === startKey) return 'self';
      if (key === rootKey) return 'root';
      if (key === parentKey) return 'parent';
      if (isChild(final, candidate) || (!opts.sameOriginOnly && candidate.origin !== final.origin)) return 'child';
      return undefined;
    };
    let pendingEntries = 0;
    const parsed = parseDirectoryHtml(url, loaded.html, opts, (kind, candidate) => {
      if (kind === 'folder') {
        if (!folderRole(candidate)) return 'skip';
        if (folders.has(keyForVisited(candidate))) return 'accept';
      } else if (files.has(keyForFile(candidate))) return 'skip';
      if (entryCount() + pendingEntries >= opts.maxEntries) return 'limit';
      pendingEntries++;
      return 'accept';
    }, loaded.contentType);
    for (const error of parsed.errors) {
      if (error.startsWith('limit:')) reportLimit();
      else recordParseErrors(state, [error], url);
    }

    for (const folder of parsed.folders) {
      throwIfAborted(opts.signal);
      const candidate = new URL(folder.url);
      const key = keyForVisited(candidate);
      const role = folderRole(candidate);
      if (!role) continue;

      let child = folders.get(key);
      if (!child) {
        if (!canAdd()) break;
        const depth = role === 'child' ? node.depth + relativeDepth(final, candidate) : 0;
        child = { ...createNode(folder.url, role, depth, state), date: folder.date ?? null,
          ...(folder.provenance ? { provenance: folder.provenance } : {}) };
        folders.set(key, child);
      }
      if (role === 'child' && !parents.has(child) && !state.visited.has(key)) {
        attach(child, node);
      }
    }
    for (const file of parsed.files) {
      throwIfAborted(opts.signal);
      const key = keyForFile(new URL(file.url));
      if (files.has(key)) continue;
      if (!canAdd()) break;
      const entry: FileEntry = {
        kind: 'file', url: file.url, name: file.name || '', rawName: file.rawName || '',
        hidden: file.hidden || false, size: file.size ?? null, date: file.date ?? null,
        ...(file.provenance ? { provenance: file.provenance } : {})
      };
      files.set(key, entry);
      node.files.push(entry);
    }
    return node;
  };

  state.visited.add(keyForVisited(new URL(root.url)));
  await loadDirectory(root);
  for (const [url, role] of [[rootDirectory(new URL(root.url)), 'root'], [parentDirectory(new URL(root.url)), 'parent']] as const) {
    if (!url || folders.has(keyForVisited(new URL(url)))) continue;
    if (!canAdd()) break;
    folders.set(keyForVisited(new URL(url)), createNode(url, role, 0, state));
  }

  // Use an explicit depth-first stack so a deep tree does not retain recursive calls.
  const pending: FolderNode[] = [];
  const enqueue = (parent: FolderNode) => {
    for (let index = parent.children.length - 1; index >= 0; index--) {
      const node = parent.children[index];
      if (node.depth <= opts.maxDepth) pending.push(node);
    }
  };
  enqueue(root);
  while (pending.length > 0) {
    throwIfAborted(opts.signal);
    if (entryCount() >= opts.maxEntries) {
      reportLimit();
      break;
    }
    const next = pending.pop()!;
    const key = keyForVisited(new URL(next.url));
    if (state.visited.has(key)) continue;
    state.visited.add(key);
    try {
      const loaded = await loadDirectory(next);
      if (loaded) enqueue(loaded);
    } catch (error) {
      throwIfAborted(opts.signal);
      if (!opts.continueOnError) throw error;
      const cause = describeCause(error);
      const failure = error instanceof RequestFailure ? error : new RequestFailure({ category: 'traversal', code: 'parse',
        phase: 'traversal', url: next.url, message: `${cause.name}: ${cause.message}`, cause }, error);
      recordError(state, { ...failure.details, category: 'traversal',
        message: `traversal: failed to load ${next.url}: ${failure.message}` });
    }
  }
  for (const folder of folders.values()) state.allFolders.push(folder);
  for (const file of files.values()) state.allFiles.push(file);
  return root;
}

function createNode(url: string, role: FolderEntry['role'], depth: number, sink: ErrorSink): FolderNode {
  const rawName = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
  const errors: string[] = [];
  const name = safeDecodeURIComponent(rawName, errors);
  recordParseErrors(sink, errors, url);
  return {
    kind: 'folder', url, rawName, name, hidden: name.startsWith('.') && name !== '.' && name !== '..',
    size: null, date: null, role, depth, children: [], files: []
  };
}

function isChild(base: URL, candidate: URL): boolean {
  const parent = keyForVisited(base);
  const child = keyForVisited(candidate);
  return candidate.origin === base.origin && child.startsWith(parent) && child !== parent;
}

function relativeDepth(base: URL, candidate: URL): number {
  return isChild(base, candidate)
    ? candidate.pathname.split('/').filter(Boolean).length - base.pathname.split('/').filter(Boolean).length
    : 1;
}
