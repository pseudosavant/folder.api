import { FileEntry, NormalizedOptions } from '../types.js';
export declare function enrichMime(files: FileEntry[], opts: NormalizedOptions, stats: {
    heads: number;
}, errors: string[]): Promise<void>;
