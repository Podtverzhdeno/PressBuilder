# P17 — Frame-boundary continuity planner

Implementation: P17-C01/C02 bounded schema, pure planner and negative tests. Not connected to REST/MCP or published releases.

## Source requirements

- Both scenes must be distinct, have matching rational FPS (24/25/30/60, 24000/1001 or 30000/1001), immutable approved-version identifiers, SHA-256 source and frame evidence hashes.
- Exit frame ID must be exactly left.frames - 1; entry frame ID must be zero.
- Entry and exit descriptors cover camera yaw, 2D subject anchor, motion vector, luminance, palette hue and sound-level estimate.
- These fields are NOT trusted just because they are supplied in a JSON request. Production P17-C03 must obtain their immutable values from P08 approved-version state and actual P03 frame evidence, then verify source hashes.
- No user-provided path/URL, interpolation script or FFmpeg command is accepted.

## Supported timeline decisions

- hard_cut and match_on_action use zero audio overlap.
- J-cut uses a positive right-source prehandle; L-cut uses a positive left-source posthandle. Operations state exact frame overlap and microsecond conversion in rational timebase.
- A lack of validated audio handles is rejected; it cannot reduce narration or borrow samples from unrelated files.
- A camera jump > 60°, anchor displacement > 0.45, luminance delta > 0.24, hue jump > 75° or motion-angle > 45° results in REVIEW with named causes. These are conservative provisional thresholds, not artistic approval.
- Results are read-only proposals with immutable source/approval fingerprints and publication_allowed=false.

## Remaining to complete

- P17-C03: server-side P08 approval and P03 verified boundary frames, authenticated director-only MCP/REST and reviewer UI.
- P17-C04: adversarial actual-media tests for frame tamper, wrong rights, expired P06 leases, malicious audio handles, version swap and failure rollback.
- P17-C05: authentic six-scene decoded MP4 with separate audio/video PTS and J/L-cut listening tests plus independent human boundary comparison.
- P17-C06: staging canary, performance/rollback gate and independent owner signoff.

Tests: tests/cloud-cinematic-continuity.test.mjs (data-only unit tests; 30000/1001 exact frame timing and reject cases).

## Hardening: evidence-pinned proposal identity

The proposal SHA-256 covers both exact boundary frame image hashes as well as source versions, operation, measured metrics and issue codes. Two visually different frames with identical aggregate metrics cannot share a proposal ID. A stationary-to-stationary hard cut does not invent a 180° motion mismatch; a stationary pair cannot qualify as verified match-on-action. The planning result still provides **no** proof of actual P03 frames/P08 approvals and cannot authorize release.
