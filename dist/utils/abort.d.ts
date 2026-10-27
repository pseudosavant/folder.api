export declare function throwIfAborted(signal?: AbortSignal): void;
export declare function createRequestController(signal: AbortSignal | undefined, timeoutMs: number): {
    signal: AbortSignal;
    dispose: () => void;
};
