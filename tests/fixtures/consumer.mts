import { folderApiRequest, type FolderApiOptions } from 'folder-api';
import { folderApiRequest as browserRequest } from 'folder-api/cdn';

const options: FolderApiOptions = { mode: 'fetch', cache: 'no-store' };
void folderApiRequest('https://example.test/', options);
void browserRequest('https://example.test/', options);
