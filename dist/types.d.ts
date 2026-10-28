export type EntryKind = 'file' | 'folder';
export type FolderRole = 'root' | 'self' | 'parent' | 'child';
export interface FolderApiOptions {
    maxDepth?: number;
    maxEntries?: number;
    maxResponseBytes?: number;
    continueOnError?: boolean;
    mode?: 'fetch' | 'iframe' | 'auto';
    cache?: RequestCache;
    listingSelector?: string;
    includeMime?: boolean;
    includeProvenance?: boolean;
    headConcurrency?: number;
    timeoutMs?: number;
    sameOriginOnly?: boolean;
    signal?: AbortSignal;
}
export interface EntryProvenance {
    size?: {
        source: 'listing' | 'head';
        raw: string;
        precision: 'exact' | 'estimated';
    };
    date?: {
        source: 'listing';
        raw: string;
        timezone: 'explicit' | 'assumed-utc';
    };
    mime?: {
        source: 'head';
        raw: string;
    };
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
    provenance?: EntryProvenance;
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
export interface FolderApiErrorDetail {
    category: string;
    code: 'parse' | 'limit' | 'response-limit' | 'http' | 'network' | 'timeout' | 'unsupported-method' | 'content-type' | 'iframe' | 'scope';
    phase: 'parse' | 'fetch' | 'iframe' | 'head' | 'traversal';
    url: string;
    message: string;
    status?: number;
    cause?: {
        name: string;
        message: string;
    };
    previous?: FolderApiErrorDetail;
}
export interface FolderApiResult {
    url: string;
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
