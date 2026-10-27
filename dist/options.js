const integerOption = (value, fallback, minimum, maximum = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(value)))
    : fallback;
export function normalizeOptions(opts) {
    const cache = opts?.cache ?? 'default';
    return {
        maxDepth: integerOption(opts?.maxDepth, 0, 0),
        maxEntries: integerOption(opts?.maxEntries, 50000, 1, 50000),
        continueOnError: opts?.continueOnError === true,
        mode: opts?.mode === 'fetch' || opts?.mode === 'iframe' ? opts.mode : 'auto',
        cache: ['default', 'no-store', 'no-cache', 'reload', 'force-cache', 'only-if-cached'].includes(cache) ? cache : 'default',
        includeMime: opts?.includeMime ?? false,
        headConcurrency: integerOption(opts?.headConcurrency, 4, 1),
        timeoutMs: integerOption(opts?.timeoutMs, 15000, 100, 2147483647),
        sameOriginOnly: opts?.sameOriginOnly ?? true,
        signal: opts?.signal
    };
}
