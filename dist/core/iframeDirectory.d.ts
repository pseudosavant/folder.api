import { LoadedDirectory, NormalizedOptions } from '../internal/types.js';
export declare function iframeDirectoryHtml(url: string, opts: NormalizedOptions, stats: {
    iframes: number;
}): Promise<LoadedDirectory>;
