# P05-R31 — cancel QC and completed-audio HTTP reads under contention

**Scope:** Draft PR stacked on P05-R30 / #66. No merge, deploy, flag
enable, publication or independent security approval.

## Confirmed availability gap

P05-R30 connected `ServerResponse.close` to an `AbortSignal`
for direct `/assemble` status and pinned MP4 streaming, so orphaned
SHA reads no longer occupy R27's 2-active/12-waiting budget.
**Read-only** `GET /api/decks/:id/qc-cockpit` and
`GET /api/decks/:id/audio-audit` still lacked that connection.
A completed real-audio receipt triggers another full current-master
verification, and a QC director request triggers two (P05 current,
then completed audio). Abandoned read clients could waste those
bounded full-file SHA resources, reducing responsiveness for other
authenticated callers.

## Implementation

- Both protected GET routes now use the same
  `withLiveP05Response(res,verify)` wrapper introduced in R30.
- `qcCockpit.readAsync(id,{sceneId,signal})` checks cancellation
  before its first SHA, after its first P05 `currentAsync`, after
  the optional audio reader and before building the response.
- `realAudioQueue.readAsync(id,{signal})` and its
  `verifiedCurrentAsync(id,{signal})` pass the signal to P05
  `assembly.currentAsync(id,{signal})`. Nested QC audio-reader
  wiring also forwards it; neither QC nor audio queue may reinterpret
  an aborted SHA as malformed/corrupt receipt.
- R30's P05 governor cancels waiters, checks cancellation between
  256 KiB reads, closes pinned FileHandles and returns permits in
  `finally`. R27/R28 429 backpressure stays in place. No partial
  hash success or cached SHA acceptance is introduced.
- **Deliberate durability boundary:** `POST /audio-audit` is
  **not** cancelled when its HTTP client disconnects. Once a queue
  admission is persisted, the worker must finish (or explicitly fail)
  instead of creating an ambiguous lost-job lifecycle. No automatic
  re-run or additional FFmpeg worker is introduced.

## Reproducible isolated tests

`tests/cloud-p05-r31-qc-audio-burst.test.mjs` includes:

1. In-process unit test: pre-aborted audio and QC reads fail with
   internal 499, not a false `INVALID` report; a 499 from a
   nested QC audio-read remains a cancellation.
2. **Protected live-server mixed burst:** creates a temporary,
   isolated **24 MiB synthetic SHA-matched** P05 release and uses
   the real M58 queue implementation with an explicit **mock audit
   function** to create a nonpublishing unsigned receipt.
   This is **not real audio decoding or human signoff**.
   Sends **36 concurrent authenticated requests** (12 each:
   QC GET, completed audio GET, explicit cache-hit audio POST).
   Success means exact SHA-matched 200/202; saturation means
   429 + Retry-After. No implicit GET enqueue or double worker.
   Samples independent `/health` calls and reports
   `P05_R31_QC_AUDIO_BURST_METRICS` as JSON with success/429,
   route breakdown, p95 and health latency.
   Aborts 18 more read clients, verifies recovery and immutable
   receipt/journal SHA without restarting, then physically tampers
   with final.mp4 and requires 409 on all three routes.
   Rejected/tampered media must never upgrade publication authority.

Run with `node --test tests/cloud-p05-r31-qc-audio-burst.test.mjs`
or the full `npm run test:cloud`; decisive media/browser regressions
run inside the production Docker build.

## Limits and production gates

- Test media bytes are deliberately **not playable**; the mock
  audit exercises receipt/state invariants without starting FFmpeg.
  Existing separate Docker tests exercise actual H.264/AAC, FFprobe,
  FFmpeg, browser QC and end-to-end rendering. Do **not** call this
  a production latency benchmark or a real-audio QA approval.
- MCP `get_qc_cockpit` / `get_assembly_status` remain bounded by
  R27/R28 but not tied to MCP HTTP-client disconnects yet.
- Post-admission audio workers retain their own bounded retry strategy
  and are independent of browser disconnects.
- Per-process quotas are not cross-replica or per-human identities;
  external ingress DDoS, directory symlink parents and same-inode
  mutation by same-UID writers remain outside this protection.
- R31 uses no production data and grants **no** merge, deployment,
  user-aesthetic signoff or publication permission.
