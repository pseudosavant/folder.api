export type EntryKind = 'file' | 'folder';
export type FolderRole = 'root' | 'self' | 'parent' | 'child';

export interface FolderApiOptions {
  maxDepth?: number; // default 0
  mode?: 'fetch' | 'iframe' | 'auto'; // default auto
  includeMime?: boolean; // default false
  headConcurrency?: number; // default 4
  timeoutMs?: number; // default 15000 per directory
  sameOriginOnly?: boolean; // default true
  signal?: AbortSignal; // optional
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

export interface FolderApiResult {
  url: string; // normalized starting URL
  root: FolderNode;
  folders: FolderEntry[];
  files: FileEntry[];
  entries: Array<FolderEntry | FileEntry>;
  generatedAt: string;
  errors: string[];
  stats: {
    fetches: number;
    iframes: number;
    heads: number;
    durationMs: number;
    maxDepth: number;
  };
}

export interface InternalDirectoryParse {
  folders: Array<Partial<FolderEntry> & { url: string }>; // may miss role, depth until normalized
  files: Array<Partial<FileEntry> & { url: string }>; // size/date may be null
  errors: string[];
}

export interface NormalizedOptions {
  maxDepth: number;
  mode: 'fetch' | 'iframe' | 'auto';
  includeMime: boolean;
  headConcurrency: number;
  timeoutMs: number;
  sameOriginOnly: boolean;
  signal?: AbortSignal;
}
