# P05-R28 — authenticated request admission for expensive P05 SHA

**Scope:** Draft PR stacked on #63, default-production behavior unchanged
until the owner independently reviews and merges the PR chain.

## Authentication reality

The current PressBuilder web editor has **one configured Basic Auth
username/password**. It does **not** establish separate browser users.
Consequently, R28 does **not** claim per-human fairness: all authenticated
web editor traffic shares the trusted principal `web:director`.
Authenticated MCP calls use a **distinct namespaced principal**:
`mcp:director` for token/OAuth directors, and
`mcp:agent:<verified-agent-id>` for directory agents. The agent IDs
come from `agents.authenticate`, not from request JSON. Separating
these namespaces prevents a worker with a reserved-looking ID from
draining the web or MCP director's quota.

**No identity is derived from `X-Forwarded-For`, `X-Real-IP`, request
JSON, query parameters or untrusted caller-supplied actor IDs.**
Proxy IP metadata must be validated by trusted infrastructure before
it can ever become an identity signal.

## Bounded admission

`server/p05-request-quota.mjs` applies a deterministic two-level token
budget, entirely after authentication and REST origin checks:

- **Authenticated principal:** burst 64 SHA-expensive requests,
  refill 2 requests/second, shared across projects.
- **Project:** burst 96, refill 3 requests/second, shared across
  authenticated identities. A caller cannot evade the actor budget by
  rotating project IDs or evade the project budget by rotating agents.
- The two-token debit is **atomic**; requests rejected by either
  budget do not partially consume the other.
- Requests for **nonexistent projects** are rejected through the
  original route without allocating actor/project quota entries. This
  prevents authenticated guesses of fake project IDs from filling
  the 512-project key map without causing any real SHA work.
- A bounded in-memory registry holds at most **256 actors and 512
  projects**. Only entries idle for at least 180 seconds may be
  evicted when the map is full; pressure fails closed with 429.
- Exhaustion produces **HTTP 429 + Retry-After** (1–60 seconds), rather
  than sending a file, launching FFmpeg or hiding the overload as a
  stale release. The older P05-R27 I/O governor still limits actual
  disk reads to 2 running + 12 waiting; its 429 also receives
  `Retry-After: 1`.

Authenticated heavy REST routes: `GET /assemble`,
`GET /qc-cockpit`, `GET/POST /audio-audit`, and
`GET/HEAD /assembly/releases/:rid/final.mp4`. For MCP, only
`get_assembly_status` and `get_qc_cockpit` are covered. The matching
logic decodes and validates canonical project IDs so encoded paths
do not bypass quotas; unsupported methods do not debit.

Unrelated `GET /health`, ordinary deck metadata, render jobs,
static assets and login are not rate-limited by this specific feature.

## Verification

`tests/cloud-p05-request-quota.test.mjs` covers: escaped path matching,
token refill, actor/project cross-key fairness, no double debit,
bounded map capacity, idle key reclamation, invalid configs, and an
actual password-protected PressBuilder HTTP server. It creates two
separate test decks and repeatedly sends authenticated assembly-status
requests alternating projects, while spoofing
`X-Forwarded-For` on every request. The test requires actual 429
with `Retry-After` and proves that health, unrelated metadata, and a
separately authenticated MCP director still work. It then exhausts
the MCP director's own project budget via real `tools/call` requests
with forged `actor_id` values and proves MCP also returns **HTTP 429
+ Retry-After**, without trusting the forged actor IDs.

All existing real MP4/AAC, FFprobe/FFmpeg, browser and P05
streaming tests must pass on the **exact-head Docker run** with zero
skips; a Cloud runner without those binaries is not sufficient.

## Remaining limitations

- **Not per-user for the web editor.** To guarantee that, implement
  session identities or verified per-user login first. One Basic
  principal can still monopolize its own budget and inconvenience
  other people who share that credential.
- This is a per-process best-effort quota, not a distributed quota or
  authenticated network-edge DDoS mitigation. Rate limits disappear
  on restart and are not coordinated across replicas.
- 64/2s and 96/3s are initial conservative defaults, **not production
  load-tested throughput guarantees**. Browser video-seek traffic and
  real deployment storage latency need benchmarks before rollout.
- Node consumes a small amount of CPU to authenticate requests and
  parse MCP JSON before quota admission. External trusted ingress
  should separately bound connection counts, bodies and network
  floods.
- The P05-R24 through R27 filesystem, cryptographic issuer and
  same-UID-writer threat-model limitations remain unchanged. No
  publication or human approval is granted by a successful request.
