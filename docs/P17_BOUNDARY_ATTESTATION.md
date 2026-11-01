# P17-C03 — server-attested boundary evidence (read-only slice)

## What exists
- Feature flag: `PB_CONTINUITY_REVIEW=1`; **OFF by default**.
- Authenticated Director-only MCP `get_continuity_boundary_context` and `preview_continuity_hard_cut`.
- Browser Director Basic-auth REST `GET /api/decks/:id/continuity/context?left=s01&right=s02`, then `POST /api/decks/:id/continuity/preview` with `{left_scene_id,right_scene_id,expected_pair_sha256,transition:"hard_cut"}`.
- P08 `versions.approved` verifies immutable H.264 MP4 SHA, P03 thumbnail hashes and approved pointer; FFprobe independently checks decoded frame count, rational FPS and duration.
- FFmpeg extracts **exact decoded first and last frames** (not P03's 10/50/90% sampling), returning JPEG SHA-256 and zero-based frame indices from server-owned media.
- Source pair fingerprint includes P08 approved pointer revision, MP4 hashes, FPS and exact boundary JPEG hashes; post-decode approval recheck prevents stale side-by-side review.
- Hard-cut proposal explicitly returns REVIEW, `publication_allowed:false` and no side effects. Caller-supplied media paths/hashes/approval flags are not accepted.
- Media jobs are asynchronous; one in-flight boundary analysis per process, bounded binary stdout, 12-second timeout per FFmpeg/FFprobe invocation. No synchronous media decoding on the HTTP event loop.

## Trust and limits
- This is **not full P17-C03 acceptance**. No visual Studio side-by-side UI yet; camera angle, object motion, independent audio handles and artist evaluation are not proven. J/L and match-on-action intentionally reject rather than hallucinate support.
- Single-process concurrency gate is not a distributed worker reservation. Source is local P08 protected media, maximum 45 sec / 2700 frames / 64 MiB; supported rational FPS: 24, 25, 30, 60, 24000/1001, 30000/1001. No remote fetch, arbitrary filter graph, or shell interpolation.
- `PB_CONTINUITY_REVIEW` must remain disabled in production pending separate security review, multi-instance rate limit and release authorization.
- Approval and release pointers are never modified.

## Next checkpoints
1. P17-C03: review UI with actual seekable immutable frames, signed human comparison and explicit refusal to publish until confirmation.
2. P17-C04: negative tests for symlink/hardlink, video corruption mid-decode, approval race, timeouts, missing FFmpeg, cross-project principal, multi-worker backpressure and post-approval mutation.
3. P17-C05: actual verified audio pre-/post-handles for J/L cuts, decoded PTS listening tests and six-scene paired media.
4. P17-C06: isolated staging canary, observed CPU/RAM/latency/error rates, rollback, independent signoff.

Disable the flag for immediate rollback; no persistent P17 state was written.
