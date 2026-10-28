import { LoadedDirectory, NormalizedOptions } from '../internal/types.js';
import { throwIfAborted } from '../utils/abort.js';
import { requestFailure } from '../utils/errors.js';
import { checkSerializedSize, listingContentType, validateListingDocument } from '../utils/document.js';

export async function iframeDirectoryHtml(url: string, opts: NormalizedOptions, stats: { iframes: number }): Promise<LoadedDirectory> {
  throwIfAborted(opts.signal);
  if (typeof document === 'undefined') throw new Error('iframe mode not supported in this environment');
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  Object.assign(iframe.style, { position: 'absolute', width: '0', height: '0', border: '0', visibility: 'hidden' });
  return await new Promise<LoadedDirectory>((resolve, reject) => {
    const timer = setTimeout(() => fail(new DOMException('iframe timeout', 'TimeoutError')), opts.timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      iframe.removeEventListener('load', onLoad);
      iframe.removeEventListener('error', onError);
      opts.signal?.removeEventListener('abort', onAbort);
      iframe.remove();
    }
    function fail(error: unknown) {
      cleanup();
      reject(opts.signal?.aborted ? opts.signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
        : requestFailure(error, 'iframe', url, opts.timeoutMs));
    }
    function onAbort() {
      fail(opts.signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    }
    function onLoad() {
      try {
        throwIfAborted(opts.signal);
        const doc = iframe.contentDocument;
        if (!doc) throw new Error('Unable to read iframe document. Same-origin access is required.');
        if (doc.URL === 'about:blank') return;
        const finalUrl = doc.URL || url;
        const contentType = listingContentType(doc.contentType, 'iframe', finalUrl);
        validateListingDocument(doc, contentType, finalUrl);
        const html = contentType === 'application/xhtml+xml' ? new XMLSerializer().serializeToString(doc.documentElement)
          : doc.documentElement?.outerHTML || '';
        checkSerializedSize(html, finalUrl, opts.maxResponseBytes);
        const result = { html, url: finalUrl, contentType };
        cleanup();
        resolve(result);
      } catch (error) {
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
    } catch (error) {
      fail(error);
    }
  });
}
