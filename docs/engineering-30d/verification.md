# ED verification matrix — planned tests and evidence

> DRAFT / spec-only. The EDT scenarios below are **test specifications, not executed tests**. No proposed scenario is a PASS without a real implementation, an exact source/commit SHA, verified CI and independent review.

## One-to-one requirements crosswalk

| Planned test | Requirement | Positive scenario (WHEN/THEN) | Mandatory negative case |
|---|---|---|---|
| EDT-01 | ED-01 — Canonical read set | a valid action occurs THEN a fresh card and matching HEAD produce a pinned context digest. | an invalid, stale, unauthorized or conflicting action occurs THEN missing or changed spec blocks code execution. |
| EDT-02 | ED-02 — Complete and truthful inventory | a valid, authorized and current action occurs THEN import returns 535 distinct qualified IDs and 22 legacy checked P entries. | an invalid, stale, unauthorized or conflicting action occurs THEN duplicate, missing or malformed card fails closed without changing prior state. |
| EDT-03 | ED-03 — Spec drift | a valid, authorized and current action occurs THEN unchanged card can be reacquired on next safe run. | an invalid, stale, unauthorized or conflicting action occurs THEN same ID with changed acceptance language becomes STALE and cannot be submitted. |
| EDT-04 | ED-04 — Bounded executable task | a valid, authorized and current action occurs THEN worker receives a task card with a verifiable done condition. | an invalid, stale, unauthorized or conflicting action occurs THEN vague or unbounded plan is deferred to architect, not coded as guessed behavior. |
| EDT-05 | ED-05 — Evidence and implementation separation | a valid, authorized and current action occurs THEN green unit test changes technical evidence only. | an invalid, stale, unauthorized or conflicting action occurs THEN CI or chat claim alone never changes an authoritative checkbox. |
| EDT-06 | ED-06 — Registry provenance | a valid, authorized and current action occurs THEN top60 rank and wave remain identical to authoritative registry. | an invalid, stale, unauthorized or conflicting action occurs THEN advisory integration edge cannot fabricate a cycle or block all W0 work. |
| EDT-07 | ED-07 — Independent decision record | a valid, authorized and current action occurs THEN reviewed design resolves contract and updates references by exact SHA. | an invalid, stale, unauthorized or conflicting action occurs THEN two agents interpreting same contract differently cannot silently publish different APIs. |
| EDT-08 | ED-08 — Prior work reuse | a valid, authorized and current action occurs THEN existing P10/M50 implementations are referenced instead of cloned. | an invalid, stale, unauthorized or conflicting action occurs THEN a redundant scheduler/QA subsystem without an ADR is rejected at review. |
| EDT-09 | ED-09 — Atomic acquisition | a valid, authorized and current action occurs THEN four simultaneous workers receive distinct cards or explicit idle. | an invalid, stale, unauthorized or conflicting action occurs THEN two simultaneous workers cannot hold same active task. |
| EDT-10 | ED-10 — Bounded capacity | a valid, authorized and current action occurs THEN a fifth coding request receives an explicit capacity result. | an invalid, stale, unauthorized or conflicting action occurs THEN worker cannot saturate host by claiming arbitrary simultaneous projects. |
| EDT-11 | ED-11 — Stage sequence | a valid, authorized and current action occurs THEN M40-C02 becomes code-eligible only after peer-reviewed C01. | an invalid, stale, unauthorized or conflicting action occurs THEN unchecked C08 cannot become ACCEPTED because C07 was only peer reviewed. |
| EDT-12 | ED-12 — Real integration dependency | a valid, authorized and current action occurs THEN unblocked isolated C02 slice may proceed while future P24 integration is pending. | an invalid, stale, unauthorized or conflicting action occurs THEN a false Pxx cycle shall not deadlock the backlog. |
| EDT-13 | ED-13 — Ready queue ordering | a valid, authorized and current action occurs THEN a blocker preventing four agents is preferred to cosmetic work. | an invalid, stale, unauthorized or conflicting action occurs THEN a rank #1 task without verified prerequisites is never leased as runnable. |
| EDT-14 | ED-14 — No starvation | a valid, authorized and current action occurs THEN idle worker receives real review without self-approval. | an invalid, stale, unauthorized or conflicting action occurs THEN no synthetic progress task or repeated empty churn is created. |
| EDT-15 | ED-15 — Queue health and fairness | a valid, authorized and current action occurs THEN dashboard pinpoints whether lack of capacity or missing reviewer caused zero throughput. | an invalid, stale, unauthorized or conflicting action occurs THEN a single aggregate TODO number is never presented as actionable work. |
| EDT-16 | ED-16 — Replanning and reprioritization | a valid, authorized and current action occurs THEN blocked throughput triggers an explicit scoped replanning entry. | an invalid, stale, unauthorized or conflicting action occurs THEN planner cannot overwrite 60 authoritative ranking scores without independent review. |
| EDT-17 | ED-17 — Explicit state machine | a valid, authorized and current action occurs THEN submitted diff moves LEASED to REVIEW without changing a formal checkbox. | an invalid, stale, unauthorized or conflicting action occurs THEN unverified report cannot jump directly to ACCEPTED. |
| EDT-18 | ED-18 — Fenced claims | a valid, authorized and current action occurs THEN current actor and fence permit heartbeat within TTL. | an invalid, stale, unauthorized or conflicting action occurs THEN expired or replaced token cannot submit or renew. |
| EDT-19 | ED-19 — Real identities | a valid, authorized and current action occurs THEN auth token maps to an authorized actor/project/role. | an invalid, stale, unauthorized or conflicting action occurs THEN caller-supplied actor=architect cannot approve or read another tenant. |
| EDT-20 | ED-20 — Heartbeat/restart | a valid, authorized and current action occurs THEN same lease heartbeat extends permitted work safely. | an invalid, stale, unauthorized or conflicting action occurs THEN old worker finishing after replacement cannot overwrite new evidence. |
| EDT-21 | ED-21 — Atomic durability | a valid, authorized and current action occurs THEN process restart preserves task, receipts and known lease fence. | an invalid, stale, unauthorized or conflicting action occurs THEN interrupted fs write cannot invent successful task completion. |
| EDT-22 | ED-22 — Cross-host migration gate | a valid, authorized and current action occurs THEN migration can replay checked state onto Postgres under maintenance fence. | an invalid, stale, unauthorized or conflicting action occurs THEN a second host with a cloned SQLite database is rejected. |
| EDT-23 | ED-23 — Error taxonomy | a valid, authorized and current action occurs THEN disconnected MCP records ENV_BLOCKED with retry policy. | an invalid, stale, unauthorized or conflicting action occurs THEN network loss must never produce a fake PASS or silent task claim. |
| EDT-24 | ED-24 — Bounded retry policy | a valid, authorized and current action occurs THEN transient fetch failure retries without duplicate PR. | an invalid, stale, unauthorized or conflicting action occurs THEN permanent schema/auth failure does not run forever or create new tasks. |
| EDT-25 | ED-25 — Branch and worktree isolation | a valid, authorized and current action occurs THEN two agents edit different files without interfering. | an invalid, stale, unauthorized or conflicting action occurs THEN worker may not write into another task worktree or user deck. |
| EDT-26 | ED-26 — Global file reservations | a valid, authorized and current action occurs THEN conflict-free source paths can be reserved transactionally. | an invalid, stale, unauthorized or conflicting action occurs THEN two agents cannot both reserve server/render-queue.mjs. |
| EDT-27 | ED-27 — Contract compatibility | a valid, authorized and current action occurs THEN new typed contract retains prior supported input shape or formal migration. | an invalid, stale, unauthorized or conflicting action occurs THEN silent field rename that breaks a different scene agent is rejected. |
| EDT-28 | ED-28 — Single source of truth | a valid, authorized and current action occurs THEN M50 ledger reused by media QA while engineering coordinator remains separate. | an invalid, stale, unauthorized or conflicting action occurs THEN duplicate user-role rules and competing journal state machines fail review. |
| EDT-29 | ED-29 — Traceable implementation | a valid, authorized and current action occurs THEN M40-C03 PR names contract and negative test with source SHA. | an invalid, stale, unauthorized or conflicting action occurs THEN drive-by refactor or unknown extra file requires re-scope. |
| EDT-30 | ED-30 — Dependency-safe integration | a valid, authorized and current action occurs THEN non-conflicting independent PRs merge after exact-head CI. | an invalid, stale, unauthorized or conflicting action occurs THEN green CI from old base cannot serve as final merge permission. |
| EDT-31 | ED-31 — Ownership handoff | a valid, authorized and current action occurs THEN crashed worker relinquishes ownership and new attempt is auditable. | an invalid, stale, unauthorized or conflicting action occurs THEN two alive workers cannot both publish outputs from the same attempt. |
| EDT-32 | ED-32 — Reuse quality gate | a valid, authorized and current action occurs THEN small reusable service replaces repeated copy-pasted validation. | an invalid, stale, unauthorized or conflicting action occurs THEN new duplicate component without measurable justification is returned to REWORK. |
| EDT-33 | ED-33 — Independent reviewer | a valid, authorized and current action occurs THEN different authenticated reviewer examines exact PR HEAD. | an invalid, stale, unauthorized or conflicting action occurs THEN self-review or review of updated unseen SHA is invalidated. |
| EDT-34 | ED-34 — Evidence attestation | a valid, authorized and current action occurs THEN GitHub-retrieved success on exact SHA is evidence of completed CI. | an invalid, stale, unauthorized or conflicting action occurs THEN agent-provided invented CI URL or sample hash never upgrades status. |
| EDT-35 | ED-35 — Multi-level gates | a valid, authorized and current action occurs THEN approved technical change still waits for owner C07/C08 where required. | an invalid, stale, unauthorized or conflicting action occurs THEN a queue record with status reviewed cannot update production pointer. |
| EDT-36 | ED-36 — Rights and asset licensing | a valid, authorized and current action occurs THEN owned six-scene fixture with verified grants satisfies rights prerequisite. | an invalid, stale, unauthorized or conflicting action occurs THEN unverified or synthetic surrogate cannot stand in for licensed production footage. |
| EDT-37 | ED-37 — Tenant and filesystem security | a valid, authorized and current action occurs THEN authorized worker sees own task and allowed paths. | an invalid, stale, unauthorized or conflicting action occurs THEN foreign tenant or arbitrary path escapes fail closed before IO. |
| EDT-38 | ED-38 — Untrusted tool output | a valid, authorized and current action occurs THEN worker extracts a task description but still follows approved policy. | an invalid, stale, unauthorized or conflicting action occurs THEN instructions inside retrieved source cannot disable review or exfiltrate tokens. |
| EDT-39 | ED-39 — Release evidence gate | a valid, authorized and current action occurs THEN staging tests and reviewer receipt are recorded separately from release permit. | an invalid, stale, unauthorized or conflicting action occurs THEN a passing P05 synthetic MP4 alone cannot authorize customer publication. |
| EDT-40 | ED-40 — Auditable exceptions | a valid, authorized and current action occurs THEN time-limited reviewed policy change has an audit trail. | an invalid, stale, unauthorized or conflicting action occurs THEN anonymous exception cannot bypass stale rights or expired lease. |
| EDT-41 | ED-41 — Throughput measurement | a valid, authorized and current action occurs THEN report shows median cycle time and review backlog from durable events. | an invalid, stale, unauthorized or conflicting action occurs THEN a count of generated commits cannot be used as delivery progress. |
| EDT-42 | ED-42 — Time and cost provenance | a valid, authorized and current action occurs THEN run exposes measured wall-time and explicit unavailable token metrics. | an invalid, stale, unauthorized or conflicting action occurs THEN estimated API token counts cannot be represented as exact ChatGPT consumption. |
| EDT-43 | ED-43 — Deadline feasibility | a valid, authorized and current action occurs THEN if 300 cards remain with 15 days, dashboard shows >=20/day requirement. | an invalid, stale, unauthorized or conflicting action occurs THEN dashboard must not promise finish date from one fast M58 session. |
| EDT-44 | ED-44 — Functional coverage | a valid, authorized and current action occurs THEN real owned media passes reproducible end-to-end and human A/B signoff. | an invalid, stale, unauthorized or conflicting action occurs THEN 480 green peer-review cards with no deliverable fail product readiness. |
| EDT-45 | ED-45 — Performance SLO | a valid, authorized and current action occurs THEN accepted benchmark shows quality/performance without hidden regressions. | an invalid, stale, unauthorized or conflicting action occurs THEN single warm-cache timing or unsupported false speedup claim is rejected. |
| EDT-46 | ED-46 — Fault-injection matrix | a valid, authorized and current action occurs THEN after simulated SIGKILL original approved video remains intact. | an invalid, stale, unauthorized or conflicting action occurs THEN test that merely fakes a status without actual media cannot prove mux safety. |
| EDT-47 | ED-47 — Quality and safety trend | a valid, authorized and current action occurs THEN additional feature accepted only with non-regressing release gates. | an invalid, stale, unauthorized or conflicting action occurs THEN net acceleration that doubles defect escape rate triggers replanning. |
| EDT-48 | ED-48 — Exit and pause gates | a valid, authorized and current action occurs THEN unresolved risky capability pauses while safe independent work continues. | an invalid, stale, unauthorized or conflicting action occurs THEN scheduler may not trade safety/rights or accepted releases for target throughput. |

## Mandatory integration suites

### INT-01 Five-agent contention

Run 4 independent developer sessions and one reviewer on ONE transactional state. Attempt duplicate task claims, the same file with Windows case variants, ancestor/descendant path reservations and concurrent review, then expire a worker. Exactly one claimant owns each task/path; foreign reviewer only; stale fence cannot submit. Collect real concurrency logs and tool error codes.

### INT-02 Source pin and contract drift

Pin current main/spec/card/PR SHA, then change only one requirement and rebase an unrelated PR. Verify that stale leases/reviews/CI are rejected, only the changed card is blocked, untouched cards stay eligible. Force failure after creating a remote PR but before writing local receipt; reconcile by stable idempotency marker rather than duplicating PR.

### INT-03 True video output, not synthetic-only smoke

Use six authorized original/licensed H264/AAC clips (3–7s), real voice and music stems, rational FPS, Cyrillic fallback font, moving titles, a frame cut, one continuous audio overlap and SHA-pinned source. Render with actual Chromium+FFmpeg, validate image/PCM/PTS at master quality and inspect reviewer evidence. Inject corrupt frame, speech mute/delay, stale license and invalid lease separately. Existing accepted P08/P05 output SHA must not change even when FFmpeg is killed mid-mux.

### INT-04 Duplicate code and shared API

Assign two related modules that both propose a helper. Before editing, locate existing P10, M50, P06 and P08 contracts. Require one canonical owner interface, ADR for changes, consumer compatibility tests, file reservations and diff reconciliation. Reject duplicate authority and merge only with passing CI for exact current HEAD.

### INT-05 Metrics and reality check

Compare matched source, machine, toolchain and cold/warm conditions; capture p50/p95 elapsed, CPU, RSS, cache accuracy, human edit minutes, review queue time, rework, escaped defects, token counts only if measured. A million empty commits or green docs CI do not raise formally accepted feature count. If throughput misses the 30-day objective, trigger owner-approved rescope, never reduce safety gates.

## C01–C08 stage minimum evidence

These are minimum **proposed overlays**: the more specific original TOP-60 C01–C08 task requirements remain authoritative.

| Stage | Required proof | Fail-closed rejection |
|---|---|---|
| C01 | Typed contract, threat model, source/rights, positive and negative fixtures, owner semantics review | Ambiguous ownership or unsafe scope |
| C02 | Bounded pure engine, deterministic fixture, unit/negative checks, no protected media mutation | Invalid types, overflow, unbounded work |
| C03 | Authenticated API/MCP/Studio, lease/fence, CAS, idempotency, opt-in preview | Caller-supplied role, replay, foreign scene |
| C04 | Races, invalid source SHA, rollback, path traversal, fail-safe CI | Corrupt input or expired fence silently accepted |
| C05 | Six-scene real owned/licensed MP4+PCM, SHA/toolchain, injected audio/video failure | Synthetic-only media presented as human accepted output |
| C06 | Pinned p50/p95, CPU/RAM/cost, resource budget, staging SIGKILL/restart | Unmatched performance baseline or lost published pointer |
| C07 | Independent authenticated reviewer on exact PR HEAD, real visual/audio human A/B | Self-review, edited PR after review |
| C08 | Authenticated owner release decision, staging canary, reversible deploy | Automatic prod activation or unknown rights |

## Evidence receipt checklist

Each actual test receipt must include source commit SHA; spec and media input SHA; exact toolchain, OS, CLI and parameters; exit code; PASS/FAIL/SKIP; negative-case outcome; resource sample provenance; output artifact SHA; reviewer principal and exact reviewed HEAD; license rights record; and rollback decision. Missing proof is UNKNOWN/REVIEW, never numeric zero or PASS.

## Documentation-only verification

This RFC PR may validate exact 48 ED IDs, 48 EDT IDs, 60 M modules and 480 original unchecked C stages, no source-code changes, and strict OpenSpec structure. Those checks prove **spec integrity only**; they cannot assert that a production capability is implemented or approved.
