/** Stateless Streamable HTTP MCP endpoint. No arbitrary shell or filesystem tools. */
import { createDeck, DECKS, OUT, getDeck, listDecks, patchCue, patchDeck, patchObject, patchSlide, reorderSlides, setVisuals, UserError } from './cloud-core.mjs';
import { sceneTaskStore } from './scene-tasks.mjs';
import { projectReadmeStore } from './project-readme.mjs';
import { scene3dStore } from './scene-3d.mjs';
import {directorStore} from './director.mjs';
import {typedSceneBriefService} from './typed-scene-brief.mjs';
import {mediaCatalogStore} from './media-catalog.mjs';
import {editGraphService} from './edit-graph.mjs';
import {editOperationService} from './edit-operations.mjs';
import {fencedJobLedger} from './fenced-job-ledger.mjs';
import {qcCockpitService} from './qc-cockpit.mjs';
import {directorDispatchStore} from './director-dispatch.mjs';
import {styleContractStore,enforceScene3D,enforceVisuals,effectiveStyle} from './style-contract.mjs';
import {styleById} from '../src/engine/styles.ts';
import {sceneLeaseStore} from './scene-leases.mjs';
import path from 'node:path';
const taskStore=sceneTaskStore({root:DECKS,seedRoot:path.join(process.cwd(),'src','decks'),getDeck});
const readmeStore=projectReadmeStore({root:DECKS,seedRoot:path.join(process.cwd(),'src','decks'),getDeck});
const scene3d=scene3dStore({root:DECKS,seedRoot:path.join(process.cwd(),'src','decks'),getDeck});
const styles=styleContractStore({root:DECKS,getDeck});
const leases=sceneLeaseStore({root:DECKS,getDeck});

const obj = (properties, required=[]) => ({ type:'object', properties, required, additionalProperties:false });
const str = (description) => ({ type:'string', description });
const num = (description) => ({ type:'number', description });
const nilNum = (description) => ({ oneOf:[{ type:'number' },{ type:'null' }], description });
export const TOOLS = [
 { name:'list_decks', description:'START HERE if the user did not give a project ID. List all PressBuilder video projects, then call get_project_context for the chosen project and get_scene_task before editing a scene.', inputSchema:obj({}) },
 { name:'get_deck', description:'Read project slides, narration, timing, project README and scene task status. For a new agent use get_project_context first, followed by get_scene_task for your assigned scene.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_project_context', description:'RECOMMENDED FIRST ACTION for any agent unfamiliar with a PressBuilder project: one call returns the project README.md, title, global format, scene list, all task statuses/checkpoints, and optionally the full assignment of one scene. If project ID is unknown, call list_decks first. Read the README and your scene task BEFORE modifying a scene.', inputSchema:obj({id:str('Project slug'),slide_id:str('Optional specific scene ID; returns full brief and checkpoints')},['id']) },
 { name:'get_project_readme', description:'Read the project-specific README.md from the video project, including the global style, storyboard, constraints and onboarding steps. Not the GitHub repository README.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'update_project_readme', description:'Update the project-specific Markdown README. Needs expected_revision from get_project_readme or get_project_context to prevent stale writes. Does not overwrite scene tasks or deck.json.', inputSchema:obj({id:str('Project slug'),content:str('Complete README.md Markdown, maximum 64 KiB'),expected_revision:str('Exact revision from last README read')},['id','content','expected_revision']) },
 { name:'create_deck', description:'Create an animated video project from a narration script; automatically partition it into slides and cues. New projects start with placeholders; call set_slide_visuals to author animated graphics without a redeploy.', inputSchema:obj({id:str('Unique slug, lowercase letters/digits/hyphens'),title:str('Human-readable video title'),text:str('Narration script'),style:{type:'string',enum:['terevo','midnight','paper','lines']},slide_count:{type:'integer',minimum:1,maximum:300},target:nilNum('Target duration in seconds or null')},['id','title','text']) },
 { name:'update_deck', description:'Edit video metadata and output format, preserving slides.', inputSchema:obj({id:str('Project slug'),title:str('Title'),style:{type:'string',enum:['terevo','midnight','paper','lines']},target:nilNum('Target duration in seconds or null'),fps:{type:'number',minimum:1,maximum:120},height:{type:'integer',enum:[720,1080,1440,2160]}},['id']) },
 { name:'update_cue', description:'Edit voiceover wording, on-screen phrase and timing for an existing cue.', inputSchema:obj({fence_token:{type:'integer',minimum:1,description:'Fencing token from claim_scene (required for agent writes)'},id:str('Project slug'),slide_id:str('Slide ID'),cue_id:str('Cue ID'),say:str('Narration text'),show:{type:['string','null']},dur:nilNum('Cue duration (seconds); null to reset'),hold:nilNum('Pause after cue in seconds; null to reset')},['id','slide_id','cue_id']) },
 { name:'update_slide', description:'Edit the slide label and lead/tail pauses.', inputSchema:obj({fence_token:{type:'integer',minimum:1,description:'Fencing token from claim_scene (required for agent writes)'},id:str('Project slug'),slide_id:str('Slide ID'),label:str('Slide label'),lead:nilNum('Seconds'),tail:nilNum('Seconds')},['id','slide_id']) },
 { name:'update_object', description:'Override an existing scene object by ID: position, size, text, visibility. Objects must already exist in scene code.', inputSchema:obj({fence_token:{type:'integer',minimum:1,description:'Fencing token from claim_scene (required for agent writes)'},id:str('Project slug'),slide_id:str('Slide ID'),object_id:str('Object ID'),x:nilNum('X coordinate'),y:nilNum('Y coordinate'),scale:nilNum('Scale'),text:{type:['string','null']},hidden:{type:'boolean'}},['id','slide_id','object_id']) },
 { name:'set_slide_visuals', description:'Create or replace an entire animated infographic scene with 1..30 editable graphics (text, rect, circle, line, bar). No code deployment required. Each element can animate from slide start or from a cue ID; existing TypeScript scenes take priority. Coordinates are in 1920x1080 pixels. A replacement list [] clears the graphics.', inputSchema:obj({fence_token:{type:'integer',minimum:1,description:'Fencing token from claim_scene (required for agent writes)'},id:str('Project slug'),slide_id:str('Existing slide ID'),elements:{type:'array',maxItems:30,items:{type:'object',additionalProperties:false,properties:{id:str('Unique object ID'),kind:{type:'string',enum:['text','rect','circle','line','bar']},x:num('Left coordinate'),y:num('Top coordinate'),w:num('Width or horizontal line delta'),h:num('Height or vertical line delta'),text:str('Display text, required for text kind'),radius:num('Radius / corner radius'),size:num('Font size'),line_width:num('Line width'),color:{type:'string',enum:['h1','accent','text','pos','panel','bg']},font:{type:'string',enum:['display','sans','mono']},weight:{type:'string',enum:['regular','bold']},cue_id:str('Start animation when this cue begins'),effect:{type:'string',enum:['fade','rise','slide','pop']},duration:num('Entrance duration in seconds')},required:['id','kind','x','y']}}},['id','slide_id','elements']) },
 { name:'list_scene_tasks', description:'List all scene assignments, assignees, full prompts, statuses and individual checkpoints. Agents should call this after opening a video project.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_typed_scene_brief', description:'M40 read-only, server-proven six-scene P10 execution contract with source fingerprint, cue IDs, task revision and no publish permission. Requires an approved P10 plan and scoped actor assignment. Disabled by default.', inputSchema:obj({id:str('Project ID'),slide_id:str('Assigned scene ID')},['id','slide_id']) },
 { name:'get_scene_task', description:'Get the full scene-specific agent assignment, detailed brief, deliverables, checkpoints and revision.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'set_scene_task', description:'Create or edit the full assignment for one scene (not the deck). Requires the latest expected_revision from get_scene_task or list_scene_tasks to avoid overwriting another agent. Keeps unspecified fields unchanged.', inputSchema:obj({fence_token:{type:'integer',minimum:1,description:'Fencing token from claim_scene (required for agent writes)'},id:str('Project slug'),slide_id:str('Scene ID'),expected_revision:{type:'integer',minimum:0},title:str('Scene task title'),assignee:str('Agent/owner name'),brief:str('Detailed task specification, up to 20000 characters'),deliverables:str('Acceptance criteria and deliverable requirements'),status:{type:'string',enum:['todo','in_progress','review','done','blocked']},checkpoints:{type:'array',maxItems:60,items:obj({id:str('Stable checkpoint id'),title:str('Checkpoint action'),done:{type:'boolean'},note:str('Completion evidence or blocker')},['id','title'])}},['id','slide_id','expected_revision']) },
 { name:'set_scene_checkpoint', description:'Update exactly one scene checkpoint and preserve all other scenes/tasks. Use after completing and checking a milestone; provide evidence in note.', inputSchema:obj({fence_token:{type:'integer',minimum:1,description:'Fencing token from claim_scene (required for agent writes)'},id:str('Project slug'),slide_id:str('Scene ID'),checkpoint_id:str('Checkpoint ID'),done:{type:'boolean'},note:str('Evidence or details')},['id','slide_id','checkpoint_id']) },
 { name:'get_scene_sync', description:'Read narration timing and one-scene beat/3D/SFX/camera markers.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'set_scene_sync', description:'Save validated scene markers, requiring worker scoped fenced lease and optimistic revision.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),fence_token:{type:'integer',minimum:1},expected_revision:{type:'integer',minimum:0},markers:{type:'array',maxItems:100,items:obj({id:str('Stable event ID'),kind:{type:'string',enum:['beat','sfx','music','camera','animation','transition']},anchor:obj({type:{type:'string',enum:['scene','cue_start','cue_end']},cue_id:str('Narration cue ID'),offset:num('Seconds')},['type','offset']),duration:num('Seconds'),emphasis:num('0..1'),silence:{type:'boolean'},note:str('Action or provenance')},['id','kind','anchor'])}},['id','slide_id','expected_revision','markers']) },
 { name:'get_director_work', description:'Read current Director work dispatch board. Workers see only authorized scenes; dependencies and remaining claim budget are included. Does not start any agent.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'claim_director_job', description:'Worker-only: claim your assigned ready scene after claim_scene acquired a valid P06 fenced lease. Requires the latest task revision. Does not run any model or renderer. Returns durable job_id.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),fence_token:{type:'integer',minimum:1},expected_task_revision:{type:'integer',minimum:0}},['id','slide_id','fence_token','expected_task_revision']) },
 { name:'heartbeat_director_job', description:'Worker-only: record liveness after renewing P06 scene lease, without extending beyond the current lease.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),fence_token:{type:'integer',minimum:1},job_id:str('Claimed job id')},['id','slide_id','fence_token','job_id']) },
 { name:'submit_director_job', description:'Worker-only: submit a claimed scene for HUMAN review. Requires completed render+technical_qa checkpoints with evidence, passing render job QA and actual MP4. Never marks scene done.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),job_id:str('Claimed job ID'),fence_token:{type:'integer',minimum:1},expected_task_revision:{type:'integer',minimum:0}},['id','slide_id','job_id','fence_token','expected_task_revision']) },
 { name:'fail_director_job', description:'Worker-only: mark only your claimed scene blocked, recording failure for director replan.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),job_id:str('Claimed job ID'),fence_token:{type:'integer',minimum:1},expected_task_revision:{type:'integer',minimum:0},reason:str('Failure description')},['id','slide_id','job_id','fence_token','expected_task_revision','reason']) },
 { name:'get_director_plan', description:'Director-only: view six-scene plan, current revision, dependency graph and task progress; no actions are launched.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'propose_director_plan', description:'Director-only: propose (not publish) six scene briefs grounded in the existing deck cues. Requires six existing slides and latest revision. Human approval uses separately authenticated web-editor HTTP, not MCP.', inputSchema:obj({id:str('Project slug'),expected_revision:{type:'integer',minimum:0},goal:str('Video objective, up to 2500 chars'),constraints:str('Global restrictions, up to 5000 chars'),scene_directions:{type:'array',maxItems:6,items:obj({scene_id:str('Existing scene ID'),concept:str('Visual concept'),must_show:str('Required visible elements'),depends_on:{type:'array',maxItems:5,items:{type:'string'}}},['scene_id'])}},['id','expected_revision','goal']) },
 { name:'get_scene_3d', description:'Read the independently stored data-only 3D composition of a particular video scene, including revision. Returns null spec if not authored yet.', inputSchema:obj({id:str('Project slug'),slide_id:str('Existing scene ID')},['id','slide_id']) },
 { name:'set_scene_3d', description:'Publish a safe declarative 3D composition for exactly one scene, with 1..18 shaded rotating 3D meshes and an animated perspective camera. No arbitrary JS; uses the existing 3D engine and is rendered in the web editor and MP4. Must pass expected_revision from get_scene_3d. Does not edit deck.json or other scenes.', inputSchema:obj({fence_token:{type:'integer',minimum:1,description:'Fencing token from claim_scene (required for agent writes)'},id:str('Project slug'),slide_id:str('Existing scene ID'),expected_revision:{type:'integer',minimum:0},spec:obj({version:{type:'integer',const:1},camera:obj({cx:num('Camera center X in 1920px space'),cy:num('Camera center Y'),size:num('Pixels per 3D unit 20..500'),dist:num('Camera distance 5..80'),yaw:num('Yaw radians'),pitch:num('Pitch radians'),yaw_speed:num('Yaw radians/second -2..2'),pitch_speed:num('Pitch radians/second'),zoom_speed:num('Proportional zoom per second')},[]),objects:{type:'array',minItems:1,maxItems:18,items:obj({id:str('Stable ID'),mesh:{type:'string',enum:['cube','pyramid','octa','icosa','hexPrism','cylinder']},pos:{type:'array',items:{type:'number'},minItems:3,maxItems:3},scale:num('0.02..5'),rotation:{type:'array',items:{type:'number'},minItems:3,maxItems:3},spin:{type:'array',items:{type:'number'},minItems:3,maxItems:3},color:str('Hex color #RRGGBB'),edge_color:{type:['string','null']},wire:{type:'boolean'},start:num('Entrance start seconds'),start_marker:str('Optional P09 cue marker ID'),fade:num('Entrance fade seconds')},['id','mesh','color'])}},['version','camera','objects'])},['id','slide_id','expected_revision','spec']) },
 { name:'reorder_slides', description:'Reorder existing slides without losing any cue IDs.', inputSchema:obj({id:str('Project slug'),slide_ids:{type:'array',items:{type:'string'}}},['id','slide_ids']) },
 { name:'get_style_contract', description:'Read visual contract and optional effective scene policy.', inputSchema:obj({id:str('Project slug'),slide_id:str('Optional scene ID')},['id']) },
 { name:'set_style_contract', description:'Director only: replace validated style contract with optimistic revision.', inputSchema:obj({id:str('Project slug'),expected_revision:{type:'integer',minimum:0},contract:{type:'object'}},['id','expected_revision','contract']) },
 { name:'get_scene_lease', description:'Read current scene ownership and fencing lease.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'claim_scene', description:'Acquire scene lease as worker and get fencing token.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),ttl:{type:'integer',minimum:30,maximum:3600}},['id','slide_id']) },
 { name:'renew_scene_lease', description:'Extend live lease with matching fencing token.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),fence_token:{type:'integer',minimum:1},ttl:{type:'integer',minimum:30,maximum:3600}},['id','slide_id','fence_token']) },
 { name:'release_scene', description:'Release the lease and invalidate old fencing tokens.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),fence_token:{type:'integer',minimum:1}},['id','slide_id','fence_token']) },
 { name:'list_scene_versions', description:'List immutable QA-passing rendered versions of a scene, plus the explicitly approved pointer.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'get_qc_cockpit',description:'M51 read-only P05 verified release timeline, P07 version-pinned timecoded notes and unlocated P03 QA; worker sees only assigned P06 scene.',inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID required for non-director')},['id']) },
 { name:'get_fenced_job',description:'M50 source-verified, nonpublishing job lease journal; P06 scene scope.',inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),job_id:str('Job ID')},['id','slide_id','job_id']) },
 { name:'begin_fenced_job',description:'M50 director-only idempotent P08 QA work item, not P05 release.',inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),job_id:str('Job ID'),request_id:str('Idempotency request'),source_sha256:str('Verified MP4 SHA'),version_id:str('P08 version')},['id','slide_id','job_id','request_id','source_sha256','version_id']) },
 { name:'claim_fenced_job',description:'M50 P06-scoped fenced lease claim with expected revision.',inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),job_id:str('Job ID'),expected_revision:{type:'integer',minimum:0}},['id','slide_id','job_id','expected_revision']) },
 { name:'heartbeat_fenced_job',description:'M50 renew P06-scoped job lease; invalid token denied.',inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),job_id:str('Job ID'),expected_revision:{type:'integer',minimum:0},fence:{type:'integer',minimum:1},lease_token:str('Lease token')},['id','slide_id','job_id','expected_revision','fence','lease_token']) },
 { name:'verify_fenced_job',description:'M50 P06-scoped idempotent verification of SHA checked P08 artifact; never publishes.',inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),job_id:str('Job ID'),expected_revision:{type:'integer',minimum:0},fence:{type:'integer',minimum:1},lease_token:str('Lease token'),operation_id:str('Idempotency key'),evidence_sha256:str('P08 SHA')},['id','slide_id','job_id','expected_revision','fence','lease_token','operation_id','evidence_sha256']) },
 { name:'cancel_fenced_job',description:'M50 director-only pre-QA job cancellation with CAS.',inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),job_id:str('Job ID'),expected_revision:{type:'integer',minimum:0}},['id','slide_id','job_id','expected_revision']) },
 { name:'get_edit_operations', description:'M01-R02 director-only source-pinned editable timeline preview and revisioned undo/redo status, NOT P05 release.',inputSchema:obj({id:str('Project ID')},['id']) },
 { name:'update_edit_operations', description:'M01-R02 director-only CAS preview edit APPLY/UNDO/REDO. Approved MP4 SHA pinned. Does not change P05/P08 or render.',inputSchema:obj({id:str('Project ID'),action:{type:'string',enum:['APPLY','UNDO','REDO']},expected_revision:{type:'integer',minimum:0},expected_source_sha256:str('SHA from get_edit_graph'),operation:obj({type:{type:'string',enum:['TRIM','SPLIT','MOVE']},clip_id:str('Clip ID'),source_in_frame:{type:'integer',minimum:0},source_out_frame:{type:'integer',minimum:1},at_source_frame:{type:'integer',minimum:1},before_clip_id:{type:['string','null']}},['type','clip_id'])},['id','action','expected_revision','expected_source_sha256']) },
 { name:'get_edit_graph', description:'M01 deterministic read-only P01/P05/P08/P09 rational edit timeline; director can read all scenes, workers only their own scene. No media mutation or release. Off unless PB_EDITGRAPH_PREVIEW=1.', inputSchema:obj({id:str('Project slug'),slide_id:str('Worker scope: required for non-directors')},['id']) },
 { name:'propose_edit_graph', description:'M01 director-only CAS preview of approved-MP4 frame trims. Never changes P01 timing, P05 release, P08 approval or real MP4.', inputSchema:obj({id:str('Project ID'),expected_revision:{type:'integer',minimum:0},expected_source_sha256:str('SHA from get_edit_graph'),trims:{type:'array',minItems:1,maxItems:300,items:obj({scene_id:str('P01 scene ID'),source_in_frame:{type:'integer',minimum:0},source_out_frame:{type:'integer',minimum:1}},['scene_id','source_in_frame','source_out_frame'])}},['id','expected_revision','expected_source_sha256','trims']) },
 { name:'list_media_assets', description:'M32 source-pinned P08 media catalog. Actor must be authorized for slide_id; workers only see grants for their assigned scene. Read-only and disabled by default.', inputSchema:obj({id:str('Project ID'),slide_id:str('Agent-owned scene ID')},['id','slide_id']) },
 { name:'verify_media_asset', description:'M32 check exact source SHA, current P08 approval, director attestation, grant expiry, scene and permitted use. Never authorizes a render or publishing.', inputSchema:obj({id:str('Project ID'),slide_id:str('Requested consumer scene'),asset_id:str('Catalog asset ID'),use:{type:'string',enum:['b_roll','internal_preview','composition','research']}},['id','slide_id','asset_id','use']) },
 { name:'propose_media_asset', description:'Director only: create a P08 approved-MP4 source-pinned rights proposal. Independent web director attestation required before proposals may be used; no arbitrary paths or URLs.', inputSchema:obj({id:str('Project ID'),expected_revision:{type:'integer',minimum:0},asset_id:str('Unique asset ID'),source_scene_id:str('Existing source scene'),source_version_id:str('P08 version ID'),source_sha256:str('Exact P08 SHA-256'),source_approval_revision:{type:'integer',minimum:1},label:str('Human label'),rights_holder:str('Claimed rights holder'),license_ref:str('Recorded license identifier'),evidence_ref:str('Manual rights evidence identifier'),expires_at:str('UTC ISO timestamp in future'),allowed_uses:{type:'array',maxItems:4,items:{type:'string',enum:['b_roll','internal_preview','composition','research']}},allowed_scenes:{type:'array',maxItems:12,items:str('Consumer scene ID')},attribution:str('Mandatory attribution; write NONE if not required')},['id','expected_revision','asset_id','source_scene_id','source_version_id','source_sha256','source_approval_revision','label','rights_holder','license_ref','evidence_ref','expires_at','allowed_uses','allowed_scenes','attribution']) },
 { name:'get_scene_version', description:'Inspect an immutable scene version and protected MP4 download URL.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),version_id:str('16-hex version ID')},['id','slide_id','version_id']) },
 { name:'compare_scene_versions', description:'Compare two immutable P08 MP4 versions using three real P03 JPEG samples. Returns before/after images, difference JPEG links and numeric pixel-change statistics; not a creative QA verdict. May take time on first call.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),before_version:str('First 16-hex P08 version'),after_version:str('Second 16-hex P08 version')},['id','slide_id','before_version','after_version']) },
 { name:'get_scene_source_state', description:'Director only: current SHA-256 source fingerprint and 3D revision for optimistic restore. Does not expose source contents.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'get_scene_source_snapshot', description:'Director only: read the immutable declarative scene source, browser bundle and narration provenance of a rendered version.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),version_id:str('Immutable version ID')},['id','slide_id','version_id']) },
 { name:'restore_scene_source', description:'Director only: restore a versioned slide/cues/visuals and declarative 3D. Refuses if project-wide style, audio or browser bundle differs. Does not change approved MP4; requires optimistic fingerprint and 3D revision.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),version_id:str('Immutable version ID'),
 expected_fingerprint:str('Current source SHA-256 fingerprint'),expected_scene3d_revision:{type:'integer',minimum:0}},['id','slide_id','version_id','expected_fingerprint','expected_scene3d_revision']) },
 { name:'approve_scene_version', description:'Director only: approve a QA-pass version after completing its task and verifying all review items. Changes the stable accepted scene MP4.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),version_id:str('16-hex version ID'),expected_revision:{type:'integer',minimum:0}},['id','slide_id','version_id','expected_revision']) },
 { name:'restore_scene_version', description:'Director only: rollback to a historically approved version without rendering. Requires approved pointer revision.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),version_id:str('Previously approved version'),expected_revision:{type:'integer',minimum:0}},['id','slide_id','version_id','expected_revision']) },
 { name:'list_scene_review_items', description:'Review issues anchored to an immutable MP4 version and precise frame time.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'get_scene_review_item', description:'Read the complete frame review issue, including optional persisted JPEG/PNG thumbnail.', inputSchema:obj({id:str('Project'),slide_id:str('Scene'),item_id:str('Review UUID')},['id','slide_id','item_id']) },
 { name:'add_scene_review_item', description:'Reviewer or director creates a time/frame-specific issue with normalized rectangle; requires current review revision.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),expected_revision:{type:'integer',minimum:0},version_id:str('Immutable version ID'),t:num('Seconds within scene'),text:str('Concrete issue, 4..2000 characters'),severity:{type:'string',enum:['low','medium','high','blocking']},rect:obj({x:num('0..1'),y:num('0..1'),w:num('0..1'),h:num('0..1')},['x','y','w','h']),frame_evidence:str('Optional data:image/jpeg;base64 or PNG <=130 KB')},['id','slide_id','expected_revision','version_id','t','text','severity']) },
 { name:'transition_scene_review_item', description:'Worker with live fenced lease marks FIXED; reviewer or director verifies or reopens; every transition is audited.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),item_id:str('Review issue UUID'),status:{type:'string',enum:['FIXED','VERIFIED','REOPENED']},note:str('Evidence or reason'),expected_revision:{type:'integer',minimum:0},fence_token:{type:'integer',minimum:1}},['id','slide_id','item_id','status','note','expected_revision']) },
 { name:'assemble_video', description:'Director only: assemble 2-12 approved QA-passing scenes. Identical verified exports are reused; force=true explicitly re-encodes.', inputSchema:obj({id:str('Project slug'),scene_ids:{type:'array',minItems:2,maxItems:12,items:{type:'string'}},force:{type:'boolean'}},['id','scene_ids']) },
 { name:'get_assembly_plan', description:'Read P05 scene transitions and policy.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'set_assembly_plan', description:'Director only: revision-fenced transition update.', inputSchema:obj({id:str('Project slug'),plan:{type:'object'},expected_revision:{type:'integer',minimum:0}},['id','plan','expected_revision']) },
 { name:'cancel_assembly', description:'Director only: cancel montage while keeping existing release.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_assembly_status', description:'Check status, output URL and integrity manifest of final video.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'render_video', description:'Start a server-side Chromium + WebCodecs + FFmpeg render job for a video. Poll get_render_status. Server rendering uses deterministic Chromium Canvas frames encoded with FFmpeg.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'preview_scene', description:'Render only three lightweight draft PNG stills in Chromium (10/50/90% of scene) without encoding MP4, technical QA, or P08 approval. Requires worker scene lease or director.', inputSchema:obj({id:str('Project slug'),slide_id:str('Existing scene ID'),fence_token:{type:'integer',minimum:1}},['id','slide_id']) },
 { name:'get_scene_preview', description:'Read draft preview status and three authenticated PNG links. Draft stills are not QA evidence.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'cancel_scene_preview', description:'Cancel pending or running draft preview without touching MP4 or approval state.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),fence_token:{type:'integer',minimum:1}},['id','slide_id']) },
 { name:'render_scene', description:'Worker with live scene fencing lease or director: queue independent MP4 render; reviewers cannot start expensive jobs.', inputSchema:obj({id:str('Project slug'),slide_id:str('Existing scene ID'),fence_token:{type:'integer',minimum:1}},['id','slide_id']) },
 { name:'cancel_scene_render', description:'Worker with a live fenced lease or director cancels one scene render using its job_id.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),job_id:str('Active job ID'),fence_token:{type:'integer',minimum:1}},['id','slide_id','job_id']) },
 { name:'retry_scene_render', description:'Worker with a live fenced lease or director retries a terminal scene render only if job_id matches.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),job_id:str('Previous job ID'),fence_token:{type:'integer',minimum:1}},['id','slide_id','job_id']) },
 { name:'cancel_video_render', description:'Director only: cancel active full video rendering without replacing accepted files.', inputSchema:obj({id:str('Project slug'),job_id:str('Active job ID')},['id','job_id']) },
 { name:'get_scene_qa_report', description:'Read technical MP4 QA after a scene render: codec, resolution, FPS, duration, audio presence, and detected issues. This is not artistic quality scoring.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'get_video_qa_report', description:'Read technical MP4 QA after a full video render. Validates stream metadata, not artistic composition.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_scene_render_status', description:'Check the independent render job status for one scene and get a direct MP4 download URL when complete.', inputSchema:obj({id:str('Project slug'),slide_id:str('Existing scene ID')},['id','slide_id']) },
 { name:'get_render_status', description:'Get status of a render job and download URL when finished.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_continuity_boundary_context', description:'P17 director-only verified first/last JPEG hashes from two approved immutable P08 MP4s; read-only, FFmpeg-bounded, no motion/audio attestation.', inputSchema:obj({id:str('Project ID'),left_scene_id:str('Left approved scene'),right_scene_id:str('Right approved scene')},['id','left_scene_id','right_scene_id']) },
 { name:'preview_continuity_hard_cut', description:'P17 director-only review of exact approved source pair. Accepts pinned SHA; does NOT publish or approve. J/L and motion matches not supported.', inputSchema:obj({id:str('Project ID'),manifest:{type:'object',description:'{left_scene_id,right_scene_id,expected_pair_sha256,transition:hard_cut}' }},['id','manifest']) },
 { name:'get_creative_story_context', description:'P16 director-only: read pinned human-approved P10 script sources for two story arcs; no scene edits.', inputSchema:obj({id:str('Project ID')},['id']) },
 { name:'preview_creative_storyboard', description:'P16 director-only: two source-anchored narrative orders from current approved script. Human acceptance required; does not publish, write or reorder anything.', inputSchema:obj({id:str('Project ID'),expected_plan_revision:{type:'integer',minimum:1},expected_source_sha256:str('Source SHA-256 from get_creative_story_context')},['id','expected_plan_revision','expected_source_sha256']) },
 { name:'get_rhythm_context', description:'P15 director-only read-only preview prerequisites: real on-disk voice SHA and current cue clock. No word alignment is authenticated and no release is changed.', inputSchema:obj({id:str('Project ID')},['id']) },
 { name:'preview_rhythm_cuts', description:'P15 director-only draft cuts from pinned voice/cues and caller-supplied markers. No approval, storage or rendering. Default disabled until PB_RHYTHM_PREVIEW=1.', inputSchema:obj({id:str('Project ID'),manifest:{type:'object',description:'P15 rhythm-v1 manifest based on get_rhythm_context'}},['id','manifest']) },
 { name:'get_rhythm_draft', description:'P15 director or full-scene reviewer: inspect saved draft and source freshness. Never a released edit.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'submit_rhythm_draft', description:'P15 director only: persist a source-pinned non-publishable candidate with expected_revision CAS. Does not edit deck or MP4.', inputSchema:obj({id:str('Project slug'),manifest:{type:'object'},expected_revision:{type:'integer',minimum:0},note:str('Reason for draft, 10..1000 chars')},['id','manifest','expected_revision','note']) },
 { name:'review_rhythm_draft', description:'P15 independent reviewer with access to ALL project scenes: endorse for further validation or reject, revision and plan SHA required. Never grants production publication.', inputSchema:obj({id:str('Project slug'),expected_revision:{type:'integer',minimum:0},plan_sha256:str('64 hex SHA of proposal'),decision:{type:'string',enum:['endorse','reject']},note:str('Independent review evidence')},['id','expected_revision','plan_sha256','decision','note']) },
 { name:'get_editor_link', description:'Get a browser link for opening a project in the hosted PressBuilder editor.', inputSchema:obj({id:str('Project slug')},['id']) }
].map(tool=>({...tool,securitySchemes:[{type:'oauth2',scopes:['mcp:tools']}]}));
export function makeMcp({ startRender, getRender, cancelRender, retryRender, baseUrl, assembly,
  assemblyPlans,versions,reviews,sceneSync,comparisons=null,previews=null,
  directorPlan:providedDirectorPlan=null,
  dispatch:providedDispatch=null,rhythmPreview=null,rhythmDrafts=null,creativeStory=null,continuity=null,typedBriefs:providedTypedBriefs=null,mediaCatalog:providedMediaCatalog=null,editGraph:providedEditGraph=null,editOps:providedEditOps=null,jobLedger:providedJobLedger=null,qcCockpit:providedQcCockpit=null }) {
  const directorPlan=providedDirectorPlan||directorStore({root:DECKS,getDeck,
    sceneTasks:taskStore,projectReadmes:readmeStore,styles,getAssembly:()=>assembly,
    getApproved:(id,scene)=>versions?.approved(id,scene),out:OUT});
  const dispatch=providedDispatch||directorDispatchStore({root:DECKS,director:directorPlan,
    sceneTasks:taskStore,leases,getRender,versions,out:OUT});
  const typedBriefs=providedTypedBriefs||typedSceneBriefService({getDeck,directorPlan,sceneTasks:taskStore,styles,enabled:process.env.PB_TYPED_SCENE_BRIEFS==='1'});
  const mediaCatalog=providedMediaCatalog||mediaCatalogStore({root:DECKS,getDeck,versions,enabled:process.env.PB_MEDIA_CATALOG==='1'});
  const editGraph=providedEditGraph||editGraphService({root:DECKS,getDeck,sceneSync,assemblyPlans,versions,enabled:process.env.PB_EDITGRAPH_PREVIEW==='1'});
  const editOps=providedEditOps||editOperationService({root:DECKS,editGraph,enabled:process.env.PB_EDITGRAPH_PREVIEW==='1'});
  const jobLedger=providedJobLedger||fencedJobLedger({root:DECKS,getDeck,versions,enabled:process.env.PB_FENCED_JOB_LEDGER==='1'});
  const qcCockpit=providedQcCockpit||qcCockpitService({assembly,reviews,enabled:process.env.PB_QC_COCKPIT==='1'});
  const directorOnly=actor=>leases.role(actor,['director']);
  const scoped=(id,slide,actor)=>leases.scoped(actor,id,slide);
  const visibleTasks=(id,actor)=>taskStore.list(id)
    .filter(t=>actor.role==='director'||actor.scenes?.includes(t.scene_id));
  const assigned=(id,slide,actor)=>{
    if(actor.role!=='worker')return;
    const assignee=taskStore.read(id,slide).assignee?.trim();
    if(assignee&&assignee.toLowerCase()!==actor.id.toLowerCase())throw new UserError('Scene assigned to another agent',403);
  };
  const write=(id,slide,actor,fence,action,fn)=>{
    leases.assertWrite(id,slide,actor,fence);
    assigned(id,slide,actor);
    const result=fn();
    leases.logWrite(id,slide,actor,result?.revision??null,action);
    return result;
  };
  async function call(name, args,actor) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new UserError('Arguments must be an object');
    if (!actor || !['director','worker','reviewer','viewer'].includes(actor.role)) throw new UserError('Unauthenticated MCP identity',401);
    if (args.id && actor.role!=='director' && !actor.projects?.includes(args.id))
      throw new UserError('Project is outside agent scope',403);
    if(actor.role==='worker'&&name==='set_scene_task'){
      // The task brief and acceptance checklist are director-owned.
      const allowed=new Set(['id','slide_id','fence_token','expected_revision','status']);
      if(Object.keys(args).some(key=>!allowed.has(key))||
         (args.status!==undefined&&!['todo','in_progress','review','blocked'].includes(args.status)))
        throw new UserError('Workers may update task status only, not its assignment or acceptance criteria',403);
    }
    if(actor.role==='worker'&&name==='set_scene_checkpoint'&&args.done===true&&
       (typeof args.note!=='string'||args.note.trim().length<3))
      throw new UserError('Workers must provide checkpoint completion evidence in note',403);
    if(actor.role==='worker'&&name==='update_cue'&&
      ['say','dur','hold'].some(k=>Object.hasOwn(args,k)))
      throw new UserError('Only director may change narration and cue timing',403);
    if(actor.role==='worker'&&name==='update_slide'&&
      ['lead','tail'].some(k=>Object.hasOwn(args,k)))
      throw new UserError('Only director may change slide timing',403);
    switch(name) {
      case 'list_decks': return actor.role==='director'?listDecks():listDecks().filter(d=>actor.projects.includes(d.id));
      case 'get_deck': return {...getDeck(args.id),project_readme:readmeStore.read(args.id),scene_tasks:visibleTasks(args.id,actor).map(t=>({scene_id:t.scene_id,title:t.title,assignee:t.assignee,status:t.status,revision:t.revision,checkpoints_done:t.checkpoints.filter(c=>c.done).length,checkpoints_total:t.checkpoints.length}))};
      case 'get_project_context': {
        const d=getDeck(args.id);
        if(args.slide_id)scoped(args.id,args.slide_id,actor);
        const tasks=visibleTasks(args.id,actor);
        const summary=tasks.map(t=>({scene_id:t.scene_id,title:t.title,assignee:t.assignee,status:t.status,revision:t.revision,checkpoints_done:t.checkpoints.filter(c=>c.done).length,checkpoints_total:t.checkpoints.length}));
        const assigned=args.slide_id?taskStore.read(args.id,args.slide_id):undefined;
        return {project:{id:d.id,title:d.title,style:d.style,format:d.format,target:d.target,slides:d.slides.map(s=>({id:s.id,label:s.label,cues:s.cues.map(c=>({id:c.id,say:c.say,show:c.show}))}))},
          readme:readmeStore.read(args.id),style_contract:styles.read(args.id),scene_tasks:summary,...(assigned?{assigned_scene_task:assigned}:{})};
      }
      case 'get_project_readme': return readmeStore.read(args.id);
      case 'update_project_readme': directorOnly(actor);return readmeStore.write(args.id,args.content,args.expected_revision);
      case 'list_scene_tasks': return visibleTasks(args.id,actor);
      case 'get_typed_scene_brief': scoped(args.id,args.slide_id,actor);assigned(args.id,args.slide_id,actor);return typedBriefs.read(args.id,args.slide_id);
      case 'get_scene_task': scoped(args.id,args.slide_id,actor);return taskStore.read(args.id,args.slide_id);
      case 'set_scene_task': {const {id,slide_id,expected_revision,fence_token,...fields}=args;return write(id,slide_id,actor,fence_token,'write_task',()=>taskStore.put(id,slide_id,fields,expected_revision))}
      case 'set_scene_checkpoint': {const {id,slide_id,checkpoint_id,fence_token,...patch}=args;return write(id,slide_id,actor,fence_token,'checkpoint',()=>taskStore.checkpoint(id,slide_id,checkpoint_id,patch))}
      case 'create_deck': {directorOnly(actor); const d=createDeck(args);readmeStore.ensure(d.id);return d; }
      case 'update_deck': directorOnly(actor);return patchDeck(args.id, args);
      case 'update_cue': return write(args.id,args.slide_id,actor,args.fence_token,'update_cue',()=>patchCue(args.id,args.slide_id,args.cue_id,args));
      case 'update_slide': return write(args.id,args.slide_id,actor,args.fence_token,'update_slide',()=>patchSlide(args.id,args.slide_id,args));
      case 'update_object': return write(args.id,args.slide_id,actor,args.fence_token,'update_object',()=>patchObject(args.id,args.slide_id,args.object_id,args));
      case 'get_scene_sync': scoped(args.id,args.slide_id,actor);return sceneSync.read(args.id,args.slide_id);
      case 'set_scene_sync': return write(args.id,args.slide_id,actor,args.fence_token,'sync_markers',()=>sceneSync.put(args.id,args.slide_id,args.markers,args.expected_revision));
      case 'get_director_work': return dispatch.snapshot(args.id,actor);
      case 'claim_director_job': return dispatch.claim(args.id,args.slide_id,actor,args);
      case 'heartbeat_director_job': return dispatch.heartbeat(args.id,args.slide_id,actor,args);
      case 'submit_director_job': return dispatch.submit(args.id,args.slide_id,actor,args);
      case 'fail_director_job': return dispatch.fail(args.id,args.slide_id,actor,args);
      case 'get_director_plan': directorOnly(actor);return directorPlan.read(args.id);
      case 'propose_director_plan': {directorOnly(actor);const {id,...proposal}=args;return directorPlan.propose(id,proposal)}
      case 'get_scene_3d': scoped(args.id,args.slide_id,actor);return scene3d.read(args.id,args.slide_id);
      case 'set_scene_3d': enforceScene3D(styles.read(args.id).contract,args.spec,args.slide_id);return write(args.id,args.slide_id,actor,args.fence_token,'write_3d',()=>scene3d.put(args.id,args.slide_id,args.spec,args.expected_revision));
      case 'reorder_slides': directorOnly(actor);return reorderSlides(args.id,args.slide_ids);
      case 'set_slide_visuals': enforceVisuals(styles.read(args.id).contract,args.elements,args.slide_id,styleById(getDeck(args.id).style).colors);return write(args.id,args.slide_id,actor,args.fence_token,'set_visuals',()=>setVisuals(args.id,args.slide_id,args.elements));
      case 'get_style_contract':{
        const rec=styles.read(args.id);
        if(!args.slide_id)return rec;
        scoped(args.id,args.slide_id,actor);
        return {...rec,scene_id:args.slide_id,effective:effectiveStyle(rec.contract,args.slide_id)};
      }
      case 'set_style_contract': directorOnly(actor);return styles.put(args.id,args.contract,args.expected_revision);
      case 'get_scene_lease': scoped(args.id,args.slide_id,actor);return leases.read(args.id,args.slide_id);
      case 'claim_scene': assigned(args.id,args.slide_id,actor);return leases.claim(args.id,args.slide_id,actor,args.ttl??300);
      case 'renew_scene_lease': return leases.renew(args.id,args.slide_id,actor,args.fence_token,args.ttl??300);
      case 'release_scene': return leases.release(args.id,args.slide_id,actor,args.fence_token);
      case 'list_scene_versions': scoped(args.id,args.slide_id,actor);return {
        versions:versions.list(args.id,args.slide_id).map(v=>({...v,download_url:baseUrl()+'/'+v.file})),
        approved:versions.pointer(args.id,args.slide_id)};
      case 'get_qc_cockpit': {
        if(actor.role!=='director'){
          if(!args.slide_id)throw new UserError('Scene ID required for scoped QC cockpit',403);
          scoped(args.id,args.slide_id,actor);assigned(args.id,args.slide_id,actor);
        }
        return qcCockpit.read(args.id,{sceneId:actor.role==='director'?null:args.slide_id});
      }
      case 'get_fenced_job': scoped(args.id,args.slide_id,actor);assigned(args.id,args.slide_id,actor);
        return jobLedger.read(args.id,args.slide_id,args.job_id);
      case 'begin_fenced_job': {
        directorOnly(actor);
        const {id,slide_id,job_id,...input}=args;
        return jobLedger.begin(id,slide_id,actor,{...input,job_id});
      }
      case 'claim_fenced_job': scoped(args.id,args.slide_id,actor);assigned(args.id,args.slide_id,actor);
        return jobLedger.claim(args.id,args.slide_id,args.job_id,actor,args.expected_revision);
      case 'heartbeat_fenced_job': {
        scoped(args.id,args.slide_id,actor);assigned(args.id,args.slide_id,actor);
        const {id,slide_id,job_id,...input}=args;
        return jobLedger.heartbeat(id,slide_id,job_id,actor,input);
      }
      case 'verify_fenced_job': {
        scoped(args.id,args.slide_id,actor);assigned(args.id,args.slide_id,actor);
        const {id,slide_id,job_id,...input}=args;
        return jobLedger.verify(id,slide_id,job_id,actor,input);
      }
      case 'cancel_fenced_job': directorOnly(actor);
        return jobLedger.cancel(args.id,args.slide_id,args.job_id,actor,args.expected_revision);
      case 'get_edit_operations': directorOnly(actor);return editOps.read(args.id);
      case 'update_edit_operations': {
        directorOnly(actor);const {id,...edit}=args;
        return editOps.change(id,actor,edit);
      }
      case 'get_edit_graph': {
        if(actor.role!=='director'){
          if(!args.slide_id)throw new UserError('Scene ID required for scoped EditGraph',403);
          scoped(args.id,args.slide_id,actor);assigned(args.id,args.slide_id,actor);
        }
        return editGraph.read(args.id,{sceneId:actor.role==='director'?null:args.slide_id});
      }
      case 'propose_edit_graph': {
        directorOnly(actor);const {id,...proposal}=args;
        return editGraph.propose(id,actor,proposal);
      }
      case 'list_media_assets': {
        scoped(args.id,args.slide_id,actor);assigned(args.id,args.slide_id,actor);
        const catalog=mediaCatalog.read(args.id);
        return {...catalog,assets:catalog.assets.filter(a=>actor.role==='director'||a.allowed_scenes.includes(args.slide_id))
          .map(a=>({...a,rights_attestation_is_legal_proof:false}))};
      }
      case 'verify_media_asset': {
        scoped(args.id,args.slide_id,actor);assigned(args.id,args.slide_id,actor);
        // Do not disclose hashes/rights of an unrelated scene merely because
        // an agent guessed an asset_id; scope the consumer grant before verify.
        if(actor.role!=='director'&&!mediaCatalog.read(args.id).assets.some(a=>
          a.asset_id===args.asset_id&&a.allowed_scenes.includes(args.slide_id)))
          throw new UserError('Media asset not available to this scene',403);
        return mediaCatalog.verify(args.id,args.asset_id,args.slide_id,args.use);
      }
      case 'propose_media_asset': {
        directorOnly(actor);
        const {id,...body}=args;
        return mediaCatalog.propose(id,actor,body);
      }
      case 'get_scene_version': scoped(args.id,args.slide_id,actor);{
        const v=versions.read(args.id,args.slide_id,args.version_id);return {...v,download_url:baseUrl()+'/'+v.file};
      }
      case 'compare_scene_versions': scoped(args.id,args.slide_id,actor);
        if(!comparisons)throw new UserError('Scene comparison not configured',501);
        return await comparisons.compare(args.id,args.slide_id,args.before_version,args.after_version);
      case 'get_scene_source_state': directorOnly(actor);{
        const {snapshot,...state}=versions.source(args.id,args.slide_id);return state;
      }
      case 'get_scene_source_snapshot': directorOnly(actor);
        return versions.readSource(args.id,args.slide_id,args.version_id);
      case 'restore_scene_source': directorOnly(actor);
        return versions.restoreSource(args.id,args.slide_id,args.version_id,
          args.expected_fingerprint,args.expected_scene3d_revision,actor);
      case 'approve_scene_version': directorOnly(actor);
        if(taskStore.read(args.id,args.slide_id).status!=='done')throw new UserError('Scene task is not complete',409);
        return versions.approve(args.id,args.slide_id,args.version_id,args.expected_revision,actor,{unresolved:reviews.unresolved});
      case 'restore_scene_version': directorOnly(actor);
        return versions.restore(args.id,args.slide_id,args.version_id,args.expected_revision,actor,{unresolved:reviews.unresolved});
      case 'list_scene_review_items': scoped(args.id,args.slide_id,actor);return reviews.list(args.id,args.slide_id);
      case 'get_scene_review_item': scoped(args.id,args.slide_id,actor);return reviews.get(args.id,args.slide_id,args.item_id);
      case 'add_scene_review_item': scoped(args.id,args.slide_id,actor);
        return reviews.create(args.id,args.slide_id,{version_id:args.version_id,t:args.t,text:args.text,
          severity:args.severity,rect:args.rect,frame_evidence:args.frame_evidence},actor,args.expected_revision);
      case 'transition_scene_review_item': scoped(args.id,args.slide_id,actor);
        return reviews.transition(args.id,args.slide_id,args.item_id,args.status,args.note,actor,
          args.expected_revision,{assertWorker:()=>{leases.assertWrite(args.id,args.slide_id,actor,args.fence_token);assigned(args.id,args.slide_id,actor)}});
      case 'get_assembly_plan': return assemblyPlans.read(args.id);
      case 'set_assembly_plan': directorOnly(actor);return assemblyPlans.put(args.id,args.plan,args.expected_revision);
      case 'assemble_video': directorOnly(actor);return assembly.start(args.id,args.scene_ids,{force:args.force??false});
      case 'cancel_assembly': directorOnly(actor);return assembly.cancel(args.id);
      case 'get_assembly_status': return assembly.get(args.id);
      case 'render_video': directorOnly(actor);return startRender(args.id);
      case 'preview_scene': return write(args.id,args.slide_id,actor,args.fence_token,'preview_scene',()=>{
        if(!previews)throw new UserError('Draft preview not configured',501);
        return previews.start(args.id,args.slide_id);
      });
      case 'get_scene_preview': scoped(args.id,args.slide_id,actor);
        if(!previews)throw new UserError('Draft preview not configured',501);
        return previews.get(args.id,args.slide_id);
      case 'cancel_scene_preview': return write(args.id,args.slide_id,actor,args.fence_token,'cancel_scene_preview',()=>{
        if(!previews)throw new UserError('Draft preview not configured',501);
        return previews.cancel(args.id,args.slide_id);
      });
      case 'render_scene': return write(args.id,args.slide_id,actor,args.fence_token,'render_scene',()=>startRender(args.id,args.slide_id));
      case 'cancel_scene_render': return write(args.id,args.slide_id,actor,args.fence_token,
        'cancel_render',()=>cancelRender(args.id,args.slide_id,args.job_id));
      case 'retry_scene_render': return write(args.id,args.slide_id,actor,args.fence_token,
        'retry_render',()=>retryRender(args.id,args.slide_id,args.job_id));
      case 'cancel_video_render': directorOnly(actor);return cancelRender(args.id,null,args.job_id);
      case 'get_scene_render_status': scoped(args.id,args.slide_id,actor);return getRender(args.id,args.slide_id);
      case 'get_scene_qa_report': {scoped(args.id,args.slide_id,actor);const r=getRender(args.id,args.slide_id);return {id:args.id,slide_id:args.slide_id,status:r.status,report:r.qa_report||null};}
      case 'get_video_qa_report': {const r=getRender(args.id);return {id:args.id,status:r.status,report:r.qa_report||null};}
      case 'get_render_status': return getRender(args.id);
      case 'get_continuity_boundary_context': directorOnly(actor);
        if(!continuity)throw new UserError('Continuity review unavailable',501);
        return continuity.context(args.id,args.left_scene_id,args.right_scene_id);
      case 'preview_continuity_hard_cut': directorOnly(actor);
        if(!continuity)throw new UserError('Continuity review unavailable',501);
        return continuity.preview(args.id,args.manifest);
      case 'get_creative_story_context': directorOnly(actor);
        if(!creativeStory)throw new UserError('Creative story preview disabled',501);
        return creativeStory.context(args.id);
      case 'preview_creative_storyboard': directorOnly(actor);
        if(!creativeStory)throw new UserError('Creative story preview disabled',501);
        return creativeStory.preview(args.id,{
          expected_plan_revision:args.expected_plan_revision,
          expected_source_sha256:args.expected_source_sha256});
      case 'get_rhythm_context': directorOnly(actor);
        if(!rhythmPreview)throw new UserError('Rhythm preview disabled',501);
        return rhythmPreview.context(args.id);
      case 'preview_rhythm_cuts': directorOnly(actor);
        if(!rhythmPreview)throw new UserError('Rhythm preview disabled',501);
        return rhythmPreview.previewAsync(args.id,args.manifest);
      case 'get_rhythm_draft':
        if(!rhythmDrafts)throw new UserError('Rhythm drafts disabled',501);
        return rhythmDrafts.status(args.id,actor);
      case 'submit_rhythm_draft': directorOnly(actor);
        if(!rhythmDrafts)throw new UserError('Rhythm drafts disabled',501);
        return rhythmDrafts.submitAsync(args.id,actor,args.manifest,args.expected_revision,args.note);
      case 'review_rhythm_draft':
        if(!rhythmDrafts)throw new UserError('Rhythm drafts disabled',501);
        return rhythmDrafts.decide(args.id,actor,args);
      case 'get_editor_link': getDeck(args.id); return { url:baseUrl().replace(/\/$/,'')+'/?deck='+encodeURIComponent(args.id), note:'Opens a password-protected editor. New projects use placeholder visuals unless scene code is deployed.' };
      default: throw new UserError('Unknown tool: '+name,404);
    }
  }
  return async function handle(message,actor) {
    if (Array.isArray(message)) return { jsonrpc:'2.0',id:null,error:{code:-32600,message:'Batch requests not supported'} };
    if (!message || message.jsonrpc!=='2.0' || typeof message.method!=='string') return {jsonrpc:'2.0',id:message?.id??null,error:{code:-32600,message:'Invalid JSON-RPC'}};
    if (message.id===undefined) return null;
    const result = (value) => ({jsonrpc:'2.0',id:message.id,result:value});
    if (message.method==='initialize') return result({protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'pressbuilder-cloud',version:'0.1.0'}});
    if (message.method==='ping') return result({});
    if (message.method==='tools/list') return result({tools:TOOLS});
    if (message.method==='tools/call') {
      const name=message.params?.name;
      if (typeof name!=='string' || !TOOLS.some((t)=>t.name===name)) return result({content:[{type:'text',text:'Unknown MCP tool'}],isError:true});
      try {
        const v=await call(name,message.params?.arguments||{},actor);
        return result({content:[{type:'text',text:JSON.stringify(v)}],isError:false});
      } catch (e) {
        return result({content:[{type:'text',text:e instanceof Error?e.message:'Operation failed'}],isError:true});
      }
    }
    return {jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}};
  };
}
