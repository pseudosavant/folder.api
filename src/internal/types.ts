import type { FileEntry, FolderEntry } from '../types.js';

export interface InternalDirectoryParse {
  folders: Array<Partial<FolderEntry> & { url: string }>;
  files: Array<Partial<FileEntry> & { url: string }>;
  errors: string[];
}

export interface NormalizedOptions {
  maxDepth: number;
  maxEntries: number;
  maxResponseBytes: number;
  continueOnError: boolean;
  mode: 'fetch' | 'iframe' | 'auto';
  cache: RequestCache;
  listingSelector?: string;
  includeMime: boolean;
  includeProvenance: boolean;
  headConcurrency: number;
  timeoutMs: number;
  sameOriginOnly: boolean;
  signal?: AbortSignal;
}

export interface LoadedDirectory {
  html: string;
  url: string;
  contentType: 'text/html' | 'application/xhtml+xml';
}
