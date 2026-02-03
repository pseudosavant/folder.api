import { isHiddenName } from './url.js';
export function classifyEntry(href, metadataText) {
    if (href.endsWith('/'))
        return 'folder';
    // file if last segment contains a dot not at start/end
    const last = href.split('/').filter(Boolean).pop() || '';
    if (/^[^.].*\.[^.]+$/.test(last))
        return 'file';
    // heuristic keywords for folders
    if (/\b(dir|folder|directory)\b/i.test(metadataText))
        return 'folder';
    return 'file'; // bias toward file if uncertain (most servers list explicit slash for folders)
}
export function detectHidden(decodedName) {
    return isHiddenName(decodedName);
}
