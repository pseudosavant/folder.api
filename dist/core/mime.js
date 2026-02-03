import { Semaphore } from '../utils/semaphore.js';
import { pushError } from '../utils/errors.js';
export async function enrichMime(files, opts, stats, errors) {
    if (!opts.includeMime || files.length === 0)
        return;
    const sem = new Semaphore(opts.headConcurrency);
    await Promise.all(files.map(async (f) => {
        const release = await sem.acquire();
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
            const res = await fetch(f.url, { method: 'HEAD', signal: controller.signal });
            stats.heads++;
            clearTimeout(timer);
            if (res.ok) {
                if (!f.mime)
                    f.mime = res.headers.get('content-type');
                const len = res.headers.get('content-length');
                if (len && !f.size) {
                    const n = Number(len);
                    if (!isNaN(n))
                        f.size = n;
                }
            }
            else if (res.status === 405 || res.status === 501) {
                pushError(errors, 'mime', 'HEAD not supported');
            }
        }
        catch (e) {
            pushError(errors, 'mime', `failed HEAD for ${f.url}`);
        }
        finally {
            release();
        }
    }));
}
