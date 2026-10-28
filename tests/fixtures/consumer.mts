import { folderApiRequest, type FolderApiOptions, type FolderApiErrorDetail, type EntryProvenance } from 'folder-api';
import { folderApiRequest as browserRequest } from 'folder-api/cdn';
// @ts-expect-error NormalizedOptions is an implementation detail
import type { NormalizedOptions } from 'folder-api';
// @ts-expect-error InternalDirectoryParse is an implementation detail
import type { InternalDirectoryParse } from 'folder-api';
// @ts-expect-error LoadedDirectory is an implementation detail
import type { LoadedDirectory } from 'folder-api';

const options: FolderApiOptions = { mode: 'fetch', cache: 'no-store', maxResponseBytes: 4194304, includeProvenance: true, listingSelector: '#listing' };
void folderApiRequest('https://example.test/', options).then(result => {
  const details: FolderApiErrorDetail[] = result.errorDetails;
  const provenance: EntryProvenance | undefined = result.files[0]?.provenance;
  void provenance?.size?.precision;
  return details.map(detail => detail.code);
});
void browserRequest('https://example.test/', options);
