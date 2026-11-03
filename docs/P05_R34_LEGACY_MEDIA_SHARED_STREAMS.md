# P05-R34 — shared media-stream FD governor for legacy exports and voice

**Scope:** Draft-only follow-up to PR #69. No changes to deployed
configuration, media publishing, human QC decisions or production.

## Defect closed

PR #69 (R33) constrained `GET /api/decks/:id/assembly/releases/:rid/final.mp4`
to eight simultaneous inode-pinned HTTP read streams. However, the
authenticated legacy routes `GET /out/*.mp4`,
`GET /out/*_v*_f*.jpg` and
`GET /src/decks/:id/voice.*` still used the older `fileResponse`:
a `statSync` of a mutable pathname followed by an independent
`fs.createReadStream(file).pipe(res)`, with no bounded stream lease and
no explicit stream destruction upon `ServerResponse.close`.

An authenticated actor could retain many paused legacy exports or
audio downloads at once, bypassing the intended R33 **retained-file-
descriptor limit** (and causing slow-reader pressure on the event loop,
filesystem and response sockets).

## Implementation

1. **One shared 8-active/0-wait FD budget:** `mediaStreamSlots` replaces
   the P05-only lease and is acquired **before any streaming file open**
   for all authenticated GET routes: P05 verified release, legacy
   `/out` export/evidence and `/src/decks` voice. A 9th concurrent
   request gets explicit **HTTP 429 / Retry-After** without an unbounded
   waiter queue; closing a client frees one slot when the actual
   FileHandle-backed ReadStream emits `close`.
2. **Opened-inode legacy responses:** instead of re-opening by pathname,
   legacy media uses `fs.promises.open(O_RDONLY|O_NOFOLLOW|O_NONBLOCK)`,
   checks `FileHandle.stat()` against `lstat(file)` (regular file,
   inode, device and size), and streams bytes from that **same opened
   handle**. Closing a socket destroys the stream; a failed open or
   Range 416 closes the descriptor and releases any lease. The top
   level still requires Basic auth and validates `/out` filename and
   `/src/decks` voice paths before reaching this function.
3. **Preserve HTTP semantics:** GET, HEAD, valid 206 Range, invalid 416
   Range, no-store cache-control, MIME mapping and zero-byte files;
   HEAD verifies the regular file/path and closes its short-lived
   handle without consuming a long-lived stream slot. Legacy media
   now rejects POST/PUT/PATCH etc. with **405**, instead of attempting
   to stream an opaque response to a write method. App static files
   are deliberately left on their existing handler; R34 is scoped to
   user media, not the Vite-built editor.
4. **No integrity promotion:** unlike P05 release, the legacy export
   and voice routes do **not** have signed immutable SHA manifests.
   Pinning an opened inode prevents some TOCTOU/path replacement
   attacks but is **not** proof of media integrity and does not grant
   any release, receipt or publication status.

## Test: mixed paused streaming sockets

`node --test tests/cloud-p05-r34-legacy-media-shared-leases.test.mjs`

One isolated Basic/MCP-protected test server creates a synthetic 24 MiB
P05 SHA-verified release, a 24 MiB export and a 24 MiB voice file.
The bytes are **not real playable audio/video**. Using actual paused
`node:http` response sockets (not fully buffered `fetch`), the test
holds **eight simultaneous streams interleaving all three routes**,
then proves that a ninth GET against **each of the three families**
returns **429**. All three HEAD requests still return valid metadata.
A disconnected voice reader frees a slot used by a new P05 206 Range
request; closing all remaining clients lets all three routes recover.

The regression also requires authentication, 405 for media POST,
no-follow rejection of symlinked final components, 416 Range without
resource leakage and a successful empty-file GET. The existing R33
slow-MP4, R24-R32 SHA/authentication tests plus Chromium/FFmpeg
media suite must pass on the exact final PR HEAD.

## Residual deployment and security gates

- **Per-process, not distributed:** the eight-descriptor bound is per
  Node worker only; it does not coordinate multiple Railway replicas
  or reserve slots for specific tenants. Basic auth is one shared web
  actor; request rate limiting of legacy GETs is out of scope.
- `O_NOFOLLOW` applies to the **last path component**, not parent
  directories. Symlinked parents, mounted/shared directories and
  same-UID writes to already-open inodes require trusted filesystem
  layout and single-writer process boundaries. Inode metadata alone
  does not cryptographically authenticate legacy media.
- Only authenticated user-media routes participate in this shared
  budget. `fileResponse` for built app assets remains separate and
  may benefit from a generic slow-reader cleanup follow-up; no claims
  are made about DDoS-resistance at proxy/network level.
- Real user playback quality, independently signed release evidence,
  human approval, production storage benchmarks, integration review
  and release authorization remain prerequisites to merge/deploy.

**No merge, deploy, flag enable, publish action or owner signoff
performed.**
