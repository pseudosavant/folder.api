import { RequestFailure } from './errors.js';
export const htmlNamespace = 'http://www.w3.org/1999/xhtml';
export function listingContentType(raw, phase, url) {
    const type = raw.split(';', 1)[0].trim().toLowerCase();
    if (type === 'text/html' || type === 'application/xhtml+xml')
        return type;
    throw new RequestFailure({ category: 'traversal', code: 'content-type', phase, url,
        message: `${phase === 'fetch' ? 'GET' : 'iframe'} ${url} returned unsupported content-type: ${raw || '(missing)'}` });
}
export function validateListingDocument(doc, type, url) {
    if (type === 'application/xhtml+xml' && (doc.getElementsByTagNameNS('*', 'parsererror').length > 0
        || doc.documentElement?.namespaceURI !== htmlNamespace || doc.documentElement.localName !== 'html')) {
        throw new RequestFailure({ category: 'traversal', code: 'parse', phase: 'parse', url,
            message: `Malformed XHTML directory listing at ${url}` });
    }
}
export function responseLimit(url, phase, maximum) {
    return new RequestFailure({ category: 'limit', code: 'response-limit', phase, url,
        message: `Directory response for ${url} exceeds maxResponseBytes (${maximum} bytes)` });
}
export function checkSerializedSize(html, url, maximum) {
    let bytes = 0;
    for (const character of html) {
        const point = character.codePointAt(0);
        bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
        if (bytes > maximum)
            throw responseLimit(url, 'iframe', maximum);
    }
}
