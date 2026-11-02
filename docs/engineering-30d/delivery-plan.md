# 30-day engineering delivery plan — hypothesis, not promise

**Status: DRAFT**. Calendar days are indexed **D01–D30 from the actual authorized start**, not automatically from PR creation. One day of fast M58 synthetic tests does not imply 60 fully accepted features in 30 days. The target is **highest-value production-worthy vertical slices with evidence**; all remaining feature proposals stay visible, prioritized and truthfully incomplete.

## 0. Source and target accounting

- The existing root register: 55 P01–P10 cards, 22 historically marked [x], 33 unchecked.
- The existing M01–M60 register: 60 proposed capabilities × 8 planned C01–C08 = 480 initially unchecked stages.
- The combined engineering queue may contain 535 records. **513 unchecked records is not 513 independent missing functions or 513 production release approvals.**
- Current PRs of other efforts must be tracked by exact head SHA (M51 and M58 are experimental branches, not inferred mainline shipped). A merge alone does not advance formal C05/C06/C07/C08.
- Plan marks no current task accepted; status remains authoritative in original files.

## 1. What must become demonstrably usable

The shortest useful product workflow:

\`\`\`text
approved script + owned media + typed scene brief
  -> four agents work independently on owned scenes
  -> isolated rendering with bounded CPU/RAM, recovery and retries
  -> six coherent 3–7s H264/AAC scenes
  -> P05 assembly and metadata/AV QA
  -> timecoded reviewer feedback / versioned revisions
  -> human editorial accept / verified rights
  -> immutable release; previous approved release survives failure
\`\`\`

A demo is insufficient if a user cannot reproduce it with a **fresh** project and authorized source material, or if previous approved releases are overwritten.

## 2. Priority classes and dependencies

**G0 safety baseline, mandatory:** P02/P03/P05/P06/P07/P08/P10, source/rights gates M32, authenticated source/reviewer receipts, old-release integrity. A blocker here prevents downstream real acceptance.

**G1 highest leverage for vertical slice:** M40 typed briefs, M50 durable work + release candidate, M51 timecoded QC, M58 quality/performance evidence, M26 typography, M42 preview, M41 incremental render, M13 audio mixing, M54 flash safety. Those names reflect TOP-60 rank, **not all are currently implemented**.

**G2 UX/editorial value:** M01 rational edit graph, M11 word timing, M05 transactional edit, M56 golden frame/PCM, M52 speech meters, M24 reframe, M18 A/V drift, M44 parallel six-scene orchestration.

**G3 research/long tail:** opt-in AI and advanced rendering improvements with uncertain licenses/data, low practicality or unmeasured quality; prototype only when G0/G1 gates are not starved.

Per capability: first check actual current code and open PR overlap. If an existing Pxx/Mxx service solves the problem, extend it; duplicate implementations require ADR-ED-06 with measurable justification. Product code changes stay in implementation PRs, not this spec PR.

## 3. Four developers and one architect

| Role | Primary *preference*, never unconditional assignment | Cannot do |
|---|---|---|
| dev-1 | P02/P10/M40/M50 control plane and typed contracts | Self-review, modify another agent's files |
| dev-2 | P09/M11/M13/M15/M18/M52 audio/word timing | Author licensing assertions or alter protected script |
| dev-3 | P01/M21/M24/M26/M54 typography/visual/motion | Change global style owner policy without authorization |
| dev-4 | P03/P05/P07/P08/M41/M42/M51/M58 integration and quality | Approve its own CI/media or merge main |
| architect | ADR, dependency graph, cross-module review, blocking failure fixes | Issue owner credentials or silently approve release |

Developer lane is advisory. Actual dispatch chooses ready cards satisfying file locks, dependency stage, available reviewer and resource budget. In shortage of code, agent checks foreign PR review and actionable unblocks before IDLE. Do not create filler work just to increase utilization.

### Work-in-progress and review throughput

Initial **proposed** limits: max 4 code leases, max 2 review leases, max 1 integration slot for a shared API, max 1 CPU-heavy FFmpeg E2E per resource-constrained Windows host (verify and tune by measured memory). Never prescribe exact model tokens without a provider measurement.

No feature is started merely to fill all four slots if the acceptance pipeline is saturated. A merge train must re-test actual rebased HEAD; unverified peers do not advance authoritative C01–C08.

## 4. Milestone plan (not assumed done)

| Day | Focus | Falsifiable deliverable / gate |
|---|---|---|
| D01 | Source inventory | Exact git/spec SHA, task counts, current PR overlap, baseline test results |
| D02 | Auth + environment | One shared coordinator proven from five independently identified sessions or documented BLOCKED |
| D03 | Concurrency | Four parallel distinct claims; expired actor rejected; no same-file writes |
| D04 | Reviewer boundary | Foreign review and owner pending work; no self-approval possible |
| D05 | P02/M50 resilience | SIGKILL/renew/reclaim test plan + initial bounded integration proof |
| D06 | P10/M40 | Typed scene brief and owner/scope boundary; no unapproved author changes |
| D07 | Milestone 1 | Audit all blockers; live 6-scene workflow baseline; rescope if mandatory infra missing |
| D08 | P03/M51 | Timecoded machine QA -> reviewer annotations, exact input/output SHA |
| D09 | P05/P08 | Deterministic assemble and rollback proof, old release preserved |
| D10 | M32 rights | Media provenance and license manifests or explicit rights blockers |
| D11 | P09/M11 | Rational timebase, word-map source integrity, no invented alignment |
| D12 | M13/M52 | Genuine voice/music mix QA with owned stems, no surrogate claims |
| D13 | M26/M54 | Cyrillic/fallback glyph, mobile safe area and flashing negative cases |
| D14 | Milestone 2 | Real or authorized owned-media E2E (not synthetic-only), independent defects review |
| D15 | M42 preview | Proxy -> master identity/invalidation and perceptual limitations |
| D16 | M41 cache | Exact dependency invalidation, damaged cache negative, six-scene speed baseline |
| D17 | M05/M01 | Bounded edit graph/ripple, reversible transaction and stable timebase |
| D18 | P07/P08 | Human review + revision CAS, historical MP4 unaffected |
| D19 | M44 resource scheduler | Six-scene parallelism within real CPU/RSS budgets and expiry recovery |
| D20 | Integration day | Stabilize cross-module APIs; no new broad refactor without ADR |
| D21 | Milestone 3 | End-to-end staged demo, six original owned clips, fault inject and measured throughput |
| D22 | M56 regression | Golden frames/PCM on pinned toolchain and multiple FPS |
| D23 | M24 and UX | Licensed source reframe and rational crop test, no content loss |
| D24 | Evidence | Exact CI SHA, artifacts, reviewers, rights, code reuse review; no silent gaps |
| D25 | Security | Stale role/fence, malicious text, file traversal, forged media metadata |
| D26 | Crash and restore | Queue/FFmpeg kill, DB backup restore, stale tokens and old release integrity |
| D27 | Staging | Explicit opt-in only; deployed SHA, real smoke/rollback before any higher release gate |
| D28 | A/B | Blind technical vs artistic review; regressions and effect size with sample uncertainty |
| D29 | Release readiness | Identify ACCEPTED/OWNER_PENDING/REWORK/BLOCKED independently; no auto-merge |
| D30 | Milestone 4 | Independent objective scorecard, owner decision, outstanding backlog and next slice |

D01–D30 are **planned checkpoints, not assignments already claimed**. When dependencies or independent authorization are missing, keep the affected milestone BLOCKED and continue safe unrelated work; retain source SHA and audit reason.

## 5. Daily scoreboard and deadline mathematics

Use a daily record containing:

\`\`\`text
day, spec_sha, main_sha, reviewed_PRs, formally_accepted_C_cards,
owner_pending, ready_code, ready_review, active_code, dependency_blocked,
environment_blocked, rework_rate, defect_escape_count, p50_cycle_hours,
p95_cycle_hours, p95_review_wait_hours, actual_CI_success_on_head,
six_scene_E2E_verified, real_media_license_verified,
estimated_remaining_days_with_method_and_uncertainty
\`\`\`

- \`throughput_verified = unique externally evidenced and peer-reviewed cards / measured active days\`.
- \`throughput_accepted = unique signed owner-accepted stages / measured active days\` (different metric).
- \`queue_latency\`, \`review_latency\` and \`blocked_latency\` measured separately.
- \`required_rate = verified_remaining_cards / remaining_calendar_days\` **only if goal is to finish every card**, not the default product objective.
- With the baseline 513 unchecked cards and a 30-day hypothetical deadline, 17.1 review-evidenced cards/calendar-day would be needed. This does **not** establish feasibility or guarantee formal owner acceptance.
- From at least 3–5 full daily observations, estimate feasible next 7-day capacity by observed completion and variance, adjust priority by longest reviewed dependency path.
- Never use raw messages, simulated agents, commits, synthetic video output or rewritten Markdown as accepted delivery.

### Objective measurements (with baselines)

Capture a pinned 6-scene test suite across 24/25/30 and rational FPS when relevant, licensed human speech/music, known fallback fonts, visual discontinuity, a cache corruption and a forced worker death. Compare to exact same baseline at pinned toolchain, hardware, source SHA and sampling strategy. Track p50/p95 wall time, bytes rendered, peak RSS, cache invalidation precision, production defects caught, listening/artist A/B and true human task time. Synthetic fixtures are valuable for fault detection but insufficient to claim human professional video quality.

## 6. Critical bottleneck triggers

| Trigger | Response without compromising safety |
|---|---|
| More than 2 real review cards waiting 24h | architect takes review first; eligible developers help foreign review |
| >1 developer idle while READY tasks exist | inspect lock/lease/host capacity and scheduler fairness; issue bug with evidence |
| All four developers blocked on one shared API | architect resolves contract and integration slot before further parallel edits |
| Rework >25% for a rolling measured week | stop feature breadth, investigate design ambiguity, duplicate code and failing tests |
| CI false-green / mismatch to PR HEAD | quarantine affected evidence, invalidate review and rerun |
| Missing source license / real media rights | synthetic test can continue; real-media acceptance and production remain blocked |
| Local Workspace tunnel down | issue environmental blocker, no fake automation work; repair connector separately |
| Daily velocity insufficient for initial goal | reduce feature breadth by ranked, owner-reviewed choice; NEVER suppress tests/reviews |
| Failed rollback, released artifact mutation | stop all release-oriented tasks until regression repaired and independently verified |

Percent/time limits above are **proposed management trigger thresholds** to calibrate with real observations, not currently met SLAs.

## 7. What a legitimate 30-day success looks like

**Minimum:** demonstrably stable and safe six-scene end-to-end editor + bounded multi-agent flow, verified independent peer review, immutable media releases, reproducible CI, measurable improvements on owned/authorized footage, user-visible backlog and honest remaining work.

**Stretch:** many high-rank M slices integrated, C01–C08 stages accepted where evidence genuinely exists. **Not required / not permitted:** all 60 proposals auto-marked done; bypass rights, staged review, user approval, independent art assessment; activation of unrelated agents or production services without explicit authority.

If D07/D14 gates fail, the owner reviews scope and revises this plan. No fictitious 100% success narrative.
