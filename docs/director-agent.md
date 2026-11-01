# Director Agent — P10 Planning MVP

This is a **reviewable deterministic planner**, not a background LLM agent or a six-worker orchestrator.

## Safety boundary

- A new agent can **read** and **propose** a plan through MCP, but cannot approve it over MCP.
- Only a user with **web-editor Basic credentials** can publish via the protected HTTP endpoint.
- A proposal is stored under /data/decks/<project-id>/.director/plan.json. It does not change deck.json, README.md, scene tasks, or trigger renders.
- Publication checks the exact deck fingerprint, README revision, all six scene task revisions, and that all assignments remain empty. Any conflict returns HTTP 409 without overwriting another agent.
- Approval uses a local journal and restores previous file bytes on a detected interrupted write. Cross-process writers on different server instances are still not supported; leases/ACL belong to P06.
- Publication adds an appendix to the project README and creates six independent scene task files in .scene-tasks/. Original narration and deck metadata are unchanged.
- Director previews the existing P04 style contract (including its enforce flag) and refuses approval if that contract changes after planning. Enforcement itself is provided by P04, not by Director. Neither success nor artistic quality is inferred from task status.

## Create and review a six-scene plan

1. Create a project with exactly six slides through create_deck({id,title,text,slide_count:6,target:45}) or choose an existing six-slide project.
2. Call get_director_plan({id:"video-id"}) to obtain the current revision (0 for a new plan).
3. Call propose_director_plan with goal, constraints and optional scene-specific concepts. The planner quotes existing cue text, makes six standalone briefs, recommends style rules, and specifies checkpoints and dependency edges. It cannot invent or change narration.
4. Inspect all six scene briefs, on-screen text, dependencies, scene timing and README appendix. The project owner decides whether the division of responsibilities and creative decisions are suitable.
5. After explicit human review, publish through POST /api/decks/:id/director/approve with web-editor credentials. The MCP token alone cannot approve.
6. Each scene agent calls get_project_context and get_scene_task and works only on its assigned scene. Use get_director_plan to monitor checkpoint/status summaries.

Example MCP proposal (fill actual content):

~~~json
{
  "id": "my-video",
  "expected_revision": 0,
  "goal": "Explain the business process accurately in 42 seconds",
  "constraints": "Single visual language, no invented facts, readable text",
  "scene_directions": [
    {
      "scene_id": "s02",
      "concept": "Camera follows requests from buyer to three suppliers",
      "must_show": "Only claims explicitly stated by the script",
      "depends_on": ["s01"]
    }
  ]
}
~~~

Example explicit web approval **after reviewing the plan**, with the exact revision from get_director_plan:

~~~bash
curl --fail-with-body -u "$PB_WEB_USER:$PB_WEB_PASSWORD" \
  -H "Content-Type: application/json" \
  -X POST "https://YOUR-PRESSBUILDER-HOST/api/decks/my-video/director/approve" \
  -d '{"expected_revision":1,"confirm":"APPROVE"}'
~~~

Do not send web credentials to an untrusted scene agent. POST must be made to the authenticated editor origin. Cross-origin writes are blocked.

## API and state machine

| Endpoint/tool | Action |
|---|---|
| MCP get_director_plan | Read plan, current revision, approval state and live scene progress |
| MCP propose_director_plan | Persist a new draft at the requested revision, without updating scene tasks |
| GET /api/decks/:id/director/plan | Read current plan with web auth |
| POST /api/decks/:id/director/plan | Create a draft with web auth |
| POST /api/decks/:id/director/approve | Explicitly approve the current draft with web auth, confirm: APPROVE |
| POST /api/decks/:id/director/replan/:scene | Web-editor-only revision of exactly one blocked/review scene. Requires plan and task revisions. |
| POST /api/decks/:id/director/signoff | Web-editor-only final RELEASE after six accepted scene tasks, evidence, P05 assembly PASS, existing MP4, correct job and SHA-256 |
| MCP get_scene_task | Read the published instructions for one scene |
| MCP set_scene_checkpoint | Record an independently verified result, with evidence |

Plan states: none → draft → approved → released. Drafts can be revised before approval; after approval the plan is locked against replacement and only a single blocked/review scene can be manually replanned. Publishing over populated or changed assignments is rejected. A blocked or in-review scene may be replanned independently through POST /api/decks/:id/director/replan/:scene. Provide expected_plan_revision, expected_task_revision, reason, optional direction and reset_checkpoint_ids. Only explicitly selected checkpoint done flags are reset; their notes remain as historical evidence. The updated task returns to todo, other scenes do not change, and the plan records each revision. Maximum three manual replans per scene; no automatic agent retry or execution.

Example HTTP replan after inspecting the current plan and task revisions:

~~~json
{
  "expected_plan_revision": 2,
  "expected_task_revision": 3,
  "reason": "The title overlaps the camera subject",
  "direction": "Move title into the safe area",
  "reset_checkpoint_ids": ["technical_qa"]
}
~~~

Every scene has six uncompleted checkpoints: storyboard, assets, animation, render, technical QA, human review. A dependency may refer only to an earlier scene, so the dependency graph is acyclic. Other scenes are independently assignable. Progress is derived from actual tasks and is not an execution log. `progress.ready_to_start` and each scene's `waiting_on`/`ready_to_start` make dependencies visible; **advisory only**, they do not spawn workers or replace P06 leases.

## P10 worker dispatch (pull-based MVP)

Following Director approval, **external workers** can pull their authorized scenes through MCP. The server does not start LLM sessions, shell commands, videos or remote agents on their own. The worker explicitly invokes rendering through its existing MCP render tools.

1. The project owner configures unique P06 worker keys via `PB_AGENT_KEYS_JSON`. Each `id` must match its Director-assigned task name case-insensitively (e.g. `agent-01` ↔ `Agent-01`), with the appropriate project and scene scopes.
2. The worker calls `get_director_work({id})`. A scene is ready only when every declared dependency is marked `done` by human acceptance.
3. The worker calls `claim_scene({id,slide_id,ttl})` to receive the P06 fencing token, then `claim_director_job({id,slide_id,fence_token,expected_task_revision})`. The job state is saved in `/data/decks/<id>/.director/dispatch/<scene>.json`. Repeating the same live claim is idempotent, including after process restart.
4. During lengthy tasks, renew the P06 scene lease first, then call `heartbeat_director_job`. A heartbeat cannot extend past that lease's actual expiry.
5. After creating a real scene MP4, complete the `render` and `technical_qa` checkpoints, each with evidence. Then call `submit_director_job`. The server checks the current render status, QA verdict and actual MP4 file, and moves the scene to **review**, never `done`.
6. On failure, call `fail_director_job` with a reason: only the assigned scene becomes `blocked`. The director can use the existing authenticated `director/replan/:scene` endpoint to publish revised instructions; this starts a new **scene-specific** dispatch epoch without resetting other scenes.

| Tool | Who may use it | Purpose |
|---|---|---|
| `get_director_work` | Director / scoped worker | Get pending, claimed, expired, submitted and blocked jobs |
| `claim_director_job` | Fenced worker | Claim their ready scene with task revision and actor check |
| `heartbeat_director_job` | Fenced worker | Persist heartbeat without extending P06 lease |
| `submit_director_job` | Fenced worker | Require passed render and QA, then request human review |
| `fail_director_job` | Fenced worker | Persist a failure reason and block only its scene |
| `GET /api/decks/:id/director/work` | Authenticated editor | View complete dispatch board |

Safety and limits: three claim attempts per scene/replan epoch; no monetary cost metering yet. A worker cannot modify another scene, a stale fencing token cannot advance a job, and a failed render cannot be promoted to review. The append-only local event log lives in `.director/dispatch-events.jsonl`. If the process stops between moving a scene into `review`/`blocked` and recording its dispatch outcome, restart classifies the job as `needs_reconciliation` and records an explicit event. It never assumes successful QA from the recovered status alone; the director must inspect or replan the affected scene. File atomic replacement is only safe for a **single process**; distributed workers sharing a volume require transactional storage, fencing at the storage layer and an explicit multi-instance design. This is a *durable pull coordinator*, not an autonomous AI-agent launcher or distributed task queue.

## Final delivery / human sign-off

The P05 assembler runs separately: after six individual scenes are marked done, actually rendered, and passed technical QA, the director requests assemble_video with all six scene IDs. Wait for get_assembly_status to return completed. This does **not** automatically sign off the video.

A human reviewer checks the assembled output, then sends:

~~~json
{
  "expected_plan_revision": 2,
  "assembly_job_id": "actual-job-id-from-get_assembly_status",
  "confirm": "RELEASE"
}
~~~

to POST /api/decks/:id/director/signoff with web-editor credentials. Sign-off rejects missing or mismatching final MP4 bytes, any modified/missing immutable approved P08 scene MP4 (using P05 manifest SHA-256), assembly job, project, scene order, incomplete checkpoints or absent render/QA/human-review evidence. It records a release receipt (SHA-256, size, mtime, plan/job IDs). Reading a release later reports artifact_missing/artifact_changed if file metadata no longer agrees with the receipt. This is a human QA-to-release gate, **not** autonomous creative review.

## Not implemented

- No external LLM calls, creative evaluation, or actual autonomous agent process spawning.
- Director does not invent or overwrite a P04 style contract; style enforcement follows the currently configured P04 enforce flag.
- P06 provides per-agent bearer keys and single-process fenced leases. Distributed multi-instance fencing and token rotation remain outside this MVP.
- No automatic spawning of external agents, distributed worker scheduler or monetary cost metering (P10.3/P10.4). A local persistent pull/claim/heartbeat/submission coordination layer is implemented; manual replan still governs failures.
- No automatic progression from QA to human review and final release: P05 assembly and P10 final sign-off are explicit, separately invoked operations. P05 only supports hard cuts.
- No full six-real-render failure-injection E2E (P10.6). Planning/replan integration and release-manifest boundary tests pass independently; the sign-off unit fixture uses synthetic bytes and does **not** assert actual MP4 codec correctness. Real MP4 validation is P05's responsibility.

## Verification

Run npm run test:cloud and npm run build, and execute the Docker render smoke in CI. The additional `cloud-director-six-scenes.test.mjs` exercises six actual H.264 scene files, assembly, immutable provenance and Director sign-off when ffmpeg/ffprobe are installed. A passing syntax or mocked state-machine check alone is not a substitute for this CI. In addition to the planning/sign-off checks, cloud-director-dispatch.test.mjs tests retry budgets, P06 fencing, restart replay and QA→review; cloud-director-dispatch-http.test.mjs verifies real MCP worker scopes, project dependency gates, HTTP approval and manual replan across an HTTP server restart.
