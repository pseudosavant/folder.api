import { NormalizedOptions } from '../types.js';
export declare function fetchDirectoryHtml(url: string, opts: NormalizedOptions, stats: {
    fetches: number;
}): Promise<string>;
