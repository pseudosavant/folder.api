import { createRequestController, throwIfAborted } from '../utils/abort.js';
import { RequestFailure, requestFailure } from '../utils/errors.js';
import { listingContentType, responseLimit } from '../utils/document.js';
export async function fetchDirectoryHtml(url, opts, stats) {
    const request = createRequestController(opts.signal, opts.timeoutMs);
    let res;
    let complete = false;
    try {
        stats.fetches++;
        res = await fetch(url, {
            redirect: 'follow',
            cache: opts.cache,
            mode: opts.cache === 'only-if-cached' ? 'same-origin' : undefined,
            signal: request.signal,
            headers: {
                'Accept': 'text/html,application/xhtml+xml'
            }
        });
        if (res.status !== 200)
            throw new RequestFailure({ category: 'traversal', code: 'http', phase: 'fetch', url,
                status: res.status, message: `GET ${url} returned HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}` });
        const contentType = listingContentType(res.headers.get('content-type') || '', 'fetch', url);
        const html = await readLimitedBody(res, res.url || url, opts.maxResponseBytes);
        throwIfAborted(opts.signal);
        complete = true;
        return { html, url: res.url || url, contentType };
    }
    catch (error) {
        throwIfAborted(opts.signal);
        throw requestFailure(request.signal.aborted ? request.signal.reason : error, 'fetch', url, opts.timeoutMs);
    }
    finally {
        if (!complete) {
            request.abort();
            // Abort the transport and cancel unlocked bodies returned by custom fetch implementations.
            if (res?.body && !res.body.locked)
                void res.body.cancel().catch(() => { });
        }
        request.dispose();
    }
}
async function readLimitedBody(response, url, maximum) {
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parts = [];
    let bytes = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            bytes += value.byteLength;
            if (bytes > maximum)
                throw responseLimit(url, 'fetch', maximum);
            parts.push(decoder.decode(value, { stream: true }));
        }
        parts.push(decoder.decode());
        return parts.join('');
    }
    catch (error) {
        void reader.cancel().catch(() => { });
        throw error;
    }
    finally {
        reader.releaseLock();
    }
}
