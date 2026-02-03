export declare function ensureHttp(url: string): URL;
export declare function normalizeDirectoryUrl(url: string): string;
export declare function keyForVisited(u: URL): string;
export declare function isSameOrigin(a: URL, b: URL): boolean;
export declare function parentDirectory(u: URL): string | null;
export declare function rootDirectory(u: URL): string;
export declare function lastSegment(u: URL): {
    raw: string;
    decoded: string;
};
export declare function isHiddenName(name: string): boolean;
