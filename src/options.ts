import { FolderApiOptions } from './types.js';
import { NormalizedOptions } from './internal/types.js';

const integerOption = (value: number | undefined, fallback: number, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(value)))
    : fallback;

export function normalizeOptions(opts: FolderApiOptions | undefined): NormalizedOptions {
  const mode = opts?.mode === 'fetch' || opts?.mode === 'iframe' ? opts.mode : 'auto';
  const requestedCache = opts?.cache ?? 'default';
  const cache = ['default', 'no-store', 'no-cache', 'reload', 'force-cache', 'only-if-cached'].includes(requestedCache)
    ? requestedCache : 'default';
  if (mode === 'iframe' && cache !== 'default') {
    throw new TypeError(`mode: 'iframe' only supports cache: 'default'. Iframe navigation cannot honor cache: '${cache}'. Use mode: 'fetch' or mode: 'auto' instead.`);
  }
  const listingSelector = opts?.listingSelector;
  if (listingSelector !== undefined && (typeof listingSelector !== 'string' || !listingSelector.trim())) {
    throw new TypeError('listingSelector must be a nonempty CSS selector string');
  }
  return {
    maxDepth: integerOption(opts?.maxDepth, 0, 0),
    maxEntries: integerOption(opts?.maxEntries, 50000, 1, 50000),
    maxResponseBytes: integerOption(opts?.maxResponseBytes, 4 * 1024 * 1024, 1),
    continueOnError: opts?.continueOnError === true,
    mode,
    cache,
    listingSelector,
    includeMime: opts?.includeMime ?? false,
    includeProvenance: opts?.includeProvenance === true,
    headConcurrency: integerOption(opts?.headConcurrency, 4, 1),
    timeoutMs: integerOption(opts?.timeoutMs, 15000, 100, 2147483647),
    sameOriginOnly: opts?.sameOriginOnly ?? true,
    signal: opts?.signal
  };
}
