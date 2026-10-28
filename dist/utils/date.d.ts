interface ParsedDate {
    value: string;
    raw: string;
    timezone: 'explicit' | 'assumed-utc';
    start: number;
    end: number;
}
export declare function parseDateMeta(text: string, errors: string[]): string | null;
export declare function parseDateMetadata(text: string, errors: string[]): ParsedDate | null;
export declare function stripDateTime(text: string): string;
export {};
