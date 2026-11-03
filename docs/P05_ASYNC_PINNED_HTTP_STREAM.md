# P05-R26 — async status and exact-inode HTTP streaming

**Scope:** separate Draft PR stacked on M58-R25 (#61). No merge,
production deployment or permission change.

## Problem

The P05 status endpoint, its MCP equivalent, and protected MP4 download
still called synchronous `assembly.current()` / `download()`.
These hashed the complete MP4 from the HTTP event loop, blocking
unrelated requests. The previous download also SHA-verified one
pathname and then opened the same pathname **again** in
`fs.createReadStream`. A concurrent path replacement could make
the user download bytes from a different, unverified inode.

## New behavior

- P05 `getAsync(id)` uses `currentAsync(id)` (from R25) and preserves
  exactly the existing public response structure, scene review validity
  and not-started behavior. REST `GET /api/decks/:id/assemble` and
  MCP `get_assembly_status` call it.
- P05 `downloadHandleAsync(id,releaseId)` verifies the **full SHA-256**
  with asynchronous positional 256 KiB reads and **retains the same
  opened FileHandle** until HTTP has finished streaming.
- Protected `GET/HEAD /api/decks/:id/assembly/releases/:rid/final.mp4`
  uses `FileHandle.createReadStream({start,end,autoClose:true})` on
  that pinned FD. It does **not reopen the public pathname**.
- Existing `Range: bytes=start-end` / `bytes=start-`, 200/206,
  invalid-range 416 + `Content-Range`,  `Content-Type: video/mp4`,
  cache control, `X-Content-Type-Options: nosniff`, Basic auth and
  HEAD semantics are retained. A malformed/unsupported Range (rather
  than invalid numeric bounds) retains existing full-content behavior.
- All HEAD / 416 / early-error paths close the retained handle
  explicitly; the streaming path uses auto-close and destroys its
  stream if the response closes early.

## Negative tests

`tests/cloud-p05-async-stream.test.mjs` verifies:

1. An already-SHA-verified FD still returns the original committed
   bytes after `final.mp4` is renamed and replaced by a different
   file; a new verification of the replacement is denied.
2. A real password-protected cloud server with a test deck and
   on-disk P05 release: HTTP GET/HEAD, complete payload SHA, exact and
   open-ended ranges, 416 ranges, MCP status and same response shape.
3. In-place tampering makes subsequent HTTP download fail 409 and
   full P05 status return `current_release:null`; the health endpoint
   remains functional. No unverified MP4 is sent.
4. Full Docker test suite, FFmpeg H.264/AAC workflow, Chromium QC
   screenshot capture and render-smoke remain green.

The test fixture itself is synthetic bytes matching a P05 SHA manifest;
full AV playback is exercised independently in existing FFmpeg tests.

## Residual risks

- Heavy SHA validation still consumes I/O; now it yields to the event
  loop but it is **not** a rate limiter or load-shedding mechanism.
- Same-UID writers with permission to edit the **same pinned inode**
  during the streamed response could change its bytes post-hash.
  Deploy on a writer-protected immutable volume or isolate OS users.
- `FileHandle` descriptor pinning protects the leaf inode, not every
  parent directory or symlink. Further sandbox/FS restrictions are
  required before treating untrusted local writers as hostile tenants.
- Historic synchronous methods are preserved for internal callers;
  `get_assembly_status` and protected P05 HTTP methods are the only
  new wire migrations in this PR.
- No human publication, legal rights, accurate audio-visual PTS or
  security signoff is implied.
