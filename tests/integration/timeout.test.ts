import { describe, it, expect } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';

describe('timeout / abort', () => {
  it('rejects on fetch timeout with mode fetch', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((resource: any, init?: any) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }
      });
    }) as any;
    let threw = false;
    try {
      await folderApiRequest('https://example.com/root/', { mode: 'fetch', timeoutMs: 100 });
    } catch (e) {
      threw = true;
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(threw).toBe(true);
  });
});

