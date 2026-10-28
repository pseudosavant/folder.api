export declare function parseSizeMeta(text: string): number | null;
export declare function parseSizeMetadata(text: string): {
    value: number;
    raw: string;
    precision: 'exact' | 'estimated';
} | null;
