import { normalizeOptions } from './options.js';
import { traverse } from './core/recursion.js';
import { enrichMime } from './core/mime.js';
export async function folderApiRequest(url, options) {
    const opts = normalizeOptions(options);
    const started = performance.now?.() ?? Date.now();
    const state = {
        visited: new Set(),
        allFolders: [],
        allFiles: [],
        errors: [],
        stats: { fetches: 0, iframes: 0, heads: 0 },
        safetyCount: 0,
        maxDepthEncountered: 0
    };
    const rootNode = await traverse(url, opts, state);
    if (opts.includeMime) {
        await enrichMime(state.allFiles, opts, state.stats, state.errors);
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
        stats: {
            fetches: state.stats.fetches,
            iframes: state.stats.iframes,
            heads: state.stats.heads,
            durationMs,
            maxDepth: state.maxDepthEncountered
        }
    };
}
