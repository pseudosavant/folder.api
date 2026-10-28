export function ensureHttp(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch (e) {
    throw new Error(`invalid url: ${url}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`unsupported scheme: ${u.protocol}`);
  }
  // normalize duplicate slashes in pathname
  u.pathname = u.pathname.replace(/\/+/g, '/');
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  u.hash = '';
  return u;
}

export function normalizeDirectoryUrl(url: string): string {
  return ensureHttp(url).toString();
}

export function keyForVisited(u: URL): string {
  return `${u.origin}${canonicalPath(u.pathname)}`;
}

export function keyForFile(u: URL): string {
  return keyForVisited(u) + u.search;
}

function canonicalPath(pathname: string): string {
  return pathname.replace(/%[\da-f]{2}/gi, encoded => {
    const decoded = String.fromCharCode(parseInt(encoded.slice(1), 16));
    return /^[\w.~-]$/.test(decoded) ? decoded : encoded.toUpperCase();
  });
}

export function parentDirectory(u: URL): string | null {
  const parts = u.pathname.split('/').filter(p => p.length > 0);
  if (parts.length === 0) return null; // already root
  parts.pop();
  return `${u.protocol}//${u.host}/${parts.join('/')}${parts.length ? '/' : ''}`;
}

export function rootDirectory(u: URL): string {
  return `${u.protocol}//${u.host}/`;
}

export function isHiddenName(name: string): boolean {
  return name.startsWith('.') && name !== '.' && name !== '..';
}
