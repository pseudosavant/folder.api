import { createRequestController, throwIfAborted } from '../utils/abort.js';
import { pushError } from '../utils/errors.js';
export async function enrichMime(files, opts, stats, errors) {
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
                const res = await fetch(file.url, { method: 'HEAD', signal: request.signal });
                throwIfAborted(opts.signal);
                stats.heads++;
                if (res.ok) {
                    if (file.mime == null)
                        file.mime = res.headers.get('content-type');
                    const length = res.headers.get('content-length');
                    if (file.size == null && length && /^\d+$/.test(length)) {
                        const size = Number(length);
                        if (Number.isSafeInteger(size) && size >= 0)
                            file.size = size;
                    }
                }
                else if (res.status === 405 || res.status === 501) {
                    pushError(errors, 'mime', `HEAD not supported for ${file.url}`);
                }
                else {
                    pushError(errors, 'mime', `HEAD ${res.status} for ${file.url}`);
                }
            }
            catch {
                throwIfAborted(opts.signal);
                pushError(errors, 'mime', `failed HEAD for ${file.url}`);
            }
            finally {
                request.dispose();
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(opts.headConcurrency, files.length) }, worker));
}
