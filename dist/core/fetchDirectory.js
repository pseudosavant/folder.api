import { createRequestController, throwIfAborted } from '../utils/abort.js';
export async function fetchDirectoryHtml(url, opts, stats) {
    const request = createRequestController(opts.signal, opts.timeoutMs);
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            cache: opts.cache,
            mode: opts.cache === 'only-if-cached' ? 'same-origin' : undefined,
            signal: request.signal,
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        stats.fetches++;
        if (res.status !== 200)
            throw new Error(`http ${res.status}${res.statusText ? ' ' + res.statusText : ''}`);
        const ctype = res.headers.get('content-type') || '';
        if (!/text\/html/i.test(ctype))
            throw new Error(`not html content-type: ${ctype}`);
        const html = await res.text();
        throwIfAborted(opts.signal);
        return { html, url: res.url || url };
    }
    finally {
        request.dispose();
    }
}
