import { createRequestController, throwIfAborted } from '../utils/abort.js';
import { recordError, requestFailure } from '../utils/errors.js';
export async function enrichMime(files, opts, stats, sink) {
    throwIfAborted(opts.signal);
    if (!opts.includeMime || files.length === 0)
        return;
    let next = 0;
    const worker = async () => {
        while (next < files.length) {
            throwIfAborted(opts.signal);
            const file = files[next++];
            if (file.mime != null && file.size != null)
                continue;
            const request = createRequestController(opts.signal, opts.timeoutMs);
            try {
                stats.heads++;
                const res = await fetch(file.url, { method: 'HEAD', signal: request.signal });
                throwIfAborted(opts.signal);
                if (res.ok) {
                    if (file.mime == null) {
                        file.mime = res.headers.get('content-type');
                        if (opts.includeProvenance && file.mime !== null) {
                            (file.provenance ?? (file.provenance = {})).mime = { source: 'head', raw: file.mime };
                        }
                    }
                    const length = res.headers.get('content-length');
                    if (file.size == null && length && /^\d+$/.test(length)) {
                        const size = Number(length);
                        if (Number.isSafeInteger(size) && size >= 0) {
                            file.size = size;
                            if (opts.includeProvenance)
                                (file.provenance ?? (file.provenance = {})).size = { source: 'head', raw: length, precision: 'exact' };
                        }
                    }
                }
                else if (res.status === 405 || res.status === 501) {
                    recordError(sink, { category: 'mime', code: 'unsupported-method', phase: 'head', url: file.url, status: res.status,
                        message: `mime: HEAD not supported for ${file.url}` });
                }
                else {
                    recordError(sink, { category: 'mime', code: 'http', phase: 'head', url: file.url, status: res.status,
                        message: `mime: HEAD ${res.status} for ${file.url}` });
                }
            }
            catch (error) {
                throwIfAborted(opts.signal);
                const failure = requestFailure(request.signal.aborted ? request.signal.reason : error, 'head', file.url, opts.timeoutMs);
                recordError(sink, { ...failure.details, message: `mime: ${failure.message}` });
            }
            finally {
                request.dispose();
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(opts.headConcurrency, files.length) }, worker));
}
