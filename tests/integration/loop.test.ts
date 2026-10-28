import { afterEach, describe, it, expect, vi } from 'vitest';
import { folderApiRequest } from '../../src/folderApiRequest.js';
import { folderApiRequest as browserRequest } from '../../folder-api.cdn.js';

afterEach(() => vi.unstubAllGlobals());

describe.each([['TypeScript', folderApiRequest], ['browser bundle', browserRequest]] as const)('%s loop prevention', (_name, request) => {
  it('deduplicates self aliases without requesting or attaching the starting directory again', async () => {
    const html = '<pre><a href="./">self</a><a href="../root/">alias</a><a href="clip.txt">clip</a></pre>';
    const fetchMock = vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await request('https://example.com/root/', { mode: 'fetch', maxDepth: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.root.children).toEqual([]);
    expect(result.folders.filter(folder => folder.role === 'self')).toEqual([result.root]);
    expect(result.files.map(file => file.name)).toEqual(['clip.txt']);
    expect(result.errors).toEqual([]);
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});

