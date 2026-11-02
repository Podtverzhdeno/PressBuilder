# ED functional specification — 48 requirements

> **DRAFT / spec only.** In these requirements SHALL denotes a proposed enforceable contract, not behavior implemented today. Each requirement needs at least a positive and negative test and traceable evidence. Existing top-60 checkboxes remain unchanged.

**Identifiers:** ED-01..ED-48. **Subjects:** engineering queue for PressBuilder source code; P10 customer-scene director and M50 media-release ledger stay separate. **No automatic ChatGPT session spawning or privileged release authority.**

## Intake, exact source and change control

### ED-01 — Canonical read set

**SHALL:** Each run SHALL read AGENTS, exact assigned card, spec revision and Git HEAD before claiming.

- **WHEN** a valid action occurs **THEN** a fresh card and matching HEAD produce a pinned context digest.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** missing or changed spec blocks code execution.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-02 — Complete and truthful inventory

**SHALL:** A planner SHALL count all 55 P cards and exact 480 M stages, preserve original checklist markers and namespace identity.

- **WHEN** a valid, authorized and current action occurs **THEN** import returns 535 distinct qualified IDs and 22 legacy checked P entries.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** duplicate, missing or malformed card fails closed without changing prior state.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-03 — Spec drift

**SHALL:** A mutable card SHALL be pinned by its text digest plus source commit; drift invalidates existing authority.

- **WHEN** a valid, authorized and current action occurs **THEN** unchanged card can be reacquired on next safe run.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** same ID with changed acceptance language becomes STALE and cannot be submitted.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-04 — Bounded executable task

**SHALL:** Each code claim SHALL contain one explicit outcome, scope, real predecessor edges, acceptance commands, cost and rollback.

- **WHEN** a valid, authorized and current action occurs **THEN** worker receives a task card with a verifiable done condition.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** vague or unbounded plan is deferred to architect, not coded as guessed behavior.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-05 — Evidence and implementation separation

**SHALL:** Documented implementation progress SHALL remain separate from formal C01–C08 acceptance.

- **WHEN** a valid, authorized and current action occurs **THEN** green unit test changes technical evidence only.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** CI or chat claim alone never changes an authoritative checkbox.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-06 — Registry provenance

**SHALL:** Planner SHALL retain source SHA and schema version, distinguish advisory recommended_predecessors from hard gates.

- **WHEN** a valid, authorized and current action occurs **THEN** top60 rank and wave remain identical to authoritative registry.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** advisory integration edge cannot fabricate a cycle or block all W0 work.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-07 — Independent decision record

**SHALL:** An unresolved semantic conflict SHALL produce an ADR and owner decision checkpoint.

- **WHEN** a valid, authorized and current action occurs **THEN** reviewed design resolves contract and updates references by exact SHA.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** two agents interpreting same contract differently cannot silently publish different APIs.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-08 — Prior work reuse

**SHALL:** Before design, worker SHALL search source tree and active PRs for matching behavior, API, class and existing tests.

- **WHEN** a valid, authorized and current action occurs **THEN** existing P10/M50 implementations are referenced instead of cloned.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** a redundant scheduler/QA subsystem without an ADR is rejected at review.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

## Scheduling, dependencies, fairness and bounded WIP

### ED-09 — Atomic acquisition

**SHALL:** A shared coordinator SHALL issue at most one live lease for a given code card under concurrent claims.

- **WHEN** a valid, authorized and current action occurs **THEN** four simultaneous workers receive distinct cards or explicit idle.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** two simultaneous workers cannot hold same active task.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-10 — Bounded capacity

**SHALL:** Policy SHALL cap active coding claims at four, review WIP at configured capacity and isolate CPU/FFmpeg budgets.

- **WHEN** a valid, authorized and current action occurs **THEN** a fifth coding request receives an explicit capacity result.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** worker cannot saturate host by claiming arbitrary simultaneous projects.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-11 — Stage sequence

**SHALL:** An Mnn-Ckk next stage SHALL require independently reviewed predecessor stage; owner-required gates remain unresolved until owner acceptance.

- **WHEN** a valid, authorized and current action occurs **THEN** M40-C02 becomes code-eligible only after peer-reviewed C01.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** unchecked C08 cannot become ACCEPTED because C07 was only peer reviewed.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-12 — Real integration dependency

**SHALL:** Hard predecessor edges SHALL be evidence-backed and acyclic; speculative integration hints SHALL remain advisory.

- **WHEN** a valid, authorized and current action occurs **THEN** unblocked isolated C02 slice may proceed while future P24 integration is pending.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** a false Pxx cycle shall not deadlock the backlog.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-13 — Ready queue ordering

**SHALL:** Planner SHALL rank among actually ready tasks by safety-critical path, unblock value, risk, rank and aging; tie breaks deterministic.

- **WHEN** a valid, authorized and current action occurs **THEN** a blocker preventing four agents is preferred to cosmetic work.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** a rank #1 task without verified prerequisites is never leased as runnable.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-14 — No starvation

**SHALL:** When no eligible code is available, developers SHALL search foreign independent review, actionable unblock and authorized test maintenance in that order.

- **WHEN** a valid, authorized and current action occurs **THEN** idle worker receives real review without self-approval.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** no synthetic progress task or repeated empty churn is created.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-15 — Queue health and fairness

**SHALL:** Queue SHALL expose ready, dependency-blocked, reviewer-blocked, environment-blocked, active, stale and owner-pending separately.

- **WHEN** a valid, authorized and current action occurs **THEN** dashboard pinpoints whether lack of capacity or missing reviewer caused zero throughput.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** a single aggregate TODO number is never presented as actionable work.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-16 — Replanning and reprioritization

**SHALL:** Daily decisions SHALL use observed delivery lead time, defect escapes and critical dependency gates, with reviewed rank changes.

- **WHEN** a valid, authorized and current action occurs **THEN** blocked throughput triggers an explicit scoped replanning entry.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** planner cannot overwrite 60 authoritative ranking scores without independent review.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

## State, leases, identity and crash recovery

### ED-17 — Explicit state machine

**SHALL:** Each card SHALL distinguish TODO, READY, LEASED, REVIEW, REWORK, PEER_REVIEWED, OWNER_PENDING, ACCEPTED and BLOCKED with verified transitions.

- **WHEN** a valid, authorized and current action occurs **THEN** submitted diff moves LEASED to REVIEW without changing a formal checkbox.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** unverified report cannot jump directly to ACCEPTED.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-18 — Fenced claims

**SHALL:** Each lease SHALL use unpredictable secret, monotonically increasing fence, deadline and actor binding; tokens are stored hashed.

- **WHEN** a valid, authorized and current action occurs **THEN** current actor and fence permit heartbeat within TTL.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** expired or replaced token cannot submit or renew.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-19 — Real identities

**SHALL:** Production coordinator SHALL authenticate agents and reviewers through host-issued scoped principals, not a role string.

- **WHEN** a valid, authorized and current action occurs **THEN** auth token maps to an authorized actor/project/role.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** caller-supplied actor=architect cannot approve or read another tenant.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-20 — Heartbeat/restart

**SHALL:** Lost worker SHALL become reclaimable only after TTL and consistency checks; replay is idempotent.

- **WHEN** a valid, authorized and current action occurs **THEN** same lease heartbeat extends permitted work safely.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** old worker finishing after replacement cannot overwrite new evidence.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-21 — Atomic durability

**SHALL:** All coordination mutations SHALL be journaled atomically with transaction and revision checks.

- **WHEN** a valid, authorized and current action occurs **THEN** process restart preserves task, receipts and known lease fence.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** interrupted fs write cannot invent successful task completion.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-22 — Cross-host migration gate

**SHALL:** Multiple independent host workers SHALL require a shared transactional coordinator, not NFS SQLite or unsynchronized copies.

- **WHEN** a valid, authorized and current action occurs **THEN** migration can replay checked state onto Postgres under maintenance fence.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** a second host with a cloned SQLite database is rejected.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-23 — Error taxonomy

**SHALL:** Transport outage, stale spec, source conflict, missing authority, invalid license, test failure and pending review SHALL be distinct typed states.

- **WHEN** a valid, authorized and current action occurs **THEN** disconnected MCP records ENV_BLOCKED with retry policy.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** network loss must never produce a fake PASS or silent task claim.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-24 — Bounded retry policy

**SHALL:** Retries SHALL have finite backoff, idempotency key, attempt budget, quarantine and operator escalation.

- **WHEN** a valid, authorized and current action occurs **THEN** transient fetch failure retries without duplicate PR.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** permanent schema/auth failure does not run forever or create new tasks.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

## File ownership, code reuse and integration

### ED-25 — Branch and worktree isolation

**SHALL:** One implementation task SHALL operate in a dedicated branch/worktree with declared file ownership.

- **WHEN** a valid, authorized and current action occurs **THEN** two agents edit different files without interfering.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** worker may not write into another task worktree or user deck.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-26 — Global file reservations

**SHALL:** Coordinator SHALL reserve canonical case-folded paths and protect ancestor/descendant overlaps before edits.

- **WHEN** a valid, authorized and current action occurs **THEN** conflict-free source paths can be reserved transactionally.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** two agents cannot both reserve server/render-queue.mjs.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-27 — Contract compatibility

**SHALL:** Changes to exported APIs or shared types SHALL require declared consumers, compatibility tests and an architect-approved ADR.

- **WHEN** a valid, authorized and current action occurs **THEN** new typed contract retains prior supported input shape or formal migration.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** silent field rename that breaks a different scene agent is rejected.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-28 — Single source of truth

**SHALL:** Each cross-cutting capability SHALL designate one owner module and a reusable interface, not multiple ad-hoc implementations.

- **WHEN** a valid, authorized and current action occurs **THEN** M50 ledger reused by media QA while engineering coordinator remains separate.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** duplicate user-role rules and competing journal state machines fail review.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-29 — Traceable implementation

**SHALL:** Every PR SHALL link exactly targeted requirements, tests and risk controls; no unrelated edits.

- **WHEN** a valid, authorized and current action occurs **THEN** M40-C03 PR names contract and negative test with source SHA.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** drive-by refactor or unknown extra file requires re-scope.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-30 — Dependency-safe integration

**SHALL:** Before merge, shared branch rebases/retests against fresh base, detects changed source and reserves integration slot.

- **WHEN** a valid, authorized and current action occurs **THEN** non-conflicting independent PRs merge after exact-head CI.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** green CI from old base cannot serve as final merge permission.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-31 — Ownership handoff

**SHALL:** A task transfer SHALL revoke old fence, preserve immutable evidence and document affected file reservations.

- **WHEN** a valid, authorized and current action occurs **THEN** crashed worker relinquishes ownership and new attempt is auditable.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** two alive workers cannot both publish outputs from the same attempt.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-32 — Reuse quality gate

**SHALL:** Code review SHALL inspect reuse opportunities, bounded algorithm complexity, error handling and public API stability.

- **WHEN** a valid, authorized and current action occurs **THEN** small reusable service replaces repeated copy-pasted validation.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** new duplicate component without measurable justification is returned to REWORK.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

## Independent review, provenance, security and approvals

### ED-33 — Independent reviewer

**SHALL:** Reviewer SHALL not be submitting worker or beneficiary of the same claim, and must bind decision to exact immutable diff.

- **WHEN** a valid, authorized and current action occurs **THEN** different authenticated reviewer examines exact PR HEAD.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** self-review or review of updated unseen SHA is invalidated.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-34 — Evidence attestation

**SHALL:** Claim SHALL distinguish self-reported test output from provider-verified commit, CI run, test counts and SHA.

- **WHEN** a valid, authorized and current action occurs **THEN** GitHub-retrieved success on exact SHA is evidence of completed CI.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** agent-provided invented CI URL or sample hash never upgrades status.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-35 — Multi-level gates

**SHALL:** Technical reviewer MAY mark peer-reviewed; only authorized owner and release process MAY accept OpenSpec or deploy.

- **WHEN** a valid, authorized and current action occurs **THEN** approved technical change still waits for owner C07/C08 where required.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** a queue record with status reviewed cannot update production pointer.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-36 — Rights and asset licensing

**SHALL:** Video, voice, image, fonts and music SHALL have verified ownership/license source manifests for real-media E2E.

- **WHEN** a valid, authorized and current action occurs **THEN** owned six-scene fixture with verified grants satisfies rights prerequisite.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** unverified or synthetic surrogate cannot stand in for licensed production footage.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-37 — Tenant and filesystem security

**SHALL:** All actor actions SHALL enforce project and file ACLs, path containment, no symlink traversal and secret redaction.

- **WHEN** a valid, authorized and current action occurs **THEN** authorized worker sees own task and allowed paths.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** foreign tenant or arbitrary path escapes fail closed before IO.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-38 — Untrusted tool output

**SHALL:** Remote issue/PR/README/prompts SHALL be treated as untrusted data, not command authority.

- **WHEN** a valid, authorized and current action occurs **THEN** worker extracts a task description but still follows approved policy.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** instructions inside retrieved source cannot disable review or exfiltrate tokens.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-39 — Release evidence gate

**SHALL:** Production eligibility SHALL require immutable source/input hashes, verified artifact, independent media QA, rollback and owner release approval.

- **WHEN** a valid, authorized and current action occurs **THEN** staging tests and reviewer receipt are recorded separately from release permit.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** a passing P05 synthetic MP4 alone cannot authorize customer publication.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-40 — Auditable exceptions

**SHALL:** Every override SHALL include authenticated owner, scope, reason, expiry and counterfactual failure mode; hard security violations are not overridable.

- **WHEN** a valid, authorized and current action occurs **THEN** time-limited reviewed policy change has an audit trail.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** anonymous exception cannot bypass stale rights or expired lease.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

## Metrics, 30-day feedback and verification

### ED-41 — Throughput measurement

**SHALL:** Status SHALL report accepted verified checkpoints/day separately from peer reviewed, total commits and lines of code.

- **WHEN** a valid, authorized and current action occurs **THEN** report shows median cycle time and review backlog from durable events.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** a count of generated commits cannot be used as delivery progress.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-42 — Time and cost provenance

**SHALL:** Elapsed, queue-wait, coding, review, test, rerun, CPU/RAM and model token counts SHALL include source and observation status.

- **WHEN** a valid, authorized and current action occurs **THEN** run exposes measured wall-time and explicit unavailable token metrics.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** estimated API token counts cannot be represented as exact ChatGPT consumption.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-43 — Deadline feasibility

**SHALL:** Each day SHALL recompute required remaining throughput with uncertainty and hard blockers; 30-day target is only a planning hypothesis.

- **WHEN** a valid, authorized and current action occurs **THEN** if 300 cards remain with 15 days, dashboard shows >=20/day requirement.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** dashboard must not promise finish date from one fast M58 session.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-44 — Functional coverage

**SHALL:** Success SHALL measure user workflows across scene authoring, six-scene assembly, review, rollback and accessibility, not just stages.

- **WHEN** a valid, authorized and current action occurs **THEN** real owned media passes reproducible end-to-end and human A/B signoff.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** 480 green peer-review cards with no deliverable fail product readiness.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-45 — Performance SLO

**SHALL:** Real matched baselines SHALL use identical source SHA, hardware and toolchain; report p50/p95, cost, quality and confidence intervals.

- **WHEN** a valid, authorized and current action occurs **THEN** accepted benchmark shows quality/performance without hidden regressions.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** single warm-cache timing or unsupported false speedup claim is rejected.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-46 — Fault-injection matrix

**SHALL:** CI and staging SHALL cover process kill, runner crash, stale lease, invalid SHA, broken media and partial release transaction.

- **WHEN** a valid, authorized and current action occurs **THEN** after simulated SIGKILL original approved video remains intact.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** test that merely fakes a status without actual media cannot prove mux safety.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-47 — Quality and safety trend

**SHALL:** Daily reports SHALL identify regressions in escaped defects, lint/tests, content rights, A/V drift, visual readability and rollback integrity.

- **WHEN** a valid, authorized and current action occurs **THEN** additional feature accepted only with non-regressing release gates.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** net acceleration that doubles defect escape rate triggers replanning.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

### ED-48 — Exit and pause gates

**SHALL:** 30-day program SHALL define stop/re-scope criteria for missing shared access, auth, credible evidence, real footage or owner consent.

- **WHEN** a valid, authorized and current action occurs **THEN** unresolved risky capability pauses while safe independent work continues.
- **WHEN** an invalid, stale, unauthorized or conflicting action occurs **THEN** scheduler may not trade safety/rights or accepted releases for target throughput.
- **Evidence:** exact source/plan SHA, actual positive and negative test ID, pinned CI result, expected/observed state, independent reviewer record; owner decision where a formal gate applies.

## Acceptance interpretation

- All tests in this document are *planned* until an exact implementation-specific execution and independent review is attached.
- Per-feature C01–C08 requirements remain authoritative for actual media. ED requirements cannot waive ownership, human review or rollback.
- Security invariant failure always blocks the affected change, regardless of throughput or 30-day schedule.
- Tests must state which scope (single-host pilot vs distributed production) they prove; no inferred distributed safety from local SQLite tests.
