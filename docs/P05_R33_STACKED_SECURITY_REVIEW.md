# P05-R33 — stacked security review and slow MP4 stream containment

**Reviewer posture:** targeted in-repository source review of the exact
PR #68 parent HEAD `c8f3be2`, scoped to PRs #60–#68 and this R33 fix.
**Not an independent third-party security certification.** Draft only;
no merge, deployment, publication, flag change or human QC approval.

## Review map for PRs #60–#68

| Controls reviewed | Source / observed behavior | Residual risk |
| --- | --- | --- |
| R24–R26 media identity and SHA | `server/assemble-scenes.mjs`: SHA on opened FileHandle, O_NOFOLLOW for final MP4, size/dev/inode/CAS, verified handle sent to `pinnedMp4Response` | Same-UID in-place mutation; symlinked parent directories; no signed manifest |
| R27 bounded SHA | `createResourceGovernor({capacity:2,maxWaiting:12})`; async 256 KiB reads; 429/Retry-After | SHA token is released **before HTTP stream ends**; long-lived socket/FD count was not bounded |
| R28–R29 quota and backpressure | Authenticated actor/project token bucket with bounded maps, no allocation on reject; audio worker retries SHA 429 without replaying FFmpeg | Per-process only; shared Basic user identity; cluster ingress still needed |
| R30–R31 REST cancellation | `withLiveP05Response` + per-read AbortSignal to SHA, QC and finished-audio reads; distinct internal 499 | Race after successful retained FileHandle but before wrapper abort check could drop handle without closing |
| R32 MCP cancellation/scope | Only two read-only MCP tools bound to client close; SHA overflow returns HTTP 429; unauthorized P06 scene preflight before quota | MCP mutations deliberately not auto-cancelled; full authorization on every call still mandatory |

## R33 confirmed gap and remediation

**Issue A — long-lived FD exhaustion (availability):**
The full SHA governor only owns the hashing interval. After it returns,
`GET /api/decks/:id/assembly/releases/:rid/final.mp4` creates a
FileHandle-backed stream whose lifetime is controlled by the remote
consumer. A valid Basic-auth actor can hold many large response
streams open at low read rate despite R27 limiting hashing to two
active slots. R28's burst 64 constrains *requests* but not concurrent
slow streams / FD occupancy.

**Fix:** a separate **8-active, zero-wait, per-process** resource
governor exclusively for P05 release **GET** streams; admission occurs
**before** running the full SHA. The 9th active GET receives explicit
HTTP 429 + Retry-After (and does not hash); no unbounded pending
stream lease queue exists. The stream lease remains held until the
pinned FileHandle stream emits **close**. HTTP client disconnect
destroys the stream. FileHandle verification, regular-file gate,
range response and pointer semantics are unchanged.
HEAD still performs full SHA but never consumes a long-lived
stream permit.

**Issue B — disconnect race on an already-verified handle:**
R30's `withLiveP05Response` returned an inode-pinned handle when
verification completed, then checked whether `res.close` had fired.
If close fired in that narrow interval, it threw 499 without
disposing a retained `FileHandle`. R33 adds an optional
`disposeOnAbort` callback and closes the handle before throwing.
A stream-setup failure destroys any partially created stream.
A failed/early-returned request closes its handle and returns
any stream lease even on 416 or 409.

## Executable safety witness

`node --test tests/cloud-p05-r33-slow-stream-leases.test.mjs`

- Isolated local Basic/MCP-protected server and an intentionally
  **nonplayable** 32 MiB P05 SHA-verified test MP4.
- Eight `node:http` clients **pause their inbound sockets** after
  receiving a successful 200 response. Unlike a normal completed
  fetch, this retains real server-side stream FDs.
- `HEAD` still succeeds (and verifies SHA) with the eight GETs
  stalled. After deliberately corrupting the master, the ninth GET
  must return **429** from admission *before* SHA integrity rejection;
  HEAD must independently reject the corruption with 409.
- Restore bytes and disconnect one slow client. A fresh 206 Range
  download must then succeed with seven other readers still paused.
- Disconnect remaining clients. Nine successive corrupt-MP4 GETs
  must return **409** rather than leak stream slots/transform into
  429. Restore bytes and verify another 206 Range success.
- Existing Docker/Cloud tests additionally exercise actual FFmpeg
  MP4, H.264/AAC and Chromium QC. Synthetic slow-reader fixture
  proves **network/resource invariants**, not real video quality.

## Open findings / premerge gates

1. **Open medium/high availability risk:** legacy authenticated
   `/out/*.mp4` and `/src/decks/*/voice.*` use the separate
   `fileResponse` implementation; that path remains outside the
   P05 authenticated request quota and R33 stream lease. Its
   `fs.createReadStream(...).pipe(res)` does not explicitly destroy
   the stream on `res.close`. A separate follow-up is needed to
   bound and clean up those **non-P05** media responses.
2. Parent-directory symlink threats / same-UID mutable release
   volume require external filesystem boundaries and a trusted
   single-writer deployment model; opened FD verification does
   not protect against ongoing writes to the **same inode**.
3. R28 quota keys are per-process and Basic auth is one shared
   web identity; multiple replicas, adversarial ingress and
   per-person throttling require real identities and coordinated
   gateway policy.
4. Signed immutable audit receipts, independent human QC,
   actual Railway-IOPS production-like stress, manual PR
   integration and human authorization remain separate blockers.

The PR is intentionally stacked on the preceding Draft PR; a green
CI proves tests run on this exact revision but does **not** grant
deployment or production authorization.
