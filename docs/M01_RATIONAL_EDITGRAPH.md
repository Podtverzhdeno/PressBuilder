# M01-R01 — Rational EditGraph Preview

Implementation status: IN_PROGRESS. Feature flag PB_EDITGRAPH_PREVIEW=1 (OFF by default). This is the initial verified proposal-only graph compiler, NOT the replacement of the production renderer.

## Data contract and timing decisions

- Existing P01 buildSchedule(deck) remains authoritative for visuals and cue start/end. Changes to the underlying deck are not committed from M01.
- The pure server compiler combines P01 scene/cue ranges, P09 anchored sync markers, P05 proposed transitions and P08 verified approved MP4 SHA/version pointers into a deterministic source snapshot SHA.
- Clock: 240000 integer ticks/second; 24 fps => 10000 ticks/frame, 30000/1001 fps => 8008 ticks/frame, 24000/1001 fps => 10010 ticks/frame, 48000 Hz PCM => 5 ticks/sample. The mathematical clock accepts explicit rational {num,den}. Existing numeric project fps is normalized for 23.976/29.97/59.94 aliases. Unsupported fps fail closed.
- Video scene boundaries are rounded at absolute positions, not by adding independently rounded scene durations, preventing accumulation of frame-rounded errors. Cue boundaries and P09 markers quantize to their absolute positions.
- M01 does not pretend a declared P05 crossfade is already applied: overlap_applied=false. Narration audio is only tracked by source/offset and sample ticks; PCM word alignment and mix correctness are unverified.
- Sources with no explicitly approved P08 MP4 still appear as UNAPPROVED in read-only timeline; such sources cannot be used in a trim proposal.
- The director can submit immutable-in-effect REVIEW_ONLY scene frame trim candidate through REST or scoped MCP, with optimistic candidate revision CAS and exact source SHA. Trims are bounded by approved MP4 duration and actual source FPS, and proposals never rewrite P01, P05, P08 or publish any MP4. User-supplied local files, command strings, external URLs and executable instructions are not supported.
- Each project has a separate local candidate.json in .editgraph; this is a single-process FS proof of concept, not a transactional multi-replica document store. Source revision drift marks proposals STALE_SOURCE.
- Workers using get_edit_graph MUST pass a scene ID; server enforces P06 project/scene scope and scene assignment and only returns the target scene. Director can see full project and submit proposals. Basic-auth editor REST has same authentication/Origin gate as existing project editor.
- New Studio read-only panel shows exact montage time base, cues, transition declarations, source pointers and current proposal status, but never presents a user action for publication.

## Technical evidence

- Pure numerical/source CAS tests: tests/cloud-edit-graph.test.mjs.
- Real authenticated REST/MCP tests: tests/cloud-edit-graph-wire.test.mjs.
- Source schema: schemas/montage/edit-graph-v1.schema.json.
- Implementation: server/edit-graph.mjs and server/cloud.mjs, server/mcp.mjs, src/editor/EditGraphPanel.tsx.

## Incomplete requirements / no false acceptance

M01-C01 independent architecture and security review; M01-C02 cross-platform fractional fps behavior including VFR/source mismatch; M01-C03 real applying of trim/split/move with reversible 1000-operation undo/redo and P06 lease-controlled writes; M01-C04 sub-sample audio drift/true PCM/video sync, P05 transition handles and validated source duration; M01-C05 six actual mixed 24/30000/1001 fps P08 MP4 end-to-end with decoded QA; M01-C06 time-and-cost measurement; M01-C07 separate creative/security review; M01-C08 staging canary, rollback and feature flag decision. These remain unchecked. Existing generic Docker MP4 smoke is regression evidence for the old renderer, NOT proof the new EditGraph drives it.

## CI evidence (M01-R01)

GitHub Actions https://github.com/Podtverzhdeno/PressBuilder/actions/runs/41361188906 on SHA 9b177777c7e4fa8e4e61376cb65e3321ade97a61: cloud suite PASS, production Docker 181/181 passed, 0 skipped, 0 failures; existing real MP4 smoke rendered 332050 bytes. OpenSpec/SDD strict validation https://github.com/Podtverzhdeno/PressBuilder/actions/runs/41361188887 PASS. No full six-scene mixed-fps EditGraph-to-render test, no independent signoff. Feature flag stays OFF.


## R02 — Reversible edit-operation journal, still REVIEW_ONLY

Implementation: `server/edit-operations.mjs`; REST `GET/POST /api/decks/:id/edit-graph/operations`; MCP director-only `get_edit_operations` and `update_edit_operations`. All endpoints use existing Basic/Bearer access control and REST cross-origin write guard. The candidate project directory stores an atomic JSON file `.editgraph/operations.json`. The OpenSpec feature flag `PB_EDITGRAPH_PREVIEW` remains OFF in production.

- Compiles the current approved P08 source descriptors into deterministic clip intervals with integer frame PTS in 240000 ticks/s, no float addition.
- Supports exact-frame `TRIM`, `SPLIT` and `MOVE` only on P08 SHA-verified PASS media. `SPLIT` creates deterministic stable clip IDs. `MOVE` changes only the candidate ordering; `TRIM` is constrained to the parent interval. Unknown fields and IDs, invalid frames, stale P08, non-director actor fail closed.
- `APPLY/UNDO/REDO` are CAS guarded by exact `expected_revision` and `expected_source_sha256`. Branching after undo discards old redo tail; stale source makes the journal read-only and prevents applying previous operations.
- Pure 1000-step replay tests verify identical graph JSON and SHA after undo-to-zero and redo-to-end. This does NOT prove 1000 real MP4 renders, subframe audio alignment or transactional multi-replica writes. It is a **single-process journal** behind an OFF feature flag.
- Every preview explicitly carries `render_allowed:false`, `publication_allowed:false` and warnings that voice/cue timing and P05 transitions are NOT retimed or recomputed.
- The Studio offers read-only clip timeline inspection and CAS undo/redo. Authoring operations currently use authorized director MCP/REST; no automatic relay into P05 assembly.

**Still open:** real non-destructive trim/split/move MP4 renderer with independent production media tests, 48 kHz audio retime/PCM sample accuracy and loudness proof, P05 crossfade handle constraints and transition E2E, source variation or VFR conversion, independent artistic/security signoff, and measured canary/rollback. M01-C01–C08 remain open. Planned follow-on: M50 persistent retry/idempotent orchestration.
