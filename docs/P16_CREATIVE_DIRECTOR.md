# P16 — Creative Director: approved-source storyboard alternatives

**Scope:** P16-C01/C02 core + read-only MCP, REST and Studio preview in P16-C03. No human-approved editing, publishing or replan.

## Architecture and trust boundary

- P10 Director plan must already be human-approved (approved or released); P10 approval is separate.
- Every deck field covered by the P10 script fingerprint is rechecked, including all six scenes, cue IDs, literal text and timing.
- Caller pins exact P10 plan revision and computed storyboard source SHA. Stale changes are rejected, not silently recovered.
- Only literal original cue text is exposed. No invented claims, rewritten measurements or fabricated citations.
- Two deterministic proposals: source_arc in original six-scene order, cold_open with scene five as teaser, scenes 1–4 in order, scene six as payoff.
- Each proposal has six unique scene IDs and anchored cue hashes, original source time, estimated duration and unique candidate SHA.
- Storyboard order is NOT an edited soundtrack, rendered MP4, P10 job, scene lease, automatic approval or production change.
- Reject absent/altered approval, empty cues, duplicate scene IDs, too few distinct claims, foreign source hash and extra request fields.

## API and rollout

Feature flag: PB_CREATIVE_STORY_PREVIEW=1 (default off).

- GET /api/decks/:id/creative/context (web Director Basic-auth) provides pinned P10 plan revision, SHA and source cues.
- POST /api/decks/:id/creative/preview sends manifest with expected_plan_revision and expected_source_sha256. Read-only and same-origin.
- MCP get_creative_story_context and preview_creative_storyboard are Director-only; neither can approve or publish.
- Studio Режиссёрские истории displays both alternatives with source cue text and click-to-seek. Local Vite requires an existing approved local P10 plan.

## Evidence and remaining blockers

- cloud-creative-storyboard.test.mjs: distinct plans, exact six-scene coverage, no facts changed, stale/foreign source and malformed request denial.
- cloud-director.test.mjs: P10 approved script → read-only P16 REST/MCP → current revision; no auth bypass or CSRF.
- All effects are read-only. No old MP4, release pointer, scene assignment, README or deck mutation.
- Still missing: independently signed artistic approval, durable P16 review store, cross-scene voice remap, P10 dependency review, signed per-scene replan, real narrated A/B, staging rollback.
- The developer cannot mark P16-C03/C04/C05/C06 ACCEPTED without independent proof. Passing a synthetic-media Docker smoke does not satisfy creative acceptance.

Disable PB_CREATIVE_STORY_PREVIEW to remove preview access without modifying data, render artifacts or Railway volume.
