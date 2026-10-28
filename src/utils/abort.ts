export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

export function createRequestController(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; abort: () => void; dispose: () => void } {
  throwIfAborted(signal);
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };
}
