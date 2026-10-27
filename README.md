## folder.api (v2.1.0, TypeScript / ESM, browser-only)

`folder.api` turns your HTTP server's directory listings into a structured JavaScript API for the browser.

Generic, server-agnostic parsing with recursion, iframe fallback, and optional parallel MIME enrichment.

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
| `continueOnError` | false | Keep readable results after child-directory failures and record `traversal:` warnings. Root failures and cancellation still reject. |
| `mode` | `auto` | Choose `fetch`, `iframe`, or `auto` (fallback). |
| `cache` | `default` | Fetch cache policy for directory HTML. `no-store` bypasses the HTTP cache. `only-if-cached` uses same-origin mode. |
| `includeMime` | false | Enables HEAD enrichment |
| `headConcurrency` | 4 | Parallel HEAD limit (>=1) |
| `timeoutMs` | 15000 | Per directory (fetch / iframe / HEAD) |
| `sameOriginOnly` | true | Filter listing links to the directory's origin. Child redirects cannot escape the starting subtree. This does not bypass browser CORS or iframe restrictions. |
| `signal` | none | Cancel active work and prevent queued requests from starting. |

Numeric options use finite integers. Fractional values are truncated. Non-finite or nonnumeric values use defaults. `headConcurrency` has a minimum of 1 and `timeoutMs` is clamped between 100 and 2147483647 milliseconds.

Returned `FolderApiResult` fields (simplified):
| Field | Description |
|-------|-------------|
| `url` | Final normalized starting directory URL after redirects |
| `root` | Root `FolderNode` (tree) |
| `folders` / `files` | Flat arrays of entries (v1-style names) |
| `entries` | Concatenated array of folders + files |
| `generatedAt` | ISO timestamp when assembled |
| `errors` | Parse / enrichment warnings (prefixed categories) |
| `stats` | `{ fetches, iframes, heads, durationMs, maxDepth }` |

### Modes Explained
* `fetch` – Direct HTTP GET; fastest when CORS allows.
* `iframe` – Browser-only sandboxed load (`allow-same-origin`) used when fetch blocked.
* `auto` attempts fetch and falls back to an iframe after a network or HTTP failure. Caller cancellation never starts a fallback.

Iframe reading requires same-origin access to the loaded document. It cannot bypass CORS by reading a cross-origin frame. The `cache` option controls fetch requests only, not iframe navigation. Iframes also cannot expose HTTP response status to this parser.

Relative entries are resolved against the final loaded directory URL, or the first HTML `base[href]` resolved against that URL. Invalid or non-HTTP base values produce `url:` warnings and fall back to the document URL. Later base elements are ignored. Origin filtering still uses the loaded document's origin. A base element cannot expand the allowed traversal scope. Folder URLs keep a trailing pathname slash even when they have query parameters. Sorting controls and fragment links are excluded. Malformed links produce `url:` warnings without losing valid entries.

Flat entry arrays deduplicate normalized URLs. Folder roles are relative to the final starting directory, with one entry per folder. `self` is the starting folder. `root` is its origin root and `parent` is its immediate parent, unless those are the same URL. `root` takes precedence in that case. Child depths are root-relative. Ancestors and unrelated same-origin folders are not recursively traversed. Directory GETs remain sequential and depth-first.

The entry budget limits returned unique entries and stops further directory traversal. Scope checks and global deduplication happen before admission to the budget. Unrelated folders and already returned files do not consume it. HTML still has to be downloaded and parsed, so this is not a response-byte limit.

Child redirects are checked against `maxDepth` again after their final URL is known. A target beyond that depth remains listed as a folder but its contents are not parsed or enriched. The redirect response may already have been downloaded. `stats.maxDepth` measures directories whose contents were parsed, not the deepest folder link discovered.

### MIME / Size Enrichment
File sizes and dates are read from metadata fields, not link text. Table column spans are included when aligning size and date headers with row cells. Unknown or ambiguous values remain `null`. Malformed times and timezone suffixes are not silently truncated to a valid prefix. Normal metadata parsing does not add HTTP requests.

Enable with `includeMime: true`. Each file may gain:
* `mime`: from `Content-Type`
* `size`: filled / overridden from `Content-Length` when missing
Concurrency is controlled by `headConcurrency` (default 4). A bounded worker pool avoids allocating one pending promise per file. Existing sizes, including zero, are preserved. Only valid nonnegative integer `Content-Length` values fill missing sizes. Caller cancellation stops active and queued HEAD work.

### Error Categories
Prefixes help classify issues (non-fatal):
`date:` `size:` `mime:` `decode:` `loop:` `limit:` `url:` `traversal:`

Traversal is fail-fast by default. With `continueOnError: true`, a failed child remains listed, later children are still visited, and a `traversal:` warning identifies the failed URL. Failure to load the starting directory always rejects. Cancellation rejects with the caller's abort reason, or an `AbortError` when no reason is available.

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

Browser tests use Playwright with a temporary loopback HTTP server. They exercise real sandboxed iframes, fetch and iframe redirects, base elements, active cancellation, and streaming response-body timeouts. They do not need an external server. `npm run test:browser` builds and runs only these checks. To use an installed Chrome instead of Playwright's downloaded Chromium, set `FOLDER_API_BROWSER_CHANNEL=chrome` before running tests. Browser setup failures fail the suite rather than silently skipping coverage.

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

