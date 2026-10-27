export type EntryKind = 'file' | 'folder';
export type FolderRole = 'root' | 'self' | 'parent' | 'child';
export interface FolderApiOptions {
    maxDepth?: number;
    maxEntries?: number;
    continueOnError?: boolean;
    mode?: 'fetch' | 'iframe' | 'auto';
    cache?: RequestCache;
    includeMime?: boolean;
    headConcurrency?: number;
    timeoutMs?: number;
    sameOriginOnly?: boolean;
    signal?: AbortSignal;
}
export interface BaseEntry {
    kind: EntryKind;
    url: string;
    name: string;
    rawName: string;
    hidden: boolean;
    size: number | null;
    date: string | null;
    mime?: string | null;
}
export interface FileEntry extends BaseEntry {
    kind: 'file';
}
export interface FolderEntry extends BaseEntry {
    kind: 'folder';
    role: FolderRole;
    depth: number;
}
export interface FolderNode extends FolderEntry {
    children: FolderNode[];
    files: FileEntry[];
}
export interface FolderApiResult {
    url: string;
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
    folders: Array<Partial<FolderEntry> & {
        url: string;
    }>;
    files: Array<Partial<FileEntry> & {
        url: string;
    }>;
    errors: string[];
}
export interface NormalizedOptions {
    maxDepth: number;
    maxEntries: number;
    continueOnError: boolean;
    mode: 'fetch' | 'iframe' | 'auto';
    cache: RequestCache;
    includeMime: boolean;
    headConcurrency: number;
    timeoutMs: number;
    sameOriginOnly: boolean;
    signal?: AbortSignal;
}
export interface LoadedDirectory {
    html: string;
    url: string;
}
