import { FolderNode, FolderEntry, FileEntry, NormalizedOptions } from '../types.js';
import { fetchDirectoryHtml } from './fetchDirectory.js';
import { iframeDirectoryHtml } from './iframeDirectory.js';
import { parseDirectoryHtml } from './parseDirectory.js';
import { normalizeDirectoryUrl, keyForVisited, parentDirectory, rootDirectory } from '../utils/url.js';
import { pushError } from '../utils/errors.js';

interface RecursionState {
  visited: Set<string>;
  allFolders: FolderEntry[];
  allFiles: FileEntry[];
  errors: string[];
  stats: { fetches: number; iframes: number; heads: number; };
  safetyCount: number;
  maxDepthEncountered: number;
}

export async function traverse(startUrl: string, opts: NormalizedOptions, state: RecursionState): Promise<FolderNode> {
  const normalized = normalizeDirectoryUrl(startUrl);
  const u = new URL(normalized);
  const key = keyForVisited(u);
  if (state.visited.has(key)) {
    pushError(state.errors, 'loop', `already visited ${normalized}`);
    return createEmptyNode(normalized, u, 0, 'self');
  }
  state.visited.add(key);
  const rootDir = rootDirectory(u);
  const parentDir = parentDirectory(u);

  const node: FolderNode = createEmptyNode(normalized, u, 0, 'self');
  state.allFolders.push(node);

  async function loadDirectory(current: FolderNode) {
    if (state.safetyCount > 50000) {
      pushError(state.errors, 'limit', 'entry limit exceeded');
      return;
    }
    let html: string | null = null;
    const mode = opts.mode;
    if (mode === 'fetch') {
      // fetch only
      html = await fetchDirectoryHtml(current.url, opts, state.stats);
    } else if (mode === 'iframe') {
      // iframe only
      html = await iframeDirectoryHtml(current.url, opts, state.stats);
    } else { // auto
      try {
        html = await fetchDirectoryHtml(current.url, opts, state.stats);
      } catch (e) {
        // fallback to iframe
        html = await iframeDirectoryHtml(current.url, opts, state.stats);
      }
    }
    if (html == null) throw new Error('failed to load directory');
    const parsed = parseDirectoryHtml(current.url, html, opts);
    for (const e of parsed.errors) state.errors.push(e);

    // Assign roles & depth for folders
    const currentUrl = new URL(current.url);
    for (const f of parsed.folders) {
      const folderUrl = f.url;
      const folderU = new URL(folderUrl);
      const depth = depthFrom(currentUrl, folderU);
      const role = determineRole(folderUrl, normalized, rootDir, parentDir);
      const folderEntry: FolderEntry = {
        kind: 'folder',
        url: folderUrl,
        rawName: f.rawName || folderUrl.split('/').filter(Boolean).pop() || '',
        name: f.name || f.rawName || '',
        hidden: f.hidden || false,
        size: null,
        date: f.date ?? null,
        role,
        depth,
      };
      if (!state.allFolders.find(x => x.url === folderEntry.url && x.role === folderEntry.role)) {
        state.allFolders.push(folderEntry);
      }
      if (role === 'child') {
        const childNode: FolderNode = { ...folderEntry, children: [], files: [] };
        current.children.push(childNode);
      }
  state.safetyCount++;
    }
    for (const fi of parsed.files) {
      const fileEntry: FileEntry = {
        kind: 'file',
        url: fi.url,
        rawName: fi.rawName || fi.url.split('/').filter(Boolean).pop() || '',
        name: fi.name || fi.rawName || '',
        hidden: fi.hidden || false,
        size: fi.size ?? null,
        date: fi.date ?? null,
      };
      state.allFiles.push(fileEntry);
      current.files.push(fileEntry);
      state.safetyCount++;
    }

    // Ensure parent & root entries exist (not traversed) even if absent in listing
    if (current.role === 'self') {
      if (rootDir && !state.allFolders.find(f => f.url === rootDir)) {
        const rootNode = createEmptyNode(rootDir, new URL(rootDir), 0, 'root');
        state.allFolders.push(rootNode);
        state.safetyCount++;
      }
      if (parentDir && !state.allFolders.find(f => f.url === parentDir)) {
        const parentNode = createEmptyNode(parentDir, new URL(parentDir), 0, 'parent');
        state.allFolders.push(parentNode);
        state.safetyCount++;
      }
    }
  }

  await loadDirectory(node);

  async function dfs(current: FolderNode, currentDepth: number) {
    state.maxDepthEncountered = Math.max(state.maxDepthEncountered, currentDepth);
    if (currentDepth >= opts.maxDepth) return; // stop
    for (const child of current.children) {
      // role child ensures depth computation
      if (child.role !== 'child') continue;
      const childU = new URL(child.url);
      const childKey = keyForVisited(childU);
      if (state.visited.has(childKey)) continue;
      state.visited.add(childKey);
      await loadDirectory(child);
      await dfs(child, currentDepth + 1);
    }
  }

  await dfs(node, 0);
  return node;
}

function createEmptyNode(url: string, u: URL, depth: number, role: 'self'|'child'|'root'|'parent'): FolderNode {
  const seg = u.pathname.split('/').filter(Boolean).pop() || '';
  return {
    kind: 'folder',
    url,
    rawName: seg,
    name: seg,
    hidden: seg.startsWith('.') && seg !== '.' && seg !== '..',
    size: null,
    date: null,
    role,
    depth,
    children: [],
    files: []
  };
}

function depthFrom(base: URL, candidate: URL): number {
  const bParts = base.pathname.split('/').filter(Boolean);
  const cParts = candidate.pathname.split('/').filter(Boolean);
  if (cParts.length < bParts.length) return 0; // parent or root
  return cParts.length - bParts.length;
}

function determineRole(url: string, start: string, root: string, parent: string | null): 'root' | 'self' | 'parent' | 'child' {
  if (url === start) return 'self';
  if (url === root) return 'root';
  if (parent && url === parent) return 'parent';
  return 'child';
}
