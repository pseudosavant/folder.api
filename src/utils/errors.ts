import type { FolderApiErrorDetail } from '../types.js';

export interface ErrorSink {
  errors: string[];
  errorDetails: FolderApiErrorDetail[];
}

export function pushError(errors: string[], prefix: string, message: string) {
  errors.push(`${prefix}: ${message}`);
}

export function recordError(sink: ErrorSink, detail: FolderApiErrorDetail): void {
  sink.errors.push(detail.message);
  sink.errorDetails.push(detail);
}

export function recordParseErrors(sink: ErrorSink, errors: string[], url: string): void {
  for (const message of errors) {
    const category = message.split(':', 1)[0];
    recordError(sink, { category, code: category === 'limit' ? 'limit' : 'parse', phase: 'parse', url, message });
  }
}

export class RequestFailure extends Error {
  constructor(readonly details: FolderApiErrorDetail, readonly cause?: unknown) {
    super(details.message);
    this.name = details.code === 'timeout' ? 'TimeoutError' : 'Error';
  }
}

export function describeCause(error: unknown): { name: string; message: string } {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return { name: 'name' in error ? String(error.name) : 'Error', message: String(error.message) };
  }
  return { name: 'Error', message: String(error) };
}

export function requestFailure(error: unknown, phase: 'fetch' | 'head' | 'iframe', url: string, timeoutMs: number): RequestFailure {
  if (error instanceof RequestFailure) return error;
  const cause = describeCause(error);
  const code = cause.name === 'TimeoutError' ? 'timeout' : phase === 'iframe' ? 'iframe' : 'network';
  const operation = phase === 'head' ? 'HEAD' : phase === 'fetch' ? 'GET' : 'iframe';
  const message = code === 'timeout' ? `${operation} ${url} timed out after ${timeoutMs}ms`
    : `${operation} ${url} failed: ${cause.name}: ${cause.message}`;
  return new RequestFailure({ category: phase === 'head' ? 'mime' : 'traversal', code, phase, url, message, cause }, error);
}
