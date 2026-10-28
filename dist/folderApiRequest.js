import { normalizeOptions } from './options.js';
import { traverse } from './core/recursion.js';
import { enrichMime } from './core/mime.js';
import { throwIfAborted } from './utils/abort.js';
export async function folderApiRequest(url, options) {
    const opts = normalizeOptions(options);
    throwIfAborted(opts.signal);
    const started = performance.now?.() ?? Date.now();
    const state = {
        visited: new Set(),
        allFolders: [],
        allFiles: [],
        errors: [],
        errorDetails: [],
        stats: { fetches: 0, iframes: 0, heads: 0 },
        maxDepthEncountered: 0
    };
    const rootNode = await traverse(url, opts, state);
    if (opts.includeMime) {
        await enrichMime(state.allFiles, opts, state.stats, state);
    }
    const durationMs = (performance.now?.() ?? Date.now()) - started;
    const entries = [...state.allFolders, ...state.allFiles];
    return {
        url: rootNode.url,
        root: rootNode,
        folders: state.allFolders,
        files: state.allFiles,
        entries,
        generatedAt: new Date().toISOString(),
        errors: state.errors,
        errorDetails: state.errorDetails,
        stats: {
            fetches: state.stats.fetches,
            iframes: state.stats.iframes,
            heads: state.stats.heads,
            durationMs,
            maxDepth: state.maxDepthEncountered
        }
    };
}
