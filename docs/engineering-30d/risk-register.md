# ED risk register, controls and decision log

**Status:** DRAFT. These are qualitative planning severity/likelihood scores, **not observed incidents or calibrated probabilities**. Severity (S) and likelihood (L): 1..5, score S×L. Severity 5 risks block release if their hard gate fails; no velocity target can waive owner rights, safety or provenance.

## Prioritized engineering risks

| ID | Failure mode | S | L | Band | Detection signal | Required mitigation | Negative acceptance fixture | ED crosswalk |
|---|---|---:|---:|---|---|---|---|---|
| R03 | Fictitious task acceptance | 5 | 5 | CRITICAL | Agent self-reports success, checkbox flips without evidence | Separate peer review/owner acceptance; exact-SHA provider CI attestation; default OFF | Bogus CI URL + forged reviewer receipt | ED-05 ED-34 ED-35 |
| R01 | Cross-host lease split-brain | 5 | 4 | CRITICAL | Two hosts issue same active task/nonce | Single-host pilot; Postgres transaction with unique active claim and fencing before multi-host | Concurrent 2-host claim + SIGKILL | ED-09 ED-18 ED-22 |
| R02 | Actor or reviewer spoofing | 5 | 4 | CRITICAL | Client role strings or shared MCP director credentials | Host-signed scoped principals; reject claimed role without server validation; reviewer independence | Forged actor + stolen/expired token | ED-19 ED-33 ED-37 |
| R04 | Stale PR/CI and TOCTOU | 5 | 4 | CRITICAL | PR head or spec updated after green test | Bind approvals to exact HEAD, source digest, latest CI attempt; revalidate after rebase | Late branch rewrite before merge | ED-03 ED-30 ED-34 |
| R05 | Unlicensed audio/visual media | 5 | 4 | CRITICAL | Generated or downloaded assets lack rights | Source ledger and human rights attestation; synthetic cannot pass real-footage gates | Missing license in real six-scene E2E | ED-36 ED-39 |
| R06 | Model prompt injection via PR content | 5 | 4 | CRITICAL | External issue instructs agent to ignore guardrails | Untrusted input handling, safe tool allowlist, authenticated policy | Malicious Markdown claiming system authority | ED-38 ED-37 |
| R07 | Duplicate implementation and incompatible APIs | 4 | 5 | CRITICAL | Two agents introduce equivalent ledger/service | Source/PR inventory; module ownership registry; ADR before shared public contract updates | Twin M50 impl and old consumer regression | ED-08 ED-27 ED-28 ED-32 |
| R08 | Unbounded integration WIP | 4 | 5 | CRITICAL | Many PRs await reviewer and merge while coding continues | WIP caps, review-first architect, developer fallback, measured p95 review wait | Twenty pending PRs and blocked source files | ED-10 ED-14 ED-15 |
| R11 | Local MCP/tunnel unavailability | 4 | 5 | CRITICAL | No workspace connection to code host | Typed ENV_BLOCKED, bounded retry, clear reconnect procedure, no stale completion | Drop tunnel during acquire/submission | ED-23 ED-24 |
| R13 | Over-optimistic 30-day promise | 4 | 5 | CRITICAL | Planning estimates based on atypical M58 implementation rate | Rolling 3–5 day observed throughput and uncertainty, owner-reviewed re-scope | Velocity falls below critical-path rate | ED-41 ED-43 ED-48 |
| R14 | Unsafe production deploy | 5 | 4 | CRITICAL | Green CI or autonomous worker updates Railway/main | Separate owner-signed staging/canary and release control, immutable rollback | Agent calls deploy without owner token | ED-35 ED-39 ED-40 |
| R15 | Old accepted MP4 overwritten after crash | 5 | 4 | CRITICAL | Interrupted FFmpeg or stale P08/P05 pointer write | Immutable output, atomic candidate rename, source revalidation and real SIGKILL test | Terminate during mux/commit, compare old SHA | ED-21 ED-39 ED-46 |
| R16 | Visual QA false confidence | 4 | 5 | CRITICAL | Synthetic silence/tone tests mistaken for real pro montage | Owned licensed media E2E, blinded human A/B and negative injections | Synthetic PASS but human unreadable titles | ED-44 ED-46 ED-47 |
| R19 | Memory/CPU saturation | 4 | 5 | CRITICAL | Four agents each launch FFmpeg on one laptop | Separate code WIP vs heavy-render budget; host memory guard, job queue priorities | Four heavy E2Es with bounded RSS | ED-10 ED-42 ED-45 |
| R20 | Privacy/secret leakage | 5 | 4 | CRITICAL | Lease token or video data logged/committed | Hashed lease storage, redaction, minimal telemetry and retention rules | Search logs and Git diff for tokens or transcripts | ED-18 ED-37 ED-42 |
| R21 | Incorrect performance uplift claims | 4 | 5 | CRITICAL | Warm/cold, toolchain/hardware mismatch, biased baseline | Pre-registered matched A/B, p50/p95, effect/confidence, source pins | Benchmark with changed GPU/codec | ED-41 ED-45 |
| R22 | Review conflict of interest | 5 | 4 | CRITICAL | Architect authored task or reviewer observes old HEAD | Foreign authenticated reviewer, version-bound decision, conflict-of-interest audit | Reviewer=submitter or PR head altered | ED-33 ED-34 ED-35 |
| R24 | Advisory ranking treated as hard DAG | 4 | 5 | CRITICAL | Pxx integration hints block C01 of otherwise ready M modules | Hard stage edges separately verified; advisory only guides planning | Future P24 dependency in M01 C02 | ED-06 ED-12 ED-13 |
| R25 | Silent scope creep across M01–M60 | 4 | 5 | CRITICAL | Agents write broad modules not linked to exact card | Checkpoint-to-PR traceability, file reservations, independent diff review | PR touches unowned files and protected scene | ED-04 ED-25 ED-29 |
| R09 | Queue starvation despite actionable work | 4 | 4 | HIGH | Ready tasks idle due to false dependency or priority ordering | Separate advisory/hard predecessor edges; deterministic fairness + aging; queue audit | W0 ready but no claim; planned P24 cycle | ED-12 ED-13 ED-14 |
| R10 | Source/worktree path collision | 4 | 4 | HIGH | Windows case-fold, symlink or ancestor overlaps | Normalized reservations, strict path containment, isolated worktrees, reviewer changed-files check | Reserved folder vs nested file; case variant | ED-25 ED-26 ED-37 |
| R17 | Speech timing or A/V drift | 4 | 4 | HIGH | Mixed FPS, incorrect PTS, delayed voice | Rational timebase, independent master decoding and source-pin, negative delay tests | 250ms late speech, 24000/1001 conversion | ED-44 ED-46 |
| R18 | Flash accessibility and typography failure | 4 | 4 | HIGH | Cyrillic missing glyph or unsafe flashes on master | Font source SHA, render frame checks, reduced motion, high-risk flash gate | Font fallback and high-contrast flicker | ED-44 ED-47 |
| R23 | External GitHub API partial commit | 4 | 4 | HIGH | Timeout after PR created, retry duplicates side effect | Outbox/idempotency marker; read-back reconciliation before retry | Force timeout after remote PR success | ED-21 ED-24 ED-30 |
| R28 | Unapproved autonomous schedule changes | 4 | 4 | HIGH | Active unrelated 5 scheduled agents silently retargeted | Separate consent-based automation setup; no schedule changes as part of spec | Attempt agent reassignment without explicit authorization | ED-19 ED-35 ED-48 |
| R12 | Coordinator data loss or SQLite corruption | 5 | 3 | HIGH | Copied live DB, lost WAL, journal unexpectedly reinitializes | Online backup and restore, schema checksums, transaction semantics, operator reconciliation | Kill during DB transaction and restore copy | ED-20 ED-21 |
| R26 | Dependency supply exhausted while reviewers idle | 3 | 5 | HIGH | Architect works on new features instead of review, devs idle | Priority to unblock, review-first, actionable rework if code supply empty | Review backlog with free reviewer hours | ED-14 ED-15 ED-16 |
| R27 | Inaccurate AI token accounting | 3 | 5 | HIGH | No provider accounting but estimates shown as measured | Explicit UNAVAILABLE, source attribution, avoid reconstructed true token assertions | Token metrics absent in scheduled chat | ED-42 ED-41 |

## Global decision records required before production

| ADR | Trade-off requiring a recorded decision | Recommended initial direction | Exit evidence |
|---|---|---|---|
| ADR-ED-01 | Engineering queue versus media/scene command planes | Separate coordination; no P10/M50 authority duplication | Architecture and API owner review |
| ADR-ED-02 | SQLite single-host versus Postgres multi-host | Limit SQLite pilot to one local volume; move only after concurrent chaos tests | Two-host split-brain test, schema migration, transactional outbox |
| ADR-ED-03 | User, developer and reviewer identity | Server-authenticated principal, per-repo scope and independent review | Forged-role and stale-token denial |
| ADR-ED-04 | Hard dependencies versus advisory integration points | Only C01–C08 stage gate and verified hard edges block; rank/wave guide scheduling | No false deadlock under full 60 M inventory |
| ADR-ED-05 | GitHub/CI attestation and merge train | Bind exact head SHA + latest CI attempt + reviewer decision | Rebase invalidation and remote timeout reconciliation |
| ADR-ED-06 | Code reuse and shared ABI ownership | One canonical source-of-truth per capability and ADR for shared interface changes | Duplicate-component rejection and consumer compatibility CI |
| ADR-ED-07 | Runtime resource budgeting | Limit WIP and heavy FFmpeg concurrency by measured machine envelope | CPU/RSS tests, p50/p95 and no P05 regressions |
| ADR-ED-08 | Retention, rights, human editorial signoff | Minimum necessary metadata; separate human approval from machine QA | License manifests, redaction, restore/deletion test |
| ADR-ED-09 | Product completeness versus 30-day speed | Vertical-slice readiness before breadth; freeze speculative long-tail work under safety regressions | Signed milestone and honest remaining backlog |

## Go/no-go and escalation (owner-owned)

- **P0 STOP:** unauthorized access; secrets/media leakage; unlicensed production media; old approved release corruption; false owner acceptance; cross-host duplicate commits. Stop affected pipeline and preserve evidence.
- **P1 ISOLATE:** reviewer shortage, repeated spec drift, staging CI mismatch, broken Local Workspace tunnel, queue saturation. Pause conflicting tasks while independent safe tasks continue.
- **P2 REPLAN:** falling velocity, non-critical media polish or optional research. Adjust scope/priority by measured value, not by deleting failing tests.
- **Recovery:** identify source/spec/host SHAs and last authenticated state; create independent incident record; verify fix under explicit negative fixture; require owner signature for resuming release-affecting work.

## Quantitative policy is still TBD

The risk severity/likelihood labels above are **initial expert hypotheses**. Reviewers should recalibrate scores with observed defect frequency, incident cost, vulnerability exposure and affected user count. An unknown measurement remains UNKNOWN, never zero. Risk can fall only after reproducible evidence and independent approval.
