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
