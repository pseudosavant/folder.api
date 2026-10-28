export function pushError(errors, prefix, message) {
    errors.push(`${prefix}: ${message}`);
}
export function recordError(sink, detail) {
    sink.errors.push(detail.message);
    sink.errorDetails.push(detail);
}
export function recordParseErrors(sink, errors, url) {
    for (const message of errors) {
        const category = message.split(':', 1)[0];
        recordError(sink, { category, code: category === 'limit' ? 'limit' : 'parse', phase: 'parse', url, message });
    }
}
export class RequestFailure extends Error {
    constructor(details, cause) {
        super(details.message);
        this.details = details;
        this.cause = cause;
        this.name = details.code === 'timeout' ? 'TimeoutError' : 'Error';
    }
}
export function describeCause(error) {
    if (typeof error === 'object' && error !== null && 'message' in error) {
        return { name: 'name' in error ? String(error.name) : 'Error', message: String(error.message) };
    }
    return { name: 'Error', message: String(error) };
}
export function requestFailure(error, phase, url, timeoutMs) {
    if (error instanceof RequestFailure)
        return error;
    const cause = describeCause(error);
    const code = cause.name === 'TimeoutError' ? 'timeout' : phase === 'iframe' ? 'iframe' : 'network';
    const operation = phase === 'head' ? 'HEAD' : phase === 'fetch' ? 'GET' : 'iframe';
    const message = code === 'timeout' ? `${operation} ${url} timed out after ${timeoutMs}ms`
        : `${operation} ${url} failed: ${cause.name}: ${cause.message}`;
    return new RequestFailure({ category: phase === 'head' ? 'mime' : 'traversal', code, phase, url, message, cause }, error);
}
