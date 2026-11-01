# P15 — Rhythm Engine: implemented offline slice and outstanding gates

**OpenSpec:** `openspec/changes/professional-montage-p15-p24/specs/rhythm-engine/spec.md`. **SDD:** `specs/002-professional-montage/tasks.md` checkpoints `P15-C01` and `P15-C02`.

## Current implementation

- `schemas/montage/rhythm-v1.schema.json` describes the intended bounded caller-supplied proposal contract.
- `server/rhythm-plan.mjs` exports pure `proposeRhythmCuts(manifest)`, no file or network access. It is NOT wired into REST/MCP, scheduled workers, studio or production. It cannot publish a video.
- `tests/cloud-rhythm.test.mjs` covers positive/negative behavior using owned/synthetic timestamps and markers. No real audio analysis is implemented.
- Default production behavior remains unchanged: P15 is not imported by `server/cloud.mjs`.

## Input contract

All times in signed-safe integer **microseconds**, not floating-point seconds. Target `frame_rate={num,den}` is one of 24/1, 25/1, 30/1, 60/1, 24000/1001 or 30000/1001. `duration_us` is bounded at 1 hour; arrays at 2500 words / 500 pauses / 5000 beats / 500 protected spans / 100 manual edits. The motion/audio PTS is not inferred from encoded MP4 until a later real-media gate.

Essential fields:

```json
{
  "schema_version": 1,
  "project_id": "demo-six-scenes",
  "voice_source_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "alignment_revision": "align-r3",
  "expected_alignment_revision": "align-r3",
  "timebase_revision": "clock-r1",
  "expected_timebase_revision": "clock-r1",
  "frame_rate": {"num": 30000, "den": 1001},
  "duration_us": 9000000,
  "words": [
    {"id": "w1", "cue_id": "c1", "start_us": 0, "end_us": 1000000}
  ],
  "pauses": [
    {"cue_id": "c1", "start_us": 1500000, "end_us": 2500000}
  ],
  "beats": [],
  "protected_spans": [],
  "manual_cut_frames": [],
  "policy": {"min_shot_frames": 12, "max_cuts_per_10s": 6, "max_cuts": 5}
}
```

If beats are provided, an additional music manifest with `source_sha256`, `licensed: true` and `license_ref` is required. **The flag is a caller assertion and is NOT independently verified**; it must be checked at the server boundary before rights-sensitive production actions.

## Output semantics and security boundary

- A successful result has `status: READY_FOR_REVIEW`, `approved:false`, `persisted:false`, sorted deterministic frame-based cuts, source SHA and alignment/timebase revisions.
- Every candidate identifies an output frame, `cue_id`, reason (pause/manual/licensed beat) and `confidence:source_marker_unverified`. Manual candidates have priority; automatic cuts never override a protected word, shot length or density limit.
- Stale alignment/timebase and missing or inconsistent word timing return `REVIEW` with zero cuts. Structurally invalid/untrusted arguments raise a typed `RhythmInputError` without side effects.
- Audio/user-provided markers and license metadata are not authenticated. In the current slice, the caller must hold trusted source revisions; planned C03 will add live actor+project+scene scopes, source-hash verification and reviewer signatures.
- Pure output never modifies editor-owned `deck.json`, approved P08 versions, P05 assembly state, `current.json` or any audio asset.
- Any change to source audio, word alignment, timebase or candidate policy requires re-evaluation. `plan_sha256` hashes the deterministic planned edit constraints, not an immutable signed reviewer approval.

## Required checkpoints, still pending independent signoff

| ID | Implemented now | Pending prior to ACCEPTED |
|---|---|---|
| P15-C01 | Schema, bounded typed input, rights and threat notes; tests exercise required fields | Independent architecture/security review of contract and migration |
| P15-C02 | Pure rational-frame algorithm and negative unit tests | Independent code review, fixture and performance evidence, approval of quality policies |
| P15-C03 | Not started | Live REST/MCP, distinct principals, scene fences, CAS, Studio preview |
| P15-C04 | Not started | Formal adversarial/security matrix and live isolation tests |
| P15-C05 | Not started | Actual six-scene Chromium + FFmpeg quality E2E with aligned voice and music |
| P15-C06 | Not started | SHA-matched Railway staging canary and tested rollback |

**No checkpoint is ACCEPTED by code submission or CI alone.** Use `docs/pro-montage-checkpoints.json` and `specs/002-professional-montage/tasks.md` to record independent evidence after completion.

## Run checks (after ordinary dependency installation in an approved dev environment)

```sh
node --test tests/cloud-rhythm.test.mjs
node --test tests/pro-montage-spec.test.mjs
npm run test:cloud
npm run build
npx --yes @fission-ai/openspec@1.14.3 validate professional-montage-p15-p24 --strict
```

Docker `render-smoke` checks P01–P14 regression; **until P15-C05 exists it does not demonstrate any P15 real-audio performance or artistic benefit**.
