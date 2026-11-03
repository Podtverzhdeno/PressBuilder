# P05-R30 — cancellable HTTP verification and isolated burst evidence

**Status:** Draft, stacked on PR #65. No merge, deploy or publication authorization.

## Review finding

R25–R29 made `currentAsync` and `downloadHandleAsync` fully verify
P05 releases without monopolizing the event loop, and imposed the R27
2-active/12-waiting SHA I/O governor plus R28 actor/project quotas.
However, the two direct protected P05 REST routes lacked a **request
cancellation signal**. A browser that abandoned status or an MP4 seek
would still occupy a SHA queue slot until the complete MP4 had been
hashed, even though the result could never be delivered. Many rapid
seeks or disconnected sockets could waste otherwise bounded capacity.

## Implementation and safety boundaries

- For protected `GET /api/decks/:id/assemble` and
  `GET/HEAD /api/decks/:id/assembly/releases/:rid/final.mp4`,
  `withLiveP05Response` binds an `AbortController` to
  `ServerResponse.close` **only during verification**. The listener
  is removed before streaming; P05-R26's retained pinned file descriptor
  is then owned and closed by the response stream.
- `assembly.getAsync(id,{signal})`, `currentAsync(id,{signal})`
  and `downloadHandleAsync(id,rid,{signal})` pass abort to the
  existing SHA resource governor and check it before and after async
  file access, before/after every 256 KiB read, and before handing out
  a verified file handle. No SHA bypass or cache was introduced.
- The existing `finally` closes every aborted FileHandle and
  releases its SHA permit. An aborted waiter is removed from the
  governor FIFO. A client abort is a distinct internal 499
  cancellation, not an `INVALID` P05 release. The server does not try
  to send a response to an already destroyed connection.
- Full SHA, manifest bytes, regular-file-only/O_NOFOLLOW,
  device/inode/size checks, current-pointer CAS, R28 request quotas,
  HTTP authentication and 200/206/416 range behavior are unchanged.

## Reproducible isolated stress

Run on the branch after dependencies are installed:

```sh
node --test tests/cloud-p05-r30-http-burst.test.mjs
```

This creates a temporary **48 MiB synthetic P05 release** with full
SHA-256 manifest, launches an isolated protected local PressBuilder
server and a real MCP deck, then sends **36 simultaneous authenticated
requests** mixing release status, MP4 HEAD and 256-byte Range GETs.

The test checks that every outcome is either SHA-verified 200/206 or
429 with Retry-After; it independently samples `/health` while the
full-file SHA scans run, and emits a single JSON diagnostic line:

`P05_R30_ISOLATED_BURST_METRICS` with accepted/429 totals, request
p50/p95, health p95/max, fixture size and elapsed burst time.
The metrics are **machine-specific evidence only** and do NOT imply
a Railway production p95 SLO or tested live capacity.

The test then aborts 18 more in-flight SHA requests, verifies the
server subsequently accepts authenticated SHA-verified status and
Range requests without restarting, and **tamper-modifies** the MP4:
future download must reject 409 and status must not claim a current
verified release. A separate unit test aborts verification before and
during an actual 32 MiB SHA and asserts `active=waiting=0` with no
leaked file handle.

Full Docker CI must still execute all existing H.264/AAC worker,
Chromium QC and FFmpeg render smoke tests **without skips** on this
exact PR HEAD.

## Before production / limitations

- This is an **isolated synthetic load test**, not a benchmark on the
  production hardware, storage/IOPS profile or normal media codec
  sizes. It deliberately avoids touching any real user deck.
- Client disconnect cancellation currently covers the **two direct
  P05 REST routes**. Async P05 work nested behind M51 QC,
  M58 audio-audit GET/POST and MCP reads remains bounded by R27/R28
  but is not yet wired to per-HTTP-connection cancellation.
- Worker SHA checks intentionally ignore HTTP-client disconnect after
  an audio job has been durably enqueued; the worker must finish its
  audit (or fail explicitly) rather than abandon it halfway.
- An already pending OS file read may complete before cancellation is
  observed. This is a bounded 256 KiB read, not an immediate filesystem
  I/O cancellation. Server disconnections do not prove legitimate
  authenticated-user intent.
- Concurrent clients may still saturate the shared **single Basic
  Auth principal**, and token buckets do not coordinate replicas.
  Production needs trusted individual identity, ingress quotas,
  monitoring, owner review and actual Railway volume benchmarks.
- Security implications of mutable same-inode writes, symlinked parent
  directories and absence of trusted receipt signatures remain open.
