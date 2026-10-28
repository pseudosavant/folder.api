## folder.api (v3.0.0, TypeScript / ESM, browser-only)

`folder.api` turns your HTTP server's directory listings into a structured JavaScript API for the browser.

Generic, server-agnostic parsing with recursion, iframe fallback, and optional parallel MIME enrichment.

### 3.0.0

* Place redirected child folders under an ancestor of their final URL and cancel unread bodies from rejected directory responses.
* Count dispatched GET and HEAD requests, including network failures and timeouts. Add structured `errorDetails` alongside the existing warning strings.
* Bound each directory response to 4 MiB by default with `maxResponseBytes`. Stream fetch bodies and stop oversized responses without iframe fallback.
* Keep recognized description columns out of metadata heuristics. Support row spans, column spans, and multirow table headers without expanding spans into dense grids.
* Recognize date header aliases such as `Modified Date`, `Date Modified`, and `Last-Modified` without reading dates from description columns.
* Accept HTML and XHTML through an exact content-type allowlist. Parse XHTML as XML and reject malformed documents.
* Add opt-in `includeProvenance` records for listing metadata and HEAD enrichment. Validate complete timestamp tokens with shared AM/PM and timezone handling.
* Add `listingSelector` to restrict link discovery to selected containers or links while retaining automatic discovery by default.
* Remove unused code and the accidentally exported internal types. See the migration section below for compatibility changes.
* Honor non-default cache policies throughout automatic loading. Disable iframe fallback for those policies and reject unsupported iframe option combinations.

#### Migrating from 2.1.0

For most 2.1.0 users, 3.0.0 is a drop-in replacement. Typical imports and request calls continue to work. The package remains browser-only ESM, automatic link discovery remains the default, and `includeMime` still enables HEAD requests with a default concurrency of 4.

Review these compatibility changes if they affect your usage:

* **Response limit:** Directory listings now have a default limit of 4 MiB (4,194,304 bytes). Larger listings reject with `details.code === 'response-limit'` without iframe fallback. Set a higher finite `maxResponseBytes` if needed, such as `8 * 1024 * 1024` for 8 MiB. The limit applies to each listing document, not the linked files. Fetch counts decompressed body bytes while streaming. Iframe mode checks serialized UTF-8 document bytes after loading.
* **Type exports:** The accidentally exported `InternalDirectoryParse`, `NormalizedOptions`, and `LoadedDirectory` types are now internal. Use public API types such as `FolderApiOptions`, `FolderApiResult`, `FileEntry`, and `FolderNode` where appropriate. Loading and parsing internals have no public replacement.
* **Result fixtures:** Returned results now include `errorDetails`. Add `errorDetails: []` to hand-written `FolderApiResult` fixtures and mocks with no warnings. Strict response validators must allow the new field.
* **Request counters:** `stats.fetches` and `stats.heads` now include failed attempts and timeouts. Adjust assertions that treated them as counts of received responses. Each browser-managed redirect chain still counts as one dispatched request.
* **Error handling:** Failure messages include more context and timeouts use the name `TimeoutError`. Update exact string or error-name matches. Prefer structured warning codes in `errorDetails`, or the thrown error's `details` for directory failures. The existing `errors` string array remains available. Caller abort reasons are preserved.
* **Content types:** Directory documents must use `text/html` or `application/xhtml+xml`. Case and parameters such as `charset` are accepted. Other types reject in iframe mode too. Malformed XHTML rejects as a parse error. Correct server headers if needed.
* **Cache policies:** `auto` now uses fetch only with any non-default `cache` policy. A failed fetch rejects with its original fetch error instead of falling back to iframe navigation that could return stale content. Explicit `mode: 'iframe'` with a non-default cache policy now rejects with a `TypeError` before loading. Use `auto` or `fetch` to honor the requested policy, or use `cache: 'default'` when iframe navigation is acceptable. Omitted and explicit default cache policies retain automatic fallback.

Metadata and tree corrections may change snapshot expectations. Description columns no longer supply metadata, complete timestamp tokens determine dates, and redirected children attach to a known ancestor of their final URL.

`listingSelector` and `includeProvenance` are optional additions. Omit them to retain automatic link discovery and entries without provenance. Neither option adds HTTP requests.

### 2.1.0

* Parse metadata separately from filenames. Missing sizes and dates remain `null` instead of being inferred from filename digits or neighboring rows.
* Support comma-separated byte counts, spaced size units, and IIS metadata before links. The TypeScript API and standalone browser bundle share regression fixtures.
* Add the optional `cache` policy for directory fetches. Use `cache: 'no-store'` when directory contents must be read from the server.
* Generate the standalone browser bundle from the TypeScript implementation. Both entry points now share behavior, defaults, and regression tests.
* Fix iframe-only mode, cancellation, redirect resolution, public package typings, URL deduplication, and folder roles and depths.
* Read table metadata by column. Apache descriptions and Deno permissions no longer hide valid sizes. Dates support explicit timezone offsets and irregular IIS whitespace, and invalid dates remain unknown.
* Enforce the 50,000-entry ceiling within listings. Use `maxEntries` to set a smaller budget.
* Use constant-time entry lookups and bounded HEAD workers. Abort listeners and request timers are cleaned up after success or failure.
* Add opt-in `continueOnError` traversal to retain readable results when a child directory fails.
* Recheck root-relative depth after child redirects. Contents beyond `maxDepth` are not expanded.
* Apply entry budgets after traversal scope checks and global deduplication. Discarded folders and previously returned files do not hide later valid entries.
* Honor the first HTML `base[href]` against the final document URL without relaxing origin or traversal restrictions. Support column spans in table headers and data rows.
* Keep malformed timestamp suffixes unknown instead of accepting a valid-looking prefix.

---
### Install (Pure ESM)
```
npm install folder-api
```
Browser-only runtime (requires `fetch` + `DOMParser`). No CommonJS build is published.

### Quick Start
```ts
import { folderApiRequest } from 'folder-api';

const res = await folderApiRequest('https://example.com/public/', {
  maxDepth: 1,
  includeMime: true,
  headConcurrency: 8
});

console.log('files', res.files.length, 'folders', res.folders.length);
```

### Example Result (abridged)
```json
{
  "url": "https://example.com/public/",
  "root": {
    "kind": "folder",
    "url": "https://example.com/public/",
    "role": "self",
    "depth": 0,
    "children": [ { "url": "https://example.com/public/images/", "role":"child", "kind":"folder", "depth":1 } ],
    "files": [ { "kind":"file", "url":"https://example.com/public/readme.txt", "name":"readme.txt", "size": 512, "date":"2024-03-01T12:00:00.000Z" } ]
  },
  "folders":    [ /* FolderEntry[] */ ],
  "files":      [ /* FileEntry[]  */ ],
  "entries":    [ /* flattened union of both */ ],
  "generatedAt": "2024-03-01T12:00:05.123Z",
  "errors": [],
  "errorDetails": [],
  "stats": { "fetches": 1, "iframes": 0, "heads": 5, "durationMs": 134, "maxDepth": 1 }
}
```

---
### Core Features
* Generic heuristics (no server signature sniffing)
* Recursive traversal with depth cap
* Modes: `fetch`, `iframe`, or `auto` (fetch with iframe fallback)
* Parallel HEAD requests for MIME / size enrichment (configurable concurrency)
* ISO 8601 UTC date normalization
* Size parsing with unit heuristics (K, M, G) & ambiguity guards
* Hidden detection (`.dotfile` excluding `.` / `..`)
* Hierarchical tree + flattened arrays
* Abortable via `AbortSignal`, with per-request timeouts
* Safety limit (50k entries) to prevent runaway traversal

### Supported / Tested Server Styles
* NGINX (`autoindex on`)
* Apache (`mod_autoindex` standard + fancy)
* IIS (Directory Browsing enabled)
* Generic / other listings (best‑effort heuristics)

### API
```ts
async function folderApiRequest(url: string, options?: FolderApiOptions): Promise<FolderApiResult>
```
Key option defaults:
| Option | Default | Notes |
|--------|---------|-------|
| `maxDepth` | 0 | Depth of child folders to traverse (0 = just start directory) |
| `maxEntries` | 50000 | Total unique files and folders, including the starting folder and navigation entries. May be lowered, but not raised above 50000. |
| `maxResponseBytes` | 4194304 | Per directory response budget in bytes, which defaults to 4 MiB. Fetch counts actual streamed bytes after decompression. Iframe mode checks serialized UTF-8 document bytes after loading. |
| `continueOnError` | false | Keep readable results after child-directory failures and record `traversal:` warnings. Root failures and cancellation still reject. |
| `mode` | `auto` | Choose `fetch`, `iframe`, or `auto`. Automatic iframe fallback requires `cache: 'default'`. |
| `cache` | `default` | Fetch cache policy for directory HTML. Non-default policies use fetch only and reject explicit iframe mode. `no-store` bypasses the HTTP cache. `only-if-cached` uses same-origin mode. |
| `listingSelector` | none | Optional CSS selector for listing containers or links. Applies to every traversed directory. Automatic discovery remains the default. |
| `includeMime` | false | Enables HEAD enrichment |
| `includeProvenance` | false | Adds per-field metadata sources, raw tokens, size precision, and timezone assumptions when metadata is available. Adds no requests. |
| `headConcurrency` | 4 | Parallel HEAD limit (>=1) |
| `timeoutMs` | 15000 | Per directory (fetch / iframe / HEAD) |
| `sameOriginOnly` | true | Filter listing links to the directory's origin. Child redirects cannot escape the starting subtree. This does not bypass browser CORS or iframe restrictions. |
| `signal` | none | Cancel active work and prevent queued requests from starting. |

Numeric options use finite integers. Fractional values are truncated. Non-finite or nonnumeric values use defaults. `headConcurrency` has a minimum of 1 and `timeoutMs` is clamped between 100 and 2147483647 milliseconds.

`maxResponseBytes` has a minimum of 1. Increase it explicitly for larger directory listings. `Content-Length` is not used as the body-size authority, since it may be missing, incorrect, or describe compressed bytes.

Use `listingSelector` when a page contains navigation or other links outside its directory listing:
```ts
const result = await folderApiRequest('https://example.com/public/', {
  listingSelector: '#listing'
})
```

The selector uses the browser's CSS selector syntax. Selector text is preserved so escaped identifiers keep their meaning. All matching containers contribute their descendant links. Matching anchor elements themselves are also included, so selectors such as `#listing a.download` work. Links are processed once in document order even when matching containers overlap. Explicit selection bypasses automatic container preferences inside the selection. Without a selector, existing automatic discovery remains unchanged.

A matched container with no links returns an empty listing. A selector that matches no elements produces a parse error with the directory URL. Invalid CSS also produces a parse error. Empty and non-string option values reject as invalid options. Explicit selection never falls back to links outside the selected elements. The selector applies again to every child directory, including HTML and XHTML documents. With `continueOnError: true`, a child that lacks the selected elements remains listed with a warning while other children are visited.

Selection restricts link discovery. Document base URLs and table headers remain available for resolving URLs and metadata, including headers outside a selected `tbody`. Origin filters, traversal scope, entry budgets, and MIME enrichment continue to apply. The starting folder and synthetic navigation entries remain part of the result.

Returned `FolderApiResult` fields (simplified):
| Field | Description |
|-------|-------------|
| `url` | Final normalized starting directory URL after redirects |
| `root` | Root `FolderNode` (tree) |
| `folders` / `files` | Flat arrays of entries (v1-style names) |
| `entries` | Concatenated array of folders + files |
| `generatedAt` | ISO timestamp when assembled |
| `errors` | Parse / enrichment warnings (prefixed categories) |
| `errorDetails` | Structured warnings in the same order as `errors`, including category, code, phase, URL, and available HTTP status or cause |
| `stats` | `{ fetches, iframes, heads, durationMs, maxDepth }` |

### Modes Explained
* `fetch` – Direct HTTP GET; fastest when CORS allows.
* `iframe` – Browser-only sandboxed load (`allow-same-origin`) used when fetch is blocked. Requires the default cache policy.
* `auto` attempts fetch and falls back to an iframe after a network or HTTP failure only when `cache` is omitted or `'default'`. With any non-default cache policy it uses fetch only and preserves fetch failures. Caller cancellation never starts a fallback.

Both loaders accept only `text/html` and `application/xhtml+xml`, ignoring case and content-type parameters. The fetch `Accept` header advertises those two types. XHTML uses XML parsing, checks for parser errors, and requires an XHTML `html` root. Element extraction supports default and prefixed XHTML namespaces.

Iframe reading requires same-origin access to the loaded document. It cannot bypass CORS by reading a cross-origin frame. Browsers provide no equivalent of the fetch `cache` option for iframe navigation, so explicit iframe mode with a non-default policy rejects before creating a frame or making a request. Iframes also cannot expose HTTP response status to this parser.

An old iframe response can remain in the navigation cache even after a successful `no-store` fetch to the same URL. This matters when a local server serves a different filesystem folder at the same URL after restarting. Use `cache: 'no-store'` with `auto` or `fetch` when listing requests must bypass the HTTP cache. If fetch fails, the request rejects instead of returning an older iframe listing. No cache-busting query parameters are added. These policies apply to directory fetches, not optional HEAD enrichment.

Relative entries are resolved against the final loaded directory URL, or the first HTML `base[href]` resolved against that URL. Invalid or non-HTTP base values produce `url:` warnings and fall back to the document URL. Later base elements are ignored. Origin filtering still uses the loaded document's origin. A base element cannot expand the allowed traversal scope. Folder URLs keep a trailing pathname slash even when they have query parameters. Sorting controls and fragment links are excluded. Malformed links produce `url:` warnings without losing valid entries.

Flat entry arrays deduplicate normalized URLs. Folder roles are relative to the final starting directory, with one entry per folder. `self` is the starting folder. `root` is its origin root and `parent` is its immediate parent, unless those are the same URL. `root` takes precedence in that case. Child depths are root-relative. Ancestors and unrelated same-origin folders are not recursively traversed. Directory GETs remain sequential and depth-first.

When a child redirect changes its branch, the resulting folder is attached to its deepest known ancestor within the starting subtree. Its old alias is removed. Intermediate folders are not synthesized. Cross-origin traversal enabled with `sameOriginOnly: false` continues to use discovery relationships between origins.

The entry budget limits returned unique entries and stops further directory traversal. Scope checks and global deduplication happen before admission to the budget. Unrelated folders and already returned files do not consume it. `maxResponseBytes` independently limits each directory response. Fetch reads incrementally and cancels the stream as soon as its body exceeds the budget. An oversized fetch never starts iframe fallback. With `continueOnError: true`, an oversized child produces a `response-limit` warning while readable children remain available. An oversized starting directory always rejects.

Iframe navigation cannot enforce a download-byte budget. The loader checks the UTF-8 size of the serialized document after loading and before parsing. This size can differ from the original HTML bytes because the browser repairs and normalizes markup. Use `mode: 'fetch'` when a download limit must be enforced during transfer. The byte budget does not cover iframe subresources or the total bytes across a recursive traversal.

Child redirects are checked against `maxDepth` again after their final URL is known. A target beyond that depth remains listed as a folder but its contents are not parsed or enriched. The redirect response may already have been downloaded. `stats.maxDepth` measures directories whose contents were parsed, not the deepest folder link discovered.

### MIME / Size Enrichment
File sizes and dates are read from metadata fields, not link text. Recognized table headers define the available metadata columns. A missing size or date column does not enable a search through descriptions. Tables without recognizable headers retain conservative metadata heuristics. Folder markers are explicit values such as `<dir>`, `[directory]`, or a directory value in a type column. Ordinary words in descriptions do not classify folders.

Table column spans, row spans, and multirow headers are aligned through a sparse column model. `rowspan="0"` ends with its row group. Unknown or ambiguous values remain `null`. Complete ISO, Apache, and IIS timestamp tokens share suffix validation. AM/PM and explicit `Z`, `+HH:MM`, or `+HHMM` offsets are supported. Unsupported suffixes such as named timezone abbreviations remain unknown with a date warning. Timestamps without an explicit timezone use UTC. Normal metadata parsing does not add HTTP requests.

Enable with `includeMime: true`. Each file may gain:
* `mime`: from `Content-Type`
* `size`: filled / overridden from `Content-Length` when missing
Concurrency is controlled by `headConcurrency` (default 4). A bounded worker pool avoids allocating one pending promise per file. Existing sizes, including zero, are preserved. Only valid nonnegative integer `Content-Length` values fill missing sizes. Caller cancellation stops active and queued HEAD work.

Set `includeProvenance: true` to add an optional `provenance` object to each entry with known metadata. Existing `size`, `date`, and `mime` values keep their format. For example:
```json
{
  "size": 1572864,
  "date": "2026-10-27T10:00:00.000Z",
  "mime": "video/mp4",
  "provenance": {
    "size": { "source": "listing", "raw": "1.5M", "precision": "estimated" },
    "date": { "source": "listing", "raw": "27-Oct-2026 12:00+02:00", "timezone": "explicit" },
    "mime": { "source": "head", "raw": "video/mp4" }
  }
}
```

Listing byte counts use `precision: 'exact'` when safely represented as integer bytes. Scaled, fractional, or imprecise numeric values use `estimated`. A missing size filled from a valid HEAD `Content-Length` uses `source: 'head'` and `precision: 'exact'`. A preserved listing size keeps its listing provenance. Dates record either `explicit` or `assumed-utc` timezone handling. Missing or ambiguous fields have no provenance record. Entries with no known metadata omit the entire object. Provenance is omitted by default and adds no network requests.

### Error Categories
Prefixes help classify issues (non-fatal):
`date:` `mime:` `decode:` `limit:` `url:` `traversal:`

Traversal is fail-fast by default. With `continueOnError: true`, a failed child remains listed, later children are still visited, and a `traversal:` warning identifies the failed URL. Failure to load the starting directory always rejects. Cancellation rejects with the caller's abort reason, or an `AbortError` when no reason is available.

Each `errorDetails` item has `category`, `code`, `phase`, `url`, and `message`. Its `message` matches the corresponding `errors` string. Codes distinguish `parse`, `limit`, `response-limit`, `http`, `network`, `timeout`, `unsupported-method`, `content-type`, `iframe`, and `scope`. HTTP failures include `status`. Network and timeout failures include a serializable `cause` with `name` and `message`. Parse warnings identify the directory being parsed, or the folder URL when its name cannot be decoded.

For example, a failed HEAD request may produce:
```json
{
  "category": "mime",
  "code": "network",
  "phase": "head",
  "url": "https://example.com/public/readme.txt",
  "message": "mime: HEAD https://example.com/public/readme.txt failed: TypeError: Failed to fetch",
  "cause": { "name": "TypeError", "message": "Failed to fetch" }
}
```

Rejected directory requests expose the same structured information on the thrown error's `details` property and retain the original failure on `cause` when available. If fetch and iframe fallback both fail, `details.previous` describes the fetch failure. Caller cancellation preserves the original abort reason without wrapping it. Timeout errors have the name `TimeoutError`.

`stats.fetches` and `stats.heads` count requests when dispatched. They include requests that fail before response headers arrive and requests that time out. Browser-managed redirects are part of one dispatched request. These counters do not measure successful responses or prove that the HTTP cache was bypassed.

### Upgrade Notes (v1 → v2)

* Pure ESM (no CJS wrapper).
* Unified result structure (`root`, `folders`, `files`, `entries`).
* Removed previous `server` detection field (intentionally generic now).
* Added `stats.durationMs`, granular counters (`fetches`, `iframes`, `heads`).
* Added optional MIME enrichment + concurrency.
* Added iframe fallback logic in `auto` mode.

### Browser Usage
Use the distributed ESM bundle (`dist/index.js`) or the browser bundle (`folder-api.cdn.js`, attaches `window.folderApiRequest`). Ensure same-origin or enable directory listing with permissive CORS for fetch mode.

### Abort / Timeout Example
```ts
const ac = new AbortController();
setTimeout(()=>ac.abort(), 5000);
await folderApiRequest('https://example.com/public/', { signal: ac.signal });
```

### Development / Testing
Development requires Node.js 20 or newer. Install development dependencies and a test browser once:
```
npm ci
npx playwright install chromium
```

Then run:
```
npm test
npm run build
npm run lint
```
Mock server fixtures (FastAPI) in `mock_servers/` provide Apache/Nginx/IIS/Caddy headers and listing layouts.

`npm run build` compiles the ESM files and declarations under `dist/`, then bundles `src/browser.ts` into `folder-api.cdn.js` using esbuild. The bundle still exports `folderApiRequest` and attaches it to `globalThis` when no existing implementation is present. Do not hand-edit the generated bundle. There are no runtime dependencies.

`npm test` builds first so bundle parity tests never use an old copy. It runs unit, integration, package-consumer, and real-browser tests. Tests cover both implementations, captured server listings, body-reading cancellation, HEAD and iframe timeout cleanup, custom abort reasons, limits, metadata, base URLs, redirects, traversal, concurrency, reproducible bundling, and public TypeScript imports. Seeded randomized listings also check uniqueness, tree structure, depths, and entry budgets.

Package tests create a tarball in a temporary directory and install it offline into a clean consumer. Both public entry points are imported and type-checked without access to checkout sources or development dependencies. Temporary artifacts are removed afterward.

Browser tests use Playwright with a temporary loopback HTTP server. They exercise real sandboxed iframes, fetch and iframe redirects, base elements, active cancellation, and streaming response-body timeouts. Cache-policy regressions prime a real navigation cache, change the listing at the same URL, and verify server request counts, failure behavior, and recovery. These tests avoid Playwright routing because it disables HTTP caching. They do not need an external server. `npm run test:browser` builds and runs only these checks. To use an installed Chrome instead of Playwright's downloaded Chromium, set `FOLDER_API_BROWSER_CHANNEL=chrome` before running tests. Browser setup failures fail the suite rather than silently skipping coverage.

Before publishing, run the build, tests, and lint checks and inspect `npm pack --dry-run`. The package allowlist includes only the runtime distributions, README, and license.

### Mock Test Servers
The project includes lightweight FastAPI apps that emulate Apache, Nginx, IIS, and Caddy directory listings (HTML structure + `Server` header). They are not literal daemons but are structurally similar outputs for parser robustness.

Ports / variants:
| Port | Name | Layout Style | Notes |
|------|------|--------------|-------|
| 8101 | apache | `<table>` rows with headers (Name / Last modified / Size) | Approximates Apache mod_autoindex |
| 8102 | nginx  | `<pre>` lines anchor + date + size suffix | Similar to common NGINX autoindex |
| 8103 | iis    | `<pre>` lines with AM/PM + `<dir>` | Stand-in for IIS style variations |
| 8104 | caddy  | `<table>` rows with name / size / modified | Approximates Caddy browse output |

Start all four locally using Astral uv (preferred, no manual venv):
```
uv run mock_servers/run.py
```
Or explicitly pin (optional):
```
uv run --with fastapi --with uvicorn mock_servers/run.py
```
Legacy manual setup (fallback):
```
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn
python mock_servers/run.py
```
Expected logs:
```
[mock_servers] starting apache on http://127.0.0.1:8101/root/
[mock_servers] starting nginx on http://127.0.0.1:8102/root/
[mock_servers] starting iis on http://127.0.0.1:8103/root/
[mock_servers] starting caddy on http://127.0.0.1:8104/root/
```

Example request against one mock server:
```ts
import { folderApiRequest } from 'folder-api';
const res = await folderApiRequest('http://127.0.0.1:8101/root/', { maxDepth: 1, includeMime: true });
console.log(res.stats, res.files.map(f=>f.name));
```

Why not real daemons? Spinning up actual Apache/Nginx/IIS/Caddy for CI is heavy; HTML structural diversity is what the parser needs. If you contribute new heuristics, add another layout variant here.

Python `http.server` listings are covered by parser fixtures. These listings usually provide filenames without sizes or dates, so those values remain `null`.

### Contributing
Please add / update tests for any behavioral change. Keep patches minimal; avoid adding heavy dependencies.

## Real Server Listing Capture (Caddy / Nginx / Apache / IIS)

If you need authentic HTML directory listings (beyond the mock fixtures) you can spin up real servers quickly using Docker for the Linux variants and optional local IIS for Windows.

### 1. Start Caddy, Nginx, Apache (Linux containers)
Prereqs: Docker Desktop (WSL2 backend on Windows) or any Docker engine.

```
docker compose up -d --pull always
```

Ports exposed:
| Server | Port | Base URL |
|--------|------|----------|
| Caddy  | 8080 | http://localhost:8080/ |
| Nginx  | 8081 | http://localhost:8081/ |
| Apache | 8082 | http://localhost:8082/ |

All three mount the repository root read-only and have directory listings forced on even if `index.html` exists. (Apache config enables FancyIndexing with an HTML table; Caddy & Nginx use their native formats.)

Stop and clean:
```
docker compose down
```

### 2. (Optional) IIS (Windows only)
To add IIS output (its listing HTML differs) without disturbing existing sites, create a temporary site:

PowerShell (run as Administrator):
```
Import-Module WebAdministration
$path = (Resolve-Path .).Path
New-WebSite -Name folderapi-temp -Port 8083 -PhysicalPath $path -Force
Set-WebConfigurationProperty -Filter /system.webServer/directoryBrowse -PSPath IIS:\ -Name enabled -Value true -Location folderapi-temp
Restart-WebAppPool -Name 'folderapi-temp'
```
Remove when finished:
```
Remove-WebSite -Name folderapi-temp
```

### 3. Collect Raw Listing HTML
After starting the servers (and optionally IIS), run the Python collector (Astral uv preferred):
```
uv run scripts/collect_listings.py
```
or plain Python (ensure `requests`):
```
python -m pip install requests
python scripts/collect_listings.py
```
Output is written under `listings/<server>/<relative/path>/listing.html` mirroring the repo's directory tree. Failures create `listing.error.txt`.

Exclude patterns: `.git`, `node_modules`, `dist`, `build`, `.servers`, `.idea`, `.vscode`, `coverage`.

### 4. Windows Portable (Alternative Without Docker)
If you prefer fully portable binaries instead of Docker:
1. Caddy: Download `caddy_windows_amd64.zip` from the official GitHub releases, extract `caddy.exe` to a temp dir, then run:
  ```
  .\caddy.exe file-server --root "C:\path\to\folder.api" --listen :8080 --browse
  ```
2. Nginx: Download the Windows zip from https://nginx.org/en/download.html, edit `conf/nginx.conf`:
  ```
  http { server { listen 8081; root C:/path/to/folder.api; autoindex on; } }
  ```
  Then run `nginx.exe`.
3. Apache (Apache Lounge build): Extract, edit `conf/httpd.conf`:
  * Change `Listen 8082`
  * Set `DocumentRoot` and `<Directory>` to the repo path
  * Ensure `Options Indexes` and `LoadModule autoindex_module modules/mod_autoindex.so`
  Start in foreground: `httpd.exe -X -f conf/httpd.conf`.
4. IIS: Use the steps above (create temporary site on port 8083).

Then run the Python collector script (it will skip any server not reachable):
```
uv run scripts/collect_listings.py
```

### 5. Undo / Cleanup
Docker: `docker compose down -v` (or use native package manager in WSL: `sudo apt remove caddy nginx apache2`).
Portable: Stop processes / delete extracted folders.
IIS: `powershell -ExecutionPolicy Bypass -File scripts/iis-temp-site.ps1 -Action remove`.

### Linux / WSL Without Docker Desktop
Instead of Docker, you can install packages inside WSL (Ubuntu example):
```
sudo apt update
sudo apt install -y nginx apache2 caddy
```
Adjust configs to point their roots to the cloned repo path (enable autoindex / browse). Then run the collector from Windows or inside WSL (ensure the servers bind to 0.0.0.0 or localhost). Caddy: `caddy file-server --root /mnt/c/Users/.../folder.api --listen :8080 --browse`.

---

### License
MIT (c) Paul Ellis

---
_See `llm.md` for architecture & automated assistant guidance._

