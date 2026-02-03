export async function fetchDirectoryHtml(url, opts, stats) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    if (opts.signal) {
        const onAbort = () => controller.abort();
        if (opts.signal.aborted)
            controller.abort();
        opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            signal: controller.signal,
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
        return await res.text();
    }
    finally {
        clearTimeout(timer);
    }
}
