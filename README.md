## folder.api (v2, TypeScript / ESM, browser-only)

`folder.api` turns your HTTP server's directory listings into a structured JavaScript API for the browser.

Generic, server-agnostic parsing with recursion, iframe fallback, and optional parallel MIME enrichment.

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
* Abortable via `AbortSignal`; per-directory timeout
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
| `mode` | `auto` | `fetch` | `iframe` | `auto` (fallback) |
| `includeMime` | false | Enables HEAD enrichment |
| `headConcurrency` | 4 | Parallel HEAD limit (>=1) |
| `timeoutMs` | 15000 | Per directory (fetch / iframe / HEAD) |
| `sameOriginOnly` | true | Caller ensures origin policy; iframe fallback relies on same-origin |

Returned `FolderApiResult` fields (simplified):
| Field | Description |
|-------|-------------|
| `url` | Normalized starting directory URL |
| `root` | Root `FolderNode` (tree) |
| `folders` / `files` | Flat arrays of entries (v1-style names) |
| `entries` | Concatenated array of folders + files |
| `generatedAt` | ISO timestamp when assembled |
| `errors` | Parse / enrichment warnings (prefixed categories) |
| `stats` | `{ fetches, iframes, heads, durationMs, maxDepth }` |

### Modes Explained
* `fetch` – Direct HTTP GET; fastest when CORS allows.
* `iframe` – Browser-only sandboxed load (`allow-same-origin`) used when fetch blocked.
* `auto` – Attempt fetch; on failure (network, non-200) retry via iframe.

### MIME / Size Enrichment
Enable with `includeMime: true`. Each file may gain:
* `mime`: from `Content-Type`
* `size`: filled / overridden from `Content-Length` when missing
Concurrency controlled by `headConcurrency` (default 4).

### Error Categories
Prefixes help classify issues (non-fatal):
`date:` `size:` `mime:` `decode:` `loop:` `limit:`

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
```
npm test
npm run build
```
Mock server fixtures (FastAPI) in `mock_servers/` provide Apache/Nginx/IIS/Caddy headers and listing layouts.

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

Note: Built-in Python `http.server` isn't used because its listing format overlaps existing variants; add it if a distinct edge case emerges.

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

