# Design: professional montage across P15–P24

## 1. Current system and boundaries

Keep existing PressBuilder semantics: `deck.json` is editor-owned; P06 scene fences and actor role checks protect writes; P08 approved MP4 versions are immutable; P05 assembly uses *approved* artifacts; P09 supplies cue anchors; P10 coordinates director/reviewer gates; P11–P14 provide previews, diffs, performance and A/B experiments. Pro features MUST remain opt-in, do not rewrite accepted releases, and use backward-compatible versioned sidecars.

**Trust boundaries:** Browser/MCP clients and AI agents are untrusted. Service authenticates principal + role + project + slide + lease token on every mutation, then checks `expected_revision` under a transaction or CAS. A caller-provided `verified`, `approved`, `confidence`, `ffprobe` flag or audio analysis is not cryptographic evidence. Creator input never authorizes remote URL reads or arbitrary scripts.

## 2. Canonical media timeline

- Represent time as `{num, den}` FPS plus integer presentation frames/ticks or rational PTS; allow 24/1, 25/1, 30/1, 24000/1001, 30000/1001, 60/1 and validate each explicitly. Do not round-trip through binary float for cut decisions.
- Canonical schedule is the only authority for cue timing, editable clip trim, motion keyframes, subtitle/timecode, J/L audio edits and exports.
- Assign stable IDs to project, scene, cue, clip, track, action, asset, revision. The `timebase_revision` changes when schedule changes; stale render and cache entries fail closed.
- For mixed FPS assets, define a conversion policy (e.g. exact PTS mapping to output frame grid) and report duplicate/drop decisions. A/B compare decoded frames and PTS at edit boundaries.

## 3. Versioned sidecar contracts (proposed, not existing API)

| Contract | Required fields | Authority |
|---|---|---|
| `montage/rhythm-v1.json` | revision, canonical_fps, word_alignment_revision, beats, cut_candidates, manual_overrides | director/editor |
| `montage/storyboard-v1.json` | story_revision, scene_order, intent, hook/payoff, alternatives, approvals | director / reviewer |
| `montage/continuity-v1.json` | entry/exit state, edit type, visual match, audio prelap/postlap, source_revision | editor |
| `montage/motion-v1.json` | bounded keyframes, interpolation, camera, blur budget, motion-safe profile | scene worker |
| `montage/mix-v1.json` | owned tracks, gain, ducking envelope, loudness policy, rights_ref | audio editor |
| `montage/typography-v1.json` | cue/word spans, font manifest, fallback, glyph bounds, safe areas | scene worker |
| `montage/color-v1.json` | primaries/transfer, exposure, grade revision, LUT SHA/license, source | director/editor |
| `montage/asset-catalog-v1.json` | SHA-256, owner/license, allowed_use, origin, expiry, media properties | asset steward |
| `montage/creative-qa-v1.json` | rules, timecoded evidence, severity, reviewer decision, model version | QA/reviewer |
| `montage/timeline-v1.json` | tracks, clips, transitions, rational PTS, approvals, source pins, undo history | editor |

Schemas must carry `schema_version`, `project_id`, `expected_revision`, content SHA-256 and a bounded list size. Per-scene sidecars are separate from common project/global style contract. Default absence retains P01–P14 behavior.

## 4. Components and data flow

```text
Approved scenario + owned media
    -> P15 word/pause/beat alignment  ---> timebase proposals
    -> P16 human-approved story plan    -> per-scene briefs (P10)
    -> P17/P18/P20/P21 scene renderer   -> P02 bounded render queue
    -> P19 sound mixer                 -> frame-accurate audio tracks
    -> P22 licensed asset selector     -> source-pinned B-roll
    -> P23 technical and creative QA  -> human reviewer -> P05/P13/P14 assembly
    -> P24 editable timeline export   -> final immutable release pointer
```

Only source-approved versions enter assembly. Draft previews can be rendered separately without changing approved pointers. Scenes can be processed independently using immutable inputs and scene-specific fence tokens. Director cannot silently convert a review recommendation into approved release.

## 5. Security and operational rules

- Every external asset is explicit, owner-authorized and licensed. No opportunistic scraping or implicit remote URL fetch. No dynamic TS code, `eval`, filesystem traversal or ffmpeg filter strings from untrusted clients.
- Whitelist FFmpeg filters/options; convert requests to safe typed arguments. Hard resource ceilings: input size, duration, pixels, codec, number of tracks, filter graph complexity, memory, CPU time and concurrency.
- Journal render/mix/export as `queued/running/completed/failed/cancelled`; idempotency key = requested action + normalized spec SHA + approved source hashes + renderer version. Use CAS for immutable release pointer.
- Lease expires or revision drifts -> reject edit and require rebase. A cancelled or failed job cannot overwrite last approved MP4.
- Change logs record actor, project, scene, object, revisions, action, output SHA, CI/QA evidence IDs, time, license checks and reviewer outcome. Never log tokens or raw private speech.
- Keep credentials server-side. Use a distinct principal for each agent, never share a director admin key among workers.

## 6. Release pipeline and rollout strategy

- **Stage 0:** contracts + test fixture generators; run with flags disabled, verify backward compatibility.
- **Stage 1:** opt-in draft preview per scene. No publishing; compare baseline and candidate outputs.
- **Stage 2:** six-scene real-media Docker E2E, A/B decoded PTS, technical QA, signed reviewer release; fail stale hashes.
- **Stage 3:** staging environment canary with explicit commit SHA + Railway source branch confirmation, memory/CPU/disk ceilings and durable rollback.
- **Stage 4:** production release only after reviewer approval and manual confirmation. Stop rollout on crash/5xx/latency threshold, preserve old `current.json`.

## 7. Quality evidence and metrics

Technical: frame mismatch count; PTS boundary difference; audio track presence; loudness and true peak; glyph bbox outside safe area; flash intensity; blur/contrast; source SHA; asset license validity; render success; queue time, 95p preview time, RAM/CPU, cache hit rate. Artistic: separate human blinded A/B ratings and qualitative annotations, never use as hard technical gate. Telemetry collection must be opt-in for media characteristics and not expose private transcripts.

Target values in proposal are hypotheses until calibrated. A test called `PASS` without attached exact commit, test job and hashes is not an accepted checkpoint.

## 8. Workstream partition for independent agents

| Agent role | Owns | Must not touch |
|---|---|---|
| Rhythm/audio | P15/P19; aligned cue + mix sidecars | Scene visual code or approved MP4 |
| Motion/continuity | P17/P18; keyframes and boundary states | Audio rights metadata or other scenes |
| Typography/color | P20/P21; scoped visual contracts | Shared global stylesheet without director approval |
| B-roll/timeline | P22/P24; licensed media and export | Unapproved remote assets or signed approvals |
| Director/reviewer | P16/P23; proposals, review and release | Self-approving submitted worker results |

Each workstream MUST acquire a distinct real task/lease; this table does not create running agents. Review functions are separate from worker functions. No one may edit another agent's allocated files based only on a written note.

## 9. Key tradeoffs / decisions to revisit

- WebGL/Pixi/Canvas vs scene DSL: prefer bounded DSL and existing Canvas until repeatable QA motivates a renderer replacement.
- Audio analysis libraries: first prove locally on synthetic/owned assets, keep optional provider/third-party models behind opt-in.
- Creative LLM planning must never be allowed to delete user script or bypass an approval.
- OTIO interchange is best-effort, versioned and should include loss reports; Pro timeline remains canonical.
- Avoid naive fixed `Loudness LUFS` defaults for all platforms; define calibrated delivery profiles.
