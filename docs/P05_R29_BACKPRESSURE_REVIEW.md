# P05-R29 — adversarial review of R24–R28 backpressure accounting

**Status:** Draft follow-up stacked on P05-R28 / PR #64; implementation
and tests in this PR, no merge/deployment/production authorization.

## Findings (reproduced as source-level counterexamples)

| ID | Severity | Failure mode before R29 | Repair |
| --- | --- | --- | --- |
| F1 | Medium | `createP05RequestQuota.admit` **created both bucket records before token availability was checked**. An exhausted authenticated actor could submit SHA-route requests for many *existing* projects, get 429 and still allocate new project entries. In reverse, an exhausted project could allocate actor entries. The bounded key maps could fill with requests **that never performed a SHA**, prematurely rejecting legitimate users with `P05_QUOTA_IDENTITY_CAPACITY`. | Two-phase `peek` then `commit`: check/refill both budgets without inserting a new key, reject atomically, create or debit both only if **both** pass. Existing key activity timestamps still refresh on denied requests, preventing eviction-based rate-limit reset when a saturated principal remains active. |
| F2 | Medium | M51 async QC handled **every** `realAudioReadAsync` rejection as a bad receipt, including `{status:429}` from the SHA governor. A healthy verified release could be displayed as `INVALID` and HTTP 200 under brief storage pressure. | Re-throw 429 unchanged (HTTP layer produces 429 + Retry-After); continue to reject genuinely malformed/tampered receipts in the projection. |
| F3 | Medium/High (availability) | The M58 queued worker did three full-P05 verification checkpoints. If any hit a transient **429 from the bounded R27 SHA governor**, the job was immediately marked `FAILED`. In particular, a 429 **after FFmpeg completed** threw away its review and forced the owner to initiate another expensive audit. | At **each** of three checks, retry only `verifiedCurrentAsync` with exponential bounded delays (75/150/300/600/750/750 ms; at most 7 total full checks per checkpoint). Still verify SHA and release identity after await. The FFmpeg worker is **not** replayed. If contention persists, fail closed with explicit `M58_AUDIO_SHA_BACKPRESSURE_EXHAUSTED` and keep no receipt. |

The R29 changes are a **targeted correctness and abuse review** of the
previous Draft PR chain, **not** an independent security signoff. A
different owner/security reviewer must inspect and approve before merge.

## Negative controls

`tests/cloud-p05-r29-backpressure.test.mjs` has four cases:

1. An exhausted actor sends denied requests to four additional valid
   project keys: snapshot must still contain **one** actor and **one**
   project. An exhausted project must not allocate a new actor. A
   successful later request is charged to both normally.
   A separate test holds an exhausted principal active through repeated
   429s across an idle TTL and asserts that the principal cannot be
   evicted/recreated to reset its burst budget.
2. M51 director QC with asynchronous verified release: a second-phase
   audio reader 429 must reject with status 429, not render `INVALID`.
   A genuine non-429 malformed receipt remains nonpublishable.
3. Inject exactly **two transient 429s at the third/final P05
   verification checkpoint**, after a mocked FFmpeg audit returned.
   Job must complete with an unsigned review receipt, precisely **one
   FFmpeg call** and exactly six SHA-check attempts.
4. Inject sustained SHA congestion on every worker verification after
   enqueue. The worker must exhaust a finite **7 checks**, store
   `FAILED` with the explicit backpressure reason, run **zero**
   FFmpeg audits, have no pending/running work and create **no** audio
   receipt.

Prior R24–R28 negative suites, real H.264/AAC synthetic media,
Chromium UI, Basic/MCP quota tests and MP4 render-smoke must all
run in Docker with **zero skips** at this PR's exact HEAD.

## Deliberate limits / remaining production gates

- Finite retry does **not** guarantee completion during sustained
  overload. A `FAILED` journal is preserved, never silently replayed
  or accepted as a completed receipt. A director must retry explicitly.
- Excessive authenticated traffic can still use the allowed token
  rate, monopolize process-local SHA slots and impact latency; rate
  limits were **not tuned against real Railway/production load**.
  Trusted ingress per-user sessions, request budgets and storage
  monitoring remain required.
- Existing SHA/open-FD protection addresses leaf path replacement, but
  **does not protect against same-inode modification by another
  local writer**, parent-directory rename races or malicious
  same-UID agents without OS-level isolation.
- Receipts are hashes without a trusted issuer signature; they grant
  no publication, licensing, legal, or human-aesthetic approval.
  Real smartphone UA/assistive technology/manual audio QA not claimed.
- No PR in this stacked series is merged/deployed and
  `PB_REAL_AUDIO_AUDIT` remains OFF by default.
