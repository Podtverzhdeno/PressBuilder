# SDD 002 — Detailed P15–P24 Checkpoints

Progress: P15-C01/C02 TESTED (review pending), C03/C04/C05 IN_PROGRESS (run 41344739143: 135 cloud tests, 119 passed, 16 skipped; Docker six-scene H264/AAC and render-smoke PASS). 55 other checkpoints TODO. Synthetic audio != actual human speech alignment or artistic release.

## Evidence and progression rules

Each checkpoint advances TODO → IN_PROGRESS → IMPLEMENTED → TESTED → REVIEWED → ACCEPTED only with observed evidence. BLOCKED/REWORK require a concrete reason. Acceptance requires a separate reviewer and full SHA-pinned CI/test output. Test names without executed results are not evidence. The machine registry is docs/pro-montage-checkpoints.json; it is NOT a working background scheduler.

Required evidence: commit SHA, exact test command, observed exit code, CI job URL, test fixture hash/license, rendered artifact hash when applicable, reviewer identity and timestamp, failure/rollback report. Any manual creative approval must reference the actual reviewed MP4 version. Do not auto-complete from self-reported verified:true.

## Feature-by-feature work

### P15 — Rhythm Engine

Capability: rhythm-engine. Owner suggestion: audio/rhythm. Dependencies: existing P06/P08/P09.

Source: P09 cue/word alignment + owned music beats.
Expected behavior: rational-frame cut candidate generation, protected phrases, pacing constraints.
Negative tests: missing words, nonfinite BPM, stale source, cuts through protected narration.
Real media scenario: 6 scenes at 24 and 30000/1001 fps with real aligned narration, no cut-time drift.
User value: proposed cut list with source frames and deterministic review evidence.
Proposed code/test (not yet present): server/rhythm-plan.mjs and tests/cloud-rhythm.test.mjs.
OpenSpec: openspec/changes/professional-montage-p15-p24/specs/rhythm-engine/spec.md.

#### P15-C01 — Contract and threat model

- [ ] P15-C01 — TESTED (CI green; separate code/security reviewer signoff required). Deliverable: montage/rhythm-engine-v1.json and JSON Schema.
- Actions: Write schema with stable project/scene IDs, revision CAS, source SHA-256, byte limits, permission/lease checks, compatibility and no side effects on deck.json. Define P09 cue/word alignment + owned music beats; reject missing words, nonfinite BPM, stale source, cuts through protected narration.
- Dependencies: Existing P06/P08/P09 and current OpenSpec.
- Acceptance: Reviewed schema, 3 FRs mapped, positive and negative samples, old release unchanged.
- Required negatives: missing words, nonfinite BPM, stale source, cuts through protected narration.
- Tests: node --test tests/cloud-rhythm.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P15-C02 — Bounded functional vertical slice

- [ ] P15-C02 — TESTED (CI green; separate code/security reviewer signoff required). Deliverable: server/rhythm-plan.mjs.
- Actions: Implement one deterministic end-to-end behavior behind disabled-by-default feature flag. Use integer/rational timebase, pinned fixtures, retries and safe fail-closed fallback. Implement: rational-frame cut candidate generation, protected phrases, pacing constraints.
- Dependencies: P15-C01.
- Acceptance: Core unit tests pass on repeated runs, stale source is rejected, deterministic output or documented tolerance.
- Required negatives: missing words, nonfinite BPM, stale source, cuts through protected narration.
- Tests: node --test tests/cloud-rhythm.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P15-C03 — MCP + REST + Studio preview

- [ ] P15-C03 — IN_PROGRESS (source-pinned Studio preview, persistent CAS draft and independent non-publishable reviewer MCP tested; verified voice alignment/rights, human approval, real P15 render and production gate outstanding). Deliverable: MCP/REST route and Studio scene editor.
- Actions: Implement typed read/write and preview endpoints scoped to distinct authenticated principals, P06 fence tokens and expected revisions; add undo and human override in editor. Expose revisioned preview for proposed cut list with source frames and deterministic review evidence; leave published release unchanged.
- Dependencies: P15-C02.
- Acceptance: Foreign worker and expired token are denied, CAS conflict shown in UI, reviewer can compare prior/candidate; no implicit approval.
- Required negatives: missing words, nonfinite BPM, stale source, cuts through protected narration.
- Tests: node --test tests/cloud-rhythm.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P15-C04 — Negative and regression suite

- [ ] P15-C04 — IN_PROGRESS (voice PCM/rights negative security suite run 41344739143; independent review and real speech-source validation outstanding). Deliverable: tests/cloud-rhythm.test.mjs.
- Actions: Add adversarial tests for malformed input, external URLs, hash drift, resource exhaustion, concurrency, cancellation, corrupt media and post-approval mutation. Exercise deliberately broken cases: missing words, nonfinite BPM, stale source, cuts through protected narration.
- Dependencies: P15-C03.
- Acceptance: All relevant threat cases fail closed, no neighboring scene touched, old approved MP4 survives; CI exact exit code recorded.
- Required negatives: missing words, nonfinite BPM, stale source, cuts through protected narration.
- Tests: node --test tests/cloud-rhythm.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P15-C05 — Real six-scene E2E and QA

- [ ] P15-C05 — IN_PROGRESS (synthetic six-scene H.264/AAC Docker E2E PASS run 41344739143; real human narration, 30000/1001 and artistic A/B outstanding). Deliverable: Docker real media job and immutable artifact.
- Actions: Render owned/licensed media through production-equivalent Chromium+FFmpeg in Docker; compare decoded PTS, timing, audio, screenshots and A/B against untouched baseline. Run real media test: 6 scenes at 24 and 30000/1001 fps with real aligned narration, no cut-time drift.
- Dependencies: P15-C04.
- Acceptance: Real MP4/H.264 evidence with SHA and screenshot/frame IDs, no mandatory media tests skipped, independent human creative review.
- Required negatives: missing words, nonfinite BPM, stale source, cuts through protected narration.
- Tests: node --test tests/cloud-rhythm.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P15-C06 — Canary, operations and rollback

- [ ] P15-C06 — TODO. Deliverable: Railway staging canary report.
- Actions: Run staging-only feature flag against tested commit; capture CPU/RAM/p95/render queue/cost and 5xx; kill/restart test and verify previous release restoration. Measure and compare: proposed cut list with source frames and deterministic review evidence. Set stop conditions for crash/5xx/performance regression.
- Dependencies: P15-C05.
- Acceptance: Staging SHA equals tested Git SHA, metric thresholds and rollback documented, reviewer + owner signoff required before production.
- Required negatives: missing words, nonfinite BPM, stale source, cuts through protected narration.
- Tests: node --test tests/cloud-rhythm.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

### P16 — Creative Director

Capability: creative-director. Owner suggestion: director + reviewer. Dependencies: P15.

Source: approved script and P10 scene briefs.
Expected behavior: two alternate hook→payoff stories anchored to actual text with explicit human storyboard approval.
Negative tests: fake factual claims, stale actor/signature, unrelated scene rewrite.
Real media scenario: 6-scene alternative storyboard, rejected scene and isolated retry, signed storyboard audit.
User value: two meaningful narratives without changing original script.
Proposed code/test (not yet present): server/director-plan.mjs and tests/cloud-director-professional.test.mjs.
OpenSpec: openspec/changes/professional-montage-p15-p24/specs/creative-director/spec.md.

#### P16-C01 — Contract and threat model

- [ ] P16-C01 — TODO. Deliverable: montage/creative-director-v1.json and JSON Schema.
- Actions: Write schema with stable project/scene IDs, revision CAS, source SHA-256, byte limits, permission/lease checks, compatibility and no side effects on deck.json. Define approved script and P10 scene briefs; reject fake factual claims, stale actor/signature, unrelated scene rewrite.
- Dependencies: Existing P06/P08/P09 and current OpenSpec.
- Acceptance: Reviewed schema, 3 FRs mapped, positive and negative samples, old release unchanged.
- Required negatives: fake factual claims, stale actor/signature, unrelated scene rewrite.
- Tests: node --test tests/cloud-director-professional.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P16-C02 — Bounded functional vertical slice

- [ ] P16-C02 — TODO. Deliverable: server/director-plan.mjs.
- Actions: Implement one deterministic end-to-end behavior behind disabled-by-default feature flag. Use integer/rational timebase, pinned fixtures, retries and safe fail-closed fallback. Implement: two alternate hook→payoff stories anchored to actual text with explicit human storyboard approval.
- Dependencies: P16-C01, P15-C01.
- Acceptance: Core unit tests pass on repeated runs, stale source is rejected, deterministic output or documented tolerance.
- Required negatives: fake factual claims, stale actor/signature, unrelated scene rewrite.
- Tests: node --test tests/cloud-director-professional.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P16-C03 — MCP + REST + Studio preview

- [ ] P16-C03 — TODO. Deliverable: MCP/REST route and Studio scene editor.
- Actions: Implement typed read/write and preview endpoints scoped to distinct authenticated principals, P06 fence tokens and expected revisions; add undo and human override in editor. Expose revisioned preview for two meaningful narratives without changing original script; leave published release unchanged.
- Dependencies: P16-C02.
- Acceptance: Foreign worker and expired token are denied, CAS conflict shown in UI, reviewer can compare prior/candidate; no implicit approval.
- Required negatives: fake factual claims, stale actor/signature, unrelated scene rewrite.
- Tests: node --test tests/cloud-director-professional.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P16-C04 — Negative and regression suite

- [ ] P16-C04 — TODO. Deliverable: tests/cloud-director-professional.test.mjs.
- Actions: Add adversarial tests for malformed input, external URLs, hash drift, resource exhaustion, concurrency, cancellation, corrupt media and post-approval mutation. Exercise deliberately broken cases: fake factual claims, stale actor/signature, unrelated scene rewrite.
- Dependencies: P16-C03.
- Acceptance: All relevant threat cases fail closed, no neighboring scene touched, old approved MP4 survives; CI exact exit code recorded.
- Required negatives: fake factual claims, stale actor/signature, unrelated scene rewrite.
- Tests: node --test tests/cloud-director-professional.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P16-C05 — Real six-scene E2E and QA

- [ ] P16-C05 — TODO. Deliverable: Docker real media job and immutable artifact.
- Actions: Render owned/licensed media through production-equivalent Chromium+FFmpeg in Docker; compare decoded PTS, timing, audio, screenshots and A/B against untouched baseline. Run real media test: 6-scene alternative storyboard, rejected scene and isolated retry, signed storyboard audit.
- Dependencies: P16-C04.
- Acceptance: Real MP4/H.264 evidence with SHA and screenshot/frame IDs, no mandatory media tests skipped, independent human creative review.
- Required negatives: fake factual claims, stale actor/signature, unrelated scene rewrite.
- Tests: node --test tests/cloud-director-professional.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P16-C06 — Canary, operations and rollback

- [ ] P16-C06 — TODO. Deliverable: Railway staging canary report.
- Actions: Run staging-only feature flag against tested commit; capture CPU/RAM/p95/render queue/cost and 5xx; kill/restart test and verify previous release restoration. Measure and compare: two meaningful narratives without changing original script. Set stop conditions for crash/5xx/performance regression.
- Dependencies: P16-C05.
- Acceptance: Staging SHA equals tested Git SHA, metric thresholds and rollback documented, reviewer + owner signoff required before production.
- Required negatives: fake factual claims, stale actor/signature, unrelated scene rewrite.
- Tests: node --test tests/cloud-director-professional.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

### P17 — Cinematic Continuity

Capability: cinematic-continuity. Owner suggestion: motion/continuity. Dependencies: P15,P16.

Source: P05/P08 approved scene source and boundary states.
Expected behavior: frame-accurate match-action, J-cut and L-cut with separate audio/video handles.
Negative tests: prelap outside audio handles, reversed camera motion, PTS mismatch, stale approval.
Real media scenario: motion-compatible scenes, J/L overlaps decoded and reviewed at exact frame boundaries.
User value: cut continuity and independent audio track offsets with evidence.
Proposed code/test (not yet present): server/continuity-plan.mjs and tests/cloud-continuity.test.mjs.
OpenSpec: openspec/changes/professional-montage-p15-p24/specs/cinematic-continuity/spec.md.

#### P17-C01 — Contract and threat model

- [ ] P17-C01 — TODO. Deliverable: montage/cinematic-continuity-v1.json and JSON Schema.
- Actions: Write schema with stable project/scene IDs, revision CAS, source SHA-256, byte limits, permission/lease checks, compatibility and no side effects on deck.json. Define P05/P08 approved scene source and boundary states; reject prelap outside audio handles, reversed camera motion, PTS mismatch, stale approval.
- Dependencies: Existing P06/P08/P09 and current OpenSpec.
- Acceptance: Reviewed schema, 3 FRs mapped, positive and negative samples, old release unchanged.
- Required negatives: prelap outside audio handles, reversed camera motion, PTS mismatch, stale approval.
- Tests: node --test tests/cloud-continuity.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P17-C02 — Bounded functional vertical slice

- [ ] P17-C02 — TODO. Deliverable: server/continuity-plan.mjs.
- Actions: Implement one deterministic end-to-end behavior behind disabled-by-default feature flag. Use integer/rational timebase, pinned fixtures, retries and safe fail-closed fallback. Implement: frame-accurate match-action, J-cut and L-cut with separate audio/video handles.
- Dependencies: P17-C01, P15-C01, P16-C01.
- Acceptance: Core unit tests pass on repeated runs, stale source is rejected, deterministic output or documented tolerance.
- Required negatives: prelap outside audio handles, reversed camera motion, PTS mismatch, stale approval.
- Tests: node --test tests/cloud-continuity.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P17-C03 — MCP + REST + Studio preview

- [ ] P17-C03 — TODO. Deliverable: MCP/REST route and Studio scene editor.
- Actions: Implement typed read/write and preview endpoints scoped to distinct authenticated principals, P06 fence tokens and expected revisions; add undo and human override in editor. Expose revisioned preview for cut continuity and independent audio track offsets with evidence; leave published release unchanged.
- Dependencies: P17-C02.
- Acceptance: Foreign worker and expired token are denied, CAS conflict shown in UI, reviewer can compare prior/candidate; no implicit approval.
- Required negatives: prelap outside audio handles, reversed camera motion, PTS mismatch, stale approval.
- Tests: node --test tests/cloud-continuity.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P17-C04 — Negative and regression suite

- [ ] P17-C04 — TODO. Deliverable: tests/cloud-continuity.test.mjs.
- Actions: Add adversarial tests for malformed input, external URLs, hash drift, resource exhaustion, concurrency, cancellation, corrupt media and post-approval mutation. Exercise deliberately broken cases: prelap outside audio handles, reversed camera motion, PTS mismatch, stale approval.
- Dependencies: P17-C03.
- Acceptance: All relevant threat cases fail closed, no neighboring scene touched, old approved MP4 survives; CI exact exit code recorded.
- Required negatives: prelap outside audio handles, reversed camera motion, PTS mismatch, stale approval.
- Tests: node --test tests/cloud-continuity.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P17-C05 — Real six-scene E2E and QA

- [ ] P17-C05 — TODO. Deliverable: Docker real media job and immutable artifact.
- Actions: Render owned/licensed media through production-equivalent Chromium+FFmpeg in Docker; compare decoded PTS, timing, audio, screenshots and A/B against untouched baseline. Run real media test: motion-compatible scenes, J/L overlaps decoded and reviewed at exact frame boundaries.
- Dependencies: P17-C04.
- Acceptance: Real MP4/H.264 evidence with SHA and screenshot/frame IDs, no mandatory media tests skipped, independent human creative review.
- Required negatives: prelap outside audio handles, reversed camera motion, PTS mismatch, stale approval.
- Tests: node --test tests/cloud-continuity.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P17-C06 — Canary, operations and rollback

- [ ] P17-C06 — TODO. Deliverable: Railway staging canary report.
- Actions: Run staging-only feature flag against tested commit; capture CPU/RAM/p95/render queue/cost and 5xx; kill/restart test and verify previous release restoration. Measure and compare: cut continuity and independent audio track offsets with evidence. Set stop conditions for crash/5xx/performance regression.
- Dependencies: P17-C05.
- Acceptance: Staging SHA equals tested Git SHA, metric thresholds and rollback documented, reviewer + owner signoff required before production.
- Required negatives: prelap outside audio handles, reversed camera motion, PTS mismatch, stale approval.
- Tests: node --test tests/cloud-continuity.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

### P18 — Professional Motion

Capability: professional-motion. Owner suggestion: motion/continuity. Dependencies: P15.

Source: P15 timebase and scene property IDs.
Expected behavior: bounded deterministic easing, camera motion, visual speed ramps and motion blur.
Negative tests: NaN keyframes, large acceleration, huge sample count, speech drift, flashing.
Real media scenario: two 3D objects, easing and blur at 0/25/50/75/100% of scene, reduced motion.
User value: professional movement without excessive cost or readability regression.
Proposed code/test (not yet present): server/motion-engine.mjs and tests/cloud-motion-pro.test.mjs.
OpenSpec: openspec/changes/professional-montage-p15-p24/specs/professional-motion/spec.md.

#### P18-C01 — Contract and threat model

- [ ] P18-C01 — TODO. Deliverable: montage/professional-motion-v1.json and JSON Schema.
- Actions: Write schema with stable project/scene IDs, revision CAS, source SHA-256, byte limits, permission/lease checks, compatibility and no side effects on deck.json. Define P15 timebase and scene property IDs; reject NaN keyframes, large acceleration, huge sample count, speech drift, flashing.
- Dependencies: Existing P06/P08/P09 and current OpenSpec.
- Acceptance: Reviewed schema, 3 FRs mapped, positive and negative samples, old release unchanged.
- Required negatives: NaN keyframes, large acceleration, huge sample count, speech drift, flashing.
- Tests: node --test tests/cloud-motion-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P18-C02 — Bounded functional vertical slice

- [ ] P18-C02 — TODO. Deliverable: server/motion-engine.mjs.
- Actions: Implement one deterministic end-to-end behavior behind disabled-by-default feature flag. Use integer/rational timebase, pinned fixtures, retries and safe fail-closed fallback. Implement: bounded deterministic easing, camera motion, visual speed ramps and motion blur.
- Dependencies: P18-C01, P15-C01.
- Acceptance: Core unit tests pass on repeated runs, stale source is rejected, deterministic output or documented tolerance.
- Required negatives: NaN keyframes, large acceleration, huge sample count, speech drift, flashing.
- Tests: node --test tests/cloud-motion-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P18-C03 — MCP + REST + Studio preview

- [ ] P18-C03 — TODO. Deliverable: MCP/REST route and Studio scene editor.
- Actions: Implement typed read/write and preview endpoints scoped to distinct authenticated principals, P06 fence tokens and expected revisions; add undo and human override in editor. Expose revisioned preview for professional movement without excessive cost or readability regression; leave published release unchanged.
- Dependencies: P18-C02.
- Acceptance: Foreign worker and expired token are denied, CAS conflict shown in UI, reviewer can compare prior/candidate; no implicit approval.
- Required negatives: NaN keyframes, large acceleration, huge sample count, speech drift, flashing.
- Tests: node --test tests/cloud-motion-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P18-C04 — Negative and regression suite

- [ ] P18-C04 — TODO. Deliverable: tests/cloud-motion-pro.test.mjs.
- Actions: Add adversarial tests for malformed input, external URLs, hash drift, resource exhaustion, concurrency, cancellation, corrupt media and post-approval mutation. Exercise deliberately broken cases: NaN keyframes, large acceleration, huge sample count, speech drift, flashing.
- Dependencies: P18-C03.
- Acceptance: All relevant threat cases fail closed, no neighboring scene touched, old approved MP4 survives; CI exact exit code recorded.
- Required negatives: NaN keyframes, large acceleration, huge sample count, speech drift, flashing.
- Tests: node --test tests/cloud-motion-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P18-C05 — Real six-scene E2E and QA

- [ ] P18-C05 — TODO. Deliverable: Docker real media job and immutable artifact.
- Actions: Render owned/licensed media through production-equivalent Chromium+FFmpeg in Docker; compare decoded PTS, timing, audio, screenshots and A/B against untouched baseline. Run real media test: two 3D objects, easing and blur at 0/25/50/75/100% of scene, reduced motion.
- Dependencies: P18-C04.
- Acceptance: Real MP4/H.264 evidence with SHA and screenshot/frame IDs, no mandatory media tests skipped, independent human creative review.
- Required negatives: NaN keyframes, large acceleration, huge sample count, speech drift, flashing.
- Tests: node --test tests/cloud-motion-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P18-C06 — Canary, operations and rollback

- [ ] P18-C06 — TODO. Deliverable: Railway staging canary report.
- Actions: Run staging-only feature flag against tested commit; capture CPU/RAM/p95/render queue/cost and 5xx; kill/restart test and verify previous release restoration. Measure and compare: professional movement without excessive cost or readability regression. Set stop conditions for crash/5xx/performance regression.
- Dependencies: P18-C05.
- Acceptance: Staging SHA equals tested Git SHA, metric thresholds and rollback documented, reviewer + owner signoff required before production.
- Required negatives: NaN keyframes, large acceleration, huge sample count, speech drift, flashing.
- Tests: node --test tests/cloud-motion-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

### P19 — Sound Design

Capability: sound-design. Owner suggestion: audio/rhythm. Dependencies: P15.

Source: owned voice, licensed music and SFX, source SHA and P09 cues.
Expected behavior: three audio buses, ducking, acrossfades, loudness/true peak profile and per-track gain.
Negative tests: missing narration, clipping, unlicensed music, stale SHA, cancellation.
Real media scenario: 6-scene audio mix with silent scene and overlaps, measured loudness and <=1-frame A/V drift.
User value: audible voice with controlled music, SFX and invariant old release.
Proposed code/test (not yet present): server/audio-mix.mjs and tests/cloud-audio-pro.test.mjs.
OpenSpec: openspec/changes/professional-montage-p15-p24/specs/sound-design/spec.md.

#### P19-C01 — Contract and threat model

- [ ] P19-C01 — TODO. Deliverable: montage/sound-design-v1.json and JSON Schema.
- Actions: Write schema with stable project/scene IDs, revision CAS, source SHA-256, byte limits, permission/lease checks, compatibility and no side effects on deck.json. Define owned voice, licensed music and SFX, source SHA and P09 cues; reject missing narration, clipping, unlicensed music, stale SHA, cancellation.
- Dependencies: Existing P06/P08/P09 and current OpenSpec.
- Acceptance: Reviewed schema, 3 FRs mapped, positive and negative samples, old release unchanged.
- Required negatives: missing narration, clipping, unlicensed music, stale SHA, cancellation.
- Tests: node --test tests/cloud-audio-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P19-C02 — Bounded functional vertical slice

- [ ] P19-C02 — TODO. Deliverable: server/audio-mix.mjs.
- Actions: Implement one deterministic end-to-end behavior behind disabled-by-default feature flag. Use integer/rational timebase, pinned fixtures, retries and safe fail-closed fallback. Implement: three audio buses, ducking, acrossfades, loudness/true peak profile and per-track gain.
- Dependencies: P19-C01, P15-C01.
- Acceptance: Core unit tests pass on repeated runs, stale source is rejected, deterministic output or documented tolerance.
- Required negatives: missing narration, clipping, unlicensed music, stale SHA, cancellation.
- Tests: node --test tests/cloud-audio-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P19-C03 — MCP + REST + Studio preview

- [ ] P19-C03 — TODO. Deliverable: MCP/REST route and Studio scene editor.
- Actions: Implement typed read/write and preview endpoints scoped to distinct authenticated principals, P06 fence tokens and expected revisions; add undo and human override in editor. Expose revisioned preview for audible voice with controlled music, SFX and invariant old release; leave published release unchanged.
- Dependencies: P19-C02.
- Acceptance: Foreign worker and expired token are denied, CAS conflict shown in UI, reviewer can compare prior/candidate; no implicit approval.
- Required negatives: missing narration, clipping, unlicensed music, stale SHA, cancellation.
- Tests: node --test tests/cloud-audio-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P19-C04 — Negative and regression suite

- [ ] P19-C04 — TODO. Deliverable: tests/cloud-audio-pro.test.mjs.
- Actions: Add adversarial tests for malformed input, external URLs, hash drift, resource exhaustion, concurrency, cancellation, corrupt media and post-approval mutation. Exercise deliberately broken cases: missing narration, clipping, unlicensed music, stale SHA, cancellation.
- Dependencies: P19-C03.
- Acceptance: All relevant threat cases fail closed, no neighboring scene touched, old approved MP4 survives; CI exact exit code recorded.
- Required negatives: missing narration, clipping, unlicensed music, stale SHA, cancellation.
- Tests: node --test tests/cloud-audio-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P19-C05 — Real six-scene E2E and QA

- [ ] P19-C05 — TODO. Deliverable: Docker real media job and immutable artifact.
- Actions: Render owned/licensed media through production-equivalent Chromium+FFmpeg in Docker; compare decoded PTS, timing, audio, screenshots and A/B against untouched baseline. Run real media test: 6-scene audio mix with silent scene and overlaps, measured loudness and <=1-frame A/V drift.
- Dependencies: P19-C04.
- Acceptance: Real MP4/H.264 evidence with SHA and screenshot/frame IDs, no mandatory media tests skipped, independent human creative review.
- Required negatives: missing narration, clipping, unlicensed music, stale SHA, cancellation.
- Tests: node --test tests/cloud-audio-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P19-C06 — Canary, operations and rollback

- [ ] P19-C06 — TODO. Deliverable: Railway staging canary report.
- Actions: Run staging-only feature flag against tested commit; capture CPU/RAM/p95/render queue/cost and 5xx; kill/restart test and verify previous release restoration. Measure and compare: audible voice with controlled music, SFX and invariant old release. Set stop conditions for crash/5xx/performance regression.
- Dependencies: P19-C05.
- Acceptance: Staging SHA equals tested Git SHA, metric thresholds and rollback documented, reviewer + owner signoff required before production.
- Required negatives: missing narration, clipping, unlicensed music, stale SHA, cancellation.
- Tests: node --test tests/cloud-audio-pro.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

### P20 — Kinetic Typography

Capability: kinetic-typography. Owner suggestion: visual. Dependencies: P15,P18.

Source: verified word IDs, approved say/show text, font licenses and safe-area policy.
Expected behavior: animated word emphasis with actual glyph boxes, font fallback and readable hold.
Negative tests: missing font, Cyrillic clipped, long text, unsafe overlap, short flash.
Real media scenario: 1080p+4K real Chromium frames with Russian/English fonts, measured glyph bounding boxes.
User value: readable emphasis with consistent font layout.
Proposed code/test (not yet present): server/kinetic-type.mjs and tests/cloud-kinetic-type.test.mjs.
OpenSpec: openspec/changes/professional-montage-p15-p24/specs/kinetic-typography/spec.md.

#### P20-C01 — Contract and threat model

- [ ] P20-C01 — TODO. Deliverable: montage/kinetic-typography-v1.json and JSON Schema.
- Actions: Write schema with stable project/scene IDs, revision CAS, source SHA-256, byte limits, permission/lease checks, compatibility and no side effects on deck.json. Define verified word IDs, approved say/show text, font licenses and safe-area policy; reject missing font, Cyrillic clipped, long text, unsafe overlap, short flash.
- Dependencies: Existing P06/P08/P09 and current OpenSpec.
- Acceptance: Reviewed schema, 3 FRs mapped, positive and negative samples, old release unchanged.
- Required negatives: missing font, Cyrillic clipped, long text, unsafe overlap, short flash.
- Tests: node --test tests/cloud-kinetic-type.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P20-C02 — Bounded functional vertical slice

- [ ] P20-C02 — TODO. Deliverable: server/kinetic-type.mjs.
- Actions: Implement one deterministic end-to-end behavior behind disabled-by-default feature flag. Use integer/rational timebase, pinned fixtures, retries and safe fail-closed fallback. Implement: animated word emphasis with actual glyph boxes, font fallback and readable hold.
- Dependencies: P20-C01, P15-C01, P18-C01.
- Acceptance: Core unit tests pass on repeated runs, stale source is rejected, deterministic output or documented tolerance.
- Required negatives: missing font, Cyrillic clipped, long text, unsafe overlap, short flash.
- Tests: node --test tests/cloud-kinetic-type.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P20-C03 — MCP + REST + Studio preview

- [ ] P20-C03 — TODO. Deliverable: MCP/REST route and Studio scene editor.
- Actions: Implement typed read/write and preview endpoints scoped to distinct authenticated principals, P06 fence tokens and expected revisions; add undo and human override in editor. Expose revisioned preview for readable emphasis with consistent font layout; leave published release unchanged.
- Dependencies: P20-C02.
- Acceptance: Foreign worker and expired token are denied, CAS conflict shown in UI, reviewer can compare prior/candidate; no implicit approval.
- Required negatives: missing font, Cyrillic clipped, long text, unsafe overlap, short flash.
- Tests: node --test tests/cloud-kinetic-type.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P20-C04 — Negative and regression suite

- [ ] P20-C04 — TODO. Deliverable: tests/cloud-kinetic-type.test.mjs.
- Actions: Add adversarial tests for malformed input, external URLs, hash drift, resource exhaustion, concurrency, cancellation, corrupt media and post-approval mutation. Exercise deliberately broken cases: missing font, Cyrillic clipped, long text, unsafe overlap, short flash.
- Dependencies: P20-C03.
- Acceptance: All relevant threat cases fail closed, no neighboring scene touched, old approved MP4 survives; CI exact exit code recorded.
- Required negatives: missing font, Cyrillic clipped, long text, unsafe overlap, short flash.
- Tests: node --test tests/cloud-kinetic-type.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P20-C05 — Real six-scene E2E and QA

- [ ] P20-C05 — TODO. Deliverable: Docker real media job and immutable artifact.
- Actions: Render owned/licensed media through production-equivalent Chromium+FFmpeg in Docker; compare decoded PTS, timing, audio, screenshots and A/B against untouched baseline. Run real media test: 1080p+4K real Chromium frames with Russian/English fonts, measured glyph bounding boxes.
- Dependencies: P20-C04.
- Acceptance: Real MP4/H.264 evidence with SHA and screenshot/frame IDs, no mandatory media tests skipped, independent human creative review.
- Required negatives: missing font, Cyrillic clipped, long text, unsafe overlap, short flash.
- Tests: node --test tests/cloud-kinetic-type.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P20-C06 — Canary, operations and rollback

- [ ] P20-C06 — TODO. Deliverable: Railway staging canary report.
- Actions: Run staging-only feature flag against tested commit; capture CPU/RAM/p95/render queue/cost and 5xx; kill/restart test and verify previous release restoration. Measure and compare: readable emphasis with consistent font layout. Set stop conditions for crash/5xx/performance regression.
- Dependencies: P20-C05.
- Acceptance: Staging SHA equals tested Git SHA, metric thresholds and rollback documented, reviewer + owner signoff required before production.
- Required negatives: missing font, Cyrillic clipped, long text, unsafe overlap, short flash.
- Tests: node --test tests/cloud-kinetic-type.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

### P21 — Color & Lighting

Capability: color-lighting. Owner suggestion: visual. Dependencies: P17.

Source: approved frame sources, primaries/transfer/range and licensed LUT.
Expected behavior: bounded grade, exposure/white-balance continuity, reversible source-anchored transforms.
Negative tests: unsupported HDR/SDR, stale LUT SHA, clipped highlights, incorrect color space.
Real media scenario: 3 intentionally mismatched scenes with decoded histograms before/after, human artistic lock.
User value: visually coherent scenes without erasing intentional contrast.
Proposed code/test (not yet present): server/color-grade.mjs and tests/cloud-color-grade.test.mjs.
OpenSpec: openspec/changes/professional-montage-p15-p24/specs/color-lighting/spec.md.

#### P21-C01 — Contract and threat model

- [ ] P21-C01 — TODO. Deliverable: montage/color-lighting-v1.json and JSON Schema.
- Actions: Write schema with stable project/scene IDs, revision CAS, source SHA-256, byte limits, permission/lease checks, compatibility and no side effects on deck.json. Define approved frame sources, primaries/transfer/range and licensed LUT; reject unsupported HDR/SDR, stale LUT SHA, clipped highlights, incorrect color space.
- Dependencies: Existing P06/P08/P09 and current OpenSpec.
- Acceptance: Reviewed schema, 3 FRs mapped, positive and negative samples, old release unchanged.
- Required negatives: unsupported HDR/SDR, stale LUT SHA, clipped highlights, incorrect color space.
- Tests: node --test tests/cloud-color-grade.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P21-C02 — Bounded functional vertical slice

- [ ] P21-C02 — TODO. Deliverable: server/color-grade.mjs.
- Actions: Implement one deterministic end-to-end behavior behind disabled-by-default feature flag. Use integer/rational timebase, pinned fixtures, retries and safe fail-closed fallback. Implement: bounded grade, exposure/white-balance continuity, reversible source-anchored transforms.
- Dependencies: P21-C01, P17-C01.
- Acceptance: Core unit tests pass on repeated runs, stale source is rejected, deterministic output or documented tolerance.
- Required negatives: unsupported HDR/SDR, stale LUT SHA, clipped highlights, incorrect color space.
- Tests: node --test tests/cloud-color-grade.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P21-C03 — MCP + REST + Studio preview

- [ ] P21-C03 — TODO. Deliverable: MCP/REST route and Studio scene editor.
- Actions: Implement typed read/write and preview endpoints scoped to distinct authenticated principals, P06 fence tokens and expected revisions; add undo and human override in editor. Expose revisioned preview for visually coherent scenes without erasing intentional contrast; leave published release unchanged.
- Dependencies: P21-C02.
- Acceptance: Foreign worker and expired token are denied, CAS conflict shown in UI, reviewer can compare prior/candidate; no implicit approval.
- Required negatives: unsupported HDR/SDR, stale LUT SHA, clipped highlights, incorrect color space.
- Tests: node --test tests/cloud-color-grade.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P21-C04 — Negative and regression suite

- [ ] P21-C04 — TODO. Deliverable: tests/cloud-color-grade.test.mjs.
- Actions: Add adversarial tests for malformed input, external URLs, hash drift, resource exhaustion, concurrency, cancellation, corrupt media and post-approval mutation. Exercise deliberately broken cases: unsupported HDR/SDR, stale LUT SHA, clipped highlights, incorrect color space.
- Dependencies: P21-C03.
- Acceptance: All relevant threat cases fail closed, no neighboring scene touched, old approved MP4 survives; CI exact exit code recorded.
- Required negatives: unsupported HDR/SDR, stale LUT SHA, clipped highlights, incorrect color space.
- Tests: node --test tests/cloud-color-grade.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P21-C05 — Real six-scene E2E and QA

- [ ] P21-C05 — TODO. Deliverable: Docker real media job and immutable artifact.
- Actions: Render owned/licensed media through production-equivalent Chromium+FFmpeg in Docker; compare decoded PTS, timing, audio, screenshots and A/B against untouched baseline. Run real media test: 3 intentionally mismatched scenes with decoded histograms before/after, human artistic lock.
- Dependencies: P21-C04.
- Acceptance: Real MP4/H.264 evidence with SHA and screenshot/frame IDs, no mandatory media tests skipped, independent human creative review.
- Required negatives: unsupported HDR/SDR, stale LUT SHA, clipped highlights, incorrect color space.
- Tests: node --test tests/cloud-color-grade.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P21-C06 — Canary, operations and rollback

- [ ] P21-C06 — TODO. Deliverable: Railway staging canary report.
- Actions: Run staging-only feature flag against tested commit; capture CPU/RAM/p95/render queue/cost and 5xx; kill/restart test and verify previous release restoration. Measure and compare: visually coherent scenes without erasing intentional contrast. Set stop conditions for crash/5xx/performance regression.
- Dependencies: P21-C05.
- Acceptance: Staging SHA equals tested Git SHA, metric thresholds and rollback documented, reviewer + owner signoff required before production.
- Required negatives: unsupported HDR/SDR, stale LUT SHA, clipped highlights, incorrect color space.
- Tests: node --test tests/cloud-color-grade.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

### P22 — Smart B-Roll

Capability: smart-b-roll. Owner suggestion: catalog/timeline. Dependencies: P16.

Source: explicit owned asset catalog with provenance, usage scope and license expiry.
Expected behavior: rank candidate inserts by meaning, aspect, motion direction, media handles and rights.
Negative tests: unknown/expired license, unauthorized URL read, SHA mismatch, missing attribution.
Real media scenario: 6-scene EDL includes owned B-roll, rejects expired file and preserves clip attribution.
User value: narratively relevant cutaways with provable rights.
Proposed code/test (not yet present): server/broll-catalog.mjs and tests/cloud-broll-rights.test.mjs.
OpenSpec: openspec/changes/professional-montage-p15-p24/specs/smart-b-roll/spec.md.

#### P22-C01 — Contract and threat model

- [ ] P22-C01 — TODO. Deliverable: montage/smart-b-roll-v1.json and JSON Schema.
- Actions: Write schema with stable project/scene IDs, revision CAS, source SHA-256, byte limits, permission/lease checks, compatibility and no side effects on deck.json. Define explicit owned asset catalog with provenance, usage scope and license expiry; reject unknown/expired license, unauthorized URL read, SHA mismatch, missing attribution.
- Dependencies: Existing P06/P08/P09 and current OpenSpec.
- Acceptance: Reviewed schema, 3 FRs mapped, positive and negative samples, old release unchanged.
- Required negatives: unknown/expired license, unauthorized URL read, SHA mismatch, missing attribution.
- Tests: node --test tests/cloud-broll-rights.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P22-C02 — Bounded functional vertical slice

- [ ] P22-C02 — TODO. Deliverable: server/broll-catalog.mjs.
- Actions: Implement one deterministic end-to-end behavior behind disabled-by-default feature flag. Use integer/rational timebase, pinned fixtures, retries and safe fail-closed fallback. Implement: rank candidate inserts by meaning, aspect, motion direction, media handles and rights.
- Dependencies: P22-C01, P16-C01.
- Acceptance: Core unit tests pass on repeated runs, stale source is rejected, deterministic output or documented tolerance.
- Required negatives: unknown/expired license, unauthorized URL read, SHA mismatch, missing attribution.
- Tests: node --test tests/cloud-broll-rights.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P22-C03 — MCP + REST + Studio preview

- [ ] P22-C03 — TODO. Deliverable: MCP/REST route and Studio scene editor.
- Actions: Implement typed read/write and preview endpoints scoped to distinct authenticated principals, P06 fence tokens and expected revisions; add undo and human override in editor. Expose revisioned preview for narratively relevant cutaways with provable rights; leave published release unchanged.
- Dependencies: P22-C02.
- Acceptance: Foreign worker and expired token are denied, CAS conflict shown in UI, reviewer can compare prior/candidate; no implicit approval.
- Required negatives: unknown/expired license, unauthorized URL read, SHA mismatch, missing attribution.
- Tests: node --test tests/cloud-broll-rights.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P22-C04 — Negative and regression suite

- [ ] P22-C04 — TODO. Deliverable: tests/cloud-broll-rights.test.mjs.
- Actions: Add adversarial tests for malformed input, external URLs, hash drift, resource exhaustion, concurrency, cancellation, corrupt media and post-approval mutation. Exercise deliberately broken cases: unknown/expired license, unauthorized URL read, SHA mismatch, missing attribution.
- Dependencies: P22-C03.
- Acceptance: All relevant threat cases fail closed, no neighboring scene touched, old approved MP4 survives; CI exact exit code recorded.
- Required negatives: unknown/expired license, unauthorized URL read, SHA mismatch, missing attribution.
- Tests: node --test tests/cloud-broll-rights.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P22-C05 — Real six-scene E2E and QA

- [ ] P22-C05 — TODO. Deliverable: Docker real media job and immutable artifact.
- Actions: Render owned/licensed media through production-equivalent Chromium+FFmpeg in Docker; compare decoded PTS, timing, audio, screenshots and A/B against untouched baseline. Run real media test: 6-scene EDL includes owned B-roll, rejects expired file and preserves clip attribution.
- Dependencies: P22-C04.
- Acceptance: Real MP4/H.264 evidence with SHA and screenshot/frame IDs, no mandatory media tests skipped, independent human creative review.
- Required negatives: unknown/expired license, unauthorized URL read, SHA mismatch, missing attribution.
- Tests: node --test tests/cloud-broll-rights.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P22-C06 — Canary, operations and rollback

- [ ] P22-C06 — TODO. Deliverable: Railway staging canary report.
- Actions: Run staging-only feature flag against tested commit; capture CPU/RAM/p95/render queue/cost and 5xx; kill/restart test and verify previous release restoration. Measure and compare: narratively relevant cutaways with provable rights. Set stop conditions for crash/5xx/performance regression.
- Dependencies: P22-C05.
- Acceptance: Staging SHA equals tested Git SHA, metric thresholds and rollback documented, reviewer + owner signoff required before production.
- Required negatives: unknown/expired license, unauthorized URL read, SHA mismatch, missing attribution.
- Tests: node --test tests/cloud-broll-rights.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

### P23 — Creative Montage QA

Capability: creative-montage-qa. Owner suggestion: director + reviewer. Dependencies: P17,P18,P19,P20,P21,P22.

Source: source-pinned video/audio evidence and P03/P07 technical rules.
Expected behavior: timecoded multimodal QA with technical FAIL vs aesthetic REVIEW, calibrated thresholds.
Negative tests: fake confidence, missing samples, false positives on deliberate cuts, detector exception.
Real media scenario: 6 clean/corrupted fixtures, golden frame/audio evidence and precision/recall evaluation.
User value: useful QA without letting AI taste override human creativity.
Proposed code/test (not yet present): server/creative-qa.mjs and tests/cloud-creative-qa.test.mjs.
OpenSpec: openspec/changes/professional-montage-p15-p24/specs/creative-montage-qa/spec.md.

#### P23-C01 — Contract and threat model

- [ ] P23-C01 — TODO. Deliverable: montage/creative-montage-qa-v1.json and JSON Schema.
- Actions: Write schema with stable project/scene IDs, revision CAS, source SHA-256, byte limits, permission/lease checks, compatibility and no side effects on deck.json. Define source-pinned video/audio evidence and P03/P07 technical rules; reject fake confidence, missing samples, false positives on deliberate cuts, detector exception.
- Dependencies: Existing P06/P08/P09 and current OpenSpec.
- Acceptance: Reviewed schema, 3 FRs mapped, positive and negative samples, old release unchanged.
- Required negatives: fake confidence, missing samples, false positives on deliberate cuts, detector exception.
- Tests: node --test tests/cloud-creative-qa.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P23-C02 — Bounded functional vertical slice

- [ ] P23-C02 — TODO. Deliverable: server/creative-qa.mjs.
- Actions: Implement one deterministic end-to-end behavior behind disabled-by-default feature flag. Use integer/rational timebase, pinned fixtures, retries and safe fail-closed fallback. Implement: timecoded multimodal QA with technical FAIL vs aesthetic REVIEW, calibrated thresholds.
- Dependencies: P23-C01, P17-C01, P18-C01, P19-C01, P20-C01, P21-C01, P22-C01.
- Acceptance: Core unit tests pass on repeated runs, stale source is rejected, deterministic output or documented tolerance.
- Required negatives: fake confidence, missing samples, false positives on deliberate cuts, detector exception.
- Tests: node --test tests/cloud-creative-qa.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P23-C03 — MCP + REST + Studio preview

- [ ] P23-C03 — TODO. Deliverable: MCP/REST route and Studio scene editor.
- Actions: Implement typed read/write and preview endpoints scoped to distinct authenticated principals, P06 fence tokens and expected revisions; add undo and human override in editor. Expose revisioned preview for useful QA without letting AI taste override human creativity; leave published release unchanged.
- Dependencies: P23-C02.
- Acceptance: Foreign worker and expired token are denied, CAS conflict shown in UI, reviewer can compare prior/candidate; no implicit approval.
- Required negatives: fake confidence, missing samples, false positives on deliberate cuts, detector exception.
- Tests: node --test tests/cloud-creative-qa.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P23-C04 — Negative and regression suite

- [ ] P23-C04 — TODO. Deliverable: tests/cloud-creative-qa.test.mjs.
- Actions: Add adversarial tests for malformed input, external URLs, hash drift, resource exhaustion, concurrency, cancellation, corrupt media and post-approval mutation. Exercise deliberately broken cases: fake confidence, missing samples, false positives on deliberate cuts, detector exception.
- Dependencies: P23-C03.
- Acceptance: All relevant threat cases fail closed, no neighboring scene touched, old approved MP4 survives; CI exact exit code recorded.
- Required negatives: fake confidence, missing samples, false positives on deliberate cuts, detector exception.
- Tests: node --test tests/cloud-creative-qa.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P23-C05 — Real six-scene E2E and QA

- [ ] P23-C05 — TODO. Deliverable: Docker real media job and immutable artifact.
- Actions: Render owned/licensed media through production-equivalent Chromium+FFmpeg in Docker; compare decoded PTS, timing, audio, screenshots and A/B against untouched baseline. Run real media test: 6 clean/corrupted fixtures, golden frame/audio evidence and precision/recall evaluation.
- Dependencies: P23-C04.
- Acceptance: Real MP4/H.264 evidence with SHA and screenshot/frame IDs, no mandatory media tests skipped, independent human creative review.
- Required negatives: fake confidence, missing samples, false positives on deliberate cuts, detector exception.
- Tests: node --test tests/cloud-creative-qa.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P23-C06 — Canary, operations and rollback

- [ ] P23-C06 — TODO. Deliverable: Railway staging canary report.
- Actions: Run staging-only feature flag against tested commit; capture CPU/RAM/p95/render queue/cost and 5xx; kill/restart test and verify previous release restoration. Measure and compare: useful QA without letting AI taste override human creativity. Set stop conditions for crash/5xx/performance regression.
- Dependencies: P23-C05.
- Acceptance: Staging SHA equals tested Git SHA, metric thresholds and rollback documented, reviewer + owner signoff required before production.
- Required negatives: fake confidence, missing samples, false positives on deliberate cuts, detector exception.
- Tests: node --test tests/cloud-creative-qa.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

### P24 — Professional Timeline

Capability: professional-timeline. Owner suggestion: catalog/timeline. Dependencies: P17,P19,P23.

Source: approved scene versions, rational timebase and owned audio tracks.
Expected behavior: versioned edit DAG with undo/redo, clean OTIO/EDL interchange and explicit loss report.
Negative tests: stale worker, cyclic tracks, invalid trim, unsupported effect silently dropped.
Real media scenario: 6-scene NLE timeline roundtrip, exact cut PTS, audio tracks and reversible edits.
User value: editable delivery alongside immutable MP4 with proven provenance.
Proposed code/test (not yet present): server/professional-timeline.mjs and tests/cloud-timeline-otio.test.mjs.
OpenSpec: openspec/changes/professional-montage-p15-p24/specs/professional-timeline/spec.md.

#### P24-C01 — Contract and threat model

- [ ] P24-C01 — TODO. Deliverable: montage/professional-timeline-v1.json and JSON Schema.
- Actions: Write schema with stable project/scene IDs, revision CAS, source SHA-256, byte limits, permission/lease checks, compatibility and no side effects on deck.json. Define approved scene versions, rational timebase and owned audio tracks; reject stale worker, cyclic tracks, invalid trim, unsupported effect silently dropped.
- Dependencies: Existing P06/P08/P09 and current OpenSpec.
- Acceptance: Reviewed schema, 3 FRs mapped, positive and negative samples, old release unchanged.
- Required negatives: stale worker, cyclic tracks, invalid trim, unsupported effect silently dropped.
- Tests: node --test tests/cloud-timeline-otio.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P24-C02 — Bounded functional vertical slice

- [ ] P24-C02 — TODO. Deliverable: server/professional-timeline.mjs.
- Actions: Implement one deterministic end-to-end behavior behind disabled-by-default feature flag. Use integer/rational timebase, pinned fixtures, retries and safe fail-closed fallback. Implement: versioned edit DAG with undo/redo, clean OTIO/EDL interchange and explicit loss report.
- Dependencies: P24-C01, P17-C01, P19-C01, P23-C01.
- Acceptance: Core unit tests pass on repeated runs, stale source is rejected, deterministic output or documented tolerance.
- Required negatives: stale worker, cyclic tracks, invalid trim, unsupported effect silently dropped.
- Tests: node --test tests/cloud-timeline-otio.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P24-C03 — MCP + REST + Studio preview

- [ ] P24-C03 — TODO. Deliverable: MCP/REST route and Studio scene editor.
- Actions: Implement typed read/write and preview endpoints scoped to distinct authenticated principals, P06 fence tokens and expected revisions; add undo and human override in editor. Expose revisioned preview for editable delivery alongside immutable MP4 with proven provenance; leave published release unchanged.
- Dependencies: P24-C02.
- Acceptance: Foreign worker and expired token are denied, CAS conflict shown in UI, reviewer can compare prior/candidate; no implicit approval.
- Required negatives: stale worker, cyclic tracks, invalid trim, unsupported effect silently dropped.
- Tests: node --test tests/cloud-timeline-otio.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P24-C04 — Negative and regression suite

- [ ] P24-C04 — TODO. Deliverable: tests/cloud-timeline-otio.test.mjs.
- Actions: Add adversarial tests for malformed input, external URLs, hash drift, resource exhaustion, concurrency, cancellation, corrupt media and post-approval mutation. Exercise deliberately broken cases: stale worker, cyclic tracks, invalid trim, unsupported effect silently dropped.
- Dependencies: P24-C03.
- Acceptance: All relevant threat cases fail closed, no neighboring scene touched, old approved MP4 survives; CI exact exit code recorded.
- Required negatives: stale worker, cyclic tracks, invalid trim, unsupported effect silently dropped.
- Tests: node --test tests/cloud-timeline-otio.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P24-C05 — Real six-scene E2E and QA

- [ ] P24-C05 — TODO. Deliverable: Docker real media job and immutable artifact.
- Actions: Render owned/licensed media through production-equivalent Chromium+FFmpeg in Docker; compare decoded PTS, timing, audio, screenshots and A/B against untouched baseline. Run real media test: 6-scene NLE timeline roundtrip, exact cut PTS, audio tracks and reversible edits.
- Dependencies: P24-C04.
- Acceptance: Real MP4/H.264 evidence with SHA and screenshot/frame IDs, no mandatory media tests skipped, independent human creative review.
- Required negatives: stale worker, cyclic tracks, invalid trim, unsupported effect silently dropped.
- Tests: node --test tests/cloud-timeline-otio.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

#### P24-C06 — Canary, operations and rollback

- [ ] P24-C06 — TODO. Deliverable: Railway staging canary report.
- Actions: Run staging-only feature flag against tested commit; capture CPU/RAM/p95/render queue/cost and 5xx; kill/restart test and verify previous release restoration. Measure and compare: editable delivery alongside immutable MP4 with proven provenance. Set stop conditions for crash/5xx/performance regression.
- Dependencies: P24-C05.
- Acceptance: Staging SHA equals tested Git SHA, metric thresholds and rollback documented, reviewer + owner signoff required before production.
- Required negatives: stale worker, cyclic tracks, invalid trim, unsupported effect silently dropped.
- Tests: node --test tests/cloud-timeline-otio.test.mjs (proposed; not yet present), npm run build, npm run test:cloud; for C05 Docker real Chromium/FFmpeg; record actual result, do not invent.
- Evidence: exact source commit; authorized input licenses and SHA; output screenshot/MP4 SHA if applicable; observed test command/exit; CI URL; human review; timestamp.
- Rollback: feature flag off or discard draft sidecar; previous P08 approved MP4 and P05 release pointer remain untouched.
- Blocked if: any unauthorized asset, skipped mandatory real-media case, source drift, stale lease, false approved flag, missing reviewer or corrupted artifact.

## Cross-feature release checkpoints

- [ ] GATE-01: 60 checkpoints ACCEPTED with independent SHA/CI evidence.
- [ ] GATE-02: 10 OpenSpec capabilities / 30 SHALL requirements / 60 WHEN-THEN scenarios pass strict and traceability checks.
- [ ] GATE-03: six-scene real media end-to-end, including failed job, restart, backpressure, audio overlap, font fallback and invalid license.
- [ ] GATE-04: blinded human A/B on >=3 owned/licensed projects plus technical QA confusion matrix.
- [ ] GATE-05: staging deployment matches tested commit SHA, rollback actually exercised and human owner authorizes release.

No gate is complete on plan creation.
