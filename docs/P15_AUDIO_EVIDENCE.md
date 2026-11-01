# P15 — Auditory Pause Evidence and Music Rights Gate

**Status:** experimental, default-disabled, non-publishable. **Parent PRs:** #28 (engine), #29 (Studio preview), #30 (revisioned draft), #32 (this addition).

## What is actually verified

When `PB_RHYTHM_PREVIEW=1`, the server hashes the current deck's local voice file and ties the timeline to the exact cue text, timing and project FPS.

When `PB_RHYTHM_AUDIO_VERIFY=1` is also enabled, the *actual* audio file bytes are read with no-follow descriptor checks and SHA-256 comparison. FFmpeg receives the bounded bytes over `pipe:0`, decodes 8 kHz mono 16-bit PCM, and calculates 20 ms RMS windows for each claimed pause. The source cannot be an arbitrary user-supplied path or URL. PCM output, source size and CPU time have caps.

A pause is provisionally supported only if at least 80% of windows are below ~-34 dBFS and aggregate RMS is below the same threshold. This is a deliberately conservative **signal energy heuristic**, not word-level forced alignment, verified speech recognition, audio restoration or an artistic score. If a declared pause contains audible material, the service returns `REVIEW` and **zero proposed cuts**. Missing decoder, mismatched source SHA, unsupported duration or unexpected sample count is also fail-closed.

Default `PB_RHYTHM_AUDIO_VERIFY` is **off**, so older synthetic-voice unit tests and deployments retain existing preview behavior. When off, `pause_audio_verified=false`: no true audio verification claim is made.

### Operational ceilings

- Accepted input names: local `voice.wav`, `voice.mp3`, `voice.m4a`, `voice.aac`, `voice.ogg`, `voice.opus`, `voice.flac`, `voice.webm`; no external URLs.
- Maximum read for PCM evidence: **16 MiB**, maximum decoded output: **2 MiB**, supported duration: **0.1–120 seconds**, at most **100** checked spans per request, each **0.1–5 seconds**.
- FFmpeg process timeout: 8 seconds. Decoder errors, insufficient source length, and duration mismatch are not treated as successful silence.
- Algorithmic thresholds require calibration on real authorized narration and cross-language voices. Room tone/breaths can produce REVIEW; VAD is not forced alignment.

## Music rights: operator-managed attestation, not user assertion

Music beat candidates are no longer eligible simply because a user supplied `licensed:true`. The server must have an externally managed rights catalog and actual media bytes.

**Configuration (not secrets):**

```text
PB_RHYTHM_PREVIEW=1
PB_RHYTHM_AUDIO_VERIFY=1
PB_RHYTHM_RIGHTS_CATALOG=/operator/rights/music.json
PB_RHYTHM_MUSIC_ROOT=/operator/rights/music-assets
```

These two rights paths must be **outside the deck/project storage directory**. Only the operator may write them; project editors and scene workers must not receive file-write permissions to either path. The catalog and each media file are checked for symlinks/hardlinks, size limits and exact SHA-256.

**Example admin-owned catalog, not a user-upload manifest:**

```json
{
  "schema_version": 1,
  "assets": [{
    "asset_id": "intro-beat",
    "file_name": "intro-beat.wav",
    "source_sha256": "<real SHA-256, lowercase>",
    "license_ref": "owned/intro-beat-v1",
    "status": "approved",
    "rights_attested_by": "operator-1",
    "allowed_projects": ["approved-video"],
    "expires_at": "2030-01-01T00:00:00Z"
  }]
}
```

The client `music.source_sha256` and `music.license_ref` must exactly match **one** current catalog record; the actual operator-owned file bytes must match the same SHA. Missing/expired/ambiguous rights cause `REVIEW` and zero candidates. Verification confirms a current *recorded attestation*; it cannot independently establish legal ownership or jurisdiction-specific licensing obligations.

## Tests and truthful limits

- `tests/cloud-rhythm-audio-evidence.test.mjs`: six 1-second WAV sections with actual PCM decoding; speech-*activity* is represented by generated tones followed by real silence. The test includes false pauses, SHA tampering, missing FFmpeg, unknown/expired music rights and file mismatches.
- `tests/cloud-rhythm-six-scene-media.test.mjs`: creates six **real H.264 MP4** scene clips, muxes a six-second tone/silence WAV into AAC, checks 144 decoded frames at 24 FPS and duration via ffprobe. The preview must not modify the MP4, source WAV or release pointer.
- Tests requiring FFmpeg are skipped on CI hosts without it; the Docker image has FFmpeg and must execute them. Passing a Docker smoke does not establish production voice-alignment quality.
- **Not done:** a true word-level forced aligner with quality/confidence/word error metrics; validated lyrics/voice sample licensing in live projects; human blind A/B acceptance of actual cinematic pacing; production staging canary, reviewer/owner deployment approval.

## OpenSpec/SDD state

`P15-C03` is IN_PROGRESS. `P15-C04` and `P15-C05` have specific technical fixture coverage **but remain unaccepted** pending independent reviewer, human-speech fixtures and quality calibration. Do not check stage boxes based solely on green synthetic-media CI.

The presence of this document must not change Railway deployment. No endpoint can publish, render or approve new MP4 versions as a side effect of the evidence analysis.

## Async worker admission and safe shutdown (PR #33)

The network-accessible cloud REST, Studio Vite API and director MCP rhythm endpoints dispatch the optional PCM verification through `rhythmAudioPool` and `previewAsync`. A worker thread performs the existing bounded `spawnSync(ffmpeg)` inspection **off the main HTTP event loop**. The synchronous inspector remains for isolated offline compatibility tests only, never as the cloud route.

**Default guardrails:** maximum 1 running worker, 2 queued requests, 10-second worker timeout, maximum 64-MiB V8 old-generation allowance per worker, deterministic overload rejection, abort support and termination on shutdown. The underlying FFmpeg decode still has its tighter 8-second and 2-MiB PCM buffer caps. Every job rechecks both audio SHA-256 and the cue clock *after* leaving the queue. Changes while waiting result in REVIEW, zero cuts and no authority to publish. Exact track offsets other than 0 currently fail closed with AUDIO_OFFSET_UNSUPPORTED: timeline-relative and source-relative coordinates are not yet safely equivalent.

**Verification:** `tests/cloud-rhythm-audio-pool.test.mjs` tests backpressure, cancellation, hard timeout, shutdown, actual worker-thread WAV decoding, mutated voice while waiting, and a shifted narration track. `tests/cloud-rhythm-worker-wire.test.mjs` runs an HTTP/MCP server with `PB_RHYTHM_AUDIO_VERIFY=1`, a real WAV, a concurrent `/health` request, real REST preview and CAS draft write. The test must pass in the Docker FFmpeg CI image; on generic runners without FFmpeg it may be skipped with an explicit count.

**Release policy:** changing `PB_RHYTHM_AUDIO_VERIFY` to 1 remains a separately reviewed operations action even after the asynchronous worker code deploys. Worker isolation does not prove correct word-level alignment, music legal ownership, editorial pacing or safety under production traffic. Staging CPU/p95, cancellation, peak memory and canary rollback gates remain mandatory. Turn the flag back to 0 as an immediate safe rollback without altering published MP4 or the `/data` volume.
