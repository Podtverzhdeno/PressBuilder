# M58-R01 · Release evidence preflight (read-only)

**Status:** Partial implementation / review only. This is not a production release gate.

Related requirement: [M58 — unified quality and performance release SLO](../openspec/changes/video-quality-top60/specs/quality/spec.md).
The first slice is `server/release-evidence-preflight.mjs`, exported as `inspectReleaseEvidence(manifest, {verifyReceipt})`.

## Outcome and trust boundary

An operator, automation or future Director UI can see which mandatory evidence categories are missing, failed, stale or unverified **before** considering a video release. The function never touches `deck.json`, approvals, MP4, P05 release pointers or Railway deployments. All outputs include `may_publish:false` and `may_deploy:false`.

Inputs and receipts are **untrusted data**. A receipt that says `"verdict":"PASS"` is not proof. A server-owned `verifyReceipt(receipt, build)` callback must independently verify actual evidence against trusted sources. Without this callback, every apparently green receipt remains `UNVERIFIED`. A callback returning `true` is a *trust decision by the caller*; do not wire it directly to client JSON or allow clients to supply a truthy verifier. The current release preflight does **not** implement a secure attestation verifier, cryptographic signature chain or approval API.

## Contract (schema_version = 1)

A bounded manifest has the exact fields:

- `project_id` (slug), `submitted_by` (actor ID).
- `build.commit_sha` — 40-char Git SHA; `build.image_sha256`, `build.master_sha256` — 64-char digests.
- `metrics.baseline`, `metrics.candidate` — independently measured `sample_count` (5–100000), `p95_render_ms`, `peak_rss_mib`, `cost_usd`. Zero or missing baseline is rejected, not substituted with a fabricated rate.
- `metrics.limits.max_p95_ratio`, `max_rss_ratio`, `max_cost_ratio` — explicit policy thresholds between 1.0 and 1.5. These need agreement based on a real measured baseline; the module does not set an SLO for you.
- `receipts`: at most 32, one per category, each with a unique ID, exact build SHAs, evidence SHA, actor and `PASS/FAIL` verdict. The performance receipt additionally binds the SHA-256 of `JSON.stringify(metrics)`; other categories must not send this field.

Mandatory categories: `source_provenance`, `media_licenses`, `real_media_e2e`, `worker_execution`, `technical_qa`, `audio_sync`, `font_flash`, `accessibility`, `performance`, `ci_tests`, `independent_review` and `rollback`.

## Negative and positive decisions

- **MISSING:** no receipt for a required category.
- **STALE:** proof pins a different Git commit, Docker image, master SHA or performance metrics digest.
- **SELF_REVIEW:** the independent review actor matches the submitting actor.
- **FAILED:** receipt explicitly failed.
- **UNVERIFIED:** no trusted verifier, verifier rejected or threw.
- **VERIFIED:** a trusted server-side verifier explicitly accepted the receipt and no other gate rejected it.

Any category not `VERIFIED`, or any p95/RSS/cost ratio exceeding policy, leads to `verdict:'BLOCKED'`. Only a verified complete set within the declared limits produces `EVIDENCE_COMPLETE_FOR_REVIEW`. **This is never authorization to publish**, even with all categories verified.

Tests run offline, using intentionally fabricated fixture hashes and an injected test verifier. They validate algorithms and negative cases; **they do not constitute real MP4, sound, license, benchmarking or reviewer evidence**.

## Verification

```bash
node --test tests/cloud-release-evidence-preflight.test.mjs
npm run typecheck
npm run build
```

An optional read-only CLI reports diagnostic blockers without any authentication callback:

```bash
node tools/release-preflight.mjs /path/to/manifest.json
```

Exit code: `2` = valid manifest but blocked evidence, `1` = malformed or unsafe input,
`0` = help only. The CLI **cannot produce a release authorization**, even with
green self-reported receipts. It refuses non-regular files, hardlinks, symlinks and
files larger than 128 KiB; it does not expose raw input in error messages.

The repo's `test:cloud` script also discovers the three M58 test files.
The first M58 CI run passed before the CLI was added; subsequent CI runs
must pass both tests to count as the updated branch's verification.

## P05 current release master integrity (M58-R02)

The read-only inspector `server/release-media-integrity.mjs` validates P05's current
release pointer, bounded manifest metadata and exact `final.mp4` bytes. It
checks project/release IDs, hashes the file independently of the manifest,
optionally matches an expected M58 master SHA, rejects tampering, missing
approvals, symlinks/hardlinks and changed pointers, and never writes files.
It reports how many source scenes **claim** a P08 approved version; it does
not re-verify those approvals. The P05 `qa.verdict` displayed is a stored
claim, **not** independently decoded frame/audio evidence.

To inspect a local release, once the local `out/releases/<project-id>/current.json`
and immutable P05 `final.mp4` actually exist:

```powershell
node tools/inspect-p05-release.mjs out <project-id>
# To compare against an independently known M58 master digest:
node tools/inspect-p05-release.mjs out <project-id> <expected-master-sha256>
```

Exit code `0` means **only P05 file byte integrity confirmed**, not the
full video release gate; code `2` means failed inspection; code `1`
is an invalid invocation. This command cannot create a missing release or
generate a trusted M58 receipt. A standalone inspector never makes a
client-supplied receipt trustworthy. Remaining requirements include
source/rights approvals, actual MP4/PCM decode, render worker identity,
CI/build provenance, reviewer signoff and rollback.

## Next acceptance gates (not implemented)

1. M58-C01: independent contract approval and source trust model (current code is a proposal, not an accepted schema).
2. M58-C02: production server verifier against immutable P08/P05 SHA, actual CI receipts, licensed media provenance, worker identity, measured SLO runs.
3. M58-C03/04: authenticated director-only read-only REST/MCP endpoint and Studio, malicious/stale actor tests, cancellation/restart recovery.
4. M58-C05: real six-scene MP4/PCM baseline, fault injection, FFmpeg/Chromium/FFprobe proof hashes and p95/RSS/cost measurements.
5. M58-C06–C08: independent review, staging canary, explicit human release signoff, exact-image rollback to previous approved SHA.

Do not turn the M58 task checkbox to accepted based solely on a green CI run.
