export type EntryKind = 'file' | 'folder';
export type FolderRole = 'root' | 'self' | 'parent' | 'child';

export interface FolderApiOptions {
  maxDepth?: number; // default 0
  maxEntries?: number; // default and maximum 50000, includes navigation entries
  maxResponseBytes?: number; // default 4194304 per directory response
  continueOnError?: boolean; // default false, applies to child directory failures
  mode?: 'fetch' | 'iframe' | 'auto'; // default auto
  cache?: RequestCache; // directory fetch cache policy, non-default requires fetch or auto mode
  listingSelector?: string; // optional CSS selector for listing containers or links
  includeMime?: boolean; // default false
  includeProvenance?: boolean; // default false
  headConcurrency?: number; // default 4
  timeoutMs?: number; // default 15000 per directory
  sameOriginOnly?: boolean; // default true
  signal?: AbortSignal; // optional
}

export interface EntryProvenance {
  size?: { source: 'listing' | 'head'; raw: string; precision: 'exact' | 'estimated' };
  date?: { source: 'listing'; raw: string; timezone: 'explicit' | 'assumed-utc' };
  mime?: { source: 'head'; raw: string };
}

export interface BaseEntry {
  kind: EntryKind;
  url: string; // absolute normalized
  name: string; // decoded segment
  rawName: string; // original segment before decode
  hidden: boolean;
  size: number | null;
  date: string | null; // ISO 8601 UTC
  mime?: string | null; // only when includeMime
  provenance?: EntryProvenance; // only when includeProvenance and metadata is known
}

export interface FileEntry extends BaseEntry { kind: 'file'; }

export interface FolderEntry extends BaseEntry {
  kind: 'folder';
  role: FolderRole;
  depth: number; // 0 = self
}

export interface FolderNode extends FolderEntry {
  children: FolderNode[];
  files: FileEntry[];
}

export interface FolderApiErrorDetail {
  category: string;
  code: 'parse' | 'limit' | 'response-limit' | 'http' | 'network' | 'timeout' | 'unsupported-method' | 'content-type' | 'iframe' | 'scope';
  phase: 'parse' | 'fetch' | 'iframe' | 'head' | 'traversal';
  url: string;
  message: string;
  status?: number;
  cause?: { name: string; message: string };
  previous?: FolderApiErrorDetail;
}

export interface FolderApiResult {
  url: string; // normalized starting URL
  root: FolderNode;
  folders: FolderEntry[];
  files: FileEntry[];
  entries: Array<FolderEntry | FileEntry>;
  generatedAt: string;
  errors: string[];
  errorDetails: FolderApiErrorDetail[];
  stats: {
    fetches: number;
    iframes: number;
    heads: number;
    durationMs: number;
    maxDepth: number;
  };
}
