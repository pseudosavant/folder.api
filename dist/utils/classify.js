import { isHiddenName } from './url.js';
export function classifyEntry(href, metadataText) {
    const pathname = typeof href === 'string' ? new URL(href).pathname : href.pathname;
    if (pathname.endsWith('/'))
        return 'folder';
    if (/<\s*dir\s*>|\[(?:dir|folder|directory)\]/i.test(metadataText)
        || /^(?:dir|folder|directory)$/i.test(metadataText.trim()))
        return 'folder';
    return 'file'; // bias toward file if uncertain (most servers list explicit slash for folders)
}
export function detectHidden(decodedName) {
    return isHiddenName(decodedName);
}
