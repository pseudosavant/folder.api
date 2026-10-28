import { FileEntry } from '../types.js';
import { NormalizedOptions } from '../internal/types.js';
import { ErrorSink } from '../utils/errors.js';
export declare function enrichMime(files: FileEntry[], opts: NormalizedOptions, stats: {
    heads: number;
}, sink: ErrorSink): Promise<void>;
