import { FolderApiOptions, NormalizedOptions } from './types.js';

export function normalizeOptions(opts: FolderApiOptions | undefined): NormalizedOptions {
  return {
    maxDepth: Math.max(0, opts?.maxDepth ?? 0),
    mode: opts?.mode ?? 'auto',
    includeMime: opts?.includeMime ?? false,
  headConcurrency: Math.max(1, opts?.headConcurrency ?? 4),
    timeoutMs: Math.max(100, opts?.timeoutMs ?? 15000),
    sameOriginOnly: opts?.sameOriginOnly ?? true,
    signal: opts?.signal
  };
}
