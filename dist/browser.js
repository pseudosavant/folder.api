import { folderApiRequest } from './folderApiRequest.js';
const global = globalThis;
if (!global.folderApiRequest)
    global.folderApiRequest = folderApiRequest;
export { folderApiRequest };
