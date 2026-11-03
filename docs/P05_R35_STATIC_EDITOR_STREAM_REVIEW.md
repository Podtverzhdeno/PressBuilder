# P05-R35 — bounded compiled-editor static file streaming

**Scope:** Draft-only continuation of P05-R34; no merge, deployment,
production flag change, release publication or security certification.

## Confirmed source finding

Through PR #70 (R34), authenticated P05 masters, legacy exports and
voice downloads share an eight-active/no-wait FileHandle-backed media
stream governor. However, the last static editor route still used
`fileResponse`:

1. `fs.statSync(path)` then a **second path open** through
   `fs.createReadStream(path)` (metadata-to-open TOCTOU);
2. no event handler to destroy the stream on `ServerResponse.close`;
3. no active file-descriptor budget for stalled/slow static assets;
4. unvalidated numeric Range overflow could create misleading
   `Content-Length` instead of a deterministic 416.

A fully authenticated client could pause many large static asset
responses independently of the R34 media governor. That is an
**availability/resource-lifecycle** concern, not authority to publish
media or an integrity verdict.

## Implementation and boundaries

- Reuse the R34 `streamedFileResponse` implementation (previously
  `legacyMediaResponse`) for all compiled editor assets: asynchronously
  open the exact file descriptor with `O_RDONLY|O_NOFOLLOW|O_NONBLOCK`,
  verify regular-file type, `fstat/lstat` inode, device, size and then
  stream from the **same handle**. The descriptor closes and releases
  its permit on stream `close`, including early disconnects.
- Use an **independent 16-active / zero-wait** static stream governor.
  Saturated static GETs return HTTP 429 with `Retry-After`; static
  clients cannot use or exhaust the eight reserved user-media stream
  permits from R34. `HEAD` validates metadata without a retained
  stream slot. `/health` is deliberately outside both budgets.
- Keep SPA routing: when a requested built asset is missing, a
  directory, or a **leaf symlink**, return the normal compiled
  `index.html` fallback rather than open that path. This preserves
  prior SPA behavior for unknown URLs, but refuses to follow a
  final-component symlink. A missing/corrupted index itself fails
  instead of returning untrusted bytes.
- Preserve HTTP 200, 206 Range, 416 invalid Range, Basic auth, MIME,
  private/no-store and `X-Content-Type-Options:nosniff`. Preserve
  valid empty-file GET and editor shell. No browser/asset cache
  introduction or signature-bypass path.

## Executable acceptance test

`node --test tests/cloud-p05-r35-static-stream-guard.test.mjs`

- Creates a uniquely named **32 MiB synthetic** compiled `.js`
  file under `build/` (the test cleans it up, never modifies real
  editor assets); starts an isolated Basic/MCP-protected server.
- Holds **16 truly paused node:http clients** on the same static
  asset. The 17th GET must receive explicit HTTP 429 with
  `Retry-After`. A HEAD still reports its correct metadata;
  `/health` stays healthy; an authenticated `/out` Range GET
  still succeeds, proving static and media budgets are separate.
- Aborts one stalled reader and verifies another 206 static
  Range succeeds, then disconnects the rest. Repeats **24** invalid
  Range 416 requests and confirms a valid Range still succeeds (no
  FD-permit leak).
- A synthetic leaf symlink whose target contains a private marker
  must not expose the target; the SPA fallback loads instead.
  Zero-byte static assets return valid 200; unknown pages still
  load the editor index; unauthorized 401 and static POST 405.
- The independent Docker CI jobs must run full FFmpeg/Chromium
  real-media and existing R24–R34 security regressions on the
  **exact final PR HEAD**. A green CI run isn't a trusted human
  design approval or production performance SLO.

## Remaining integration/production gates

1. **Not a distributed throttle.** R34's media eight slots and
   R35's static sixteen slots are per Node.js worker. Multiple
   replicas need coordinated admission/ingress and real identities.
2. **No protection against arbitrary same-UID writes.** A pinned
   opened inode is stable against path replacement, not concurrent
   in-place modification. Parent-directory symlinks remain a
   trusted filesystem/deployment boundary.
3. Compiled assets have build-time trust, not per-request
   cryptographic manifests; legacy export/voice paths also aren't
   P05 SHA-signed. No claim of content authenticity or media
   publishability follows from file descriptor pinning.
4. HTTP server still has an independent connection/socket and
   request-body budget exposure. A reverse proxy, keep-alive and
   slow-header timeouts, real identity quotas and production-like
   soak tests remain necessary.
5. Stacked PRs #60–#70 require human integration review,
   normalization against current `main`, full merge-order CI and
   explicit owner authorization before any deploy, publication
   or promotion. All changes remain Draft until that review.

**No merge, deployment, publication, screenshot acceptance or
approval is performed by this change.**
