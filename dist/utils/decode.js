export function safeDecodeURIComponent(segment, errors) {
    try {
        return decodeURIComponent(segment);
    }
    catch (e) {
        errors.push(`decode: failed to decode segment '${segment}'`);
        return segment; // fallback to raw
    }
}
