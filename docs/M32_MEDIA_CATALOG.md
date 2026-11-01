# M32-R01 — source-pinned media rights catalog

Status: IN_PROGRESS; implementation partial, PB_MEDIA_CATALOG=1 disabled by default. No changes to approved P08/P05 video artifacts.

## Implemented

Director proposes existing real QA-passing P08-approved MP4 by exact source SHA, version ID and approval revision. The server obtains authority from its trusted P08 version store, never from a caller-supplied verified flag, client path or arbitrary URL. A separate web-director action ATTEST_RIGHTS records holder, license/evidence references, expiry, attribution, permitted uses and allowed scenes. Such an attestation records a person's declaration and does NOT constitute independent verification of legal rights.

CATALOG v1 is stored separately from deck.json with optimistic revision/CAS in project-owned .media-catalog/catalog.json and append-only identifier-only event metadata. Every verify() rechecks actual P08 approved bytes and pointer, expiry, scene and allowed use. REVOKE_RIGHTS blocks subsequent proposals; the old source remains immutable.

MCP exposes list_media_assets, verify_media_asset with P06 project/scene/assignee scope, and director-only propose_media_asset; agents cannot attest or revoke. HTTP web Basic + Origin gate allows list, propose, explicitly attest and revoke. A missing P08 store fails closed on use without breaking legacy MCP startup. Registered assets only allow candidate proposals; render_allowed and publication_allowed remain FALSE unconditionally.

Contract: schemas/montage/media-catalog-v1.schema.json.
Implementation: server/media-catalog.mjs, server/mcp.mjs, server/cloud.mjs.
Tests: tests/cloud-media-catalog.test.mjs and tests/cloud-media-catalog-wire.test.mjs.
Testing with fake P08 media byte fixtures exercises hash and approval logic only, not video decode: generic Docker MP4 smoke does not prove end-to-end asset ingestion.

## Remaining M32 gates

C01: independent rights/security architecture review.
C02: actual media ingestion and immutable copies for audio/GLB/image/footage, verified ownership/licensing evidence.
C03: editorial Studio UI and reviewer-separated approval.
C04: multi-process safety and durable audit reconciliation, concurrency/fault injection.
C05: six-scene licensed actual decoded video end-to-end using catalog sources.
C06: measured editor-minute/CPU/RAM cost benchmark.
C07: independent creative, security and legal validation.
C08: canary, rollback and production flag enablement.

This is only the R01 vertical slice. The M32 TOP-60 requirement and all 8 SDD completion checkboxes remain unaccepted until real proof and independent review.
