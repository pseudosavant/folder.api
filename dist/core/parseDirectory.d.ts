import { InternalDirectoryParse, LoadedDirectory, NormalizedOptions } from '../internal/types.js';
export declare function parseDirectoryHtml(baseUrl: string, html: string, opts: NormalizedOptions, admitEntry?: (kind: 'file' | 'folder', url: URL) => 'accept' | 'skip' | 'limit', contentType?: LoadedDirectory['contentType']): InternalDirectoryParse;
