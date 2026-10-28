import { FolderNode, FolderEntry, FileEntry } from '../types.js';
import { NormalizedOptions } from '../internal/types.js';
import { ErrorSink } from '../utils/errors.js';
interface RecursionState extends ErrorSink {
    visited: Set<string>;
    allFolders: FolderEntry[];
    allFiles: FileEntry[];
    stats: {
        fetches: number;
        iframes: number;
        heads: number;
    };
    maxDepthEncountered: number;
}
export declare function traverse(startUrl: string, opts: NormalizedOptions, state: RecursionState): Promise<FolderNode>;
export {};
