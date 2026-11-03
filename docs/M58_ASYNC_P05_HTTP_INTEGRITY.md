# M58-R25 / M51-R07 — asynchronous P05 integrity verification for QC HTTP

**Status:** isolated Draft PR stacked on #60. No production flag changes.

## Problem

R24 protected FFmpeg file identity inside a Worker, but the main Node.js
HTTP event loop still called P05 `assembly.current()` and
`assembly.download()`, both of which synchronously read and hash the
entire MP4 with `fs.readSync`. This happened in several places:

- authenticated `POST /api/decks/:id/audio-audit` (release CAS);
- authenticated `GET /api/decks/:id/audio-audit` for completed receipts;
- authenticated `GET /api/decks/:id/qc-cockpit` before reading audio;
- MCP `get_qc_cockpit`;
- the real-audio queue pump before/after governor acquisition and after
  worker completion.

A slow storage mount or large MP4 could stall **unrelated requests
including /health**. The fix must not use cached SHA, mtime or user
supplied evidence as a substitute for full P05 integrity.

## Implementation

P05 now offers `currentAsync(id)` and `downloadAsync(id,releaseId)`.
They preserve the manifest validation used by `verifiedRelease` and
perform a full SHA-256 read through `fs.promises.open` and positional
asynchronous 256 KiB chunks. Files are opened with
`O_RDONLY | O_NOFOLLOW | O_NONBLOCK`, validated as regular files of
the exact manifest size, and checked for the same device, inode and
size at the beginning/end of reading and at the P05 pathname.
`currentAsync` re-reads the current-release pointer after the SHA
check to reject a release that changed during the awaited I/O.
Every FileHandle is closed in a `finally`.

The real-audio queue has new `enqueueAsync`, `readAsync` and
`infoAsync` methods. All production pump SHA checks await
`assembly.currentAsync` rather than running the synchronous P05
read on the HTTP thread. `readAsync` validates completed receipts
and verifies the current SHA **once per read**, rather than the prior
two full sync scans. The existing synchronous methods remain available
to older tests/internal callers, but Cloud REST uses only asynchronous
paths. No GET runs FFmpeg or queues a job.

M51 QC gains `readAsync`: it uses async P05 current release,
awaits the optional async real-audio reader, and keeps the same
read-only projection and P06 scene-scoping rules. Both public REST
and MCP `get_qc_cockpit` use this method.

## Verification

`tests/cloud-async-real-audio-http.test.mjs` covers:

1. True on-disk full SHA of a multi-MiB master via async P05, with an
   event-loop scheduling witness. Mutation and symlink redirection
   must fail closed even when the target has the correct SHA.
2. Async queue with sync P05 methods replaced by functions that throw
   (`SYNC_SHA_VERIFICATION_FORBIDDEN`). Enqueue, pump, completed
   receipt read, cache lookup, stale release and explicit CAS rejection
   must still work with no sync calls.
3. M51 async QC against that async-only assembly, plus director-only
   real-audio receipt loading and no real-audio reader calls for
   P06 scene-restricted projections.

Existing browser tests still exercise genuine protected HTTP
GET/POST, MP4/AAC, Lang MCP and the QC UI. Full Docker testing must
show 0 skips, actual E2E and render smoke on the exact PR HEAD.

## Remaining limitations

- P05 operations unrelated to M51/M58 (e.g. standalone MP4 downloads,
  assembly status) still have synchronous verification; this PR limits
  its change to QC/audio request paths and their queue.
- The asynchronous hashes **still consume disk I/O and CPU**.
  Concurrent authenticated requests can increase storage load;
  production traffic needs explicit concurrency/rate limits and
  latency measurements on its actual volume.
- 256 KiB hash updates briefly run on the JS thread; they no longer
  monopolize the event loop for an entire 128 MiB master. This is
  not equivalent to off-process SHA compute.
- Cross-replica operation remains unsupported without the single-writer
  host lock. Same-UID filesystem adversaries and source-path parent
  rename races are not solved. No cryptographic issuer attestation.
- Neither a QC cockpit nor an audio receipt authorizes publication,
  deployment, licensing or human artistic signoff.
