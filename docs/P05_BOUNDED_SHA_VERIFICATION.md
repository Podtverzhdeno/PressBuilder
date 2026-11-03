# P05-R27 — bounded async SHA-256 verification

**Status:** Draft stacked on PR #62. No merge/deployment/feature enable.

## Why another bound is required

R25/R26 moved complete P05 master SHA-256 checking from synchronous
Node.js filesystem calls to chunked asynchronous reads. This is a
latency/correctness improvement, **not** protection from an
authenticated burst of many concurrent full-file checks. A swarm of
GET/HEAD/QC requests could pressure the same Railway volume and
libuv I/O worker pool even while Node's event loop stayed responsive.

## Design

Each `assemblyService` instance has a *separate* in-process
`createResourceGovernor` for P05 hash verification:

- At most **2 simultaneous** full P05 SHA checks.
- At most **12 queued** checks waiting for a slot.
- Once full, rejects new work with **HTTP 429** (no fail-open and no
  false 200/null-current response).
- Every request continues to hash **all bytes** of the selected P05
  MP4 and validate dev/ino, size, SHA and current pointer; no
  caching, bypass, mtime or partial-hash success.
- The permit is acquired after bounded release-manifest validation
  and released in `finally` for success, checksum mismatch, file
  errors, abort-like rejections and retained FileHandle streaming.
- A verified MP4 FileHandle is not itself counted as an active
  **hashing** operation after verification completes. Closing it
  belongs to the HTTP transfer lifecycle (R26).

This SHA governor is **independent** of the existing CPU-heavy
FFmpeg/Chromium governor; HTTP reads must not monopolize production
render CPU slots, and renders must not block all status reads.

The optional `shaBudget` factory argument is restricted to code that
constructs `assemblyService` (for deterministic tests). Production
uses the fixed 2-active/12-waiting defaults, not user input.

## Verification

`tests/cloud-p05-sha-budget.test.mjs` tests real on-disk 16 MiB
SHA-256 fixtures under an injected **1-active/0-waiting** budget:
many concurrent `currentAsync` and `downloadAsync` calls must
result only in (a) verified success or (b) explicit 429, **never**
silent null-current, stale-release or unverified success. It checks
the governor returns to `active=0,waiting=0` after each burst,
recovers successfully afterward, and releases slots on checksum
failures and retained-handle access.

The test also asserts failed SHA queue admission never enqueues an
audio worker, and its error stays 429 rather than masquerading as
`M58_AUDIO_NO_VERIFIED_CURRENT_RELEASE`.

Full Docker FFmpeg/Chromium and HTTP Range tests still must run on
the exact HEAD with **zero skips**.

## Residual risks

- Single-process governor: not a distributed quota, rate limit per
  account or protection across multiple Railway replicas. The app
  still requires its existing single-writer deployment.
- Bounded 12-item waiting list still allows I/O bursts; it only
  prevents **unbounded** amplification. An authenticated malicious
  actor can fill that small queue and deny service to other users.
  A trusted reverse proxy should add per-user rate limits and
  connection budgets.
- SHA remains asynchronous but still uses disk and CPU resources.
  No production volume latency benchmark is claimed.
- Unsupported untrusted same-UID writers, parent-directory TOCTOU,
  signed issuer evidence and rights/human listening remain open
  pre-production controls. No automatic publication authority.
