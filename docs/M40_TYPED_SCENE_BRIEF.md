# M40 — Typed Scene Execution Brief v2

Status: IN_PROGRESS; not independently accepted. Feature flag PB_TYPED_SCENE_BRIEFS=1; OFF by default.

## Implemented vertical slice

P10 Director-approved plan is the sole source of authority; the existing P10 fingerprint(deck) is reused to validate unchanged narration and timing. The service combines the currently approved plan, current per-scene task/assignee/revision, original cue text and cue SHA, style revision, dependency graph and reported checkpoints into a typed, SHA-addressed READ_ONLY response. It is deliberately not a second persistent task store.

MCP get_typed_scene_brief verifies authenticated actor, project and scene scope and matching assignee for worker principals. Protected REST GET /api/decks/:id/director/brief/:scene is director-only through existing web authentication, with no write method. Studio displays a read-only panel. All responses state facts UNVERIFIED, human independent review REQUIRED and publication_allowed FALSE. No P05 or P08 pointer is changed.

Request failure modes: feature disabled; P10 unapproved/draft; invalid scene; changed source-script fingerprint; changed style revision; missing task assignee or incomplete/malformed checklist; task or plan revision changes during read; oversized brief. The SHA is an identity/invalidation fingerprint, not a human cryptographic approval signature. Client-provided authority, URLs, paths or claimed approval flags are never accepted by this service.

Source: server/typed-scene-brief.mjs. Schema: schemas/montage/typed-scene-brief-v2.schema.json. UI: src/editor/TypedSceneBriefPanel.tsx. Unit regression: tests/cloud-typed-scene-brief.test.mjs. Real HTTP/MCP integration: tests/cloud-director.test.mjs. This implementation requires passing exact-head CI before integration.

## Remaining mandatory M40 checkpoints

C01: independent contract and security acceptance. C02: additional property-based validation, permission/rights evidence. C03: typed write-workflow with P06 fencing, CAS, signed human override and undo; current implementation is READ ONLY. C04: adversarial malformed Unicode/size and multi-worker concurrency tests beyond initial negative cases. C05: six-scene real brief-to-render E2E, not generic renderer smoke. C06: independently measured editorial time benefit, RAM and CPU cost. C07: separate actor security + artistic review. C08: staging canary, rollback, measured latency and reviewed feature-flag enablement. No checkpoint should be marked complete solely because an initial build passed.
