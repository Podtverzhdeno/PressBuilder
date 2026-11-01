# Director Agent — P10 Planning MVP

This is a **reviewable deterministic planner**, not a background LLM agent or a six-worker orchestrator.

## Safety boundary

- A new agent can **read** and **propose** a plan through MCP, but cannot approve it over MCP.
- Only a user with **web-editor Basic credentials** can publish via the protected HTTP endpoint.
- A proposal is stored under /data/decks/<project-id>/.director/plan.json. It does not change deck.json, README.md, scene tasks, or trigger renders.
- Publication checks the exact deck fingerprint, README revision, all six scene task revisions, and that all assignments remain empty. Any conflict returns HTTP 409 without overwriting another agent.
- Approval uses a local journal and restores previous file bytes on a detected interrupted write. Cross-process writers on different server instances are still not supported; leases/ACL belong to P06.
- Publication adds an appendix to the project README and creates six independent scene task files in .scene-tasks/. Original narration and deck metadata are unchanged.
- Generated style_contract is **advisory**. It is not a P04 machine-enforced validator. Neither success nor artistic quality is inferred from task status.

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
| MCP get_scene_task | Read the published instructions for one scene |
| MCP set_scene_checkpoint | Record an independently verified result, with evidence |

Plan states: none → draft → approved. A subsequent proposal creates a new draft; existing assignments are **not** silently replaced. Publishing over populated or changed assignments is rejected. This MVP does not offer scene-specific replanning.

Every scene has six uncompleted checkpoints: storyboard, assets, animation, render, technical QA, human review. A dependency may refer only to an earlier scene, so the dependency graph is acyclic. Other scenes are independently assignable. Progress is derived from actual tasks and is not an execution log.

## Not implemented

- No external LLM calls, creative evaluation, or actual autonomous agent process spawning.
- No enforcement of the advisory style contract (P04 pending).
- No reliable worker leasing or authentication per agent (P06 pending).
- No retry/replan per failed scene, cost/iteration budgets or event-sourced orchestration (P10.3/P10.4).
- No automatic QA-to-signoff/release gate or deterministic final MP4 assembly (P05/P10.5).
- No full six-render failure-injection end-to-end test (P10.6). Integration tests validate plan, authorization, task isolation and conflict rejection, **not final video output**.

## Verification

Run npm run test:cloud and npm run build. The test cloud-director.test.mjs covers a six-scene draft, human-only approval, scene task isolation, changes to deck/README, stale plan and task revisions, and the absence of an automatic release.
