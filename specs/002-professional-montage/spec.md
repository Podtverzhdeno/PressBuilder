# SDD 002 — Professional Montage P15–P24

**Status:** PLANNED / NOT IMPLEMENTED. **Source:** `openspec/changes/professional-montage-p15-p24/`. **Date:** 2026-11-01. **Owner:** PressBuilder product + architect reviewer.

## Problem

Current PressBuilder P01–P14 implements a technically credible narrated animated video pipeline but is not yet an end-to-end human-quality-directed NLE. Across six independently produced scenes, pacing, sound, cuts, visuals and editability are not guaranteed to form a coherent professional film. This SDD describes expected future behavior only; it does **not** record completed milestones.

## User stories and acceptance boundaries

### US-P15 — Rhythm Engine

**As a** creator/editor working with six separate scene agents, **I want to** смонтировать ролик в ритме речи, пауз и музыки, не разрывая смысл и защищённые фрагменты, **so that** final narrative, readability and sound meet an explicitly reviewed target.

**Positive acceptance:** The capability produces a versioned and reproducible output tied to approved source hashes, exact frame/cue references and an inspector-visible preview. A human can review, override and undo its decisions.

**Negative acceptance:** Invalid/missing evidence, stale source/lease, unsupported format, resource excess or unresolved rights produce a bounded error or `REVIEW`; no partial publish, no mutation of another scene or last approved release.

**Trace:** `openspec/changes/professional-montage-p15-p24/specs/rhythm-engine/spec.md`; checkpoints `P15-C01` through `P15-C06`.

### US-P16 — Creative Director 2.0

**As a** creator/editor working with six separate scene agents, **I want to** предложить драматургию и варианты подачи, сохранив согласованный текст и контроль человека, **so that** final narrative, readability and sound meet an explicitly reviewed target.

**Positive acceptance:** The capability produces a versioned and reproducible output tied to approved source hashes, exact frame/cue references and an inspector-visible preview. A human can review, override and undo its decisions.

**Negative acceptance:** Invalid/missing evidence, stale source/lease, unsupported format, resource excess or unresolved rights produce a bounded error or `REVIEW`; no partial publish, no mutation of another scene or last approved release.

**Trace:** `openspec/changes/professional-montage-p15-p24/specs/creative-director/spec.md`; checkpoints `P16-C01` through `P16-C06`.

### US-P17 — Cinematic Continuity

**As a** creator/editor working with six separate scene agents, **I want to** стыковать сцены по движению, свету и звуку с контролируемыми j/l-cut, **so that** final narrative, readability and sound meet an explicitly reviewed target.

**Positive acceptance:** The capability produces a versioned and reproducible output tied to approved source hashes, exact frame/cue references and an inspector-visible preview. A human can review, override and undo its decisions.

**Negative acceptance:** Invalid/missing evidence, stale source/lease, unsupported format, resource excess or unresolved rights produce a bounded error or `REVIEW`; no partial publish, no mutation of another scene or last approved release.

**Trace:** `openspec/changes/professional-montage-p15-p24/specs/cinematic-continuity/spec.md`; checkpoints `P17-C01` through `P17-C06`.

### US-P18 — Professional Motion

**As a** creator/editor working with six separate scene agents, **I want to** создать кинематографичное покадровое движение без неконтролируемой нагрузки и вреда читаемости, **so that** final narrative, readability and sound meet an explicitly reviewed target.

**Positive acceptance:** The capability produces a versioned and reproducible output tied to approved source hashes, exact frame/cue references and an inspector-visible preview. A human can review, override and undo its decisions.

**Negative acceptance:** Invalid/missing evidence, stale source/lease, unsupported format, resource excess or unresolved rights produce a bounded error or `REVIEW`; no partial publish, no mutation of another scene or last approved release.

**Trace:** `openspec/changes/professional-montage-p15-p24/specs/professional-motion/spec.md`; checkpoints `P18-C01` through `P18-C06`.

### US-P19 — Sound Design Studio

**As a** creator/editor working with six separate scene agents, **I want to** свести речь, музыку и эффекты на отдельных дорожках с проверяемой громкостью и синхронностью, **so that** final narrative, readability and sound meet an explicitly reviewed target.

**Positive acceptance:** The capability produces a versioned and reproducible output tied to approved source hashes, exact frame/cue references and an inspector-visible preview. A human can review, override and undo its decisions.

**Negative acceptance:** Invalid/missing evidence, stale source/lease, unsupported format, resource excess or unresolved rights produce a bounded error or `REVIEW`; no partial publish, no mutation of another scene or last approved release.

**Trace:** `openspec/changes/professional-montage-p15-p24/specs/sound-design/spec.md`; checkpoints `P19-C01` through `P19-C06`.

### US-P20 — Kinetic Typography Pro

**As a** creator/editor working with six separate scene agents, **I want to** анимировать типографику по словам с измерением реальных глифов и безопасной композицией, **so that** final narrative, readability and sound meet an explicitly reviewed target.

**Positive acceptance:** The capability produces a versioned and reproducible output tied to approved source hashes, exact frame/cue references and an inspector-visible preview. A human can review, override and undo its decisions.

**Negative acceptance:** Invalid/missing evidence, stale source/lease, unsupported format, resource excess or unresolved rights produce a bounded error or `REVIEW`; no partial publish, no mutation of another scene or last approved release.

**Trace:** `openspec/changes/professional-montage-p15-p24/specs/kinetic-typography/spec.md`; checkpoints `P20-C01` through `P20-C06`.

### US-P21 — Color & Lighting Continuity

**As a** creator/editor working with six separate scene agents, **I want to** обеспечить визуальную связность соседних сцен без принудительного художественного выравнивания, **so that** final narrative, readability and sound meet an explicitly reviewed target.

**Positive acceptance:** The capability produces a versioned and reproducible output tied to approved source hashes, exact frame/cue references and an inspector-visible preview. A human can review, override and undo its decisions.

**Negative acceptance:** Invalid/missing evidence, stale source/lease, unsupported format, resource excess or unresolved rights produce a bounded error or `REVIEW`; no partial publish, no mutation of another scene or last approved release.

**Trace:** `openspec/changes/professional-montage-p15-p24/specs/color-lighting/spec.md`; checkpoints `P21-C01` through `P21-C06`.

### US-P22 — Smart B-Roll Selector

**As a** creator/editor working with six separate scene agents, **I want to** подбирать подходящие по смыслу перебивки только из материалов с разрешёнными правами, **so that** final narrative, readability and sound meet an explicitly reviewed target.

**Positive acceptance:** The capability produces a versioned and reproducible output tied to approved source hashes, exact frame/cue references and an inspector-visible preview. A human can review, override and undo its decisions.

**Negative acceptance:** Invalid/missing evidence, stale source/lease, unsupported format, resource excess or unresolved rights produce a bounded error or `REVIEW`; no partial publish, no mutation of another scene or last approved release.

**Trace:** `openspec/changes/professional-montage-p15-p24/specs/smart-b-roll/spec.md`; checkpoints `P22-C01` through `P22-C06`.

### US-P23 — Creative Montage QA

**As a** creator/editor working with six separate scene agents, **I want to** давать объективные технические ошибки и объяснимые художественные рекомендации с таймкодами, **so that** final narrative, readability and sound meet an explicitly reviewed target.

**Positive acceptance:** The capability produces a versioned and reproducible output tied to approved source hashes, exact frame/cue references and an inspector-visible preview. A human can review, override and undo its decisions.

**Negative acceptance:** Invalid/missing evidence, stale source/lease, unsupported format, resource excess or unresolved rights produce a bounded error or `REVIEW`; no partial publish, no mutation of another scene or last approved release.

**Trace:** `openspec/changes/professional-montage-p15-p24/specs/creative-montage-qa/spec.md`; checkpoints `P23-C01` through `P23-C06`.

### US-P24 — Editable Professional Timeline

**As a** creator/editor working with six separate scene agents, **I want to** редактировать сцены и дорожки вручную с воспроизводимым экспортом и обратимыми правками, **so that** final narrative, readability and sound meet an explicitly reviewed target.

**Positive acceptance:** The capability produces a versioned and reproducible output tied to approved source hashes, exact frame/cue references and an inspector-visible preview. A human can review, override and undo its decisions.

**Negative acceptance:** Invalid/missing evidence, stale source/lease, unsupported format, resource excess or unresolved rights produce a bounded error or `REVIEW`; no partial publish, no mutation of another scene or last approved release.

**Trace:** `openspec/changes/professional-montage-p15-p24/specs/professional-timeline/spec.md`; checkpoints `P24-C01` through `P24-C06`.

## Functional requirement crosswalk

| FR | Feature | Canonical OpenSpec requirement | Acceptance owner |
|---|---|---|---|
| FR-101 | P15 | `rhythm-engine / Aligned timebase` | Independent QA + reviewer |
| FR-102 | P15 | `rhythm-engine / Pacing constraints` | Independent QA + reviewer |
| FR-103 | P15 | `rhythm-engine / Determinism and review` | Independent QA + reviewer |
| FR-104 | P16 | `creative-director / Narrative alternatives` | Independent QA + reviewer |
| FR-105 | P16 | `creative-director / Human story approval` | Independent QA + reviewer |
| FR-106 | P16 | `creative-director / Constrained replan` | Independent QA + reviewer |
| FR-107 | P17 | `cinematic-continuity / Entry and exit scene state` | Independent QA + reviewer |
| FR-108 | P17 | `cinematic-continuity / Frame-safe cuts` | Independent QA + reviewer |
| FR-109 | P17 | `cinematic-continuity / Reviewer boundary compare` | Independent QA + reviewer |
| FR-110 | P18 | `professional-motion / Bounded animated properties` | Independent QA + reviewer |
| FR-111 | P18 | `professional-motion / Motion blur and speed ramp` | Independent QA + reviewer |
| FR-112 | P18 | `professional-motion / Performance and accessibility` | Independent QA + reviewer |
| FR-113 | P19 | `sound-design / Versioned audio bus model` | Independent QA + reviewer |
| FR-114 | P19 | `sound-design / Ducking and loudness` | Independent QA + reviewer |
| FR-115 | P19 | `sound-design / Audio/video sync and recovery` | Independent QA + reviewer |
| FR-116 | P20 | `kinetic-typography / Word-level typography cues` | Independent QA + reviewer |
| FR-117 | P20 | `kinetic-typography / Real glyph geometry` | Independent QA + reviewer |
| FR-118 | P20 | `kinetic-typography / Readable and accessible motion` | Independent QA + reviewer |
| FR-119 | P21 | `color-lighting / Color-managed source transform` | Independent QA + reviewer |
| FR-120 | P21 | `color-lighting / Cross-scene exposure match` | Independent QA + reviewer |
| FR-121 | P21 | `color-lighting / Safety and rollout` | Independent QA + reviewer |
| FR-122 | P22 | `smart-b-roll / Rights-aware catalog only` | Independent QA + reviewer |
| FR-123 | P22 | `smart-b-roll / Semantic and timing fit` | Independent QA + reviewer |
| FR-124 | P22 | `smart-b-roll / Attribution, fingerprint and change control` | Independent QA + reviewer |
| FR-125 | P23 | `creative-montage-qa / Separated severity semantics` | Independent QA + reviewer |
| FR-126 | P23 | `creative-montage-qa / Timecoded multi-modal evidence` | Independent QA + reviewer |
| FR-127 | P23 | `creative-montage-qa / Calibration and reviewer signoff` | Independent QA + reviewer |
| FR-128 | P24 | `professional-timeline / Revisioned canonical edit graph` | Independent QA + reviewer |
| FR-129 | P24 | `professional-timeline / Interchange with loss report` | Independent QA + reviewer |
| FR-130 | P24 | `professional-timeline / Safe delivery and reproducibility` | Independent QA + reviewer |

All 30 FRs are mandatory proposed behaviors. The 60 WHEN/THEN scenarios are the source of acceptance tests. `tasks.md` defines executable checkpoint slices. A reference to a test is not proof it ran.

## Non-functional requirements

| NFR | SHALL condition | Evidence |
|---|---|---|
| NFR-01 Version safety | No new renderer/plan changes the immutable approved scene/release pointer before an authorized final commit | crash, cancel and concurrent-edit E2E |
| NFR-02 Timebase | All cuts, word cues and audio transitions use integer frames / rational timebase | decoded PTS comparison at 24, 25, 30, 30000/1001 FPS |
| NFR-03 Security | Scene writes are scoped by authenticated actor/project/scene/role and fencing token, not by a self-reported assignee string | foreign/stale/expired token negative tests |
| NFR-04 Resource ceilings | Engine limits clip duration, decoded pixels, RAM, concurrency, render wall time and network retrieval | OOM-budget fixture, refusal and retry |
| NFR-05 Provenance | Track source SHA, renderer version, license evidence and test/reviewer artifacts | invalid SHA, expired license and cache-poison tests |
| NFR-06 Privacy | No upload to unapproved third-party analyzers; no raw voice/secret logged | network mocks, log redaction tests |
| NFR-07 Accessibility | Reduced-motion alternative, readable captions and contrast policy where feasible | long text, fallback font, flashes test |
| NFR-08 Determinism | Same pinned inputs yield same edit decision list and within documented codec tolerance | repeated renders, PTS and decoded-frame A/B |
| NFR-09 Interoperability | Unsupported third-party effects are explicitly identified, not silently dropped | OTIO/EDL lossy import/export fixture |
| NFR-10 Integrity | Approval is an authenticated decision, never inferred from `verified:true` or model output | forged review, stale revision and replay tests |

## Lifecycle states and authoritative checkpoints

`TODO → IN_PROGRESS → IMPLEMENTED → TESTED → REVIEWED → ACCEPTED`, or `BLOCKED`/`REWORK` after an explicit failure. **Only a human/reviewer with validated evidence may mark ACCEPTED.** In the initial JSON, all 60 checkpoint statuses are `TODO` and `evidence: []`. A task can be `IMPLEMENTED` without being `TESTED`; neither status permits release.

Required evidence per checkpoint: `commit_sha`, `test_run_url or local_test_command + exit_code`, `artifact_uri`, `sha256`, `reviewer`, `reviewed_at`, `notes`. All user scripts and video artifacts must stay inside the authorized project/scope.

## Data / event references

- `src/decks/<id>/deck.json`: human/editor-owned; never rewrite `say`, scene IDs, original `audio` or theme silently.
- Scene sources and approved video versions: existing P08 immutable SHA-pinned archives.
- Cue alignment: existing P09 anchored cues; no invented word-level times when source evidence is absent.
- Assembly/release: existing P05 and P13/14; no direct mutation of previous approved `current.json`.
- Rights catalog: new P22 sidecar; a candidate without explicit rights metadata must not be included in output.
- Scene ownership: existing P06 and P10; maintain distinct agents and mandatory reviewer/direction gates.

## Definition of Done — entire program

1. 60 checkpoints independently evidenced, reviewed and accepted; 10 capability specs pass OpenSpec strict.
2. CI green on actual head SHA (not an earlier PR). 30 FRs and 60 positive/negative scenarios mapped to tests; no skipped must-pass media acceptance.
3. Six scene real-media e2e: aligned narration, creative beat plan, transitions, motion, typography, color, licensed B-roll, calibrated QA, mixer and editable timeline export. Failure injections cannot invalidate previous release.
4. Measured comparison to baseline edit on at least three controlled licensed/owned fixture projects, including blind human ratings. Publish methodology, limitations and regressions.
5. Railway staging/canary manifest references same code SHA as tested; production rollout only after explicit owner approval and rollback exercise. Health status alone is not a completed DoD.

## References

- OpenSpec proposal and design in the corresponding change.
- `specs/002-professional-montage/plan.md`: architecture/workflows.
- `specs/002-professional-montage/tasks.md`: full checkpoint-by-checkpoint build/verify protocol.
- `docs/PRO_MONTAGE_AGENTS.md`: agent onboarding and evidence contract.
