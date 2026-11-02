# Technical design — Top-60 montage workstreams

## Context and authority
Live baselines: P02 render queue, P03 technical QA, P04 style contract, P05 immutable assembly, P06 agent role and scene fencing, P07 review, P08 SHA-verified accepted scene files, P09 synchronization, P10 director, P11–P14 comparison/perf/release, P15–P18 partial implementation. Existing P17 review remains opt-in; P18 only has data-only motion calculation. There is no verified complete audio mixer, media-rights registry, universal timeline, visual motion editor or per-frame artistic scorer.

## Logical graph (future, not implemented here)

```text
P10 approved script/briefs --M40--> claim ledger M31, rights M32
         |                                   |
         v                                   v
alignment M11 --> canonical M01 EditGraph + actor-scoped M05 transaction
         |                    |
         |        per-scene P06 lease / P08 immutable version
         v                    v
audio mix M13/M15        visuals M21/M24 + P18/M22
         \                    /
          \--> typed FFmpeg/Chromium M45 --> render DAG M41
                                       |     |
                                    proxy M42  master P02/P05
                                       |     |
                                       v     v
                         timecoded QC M51 / accessibility M54
                                       |
                           human A/B review M57
                                       |
                signed proof M58 + durable journal M50
                                       |
                        immutable approved release only
                                       |
                     optional OTIO interchange M60
```

## Trust boundaries and atomicity
1. Actor identity from server OAuth or dedicated per-agent token, scoped to project/scene and relevant role; never trust `actor=director` in payload. Client file paths and URLs are never used directly by FFmpeg.
2. All edits are typed proposals carrying immutable source hashes and `expected_revision`. P06 fencing + optimistic CAS checks at commit. No worker may approve its own output or another agent's clip.
3. `deck.json` stays editor-owned. New state in versioned, bounded sidecars or transactional DB; temporary previews cannot update P08 approved pointer or P05 release.
4. Side-effectful worker jobs run separately from HTTP event loop with resource quotas and stale source/lease checks before and after media processing.
5. A proposed correction is rejected if source rights, provenance, protected script claims or legal authorizations are absent; no model confidence can substitute.

## Canonical time, media and reversibility
Use rational `{num,den}` frame rates, integer frame numbers, audio sample offsets and explicit PTS conversion for 24, 25, 30, 60, 24000/1001 and 30000/1001. Don't sum binary floating-point durations to decide edits. Mixed FPS must use documented duplication/interpolation policy; keep raw source PTS and output PTS separate.
Every source/image/frame/font/audio/model snapshot is content-addressed and versioned. Preview proxy != master: compare actual output master PCM and frame hashes. Encode pipelines are deterministic where feasible, and non-deterministic container metadata is called out explicitly.

## Proposed sidecars (versioned contracts, not extant endpoints)
- `edit-graph-v1` clip/tracks/audio/text/transition rational timeline; coordinator M01, transaction M05.
- `claims-v1` source-backed captions and assertions, source evidence and approvals; M31.
- `media-catalog-v1` licenses/ownership/sha/technical scan; M32.
- `word-map-v1` PCM sample positions/validity/confidence; M11.
- `mix-plan-v1` bounded audiospatial gains and loudness, stems; M13/M19.
- `geometry-style-v1` font/focus/crop/occlusion and three output ratios; M21/M24/M26.
- `render-dag-v1` source-dependency hash, cache version, scheduling, release-proof; M41/M50/M58.
- `qc-event-v1` timecoded video/audio issues and source references; M51.
- `timeline-exchange-v1` OTIO mapping and limitations; M60.

All schema revisions require migration/reviewer, strict extra-field rejection, max bytes/count/duration and old-read fallback. Services expose explainable `reason_code` and human review rationale; remove sensitive voice/text from telemetry.


### Семантика зависимостей и предотвращение циклов

Колонка `depends_on`/«зависимости» в M01–M60 **описывает точки интеграции с Pxx**, включая ещё НЕ реализованные P19–P24. Это не причинный DAG и не требование ждать полной реализации P24 перед M01. Машинное поле `recommended_predecessors` отдельно задаёт минимальный советуемый порядок для ключевых задач; для остальных — пустой список, а фактические входы проверяет C01. Пример: M01 начинает с уже проверенных P05/P08 и определяет будущий граф для P24, а не наоборот; M58 начинается с имеющихся P03/P05/P08 и позже расширяет acceptance P23. Все непроверенные capabilities блокируются на конкретном этапе, но не создают ложный глобальный цикл.

## Cost, measurements and quality claims
Compare matched six-scene baselines (synthetic fixtures plus licensed footage) under identical image digest, CPU/RAM/ffmpeg/Chromium versions, codec/color profile, source hashes, and output FPS. Record:
- `editor_minutes`: measured human time for the same script and deliverables; blind task order counterbalanced.
- `p50/p95_preview_ms`, `render_cpu_s`, `peak_rss_bytes`, `cost_per_accepted_minute`, `cache_hit_valid_rate` and invalidation precision.
- `quality`: timecoded hard technical failures, PCM loudness/peak and synchronization, mobile glyph clipping, controlled flash risk, verified media rights; blind artistic reviewer A/B is a **separate variable**.
- `failure recovery`: SIGKILL during mux/checksum/commit; no corrupted live artifact, deterministic retry and no leakage across tenants.
- All numeric thresholds in feature cards are *targets to test*, never claimed observed gains.

## Deployment stages
`D0 requirements` → `D1 typed contracts` → `D2 isolated pure pipeline` → `D3 director-only preview` → `D4 P06-scoped worker + concurrency testing` → `D5 Docker real Chromium/FFmpeg/PCM six-scene A/B` → `D6 independent reviewer and verified rights` → `D7 staging canary` → `D8 feature flag release`. By default only the first phases may progress in a spec PR; no unobserved work marked completed.

## Multiactor work partition
- Agent 1 editorial/P09/P15/P24, focus M01/M03/M05/M11.
- Agent 2 audio mix, focus M13/M15/M17/M52; no storyboard writes.
- Agent 3 visuals, focus M21/M24/M26/M54; no approved song or speech writes.
- Agent 4 render+QA, focus M41/M42/M50/M51/M58; must not self-approve.
- Fifth independent architect/reviewer controls OpenSpec conflict resolution, rights and release evidence; does not bypass gates. Existing separate scheduled agents in another project are **not** silently reassigned to PressBuilder.
- Any implementation agent must acquire real scope/lease and re-read current spec before starting, use isolated branch/PR, and never overwrite concurrently updated files.

## Technical risk and alternatives
| Decision | Preferred bounded approach | Rejected shortcut |
|---|---|---|
| Word alignment | consented optional local ASR + human reviewed word map | hallucinated timestamps from text |
| Color/typography | source-pinned rendering + protected brand/glyph checks | one global LUT or uncontrolled CSS |
| VMAF/perception | reference-aligned measurements, optional libvmaf build | “professional score” as proof |
| Many agents | per-scene write CAS + resource scheduler | shared director key + unlimited concurrency |
| Generated content | rights ledger, synthetic ranges and human signoff | auto fetch/auto publish |
| FFmpeg | whitelist typed FilterIR and fixed arguments | raw user `filter_complex` |
| NLE export | OTIO with explicit loss report | claim all effects round-trip automatically |

## Rollback and independence
Rollback = disable feature flag + discard proposal, leave P08/P05 pointer unchanged. For published changes ensure previous approved release is retained and immutable. Independent reviewers sign exact commit, input/output SHA, test CI URL, actual rendered video version and clip rights. Nothing in this change grants release approval.


## Engineering-delivery cross-cutting overlay (ED-RFC-1; proposed)

See [Engineering 30-day RFC](../../../docs/engineering-30d/README.md), [ED-01..ED-48 requirements](../../../docs/engineering-30d/requirements.md), [architecture](../../../docs/engineering-30d/architecture.md), [day-by-day delivery plan](../../../docs/engineering-30d/delivery-plan.md), [test and acceptance matrix](../../../docs/engineering-30d/verification.md), [risk register](../../../docs/engineering-30d/risk-register.md), [professional montage quality gates](../../../docs/engineering-30d/montage-quality-gates.md) and [60-capability machine traceability](../../../docs/engineering-30d/traceability.json).

This is a **spec-only coordination overlay**, not a replacement for the 60 independent requirements or the existing C01–C08 source checklist. Existing ranks/scores/waves, dependencies and ALL TODO/PROPOSED statuses remain authoritative and unchanged. The overlay:
1. Distinguishes five **engineering** agents from existing P10 **video scene** agents and M50 **media** QA jobs.
2. Defines exact-source SHA claims, actor authentication, independent review, bounded WIP and file ownership before concurrent code changes.
3. Separates *technical peer review*, *authenticated owner acceptance* and *media rights/artistic publishing authority*; green CI or synthetic media never substitutes for the latter.
4. Treats \`depends_on\` Pxx points as **integration hints**, not a false global causal DAG; only verified stage prerequisites block code scheduling. This preserves progress when an isolated M01 engine does not yet integrate with future P24.
5. Uses the 30-day goal as a **measurable hypothesis** with daily baselines, blocked-time, reviewer WIP, protected rollback and owner-governed re-scoping. It does not promise all M01–M60 C01–C08 accepted within 30 days.
6. Requires owned/licensed six-scene real media and human A/B when claiming professional audiovisual quality. No speed or decorative effect can waive rights, accessibility, source SHA or P05/P08 immutability.

**Pilot boundary:** PR #48 provides a local SQLite engineering queue, not authenticated multi-host scheduling. Existing unrelated scheduled automations are not reassigned. Production rollout requires host-enforced actor authentication, a shared transactional store, independently retrieved PR/CI evidence, staging chaos tests and explicit owner authorization.

**Validation of this spec overlay** may check exact ED-01..ED-48 crosswalk, the original 60/480 identities and Git blob pins; it **must not** mark any implementation checkpoint completed.
