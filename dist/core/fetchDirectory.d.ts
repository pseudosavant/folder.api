import { LoadedDirectory, NormalizedOptions } from '../internal/types.js';
export declare function fetchDirectoryHtml(url: string, opts: NormalizedOptions, stats: {
    fetches: number;
}): Promise<LoadedDirectory>;
