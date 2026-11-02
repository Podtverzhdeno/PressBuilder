# 30-day delivery control plane — PressBuilder (pilot)

**Status: implemented local coordination pilot, NOT autonomous production orchestration.** This tool cannot start ChatGPT agents, grant application access, merge PRs, run a production deployment, approve protected OpenSpec tasks or access Railway. Its SQLite database is an **engineering work queue** separate from P02/P10 scene production and M50 media ledger.

## Why this layer

PressBuilder already has a P10 scene director and an M50 fenced QA ledger. They coordinate scene rendering and media releases. This tool coordinates **engineering work on PressBuilder itself**, treating the existing 55 P01–P10 tasks and the 480 OpenSpec M01–M60 C01–C08 checkpoints as the **only initial task supply**. It does not pretend they are all unfinished features: the 22 P checkboxes checked by the source plan are imported as `DOCUMENTED_DONE` but not authenticated accepted evidence. OpenSpec C01–C08 are deliberately kept TODO until their actual acceptance gates.

## One-time setup

Python 3.10+ with SQLite is required; no pip, npm, cloud or provider credentials. Execute in the **same local filesystem** visible to all five workers. The `.agent-control/` directory is Git-ignored; never add or publish the SQLite DB, tokens, private artifacts or review logs in Git.

```powershell
python tools/agent_work_queue.py init --repo-root .
python tools/agent_work_queue.py status
python -m unittest discover -s tests -p test_agent_work_queue.py -v
```

The parser validates 60 distinct modules, **480 exact C01–C08 checkpoints**, and **55 P subtasks**; invalid source counts or duplicate IDs fail closed. Existing tasks are not overwritten by later `init` calls. If an existing card's exact requirement line changes, it is flagged `STALE` for explicit reconciliation; an old lease cannot approve the new meaning.

## Five agents and no silent idle time

Every scheduled run must **re-read the exact Git HEAD, current spec, tasks and the live SQLite status**; don't trust a previous chat message. The four worker IDs are `dev-1`, `dev-2`, `dev-3`, `dev-4`; independent reviewer ID is `architect`.

```powershell
python tools/agent_work_queue.py acquire --actor dev-1
python tools/agent_work_queue.py acquire --actor dev-2
python tools/agent_work_queue.py acquire --actor dev-3
python tools/agent_work_queue.py acquire --actor dev-4
python tools/agent_work_queue.py acquire --actor architect --prefer review
```

An `acquire` returns either `mode: code`, `mode: review` or `mode: idle` **and an opaque one-time lease token**. Keep that secret out of commits, chat progress notes, CI logs and issue bodies. The coordinator defaults to code for developers, switches to a *different developer's* review if no eligible code remains; the architect does independent review first, then may draft a separate technical or architectural task. The role name is **not a validated person or signed approval**. If the host/Local Workspace connector is down, report the interruption; never invent claims or "continue" from stale instructions.

Checkout **one task per isolated Git branch/worktree**. Before modifying any source path, acquire its cooperative reservation with the token:

```powershell
python tools/agent_work_queue.py reserve --actor dev-1 --task P02.2 --token '<PRIVATE_LEASE_TOKEN>' --path server/render-queue.mjs --path tests/cloud-render-queue.test.mjs
python tools/agent_work_queue.py heartbeat --actor dev-1 --task P02.2 --token '<PRIVATE_LEASE_TOKEN>'
```

Reservations are transactional and reject duplicate or overlapping file paths (including case-insensitive conflicts on Windows). **These are cooperative reservations**, not OS-enforced permissions: run agents in separate worktrees and independently review diffs. Lease TTL is 1 hour by default; re-acquire after expiration. Old tokens cannot finalize after expiry, and the monotonically increasing fence number prevents stale replay.

At the end of coding, *do not mark the task accepted.* Submit a real PR, its exact commit and SHA-256 digest of reproducible evidence; the coordinator records the claim as `REVIEW` (still **UNVERIFIED**). Example only — replace all placeholders with actual values:

```powershell
python tools/agent_work_queue.py submit --actor dev-1 --task P02.2 --token '<PRIVATE_LEASE_TOKEN>' --commit '<REAL_40_HEX_SHA>' --evidence '<REAL_64_HEX_EVIDENCE_SHA>' --pr 'https://github.com/Podtverzhdeno/PressBuilder/pull/NN'
python tools/agent_work_queue.py acquire --actor architect --prefer review
python tools/agent_work_queue.py review --actor architect --task P02.2 --token '<PRIVATE_REVIEW_TOKEN>' --decision rework --note 'Independently reproduced missing worker restart test; return for repair.'
```

Reviewers must inspect the **real diff, matching commit, CI logs, authorizations and negative tests**; the queue does not call GitHub to authenticate this information. The submitter cannot review the same card. A peer-approved card reaches `REVIEWED` or `OWNER_PENDING` (for P subtasks and M-stage C01/C07/C08), **never `ACCEPTED`**. This is intentionally separate from OpenSpec, owner/release authorization and human editorial acceptance. No code or feature flag is automatically deployed; the existing `main`, P08, P05 and production deployment stay untouched.

## Dependencies, concurrency and recovery

- Each M capability obeys its checkpoint sequence, `C01 → C02 → ... → C08`: the next stage becomes eligible only after a distinct peer reviews the previous stage. A reviewed C01 can advance preparation while still awaiting the owner, but this **does not lift owner acceptance or production release gates**. Cross-module `recommended_predecessors` are advisory; they do not create an artificial cyclic DAG. Product P subtasks follow the source task register; their heterogeneous dependencies must be verified by each worker.
- One active coding/review claim per epic (`M40`, `P02`, etc.), with global per-file reservations. SQL `BEGIN IMMEDIATE` serializes simultaneous acquisitions and review claims. A crashed/expired code lease is requeued with the old token invalidated and its reservations released; an expired review lease can be claimed by another independent reviewer.
- Durable journal is SQLite WAL, transactional on **one shared local disk**. This does not provide a distributed lock on NFS/cloud sync, authentication or PostgreSQL multi-replica fault tolerance. If a worker continues editing after TTL expiry, branch isolation and reviewer conflict checks are required; no shell tool can revoke its filesystem writes. Avoid running five sessions against separate, unsynchronized DB copies.
- `SOURCE_DRIFT` is a deliberate stop for that affected card and demands manual reconciliation, not silent auto-acceptance. Competing PRs must not merge on top of stale source requirements.

## Daily burn-up and hard constraints

`status` prints pending code, review queue, active leases, owner-pending items and audited peer-review throughput. The initial backlog contains **513 unchecked cards** (535 total less 22 legacy P checkboxes), which would demand **17.1 peer-reviewed cards/day** over 30 calendar days, not 17.1 fully production-accepted features/day. The 30-day objective is a **planning hypothesis**, not a guaranteed SLA. Human acceptance, licensed-source checks, true multi-instance staging and rollback remain separate activities.

Aim for WIP ≤4 code tasks, rapid foreign review, explicit source and evidence SHA, automated CI, real P05/P08 tests where relevant, and zero fictitious green checkboxes. Measure task lead time and blocked time from the journal before tuning concurrency. Only tasks with independent signed owner/release authority may eventually be marked complete in the authoritative OpenSpec workflow; this tool has **no action for that transition**.

## Gaps before declaring full autonomy

1. Durable shared server access from scheduled ChatGPT runs (Local Workspace MCP may disconnect); link each run's actor identity to a validated principal.
2. A Postgres-based distributed coordinator and worker heartbeats with server-enforced file/worktree isolation for cross-host agents.
3. GitHub webhook/CI provenance verification and truly independent reviewer assignment, not self-reported evidence hashes.
4. Human owner acceptance, explicit licensing/creative QA, staging load baseline and reversible deploy as required by C07/C08.

Until those are done, treat this as a **tested, local multi-agent planning and peer-review foundation**, not a completed 30-day autonomous factory.
