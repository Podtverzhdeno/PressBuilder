# ED verification matrix — planned tests and evidence

> DRAFT / spec-only. The EDT scenarios below are **test specifications, not executed tests**. No proposed scenario is a PASS without a real implementation, an exact source/commit SHA, verified CI and independent review.

## One-to-one requirements crosswalk

The rows below are directly derived from specific WHEN/THEN requirements in [requirements.md](./requirements.md). The EDT-xx IDs are **planned tests**, not existing files.

| Planned test | Requirement | Positive WHEN/THEN | Mandatory negative WHEN/THEN |
|---|---|---|---|
| EDT-01 | ED-01 — Canonical read set | When Agent starts a fresh scheduled task → a fresh card and matching HEAD produce a pinned context digest. | When Assigned spec or HEAD cannot be read → missing or changed spec blocks code execution. |
| EDT-02 | ED-02 — Complete and truthful inventory | When Canonical P/M task registers are imported → import returns 535 distinct qualified IDs and 22 legacy checked P entries. | When A task card is duplicated or absent → duplicate, missing or malformed card fails closed without changing prior state. |
| EDT-03 | ED-03 — Spec drift | When A task card is reread under same source SHA → unchanged card can be reacquired on next safe run. | When Requirement digest changes after acquisition → same ID with changed acceptance language becomes STALE and cannot be submitted. |
| EDT-04 | ED-04 — Bounded executable task | When A bounded implementation card with tests is submitted → worker receives a task card with a verifiable done condition. | When Acceptance criteria or limits are undefined → vague or unbounded plan is deferred to architect, not coded as guessed behavior. |
| EDT-05 | ED-05 — Evidence and implementation separation | When A real test receipt is recorded → green unit test changes technical evidence only. | When An agent requests formal acceptance from its own output → CI or chat claim alone never changes an authoritative checkbox. |
| EDT-06 | ED-06 — Registry provenance | When Canonical rank and waves are read → top60 rank and wave remain identical to authoritative registry. | When An advisory edge creates a supposed hard cycle → advisory integration edge cannot fabricate a cycle or block all W0 work. |
| EDT-07 | ED-07 — Independent decision record | When Two agents propose competing shared API schemas → reviewed design resolves contract and updates references by exact SHA. | When No independent ADR settles an API conflict → two agents interpreting same contract differently cannot silently publish different APIs. |
| EDT-08 | ED-08 — Prior work reuse | When An existing service overlaps the work card → existing P10/M50 implementations are referenced instead of cloned. | When An unreviewed copy of existing behavior is proposed → a redundant scheduler/QA subsystem without an ADR is rejected at review. |
| EDT-09 | ED-09 — Atomic acquisition | When Four developers acquire on one shared journal → four simultaneous workers receive distinct cards or explicit idle. | When Concurrent workers request the same unclaimed task → two simultaneous workers cannot hold same active task. |
| EDT-10 | ED-10 — Bounded capacity | When Coding and render budgets remain within limits → a fifth coding request receives an explicit capacity result. | When Another worker exceeds an actual host budget → worker cannot saturate host by claiming arbitrary simultaneous projects. |
| EDT-11 | ED-11 — Stage sequence | When An M stage has a reviewed predecessor → M40-C02 becomes code-eligible only after peer-reviewed C01. | When A later stage lacks hard predecessor evidence → unchecked C08 cannot become ACCEPTED because C07 was only peer reviewed. |
| EDT-12 | ED-12 — Real integration dependency | When An M task has only future integration hints → unblocked isolated C02 slice may proceed while future P24 integration is pending. | When An advisory integration is treated as blocking → a false Pxx cycle shall not deadlock the backlog. |
| EDT-13 | ED-13 — Ready queue ordering | When Several tasks meet actual hard prerequisites → a blocker preventing four agents is preferred to cosmetic work. | When Top-ranked task is missing mandatory rights or stage → a rank #1 task without verified prerequisites is never leased as runnable. |
| EDT-14 | ED-14 — No starvation | When All code work is blocked but foreign review exists → idle worker receives real review without self-approval. | When A free worker is assigned fake filler tasks → no synthetic progress task or repeated empty churn is created. |
| EDT-15 | ED-15 — Queue health and fairness | When The coordinator reports every queue category → dashboard pinpoints whether lack of capacity or missing reviewer caused zero throughput. | When An owner-pending item is counted as ready-to-code → a single aggregate TODO number is never presented as actionable work. |
| EDT-16 | ED-16 — Replanning and reprioritization | When Measured delivery and blocker data are reviewed → blocked throughput triggers an explicit scoped replanning entry. | When An agent silently reorders global priorities → planner cannot overwrite 60 authoritative ranking scores without independent review. |
| EDT-17 | ED-17 — Explicit state machine | When A current permitted transition is attempted → submitted diff moves LEASED to REVIEW without changing a formal checkbox. | When A caller jumps directly from TODO to ACCEPTED → unverified report cannot jump directly to ACCEPTED. |
| EDT-18 | ED-18 — Fenced claims | When A live holder submits its matching fenced lease → current actor and fence permit heartbeat within TTL. | When An expired token attempts submit after reclaim → expired or replaced token cannot submit or renew. |
| EDT-19 | ED-19 — Real identities | When An authenticated scoped principal performs its operation → auth token maps to an authorized actor/project/role. | When A caller supplies director as an unverified role string → caller-supplied actor=architect cannot approve or read another tenant. |
| EDT-20 | ED-20 — Heartbeat/restart | When A claim is safely renewed or reclaimed after expiry → same lease heartbeat extends permitted work safely. | When Old worker returns after a higher fence exists → old worker finishing after replacement cannot overwrite new evidence. |
| EDT-21 | ED-21 — Atomic durability | When An expected-revision transaction is committed → process restart preserves task, receipts and known lease fence. | When The process dies between journal write and receipt → interrupted fs write cannot invent successful task completion. |
| EDT-22 | ED-22 — Cross-host migration gate | When One host coordinates on a single local SQLite file → migration can replay checked state onto Postgres under maintenance fence. | When Two hosts use copied or synchronized SQLite state → a second host with a cloned SQLite database is rejected. |
| EDT-23 | ED-23 — Error taxonomy | When A dependency returns typed success or error → disconnected MCP records ENV_BLOCKED with retry policy. | When The Local Workspace MCP tunnel is disconnected → network loss must never produce a fake PASS or silent task claim. |
| EDT-24 | ED-24 — Bounded retry policy | When A transient error has retry budget and stable idempotency key → transient fetch failure retries without duplicate PR. | When A permanent 401 or schema error repeats indefinitely → permanent schema/auth failure does not run forever or create new tasks. |
| EDT-25 | ED-25 — Branch and worktree isolation | When A worker edits only its own isolated worktree → two agents edit different files without interfering. | When An agent writes into a foreign worktree or customer deck → worker may not write into another task worktree or user deck. |
| EDT-26 | ED-26 — Global file reservations | When An authorized source path is available for reservation → conflict-free source paths can be reserved transactionally. | When Case-folded or ancestor file locks conflict → two agents cannot both reserve server/render-queue.mjs. |
| EDT-27 | ED-27 — Contract compatibility | When A shared API change includes a consumer compatibility plan → new typed contract retains prior supported input shape or formal migration. | When An exported field is silently renamed → silent field rename that breaks a different scene agent is rejected. |
| EDT-28 | ED-28 — Single source of truth | When Existing P10 M50 P06 and P08 contracts can be reused → M50 ledger reused by media QA while engineering coordinator remains separate. | When A second authoritative ledger is proposed → duplicate user-role rules and competing journal state machines fail review. |
| EDT-29 | ED-29 — Traceable implementation | When A PR links task IDs tests risk and owned files → M40-C03 PR names contract and negative test with source SHA. | When A PR contains unrelated source changes → drive-by refactor or unknown extra file requires re-scope. |
| EDT-30 | ED-30 — Dependency-safe integration | When A rebased PR has fresh tests for its new HEAD → non-conflicting independent PRs merge after exact-head CI. | When CI is green only for an older commit → green CI from old base cannot serve as final merge permission. |
| EDT-31 | ED-31 — Ownership handoff | When A transfer revokes old ownership and keeps evidence → crashed worker relinquishes ownership and new attempt is auditable. | When Former actor attempts stale submit → two alive workers cannot both publish outputs from the same attempt. |
| EDT-32 | ED-32 — Reuse quality gate | When Architect inventories shared validator code → small reusable service replaces repeated copy-pasted validation. | When A PR duplicates utility logic without ADR → new duplicate component without measurable justification is returned to REWORK. |
| EDT-33 | ED-33 — Independent reviewer | When An unrelated reviewer examines the exact submitted PR SHA → different authenticated reviewer examines exact PR HEAD. | When Author tries self-review or signs stale head → self-review or review of updated unseen SHA is invalidated. |
| EDT-34 | ED-34 — Evidence attestation | When Provider supplies verified CI and commit receipts → GitHub-retrieved success on exact SHA is evidence of completed CI. | When Agent invents CI URL or authorizes itself → agent-provided invented CI URL or sample hash never upgrades status. |
| EDT-35 | ED-35 — Multi-level gates | When A peer reviewer has completed technical checks → approved technical change still waits for owner C07/C08 where required. | When Peer review is used as owner C08 acceptance → a queue record with status reviewed cannot update production pointer. |
| EDT-36 | ED-36 — Rights and asset licensing | When Real media has an owned rights manifest → owned six-scene fixture with verified grants satisfies rights prerequisite. | When Unknown license or a surrogate is claimed licensed → unverified or synthetic surrogate cannot stand in for licensed production footage. |
| EDT-37 | ED-37 — Tenant and filesystem security | When Authorized worker accesses contained project paths → authorized worker sees own task and allowed paths. | When A foreign-tenant or traversal request is made → foreign tenant or arbitrary path escapes fail closed before IO. |
| EDT-38 | ED-38 — Untrusted tool output | When External PR text is parsed only as untrusted data → worker extracts a task description but still follows approved policy. | When Retrieved content orders agent to bypass system policy → instructions inside retrieved source cannot disable review or exfiltrate tokens. |
| EDT-39 | ED-39 — Release evidence gate | When Artifact and rights and rollback gates are independently met → staging tests and reviewer receipt are recorded separately from release permit. | When Synthetic MP4 is sole release evidence → a passing P05 synthetic MP4 alone cannot authorize customer publication. |
| EDT-40 | ED-40 — Auditable exceptions | When A scoped authenticated owner writes a bounded exception → time-limited reviewed policy change has an audit trail. | When Anonymous override waives rights or safety → anonymous exception cannot bypass stale rights or expired lease. |
| EDT-41 | ED-41 — Throughput measurement | When Daily throughput is computed from verified events → report shows median cycle time and review backlog from durable events. | When Fake commits are counted as accepted work → a count of generated commits cannot be used as delivery progress. |
| EDT-42 | ED-42 — Time and cost provenance | When Provider supplies measured tokens or wall clock → run exposes measured wall-time and explicit unavailable token metrics. | When Model input and output token usage is unavailable → estimated API token counts cannot be represented as exact ChatGPT consumption. |
| EDT-43 | ED-43 — Deadline feasibility | When Multiple actual delivery days are observed → if 300 cards remain with 15 days, dashboard shows >=20/day requirement. | When One fast M58 session is extrapolated to all TOP-60 → dashboard must not promise finish date from one fast M58 session. |
| EDT-44 | ED-44 — Functional coverage | When Real owned-media workflow passes full end-to-end → real owned media passes reproducible end-to-end and human A/B signoff. | When Green checklist has no actual reproducible video → 480 green peer-review cards with no deliverable fail product readiness. |
| EDT-45 | ED-45 — Performance SLO | When Baseline and candidate use same source/toolchain/hardware → accepted benchmark shows quality/performance without hidden regressions. | When Cold CPU is compared to warm GPU cache → single warm-cache timing or unsupported false speedup claim is rejected. |
| EDT-46 | ED-46 — Fault-injection matrix | When An actual FFmpeg mux failure is injected → after simulated SIGKILL original approved video remains intact. | When A status stub claims media crash recovery → test that merely fakes a status without actual media cannot prove mux safety. |
| EDT-47 | ED-47 — Quality and safety trend | When Defect escape and user quality are observed → additional feature accepted only with non-regressing release gates. | When Higher velocity coincides with unreviewed quality failure → net acceleration that doubles defect escape rate triggers replanning. |
| EDT-48 | ED-48 — Exit and pause gates | When Mandatory access safety and owner conditions remain valid → unresolved risky capability pauses while safe independent work continues. | When Deadline is cited to bypass hard controls → scheduler may not trade safety/rights or accepted releases for target throughput. |

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
