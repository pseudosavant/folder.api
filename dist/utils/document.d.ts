import type { LoadedDirectory } from '../internal/types.js';
import { RequestFailure } from './errors.js';
export declare const htmlNamespace = "http://www.w3.org/1999/xhtml";
export declare function listingContentType(raw: string, phase: 'fetch' | 'iframe', url: string): LoadedDirectory['contentType'];
export declare function validateListingDocument(doc: Document, type: LoadedDirectory['contentType'], url: string): void;
export declare function responseLimit(url: string, phase: 'fetch' | 'iframe', maximum: number): RequestFailure;
export declare function checkSerializedSize(html: string, url: string, maximum: number): void;
