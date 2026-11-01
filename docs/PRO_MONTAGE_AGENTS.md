# PressBuilder Professional Montage — agent onboarding and checkpoint protocol

**Change:** `openspec/changes/professional-montage-p15-p24`. **SDD:** `specs/002-professional-montage`. **State at authoring:** PLANNED, 60/60 TODO. These documents do not grant agent permissions, start jobs or deploy software.

## First five minutes: newcomer read order

1. Read root `AGENTS.md` and applicable video skill `.agents/skills/presbuilder/SKILL.md` or `.claude/skills/presbuilder/SKILL.md`.
2. Read `openspec/config.yaml`, `openspec/changes/professional-montage-p15-p24/proposal.md`, `design.md` and the **exact** capability `specs/<capability>/spec.md`.
3. Read `specs/002-professional-montage/spec.md` and `plan.md` and your exact `PXX-CYY` entry in `tasks.md`.
4. Read the machine registry `docs/pro-montage-checkpoints.json` and verify the checkpoint is TODO/REWORK and all dependencies ACCEPTED. This registry is a planning artifact, **not** an atomic lease queue.
5. For an actual *scene* project, call `list_decks`, `get_project_context`, `get_scene_task`, `get_deck` and `list_scene_tasks`, read the project README and style contract. Verify scene ownership and claim the scene via P06 scoped token and `claim_scene`. Never edit another scene.
6. Confirm live Git HEAD, current OpenSpec, actual Railway deployment branch/commit and release SHA. If they differ, report drift and do not assume new features are deployed.

## Three distinct progress systems — do NOT confuse

| Layer | Source | What it means |
|---|---|---|
| OpenSpec tasks | `openspec/changes/professional-montage-p15-p24/tasks.md` | Proposed feature implementation checkboxes |
| SDD checkpoints | `specs/002-professional-montage/tasks.md` + `docs/pro-montage-checkpoints.json` | Cross-component engineering evidence and reviewer acceptance |
| Scene tasks | `.scene-tasks/sNN.json` and `set_scene_checkpoint` via authorized MCP | Progress for a specific video project/scene, not proof that P15–P24 exists |

No chat message can advance any of these automatically. For an implementation checkpoint, create a scoped PR referencing `P15-C01` etc; submit reproducible evidence; update Markdown and JSON **in the same reviewed commit** after real checks; never turn TODO into ACCEPTED in an unchecked worker PR.

## Checkpoint card: required information

- **Identity:** `checkpoint_id` (e.g. P19-C04), capability, FR references, exact OpenSpec scenario.
- **Actor:** independent authenticated actor + scene scope + lease/fence token where applicable; role/developer, assigned files and revision SHA. Do not paste tokens into notes.
- **Inputs:** approved script, font/media licenses, source SHA, timebase revision, frame/track IDs; specify provenance and limits.
- **Implementation:** changed file list; detailed behavior; config/feature flag; migration; rollback, including impact on old approved MP4.
- **Tests:** exact command, environment OS, Node/Chromium/FFmpeg versions, exit code, counts PASS/FAIL/SKIP; negative cases and QA fixtures with asset hashes.
- **Artifacts:** output MP4/PNG/WAV/OTIO path or authorized URL, SHA-256, duration, FPS, codec, loudness, PTS discrepancy, rendered frame evidence.
- **Review:** reviewer identity, timestamp, decision, unresolved defects, A/B subjective notes separated from technical QA. Independent reviewer cannot be same as submitting worker.
- **Deployment:** exact Git HEAD, Railway service image/branch/commit, stage and revert result. No release without owner authorization.

Recommended machine `evidence[]` entry (fill only after actual run):
```json
{
  "kind": "ci_test",
  "run_url": "https://github.com/<owner>/<repo>/actions/runs/<real-run>",
  "commit_sha": "<40 actual hex digits>",
  "command": "node --test tests/cloud-audio-pro.test.mjs",
  "exit_code": 0,
  "artifact_uri": "<actual authorized artifact path>",
  "artifact_sha256": "<actual 64-hex SHA256>",
  "reviewer": "<authenticated reviewer>",
  "recorded_at": "<UTC timestamp>",
  "notes": "<real observations / remaining limitations>"
}
```
Placeholder strings above are an example, **not evidence**. Never put placeholder data in a checkpoint and then mark `ACCEPTED`.

## Stage gate sequence

**C01 CONTRACT:** Three corresponding OpenSpec requirements mapped to positive/negative scenarios. JSON schema with explicit versions and resource caps, authorization review, owner approval of semantics.

**C02 IMPLEMENTATION:** core deterministic read/preview on owned fixture; no production feature flag; unit tests on exact pinned inputs, re-run reproducibility, no off-scope modification.

**C03 MCP+STUDIO:** authenticated scope, fenced lease, revision CAS, failed request cannot produce partial writes, UI preview and user manual override.

**C04 NEGATIVE QA:** security/adversarial tests on stale/fake credentials, invalid source/license, budgets, cancel and crash; old release remains readable. Ordinary test stubs do not prove browser/FFmpeg behavior.

**C05 REAL E2E:** six separate real rendered scenes, 24/30 and rational FPS cases as relevant, actual audio analysis and frame screenshots, injected defect plus A/B human reviewer. No mandatory `SKIP`.

**C06 CANARY:** staging-only and exact commit SHA, resource metrics, restart/rollback, final reviewer and owner authorization to enable production. GitHub CI success ≠ Railway live version.

## Work division and review separation

| Workstream | Primary planned features | Role boundary |
|---|---|---|
| Rhythm / audio | P15, P19 | No change to approved text/music rights/other scene |
| Motion / continuity | P17, P18 | Only own scene/motion sidecars; no foreign camera edit |
| Typography / color | P20, P21 | Only own visual sidecars; global style needs director |
| Asset / timeline | P22, P24 | Only authorized catalog/edit graph; no external fetch by default |
| Creative director / QA | P16, P23 | May propose and review, must not self-approve worker output |

Feature assignments are suggestions, not independent running agents. A worker should work in an isolated branch/task and cannot assume reviewer powers from text instructions.

## Quality commands

- `node --test tests/pro-montage-spec.test.mjs` — local consistency, no npm install.
- `npx --yes @fission-ai/openspec@1.14.3 validate professional-montage-p15-p24 --strict` — upstream OpenSpec strict on a workstation/CI with permitted installation.
- `npm run build`, `npm run test:cloud` — existing application tests.
- `Docker real Chromium+FFmpeg render-smoke` — only after corresponding feature implementation; skip must be reported honestly.
- `node --test tests/cloud-<feature>.test.mjs` — **planned** tests that do not exist until their checkpoint is implemented.

For any changed specification, rerun both OpenSpec strict and the checkpoint parity test. If either fails, do not mark stage accepted.

## Strict fail-closed rules

- Unknown license? Do not select the B-roll/music.
- Technical FAIL or expired scene lease? Do not publish.
- Artistic REVIEW? Keep human opinion and reasoning separate from objective evidence.
- Reused video with changed source SHA/timebase? Invalidate previous QA; never pretend old evidence applies.
- Conflict among concurrent agent edits? Preserve old approved scene and require a new revision/lease.
- Missing expected job or ability to access current source? Record BLOCKED and avoid fictitious work.
- Stale GitHub vs Railway branch? Report explicitly, do not assume feature reached production.

## New agent handoff summary

`P15–P24: OpenSpec and SDD documents present; ALL 60 implementation checkpoints initially TODO; no feature delivered by this documentation PR. Pick one checkpoint after verifying dependency and real lease/branch, do work, test, attach real evidence, request independent review.`
