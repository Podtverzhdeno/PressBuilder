# RFC: Engineering Delivery Control Plane / 30-day hypothesis

**Status:** DRAFT FOR DESIGN REVIEW; spec-only; no code, release, migration or agent schedule changed. **Revision:** ED-RFC-1 (2026-11-02). **Owner of acceptance:** authenticated human project owner. **Baseline:** `main` OpenSpec P01–P10 and TOP-60 at PR creation; do not treat a branch, green docs CI, or self-reported agent message as accepted software.

## Purpose

Make engineering progress on **PressBuilder itself** predictable with four code agents and one independent architect/reviewer. This is **not** video-scene direction: P10's director dispatch controls customer scenes; M50's ledger controls release/QC jobs; the proposed ED coordination layer controls engineering cards and Git PRs. No shared authority, secret, production release pointer or editor deck mutation crosses these boundaries.

## Canonical sources and normative order

1. `AGENTS.md`, existing production/security rules, and the actual repo and PR commit SHA.
2. `tasks.md` for P01–P10 (historical checked state is a documentation claim until independently corroborated).
3. `openspec/changes/video-quality-top60/{proposal.md,design.md,tasks.md,specs/*/spec.md}` and `docs/top60-montage-registry.json` for M01–M60.
4. `openspec/changes/professional-montage-p15-p24/` and `specs/002-professional-montage/` for P15–P24; same Pxx identifier can occur in different registers, so use namespace-qualified IDs.
5. This RFC adds **coordination constraints only**. On contradiction, fail closed, write an ADR, request an independent decision; do not silently rewrite authoritative tasks.

## Contract of the 30-day objective

**30 days is a stretch hypothesis, not a service-level guarantee.** The plan starts after a genuine shared scheduler, validated actor identity and first measured throughput. Success measures both engineering throughput and independently evidenced functionality; counting authored source lines, raw commits, model messages or closed unverified task cards is not accepted.

Current inventory at drafting: 55 P01–P10 checklist cards, of which 22 historically checked; 480 M01–M60 C01–C08 cards, all unchecked. Thus 535 entries / 513 **documented** unchecked. These counts are a baseline, **not 513 missing independent product features**. Distinguish SDD acceptance stages, implementation slices, sampled CI, licensed-media gates and human/owner acceptance.

Every actual start-of-day snapshot records authoritative source SHA, live pending/review/blocked counts, release branch, connected runner identity, observed time-to-merge and actual local/CI test receipts; target denominator updates only after independent change review.

## Scope / non-goals

**IN:** requirement intake, dependency planning, claim/fence/heartbeat, four agents plus reviewer scheduling, no idle starvation, file/contract ownership, code reuse, PR/evidence verification, CI gating, fault recovery, capacity and quality measurements, explicit owner approval and blocked escalation.

**OUT:** fabricating authorization from chat text; impersonating authenticated reviewers; bypassing account/model quota; automatic ChatGPT web-session spawning; silently reassigning agents for another project; unauthorized GitHub merge, external media download, audio-rights inference, Railway deploy, production publishing or auto-accepting OpenSpec checkboxes.

## Files

- [Functional and negative requirements](./requirements.md) — ED-01..ED-48, normative SHALL and WHEN/THEN scenarios.
- [Architecture and consistency model](./architecture.md) — operational state machine, identities, trust boundaries, persistence and failure states.
- [Execution, prioritization and 30-day checkpoints](./delivery-plan.md) — dependency-ready scheduling, WIP, kill criteria and fallback plans.
- [Verification / acceptance matrix](./verification.md) — concrete test fixtures, CI, real-media and evidence, explicit reviewer/owner gates.
- [Risk register and architectural decisions](./risk-register.md) — attack surface, data loss, throughput, quality and irreversibility.
- [Traceability overlay](./traceability.json) — exact 60 capability IDs + ranks/waves and stage IDs; **no fabricated implementation status**.

## Entry and exit rules

**Entry:** all roles know their credentials and scope; shared journal is reachable; current OpenSpec and Git HEAD are read successfully; feature branch/worktree and code ownership are established; safe tests can run.

**Exit for RFC acceptance:** independently reviewed dependency and threat-model analysis; exact 60-id machine parity; zero silent TODO->DONE transitions; reproducible validation. **Exit for product feature acceptance:** separate C01–C08 evidence, real native media where required, authenticated independent reviewer and owner, staging fault/rollback, compatibility and signed decision. This RFC cannot grant those rights.

## Relationship to active code

PR #48 proposes a **single-host SQLite coordination pilot**. It is evidence for feasibility, not a production/distributed scheduler. It lacks authenticated principal, cross-host fencing and cryptographically verified GitHub/CI evidence. A future Postgres transaction service is a **migration option** after requirements and threat model, not a claim of current capability. Existing scheduled agents of other projects are not part of this plan until explicitly reauthorized.

## Review policy

The architect is the technical reviewer, not the release authority. Agent confidence and self-reported tests are `UNVERIFIED`. Reviewer decision is `PEER_REVIEWED` until owner authorization. Real production changes require explicit action tied to immutable source/plan SHA. No `ACCEPTED`/production flag may be written by the queue alone.
