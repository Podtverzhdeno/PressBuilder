# P05-R32 — MCP verified reads, cancellation, 429 and scope checks

**Scope:** Draft PR stacked on PR #67. No merge/deploy/feature enable,
publication authority, production throughput claim or independent signoff.

## Confirmed review findings

- R30/R31 cancel in-flight verified P05 media, QC and audio **REST**
  reads on `ServerResponse.close`, allowing R27's two active / twelve
  waiting SHA slots to be released when a browser disconnects. MCP
  `tools/call` for `get_assembly_status` and `get_qc_cockpit` still
  lacked that cancellation path, although both perform expensive full
  MP4 SHA verification.
- The MCP JSON-RPC adapter **caught SHA governor 429** and returned an
  `HTTP 200` containing `isError:true`, even though HTTP P05/R28
  request admission already returns `429 + Retry-After`.
  Clients could mistake overload for a tool/domain error and fail to
  back off correctly.

## Precise fixes

- `makeMcp` accepts an **optional** third argument
  `{signal}` and forwards it through its `call` dispatcher solely to
  `assembly.getAsync(id,{signal})` and
  `qcCockpit.readAsync(id,{sceneId,signal})`.
- The HTTP `/mcp` handler binds `withLiveP05Response` **only**
  for verified/authenticated/in-scope `p05McpQuotaProject` reads of
  existing projects; other MCP requests, including writes, preserve
  existing behavior. Existing authenticated actor IDs (not spoofable
  `actor_id` arguments or forwarded-IP headers) remain the only quota
  actor keys. Denied worker reads cannot charge a different project's
  SHA/rate budget. An additional pre-admission scene membership check
  ensures non-directors omitting or inventing a P06 scene do not debit
  even their **own** project's shared SHA budget; makeMcp still
  enforces the authoritative P06 assignment/scope rules.
- The MCP adapter rethrows status **429** only for the two
  SHA-heavy read tools, so the HTTP boundary returns an explicit
  `429` with `Retry-After`. Internal cancellation **499** is likewise
  rethrown, but the disconnected response is never written.
  All other MCP domain failures retain the existing JSON-RPC
  `isError:true` result behavior; batch requests remain unsupported.
- No partial verification acceptance, cached SHA shortcut, new
  FFmpeg work, queue mutation, or publication grant has been added.

## Executable test

Run `node --test tests/cloud-p05-r32-mcp-burst.test.mjs`, or
`npm run test:cloud`.

The new test starts an isolated Basic/MCP-protected local PressBuilder
server and creates two deck IDs. A real **32 MiB SHA-verified synthetic**
P05 file is installed only in an authorized test project.

- A worker token scoped to the first project must be denied when
  asking for the second, including a forged `actor_id` field.
  A worker without a scene must not access director QC.
  **75 repeated** invalid-scene QC calls must not consume the worker
  or the project's quota; the worker's next legitimate assembly
  status read must still succeed. Unauthenticated and batched
  requests cannot bypass auth/quota.
- **42 simultaneous MCP requests** mix director QC,
  director assembly status and worker assembly status.
  Outcomes must be either full SHA-verified HTTP 200 JSON-RPC
  `isError:false` or **explicit HTTP 429 with Retry-After**.
  Samples `/health` and prints a single
  `P05_R32_MCP_BURST_METRICS` JSON line (p95, route breakdown,
  accepted/429, file size); these are **isolated CI diagnostics only**.
- Abort **18** additional MCP client requests, verify the server
  continues to serve scoped authenticated SHA reads without restart,
  then append bytes to the MP4. MCP status must report no verified
  current release, QC must reject its invalid release and no stale
  media or publication authority may be claimed.
- Docker suite must run FFmpeg/Chromium real-media regressions at
  this PR's exact HEAD with **zero skipped tests**.

## Residual limitations

- These synthetic bytes are not a playable MP4; the test exercises
  network, full SHA and policy paths, not real decoded audio quality.
  Independent real-media Docker tests cover actual FFmpeg/Chromium.
- Only the two **read-only** MCP tools are cancellation-aware.
  A disconnected `create_deck`, `assemble_video`, render request
  or other mutation must not be implicitly rolled back: those flows
  have separate durable/idempotent state contracts.
- Rate limits, SHA governor and active-connection budgeting remain
  per-process, not cross-replica; Basic auth remains one shared actor,
  external ingress DDoS and hostile same-UID storage writers remain
  out of scope. A production-equivalent load and security review are
  still needed before any merge/deployment.
