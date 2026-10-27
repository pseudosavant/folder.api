import { throwIfAborted } from '../utils/abort.js';
export async function iframeDirectoryHtml(url, opts, stats) {
    throwIfAborted(opts.signal);
    if (typeof document === 'undefined')
        throw new Error('iframe mode not supported in this environment');
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    Object.assign(iframe.style, { position: 'absolute', width: '0', height: '0', border: '0', visibility: 'hidden' });
    return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => fail(new Error('iframe timeout')), opts.timeoutMs);
        function cleanup() {
            clearTimeout(timer);
            iframe.removeEventListener('load', onLoad);
            iframe.removeEventListener('error', onError);
            opts.signal?.removeEventListener('abort', onAbort);
            iframe.remove();
        }
        function fail(error) {
            cleanup();
            reject(error);
        }
        function onAbort() {
            fail(opts.signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
        }
        function onLoad() {
            try {
                throwIfAborted(opts.signal);
                const doc = iframe.contentDocument;
                if (!doc)
                    throw new Error('Unable to read iframe document. Same-origin access is required.');
                if (doc.URL === 'about:blank')
                    return;
                const result = { html: doc.documentElement?.outerHTML || '', url: doc.URL || url };
                cleanup();
                resolve(result);
            }
            catch (error) {
                fail(error);
            }
        }
        function onError() { fail(new Error('iframe error')); }
        iframe.addEventListener('load', onLoad);
        iframe.addEventListener('error', onError);
        opts.signal?.addEventListener('abort', onAbort, { once: true });
        try {
            iframe.src = url;
            document.body.appendChild(iframe);
            stats.iframes++;
        }
        catch (error) {
            fail(error);
        }
    });
}
