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

## Zero-argument media doctor (M58-R04)

The operator no longer needs to guess a `project-id` or copy angle-bracket
placeholders into PowerShell. From the project root, run:

```powershell
npm run check:media
```

This finds the newest candidate P05 current release under the project's own
`out/releases` and **independently** checks its bytes and decodes H.264/AAC.
It never treats the discovery pointer as an approval. If there are no saved
releases at all, it runs a temporary **synthetic** six-scene FFmpeg/P05 smoke test
and labels the output `SYNTHETIC_SELF_TEST_PASSED` with
`real_release_found:false`. This is not a verified customer video.

```powershell
npm run check:media:list       # read-only candidate overview; no SHA claims
npm run check:media:self-test  # always run temporary six-scene E2E
```

Malformed pointers, unsafe filesystem entries or unusable releases fail closed;
the doctor never creates a fake release or silently marks missing quality
evidence as accepted. The older explicit API remains available to CI/operator
scripts that already know the exact `out-dir` and release ID.

## Real FFmpeg/FFprobe six-scene decode (M58-R03)

The **opt-in local** read-only `server/release-media-decode.mjs` verifies an
existing P05 active release by calling the byte-integrity check **both before
and after** independently probing and decoding all H.264 video frames and
AAC/PCM audio. It requires exactly six source scenes, verifies 720p/1080p-class
layout, output FPS, frame counts, stereo 48-kHz AAC and scene-timeline
duration against the immutable P05 manifest; no arbitrary shell commands
or media writes. It is deliberately **not** a signature authority or a
production release gate. The FFmpeg full decode catches syntactically invalid
video even when an attacker rewrites the SHA and stored QA verdict together.

```powershell
node tools/inspect-p05-media.mjs out <project-id>
node tools/inspect-p05-media.mjs out <project-id> <known-master-sha256>
```

Exit 0 means only media technical decoding succeeded, exit 2 means inspection
failed and exit 1 is a usage error. All returned reports have
`may_publish:false` and `may_deploy:false`.

**Reproducible local six-scene synthetic E2E:**

```bash
node --test tests/cloud-release-six-scene-decode.test.mjs
```

The test uses only generated color scenes and sine tones (no externally licensed
assets), creates **actual** H.264 and AAC clips via FFmpeg, assembles six scenes
through the existing P05 service, checks the immutable manifest/MP4 SHA,
counts frames with FFprobe, decodes video/audio with FFmpeg and tests the
operator CLI. The adversarial case rewrites both the master bytes **and** the
manifest SHA; byte-level checks pass but the independent media decode fails.
Temporary files are removed at the end of the test; it does not create a
user-facing approved video or assert real artistic quality. CI requires FFmpeg
and FFprobe to exist so that a skipped test cannot masquerade as media evidence.

This verifies the **synthetic six-scene technical slice only**. It does not
satisfy M58-C05's requirement for approved real project footage, licensed
sources, detailed PCM drift/loudness checks, blind human A/B, repeatable cold/warm
resource baselines, independent reviewer or staging rollback.

## Container timing and black-run diagnostic (M58-R05)

A new technical quality slice extends the *independent* FFprobe/FFmpeg decode:

- Compares muxed video and AAC stream start/end timestamps. A difference
  greater than **250 ms** blocks the diagnostic (`M58_DECODE_AV_CONTAINER_DRIFT`).
  Missing container timestamps are **not** interpreted as zero. This detects
  gross stream delay, **not spoken-word lip-sync** or perceptual voice alignment.
- Scans every decoded video frame with FFmpeg `blackdetect` and records bounded
  intervals of **at least 0.75 seconds** that are nearly black. Detected
  intervals set `manual_visual_review_required:true` and
  `media_quality_verdict:'REVIEW'`. The CLI exits **2** for these findings:
  dark creative scenes require a human's decision; the diagnostic does not
  delete, edit or automatically reject the source media.
- A clean decode reports `media_quality_verdict:'TECHNICAL_PASS'`, but
  **always** `may_publish:false` and `may_deploy:false`.
- Adversarial tests replace a valid master with a fully black but still
  decodable H.264/AAC file, update the manifest checksum, and verify that
  ordinary SHA checks can pass while the new detector requires review.

This does not infer sound quality, words-to-mouth synchronization,
accessibility, font readability, flashing, color grading, source licenses,
independent signoff or an accepted production SLO. These remain separately
required evidence categories.

## PCM clipping and long-silence diagnostics (M58-R06)

The independent P05 media preflight now additionally decodes the AAC track
into **bounded, in-memory** interleaved 48-kHz stereo signed 16-bit PCM. It
measures sample peak and whole-program RMS (both in dBFS), counts samples
within 68 raw units of full scale, and detects contiguous windows of digital
silence below -55 dBFS for **at least 2 seconds**. A clipping fraction of
0.1% or more, or a long digital-silence interval, sets
`manual_audio_review_required:true` and
`media_quality_verdict:'REVIEW'`. The operator CLI exits 2 for review.

The 100-ms PCM windows do not judge musicality, spoken-word alignment,
true/intersample peak, integrated LUFS, audio rights, deliberate artistic
silences or listener fatigue. Real synthetic negative tests retain video
content, replace the actual AAC audio with silence, rewrite the P05 SHA and
show that otherwise decodable files still require manual audio review.
There are no writes to any source/deck/release file by the inspector.
Reports keep `may_publish:false` and `may_deploy:false`.

```bash
node --test tests/cloud-release-pcm-qc.test.mjs tests/cloud-release-six-scene-decode.test.mjs
```

## Integrated LUFS and oversampled true peak (M58-R07)

The six-scene media inspector now runs **FFmpeg loudnorm** as a read-only
measurement pass. It extracts the **input** integrated loudness (EBU R128,
LUFS), input true peak (4× oversampled, dBTP) and loudness range (LU); it
never confuses normalized-output readings with source measurements and never
writes normalized media. A bounded parser rejects invalid/missing/multiple
summaries and unsafe measurements. Silence may report `-inf`; it becomes
`null` with `measurement_status:'UNMEASURABLE'`, never fabricated 0 LUFS.

A provisional diagnostic envelope (for review, **not** a universal mastering
standard) flags input loudness below **-38 LUFS**, above **-8 LUFS**, or
true peak above **-1 dBTP**. Flagged or unmeasurable audio requires manual
review, and the operator CLI returns exit 2. The `loudness_quality` result
is independent from the PCM sample-peak/RMS/long-silence check, so an
apparently clean PCM report cannot hide intersample true-peak overs.

```bash
node --test tests/cloud-release-loudness-qc.test.mjs tests/cloud-release-six-scene-decode.test.mjs
npm run check:media
```

The synthetic six-scene test independently encodes real AAC, assembles a
real MP4 and measures loudness and true peak with FFmpeg. All resulting
evidence is **diagnostic** with `may_publish:false` and
`may_deploy:false`, not a mastering guarantee, signed measurement,
commercial licensing proof, subjective listening review, or final signoff.

## Five-run measured FFmpeg microbenchmark (M58-R08)

A standalone optional `npm run measure:media` (or
`node tools/measure-m58-performance.mjs --samples=5`) measures at least
five independent, **real** FFmpeg processes performing a bounded synthetic
320×180 H.264 encode of 48 frames to the null muxer. The report includes
each observed process wall-time and computes p50, p95 (nearest-rank),
mean and min/max from actual observations, with a SHA-256 of sample values.

The source is **FFmpeg lavfi synthetic** and no video file is written. It is
**not** a complete P05/Chrome/worker benchmark or an accepted production
render SLO. If FFmpeg reports a trustworthy child max RSS, the sample is
recorded; if any trial has missing RSS, `max_child_rss_mib:null`.
`cloud_cost_usd`, `production_p95_ms` and `baseline_ratio` are always
`null` because this experiment has no cloud invoice, baseline or production
measurement. Never substitute a fabricated zero or extrapolate synthetic
p95 into a canary threshold. All reports remain review-only.

```powershell
npm run measure:media
node --test tests/cloud-release-performance-samples.test.mjs
```

This is the start of instrumentation toward M58-C05, not its acceptance.

## Five forced six-scene P05 end-to-end assembly trials (M58-R09)

Unlike the earlier `lavfi -> null` FFmpeg microbenchmark, this opt-in
benchmark exercises **the actual P05 assembly service**, with six separately
encoded source MP4s, mixed 24/30-fps inputs, alternating source AAC and
missing audio, real FPS normalization, six-scene concat, H.264/AAC output,
independent MP4 QA, immutable release directories and pointer writes.

```powershell
npm run measure:p05
node tools/measure-p05-assembly.mjs --samples=10
node --test tests/cloud-release-p05-benchmark.test.mjs
```

The script creates a unique temporary workspace and generates inputs
**before** the timed trials. Each of 5–10 trials calls
`assembly.start(projectId, sixIds, {force:true})`, explicitly disables
incremental hard-cut reuse and verifies it generated a different immutable
release, fresh encode, six scenes and `PASS` output QA. Existing user
project files and release directories are **not accessed**. Temporary
fixture videos, manifests and releases are removed afterwards.

Measurements include p50/p95 of the actual P05 request-to-success wall time,
p50/p95 of `timings_ms.encode`, individual encode+QA durations, actual
FFmpeg child CPU and `maxrss` where reported, and an integrity hash of
raw timing samples. FFmpeg child RSS is deliberately not conflated with
overall Node/browser/worker peak memory. Missing measurements remain null,
never zero. The measured wall time excludes original six-scene rendering
and fixture generation; fixture-generation timing is reported separately.

A five-trial Windows run on this synthetic 720p/24-fps, 4.5-second master
recorded p50 wall **685.877 ms**, p95 wall **719.317 ms**, p95 encoding
**393 ms**, and max FFmpeg child RSS **377.906 MiB**. These are
*machine-specific observations*, not production baselines or contractual
targets. Performance depends strongly on source duration, frame content,
codec, hardware, simultaneous load and storage.

This is still not production M58-C05: no representative 3–7-second authored
scene renders, Browser/Chromium workload, independent real media, actual
cloud cost, measured on-production host p95/RSS, baseline comparison,
human review, rollback or release signoff. All reports carry
`may_publish:false`, `may_deploy:false`.

## Animated 3–7-second scene profile comparison (M58-R10)

The `measure:p05:compare` command measures **P05 itself** on six actual,
newly encoded, animated `testsrc2` clips, using 3-second scenes by default
and comparing hard cuts with three declared 300-ms crossfade transitions.
Each profile forces 5 separate P05 full-filter encodes, validates an
immutable release and independent MP4 QA for every trial, collects P05
request→completed time, encode/QA time and real FFmpeg child RSS.

```powershell
npm run measure:p05:compare
node tools/compare-p05-profiles.mjs --samples=5 --seconds=7 --height=1080
node --test tests/cloud-release-p05-profiles.test.mjs
```

The duration and resolution flags are **bounded**: 3–7 seconds per scene;
720p/1080p; 5–10 samples per profile. Each profile uses the same
source-generation recipe, and the comparator additionally checks the actual
SHA-256 fingerprints for all six MP4s: a mismatch returns
`INCOMPARABLE_SOURCE_HASHES` and **no p95 ratio**. The observed ratio is
descriptive only: profiles currently run sequentially and can be distorted
by thermal and cache effects, background load, or system scheduling.

A first five-trial-per-profile 720p run using six 3-second animated inputs
measured hard-cut p50/p95 **3,848.044/4,338.321 ms** and crossfade p50/p95
**3,851.777/4,902.414 ms**, a descriptive **1.13×** p95 ratio. Maximum
reported FFmpeg child RSS was **383.313 MiB** hard-cut and **446.652 MiB**
crossfade. Both profiles produced **5/5** QA-valid releases. These are
Windows-machine sample measurements, not agreed regression thresholds
or production performance.

Input scenes are machine-generated animation, **not authored brand/story
media**. This does not measure original P02 scene creation, Chromium/3D,
subtitle compositing, approved footage, external licenses, actual cloud cost,
non-synthetic baseline, or end-user aesthetic quality. Both sides remain
`may_publish:false` and `may_deploy:false`.

## Controlled incremental P13 single-scene update (M58-R11)

This opt-in experiment measures an **existing** P13 scene-content-addressed
segment cache, not a new production feature flag. Six separate synthetic
3-second, mixed-fps H.264/AAC scenes are created in an isolated temporary
workspace. The first P13 assembly populates the cache with six segments.

Each of five measured cycles changes **only scene s03**, verifies the five
other source SHA-256 values remain unchanged, and runs P13 normally. It
requires exactly `segments_reused:5`, `segments_encoded:1` and a fresh
immutable QA-positive release. It then forces the ordinary full-filter P05
on the **exact same six source hashes**, independently validates the MP4
and records request-to-completion latency and FFmpeg child RSS.

A separate FFmpeg decoded-video **SSIM** comparison measures the technical
similarity between the incremental and full-filter outputs, outside the
timed assembly interval. An SSIM below 0.95 is flagged for manual review,
never auto-approved; SSIM is not human perceptual equivalence or legal
media provenance.

```powershell
npm run measure:p13
node tools/compare-p13-single-edit.mjs --seconds=7
node --test tests/cloud-release-p13-single-edit.test.mjs
```

A first five-cycle Windows run *before adding the independent SSIM pass*
recorded full P05 wall p50/p95 **3162.667 / 3302.815 ms** versus incremental
P13 **2627.371 / 3231.240 ms**, with FFmpeg child maximum RSS
**383.676 MiB** versus **285.172 MiB**, respectively. The p95 ratio was
**0.978** (about **2.2% faster**) in this run, not a general guarantee.
P13 output can be larger than the corresponding full-filter output. The
benchmark always reports independent output SHA/bytes, not just speed.

The cached branch and forced branch run in a fixed order, which can
introduce thermal/cache confounding. This is a reproducible technical
fixture, **not** production footage, independent artistic evaluation,
P02 rendering, signed provenance, cloud cost, production load, or a
qualified release SLO. All reports keep `may_publish:false` and
`may_deploy:false`; P13's existing opt-in feature flag stays unchanged.

## Hard-cut boundary frame QA (M58-R12)

The existing P13-versus-full P05 comparison now inspects **every decoded
video frame** with FFmpeg `ssim=stats_file=-`, and computes an independent
minimum score for the **five hard-cut windows** (two frames on either
side of each nominal cut). This prevents high average/global SSIM from
hiding an isolated transition defect. The analyzer requires the exact
expected number of frames, complete ordered one-indexed FFmpeg records
and bounded numeric scores: truncation, duplicates, NaN, wrong order
and untrusted output fail closed instead of being treated as clean video.

One suspicious cut score below **0.90** triggers
`cut_seam_review_required:true` and
`manual_visual_comparison_required:true`, independently from the global
SSIM review threshold of 0.95. This is a **diagnostic review flag**;
`may_publish:false` and `may_deploy:false` remain unchanged.
The test injects **one real black frame** at the first transition into an
otherwise correct 18-second MP4. Mean SSIM stays high but the relevant cut
window flags the frame. Technical SSIM is not motion continuity, a perceptual
quality guarantee, editorial signoff or audio/lip-sync review.

```powershell
node --test tests/cloud-release-seam-ssim.test.mjs
npm run measure:p13
```

The full six-scene P13 comparison performs frame-localized SSIM after each
pair of P05 renders; this diagnostic processing time is excluded from the
original encode-and-QA timing measurements. The dedicated M58 CI workflow
requires both the one-frame corruption attack and all P13 edit trials.

## Comparative 48-kHz PCM audio cut diagnostics (M58-R13)

The existing P13 vs forced P05 six-scene benchmark now decodes the
**immutable audio tracks** of both completed MP4 releases to bounded,
in-memory **48 kHz stereo signed 16-bit PCM**. For each of the five
hard-cut boundaries, it reports the largest adjacent-sample jump within
±20 ms and ten consecutive 10-ms RMS windows within ±50 ms.
Only **excessive differences relative to the same-source full P05**
are flagged: a jump more than **0.35 normalized units above** the full
P05 reference and above **0.55 absolute** is a click risk. A possible
dropout requires at least **two 10-ms windows** that were audible in
the P05 reference (RMS ≥0.07) but nearly silent in P13 (RMS <0.004).

Both decoders must return a complete track matching the expected
six-scene timeline within 120 ms, and the two decoded durations must
agree within **80 ms**. Missing, malformed or truncated PCM fails
closed. This checks **mux/decode timeline consistency**, not spoken-word
or lip synchronization. Deliberate creative silences and hard cuts
can be natural; the differential detector avoids marking these as
errors merely because the waveform changes at a cut.

```powershell
node --test tests/cloud-release-audio-seam-qc.test.mjs
npm run measure:p13
```

Adversarial tests inject a single clipped sample, a 40-ms synthetic
PCM dropout, and a 50-ms dropout into a **real AAC-encoded MP4**.
The last test must identify the correct first cut, with the untouched
other cuts remaining clean. The five-cycle P13 E2E checks all five
cut measurements per trial and reports
`manual_audio_review_required` independently of the visual SSIM gate.

The inspection is read-only on finished release masters and runs
**outside the timed P13/P05 encode interval**. It does not change the
existing incremental feature flag, mutate a production release, apply
mastering, validate source licenses, establish perceptual sound quality
or constitute publishing approval. Every report remains
`may_publish:false` and `may_deploy:false`.

## Next acceptance gates (not implemented)

1. M58-C01: independent contract approval and source trust model (current code is a proposal, not an accepted schema).
2. M58-C02: production server verifier against immutable P08/P05 SHA, actual CI receipts, licensed media provenance, worker identity, measured SLO runs.
3. M58-C03/04: authenticated director-only read-only REST/MCP endpoint and Studio, malicious/stale actor tests, cancellation/restart recovery.
4. M58-C05: real six-scene MP4/PCM baseline, fault injection, FFmpeg/Chromium/FFprobe proof hashes and p95/RSS/cost measurements.
5. M58-C06–C08: independent review, staging canary, explicit human release signoff, exact-image rollback to previous approved SHA.

Do not turn the M58 task checkbox to accepted based solely on a green CI run.
