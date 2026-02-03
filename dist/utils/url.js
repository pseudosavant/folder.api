export function ensureHttp(url) {
    let u;
    try {
        u = new URL(url);
    }
    catch (e) {
        throw new Error(`invalid url: ${url}`);
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error(`unsupported scheme: ${u.protocol}`);
    }
    // normalize duplicate slashes in pathname
    u.pathname = u.pathname.replace(/\/+/g, '/');
    if (!u.pathname.endsWith('/'))
        u.pathname += '/';
    return u;
}
export function normalizeDirectoryUrl(url) {
    return ensureHttp(url).toString();
}
export function keyForVisited(u) {
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname}`;
}
export function isSameOrigin(a, b) {
    return a.protocol === b.protocol && a.host.toLowerCase() === b.host.toLowerCase();
}
export function parentDirectory(u) {
    const parts = u.pathname.split('/').filter(p => p.length > 0);
    if (parts.length === 0)
        return null; // already root
    parts.pop();
    return `${u.protocol}//${u.host}/${parts.join('/')}${parts.length ? '/' : ''}`;
}
export function rootDirectory(u) {
    return `${u.protocol}//${u.host}/`;
}
export function lastSegment(u) {
    const parts = u.pathname.split('/').filter(Boolean);
    const raw = parts[parts.length - 1] ?? '';
    let decoded = raw;
    try {
        decoded = decodeURIComponent(raw);
    }
    catch { /* swallow */ }
    return { raw, decoded };
}
export function isHiddenName(name) {
    return name.startsWith('.') && name !== '.' && name !== '..';
}
