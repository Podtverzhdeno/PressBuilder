# Engineering delivery architecture — ED-RFC-1

**Status:** proposed contracts; not a description of production. **Security model:** default deny. No release effect.

## 1. Context and disjoint planes

| Plane | Existing / proposed authority | Mutation allowed | Prohibited cross-effect |
|---|---|---|---|
| Engineering ED coordinator | Proposed engineering work allocator; PR #48 is local SQLite pilot | Only ED coordination DB/record and proposed engineering branches | Cannot change video deck, P08 approval, P05 release, GitHub main, Railway |
| Scene P10 dispatcher | Existing scene plans + P06 scoped leases | Only authorized project/scene task state | Not an engineering source-code scheduler |
| Media M50 ledger | Existing disabled-by-default local-volume media QC pilot | Verified media QA pre-release ledger | Not owner signoff, not distributed transactions |
| Source Git + CI | GitHub repo/Actions | Authenticated developer PRs, exact-SHA CI checks | A green job is not human creative/license or production approval |
| Product owner + release controller | Actual authenticated owner principal | Explicit OpenSpec acceptance and staging/release approval | Queue cannot issue equivalent credentials |

Proposed ED system reads Pxx/Mxx tasks, commits, PRs, CI, toolchain/metrics and agent capacity. Each output is a *proposal/receipt* until verified by the relevant authority. It never edits owner-supplied media or authorizes publishing.

## 2. Bounded logical diagram

\`\`\`text
              git main + exact spec/registry SHA
                         |
             Intake / source fingerprint
                         |
   DAG builder + architecture ownership + risk gates
                         |
               Transactional scheduler
             /        |          \\
     4 code leases  review queue  blocked queue
           |             ^             |
   isolated worktrees    |        operator/owner
           |             |          decision
      PR + test proof -> independent reviewer
                         |
                 owner-pending boundary
                         |
      separate signed spec/production acceptance
\`\`\`

**Invariant A:** An engineering task may be code-eligible with an advisory future integration point, but never if a *hard stage prerequisite* lacks validated evidence. **Invariant B:** no ED event changes authoritative OpenSpec or P05/P08 acceptance. **Invariant C:** no producer can mark its own artifact reviewed. **Invariant D:** shared files are reserved before editing; branch isolation also required because reservations are cooperative. **Invariant E:** exact approval provenance is checked again after a rebase/source change.

## 3. Proposed data contracts (versioned, minimal examples)

### EngineeringCard_v1

\`\`\`json
{
  "schema_version": 1,
  "card_id": "M50-C04",
  "source": {"repo": "Podtverzhdeno/PressBuilder", "base_commit": "EXACT_HEX_SHA", "spec_path": "openspec/changes/video-quality-top60/tasks.md", "card_digest_sha256": "EXACT_SHA256"},
  "capability": "M50",
  "stage": "C04",
  "priority_rank_from_registry": 2,
  "hard_predecessors": ["M50-C03"],
  "advisory_integration_points": ["P02", "P05", "P08", "P13"],
  "implementation_scope": {"owned_paths": ["server/fenced-job-ledger.mjs", "tests/cloud-fenced-job-ledger.test.mjs"], "allowed_operations": ["reviewable-pr"]},
  "acceptance": {"positive_case_ids": ["TEST-POS-01"], "negative_case_ids": ["TEST-NEG-01"], "required_ci": ["test:cloud"], "owner_gate": false},
  "resource_envelope": {"max_active_workers": 1, "estimated_cpu_seconds": null, "deadline_policy": "NO_SAFETY_OVERRIDE"},
  "status": "TODO"
}
\`\`\`

This is an **illustrative shape, not stored real evidence**: placeholder SHAs/IDs cannot be accepted by validators. Actual schema uses strict property allowlists, nonempty bounded UTF-8 fields, max card size (proposal: 64 KiB), bounded path count (proposal: 32), exact 40-hex commit SHA and 64-hex evidence digest, and server-issued scope.

### ClaimLease_v1

\`\`\`text
claim_id, card_id, actor_principal_id, actor_role, project_scope,
base_commit_sha, spec_digest_sha, fence:uint64, expiry_utc,
reservation_set_sha256, attempt_number, idempotency_key
\`\`\`

Secret lease token is delivered once over authenticated transport, stored hashed, never copied into a PR/chat/CI log. A role label sent by the client is untrusted. The holder must prove actual host principal and permission to reserve each path. Renewal requires matching holder + fence + token + not-expired lease + unchanged relevant source. Reclaim increments the fence. A stale worker may keep working in its own branch, but cannot submit or occupy shared protected paths.

### EngineeringReceipt_v1

\`\`\`text
card_id, claim_id, pinned_pr_id, observed_pr_head_sha,
base_sha, referenced_spec_sha, changed_file_hash_manifest,
test_command_allowlist, test_source, ci_run_id/attempt,
ci_head_sha, exit_code, pass/fail/skip counts, artifact_shas,
observed_resource_metrics, reviewer_principal_id,
reviewed_at_utc, verdict, unresolved_risks
\`\`\`

Two levels: \`SELF_REPORTED\` and \`PROVIDER_VERIFIED\`. Unknown/unavailable evidence remains \`UNKNOWN\`; no invented zeroes, timestamps, token estimates or image/media hashes. GitHub/CI claims become provider-verified only if read back from authenticated API, bound to exact head SHA and the latest attempt (no self-reported \`run_url\` trust). Reviewer action binds receipt digest. A new commit invalidates old review approval.

### Idempotency and outbox

\`operation_id\` unique within (principal, task, claim, operation type). Duplicate same payload returns prior outcome. Duplicate altered payload returns \`409 IDEMPOTENCY_CONFLICT\`. For cross-store GitHub actions, record durable intent before calling provider; after a timeout, search remote by stable marker/commit and reconcile prior action *before* retry. Database transaction cannot pretend atomicity with GitHub PR creation.

## 4. State machines — code and review separate

\`\`\`text
TODO -- validated intake --> READY
READY -- atomic claim --> LEASED_CODE
LEASED_CODE -- verified PR and tests --> SUBMITTED_REVIEW
LEASED_CODE -- expired/cancelled --> REWORK or READY (with new fence)
SUBMITTED_REVIEW -- distinct reviewer claim --> LEASED_REVIEW
LEASED_REVIEW -- accept technical evidence --> PEER_REVIEWED
LEASED_REVIEW -- revise --> REWORK
PEER_REVIEWED -- owner gate required --> OWNER_PENDING
OWNER_PENDING -- authenticated authorized owner --> (separate formal ACCEPTED workflow)
any source-card SHA drift --> STALE_SPEC (until reconciliation)
any material tool outage --> ENV_BLOCKED (no fabricated work)
any persistent security violation --> QUARANTINED
\`\`\`

Terminal \`ACCEPTED\` is not a state the pilot may write into authoritative OpenSpec. Required owner review **must not** be bypassed even if the next engineering stage can be worked on speculatively. A reviewer cannot accept a PR whose head differs from the inspected SHA. If a PR was rebased after approval, re-run mapped CI and request re-review of changed ranges.

### Transition matrix

| From | Operation | Preconditions | On failure |
|---|---|---|---|
| READY | ACQUIRE | authorized principal, exact card/source SHA, hard dependencies, WIP slot, no conflicting claim | explicit BLOCKED/409, no partial lease |
| LEASED_CODE | RESERVE | active actor/fence, canonical allowed file paths, no overlapping reservations | 409; existing reservations unchanged |
| LEASED_CODE | HEARTBEAT | exact token/fence, TTL live, current source and task revision | 409/STALE; lease not extended |
| LEASED_CODE | SUBMIT | actual PR, exact current head, pinned tests, artifact receipt, no conflict | stays LEASED_CODE or REWORK; not REVIEWED |
| SUBMITTED_REVIEW | REVIEW_CLAIM | foreign authenticated reviewer, no reviewer conflict of interest | remains queued |
| LEASED_REVIEW | VERDICT | inspected head SHA, independent evidence, scope and rights | REWORK / QUARANTINED |
| PEER_REVIEWED | OWNER_REQUEST | C-stage owner authority required, reviewer proof, original status unchanged | OWNER_PENDING, never self-acceptance |
| any | CANCEL/EXPIRE | monotonic fence revision, audit reason, no protected artifact mutation | previous accepted outputs preserved |

## 5. Scheduling algorithm, no false parallelism

Compute **eligible** tasks using actual hard predecessors and owner/security gates. Partition by lock and source file overlap. For each eligible card compute a deterministic ordering: (1) safety blocker severity, (2) count of critical-path cards unlocked, (3) stage must-pass status, (4) authoritative TOP-60 rank, (5) age/wait-time, (6) stable card ID. A user may explicitly reprioritize after a reviewed ADR; no numeric productivity score changes rights rules. Avoid starvation by aging but never compensate by bypassing security. Whenever review queue is nonempty, the architect gets it first. When no eligible code exists, developers may review a **foreign** PR, then collect evidence on assigned existing blockers, else explicitly IDLE.

**Cooperative file lock selection:** normalized workspace-relative paths; slash normalization, Unicode NFC, Windows case-fold comparison, reject absolute/UNC/traversal/symlinks/empty/invalid reserved device names. Reject path-prefix overlaps and known shared type/API changes without architect integration slot. File locks do not enforce OS filesystem security, hence separate worktree permissions and final changed-files attestation are required.

**Fairness and critical path:** no epic monopolizes all four developers; reviewer backlog and mixed CPU-heavy tasks cap parallel work; e.g. four FFmpeg E2Es on a single machine are not four independent resources. Measure rather than presume speedup.

## 6. Persistence and transactions

**Pilot:** SQLite on one host, local disk, WAL + busy timeout, \`BEGIN IMMEDIATE\` claim/review/reserve CAS, per-task digest, monotonic fence, durable events. Back up via SQLite-safe online backup, never copying live WAL as plain DB. Restore rehearsals must prove no duplicate leases or false reviewed state. SQLite works only if all agents use **the same file** on a reliable local volume, not a synchronized cloud folder.

**Distributed production candidate:** PostgreSQL with transactional row claims (\`FOR UPDATE SKIP LOCKED\`), unique active-claim constraints, outbox/inbox for provider calls, monotonic lease generation and fencing; cross-process leader failover. PostgreSQL is not installed or deployed by this document. No rollout until multi-host chaos tests and authenticated server API pass. A code-host MCP tunnel does not itself provide global transactions or job execution continuity.

## 7. Crash, split-brain, and reconciliation

| Fault | Required behavior | Unsafe shortcut |
|---|---|---|
| Local Workspace tunnel unavailable | record ENV_BLOCKED; scheduled runs do not claim success; resume after authenticated reconnection | pretending run succeeded using cached state |
| Worker SIGKILL after claim | lease expires; next claim increases fence; old worktree remains unmerged | reusing old lease token |
| Duplicate acquire from two workers | single transactional winner; other gets different card/explicit idle | copying the same task into two sessions |
| GitHub request times out after PR creation | reconcile by unique marker/commit before retry | create duplicate PR |
| Spec changes while task active | invalidate submission claim; explicit rebase and task re-review | keep old acceptance text |
| DB unavailable/corrupt or host restart | fail closed, last verified snapshot, backup/restore with checksums | initialize empty DB and erase history |
| CI rerun on old head | report stale evidence; require exact current PR SHA | accept historic green result |
| Two sources updated while checking release | re-check source/permission before commit; preserve old P08/P05 | trust preflight-only check |
| Reviewer disappears | review lease expires; independent new reviewer picks up with new fence | self-review by submitter |
| Deadline exhausted | re-scope with explicit owner decision; skip non-critical proposed features | change hard safety criteria |

## 8. Compatibility and migration

1. ED pilot's private SQLite record is **not** authoritative in any video or OpenSpec datastore.
2. No migration can reinterpret historical \`DOCUMENTED_DONE\` as formally \`ACCEPTED\`.
3. New schema revision must have up/down migration plan, independent rollback and read-only compatibility check; preserve original source hashes.
4. Rollout: offline synthetic/local code fixture → separate staging with authenticated principals → chaos/multi-host → owner-approved limited production opt-in → feature flags. At each step, rollback restores old branch and isolates new coordinator state.
5. No acceptance update is allowed merely from a generator output, no token or credential committed, no silent auto-merge and no production deploy.

## 9. Instrumentation and data minimization

Event types: \`SOURCE_PINNED, READY, CLAIMED, RESERVED, HEARTBEAT, BLOCKED, REVIEW_REQUESTED, REVIEWED, REWORK, OWNER_PENDING, STALE, RECOVERED, EXPIRED\`. Each has task/source/claim id, timestamp, actor principal (pseudonymized), evidence digest, outcome and duration. Never log raw private scene audio/transcript, media, access/lease tokens or arbitrary file contents.

Source attribution: observed wall-clock vs model token usage unavailable. If ChatGPT subscription doesn't expose per-run token counts, record \`tokens_in=null;tokens_out=null;measurement_status=UNAVAILABLE\`. No derived estimate can be labeled measured. Retention, deletion, personal information and provider data access are explicit policy decisions before production.

## 10. Architecture Decision Records needed before implementation

- ADR-ED-01: Engineering coordinator v1 standalone vs integration with existing media ledgers; reject shared task authority.
- ADR-ED-02: Single-host SQLite pilot vs Postgres cross-host; document migration threshold.
- ADR-ED-03: Authentication and secrets; map role labels to real principals and independent review guarantees.
- ADR-ED-04: Hard dependency vs advisory integration graph; avoid false global cycles.
- ADR-ED-05: GitHub CI/PR evidence verification and retry reconciliation.
- ADR-ED-06: Code ownership module catalog, import boundaries and one authoritative shared API.
- ADR-ED-07: WIP/CPU budgets and scheduling fairness; measured speedup only.
- ADR-ED-08: Evidence retention, audit, privacy, licensing and release authority.
