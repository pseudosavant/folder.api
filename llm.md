# llm.md (Project Guidance for AI Assistants)

This file explains the intent, architecture, expectations, and guard‑rails for automated / AI contributions to the `folder.api` v2 codebase.

## 1. Project Purpose
`folder.api` parses generic HTTP directory listings (Apache, NGINX, IIS, others) into structured metadata. It:
- Traverses recursively (depth-limited) starting from a directory URL.
- Normalizes folder & file entries (names, hidden flags, dates, sizes).
- Optionally enriches MIME & size via parallel HEAD requests.
- Falls back to a sandboxed iframe loader when direct fetch fails (auto mode) in browser contexts.
- Produces a hierarchical root tree plus flattened arrays and stats.

Primary consumer environments:
- Browser (ESM) – requires CORS / same-origin unless iframe fallback is used.
- Node.js is used for development and tests. The runtime requires a browser DOM with `DOMParser`. No CommonJS build is published.

Non‑goals: Server signature sniffing, auth handling, streaming partial traversal, speculative prefetch.

## 2. High‑Level Architecture
```
folderApiRequest()                       (public entrypoint)
  normalizeOptions -> options.ts
  traverse()                             (core/recursion.ts)
     fetchDirectoryHtml()                (core/fetchDirectory.ts)
     iframeDirectoryHtml()               (core/iframeDirectory.ts)
     parseDirectoryHtml()                (core/parseDirectory.ts)
       heuristics: choose main anchor cluster, extract tokens, classify, parse date/size
  enrichMime() (optional)                (core/mime.ts)
  assemble + stats                       (types.ts structures)
```
Supporting utilities: URL normalization, decoding, date and size parsing, hidden detection, request cancellation, bounded HEAD workers, and error tagging.

## 3. Data Contracts (Key Types)
See `src/types.ts` for canonical definitions.
- FolderNode / FolderEntry / FileEntry
- FolderApiOptions:
  - maxDepth (>=0; default 0)
  - maxEntries (1 to 50000, default 50000, includes navigation entries)
  - continueOnError (default false, applies only to child directory failures)
  - mode: fetch | iframe | auto (default auto)
  - cache (RequestCache, default 'default') controls directory fetch caching
  - includeMime (boolean default false)
  - headConcurrency (default 4; clamp >=1)
  - timeoutMs (per directory, default 15000, clamp >=100)
  - sameOriginOnly (default true) filters listing links and rejects cross-origin child redirects.
  - signal (AbortSignal)
- Result stats: fetches, iframes, heads, durationMs (internal), maxDepth.

Errors are recorded as strings with a category prefix (e.g. `date:`, `size:`, `mime:`, `decode:`, `loop:`, `limit:`). Do not silently discard parse issues—append via `pushError`.

## 4. Invariants & Guard Rails
Maintain these unless a deliberate versioned change is requested:
1. Pure ESM distribution (no CJS). `package.json` `type: module` must remain.
2. All directory URLs normalized to end with a slash and de-duped path slashes.
3. No network requests besides: GET (directory HTML) + HEAD (optional MIME). No POST/PUT/etc.
4. HEAD concurrency honors `headConcurrency` via a bounded worker pool.
5. Recursion safety: hard cap at 50,000 entries (files + folders) -> emits `limit:` error and stops expanding further.
6. Hidden detection: leading dot excluding `.` and `..`.
7. Dates: Converted/stored as ISO 8601 UTC strings (no time zone guessing beyond provided tokens).
8. Sizes: Parse separate size metadata after stripping recognized timestamps. Leave ambiguous values null. Never infer a size from a filename.
   Account for table column spans when aligning headers. Reject malformed timestamp suffixes instead of accepting a valid prefix.
9. Auto mode fallback: Only attempt iframe after a failed fetch (error or non-200). Never fall back after caller cancellation or start both loaders in parallel.
10. Request state stays local to each call. The browser entry point may attach the public function to `globalThis`, without replacing an existing implementation.
11. Apply traversal scope and global deduplication before consuming the entry budget. Recheck root-relative depth after redirects before parsing their contents.
12. Resolve the first HTML base element against the final document URL. Base elements do not relax origin filtering or traversal scope.

## 5. Performance Considerations
- Fetch one directory at a time (depth-first) to avoid unbounded fan‑out; acceptable because typical listings are modest.
- HEAD enrichment is parallel; keep it bounded.
- Avoid regex catastrophes—current parsers operate on trimmed tokens and short lines.
- Do not introduce large dependencies; current footprint is TS + stdlib.

## 6. Testing Strategy
Tests live in `tests/` using Vitest (jsdom for DOM dependent code). Suites:
- Unit: date parsing, size parsing, hidden detection, options normalization, classification, ambiguous date handling, URL utilities.
- Integration: basic traversal, recursion depth, iframe fallback (mocked), iframe-only mode, MIME enrichment, timeout, loop prevention, decode errors.
Run with:
```
npm test
```
Add tests for any new behavior; maintain >90% coverage (implicit target). Prefer deterministic, synthetic HTML snippets rather than hitting live servers.
The full suite also includes offline packed-consumer checks and Playwright browser tests against a temporary loopback server. Development requires Node.js 20 or newer. Install Chromium with `npx playwright install chromium`, or set `FOLDER_API_BROWSER_CHANNEL=chrome` to use installed Chrome. Browser checks must not be silently skipped when setup is missing.

## 7. Adding / Modifying Code
When proposing changes:
- Update or add unit tests first for new logic.
- Keep patches minimal—avoid unrelated formatting churn.
- Preserve existing error category prefixes; add new categories only if strongly justified.
- Extend `NormalizedOptions` through `normalizeOptions` with validation & clamping if adding options.
- Always rebuild (`npm run build`) after TS changes so the harness can import updated dist.
- Never hand-edit `folder-api.cdn.js`. `npm run build` generates it from `src/browser.ts`. Shared regression fixtures cover the TypeScript API and standalone browser bundle.

## 8. Common Pitfalls & How To Avoid
| Area | Pitfall | Guidance |
|------|---------|----------|
| URL handling | Missing trailing slash leads to double requests via server redirect | Always run through `normalizeDirectoryUrl` / `ensureHttp`. |
| iframe mode | Trying to use in Node environment | Detect `document` existence and throw meaningful error (already implemented). |
| MIME enrichment | Unbounded queued work causes memory pressure | Keep the bounded worker pool and cancellation checks. |
| Parsing | Grabbing all anchors (noise) | Let `parseDirectoryHtml` clustering heuristics stand unless improved with tests. |
| Dates | Misinterpreting year/time numbers as sizes | Only accept size tokens with explicit unit or clear size pattern. |
| Loops | Visiting same directory via different encodings | Use `keyForVisited` (protocol + host + pathname) consistently. |

## 9. Harness (`test-harness.html`)
Developer convenience UI supporting:
- Option tweaking (depth, mode, mime, concurrency, timeout).
- Live tree rendering with tooltips for full metadata.
- Stats panel (internal duration + wall clock).
Make sure any structural API change (e.g., renamed fields) updates tooltip logic and stats presentation.

## 10. Security / Safety
- No eval / dynamic script injection; only parses HTML directory listings.
- Iframe sandbox restricted to `allow-same-origin` (no scripts; relies on server output). Do not relax sandbox attributes without explicit approval.
- Respect `AbortSignal` promptly (fetch + HEAD + iframe timeout).

## 11. Extensibility Ideas (Not Yet Implemented)
- Adaptive concurrency (tune based on response latency).
- Pluggable metadata enrichers (hashing, media dimension probes) with opt-in flags.
- Streaming / incremental callback during traversal.
- Snapshot regression tests for parse output (need normalization of timestamps first).

## 12. How an LLM Should Respond to User Requests
When the user asks for changes:
1. Clarify intent only if truly ambiguous.
2. List explicit requirements (checklist) before editing.
3. Read relevant files (avoid guessing paths).
4. Modify code + add / update tests in same PR scope.
5. Run tests; never leave failing state unless user explicitly accepts WIP.
6. Summarize deltas & map to checklist.
7. Suggest small, safe adjacent improvements (optional), clearly separated.

Avoid:
- Broad refactors without a request.
- Introducing dependencies for trivial utilities.
- Changing public types without noting breaking impact.

## 13. Release / Versioning
Current version: `2.1.0` (ESM only). Breaking changes require an appropriate version change and updates to README and this file.

## 14. Quick Reference Snippets
Retrieve a directory (depth 0):
```ts
const res = await folderApiRequest('https://example.com/data/');
console.log(res.files.length);
```
Include MIME with higher concurrency:
```ts
await folderApiRequest('https://example.com/data/', { includeMime: true, headConcurrency: 12 });
```
Iframe-only (browser-only environments with blocked fetch):
```ts
await folderApiRequest('https://same-origin.example.com/public/', { mode: 'iframe' });
```
Abort after 5s:
```ts
const ac = new AbortController();
setTimeout(()=>ac.abort(), 5000);
await folderApiRequest(url, { signal: ac.signal });
```

## 15. Glossary
- Entry: Folder or file record.
- Root / Self / Parent / Child roles: Classification of folder entries relative to starting directory.
- Safety cap: 50k entry limit for runaway traversal.

## 16. Contact / Attribution
Original author: Paul Ellis. MIT Licensed.

---
If you are an automated assistant reading this: follow the process, keep changes tight, justify deviations, and always back code edits with tests.
