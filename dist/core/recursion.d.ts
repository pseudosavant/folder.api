import { FolderNode, FolderEntry, FileEntry, NormalizedOptions } from '../types.js';
interface RecursionState {
    visited: Set<string>;
    allFolders: FolderEntry[];
    allFiles: FileEntry[];
    errors: string[];
    stats: {
        fetches: number;
        iframes: number;
        heads: number;
    };
    safetyCount: number;
    maxDepthEncountered: number;
}
export declare function traverse(startUrl: string, opts: NormalizedOptions, state: RecursionState): Promise<FolderNode>;
export {};
