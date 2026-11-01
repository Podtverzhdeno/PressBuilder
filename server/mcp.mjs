/** Stateless Streamable HTTP MCP endpoint. No arbitrary shell or filesystem tools. */
import { createDeck, DECKS, getDeck, listDecks, patchCue, patchDeck, patchObject, patchSlide, reorderSlides, setVisuals, UserError } from './cloud-core.mjs';
import { sceneTaskStore } from './scene-tasks.mjs';
import { projectReadmeStore } from './project-readme.mjs';
import { scene3dStore } from './scene-3d.mjs';
import {styleContractStore,enforceScene3D,enforceVisuals} from './style-contract.mjs';
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
 { name:'get_scene_task', description:'Get the full scene-specific agent assignment, detailed brief, deliverables, checkpoints and revision.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'set_scene_task', description:'Create or edit the full assignment for one scene (not the deck). Requires the latest expected_revision from get_scene_task or list_scene_tasks to avoid overwriting another agent. Keeps unspecified fields unchanged.', inputSchema:obj({fence_token:{type:'integer',minimum:1,description:'Fencing token from claim_scene (required for agent writes)'},id:str('Project slug'),slide_id:str('Scene ID'),expected_revision:{type:'integer',minimum:0},title:str('Scene task title'),assignee:str('Agent/owner name'),brief:str('Detailed task specification, up to 20000 characters'),deliverables:str('Acceptance criteria and deliverable requirements'),status:{type:'string',enum:['todo','in_progress','review','done','blocked']},checkpoints:{type:'array',maxItems:60,items:obj({id:str('Stable checkpoint id'),title:str('Checkpoint action'),done:{type:'boolean'},note:str('Completion evidence or blocker')},['id','title'])}},['id','slide_id','expected_revision']) },
 { name:'set_scene_checkpoint', description:'Update exactly one scene checkpoint and preserve all other scenes/tasks. Use after completing and checking a milestone; provide evidence in note.', inputSchema:obj({fence_token:{type:'integer',minimum:1,description:'Fencing token from claim_scene (required for agent writes)'},id:str('Project slug'),slide_id:str('Scene ID'),checkpoint_id:str('Checkpoint ID'),done:{type:'boolean'},note:str('Evidence or details')},['id','slide_id','checkpoint_id']) },
 { name:'get_scene_3d', description:'Read the independently stored data-only 3D composition of a particular video scene, including revision. Returns null spec if not authored yet.', inputSchema:obj({id:str('Project slug'),slide_id:str('Existing scene ID')},['id','slide_id']) },
 { name:'set_scene_3d', description:'Publish a safe declarative 3D composition for exactly one scene, with 1..18 shaded rotating 3D meshes and an animated perspective camera. No arbitrary JS; uses the existing 3D engine and is rendered in the web editor and MP4. Must pass expected_revision from get_scene_3d. Does not edit deck.json or other scenes.', inputSchema:obj({fence_token:{type:'integer',minimum:1,description:'Fencing token from claim_scene (required for agent writes)'},id:str('Project slug'),slide_id:str('Existing scene ID'),expected_revision:{type:'integer',minimum:0},spec:obj({version:{type:'integer',const:1},camera:obj({cx:num('Camera center X in 1920px space'),cy:num('Camera center Y'),size:num('Pixels per 3D unit 20..500'),dist:num('Camera distance 5..80'),yaw:num('Yaw radians'),pitch:num('Pitch radians'),yaw_speed:num('Yaw radians/second -2..2'),pitch_speed:num('Pitch radians/second'),zoom_speed:num('Proportional zoom per second')},[]),objects:{type:'array',minItems:1,maxItems:18,items:obj({id:str('Stable ID'),mesh:{type:'string',enum:['cube','pyramid','octa','icosa','hexPrism','cylinder']},pos:{type:'array',items:{type:'number'},minItems:3,maxItems:3},scale:num('0.02..5'),rotation:{type:'array',items:{type:'number'},minItems:3,maxItems:3},spin:{type:'array',items:{type:'number'},minItems:3,maxItems:3},color:str('Hex color #RRGGBB'),edge_color:{type:['string','null']},wire:{type:'boolean'},start:num('Entrance start seconds'),fade:num('Entrance fade seconds')},['id','mesh','color'])}},['version','camera','objects'])},['id','slide_id','expected_revision','spec']) },
 { name:'reorder_slides', description:'Reorder existing slides without losing any cue IDs.', inputSchema:obj({id:str('Project slug'),slide_ids:{type:'array',items:{type:'string'}}},['id','slide_ids']) },
 { name:'get_style_contract', description:'Read project visual contract and revision.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'set_style_contract', description:'Director only: replace validated style contract with optimistic revision.', inputSchema:obj({id:str('Project slug'),expected_revision:{type:'integer',minimum:0},contract:{type:'object'}},['id','expected_revision','contract']) },
 { name:'get_scene_lease', description:'Read current scene ownership and fencing lease.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'claim_scene', description:'Acquire scene lease as worker and get fencing token.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),ttl:{type:'integer',minimum:30,maximum:3600}},['id','slide_id']) },
 { name:'renew_scene_lease', description:'Extend live lease with matching fencing token.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),fence_token:{type:'integer',minimum:1},ttl:{type:'integer',minimum:30,maximum:3600}},['id','slide_id','fence_token']) },
 { name:'release_scene', description:'Release the lease and invalidate old fencing tokens.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),fence_token:{type:'integer',minimum:1}},['id','slide_id','fence_token']) },
 { name:'list_scene_versions', description:'List immutable QA-passing rendered versions of a scene, plus the explicitly approved pointer.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'get_scene_version', description:'Inspect an immutable scene version and protected MP4 download URL.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),version_id:str('16-hex version ID')},['id','slide_id','version_id']) },
 { name:'approve_scene_version', description:'Director only: approve a QA-pass version after completing its task and verifying all review items. Changes the stable accepted scene MP4.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),version_id:str('16-hex version ID'),expected_revision:{type:'integer',minimum:0}},['id','slide_id','version_id','expected_revision']) },
 { name:'restore_scene_version', description:'Director only: rollback to a historically approved version without rendering. Requires approved pointer revision.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),version_id:str('Previously approved version'),expected_revision:{type:'integer',minimum:0}},['id','slide_id','version_id','expected_revision']) },
 { name:'list_scene_review_items', description:'Review issues anchored to an immutable MP4 version and precise frame time.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'add_scene_review_item', description:'Reviewer or director creates a time/frame-specific issue with normalized rectangle; requires current review revision.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),expected_revision:{type:'integer',minimum:0},version_id:str('Immutable version ID'),t:num('Seconds within scene'),text:str('Concrete issue, 4..2000 characters'),severity:{type:'string',enum:['low','medium','high','blocking']},rect:obj({x:num('0..1'),y:num('0..1'),w:num('0..1'),h:num('0..1')},['x','y','w','h'])},['id','slide_id','expected_revision','version_id','t','text','severity']) },
 { name:'transition_scene_review_item', description:'Worker with live fenced lease marks FIXED; reviewer or director verifies or reopens; every transition is audited.', inputSchema:obj({id:str('Project ID'),slide_id:str('Scene ID'),item_id:str('Review issue UUID'),status:{type:'string',enum:['FIXED','VERIFIED','REOPENED']},note:str('Evidence or reason'),expected_revision:{type:'integer',minimum:0},fence_token:{type:'integer',minimum:1}},['id','slide_id','item_id','status','note','expected_revision']) },
 { name:'assemble_video', description:'Director only: assemble 2-12 approved, QA-passing scenes by hard cut.', inputSchema:obj({id:str('Project slug'),scene_ids:{type:'array',minItems:2,maxItems:12,items:{type:'string'}}},['id','scene_ids']) },
 { name:'get_assembly_status', description:'Check status, output URL and integrity manifest of final video.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'render_video', description:'Start a server-side Chromium + WebCodecs + FFmpeg render job for a video. Poll get_render_status. Server rendering uses deterministic Chromium Canvas frames encoded with FFmpeg.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'render_scene', description:'Queue an independent MP4 render of one existing scene (not the entire video). Uses the timeline exact start and duration; safe to request while other scene renders are queued. Returns queued/running job details and job_id.', inputSchema:obj({id:str('Project slug'),slide_id:str('Existing scene ID')},['id','slide_id']) },
 { name:'get_scene_qa_report', description:'Read technical MP4 QA after a scene render: codec, resolution, FPS, duration, audio presence, and detected issues. This is not artistic quality scoring.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'get_video_qa_report', description:'Read technical MP4 QA after a full video render. Validates stream metadata, not artistic composition.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_scene_render_status', description:'Check the independent render job status for one scene and get a direct MP4 download URL when complete.', inputSchema:obj({id:str('Project slug'),slide_id:str('Existing scene ID')},['id','slide_id']) },
 { name:'get_render_status', description:'Get status of a render job and download URL when finished.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_editor_link', description:'Get a browser link for opening a project in the hosted PressBuilder editor.', inputSchema:obj({id:str('Project slug')},['id']) }
].map(tool=>({...tool,securitySchemes:[{type:'oauth2',scopes:['mcp:tools']}]}));
export function makeMcp({ startRender, getRender, baseUrl, assembly, versions, reviews }) {
  const directorOnly=actor=>leases.role(actor,['director']);
  const scoped=(id,slide,actor)=>leases.scoped(actor,id,slide);
  const write=(id,slide,actor,fence,action,fn)=>{
    leases.assertWrite(id,slide,actor,fence);
    const result=fn();
    leases.logWrite(id,slide,actor,result?.revision??null,action);
    return result;
  };
  async function call(name, args,actor) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new UserError('Arguments must be an object');
    if (!actor || !['director','worker','reviewer','viewer'].includes(actor.role)) throw new UserError('Unauthenticated MCP identity',401);
    if (args.id && actor.role!=='director' && !actor.projects?.includes(args.id))
      throw new UserError('Project is outside agent scope',403);
    switch(name) {
      case 'list_decks': return actor.role==='director'?listDecks():listDecks().filter(d=>actor.projects.includes(d.id));
      case 'get_deck': return {...getDeck(args.id),project_readme:readmeStore.read(args.id),scene_tasks:taskStore.list(args.id).map(t=>({scene_id:t.scene_id,title:t.title,assignee:t.assignee,status:t.status,revision:t.revision,checkpoints_done:t.checkpoints.filter(c=>c.done).length,checkpoints_total:t.checkpoints.length}))};
      case 'get_project_context': {
        const d=getDeck(args.id);
        const tasks=taskStore.list(args.id);
        const summary=tasks.map(t=>({scene_id:t.scene_id,title:t.title,assignee:t.assignee,status:t.status,revision:t.revision,checkpoints_done:t.checkpoints.filter(c=>c.done).length,checkpoints_total:t.checkpoints.length}));
        const assigned=args.slide_id?taskStore.read(args.id,args.slide_id):undefined;
        return {project:{id:d.id,title:d.title,style:d.style,format:d.format,target:d.target,slides:d.slides.map(s=>({id:s.id,label:s.label,cues:s.cues.map(c=>({id:c.id,say:c.say,show:c.show}))}))},
          readme:readmeStore.read(args.id),style_contract:styles.read(args.id),scene_tasks:summary,...(assigned?{assigned_scene_task:assigned}:{})};
      }
      case 'get_project_readme': return readmeStore.read(args.id);
      case 'update_project_readme': directorOnly(actor);return readmeStore.write(args.id,args.content,args.expected_revision);
      case 'list_scene_tasks': return taskStore.list(args.id);
      case 'get_scene_task': scoped(args.id,args.slide_id,actor);return taskStore.read(args.id,args.slide_id);
      case 'set_scene_task': {const {id,slide_id,expected_revision,fence_token,...fields}=args;return write(id,slide_id,actor,fence_token,'write_task',()=>taskStore.put(id,slide_id,fields,expected_revision))}
      case 'set_scene_checkpoint': {const {id,slide_id,checkpoint_id,fence_token,...patch}=args;return write(id,slide_id,actor,fence_token,'checkpoint',()=>taskStore.checkpoint(id,slide_id,checkpoint_id,patch))}
      case 'create_deck': {directorOnly(actor); const d=createDeck(args);readmeStore.ensure(d.id);return d; }
      case 'update_deck': directorOnly(actor);return patchDeck(args.id, args);
      case 'update_cue': return write(args.id,args.slide_id,actor,args.fence_token,'update_cue',()=>patchCue(args.id,args.slide_id,args.cue_id,args));
      case 'update_slide': return write(args.id,args.slide_id,actor,args.fence_token,'update_slide',()=>patchSlide(args.id,args.slide_id,args));
      case 'update_object': return write(args.id,args.slide_id,actor,args.fence_token,'update_object',()=>patchObject(args.id,args.slide_id,args.object_id,args));
      case 'get_scene_3d': scoped(args.id,args.slide_id,actor);return scene3d.read(args.id,args.slide_id);
      case 'set_scene_3d': enforceScene3D(styles.read(args.id).contract,args.spec);return write(args.id,args.slide_id,actor,args.fence_token,'write_3d',()=>scene3d.put(args.id,args.slide_id,args.spec,args.expected_revision));
      case 'reorder_slides': directorOnly(actor);return reorderSlides(args.id,args.slide_ids);
      case 'set_slide_visuals': enforceVisuals(styles.read(args.id).contract,args.elements);return write(args.id,args.slide_id,actor,args.fence_token,'set_visuals',()=>setVisuals(args.id,args.slide_id,args.elements));
      case 'get_style_contract': return styles.read(args.id);
      case 'set_style_contract': directorOnly(actor);return styles.put(args.id,args.contract,args.expected_revision);
      case 'get_scene_lease': scoped(args.id,args.slide_id,actor);return leases.read(args.id,args.slide_id);
      case 'claim_scene': return leases.claim(args.id,args.slide_id,actor,args.ttl??300);
      case 'renew_scene_lease': return leases.renew(args.id,args.slide_id,actor,args.fence_token,args.ttl??300);
      case 'release_scene': return leases.release(args.id,args.slide_id,actor,args.fence_token);
      case 'list_scene_versions': scoped(args.id,args.slide_id,actor);return {
        versions:versions.list(args.id,args.slide_id).map(v=>({...v,download_url:baseUrl()+'/'+v.file})),
        approved:versions.pointer(args.id,args.slide_id)};
      case 'get_scene_version': scoped(args.id,args.slide_id,actor);{
        const v=versions.read(args.id,args.slide_id,args.version_id);return {...v,download_url:baseUrl()+'/'+v.file};
      }
      case 'approve_scene_version': directorOnly(actor);
        if(taskStore.read(args.id,args.slide_id).status!=='done')throw new UserError('Scene task is not complete',409);
        return versions.approve(args.id,args.slide_id,args.version_id,args.expected_revision,actor,{unresolved:reviews.unresolved});
      case 'restore_scene_version': directorOnly(actor);
        return versions.restore(args.id,args.slide_id,args.version_id,args.expected_revision,actor,{unresolved:reviews.unresolved});
      case 'list_scene_review_items': scoped(args.id,args.slide_id,actor);return reviews.read(args.id,args.slide_id);
      case 'add_scene_review_item': scoped(args.id,args.slide_id,actor);
        return reviews.create(args.id,args.slide_id,{version_id:args.version_id,t:args.t,text:args.text,
          severity:args.severity,rect:args.rect},actor,args.expected_revision);
      case 'transition_scene_review_item': scoped(args.id,args.slide_id,actor);
        return reviews.transition(args.id,args.slide_id,args.item_id,args.status,args.note,actor,
          args.expected_revision,{assertWorker:()=>leases.assertWrite(args.id,args.slide_id,actor,args.fence_token)});
      case 'assemble_video': directorOnly(actor);return assembly.start(args.id,args.scene_ids);
      case 'get_assembly_status': return assembly.get(args.id);
      case 'render_video': directorOnly(actor);return startRender(args.id);
      case 'render_scene': scoped(args.id,args.slide_id,actor);return startRender(args.id,args.slide_id);
      case 'get_scene_render_status': scoped(args.id,args.slide_id,actor);return getRender(args.id,args.slide_id);
      case 'get_scene_qa_report': {scoped(args.id,args.slide_id,actor);const r=getRender(args.id,args.slide_id);return {id:args.id,slide_id:args.slide_id,status:r.status,report:r.qa_report||null};}
      case 'get_video_qa_report': {const r=getRender(args.id);return {id:args.id,status:r.status,report:r.qa_report||null};}
      case 'get_render_status': return getRender(args.id);
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
