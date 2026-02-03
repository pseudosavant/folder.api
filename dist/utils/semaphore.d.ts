export declare class Semaphore {
    private readonly max;
    private queue;
    private active;
    constructor(max: number);
    acquire(): Promise<() => void>;
    private release;
}
