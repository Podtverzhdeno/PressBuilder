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
| P15-C03 | Read-only cloud/local REST + director-only MCP + Studio preview implemented and cloud-tested | Persisted CAS draft/approval, real verified word alignment and music rights, independent review and production E2E remain open |
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

## P15-C03 staged integration (not approval)

- `server/rhythm-preview.mjs`: server-hashed local voice bytes; revision bound to word content, cue timing and format; cue IDs require `scene_id` when repeated; stale SHA/clock are rejected.
- `server/cloud.mjs` and `server/mcp.mjs`: Basic-auth REST and director-only MCP, disabled unless `PB_RHYTHM_PREVIEW=1`.
- `server/plugin.ts`: bounded local Vite development route. `src/editor/RhythmPreviewPanel.tsx` lets the editor paste word/pause JSON and seek to cut candidates without changing the deck.
- `tests/cloud-rhythm-preview.test.mjs` and `tests/cloud-rhythm-wire.test.mjs`: local voice verification, stale cue/source, repeated cue ID and role-denial integration.
- Cloud CI run `41340562286` on commit `35fd4c0c84264167a5cc8322376f8db04e868bda`: TypeScript build + 117 tests, 103 pass, 14 skipped, 0 failures. Not proof of any P15 audio analysis, deployment or artistic quality.
- Remaining: authenticated alignment, rights checks, durable CAS review/approval, scene-fenced proposal writes, actual six-scene P15 media/audio E2E and staging canary.

## P15-C03 persistent CAS draft stage (PR #30, not a production release)

**New sidecar:** `.rhythm/review.json` stores a bounded current proposal, revision, source SHA, reviewer note and prior-revision metadata. It does **not** write `deck.json`, edit scenes, render media, switch an approved MP4 or grant production approval.

- **Author:** authenticated director may `GET /api/decks/:id/rhythm/draft` then `POST /api/decks/:id/rhythm/draft` with `{manifest,expected_revision,note}`. Both cloud Basic-auth and local editor (Vite) support this flow. The editor shows current revision, source freshness, human review, and CAS conflicts. The proposal is newly computed from current input; supplied `cuts` or `approved` flags are never accepted.
- **Reviewer:** distinct MCP reviewer credential scoped to **every scene** in the project may call `get_rhythm_draft`, then `review_rhythm_draft` with `{id,expected_revision,plan_sha256,decision:'endorse'|'reject',note}`. Directors and scene-limited reviewers cannot call the review action.
- **Staleness:** before save and reviewer decision, re-read actual voice bytes and current cue text/timing. Reject wrong SHA, unknown scene/cue, word or pause outside its cue, wrong revision, tampered plan hash, replaced audio, or modified text.
- **Durability:** atomic file replacement and revision CAS under single-process writer-lock production assumption. File and metadata directory must not be symlinks. On re-submission, previous endorsement is invalidated. This is *not* a distributed multi-writer database.
- **Immutable release:** all responses explicitly carry `publication_allowed:false`. `endorsed_nonpublishable` is a technical opinion on the proposed structure, NOT an approval for sound licensing, accurate word alignment, creative quality, rendering or publishing.
- **Enable:** `PB_RHYTHM_PREVIEW=1` in authorized staging only. In the absence of this flag the analysis remains disabled; the addition does not authorize a Railway production change.

### Stage acceptance blockers

1. Independently verified word alignment from the **actual** audio signal with scored timing and an explicit source SHA (not only caller-supplied timestamps).
2. Music provenance and legal rights verified at a trusted asset catalog/server boundary.
3. A real six-scene voice/music render with measured frame timing, peak/loudness and a human cinematic A/B review.
4. Security review for malicious data, multi-instance deployment and replayed reviewer credentials; independent approval signoff.
5. Feature flag staging canary and a tested rollback, with owner approval before production.

Current GitHub CI can prove the API/contract behavior and lack of MP4 writes; it does **not** prove those five conditions.

## Audio/rights evidence extension (PR #32)

See [P15_AUDIO_EVIDENCE.md](P15_AUDIO_EVIDENCE.md) for the bounded FFmpeg PCM signal-energy gate, operator-owned licensed-music catalog, live setup, threat model, six-scene actual H.264/AAC synthetic signal fixture and limitations. CI run `41344739143` verified 135 cloud tests (119 pass, 16 skipped), Docker six-scene media test and render-smoke PASS. The synthetic signal is not natural speech, no model-level word alignment is asserted, and no release pointer is modified. `PB_RHYTHM_AUDIO_VERIFY` is opt-in only and its synchronous FFmpeg call must move to a resource-governed worker pool before production exposure. P15-C04/C05 remain IN_PROGRESS, not accepted.
