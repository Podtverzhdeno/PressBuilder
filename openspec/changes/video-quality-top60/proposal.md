# Change proposal — TOP-60 Quality × Efficiency Video Montage

**Change ID:** `video-quality-top60` · **Type:** spec-first R&D and product roadmap · **Status:** PROPOSED · **As-of:** 2026-11-02.

## Motivation
PressBuilder already has a six-scene worker flow, versioned immutable P08 MP4, P06 scene leases, render pipeline P02/P05, director/reviewer boundaries P10 and P15–P18 experimental primitives. Yet production-quality video still depends on time-consuming manual editorial decisions, verified sound, typography, frame-level QA, media rights and repeatable renders.

The goal is **not** sixty decorative effects. Select and order sixty high-value changes to improve (a) clear professional storytelling, (b) readable and safe visual/audio output, (c) cost/turnaround per six-scene job, (d) verifiable provenance and release reliability.

## Scope
- IN: **60 separately scored** improvements, atomic and systemic, grouped into editorial/audio/visual/content/pipeline/quality. Each includes problem, intended algorithm, typed contract, dependency, negative test and measurable acceptance. Shared SDD tasks and human review gates. All future feature flags off by default.
- OUT: implementing the 60 capabilities in this PR; editing existing agent allocations, rewriting approved MP4s, calling third-party paid models, overwriting `deck.json`, removing P15–P24, enabling speculative AI in production.
- Existing P15–P24 specs remain intact. New M01–M60 items provide finer architectural slices and future coverage; cross-references designate integration points, not a claim that P15–P24 are complete.

## Core deliverables
1. `docs/TOP60_MONTAGE_RANKING.md`: global strict ranking, six numeric criteria, weighted total, execution waves and sources.
2. `docs/top60-montage-registry.json`: machine-readable names, tiers, points, dependencies and truthfully PROPOSED state.
3. `specs/{editorial,audio,visual,content,pipeline,quality}/spec.md`: ten detailed requirements each.
4. `design.md`: trust boundaries, contracts, architecture and failure behaviors.
5. `tasks.md`: per-feature C01–C08 checkpoints with mandatory evidence and realistic rollout phases.
6. Machine validator for completeness/rank consistency when included in CI.

## Non-negotiable rules
- **No false statuses:** SDD checklist remains `[ ]` unless the exact corresponding deliverable, test artifact, SHA, independent reviewer and acceptance proof exist.
- **No self-approval:** generative or numerical quality estimates can suggest changes only; protected source provenance, legal ownership and art direction remain human-owned.
- **Hard safety gates:** unsupported rights, unapproved media, cross-project access, protected facts, unsafe flashes, corrupted source or a stale actor lease block further stages regardless of rank.
- **A/B with equal resources:** establish baseline for six-scene 1080p H.264/AAC and comparable render/preview hardware; log time, CPU, RSS, quality and A/B judgments.
- **No hidden backend costs:** CPU/GPU, codecs, model licenses, cloud requests, retention and privacy must be considered explicitly in each PoC.

## Why these sixty
A consistent quantitative rubric values **incremental quality** (30%), **editor-time saving** (25%), **feasibility** (20%), **total-cost efficiency** (10%), **safety/reliability** (10%), and **reuse** (5%). Scores and delivery-day guesses are **expert hypotheses**. Re-score after comparable PoC data, and record changes in a separate reviewed commit.

## Approval criteria for this SPEC change
- Exactly M01..M60, unique names, exactly 10 per domain and complete explanations.
- All 60 scoring rows match the machine registry, priorities and formula.
- Per-feature 8 planned checkpoints; dependencies, rollback, real media QA and independent review described.
- Cross-check baseline P15–P24, zero production settings/assets modified.
- CI spec integrity and review. **Merging this proposal approves only the backlog design, not feature implementation.**


## 30-day engineering delivery specification annex (proposed, not implementation)

For the goal of coordinating four developer agents and one independent reviewer without duplicate code or wasted reviewer time, a separate [engineering-delivery RFC](../../../docs/engineering-30d/README.md) proposes source-pinned work allocation, exclusive cooperative file reservations, hard-stage versus advisory integration dependencies, scoped review evidence, recoverability, and measured capacity/quality. Its [traceability overlay](../../../docs/engineering-30d/traceability.json) indexes all original 60 modules and all original 480 C01–C08 IDs without altering their ranks or truthful TODO status. A [real-media quality annex](../../../docs/engineering-30d/montage-quality-gates.md) adds professional editorial, accessible typography, speech and music, actual FFmpeg master and human A/B acceptance constraints.

**This annex changes no existing feature status or production configuration.** Thirty calendar days is an ambitious **planning hypothesis**, explicitly subject to source/media authorization, independent review, staging rollback, actual measured throughput and owner-governed scope. Engineering peer review is not authoritative OpenSpec or release acceptance, and a synthetic six-scene test is not proof of professional licensed-footage quality.
