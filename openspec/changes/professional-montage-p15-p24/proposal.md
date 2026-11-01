# Proposal: Professional Montage P15–P24

## Why

PressBuilder already has a tested technical pipeline: scenes, 3D/2D, immutable H.264 artifacts, reviewer gates, scene leases, cue timebase, basic transition and incremental assembly. However, *correct video encoding is not the same as professional editing*. Existing P01–P14 do not guarantee musical/narrative rhythm, consistent cinematic motion, balanced sound design, readable kinetic typography, coherent grading, licensed B-roll, calibrated creative QA, or editable interchange.

A six-scene film must feel intentionally directed, not like six disconnected effects. Scope this change to **proposals and specifications only**. Production implementations must be separate reviewed PRs backed by real-media CI.

## What Changes

| ID | Capability | Outcome |
|---|---|---|
| P15 | rhythm-engine | Frame-accurate pacing and edit accents from voice pauses, aligned words and optional licensed beats |
| P16 | creative-director | Reviewer-approved alternative storyboards with human-controlled dramaturgy |
| P17 | cinematic-continuity | Entry/exit states, J/L cuts and validated cross-scene continuity |
| P18 | professional-motion | Bounded keyframe easing, speed ramp, 3D-camera controls and deterministic blur |
| P19 | sound-design | Multi-track voice/music/SFX mixing, ducking, fades and integrated loudness reports |
| P20 | kinetic-typography | Word/cue-driven typography with actual glyph measurement and safe-area tests |
| P21 | color-lighting | Per-scene exposure/white-balance matching and deterministic color transform provenance |
| P22 | smart-b-roll | Rights-aware asset selection from explicit authorized catalogs, not unapproved scraping |
| P23 | creative-montage-qa | Evidence-backed technical FAIL vs subjective REVIEW; human sign-off retained |
| P24 | professional-timeline | Revisioned, reversible frame-based timeline with supported OTIO/EDL interoperability |

## In Scope

- New opt-in versioned contracts; scene-scoped MCP/REST operations with permission checks; read-only previews before costly renders.
- Deterministic frame/PTS arithmetic, approved media provenance, immutable release pointers, checkpoints and reproducible acceptance evidence.
- Existing cloud CI + real Chromium/FFmpeg Docker tests with synthetic and licensed/owned fixtures.
- Human reviewer at narrative, music licensing, creative QC and final release gates.
- Documented deployment drift: GitHub main changes do not imply a Railway service tracking an older branch is updated.

## Explicitly Out of Scope

- No automatic production deploy or mutation of existing project/deck.json, music library, voice clips or approved MP4.
- No installation of unapproved NLE, LLM APIs, codecs, fonts or plugins. No generative copyrighted asset cloning.
- No claim that a score, VMAF-like number, LLM output or model confidence equals artistic quality.
- No arbitrary executable user TypeScript in shared Railway worker.
- No simultaneous edit ownership without durable leases and server-side actor identity.

## Dependencies and Phasing

1. **Foundation**: P15 timebase and P19 audio reports; P23 QA evidence taxonomy; ensure source hashes (P08), leases (P06), source-pinned releases (P05).
2. **Cinematic grammar**: P17 and P18 on the canonical frame clock; P20 safe readable titles.
3. **Creative direction**: P16 story beats, P21 grading and P22 authorized B-roll.
4. **Interchange and delivery**: P24 handoff, six-scene A/B quality evaluation, Railway canary.

Each P15–P24 has its own OpenSpec capability, SDD story, checkpoints and rollback.

## Success Conditions (candidate targets; validate against baseline)

- Six real scenes render, are approved and assemble with a frame-accurate transition plan; no change to existing approved release before signoff.
- Audio/video drift <= 1 frame at nominal FPS on tested fixtures; no clipped peak; no missing required narration.
- All displayed text inside effective safe area across glyph fonts/fallbacks; non-deterministic fonts produce REVIEW, not false PASS.
- 0 unlicensed/unattributed B-roll accepted; no asset or MCP operation escapes its project/scene scope.
- Full CI includes negative tests for stale leases, concurrent revisions, missing codecs, corrupt assets, invalid timecodes, resource caps and cancellation.
- User judges A/B outputs blind on clarity, pacing, readability, sound balance and coherence. Subjective preference remains separate from technical QA.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Timeline drift from floats or FPS conversions | integer frame arithmetic, explicit rational FPS and boundary PTS tests |
| Overproduced distractive animation | motion budgets, narrative intent, reviewer review and opt-out |
| Automatic license infringement | explicit rights manifest, unsupported license => block selection |
| False rejection of creative choices | technical failures hard FAIL; aesthetic heuristics generate REVIEW only |
| FFmpeg/Chromium saturation | quotas, bounded pools, cancel/retry, cached draft previews |
| Competing agents overwriting scenes | scene lease/fence, CAS revision, independent immutable outputs |
| Railway behind GitHub main | commit SHA / environment verified before acceptance |

## Acceptance Authority

A checkpoint status is **TODO** until a named human/reviewer or trusted CI attests its artifacts. A coder may submit evidence, but may not self-approve creative readiness or mark production. See `docs/PRO_MONTAGE_AGENTS.md` and SDD tasks.
