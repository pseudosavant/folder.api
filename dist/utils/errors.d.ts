import type { FolderApiErrorDetail } from '../types.js';
export interface ErrorSink {
    errors: string[];
    errorDetails: FolderApiErrorDetail[];
}
export declare function pushError(errors: string[], prefix: string, message: string): void;
export declare function recordError(sink: ErrorSink, detail: FolderApiErrorDetail): void;
export declare function recordParseErrors(sink: ErrorSink, errors: string[], url: string): void;
export declare class RequestFailure extends Error {
    readonly details: FolderApiErrorDetail;
    readonly cause?: unknown | undefined;
    constructor(details: FolderApiErrorDetail, cause?: unknown | undefined);
}
export declare function describeCause(error: unknown): {
    name: string;
    message: string;
};
export declare function requestFailure(error: unknown, phase: 'fetch' | 'head' | 'iframe', url: string, timeoutMs: number): RequestFailure;
