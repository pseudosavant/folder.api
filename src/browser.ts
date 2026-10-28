import { folderApiRequest } from './folderApiRequest.js';

const global = globalThis as typeof globalThis & { folderApiRequest?: typeof folderApiRequest };
if (!global.folderApiRequest) global.folderApiRequest = folderApiRequest;

export { folderApiRequest };
export type { FolderApiOptions, FolderApiResult, FolderApiErrorDetail, EntryProvenance } from './types.js';
