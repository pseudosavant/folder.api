import { NormalizedOptions } from '../types.js';

export async function iframeDirectoryHtml(url: string, opts: NormalizedOptions, stats: { iframes: number }): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('iframe mode not supported in this environment');
  }
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);
  stats.iframes++;
  const timeout = opts.timeoutMs;
  return await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, timeout);
    function cleanup() {
      clearTimeout(timer);
      iframe.removeEventListener('load', onLoad);
      iframe.removeEventListener('error', onError);
      if (iframe.parentElement) iframe.parentElement.removeChild(iframe);
    }
    function onLoad() {
      try {
        const doc = iframe.contentDocument;
        if (!doc) throw new Error('no document');
        const html = doc.documentElement?.outerHTML || '';
        cleanup();
        resolve(html);
      } catch (e) {
        cleanup();
        reject(e);
      }
    }
    function onError(ev: any) {
      cleanup();
      reject(new Error('iframe error'));
    }
    iframe.addEventListener('load', onLoad, { once: true });
    iframe.addEventListener('error', onError, { once: true });
    iframe.src = url;
  });
}
