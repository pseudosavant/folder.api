import { FolderNode, FolderEntry, FileEntry, NormalizedOptions, LoadedDirectory } from '../types.js';
import { fetchDirectoryHtml } from './fetchDirectory.js';
import { iframeDirectoryHtml } from './iframeDirectory.js';
import { parseDirectoryHtml } from './parseDirectory.js';
import { normalizeDirectoryUrl, keyForVisited, keyForFile, parentDirectory, rootDirectory } from '../utils/url.js';
import { safeDecodeURIComponent } from '../utils/decode.js';
import { throwIfAborted } from '../utils/abort.js';
import { pushError } from '../utils/errors.js';

interface RecursionState {
  visited: Set<string>;
  allFolders: FolderEntry[];
  allFiles: FileEntry[];
  errors: string[];
  stats: { fetches: number; iframes: number; heads: number };
  safetyCount: number;
  maxDepthEncountered: number;
}

export async function traverse(startUrl: string, opts: NormalizedOptions, state: RecursionState): Promise<FolderNode> {
  const root = createNode(normalizeDirectoryUrl(startUrl), 'self', 0, state.errors);
  const folders = new Map<string, FolderNode>([[keyForVisited(new URL(root.url)), root]]);
  const parents = new WeakMap<FolderNode, FolderNode>();
  const files = new Map<string, FileEntry>();
  let limitReported = false;
  const entryCount = () => folders.size + files.size;
  const reportLimit = () => {
    if (!limitReported) pushError(state.errors, 'limit', 'entry limit exceeded');
    limitReported = true;
  };
  const canAdd = () => {
    if (entryCount() < opts.maxEntries) return true;
    reportLimit();
    return false;
  };

  const loadDocument = async (url: string): Promise<LoadedDirectory> => {
    throwIfAborted(opts.signal);
    if (opts.mode === 'iframe') return await iframeDirectoryHtml(url, opts, state.stats);
    if (opts.mode === 'fetch') return await fetchDirectoryHtml(url, opts, state.stats);
    try {
      return await fetchDirectoryHtml(url, opts, state.stats);
    } catch {
      throwIfAborted(opts.signal);
      return await iframeDirectoryHtml(url, opts, state.stats);
    }
  };

  const loadDirectory = async (node: FolderNode, parent?: FolderNode): Promise<FolderNode | null> => {
    const requestedKey = keyForVisited(new URL(node.url));
    const loaded = await loadDocument(node.url);
    throwIfAborted(opts.signal);
    const url = normalizeDirectoryUrl(loaded.url);
    const final = new URL(url);
    if (node !== root && opts.sameOriginOnly && final.origin !== new URL(root.url).origin) {
      throw new Error('Child directory redirected to another origin');
    }
    const finalKey = keyForVisited(final);
    if (node !== root && opts.sameOriginOnly && !isChild(new URL(root.url), final) && !folders.has(finalKey)) {
      throw new Error('Child directory redirected outside the starting directory');
    }
    if (finalKey !== requestedKey) {
      const existing = folders.get(finalKey);
      folders.delete(requestedKey);
      if (existing && existing !== node) {
        if (parent) parent.children = parent.children.filter(child => child !== node);
        if (existing.role !== 'child' || state.visited.has(finalKey)) return null;
        node = existing;
      } else {
        const updated = createNode(url, node.role, node.depth, state.errors);
        Object.assign(node, updated);
        folders.set(finalKey, node);
      }
    }
    node.url = url;
    if (node !== root && isChild(new URL(root.url), final)) node.depth = relativeDepth(new URL(root.url), final);
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
    });
    for (const error of parsed.errors) {
      if (error.startsWith('limit:')) reportLimit();
      else state.errors.push(error);
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
        child = { ...createNode(folder.url, role, depth, state.errors), date: folder.date ?? null };
        folders.set(key, child);
      }
      if (role === 'child' && !parents.has(child) && !state.visited.has(key)) {
        parents.set(child, node);
        node.children.push(child);
      }
    }
    for (const file of parsed.files) {
      throwIfAborted(opts.signal);
      const key = keyForFile(new URL(file.url));
      if (files.has(key)) continue;
      if (!canAdd()) break;
      const entry: FileEntry = {
        kind: 'file', url: file.url, name: file.name || '', rawName: file.rawName || '',
        hidden: file.hidden || false, size: file.size ?? null, date: file.date ?? null
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
    folders.set(keyForVisited(new URL(url)), createNode(url, role, 0, state.errors));
  }

  // Use an explicit depth-first stack so a deep tree does not retain recursive calls.
  const pending: Array<{ node: FolderNode; parent: FolderNode }> = [];
  const enqueue = (parent: FolderNode) => {
    for (let index = parent.children.length - 1; index >= 0; index--) {
      const node = parent.children[index];
      if (node.depth <= opts.maxDepth) pending.push({ node, parent });
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
    const key = keyForVisited(new URL(next.node.url));
    if (state.visited.has(key)) continue;
    state.visited.add(key);
    try {
      const loaded = await loadDirectory(next.node, next.parent);
      if (loaded) enqueue(loaded);
    } catch (error) {
      throwIfAborted(opts.signal);
      if (!opts.continueOnError) throw error;
      pushError(state.errors, 'traversal', `failed to load ${next.node.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const folder of folders.values()) state.allFolders.push(folder);
  for (const file of files.values()) state.allFiles.push(file);
  state.safetyCount = entryCount();
  return root;
}

function createNode(url: string, role: FolderEntry['role'], depth: number, errors: string[]): FolderNode {
  const rawName = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
  const name = safeDecodeURIComponent(rawName, errors);
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
