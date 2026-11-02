# M50-R01 · Fenced durable QA job ledger

**Status: partial implementation, NOT M50 accepted.** Feature flag `PB_FENCED_JOB_LEDGER=1` defaults OFF. The existing P02 render-queue, P08 approvals and P05 release/assembly stay untouched.

The server stores each project/scene/job as an individually checksummed JSON record under `<project>/.job-ledger/`. Journal paths derive from a SHA-256 digest of trusted slug IDs. Updates use a temporary file and rename, mode 0600. The checksum detects accidental corruption, NOT malicious modification. Symlinks and hard-linked journal files fail closed. This is **single-process/local-volume** durability; atomic rename is not cross-replica CAS or a distributed lease.

## State machine and ACL

`QUEUED → LEASED → VERIFIED_FOR_REVIEW` and `QUEUED/LEASED → CANCELLED`. No state means published or authorized to publish. `may_publish:false` is mandatory for every snapshot.

- `BEGIN`: director-only, idempotent `request_id`. Requires a currently approved P08 version, QA PASS and an exact real immutable MP4 SHA. P08 `approved` recomputes the file hash before returning; no client paths/URLs.
- `CLAIM`: director or P06-scoped scene worker; revision CAS, random secret and monotonically increasing integer fence. Lease secret is returned only at claim time, stored hashed.
- `HEARTBEAT`: exact assignee, active token/fence, CAS revision, TTL guard.
- `VERIFY`: exact assignee and fence with P08 re-verification, idempotency `operation_id` and matching evidence SHA; only transitions to `VERIFIED_FOR_REVIEW`. Replayed duplicate must match the original evidence.
- `CANCEL`: director-only, revision CAS; never cancel after QA verification.
- Recover after an interruption: expired `LEASED` is visible as `recoverable:true` and a new owner may claim a **higher fence**. The old token cannot complete the new lease.

REST: `GET/POST /api/decks/:id/job-ledger/:scene/:job`, protected by existing Basic auth and Origin enforcement. MCP: `get_fenced_job`, `begin_fenced_job`, `claim_fenced_job`, `heartbeat_fenced_job`, `verify_fenced_job`, `cancel_fenced_job`; workers remain scoped to P06 project/scene assignment, only directors may begin/cancel.

## Evidence and remaining work

- Negative/pure/crash tests: `tests/cloud-fenced-job-ledger.test.mjs`; 100 crash-like process reinitializations, monotonic fences, stale-token and corruption rejection.
- Live REST/MCP auth and no-P08 denial: `tests/cloud-fenced-job-ledger-wire.test.mjs`.
- This does **not** prove real SIGKILL during FFmpeg mux, production cross-replica locking, P05 atomic release CAS, actual resume of interrupted encodes, or independent human approval; these are still M50-C01–C08. It does not write P05 release pointers.
- Next integration: link actual P02 stage events to this journal without treating a ledger receipt as approval; build a separately fenced P05 candidate commit with QA/artistic review and true fault-injection evidence.
